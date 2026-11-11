import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  MeetingSession,
  MeetingSessionDocument,
} from "./schemas/meeting-session.schema";
import { VectorDbService } from "../vector-db/vector-db.service";
import { MeetingCitation, MeetingQaResponse } from "@tobomeet/shared/types";

interface TranscriptEntry {
  id?: string;
  text: string;
  speaker_name?: string;
  speaker_id?: string;
  created_at?: string;
}

interface TranscriptChunk {
  chunkIndex: number;
  startTime: string;
  endTime: string;
  speakers: string[];
  text: string;
}

const qaOutputZodSchema = z.object({
  answer: z
    .string()
    .describe(
      "Câu trả lời chi tiết, chính xác dựa trên thông tin biên bản cuộc họp",
    ),
  suggestedFollowUps: z
    .array(z.string())
    .describe("2-3 câu hỏi gợi ý ngắn gọn tiếp theo mà người dùng có thể muốn hỏi"),
});

@Injectable()
export class MeetingRagService {
  private readonly logger = new Logger(MeetingRagService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly googleModel: any;

  constructor(
    @InjectModel(MeetingSession.name)
    private readonly sessionModel: Model<MeetingSessionDocument>,
    private readonly vectorDbService: VectorDbService,
  ) {
    this.bucketName = process.env.R2_BUCKET_NAME || "tobomeet";
    this.s3Client = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT_URL,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
      },
    });

    const apiKey =
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      "";

    const google = createGoogleGenerativeAI({ apiKey });
    this.googleModel = google("gemini-2.5-flash");
  }

  /**
   * Định dạng thời gian từ chuỗi ISO sang mm:ss tương đối so với lúc bắt đầu họp
   */
  private formatRelativeTime(isoStr?: string, startIsoStr?: string): string {
    if (!isoStr) return "00:00";
    try {
      const d = new Date(isoStr);
      if (startIsoStr) {
        const start = new Date(startIsoStr);
        const diffSec = Math.max(0, Math.floor((d.getTime() - start.getTime()) / 1000));
        const mm = String(Math.floor(diffSec / 60)).padStart(2, "0");
        const ss = String(diffSec % 60).padStart(2, "0");
        return `${mm}:${ss}`;
      }
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      const seconds = String(d.getSeconds()).padStart(2, "0");
      return `${hours}:${minutes}:${seconds}`;
    } catch {
      return "00:00";
    }
  }

  /**
   * Phân chia kịch bản thoại thành các chunks hội thoại (~200 - 350 từ) kèm gối đầu (overlap)
   */
  private chunkDialogueEntries(entries: TranscriptEntry[], firstEntryTime?: string): TranscriptChunk[] {
    if (entries.length === 0) return [];

    const chunks: TranscriptChunk[] = [];
    const targetWordsPerChunk = 250;
    const overlapTurns = 2; // Số câu gối đầu giữa 2 chunk

    let currentEntries: TranscriptEntry[] = [];
    let currentWordCount = 0;
    let chunkIndex = 0;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const words = entry.text.split(/\s+/).length;

      currentEntries.push(entry);
      currentWordCount += words;

      // Khi số từ vượt quá target hoặc là entry cuối cùng
      if (currentWordCount >= targetWordsPerChunk || i === entries.length - 1) {
        const startEntry = currentEntries[0];
        const endEntry = currentEntries[currentEntries.length - 1];

        const startTime = this.formatRelativeTime(startEntry.created_at, firstEntryTime);
        const endTime = this.formatRelativeTime(endEntry.created_at, firstEntryTime);

        const speakers = Array.from(
          new Set(
            currentEntries
              .map((e) => e.speaker_name || e.speaker_id || "Người tham gia")
              .filter(Boolean),
          ),
        );

        const dialogueLines = currentEntries.map((e) => {
          const t = this.formatRelativeTime(e.created_at, firstEntryTime);
          const s = e.speaker_name || e.speaker_id || "Người tham gia";
          return `[${t}] ${s}: ${e.text}`;
        });

        const chunkText = `[${startTime} - ${endTime}]\n` + dialogueLines.join("\n");

        chunks.push({
          chunkIndex,
          startTime,
          endTime,
          speakers,
          text: chunkText,
        });

        chunkIndex++;

        // Chuẩn bị cho chunk kế tiếp: Giữ lại overlapTurns câu cuối làm gối đầu
        if (i < entries.length - 1) {
          const overlap = currentEntries.slice(-overlapTurns);
          currentEntries = [...overlap];
          currentWordCount = overlap.reduce(
            (sum, e) => sum + e.text.split(/\s+/).length,
            0,
          );
        } else {
          currentEntries = [];
          currentWordCount = 0;
        }
      }
    }

    return chunks;
  }

  /**
   * Đọc transcript.jsonl từ R2, chunking, tạo vector embedding và lưu vào Pinecone
   */
  async indexSessionTranscript(
    sessionId: string,
    meetingCode: string,
    transcriptKey?: string,
  ): Promise<boolean> {
    this.logger.log(
      `[MeetingRag] Bắt đầu indexing transcript cho session ${sessionId} (room: ${meetingCode})`,
    );

    let session: MeetingSessionDocument | null = null;
    if (Types.ObjectId.isValid(sessionId)) {
      session = await this.sessionModel.findById(sessionId).exec();
    }
    if (!session) {
      session = await this.sessionModel
        .findOne({ meetingCode, _id: sessionId })
        .exec();
    }

    if (!session) {
      this.logger.warn(`[MeetingRag] Không tìm thấy session ${sessionId}. Hủy indexing.`);
      return false;
    }

    if (session.ragStatus === "indexed") {
      this.logger.log(`[MeetingRag] Session ${sessionId} đã được indexed trước đó. Bỏ qua.`);
      return true;
    }

    // Xác định key file trên R2
    let cleanKey = transcriptKey || session.transcriptKey;
    if (!cleanKey && session.sessionFolder) {
      cleanKey = `transcripts/${meetingCode}/${session.sessionFolder}/transcript.jsonl`;
    }

    if (!cleanKey) {
      this.logger.warn(
        `[MeetingRag] Không xác định được transcriptKey cho session ${sessionId}`,
      );
      return false;
    }

    cleanKey = cleanKey.replace(/\\/g, "/").replace(/^\/+/, "");

    session.ragStatus = "indexing";
    session.transcriptKey = cleanKey;
    await session.save();

    try {
      this.logger.log(`[MeetingRag] Đang tải file transcript từ R2: ${cleanKey}`);
      const r2Response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: cleanKey,
        }),
      );

      if (!r2Response.Body) {
        throw new Error(`Không đọc được file ${cleanKey} từ R2`);
      }

      const fileContent = await r2Response.Body.transformToString("utf-8");
      const lines = fileContent.split("\n").filter((l) => l.trim().length > 0);

      const entries: TranscriptEntry[] = [];
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          const text = (parsed.text || "").trim();
          if (text) {
            entries.push({
              id: parsed.id,
              text,
              speaker_name: parsed.speaker_name,
              speaker_id: parsed.speaker_id,
              created_at: parsed.created_at,
            });
          }
        } catch {
          // Bỏ qua dòng json không hợp lệ
        }
      }

      if (entries.length < 2) {
        this.logger.log(
          `[MeetingRag] Session ${sessionId} có quá ít câu thoại (${entries.length} câu) để chia chunk vector.`,
        );
        session.ragStatus = "none";
        await session.save();
        return false;
      }

      const firstEntryTime = entries[0]?.created_at;
      const chunks = this.chunkDialogueEntries(entries, firstEntryTime);

      this.logger.log(
        `[MeetingRag] Đã chia ${entries.length} câu thoại thành ${chunks.length} chunks. Đang tạo vector embedding...`,
      );

      // Tạo embedding và chuẩn bị documents cho Pinecone
      const documentsToUpsert: Array<{
        id: string;
        embedding: number[];
        sessionId: string;
        meetingCode: string;
        chunkIndex: number;
        text: string;
        startTime?: string;
        endTime?: string;
        speakers?: string[];
      }> = [];

      for (const chunk of chunks) {
        try {
          const embedding = await this.vectorDbService.generateEmbedding(chunk.text);
          documentsToUpsert.push({
            id: `${sessionId}_chunk_${chunk.chunkIndex}`,
            embedding,
            sessionId,
            meetingCode,
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
            startTime: chunk.startTime,
            endTime: chunk.endTime,
            speakers: chunk.speakers,
          });
        } catch (embErr: any) {
          this.logger.warn(
            `[MeetingRag] Lỗi embedding chunk ${chunk.chunkIndex}: ${embErr?.message}`,
          );
        }
      }

      if (documentsToUpsert.length === 0) {
        throw new Error("Không tạo được vector embedding nào cho các chunks");
      }

      // Đẩy lên Pinecone index meeting-transcripts
      await this.vectorDbService.upsertTranscriptDocuments(documentsToUpsert);

      session.ragStatus = "indexed";
      await session.save();

      this.logger.log(
        `[MeetingRag] Hoàn tất indexing ${documentsToUpsert.length} vectors cho session ${sessionId}!`,
      );
      return true;
    } catch (err: any) {
      this.logger.error(
        `[MeetingRag] Lỗi khi index transcript session ${sessionId}: ${err?.message}`,
        err?.stack,
      );
      session.ragStatus = "failed";
      await session.save();
      return false;
    }
  }

  /**
   * Hỏi đáp (Q&A) về cuộc họp sử dụng quy trình RAG
   */
  async askQuestion(
    sessionId: string,
    meetingCode: string,
    question: string,
  ): Promise<MeetingQaResponse> {
    const cleanQuestion = (question || "").trim();
    if (!cleanQuestion) {
      return {
        answer: "Vui lòng nhập câu hỏi về nội dung cuộc họp.",
        citations: [],
        suggestedFollowUps: [],
      };
    }

    const session = await this.sessionModel
      .findOne({ _id: sessionId, meetingCode: meetingCode.trim() })
      .exec();

    if (!session) {
      return {
        answer: "Không tìm thấy thông tin phiên họp này.",
        citations: [],
        suggestedFollowUps: [],
      };
    }

    if (session.status === "ongoing") {
      return {
        answer:
          "Cuộc họp vẫn đang diễn ra. Bản ghi thoại và tính năng hỏi đáp thông minh sẽ tự động sẵn sàng ngay sau khi cuộc họp kết thúc.",
        citations: [],
        suggestedFollowUps: [],
      };
    }

    // Nếu chưa indexed nhưng session đã kết thúc và có transcriptKey, tự động kích hoạt index
    if (session.ragStatus !== "indexed" && session.ragStatus !== "failed") {
      this.logger.log(
        `[MeetingRag] Session ${sessionId} chưa được indexed, tiến hành index on-demand...`,
      );
      await this.indexSessionTranscript(sessionId, meetingCode, session.transcriptKey).catch(
        (e) => this.logger.warn(`On-demand index error: ${e?.message}`),
      );
    }

    // 1. Tạo query vector cho câu hỏi của người dùng
    let queryVector: number[] = [];
    try {
      queryVector = await this.vectorDbService.generateEmbedding(cleanQuestion);
    } catch (err: any) {
      this.logger.error(`[MeetingRag] Lỗi tạo query vector: ${err?.message}`);
    }

    // 2. Tìm kiếm top 4 đoạn transcript tương đồng trong Pinecone
    let retrievedChunks: Array<{
      id: string;
      score: number;
      text: string;
      startTime?: string;
      endTime?: string;
      speakers?: string[];
      chunkIndex?: number;
    }> = [];

    if (queryVector.length > 0) {
      retrievedChunks = await this.vectorDbService.searchTranscriptDocuments(
        sessionId,
        queryVector,
        4,
      );
    }

    // 3. Chuẩn bị Context
    const summary = session.summary;
    let summaryContext = "";
    if (summary) {
      const parts: string[] = [];
      if (summary.title) parts.push(`Tiêu đề cuộc họp: ${summary.title}`);
      if (summary.overview) parts.push(`Tổng quan: ${summary.overview}`);
      if (summary.keyPoints && summary.keyPoints.length > 0) {
        parts.push(`Các điểm chính:\n- ${summary.keyPoints.join("\n- ")}`);
      }
      if (summary.actionItems && summary.actionItems.length > 0) {
        parts.push(
          `Việc cần làm:\n- ${summary.actionItems.map((a) => `${a.task}${a.assignee ? ` (@${a.assignee})` : ""}${a.dueDate ? ` [Hạn: ${a.dueDate}]` : ""}`).join("\n- ")}`,
        );
      }
      summaryContext = parts.join("\n\n");
    }

    let chunksContext = "";
    const citations: MeetingCitation[] = [];

    if (retrievedChunks.length > 0) {
      chunksContext = retrievedChunks
        .map((chunk, idx) => {
          citations.push({
            speakers: chunk.speakers,
            startTime: chunk.startTime,
            endTime: chunk.endTime,
            text: chunk.text,
            score: chunk.score,
          });
          return `[ĐOẠN TRÍCH ${idx + 1} (${chunk.startTime} - ${chunk.endTime})]\n${chunk.text}`;
        })
        .join("\n\n---\n\n");
    }

    // 4. Nếu không có cả tóm tắt lẫn vector chunks
    if (!summaryContext && !chunksContext) {
      return {
        answer:
          "Chưa có đủ dữ liệu ghi âm hoặc biên bản đối thoại của phiên họp này để trả lời câu hỏi.",
        citations: [],
        suggestedFollowUps: [],
      };
    }

    // 5. Gọi Gemini 2.5 Flash để tổng hợp câu trả lời
    const systemPrompt = `Bạn là Tobo Meeting Assistant - trợ lý thông minh chuyên phân tích và giải đáp thắc mắc về các cuộc họp trên ToboMeet.
Nhiệm vụ của bạn là giải đáp chính xác, khách quan các câu hỏi của người dùng dựa trên bản tóm tắt và các đoạn trích biên bản thoại được cung cấp.

YÊU CẦU QUAN TRỌNG:
1. Trả lời bằng tiếng Việt tự nhiên, súc tích, mạch lạc, trực tiếp vào trọng tâm câu hỏi.
2. Trích dẫn cụ thể tên người nói và mốc thời gian nếu thông tin có trong đoạn trích (ví dụ: "Theo anh Nam ở phút 02:15...").
3. Nếu câu hỏi không được đề cập trong bản tóm tắt hay các đoạn trích, hãy trả lời lịch sự rằng cuộc họp không nhắc đến vấn đề này, tuyệt đối không bịa đặt hoặc suy diễn thông tin ngoài biên bản.
4. Đưa ra 2-3 câu hỏi gợi ý ngắn gọn tiếp theo mà người dùng có thể muốn tìm hiểu thêm về cuộc họp.`;

    const userPrompt = `Dưới đây là thông tin về cuộc họp:

=== BẢN TÓM TẮT TỔNG QUAN ===
${summaryContext || "Chưa có bản tóm tắt"}

=== CÁC ĐOẠN TRÍCH BIÊN BẢN HỘI THOẠI LIÊN QUAN NHẤT ===
${chunksContext || "Không tìm thấy đoạn trích hội thoại chi tiết"}

=== CÂU HỎI CỦA NGƯỜI DÙNG ===
${cleanQuestion}`;

    try {
      const result: any = await generateText({
        model: this.googleModel,
        system: systemPrompt,
        prompt: userPrompt,
        output: (Output as any).object({
          schema: qaOutputZodSchema,
        }),
      });

      const outputData = result.output || {};

      return {
        answer:
          outputData.answer ||
          "Đã phân tích xong biên bản cuộc họp nhưng không trích xuất được câu trả lời rõ ràng.",
        citations,
        suggestedFollowUps: outputData.suggestedFollowUps || [],
      };
    } catch (llmErr: any) {
      this.logger.error(`[MeetingRag] Lỗi khi gọi Gemini Flash: ${llmErr?.message}`, llmErr?.stack);

      // Fallback nếu structured output lỗi: gọi text thường
      try {
        const textResult = await generateText({
          model: this.googleModel,
          system: systemPrompt,
          prompt: userPrompt,
        });

        return {
          answer: textResult.text,
          citations,
          suggestedFollowUps: [
            "Các quyết định quan trọng nhất trong buổi họp là gì?",
            "Ai nhận nhiệm vụ gì và thời hạn hoàn thành khi nào?",
          ],
        };
      } catch (fallbackErr: any) {
        return {
          answer: "Đã xảy ra lỗi trong quá trình xử lý câu trả lời. Vui lòng thử lại sau.",
          citations: [],
          suggestedFollowUps: [],
        };
      }
    }
  }

  /**
   * Lấy danh sách câu hỏi gợi ý ban đầu dựa trên nội dung thực tế của cuộc họp
   * Chỉ tạo một lần duy nhất và lưu vào MongoDB session.summary.suggestedQuestions
   */
  async getSuggestedQuestions(sessionId: string, meetingCode: string): Promise<string[]> {
    const session = await this.sessionModel
      .findOne({ _id: sessionId, meetingCode: meetingCode.trim() })
      .exec();

    if (!session) {
      return [];
    }

    // 1. Nếu đã có câu hỏi gợi ý được tạo từ bước tóm tắt, trả về ngay lập tức
    if (
      session.summary?.suggestedQuestions &&
      session.summary.suggestedQuestions.length > 0
    ) {
      return session.summary.suggestedQuestions;
    }

    // 2. Nếu chưa có bản tóm tắt hoặc cuộc họp đang diễn ra, chưa có câu hỏi
    if (!session.summary || !session.summary.overview) {
      return [];
    }

    // 3. Với các session cũ chưa có suggestedQuestions: Tạo 1 lần duy nhất bằng Gemini Flash từ nội dung tóm tắt
    try {
      const summaryContext = [
        `Tiêu đề: ${session.summary.title || ""}`,
        `Tổng quan: ${session.summary.overview || ""}`,
        session.summary.keyPoints?.length
          ? `Điểm chính:\n- ${session.summary.keyPoints.join("\n- ")}`
          : "",
        session.summary.actionItems?.length
          ? `Việc cần làm:\n- ${session.summary.actionItems.map((a) => `${a.task}${a.assignee ? ` (@${a.assignee})` : ""}`).join("\n- ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const prompt = `Bạn là trợ lý Tobo Meeting Assistant. Dưới đây là nội dung cuộc họp:

${summaryContext}

Hãy tạo ra đúng 3 đến 4 câu hỏi ngắn gọn, tự nhiên, bám sát các tình tiết/công việc cụ thể trong cuộc họp này để gợi ý cho người dùng bấm hỏi trợ lý AI (ví dụ: "Lý do hoãn deadline là gì?", "Ai nhận việc tích hợp R2?", "Kế hoạch tuần tới thống nhất ra sao?"). Tuyệt đối không dùng câu hỏi mẫu chung chung.`;

      const result: any = await generateText({
        model: this.googleModel,
        prompt,
        output: (Output as any).object({
          schema: z.object({
            questions: z
              .array(z.string())
              .describe("3-4 câu hỏi gợi ý cụ thể từ nội dung cuộc họp"),
          }),
        }),
      });

      const questions = result?.output?.questions;
      if (Array.isArray(questions) && questions.length > 0) {
        session.summary.suggestedQuestions = questions;
        await session.save();
        return questions;
      }
    } catch (err: any) {
      this.logger.warn(
        `[MeetingRag] Lỗi sinh câu hỏi gợi ý từ tóm tắt cho session ${sessionId}: ${err?.message}`,
      );
    }

    return session.summary?.suggestedQuestions || [];
  }
}


import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";
import { MeetingSession, MeetingSessionDocument } from "./schemas/meeting-session.schema";
import { TranscriptReadyWebhookDto } from "@tobomeet/shared/types";
import { MeetingsGateway } from "./meetings.gateway";
import { MeetingRagService } from "./meeting-rag.service";

interface SummaryGeneratedOutput {
  title: string;
  overview: string;
  keyPoints: string[];
  actionItems: Array<{
    task: string;
    assignee?: string;
    dueDate?: string;
    status: "pending" | "in_progress" | "completed";
  }>;
  suggestedQuestions?: string[];
}

const summaryZodSchema = z.object({
  title: z.string().describe("Tiêu đề ngắn gọn phản ánh chủ đề chính của buổi họp"),
  overview: z
    .string()
    .describe(
      "Tóm tắt tổng quan nội dung và kết quả chính của buổi họp trong 2 đến 4 câu",
    ),
  keyPoints: z
    .array(z.string())
    .describe(
      "Danh sách 3-6 điểm thảo luận quan trọng nhất hoặc quyết định chính",
    ),
  actionItems: z
    .array(
      z.object({
        task: z.string().describe("Nội dung công việc cần làm cụ thể"),
        assignee: z
          .string()
          .optional()
          .describe("Tên người được giao hoặc phụ trách nếu có"),
        dueDate: z
          .string()
          .optional()
          .describe("Hạn hoàn thành nếu có nhắc đến trong trao đổi"),
        status: z
          .enum(["pending", "in_progress", "completed"])
          .default("pending"),
      }),
    )
    .describe("Danh sách các việc cần làm (action items) trích xuất được"),
  suggestedQuestions: z
    .array(z.string())
    .describe(
      "Danh sách 3-4 câu hỏi gợi ý hay, thiết thực nhất được trích xuất trực tiếp từ các tình tiết, thảo luận hoặc phân công công việc cụ thể trong cuộc họp này để người dùng bấm hỏi trợ lý AI",
    ),
});

@Injectable()
export class MeetingSummaryService {
  private readonly logger = new Logger(MeetingSummaryService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly googleModel: any;

  constructor(
    @InjectModel(MeetingSession.name)
    private readonly sessionModel: Model<MeetingSessionDocument>,
    private readonly meetingsGateway: MeetingsGateway,
    private readonly meetingRagService: MeetingRagService,
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

    if (!apiKey) {
      this.logger.warn(
        "GOOGLE_GENERATIVE_AI_API_KEY is not configured! Meeting summarization will be disabled.",
      );
    }

    const google = createGoogleGenerativeAI({
      apiKey,
    });
    this.googleModel = google("gemini-2.5-flash");
  }

  /**
   * Xử lý job tạo tóm tắt cuộc họp và trích xuất action items từ file transcript trên R2
   */
  async handleSummaryJob(payload: TranscriptReadyWebhookDto): Promise<void> {
    const { room_name, session_id, transcript_key, segment_count, word_count } =
      payload;

    this.logger.log(
      `[MeetingSummary] Bắt đầu xử lý tóm tắt cho phòng: ${room_name}, session: ${session_id} (${segment_count} segments, ${word_count} words)`,
    );

    // 1. Tìm phiên họp tương ứng trong MongoDB
    let session: MeetingSessionDocument | null = null;

    if (session_id && Types.ObjectId.isValid(session_id)) {
      session = await this.sessionModel.findById(session_id).exec();
    }

    if (!session && room_name) {
      // Tìm session mới nhất theo meetingCode
      session = await this.sessionModel
        .findOne({ meetingCode: room_name })
        .sort({ startedAt: -1 })
        .exec();
    }

    if (!session) {
      this.logger.warn(
        `[MeetingSummary] Không tìm thấy phiên họp cho room: ${room_name}, session: ${session_id}. Hủy job.`,
      );
      return;
    }

    // 2. Tính Idempotent: Nếu đã có tóm tắt hoặc đã hoàn thành, không làm lại
    if (session.summaryStatus === "completed" && session.summary?.overview) {
      this.logger.log(
        `[MeetingSummary] Phiên ${session._id} đã có bản tóm tắt hoàn thành. Bỏ qua.`,
      );
      return;
    }

    // 3. Kiểm tra độ dài nội dung: Nếu quá ngắn (< 5 segments hoặc < 60 từ) thì bỏ qua theo yêu cầu
    if (word_count < 60 || segment_count < 5) {
      this.logger.log(
        `[MeetingSummary] Phiên ${session._id} quá ít thông tin (${word_count} từ, ${segment_count} segments < ngưỡng 60 từ / 5 câu). Đánh dấu skipped.`,
      );
      session.summaryStatus = "skipped";
      session.summaryReason =
        "Cuộc họp có quá ít trao đổi bằng giọng nói để tạo bản tóm tắt tự động.";
      await session.save();
      return;
    }

    // 4. Cập nhật trạng thái đang xử lý (processing)
    session.summaryStatus = "processing";
    await session.save();

    try {
      // 5. Tải file transcript.jsonl từ Cloudflare R2
      const cleanKey = transcript_key.replace(/\\/g, "/").replace(/^\/+/, "");
      this.logger.log(
        `[MeetingSummary] Đang tải file transcript từ R2: ${cleanKey} (bucket: ${this.bucketName})`,
      );

      const r2Response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: cleanKey,
        }),
      );

      if (!r2Response.Body) {
        throw new Error(
          `Không thể đọc dữ liệu Body từ file ${cleanKey} trên R2`,
        );
      }

      const fileContent = await r2Response.Body.transformToString("utf-8");
      const lines = fileContent.split("\n").filter((l) => l.trim().length > 0);

      // Định dạng lại nội dung hội thoại theo dòng thời gian
      const dialogueLines: string[] = [];
      let totalParsedWords = 0;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          const speaker = entry.speaker_name || entry.speaker_id || "Người tham gia";
          const text = (entry.text || "").trim();
          if (text) {
            totalParsedWords += text.split(/\s+/).length;
            dialogueLines.push(`${speaker}: ${text}`);
          }
        } catch {
          // Bỏ qua dòng json lỗi
        }
      }

      if (dialogueLines.length < 5 || totalParsedWords < 60) {
        this.logger.log(
          `[MeetingSummary] Sau khi phân tích file JSONL, nội dung thực tế quá ngắn (${totalParsedWords} từ). Đánh dấu skipped.`,
        );
        session.summaryStatus = "skipped";
        session.summaryReason =
          "Cuộc họp có quá ít trao đổi bằng giọng nói để tạo bản tóm tắt tự động.";
        await session.save();
        return;
      }

      const fullTranscriptText = dialogueLines.join("\n");

      // 6. Gọi Gemini 2.5 Flash để tóm tắt và trích xuất Action Items có cấu trúc
      this.logger.log(
        `[MeetingSummary] Đang gọi Gemini 2.5 Flash để tổng hợp (${dialogueLines.length} câu, ~${totalParsedWords} từ)...`,
      );

      const systemPrompt = `Bạn là thư ký AI chuyên nghiệp của ToboMeet.
Nhiệm vụ của bạn là phân tích bản ghi lời thoại cuộc họp và tạo ra một bản tóm tắt súc tích, chuyên nghiệp cùng danh sách các việc cần làm (action items).

YÊU CẦU:
1. Trả lời hoàn toàn bằng tiếng Việt chuẩn mực, rõ ràng, không hoa mỹ rườm rà.
2. Tiêu đề (title): Ngắn gọn phản ánh đúng trọng tâm buổi họp (dưới 12 từ).
3. Tổng quan (overview): Tóm tắt trong 2 đến 4 câu ngắn gọn về mục tiêu, diễn biến chính và kết luận của buổi họp.
4. Điểm thảo luận chính (keyPoints): 3 đến 6 gạch đầu dòng súc tích nêu các vấn đề quan trọng nhất đã bàn hoặc thống nhất.
5. Việc cần làm (action items): Trích xuất các đầu việc cụ thể được giao hoặc cam kết trong cuộc họp:
   - task: Nội dung công việc cụ thể.
   - assignee: Tên người chịu trách nhiệm (nếu có nhắc trong cuộc họp).
   - dueDate: Hạn chót hoàn thành (nếu có nhắc đến, ví dụ: "Hôm nay", "Thứ 6 tuần này", "Trước 17h").
   - status: "pending".
Nếu không có việc cần làm cụ thể nào được giao, trả về mảng actionItems rỗng.
6. Câu hỏi gợi ý (suggestedQuestions): Tạo 3-4 câu hỏi ngắn gọn, tự nhiên xuất phát từ chính các nội dung, tình tiết hoặc công việc cụ thể được bàn trong cuộc họp (ví dụ: "Lý do hoãn deadline là gì?", "Ai nhận việc tích hợp R2?", "Kế hoạch tuần tới thống nhất ra sao?"). Tránh dùng câu hỏi khuôn mẫu chung chung.`;

      const result: any = await generateText({
        model: this.googleModel,
        system: systemPrompt,
        prompt: `Dưới đây là bản ghi lời thoại của cuộc họp:\n\n${fullTranscriptText}`,
        output: (Output as any).object({
          schema: summaryZodSchema,
        }),
      });

      const summaryData = (result.output || {}) as SummaryGeneratedOutput;

      // 7. Lưu kết quả vào MongoDB MeetingSession
      session.summary = {
        title: summaryData.title,
        overview: summaryData.overview,
        keyPoints: summaryData.keyPoints,
        actionItems: summaryData.actionItems as any,
        suggestedQuestions: summaryData.suggestedQuestions || [],
        generatedAt: new Date(),
      };
      session.summaryStatus = "completed";
      session.summaryReason = undefined;
      session.transcriptKey = cleanKey;
      await session.save();

      this.logger.log(
        `[MeetingSummary] Tạo tóm tắt thành công cho session ${session._id} (Tiêu đề: "${summaryData.title}", ${summaryData.actionItems.length} action items).`,
      );

      // 8. Tự động index kịch bản thoại lên Pinecone cho tính năng Meeting Q&A (RAG)
      this.meetingRagService
        .indexSessionTranscript(session._id.toString(), session.meetingCode, cleanKey)
        .catch((ragErr) => {
          this.logger.warn(
            `[MeetingSummary] Lỗi chạy ngầm indexing RAG cho session ${session._id}: ${ragErr?.message}`,
          );
        });
    } catch (error: any) {
      this.logger.error(
        `[MeetingSummary] Lỗi khi tạo tóm tắt cho session ${session._id}:`,
        error,
      );
      session.summaryStatus = "failed";
      session.summaryReason = error?.message || "Đã xảy ra lỗi khi tạo tóm tắt";
      await session.save();
      throw error;
    }
  }
}

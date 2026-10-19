import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, tool, isStepCount } from "ai";
import { z } from "zod";
import { CalendarService } from "../calendar/calendar.service";
import { ChatAgentDto } from "./dto/chat-agent.dto";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  CalendarEvent,
  CalendarEventDocument,
} from "../calendar/schemas/calendar-event.schema";
import { User, UserDocument } from "../users/schemas/user.schema";
import { VectorDbService } from "../vector-db/vector-db.service";

/**
 * Chuẩn hóa chuỗi thời gian về định dạng ISO 8601 hợp lệ.
 * Nếu không có múi giờ, tự động áp dụng múi giờ Việt Nam (+07:00).
 */
export function normalizeToIsoString(dateStr: string): string {
  if (!dateStr) return dateStr;
  let s = dateStr.trim();
  const hasTimezone = /([+-]\d{2}:?\d{2}|Z)$/i.test(s);
  if (!hasTimezone) {
    s = s.replace(" ", "T");
    if (!s.includes("T")) {
      s = `${s}T00:00:00`;
    }
    s = `${s}+07:00`;
  }
  const date = new Date(s);
  if (isNaN(date.getTime())) {
    throw new Error(`Định dạng ngày giờ không hợp lệ: "${dateStr}"`);
  }
  return date.toISOString();
}

/**
 * Format Date hoặc ISO string sang định dạng dễ đọc theo múi giờ Việt Nam (UTC+7)
 */
export function formatVnTime(dateInput: Date | string): string {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  return d.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour12: false,
  });
}

@Injectable()
export class AiAgentService {
  private readonly logger = new Logger(AiAgentService.name);
  private readonly googleModel: any;

  constructor(
    private readonly configService: ConfigService,
    private readonly calendarService: CalendarService,
    private readonly vectorDbService: VectorDbService,
    @InjectModel(CalendarEvent.name)
    private readonly calendarEventModel: Model<CalendarEventDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {
    const apiKey =
      this.configService.get<string>("GOOGLE_GENERATIVE_AI_API_KEY") ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!apiKey) {
      this.logger.warn(
        "GOOGLE_GENERATIVE_AI_API_KEY is not configured! Tobo Agent will not function.",
      );
    }

    const google = createGoogleGenerativeAI({
      apiKey: apiKey || "",
    });
    this.googleModel = google("gemini-2.5-flash");
  }

  async chat(
    userId: string,
    dto: ChatAgentDto,
  ): Promise<{ reply: string; toolInvocations: any[]; error?: string }> {
    const now = new Date();
    const nowVnFormatted = formatVnTime(now);
    const dayOfWeek = now.toLocaleDateString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      weekday: "long",
    });

    const systemInstruction = `
Bạn là Tobo Agent - Trợ lý AI thông minh chuyên nghiệp hỗ trợ quản lý lịch họp, tra cứu và điều phối thời gian trên nền tảng ToboMeet.
Người dùng đang trò chuyện bằng tiếng Việt. Hãy giao tiếp tự nhiên, thân thiện, lịch thiệp và luôn chính xác.

THÔNG TIN THỜI GIAN HIỆN TẠI CỦA HỆ THỐNG:
- Mốc thời gian ISO: ${now.toISOString()}
- Giờ địa phương Việt Nam (Asia/Ho_Chi_Minh, GMT+7): ${nowVnFormatted} (${dayOfWeek})

QUY TẮC VÀ NGUYÊN TẮC HOẠT ĐỘNG:

1. PHÂN TÍCH LỊCH SỬ TRÒ CHUYỆN (CHAT HISTORY):
   - Luôn đọc kỹ toàn bộ đoạn hội thoại trước đó do ứng dụng truyền xuống.
   - Nếu trong các tin nhắn trước bạn đã đưa ra danh sách các cuộc họp và người dùng phản hồi như: "chọn cái thứ 1", "cuộc họp về UI", "cái đó diễn ra lúc nào", "tham gia cuộc họp đó"... hãy đối chiếu ngay với thông tin đã trao đổi để biết chính xác người dùng đang nói về sự kiện nào.
   - Tuyệt đối không yêu cầu người dùng lặp lại thông tin họ đã cung cấp trong các lượt chat trước.

2. CƠ CHẾ HỎI LÀM RÕ KHI YÊU CẦU MƠ HỒ (CLARIFICATION):
   - Khi người dùng đưa ra câu hỏi hoặc yêu cầu quá mơ hồ, ngắn cụn hoặc thiếu thông tin cần thiết:
     * Ví dụ: "lịch của tôi", "tìm cuộc họp", "xem lại cuộc họp đó", "tôi có lịch gì không" (mà không có ngày giờ cụ thể hay chủ đề trong bối cảnh)...
     * Trước tiên hãy kiểm tra xem lịch sử trò chuyện có cung cấp manh mối nào không.
     * Nếu không có bất kỳ ngữ cảnh nào rõ ràng: KHÔNG ĐƯỢC đoán mò hoặc thực hiện hành động sai lệch. Hãy chủ động đặt câu hỏi làm rõ một cách lịch sự, thân thiện và đưa ra 2-3 gợi ý cụ thể để người dùng chọn (ví dụ: "Bạn muốn kiểm tra lịch rảnh/bận trong hôm nay, hay muốn tìm một cuộc họp theo chủ đề cụ thể?").

3. TÌM KIẾM THEO NGỮ NGHĨA (SEMANTIC SEARCH) VÀ HẬU KIỂM TRA BẰNG LLM:
   - Khi người dùng muốn tìm kiếm cuộc họp theo chủ đề, tiêu đề, hoặc nội dung mô tả (description), BẮT BUỘC gọi tool "semanticSearchCalendar".
   - BƯỚC HẬU KIỂM TRA BẰNG LLM (BẮT BUỘC):
     Sau khi tool "semanticSearchCalendar" trả về kết quả (bao gồm top 5 vector tương đồng và toàn bộ metadata chi tiết từ DB: tiêu đề, mô tả đầy đủ, thời gian, người tổ chức, trạng thái quá khứ/tương lai):
     a) ĐÁNH GIÁ SỰ PHÙ HỢP: Đọc kỹ phần description và title của từng sự kiện để phân tích xem có thực sự đáp ứng đúng nhu cầu của người dùng hay không. Đừng chỉ nhìn vào điểm số similarityScore, hãy dùng tư duy phân tích của bạn để loại bỏ những cuộc họp không liên quan đến ý định người dùng.
     b) ĐÁNH GIÁ THỜI GIAN: Phân biệt rõ sự kiện đã qua (isPast: true) hay sự kiện sắp tới. Nếu người dùng hỏi về cuộc họp sắp diễn ra, đừng trả lời về cuộc họp đã kết thúc mà không lưu ý cho người dùng.
     c) QUYẾT ĐỊNH BƯỚC TIẾP THEO:
        - Nếu có 1 sự kiện khớp chính xác: Trình bày thông tin rõ ràng (tiêu đề, thời gian bắt đầu - kết thúc theo giờ VN, mô tả, người tổ chức, mã phòng) và gợi ý các hành động tiếp theo.
        - Nếu có nhiều sự kiện tương đồng nhau: Liệt kê ngắn gọn các lựa chọn và hỏi làm rõ để người dùng xác nhận lựa chọn nào là đúng ý họ nhất.
        - Nếu tất cả sự kiện trả về đều không khớp với ý định: Lịch sự thông báo không tìm thấy cuộc họp phù hợp và gợi ý người dùng cung cấp thêm từ khóa hoặc khoảng thời gian.

4. KIỂM TRA LỊCH RẢNH / BẬN THEO THỜI GIAN:
   - Khi người dùng hỏi xem lịch có rảnh/bận không, hôm nay/ngày mai/tuần này có cuộc họp gì không theo khung thời gian, BẮT BUỘC gọi tool "checkCalendarAvailability".

5. TẠO LỊCH KHI ĐƯỢC YÊU CẦU:
   - Khi người dùng yêu cầu tạo lịch mới hoặc lên lịch họp, hãy chuyển đổi thời gian sang ISO 8601 múi giờ +07:00 và gọi tool "createCalendarEvent".
   - Mặc định thời lượng là 60 phút nếu không nêu rõ. Căn cứ vào thời gian hiện tại (${nowVnFormatted}) để tính các mốc tương đối như "sáng mai", "chiều nay", "thứ Hai tới".

6. XỬ LÝ LỖI KHÉO LÉO:
   - Khi tool trả về thông báo lỗi, hãy giải thích lịch sự, dễ hiểu cho người dùng và gợi ý cách khắc phục.

7. ĐỊNH DẠNG TRẢ LỜI:
   - Sử dụng Markdown rõ ràng, dễ nhìn, in đậm tiêu đề và mốc thời gian, dùng danh sách có gạch đầu dòng nếu có nhiều sự kiện.
`;

    // Chuẩn bị lịch sử tin nhắn
    const messages: Array<{
      role: "user" | "assistant";
      content: string;
    }> = [];

    if (dto.history && dto.history.length > 0) {
      for (const item of dto.history) {
        if (item.role === "user" || item.role === "assistant") {
          messages.push({
            role: item.role,
            content: item.content,
          });
        }
      }
    }

    messages.push({
      role: "user",
      content: dto.message,
    });

    const tools: Record<string, any> = {
      checkCalendarAvailability: (tool as any)({
        description:
          "Kiểm tra danh sách lịch họp hoặc xem lịch có đang bận/trống không trong một khoảng thời gian cụ thể (ví dụ hôm nay, ngày mai, một khung giờ cụ thể).",
        inputSchema: z.object({
          startDate: z
            .string()
            .describe(
              "Thời điểm bắt đầu (ISO 8601, ví dụ: 2026-10-14T08:00:00+07:00)",
            ),
          endDate: z
            .string()
            .describe(
              "Thời điểm kết thúc (ISO 8601, ví dụ: 2026-10-14T18:00:00+07:00)",
            ),
        }),
        execute: async (args: { startDate: string; endDate: string }) => {
          try {
            // Chuẩn hóa thời gian nếu thiếu múi giờ
            const startIso = normalizeToIsoString(args.startDate);
            const endIso = normalizeToIsoString(args.endDate);

            const events = await this.calendarService.getEvents(
              userId,
              startIso,
              endIso,
            );

            // CẮT GỌT BỚT KẾT QUẢ DƯ THỪA ĐỂ ĐỠ TỐN TOKEN VÀ AGENT DỄ ĐỌC
            const trimmedEvents = (events || []).map((e: any) => ({
              id: e._id?.toString() || e.id,
              title: e.title || "Cuộc họp không tên",
              startDate: formatVnTime(e.startDate),
              endDate: formatVnTime(e.endDate),
              roomType: e.roomType || "meeting",
              isRecurring: Boolean(e.isRecurring),
              isAllDay: Boolean(e.isAllDay),
              description: e.description ? e.description.slice(0, 100) : undefined,
              host: e.hostDisplayName || e.hostEmail || "Bạn",
            }));

            if (trimmedEvents.length === 0) {
              return {
                isFree: true,
                eventCount: 0,
                events: [],
                message: `Lịch hoàn toàn trống trong khoảng thời gian từ ${formatVnTime(
                  startIso,
                )} đến ${formatVnTime(endIso)}. Không có sự kiện nào.`,
              };
            }

            return {
              isFree: false,
              eventCount: trimmedEvents.length,
              events: trimmedEvents,
              message: `Tìm thấy ${trimmedEvents.length} sự kiện/lịch họp trong khoảng thời gian này.`,
            };
          } catch (error: any) {
            return {
              success: false,
              error:
                error?.message ||
                "Đã xảy ra lỗi khi kiểm tra lịch biểu. Vui lòng thử lại sau.",
            };
          }
        },
      }),

      createCalendarEvent: (tool as any)({
        description:
          "Tạo một lịch họp hoặc sự kiện mới cho người dùng. Bắt buộc có tiêu đề, thời gian bắt đầu và kết thúc.",
        inputSchema: z.object({
          title: z.string().describe("Tiêu đề cuộc họp"),
          startDate: z
            .string()
            .describe(
              "Thời điểm bắt đầu (ISO 8601, ví dụ: 2026-10-14T09:00:00+07:00)",
            ),
          endDate: z
            .string()
            .describe(
              "Thời điểm kết thúc (ISO 8601, ví dụ: 2026-10-14T10:00:00+07:00)",
            ),
          description: z
            .string()
            .optional()
            .describe("Mô tả chi tiết cuộc họp"),
          roomType: z
            .enum(["meeting", "classroom"])
            .optional()
            .describe("Loại cuộc họp (meeting hoặc classroom, mặc định là meeting)"),
          inviteeEmails: z
            .array(z.string())
            .optional()
            .describe("Danh sách địa chỉ email người tham gia nếu có"),
        }),
        execute: async (args: {
          title: string;
          startDate: string;
          endDate: string;
          description?: string;
          roomType?: "meeting" | "classroom";
          inviteeEmails?: string[];
        }) => {
          try {
            // Format lại thời gian nếu sai múi giờ
            const startIso = normalizeToIsoString(args.startDate);
            const endIso = normalizeToIsoString(args.endDate);

            const startDateObj = new Date(startIso);
            const endDateObj = new Date(endIso);

            if (endDateObj <= startDateObj) {
              return {
                success: false,
                error:
                  "Thời gian kết thúc phải sau thời gian bắt đầu cuộc họp.",
              };
            }

            if (startDateObj.getTime() < Date.now() - 60000) {
              return {
                success: false,
                error:
                  "Thời gian bắt đầu cuộc họp phải ở tương lai, không thể tạo lịch trong quá khứ.",
              };
            }

            const invitees =
              args.inviteeEmails && args.inviteeEmails.length > 0
                ? args.inviteeEmails.map((email) => ({ email: email.trim() }))
                : undefined;

            const created = await this.calendarService.createEvent(userId, {
              title: args.title.trim(),
              startDate: startIso,
              endDate: endIso,
              description: args.description?.trim(),
              roomType: args.roomType || "meeting",
              invitees,
            });

            const eventObj = (created as any)?.event || created;

            return {
              success: true,
              eventId: eventObj?._id?.toString(),
              title: eventObj?.title || args.title,
              startDate: formatVnTime(startIso),
              endDate: formatVnTime(endIso),
              meetingCode: eventObj?.meetingCode,
              roomType: eventObj?.roomType || "meeting",
              message: `Đã tạo thành công lịch họp "${args.title}" từ ${formatVnTime(
                startIso,
              )} đến ${formatVnTime(endIso)}.`,
            };
          } catch (error: any) {
            return {
              success: false,
              error:
                error?.message ||
                "Không thể tạo lịch họp do có lỗi xảy ra. Hãy kiểm tra lại thời gian hoặc quyền hạn.",
            };
          }
        },
      }),

      semanticSearchCalendar: (tool as any)({
        description:
          "Tìm kiếm các cuộc họp hoặc sự kiện theo ngữ nghĩa (semantic search) dựa trên Tiêu đề và Nội dung mô tả (Description) lịch họp. " +
          "Sử dụng công cụ này khi người dùng tìm kiếm cuộc họp theo chủ đề, từ khóa, nội dung thảo luận, hoặc khi người dùng hỏi về một cuộc họp cụ thể mà không xác định rõ ngày giờ.",
        inputSchema: z.object({
          query: z
            .string()
            .describe(
              "Nội dung cần tìm kiếm (chủ đề, tiêu đề, từ khóa ngữ nghĩa hoặc tóm tắt nội dung cuộc họp)",
            ),
        }),
        execute: async (args: { query: string }) => {
          try {
            // Tìm kiếm top 5 vector tương đồng qua VectorDbService (Pinecone)
            const matches = await this.vectorDbService.semanticSearch(
              userId,
              args.query,
              5,
            );

            if (!matches || matches.length === 0) {
              return {
                success: true,
                matchCount: 0,
                events: [],
                message: `Không tìm thấy cuộc họp nào phù hợp với yêu cầu "${args.query}" trong các lịch bạn đã tham gia hoặc tạo.`,
              };
            }

            const eventIds = matches.map((m) => m.eventId);

            // Query MongoDB để lấy toàn bộ metadata chi tiết đầy đủ của các lịch
            const dbEvents = await this.calendarEventModel
              .find({ _id: { $in: eventIds } })
              .exec();

            const eventMap = new Map<string, any>();
            for (const ev of dbEvents) {
              eventMap.set(ev._id.toString(), ev);
            }

            // Ghép metadata chi tiết và thông tin host/người tham gia
            const detailedEvents = await Promise.all(
              matches.map(async (match) => {
                const ev = eventMap.get(match.eventId);
                if (!ev) return null;

                const hostUser = await this.userModel
                  .findOne({ supabaseId: ev.hostId })
                  .select("displayName email avatarUrl")
                  .exec();

                const hostName =
                  hostUser?.displayName ||
                  hostUser?.email?.split("@")[0] ||
                  "Người tổ chức";

                const isPast = new Date(ev.endDate).getTime() < Date.now();

                const cleanDesc = (ev.description || "")
                  .replace(/<[^>]*>/g, "")
                  .replace(/&nbsp;/g, " ")
                  .trim();

                return {
                  eventId: ev._id.toString(),
                  title: ev.title,
                  description: cleanDesc || "(Không có mô tả)",
                  startDate: formatVnTime(ev.startDate),
                  endDate: formatVnTime(ev.endDate),
                  startDateIso: ev.startDate.toISOString(),
                  endDateIso: ev.endDate.toISOString(),
                  isPast,
                  roomType: ev.roomType || "meeting",
                  meetingCode: ev.meetingCode,
                  isHost: ev.hostId === userId,
                  hostName,
                  hostEmail: hostUser?.email || "",
                  acceptedUserCount: (ev.acceptedUserIds || []).length + 1,
                  similarityScore: Math.round(match.score * 100) / 100,
                };
              }),
            );

            const filteredEvents = detailedEvents.filter(Boolean);

            return {
              success: true,
              query: args.query,
              matchCount: filteredEvents.length,
              events: filteredEvents,
              instructionForLLM:
                "HẬU KIỂM TRA (POST-CHECK): Đọc kỹ mô tả (description), tiêu đề (title), thời gian và đối chiếu với lịch sử hội thoại của người dùng để quyết định sự kiện nào thực sự phù hợp. Hãy giải thích ngắn gọn lý do chọn hoặc hỏi làm rõ nếu có nhiều cuộc họp có khả năng trùng khớp.",
            };
          } catch (error: any) {
            return {
              success: false,
              error: error?.message || "Lỗi khi tìm kiếm lịch theo ngữ nghĩa.",
            };
          }
        },
      }),

      searchCalendar: (tool as any)({
        description:
          "Tìm kiếm các cuộc họp hoặc sự kiện theo ngữ nghĩa dựa trên tiêu đề và mô tả cuộc họp.",
        inputSchema: z.object({
          keyword: z.string().describe("Từ khóa hoặc chủ đề cuộc họp cần tìm kiếm"),
        }),
        execute: async (args: { keyword: string }) => {
          return tools.semanticSearchCalendar.execute({ query: args.keyword });
        },
      }),
    };

    try {
      const result: any = await (generateText as any)({
        model: this.googleModel,
        instructions: systemInstruction,
        messages,
        tools,
        stopWhen: isStepCount(5),
      });

      // Trích xuất các tool calls đã được thực thi để gửi kèm cho giao diện
      const toolInvocations: any[] = [];
      if (result.steps && result.steps.length > 0) {
        for (const step of result.steps) {
          if (step.toolCalls && step.toolCalls.length > 0) {
            for (let i = 0; i < step.toolCalls.length; i++) {
              const tc = step.toolCalls[i];
              const tr = step.toolResults ? step.toolResults[i] : null;
              toolInvocations.push({
                toolName: tc.toolName,
                args: tc.input,
                result: tr ? tr.output : null,
              });
            }
          }
        }
      }

      return {
        reply:
          result.text ||
          "Tôi đã hoàn tất yêu cầu của bạn nhưng không có phản hồi văn bản.",
        toolInvocations,
      };
    } catch (error: any) {
      this.logger.error(`[Agent] ${error?.message}`, error?.stack);
      return {
        reply:
          "Xin lỗi, hiện tại hệ thống AI đang gặp sự cố kết nối tới Google AI Studio. Vui lòng thử lại sau giây lát.",
        toolInvocations: [],
        error: error?.message,
      };
    }
  }
}

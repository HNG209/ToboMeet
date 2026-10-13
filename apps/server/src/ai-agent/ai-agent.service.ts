import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, tool, isStepCount } from "ai";
import { z } from "zod";
import { CalendarService } from "../calendar/calendar.service";
import { ChatAgentDto } from "./dto/chat-agent.dto";

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

    // Sử dụng model gemini-2.5-flash tốc độ cao và hỗ trợ tool calling xuất sắc
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

QUY TẮC QUAN TRỌNG:
1. LUÔN TRA CỨU BẰNG TOOL: Khi người dùng hỏi xem lịch có rảnh/bận không, hôm nay/ngày mai/tuần này có cuộc họp gì không, BẮT BUỘC gọi tool "checkCalendarAvailability" trước khi trả lời. Tuyệt đối không tự suy diễn lịch của người dùng.
2. TẠO LỊCH KHI ĐƯỢC YÊU CẦU: Khi người dùng yêu cầu tạo lịch mới hoặc lên lịch họp, hãy chuyển đổi thời gian người dùng nói sang chuẩn ISO 8601 với múi giờ +07:00 (hoặc UTC) và gọi tool "createCalendarEvent".
   - Nếu người dùng không nêu rõ thời lượng cuộc họp, mặc định là 60 phút (1 tiếng).
   - Nếu người dùng nói thời gian tương đối như "sáng mai", "15h chiều nay", "thứ Hai tuần tới", hãy căn cứ vào ngày giờ hiện tại (${nowVnFormatted}) để tính chính xác.
3. XỬ LÝ LỖI KHÉO LÉO: Khi tool trả về thông báo lỗi (ví dụ lịch trong quá khứ, giờ kết thúc trước giờ bắt đầu, hoặc lỗi hệ thống), hãy đọc kỹ lỗi và giải thích một cách lịch sự, dễ hiểu cho người dùng, đồng thời gợi ý họ sửa lại thời gian phù hợp.
4. ĐỊNH DẠNG TRẢ LỜI: Sử dụng định dạng Markdown rõ ràng, dễ nhìn (in đậm tiêu đề, thời gian, dùng danh sách có gạch đầu dòng nếu có nhiều sự kiện).
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

    // Thiết lập danh sách tools cho Agent (typed Record<string, any> để tối ưu TypeScript compilation)
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
            this.logger.log(
              `[Agent checkCalendarAvailability] User: ${userId}, Range: ${args.startDate} -> ${args.endDate}`,
            );

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
            this.logger.error(
              `[Agent checkCalendarAvailability Error] ${error?.message}`,
              error?.stack,
            );
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
            this.logger.log(
              `[Agent createCalendarEvent] User: ${userId}, Title: "${args.title}", Start: ${args.startDate}, End: ${args.endDate}`,
            );

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
            this.logger.error(
              `[Agent createCalendarEvent Error] ${error?.message}`,
              error?.stack,
            );
            return {
              success: false,
              error:
                error?.message ||
                "Không thể tạo lịch họp do có lỗi xảy ra. Hãy kiểm tra lại thời gian hoặc quyền hạn.",
            };
          }
        },
      }),

      searchCalendar: (tool as any)({
        description: "Tìm kiếm các cuộc họp hoặc sự kiện theo từ khóa/tiêu đề.",
        inputSchema: z.object({
          keyword: z.string().describe("Từ khóa tìm kiếm tiêu đề cuộc họp"),
        }),
        execute: async (args: { keyword: string }) => {
          try {
            this.logger.log(
              `[Agent searchCalendar] User: ${userId}, Keyword: "${args.keyword}"`,
            );

            const results = await this.calendarService.searchEvents(
              userId,
              args.keyword,
            );

            const trimmed = (results || []).slice(0, 10).map((e: any) => ({
              id: e._id?.toString(),
              title: e.title,
              startDate: formatVnTime(e.startDate),
              endDate: formatVnTime(e.endDate),
              description: e.description ? e.description.slice(0, 80) : undefined,
              roomType: e.roomType,
            }));

            return {
              success: true,
              total: trimmed.length,
              events: trimmed,
              message: `Tìm thấy ${trimmed.length} kết quả phù hợp với từ khóa "${args.keyword}".`,
            };
          } catch (error: any) {
            this.logger.error(
              `[Agent searchCalendar Error] ${error?.message}`,
              error?.stack,
            );
            return {
              success: false,
              error: error?.message || "Lỗi khi tìm kiếm sự kiện.",
            };
          }
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
      this.logger.error(`[Agent generateText Error] ${error?.message}`, error?.stack);
      return {
        reply:
          "Xin lỗi, hiện tại hệ thống AI đang gặp sự cố kết nối tới Google AI Studio. Vui lòng thử lại sau giây lát.",
        toolInvocations: [],
        error: error?.message,
      };
    }
  }
}

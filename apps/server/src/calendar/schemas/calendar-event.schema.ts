import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type CalendarEventDocument = CalendarEvent & Document;

@Schema({ timestamps: true })
export class CalendarEvent {
  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop({ required: true, index: true })
  hostId: string; // UserId (Supabase ID hoặc ID người tổ chức)

  @Prop({ index: true })
  roomId: string; // Tùy chọn: Nhóm (Room) nếu tạo trong nhóm

  @Prop({ index: true })
  channelId: string; // Tùy chọn: Kênh (Channel) nếu tạo trong kênh

  @Prop({ type: String, enum: ["meeting", "classroom", "channel_meeting"] })
  roomType?: "meeting" | "classroom" | "channel_meeting";

  @Prop({ required: true })
  startDate: Date; // Thời gian bắt đầu (buổi đầu tiên nếu lặp)

  @Prop({ required: true })
  endDate: Date; // Thời gian kết thúc (buổi đầu tiên nếu lặp)

  @Prop({ default: "UTC" })
  timezone: string; // Múi giờ

  @Prop()
  location: string; // Địa điểm vật lý (nếu có)

  @Prop({ required: true, index: true })
  meetingCode: string; // LiveKit Room Code

  @Prop()
  meetingPassword?: string; // Mật khẩu phòng họp (nếu có)

  // RFC 5545 Recurrence Rule: Ví dụ "FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261231T235959Z"
  @Prop()
  recurrenceRule?: string;

  // Danh sách các ngày ngoại lệ (ví dụ: ngày bị hủy hoặc chỉnh sửa riêng biệt trong chuỗi lặp)
  // Lưu dạng chuỗi YYYYMMDD hoặc ISO Date string
  @Prop({ type: [String], default: [] })
  recurrenceExceptions: string[];

  @Prop({ type: [String], default: [] })
  acceptedUserIds: string[]; // Đã đồng ý (sẽ hiển thị lên lịch)

  @Prop({ type: [String], default: [] })
  pendingUserIds: string[]; // Đang chờ phản hồi (chỉ hiện thông báo)

  @Prop({ type: [String], default: [] })
  declinedUserIds: string[]; // Đã từ chối

  @Prop({ type: [String], default: [] })
  notificationsEnabledUserIds: string[]; // Danh sách userId đã bật thông báo cho lịch này

  @Prop({ type: Boolean, default: false })
  isRecurring: boolean; // Cờ đánh dấu là sự kiện lặp

  @Prop({ type: Date, default: null })
  recurrenceEndDate: Date; // Ngày kết thúc chuỗi lặp
}

export const CalendarEventSchema = SchemaFactory.createForClass(CalendarEvent);

CalendarEventSchema.index({ startDate: 1, endDate: 1 });
CalendarEventSchema.index({ roomId: 1, channelId: 1 });
CalendarEventSchema.index({ acceptedUserIds: 1, startDate: 1 });
CalendarEventSchema.index({ hostId: 1, startDate: 1 });
CalendarEventSchema.index({ pendingUserIds: 1 });
CalendarEventSchema.index({ notificationsEnabledUserIds: 1 });

// src/meetings/schemas/meeting-session.schema.ts
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";
import * as crypto from "crypto";

@Schema({ _id: false, timestamps: true })
export class SessionRecording {
  @Prop({ required: true, default: () => crypto.randomUUID() })
  recordingId: string;

  @Prop({ required: true })
  folderName: string;

  @Prop({ required: true })
  storagePath: string;

  @Prop()
  playlistUrl?: string;

  @Prop({ default: 0 })
  durationSeconds: number;

  @Prop({ default: 0 })
  sizeBytes: number;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const SessionRecordingSchema =
  SchemaFactory.createForClass(SessionRecording);

@Schema({ _id: false })
export class MeetingActionItem {
  @Prop({ required: true })
  task: string;

  @Prop()
  assignee?: string;

  @Prop()
  dueDate?: string;

  @Prop({ default: "pending" })
  status: string;
}

export const MeetingActionItemSchema =
  SchemaFactory.createForClass(MeetingActionItem);

@Schema({ _id: false })
export class MeetingSummaryData {
  @Prop()
  title?: string;

  @Prop()
  overview?: string;

  @Prop({ type: [String], default: [] })
  keyPoints: string[];

  @Prop({ type: [MeetingActionItemSchema], default: [] })
  actionItems: MeetingActionItem[];

  @Prop({ type: [String], default: [] })
  suggestedQuestions?: string[];

  @Prop({ default: Date.now })
  generatedAt: Date;
}

export const MeetingSummaryDataSchema =
  SchemaFactory.createForClass(MeetingSummaryData);

export type MeetingSessionDocument = MeetingSession & Document;

@Schema({ timestamps: true })
export class MeetingSession {
  @Prop({ required: true, index: true })
  meetingCode: string;

  @Prop({ required: true, enum: ["ongoing", "ended"], default: "ongoing" })
  status: string;

  @Prop({ default: () => `session_${crypto.randomUUID()}` })
  sessionFolder: string;

  @Prop({ type: [SessionRecordingSchema], default: [] })
  recordings: SessionRecording[];

  @Prop({ type: MeetingSummaryDataSchema })
  summary?: MeetingSummaryData;

  @Prop({
    enum: ["none", "processing", "completed", "skipped", "failed"],
    default: "none",
  })
  summaryStatus: string;

  @Prop()
  summaryReason?: string;

  @Prop()
  transcriptKey?: string;

  @Prop({
    enum: ["none", "indexing", "indexed", "failed"],
    default: "none",
  })
  ragStatus: string;

  @Prop({ default: Date.now })
  startedAt: Date;

  @Prop()
  endedAt?: Date;
}

export const MeetingSessionSchema =
  SchemaFactory.createForClass(MeetingSession);

// Partial Unique Index
// Đảm bảo chỉ có 1 phiên 'ongoing' duy nhất tồn tại tại 1 thời điểm cho 1 mã phòng
MeetingSessionSchema.index(
  { meetingCode: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "ongoing" } },
);


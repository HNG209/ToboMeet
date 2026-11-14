
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type AssignmentDocument = Assignment & Document;

@Schema({ timestamps: true })
export class Assignment {
  @Prop({ required: false })
  title?: string;

  @Prop()
  description?: string;

  @Prop({ required: true, index: true })
  roomId: string;

  @Prop({ required: false, index: true })
  channelId?: string;

  @Prop({ type: [String], default: [], index: true })
  channelIds: string[];

  @Prop({ required: false })
  startDate?: Date;

  @Prop({ required: false })
  deadline?: Date;

  @Prop({
    required: false,
    enum: ["allow_late", "lock_after_deadline"],
    default: "allow_late",
  })
  submissionPolicy?: string;

  @Prop({
    required: false,
    enum: ["all_current_and_future", "current_members", "current_and_future_members", "specific_members"],
    default: "current_and_future_members",
  })
  recipientType?: string;

  @Prop({ type: [String], default: [] })
  recipientMemberIds: string[];

  @Prop({
    required: false,
    enum: ["graded", "ungraded"],
    default: "graded",
  })
  gradingType?: string;

  @Prop({ type: Number })
  maxScore?: number;

  @Prop({
    type: [{
      name: { type: String, required: true },
      url: { type: String, required: true },
      size: { type: Number },
      type: { type: String },
    }],
    default: [],
  })
  attachments: {
    name: string;
    url: string;
    size?: number;
    type?: string;
  }[];

  @Prop({
    required: true,
    enum: ["draft", "published"],
    default: "draft",
  })
  status: string;

  @Prop({ required: true })
  createdBy: string;

  // ─── Quiz fields (chỉ dùng khi type = "quiz") ───────────────────────────────

  @Prop({
    required: false,
    enum: ["assignment", "quiz"],
    default: "assignment",
    index: true,
  })
  type: string;

  @Prop({
    type: [
      {
        _id: { type: String, required: true },
        questionType: { type: String, enum: ["choice", "text"], required: true },
        title: { type: String, required: true },
        points: { type: Number, default: 10 },
        isRequired: { type: Boolean, default: false },
        shuffleOptions: { type: Boolean, default: false },
        allowMultiple: { type: Boolean, default: false },
        options: {
          type: [
            {
              _id: { type: String, required: true },
              text: { type: String, required: true },
              isCorrect: { type: Boolean, default: false },
            },
          ],
          default: [],
        },
      },
    ],
    default: [],
  })
  questions: {
    _id: string;
    questionType: "choice" | "text";
    title: string;
    points: number;
    isRequired: boolean;
    shuffleOptions: boolean;
    allowMultiple: boolean;
    options: {
      _id: string;
      text: string;
      isCorrect: boolean;
    }[];
  }[];

  @Prop({
    type: {
      timeLimitMinutes: { type: Number, default: 0 },
      passScore: { type: Number, default: 0 },
      shuffleQuestions: { type: Boolean, default: false },
      showResultsAfterSubmit: { type: Boolean, default: true },
      acceptingResponses: { type: Boolean, default: true },
      allowMultipleAttempts: { type: Boolean, default: false },
      startDate: { type: Date, default: null },
      endDate: { type: Date, default: null },
      closeDate: { type: Date, default: null },
      accessControl: {
        type: String,
        enum: ["anyone", "organization", "specific_members"],
        default: "organization",
      },
    },
    required: false,
    default: null,
  })
  quizSettings?: {
    timeLimitMinutes: number;
    passScore: number;
    shuffleQuestions: boolean;
    showResultsAfterSubmit: boolean;
    acceptingResponses: boolean;
    allowMultipleAttempts: boolean;
    startDate?: Date | null;
    endDate?: Date | null;
    closeDate?: Date | null;
    accessControl: "anyone" | "organization" | "specific_members";
  } | null;
}

export const AssignmentSchema = SchemaFactory.createForClass(Assignment);

// Compound indexes tối ưu tìm kiếm deadline theo phòng & thời gian
AssignmentSchema.index({ deadline: 1, status: 1 });
AssignmentSchema.index({ roomId: 1, deadline: 1, status: 1 });

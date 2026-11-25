import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type AssignmentSubmissionDocument = AssignmentSubmission & Document;

@Schema({ timestamps: true })
export class AssignmentSubmission {
  @Prop({ required: true, index: true })
  assignmentId: string;

  @Prop({ required: true, index: true })
  studentId: string;

  @Prop({ required: true, index: true })
  roomId: string;

  @Prop({ required: true, index: true })
  channelId: string;

  @Prop({
    type: [{
      name: { type: String, required: true },
      url: { type: String, required: true },
      size: { type: Number },
      type: { type: String },
      uploadedAt: { type: Date, default: Date.now },
    }],
    default: [],
  })
  attachments: {
    name: string;
    url: string;
    size?: number;
    type?: string;
    uploadedAt?: Date;
  }[];

  @Prop({ required: false })
  submittedAt?: Date;

  @Prop({
    required: false,
    enum: ["on_time", "late", "not_submitted"],
    default: "not_submitted",
  })
  submissionStatus?: string;

  @Prop({ type: Number, default: 0 })
  lateMinutes: number;

  @Prop({ type: Number })
  score?: number;

  @Prop()
  feedback?: string;

  @Prop()
  gradedBy?: string;

  @Prop()
  gradedAt?: Date;

  @Prop({
    type: [{
      userId: { type: String, required: true },
      userName: { type: String, required: true },
      content: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
    }],
    default: [],
  })
  comments: {
    userId: string;
    userName: string;
    content: string;
    createdAt: Date;
  }[];

  // ─── Quiz submission fields ───────────────────────────────────────────────

  /** Thời điểm thành viên bắt đầu làm bài (để tính countdown) */
  @Prop({ required: false })
  startedAt?: Date;

  /** Seed xáo trộn câu hỏi + đáp án — lưu khi bắt đầu, dùng lại khi reload */
  @Prop({ required: false })
  shuffleSeed?: string;

  /** Đáp án thành viên đã chọn — ID ổn định, không phụ thuộc vị trí A/B/C */
  @Prop({
    type: [
      {
        questionId: { type: String, required: true },
        selectedOptionIds: { type: [String], default: [] },
        textAnswer: { type: String, default: "" },
        score: { type: Number, default: 0 },
      },
    ],
    default: [],
  })
  quizAnswers: {
    questionId: string;
    selectedOptionIds: string[];
    textAnswer: string;
    score?: number;
  }[];

  /** Điểm MCQ tự động (không bao gồm câu tự luận chờ chấm thủ công) */
  @Prop({ type: Number })
  quizScore?: number;

  /** Số thứ tự lần làm bài (1, 2, 3...) — chỉ dùng khi allowMultipleAttempts = true */
  @Prop({ type: Number, default: 1 })
  attemptNumber: number;

  /**
   * Trạng thái chấm bài:
   * - auto_graded: toàn MCQ, đã chấm xong
   * - pending_manual: có câu tự luận chờ chấm
   * - graded: trưởng nhóm đã chấm xong tự luận
   */
  @Prop({
    required: false,
    enum: ["auto_graded", "pending_manual", "graded"],
    default: null,
  })
  gradingStatus?: string | null;
}

export const AssignmentSubmissionSchema = SchemaFactory.createForClass(AssignmentSubmission);
// Compound index cho phép nhiều lượt nộp (attemptNumber khác nhau) nhưng đảm bảo không trùng lặp cùng 1 attempt
AssignmentSubmissionSchema.index({ assignmentId: 1, studentId: 1, attemptNumber: 1 }, { unique: true });
// Tối ưu truy vấn danh sách bài nộp của 1 học viên cho nhiều nhiệm vụ trong CalendarService.getEvents
AssignmentSubmissionSchema.index({ studentId: 1, assignmentId: 1, attemptNumber: -1 });


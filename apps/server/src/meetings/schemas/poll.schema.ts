import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

@Schema({ _id: false })
export class PollVoter {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  avatar?: string;

  @Prop({ default: Date.now })
  votedAt: Date;
}
export const PollVoterSchema = SchemaFactory.createForClass(PollVoter);

@Schema({ _id: false })
export class PollOption {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  text: string;

  @Prop({ type: [PollVoterSchema], default: [] })
  voters: PollVoter[];
}
export const PollOptionSchema = SchemaFactory.createForClass(PollOption);

export type PollDocument = Poll & Document;

@Schema({ timestamps: true })
export class Poll {
  @Prop({ type: Types.ObjectId, ref: "MeetingSession", required: true, index: true })
  sessionId: Types.ObjectId;

  @Prop({ required: true, index: true })
  meetingCode: string;

  @Prop({ required: true })
  question: string;

  @Prop({ type: [PollOptionSchema], required: true })
  options: PollOption[];

  @Prop({ default: false })
  allowMultiple: boolean;

  @Prop({ required: true })
  creatorId: string;

  @Prop({ required: true })
  creatorName: string;

  @Prop()
  creatorAvatar?: string;

  @Prop({ required: true, enum: ["active", "closed"], default: "active" })
  status: "active" | "closed";

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const PollSchema = SchemaFactory.createForClass(Poll);

PollSchema.index({ sessionId: 1, createdAt: -1 });
PollSchema.index({ meetingCode: 1, createdAt: -1 });


import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type DirectConversationDocument = DirectConversation & Document;

@Schema({ _id: false })
export class PinnedMessageItem {
  @Prop({ type: Types.ObjectId, ref: "DirectMessage", required: true })
  messageId: Types.ObjectId;

  @Prop({ required: true })
  pinnedBy: string; // Supabase user ID

  @Prop({ default: Date.now })
  pinnedAt: Date;
}

const PinnedMessageItemSchema = SchemaFactory.createForClass(PinnedMessageItem);

@Schema({ timestamps: true })
export class DirectConversation {
  // Luôn lưu sorted [min, max] để tránh tạo duplicate conversation
  @Prop({ type: [String], required: true, index: true })
  participantIds: string[];

  @Prop({ default: null })
  lastMessageAt: Date | null;

  @Prop({ default: "" })
  lastMessagePreview: string;

  // Map userId -> số tin nhắn chưa đọc
  @Prop({ type: Map, of: Number, default: {} })
  unreadCounts: Map<string, number>;

  // Danh sách tối đa 3 tin nhắn được ghim trong cuộc trò chuyện
  @Prop({ type: [PinnedMessageItemSchema], default: [] })
  pinnedMessages: PinnedMessageItem[];

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const DirectConversationSchema =
  SchemaFactory.createForClass(DirectConversation);

// Index compound để tìm nhanh conversation giữa 2 người
DirectConversationSchema.index({ participantIds: 1 }, { unique: true });
DirectConversationSchema.index({ participantIds: 1, lastMessageAt: -1 });

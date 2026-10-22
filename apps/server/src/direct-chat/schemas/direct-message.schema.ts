import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type DirectMessageDocument = DirectMessage & Document;

export type MessageType = "text" | "file" | "video" | "image";

@Schema({ _id: false })
export class Attachment {
  @Prop({ required: true })
  url: string;

  @Prop({ required: true })
  fileName: string;

  @Prop({ required: true })
  fileSize: number;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true, enum: ["image", "video", "file"] })
  fileType: "image" | "video" | "file";
}

const AttachmentSchema = SchemaFactory.createForClass(Attachment);

@Schema({ _id: false })
export class MessageReaction {
  @Prop({ required: true })
  emoji: string;

  @Prop({ type: [String], default: [] })
  userIds: string[];
}

const MessageReactionSchema = SchemaFactory.createForClass(MessageReaction);

@Schema({ timestamps: true })
export class DirectMessage {
  @Prop({ type: Types.ObjectId, ref: "DirectConversation", required: true, index: true })
  conversationId: Types.ObjectId;

  @Prop({ required: true })
  senderId: string; // Supabase user ID

  @Prop({
    required: true,
    enum: ["text", "file", "video", "image"],
    default: "text",
  })
  type: MessageType;

  @Prop({ default: "" })
  content: string;

  @Prop({ type: [AttachmentSchema], default: [] })
  attachments: Attachment[];

  // Trả lời tin nhắn nào
  @Prop({ type: Types.ObjectId, ref: "DirectMessage", default: null })
  replyToId: Types.ObjectId | null;

  @Prop({ type: [MessageReactionSchema], default: [] })
  reactions: MessageReaction[];

  // Soft delete
  @Prop({ default: null })
  deletedAt: Date | null;

  // Ghim tin nhắn
  @Prop({ default: false, index: true })
  isPinned: boolean;

  @Prop({ default: null })
  pinnedBy: string | null;

  @Prop({ default: null })
  pinnedAt: Date | null;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const DirectMessageSchema = SchemaFactory.createForClass(DirectMessage);

// Đảm bảo tính toàn vẹn dữ liệu: mỗi user chỉ có DUY NHẤT 1 reaction trên mỗi tin nhắn
DirectMessageSchema.pre("save", function () {
  if (this.reactions && this.reactions.length > 0) {
    const seenUsers = new Set<string>();
    for (const r of this.reactions) {
      if (r.userIds && Array.isArray(r.userIds)) {
        for (const uid of r.userIds) {
          if (seenUsers.has(uid)) {
            throw new Error(
              `Validation error: User ${uid} cannot have multiple reactions on message ${this._id}`,
            );
          }
          seenUsers.add(uid);
        }
      }
    }
  }
});

DirectMessageSchema.index({ conversationId: 1, createdAt: -1 });
DirectMessageSchema.index({ conversationId: 1, deletedAt: 1 });

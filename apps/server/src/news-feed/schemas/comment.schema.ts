import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Schema as MongooseSchema, Types } from "mongoose";

export type CommentDocument = Comment & Document;

@Schema({ timestamps: true })
export class Comment {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Post", required: true, index: true })
  postId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Comment", default: null, index: true })
  parentId: Types.ObjectId | null; // Null for top-level comments, Comment ID for replies

  @Prop({ required: true, index: true })
  authorId: string; // Supabase User ID

  @Prop({ required: true })
  content: string;

  @Prop({
    type: [
      {
        url: { type: String, required: true },
        fileName: { type: String, required: true },
        fileType: { type: String, required: true }, // 'image' | 'video' | 'file'
        fileSize: { type: Number, required: true },
      },
    ],
    default: [],
  })
  attachments: {
    url: string;
    fileName: string;
    fileType: string;
    fileSize: number;
  }[];

  @Prop({
    type: [
      {
        userId: { type: String, required: true },
        type: { type: String, required: true }, // 👍, ❤️, 😂, 😮, 😢, 👏, 🎉
      },
    ],
    default: [],
  })
  reactions: {
    userId: string;
    type: string;
  }[];

  @Prop({ type: Boolean, default: false })
  isEdited: boolean;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);

// Compound index tối ưu tìm kiếm bình luận theo bài viết và sắp xếp theo ngày
CommentSchema.index({ postId: 1, createdAt: 1 });

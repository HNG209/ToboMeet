import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";
import { Channel, ChannelSchema } from "./channel.schema";
import { RoomMember, RoomMemberSchema } from "./room-member.schema";

export type RoomDocument = Room & Document;

@Schema({ timestamps: true })
export class Room {
  @Prop({ required: true })
  name: string;

  // @Prop({ required: true, enum: ["meeting", "classroom"] })
  // type: string;

  @Prop({ required: true, unique: true })
  code: string;

  @Prop({ required: true })
  ownerId: string;

  @Prop({ type: [RoomMemberSchema], default: [] })
  members: RoomMember[];

  @Prop({ type: [ChannelSchema], default: [] })
  channels: Channel[];

  @Prop({ type: Boolean, default: false })
  isDeleted?: boolean;

  @Prop({ type: String, enum: ["active", "ended", "disbanded", "blocked"], default: "active" })
  status?: string;
}

export const RoomSchema = SchemaFactory.createForClass(Room);

// Compound index phục vụ getMyRooms (tìm phòng của user sắp xếp theo updatedAt)
RoomSchema.index({ "members.userId": 1, isDeleted: 1, status: 1, updatedAt: -1 });
RoomSchema.index({ ownerId: 1, isDeleted: 1 });

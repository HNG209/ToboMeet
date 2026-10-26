import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";
import { ChannelMember, ChannelMemberSchema } from "./channel-member.schema";

@Schema({ _id: true, timestamps: false })
export class Channel {
  _id?: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ type: Boolean, default: false })
  isPrivate?: boolean;

  @Prop({ type: [ChannelMemberSchema] })
  members?: ChannelMember[];

  @Prop({ default: () => new Date() })
  createdAt: Date;
}

export const ChannelSchema = SchemaFactory.createForClass(Channel);

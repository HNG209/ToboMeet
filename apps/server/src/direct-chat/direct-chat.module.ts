import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  DirectConversation,
  DirectConversationSchema,
} from "./schemas/direct-conversation.schema";
import {
  DirectMessage,
  DirectMessageSchema,
} from "./schemas/direct-message.schema";
import { User, UserSchema } from "../users/schemas/user.schema";
import { SupabaseModule } from "../supabase/supabase.module";
import { CoreModule } from "../core/core.module";
import { DirectChatService } from "./direct-chat.service";
import { DirectChatController } from "./direct-chat.controller";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DirectConversation.name, schema: DirectConversationSchema },
      { name: DirectMessage.name, schema: DirectMessageSchema },
      { name: User.name, schema: UserSchema },
    ]),
    SupabaseModule,
    CoreModule,
  ],
  providers: [DirectChatService],
  controllers: [DirectChatController],
  exports: [DirectChatService],
})
export class DirectChatModule {}

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from "@nestjs/common";
import { DirectChatService } from "./direct-chat.service";
import { SupabaseGuard } from "../core/guards/supabase.guard";
import { CreateConversationDto } from "./dto/create-conversation.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import {
  GetChatUploadUrlDto,
  ReactMessageDto,
} from "./dto/chat-actions.dto";

@Controller("direct-chat")
@UseGuards(SupabaseGuard)
export class DirectChatController {
  constructor(private readonly directChatService: DirectChatService) {}

  /**
   * Tạo hoặc lấy cuộc trò chuyện 1-1
   */
  @Post("conversations")
  async getOrCreateConversation(
    @Request() req: any,
    @Body() dto: CreateConversationDto,
  ) {
    return this.directChatService.getOrCreateConversation(
      req.user.id,
      dto.recipientId,
    );
  }

  /**
   * Lấy danh sách cuộc trò chuyện của người dùng hiện tại
   */
  @Get("conversations")
  async getConversations(@Request() req: any) {
    return this.directChatService.getConversations(req.user.id);
  }

  /**
   * Lấy chi tiết một cuộc trò chuyện
   */
  @Get("conversations/:id")
  async getConversationById(@Request() req: any, @Param("id") id: string) {
    return this.directChatService.getConversationById(id, req.user.id);
  }

  /**
   * Lấy lịch sử tin nhắn của cuộc trò chuyện (cursor-based paging)
   */
  @Get("conversations/:id/messages")
  async getMessages(
    @Request() req: any,
    @Param("id") id: string,
    @Query("before") before?: string,
    @Query("limit") limitStr?: string,
  ) {
    const limit = limitStr ? parseInt(limitStr, 10) : 30;
    return this.directChatService.getMessages(id, req.user.id, {
      before,
      limit,
    });
  }

  /**
   * Gửi tin nhắn mới
   */
  @Post("conversations/:id/messages")
  async sendMessage(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.directChatService.sendMessage(id, req.user.id, dto);
  }

  /**
   * Đánh dấu cuộc trò chuyện đã đọc
   */
  @Put("conversations/:id/read")
  async markAsRead(@Request() req: any, @Param("id") id: string) {
    return this.directChatService.markAsRead(id, req.user.id);
  }

  /**
   * Lấy Signed Upload URL để upload tệp đính kèm trong chat
   */
  @Post("conversations/:id/upload")
  async getChatUploadUrl(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: GetChatUploadUrlDto,
  ) {
    return this.directChatService.getChatUploadUrl(id, req.user.id, dto);
  }

  /**
   * Thả cảm xúc vào tin nhắn
   */
  @Post("messages/:id/react")
  async reactMessage(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: ReactMessageDto,
  ) {
    return this.directChatService.reactMessage(id, req.user.id, dto.emoji);
  }

  /**
   * Lấy danh sách người đã reaction vào tin nhắn
   */
  @Get("messages/:id/reactions")
  async getMessageReactions(@Request() req: any, @Param("id") id: string) {
    return this.directChatService.getMessageReactions(id, req.user.id);
  }

  /**
   * Ghim tin nhắn (tối đa 3 tin trong cuộc trò chuyện)
   */
  @Post("messages/:id/pin")
  async pinMessage(@Request() req: any, @Param("id") id: string) {
    return this.directChatService.pinMessage(id, req.user.id);
  }

  /**
   * Bỏ ghim tin nhắn
   */
  @Delete("messages/:id/pin")
  async unpinMessage(@Request() req: any, @Param("id") id: string) {
    return this.directChatService.unpinMessage(id, req.user.id);
  }

  /**
   * Lấy danh sách tin nhắn đã ghim của cuộc trò chuyện
   */
  @Get("conversations/:id/pinned-messages")
  async getPinnedMessages(@Request() req: any, @Param("id") id: string) {
    return this.directChatService.getPinnedMessages(id, req.user.id);
  }

  /**
   * Xóa / Thu hồi tin nhắn
   */
  @Delete("messages/:id")
  async deleteMessage(@Request() req: any, @Param("id") id: string) {
    return this.directChatService.deleteMessage(id, req.user.id);
  }
}

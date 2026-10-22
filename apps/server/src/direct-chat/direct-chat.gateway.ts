import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Injectable, Logger } from "@nestjs/common";

@Injectable()
@WebSocketGateway({
  cors: {
    origin: process.env.CLIENT_URL
      ? process.env.CLIENT_URL.split(",").map((o) => o.trim())
      : true,
    credentials: true,
  },
})
export class DirectChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DirectChatGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`[DirectChat] Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`[DirectChat] Client disconnected: ${client.id}`);
  }

  /**
   * Client tham gia phòng chat của một cuộc trò chuyện
   */
  @SubscribeMessage("chat:join")
  handleJoinChat(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (data?.conversationId) {
      const room = `chat_${data.conversationId}`;
      client.join(room);
      this.logger.log(`[DirectChat] Client ${client.id} joined room ${room}`);
    }
  }

  /**
   * Client rời khỏi phòng chat
   */
  @SubscribeMessage("chat:leave")
  handleLeaveChat(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (data?.conversationId) {
      const room = `chat_${data.conversationId}`;
      client.leave(room);
      this.logger.log(`[DirectChat] Client ${client.id} left room ${room}`);
    }
  }

  /**
   * Người dùng đang gõ phím
   */
  @SubscribeMessage("chat:typing")
  handleTyping(
    @MessageBody()
    data: { conversationId: string; userId: string; isTyping: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    if (data?.conversationId) {
      // Gửi thông báo đến mọi người trong phòng ngoại trừ người đang gõ
      client.to(`chat_${data.conversationId}`).emit("chat:typing_update", {
        conversationId: data.conversationId,
        userId: data.userId,
        isTyping: data.isTyping,
      });
    }
  }

  /**
   * Phát tin nhắn mới tới tất cả thành viên trong cuộc trò chuyện
   */
  broadcastNewMessage(conversationId: string, message: any) {
    if (this.server) {
      this.server.to(`chat_${conversationId}`).emit("chat:new_message", message);
    }
  }

  /**
   * Báo cho người nhận cập nhật danh sách conversation ngoài sidebar/list
   */
  notifyConversationUpdated(
    recipientId: string,
    conversationId: string,
    previewText: string,
  ) {
    if (this.server) {
      this.server.to(`user_${recipientId}`).emit("chat:conversation_updated", {
        conversationId,
        previewText,
      });
    }
  }

  /**
   * Phát cập nhật cảm xúc (reaction)
   */
  broadcastReactionUpdated(
    conversationId: string,
    messageId: string,
    reactions: any[],
  ) {
    if (this.server) {
      this.server.to(`chat_${conversationId}`).emit("chat:reaction_updated", {
        messageId,
        reactions,
      });
    }
  }

  /**
   * Phát thông báo tin nhắn đã bị xóa / thu hồi
   */
  broadcastMessageDeleted(conversationId: string, messageId: string) {
    if (this.server) {
      this.server.to(`chat_${conversationId}`).emit("chat:message_deleted", {
        messageId,
        conversationId,
      });
    }
  }

  /**
   * Phát thông báo đã đọc
   */
  broadcastReadStatus(conversationId: string, readerId: string) {
    if (this.server) {
      this.server.to(`chat_${conversationId}`).emit("chat:read_updated", {
        conversationId,
        readerId,
      });
    }
  }
}

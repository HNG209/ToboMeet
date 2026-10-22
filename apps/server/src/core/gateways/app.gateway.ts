// src/core/gateways/app.gateway.ts
import { InjectModel } from "@nestjs/mongoose";
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Model } from "mongoose";
import { Server, Socket } from "socket.io";
import {
  Notification,
  NotificationDocument,
} from "../../notifications/schemas/notification.schema";

@WebSocketGateway({
  cors: {
    origin: process.env.CLIENT_URL
      ? process.env.CLIENT_URL.split(",").map((o) => o.trim())
      : true,
    credentials: true,
  },
})
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;
  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
  ) {}

  handleConnection(client: Socket) {
    console.log(`[Socket] Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`[Socket] Client disconnected: ${client.id}`);
  }

  @SubscribeMessage("join_user_room")
  async handleJoinUserRoom(
    @MessageBody() userId: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`user_${userId}`);

    try {
      // Khi người dùng online lại, kiểm tra xem có thông báo popup nào chưa gửi không
      const unreadNotifs = await this.notificationModel
        .find({ userId: userId, isNotified: false, canPopup: true })
        .sort({ createdAt: -1 }) // Sắp xếp mới nhất lên đầu
        .limit(20); // Giới hạn 20 record

      if (unreadNotifs.length > 0) {
        client.emit("receive_notifications", unreadNotifs); // xả 20 thông báo popup
      }
    } catch (error) {
      console.error("[Socket] Lỗi khi đồng bộ thông báo lúc online:", error);
    }
  }

  /**
   * Đánh dấu thông báo đã được hiển thị Popup/Toast (Không còn bị spam lại)
   */
  @SubscribeMessage("mark_notifications_notified")
  async handleMarkNotificationsNotified(
    @MessageBody() notificationIds: string[],
    @ConnectedSocket() client: Socket,
  ) {
    try {
      if (!notificationIds || notificationIds.length === 0) return;

      await this.notificationModel.updateMany(
        { _id: { $in: notificationIds } },
        { $set: { isNotified: true } },
      );
    } catch (error) {
      console.error("[Socket] Lỗi khi đánh dấu notified:", error);
    }
  }

  /**
   * Đánh dấu các thông báo đã được Frontend hiển thị thành "đã đọc"
   */
  @SubscribeMessage("mark_notifications_read")
  async handleMarkNotificationsRead(
    @MessageBody() notificationIds: string[],
    @ConnectedSocket() client: Socket,
  ) {
    try {
      if (!notificationIds || notificationIds.length === 0) return;

      await this.notificationModel.updateMany(
        { _id: { $in: notificationIds } },
        { $set: { isRead: true } },
      );
    } catch (error) {
      console.error("[Socket] Lỗi khi đánh dấu thông báo đã đọc:", error);
    }
  }

  /**
   * Client tham gia phòng chat của một cuộc trò chuyện
   */
  @SubscribeMessage("chat:join")
  handleChatJoin(
    @MessageBody() data: { conversationId: string } | string,
    @ConnectedSocket() client: Socket,
  ) {
    const conversationId = typeof data === "string" ? data : data?.conversationId;
    if (conversationId) {
      const room = `chat_${conversationId}`;
      client.join(room);
      console.log(`[Socket] Client ${client.id} joined chat room ${room}`);
    }
  }

  /**
   * Client rời khỏi phòng chat
   */
  @SubscribeMessage("chat:leave")
  handleChatLeave(
    @MessageBody() data: { conversationId: string } | string,
    @ConnectedSocket() client: Socket,
  ) {
    const conversationId = typeof data === "string" ? data : data?.conversationId;
    if (conversationId) {
      const room = `chat_${conversationId}`;
      client.leave(room);
      console.log(`[Socket] Client ${client.id} left chat room ${room}`);
    }
  }

  /**
   * Thông báo đang gõ phím trong cuộc trò chuyện
   */
  @SubscribeMessage("chat:typing")
  handleChatTyping(
    @MessageBody()
    data: { conversationId: string; userId: string; isTyping: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    if (data?.conversationId) {
      client.to(`chat_${data.conversationId}`).emit("chat:typing_update", {
        conversationId: data.conversationId,
        userId: data.userId,
        isTyping: data.isTyping,
      });
    }
  }
}

// src/meetings/meetings.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

@WebSocketGateway({
  cors: {
    origin: process.env.CLIENT_URL
      ? process.env.CLIENT_URL.split(",").map((o) => o.trim())
      : true,
    credentials: true,
  },
})
export class MeetingsGateway {
  @WebSocketServer()
  server: Server;

  // Khi User bấm vào 1 kênh ở Frontend, sẽ gửi event này lên
  @SubscribeMessage("join_channel")
  handleJoinChannel(
    @MessageBody() channelId: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.join(channelId);
    console.log(`[Socket] Client ${client.id} joined channel: ${channelId}`);
  }

  // Khi User chuyển kênh khác, gửi event rời kênh cũ
  @SubscribeMessage("leave_channel")
  handleLeaveChannel(
    @MessageBody() channelId: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(channelId);
  }

  /**
   * Khi User truy cập vào phòng meeting (meeting/:code), đăng ký socket vào room của meeting
   */
  @SubscribeMessage("join_meeting")
  handleJoinMeeting(
    @MessageBody() data: { meetingCode: string } | string,
    @ConnectedSocket() client: Socket,
  ) {
    const meetingCode = typeof data === "string" ? data : data?.meetingCode;
    if (meetingCode) {
      const room = `meeting:${meetingCode}`;
      client.join(room);
      console.log(`[Socket] Client ${client.id} joined meeting room: ${room}`);
    }
  }

  /**
   * Khi User rời phòng meeting
   */
  @SubscribeMessage("leave_meeting")
  handleLeaveMeeting(
    @MessageBody() data: { meetingCode: string } | string,
    @ConnectedSocket() client: Socket,
  ) {
    const meetingCode = typeof data === "string" ? data : data?.meetingCode;
    if (meetingCode) {
      const room = `meeting:${meetingCode}`;
      client.leave(room);
      console.log(`[Socket] Client ${client.id} left meeting room: ${room}`);
    }
  }

  /**
   * Cập nhật trạng thái cuộc họp mới cho tất cả người dùng trong kênh
   */
  notifyMeetingStatus(
    channelId: string,
    data: { isOngoing: boolean; meetingCode?: string },
  ) {
    this.server.to(channelId).emit("meeting_status_changed", data);
  }

  /**
   * Broadcast các sự kiện bình chọn tới phòng meeting tương ứng
   */
  notifyPollCreated(meetingCode: string, poll: any) {
    this.server.to(`meeting:${meetingCode}`).emit("poll_created", poll);
  }

  notifyPollVoted(meetingCode: string, poll: any) {
    this.server.to(`meeting:${meetingCode}`).emit("poll_voted", poll);
  }

  notifyPollClosed(meetingCode: string, poll: any) {
    this.server.to(`meeting:${meetingCode}`).emit("poll_closed", poll);
  }

  notifyPollDeleted(meetingCode: string, pollId: string) {
    this.server.to(`meeting:${meetingCode}`).emit("poll_deleted", { pollId });
  }
}

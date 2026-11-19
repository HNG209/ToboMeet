// src/meetings/meetings.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

interface MlsMember {
  socketId: string;
  userId: string;
  isHost: boolean;
  leafIndex: number;
  joinedAt: number;
  keyPackage?: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CLIENT_URL
      ? process.env.CLIENT_URL.split(",").map((o) => o.trim())
      : true,
    credentials: true,
  },
})
export class MeetingsGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Quản lý danh sách thành viên tham gia nhóm MLS trong từng cuộc họp
  // meetingCode -> Map<socketId, MlsMember>
  private mlsRoomMembers = new Map<string, Map<string, MlsMember>>();

  /**
   * Cơ chế tự chọn Committer (Đầu mối điều phối Commit trong phòng):
   * 1. Ưu tiên Host của cuộc họp nếu đang online.
   * 2. Nếu không có Host, chọn thành viên có leafIndex nhỏ nhất (hoặc tham gia sớm nhất).
   */
  private getCommitter(meetingCode: string): MlsMember | null {
    const members = this.mlsRoomMembers.get(meetingCode);
    if (!members || members.size === 0) return null;

    const list = Array.from(members.values());
    const host = list.find((m) => m.isHost);
    if (host) return host;

    list.sort((a, b) => {
      if (a.leafIndex !== b.leafIndex) return a.leafIndex - b.leafIndex;
      return a.joinedAt - b.joinedAt;
    });
    return list[0] || null;
  }

  handleDisconnect(client: Socket) {
    // Dọn dẹp thành viên MLS khi socket ngắt kết nối
    for (const [meetingCode, members] of this.mlsRoomMembers.entries()) {
      if (members.has(client.id)) {
        const removedMember = members.get(client.id);
        members.delete(client.id);
        console.log(
          `[MLS] Thành viên ${removedMember?.userId} (leafIndex: ${removedMember?.leafIndex}) đã ngắt kết nối khỏi ${meetingCode}`,
        );

        if (members.size === 0) {
          this.mlsRoomMembers.delete(meetingCode);
        } else {
          // Bầu chọn lại committer mới nếu người rời phòng là committer cũ
          const committer = this.getCommitter(meetingCode);
          if (committer) {
            this.server.to(committer.socketId).emit("mls:role_assigned", {
              isCommitter: true,
            });

            // Yêu cầu Committer tạo commit Remove thành viên vừa ngắt kết nối
            if (removedMember) {
              this.server.to(committer.socketId).emit("mls:request_remove_member", {
                removedUserId: removedMember.userId,
                removedLeafIndex: removedMember.leafIndex,
              });
            }
          }
        }
        break;
      }
    }
  }

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
      this.handleDisconnect(client);
    }
  }

  // -------------------------------------------------------------
  // MLS E2EE DELIVERY SERVICE HANDLERS
  // -------------------------------------------------------------

  /**
   * Client sẵn sàng tham gia nhóm MLS, gửi KeyPackage lên BE.
   * BE kiểm tra: nếu là người đầu tiên -> Gán làm Group Creator.
   * Nếu đã có người trong phòng -> Tìm Committer (Host hoặc leaf nhỏ nhất) để tạo Commit & Welcome.
   */
  @SubscribeMessage("mls:init_member")
  handleMlsInitMember(
    @MessageBody()
    data: {
      meetingCode: string;
      userId: string;
      isHost: boolean;
      keyPackage: any;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const { meetingCode, userId, isHost, keyPackage } = data;
    if (!meetingCode || !userId) return;

    let roomMembers = this.mlsRoomMembers.get(meetingCode);
    if (!roomMembers) {
      roomMembers = new Map();
      this.mlsRoomMembers.set(meetingCode, roomMembers);
    }

    const isFirstMember = roomMembers.size === 0;
    const leafIndex = isFirstMember
      ? 0
      : Math.max(...Array.from(roomMembers.values()).map((m) => m.leafIndex)) + 1;

    const newMember: MlsMember = {
      socketId: client.id,
      userId,
      isHost,
      leafIndex,
      joinedAt: Date.now(),
      keyPackage,
    };
    roomMembers.set(client.id, newMember);

    console.log(
      `[MLS] Thành viên mới ${userId} (socket ${client.id}) đăng ký vào ${meetingCode}, leafIndex: ${leafIndex}, isHost: ${isHost}`,
    );

    if (isFirstMember) {
      // Người đầu tiên: Được chỉ định tạo MLS Group
      client.emit("mls:designated_as_creator", {
        meetingCode,
        leafIndex: 0,
      });
    } else {
      // Có thành viên cũ: Lấy Committer hiện tại để tạo Commit thêm thành viên mới
      const committer = this.getCommitter(meetingCode);
      if (committer && committer.socketId !== client.id) {
        console.log(
          `[MLS] Đã chọn Committer ${committer.userId} (${committer.socketId}) để commit Add cho ${userId}`,
        );
        this.server.to(committer.socketId).emit("mls:request_add_member", {
          newMemberSocketId: client.id,
          userId,
          leafIndex,
          keyPackage,
        });
      }
    }
  }

  /**
   * Committer hoàn tất việc tạo Commit & Welcome message cho thành viên mới:
   * 1. Gửi Welcome message bí mật riêng cho thành viên mới gia nhập.
   * 2. Broadcast Commit message cho các thành viên còn lại để đồng bộ tiến trình Epoch.
   */
  @SubscribeMessage("mls:submit_add_commit")
  handleSubmitAddCommit(
    @MessageBody()
    data: {
      meetingCode: string;
      targetSocketId: string;
      welcomeMessage: any;
      commitMessage: any;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const { meetingCode, targetSocketId, welcomeMessage, commitMessage } = data;
    const room = `meeting:${meetingCode}`;

    // 1. Chuyển riêng Welcome message cho thành viên mới
    if (targetSocketId) {
      this.server.to(targetSocketId).emit("mls:welcome_received", {
        welcomeMessage,
      });
    }

    // 2. Broadcast Commit cho các thành viên hiện tại (trừ committer và thành viên mới)
    client.to(room).emit("mls:commit_received", {
      commitMessage,
    });
  }

  /**
   * Committer gửi Commit sau khi Remove một thành viên
   */
  @SubscribeMessage("mls:submit_remove_commit")
  handleSubmitRemoveCommit(
    @MessageBody()
    data: {
      meetingCode: string;
      commitMessage: any;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const { meetingCode, commitMessage } = data;
    const room = `meeting:${meetingCode}`;

    // Broadcast Commit cho các thành viên còn lại
    client.to(room).emit("mls:commit_received", {
      commitMessage,
    });
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

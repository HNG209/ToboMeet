import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  Notification,
  NotificationDocument,
} from "../notifications/schemas/notification.schema";
import {
  MeetingSession,
  MeetingSessionDocument,
} from "./schemas/meeting-session.schema";
import { AppGateway } from "../core/gateways/app.gateway";
import { RoomServiceClient } from "livekit-server-sdk";
import { isLoadTestMode, createMockLiveKitProxy } from "./utils/mock-livekit.util";
import { AppException } from "../core/exceptions/app.exception";
import { ErrorCode } from "@tobomeet/shared/types";
import { User, UserDocument } from "../users/schemas/user.schema";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class MeetingInviteService {
  private livekitRoomService: RoomServiceClient;

  constructor(
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationService: NotificationsService,
    private appGateway: AppGateway,
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
    @InjectModel(MeetingSession.name)
    private sessionModel: Model<MeetingSessionDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
  ) {
    // Khởi tạo LiveKit Client để gọi API trực tiếp
    const livekitHost = process.env.LIVEKIT_API_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (isLoadTestMode()) {
      this.livekitRoomService = createMockLiveKitProxy<RoomServiceClient>("MeetingInviteService");
    } else if (livekitHost && apiKey && apiSecret) {
      this.livekitRoomService = new RoomServiceClient(
        livekitHost,
        apiKey,
        apiSecret,
      );
    }
  }

  async sendMeetingInvite(
    inviterId: string,
    inviteeId: string,
    meetingCode: string,
  ) {
    if (!this.livekitRoomService) {
      throw new AppException(ErrorCode.SERVER_ERROR);
    }

    // Kiểm tra phòng LiveKit và lấy danh sách người tham gia
    let livekitRooms;
    let participants;
    try {
      livekitRooms = await this.livekitRoomService.listRooms([meetingCode]);
      if (!livekitRooms || livekitRooms.length === 0) {
        throw new AppException(ErrorCode.MEETING_INVITE_ROOM_NOT_ACTIVE);
      }
      participants =
        await this.livekitRoomService.listParticipants(meetingCode);
    } catch (error) {
      console.log(error);
      throw new AppException(ErrorCode.MEETING_INVITE_ACCESS_FAILED);
    }

    // Kiểm tra nếu người dùng thực sự đang trong phòng (chống bot spam)
    const isInviterInRoom = participants.some((p) => p.identity === inviterId);
    if (!isInviterInRoom) {
      throw new AppException(ErrorCode.MEETING_INVITE_NOT_ALLOWED);
    }

    // Trích xuất sessionId từ metadata của LiveKit
    const roomInfo = livekitRooms[0];
    let sessionId = "";
    try {
      if (roomInfo.metadata) {
        const meta = JSON.parse(roomInfo.metadata);
        sessionId = meta.sessionId;
      }
    } catch (e) {
      console.error("Lỗi parse metadata từ LiveKit:", e);
    }

    if (!sessionId) {
      throw new AppException(ErrorCode.MEETING_INVITE_SESSION_INVALID);
    }

    const [session, inviter] = await Promise.all([
      this.sessionModel.findById(sessionId),
      this.userModel
        .findOne({ supabaseId: inviterId })
        .select("displayName")
        .exec(),
    ]);

    if (!session || session.status !== "ongoing") {
      throw new AppException(ErrorCode.MEETING_INVITE_SESSION_NOT_FOUND);
    }

    // const room = await this.roomModel.findById(session.roomId);
    // const roomName = room.name;
    const inviterName = inviter?.displayName;

    // Logic chống spam gửi lời mời và lưu thông báo
    const COOLDOWN_MINUTES = 5;
    const cooldownMs = COOLDOWN_MINUTES * 60 * 1000;
    const now = new Date();

    const existingNotif = await this.notificationModel.findOne({
      userId: inviteeId,
      type: "MEETING_INVITE",
      referenceId: meetingCode,
    });

    this.notificationService.toggleUnreadStatus(inviteeId, true);

    if (existingNotif) {
      const lastUpdated = existingNotif.updatedAt?.getTime() || 0;
      const timeSinceLastInvite = now.getTime() - lastUpdated;

      if (timeSinceLastInvite < cooldownMs) {
        throw new AppException(ErrorCode.MEETING_INVITE_RATE_LIMITED);
      }

      // Cập nhật lại thông báo hiện có
      existingNotif.isRead = false;
      existingNotif.isNotified = false;
      existingNotif.createdAt = now;
      existingNotif.markModified("createdAt");
      existingNotif.metadata = {
        ...existingNotif.metadata,
        sessionId,
        inviterId,
        inviterName,
        invitedAt: now.toISOString(),
        // roomName,
      };

      const updatedNotif = await existingNotif.save();

      this.appGateway.server
        .to(`user_${inviteeId}`)
        .emit("receive_notifications", [updatedNotif]);

      return updatedNotif;
    }

    // TẠO MỚI: Truyền meetingCode vào referenceId
    const newNotif = await this.notificationModel.create({
      userId: inviteeId,
      type: "MEETING_INVITE",
      referenceId: meetingCode,
      metadata: {
        sessionId,
        inviterId,
        inviterName,
        invitedAt: now.toISOString(),
        // roomName,
      },
      isRead: false,
      isNotified: false,
    });

    this.appGateway.server
      .to(`user_${inviteeId}`)
      .emit("receive_notifications", [newNotif]);

    return newNotif;
  }

  async exchangeSessionForCode(userId: string, sessionId: string) {
    const session = await this.sessionModel.findById(sessionId);

    if (!session) {
      throw new AppException(ErrorCode.MEETING_INVITE_SESSION_NOT_FOUND);
    }

    if (session.status !== "ongoing") {
      throw new AppException(ErrorCode.MEETING_INVITE_SESSION_INVALID);
    }

    return {
      meetingCode: session.meetingCode
    };
  }
}

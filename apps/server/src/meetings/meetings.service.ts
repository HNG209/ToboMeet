// src/meetings/meetings.service.ts
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Meeting, MeetingDocument } from "./schemas/meeting.schema";
import { User, UserDocument } from "../users/schemas/user.schema";
import {
  AccessToken,
  RoomServiceClient,
  TrackType,
  Room as LiveKitRoom,
  TrackSource,
  AgentDispatchClient,
} from "livekit-server-sdk";
import { Room, RoomDocument } from "../rooms/schemas/room.schema";
import {
  ErrorCode,
  LivekitRoomMetadata,
  MainRoomMetadata,
  MeetingDeviceStatus,
  MeetingJoinResponse,
  MeetingSessionResponse,
  PageResponse,
  ParticipantMetadata,
  PresignedUploadResponse,
  RoomMemberStatus,
} from "@tobomeet/shared/types";
import { MeetingsGateway } from "./meetings.gateway";
import { AppException } from "../core/exceptions/app.exception";
import { SupabaseService } from "../supabase/supabase.service";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  MeetingSession,
  MeetingSessionDocument,
} from "./schemas/meeting-session.schema";
import { Attendance, AttendanceDocument } from "./schemas/attendance.schema";

@Injectable()
export class MeetingsService {
  private livekitRoomService: RoomServiceClient;
  private agentDispatchClient: AgentDispatchClient | null = null;
  private readonly BUCKET_NAME = "meeting-chat";
  private readonly STT_AGENT_NAME = "stt-transcriber";
  constructor(
    private eventEmitter: EventEmitter2,
    private readonly supabaseService: SupabaseService,
    @InjectModel(Meeting.name) private meetingModel: Model<MeetingDocument>,
    @InjectModel(MeetingSession.name)
    private sessionModel: Model<MeetingSessionDocument>,
    @InjectModel(Attendance.name)
    private attendanceModel: Model<AttendanceDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Room.name) private roomModel: Model<RoomDocument>,
    private readonly meetingsGateway: MeetingsGateway,
  ) {
    const livekitHost = process.env.LIVEKIT_API_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (livekitHost && apiKey && apiSecret) {
      this.livekitRoomService = new RoomServiceClient(
        livekitHost,
        apiKey,
        apiSecret,
      );

      this.agentDispatchClient = new AgentDispatchClient(
        livekitHost,
        apiKey,
        apiSecret,
      );
    }
  }

  async joinMeeting(
    meetingCode: string,
    userId: string,
    deviceId: string,
    displayName?: string,
    forceSwitch = false,
    allowStart = false,
    skipWaitingRoom = false,
  ): Promise<MeetingJoinResponse> {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      throw new AppException(ErrorCode.SERVER_ERROR);
    }

    // Tìm meeting
    const meeting = await this.meetingModel.findOne({ meetingCode }).exec();
    if (!meeting) {
      throw new AppException(ErrorCode.MEETING_NOT_FOUND);
    }

    // Lấy thông tin user
    const user = await this.userModel.findOne({ supabaseId: userId }).exec();
    const finalDisplayName = displayName || user?.displayName || "Người dùng ẩn danh";
    const avatarUrl = user?.avatarUrl || "";

    // Kiểm tra phòng LiveKit có đang active không
    let livekitRoom = await this.isRoomActive(meeting.meetingCode);
    let humanParticipantsCount = 0;

    if (livekitRoom && this.livekitRoomService) {
      humanParticipantsCount = await this.getHumanParticipantsCount(meeting.meetingCode);
      // Nếu phòng LiveKit vẫn còn nhưng thực tế không còn ai, kết thúc session cũ và dọn phòng
      if (humanParticipantsCount === 0) {
        await this.endMeetingByCode(meeting.meetingCode);
        await this.forceDeleteLiveKitRoom(meeting.meetingCode);
        livekitRoom = null;
      }
    }

    const isMeetingStarting = !livekitRoom;

    if (isMeetingStarting) {
      // Không cho phép start → chặn (người lạ / refresh người cuối)
      if (!allowStart) {
        throw new AppException(ErrorCode.MEETING_NOT_STARTED_OR_ENDED);
      }

      // Cho phép start → kiểm tra quyền
      const { canStart } = await this.canStartMeeting(meetingCode, userId);
      if (!canStart) {
        throw new AppException(ErrorCode.INVALID_PERMISSION);
      }
    }

    // Chặn user đang join ở thiết bị khác (trừ khi forceSwitch) và kiểm tra phòng họp đã đầy
    if (livekitRoom && this.livekitRoomService) {
      try {
        const participants = await this.livekitRoomService.listParticipants(meeting.meetingCode);
        const isAlreadyInThisRoom = participants.some((p) => p.identity === userId);

        if (isAlreadyInThisRoom && !forceSwitch) {
          throw new AppException(ErrorCode.ALREADY_IN_MEETING);
        }

        // Lọc người tham gia thực tế (loại trừ STT agent bot)
        const humanParticipants = participants.filter(
          (p) =>
            !p.identity?.includes(this.STT_AGENT_NAME) &&
            !p.name?.includes(this.STT_AGENT_NAME),
        );

        // Giới hạn tối đa 100 người trong 1 meeting, nếu lớn hơn thì báo lỗi đã đầy
        if (!isAlreadyInThisRoom && humanParticipants.length >= 100) {
          throw new AppException(ErrorCode.MEETING_FULL);
        }
      } catch (error) {
        if (error instanceof AppException) throw error;
      }
    }

    // Quản lý Session
    let currentSessionId = "";
    if (isMeetingStarting) {
      // Trước khi tạo session mới, kết thúc toàn bộ session ongoing cũ còn treo
      await this.sessionModel.updateMany(
        { meetingCode: meeting.meetingCode, status: "ongoing" },
        { $set: { status: "ended", endedAt: new Date() } },
      );

      try {
        const newSession = await this.sessionModel.create({
          meetingCode: meeting.meetingCode,
          status: "ongoing",
        });
        currentSessionId = newSession._id.toString();
      } catch (error) {
        const ongoing = await this.sessionModel.findOne({
          meetingCode: meeting.meetingCode,
          status: "ongoing",
        });
        if (ongoing) currentSessionId = ongoing._id.toString();
      }
    } else {
      // Cuộc họp đang diễn ra, tìm session ongoing hoặc tạo mới nếu thiếu
      let ongoing = await this.sessionModel.findOne({
        meetingCode: meeting.meetingCode,
        status: "ongoing",
      });
      if (!ongoing) {
        ongoing = await this.sessionModel.create({
          meetingCode: meeting.meetingCode,
          status: "ongoing",
        });
      }
      currentSessionId = ongoing._id.toString();
    }

    // Eager create LiveKit room nếu chưa có
    if (!livekitRoom && this.livekitRoomService) {
      try {
        livekitRoom = await this.livekitRoomService.createRoom({
          name: meeting.meetingCode,
          emptyTimeout: 5 * 60,
          departureTimeout: 5 * 60,
          metadata: JSON.stringify({
            roomType: "main",
            meetingType: meeting.type === "personal" ? "personal" : "channel",
            sessionId: currentSessionId,
            isWaitingRoomEnabled: false,
            isChatEnabled: true,
            approvalPermission: "admin_only",
          } as MainRoomMetadata),
        });

        await this.dispatchSttAgent(meeting.meetingCode, currentSessionId);
      } catch (e) {
        console.error("Lỗi tạo phòng LiveKit:", e);
      }
    }

    // Thông báo status (chỉ khi start mới + là channel meeting)
    if (isMeetingStarting && meeting.type === "channel" && meeting.channelId) {
      this.meetingsGateway.notifyMeetingStatus(meeting.channelId, {
        isOngoing: true,
        meetingCode: meeting.meetingCode,
      });
    }

    // Xác định role & quyền
    const { role, hasAdminPowers } = await this.resolveParticipantRole(meeting, userId);

    // Waiting room logic
    let isWaitingRoomEnabled = false;
    if (livekitRoom?.metadata && !skipWaitingRoom) {
      try {
        const meta = JSON.parse(livekitRoom.metadata);
        isWaitingRoomEnabled = meta.isWaitingRoomEnabled === true;
      } catch { }
    }

    const isWaiting = !skipWaitingRoom && isWaitingRoomEnabled && !hasAdminPowers;
    const participantStatus = isWaiting ? "waiting" : "joined";

    const at = new AccessToken(apiKey, apiSecret, {
      identity: userId,
      name: finalDisplayName,
      ttl: "5m",
      metadata: JSON.stringify({
        deviceId,
        avatarUrl,
        hasAdminPowers,
        role,
        status: participantStatus,
      } as ParticipantMetadata),
    });

    at.addGrant({
      roomJoin: true,
      room: meeting.meetingCode,
      canPublish: !isWaiting,
      canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE],
      canSubscribe: !isWaiting,
      canUpdateOwnMetadata: true,
    });

    return {
      token: await at.toJwt(),
      meetingCode: meeting.meetingCode,
      status: "ongoing",
      displayName: finalDisplayName,

      // Chỉ trả về khi người dùng là thành viên trong kênh
      roomId: role !== "guest" && meeting.roomId?.toString(),
      channelId: role !== "guest" && meeting.channelId?.toString(),
    };
  }

  /**
   * Gọi agent STT vào room khi meeting start.
   */
  private async dispatchSttAgent(
    roomName: string,
    sessionId?: string,
  ): Promise<void> {
    await this.ensureSttAgent(roomName, sessionId);
  }

  /**
   * Đảm bảo agent STT đã được dispatch vào phòng cuộc họp.
   * Nếu đã dispatch rồi thì không gọi lại, nếu chưa thì gọi createDispatch.
   */
  async ensureSttAgent(
    roomName: string,
    sessionId?: string,
  ): Promise<{ dispatched: boolean; message?: string }> {
    if (!this.agentDispatchClient) {
      return { dispatched: false, message: "Agent dispatch client not initialized" };
    }

    try {
      // Kiểm tra danh sách dispatch hiện tại của room
      const dispatches = await this.agentDispatchClient.listDispatch(roomName);
      const existingDispatch = dispatches.find(
        (d) => d.agentName === this.STT_AGENT_NAME
          && !(d.state?.deletedAt && d.state.deletedAt > 0n), // bỏ qua dispatch đã bị xóa
      );

      if (existingDispatch) {
        // Kiểm tra agent có thực sự đang trong phòng không
        let agentIsLive = false;
        if (this.livekitRoomService) {
          try {
            const participants = await this.livekitRoomService.listParticipants(roomName);
            agentIsLive = participants.some(
              (p) =>
                p.identity?.includes(this.STT_AGENT_NAME) ||
                p.name?.includes(this.STT_AGENT_NAME),
            );
          } catch { }
        }

        if (agentIsLive) {
          return { dispatched: true, message: "Agent already active in room" };
        }

        // Dispatch tồn tại nhưng agent chưa vào — kiểm tra tuổi của dispatch.
        // Nếu dispatch mới (<90s): agent đang cold-start (~13s) → ĐỢI, không xóa.
        // Nếu dispatch cũ (>=90s): agent đã fail hoàn toàn → xóa và tạo lại.
        const createdAt = existingDispatch.state?.createdAt
          ? Number(existingDispatch.state.createdAt) // bigint seconds
          : 0;
        const ageSeconds = createdAt > 0 ? (Date.now() / 1000 - createdAt) : Infinity;

        if (ageSeconds < 90) {
          // Dispatch còn mới → agent đang khởi động, đợi thêm
          return { dispatched: true, message: "Agent dispatch pending (cold-start)" };
        }

        // Dispatch quá cũ → agent fail → xóa và tạo lại
        try {
          await this.agentDispatchClient.deleteDispatch(existingDispatch.id, roomName);
        } catch (e) {
        }
      }

      await this.agentDispatchClient.createDispatch(
        roomName,
        this.STT_AGENT_NAME,
        {
          metadata: JSON.stringify({
            sessionId: sessionId || "",
            purpose: "stt",
          }),
        },
      );
      return { dispatched: true };
    } catch (err: any) {
      return { dispatched: false, message: err?.message };
    }
  }


  /**
   * Kiểm tra user có quyền start meeting này không
   * (dùng cho frontend hiện nút Start + backend validate)
   */
  async canStartMeeting(
    meetingCode: string,
    userId: string,
  ): Promise<{ canStart: boolean; reason?: string }> {
    const meeting = await this.meetingModel.findOne({ meetingCode }).exec();
    if (!meeting) {
      return { canStart: false, reason: "MEETING_NOT_FOUND" };
    }

    // Kiểm tra phòng LiveKit thực tế có người tham gia không
    const livekitRoom = await this.isRoomActive(meeting.meetingCode);
    if (livekitRoom) {
      const humanCount = await this.getHumanParticipantsCount(meeting.meetingCode);
      if (humanCount > 0) {
        return { canStart: false, reason: "ALREADY_ONGOING" };
      }
      // Không có người: dọn dẹp phòng cũ và đóng session cũ để cho phép start mới
      await this.endMeetingByCode(meeting.meetingCode);
      await this.forceDeleteLiveKitRoom(meeting.meetingCode);
    } else {
      // LiveKit không có phòng, đảm bảo kết thúc mọi session ongoing bị treo
      await this.sessionModel.updateMany(
        { meetingCode: meeting.meetingCode, status: "ongoing" },
        { $set: { status: "ended", endedAt: new Date() } },
      );
    }

    // Kiểm tra quyền theo type
    if (meeting.type === "personal") {
      const isOwner = meeting.ownerId === userId;
      return {
        canStart: isOwner,
        reason: isOwner ? undefined : "NOT_OWNER",
      };
    }

    // type === "channel"
    if (!meeting.roomId || !meeting.channelId) {
      return { canStart: false, reason: "INVALID_MEETING" };
    }

    const room = await this.roomModel.findById(meeting.roomId).exec();
    if (!room) {
      return { canStart: false, reason: "ROOM_NOT_FOUND" };
    }

    const role = this.getUserRoleInChannel(room, meeting.channelId, userId);
    const allowed = role === "owner" || role === "admin" || role === "member";

    return {
      canStart: allowed,
      reason: allowed ? undefined : "INVALID_PERMISSION",
    };
  }

  /** Lấy role của participant trong cuộc họp */
  async resolveParticipantRole(
    meeting: MeetingDocument,
    userId: string,
  ): Promise<{ role: string; hasAdminPowers: boolean }> {
    if (meeting.type === "personal") {
      const isOwner = meeting.ownerId === userId;
      return {
        role: isOwner ? "owner" : "guest",
        hasAdminPowers: isOwner,
      };
    }

    // Channel meeting
    const room = await this.roomModel.findById(meeting.roomId).exec();
    if (!room) {
      return { role: "guest", hasAdminPowers: false };
    }

    const role = this.getUserRoleInChannel(room, meeting.channelId!, userId);
    const hasAdminPowers = role === "owner" || role === "admin";
    return { role, hasAdminPowers };
  }

  /**
 * Lấy hoặc tạo meetingCode cho một channel.
 * Chỉ member trở lên mới được tạo mới.
 */
  async ensureChannelMeeting(
    roomId: string,
    channelId: string,
    userId: string,
  ): Promise<{ meetingCode: string }> {
    // Tìm meeting hiện có
    let meeting = await this.meetingModel
      .findOne({ roomId, channelId, type: "channel" })
      .exec();

    if (meeting) {
      return { meetingCode: meeting.meetingCode };
    }

    // Chưa có → kiểm tra quyền tạo
    const room = await this.roomModel.findById(roomId).exec();
    if (!room) {
      throw new AppException(ErrorCode.ROOM_OR_CHANNEL_NOT_FOUND);
    }

    const role = this.getUserRoleInChannel(room, channelId, userId);
    if (role === "guest") {
      throw new AppException(ErrorCode.INVALID_PERMISSION);
    }

    // Tạo meeting mới
    const randomString = Math.random().toString(36).substring(2, 9);
    const meetingCode = `meet-${roomId.substring(0, 4)}-${randomString}`;

    meeting = await this.meetingModel.create({
      type: "channel",
      roomId,
      channelId,
      meetingCode,
    });

    return { meetingCode: meeting.meetingCode };
  }

  /**
 * Lấy hoặc tạo personal meeting cho user.
 * Mỗi user chỉ có 1 personal meeting (dựa vào ownerId + type).
 */
  async ensurePersonalMeeting(userId: string): Promise<{ meetingCode: string }> {
    let meeting = await this.meetingModel
      .findOne({ type: "personal", ownerId: userId })
      .exec();

    if (meeting) {
      return { meetingCode: meeting.meetingCode };
    }

    // Tạo mới
    const meetingCode = `p-${userId.substring(0, 8)}-${Math.random().toString(36).substring(2, 7)}`;

    meeting = await this.meetingModel.create({
      type: "personal",
      meetingCode,
      ownerId: userId,
    });

    return { meetingCode: meeting.meetingCode };
  }

  /**
   * Lấy hoặc tạo meetingCode tương ứng dựa trên loại meeting:
   * - Nếu là cuộc họp kênh (channel_meeting): gọi ensureChannelMeeting
   * - Nếu là cuộc họp cá nhân (personal/meeting): gọi ensurePersonalMeeting
   */
  async ensureMeetingCode(params: {
    roomType?: "meeting" | "classroom" | "channel_meeting" | string;
    userId: string;
    roomId?: string;
    channelId?: string;
  }): Promise<{ meetingCode: string }> {
    if (params.roomType === "channel_meeting" && params.roomId && params.channelId) {
      return this.ensureChannelMeeting(params.roomId, params.channelId, params.userId);
    }
    return this.ensurePersonalMeeting(params.userId);
  }

  /**
   * Bật tắt chế độ phòng chờ (Waiting Room)
   */
  async toggleWaitingRoom(meetingCode: string, isWaitingRoomEnabled: boolean) {
    if (!this.livekitRoomService) {
      throw new AppException(ErrorCode.SERVER_ERROR);
    }

    try {
      // Cập nhật trạng thái phòng chờ vào Room Metadata
      const rooms = await this.livekitRoomService.listRooms([meetingCode]);
      let currentMeta = {};

      if (rooms && rooms.length > 0 && rooms[0].metadata) {
        try {
          currentMeta = JSON.parse(rooms[0].metadata);
        } catch (e) {
          console.error("Lỗi parse metadata phòng", e);
        }
      }

      const metadataString = JSON.stringify({
        ...currentMeta,
        isWaitingRoomEnabled,
      });

      await this.livekitRoomService.updateRoomMetadata(
        meetingCode,
        metadataString,
      );

      // Tự động duyệt tất cả người đang chờ vào phòng chính nếu tắt phòng chờ
      if (!isWaitingRoomEnabled) {
        const participants =
          await this.livekitRoomService.listParticipants(meetingCode);

        const approvePromises = participants.map(async (participant) => {
          let pMeta: ParticipantMetadata = {} as ParticipantMetadata;

          if (participant.metadata) {
            try {
              pMeta = JSON.parse(participant.metadata);
            } catch (e) {
              console.error("Lỗi parse metadata của participant", e);
            }
          }

          // Kiểm tra xem người này có đang bị nhốt ở phòng chờ không
          if (pMeta.status === "waiting") {
            pMeta.status = "joined";

            // Cập nhật lại Metadata và mở toàn bộ quyền (Micro, Camera, Data)
            return this.livekitRoomService.updateParticipant(
              meetingCode,
              participant.identity,
              JSON.stringify(pMeta),
              {
                canPublish: true,
                canSubscribe: true,
                canPublishData: true,
                canUpdateMetadata: true,
              },
            );
          }
        });

        await Promise.all(approvePromises);
      }
    } catch (error) {
      throw new AppException(ErrorCode.WAITING_ROOM_UPDATE_FAILED);
    }
  }

  /**
   * Duyệt người dùng từ phòng chờ vào phòng chính
   */
  async approveParticipant(
    requesterId: string,
    meetingCode: string,
    participantIdentity: string,
  ) {
    if (!this.livekitRoomService) {
      throw new AppException(ErrorCode.SERVER_ERROR);
    }

    const meeting = await this.meetingModel.findOne({ meetingCode }).exec();
    if (!meeting) {
      throw new AppException(ErrorCode.MEETING_NOT_FOUND);
    }

    // Lấy thông tin quyền duyệt từ metadata của phòng LiveKit để kiểm tra xem requester có quyền duyệt hay không
    let approvalPermission = "admin_only"; // Mặc định nếu chưa setup
    try {
      const rooms = await this.livekitRoomService.listRooms([meetingCode]);
      if (rooms && rooms.length > 0 && rooms[0].metadata) {
        const meta = JSON.parse(rooms[0].metadata);
        if (meta.approvalPermission) {
          approvalPermission = meta.approvalPermission;
        }
      }
    } catch (e) {
      console.error("Lỗi parse metadata phòng khi check quyền", e);
    }

    let hasPermission = false;

    // TH1: Cuộc họp cá nhân (personal meeting)
    // Không có channel/room. Chỉ căn cứ nếu người duyệt là host (ownerId) hoặc mở quyền duyệt cho tất cả (everyone).
    // Không có trường hợp member_and_admin.
    if (meeting.type === "personal") {
      const isHost = meeting.ownerId === requesterId;
      if (isHost || approvalPermission === "everyone") {
        hasPermission = true;
      }
    } else {
      // TH2: Cuộc họp theo kênh (channel meeting)
      if (!meeting.roomId || !meeting.channelId) {
        throw new AppException(ErrorCode.ROOM_OR_CHANNEL_NOT_FOUND);
      }

      const room = await this.roomModel.findById(meeting.roomId).exec();
      if (!room) {
        throw new AppException(ErrorCode.ROOM_OR_CHANNEL_NOT_FOUND);
      }

      const channel = room.channels.find(
        (c) => c._id?.toString() === meeting.channelId?.toString(),
      );
      if (!channel) {
        throw new AppException(ErrorCode.ROOM_OR_CHANNEL_NOT_FOUND);
      }

      // Xác định role của requester trong kênh để kiểm tra quyền
      const requesterRole = this.getUserRoleInChannel(
        room,
        channel._id.toString(),
        requesterId,
      );

      // Owner và Admin LUÔN CÓ QUYỀN
      if (requesterRole === "owner" || requesterRole === "admin") {
        hasPermission = true;
      }
      // Nếu phòng setup cho mọi người (everyone)
      else if (approvalPermission === "everyone") {
        hasPermission = true;
      }
      // Nếu phòng setup cho member_and_admin và người này là member
      else if (
        approvalPermission === "member_and_admin" &&
        requesterRole === "member"
      ) {
        hasPermission = true;
      }
    }

    if (!hasPermission) {
      throw new AppException(ErrorCode.INVALID_PERMISSION);
    }

    try {
      if (participantIdentity === "all") {
        // Logic duyệt tất cả người dùng đang chờ
        const participants =
          await this.livekitRoomService.listParticipants(meetingCode);

        const approvePromises = participants.map(async (participant) => {
          let pMeta: ParticipantMetadata = {} as ParticipantMetadata;
          if (participant.metadata) {
            try {
              pMeta = JSON.parse(participant.metadata);
            } catch (e) {
              console.error("Lỗi parse metadata của participant", e);
            }
          }

          if (pMeta.status === "waiting") {
            pMeta.status = "joined";
            return this.livekitRoomService.updateParticipant(
              meetingCode,
              participant.identity,
              JSON.stringify(pMeta),
              {
                canPublish: true,
                canSubscribe: true,
                canPublishData: true,
                canUpdateMetadata: true,
              },
            );
          }
        });

        await Promise.all(approvePromises);
      } else {
        // Logic duyệt 1 người dùng cũ
        const participant = await this.livekitRoomService.getParticipant(
          meetingCode,
          participantIdentity,
        );

        let currentMeta = {};
        if (participant.metadata) {
          currentMeta = JSON.parse(participant.metadata);
        }

        // Mở lại toàn bộ quyền cho người dùng
        await this.livekitRoomService.updateParticipant(
          meetingCode,
          participantIdentity,
          JSON.stringify({ ...currentMeta, status: "joined" }), // Update metadata thành "joined"
          {
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
            canUpdateMetadata: true,
          },
        );
      }
    } catch (error) {
      throw new AppException(ErrorCode.APPROVE_PARTICIPANT_FAILED);
    }
  }

  /**
   * Cập nhật cấu hình: Ai có quyền duyệt người từ phòng chờ
   * @param permission "admin_only" | "member_and_admin" | "everyone"
   */
  async updateApprovalPermission(
    meetingCode: string,
    permission: "admin_only" | "member_and_admin" | "everyone",
  ) {
    if (!this.livekitRoomService) {
      throw new AppException(ErrorCode.SERVER_ERROR);
    }

    try {
      const rooms = await this.livekitRoomService.listRooms([meetingCode]);
      let currentMeta = {};

      if (rooms && rooms.length > 0 && rooms[0].metadata) {
        try {
          currentMeta = JSON.parse(rooms[0].metadata);
        } catch (e) {
          console.error("Lỗi parse metadata phòng", e);
        }
      }

      // Gộp thuộc tính quyền duyệt mới vào metadata cũ
      const metadataString = JSON.stringify({
        ...currentMeta,
        approvalPermission: permission,
      });

      await this.livekitRoomService.updateRoomMetadata(
        meetingCode,
        metadataString,
      );
    } catch (error) {
      throw new AppException(ErrorCode.APPROVAL_PERMISSION_UPDATE_FAILED);
    }
  }

  /**
   * Xin cấp quyền chia sẻ màn hình (Dynamic Permission)
   * Chặn nếu đã có người khác đang chia sẻ
   */
  async requestScreenShare(
    meetingCode: string,
    identity: string,
  ): Promise<void> {
    if (!this.livekitRoomService) {
      throw new AppException(ErrorCode.SERVER_ERROR);
    }

    const participants =
      await this.livekitRoomService.listParticipants(meetingCode);

    const participant = participants.find((p) => p.identity === identity);
    if (!participant) {
      throw new AppException(ErrorCode.PARTICIPANT_NOT_IN_MEETING);
    }

    // Tìm xem có ai ĐÃ ĐƯỢC CẤP QUYỀN chia sẻ màn hình chưa (ngoại trừ chính mình)
    const isSomeoneSharing = participants.some(
      (p) =>
        p.permission?.canPublishSources?.includes(TrackSource.SCREEN_SHARE) &&
        p.identity !== identity,
    );

    if (isSomeoneSharing) {
      throw new AppException(ErrorCode.SCREEN_SHARE_ALREADY_ACTIVE);
    }

    await this.livekitRoomService.updateParticipant(
      meetingCode,
      identity,
      participant.metadata, // Giữ nguyên tên, avatar, role...
      {
        canPublish: participant.permission?.canPublish,
        canSubscribe: participant.permission?.canSubscribe,
        canPublishData: participant.permission?.canPublishData,
        canUpdateMetadata: participant.permission?.canUpdateMetadata,
        canPublishSources: [
          TrackSource.CAMERA,
          TrackSource.MICROPHONE,
          TrackSource.SCREEN_SHARE,
        ],
      },
    );
  }

  /**
   * Thu hồi quyền chia sẻ màn hình
   */
  async revokeScreenShare(
    meetingCode: string,
    identity: string,
  ): Promise<void> {
    if (!this.livekitRoomService) return;

    try {
      const participant = await this.livekitRoomService.getParticipant(
        meetingCode,
        identity,
      );

      // Thu hồi quyền, trả người dùng về trạng thái mặc định ban đầu
      await this.livekitRoomService.updateParticipant(
        meetingCode,
        identity,
        participant.metadata,
        {
          canPublish: participant.permission?.canPublish,
          canSubscribe: participant.permission?.canSubscribe,
          canPublishData: participant.permission?.canPublishData,
          canUpdateMetadata: participant.permission?.canUpdateMetadata,
          canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE],
        },
      );
    } catch (error) {
      console.log(
        `Lỗi khi thu hồi quyền share màn hình của ${identity}:`,
        error,
      );
    }
  }




  /**
   * Kiểm tra xem một người dùng có phải là thành viên chính thức của phòng hay không
   * (Dựa vào mã cuộc họp meetingCode)
   * Phục vụ việc chuyển hướng (Redirect) khi rời phòng hoặc phòng đã kết thúc.
   */
  async getMemberStatus(
    meetingCode: string,
    userId: string,
  ): Promise<RoomMemberStatus> {
    const meeting = await this.meetingModel.findOne({ meetingCode }).exec();

    if (!meeting) {
      return { isMember: false, roomId: null };
    }

    const room = await this.roomModel.findById(meeting.roomId).exec();

    if (!room) {
      return { isMember: false, roomId: null };
    }

    const userInRoom = room.members.find(
      (m) => m.userId === userId && m.status === "active",
    );
    const isMember = !!userInRoom;

    return {
      isMember,
      roomId: isMember ? meeting.roomId : undefined,
    };
  }

  /**
   * Sinh presigned url upload cho meeting chat
   */
  async generatePresignedUrl(
    originalFileName: string,
    meetingCode: string,
  ): Promise<PresignedUploadResponse> {
    try {
      // Chống trùng lặp tên file (Thêm timestamp và chuỗi ngẫu nhiên)
      const fileExtension = originalFileName.includes(".")
        ? originalFileName.split(".").pop()
        : "bin";
      const safeName = originalFileName
        .replace(/[^a-zA-Z0-9]/g, "_")
        .substring(0, 20);
      const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${safeName}.${fileExtension}`;

      // Phân loại theo meeting code
      const filePath = `${meetingCode}/${uniqueFileName}`;

      // Gọi hàm tạo URL upload tạm thời (Hết hạn sau 60 giây)
      const { data, error } = await this.supabaseService.admin.storage
        .from(this.BUCKET_NAME)
        .createSignedUploadUrl(filePath);

      if (error) {
        console.error("Supabase Storage Error:", error);
        throw new AppException(ErrorCode.SERVER_ERROR);
      }

      // Lấy Public URL để lưu vào database
      const { data: publicUrlData } = this.supabaseService.admin.storage
        .from(this.BUCKET_NAME)
        .getPublicUrl(filePath);

      return {
        presignedUrl: data.signedUrl,
        publicUrl: publicUrlData.publicUrl,
      };
    } catch (error) {
      console.error(error);
      throw new AppException(ErrorCode.SERVER_ERROR);
    }
  }

  /**
   * Lấy trạng thái cuộc họp hiện tại của một kênh
   * (Nâng cấp: Xác thực trạng thái thực tế trực tiếp từ LiveKit)
   */
  async getActiveMeeting(roomId: string, channelId: string) {
    const meeting = await this.meetingModel
      .findOne({
        roomId,
        channelId,
      })
      .exec();

    if (!meeting) {
      return {
        isOngoing: false,
        meetingCode: null,
        hostId: null,
      };
    }

    const livekitRoom = await this.isRoomActive(meeting.meetingCode);
    let isActuallyOngoing = false;

    if (livekitRoom) {
      const humanCount = await this.getHumanParticipantsCount(meeting.meetingCode);
      if (humanCount > 0) {
        isActuallyOngoing = true;
      } else {
        // Phòng tồn tại trên LiveKit nhưng không có người: đóng session và xoá phòng
        await this.endMeetingByCode(meeting.meetingCode);
        await this.forceDeleteLiveKitRoom(meeting.meetingCode);
      }
    } else {
      // Không có phòng LiveKit, nếu session vẫn còn ongoing thì đóng lại
      const ongoingSession = await this.sessionModel.findOne({
        meetingCode: meeting.meetingCode,
        status: "ongoing",
      });
      if (ongoingSession) {
        await this.endMeetingByCode(meeting.meetingCode);
      }
    }

    return {
      isOngoing: isActuallyOngoing,
      meetingCode: meeting.meetingCode,
    };
  }

  /**
   * Xoá người dùng ra khỏi cuộc họp
   */
  async removeParticipant(meetingCode: string, participantIdentity: string) {
    if (!this.livekitRoomService) {
      console.error("LiveKit Admin Client chưa được cấu hình");
      throw new AppException(ErrorCode.SERVER_ERROR);
    }

    try {
      await this.livekitRoomService.removeParticipant(
        meetingCode,
        participantIdentity,
      );

      this.eventEmitter.emit("notification.participant_removed", {
        userId: participantIdentity, // Gửi thông báo cho người bị xoá
        metadata: {
          meetingCode: meetingCode,
        },
      });
    } catch (error) {
      console.error("Lỗi khi kick:", error);
      throw new AppException(ErrorCode.REMOVE_PARTICIPANT_FAILED);
    }
  }

  /**
   * Ép LiveKit xóa phòng ngay lập tức không cần đợi Timeout
   */
  async forceDeleteLiveKitRoom(meetingCode: string) {
    if (!this.livekitRoomService) return;
    try {
      await this.livekitRoomService.deleteRoom(meetingCode);
    } catch (error) {
      console.error(
        `Không thể xóa phòng ${meetingCode} (có thể đã tự xóa):`,
        error,
      );
    }
  }

  /**
   * Kiểm tra thực tế số người trong phòng, nếu bằng 0 thì ép xóa, bỏ qua nếu là phòng breakout
   */
  async checkAndCloseEmptyRoom(meetingCode: string) {
    if (!this.livekitRoomService) return;

    try {
      // Lấy thông tin phòng để kiểm tra metadata trước
      const rooms = await this.livekitRoomService.listRooms([meetingCode]);
      if (rooms && rooms.length > 0) {
        const room = rooms[0];

        let isBreakoutRoom = false;
        let hasActiveBreakoutSession = false;

        if (room.metadata) {
          try {
            const meta: LivekitRoomMetadata = JSON.parse(room.metadata);
            if (meta.roomType === "breakout") {
              isBreakoutRoom = true;
            } else if (meta.breakoutSession?.status === "active") {
              hasActiveBreakoutSession = true;
            }
          } catch (e) {
            console.error("Lỗi parse metadata phòng khi check empty:", e);
          }
        }

        // Bỏ qua việc tự động đóng nếu là phòng breakout
        if (isBreakoutRoom) {
          console.log(
            `Bỏ qua tự động dọn dẹp cho phòng breakout: ${meetingCode}`,
          );
          return;
        }

        if (hasActiveBreakoutSession) {
          console.log(
            `Bỏ qua tự động dọn dẹp phòng chính ${meetingCode} vì đang có người trong breakout.`,
          );
          return;
        }
      }

      const participants =
        await this.livekitRoomService.listParticipants(meetingCode);

      const humanParticipants = participants.filter((p) => {
        const id = p.identity || "";
        const name = p.name || "";
        return (
          !id.startsWith("EG_") &&
          !id.startsWith("agent-") &&
          !id.includes("stt-transcriber") &&
          !name.includes("stt-transcriber") &&
          (p as any).kind !== 2 &&
          !(p as any).isAgent
        );
      });

      if (humanParticipants.length === 0) {
        await this.endMeetingByCode(meetingCode);
        await this.forceDeleteLiveKitRoom(meetingCode);
      }
    } catch (error) {
      console.log(`Phòng ${meetingCode} có thể đã được dọn dẹp.`, error);
      // Đảm bảo session trong DB được đóng lại ngay cả khi LiveKit đã xóa phòng trước
      await this.endMeetingByCode(meetingCode);
    }
  }

  /**
   * Bật tắt chat trong cuộc họp
   */
  async toggleRoomChat(meetingCode: string, isChatEnabled: boolean) {
    if (!this.livekitRoomService) {
      throw new AppException(ErrorCode.SERVER_ERROR);
    }

    try {
      const rooms = await this.livekitRoomService.listRooms([meetingCode]);
      let currentMeta = {};

      if (rooms && rooms.length > 0 && rooms[0].metadata) {
        try {
          currentMeta = JSON.parse(rooms[0].metadata);
        } catch (e) {
          console.error("Lỗi parse metadata phòng", e);
        }
      }

      const metadataString = JSON.stringify({ ...currentMeta, isChatEnabled });

      await this.livekitRoomService.updateRoomMetadata(
        meetingCode,
        metadataString,
      );
    } catch (error) {
      console.error("Lỗi khi cập nhật trạng thái chat:", error);
      throw new AppException(ErrorCode.TOGGLE_CHAT_FAILED);
    }
  }

  /**
   * Tắt Mic hoặc Camera của người dùng
   */
  async muteParticipantTrack(
    meetingCode: string,
    participantIdentity: string,
    trackType: "audio" | "video",
  ) {
    if (!this.livekitRoomService) return;
    try {
      const participant = await this.livekitRoomService.getParticipant(
        meetingCode,
        participantIdentity,
      );
      const targetTrackType =
        trackType === "audio" ? TrackType.AUDIO : TrackType.VIDEO;

      // Tìm track (luồng dữ liệu) tương ứng đang được phát
      const track = participant.tracks.find((t) => t.type === targetTrackType);
      if (track) {
        // Ép tắt track đó
        await this.livekitRoomService.mutePublishedTrack(
          meetingCode,
          participantIdentity,
          track.sid,
          true,
        );
      }
    } catch (error) {
      console.error(`Lỗi khi tắt ${trackType}:`, error);
      throw new AppException(ErrorCode.MUTE_PARTICIPANT_FAILED);
    }
  }

  // utils, helpers

  /**
   * Xác định Role của User trong một Kênh cụ thể
   */
  getUserRoleInChannel(
    room: RoomDocument,
    channelId: string,
    userId: string,
  ): string {
    if (!room) return "guest";

    const channel = room.channels.find(
      (c) => c._id?.toString() === channelId.toString(),
    );
    if (!channel) return "guest";

    const isRoomOwner = room.ownerId === userId;
    const roomMember = room.members.find(
      (m) => m.userId === userId && m.status === "active",
    );
    const channelMember = channel.members?.find((m) => m.userId === userId);

    let userRole = "guest";
    if (isRoomOwner) {
      userRole = "owner";
    } else if (channelMember) {
      userRole = channelMember.role;
    } else if (!channel.isPrivate && roomMember) {
      userRole = roomMember.role;
    }

    return userRole;
  }

  /**
   * Đồng bộ cập nhật Role của người dùng trực tiếp trong cuộc họp đang diễn ra
   */
  async updateParticipantRole(
    roomId: string,
    channelId: string,
    participantIdentity: string,
    newRole: "admin" | "member" | "owner",
  ) {
    if (!this.livekitRoomService) return;

    const meeting = await this.meetingModel
      .findOne({ roomId, channelId })
      .exec();
    if (!meeting) return;
    const hasAdminPowers = newRole === "admin";

    try {
      // Lấy thông tin người dùng từ phòng LiveKit
      const participant = await this.livekitRoomService.getParticipant(
        meeting.meetingCode,
        participantIdentity,
      );

      // Nếu người dùng đang có mặt trong phòng, tiến hành cập nhật Metadata
      if (participant && participant.metadata) {
        const meta: ParticipantMetadata = JSON.parse(participant.metadata);

        // Cập nhật role mới
        meta.role = newRole;
        meta.hasAdminPowers = hasAdminPowers;

        // Ghi đè lại Metadata lên LiveKit Server
        await this.livekitRoomService.updateParticipant(
          meeting.meetingCode,
          participantIdentity,
          JSON.stringify(meta),
        );
      }
    } catch (error) {
      // Bỏ qua lỗi nếu người dùng không có mặt trong phòng lúc này
      console.log(
        `Người dùng ${participantIdentity} không trực tuyến trong phòng họp. ${error}`,
      );
    }
  }

  async endMeetingByCode(meetingCode: string) {
    const meeting = await this.meetingModel.findOne({
      meetingCode,
    });

    if (meeting) {
      // Đóng Session hiện tại (vô hiệu hoá lời mời)
      await this.sessionModel.updateMany(
        { meetingCode, status: "ongoing" },
        { $set: { status: "ended", endedAt: new Date() } },
      );

      // Cập nhật trạng thái cuộc họp mới cho tất cả người dùng đang ở kênh này
      this.meetingsGateway.notifyMeetingStatus(meeting.channelId, {
        isOngoing: false,
        meetingCode: meeting.meetingCode,
      });
    }
  }

  /**
   * Đếm số lượng người dùng thực tế trong phòng (loại trừ các agent bot/egress)
   */
  async getHumanParticipantsCount(meetingCode: string): Promise<number> {
    if (!this.livekitRoomService) return 0;
    try {
      const participants = await this.livekitRoomService.listParticipants(meetingCode);
      const humanParticipants = participants.filter((p) => {
        const id = p.identity || '';
        const name = p.name || '';
        return (
          !id.startsWith('EG_') &&
          !id.startsWith('agent-') &&
          !id.includes(this.STT_AGENT_NAME) &&
          !name.includes(this.STT_AGENT_NAME) &&
          (p as any).kind !== 2 &&
          !(p as any).isAgent
        );
      });
      return humanParticipants.length;
    } catch {
      return 0;
    }
  }

  async isRoomActive(meetingCode: string): Promise<LiveKitRoom | null> {
    if (this.livekitRoomService) {
      try {
        const rooms = await this.livekitRoomService.listRooms([meetingCode]);

        // Trả về object phòng của LiveKit để tái sử dụng metadata, tránh gọi 2 lần
        if (rooms && rooms.length > 0) {
          return rooms[0];
        }
      } catch (error) {
        console.log("Lỗi kiểm tra phòng LiveKit:", error);
      }
    }
    return null;
  }

  /**
   * Lấy danh sách các session của 1 meetingCode có phân trang
   */
  async getMeetingSessions(
    meetingCode: string,
    cursor?: string,
    limit: number = 50,
  ): Promise<PageResponse<MeetingSessionResponse>> {
    if (!meetingCode || !meetingCode.trim()) {
      return {
        items: [],
        nextCursor: null,
        hasNext: false,
        limit,
      };
    }

    const cleanCode = meetingCode.trim();
    const filter: Record<string, any> = { meetingCode: cleanCode };

    if (cursor && Types.ObjectId.isValid(cursor)) {
      filter._id = { $lt: new Types.ObjectId(cursor) };
    }

    // Query limit + 1 phần tử để kiểm tra hasNext mà không cần countDocuments
    const sessions = await this.sessionModel
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean()
      .exec();

    const hasNext = sessions.length > limit;
    const pagedSessions = hasNext ? sessions.slice(0, limit) : sessions;
    const sessionIds = pagedSessions.map((s: any) => s._id.toString());

    // Đếm số người tham gia (attendance) cho từng session trong trang hiện tại
    const participantCountsMap = new Map<string, number>();
    if (sessionIds.length > 0) {
      try {
        const counts = await this.attendanceModel.aggregate([
          { $match: { sessionId: { $in: sessionIds } } },
          { $group: { _id: "$sessionId", count: { $sum: 1 } } },
        ]);
        counts.forEach((c) => {
          participantCountsMap.set(c._id.toString(), c.count);
        });
      } catch (e) {
        console.error("Lỗi khi lấy số lượng người tham gia:", e);
      }
    }

    const items: MeetingSessionResponse[] = pagedSessions.map((doc: any) => {
      const started = doc.startedAt
        ? new Date(doc.startedAt)
        : doc.createdAt
          ? new Date(doc.createdAt)
          : new Date();
      let durationSeconds = 0;
      if (doc.endedAt) {
        durationSeconds = Math.max(
          0,
          Math.floor(
            (new Date(doc.endedAt).getTime() - started.getTime()) / 1000,
          ),
        );
      } else if (doc.status === "ongoing") {
        durationSeconds = Math.max(
          0,
          Math.floor((Date.now() - started.getTime()) / 1000),
        );
      }

      return {
        _id: doc._id.toString(),
        meetingCode: doc.meetingCode,
        status: doc.status as "ongoing" | "ended",
        sessionFolder: doc.sessionFolder,
        recordings: doc.recordings || [],
        startedAt: doc.startedAt || doc.createdAt,
        endedAt: doc.endedAt,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        durationSeconds,
        totalParticipants: participantCountsMap.get(doc._id.toString()) || 0,
      };
    });

    const nextCursor =
      hasNext && items.length > 0 ? items[items.length - 1]._id : null;

    return {
      items,
      nextCursor,
      hasNext,
      limit,
    };
  }
}


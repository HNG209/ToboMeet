import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { User, UserDocument } from "../users/schemas/user.schema";
import { Meeting, MeetingDocument } from "./schemas/meeting.schema";
import {
  AccessToken,
  DataPacket_Kind,
  RoomServiceClient,
  TrackSource,
} from "livekit-server-sdk";
import { isLoadTestMode, createMockLiveKitProxy } from "./utils/mock-livekit.util";
import { AppException } from "../core/exceptions/app.exception";
import {
  BreakoutRoomMetadata,
  ErrorCode,
  LivekitBreakoutRoom,
  LivekitRoomMetadata,
  MeetingJoinResponse,
  ParticipantMetadata,
} from "@tobomeet/shared/types";
import { MeetingsService } from "./meetings.service";
import { CreateBreakoutRoomDto } from "./dtos/create-breakout-room.dto";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";

@Injectable()
export class BreakoutRoomsService {
  private livekitRoomService: RoomServiceClient;

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Meeting.name) private meetingModel: Model<MeetingDocument>,
    @InjectQueue("meeting") private meetingQueue: Queue,
    private meetingsService: MeetingsService,
  ) {
    const livekitHost = process.env.LIVEKIT_API_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (isLoadTestMode()) {
      this.livekitRoomService = createMockLiveKitProxy<RoomServiceClient>("BreakoutRoomsService");
    } else if (livekitHost && apiKey && apiSecret) {
      this.livekitRoomService = new RoomServiceClient(
        livekitHost,
        apiKey,
        apiSecret,
      );
    }
  }

  private async clearBreakoutJob(meetingCode: string) {
    try {
      const jobId = `breakout-timer-${meetingCode}`;
      const job = await this.meetingQueue.getJob(jobId);
      if (job) {
        await job.remove();
      }
    } catch (error) {
      console.error(`[Breakout] Lỗi khi huỷ delayed job cho ${meetingCode}:`, error);
    }
  }

  /**
   * HOST: Bắt đầu chia phòng Breakout (Eager Init + Auto ID)
   * - Nếu phòng chưa tồn tại → createRoom
   * - Nếu phòng đã tồn tại (kể cả status = closing) → force updateRoomMetadata
   */
  async startBreakoutSession(
    mainMeetingCode: string,
    roomConfigs: CreateBreakoutRoomDto[],
    globalDurationMinutes?: number,
  ) {
    if (!this.livekitRoomService)
      throw new AppException(ErrorCode.SERVER_ERROR);

    try {
      const sessionStartedAt = Date.now();

      if (mainMeetingCode.includes("_sub_")) return;

      const livekitRooms = await this.livekitRoomService.listRooms([
        mainMeetingCode,
      ]);
      let currentMeta: LivekitRoomMetadata = {} as LivekitRoomMetadata;

      if (livekitRooms?.length > 0 && livekitRooms[0].metadata) {
        try {
          currentMeta = JSON.parse(livekitRooms[0].metadata);
        } catch (e) {
          console.error("Lỗi parse metadata phòng chính", e);
        }
      }

      // Chỉ xử lý cho phòng chính (chặn tạo breakout từ bên trong breakout room)
      if (currentMeta.roomType === "breakout") return;

      // Map config → cấu trúc nội bộ có ID tự tăng. Thời gian là dùng chung cho tất cả các phòng
      const breakoutRooms: LivekitBreakoutRoom[] = roomConfigs.map(
        (config, index) => {
          return {
            id: `sub_${index + 1}`,
            name: config.name,
            maxParticipants: config.maxParticipants || 0,
            durationMinutes: globalDurationMinutes || 0,
            assignedUsers: config.assignedUsers,
          };
        },
      );

      // Tạo / cập nhật từng phòng breakout
      const upsertRoomPromises = breakoutRooms.map(async (room) => {
        const fullSubRoomId = `${mainMeetingCode}_${room.id}`;

        // metadata cho từng phòng breakout
        const newMetadata = JSON.stringify({
          roomName: room.name,
          roomType: "breakout",
          parentRoom: mainMeetingCode,
          parentMetadata: currentMeta,
          durationMinutes: room.durationMinutes,
          startedAt: sessionStartedAt,
          status: "active",
          assignedUsers: room.assignedUsers,
        } as BreakoutRoomMetadata);

        try {
          // Kiểm tra phòng đã tồn tại chưa
          const existing = await this.livekitRoomService.listRooms([
            fullSubRoomId,
          ]);

          if (existing.length > 0) {
            // Phòng đã tồn tại → ghi đè metadata (quan trọng khi status cũ = closing)
            await this.livekitRoomService.updateRoomMetadata(
              fullSubRoomId,
              newMetadata,
            );
          } else {
            // Phòng chưa tồn tại → tạo mới
            await this.livekitRoomService.createRoom({
              name: fullSubRoomId,
              emptyTimeout: 10 * 60,
              departureTimeout: 10 * 60,
              maxParticipants: room.maxParticipants,
              metadata: newMetadata,
            });
          }
        } catch (error) {
          // Fallback an toàn: dù list/create lỗi vẫn cố update metadata
          console.error(
            `Lỗi khi upsert phòng breakout ${fullSubRoomId}, thử force update metadata:`,
            error,
          );
          try {
            await this.livekitRoomService.updateRoomMetadata(
              fullSubRoomId,
              newMetadata,
            );
          } catch (updateErr) {
            console.error(
              `Không thể update metadata cho ${fullSubRoomId}:`,
              updateErr,
            );
          }
        }
      });

      await Promise.all(upsertRoomPromises);

      // Cập nhật metadata phòng chính
      const metadataString = JSON.stringify({
        ...currentMeta,
        breakoutSession: {
          status: "active",
          rooms: breakoutRooms,
          startedAt: sessionStartedAt,
        },
      } as LivekitRoomMetadata);

      await this.livekitRoomService.updateRoomMetadata(
        mainMeetingCode,
        metadataString,
      );

      // ===== Gửi tín hiệu join cho người được chỉ định =====
      for (const config of roomConfigs) {
        if (config.assignedUsers && config.assignedUsers.length > 0) {
          // Tìm ID phòng phụ tương ứng (vd: sub_1)
          const assignedRoom = breakoutRooms.find(
            (r) => r.name === config.name,
          );

          if (assignedRoom) {
            const payload = JSON.stringify({
              id: Date.now().toString(),
              type: "SYSTEM",
              command: "FORCE_JOIN_BREAKOUT",
              breakoutRoomId: assignedRoom.id,
              targetUsers: config.assignedUsers,
              timestamp: Date.now(),
            });

            const encoder = new TextEncoder();
            const data = encoder.encode(payload);

            try {
              await this.livekitRoomService.sendData(
                mainMeetingCode,
                data,
                DataPacket_Kind.RELIABLE,
              );
            } catch (err) {
              console.error("Lỗi khi bắn tín hiệu auto-join:", err);
            }
          }
        }
      }

      // ===== Tự động đóng phòng khi hết giờ bằng BullMQ Delay Queue =====
      await this.clearBreakoutJob(mainMeetingCode);

      if (globalDurationMinutes && globalDurationMinutes > 0) {
        const delayMs = globalDurationMinutes * 60 * 1000;

        await this.meetingQueue.add(
          "auto-end-breakout",
          {
            mainMeetingCode,
            sessionStartedAt,
          },
          {
            jobId: `breakout-timer-${mainMeetingCode}`,
            delay: delayMs,
            removeOnComplete: true,
            removeOnFail: true,
          },
        );
      }
    } catch (error) {
      throw new AppException(ErrorCode.START_BREAKOUT_FAILED);
    }
  }

  /**
   * BULLMQ WORKER: Tự động kết thúc phiên Breakout khi hết globalDurationMinutes
   */
  async handleAutoEndBreakout(
    mainMeetingCode: string,
    sessionStartedAt: number,
  ) {
    if (!this.livekitRoomService) return;

    try {
      const mainRooms = await this.livekitRoomService.listRooms([
        mainMeetingCode,
      ]);
      if (mainRooms.length === 0 || !mainRooms[0].metadata) return;

      let currentMeta: LivekitRoomMetadata = {} as LivekitRoomMetadata;
      try {
        currentMeta = JSON.parse(mainRooms[0].metadata);
      } catch (e) {
        console.error(
          `[Breakout] Lỗi parse metadata phòng chính ${mainMeetingCode}:`,
          e,
        );
        return;
      }

      if (currentMeta.roomType === "breakout") return;

      // Kiểm tra xem session có đang chạy và đúng phiên đã lên lịch không
      if (!currentMeta.breakoutSession) {
        return;
      }

      if (
        sessionStartedAt &&
        currentMeta.breakoutSession.startedAt &&
        currentMeta.breakoutSession.startedAt !== sessionStartedAt
      ) {
        return;
      }

      const breakoutRooms = currentMeta.breakoutSession.rooms || [];

      // Xóa trạng thái breakout ở phòng chính
      delete currentMeta.breakoutSession;
      await this.livekitRoomService.updateRoomMetadata(
        mainMeetingCode,
        JSON.stringify(currentMeta),
      );

      // Gửi tín hiệu 'closing' vào các phòng phụ
      for (const room of breakoutRooms) {
        const fullSubRoomId = `${mainMeetingCode}_${room.id}`;
        try {
          const subRooms = await this.livekitRoomService.listRooms([
            fullSubRoomId,
          ]);
          if (subRooms.length > 0) {
            const subMeta = subRooms[0].metadata
              ? JSON.parse(subRooms[0].metadata)
              : {};
            subMeta.status = "closing";

            await this.livekitRoomService.updateRoomMetadata(
              fullSubRoomId,
              JSON.stringify(subMeta),
            );
          }
        } catch (e) {
          console.error(
            `[Breakout] Lỗi khi đóng phòng phụ ${fullSubRoomId}:`,
            e,
          );
        }
      }
    } catch (error) {
      console.error(
        `[Breakout] Lỗi khi xử lý auto-end breakout cho ${mainMeetingCode}:`,
        error,
      );
    }
  }

  /**
   * HOST: Kết thúc phiên Breakout
   * Xoá trạng thái breakout ở phòng chính và gửi tín hiệu 'closing' vào các phòng phụ
   */
  async endBreakoutSession(mainMeetingCode: string) {
    if (!this.livekitRoomService) return;

    try {
      await this.clearBreakoutJob(mainMeetingCode);
      // BƯỚC A: Cập nhật Metadata phòng chính về lại bình thường
      const mainRooms = await this.livekitRoomService.listRooms([
        mainMeetingCode,
      ]);
      let currentMeta: LivekitRoomMetadata = {} as LivekitRoomMetadata;

      if (mainRooms.length > 0 && mainRooms[0].metadata) {
        currentMeta = JSON.parse(mainRooms[0].metadata);
      }

      // Chỉ xử lý cho main room
      if (currentMeta.roomType === "breakout") return;

      // Lưu lại danh sách phòng để gửi tín hiệu đóng
      const breakoutRooms = currentMeta.breakoutSession?.rooms || [];

      // Xóa thông tin breakout khỏi metadata
      delete currentMeta.breakoutSession;
      await this.livekitRoomService.updateRoomMetadata(
        mainMeetingCode,
        JSON.stringify(currentMeta),
      );

      // BƯỚC B: Phát tín hiệu 'closing' cho toàn bộ phòng phụ
      // Để Client của user ở phòng phụ bắt được sự kiện và gọi API thoát
      for (const room of breakoutRooms) {
        const fullSubRoomId = `${mainMeetingCode}_${room.id}`;

        try {
          const subRooms = await this.livekitRoomService.listRooms([
            fullSubRoomId,
          ]);
          if (subRooms.length > 0) {
            const subMeta = subRooms[0].metadata
              ? JSON.parse(subRooms[0].metadata)
              : {};
            subMeta.status = "closing"; // Bắn tín hiệu đóng

            await this.livekitRoomService.updateRoomMetadata(
              fullSubRoomId,
              JSON.stringify(subMeta),
            );
          }
        } catch (e) {
          // Bỏ qua nếu phòng phụ đã trống và tự giải tán
          console.log(e);
        }
      }
    } catch (error) {
      console.log(error);
      throw new AppException(ErrorCode.END_BREAKOUT_FAILED);
    }
  }

  /**
   * HOST: Thêm / gán người dùng vào phòng Breakout đang hoạt động
   */
  async assignUsersToBreakout(
    mainMeetingCode: string,
    breakoutRoomId: string,
    userIds: string[],
  ) {
    if (!this.livekitRoomService)
      throw new AppException(ErrorCode.SERVER_ERROR);

    if (!userIds || userIds.length === 0) return { success: true };

    try {
      // 1. Lấy metadata của phòng chính
      const mainRooms = await this.livekitRoomService.listRooms([
        mainMeetingCode,
      ]);
      if (mainRooms.length === 0 || !mainRooms[0].metadata) {
        throw new AppException(ErrorCode.MAIN_ROOM_NOT_ACTIVE);
      }

      let mainMeta: LivekitRoomMetadata;
      try {
        mainMeta = JSON.parse(mainRooms[0].metadata);
      } catch (e) {
        throw new AppException(ErrorCode.BREAKOUT_ROOM_DATA_INVALID);
      }

      if (
        mainMeta.roomType !== "main" ||
        !mainMeta.breakoutSession ||
        mainMeta.breakoutSession.status !== "active"
      ) {
        throw new AppException(ErrorCode.BREAKOUT_ROOM_NOT_ACTIVE);
      }

      // 2. Tìm phòng breakout tương ứng trong metadata phòng chính
      const targetRoom = mainMeta.breakoutSession.rooms.find(
        (r) => r.id === breakoutRoomId,
      );

      if (!targetRoom) {
        throw new AppException(ErrorCode.BREAKOUT_ROOM_NOT_FOUND_OR_CLOSED);
      }

      // CHẶN: Nếu phòng ở chế độ tự do chọn (assignedUsers không phải là mảng) thì không được gán
      if (!Array.isArray(targetRoom.assignedUsers)) {
        throw new AppException(ErrorCode.BREAKOUT_ROOM_FREE_TO_CHOOSE);
      }

      // Loại bỏ Chủ phòng (owner) và Phó phòng (admin) ra khỏi danh sách gán vì họ có quyền vào tự do
      const meeting = await this.meetingModel
        .findOne({ meetingCode: mainMeetingCode })
        .lean();
      let validUserIds = userIds;
      if (meeting) {
        const roleChecks = await Promise.all(
          userIds.map(async (id) => {
            const { hasAdminPowers } =
              await this.meetingsService.resolveParticipantRole(
                meeting as any,
                id,
              );
            return { id, hasAdminPowers };
          }),
        );
        validUserIds = roleChecks
          .filter((item) => !item.hasAdminPowers)
          .map((item) => item.id);
      }

      if (validUserIds.length === 0) {
        return {
          success: true,
          breakoutRoomId,
          assignedUsers: targetRoom.assignedUsers,
        };
      }

      const existingAssigned = targetRoom.assignedUsers;
      const newAssignedUsers = Array.from(
        new Set([...existingAssigned, ...validUserIds]),
      );
      targetRoom.assignedUsers = newAssignedUsers;

      // Cập nhật lại metadata phòng chính
      await this.livekitRoomService.updateRoomMetadata(
        mainMeetingCode,
        JSON.stringify(mainMeta),
      );

      // 3. Cập nhật metadata của phòng phụ
      const fullSubRoomId = `${mainMeetingCode}_${breakoutRoomId}`;
      try {
        const subRooms = await this.livekitRoomService.listRooms([
          fullSubRoomId,
        ]);
        if (subRooms.length > 0 && subRooms[0].metadata) {
          const subMeta: BreakoutRoomMetadata = JSON.parse(
            subRooms[0].metadata,
          );
          subMeta.assignedUsers = newAssignedUsers;
          await this.livekitRoomService.updateRoomMetadata(
            fullSubRoomId,
            JSON.stringify(subMeta),
          );
        }
      } catch (err) {
        console.error(
          `Lỗi khi cập nhật metadata cho phòng phụ ${fullSubRoomId}:`,
          err,
        );
      }

      // 4. Phát tín hiệu FORCE_JOIN_BREAKOUT qua DataChannel của phòng chính
      const payload = JSON.stringify({
        id: Date.now().toString(),
        type: "SYSTEM",
        command: "FORCE_JOIN_BREAKOUT",
        breakoutRoomId: breakoutRoomId,
        targetUsers: userIds,
        timestamp: Date.now(),
      });

      const encoder = new TextEncoder();
      const data = encoder.encode(payload);

      try {
        await this.livekitRoomService.sendData(
          mainMeetingCode,
          data,
          DataPacket_Kind.RELIABLE,
        );
      } catch (err) {
        console.error("Lỗi khi bắn tín hiệu auto-join cho user mới:", err);
      }

      return {
        success: true,
        breakoutRoomId,
        assignedUsers: newAssignedUsers,
      };
    } catch (error) {
      if (error instanceof AppException) throw error;
      console.error("Lỗi khi gán người dùng vào breakout:", error);
      throw new AppException(ErrorCode.START_BREAKOUT_FAILED);
    }
  }

  /**
   * PARTICIPANT: Tham gia vào Breakout Room
   * Kiểm tra tính hợp lệ của phòng breakout, check quyền và cấp Token
   */
  async joinBreakoutRoom(
    mainMeetingCode: string,
    breakoutRoomId: string,
    userId: string,
    deviceId: string,
  ) {
    if (!this.livekitRoomService)
      throw new AppException(ErrorCode.SERVER_ERROR);

    const fullBreakoutRoomName = `${mainMeetingCode}_${breakoutRoomId}`;

    // Xác định quyền Chủ phòng (owner) / Phó phòng (admin) theo phòng chính (cả personal và channel)
    const mainMeeting = await this.meetingModel
      .findOne({ meetingCode: mainMeetingCode })
      .lean();
    const { role, hasAdminPowers } = mainMeeting
      ? await this.meetingsService.resolveParticipantRole(
          mainMeeting as any,
          userId,
        )
      : { role: "guest", hasAdminPowers: false };

    // ==========================================
    // BƯỚC 1: KIỂM TRA TÍNH HỢP LỆ CỦA PHÒNG BREAKOUT
    // ==========================================
    try {
      const subRooms = await this.livekitRoomService.listRooms([
        fullBreakoutRoomName,
      ]);

      if (subRooms.length === 0) {
        throw new AppException(
          ErrorCode.BREAKOUT_ROOM_NOT_FOUND_OR_CLOSED,
        );
      }

      if (subRooms[0].metadata) {
        const meta: LivekitRoomMetadata = JSON.parse(subRooms[0].metadata);

        // Kiểm tra chắc chắn đây là phòng breakout
        if (meta.roomType !== "breakout") {
          throw new AppException(
            ErrorCode.INVALID_BREAKOUT_ROOM,
          );
        }

        // (Tuỳ chọn) Kiểm tra thêm trạng thái phòng có đang active không
        if (meta.status !== "active") {
          throw new AppException(
            ErrorCode.BREAKOUT_ROOM_NOT_ACTIVE,
          );
        }

        // KIỂM TRA QUYỀN: Nếu có cấu hình assignedUsers (auto/manual),
        // cho phép người được gán HOẶC Chủ phòng (owner) / Phó phòng (admin) vào thoải mái không cần phân công trước
        const breakoutMeta = meta as BreakoutRoomMetadata;
        if (Array.isArray(breakoutMeta.assignedUsers)) {
          const isAssigned = breakoutMeta.assignedUsers.includes(userId);
          if (!isAssigned && !hasAdminPowers) {
            throw new AppException(
              ErrorCode.NOT_ASSIGNED_TO_BREAKOUT_ROOM,
            );
          }
        }
      } else {
        throw new AppException(ErrorCode.BREAKOUT_ROOM_DATA_INVALID);
      }
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw new AppException(ErrorCode.SERVER_ERROR);
    }

    // ==========================================
    // BƯỚC 2: KIỂM TRA NGƯỜI DÙNG CÓ Ở PHÒNG CHÍNH KHÔNG
    // ==========================================
    try {
      const participants =
        await this.livekitRoomService.listParticipants(mainMeetingCode);
      const isActuallyInMainRoom = participants.some(
        (p) => p.identity === userId,
      );

      if (!isActuallyInMainRoom) {
        throw new AppException(
          ErrorCode.MUST_BE_IN_MAIN_ROOM,
        );
      }
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw new AppException(ErrorCode.MAIN_ROOM_NOT_ACTIVE);
    }

    // ==========================================
    // BƯỚC 3: CẤP TOKEN VÀO PHÒNG
    // ==========================================
    const user = await this.userModel.findOne({ supabaseId: userId }).exec();
    const finalDisplayName = user?.displayName || "Người dùng ẩn danh";
    const avatarUrl = user?.avatarUrl || "";

    return this.generateBreakoutToken(
      fullBreakoutRoomName,
      userId,
      finalDisplayName,
      avatarUrl,
      deviceId,
      role,
      hasAdminPowers,
    );
  }

  /**
   * PARTICIPANT: Thoát Breakout Room để quay về
   * Nội suy meetingCode của phòng chính từ metadata
   * Chỉ cho trở về phòng chính nếu đang trong phòng breakout
   */
  async returnToMainRoom(
    fullBreakoutRoomName: string,
    userId: string,
    deviceId: string,
  ): Promise<MeetingJoinResponse> {
    if (!this.livekitRoomService)
      throw new AppException(ErrorCode.SERVER_ERROR);

    // Lấy thông tin phòng Breakout hiện tại để tự suy ra Main Room
    let parentRoomCode = "";
    let parentIsE2EE = false;
    try {
      const subRooms = await this.livekitRoomService.listRooms([
        fullBreakoutRoomName,
      ]);
      if (subRooms.length === 0) {
        throw new AppException(
          ErrorCode.BREAKOUT_ROOM_NOT_FOUND_OR_CLOSED,
        );
      }

      if (subRooms[0].metadata) {
        const subMeta: LivekitRoomMetadata = JSON.parse(subRooms[0].metadata);
        if (subMeta.roomType !== "breakout") return;
        parentRoomCode = subMeta.parentRoom;
        parentIsE2EE = Boolean(subMeta.parentMetadata?.isE2EE);
      }

      if (!parentRoomCode) {
        throw new AppException(
          ErrorCode.MAIN_ROOM_INFO_NOT_FOUND,
        );
      }
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw new AppException(ErrorCode.SERVER_ERROR);
    }

    // Xác thực xem User có đang ở trong Breakout này không
    const participants =
      await this.livekitRoomService.listParticipants(fullBreakoutRoomName);
    const isActuallyInBreakout = participants.some(
      (p) => p.identity === userId,
    );

    if (!isActuallyInBreakout) {
      throw new AppException(
        ErrorCode.NOT_IN_BREAKOUT_ROOM,
      );
    }

    // Lấy thông tin User & Sinh Token để vào lại Main Room
    const user = await this.userModel.findOne({ supabaseId: userId }).exec();
    const finalDisplayName = user?.displayName || "Người dùng ẩn danh";

    // Sinh token cấp quyền vào lại phòng chính (bỏ qua phòng chờ + đánh dấu quay về từ breakout)
    return this.meetingsService.joinMeeting(
      parentRoomCode,
      userId,
      deviceId,
      finalDisplayName,
      false, // forceSwitch
      false, // allowStart
      true, // skipWaitingRoom
      parentIsE2EE, // isE2EE
      true, // isReturningFromBreakout
    );
  }

  /**
   * Lấy số lượng người tham gia trong từng phòng breakout
   */
  async getBreakoutRoomsParticipantCount(
    mainMeetingCode: string,
  ): Promise<{ counts: Record<string, number>; serverTime: number }> {
    const serverTime = Date.now(); // Lấy giờ chuẩn xác từ Server
    if (!this.livekitRoomService) return { counts: {}, serverTime };

    try {
      // 1. Lấy metadata của phòng chính để biết danh sách các phòng breakout đang mở
      const mainRooms = await this.livekitRoomService.listRooms([
        mainMeetingCode,
      ]);
      if (mainRooms.length === 0 || !mainRooms[0].metadata)
        return { counts: {}, serverTime };

      const currentMeta: LivekitRoomMetadata = JSON.parse(
        mainRooms[0].metadata,
      );

      if (currentMeta.roomType !== "main") return;

      const breakoutRooms: LivekitBreakoutRoom[] =
        currentMeta.breakoutSession?.rooms || [];

      if (breakoutRooms.length === 0) return { counts: {}, serverTime };

      // 2. Tạo mảng tên các phòng phụ (full ID) để truy vấn LiveKit
      const subRoomNames = breakoutRooms.map(
        (room) => `${mainMeetingCode}_${room.id}`,
      );

      // 3. Lấy thông tin các phòng phụ đang hoạt động
      const activeSubRooms =
        await this.livekitRoomService.listRooms(subRoomNames);

      const counts: Record<string, number> = {};

      // Khởi tạo tất cả số lượng ban đầu là 0
      breakoutRooms.forEach((room) => {
        counts[room.id] = 0;
      });

      // Cập nhật số lượng thực tế từ LiveKit trả về
      activeSubRooms.forEach((subRoom) => {
        // Cắt bỏ phần mainMeetingCode_ để lấy lại subRoomId (vd: sub_1)
        const subId = subRoom.name.replace(`${mainMeetingCode}_`, "");
        counts[subId] = subRoom.numParticipants;
      });

      return { counts, serverTime };
    } catch (error) {
      console.error("Lỗi khi đếm số lượng người phòng breakout:", error);
      return { counts: {}, serverTime };
    }
  }

  /**
   * Helper: Sinh token cho breakout
   */
  private async generateBreakoutToken(
    roomName: string,
    userId: string,
    displayName: string,
    avatarUrl: string,
    deviceId: string,
    role: string = "guest",
    hasAdminPowers: boolean = false,
  ) {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    const at = new AccessToken(apiKey, apiSecret, {
      identity: userId,
      name: displayName,
      ttl: "1h",
      metadata: JSON.stringify({
        deviceId: deviceId,
        avatarUrl: avatarUrl,
        role: role as any,
        hasAdminPowers,
        status: "joined",
      } as ParticipantMetadata),
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishSources: [
        TrackSource.CAMERA,
        TrackSource.MICROPHONE,
      ],
      canUpdateOwnMetadata: true,
    });

    return {
      token: await at.toJwt(),
      roomId: roomName,
    };
  }
}

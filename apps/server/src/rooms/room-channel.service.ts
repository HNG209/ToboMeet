// src/modules/rooms/services/room-channel.service.ts
import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Room, RoomDocument } from "./schemas/room.schema";
import { User, UserDocument } from "../users/schemas/user.schema";
import { RoomsGateway } from "./rooms.gateway";
import { mapToRoomResponse } from "./helpers/room.helper";
import { RoomResponse } from "@tobomeet/shared/types";
import { Channel } from "./schemas/channel.schema";
import { MeetingsService } from "../meetings/meetings.service";

@Injectable()
export class RoomChannelService {
  private readonly logger = new Logger(RoomChannelService.name);

  constructor(
    @InjectModel(Room.name) private roomModel: Model<RoomDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Inject(forwardRef(() => MeetingsService))
    private readonly meetingsService: MeetingsService,
    private readonly roomsGateway: RoomsGateway,
  ) {}

  /**
   * Thêm kênh mới vào phòng (chỉ dành cho chủ phòng)
   */
  async addChannel(
    userId: string,
    roomId: string,
    channelName: string,
    isPrivate: boolean = false,
    initialMemberIds: string[] = [],
  ): Promise<RoomResponse> {
    const room = await this.roomModel.findOne({
      _id: roomId,
      isDeleted: { $ne: true },
    });

    if (!room) {
      throw new NotFoundException("Phòng không tồn tại");
    }

    if (room.ownerId !== userId) {
      throw new ForbiddenException("Chỉ chủ phòng mới có quyền tạo kênh mới");
    }

    // Giới hạn tối đa 50 kênh trong 1 phòng (công khai + riêng tư)
    if ((room.channels?.length || 0) >= 50) {
      throw new BadRequestException(
        "Phòng đã đạt số lượng kênh tối đa (50 kênh)",
      );
    }

    // Kiểm tra tên kênh đã trùng chưa (không phân biệt hoa thường)
    const exists = room.channels.some(
      (c) => c.name.toLowerCase() === channelName.trim().toLowerCase(),
    );
    if (exists) {
      throw new BadRequestException("Tên kênh đã tồn tại");
    }

    const newChannel: Channel = {
      name: channelName.trim(),
      isPrivate: !!isPrivate,
      createdAt: new Date(),
    };

    // Khi tạo kênh riêng tư, chỉ thêm những thành viên được mời ban đầu (initialMemberIds)
    // Người tạo (Owner) có quyền ngầm định từ room.ownerId nên KHÔNG CẦN lưu vào đây.
    if (isPrivate) {
      const memberIds = Array.from(new Set(initialMemberIds)).filter(
        (id) => id !== userId,
      );

      // Kênh riêng tư tối đa 100 người (bao gồm cả chủ phòng)
      if (memberIds.length + 1 > 100) {
        throw new BadRequestException(
          "Kênh riêng tư chỉ có thể có tối đa 100 người",
        );
      }

      newChannel.members = memberIds.map((id) => ({
        userId: id,
        role: "member",
      }));
    }

    room.channels.push(newChannel);
    await room.save();

    return mapToRoomResponse(room);
  }

  /**
   * Kiểm tra xem người dùng có quyền quản lý thành viên / phân quyền trong Kênh hay không
   */
  async canManageChannelMembers(
    room: RoomDocument,
    channelId: string,
    userId: string,
  ): Promise<boolean> {
    if (room.ownerId === userId) return true;

    const roomMember = room.members?.find(
      (m) =>
        m.userId === userId &&
        m.status !== "removed" &&
        m.status !== "left",
    );

    // Chủ phòng mới có full quyền mặc định
    if (roomMember && roomMember.role === "owner") {
      return true;
    }

    const channel = room.channels.find((c) => c._id?.toString() === channelId);
    if (!channel) return false;

    const channelMember = channel.members?.find((m) => m.userId === userId);

    // Chỉ có admin kênh mới có quyền quản lý kênh đó
    return !!channelMember && channelMember.role === "admin";
  }

  /**
   * Cập nhật vai trò thành viên trong Kênh (Phó nhóm / Ban cán sự / Thành viên)
   */
  async updateChannelMemberRole(
    userId: string,
    roomId: string,
    channelId: string,
    targetUserId: string,
    newRole: 'admin' | 'member',
  ): Promise<RoomResponse> {
    const room = await this.roomModel.findOne({
      _id: roomId,
      isDeleted: { $ne: true },
    });
    if (!room) throw new NotFoundException("Phòng không tồn tại");

    const canManage = await this.canManageChannelMembers(
      room,
      channelId,
      userId,
    );
    if (!canManage) {
      throw new ForbiddenException(
        "Bạn không có quyền quản lý vai trò trong kênh này",
      );
    }

    if (targetUserId === room.ownerId) {
      throw new BadRequestException(
        "Không thể thay đổi vai trò của Chủ phòng / Giảng viên trong kênh",
      );
    }

    const channel = room.channels.find((c) => c._id?.toString() === channelId);
    if (!channel) throw new NotFoundException("Kênh không tồn tại");

    if (!channel.members) channel.members = [];

    // Kiểm tra giới hạn tối đa 3 Phó nhóm / Ban cán sự cho từng Kênh
    if (newRole === "admin") {
      const currentAdminCount = channel.members.filter(
        (m) =>
          m.role === "admin" &&
          m.userId !== targetUserId &&
          m.userId !== room.ownerId,
      ).length;
      if (currentAdminCount >= 3) {
        throw new BadRequestException(`Đã đạt số lượng tối đa 3 Phó nhóm`);
      }
    }

    // Xử lý lưu hoặc xoá khỏi mảng dựa trên loại kênh và quyền
    if (!channel.isPrivate && newRole === "member") {
      // Xoá hẳn user này khỏi danh sách ngoại lệ của kênh để tiết kiệm DB.
      channel.members = channel.members.filter(
        (m) => m.userId !== targetUserId,
      );
    } else {
      // Đối với kênh Private, HOẶC bổ nhiệm làm 'admin' trong kênh Public
      const existing = channel.members.find((m) => m.userId === targetUserId);
      if (existing) {
        existing.role = newRole;
      } else {
        channel.members.push({ userId: targetUserId, role: newRole });
      }
    }

    room.markModified("channels");
    await room.save();

    // Đồng bộ role vào cuộc họp nếu đang diễn ra (nếu có)
    try {
      await this.meetingsService.updateParticipantRole(
        roomId,
        channelId,
        targetUserId,
        newRole,
      );
    } catch (e) {
      this.logger.error("Lỗi đồng bộ role vào meeting:", e);
    }
    // ==========================================

    this.roomsGateway?.notifyRoomUpdated(roomId, {
      type: "member_role_updated",
      roomId,
      channelId,
      targetUserId,
    });

    return mapToRoomResponse(room);
  }

  /**
   * Thêm thành viên vào Kênh riêng tư (Chỉ dùng targetUserId)
   */
  async addChannelMember(
    userId: string,
    roomId: string,
    channelId: string,
    targetUserId: string,
  ): Promise<RoomResponse> {
    if (!targetUserId || !targetUserId.trim()) {
      throw new BadRequestException("ID người dùng được mời không hợp lệ");
    }

    const room = await this.roomModel.findOne({
      _id: roomId,
      isDeleted: { $ne: true },
    });
    if (!room) throw new NotFoundException("Phòng không tồn tại");

    // Kiểm tra quyền của người thực hiện
    const canManage = await this.canManageChannelMembers(
      room,
      channelId,
      userId,
    );
    if (!canManage) {
      throw new ForbiddenException(
        "Bạn không có quyền thực hiện hành động này",
      );
    }

    const channel = room.channels.find((c) => c._id?.toString() === channelId);
    if (!channel) throw new NotFoundException("Kênh không tồn tại");

    // Tra cứu thông tin người dùng được mời (Chỉ dùng supabaseId)
    const targetUser = await this.userModel
      .findOne({
        supabaseId: targetUserId.trim(),
        isDeleted: { $ne: true },
      })
      .exec();

    if (!targetUser) {
      throw new NotFoundException("Người dùng được mời không tồn tại");
    }

    if (targetUser.status === "BLOCKED") {
      throw new BadRequestException("Người dùng được mời đã bị chặn");
    }

    const resolvedTargetId = targetUser.supabaseId; // Lấy ID duy nhất chuẩn Convention
    if (resolvedTargetId === userId) {
      throw new BadRequestException("Không thể thêm chính mình vào kênh");
    }

    // Giới hạn thành viên kênh riêng tư (tối đa 100 người bao gồm cả chủ phòng)
    if (channel.isPrivate) {
      if (!channel.members) channel.members = [];
      const currentChannelMembersCount = channel.members.length + 1; // Bao gồm chủ phòng
      if (currentChannelMembersCount >= 100) {
        throw new BadRequestException(
          "Kênh riêng tư đã đạt số lượng tối đa (100 người)",
        );
      }
    }

    // Xử lý cấp độ Phòng: Tự động thêm vào phòng họp/lớp học nếu chưa phải thành viên
    if (!room.members) room.members = [];
    const existingRoomMember = room.members.find(
      (m) => m.userId === resolvedTargetId,
    );

    const isAddingToRoom =
      !existingRoomMember ||
      existingRoomMember.status === "removed" ||
      existingRoomMember.status === "left";

    if (isAddingToRoom) {
      // Giới hạn tối đa 500 thành viên trong phòng (kênh công khai kế thừa từ giới hạn này)
      const activeMembersCount = room.members.filter(
        (m) =>
          m.status !== "removed" &&
          m.status !== "left",
      ).length;
      if (activeMembersCount >= 500) {
        throw new BadRequestException("Phòng đã đạt số lượng tối đa (500 người)");
      }

      // Giới hạn người dùng được phép tham gia và tạo tối đa 100 phòng họp
      const targetRoomCount = await this.roomModel.countDocuments({
        members: {
          $elemMatch: {
            userId: resolvedTargetId,
            status: { $nin: ["removed", "left"] },
          },
        },
        isDeleted: { $ne: true },
        status: { $nin: ["disbanded", "blocked"] },
      });
      if (targetRoomCount >= 100) {
        throw new BadRequestException(
          "Người dùng này đã tham gia tối đa 100 phòng họp",
        );
      }
    }

    if (!existingRoomMember) {
      room.members.push({
        userId: resolvedTargetId,
        role: "member",
        joinedAt: new Date(),
        status: "active",
      });
      room.markModified("members");
    } else if (
      existingRoomMember.status === "removed" ||
      existingRoomMember.status === "left"
    ) {
      // Phục hồi trạng thái nếu đã từng rời/bị xóa khỏi phòng và BẮT BUỘC reset role về 'member'
      existingRoomMember.status = "active";
      existingRoomMember.role = "member";
      existingRoomMember.rejoinedAt = new Date();
      room.markModified("members");
    }

    // 4. Xử lý cấp độ Kênh (Siêu tối ưu nhờ Xóa cứng)
    if (!channel.members) channel.members = [];
    const existingCM = channel.members.find(
      (m) => m.userId === resolvedTargetId,
    );

    if (existingCM) {
      // Vì là xóa cứng, nếu tìm thấy chắc chắn họ đang ở trong kênh
      throw new BadRequestException("Người dùng đã là thành viên của kênh");
    } else {
      channel.members.push({
        userId: resolvedTargetId,
        role: "member",
      });
      room.markModified("channels");
    }

    await room.save();

    this.roomsGateway?.notifyRoomUpdated(roomId, {
      type: "member_role_updated", // Frontend sẽ bắt case này để cập nhật channel
      roomId,
      channelId,
      targetUserId: resolvedTargetId,
    });

    return mapToRoomResponse(room);
  }

  /**
   * Xóa thành viên khỏi Kênh riêng tư hoặc xoá quyền ngoại lệ ở Kênh công khai (Xóa cứng - Hard Delete)
   */
  async removeChannelMember(
    userId: string,
    roomId: string,
    channelId: string,
    targetUserId: string,
  ): Promise<void> {
    const room = await this.roomModel.findOne({
      _id: roomId,
      isDeleted: { $ne: true },
    });
    if (!room) throw new NotFoundException("Phòng không tồn tại");

    // Kiểm tra quyền thao tác
    const canManage = await this.canManageChannelMembers(
      room,
      channelId,
      userId,
    );
    if (!canManage) {
      throw new ForbiddenException(
        "Bạn không có quyền thực hiện hành động này",
      );
    }

    if (targetUserId === room.ownerId) {
      throw new BadRequestException("Không thể xóa Chủ phòng khỏi kênh");
    }

    const channel = room.channels.find((c) => c._id?.toString() === channelId);
    if (!channel) throw new NotFoundException("Kênh không tồn tại");

    // Định danh vai trò của người thực hiện (Requester) và người bị xóa (Target)
    const isRoomOwner = userId === room.ownerId;
    const roomMember = room.members?.find(
      (m) =>
        m.userId === userId && m.status !== "removed" && m.status !== "left",
    );
    const isRoomLeader =
      isRoomOwner || (roomMember && roomMember.role === "owner");

    if (channel.members) {
      const targetMember = channel.members.find(
        (m) => m.userId === targetUserId,
      );

      if (targetMember) {
        // Ràng buộc của Admin/Phó nhóm: Không được xóa Chủ phòng hoặc Admin khác
        if (!isRoomLeader) {
          if (targetMember.role === "admin") {
            throw new ForbiddenException(
              "Bạn không có quyền thực hiện hành động này",
            );
          }
        }

        // Xóa khỏi mảng members của kênh
        channel.members = channel.members.filter(
          (m) => m.userId !== targetUserId,
        );

        room.markModified("channels");
        await room.save();
      }
    }

    this.roomsGateway?.notifyRoomUpdated(roomId, {
      type: "channel_member_removed",
      roomId,
      channelId,
      targetUserId,
    });
  }

  /**
   * Thành viên / Phó nhóm chủ động rời khỏi kênh
   */
  async leaveChannel(
    userId: string,
    roomId: string,
    channelId: string,
  ): Promise<{ success: boolean }> {
    const room = await this.roomModel.findOne({
      _id: roomId,
      isDeleted: { $ne: true },
    });
    if (!room) throw new NotFoundException("Phòng không tồn tại");

    // Trưởng nhóm (Owner) không được phép rời kênh
    if (room.ownerId === userId) {
      throw new ForbiddenException("Trưởng nhóm không thể rời khỏi kênh");
    }

    // Kiểm tra user có phải là thành viên active của phòng không
    const roomMember = room.members?.find(
      (m) =>
        m.userId === userId &&
        m.status !== "removed" &&
        m.status !== "left",
    );
    if (!roomMember) {
      throw new NotFoundException("Bạn không phải là thành viên của phòng này");
    }

    // Tìm kênh
    const channelIndex = room.channels.findIndex(
      (c) => c._id?.toString() === channelId,
    );
    if (channelIndex === -1) {
      throw new NotFoundException("Kênh không tồn tại");
    }

    const channel = room.channels[channelIndex];

    if (!channel.isPrivate) {
      throw new BadRequestException(
        "Không thể rời khỏi kênh công khai. Nếu muốn rời, bạn phải rời khỏi phòng.",
      );
    }

    // === PRIVATE CHANNEL: hard-delete khỏi members[] ===
    const existingIdx = channel.members?.findIndex(
      (m) => m.userId === userId,
    );
    if (existingIdx === undefined || existingIdx === -1) {
      throw new NotFoundException(
        "Bạn không phải là thành viên của kênh riêng tư này",
      );
    }

    channel.members!.splice(existingIdx, 1);
    const memberCount = channel.members!.length + 1; // +1 cho Owner luôn ngầm định

    room.markModified("channels");
    await room.save();

    // Phát socket event realtime:
    // - Gọi socketsLeave(channelId) cho user vừa rời → không nhận thêm event của channel
    // - Broadcast channel_member_left đến toàn bộ thành viên còn lại trong room
    this.roomsGateway?.notifyUserLeftChannel(roomId, channelId, userId, {
      type: "channel_member_left",
      roomId,
      channelId,
      userId,
      memberCount,
    });

    this.logger.log(
      `[leaveChannel] User ${userId} đã rời kênh riêng tư ${channel.name} trong phòng ${roomId}`,
    );

    return { success: true };
  }

  /**
   * Đổi tên kênh (Public hoặc Private)
   */
  async renameChannel(
    userId: string,
    roomId: string,
    channelId: string,
    newName: string,
  ): Promise<RoomResponse> {
    const room = await this.roomModel.findOne({
      _id: roomId,
      isDeleted: { $ne: true },
    });
    if (!room) throw new NotFoundException("Phòng không tồn tại");

    const channel = room.channels.find((c) => c._id?.toString() === channelId);
    if (!channel) throw new NotFoundException("Kênh không tồn tại");

    const trimmedNewName = newName.trim();
    if (!trimmedNewName) {
      throw new BadRequestException("Tên kênh không được để trống");
    }

    if (trimmedNewName.length > 30) {
      throw new BadRequestException("Tên kênh không được vượt quá 30 ký tự");
    }

    if (channel.name === trimmedNewName) {
      return mapToRoomResponse(room);
    }

    // Kiểm tra trùng tên kênh khác trong cùng một phòng họp (case-insensitive)
    const exists = room.channels.some(
      (c) =>
        c._id?.toString() !== channelId &&
        c.name.toLowerCase() === trimmedNewName.toLowerCase(),
    );
    if (exists) {
      throw new BadRequestException("Tên kênh đã tồn tại");
    }

    channel.name = trimmedNewName;
    room.markModified("channels");
    await room.save();

    // Phát socket event realtime cho mọi người trong phòng
    this.roomsGateway?.notifyRoomUpdated(roomId, {
      type: "channel_renamed",
      roomId,
      channelId,
      name: trimmedNewName,
    });

    return mapToRoomResponse(room);
  }
}


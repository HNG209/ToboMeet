// src/modules/rooms/services/room-member.service.ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { RoomResponse, RoomMemberResponse } from "@tobomeet/shared/types";
import { RoomsGateway } from "./rooms.gateway";
import { Room, RoomDocument } from "./schemas/room.schema";
import { User, UserDocument } from "../users/schemas/user.schema";
import {
  RoomActivity,
  RoomActivityDocument,
} from "./schemas/room-activity.schema";
import { mapToRoomResponse } from "./helpers/room.helper";

@Injectable()
export class RoomMemberService {
  private readonly logger = new Logger(RoomMemberService.name);

  constructor(
    private eventEmitter: EventEmitter2,
    @InjectModel(Room.name) private roomModel: Model<RoomDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(RoomActivity.name)
    private activityModel: Model<RoomActivityDocument>,
    private readonly roomsGateway: RoomsGateway,
  ) { }

  /**
   * Lấy danh sách user trong phòng
   */
  async getRoomMembers(roomId: string): Promise<RoomMemberResponse[]> {
    const room = await this.roomModel.findById(roomId);
    if (!room) {
      throw new NotFoundException("Phòng không tồn tại");
    }

    const activeMembers = room.members.filter(
      (member) => member.status !== "removed" && member.status !== "left",
    );
    const memberUserIds = activeMembers.map((member) => member.userId);
    const users = await this.userModel
      .find({ supabaseId: { $in: memberUserIds } })
      .exec();

    // Định nghĩa thứ tự ưu tiên vai trò: owner (1) -> admin (2) -> member (3)
    const rolePriorityMap: Record<string, number> = {
      owner: 1,
      admin: 2,
      member: 3,
    };

    // Sắp xếp thành viên theo thứ tự ưu tiên
    activeMembers.sort((a, b) => {
      const pA = rolePriorityMap[a.role] || 99;
      const pB = rolePriorityMap[b.role] || 99;
      return pA - pB;
    });

    const data: RoomMemberResponse[] = activeMembers.map((member) => {
      const userInfo = users.find(
        (u) => u.supabaseId === member.userId,
      );

      // Đảm bảo DUY NHẤT room.ownerId mới có role === "owner"
      const isActualOwner = member.userId === room.ownerId;
      const effectiveRole: "owner" | "admin" | "member" = isActualOwner
        ? "owner"
        : member.role === "admin"
          ? "admin"
          : "member";

      return {
        userId: member.userId,
        role: effectiveRole,
        status: member.status as "active" | "removed" | "left" | undefined,
        joinedAt: member.joinedAt.toISOString(), // Ép ngày thành string
        removedAt: member.removedAt?.toISOString(),
        removedBy: member.removedBy,
        rejoinedAt: member.rejoinedAt?.toISOString(),
        displayName: userInfo?.displayName || "Người dùng ẩn danh",
        avatarUrl: userInfo?.avatarUrl || undefined,
        email: userInfo?.email || undefined,
        supabaseId: userInfo?.supabaseId || member.userId,
      };
    });

    return data;
  }

  /**
   * Thêm thành viên bằng email hoặc userId
   */
  async addMemberByEmailOrId(
    userId: string,
    roomId: string,
    payload: { email?: string; targetUserId?: string },
  ): Promise<RoomResponse> {
    const isObjectId = Types.ObjectId.isValid(roomId);
    const room = await this.roomModel.findOne({
      $or: [...(isObjectId ? [{ _id: roomId }] : []), { code: roomId }],
      isDeleted: { $ne: true },
    });
    if (!room) throw new NotFoundException("Phòng không tồn tại");

    const requesterMember = room.members.find(
      (m) =>
        m.userId === userId &&
        m.status !== "removed" &&
        m.status !== "left",
    );

    const isOwner = room.ownerId === userId;
    const isRequesterMember = isOwner || !!requesterMember;
    if (!isRequesterMember) {
      throw new ForbiddenException(
        "Bạn không có quyền thêm thành viên vào phòng này",
      );
    }

    let targetUser: UserDocument | null = null;
    if (payload.targetUserId) {
      targetUser = await this.userModel.findOne({
        supabaseId: payload.targetUserId,
      });
    } else if (payload.email) {
      targetUser = await this.userModel.findOne({
        email: payload.email.trim().toLowerCase(),
      });
    }

    if (!targetUser) {
      throw new NotFoundException("Không tìm thấy người dùng");
    }

    const targetUserId = targetUser.supabaseId;

    // Kiểm tra xem đã là thành viên (hoặc Chủ phòng) hay chưa
    const isAlreadyMember =
      room.ownerId === targetUserId ||
      room.members.some(
        (m) =>
          m.userId === targetUserId &&
          m.status !== "removed" &&
          m.status !== "left",
      );
    if (isAlreadyMember) {
      throw new BadRequestException("Thành viên này đã ở trong phòng họp");
    }

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
          userId: targetUserId,
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

    // Nếu trước đó đã rời phòng hoặc bị xóa, reset isLeft và update rejoinedAt
    const previousMemberIdx = room.members.findIndex(
      (m) =>
        m.userId === targetUserId &&
        (m.status === "removed" || m.status === "left"),
    );

    if (previousMemberIdx !== -1) {
      const prevMember = room.members[previousMemberIdx];
      // Nếu trạng thái trước đó là removed (bị xóa khỏi phòng), chỉ cho phép owner hoặc admin thêm lại
      if (prevMember.status === "removed") {
        const opRole = requesterMember ? requesterMember.role : null;
        const isOwnerOrAdmin = isOwner || opRole === "owner" || opRole === "admin";

        if (!isOwnerOrAdmin) {
          throw new ForbiddenException(
            "Thành viên này từng bị xóa khỏi phòng. Chỉ Trưởng nhóm hoặc Phó nhóm mới có quyền thêm lại.",
          );
        }
      }

      room.members[previousMemberIdx].status = "active";
      room.members[previousMemberIdx].role = "member"; // BẮT BUỘC reset role về 'member', không giữ role cũ
      room.members[previousMemberIdx].rejoinedAt = new Date();
      room.members[previousMemberIdx].userId = targetUserId;

      // Đảm bảo không còn dữ liệu cũ trong các kênh khi họ vào lại phòng
      if (room.channels && Array.isArray(room.channels)) {
        room.channels.forEach((channel) => {
          if (channel.members) {
            channel.members = channel.members.filter(
              (cm) => cm.userId !== targetUserId,
            );
          }
        });
        room.markModified("channels");
      }

      room.markModified("members");
    } else {
      // Thêm thành viên với vai trò chuẩn 'member' dưới DB
      room.members.push({
        userId: targetUserId,
        role: "member",
        joinedAt: new Date(),
        status: "active",
      });
    }

    try {
      await room.save();
    } catch (err) {
      this.logger.error("Lỗi khi lưu thông tin thành viên vào phòng:", err);
      throw new BadRequestException("Không thể thêm thành viên vào phòng");
    }

    const roomResponsePayload = mapToRoomResponse(room, targetUserId);

    this.roomsGateway?.notifyUserRoomAdded(
      targetUserId,
      room._id.toString(),
      roomResponsePayload,
    );

    const addedMemberInfo = roomResponsePayload.members.find(
      (m) => m.userId === targetUserId,
    );
    this.roomsGateway?.notifyRoomUpdated(room._id.toString(), {
      type: "member_added",
      addedUserId: targetUserId,
      member: addedMemberInfo,
      roomId: room._id.toString(),
    });

    return roomResponsePayload;
  }

  /**
   * Xóa thành viên khỏi phòng
   */
  async removeMember(
    roomId: string,
    targetUserId: string,
    operatorId: string,
  ): Promise<void> {
    const room = await this.roomModel.findOne({
      _id: roomId,
      isDeleted: { $ne: true },
    });
    if (!room) throw new NotFoundException("Không tìm thấy phòng");

    // Lấy thông tin người thực hiện thao tác (operator)
    const operatorMember = room.members.find(
      (m) =>
        m.userId === operatorId &&
        m.status !== "removed" &&
        m.status !== "left",
    );
    const isOwner =
      room.ownerId === operatorId || operatorMember?.role === "owner";
    const isAdmin = operatorMember?.role === "admin";

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException("Hành động bị cấm");
    }

    // Lấy thông tin người bị xóa (target)
    const targetMember = room.members.find(
      (m) =>
        m.userId === targetUserId &&
        m.status !== "removed" &&
        m.status !== "left",
    );
    if (!targetMember) throw new NotFoundException("Không tìm thấy người dùng");

    const targetRole = targetMember.role;

    // Trưởng phòng không thể bị xóa
    if (targetMember.userId === room.ownerId || targetRole === "owner") {
      throw new BadRequestException("Không thể xoá trưởng phòng");
    }

    // Phó phòng không được xóa Trưởng phòng/Ban quản trị khác
    if (isAdmin && targetRole === "admin") {
      throw new ForbiddenException("Hành động bị cấm");
    }

    targetMember.status = "removed";
    targetMember.removedBy = operatorId;
    targetMember.removedAt = new Date();
    room.markModified("members");

    // Khi người dùng bị xoá khỏi phòng, hãy xoá họ ra khỏi mảng của các kênh nếu có
    if (room.channels && Array.isArray(room.channels)) {
      room.channels.forEach((channel) => {
        if (channel.members) {
          channel.members = channel.members.filter(
            (cm) => cm.userId !== targetUserId,
          );
        }
      });
      room.markModified("channels");
    }

    const [operatorUser, targetUser] = await Promise.all([
      this.userModel.findOne({ supabaseId: operatorId }),
      this.userModel.findOne({ supabaseId: targetUserId }),
      room.save(),
    ]);

    await this.activityModel.create({
      roomId,
      type: "MEMBER_REMOVED",
      metadata: {
        userId: operatorId,
        targetUserId,
        details: `${operatorUser?.displayName || "Chủ phòng"} đã xóa ${targetUser?.displayName || "Thành viên"} khỏi phòng.`,
      },
    });

    this.eventEmitter.emit("notification.kicked", {
      userId: targetUserId,
      metadata: {
        roomId,
        roomName: room.name,
        kickedAt: new Date().toISOString(),
      },
    });

    this.roomsGateway.notifyRoomUpdated(roomId, {
      type: "member_removed",
      removedUserId: targetUserId,
      roomId,
      roomName: room.name,
    });
  }

  /**
   * Cập nhật vai trò thành viên (Phân quyền: Bổ nhiệm / Thu hồi)
   */
  async updateMemberRole(
    roomId: string,
    targetUserId: string,
    newRole: string,
    operatorId: string,
  ): Promise<{ message: string; role: string }> {
    const room = await this.roomModel.findOne({
      _id: roomId,
      isDeleted: { $ne: true },
    });
    if (!room) throw new NotFoundException("Không tìm thấy phòng");

    // Xác thực người thực hiện (Operator)
    const operatorMember = room.members.find(
      (m) =>
        m.userId === operatorId &&
        m.status !== "removed" &&
        m.status !== "left",
    );

    if (!operatorMember) {
      throw new ForbiddenException("Không phải thành viên");
    }

    if (operatorMember.role !== "owner") {
      throw new ForbiddenException("Hành động bị cấm");
    }

    if (!["admin", "member"].includes(newRole)) {
      throw new BadRequestException("Yêu cầu không hợp lệ");
    }

    // Không được tự đổi vai trò của chính mình
    if (operatorId === targetUserId) {
      throw new BadRequestException(
        "Không thể tự thay đổi vai trò của chính mình",
      );
    }

    // Tìm thành viên bị thay đổi (Target)
    const targetIdx = room.members.findIndex(
      (m) =>
        m.userId === targetUserId &&
        m.status !== "removed" &&
        m.status !== "left",
    );
    if (targetIdx === -1) {
      throw new NotFoundException("Không tìm thấy người dùng");
    }

    const targetMember = room.members[targetIdx];
    const oldRole = targetMember.role;

    if (oldRole === "owner") {
      throw new BadRequestException("Không thể xóa trưởng phòng");
    }

    // Kiểm tra giới hạn số lượng (Tối đa 3 Phó nhóm / Ban cán sự)
    if (newRole === "admin" && oldRole !== "admin") {
      const adminCount = room.members.filter(
        (m) =>
          m.role === "admin" && m.status !== "removed" && m.status !== "left",
      ).length;

      if (adminCount >= 3) {
        throw new BadRequestException(
          "Đã đạt số lượng tối đa 3 Phó nhóm / Ban cán sự",
        );
      }
    }

    // Cập nhật vai trò trong DB
    room.members[targetIdx].role = newRole;
    room.markModified("members");

    // Lưu DB và Query lấy thông tin User cùng lúc
    const [operatorUser, targetUser] = await Promise.all([
      this.userModel.findOne({ supabaseId: operatorId }).exec(),
      this.userModel.findOne({ supabaseId: targetUserId }).exec(),
      room.save(),
    ]);

    const opName = operatorUser?.displayName || "Người dùng";
    const tarName = targetUser?.displayName || "Thành viên";

    const message =
      newRole === "admin"
        ? `${opName} đã bổ nhiệm ${tarName} làm Phó phòng.`
        : `${opName} đã thu hồi quyền Phó phòng của ${tarName}.`;

    await this.activityModel.create({
      roomId,
      type: "ROLE_UPDATED",
      metadata: {
        userId: operatorId,
        actorId: operatorId,
        actorName: opName,
        targetUserId,
        targetUserName: tarName,
        oldRole,
        newRole,
        details: message,
      },
    });

    this.roomsGateway.notifyRoomUpdated(roomId, {
      type: "member_role_updated",
      roomId,
      targetUserId,
      newRole,
    });

    return {
      message,
      role: newRole,
    };
  }
}

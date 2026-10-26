import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Room, RoomDocument } from "./schemas/room.schema";
import { CreateRoomDto } from "./dto/create-room.dto";
import { User, UserDocument } from "../users/schemas/user.schema";
import {
  RoomActivity,
  RoomActivityDocument,
} from "./schemas/room-activity.schema";
import {
  ErrorCode,
  RoomMemberResponse,
  RoomResponse,
} from "@tobomeet/shared/types";
import { RoomsGateway } from "./rooms.gateway";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { normalizeRole } from "./helpers/room-role.helper";
import { mapToRoomResponse } from "./helpers/room.helper";
import { MeetingsService } from "../meetings/meetings.service";

@Injectable()
export class RoomsService {
  constructor(
    private eventEmitter: EventEmitter2,
    @InjectModel(Room.name) private roomModel: Model<RoomDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Inject(forwardRef(() => MeetingsService))
    private readonly meetingsService: MeetingsService,
    @InjectModel(RoomActivity.name)
    private activityModel: Model<RoomActivityDocument>,
    private readonly roomsGateway: RoomsGateway,
  ) { }

  /**
   * Tạo phòng mới — auto-gen code, thêm owner vào members, tạo channel "General"
   */
  async createRoom(userId: string, dto: CreateRoomDto): Promise<RoomResponse> {
    const currentRoomCount = await this.roomModel.countDocuments({
      members: {
        $elemMatch: {
          userId: userId,
          status: { $nin: ["removed", "left"] },
        },
      },
      isDeleted: { $ne: true },
      status: { $nin: ["disbanded", "blocked"] },
    });

    if (currentRoomCount >= 100) {
      throw new BadRequestException(
        "Bạn chỉ được phép tham gia và tạo tối đa 100 phòng họp",
      );
    }

    const code = this.generateRoomCode();

    const room = await this.roomModel.create({
      name: dto.name,
      code,
      ownerId: userId,
      // Đẩy object user đầu tiên vào với quyền owner
      members: [{ userId, role: "owner", joinedAt: new Date() }],
      channels: [{ name: "General" }],
    });

    await this.activityModel.create({
      roomId: room._id.toString(),
      type: "CREATED",
      metadata: {
        userId,
        details: "Phòng được tạo bởi chủ phòng",
      },
    });

    return mapToRoomResponse(room);
  }

  /**
   * Lấy danh sách phòng mà user đã tham gia
   */
  async getMyRooms(userId: string): Promise<RoomResponse[]> {
    const rooms = await this.roomModel
      .find({
        members: {
          $elemMatch: {
            userId: userId,
            status: { $nin: ["removed", "left"] },
          },
        },
        isDeleted: { $ne: true },
        status: { $nin: ["disbanded", "blocked"] },
      })
      .sort({ updatedAt: -1 })
      .exec();

    // Map qua toàn bộ mảng, truyền userId để filter channels đã rời
    return rooms.map((room) => mapToRoomResponse(room, userId));
  }

  /**
   * Chuyển quyền chủ phòng (owner) sang người khác, chỉ chủ phòng hiện tại mới được phép thực hiện
   */
  async transferOwner(
    roomId: string,
    newOwnerId: string,
    operatorId: string,
  ): Promise<void> {
    const room = await this.roomModel.findOne({
      _id: roomId,
      isDeleted: { $ne: true },
    });
    if (!room) throw new NotFoundException("Phòng không tồn tại");

    if (operatorId === newOwnerId) {
      throw new BadRequestException("Không thể chuyển quyền cho chính mình");
    }

    // Xác thực người chuyển quyền (phải là Owner)
    const operatorMember = room.members.find(
      (m) =>
        m.userId === operatorId && m.status !== "removed" && m.status !== "left",
    );
    if (!operatorMember)
      throw new ForbiddenException(
        "Bạn không phải là thành viên của phòng này",
      );

    if (normalizeRole(operatorMember.role) !== "owner") {
      throw new ForbiddenException("Chỉ chủ phòng mới có quyền chuyển quyền");
    }

    // Xác thực người nhận quyền (phải đang là thành viên)
    const newOwnerIdx = room.members.findIndex(
      (m) =>
        m.userId === newOwnerId && m.status !== "removed" && m.status !== "left",
    );
    if (newOwnerIdx === -1) {
      throw new NotFoundException(
        "Người dùng không tồn tại hoặc không còn là thành viên hoạt động",
      );
    }
    const operatorIdx = room.members.findIndex((m) => m.userId === operatorId);

    // Thực hiện chuyển quyền cấp độ Phòng
    room.ownerId = newOwnerId;
    room.members[newOwnerIdx].role = "owner";
    if (operatorIdx !== -1) {
      room.members[operatorIdx].role = "member";
    }

    // Xử lý đồng bộ quyền ở cấp độ Kênh
    if (room.channels && Array.isArray(room.channels)) {
      room.channels.forEach((channel) => {
        if (!channel.members) channel.members = [];

        // Xử lý cho Owner Cũ (Đảm bảo không mất quyền vào kênh Private)
        if (channel.isPrivate) {
          const oldOwnerInChannel = channel.members.find(
            (cm) => cm.userId === operatorId,
          );
          if (!oldOwnerInChannel) {
            channel.members.push({
              userId: operatorId,
              role: "member", // Đẩy xuống làm member
            });
          } else {
            oldOwnerInChannel.role = "member";
          }
        }

        // Vì Owner mới đã có toàn quyền ngầm định, ta xoá sạch họ khỏi mảng ngoại lệ của MỌI KÊNH
        channel.members = channel.members.filter(
          (cm) => cm.userId !== newOwnerId,
        );
      });
      room.markModified("channels");
    }

    room.markModified("members");

    const [operatorUser, newOwnerUser] = await Promise.all([
      this.userModel.findOne({ supabaseId: operatorId }),
      this.userModel.findOne({ supabaseId: newOwnerId }),
      room.save(),
    ]);

    // Đồng bộ nếu đang có cuộc họp đang diễn ra
    try {
      if (room.channels && Array.isArray(room.channels)) {
        const syncPromises = [];
        room.channels.forEach((channel) => {
          const channelIdStr = channel._id.toString();

          // Nâng quyền người nhận lên thành "owner"
          syncPromises.push(
            this.meetingsService.updateParticipantRole(
              roomId,
              channelIdStr,
              newOwnerId,
              "owner",
            ),
          );

          // Hạ quyền người chuyển (chủ cũ) xuống thành "member"
          syncPromises.push(
            this.meetingsService.updateParticipantRole(
              roomId,
              channelIdStr,
              operatorId,
              "member",
            ),
          );
        });

        await Promise.allSettled(syncPromises);
      }
    } catch (e) {
      console.error("Lỗi đồng bộ role chuyển quyền vào meeting:", e);
    }
    // ==========================================

    const opName = operatorUser?.displayName || "Người dùng";
    const newOwnerName = newOwnerUser?.displayName || "Thành viên";
    const message = `${opName} đã chuyển quyền Chủ phòng cho ${newOwnerName}.`;

    await this.activityModel.create({
      roomId,
      type: "OWNER_TRANSFERRED",
      metadata: {
        userId: operatorId,
        actorId: operatorId,
        actorName: opName,
        targetUserId: newOwnerId,
        targetUserName: newOwnerName,
        oldRole: "owner",
        newRole: "owner",
        details: message,
      },
    });

    const updatedRoomPayload = mapToRoomResponse(room);
    this.roomsGateway.notifyRoomUpdated(roomId, {
      type: "ownership_transferred",
      roomId,
      previousOwnerId: operatorId,
      newOwnerId,
      room: updatedRoomPayload,
    });
  }

  /**
   * Tham gia phòng bằng mã code
   */
  async joinRoom(userId: string, roomCode: string): Promise<RoomResponse> {
    const room = await this.roomModel.findOne({
      code: roomCode,
      isDeleted: { $ne: true },
    });
    if (!room) throw new NotFoundException("Không tìm thấy phòng với mã này");

    // Ràng buộc 1: Giới hạn tối đa 500 thành viên trong phòng (kênh công khai kế thừa từ giới hạn này)
    const activeMembersCount = room.members.filter(
      (member) =>
        member.status !== "removed" &&
        member.status !== "left",
    ).length;
    if (activeMembersCount >= 500) {
      throw new BadRequestException("Phòng đã đạt số lượng tối đa (500 người)");
    }

    // Ràng buộc: Người dùng chỉ được tham gia và tạo tối đa 100 phòng họp
    const userRoomCount = await this.roomModel.countDocuments({
      members: {
        $elemMatch: {
          userId: userId,
          status: { $nin: ["removed", "left"] },
        },
      },
      isDeleted: { $ne: true },
      status: { $nin: ["disbanded", "blocked"] },
    });
    if (userRoomCount >= 100) {
      throw new BadRequestException(
        "Bạn chỉ được phép tham gia và tạo tối đa 100 phòng họp",
      );
    }

    // Ràng buộc 2: Kiểm tra trùng lặp
    const isAlreadyMember = room.members.some(
      (member) =>
        member.userId === userId &&
        member.status !== "removed" &&
        member.status !== "left",
    );
    if (isAlreadyMember) {
      throw new BadRequestException("Bạn đã là thành viên của phòng này");
    }

    // Nếu từng bị xóa bởi chủ phòng (status === "removed"), không cho tự tham gia lại
    const removedMember = room.members.find(
      (m) => m.userId === userId && m.status === "removed",
    );
    if (removedMember) {
      throw new ForbiddenException(
        "Bạn không thể tự tham gia lại phòng này do đã bị Trưởng nhóm xóa.",
      );
    }

    // Kiểm tra xem trước đó từng là thành viên và đã rời phòng (left)
    const previousMemberIndex = room.members.findIndex(
      (member) => member.userId === userId && member.status === "left",
    );

    const now = new Date();
    let joinedAtDate = now;
    let rejoinedAtDate: Date | undefined = undefined;

    if (previousMemberIndex !== -1) {
      room.members[previousMemberIndex].status = "active";
      room.members[previousMemberIndex].role = "member"; // BẮT BUỘC reset role về 'member'
      room.members[previousMemberIndex].rejoinedAt = new Date();
      room.members[previousMemberIndex].userId = userId;

      // Đảm bảo không còn dữ liệu cũ trong các kênh khi họ vào lại phòng
      if (room.channels && Array.isArray(room.channels)) {
        room.channels.forEach((channel) => {
          if (channel.members) {
            channel.members = channel.members.filter(
              (cm) => cm.userId !== userId,
            );
          }
        });
        room.markModified("channels");
      }

      joinedAtDate = room.members[previousMemberIndex].joinedAt;
      rejoinedAtDate = now;

      room.markModified("members");
    } else {
      // Thêm member mới với vai trò chuẩn 'member' dưới DB
      room.members.push({
        userId,
        role: "member",
        joinedAt: new Date(),
        status: "active",
      });
    }

    await room.save();

    const userInfo = await this.userModel.findOne({ supabaseId: userId });
    const existingMember = room.members.find((m) => m.userId === userId);
    const memberRole: "owner" | "admin" | "member" =
      existingMember?.role === "owner"
        ? "owner"
        : existingMember?.role === "admin"
          ? "admin"
          : "member";

    const newMemberPayload: RoomMemberResponse = {
      userId: userId,
      role: memberRole,
      joinedAt: joinedAtDate.toISOString(),
      ...(rejoinedAtDate && { rejoinedAt: rejoinedAtDate.toISOString() }),
      displayName: userInfo?.displayName || "Người dùng ẩn danh",
      avatarUrl: userInfo?.avatarUrl || undefined,
      email: userInfo?.email || undefined,
    };

    // Phát sự kiện qua Socket cho các client đang ở trong phòng
    this.roomsGateway.notifyRoomUpdated(room._id.toString(), {
      type: "member_joined",
      roomId: room._id.toString(),
      member: newMemberPayload,
    });

    return mapToRoomResponse(room);
  }

  /**
   * Thành viên tự rời phòng hoặc Trưởng nhóm rời phòng bàn giao quyền sở hữu
   */
  async leaveRoom(
    roomId: string,
    userId: string,
    newOwnerId?: string,
  ): Promise<void> {
    const room = await this.roomModel.findOne({
      _id: roomId,
      isDeleted: { $ne: true },
    });
    if (!room) throw new NotFoundException(ErrorCode.ROOM_NOT_FOUND);

    // Tìm index của người rời đi (phải đảm bảo họ đang active)
    const memberIdx = room.members.findIndex(
      (m) =>
        m.userId === userId &&
        m.status !== "removed" &&
        m.status !== "left",
    );
    if (memberIdx === -1) {
      throw new BadRequestException("Bạn không còn là thành viên của phòng này");
    }

    const member = room.members[memberIdx];

    if (member.role === "owner") {
      // Lọc ra những người CÒN ĐANG HOẠT ĐỘNG trong phòng (bỏ qua những người đã rời/bị xoá)
      const activeMembers = room.members.filter(
        (m) =>
          m.status !== "removed" &&
          m.status !== "left",
      );

      // Trường hợp 1: Phòng chỉ có duy nhất chủ phòng ĐANG HOẠT ĐỘNG -> Giải tán phòng
      if (activeMembers.length === 1) {
        room.status = "disbanded";
        room.isDeleted = true;
        await room.save();
        return;
      }

      // Trường hợp 2: Có thành viên khác nhưng chưa chỉ định người kế nhiệm
      if (!newOwnerId) {
        throw new BadRequestException("Vui lòng chỉ định Trưởng nhóm mới trước khi rời phòng");
      }

      // Kiểm tra người nhận quyền có tồn tại và đang active không
      const newOwnerIndex = room.members.findIndex(
        (m) =>
          m.userId === newOwnerId &&
          m.status !== "removed" &&
          m.status !== "left",
      );
      if (newOwnerIndex === -1) {
        throw new BadRequestException("Người dùng nhận quyền không tồn tại hoặc không còn trong phòng");
      }

      // Thực hiện chuyển giao quyền sở hữu
      room.ownerId = newOwnerId;
      room.members[newOwnerIndex].role = "owner";
    }

    if (room.channels && Array.isArray(room.channels)) {
      room.channels.forEach((channel) => {
        if (channel.members) {
          channel.members = channel.members.filter(
            (cm) =>
              // Xóa cứng người rời phòng khỏi tất cả các kênh để dọn rác
              cm.userId !== userId &&
              // Nếu có Chủ phòng mới, xóa luôn họ (vì họ đã có quyền ngầm định toàn phòng)
              (!newOwnerId || cm.userId !== newOwnerId),
          );
        }
      });
      room.markModified("channels");
    }

    // Đánh dấu thành viên rời đi (ở cấp độ Phòng)
    room.members[memberIdx].status = "left";
    room.markModified("members");
    await room.save();

    // Phát tín hiệu realtime
    this.roomsGateway.notifyRoomUpdated(roomId, {
      type: "member_left",
      leftUserId: userId,
      newOwnerId: newOwnerId || null,
      roomId,
    });
  }

  /**
   * Giải tán phòng họp (xóa mềm - soft delete)
   */
  async disbandRoom(roomId: string, userId: string) {
    const room = await this.roomModel.findById(roomId);
    if (!room) throw new NotFoundException("Phòng không tồn tại");

    if (room.ownerId !== userId) {
      throw new ForbiddenException("Chỉ chủ phòng mới có quyền giải tán phòng");
    }

    room.status = "disbanded";
    room.isDeleted = true;
    await room.save();

    // Tạo thông báo cho tất cả thành viên trong phòng (async)
    this.eventEmitter.emit("notification.room_disbanded", {
      userIds: room.members
        .filter((m) => m.status !== "removed" && m.status !== "left") // không thông báo cho người bị xoá hoặc đã rời
        .map((m) => m.userId) // chỉ lấy id
        .filter((id) => id !== userId), // loại trừ người thực hiện
      metadata: {
        roomId: roomId,
        roomName: room.name,
      },
    });
  }

  /**
   * Lấy thông tin sơ bộ của phòng bằng mã code
   */
  async getRoomByCode(code: string) {
    const room = await this.roomModel.findOne({
      code: code.trim(),
      isDeleted: { $ne: true },
    });
    if (!room) throw new NotFoundException("Không tìm thấy phòng họp này");
    return {
      _id: room._id.toString(),
      name: room.name,
      code: room.code,
    };
  }

  /**
   * Tạo mã phòng ngẫu nhiên 7 ký tự (chữ + số)
   */
  private generateRoomCode(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let code = "";
    for (let i = 0; i < 7; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Kiểm tra người dùng đã là thành viên của phòng hay chưa (bằng ID phòng)
   * Trả về: true nếu đang là thành viên hoạt động, false nếu chưa hoặc đã rời/bị xóa
   */
  async checkUserInRoomById(roomId: string, userId: string): Promise<boolean> {
    const isExist = await this.roomModel.exists({
      _id: roomId,
      isDeleted: { $ne: true }, // Bỏ qua các phòng đã bị giải tán
      members: {
        $elemMatch: {
          userId: userId,
          status: { $nin: ["removed", "left"] }, // Trạng thái không phải là đã bị xóa hoặc đã rời
        },
      },
    });

    return !!isExist;
  }

  /**
   * Kiểm tra người dùng đã là thành viên của phòng hay chưa (bằng Mã phòng - Code)
   */
  async checkUserInRoomByCode(
    roomCode: string,
    userId: string,
  ): Promise<boolean> {
    const isExist = await this.roomModel.exists({
      code: roomCode.trim(),
      isDeleted: { $ne: true },
      members: {
        $elemMatch: {
          userId: userId,
          status: { $nin: ["removed", "left"] },
        },
      },
    });

    return !!isExist;
  }

  async getRoomByIdForUser(roomId: string, userId: string): Promise<RoomResponse> {
    const room = await this.roomModel.findOne({
      _id: roomId,
      isDeleted: { $ne: true },
    });
    if (!room) {
      throw new NotFoundException("Phòng không tồn tại");
    }

    if (room.status === "blocked") {
      throw new ForbiddenException(
        "Phòng họp này đang bị tạm khóa do vi phạm quy định cộng đồng.",
      );
    }

    const member = room.members.find(
      (m) =>
        m.userId === userId &&
        m.status !== "removed" &&
        m.status !== "left",
    );
    if (!member) {
      throw new ForbiddenException("Bạn không còn là thành viên của phòng này");
    }

    // Sử dụng mapToRoomResponse với forUserId để tự động filter channels
    return mapToRoomResponse(room, userId);
  }

  /**
   * Đổi tên phòng họp
   */
  async renameRoom(roomId: string, name: string, userId: string): Promise<RoomResponse> {
    const room = await this.roomModel.findOne({
      _id: roomId,
      isDeleted: { $ne: true },
    });
    if (!room) throw new NotFoundException("Phòng không tồn tại");

    const oldName = room.name;
    room.name = name;
    await room.save();

    // Ghi nhận hoạt động
    const userInfo = await this.userModel.findOne({ supabaseId: userId });
    const actorName = userInfo?.displayName || "Người dùng";
    await this.activityModel.create({
      roomId,
      type: "RENAMED",
      metadata: {
        userId,
        details: `${actorName} đã đổi tên phòng từ "${oldName}" thành "${name}".`,
      },
    });

    const updatedRoomPayload = mapToRoomResponse(room);

    // Phát tín hiệu socket realtime
    this.roomsGateway.notifyRoomUpdated(roomId, {
      type: "room_renamed",
      roomId,
      name,
    });

    return updatedRoomPayload;
  }
}

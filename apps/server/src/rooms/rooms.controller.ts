import { Request } from "express";
import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Body,
  Param,
  Req,
  UseGuards,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Delete,
} from "@nestjs/common";
import { RoomsService } from "./rooms.service";
import { CreateRoomDto } from "./dto/create-room.dto";
import { JoinRoomDto } from "./dto/join-room.dto";
import { CreateChannelDto } from "./dto/create-channel.dto";
import { SupabaseGuard } from "../core/guards/supabase.guard";
import { RoomRoleGuard } from "../core/guards/room-role.guard";
import { ChannelRoleGuard } from "../core/guards/channel-role.guard";
import { Roles } from "../core/decorators/roles.decorator";

import { RoomMemberService } from "./room-member.service";
import { RoomChannelService } from "./room-channel.service";

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
  };
}

@Controller("rooms")
@UseGuards(SupabaseGuard)
export class RoomsController {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly roomMemberService: RoomMemberService,
    private readonly roomChannelService: RoomChannelService,
  ) {}

  /**
   * POST /api/rooms — Tạo phòng mới
   */
  @Post()
  async createRoom(
    @Body() dto: CreateRoomDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!dto.name) {
      throw new BadRequestException("Tên phòng là bắt buộc");
    }

    const userId = req.user.id;
    const result = await this.roomsService.createRoom(userId, dto);
    return result;
  }

  /**
   * GET /api/rooms/my — Lấy danh sách phòng của user hiện tại
   */
  @Get("my")
  async getMyRooms(@Req() req: AuthenticatedRequest) {
    const userId = req.user.id;
    return this.roomsService.getMyRooms(userId);
  }

  /**
   * GET /api/rooms/:id/members — Lấy toàn bộ danh sách thành viên trong phòng
   */
  @Get(":id/members")
  async getRoomMembers(
    @Param("id") roomId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id;
    return this.roomMemberService.getRoomMembers(roomId, userId);
  }

  /**
   * DELETE /api/rooms/:id/members/:userId — Xóa thành viên khỏi phòng
   */
  @Delete(":id/members/:userId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param("id") roomId: string,
    @Param("userId") targetUserId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const ownerId = req.user.id;
    await this.roomMemberService.removeMember(roomId, targetUserId, ownerId);
  }

  /**
   * PATCH /api/rooms/:id/members/:memberId/role — Cập nhật vai trò thành viên (Phân quyền: Bổ nhiệm / Thu hồi)
   */
  @Patch(":id/members/:memberId/role")
  async updateMemberRole(
    @Param("id") roomId: string,
    @Param("memberId") targetUserId: string,
    @Body("role") newRole: string,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!newRole) {
      throw new BadRequestException("Vai trò mới là bắt buộc");
    }
    const operatorId = req.user.id;
    return this.roomMemberService.updateMemberRole(
      roomId,
      targetUserId,
      newRole,
      operatorId,
    );
  }

  /**
   * POST /api/rooms/:id/transfer-owner — Chuyển quyền Chủ phòng / Giảng viên / Trưởng nhóm
   */
  @Post(":id/transfer-owner")
  async transferOwner(
    @Param("id") roomId: string,
    @Body("newOwnerId") newOwnerId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!newOwnerId) {
      throw new BadRequestException("ID người kế nhiệm là bắt buộc");
    }
    const operatorId = req.user.id;
    return this.roomsService.transferOwner(roomId, newOwnerId, operatorId);
  }

  /**
   * PATCH /api/rooms/:id/rename — Đổi tên phòng họp (Trưởng nhóm / Phó nhóm)
   */
  @Patch(":id/rename")
  @Roles("owner", "admin")
  @UseGuards(SupabaseGuard, RoomRoleGuard)
  async renameRoom(
    @Param("id") roomId: string,
    @Body("name") name: string,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!name || !name.trim()) {
      throw new BadRequestException("Tên phòng không được để trống");
    }
    const trimmedName = name.trim();
    if (trimmedName.length > 50) {
      throw new BadRequestException("Tên phòng không được vượt quá 50 ký tự");
    }
    const userId = req.user.id;
    return this.roomsService.renameRoom(roomId, trimmedName, userId);
  }

  /**
   * POST /api/rooms/join — Tham gia phòng bằng mã code
   */
  @Post("join")
  async joinRoom(@Body() dto: JoinRoomDto, @Req() req: AuthenticatedRequest) {
    if (!dto.code) {
      throw new BadRequestException("Mã phòng là bắt buộc");
    }

    const userId = req.user.id;
    return this.roomsService.joinRoom(userId, dto.code);
  }

  /**
   * POST /api/rooms/:id/channels — Thêm kênh mới (chỉ chủ phòng)
   */
  @Post(":id/channels")
  @Roles("owner", "admin")
  @UseGuards(SupabaseGuard, RoomRoleGuard) // Chạy Guard check quyền trước
  async addChannel(
    @Param("id") roomId: string,
    @Body() dto: CreateChannelDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException("Tên kênh không được để trống");
    }
    if (dto.name.trim().length > 30) {
      throw new BadRequestException("Tên kênh không được vượt quá 30 ký tự");
    }
    const userId = req.user.id;
    return this.roomChannelService.addChannel(
      userId,
      roomId,
      dto.name,
      dto.isPrivate,
      dto.initialMemberIds,
    );
  }

  /**
   * PATCH /api/rooms/:id/channels/:channelId/rename — Đổi tên kênh (Public / Private Channel)
   */
  @Patch(":id/channels/:channelId/rename")
  @Roles("owner", "admin")
  @UseGuards(SupabaseGuard, ChannelRoleGuard)
  async renameChannel(
    @Param("id") roomId: string,
    @Param("channelId") channelId: string,
    @Body("name") name: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id;
    return this.roomChannelService.renameChannel(
      userId,
      roomId,
      channelId,
      name,
    );
  }


  /**
   * PUT /api/rooms/:id/channels/:channelId/members/:targetUserId/role — Thay đổi vai trò trong kênh
   */
  @Put(":id/channels/:channelId/members/:targetUserId/role")
  async updateChannelMemberRole(
    @Param("id") roomId: string,
    @Param("channelId") channelId: string,
    @Param("targetUserId") targetUserId: string,
    @Body("role") role: "member" | "admin",
    @Req() req: AuthenticatedRequest,
  ) {
    if (!role) {
      throw new BadRequestException("Vai trò không được để trống");
    }
    const userId = req.user.id;
    return this.roomChannelService.updateChannelMemberRole(
      userId,
      roomId,
      channelId,
      targetUserId,
      role,
    );
  }

  /**
   * POST /api/rooms/:id/channels/:channelId/members — Thêm thành viên vào Kênh riêng tư
   */
  @Post(":id/channels/:channelId/members")
  async addChannelMember(
    @Param("id") roomId: string,
    @Param("channelId") channelId: string,
    @Req() req: AuthenticatedRequest,
    @Body("targetUserId") targetUserId?: string,
    @Body("emailOrUsername") emailOrUsername?: string,
  ) {
    if (!targetUserId && !emailOrUsername) {
      throw new BadRequestException(
        "Vui lòng nhập email, tên tài khoản hoặc ID người dùng",
      );
    }
    const userId = req.user.id;
    return this.roomChannelService.addChannelMember(
      userId,
      roomId,
      channelId,
      targetUserId,
    );
  }

  /**
   * DELETE /api/rooms/:id/channels/:channelId/members/:targetUserId — Xóa thành viên khỏi Kênh riêng tư
   */
  @Delete(":id/channels/:channelId/members/:targetUserId")
  async removeChannelMember(
    @Param("id") roomId: string,
    @Param("channelId") channelId: string,
    @Param("targetUserId") targetUserId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id;
    return this.roomChannelService.removeChannelMember(
      userId,
      roomId,
      channelId,
      targetUserId,
    );
  }

  /**
   * POST /api/rooms/:id/channels/:channelId/leave — Thành viên / Phó nhóm tự rời kênh
   */
  @Post(":id/channels/:channelId/leave")
  @HttpCode(HttpStatus.OK)
  async leaveChannel(
    @Param("id") roomId: string,
    @Param("channelId") channelId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id;
    return this.roomChannelService.leaveChannel(userId, roomId, channelId);
  }

  /**
   * POST /api/rooms/:id/members/invite — Thêm thành viên bằng email hoặc userId
   */
  @Post(":id/members/invite")
  async addMemberByEmailOrId(
    @Param("id") roomId: string,
    @Body("email") email: string | undefined,
    @Body("targetUserId") targetUserId: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!email && !targetUserId) {
      throw new BadRequestException("Email hoặc ID người dùng là bắt buộc");
    }
    const userId = req.user.id;
    try {
      return await this.roomMemberService.addMemberByEmailOrId(userId, roomId, {
        email,
        targetUserId,
      });
    } catch (err) {
      console.error("[RoomsController] addMemberByEmailOrId error:", err);
      throw err;
    }
  }

  /**
   * POST /api/rooms/:id/leave — Rời khỏi phòng
   */
  @Post(":id/leave")
  @HttpCode(HttpStatus.NO_CONTENT)
  async leaveRoom(
    @Param("id") roomId: string,
    @Body("newOwnerId") newOwnerId: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id;
    // Kiểm tra quyền thành viên trước
    await this.roomsService.getRoomByIdForUser(roomId, userId);
    await this.roomsService.leaveRoom(roomId, userId, newOwnerId);
  }

  /**
   * GET /api/rooms/code/:code — Lấy thông tin sơ bộ của phòng bằng mã code
   */
  @Get("code/:code")
  async getRoomByCode(@Param("code") code: string) {
    return this.roomsService.getRoomByCode(code);
  }

  /**
   * GET /api/rooms/:id — Lấy chi tiết phòng
   */
  @Get(":id")
  async getRoomById(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user.id;
    return this.roomsService.getRoomByIdForUser(id, userId);
  }

  /**
   * DELETE /api/rooms/:id — Giải tán phòng họp (chủ phòng thực hiện)
   */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async disbandRoom(
    @Param("id") roomId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id;
    await this.roomsService.disbandRoom(roomId, userId);
  }

  // Hưng thêm vào, không đụng phần code bên dưới

  /**
   * GET /api/rooms/:id/check-member — Kiểm tra thành viên có trong phòng không (bằng ID)
   */
  @Get(":id/check-member")
  async checkMemberById(
    @Param("id") roomId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id; // Lấy userId từ JWT token[cite: 9]
    const isMember = await this.roomsService.checkUserInRoomById(
      roomId,
      userId,
    );
    return { isMember };
  }

  /**
   * GET /api/rooms/code/:code/check-member — Kiểm tra thành viên có trong phòng không (bằng Code)
   */
  @Get("code/:code/check-member")
  async checkMemberByCode(
    @Param("code") code: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id; // Lấy userId từ JWT token[cite: 9]
    const isMember = await this.roomsService.checkUserInRoomByCode(
      code,
      userId,
    );
    return { isMember };
  }
}

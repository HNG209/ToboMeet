import {
  Controller,
  Post,
  Param,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Body,
  Delete,
  Get,
  Put,
  Patch,
  Query,
} from "@nestjs/common";
import { Response } from "express";
import { MeetingsService } from "./meetings.service";
import { SupabaseGuard } from "../core/guards/supabase.guard";
import { Roles } from "../core/decorators/roles.decorator";
import { ChannelRoleGuard } from "../core/guards/channel-role.guard";
import { MeetingInviteService } from "./meeting-invite.service";
import { MeetingRoleGuard } from "../core/guards/meeting-role.guard";
import { AttendanceService } from "./attendance.service";
import { UpdateWhiteboardSettingsDto } from "./dtos/whiteboard-settings.dto";

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email?: string;
    user_metadata?: {
      full_name?: string;
      name?: string;
      display_name?: string;
      avatar_url?: string;
      [key: string]: any;
    };
    [key: string]: any;
  };
}

import { WhiteboardService } from "./whiteboard.service";

@Controller("rooms/:id/channels/:channelId/meetings")
export class ChannelMeetingsController {
  constructor(
    private readonly meetingsService: MeetingsService,
    private readonly whiteboardService: WhiteboardService,
  ) { }

  /**
   * GET /api/rooms/:id/channels/:channelId/meetings/active
   * Lấy trạng thái cuộc họp đang diễn ra trong kênh
   */
  @Get("active")
  @UseGuards(SupabaseGuard)
  async getActiveMeeting(
    @Param("id") roomId: string,
    @Param("channelId") channelId: string,
  ) {
    return this.meetingsService.getActiveMeeting(roomId, channelId);
  }

  /**
   * POST /api/rooms/:id/channels/:channelId/meetings/ensure
   * Lấy hoặc tạo meetingCode cho channel
   */
  @Post("ensure")
  @Roles("owner", "admin", "member")
  @UseGuards(SupabaseGuard, ChannelRoleGuard)
  async ensureChannelMeeting(
    @Param("id") roomId: string,
    @Param("channelId") channelId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id;
    return this.meetingsService.ensureChannelMeeting(roomId, channelId, userId);
  }

  /**
   * GET /api/rooms/:id/channels/:channelId/meetings/whiteboard-access
   * Kiểm tra quyền truy cập Whiteboard của người dùng trong kênh
   */
  @Get("whiteboard-access")
  @UseGuards(SupabaseGuard)
  async checkChannelWhiteboardAccess(
    @Param("id") roomId: string,
    @Param("channelId") channelId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id;
    return this.whiteboardService.checkChannelWhiteboardAccess(
      roomId,
      channelId,
      userId,
    );
  }
}

@Controller("meetings")
export class MeetingsController {
  constructor(
    private readonly meetingsService: MeetingsService,
    private readonly attendanceService: AttendanceService,
    private readonly meetingInviteService: MeetingInviteService,
    private readonly whiteboardService: WhiteboardService,
  ) { }

  /**
   * POST /meetings/join
   * Hàm join duy nhất (hỗ trợ cả channel + personal)
   */
  @Post("join")
  @UseGuards(SupabaseGuard)
  async joinMeeting(
    @Body()
    body: {
      meetingCode: string;
      deviceId: string;
      displayName?: string;
      forceSwitch?: boolean;
      allowStart?: boolean;
    },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.meetingsService.joinMeeting(
      body.meetingCode,
      req.user.id,
      body.deviceId,
      body.displayName,
      body.forceSwitch ?? false,
      body.allowStart ?? false,
    );
  }

  /**
   * GET /meetings/:meetingCode/can-start
   * Frontend dùng để quyết định hiện nút "Bắt đầu" hay không
   */
  @Get(":meetingCode/can-start")
  @UseGuards(SupabaseGuard)
  async canStartMeeting(
    @Param("meetingCode") meetingCode: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.meetingsService.canStartMeeting(meetingCode, req.user.id);
  }

  /**
   * POST /meetings/personal/ensure
   * Lấy hoặc tạo personal meeting của user hiện tại
   */
  @Post("personal/ensure")
  @UseGuards(SupabaseGuard)
  async ensurePersonalMeeting(@Req() req: AuthenticatedRequest) {
    return this.meetingsService.ensurePersonalMeeting(req.user.id);
  }

  /**
   * POST /meetings/:meetingCode/captions/ensure
   * Đảm bảo STT agent được dispatch vào cuộc họp khi bật live captions
   */
  @Post(":meetingCode/captions/ensure")
  @UseGuards(SupabaseGuard)
  async ensureCaptions(@Param("meetingCode") meetingCode: string) {
    return this.meetingsService.ensureSttAgent(meetingCode);
  }


  /**
   * GET /api/meetings/:meetingCode/member-status
   * Kiểm tra trạng thái thành viên trong phòng của người dùng không lộ roomId
   * Chỉ trả về roomId khi là thành viên trong phòng (dùng điều hướng)
   */
  @Get(":meetingCode/member-status")
  @UseGuards(SupabaseGuard)
  async getMemberStatus(
    @Param("meetingCode") meetingCode: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id;

    return this.meetingsService.getMemberStatus(meetingCode, userId);
  }

  /**
   * POST /api/meetings/presigned
   * Xin presigned upload url để upload file lên chat của meeting
   */
  @Post("presigned")
  @UseGuards(SupabaseGuard)
  async getPresignedUrl(
    @Body() body: { fileName: string; meetingCode: string },
  ) {
    return this.meetingsService.generatePresignedUrl(
      body.fileName,
      body.meetingCode,
    );
  }

  /**
   * POST /api/meetings/sessions/:sessionId/invite
   * Gửi lời mời tham gia cuộc họp
   */
  @Post(":meetingCode/invite")
  @UseGuards(SupabaseGuard)
  async inviteToMeeting(
    @Param("meetingCode") meetingCode: string,
    @Body("inviteeId") inviteeId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const inviterId = req.user.id;
    return this.meetingInviteService.sendMeetingInvite(
      inviterId,
      inviteeId,
      meetingCode,
    );
  }

  /**
   * GET /api/meetings/sessions/:sessionId/exchange
   * Đổi sessionId lấy thông tin phòng để tham gia
   */
  @Get("sessions/:sessionId/exchange")
  @UseGuards(SupabaseGuard)
  async exchangeSession(
    @Param("sessionId") sessionId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id;
    return this.meetingInviteService.exchangeSessionForCode(userId, sessionId);
  }

  /**
   * POST /api/meetings/:code/screen-share/start
   * Cấp quyền chia sẻ màn hình
   */
  @Post(":code/screen-share/start")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SupabaseGuard)
  async startScreenShare(
    @Param("code") meetingCode: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id;
    await this.meetingsService.requestScreenShare(meetingCode, userId);
  }

  /**
   * POST /api/meetings/:code/screen-share/stop
   * Trả lại quyền chia sẻ màn hình (Nhả khóa để người khác có thể Share)
   */
  @Post(":code/screen-share/stop")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SupabaseGuard)
  async stopScreenShare(
    @Param("code") meetingCode: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id;
    await this.meetingsService.revokeScreenShare(meetingCode, userId);
  }

  /**
   * POST /api/meetings/:code/whiteboard-token
   * Lấy token JWT RS256 để kết nối vào Whiteboard của cuộc họp
   */
  @Post(":code/whiteboard-token")
  @UseGuards(SupabaseGuard)
  async getWhiteboardToken(
    @Param("code") meetingCode: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id;
    const displayName =
      req.user.user_metadata?.full_name ||
      req.user.user_metadata?.name ||
      req.user.user_metadata?.display_name ||
      req.user.email?.split("@")[0] ||
      "Người dùng";
    return this.whiteboardService.generateWhiteboardToken(
      meetingCode,
      userId,
      displayName,
    );
  }

  /**
   * GET /api/meetings/:code/whiteboard-access
   * Kiểm tra quyền truy cập Whiteboard của người dùng trong cuộc họp
   */
  @Get(":code/whiteboard-access")
  @UseGuards(SupabaseGuard)
  async checkWhiteboardAccess(
    @Param("code") meetingCode: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id;
    return this.whiteboardService.checkWhiteboardAccess(meetingCode, userId);
  }

  /**
   * PATCH /api/meetings/:code/whiteboard-settings
   * Cập nhật phân quyền Whiteboard (Chỉ Owner + Admin)
   */
  @Patch(":code/whiteboard-settings")
  @Roles("owner", "admin")
  @UseGuards(SupabaseGuard, MeetingRoleGuard)
  async updateWhiteboardSettings(
    @Param("code") meetingCode: string,
    @Body() body: UpdateWhiteboardSettingsDto,
  ) {
    return this.whiteboardService.updateWhiteboardSettings(meetingCode, body);
  }

  /**
   * GET /api/meetings/:code/whiteboard-settings
   * Lấy cấu hình phân quyền Whiteboard hiện tại của cuộc họp
   */
  @Get(":code/whiteboard-settings")
  @UseGuards(SupabaseGuard, MeetingRoleGuard)
  async getWhiteboardSettings(@Param("code") meetingCode: string) {
    return this.whiteboardService.getWhiteboardSettings(meetingCode);
  }


  /**
   * PATCH /api/meetings/:code/participants/rename
   * Đổi tên chính mình trong cuộc họp (Cập nhật Attendance DB và LiveKit realtime)
   */
  @Patch(":code/participants/rename")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SupabaseGuard, MeetingRoleGuard)
  async renameParticipant(
    @Req() req: AuthenticatedRequest,
    @Param("code") meetingCode: string,
    @Body() body: { name: string },
  ): Promise<void> {
    const userId = req.user.id;
    await this.attendanceService.renameParticipant(
      meetingCode,
      userId,
      body.name,
    );
  }

  /**
 * PUT /api/meetings/:code/participants/:identity/mute
 * Tắt Mic / Camera của người dùng (Chỉ Admin/Owner)
 */
  @Put(":code/participants/:identity/mute")
  @Roles("owner", "admin")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SupabaseGuard, MeetingRoleGuard)
  async muteParticipant(
    @Param("code") meetingCode: string,
    @Param("identity") participantIdentity: string,
    @Body() body: { trackType: "audio" | "video" },
  ) {
    await this.meetingsService.muteParticipantTrack(
      meetingCode,
      participantIdentity,
      body.trackType,
    );
  }

  /**
 * DELETE /api/meetings/:code/participants/:identity
 * Chỉ Chủ phòng hoặc Admin mới được phép đuổi người dùng ra khỏi cuộc họp
 */
  @Delete(":code/participants/:identity")
  @Roles("owner", "admin")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SupabaseGuard, MeetingRoleGuard)
  async removeParticipant(
    @Param("code") meetingCode: string,
    @Param("identity") participantIdentity: string,
  ) {
    await this.meetingsService.removeParticipant(
      meetingCode,
      participantIdentity,
    );
  }

  /**
 * PATCH /api/meetings/:code/approval-permission
 * Thay đổi thiết lập ai được phép duyệt vào phòng
 */
  @Patch(":code/approval-permission")
  @Roles("owner", "admin")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SupabaseGuard, MeetingRoleGuard)
  async updateApprovalPermission(
    @Param("code") meetingCode: string,
    @Body()
    body: { permission: "admin_only" | "member_and_admin" | "everyone" },
  ) {
    await this.meetingsService.updateApprovalPermission(
      meetingCode,
      body.permission,
    );
  }

  /**
 * PATCH /api/meetings/:code/participants/:identity/approve
 * Phê duyệt người dùng từ phòng chờ vào cuộc họp chính
 */
  @Patch(":code/participants/:identity/approve")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SupabaseGuard, MeetingRoleGuard)
  async approveParticipant(
    @Req() req: AuthenticatedRequest,
    @Param("code") meetingCode: string,
    @Param("identity") participantIdentity: string, // người đang chờ được phê duyệt
  ) {
    const requesterId = req.user.id; // người duyệt
    await this.meetingsService.approveParticipant(
      requesterId,
      meetingCode,
      participantIdentity,
    );
  }

  /**
 * PATCH /api/meetings/:code/waiting-room-status
 * Bật/tắt tính năng phòng chờ
 */
  @Patch(":code/waiting-room-status")
  @Roles("owner", "admin")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SupabaseGuard, MeetingRoleGuard)
  async toggleWaitingRoom(
    @Param("code") meetingCode: string,
    @Body() body: { isWaitingRoomEnabled: boolean },
  ) {
    await this.meetingsService.toggleWaitingRoom(
      meetingCode,
      body.isWaitingRoomEnabled,
    );
  }

  /**
 * PUT /api/meetings/:code/chat-status
 * Bật/tắt tính năng chat trong cuộc họp (Chỉ Chủ phòng hoặc Admin trong kênh)
 */
  @Put(":code/chat-status")
  @Roles("owner", "admin")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SupabaseGuard, MeetingRoleGuard)
  async toggleChat(
    @Param("code") meetingCode: string,
    @Body() body: { isChatEnabled: boolean },
  ) {
    await this.meetingsService.toggleRoomChat(meetingCode, body.isChatEnabled);
  }

  @Get(":code/attendance")
  @UseGuards(SupabaseGuard)
  async getAttendance(
    @Param("code") meetingCode: string,
    @Query("sessionId") sessionId?: string,
  ) {
    return this.attendanceService.getByMeetingCode(meetingCode, sessionId);
  }

  /**
   * GET /api/meetings/:code/attendance/export
   * Xuất danh sách điểm danh ra file Excel (.xlsx)
   */
  @Get(":code/attendance/export")
  @UseGuards(SupabaseGuard)
  async exportAttendanceExcel(
    @Param("code") meetingCode: string,
    @Query("sessionId") sessionId: string | undefined,
    @Query("lang") lang: string | undefined,
    @Query("mode") mode: "detailed" | "minimal" | "summary" | undefined,
    @Res() res: Response,
  ) {
    const validMode =
      mode === "minimal" || mode === "summary" ? "minimal" : "detailed";
    const { buffer, fileName } =
      await this.attendanceService.exportAttendanceExcel(
        meetingCode,
        sessionId,
        lang || "vi",
        validMode,
      );

    const safeFilename = encodeURIComponent(fileName);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"; filename*=UTF-8''${safeFilename}`,
    );
    res.setHeader("Content-Length", buffer.length);

    res.send(buffer);
  }

  /**
   * GET /api/meetings/:code/sessions
   * Lấy danh sách các phiên họp của meetingCode có phân trang
   */
  @Get(":code/sessions")
  @UseGuards(SupabaseGuard)
  async getMeetingSessions(
    @Param("code") meetingCode: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: number,
  ) {
    const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 50));
    return this.meetingsService.getMeetingSessions(
      meetingCode,
      cursor,
      parsedLimit,
    );
  }
}


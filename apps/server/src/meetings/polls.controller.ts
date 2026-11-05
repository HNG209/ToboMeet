import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { PollsService } from "./polls.service";
import { SupabaseGuard } from "../core/guards/supabase.guard";
import { MeetingRoleGuard } from "../core/guards/meeting-role.guard";
import { Roles } from "../core/decorators/roles.decorator";
import { CreatePollDto, VotePollDto } from "./dtos/poll.dto";

@Controller("meetings/:code/polls")
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class PollsController {
  constructor(private readonly pollsService: PollsService) {}

  /**
   * POST /api/meetings/:code/polls
   * HOST / ADMIN: Tạo cuộc bình chọn mới
   */
  @Post()
  @Roles("owner", "admin")
  @UseGuards(SupabaseGuard, MeetingRoleGuard)
  @HttpCode(HttpStatus.CREATED)
  async createPoll(
    @Param("code") meetingCode: string,
    @Req() req: any,
    @Body() dto: CreatePollDto,
  ) {
    const userId = req.user?.id;
    return this.pollsService.createPoll(meetingCode, userId, dto);
  }

  /**
   * GET /api/meetings/:code/polls
   * Lấy danh sách bình chọn trong phiên họp (ongoing hoặc theo sessionId)
   */
  @Get()
  @UseGuards(SupabaseGuard)
  async getPolls(
    @Param("code") meetingCode: string,
    @Query("sessionId") sessionId?: string,
  ) {
    return this.pollsService.getPolls(meetingCode, sessionId);
  }

  /**
   * POST /api/meetings/:code/polls/:pollId/vote
   * Người tham gia thực hiện bỏ phiếu
   */
  @Post(":pollId/vote")
  @UseGuards(SupabaseGuard)
  @HttpCode(HttpStatus.OK)
  async votePoll(
    @Param("code") meetingCode: string,
    @Param("pollId") pollId: string,
    @Req() req: any,
    @Body() dto: VotePollDto,
  ) {
    const userId = req.user?.id;
    return this.pollsService.votePoll(meetingCode, pollId, userId, dto);
  }

  /**
   * PATCH /api/meetings/:code/polls/:pollId/close
   * HOST / ADMIN: Đóng cuộc bình chọn
   */
  @Patch(":pollId/close")
  @Roles("owner", "admin")
  @UseGuards(SupabaseGuard, MeetingRoleGuard)
  async closePoll(
    @Param("code") meetingCode: string,
    @Param("pollId") pollId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id;
    return this.pollsService.closePoll(meetingCode, pollId, userId);
  }

  /**
   * DELETE /api/meetings/:code/polls/:pollId
   * HOST / ADMIN: Xóa cuộc bình chọn
   */
  @Delete(":pollId")
  @Roles("owner", "admin")
  @UseGuards(SupabaseGuard, MeetingRoleGuard)
  async deletePoll(
    @Param("code") meetingCode: string,
    @Param("pollId") pollId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id;
    return this.pollsService.deletePoll(meetingCode, pollId, userId);
  }
}

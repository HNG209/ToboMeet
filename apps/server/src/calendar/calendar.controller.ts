import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  Patch,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { CalendarService } from "./calendar.service";
import { SupabaseGuard } from "../core/guards/supabase.guard";
import { CreateEventDto } from "./dto/create-event.dto";
import { UpdateEventDto } from "./dto/update-event.dto";
import { UpdateRsvpDto } from "./dto/update-rsvp.dto";
import { GetEventsDto } from "./dto/get-events.dto";
import { RestoreOccurrenceDto } from "./dto/restore-occurrence.dto";
import { InviteUsersDto } from "./dto/invite-users.dto";
import { ToggleNotificationDto } from "./dto/toggle-notification.dto";

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
  };
}

@Controller("calendar")
@UseGuards(SupabaseGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) { }

  @Post()
  async createEvent(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateEventDto,
  ) {
    return this.calendarService.createEvent(req.user.id, body);
  }

  @Get("search")
  async searchEvents(
    @Req() req: AuthenticatedRequest,
    @Query("q") query: string,
  ) {
    console.log(`[Backend Search API] User: ${req.user.id}, Keyword: "${query}"`);
    const result = await this.calendarService.searchEvents(req.user.id, query);
    console.log(`[Backend Search API] Found ${result.length} results`);
    return {
      code: 200,
      message: "Tìm kiếm lịch họp thành công",
      result,
    };
  }

  @Get()
  async getEvents(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetEventsDto,
  ) {
    return this.calendarService.getEvents(
      req.user.id,
      query.start,
      query.end,
      {
        roomId: query.roomId,
        createdByMe: query.createdByMe === "true",
      },
    );
  }

  @Put(":id")
  async updateEvent(
    @Req() req: AuthenticatedRequest,
    @Param("id") eventId: string,
    @Query("type") updateType: "single" | "all" = "all",
    @Query("occurrenceDate") occurrenceDate?: string,
    @Body() body: UpdateEventDto = {},
  ) {
    return this.calendarService.updateEvent(
      req.user.id,
      eventId,
      updateType,
      body,
      occurrenceDate,
    );
  }

  @Delete(":id")
  async deleteEvent(
    @Req() req: AuthenticatedRequest,
    @Param("id") eventId: string,
    @Query("type") deleteType: "single" | "all" = "all",
    @Query("occurrenceDate") occurrenceDate?: string,
  ) {
    return this.calendarService.deleteEvent(
      req.user.id,
      eventId,
      deleteType,
      occurrenceDate,
    );
  }

  @Post(":id/restore")
  async restoreOccurrence(
    @Req() req: AuthenticatedRequest,
    @Param("id") eventId: string,
    @Body() body: RestoreOccurrenceDto,
  ) {
    return this.calendarService.restoreOccurrence(
      req.user.id,
      eventId,
      body.occurrenceDate,
    );
  }

  @Patch(":id/rsvp")
  async updateRSVP(
    @Req() req: AuthenticatedRequest,
    @Param("id") eventId: string,
    @Body() body: UpdateRsvpDto,
  ) {
    return this.calendarService.updateRSVP(req.user.id, eventId, body.status);
  }

  @Get(":id/rsvp")
  async getRSVPList(@Param("id") eventId: string) {
    return this.calendarService.getRSVPList(eventId);
  }

  @Post(":id/invite")
  async inviteUsers(
    @Req() req: AuthenticatedRequest,
    @Param("id") eventId: string,
    @Body() body: InviteUsersDto,
  ) {
    return this.calendarService.inviteUsers(req.user.id, eventId, body);
  }

  @Post(":id/leave")
  async leaveEvent(
    @Req() req: AuthenticatedRequest,
    @Param("id") eventId: string,
  ) {
    return this.calendarService.leaveEvent(req.user.id, eventId);
  }

  @Patch(":id/notification")
  async toggleNotification(
    @Req() req: AuthenticatedRequest,
    @Param("id") eventId: string,
    @Body() body: ToggleNotificationDto,
  ) {
    return this.calendarService.toggleNotification(
      req.user.id,
      eventId,
      body?.enabled,
    );
  }
}


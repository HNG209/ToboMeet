// src/meetings/meetings.module.ts
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { BullModule } from "@nestjs/bullmq";
import {
  ChannelMeetingsController,
  MeetingsController,
} from "./meetings.controller";
import { MeetingsService } from "./meetings.service";
import { Meeting, MeetingSchema } from "./schemas/meeting.schema";
import { User, UserSchema } from "../users/schemas/user.schema";
import { Room, RoomSchema } from "../rooms/schemas/room.schema";
import {
  RoomActivity,
  RoomActivitySchema,
} from "../rooms/schemas/room-activity.schema";
import { MeetingsGateway } from "./meetings.gateway";
import { SupabaseModule } from "../supabase/supabase.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { CoreModule } from "../core/core.module";
import {
  MeetingSession,
  MeetingSessionSchema,
} from "./schemas/meeting-session.schema";
import { MeetingInviteService } from "./meeting-invite.service";
import { BreakoutRoomsController } from "./breakout-rooms.controller";
import { BreakoutRoomsService } from "./breakout-rooms.service";
import { MeetingProcessor } from "./processors/meeting.processor";
import { Attendance, AttendanceSchema } from "./schemas/attendance.schema";
import { AttendanceService } from "./attendance.service";
import { RecordingsController } from "./recordings.controller";
import { RecordingsService } from "./recordings.service";
import { WhiteboardService } from "./whiteboard.service";
import { Poll, PollSchema } from "./schemas/poll.schema";
import { PollsController } from "./polls.controller";
import { PollsService } from "./polls.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Meeting.name, schema: MeetingSchema },
      { name: User.name, schema: UserSchema },
      { name: Room.name, schema: RoomSchema },
      { name: RoomActivity.name, schema: RoomActivitySchema },
      { name: MeetingSession.name, schema: MeetingSessionSchema },
      { name: Attendance.name, schema: AttendanceSchema },
      { name: Poll.name, schema: PollSchema },
    ]),
    BullModule.registerQueue({
      name: "meeting",
    }),
    SupabaseModule,
    NotificationsModule,
    CoreModule,
  ],
  controllers: [
    BreakoutRoomsController,
    MeetingsController,
    ChannelMeetingsController,
    RecordingsController,
    PollsController,
  ],
  providers: [
    BreakoutRoomsService,
    MeetingsService,
    WhiteboardService,
    MeetingInviteService,
    AttendanceService,
    RecordingsService,
    MeetingsGateway,
    MeetingProcessor,
    PollsService,
  ],
  exports: [
    AttendanceService,
    BreakoutRoomsService,
    MeetingsService,
    WhiteboardService,
    RecordingsService,
    MeetingInviteService,
    MeetingsGateway,
    PollsService,
  ],
})
export class MeetingsModule {}

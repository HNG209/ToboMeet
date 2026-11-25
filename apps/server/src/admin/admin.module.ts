import { Module, forwardRef } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { AdminRoomsController } from "./admin-rooms.controller";
import { AdminRoomsService } from "./admin-rooms.service";
import { AdminReportsController } from "./admin-reports.controller";
import { AdminReportsService } from "./admin-reports.service";
import { User, UserSchema } from "../users/schemas/user.schema";
import {
  DeviceSession,
  DeviceSessionSchema,
} from "../users/schemas/device-session.schema";
import { Room, RoomSchema } from "../rooms/schemas/room.schema";
import { Meeting, MeetingSchema } from "../meetings/schemas/meeting.schema";
import { RoomReport, RoomReportSchema } from "../rooms/schemas/room-report.schema";
import { RoomActivity, RoomActivitySchema } from "../rooms/schemas/room-activity.schema";
import { Report, ReportSchema } from "../reports/schemas/report.schema";
import { ReportsModule } from "../reports/reports.module";
import { MeetingsModule } from "../meetings/meetings.module";
import { SupabaseModule } from "../supabase/supabase.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: DeviceSession.name, schema: DeviceSessionSchema },
      { name: Room.name, schema: RoomSchema },
      { name: Meeting.name, schema: MeetingSchema },
      { name: RoomReport.name, schema: RoomReportSchema },
      { name: RoomActivity.name, schema: RoomActivitySchema },
      { name: Report.name, schema: ReportSchema },
    ]),
    forwardRef(() => MeetingsModule),
    SupabaseModule,
    ReportsModule,
  ],
  controllers: [AdminController, AdminRoomsController, AdminReportsController],
  providers: [AdminService, AdminRoomsService, AdminReportsService],
  exports: [AdminService, AdminRoomsService, AdminReportsService],
})
export class AdminModule {}

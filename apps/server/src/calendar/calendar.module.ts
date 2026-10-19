// src/calendar/calendar.module.ts
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { CalendarController } from "./calendar.controller";
import { CalendarService } from "./calendar.service";
import { CalendarEvent, CalendarEventSchema } from "./schemas/calendar-event.schema";
import { User, UserSchema } from "../users/schemas/user.schema";
import { Room, RoomSchema } from "../rooms/schemas/room.schema";
import { CoreModule } from "../core/core.module";
import { SupabaseModule } from "../supabase/supabase.module";
import { PostSchema } from "../news-feed/schemas/post.schema";
import { MeetingsModule } from "../meetings/meetings.module";

import { BullModule } from "@nestjs/bullmq";
import { CalendarProcessor } from "./processors/calendar.processor";

import { Assignment, AssignmentSchema } from "../assignments/schemas/assignment.schema";
import {
  AssignmentSubmission,
  AssignmentSubmissionSchema,
} from "../assignments/schemas/submission.schema";
import { VectorDbModule } from "../vector-db/vector-db.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CalendarEvent.name, schema: CalendarEventSchema },
      { name: User.name, schema: UserSchema },
      { name: Room.name, schema: RoomSchema },
      { name: "Post", schema: PostSchema },
      { name: Assignment.name, schema: AssignmentSchema },
      { name: AssignmentSubmission.name, schema: AssignmentSubmissionSchema },
    ]),
    BullModule.registerQueue({
      name: "calendar",
    }),
    CoreModule,
    SupabaseModule,
    MeetingsModule,
    VectorDbModule,
  ],
  controllers: [CalendarController],
  providers: [CalendarService, CalendarProcessor],
  exports: [CalendarService],
})
export class CalendarModule {}

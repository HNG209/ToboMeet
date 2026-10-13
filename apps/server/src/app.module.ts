import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { UsersModule } from "./users/users.module";
import { RoomsModule } from "./rooms/rooms.module";
import { MeetingsModule } from "./meetings/meetings.module";
import { CalendarModule } from "./calendar/calendar.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { AdminModule } from "./admin/admin.module";
import { SupabaseModule } from "./supabase/supabase.module";
import { ReportsModule } from "./reports/reports.module";
import { UploadsModule } from "./uploads/uploads.module";
import { NewsFeedModule } from "./news-feed/news-feed.module";
import { ChannelFilesModule } from "./channel-files/channel-files.module";
import { AssignmentsModule } from "./assignments/assignments.module";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { BullModule } from "@nestjs/bullmq";
import { SchedulerClientModule } from "./scheduler-client/scheduler-client.module";
import { AiAgentModule } from "./ai-agent/ai-agent.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    EventEmitterModule.forRoot(),
    SchedulerClientModule,
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>("MONGODB_URI"),
      }),
      inject: [ConfigService],
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }),
    MeetingsModule,
    CalendarModule,
    UsersModule,
    RoomsModule,
    WebhooksModule,
    AdminModule,
    SupabaseModule,
    ReportsModule,
    UploadsModule,
    NewsFeedModule,
    ChannelFilesModule,
    AssignmentsModule,
    AiAgentModule,
  ],
})
export class AppModule { }

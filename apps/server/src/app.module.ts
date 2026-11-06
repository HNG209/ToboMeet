import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerModule, RedisStore, ResilientStore } from "nestjs-advanced-rate-limiter";
import Redis from "ioredis";
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
import { DirectChatModule } from "./direct-chat/direct-chat.module";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { BullModule } from "@nestjs/bullmq";
import { SchedulerClientModule } from "./scheduler-client/scheduler-client.module";
import { AiAgentModule } from "./ai-agent/ai-agent.module";
import { VectorDbModule } from "./vector-db/vector-db.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisHost = configService.get<string>("REDIS_HOST", "localhost");
        const redisPort = parseInt(configService.get<string>("REDIS_PORT", "6379"), 10);
        const redis = new Redis({
          host: redisHost,
          port: redisPort,
          maxRetriesPerRequest: 2,
          lazyConnect: false,
        });

        const store = new ResilientStore(new RedisStore(redis as any, "tobomeet:rl:"), {
          failMode: "open",
          onError: (err: any) => {
            console.warn("[RateLimiter] Redis error, falling back to allow traffic:", err?.message || err);
          },
        });

        return {
          store,
          algorithm: {
            algorithm: "token-bucket",
            capacity: 100,
            refillRate: 10,
          },
          errorMessage: "Yêu cầu quá nhiều lần. Vui lòng đợi trong giây lát rồi thử lại.",
          getTracker: (req) => {
            const userId = req.user?.id || req.user?.sub;
            const ip =
              req.headers?.["cf-connecting-ip"] ||
              (typeof req.headers?.["x-forwarded-for"] === "string"
                ? req.headers["x-forwarded-for"].split(",")[0]?.trim()
                : req.headers?.["x-forwarded-for"]?.[0]) ||
              req.ip ||
              req.socket?.remoteAddress ||
              "unknown";
            const identity = userId ? `user:${userId}` : `ip:${ip}`;
            const route = req.baseUrl
              ? `${req.baseUrl}${req.route?.path || ""}`
              : (req.originalUrl ? req.originalUrl.split("?")[0] : req.path || "general");
            return `${identity}:${route}`;
          },
        };
      },
    }),
    EventEmitterModule.forRoot(),
    SchedulerClientModule,
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>("MONGODB_URI"),
        maxPoolSize: 10,
        minPoolSize: 1,
        serverSelectionTimeoutMS: 5000,
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
    VectorDbModule,
    DirectChatModule,
  ],
})
export class AppModule { }

import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { CalendarModule } from "../calendar/calendar.module";
import { SupabaseModule } from "../supabase/supabase.module";
import { VectorDbModule } from "../vector-db/vector-db.module";
import { CalendarEvent, CalendarEventSchema } from "../calendar/schemas/calendar-event.schema";
import { User, UserSchema } from "../users/schemas/user.schema";
import { AiAgentController } from "./ai-agent.controller";
import { AiAgentService } from "./ai-agent.service";

@Module({
  imports: [
    ConfigModule,
    CalendarModule,
    SupabaseModule,
    VectorDbModule,
    MongooseModule.forFeature([
      { name: CalendarEvent.name, schema: CalendarEventSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AiAgentController],
  providers: [AiAgentService],
  exports: [AiAgentService],
})
export class AiAgentModule {}

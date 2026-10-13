import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { CalendarModule } from "../calendar/calendar.module";
import { SupabaseModule } from "../supabase/supabase.module";
import { AiAgentController } from "./ai-agent.controller";
import { AiAgentService } from "./ai-agent.service";

@Module({
  imports: [ConfigModule, CalendarModule, SupabaseModule],
  controllers: [AiAgentController],
  providers: [AiAgentService],
  exports: [AiAgentService],
})
export class AiAgentModule {}

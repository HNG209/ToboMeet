import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { AiAgentService } from "./ai-agent.service";
import { SupabaseGuard } from "../core/guards/supabase.guard";
import { ChatAgentDto } from "./dto/chat-agent.dto";
import type { Request } from "express";

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email?: string;
  };
}

@Controller("ai-agent")
@UseGuards(SupabaseGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AiAgentController {
  constructor(private readonly aiAgentService: AiAgentService) {}

  @Post("chat")
  async chat(
    @Req() req: AuthenticatedRequest,
    @Body() body: ChatAgentDto,
  ) {
    // LUÔN DÙNG ID PARSE TỪ TOKEN CỦA REQUEST, KHÔNG CHO USER TỰ Ý TRUYỀN ID NGƯỜI KHÁC VÀO
    const userId = req.user.id;
    return this.aiAgentService.chat(userId, body);
  }
}

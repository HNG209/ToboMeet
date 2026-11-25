import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "nestjs-advanced-rate-limiter";
import { SupabaseGuard } from "../core/guards/supabase.guard";
import { DesktopAuthService } from "./desktop-auth.service";

@Controller("auth")
export class DesktopAuthController {
  constructor(private readonly desktopAuthService: DesktopAuthService) {}

  /**
   * POST /api/auth/desktop-code
   * Trình duyệt web (đã đăng nhập) gọi endpoint này để tạo one-time code lưu trong Redis (TTL 60s).
   */
  @Post("desktop-code")
  @UseGuards(SupabaseGuard, ThrottlerGuard)
  @Throttle({ algorithm: "token-bucket", capacity: 15, refillRate: 1 })
  async createDesktopCode(
    @Req() req: any,
    @Body() body: { state?: string },
  ) {
    return this.desktopAuthService.createDesktopCode({
      userId: req.user.id,
      email: req.user.email,
      role: req.user.role,
      state: body?.state || "",
    });
  }

  /**
   * POST /api/auth/desktop-exchange
   * Ứng dụng Desktop đổi one-time code (1 lần duy nhất) lấy tokenHash để tự tạo phiên Supabase độc lập.
   */
  @Post("desktop-exchange")
  @UseGuards(ThrottlerGuard)
  @Throttle({ algorithm: "token-bucket", capacity: 15, refillRate: 1 })
  async exchangeDesktopCode(
    @Body() body: { code?: string; state?: string },
  ) {
    return this.desktopAuthService.exchangeDesktopCode({
      code: body?.code || "",
      state: body?.state || "",
    });
  }
}


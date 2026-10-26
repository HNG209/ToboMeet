import {
  Controller,
  Get,
  Request,
  UseGuards,
  Delete,
  Param,
  Query,
  Put,
  Body,
  BadRequestException,
} from "@nestjs/common";
import { UsersService } from "./users.service";
import { SupabaseGuard } from "../core/guards/supabase.guard";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  /**
   * GET /api/users/search
   * Tìm kiếm người dùng theo tên hoặc email có phân trang cursor
   */
  @Get("search")
  @UseGuards(SupabaseGuard)
  async searchUsers(
    @Query("q") query: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limitParam?: string,
  ) {
    const limit = Math.min(100, Math.max(1, parseInt(limitParam as string, 10) || 20));
    return this.usersService.searchUsers(query, cursor, limit);
  }

  private getClientIp(req: any): string {
    const forwarded = req.headers["x-forwarded-for"] as string;
    let rawIp =
      (forwarded ? forwarded.split(",")[0].trim() : null) ||
      (req.headers["x-real-ip"] as string) ||
      req.ip ||
      req.socket?.remoteAddress ||
      "";

    // Chuẩn hóa IPv6 (::ffff:192.168.x.x -> 192.168.x.x)
    if (rawIp.startsWith("::ffff:")) {
      rawIp = rawIp.substring(7);
    }
    if (rawIp === "::1" || rawIp === "localhost") {
      rawIp = "127.0.0.1";
    }

    // Không lưu/sử dụng localhost khi chạy production
    const isProd = process.env.NODE_ENV === "production";
    return isProd && (rawIp === "127.0.0.1" || rawIp === "0.0.0.0")
      ? ""
      : rawIp;
  }

  @UseGuards(SupabaseGuard)
  @Get("me")
  async getMe(@Request() req) {
    const userDoc = await this.usersService.getOrCreateUser(req.user);

    // Tự động ghi nhận/cập nhật phiên hoạt động khi user tải trang / mở app
    const userId = req.user.id;
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];
    const userAgent = (req.headers["user-agent"] as string) || "";
    const clientIp = this.getClientIp(req);
    const deviceHeaders = {
      deviceName: req.headers["x-device-name"] as string,
      deviceModel: req.headers["x-device-model"] as string,
      deviceBrand: req.headers["x-device-brand"] as string,
      deviceOS: req.headers["x-device-os"] as string,
    };

    if (token) {
      // Gọi không đồng bộ (bất đồng bộ chạy nền) để không làm chậm request getMe chính
      this.usersService
        .registerOrUpdateSession(
          userId,
          token,
          userAgent,
          clientIp,
          deviceHeaders,
        )
        .catch(() => { });
    }

    return userDoc;
  }

  @UseGuards(SupabaseGuard)
  @Get("me/sessions")
  async getSessions(@Request() req) {
    const userId = req.user.id;
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];
    const userAgent = (req.headers["user-agent"] as string) || "";
    const clientIp = this.getClientIp(req);
    const deviceHeaders = {
      deviceName: req.headers["x-device-name"] as string,
      deviceModel: req.headers["x-device-model"] as string,
      deviceBrand: req.headers["x-device-brand"] as string,
      deviceOS: req.headers["x-device-os"] as string,
    };

    return this.usersService.getUserSessions(
      userId,
      token,
      userAgent,
      clientIp,
      deviceHeaders,
    );
  }

  @UseGuards(SupabaseGuard)
  @Get("me/sessions/logged-out")
  async getLoggedOutSessions(
    @Request() req,
    @Query("page") pageStr?: string,
    @Query("limit") limitStr?: string,
  ) {
    const userId = req.user.id;
    const page = pageStr ? parseInt(pageStr, 10) : 1;
    const limit = limitStr ? parseInt(limitStr, 10) : 10;
    return this.usersService.getLoggedOutSessions(userId, page, limit);
  }

  @UseGuards(SupabaseGuard)
  @Delete("me/sessions/others")
  async revokeOtherSessions(@Request() req) {
    const userId = req.user.id;
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1] || "";
    const userAgent = (req.headers["user-agent"] as string) || "";
    // Lấy socketId của thiết bị hiện tại để server exclude khi emit force_logout
    const currentSocketId = (req.headers["x-socket-id"] as string) || "";
    return this.usersService.revokeOtherSessions(
      userId,
      token,
      userAgent,
      currentSocketId,
    );
  }

  @UseGuards(SupabaseGuard)
  @Delete("me/sessions/:id")
  async revokeSession(@Param("id") sessionId: string, @Request() req) {
    const userId = req.user.id;
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1] || "";
    const userAgent = (req.headers["user-agent"] as string) || "";
    return this.usersService.revokeSession(userId, sessionId, token, userAgent);
  }

  /**
   * Proxy Nominatim reverse geocoding — gọi từ server để tránh CORS và rate-limit browser.
   * Public endpoint: geocoding là data công khai, không cần auth.
   */
  @Get("geo/reverse")
  async reverseGeocode(
    @Query("lat") latStr: string,
    @Query("lon") lonStr: string,
  ) {
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (
      isNaN(lat) ||
      isNaN(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      throw new BadRequestException("lat/lon không hợp lệ");
    }
    return this.usersService.reverseGeocode(lat, lon);
  }

  @UseGuards(SupabaseGuard)
  @Put("me/sessions/current/location")
  async updateLocation(
    @Request() req,
    @Body() body: { city: string; country: string },
  ) {
    const userId = req.user.id;
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];
    const userAgent = (req.headers["user-agent"] as string) || "";
    const safeBody: Partial<{ city: string; country: string }> = body || {};
    if (token) {
      await this.usersService.updateCurrentSessionLocation(
        userId,
        token,
        userAgent,
        safeBody.city || "",
        safeBody.country || "",
      );
    }
    return { success: true };
  }

  /**
   * PUT /api/users/me/password
   * Doi mat khau cua nguoi dung hien tai.
   * Body: { currentPassword, newPassword }
   */
  @UseGuards(SupabaseGuard)
  @Put("me/password")
  async changePassword(
    @Request() req,
    @Body() body: { currentPassword?: string; newPassword?: string },
  ) {
    const userId = req.user.id as string;
    const email = req.user.email as string;

    const { currentPassword, newPassword } = body || {};

    if (!currentPassword || !currentPassword.trim()) {
      throw new BadRequestException("currentPassword la bat buoc.");
    }
    if (!newPassword || !newPassword.trim()) {
      throw new BadRequestException("newPassword la bat buoc.");
    }
    if (newPassword.trim().length < 8) {
      throw new BadRequestException(
        "newPassword phai co it nhat 8 ky tu.",
      );
    }
    if (newPassword === currentPassword) {
      throw new BadRequestException(
        "newPassword khong duoc trung voi currentPassword.",
      );
    }

    return this.usersService.changePassword(
      userId,
      email,
      currentPassword.trim(),
      newPassword.trim(),
    );
  }
}

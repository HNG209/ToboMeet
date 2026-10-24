import { Injectable, CanActivate, ExecutionContext } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type { Request } from "express";
import { SupabaseService } from "../../supabase/supabase.service";
import {
  DeviceSession,
  DeviceSessionDocument,
} from "../../users/schemas/device-session.schema";
import { AppException } from "../exceptions/app.exception";
import { ErrorCode } from "@tobomeet/shared/types";

@Injectable()
export class SupabaseGuard implements CanActivate {
  constructor(
    private readonly supabaseService: SupabaseService,
    @InjectModel(DeviceSession.name)
    private readonly sessionModel: Model<DeviceSessionDocument>,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      console.warn(
        `[SupabaseGuard] ❌ No Bearer token found for ${request.method} ${request.url}`,
      );
      throw new AppException(ErrorCode.INVALID_TOKEN);
    }

    const startTime = Date.now();
    const {
      data: { user },
      error,
    } = await this.supabaseService.client.auth.getUser(token);
    const duration = Date.now() - startTime;

    if (error || !user) {
      console.error(
        `[SupabaseGuard] ❌ auth.getUser failed in ${duration}ms for ${request.method} ${request.url}:`,
        {
          message: error?.message,
          status: (error as any)?.status,
          name: error?.name,
          error,
        },
      );
      // Bắt mọi lỗi: Token hết hạn, sai chữ ký, user đã bị khóa/xóa...
      throw new AppException(ErrorCode.INVALID_TOKEN);
    }

    // Kiểm tra trạng thái khóa (ban) từ Supabase Auth
    const isLocked =
      user.banned_until && new Date(user.banned_until) > new Date();
    if (isLocked) {
      console.warn(
        `[SupabaseGuard] ❌ Account locked/banned until ${user.banned_until} for user ${user.id} (${user.email})`,
      );
      throw new AppException(ErrorCode.ACCOUNT_LOCKED);
    }

    // Kiểm tra trạng thái thu hồi phiên (isRevoked) từ MongoDB
    try {
      const userAgent = ((request.headers["user-agent"] as string) || "")
        .trim()
        .toLowerCase();
      const payloadBase64 = token.split(".")[1];
      if (payloadBase64) {
        const payload = JSON.parse(
          Buffer.from(payloadBase64, "base64").toString(),
        ) as Record<string, any>;

        let sessionId =
          (payload.session_id as string) ||
          (payload.sid as string) ||
          (payload.jti as string) ||
          "";

        if (!sessionId && payload.sub && userAgent) {
          const { createHash } = require("crypto");
          sessionId = createHash("sha256")
            .update(`${payload.sub}-${userAgent}`)
            .digest("hex");
        }
        if (!sessionId) {
          sessionId = payload.sub || "";
        }

        if (sessionId) {
          const sessionDoc = await this.sessionModel
            .findOne({ sessionId, userId: user.id })
            .lean();

          if (sessionDoc?.isRevoked) {
            console.error(
              `[SupabaseGuard] ❌ Session REVOKED in DB! sessionId=${sessionId}, userId=${user.id}`,
            );
            throw new AppException(ErrorCode.INVALID_TOKEN);
          }
        }
      }
    } catch (err) {
      console.error("[SupabaseGuard] Error during check:", err);
      if (err instanceof AppException) throw err;
    }

    const mappedRole = user.app_metadata?.role || user.role || "user";

    // Gắn thông tin user vào request (Lấy role thực tế từ Supabase)
    request.user = {
      id: user.id,
      email: user.email,
      role: mappedRole,
      app_metadata: user.app_metadata || {},
      user_metadata: user.user_metadata || {},
    };

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(" ") ?? [];
    return type === "Bearer" ? token : undefined;
  }
}

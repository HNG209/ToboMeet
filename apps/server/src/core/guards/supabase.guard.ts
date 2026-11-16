import { Injectable, CanActivate, ExecutionContext, OnModuleInit } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type { Request } from "express";
import { createLocalJWKSet, jwtVerify, JWTPayload, JSONWebKeySet } from "jose";
import {
  DeviceSession,
  DeviceSessionDocument,
} from "../../users/schemas/device-session.schema";
import { AppException } from "../exceptions/app.exception";
import { ErrorCode } from "@tobomeet/shared/types";

/** Supabase JWT payload (P-256 / ES256) */
interface SupabaseJWTPayload extends JWTPayload {
  email?: string;
  role?: string;
  session_id?: string;
  sid?: string;
  app_metadata?: Record<string, any>;
  user_metadata?: Record<string, any>;
}

/** TTL để tự refresh JWKS (hỗ trợ key rotation), đơn vị ms */
const JWKS_REFRESH_TTL = 10 * 60 * 1000; // 10 phút

interface CachedSessionStatus {
  isRevoked: boolean;
  cachedAt: number;
}

@Injectable()
export class SupabaseGuard implements CanActivate, OnModuleInit {
  /** In-memory cache cho trạng thái thu hồi phiên (tránh query MongoDB trên từng request) */
  private static readonly sessionRevokeCache = new Map<string, CachedSessionStatus>();
  private static readonly SESSION_CACHE_TTL = 60 * 1000;

  public static invalidateSessionCache(userId: string, sessionId?: string): void {
    if (sessionId) {
      SupabaseGuard.sessionRevokeCache.delete(`${userId}:${sessionId}`);
    } else {
      for (const key of SupabaseGuard.sessionRevokeCache.keys()) {
        if (key.startsWith(`${userId}:`)) {
          SupabaseGuard.sessionRevokeCache.delete(key);
        }
      }
    }
  }

  /**
   * Local key set được build từ JWKS đã fetch sẵn.
   * createLocalJWKSet không có network call — verify hoàn toàn in-memory.
   */
  private localJWKS!: ReturnType<typeof createLocalJWKSet>;
  private jwksLastFetchedAt = 0;

  constructor(
    @InjectModel(DeviceSession.name)
    private readonly sessionModel: Model<DeviceSessionDocument>,
  ) { }

  async onModuleInit() {
    await this.refreshJWKS();
  }

  /** Fetch JWKS từ Supabase và build local key set */
  private async refreshJWKS(): Promise<void> {
    const jwksUrl = process.env.SUPABASE_JWKS_URL;
    if (!jwksUrl) {
      throw new Error("[SupabaseGuard] Missing SUPABASE_JWKS_URL env variable");
    }
    const res = await fetch(jwksUrl);
    if (!res.ok) {
      throw new Error(`[SupabaseGuard] Failed to fetch JWKS: HTTP ${res.status}`);
    }
    const jwks = await res.json() as JSONWebKeySet;
    this.localJWKS = createLocalJWKSet(jwks);
    this.jwksLastFetchedAt = Date.now();
    console.log("[SupabaseGuard] JWKS refreshed, keys:", jwks.keys?.length ?? 0);
  }

  /**
   * Trả về local key set, tự refresh nếu đã quá TTL.
   * Không bao giờ có network call trong vòng đời TTL.
   */
  private async getLocalJWKS(): Promise<ReturnType<typeof createLocalJWKSet>> {
    if (Date.now() - this.jwksLastFetchedAt > JWKS_REFRESH_TTL) {
      this.refreshJWKS().catch((err) =>
        console.error("[SupabaseGuard] Background JWKS refresh failed:", err),
      );
    }
    return this.localJWKS;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const guardStart = performance.now();

    try {
      const token = this.extractTokenFromHeader(request);

      if (!token) {
        console.warn(
          `[SupabaseGuard] No Bearer token found for ${request.method} ${request.url}`,
        );
        throw new AppException(ErrorCode.INVALID_TOKEN);
      }

      // Verify chữ ký JWT locally bằng JWKS (ES256 / P-256)
      let payload: SupabaseJWTPayload;
      try {
        const { payload: verified } = await jwtVerify<SupabaseJWTPayload>(
          token,
          await this.getLocalJWKS(),
          {
            audience: "authenticated",
            algorithms: ["ES256"],
          },
        );
        payload = verified;
      } catch (err: any) {
        console.error(
          `[SupabaseGuard] JWT verification failed for ${request.method} ${request.url}:`,
          err?.code || err?.message,
        );
        throw new AppException(ErrorCode.INVALID_TOKEN);
      }

      const userId = payload.sub;
      if (!userId) {
        throw new AppException(ErrorCode.INVALID_TOKEN);
      }

      // Kiểm tra thu hồi phiên (isRevoked) từ MongoDB
      try {
        const userAgent = ((request.headers["user-agent"] as string) || "")
          .trim()
          .toLowerCase();

        let sessionId =
          payload.session_id ||
          payload.sid ||
          (payload.jti as string) ||
          "";

        if (!sessionId && userId && userAgent) {
          const { createHash } = await import("crypto");
          sessionId = createHash("sha256")
            .update(`${userId}-${userAgent}`)
            .digest("hex");
        }
        if (!sessionId) {
          sessionId = userId;
        }

        if (sessionId) {
          const cacheKey = `${userId}:${sessionId}`;
          const cached = SupabaseGuard.sessionRevokeCache.get(cacheKey);
          const now = Date.now();

          let isRevoked = false;
          if (cached && now - cached.cachedAt < SupabaseGuard.SESSION_CACHE_TTL) {
            isRevoked = cached.isRevoked;
          } else {
            const sessionDoc = await this.sessionModel
              .findOne({ sessionId, userId })
              .select("isRevoked")
              .lean();

            isRevoked = !!sessionDoc?.isRevoked;

            if (SupabaseGuard.sessionRevokeCache.size > 2000) {
              SupabaseGuard.sessionRevokeCache.clear();
            }
            SupabaseGuard.sessionRevokeCache.set(cacheKey, {
              isRevoked,
              cachedAt: now,
            });
          }

          if (isRevoked) {
            console.error(
              `[SupabaseGuard] Session REVOKED in DB! sessionId=${sessionId}, userId=${userId}`,
            );
            throw new AppException(ErrorCode.INVALID_TOKEN);
          }
        }
      } catch (err) {
        if (err instanceof AppException) throw err;
        console.error("[SupabaseGuard] Error during session revoke check:", err);
      }

      const mappedRole =
        payload.app_metadata?.role ||
        payload.role ||
        "user";

      (request as any).user = {
        id: userId,
        email: payload.email ?? "",
        role: mappedRole,
        app_metadata: payload.app_metadata || {},
        user_metadata: payload.user_metadata || {},
      };

      return true;
    } finally {
      if ((request as any)._timings) {
        (request as any)._timings.guard =
          Math.round((performance.now() - guardStart) * 100) / 100;
      }
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(" ") ?? [];
    return type === "Bearer" ? token : undefined;
  }
}


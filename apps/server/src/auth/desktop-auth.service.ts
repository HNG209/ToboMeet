import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, timingSafeEqual } from "crypto";
import { RedisService } from "../redis/redis.service";

interface DesktopAuthRecord {
  userId: string;
  email: string;
  role: string;
  state: string;
  createdAt: number;
}

const DESKTOP_AUTH_KEY_PREFIX = "tobomeet:desktop_auth:";
const DESKTOP_CODE_TTL_SECONDS = 60;

@Injectable()
export class DesktopAuthService {
  private readonly logger = new Logger(DesktopAuthService.name);
  private readonly supabaseAdmin: SupabaseClient;
  /** Fallback tạm thời trong RAM nếu môi trường dev không bật Redis */
  private readonly fallbackStore = new Map<
    string,
    { data: DesktopAuthRecord; expiresAt: number }
  >();

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    const supabaseUrl = this.configService.get<string>("SUPABASE_URL");
    const supabaseServiceRole = this.configService.get<string>(
      "SUPABASE_SERVICE_ROLE_KEY",
    );
    this.supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  private safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  /**
   * Tạo mã xác thực 1 lần (one-time code) gắn với người dùng đã đăng nhập trên trình duyệt web,
   * lưu trong Redis với TTL 60 giây.
   */
  async createDesktopCode(params: {
    userId: string;
    email: string;
    role?: string;
    state: string;
  }): Promise<{ code: string; expiresIn: number }> {
    const state = (params.state || "").trim();
    if (state.length < 16 || state.length > 128) {
      throw new BadRequestException("Tham số state không hợp lệ.");
    }
    if (!params.email) {
      throw new BadRequestException(
        "Tài khoản không có email hợp lệ để đồng bộ phiên Desktop.",
      );
    }

    const code = randomBytes(32).toString("hex");
    const key = `${DESKTOP_AUTH_KEY_PREFIX}${code}`;
    const record: DesktopAuthRecord = {
      userId: params.userId,
      email: params.email.trim().toLowerCase(),
      role: (params.role || "user").trim().toLowerCase(),
      state,
      createdAt: Date.now(),
    };

    if (this.redisService.isReady) {
      await this.redisService.set(
        key,
        JSON.stringify(record),
        DESKTOP_CODE_TTL_SECONDS,
      );
    } else {
      this.logger.warn(
        "[DesktopAuth] Redis chưa sẵn sàng — dùng in-memory fallback tạm thời.",
      );
      this.cleanupFallbackStore();
      this.fallbackStore.set(key, {
        data: record,
        expiresAt: Date.now() + DESKTOP_CODE_TTL_SECONDS * 1000,
      });
    }

    return { code, expiresIn: DESKTOP_CODE_TTL_SECONDS };
  }

  /**
   * Đổi one-time code (xóa ngay sau 1 lần dùng từ Redis) sang magiclink token_hash
   * để Desktop App gọi verifyOtp và tạo 1 Supabase session độc lập hoàn toàn với trình duyệt.
   */
  async exchangeDesktopCode(params: {
    code: string;
    state: string;
  }): Promise<{ tokenHash: string; email: string; role: string }> {
    const code = (params.code || "").trim();
    const state = (params.state || "").trim();

    if (!code || !state) {
      throw new BadRequestException("Thiếu mã xác thực (code) hoặc state.");
    }

    const key = `${DESKTOP_AUTH_KEY_PREFIX}${code}`;
    let record: DesktopAuthRecord | null = null;

    if (this.redisService.isReady) {
      const raw = await this.redisService.getdel(key);
      if (raw) {
        try {
          record = JSON.parse(raw) as DesktopAuthRecord;
        } catch {
          record = null;
        }
      }
    }

    // Fallback kiểm tra trong RAM nếu mã được tạo lúc Redis tạm mất kết nối
    if (!record && this.fallbackStore.has(key)) {
      const entry = this.fallbackStore.get(key)!;
      this.fallbackStore.delete(key);
      if (entry.expiresAt > Date.now()) {
        record = entry.data;
      }
    }

    if (!record) {
      throw new UnauthorizedException(
        "Mã đăng nhập đã hết hạn hoặc đã được sử dụng. Vui lòng thử đăng nhập lại.",
      );
    }

    if (!this.safeCompare(record.state, state)) {
      throw new UnauthorizedException("Xác thực state không hợp lệ.");
    }

    // Sinh magiclink token_hash trên Supabase để Desktop tạo session độc lập hoàn toàn
    const { data, error } = await this.supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: record.email,
    });

    const tokenHash = data?.properties?.hashed_token;
    if (error || !tokenHash) {
      this.logger.error(
        `[DesktopAuth] generateLink failed for ${record.email}: ${error?.message || "missing hashed_token"}`,
      );
      throw new UnauthorizedException(
        "Không thể khởi tạo phiên đăng nhập cho ứng dụng Desktop.",
      );
    }

    return {
      tokenHash,
      email: record.email,
      role: record.role,
    };
  }

  private cleanupFallbackStore() {
    const now = Date.now();
    for (const [k, v] of this.fallbackStore.entries()) {
      if (v.expiresAt <= now) {
        this.fallbackStore.delete(k);
      }
    }
  }
}


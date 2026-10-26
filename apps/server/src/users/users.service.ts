import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { User, UserDocument } from "./schemas/user.schema";
import {
  DeviceSession,
  DeviceSessionDocument,
} from "./schemas/device-session.schema";
import { Model, Types } from "mongoose";
import { ConfigService } from "@nestjs/config";
import { createClient } from "@supabase/supabase-js";
import { AppGateway } from "../core/gateways/app.gateway";
import { createHash } from "crypto";
import { PageResponse, UserResponse } from "@tobomeet/shared/types";

export interface MappedSession {
  id: string;
  /** Địa chỉ IP của phiên đăng nhập */
  ip: string;
  /** Tên thiết bị thân thiện, ví dụ "Chrome trên Windows" */
  deviceName: string;
  os: string;
  browser: string;
  loginMethod: string;
  isMobile: boolean;
  isDesktop: boolean;
  isCurrent: boolean;
  /** Thành phố (từ geolocation) */
  city: string;
  /** Quốc gia (từ geolocation) */
  country: string;
  /** Nhà mạng ISP (từ geolocation) */
  isp?: string;
  /** IP thật thu nhận được (hoặc null nếu không có hoặc private IP ở prod) */
  ipAddress?: string | null;
  isGps?: boolean;
  createdAt: string;
  updatedAt: string;
  loggedOutAt?: string;
}

export interface SessionsResult {
  currentDevice: MappedSession | null;
  otherDevices: MappedSession[];
  recentlyLoggedOut: MappedSession[];
  totalLoggedOut: number;
}

/** Kết quả từ ip-api.com */
interface IpApiResponse {
  status: "success" | "fail";
  city?: string;
  regionName?: string;
  country?: string;
  countryCode?: string;
  isp?: string;
  org?: string;
  query?: string; // IP công cộng trả về từ API
  message?: string;
}

@Injectable()
export class UsersService {
  private supabaseAdmin;
  private supabaseUrl: string;
  private supabaseServiceKey: string;
  private readonly logger = new Logger(UsersService.name);

  /** Cache geolocation để tránh gọi API quá nhiều lần cho cùng 1 IP */
  private readonly geoCache = new Map<
    string,
    { city: string; country: string; isp: string; publicIp: string }
  >();

  /** Kiểm tra IP private/loopback — dùng chung cho getGeolocation và display IP */
  private readonly privateIpPatterns = [
    /^127\./,
    /^::1$/,
    /^localhost$/i,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^::ffff:127\./,
    /^::ffff:10\./,
    /^::ffff:192\.168\./,
    /^fd[0-9a-f]{2}:/i,
  ];

  private isPrivateIp(ip: string): boolean {
    if (!ip) return true;
    return this.privateIpPatterns.some((p) => p.test(ip));
  }

  private getRealIpAddress(ip: string): string | null {
    if (!ip || ip === "UNKNOWN") return null;
    let clean = ip.trim();
    if (clean.startsWith("::ffff:")) {
      clean = clean.substring(7);
    }
    if (clean === "::1" || clean === "localhost") {
      clean = "127.0.0.1";
    }
    if (this.isPrivateIp(clean)) {
      // Cho phép 127.0.0.1 ở dev, nhưng chặn ở production
      if (process.env.NODE_ENV === "production") {
        return null;
      }
      return clean;
    }
    return clean;
  }

  public extractSessionId(token: string, userAgent: string = ""): string {
    if (!token) return "";
    try {
      const payloadBase64 = token.split(".")[1];
      if (!payloadBase64) return "";
      const payload = JSON.parse(
        Buffer.from(payloadBase64, "base64").toString(),
      ) as Record<string, unknown>;

      const sid =
        (payload.session_id as string) ||
        (payload.sid as string) ||
        (payload.jti as string) ||
        "";

      if (sid) return sid;

      const sub = payload.sub as string;
      const cleanUa = (userAgent || "").trim().toLowerCase();
      if (sub && cleanUa) {
        return createHash("sha256").update(`${sub}-${cleanUa}`).digest("hex");
      }
      return sub || "";
    } catch {
      return "";
    }
  }

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(DeviceSession.name)
    private sessionModel: Model<DeviceSessionDocument>,
    private configService: ConfigService,
    @Inject(forwardRef(() => AppGateway))
    private readonly appGateway: AppGateway,
  ) {
    this.supabaseUrl = this.configService.get<string>("SUPABASE_URL");
    this.supabaseServiceKey = this.configService.get<string>(
      "SUPABASE_SERVICE_ROLE_KEY",
    );
    this.supabaseAdmin = createClient(
      this.supabaseUrl,
      this.supabaseServiceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  }

  async getOrCreateUser(tokenPayload): Promise<UserResponse> {
    const userId = tokenPayload.id || tokenPayload.sub;
    const email = tokenPayload.email
      ? tokenPayload.email.trim().toLowerCase()
      : "";
    const metadata = tokenPayload.user_metadata || {};

    let user = await this.userModel.findOne({
      $or: [
        { supabaseId: userId },
        { email: { $regex: new RegExp(`^${email}$`, "i") } },
      ],
    });

    if (user) {
      let hasChanges = false;
      if (user.supabaseId !== userId) {
        user.supabaseId = userId;
        hasChanges = true;
      }
      if (
        user.displayName !== metadata.full_name ||
        user.avatarUrl !== metadata.avatar_url
      ) {
        user.displayName = metadata.full_name || user.displayName;
        user.avatarUrl = metadata.avatar_url || user.avatarUrl;
        hasChanges = true;
      }
      if (hasChanges) {
        await user.save();
        console.log(`Đã cập nhật/đồng bộ user: ${email}`);
      }
    } else {
      user = await this.userModel.create({
        supabaseId: userId,
        email: email,
        displayName: metadata.full_name,
        avatarUrl: metadata.avatar_url,
      });
      console.log(`Đã tạo mới user: ${email}`);
    }

    return {
      _id: user._id.toString(),
      supabaseId: user.supabaseId,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      email: user.email,
      hasUnreadNotifications: user.hasUnreadNotifications,
    };
  }

  async findBySupabaseId(supabaseId: string) {
    return this.userModel.findOne({ supabaseId }).exec();
  }

  /** Cache reverse geocode (lat/lon tròn 2 chữ số thập phân → địa chỉ) để tránh spam Nominatim */
  private readonly reverseGeoCache = new Map<
    string,
    { city: string; country: string; cachedAt: number }
  >();
  private readonly REVERSE_GEO_TTL_MS = 5 * 60 * 1000; // 5 phút

  /**
   * Proxy Nominatim reverse geocoding — chạy trên server để tránh CORS và rate-limit từ browser.
   * @param lat latitude
   * @param lon longitude
   */
  async reverseGeocode(
    lat: number,
    lon: number,
  ): Promise<{ city: string; country: string }> {
    // Làm tròn tọa độ 2 chữ số thập phân (~1km) để cache tốt hơn
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const now = Date.now();

    const cached = this.reverseGeoCache.get(key);
    if (cached && now - cached.cachedAt < this.REVERSE_GEO_TTL_MS) {
      return { city: cached.city, country: cached.country };
    }

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=vi`;
      const res = await fetch(url, {
        headers: {
          // Nominatim yêu cầu User-Agent hợp lệ theo ToS
          "User-Agent": "ToBoMeet-Server/1.0 (contact@tobomeet.com)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        this.logger.warn(
          `[ReverseGeo] Nominatim trả về ${res.status} cho (${lat},${lon})`,
        );
        return { city: "", country: "" };
      }

      const data = (await res.json()) as { address?: Record<string, string> };
      const addr = data.address || {};
      const city =
        addr.city ||
        addr.town ||
        addr.municipality ||
        addr.state ||
        addr.province ||
        "";
      const country = addr.country || "";

      this.reverseGeoCache.set(key, { city, country, cachedAt: now });
      return { city, country };
    } catch (err) {
      this.logger.warn(`[ReverseGeo] Lỗi khi gọi Nominatim: ${String(err)}`);
      return { city: "", country: "" };
    }
  }

  /**
   * Tra cứu vị trí (city, country, isp, publicIp) từ địa chỉ IP dùng ip-api.com.
   * Khi ip là địa chỉ private/localhost (dev mode), gọi ip-api.com/json không truyền IP để lấy WAN public IP.
   */
  private async getGeolocation(
    ip: string,
  ): Promise<{ city: string; country: string; isp: string; publicIp: string }> {
    const unknown = {
      city: "",
      country: "Không xác định",
      isp: "",
      publicIp: ip,
    };

    if (!ip || ip === "UNKNOWN") return unknown;

    const isPrivate = this.isPrivateIp(ip);
    const cacheKey = isPrivate ? "LOCAL_WAN" : ip;

    if (this.geoCache.has(cacheKey)) {
      return this.geoCache.get(cacheKey)!;
    }

    // Khi IP là private/localhost (dev mode), tra cứu không truyền IP để lấy WAN public IP hiện tại
    const targetUrl = isPrivate
      ? `http://ip-api.com/json/?fields=status,message,city,regionName,country,countryCode,isp,org,query`
      : `http://ip-api.com/json/${ip}?fields=status,message,city,regionName,country,countryCode,isp,org,query`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(targetUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) return unknown;

      const data = (await res.json()) as IpApiResponse;

      if (data.status !== "success") {
        this.logger.warn(
          `ip-api.com trả về status "${data.status}" (${data.message ?? ""}) cho IP ${ip}`,
        );
        return unknown;
      }
      if (!data.country) return unknown;

      // Ưu tiên regionName (Tỉnh/Thành phố như Đà Nẵng, Kon Tum, Hà Nội...)
      // trước khi fallback sang city (Huyện/Thị xã nhỏ như Đắk Glei)
      const rawCity = (data.regionName || data.city || "").trim();
      const safeCity = rawCity.length > 0 ? rawCity : "";
      const rawIsp = (data.isp || data.org || "").trim();

      const result = {
        city: safeCity,
        country: data.country.trim(),
        isp: rawIsp,
        publicIp: data.query || ip,
      };

      if (this.geoCache.size >= 200) {
        const firstKey = this.geoCache.keys().next().value;
        if (firstKey) this.geoCache.delete(firstKey);
      }
      this.geoCache.set(cacheKey, result);
      return result;
    } catch (e) {
      this.logger.warn(
        `Geolocation lookup thất bại cho IP ${ip}: ${String(e)}`,
      );
      return unknown;
    }
  }

  async registerOrUpdateSession(
    userId: string,
    currentToken: string,
    userAgent: string,
    clientIp: string,
    deviceHeaders?: {
      deviceName?: string;
      deviceModel?: string;
      deviceBrand?: string;
      deviceOS?: string;
    },
  ): Promise<void> {
    if (!currentToken || !userId) return;
    try {
      const sessionId = this.extractSessionId(currentToken, userAgent);
      if (!sessionId) return;

      // 1. Kiểm tra xem phiên này đã bị thu hồi từ xa hay chưa
      const existing = await this.sessionModel
        .findOne({ sessionId, userId })
        .lean();
      if (existing?.isRevoked) {
        throw new UnauthorizedException("Phiên đăng nhập đã bị thu hồi từ xa.");
      }

      const uaInfo = this.parseUserAgent(userAgent);
      let deviceName = uaInfo.deviceName;
      let os = uaInfo.os;
      let browser = uaInfo.browser;
      let isMobile = uaInfo.isMobile;
      let isDesktop = uaInfo.isDesktop;

      if (deviceHeaders) {
        const {
          deviceOS,
          deviceName: hName,
          deviceModel: hModel,
        } = deviceHeaders;
        if (deviceOS) {
          os = deviceOS;
          if (deviceOS === "iOS" || deviceOS === "Android") {
            browser = "ToboMeet Mobile";
            isMobile = true;
            isDesktop = false;
          }
        }

        const genericOSNames = ["iphone", "ipad", "android", "device"];
        if (
          hName &&
          hName.trim() &&
          !genericOSNames.includes(hName.toLowerCase().trim())
        ) {
          deviceName = hName.trim();
        } else if (hModel && hModel.trim()) {
          deviceName = hModel.trim();
        } else if (deviceOS) {
          deviceName = deviceOS;
        }
      }

      const cleanIp = this.getRealIpAddress(clientIp) || "127.0.0.1";
      const geo = await this.getGeolocation(cleanIp);

      let payload: Record<string, unknown> = {};
      try {
        const payloadBase64 = currentToken.split(".")[1];
        if (payloadBase64) {
          payload = JSON.parse(
            Buffer.from(payloadBase64, "base64").toString(),
          ) as Record<string, unknown>;
        }
      } catch {
        // ignore payload parsing failure
      }

      const amr: any[] = Array.isArray(payload.amr) ? payload.amr : [];
      const methods: string[] = amr
        .map((a) => {
          if (typeof a === "string") return a;
          if (a && typeof a === "object" && typeof a.method === "string")
            return a.method;
          return "";
        })
        .filter(Boolean);

      let loginMethod = "password";

      if (methods.length > 0) {
        if (methods.includes("oauth")) {
          loginMethod = "google";
        } else if (methods.includes("password")) {
          loginMethod = "password";
        } else if (methods.includes("otp")) {
          loginMethod = "otp";
        } else if (methods.includes("qr")) {
          loginMethod = "qr";
        } else {
          loginMethod = methods[0];
        }
      } else {
        const appMetadata = payload.app_metadata as
          | { provider?: string }
          | undefined;
        const provider: string = (appMetadata?.provider || "").toLowerCase();
        if (provider === "google") {
          loginMethod = "google";
        } else {
          loginMethod = "password";
        }
      }

      const ipAddress = this.getRealIpAddress(clientIp);

      const sessionData = {
        sessionId,
        userId,
        ip: cleanIp,
        ipAddress,
        userAgent,
        deviceName,
        os,
        browser,
        city: geo.city || "",
        country: geo.country || "Không xác định",
        isp: geo.isp || "",
        loginMethod,
        isMobile,
        isDesktop,
        updatedAt: new Date(),
      };

      await this.sessionModel.findOneAndUpdate(
        { sessionId },
        {
          $set: sessionData,
          $setOnInsert: { createdAt: new Date(), isGps: false },
        },
        { upsert: true, new: true },
      );

      if (!existing) {
        try {
          if (this.appGateway?.server) {
            this.appGateway.server
              .to(`user_${userId}`)
              .emit("session_list_changed");
          }
        } catch (err) {
          this.logger.error(
            "Lỗi khi bắn WebSocket session_list_changed (new session): " +
            String(err),
          );
        }
      }
    } catch (e) {
      this.logger.error(
        "Lỗi khi ghi nhận/cập nhật DeviceSession: " + String(e),
      );
    }
  }

  /**
   * Lấy danh sách phiên hoạt động của user từ MongoDB.
   */
  async getUserSessions(
    userId: string,
    currentToken: string,
    userAgent: string = "",
    clientIp: string = "",
    deviceHeaders?: {
      deviceName?: string;
      deviceModel?: string;
      deviceBrand?: string;
      deviceOS?: string;
    },
  ): Promise<SessionsResult> {
    const currentSessionId = this.extractSessionId(currentToken, userAgent);

    // Tự động đồng bộ/cập nhật session hiện tại vào MongoDB
    if (currentSessionId) {
      await this.registerOrUpdateSession(
        userId,
        currentToken,
        userAgent,
        clientIp,
        deviceHeaders,
      );
    }

    // Sync ngầm danh sách phiên đăng nhập với Supabase
    if (userId) {
      this.syncUserSessionsWithSupabase(userId).catch((err) => {
        this.logger.error(
          "Lỗi khi chạy ngầm syncUserSessionsWithSupabase: " + String(err),
        );
      });
    }

    try {
      const dbSessions = await this.sessionModel
        .find({ userId, isRevoked: { $ne: true } })
        .sort({ updatedAt: -1 })
        .lean()
        .exec();

      const mapped: MappedSession[] = dbSessions.map((s) => {
        const isCurrent = s.sessionId === currentSessionId;
        return {
          id: s.sessionId,
          ip:
            s.ip === "127.0.0.1" && process.env.NODE_ENV === "production"
              ? "Không rõ"
              : s.ip || "Không rõ",
          ipAddress: s.ipAddress || null,
          deviceName: s.deviceName,
          os: s.os,
          browser: s.browser,
          loginMethod: s.loginMethod || "password",
          isMobile: !!s.isMobile,
          isDesktop: !!s.isDesktop,
          isCurrent,
          isGps: !!s.isGps,
          city: s.city || "",
          country: s.country || "Không xác định",
          isp: s.isp || "",
          createdAt: s.createdAt
            ? s.createdAt.toISOString()
            : new Date().toISOString(),
          updatedAt: s.updatedAt
            ? s.updatedAt.toISOString()
            : new Date().toISOString(),
        };
      });

      const currentDevice = mapped.find((s) => s.isCurrent) ?? null;
      const otherDevices = mapped.filter((s) => !s.isCurrent);

      // Lấy tối đa 5 thiết bị đã đăng xuất gần nhất
      const loggedOutDbSessions = await this.sessionModel
        .find({ userId, isRevoked: true })
        .sort({ revokedAt: -1, updatedAt: -1 })
        .limit(5)
        .lean()
        .exec();

      const recentlyLoggedOut: MappedSession[] = loggedOutDbSessions.map(
        (s) => ({
          id: s.sessionId,
          ip:
            s.ip === "127.0.0.1" && process.env.NODE_ENV === "production"
              ? "Không rõ"
              : s.ip || "Không rõ",
          ipAddress: s.ipAddress || null,
          deviceName: s.deviceName,
          os: s.os,
          browser: s.browser,
          loginMethod: s.loginMethod || "password",
          isMobile: !!s.isMobile,
          isDesktop: !!s.isDesktop,
          isCurrent: false,
          isGps: !!s.isGps,
          city: s.city || "",
          country: s.country || "Không xác định",
          isp: s.isp || "",
          createdAt: s.createdAt
            ? s.createdAt.toISOString()
            : new Date().toISOString(),
          updatedAt: s.updatedAt
            ? s.updatedAt.toISOString()
            : new Date().toISOString(),
          loggedOutAt: s.revokedAt
            ? s.revokedAt.toISOString()
            : s.updatedAt
              ? s.updatedAt.toISOString()
              : new Date().toISOString(),
        }),
      );

      const totalLoggedOut = await this.sessionModel
        .countDocuments({ userId, isRevoked: true })
        .exec();

      return { currentDevice, otherDevices, recentlyLoggedOut, totalLoggedOut };
    } catch (err) {
      this.logger.error("Lỗi khi đọc sessions từ MongoDB: " + String(err));
      return {
        currentDevice: null,
        otherDevices: [],
        recentlyLoggedOut: [],
        totalLoggedOut: 0,
      };
    }
  }

  /**
   * Đăng xuất/hủy bỏ một phiên hoạt động qua Supabase Admin REST API và xóa khỏi MongoDB
   */
  async revokeSession(
    userId: string,
    sessionId: string,
    currentToken: string,
    userAgent: string,
  ) {
    // Thêm safeguard ngăn chặn tự xóa session hiện tại của chính mình
    if (currentToken) {
      const currentSessionId = this.extractSessionId(currentToken, userAgent);
      if (currentSessionId && sessionId === currentSessionId) {
        throw new BadRequestException(
          "Không thể tự đăng xuất thiết bị hiện tại bằng chức năng này. Vui lòng sử dụng tính năng Đăng xuất thông thường.",
        );
      }
    }

    // 1. Đánh dấu session bị thu hồi trong MongoDB
    try {
      await this.sessionModel
        .updateOne(
          { sessionId, userId },
          { $set: { isRevoked: true, revokedAt: new Date() } },
        )
        .exec();
    } catch (err) {
      this.logger.error(
        "Lỗi khi đánh dấu thu hồi DeviceSession khỏi MongoDB: " + String(err),
      );
    }

    // 2. Bắn tin nhắn Realtime WebSocket đăng xuất tức thì cho client
    try {
      if (this.appGateway?.server) {
        this.appGateway.server
          .to(`user_${userId}`)
          .emit("session_revoked", { sessionId });
        this.appGateway.server
          .to(`user_${userId}`)
          .emit("session_list_changed");
      }
    } catch (err) {
      this.logger.error(
        "Lỗi khi bắn WebSocket session_revoked/session_list_changed: " +
        String(err),
      );
    }

    // 2. Thu hồi/đăng xuất phiên trên Supabase
    try {
      if (typeof this.supabaseAdmin.auth.admin.destroySession === "function") {
        const { error } =
          await this.supabaseAdmin.auth.admin.destroySession(sessionId);
        if (!error) {
          return { success: true, message: "Đã đăng xuất thiết bị thành công" };
        }
      }
    } catch {
      // SDK method không tồn tại, dùng REST API
    }

    const res = await fetch(
      `${this.supabaseUrl}/auth/v1/admin/users/${userId}/sessions/${sessionId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.supabaseServiceKey}`,
          apikey: this.supabaseServiceKey,
        },
      },
    );

    if (!res.ok && res.status !== 404) {
      this.logger.warn(
        `Không thể xóa session trên Supabase (HTTP ${res.status}), nhưng đã xóa khỏi DB local.`,
      );
    }

    return { success: true, message: "Đã đăng xuất thiết bị thành công" };
  }

  /**
   * Đăng xuất/hủy bỏ tất cả các phiên đăng nhập khác của user ngoại trừ phiên hiện tại.
   * @param currentSocketId - socket.id của thiết bị đang gửi request, dùng để exclude khỏi emit
   */
  async revokeOtherSessions(
    userId: string,
    currentToken: string,
    userAgent: string = "",
    currentSocketId: string = "",
  ) {
    if (!currentToken || !userId) {
      throw new BadRequestException("Token hoặc User ID không hợp lệ.");
    }

    const currentSessionId = this.extractSessionId(currentToken, userAgent);

    if (!currentSessionId) {
      throw new BadRequestException(
        "Không xác định được phiên làm việc hiện tại.",
      );
    }

    this.logger.log(
      `[RevokeAll] userId=${userId} | currentSessionId=${currentSessionId} | ` +
      `currentSocketId="${currentSocketId || "N/A"}" | userAgent="${userAgent.slice(0, 80)}"`,
    );

    // ─── FIX LỖI 2: Verify session hiện tại (A) tồn tại trong DB ───────────────
    // Nếu currentSessionId không tìm thấy trong DB, nghĩa là extractSessionId()
    // đã tính sai sessionId → không thể xác định session nào của A → KHÔNG revoke.
    const currentSessionDoc = await this.sessionModel
      .findOne({ userId, sessionId: currentSessionId })
      .lean();

    if (!currentSessionDoc) {
      this.logger.error(
        `[RevokeAll] ❌ ABORT – Không tìm thấy session hiện tại (${currentSessionId}) trong DB. ` +
        `Có thể extractSessionId() tính sai. Hủy thao tác để tránh revoke nhầm session A.`,
      );
      throw new BadRequestException(
        "Không xác định được phiên làm việc hiện tại trong hệ thống. Vui lòng thử lại.",
      );
    }

    if (currentSessionDoc.isRevoked) {
      this.logger.warn(
        `[RevokeAll] ⚠️ Session hiện tại (${currentSessionId}) đã bị revoke trước đó. Tiếp tục revoke các session khác.`,
      );
    }

    this.logger.log(
      `[RevokeAll] ✅ Đã xác nhận session hiện tại (${currentSessionId}) tồn tại trong DB. Tiến hành revoke các session khác.`,
    );
    // ────────────────────────────────────────────────────────────────────────────

    // 1. Tìm tất cả các session khác đang hoạt động (cần sessionId để emit và xóa Supabase)
    const otherSessions = await this.sessionModel
      .find({
        userId,
        sessionId: { $ne: currentSessionId },
        isRevoked: { $ne: true },
      })
      .select("sessionId")
      .lean();

    const revokedSessionIds = otherSessions.map((s) => s.sessionId);

    this.logger.log(
      `[RevokeAll] Tìm thấy ${revokedSessionIds.length} session cần revoke: [${revokedSessionIds.join(", ")}]`,
    );

    if (revokedSessionIds.length === 0) {
      this.logger.log(
        "[RevokeAll] Không có session nào khác để revoke. Trả về thành công.",
      );
      return {
        success: true,
        message: "Không có thiết bị nào khác đang đăng nhập",
        revokedCount: 0,
      };
    }

    // 2. Cập nhật isRevoked = true trong MongoDB (CHỈ revoke session khác, không revoke A)
    const updateResult = await this.sessionModel.updateMany(
      { userId, sessionId: { $ne: currentSessionId } },
      { $set: { isRevoked: true, revokedAt: new Date() } },
    );
    this.logger.log(
      `[RevokeAll] MongoDB đã revoke ${updateResult.modifiedCount} session(s).`,
    );

    // 3. Xóa session trên Supabase Auth (nếu có thể) để token không thể refresh
    //    Chạy song song, không block response nếu Supabase fail
    this.destroySupabaseSessions(userId, revokedSessionIds).catch((err) => {
      this.logger.warn(
        "Không thể xóa session Supabase (non-critical): " + String(err),
      );
    });

    // ─── FIX LỖI 1: Emit force_logout với logging chi tiết ──────────────────────
    try {
      if (!this.appGateway?.server) {
        this.logger.warn(
          "[RevokeAll][Socket] appGateway.server chưa khởi tạo – bỏ qua emit force_logout",
        );
      } else {
        const room = `user_${userId}`;

        // Lấy danh sách TẤT CẢ socketId đang có trong room để debug
        const socketsInRoom = await this.appGateway.server
          .in(room)
          .allSockets();
        const allSocketIds = Array.from(socketsInRoom);

        this.logger.log(
          `[RevokeAll][Socket] Room "${room}" có ${socketsInRoom.size} socket(s): [${allSocketIds.join(", ")}]`,
        );
        this.logger.log(
          `[RevokeAll][Socket] currentSocketId (thiết bị A – sẽ bị loại trừ): "${currentSocketId || "EMPTY – sẽ emit tới TẤT CẢ"}"`,
        );

        if (socketsInRoom.size === 0) {
          this.logger.warn(
            `[RevokeAll][Socket] ⚠️ Room "${room}" không có socket nào. ` +
            `B/C có thể chưa join room hoặc đã disconnect. force_logout sẽ không được nhận realtime.`,
          );
        } else {
          const emitter = this.appGateway.server.to(room);
          // Nếu có socketId của thiết bị hiện tại → exclude nó khỏi emit
          const finalEmitter = currentSocketId
            ? emitter.except(currentSocketId)
            : emitter;

          finalEmitter.emit("force_logout", {
            revokedSessionIds,
            reason: "LOGOUT_ALL",
          });

          // Phát sự kiện cập nhật danh sách thiết bị đến mọi socket của user
          this.appGateway.server.to(room).emit("session_list_changed");

          const targetCount = currentSocketId
            ? Math.max(
              0,
              socketsInRoom.size -
              (allSocketIds.includes(currentSocketId) ? 1 : 0),
            )
            : socketsInRoom.size;

          this.logger.log(
            `[RevokeAll][Socket] ✅ Đã emit "force_logout" tới ${targetCount} socket(s) trong room "${room}" và phát "session_list_changed". ` +
            `Excluded: "${currentSocketId || "không có"}". Payload: ${revokedSessionIds.length} sessionId(s).`,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        "[RevokeAll][Socket] Lỗi khi emit force_logout: " + String(err),
      );
    }
    // ────────────────────────────────────────────────────────────────────────────

    return {
      success: true,
      message: "Đã đăng xuất tất cả thiết bị khác thành công",
      revokedCount: revokedSessionIds.length,
    };
  }

  /**
   * Xóa các session trên Supabase Auth để vô hiệu hóa khả năng refresh token.
   * Chạy bất đồng bộ, không block luồng chính.
   */
  private async destroySupabaseSessions(
    userId: string,
    sessionIds: string[],
  ): Promise<void> {
    for (const sessionId of sessionIds) {
      try {
        // Thử dùng SDK method trước
        if (typeof this.supabaseAdmin.auth.admin.deleteSession === "function") {
          await this.supabaseAdmin.auth.admin.deleteSession(sessionId);
          continue;
        }
      } catch {
        // SDK method không tồn tại hoặc thất bại, thử REST API
      }

      try {
        // Fallback: REST API Supabase Admin
        const res = await fetch(
          `${this.supabaseUrl}/auth/v1/admin/users/${userId}/sessions/${sessionId}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${this.supabaseServiceKey}`,
              apikey: this.supabaseServiceKey,
            },
          },
        );

        if (!res.ok && res.status !== 404) {
          this.logger.warn(
            `Không thể xóa Supabase session ${sessionId} (HTTP ${res.status}). ` +
            `MongoDB đã revoke – Guard sẽ block token này.`,
          );
        }
      } catch (err) {
        this.logger.warn(
          `Lỗi khi xóa Supabase session ${sessionId}: ${String(err)}`,
        );
      }
    }
  }

  async updateCurrentSessionLocation(
    userId: string,
    currentToken: string,
    userAgent: string,
    city: string,
    country: string,
  ): Promise<void> {
    if (!currentToken || !userId) return;
    try {
      const sessionId = this.extractSessionId(currentToken, userAgent);
      if (!sessionId) return;

      await this.sessionModel.updateOne(
        { sessionId, userId },
        { $set: { city, country, isGps: true } },
      );
    } catch (e) {
      this.logger.error(
        "Lỗi khi cập nhật vị trí GPS cho session: " + String(e),
      );
    }
  }

  // FE đã cung cấp hook useGlobalUserSearch để sử dụng
  async searchUsers(
    query: string,
    cursor?: string,
    limit: number = 20,
  ): Promise<PageResponse<UserResponse>> {
    if (!query || !query.trim()) {
      return {
        items: [],
        nextCursor: null,
        hasNext: false,
        limit,
      };
    }

    const cleanQuery = query.trim();

    // Xây dựng điều kiện tìm kiếm (Mongoose Query)
    // - status không bị BLOCKED
    // - email HOẶC displayName chứa từ khóa (không phân biệt hoa thường nhờ $options: "i")
    const searchFilter: Record<string, any> = {
      status: { $nin: ["BLOCKED"] },
      $or: [
        { email: { $regex: cleanQuery, $options: "i" } },
        { displayName: { $regex: cleanQuery, $options: "i" } },
      ],
    };

    if (cursor && Types.ObjectId.isValid(cursor)) {
      searchFilter._id = { $lt: new Types.ObjectId(cursor) };
    }

    // Query limit + 1 phần tử để xác định hasNext mà không cần countDocuments
    const users = await this.userModel
      .find(searchFilter)
      .select("supabaseId email displayName avatarUrl")
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean()
      .exec();

    const hasNext = users.length > limit;
    const pagedUsers = hasNext ? users.slice(0, limit) : users;

    const items: UserResponse[] = pagedUsers.map((user: UserDocument) => ({
      _id: user._id.toString(),
      supabaseId: user.supabaseId,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    }));

    const nextCursor =
      hasNext && items.length > 0 ? items[items.length - 1]._id : null;

    return {
      items,
      nextCursor,
      hasNext,
      limit,
    };
  }

  /**
   * Parse User-Agent → { deviceName, os, browser, isMobile, isDesktop }
   * deviceName: "Chrome trên Windows", "Safari trên iPhone", v.v.
   */
  private parseUserAgent(ua: string) {
    if (!ua) {
      return {
        deviceName: "Trình duyệt Web",
        os: "Không rõ",
        browser: "Trình duyệt Web",
        isMobile: false,
        isDesktop: true,
      };
    }

    let os = "Không rõ";
    let browser = "Trình duyệt Web";
    let isMobile = false;
    let isDesktop = true;

    const uaLower = ua.toLowerCase();

    // ── Detect OS ─────────────────────────────────────────────────────────────
    if (uaLower.includes("iphone")) {
      os = "iPhone";
      isMobile = true;
      isDesktop = false;
    } else if (uaLower.includes("ipad")) {
      os = "iPad";
      isMobile = true;
      isDesktop = false;
    } else if (uaLower.includes("android")) {
      os = "Android";
      isMobile = true;
      isDesktop = false;
    } else if (uaLower.includes("windows")) {
      os = "Windows";
    } else if (uaLower.includes("macintosh") || uaLower.includes("mac os x")) {
      os = "macOS";
    } else if (uaLower.includes("cros")) {
      os = "Chrome OS";
    } else if (uaLower.includes("ubuntu")) {
      os = "Ubuntu";
    } else if (uaLower.includes("linux")) {
      os = "Linux";
    }

    // ── Detect Browser (thứ tự quan trọng: Edge trước Chrome) ─────────────────
    if (uaLower.includes("electron") || uaLower.includes("tobomeetdesktop")) {
      browser = "ToboMeet Desktop";
      isDesktop = true;
    } else if (uaLower.includes("tobomeetmobile")) {
      browser = "ToboMeet Mobile";
      isMobile = true;
      isDesktop = false;
    } else if (uaLower.includes("edg/") || uaLower.includes("edge/")) {
      browser = "Edge";
    } else if (uaLower.includes("opr/") || uaLower.includes("opera")) {
      browser = "Opera";
    } else if (uaLower.includes("fxios") || uaLower.includes("firefox")) {
      browser = "Firefox";
    } else if (uaLower.includes("crios")) {
      browser = "Chrome";
      isMobile = true;
      isDesktop = false;
    } else if (uaLower.includes("chrome") || uaLower.includes("chromium")) {
      browser = "Chrome";
    } else if (
      uaLower.includes("safari") &&
      !uaLower.includes("chrome") &&
      !uaLower.includes("android")
    ) {
      browser = "Safari";
    }

    // ── Tạo deviceName dạng Chrome-Windows ──
    const cleanBrowser = browser.replace(/\s+/g, "");
    const cleanOs = os.replace(/\s+/g, "");
    let deviceName: string;
    if (cleanOs.toLowerCase() !== "khôngrõ") {
      deviceName = `${cleanBrowser}-${cleanOs}`;
    } else {
      deviceName = cleanBrowser;
    }

    return { deviceName, os, browser, isMobile, isDesktop };
  }

  /**
   * Đồng bộ ngầm danh sách session của người dùng với Supabase Admin API.
   * Chuyển các session không còn tồn tại trên Supabase thành isRevoked: true.
   */
  async syncUserSessionsWithSupabase(userId: string): Promise<void> {
    try {
      const res = await fetch(
        `${this.supabaseUrl}/auth/v1/admin/users/${userId}/sessions`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.supabaseServiceKey}`,
            apikey: this.supabaseServiceKey,
          },
        },
      );
      if (!res.ok) {
        this.logger.warn(
          `Không thể lấy danh sách sessions từ Supabase: HTTP ${res.status}`,
        );
        return;
      }
      const supabaseSessions = await res.json();
      if (!Array.isArray(supabaseSessions)) return;

      const activeSessionIds = supabaseSessions.map((s: any) => s.id);

      // Tìm những session trong DB đang đánh dấu active nhưng thực tế không còn trên Supabase
      const expiredDbSessions = await this.sessionModel
        .find({
          userId,
          isRevoked: { $ne: true },
          sessionId: { $nin: activeSessionIds },
        })
        .lean()
        .exec();

      if (expiredDbSessions.length > 0) {
        const expiredIds = expiredDbSessions.map((s) => s.sessionId);
        await this.sessionModel.updateMany(
          { sessionId: { $in: expiredIds } },
          { $set: { isRevoked: true, revokedAt: new Date() } },
        );
        this.logger.log(
          `Đã đồng bộ và đánh dấu ${expiredIds.length} session hết hạn/bị buộc đăng xuất.`,
        );

        // Bắn WebSocket thông báo danh sách session thay đổi
        try {
          if (this.appGateway?.server) {
            this.appGateway.server
              .to(`user_${userId}`)
              .emit("session_list_changed");
          }
        } catch (wsErr) {
          this.logger.error(
            "Lỗi khi bắn WebSocket thông báo session list changed lúc đồng bộ: " +
            String(wsErr),
          );
        }
      }
    } catch (err) {
      this.logger.error(
        "Lỗi khi đồng bộ sessions với Supabase: " + String(err),
      );
    }
  }

  /**
   * Lấy danh sách toàn bộ thiết bị đã đăng xuất của user có hỗ trợ phân trang.
   */
  async getLoggedOutSessions(
    userId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;
    try {
      const dbSessions = await this.sessionModel
        .find({ userId, isRevoked: true })
        .sort({ revokedAt: -1, updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec();

      const sessions: MappedSession[] = dbSessions.map((s) => ({
        id: s.sessionId,
        ip:
          s.ip === "127.0.0.1" && process.env.NODE_ENV === "production"
            ? "Không rõ"
            : s.ip || "Không rõ",
        ipAddress: s.ipAddress || null,
        deviceName: s.deviceName,
        os: s.os,
        browser: s.browser,
        loginMethod: s.loginMethod || "password",
        isMobile: !!s.isMobile,
        isDesktop: !!s.isDesktop,
        isCurrent: false,
        isGps: !!s.isGps,
        city: s.city || "",
        country: s.country || "Không xác định",
        isp: s.isp || "",
        createdAt: s.createdAt
          ? s.createdAt.toISOString()
          : new Date().toISOString(),
        updatedAt: s.updatedAt
          ? s.updatedAt.toISOString()
          : new Date().toISOString(),
        loggedOutAt: s.revokedAt
          ? s.revokedAt.toISOString()
          : s.updatedAt
            ? s.updatedAt.toISOString()
            : new Date().toISOString(),
      }));

      const total = await this.sessionModel
        .countDocuments({ userId, isRevoked: true })
        .exec();

      return { sessions, total, page, limit };
    } catch (err) {
      this.logger.error(
        "Lỗi khi đọc logged out sessions từ MongoDB: " + String(err),
      );
      return { sessions: [], total: 0, page, limit };
    }
  }

  /**
   * Doi mat khau nguoi dung.
   * - Buoc 1: Xac minh mat khau hien tai bang Supabase signInWithPassword.
   * - Buoc 2: Su dung chinh session do de goi auth.updateUser de doi mat khau (chi rotate session nay).
   * - Buoc 3: Dang xuat khoi temp session de don dep.
   */
  async changePassword(
    userId: string,
    email: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean; message: string }> {
    // Buoc 1: Xac minh mat khau hien tai
    const supabasePublic = createClient(
      this.supabaseUrl,
      this.configService.get<string>("SUPABASE_ANON_KEY"),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: authData, error: signInError } = await supabasePublic.auth.signInWithPassword(
      { email, password: currentPassword },
    );

    if (signInError || !authData?.session) {
      throw new BadRequestException("Mat khau hien tai khong chinh xac.");
    }

    // Set session vao client de thuc hien update
    await supabasePublic.auth.setSession({
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
    });

    // Buoc 2: Doi mat khau bang client auth api (chi rotate temp session, khong anh huong den browser session)
    const { error: updateError } =
      await supabasePublic.auth.updateUser({
        password: newPassword,
      });

    if (updateError) {
      this.logger.error("Loi doi mat khau: " + updateError.message);
      throw new BadRequestException(
        updateError.message || "Khong the doi mat khau. Vui long thu lai.",
      );
    }

    // Buoc 3: Dang xuat temp session de cleanup
    await supabasePublic.auth.signOut({ scope: "local" });

    return { success: true, message: "Doi mat khau thanh cong." };
  }
}

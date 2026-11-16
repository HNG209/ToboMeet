import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>("REDIS_HOST", "localhost");
    const port = parseInt(
      this.configService.get<string>("REDIS_PORT", "6379"),
      10,
    );
    const password = this.configService.get<string>("REDIS_PASSWORD", undefined);

    try {
      this.client = new Redis({
        host,
        port,
        password: password || undefined,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false, // Không giữ hàng đợi treo khi Redis ngắt kết nối
        lazyConnect: true,
        connectTimeout: 5000,
        retryStrategy: (times) => {
          if (times > 3) {
            // Giới hạn retry để không spam console khi môi trường dev không có Redis
            return null;
          }
          return Math.min(times * 1000, 3000);
        },
      });

      this.client.on("connect", () => {
        this.isConnected = true;
        this.logger.log(`[Redis] Connected successfully to ${host}:${port}`);
      });

      this.client.on("ready", () => {
        this.isConnected = true;
      });

      this.client.on("error", (err) => {
        this.isConnected = false;
        // Ghi nhận cảnh báo nhẹ nhàng, không để sập tiến trình Node.js
        this.logger.warn(`[Redis] Connection warning: ${err.message}`);
      });

      this.client.on("close", () => {
        this.isConnected = false;
      });

      // Kết nối bất đồng bộ không chặn luồng khởi động
      this.client.connect().catch((err) => {
        this.logger.warn(
          `[Redis] Initial connection failed (${err.message}). Running in DB fallback mode.`,
        );
      });
    } catch (err: any) {
      this.logger.warn(
        `[Redis] Failed to initialize Redis client: ${err?.message || err}`,
      );
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {}
    }
  }

  /**
   * Kiểm tra Redis có đang sẵn sàng hoạt động hay không
   */
  get isReady(): boolean {
    return (
      this.isConnected &&
      this.client !== null &&
      this.client.status === "ready"
    );
  }

  /**
   * Lấy instance Redis client thô nếu cần chạy pipeline/multi phức tạp
   */
  getClient(): Redis | null {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    if (!this.isReady || !this.client) return null;
    try {
      return await this.client.get(key);
    } catch (err: any) {
      this.logger.warn(`[Redis] get error for key ${key}: ${err.message}`);
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.isReady || !this.client) return;
    try {
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, value, "EX", ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    } catch (err: any) {
      this.logger.warn(`[Redis] set error for key ${key}: ${err.message}`);
    }
  }

  async del(keys: string | string[]): Promise<number> {
    if (!this.isReady || !this.client) return 0;
    try {
      const keysArray = Array.isArray(keys) ? keys : [keys];
      if (keysArray.length === 0) return 0;
      return await this.client.del(...keysArray);
    } catch (err: any) {
      this.logger.warn(`[Redis] del error: ${err.message}`);
      return 0;
    }
  }

  async hget(key: string, field: string): Promise<string | null> {
    if (!this.isReady || !this.client) return null;
    try {
      return await this.client.hget(key, field);
    } catch (err: any) {
      this.logger.warn(`[Redis] hget error for ${key}.${field}: ${err.message}`);
      return null;
    }
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    if (!this.isReady || !this.client) return 0;
    try {
      return await this.client.hset(key, field, value);
    } catch (err: any) {
      this.logger.warn(`[Redis] hset error for ${key}.${field}: ${err.message}`);
      return 0;
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    if (!this.isReady || !this.client) return {};
    try {
      return await this.client.hgetall(key);
    } catch (err: any) {
      this.logger.warn(`[Redis] hgetall error for ${key}: ${err.message}`);
      return {};
    }
  }

  /**
   * Tăng/Giảm nguyên tử bộ đếm trong Hash (In-Memory Atomic Counter)
   */
  async hincrby(
    key: string,
    field: string,
    increment: number,
  ): Promise<number | null> {
    if (!this.isReady || !this.client) return null;
    try {
      return await this.client.hincrby(key, field, increment);
    } catch (err: any) {
      this.logger.warn(`[Redis] hincrby error for ${key}.${field}: ${err.message}`);
      return null;
    }
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    if (!this.isReady || !this.client) return false;
    try {
      return (await this.client.expire(key, seconds)) === 1;
    } catch (err: any) {
      this.logger.warn(`[Redis] expire error for ${key}: ${err.message}`);
      return false;
    }
  }
}


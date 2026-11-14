import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { finalize } from "rxjs/operators";
import * as fs from "fs";
import * as path from "path";

export const IS_LATENCY_LOG_ENABLED =
  process.env.ENABLE_LATENCY_LOG !== "false";

export const LOG_TO_CONSOLE =
  process.env.LATENCY_LOG_CONSOLE !== "false";

export const LATENCY_LOG_FILE =
  process.env.LATENCY_LOG_FILE ||
  path.join(process.cwd(), "latency_report.csv");

// Khởi tạo WriteStream duy nhất có đệm RAM (Buffer)
let logStream: fs.WriteStream | null = null;

if (IS_LATENCY_LOG_ENABLED) {
  try {
    const isNewFile = !fs.existsSync(LATENCY_LOG_FILE);
    logStream = fs.createWriteStream(LATENCY_LOG_FILE, {
      flags: "a",
      encoding: "utf8",
    });

    if (isNewFile) {
      logStream.write(
        "timestamp,method,url,statusCode,total_ms,guard_ms,service_ms\n"
      );
    }

    logStream.on("error", (err) => {
      console.error("[LoggingInterceptor] Lỗi ghi CSV Stream:", err);
    });

    console.log(
      `[LoggingInterceptor] High-performance WriteStream sẵn sàng tại: ${LATENCY_LOG_FILE}`
    );
  } catch (err) {
    console.error("[LoggingInterceptor] Không thể tạo file stream:", err);
  }
}

/**
 * Hàm ghi log latency dùng chung cho cả Interceptor và ExceptionFilter
 * Tối ưu: Dùng Stream buffer trong RAM, không mở/đóng file nhiều lần
 */
export function recordLatencyLog(
  req: any,
  statusCode: number,
  serviceMs: number
) {
  if (!IS_LATENCY_LOG_ENABLED) return;
  if (!req || req._timings?.isLogged) return;
  if (req._timings) req._timings.isLogged = true;

  const now = performance.now();
  const totalMs = req._startTime
    ? Math.round((now - req._startTime) * 100) / 100
    : 0;
  const guardMs = req._timings?.guard ?? 0;
  const sMs = Math.round(serviceMs * 100) / 100;
  const method = req.method || "UNKNOWN";
  const url = req.originalUrl || req.url || "";

  // 1. In ra Terminal (có thể tắt bằng LATENCY_LOG_CONSOLE=false khi load test cực nặng)
  if (LOG_TO_CONSOLE) {
    console.log(
      `⏱️ [${method}] ${url} | ${statusCode} | Total: ${totalMs}ms (Guard: ${guardMs}ms, Service: ${sMs}ms)`
    );
  }

  // 2. Ghi vào WriteStream (non-blocking, tự gom khối 64KB xả xuống đĩa)
  if (logStream && logStream.writable) {
    const csvLine = `${new Date().toISOString()},${method},"${url}",${statusCode},${totalMs},${guardMs},${sMs}\n`;
    logStream.write(csvLine);
  }
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (!IS_LATENCY_LOG_ENABLED) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    // Bắt đầu bấm giờ Controller & Service
    const serviceStart = performance.now();

    return next.handle().pipe(
      finalize(() => {
        const serviceMs = performance.now() - serviceStart;
        recordLatencyLog(req, res.statusCode, serviceMs);
      })
    );
  }
}

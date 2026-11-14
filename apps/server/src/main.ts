import "./polyfill";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { LoggingInterceptor } from "./core/interceptors/logging.interceptor";
import { TransformInterceptor } from "./core/interceptors/transform.interceptor";
import { GlobalExceptionFilter } from "./core/filters/global-exception.filter";
import * as express from "express";
import * as path from "path";

async function bootstrap() {
  console.log("🚀 Starting Nest application bootstrap...");
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  // Đo thời gian request đa tầng (Total, Guard, Service)
  app.use((req: any, _res: any, next: any) => {
    if (process.env.ENABLE_LATENCY_LOG === "false") {
      return next();
    }
    req._startTime = performance.now();
    req._timings = {
      guard: 0,
      service: 0,
      isLogged: false,
    };
    next();
  });

  // Tự cấu hình lại bodyParser để nhận diện cả JSON thường và Webhook của LiveKit
  app.use(
    express.json({
      type: ["application/json", "application/webhook+json"],
      verify: (req: any, res, buf) => {
        req.rawBody = buf; // Chủ động gắn rawBody dạng Buffer
      },
    }),
  );

  app.use(express.urlencoded({ extended: true }));
  app.setGlobalPrefix("api");

  // Tin tưởng proxy (Nginx, Vercel...) để đọc đúng IP từ x-forwarded-for
  app.getHttpAdapter().getInstance().set("trust proxy", true);

  // Serve static uploaded files
  app.use("/api/uploads", express.static(path.join(__dirname, "..", "uploads")));

  // Trong môi trường dev: cho phép mọi origin (bao gồm thiết bị mobile trên LAN)
  // Trong môi trường prod: chỉ cho phép các domain cụ thể trong CLIENT_URL (phân cách bằng dấu phẩy)
  const isDev = process.env.NODE_ENV !== "production";
  const allowedOrigins = process.env.CLIENT_URL
    ? process.env.CLIENT_URL.split(",").map((o) => o.trim())
    : ["http://localhost:3000"];

  app.enableCors({
    origin: isDev ? true : allowedOrigins,
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    allowedHeaders: "Content-Type,Authorization,X-Socket-Id,x-device-name,x-device-model,x-device-brand,x-device-os,ngrok-skip-browser-warning",
    credentials: true,
  });
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  const port = process.env.PORT || 3001;
  await app.listen(port, "0.0.0.0");

  // Thu hồi rác và giải phóng RAM tạm của quá trình bootstrap module/metadata
  if (typeof (global as any).gc === "function") {
    (global as any).gc();
    console.log("🧹 Garbage collection executed after bootstrap.");
  }

  console.log(`🚀 Backend đang chạy tại: http://localhost:${port}/api`);
}
bootstrap();

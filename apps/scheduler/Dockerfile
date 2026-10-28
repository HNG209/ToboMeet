# ==========================================
# Stage 1: Build NestJS application
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

ENV UV_USE_IO_URING=0

# Sao chép manifest và cấu hình TypeScript / Nest CLI
COPY package*.json tsconfig*.json nest-cli.json ./

# Cài đặt tất cả dependencies để build
RUN npm install

# Sao chép mã nguồn
COPY src/ ./src/

# Biên dịch mã nguồn TypeScript sang JavaScript trong thư mục dist/
RUN npm run build

# Dọn dẹp devDependencies để chỉ giữ lại production dependencies
RUN npm prune --omit=dev

# ==========================================
# Stage 2: Production runtime image
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
# Giới hạn heap V8 128MB cho scheduler service và bật expose-gc
ENV NODE_OPTIONS="--max-old-space-size=128 --expose-gc"

# Sao chép package.json
COPY package*.json ./

# Sao chép node_modules đã prune từ stage builder
COPY --from=builder /app/node_modules ./node_modules

# Sao chép bản build dist từ stage builder
COPY --from=builder /app/dist ./dist

# Mở cổng mặc định của Scheduler Service
EXPOSE 2909

# Khởi chạy Scheduler Service
CMD ["node", "dist/main"]

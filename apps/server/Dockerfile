# ==========================================
# Stage 1: Build packages/shared and apps/server
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Tắt io_uring trong libuv để tránh lỗi ETXTBSY trên Docker/Alpine
ENV UV_USE_IO_URING=0

# Sao chép manifest của root và các workspace liên quan
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/shared/tsconfig.json ./packages/shared/
COPY apps/server/package*.json ./apps/server/
COPY apps/server/tsconfig*.json ./apps/server/
COPY apps/server/nest-cli.json ./apps/server/

# Cài đặt dependencies cho server và shared package
RUN npm ci --workspace=packages/shared --workspace=apps/server --include-workspace-root

# Sao chép mã nguồn của shared và server
COPY packages/shared/ ./packages/shared/
COPY apps/server/src/ ./apps/server/src/

# Build shared package trước, sau đó build server NestJS
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/server

# ==========================================
# Stage 2: Production runtime image
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
# Giới hạn heap V8 256MB và bật expose-gc để thu hồi RAM sau khi bootstrap
ENV NODE_OPTIONS="--max-old-space-size=256 --expose-gc"

# Cài đặt tzdata để đồng bộ múi giờ
RUN apk add --no-cache tzdata

# Tạo thư mục uploads
RUN mkdir -p /app/apps/server/uploads

# Sao chép toàn bộ node_modules và build artifacts
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/server/package*.json ./apps/server/
COPY --from=builder /app/apps/server/dist ./apps/server/dist

WORKDIR /app/apps/server

EXPOSE 3001

CMD ["node", "dist/main"]

# Sử dụng Node.js 22 LTS (Alpine) hỗ trợ built-in node:sqlite (DatabaseSync)
FROM node:22-alpine

# Thiết lập thư mục làm việc trong container
WORKDIR /app

# Tắt io_uring trong libuv để tránh lỗi spawnSync ETXTBSY khi cài đặt esbuild trên Docker/Alpine
ENV UV_USE_IO_URING=0

# Sao chép file cấu hình dependency
COPY package*.json tsconfig.json ./

# Cài đặt dependencies sạch sẽ
RUN npm ci

# Sao chép toàn bộ mã nguồn
COPY src/ ./src/

# Tạo thư mục data sẵn cho SQLite
RUN mkdir -p /app/data/rooms

# Thiết lập biến môi trường mặc định
ENV PORT=3002
ENV NODE_ENV=production

# Mở cổng kết nối 3002
EXPOSE 3002

# Khởi chạy server
CMD ["npm", "start"]

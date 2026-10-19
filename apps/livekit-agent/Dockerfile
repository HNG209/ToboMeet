FROM python:3.11-slim

# Ngăn Python tạo bytecode .pyc và hiển thị logs lập tức (unbuffered)
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Cài đặt các gói hệ thống cần thiết cho thư viện âm thanh, mạng và build native extensions
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    python3-dev \
    libglib2.0-0 \
    ca-certificates \
    curl && \
    rm -rf /var/lib/apt/lists/*

# Cài đặt các thư viện Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Tải trước trọng số mô hình hoặc file plugins (nếu có) để tăng tốc khởi động
RUN python -m livekit.agents download-files || true

# Sao chép file mã nguồn chính
COPY main.py .

# Tạo thư mục lưu transcript
RUN mkdir -p /app/transcripts

# Chạy livekit agent ở chế độ worker
CMD ["python", "main.py", "start"]

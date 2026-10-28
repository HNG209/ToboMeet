FROM python:3.11-slim

# Ngăn Python tạo bytecode .pyc, hiển thị logs lập tức, tối ưu bộ nhớ heap
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONOPTIMIZE=1
ENV MALLOC_TRIM_THRESHOLD_=100000

WORKDIR /app

# Cài đặt các gói hệ thống cần thiết cho mạng và runtime
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    python3-dev \
    libglib2.0-0 \
    ca-certificates \
    curl && \
    rm -rf /var/lib/apt/lists/*

# Cài đặt các thư viện Python (đã loại bỏ torch/silero không dùng tới để giảm RAM)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Sao chép file mã nguồn chính
COPY main.py .

# Tạo thư mục lưu transcript
RUN mkdir -p /app/transcripts

# Chạy livekit agent ở chế độ worker
CMD ["python", "main.py", "start"]

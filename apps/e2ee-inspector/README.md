# 🛡️ ToboMeet - E2EE Media Inspector (Spectator Tool)

Công cụ độc lập mô phỏng **Kẻ nghe lén (Eavesdropper / Spectator)** kết nối trực tiếp vào LiveKit SFU Server để kiểm chứng tính năng **Mã hóa đầu cuối an toàn (MLS E2EE - RFC 9420)** của ToboMeet.

---

## 🚀 Tính năng nổi bật

1. **Giao diện trực quan (Tkinter + Pillow):**
   - Khung hình theo dõi song song cả **Camera** và **Màn hình chia sẻ (Screen Share)**.
   - Thước đo cường độ âm thanh (VU Meter) và tùy chọn phát trực tiếp ra loa qua `sounddevice`.
   - Bảng thống kê số lượng frame hình ảnh & gói tin âm thanh đã giải mã theo thời gian thực.
2. **Kiểm chứng nguyên lý Zero-Trust (Server Blindness):**
   - **Khi phòng KHÔNG bật E2EE:** Bot giải mã hình ảnh mượt mà, thấy rõ khuôn mặt, nội dung chia sẻ màn hình và nghe rõ giọng nói.
   - **Khi phòng BẬT E2EE (MLS):** Bot kết nối được vào phòng nhưng **không sở hữu khóa giải mã MLS nội bộ** -> WebRTC Decoder bị chặn hoàn toàn, khung hình hiển thị trạng thái ổ khóa bảo vệ 🔒, 0 frame được giải mã và âm thanh im lặng tuyệt đối.

---

## 🛠️ Cài đặt & Khởi chạy

### Cách 1: Khởi chạy nhanh (Đã cài sẵn thư viện trong repo)
Nhấp đúp chuột vào file:
```
apps/e2ee-inspector/run.bat
```
Hoặc mở terminal tại thư mục này và chạy:
```bash
..\livekit-agent\.venv\Scripts\python.exe main.py
```

### Cách 2: Chạy với môi trường Python riêng
1. Tạo môi trường ảo:
   ```bash
   python -m venv .venv
   .venv\Scripts\activate
   ```
2. Cài đặt các thư viện:
   ```bash
   pip install -r requirements.txt
   ```
3. Khởi chạy:
   ```bash
   python main.py
   ```
   *(Có thể truyền mã cuộc họp trực tiếp: `python main.py --code ABC-1234-XYZ`)*

---

## 🎯 Hướng dẫn thực nghiệm kiểm chứng (Cho buổi báo cáo/bảo vệ KLTN)

1. Mở web ToboMeet, tạo một cuộc họp **CÓ bật** "Mã hoá đầu cuối an toàn". Bật camera hoặc chia sẻ màn hình.
2. Mở công cụ này (`run.bat`), nhập Mã cuộc họp và bấm **"▶ Bắt đầu kiểm chứng"**.
3. **Quan sát kết quả:**
   - Bot báo trạng thái: `🔒 [E2EE HOẠT ĐỘNG: GÓI TIN BỊ MÃ HOÁ - DECODER BỊ CHẶN HOÀN TOÀN]`.
   - Các khung hình camera và màn hình chia sẻ đều hiển thị icon khóa, không thể bị nghe lén.
   - Thống kê: `Frame Cam giải mã: 0 | Frame Màn hình giải mã: 0 | Gói âm thanh: 0`.
4. Tạo thêm một cuộc họp **KHÔNG bật** mã hóa để đối chứng -> Bot sẽ lập tức hiển thị video và tiếng nói công khai!


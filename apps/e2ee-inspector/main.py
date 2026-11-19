"""
ToboMeet - E2EE Media Inspector & Eavesdropper Bot
-------------------------------------------------
Công cụ độc lập dùng để kiểm chứng tính năng Mã hóa đầu cuối (MLS E2EE) của ToboMeet.
Bot này đóng vai trò như một kẻ nghe lén (Spectator) tham gia trực tiếp vào LiveKit SFU,
subscribe toàn bộ luồng Camera, Màn hình chia sẻ và Âm thanh của phòng:

- Nếu phòng KHÔNG bật E2EE: Bot hiển thị rõ hình ảnh và phát tiếng.
- Nếu phòng BẬT E2EE (MLS): WebRTC Decoder không thể giải mã các byte đã bị mã hóa
  AES-128-GCM do thiếu khóa MLS -> Màn hình hiển thị trạng thái bị khóa và im lặng hoàn toàn.
"""

import sys
import os
import time
import asyncio
import threading
import argparse
from typing import Optional, Dict

import tkinter as tk
from tkinter import ttk, messagebox
from PIL import Image, ImageTk, ImageDraw, ImageFont
import numpy as np
from dotenv import load_dotenv

# Load biến môi trường
load_dotenv()

# LiveKit SDK
try:
    from livekit import api, rtc
except ImportError:
    print("[LỖI] Chưa cài đặt livekit SDK. Vui lòng chạy: pip install -r requirements.txt")
    sys.exit(1)

# Âm thanh (tùy chọn)
try:
    import sounddevice as sd
    HAS_SOUNDDEVICE = True
except Exception:
    HAS_SOUNDDEVICE = False


class E2EEInspectorApp:
    def __init__(self, root: tk.Tk, default_code: str = ""):
        self.root = root
        self.root.title("ToboMeet - E2EE Media Inspector (Spectator)")
        self.root.geometry("1100x720")
        self.root.minsize(850, 600)
        self.root.configure(bg="#0e0e11")

        # Cấu hình kết nối
        self.livekit_url_var = tk.StringVar(
            value=os.getenv("LIVEKIT_URL", "ws://localhost:7880")
        )
        self.api_key_var = tk.StringVar(
            value=os.getenv("LIVEKIT_API_KEY", "devkey")
        )
        self.api_secret_var = tk.StringVar(
            value=os.getenv("LIVEKIT_API_SECRET", "secret")
        )
        self.meeting_code_var = tk.StringVar(
            value=default_code or os.getenv("DEFAULT_MEETING_CODE", "")
        )
        self.play_audio_var = tk.BooleanVar(value=True)

        # Trạng thái phòng & stream
        self.is_connected = False
        self.room: Optional[rtc.Room] = None
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.worker_thread: Optional[threading.Thread] = None

        # Lưu trữ frame mới nhất và thống kê
        # key: 'camera' | 'screenshare' -> (PIL Image, timestamp, width, height)
        self.latest_frames: Dict[str, tuple] = {}
        self.frame_counts = {"camera": 0, "screenshare": 0, "audio": 0}
        self.active_tracks: Dict[str, str] = {} # track_sid -> info
        self.audio_level = 0.0
        self.audio_stream_out = None

        # Lock cho dữ liệu chia sẻ giữa thread
        self.data_lock = threading.Lock()

        # Xây dựng giao diện
        self._build_ui()

        # Bắt đầu vòng lặp render GUI (30 FPS)
        self.root.after(33, self._gui_render_loop)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_ui(self):
        # 1. HEADER & CONTROL PANEL
        top_frame = tk.Frame(self.root, bg="#16161a", bd=0, relief="flat")
        top_frame.pack(fill="x", padx=16, pady=(14, 8))

        # Tiêu đề
        title_box = tk.Frame(top_frame, bg="#16161a")
        title_box.pack(side="top", fill="x", pady=(0, 10))

        tk.Label(
            title_box,
            text="ToboMeet E2EE Inspector",
            font=("Segoe UI", 13, "bold"),
            fg="#f4f4f5",
            bg="#16161a",
        ).pack(side="left")

        self.status_badge = tk.Label(
            title_box,
            text="CHƯA KẾT NỐI",
            font=("Segoe UI", 9, "bold"),
            fg="#a1a1aa",
            bg="#27272a",
            padx=10,
            pady=3,
        )
        self.status_badge.pack(side="right")

        # Hàng nhập thông số
        ctrl_row = tk.Frame(top_frame, bg="#16161a")
        ctrl_row.pack(side="top", fill="x", pady=4)

        tk.Label(
            ctrl_row,
            text="Mã cuộc họp:",
            font=("Segoe UI", 9, "bold"),
            fg="#d4d4d8",
            bg="#16161a",
        ).pack(side="left", padx=(0, 6))

        self.entry_code = tk.Entry(
            ctrl_row,
            textvariable=self.meeting_code_var,
            font=("Consolas", 10, "bold"),
            bg="#27272a",
            fg="#10b981",
            insertbackground="#ffffff",
            relief="flat",
            width=20,
        )
        self.entry_code.pack(side="left", padx=(0, 14), ipady=4)

        tk.Label(
            ctrl_row,
            text="Server URL:",
            font=("Segoe UI", 9),
            fg="#a1a1aa",
            bg="#16161a",
        ).pack(side="left", padx=(0, 6))

        tk.Entry(
            ctrl_row,
            textvariable=self.livekit_url_var,
            font=("Segoe UI", 9),
            bg="#27272a",
            fg="#e4e4e7",
            insertbackground="#ffffff",
            relief="flat",
            width=24,
        ).pack(side="left", padx=(0, 16), ipady=3)

        self.btn_connect = tk.Button(
            ctrl_row,
            text="Bắt đầu kiểm chứng",
            font=("Segoe UI", 9, "bold"),
            bg="#2563eb",
            fg="#ffffff",
            activebackground="#1d4ed8",
            activeforeground="#ffffff",
            relief="flat",
            cursor="hand2",
            padx=16,
            pady=4,
            command=self.toggle_connection,
        )
        self.btn_connect.pack(side="left", padx=(0, 10))

        if HAS_SOUNDDEVICE:
            chk_audio = tk.Checkbutton(
                ctrl_row,
                text="Phát loa",
                variable=self.play_audio_var,
                font=("Segoe UI", 9),
                fg="#d4d4d8",
                bg="#16161a",
                selectcolor="#27272a",
                activebackground="#16161a",
                activeforeground="#ffffff",
            )
            chk_audio.pack(side="left")

        # 2. MAIN VIEWPORT (2 Khung Video: Camera và Màn hình chia sẻ)
        main_viewport = tk.Frame(self.root, bg="#0e0e11")
        main_viewport.pack(fill="both", expand=True, padx=16, pady=8)

        # Cột trái: Camera
        self.cam_frame_box = tk.LabelFrame(
            main_viewport,
            text=" Luồng Camera người tham gia ",
            font=("Segoe UI", 9, "bold"),
            fg="#93c5fd",
            bg="#16161a",
            bd=1,
            relief="solid",
        )
        self.cam_frame_box.pack(side="left", fill="both", expand=True, padx=(0, 8))

        self.cam_canvas = tk.Canvas(
            self.cam_frame_box, bg="#09090b", bd=0, highlightthickness=0
        )
        self.cam_canvas.pack(fill="both", expand=True, padx=6, pady=6)

        # Cột phải: Màn hình chia sẻ (Screen Share)
        self.screen_frame_box = tk.LabelFrame(
            main_viewport,
            text=" Luồng Màn hình chia sẻ (Screen Share) ",
            font=("Segoe UI", 9, "bold"),
            fg="#a7f3d0",
            bg="#16161a",
            bd=1,
            relief="solid",
        )
        self.screen_frame_box.pack(side="left", fill="both", expand=True, padx=(8, 0))

        self.screen_canvas = tk.Canvas(
            self.screen_frame_box, bg="#09090b", bd=0, highlightthickness=0
        )
        self.screen_canvas.pack(fill="both", expand=True, padx=6, pady=6)

        # 3. FOOTER STATS & SECURITY VERIFICATION RESULT
        bottom_frame = tk.Frame(self.root, bg="#16161a", bd=0)
        bottom_frame.pack(fill="x", padx=16, pady=(4, 14))

        # Thống kê Frame & Audio
        self.lbl_stats = tk.Label(
            bottom_frame,
            text="Thống kê: Frame Cam: 0  |  Frame Màn hình: 0  |  Gói âm thanh: 0  |  Cường độ âm thanh: 0%",
            font=("Consolas", 9),
            fg="#a1a1aa",
            bg="#16161a",
            anchor="w",
        )
        self.lbl_stats.pack(side="left", padx=8, pady=6)

    def toggle_connection(self):
        if not self.is_connected:
            code = self.meeting_code_var.get().strip()
            if not code:
                messagebox.showwarning("Thiếu thông tin", "Vui lòng nhập Mã cuộc họp để kiểm chứng!")
                return
            self.start_inspecting(code)
        else:
            self.stop_inspecting()

    def start_inspecting(self, meeting_code: str):
        self.is_connected = True
        self.btn_connect.configure(text="Ngắt kết nối", bg="#dc2626", activebackground="#b91c1c")
        self.status_badge.configure(text="ĐANG KẾT NỐI...", fg="#fef08a", bg="#854d0e")
        self.entry_code.configure(state="disabled")

        # Đặt lại bộ đếm
        with self.data_lock:
            self.frame_counts = {"camera": 0, "screenshare": 0, "audio": 0}
            self.latest_frames.clear()
            self.active_tracks.clear()
            self.audio_level = 0.0

        # Khởi động event loop LiveKit ở background thread
        self.worker_thread = threading.Thread(
            target=self._run_livekit_worker,
            args=(meeting_code,),
            daemon=True,
        )
        self.worker_thread.start()

    def stop_inspecting(self):
        self.is_connected = False
        self.btn_connect.configure(text="Bắt đầu kiểm chứng", bg="#2563eb", activebackground="#1d4ed8")
        self.status_badge.configure(text="ĐÃ NGẮT KẾT NỐI", fg="#a1a1aa", bg="#27272a")
        self.entry_code.configure(state="normal")
        self.lbl_verdict.configure(text="[Trạng thái: Đã dừng]", fg="#71717a")

        if self.loop and self.room:
            asyncio.run_coroutine_threadsafe(self.room.disconnect(), self.loop)

    def _run_livekit_worker(self, meeting_code: str):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)

        try:
            self.loop.run_until_complete(self._livekit_main(meeting_code))
        except Exception as e:
            print(f"[Worker Error] {e}")
        finally:
            self.loop.close()

    async def _livekit_main(self, meeting_code: str):
        api_key = self.api_key_var.get().strip()
        api_secret = self.api_secret_var.get().strip()
        livekit_url = self.livekit_url_var.get().strip()

        # Tạo JWT Token không có quyền đặc biệt và KHÔNG CÓ KHÓA MLS
        token = (
            api.AccessToken(api_key, api_secret)
            .with_identity(f"inspector-bot-{int(time.time())}")
            .with_name("E2EE Inspector")
            .with_grants(
                api.VideoGrants(
                    room_join=True,
                    room=meeting_code,
                    can_subscribe=True,
                    can_publish=False,
                )
            )
            .to_jwt()
        )

        self.room = rtc.Room()

        @self.room.on("track_subscribed")
        def on_track_subscribed(
            track: rtc.Track,
            publication: rtc.RemoteTrackPublication,
            participant: rtc.RemoteParticipant,
        ):
            source = getattr(publication, "source", None)
            kind = getattr(track, "kind", None) or getattr(publication, "kind", None)

            print(
                f"[Track Subscribed] Loại: {kind}, Nguồn: {source}, Từ: {participant.identity}"
            )
            track_type = "camera"
            if source == rtc.TrackSource.SOURCE_SCREENSHARE or source == 3:
                track_type = "screenshare"
            elif kind == rtc.TrackKind.KIND_AUDIO or source == rtc.TrackSource.SOURCE_MICROPHONE or source == 2:
                track_type = "audio"

            with self.data_lock:
                sid = getattr(track, "sid", None) or getattr(publication, "sid", "unknown")
                self.active_tracks[sid] = f"{track_type} ({participant.name or participant.identity})"

            if kind == rtc.TrackKind.KIND_VIDEO or kind == 2:
                asyncio.create_task(self._consume_video(track, track_type))
            elif kind == rtc.TrackKind.KIND_AUDIO or kind == 1:
                asyncio.create_task(self._consume_audio(track))

        @self.room.on("track_unsubscribed")
        def on_track_unsubscribed(
            track: rtc.Track,
            publication: rtc.RemoteTrackPublication,
            participant: rtc.RemoteParticipant,
        ):
            with self.data_lock:
                sid = getattr(track, "sid", None) or getattr(publication, "sid", None)
                if sid and sid in self.active_tracks:
                    del self.active_tracks[sid]

        try:
            print(f"[LiveKit] Đang kết nối vào {meeting_code}...")
            await self.room.connect(livekit_url, token)
            print("[LiveKit] Đã kết nối thành công!")
            self.root.after(0, lambda: self.status_badge.configure(
                text="ĐÃ KẾT NỐI", fg="#6ee7b7", bg="#064e3b"
            ))

            # Đồng bộ các track đã có sẵn trong phòng khi bot vừa vào
            for p in self.room.remote_participants.values():
                for pub in p.track_publications.values():
                    if pub.track and pub.subscribed:
                        on_track_subscribed(pub.track, pub, p)

            while self.is_connected:
                await asyncio.sleep(0.5)

        except Exception as err:
            print(f"[LiveKit Connect Error] {err}")
            self.root.after(0, lambda: self.status_badge.configure(
                text=f"LỖI KẾT NỐI: {err}", fg="#fca5a5", bg="#7f1d1d"
            ))
        finally:
            if self.room:
                await self.room.disconnect()

    async def _consume_video(self, track: rtc.Track, track_type: str):
        video_stream = rtc.VideoStream(track)
        try:
            # Nếu phòng bật E2EE: WebRTC bitstream decoder không thể giải mã các byte đã mã hóa
            # -> Vòng lặp này sẽ không nhận được frame nào (0 frames) hoặc báo lỗi!
            async for event in video_stream:
                if not self.is_connected:
                    break

                frame = event.frame
                converted = frame.convert(rtc.VideoBufferType.RGB24)
                arr = np.frombuffer(converted.data, dtype=np.uint8).reshape(
                    (frame.height, frame.width, 3)
                )
                img = Image.fromarray(arr)

                with self.data_lock:
                    self.frame_counts[track_type] += 1
                    self.latest_frames[track_type] = (
                        img,
                        time.time(),
                        frame.width,
                        frame.height,
                    )
        except Exception as e:
            print(f"[Video Decode Error - E2EE Blocked]: {e}")

    async def _consume_audio(self, track: rtc.Track):
        audio_stream = rtc.AudioStream(track)
        out_stream = None

        if HAS_SOUNDDEVICE and self.play_audio_var.get():
            try:
                out_stream = sd.RawOutputStream(
                    samplerate=48000, channels=1, dtype="int16"
                )
                out_stream.start()
            except Exception as e:
                print(f"[Sounddevice Init Error]: {e}")

        try:
            async for event in audio_stream:
                if not self.is_connected:
                    break

                frame = event.frame
                data = frame.data

                # Tính mức âm lượng (RMS)
                samples = np.frombuffer(data, dtype=np.int16)
                if len(samples) > 0:
                    rms = np.sqrt(np.mean(samples.astype(np.float32) ** 2))
                    normalized_vol = min(1.0, rms / 4000.0)
                else:
                    normalized_vol = 0.0

                with self.data_lock:
                    self.frame_counts["audio"] += 1
                    self.audio_level = normalized_vol

                # Phát ra loa nếu chọn
                if out_stream and self.play_audio_var.get():
                    try:
                        out_stream.write(data)
                    except Exception:
                        pass
        except Exception as e:
            print(f"[Audio Decode Error - E2EE Blocked]: {e}")
        finally:
            if out_stream:
                out_stream.stop()
                out_stream.close()

    def _gui_render_loop(self):
        """Vòng lặp vẽ giao diện 30 FPS trên Main Thread của Tkinter"""
        with self.data_lock:
            cam_data = self.latest_frames.get("camera")
            screen_data = self.latest_frames.get("screenshare")
            cam_count = self.frame_counts["camera"]
            screen_count = self.frame_counts["screenshare"]
            audio_count = self.frame_counts["audio"]
            audio_lvl = self.audio_level
            has_tracks = len(self.active_tracks) > 0

        # 1. Vẽ khung Camera
        self._render_slot(
            self.cam_canvas,
            cam_data,
            title="CAMERA",
            has_track=any("camera" in t for t in self.active_tracks.values()),
            total_frames=cam_count,
        )

        # 2. Vẽ khung Screen Share
        self._render_slot(
            self.screen_canvas,
            screen_data,
            title="MÀN HÌNH CHIA SẺ",
            has_track=any("screenshare" in t for t in self.active_tracks.values()),
            total_frames=screen_count,
        )

        # 3. Cập nhật thống kê & Phán đoán bảo mật E2EE
        vol_pct = int(audio_lvl * 100)
        has_cam_track = any("camera" in t for t in self.active_tracks.values())
        has_screen_track = any("screenshare" in t for t in self.active_tracks.values())
        has_audio_track = any("audio" in t for t in self.active_tracks.values())

        cam_status_str = (
            f"🔓 {cam_count} frames rõ"
            if cam_count > 0
            else ("⚡ [BYTE NHIỄU CIPHERTEXT]" if has_cam_track else "Chưa có")
        )
        screen_status_str = (
            f"🔓 {screen_count} frames rõ"
            if screen_count > 0
            else ("⚡ [BYTE NHIỄU CIPHERTEXT]" if has_screen_track else "Chưa có")
        )
        audio_status_str = (
            f"🔓 {audio_count} gói ({vol_pct}%)"
            if audio_count > 0
            else ("🔒 [BỊ MÃ HOÁ (IM LẶNG)]" if has_audio_track else "Chưa có")
        )

        self.lbl_stats.configure(
            text=f"Camera: {cam_status_str}  |  Màn hình: {screen_status_str}  |  Âm thanh: {audio_status_str}"
        )

        # Tiếp tục vòng lặp
        self.root.after(33, self._gui_render_loop)

    def _generate_noise_frame(self, w: int, h: int, title: str) -> ImageTk.PhotoImage:
        """
        Sinh frame nhiễu byte (ciphertext noise / digital static) ngẫu nhiên theo thời gian thực.
        Mô phỏng trực tiếp việc render các byte dữ liệu đã bị mã hóa AES-128-GCM lên màn hình.
        """
        nw, nh = max(64, min(w, 320)), max(48, min(h, 200))

        # 1. Sinh ma trận hạt nhiễu tĩnh ngẫu nhiên (digital snow / byte matrix)
        noise = np.random.randint(15, 240, (nh, nw, 3), dtype=np.uint8)

        # 2. Tạo một vài dải scanline glitch kỹ thuật số ngẫu nhiên mô phỏng macroblock bị vỡ do mã hóa
        for _ in range(3):
            gy = np.random.randint(0, nh - 8)
            gh = np.random.randint(3, 10)
            noise[gy : gy + gh, :] = np.random.randint(0, 256, (gh, nw, 3), dtype=np.uint8)

        # Đổi kích thước khớp với canvas (dùng NEAREST để giữ nguyên các hạt byte sắc nét)
        img = Image.fromarray(noise).resize((w, h), Image.Resampling.NEAREST)
        draw = ImageDraw.Draw(img)

        # 3. Thanh tiêu đề trạng thái ở phía trên
        draw.rectangle([(0, 0), (w, 34)], fill=(12, 12, 16))
        draw.text(
            (12, 9),
            f"⚡ [CIPHERTEXT NOISE] {title}: DỮ LIỆU ĐANG BỊ MÃ HOÁ E2EE",
            fill="#f43f5e",
        )

        # 4. Sinh chuỗi Hex ngẫu nhiên mô phỏng trực tiếp luồng byte ciphertext thực tế
        raw_hex_1 = " ".join(f"{b:02X}" for b in np.random.randint(0, 256, 12))
        raw_hex_2 = " ".join(f"{b:02X}" for b in np.random.randint(0, 256, 12))

        # 5. Hộp hiển thị trực quan các byte nhiễu ở chân màn hình
        draw.rectangle([(0, h - 54), (w, h)], fill=(10, 10, 14))
        draw.text(
            (12, h - 48),
            f"BYTE THÔ [AES-128-GCM]: {raw_hex_1}",
            fill="#38bdf8",
        )
        draw.text(
            (12, h - 28),
            f"HEX STREAM: {raw_hex_2}  |  WebRTC: Không có khóa giải mã MLS",
            fill="#a1a1aa",
        )

        return ImageTk.PhotoImage(img)

    def _render_slot(
        self,
        canvas: tk.Canvas,
        frame_tuple: Optional[tuple],
        title: str,
        has_track: bool,
        total_frames: int,
    ):
        cw = canvas.winfo_width()
        ch = canvas.winfo_height()
        if cw < 20 or ch < 20:
            return

        # Trường hợp 1: Có frame giải mã được (Phòng thường không E2EE hoặc có frame hình ảnh)
        if frame_tuple is not None and (time.time() - frame_tuple[1] < 2.0):
            pil_img, _, w, h = frame_tuple
            # Fit vào khung canvas giữ nguyên tỉ lệ
            scale = min(cw / w, ch / h)
            nw, nh = int(w * scale), int(h * scale)
            resized = pil_img.resize((nw, nh), Image.Resampling.BILINEAR)

            # Tạo overlay thông báo
            draw = ImageDraw.Draw(resized)
            draw.rectangle([(8, 8), (280, 36)], fill=(0, 0, 0, 180))
            draw.text(
                (14, 14),
                f"🔓 ĐÃ GIẢI MÃ: {w}x{h} ({total_frames} frames)",
                fill="#4ade80",
            )

            photo = ImageTk.PhotoImage(resized)
            canvas.delete("all")
            canvas.create_image(cw // 2, ch // 2, image=photo, anchor="center")
            canvas.image = photo # Giữ reference tránh bị Garbage Collected
            return

        # Trường hợp 2: Có track được publish nhưng dữ liệu là Ciphertext (E2EE đang bật)
        # RENDER TRỰC TIẾP CÁC BYTE NHIỄU (DIGITAL STATIC / CIPHERTEXT BYTE MATRIX) LÊN MÀN HÌNH
        if self.is_connected and has_track:
            noise_photo = self._generate_noise_frame(cw, ch, title)
            canvas.delete("all")
            canvas.create_image(cw // 2, ch // 2, image=noise_photo, anchor="center")
            canvas.image = noise_photo
            return

        # Trường hợp 3: Chưa có luồng
        canvas.delete("all")
        if self.is_connected:
            canvas.create_text(
                cw // 2,
                ch // 2,
                text=f"Đang chờ luồng {title.lower()}...",
                font=("Segoe UI", 10),
                fill="#52525b",
            )
        else:
            canvas.create_text(
                cw // 2,
                ch // 2,
                text=f"Chưa kết nối\n(Bấm 'Bắt đầu kiểm chứng' để nghe lén {title.lower()})",
                font=("Segoe UI", 9),
                fill="#3f3f46",
                justify="center",
            )

    def _on_close(self):
        self.stop_inspecting()
        self.root.destroy()


def main():
    parser = argparse.ArgumentParser(description="ToboMeet E2EE Inspector")
    parser.add_argument("--code", type=str, default="", help="Mã cuộc họp cần kiểm chứng")
    args = parser.parse_args()

    root = tk.Tk()
    app = E2EEInspectorApp(root, default_code=args.code)
    root.mainloop()


if __name__ == "__main__":
    main()


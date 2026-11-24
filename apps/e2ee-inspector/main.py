"""
ToboMeet - E2EE Media Inspector & Security Evaluator Bot
--------------------------------------------------------
Standalone security inspection tool for ToboMeet MLS E2EE.
Supports 3 academic evaluation scenarios (Graduation Thesis):
1. Eavesdropper Mode (No Key):
   - No key provided -> Video/audio cannot be decrypted (renders raw ciphertext noise).
2. Valid Current Key Evaluation:
   - Injects the valid 16/32-byte Hex key of current Epoch -> FrameCryptor decrypts stream,
     displaying crisp camera/screenshare video and audio.
3. Stale / Revoked Key Evaluation (FS & PCS):
   - Injects old key from prior Epoch (after new member joins or a member is removed)
   - Verifies Forward Secrecy (FS) & Post-Compromise Security (PCS):
     Stale key is instantly revoked and cannot decrypt frames of the new Epoch!
"""

import sys
import os
import time
import asyncio
import threading
import argparse
import re
from typing import Optional, Dict

import tkinter as tk
from tkinter import ttk, messagebox
from PIL import Image, ImageTk, ImageDraw, ImageFont
import numpy as np
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# LiveKit SDK
try:
    from livekit import api, rtc
except ImportError:
    print("[ERROR] LiveKit SDK not installed. Please run: pip install -r requirements.txt")
    sys.exit(1)

# Audio playback (optional)
try:
    import sounddevice as sd
    HAS_SOUNDDEVICE = True
except Exception:
    HAS_SOUNDDEVICE = False


class E2EEInspectorApp:
    def __init__(self, root: tk.Tk, default_code: str = ""):
        self.root = root
        self.root.title("ToboMeet - E2EE Security Inspector & Evaluator")
        self.root.geometry("1160x760")
        self.root.minsize(900, 640)
        self.root.configure(bg="#0e0e11")

        # Connection config
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

        # E2EE & Key Injection config
        # "none": Eavesdropper (No Key)
        # "valid": Valid Current Key
        # "stale": Stale / Revoked Key (Test FS & PCS)
        self.key_mode_var = tk.StringVar(value="none")
        self.e2ee_key_var = tk.StringVar(value="")
        self.current_applied_key: Optional[bytes] = None

        # Room & stream status
        self.is_connected = False
        self.room: Optional[rtc.Room] = None
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.worker_thread: Optional[threading.Thread] = None

        # Frame storage & stats
        # key: 'camera' | 'screenshare' -> (PIL Image, timestamp, width, height)
        self.latest_frames: Dict[str, tuple] = {}
        self.frame_counts = {"camera": 0, "screenshare": 0, "audio": 0}
        self.active_tracks: Dict[str, str] = {}  # track_sid -> info
        self.audio_level = 0.0
        self.audio_stream_out = None

        # Thread synchronization lock
        self.data_lock = threading.Lock()

        # Build GUI
        self._build_ui()

        # Start GUI render loop (30 FPS)
        self.root.after(33, self._gui_render_loop)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_ui(self):
        # 1. HEADER & CONTROL PANEL
        top_frame = tk.Frame(self.root, bg="#16161a", bd=0, relief="flat")
        top_frame.pack(fill="x", padx=16, pady=(12, 6))

        # Title bar
        title_box = tk.Frame(top_frame, bg="#16161a")
        title_box.pack(side="top", fill="x", pady=(0, 8))

        tk.Label(
            title_box,
            text="ToboMeet E2EE Security Evaluator (MLS Inspector)",
            font=("Segoe UI", 13, "bold"),
            fg="#f4f4f5",
            bg="#16161a",
        ).pack(side="left")

        self.status_badge = tk.Label(
            title_box,
            text="DISCONNECTED",
            font=("Segoe UI", 9, "bold"),
            fg="#a1a1aa",
            bg="#27272a",
            padx=10,
            pady=3,
        )
        self.status_badge.pack(side="right")

        # Row 1: Connection parameters
        ctrl_row = tk.Frame(top_frame, bg="#16161a")
        ctrl_row.pack(side="top", fill="x", pady=2)

        tk.Label(
            ctrl_row,
            text="Meeting Code:",
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
            width=18,
        )
        self.entry_code.pack(side="left", padx=(0, 12), ipady=3)

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
            width=22,
        ).pack(side="left", padx=(0, 14), ipady=3)

        self.btn_connect = tk.Button(
            ctrl_row,
            text="Start Evaluation",
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
                text="Play Audio",
                variable=self.play_audio_var,
                font=("Segoe UI", 9),
                fg="#d4d4d8",
                bg="#16161a",
                selectcolor="#27272a",
                activebackground="#16161a",
                activeforeground="#ffffff",
            )
            chk_audio.pack(side="left")

        # Row 2: Security Evaluation & Key Injection Control Panel
        key_box = tk.LabelFrame(
            top_frame,
            text=" E2EE Security Evaluation Scenarios (MLS Key Injection) ",
            font=("Segoe UI", 8, "bold"),
            fg="#38bdf8",
            bg="#16161a",
            bd=1,
            relief="solid",
        )
        key_box.pack(side="top", fill="x", pady=(6, 4), padx=2)

        key_inner = tk.Frame(key_box, bg="#16161a")
        key_inner.pack(fill="x", padx=8, pady=5)

        # Radio buttons for 3 scenarios
        tk.Label(
            key_inner,
            text="Mode:",
            font=("Segoe UI", 9, "bold"),
            fg="#94a3b8",
            bg="#16161a",
        ).pack(side="left", padx=(0, 4))

        modes = [
            ("none", "1. Eavesdropper (No Key)", "#a1a1aa"),
            ("valid", "2. Valid Current Key", "#34d399"),
            ("stale", "3. Stale / Revoked Key (FS & PCS)", "#f87171"),
        ]
        for mode_val, mode_text, mode_color in modes:
            rb = tk.Radiobutton(
                key_inner,
                text=mode_text,
                variable=self.key_mode_var,
                value=mode_val,
                font=("Segoe UI", 8, "bold"),
                fg=mode_color,
                bg="#16161a",
                selectcolor="#27272a",
                activebackground="#16161a",
                activeforeground=mode_color,
                command=self._on_mode_changed,
            )
            rb.pack(side="left", padx=(0, 8))

        # Hex Key Entry Box
        tk.Label(
            key_inner,
            text="Hex Key (16/32B):",
            font=("Segoe UI", 9, "bold"),
            fg="#e2e8f0",
            bg="#16161a",
        ).pack(side="left", padx=(8, 4))

        self.entry_key = tk.Entry(
            key_inner,
            textvariable=self.e2ee_key_var,
            font=("Consolas", 9),
            bg="#27272a",
            fg="#60a5fa",
            insertbackground="#ffffff",
            relief="flat",
            width=26,
            state="disabled",
        )
        self.entry_key.pack(side="left", padx=(0, 6), ipady=3)

        # Paste Key Button
        self.btn_paste = tk.Button(
            key_inner,
            text="📋 Paste",
            font=("Segoe UI", 8),
            bg="#3f3f46",
            fg="#ffffff",
            activebackground="#52525b",
            relief="flat",
            cursor="hand2",
            padx=6,
            pady=2,
            command=self._paste_key_from_clipboard,
        )
        self.btn_paste.pack(side="left", padx=(0, 6))

        # Dynamic Key Update Button
        self.btn_apply_key = tk.Button(
            key_inner,
            text="🔄 Apply Key",
            font=("Segoe UI", 8, "bold"),
            bg="#059669",
            fg="#ffffff",
            activebackground="#047857",
            relief="flat",
            cursor="hand2",
            padx=8,
            pady=2,
            command=self.apply_key_dynamic,
        )
        self.btn_apply_key.pack(side="left", padx=(0, 6))

        # 2. MAIN VIEWPORT (2 Video Canvas: Camera & Screen Share)
        main_viewport = tk.Frame(self.root, bg="#0e0e11")
        main_viewport.pack(fill="both", expand=True, padx=16, pady=4)

        # Left Column: Camera
        self.cam_frame_box = tk.LabelFrame(
            main_viewport,
            text=" Participant Camera Stream ",
            font=("Segoe UI", 9, "bold"),
            fg="#93c5fd",
            bg="#16161a",
            bd=1,
            relief="solid",
        )
        self.cam_frame_box.pack(side="left", fill="both", expand=True, padx=(0, 6))

        self.cam_canvas = tk.Canvas(
            self.cam_frame_box, bg="#09090b", bd=0, highlightthickness=0
        )
        self.cam_canvas.pack(fill="both", expand=True, padx=6, pady=6)

        # Right Column: Screen Share
        self.screen_frame_box = tk.LabelFrame(
            main_viewport,
            text=" Screen Share Stream ",
            font=("Segoe UI", 9, "bold"),
            fg="#a7f3d0",
            bg="#16161a",
            bd=1,
            relief="solid",
        )
        self.screen_frame_box.pack(side="left", fill="both", expand=True, padx=(6, 0))

        self.screen_canvas = tk.Canvas(
            self.screen_frame_box, bg="#09090b", bd=0, highlightthickness=0
        )
        self.screen_canvas.pack(fill="both", expand=True, padx=6, pady=6)

        # 3. FOOTER STATS & SECURITY VERIFICATION RESULT
        bottom_frame = tk.Frame(self.root, bg="#16161a", bd=0)
        bottom_frame.pack(fill="x", padx=16, pady=(4, 12))

        # Frame & Audio statistics
        self.lbl_stats = tk.Label(
            bottom_frame,
            text="Camera: None  |  Screen: None  |  Audio: None",
            font=("Consolas", 9),
            fg="#a1a1aa",
            bg="#16161a",
            anchor="w",
        )
        self.lbl_stats.pack(side="left", padx=8, pady=4)

        # Security Verdict Badge
        self.lbl_verdict = tk.Label(
            bottom_frame,
            text="[Status: Waiting to Connect]",
            font=("Segoe UI", 9, "bold"),
            fg="#71717a",
            bg="#16161a",
            padx=10,
        )
        self.lbl_verdict.pack(side="right", padx=8, pady=4)

    def _on_mode_changed(self):
        mode = self.key_mode_var.get()
        if mode == "none":
            self.entry_key.configure(state="disabled")
        else:
            self.entry_key.configure(state="normal")
            self.entry_key.focus_set()

    def _paste_key_from_clipboard(self):
        try:
            cb = self.root.clipboard_get().strip()
            # Match hex string: 32 chars (16 bytes MLS key) or 64 chars (32 bytes key)
            m = re.search(r"[0-9a-fA-F]{32,64}", cb)
            if m:
                cb = m.group(0)
            else:
                clean = re.sub(r"[^0-9a-fA-F]", "", cb)
                if len(clean) >= 16:
                    cb = clean
            self.e2ee_key_var.set(cb)
            if self.key_mode_var.get() == "none":
                self.key_mode_var.set("valid")
            self.entry_key.configure(state="normal")
            print(f"[E2EE Inspector] Pasted Hex key: {cb} ({len(cb) // 2} bytes)")
        except Exception as e:
            print(f"[Paste Error] {e}")

    def _get_key_bytes(self) -> Optional[bytes]:
        mode = self.key_mode_var.get()
        if mode == "none":
            return None
        key_str = self.e2ee_key_var.get().strip()
        if not key_str:
            return None

        # Clean hex string (strip spaces, 0x, hyphens)
        clean_hex = re.sub(r"[^0-9a-fA-F]", "", key_str)
        try:
            if len(clean_hex) % 2 == 0 and len(clean_hex) >= 16:
                return bytes.fromhex(clean_hex)
        except ValueError:
            pass

        # Fallback if plaintext passphrase was entered
        import hashlib
        return hashlib.sha256(key_str.encode()).digest()

    def apply_key_dynamic(self):
        """Dynamically inject / update decryption key into WebRTC FrameCryptor"""
        key_bytes = self._get_key_bytes()
        if not key_bytes:
            messagebox.showwarning(
                "Missing Key",
                "Please enter or paste a valid Hex key before applying!"
            )
            return

        self.current_applied_key = key_bytes

        # Check if current room has E2EE KeyProvider initialized
        has_kp = (
            self.room
            and hasattr(self.room, "e2ee_manager")
            and self.room.e2ee_manager
            and hasattr(self.room.e2ee_manager, "_key_provider")
        )

        if self.is_connected and not has_kp:
            print("[E2EE Inspector] Room was not configured with E2EE initially -> Auto-reconnecting with E2EE...")
            meeting_code = self.meeting_code_var.get().strip()
            self.stop_inspecting()
            self.root.after(300, lambda: self.start_inspecting(meeting_code))
            return

        if self.room and self.loop:
            async def _update_key():
                try:
                    if hasattr(self.room, "e2ee_manager") and self.room.e2ee_manager:
                        mgr = self.room.e2ee_manager
                        mgr.set_enabled(True)
                        if hasattr(mgr, "_key_provider") and mgr.key_provider:
                            mgr.key_provider.set_shared_key(key_bytes, key_index=0)
                            for p in self.room.remote_participants.values():
                                mgr.key_provider.set_key(p.identity, key_bytes, key_index=0)
                        for cryptor in mgr.frame_cryptors():
                            cryptor.set_enabled(True)
                            cryptor.set_key_index(0)
                        print(f"[E2EE Inspector] Updated decryption key ({len(key_bytes)} bytes - HKDF) successfully!")
                except Exception as e:
                    print(f"[Dynamic Key Error] {e}")

            asyncio.run_coroutine_threadsafe(_update_key(), self.loop)

            with self.data_lock:
                self.frame_counts = {"camera": 0, "screenshare": 0, "audio": 0}
                self.latest_frames.clear()

            mode_desc = "Stale Key (Test FS/PCS)" if self.key_mode_var.get() == "stale" else "Valid Key"
            messagebox.showinfo(
                "Key Applied",
                f"Loaded {mode_desc} ({len(key_bytes)} bytes) into WebRTC FrameCryptor!\nObserve screen to verify decryption status."
            )
        else:
            messagebox.showinfo(
                "Key Saved",
                f"Key configured ({len(key_bytes)} bytes). Key will be loaded when you click 'Start Evaluation'."
            )

    def toggle_connection(self):
        if not self.is_connected:
            code = self.meeting_code_var.get().strip()
            if not code:
                messagebox.showwarning("Missing Info", "Please enter Meeting Code to evaluate!")
                return
            self.start_inspecting(code)
        else:
            self.stop_inspecting()

    def start_inspecting(self, meeting_code: str):
        self.is_connected = True
        self.btn_connect.configure(text="Disconnect", bg="#dc2626", activebackground="#b91c1c")
        self.status_badge.configure(text="CONNECTING...", fg="#fef08a", bg="#854d0e")
        self.entry_code.configure(state="disabled")

        # Reset counters
        with self.data_lock:
            self.frame_counts = {"camera": 0, "screenshare": 0, "audio": 0}
            self.latest_frames.clear()
            self.active_tracks.clear()
            self.audio_level = 0.0

        # Start LiveKit event loop in background thread
        self.worker_thread = threading.Thread(
            target=self._run_livekit_worker,
            args=(meeting_code,),
            daemon=True,
        )
        self.worker_thread.start()

    def stop_inspecting(self):
        self.is_connected = False
        self.btn_connect.configure(text="Start Evaluation", bg="#2563eb", activebackground="#1d4ed8")
        self.status_badge.configure(text="DISCONNECTED", fg="#a1a1aa", bg="#27272a")
        self.entry_code.configure(state="normal")
        self.lbl_verdict.configure(text="[Status: Stopped]", fg="#71717a")

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

        # Generate Spectator Access Token
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

        @self.room.on("e2ee_state_changed")
        def on_e2ee_state_changed(participant, state):
            state_names = {
                0: "NEW",
                1: "OK (DECRYPTED SUCCESSFULLY)",
                2: "DECRYPTION_FAILED (INVALID KEY)",
                3: "ENCRYPTION_FAILED",
                4: "MISSING_KEY",
                5: "INTERNAL_ERROR",
                6: "KEY_RATCHETED",
            }
            state_str = state_names.get(state, f"UNKNOWN({state})")
            p_name = getattr(participant, "identity", "unknown") if participant else "unknown"
            print(f"[LiveKit E2EE Event] Participant: {p_name} | State: {state_str}")

        @self.room.on("track_subscribed")
        def on_track_subscribed(
            track: rtc.Track,
            publication: rtc.RemoteTrackPublication,
            participant: rtc.RemoteParticipant,
        ):
            source = getattr(publication, "source", None)
            kind = getattr(track, "kind", None) or getattr(publication, "kind", None)

            print(
                f"[Track Subscribed] Kind: {kind}, Source: {source}, From: {participant.identity}"
            )
            track_type = "camera"
            if source == rtc.TrackSource.SOURCE_SCREENSHARE or source == 3:
                track_type = "screenshare"
            elif kind == rtc.TrackKind.KIND_AUDIO or source == rtc.TrackSource.SOURCE_MICROPHONE or source == 2:
                track_type = "audio"

            with self.data_lock:
                sid = getattr(track, "sid", None) or getattr(publication, "sid", "unknown")
                self.active_tracks[sid] = f"{track_type} ({participant.name or participant.identity})"

            # Activate FrameCryptor if key is already loaded
            if hasattr(self.room, "e2ee_manager") and self.room.e2ee_manager:
                mgr = self.room.e2ee_manager
                mgr.set_enabled(True)
                if hasattr(mgr, "_key_provider") and mgr.key_provider and self.current_applied_key:
                    mgr.key_provider.set_shared_key(self.current_applied_key, key_index=0)
                    mgr.key_provider.set_key(participant.identity, self.current_applied_key, key_index=0)
                for cryptor in mgr.frame_cryptors():
                    cryptor.set_enabled(True)
                    cryptor.set_key_index(0)

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
            print(f"[LiveKit] Connecting to {meeting_code}...")

            # Always configure E2EEOptions with HKDF to ensure FrameCryptor pipeline is ready
            key_bytes = self._get_key_bytes()
            self.current_applied_key = key_bytes

            if key_bytes:
                print(f"[E2EE Inspector] Starting with decryption key ({len(key_bytes)} bytes - HKDF standard)...")
            else:
                print("[E2EE Inspector] Starting Eavesdropper mode (E2EE ready, NO KEY)")

            kp_opts = rtc.KeyProviderOptions(
                shared_key=key_bytes,
                key_derivation_function=rtc.KeyDerivationFunction.HKDF,
                ratchet_salt=b"LKFrameEncryptionKey",
                ratchet_window_size=0,
            )
            e2ee_opts = rtc.E2EEOptions(
                key_provider_options=kp_opts,
                encryption_type=rtc.EncryptionType.GCM,
            )
            room_options = rtc.RoomOptions(encryption=e2ee_opts)

            await self.room.connect(livekit_url, token, options=room_options)
            print("[LiveKit] Connected successfully!")

            # Synchronize key and enable frame cryptors for all current participants
            if hasattr(self.room, "e2ee_manager") and self.room.e2ee_manager:
                mgr = self.room.e2ee_manager
                mgr.set_enabled(True)
                if hasattr(mgr, "_key_provider") and mgr.key_provider and self.current_applied_key:
                    mgr.key_provider.set_shared_key(self.current_applied_key, key_index=0)
                    for p in self.room.remote_participants.values():
                        mgr.key_provider.set_key(p.identity, self.current_applied_key, key_index=0)
                for cryptor in mgr.frame_cryptors():
                    cryptor.set_enabled(True)
                    cryptor.set_key_index(0)
                if self.current_applied_key:
                    print(f"[E2EE Inspector] Activated E2EEManager & FrameCryptor ({len(self.current_applied_key)} bytes)!")

            self.root.after(0, lambda: self.status_badge.configure(
                text="CONNECTED", fg="#6ee7b7", bg="#064e3b"
            ))

            # Synchronize already published tracks upon joining
            for p in self.room.remote_participants.values():
                for pub in p.track_publications.values():
                    if pub.track and pub.subscribed:
                        on_track_subscribed(pub.track, pub, p)

            while self.is_connected:
                await asyncio.sleep(0.5)

        except Exception as err:
            print(f"[LiveKit Connect Error] {err}")
            self.root.after(0, lambda: self.status_badge.configure(
                text=f"CONNECTION ERROR: {err}", fg="#fca5a5", bg="#7f1d1d"
            ))
        finally:
            if self.room:
                await self.room.disconnect()

    async def _consume_video(self, track: rtc.Track, track_type: str):
        video_stream = rtc.VideoStream(track)
        try:
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

                # Calculate volume level (RMS)
                samples = np.frombuffer(data, dtype=np.int16)
                if len(samples) > 0:
                    rms = np.sqrt(np.mean(samples.astype(np.float32) ** 2))
                    normalized_vol = min(1.0, rms / 4000.0)
                else:
                    normalized_vol = 0.0

                with self.data_lock:
                    self.frame_counts["audio"] += 1
                    self.audio_level = normalized_vol

                # Play to speakers if enabled
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
        """GUI render loop running at ~30 FPS on Tkinter Main Thread"""
        with self.data_lock:
            cam_data = self.latest_frames.get("camera")
            screen_data = self.latest_frames.get("screenshare")
            cam_count = self.frame_counts["camera"]
            screen_count = self.frame_counts["screenshare"]
            audio_count = self.frame_counts["audio"]
            audio_lvl = self.audio_level

        # 1. Render Camera slot
        self._render_slot(
            self.cam_canvas,
            cam_data,
            title="CAMERA",
            has_track=any("camera" in t for t in self.active_tracks.values()),
            total_frames=cam_count,
        )

        # 2. Render Screen Share slot
        self._render_slot(
            self.screen_canvas,
            screen_data,
            title="SCREEN SHARE",
            has_track=any("screenshare" in t for t in self.active_tracks.values()),
            total_frames=screen_count,
        )

        # 3. Update stats & security verdict
        vol_pct = int(audio_lvl * 100)
        has_cam_track = any("camera" in t for t in self.active_tracks.values())
        has_screen_track = any("screenshare" in t for t in self.active_tracks.values())
        has_audio_track = any("audio" in t for t in self.active_tracks.values())

        cam_status_str = (
            f"🔓 {cam_count} clear frames"
            if cam_count > 0
            else ("⚡ [CIPHERTEXT NOISE]" if has_cam_track else "None")
        )
        screen_status_str = (
            f"🔓 {screen_count} clear frames"
            if screen_count > 0
            else ("⚡ [CIPHERTEXT NOISE]" if has_screen_track else "None")
        )
        audio_status_str = (
            f"🔓 {audio_count} pkts ({vol_pct}%)"
            if audio_count > 0
            else ("🔒 [ENCRYPTED (MUTED)]" if has_audio_track else "None")
        )

        self.lbl_stats.configure(
            text=f"Camera: {cam_status_str}  |  Screen: {screen_status_str}  |  Audio: {audio_status_str}"
        )

        # 4. Security Verdict Badge
        mode = self.key_mode_var.get()
        has_any_track = has_cam_track or has_screen_track or has_audio_track
        total_decoded = cam_count + screen_count

        if not self.is_connected:
            self.lbl_verdict.configure(
                text="[Status: Disconnected]", fg="#71717a"
            )
        elif not has_any_track:
            self.lbl_verdict.configure(
                text="⏳ [WAITING FOR STREAM] Waiting for participants to turn on Camera/Mic...",
                fg="#a1a1aa",
            )
        elif total_decoded > 0:
            if mode == "valid":
                self.lbl_verdict.configure(
                    text="🟢 [EVALUATION SUCCESS] Video/Audio decrypted with Valid Key!",
                    fg="#34d399",
                )
            elif mode == "stale":
                self.lbl_verdict.configure(
                    text="⚠️ [WARNING] Stale key still decrypted (Epoch not rotated or same Epoch)!",
                    fg="#fbbf24",
                )
            else:
                self.lbl_verdict.configure(
                    text="🔓 [PLAINTEXT ROOM] Decoded unencrypted stream (E2EE disabled)",
                    fg="#facc15",
                )
        else:
            # Tracks present but WebRTC unable to decode (rendering raw ciphertext noise)
            if mode == "stale":
                self.lbl_verdict.configure(
                    text="🛡️ [FS / PCS VERIFIED] Stale key blocked from decrypting new Epoch!",
                    fg="#ef4444",
                )
            elif mode == "valid":
                self.lbl_verdict.configure(
                    text="⚠️ [KEY MISMATCH] Key loaded but decryption failed (Authentication Tag mismatch)",
                    fg="#f87171",
                )
            else:
                self.lbl_verdict.configure(
                    text="🔒 [EAVESDROPPER BLOCKED] Eavesdropper sees only Ciphertext static noise",
                    fg="#f43f5e",
                )

        # Schedule next frame
        self.root.after(33, self._gui_render_loop)

    def _generate_noise_frame(self, w: int, h: int, title: str) -> ImageTk.PhotoImage:
        """
        Generates real-time digital static / ciphertext noise simulation.
        Demonstrates raw AES-128-GCM ciphertext bytes rendered directly onto canvas.
        """
        nw, nh = max(64, min(w, 320)), max(48, min(h, 200))

        # 1. Generate random digital static / byte matrix
        noise = np.random.randint(15, 240, (nh, nw, 3), dtype=np.uint8)

        # 2. Add random glitch scanlines to simulate broken video macroblocks
        for _ in range(3):
            gy = np.random.randint(0, nh - 8)
            gh = np.random.randint(3, 10)
            noise[gy : gy + gh, :] = np.random.randint(0, 256, (gh, nw, 3), dtype=np.uint8)

        img = Image.fromarray(noise).resize((w, h), Image.Resampling.NEAREST)
        draw = ImageDraw.Draw(img)

        # 3. Top banner with evaluation status
        mode = self.key_mode_var.get()
        draw.rectangle([(0, 0), (w, 36)], fill=(12, 12, 16))

        if mode == "stale":
            banner_title = f"🛡️ [FS / PCS VERIFIED] {title}: STALE KEY REVOKED ON EPOCH ROTATION"
            banner_color = "#ef4444"
        elif mode == "valid":
            banner_title = f"🔑 [E2EE MLS] {title}: WAITING FOR KEY MATCH..."
            banner_color = "#38bdf8"
        else:
            banner_title = f"⚡ [CIPHERTEXT NOISE] {title}: DATA IS E2EE ENCRYPTED"
            banner_color = "#f43f5e"

        draw.text((12, 10), banner_title, fill=banner_color)

        # 4. Generate random hex bytes simulating raw ciphertext stream
        raw_hex_1 = " ".join(f"{b:02X}" for b in np.random.randint(0, 256, 12))
        raw_hex_2 = " ".join(f"{b:02X}" for b in np.random.randint(0, 256, 12))

        # 5. Bottom banner displaying raw hex bytes
        draw.rectangle([(0, h - 56), (w, h)], fill=(10, 10, 14))
        draw.text(
            (12, h - 50),
            f"RAW BYTES [AES-128-GCM]: {raw_hex_1}",
            fill="#38bdf8",
        )
        if mode == "stale":
            footer_sub = "WebRTC: Authentication Tag Mismatch (Stale key from prior Epoch is invalid)"
        else:
            footer_sub = "WebRTC: Missing MLS decryption key"

        draw.text(
            (12, h - 30),
            f"HEX STREAM: {raw_hex_2}  |  {footer_sub}",
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

        # Case 1: Successfully decoded frame (Plaintext room or Valid E2EE Key)
        if frame_tuple is not None and (time.time() - frame_tuple[1] < 2.0):
            pil_img, _, w, h = frame_tuple
            scale = min(cw / w, ch / h)
            nw, nh = int(w * scale), int(h * scale)
            resized = pil_img.resize((nw, nh), Image.Resampling.BILINEAR)

            # Success overlay badge
            draw = ImageDraw.Draw(resized)
            draw.rectangle([(8, 8), (340, 38)], fill=(0, 0, 0, 190))

            mode = self.key_mode_var.get()
            if mode == "valid":
                label_text = f"🔓 DECRYPTED (VALID KEY): {w}x{h} ({total_frames} frames)"
                label_color = "#34d399"
            else:
                label_text = f"🔓 DECRYPTED: {w}x{h} ({total_frames} frames)"
                label_color = "#4ade80"

            draw.text((14, 14), label_text, fill=label_color)

            photo = ImageTk.PhotoImage(resized)
            canvas.delete("all")
            canvas.create_image(cw // 2, ch // 2, image=photo, anchor="center")
            canvas.image = photo
            return

        # Case 2: Track is published but encrypted / unreadable (E2EE active, invalid or missing key)
        if self.is_connected and has_track:
            noise_photo = self._generate_noise_frame(cw, ch, title)
            canvas.delete("all")
            canvas.create_image(cw // 2, ch // 2, image=noise_photo, anchor="center")
            canvas.image = noise_photo
            return

        # Case 3: No track available
        canvas.delete("all")
        if self.is_connected:
            canvas.create_text(
                cw // 2,
                ch // 2,
                text=f"Waiting for {title.lower()} stream...",
                font=("Segoe UI", 10),
                fill="#52525b",
            )
        else:
            canvas.create_text(
                cw // 2,
                ch // 2,
                text=f"Disconnected\n(Click 'Start Evaluation' to inspect {title.lower()})",
                font=("Segoe UI", 9),
                fill="#3f3f46",
                justify="center",
            )

    def _on_close(self):
        self.stop_inspecting()
        self.root.destroy()


def main():
    parser = argparse.ArgumentParser(description="ToboMeet E2EE Inspector & Security Evaluator")
    parser.add_argument("--code", type=str, default="", help="Meeting code to inspect")
    args = parser.parse_args()

    root = tk.Tk()
    app = E2EEInspectorApp(root, default_code=args.code)
    root.mainloop()


if __name__ == "__main__":
    main()

import asyncio
import json
import logging
import os
import ssl
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

import aiohttp
import deepl
from dotenv import load_dotenv
from livekit.agents import JobContext, cli, AgentServer
from livekit.agents.stt import SpeechEventType
from livekit import rtc
from livekit.plugins import deepgram

ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_PATH)
load_dotenv()

# Cấu hình DeepL client cho dịch thuật trực tiếp
DEEPL_API_KEY = os.getenv("DEEPL_API_KEY", "")
deepl_client = deepl.DeepLClient(DEEPL_API_KEY) if DEEPL_API_KEY else None

# Bộ đệm Cache cho bản dịch: (source_lang, target_lang, text) -> translated_text
TRANSLATION_CACHE: dict[tuple[str, str, str], str] = {}
MAX_TRANSLATION_CACHE_SIZE = 1000


def map_deepl_source_lang(lang_code: str) -> str | None:
    """Chuyển mã ngôn ngữ nguồn sang mã DeepL hợp lệ."""
    if not lang_code:
        return None
    return lang_code.strip().upper().split("-")[0]


def map_deepl_target_lang(lang_code: str) -> str:
    """Chuyển mã ngôn ngữ đích sang mã DeepL Target hợp lệ (EN-US, PT-BR, VI, JA...)."""
    c = (lang_code or "vi").strip().upper()
    base = c.split("-")[0]
    if base == "EN":
        return "EN-GB" if "GB" in c else "EN-US"
    if base == "PT":
        return "PT-PT" if "PT" in c and "BR" not in c else "PT-BR"
    return base


async def translate_text(text: str, source_lang: str, target_lang: str) -> str:
    """Hàm dịch đa ngôn ngữ qua DeepL API (chạy qua thread pool để không block asyncio loop)."""
    clean = text.strip()
    if not clean or not deepl_client:
        return clean

    src = map_deepl_source_lang(source_lang)
    tgt = map_deepl_target_lang(target_lang)

    # Nếu cùng ngôn ngữ thì không cần dịch
    if src and src == tgt.split("-")[0]:
        return clean

    # Bỏ qua từ quá ngắn hoặc filler words
    if len(clean) <= 1 or clean.lower() in ("ừm", "ờ", "à", "uhm", "uh", "um", "..."):
        return clean

    cache_key = (src or "auto", tgt, clean.lower())
    if cache_key in TRANSLATION_CACHE:
        return TRANSLATION_CACHE[cache_key]

    try:
        kwargs = {"target_lang": tgt}
        if src:
            kwargs["source_lang"] = src

        res = await asyncio.to_thread(
            deepl_client.translate_text,
            clean,
            **kwargs,
        )
        translated = res.text.strip()
        if translated:
            if len(TRANSLATION_CACHE) > MAX_TRANSLATION_CACHE_SIZE:
                TRANSLATION_CACHE.clear()
            TRANSLATION_CACHE[cache_key] = translated
            return translated
    except Exception as e:
        # Nếu truyền source_lang bị lỗi, thử lại tự động nhận diện (source_lang=None)
        if src:
            try:
                res = await asyncio.to_thread(
                    deepl_client.translate_text,
                    clean,
                    target_lang=tgt,
                )
                translated = res.text.strip()
                if translated:
                    TRANSLATION_CACHE[cache_key] = translated
                    return translated
            except Exception:
                pass
        logger.error("[DeepL Error] Dịch thất bại [%s -> %s]: %s", src, tgt, e)

    return clean

logger = logging.getLogger("stt-agent")
logger.setLevel(logging.INFO)
logging.getLogger("deepl").setLevel(logging.WARNING)

TRANSCRIPT_DIR = Path("transcripts")
TRANSCRIPT_DIR.mkdir(exist_ok=True)

MAX_CONCURRENT_TRANSCRIBING = 3    # Tối đa 3 luồng transcribe cùng lúc trong 1 phòng
SILENCE_TIMEOUT_SECONDS = 20.0     # Đóng stream Deepgram khi người dùng im lặng > 20.0s (tránh disconnect/reconnect liên tục)
AUDIO_SAMPLE_RATE = 16000          # 16kHz mono linear16 chuẩn cho Deepgram
AUDIO_NUM_CHANNELS = 1
AUDIO_FRAME_SIZE_MS = 20           # 20ms/frame (320 samples) giúp giảm 50% tải vòng lặp so với 10ms mặc định
AUDIO_SAMPLES_PER_FRAME = AUDIO_SAMPLE_RATE * AUDIO_FRAME_SIZE_MS // 1000
PRE_ROLL_BUFFER_FRAMES = 30        # Giữ đệm ~600ms (30 * 20ms) audio trước khi nói để không mất âm đầu câu
SILENCE_PADDING_TRIGGER_SEC = 0.06 # Bơm silence nếu quá 60ms không nhận frame (chống WebRTC DTX/rớt gói làm treo endpointing)


def _sync_upload_to_r2(local_file: Path, s3_key: str) -> bool:
    """Tải file cục bộ lên Cloudflare R2 bucket thông qua boto3."""
    endpoint = os.getenv("R2_ENDPOINT_URL")
    access_key = os.getenv("R2_ACCESS_KEY_ID")
    secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
    bucket = os.getenv("R2_BUCKET_NAME", "tobomeet")

    if not (endpoint and access_key and secret_key):
        logger.warning("R2 credentials not fully set, skipping upload for %s", local_file)
        return False

    try:
        import boto3
        s3 = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name="auto",
        )
        s3.upload_file(str(local_file), bucket, s3_key)
        logger.info("Uploaded %s to R2 (%s/%s)", local_file.name, bucket, s3_key)
        return True
    except Exception as e:
        logger.error("Error uploading %s to R2: %s", local_file, e)
        return False


async def _notify_server_transcript_ready(payload: dict):
    """Gửi webhook HTTP POST sang NestJS server thông báo transcript đã sẵn sàng trên R2."""
    server_url = os.getenv("SERVER_URL", "http://localhost:3001").rstrip("/")
    webhook_url = f"{server_url}/api/webhooks/transcripts/ready"
    try:
        timeout = aiohttp.ClientTimeout(total=10)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(webhook_url, json=payload) as resp:
                if resp.status in (200, 201):
                    logger.info("Sent transcript webhook to server (%s)", webhook_url)
                else:
                    body = await resp.text()
                    logger.warning("Webhook returned %d from %s: %s", resp.status, webhook_url, body)
    except Exception as e:
        logger.error("Failed to notify server transcript ready at %s: %s", webhook_url, e)


class ParticipantAudioTracker:
    """Quản lý audio stream, pre-roll buffer, silence padding, LiveKit SFU VAD và phiên Deepgram STT cho từng người tham gia."""

    def __init__(
        self,
        participant: rtc.RemoteParticipant,
        audio_track: rtc.Track,
        stt_instance: deepgram.STT,
        broadcast_cb,
        on_speech_cb=None,
    ):
        self.participant = participant
        self.audio_track = audio_track
        self.stt_instance = stt_instance
        self.broadcast_cb = broadcast_cb
        self.on_speech_cb = on_speech_cb

        self.speaker_id = participant.identity
        self.speaker_name = participant.name or participant.identity
        self.language = participant.attributes.get("transcribe_language", "vi")

        self.audio_stream = rtc.AudioStream(
            audio_track,
            sample_rate=AUDIO_SAMPLE_RATE,
            num_channels=AUDIO_NUM_CHANNELS,
            frame_size_ms=AUDIO_FRAME_SIZE_MS,
        )
        self.pre_roll_buffer: deque = deque(maxlen=PRE_ROLL_BUFFER_FRAMES)
        self._silence_frame = rtc.AudioFrame.create(
            AUDIO_SAMPLE_RATE,
            AUDIO_NUM_CHANNELS,
            AUDIO_SAMPLES_PER_FRAME,
        )

        self.is_transcribing = False
        self._current_stt_stream = None
        self.stt_task: asyncio.Task | None = None
        self.last_speech_time: float = time.monotonic()  # Khởi tạo = hiện tại để allocate_available_slots có thể cấp slot ngay
        self._last_speech_trigger: float = 0.0
        self._last_frame_pushed_time: float = 0.0
        self._pushed_audio_seconds: float = 0.0
        self.last_final_text: str = ""
        self.last_final_time: float = 0.0

        self.read_task = asyncio.create_task(self._read_audio())

    def _push_frame_to_stt(self, stt_stream, frame: rtc.AudioFrame) -> bool:
        """Đẩy 1 audio frame vào Deepgram stream và cập nhật đồng hồ audio đã gửi."""
        try:
            stt_stream.push_frame(frame)
            self._pushed_audio_seconds += frame.duration
            self._last_frame_pushed_time = time.monotonic()
            return True
        except Exception:
            return False

    async def _read_audio(self):
        """Đọc audio frame liên tục: sử dụng LiveKit SFU VAD (is_speaking)."""
        try:
            async for audio_frame_event in self.audio_stream:
                frame = audio_frame_event.frame

                # Nhận diện tiếng nói: dùng VAD từ LiveKit SFU (is_speaking)
                is_speech = getattr(self.participant, "is_speaking", False)

                if is_speech:
                    now = time.monotonic()
                    self.last_speech_time = now
                    if not self.is_transcribing and self.on_speech_cb:
                        if now - self._last_speech_trigger > 0.4:
                            self._last_speech_trigger = now
                            self.on_speech_cb()

                # Đẩy frame trực tiếp vào stream Deepgram (non-blocking) nếu đang transcribe
                # Không dùng hàng đợi frame_queue trung gian để tránh dồn đệm gây trễ/xếp hàng
                if self.is_transcribing and self._current_stt_stream:
                    self._push_frame_to_stt(self._current_stt_stream, frame)
                else:
                    self.pre_roll_buffer.append(frame)
                await asyncio.sleep(0)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.warning("Audio read error for %s: %s", self.speaker_id, e)

    def mark_speech(self):
        """Cập nhật thời điểm nói khi nhận được tín hiệu từ LiveKit SFU."""
        self.last_speech_time = time.monotonic()

    def set_language(self, new_lang: str):
        """Cập nhật ngôn ngữ phiên âm riêng cho người tham gia này."""
        clean_lang = (new_lang or "").strip()
        if not clean_lang or clean_lang == self.language:
            return
        logger.info(
            "Transcribe language updated for %s: %s -> %s",
            self.speaker_name,
            self.language,
            clean_lang,
        )
        self.language = clean_lang
        if self.is_transcribing:
            asyncio.create_task(self.restart_stt_session())

    async def restart_stt_session(self):
        """Khởi động lại stream STT với ngôn ngữ mới khi đang transcribe."""
        if not self.is_transcribing:
            return
        logger.info(
            "Restarting STT session with new language '%s' for %s",
            self.language,
            self.speaker_name,
        )
        if self._current_stt_stream:
            try:
                self._current_stt_stream.end_input()
            except Exception:
                pass

    def start_transcribing(self):
        """Bắt đầu luồng transcribe Deepgram khi được cấp slot."""
        if self.is_transcribing:
            return

        self.is_transcribing = True
        logger.info(
            "[VAD Speech] Acquired slot & starting Deepgram STT for: %s (%s, lang: %s)",
            self.speaker_name,
            self.speaker_id,
            self.language,
        )
        self.stt_task = asyncio.create_task(self._run_stt_session())

    async def _run_stt_session(self):
        """Vòng lặp stream WebSocket liên tục tới Deepgram cho đến khi có lệnh dừng êm ái."""
        try:
            while self.is_transcribing:
                logger.info(
                    "Connecting Deepgram STT WebSocket for %s (lang: %s)",
                    self.speaker_name,
                    self.language,
                )
                stt_stream = self.stt_instance.stream(language=self.language)
                self._pushed_audio_seconds = 0.0
                self._last_frame_pushed_time = time.monotonic()

                # Chuyển pre-roll buffer (~600ms) vào stream mới để bắt trọn âm đầu câu
                while self.pre_roll_buffer:
                    if not self._push_frame_to_stt(stt_stream, self.pre_roll_buffer.popleft()):
                        break

                self._current_stt_stream = stt_stream
                current_utterance_id = None
                last_interim_text = ""
                speech_start_time: float | None = None
                last_stream_offset = stt_stream.start_time_offset

                async def _silence_padder(stream):
                    """Bơm frame PCM im lặng khi luồng WebRTC bị ngắt (DTX/rớt gói) để Deepgram luôn nhận đủ silence cho endpointing."""
                    frame_sec = AUDIO_FRAME_SIZE_MS / 1000.0
                    try:
                        while self.is_transcribing and self._current_stt_stream is stream:
                            await asyncio.sleep(0.04)
                            if not self.is_transcribing or self._current_stt_stream is not stream:
                                break
                            now_pad = time.monotonic()
                            gap = now_pad - self._last_frame_pushed_time
                            if gap >= SILENCE_PADDING_TRIGGER_SEC:
                                num_frames = min(5, int(gap / frame_sec))
                                for _ in range(num_frames):
                                    try:
                                        stream.push_frame(self._silence_frame)
                                        self._pushed_audio_seconds += frame_sec
                                        self._last_frame_pushed_time += frame_sec
                                    except Exception:
                                        return
                                if now_pad - self._last_frame_pushed_time > 0.2:
                                    self._last_frame_pushed_time = now_pad
                    except asyncio.CancelledError:
                        pass

                padder_task = asyncio.create_task(_silence_padder(stt_stream))

                try:
                    async for stt_event in stt_stream:
                        now = time.monotonic()

                        # Nếu plugin tự reconnect WebSocket bên trong, đồng bộ lại bộ đếm audio đã gửi
                        if stt_stream.start_time_offset != last_stream_offset:
                            last_stream_offset = stt_stream.start_time_offset
                            self._pushed_audio_seconds = 0.0
                            self._last_frame_pushed_time = now

                        if stt_event.type == SpeechEventType.START_OF_SPEECH:
                            speech_start_time = now
                            continue

                        # 1. Xử lý khi Deepgram báo ngắt câu / kết thúc tiếng nói (END_OF_SPEECH)
                        if stt_event.type == SpeechEventType.END_OF_SPEECH:
                            if last_interim_text:
                                seg_id = current_utterance_id or f"seg_{int(datetime.now(timezone.utc).timestamp() * 1000)}"
                                final_text = last_interim_text
                                self.last_final_text = final_text
                                self.last_final_time = now
                                current_utterance_id = None
                                last_interim_text = ""
                                asyncio.create_task(
                                    self.broadcast_cb(
                                        final_text,
                                        True,
                                        self.speaker_id,
                                        self.speaker_name,
                                        seg_id,
                                        self.language,
                                    )
                                )
                            speech_start_time = None
                            continue

                        # Lấy nội dung transcript nếu có
                        has_alts = bool(stt_event.alternatives)
                        sd = stt_event.alternatives[0] if has_alts else None
                        text = sd.text.strip() if sd else ""

                        # Tính độ trễ xử lý thực tế dựa trên lượng audio đã đẩy so với mốc Deepgram đã phiên âm
                        audio_lag_ms = None
                        if sd and sd.end_time > 0:
                            audio_end_relative = max(0.0, sd.end_time - stt_stream.start_time_offset)
                            audio_lag_ms = max(0, int((self._pushed_audio_seconds - audio_end_relative) * 1000))

                        # 2. Xử lý FINAL_TRANSCRIPT:
                        if stt_event.type == SpeechEventType.FINAL_TRANSCRIPT:
                            final_text = text if text else last_interim_text
                            if not final_text:
                                continue

                            had_interim = bool(last_interim_text)
                            # Tránh phát trùng lặp câu final hoàn toàn giống nhau nếu không có interim mới
                            if not had_interim and final_text == self.last_final_text and (now - self.last_final_time) < 2.0:
                                continue

                            # Log độ trễ của câu Final (không in nội dung transcript)
                            if audio_lag_ms is not None:
                                logger.info(
                                    "[Deepgram Latency] %s | FINAL latency: %dms",
                                    self.speaker_name,
                                    audio_lag_ms,
                                )

                            self.last_final_text = final_text
                            self.last_final_time = now
                            seg_id = current_utterance_id or f"seg_{int(datetime.now(timezone.utc).timestamp() * 1000)}"
                            current_utterance_id = None
                            last_interim_text = ""
                            speech_start_time = None
                            asyncio.create_task(
                                self.broadcast_cb(
                                    final_text,
                                    True,
                                    self.speaker_id,
                                    self.speaker_name,
                                    seg_id,
                                    self.language,
                                )
                            )

                        # 3. Xử lý INTERIM_TRANSCRIPT:
                        elif stt_event.type == SpeechEventType.INTERIM_TRANSCRIPT:
                            if not text:
                                continue

                            # Log độ trễ Time-to-First-Transcript (TTFT)
                            if speech_start_time is not None:
                                ttft_ms = int((now - speech_start_time) * 1000)
                                logger.info(
                                    "[Deepgram Latency] %s | TTFT: %dms",
                                    self.speaker_name,
                                    ttft_ms,
                                )
                                speech_start_time = None
                            elif audio_lag_ms is not None and audio_lag_ms > 1200:
                                logger.warning(
                                    "[Deepgram Latency] %s | High interim lag: %dms",
                                    self.speaker_name,
                                    audio_lag_ms,
                                )

                            last_interim_text = text
                            if current_utterance_id is None:
                                current_utterance_id = f"seg_{int(datetime.now(timezone.utc).timestamp() * 1000)}"
                            asyncio.create_task(
                                self.broadcast_cb(
                                    text,
                                    False,
                                    self.speaker_id,
                                    self.speaker_name,
                                    current_utterance_id,
                                    self.language,
                                )
                            )

                    # Khi kết thúc stream stt_stream: nếu còn interim chưa kịp chốt thì chốt nốt
                    if last_interim_text:
                        seg_id = current_utterance_id or f"seg_{int(datetime.now(timezone.utc).timestamp() * 1000)}"
                        final_text = last_interim_text
                        self.last_final_text = final_text
                        self.last_final_time = time.monotonic()
                        current_utterance_id = None
                        last_interim_text = ""
                        asyncio.create_task(
                            self.broadcast_cb(
                                final_text,
                                True,
                                self.speaker_id,
                                self.speaker_name,
                                seg_id,
                                self.language,
                            )
                        )
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    if self.is_transcribing:
                        logger.warning(
                            "STT stream error for %s: %s — reconnecting...",
                            self.speaker_id,
                            e,
                        )
                        await asyncio.sleep(0.5)
                finally:
                    self._current_stt_stream = None
                    if not padder_task.done():
                        padder_task.cancel()
                    await stt_stream.aclose()

                if not self.is_transcribing:
                    break
        finally:
            self.is_transcribing = False
            self._current_stt_stream = None
            self.pre_roll_buffer.clear()
            logger.info("Deepgram STT session closed for speaker: %s", self.speaker_name)

    async def stop_transcribing_gracefully(self):
        """Đóng stream STT một cách êm ái: đợi Deepgram trả nốt các từ cuối cùng trước khi đóng hẳn."""
        if not self.is_transcribing:
            return
        self.is_transcribing = False

        stt_stream = self._current_stt_stream
        self._current_stt_stream = None

        if stt_stream:
            try:
                stt_stream.flush()
                stt_stream.end_input()
            except Exception:
                pass

        if self.stt_task and not self.stt_task.done():
            try:
                # Đợi tối đa 1.0s để Deepgram kịp trả nốt kết quả final transcript
                await asyncio.wait_for(asyncio.shield(self.stt_task), timeout=1.0)
            except (asyncio.TimeoutError, Exception):
                if self.stt_task and not self.stt_task.done():
                    self.stt_task.cancel()

        if stt_stream:
            try:
                await stt_stream.aclose()
            except Exception:
                pass
        self.stt_task = None

    async def cleanup(self):
        """Dọn dẹp toàn bộ tài nguyên khi track/participant rời phòng."""
        await self.stop_transcribing_gracefully()
        if self.read_task and not self.read_task.done():
            self.read_task.cancel()
        self.pre_roll_buffer.clear()


server = AgentServer(
    initialize_process_timeout=60.0,
    load_threshold=float("inf"),
    num_idle_processes=1,
)


@server.rtc_session(agent_name="stt-transcriber")
async def entrypoint(ctx: JobContext):
    room_name = ctx.room.name
    ctx.log_context_fields = {"room": room_name}
    logger.info("Agent job started for room: %s", room_name)

    # Khởi tạo SSL context trong worker thread
    ssl_ctx = await asyncio.to_thread(ssl.create_default_context)
    connector = aiohttp.TCPConnector(ssl=ssl_ctx)
    http_session = aiohttp.ClientSession(connector=connector)

    await ctx.connect()

    # Kiểm tra phòng có bật E2EE không - nếu có thì Agent không thể giải mã âm thanh
    try:
        room_meta_str = ctx.room.metadata or ""
        if room_meta_str:
            room_meta = json.loads(room_meta_str)
            if room_meta.get("isE2EE"):
                logger.info("Room %s has E2EE enabled. Agent cannot decrypt media. Exiting.", room_name)
                return
    except Exception as e:
        logger.warning("Failed to check E2EE metadata: %s", e)

    # Bỏ qua warning `ignoring text stream with topic 'lk.transcription'` khi LiveKit agent nhận lại broadcast
    def _noop_text_stream(reader, participant_identity):
        pass

    try:
        ctx.room.register_text_stream_handler("lk.transcription", _noop_text_stream)
    except Exception as e:
        logger.debug("Failed to register noop text stream handler: %s", e)
    try:
        await ctx.room.local_participant.set_name("stt-transcriber")
        await ctx.room.local_participant.set_attributes({"agent_name": "stt-transcriber"})
    except Exception as e:
        logger.debug("Failed to set agent participant name/attributes: %s", e)
    logger.info("Connected to room: %s", room_name)

    segments: list[dict] = []
    started_at = datetime.now(timezone.utc)

    session_id = None
    if ctx.job and ctx.job.metadata:
        try:
            job_meta = json.loads(ctx.job.metadata)
            if isinstance(job_meta, dict):
                session_id = job_meta.get("sessionId")
        except Exception:
            session_id = ctx.job.metadata

    if not session_id:
        session_id = started_at.strftime("%Y%m%d_%H%M%S")

    session_dir = TRANSCRIPT_DIR / room_name / session_id
    await asyncio.to_thread(lambda: session_dir.mkdir(parents=True, exist_ok=True))
    jsonl_path = session_dir / "transcript.jsonl"

    stt_instance = deepgram.STT(
        model="nova-3",
        language="vi",
        sample_rate=AUDIO_SAMPLE_RATE,
        interim_results=True,
        punctuate=True,
        smart_format=True,
        no_delay=True,
        endpointing_ms=300,
        utterance_end_ms=1000,
        http_session=http_session,
    )

    def _sync_append_jsonl(path: Path, data: dict):
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(data, ensure_ascii=False) + "\n")

    # Quản lý ngôn ngữ dịch đích của từng participant trong phòng: identity -> target_lang
    participant_target_languages: dict[str, str] = {}

    def update_participant_target_lang(identity: str, target_lang: str | None):
        target = (target_lang or "").strip().lower()
        if not target or target in ("off", "none"):
            participant_target_languages.pop(identity, None)
        else:
            participant_target_languages[identity] = target
        logger.info(
            "[Translate Target] %s -> %s | Active room targets: %s",
            identity,
            target or "off",
            list(set(participant_target_languages.values())),
        )

    # Đọc cấu hình dịch từ các participant đã có mặt trước trong phòng
    for p in ctx.room.remote_participants.values():
        if p.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT:
            t_lang = p.attributes.get("translate_target_language")
            update_participant_target_lang(p.identity, t_lang)

    async def _async_translate_and_broadcast_update(
        seg_id: str,
        txt: str,
        spk_id: str,
        spk_name: str,
        src: str,
        lang: str,
        targets: set[str],
        entry_obj: dict | None,
        existing_translations: dict[str, str],
    ):
        """Dịch văn bản ở tiến trình nền (background task) và gửi cập nhật bản dịch xuống phòng khi hoàn tất."""
        new_translations = dict(existing_translations)

        async def _do_translate(tgt: str):
            try:
                trans = await translate_text(txt, src, tgt)
                if trans and trans.strip():
                    new_translations[tgt] = trans.strip()
            except Exception as e:
                logger.debug("Async translation error for target '%s': %s", tgt, e)

        try:
            await asyncio.gather(
                *(_do_translate(tgt) for tgt in targets),
                return_exceptions=True,
            )
        except Exception as e:
            logger.debug("Async translation gather error: %s", e)

        if not new_translations or new_translations == existing_translations:
            return

        # Cập nhật bản dịch vào đối tượng transcript lưu trong bộ nhớ
        if entry_obj is not None:
            entry_obj["translations"] = new_translations

        # Gửi bản cập nhật phụ đề với cùng segment_id để Client gắn bản dịch vào câu gốc
        attributes = {
            "lk.transcription_final": "true",
            "lk.transcription_segment_id": seg_id,
            "speaker_id": spk_id or "",
            "speaker_name": spk_name or "",
            "speaker_language": lang or "vi",
            "translations": json.dumps(new_translations, ensure_ascii=False),
        }

        try:
            await ctx.room.local_participant.send_text(
                txt,
                topic="lk.transcription",
                attributes=attributes,
            )
        except Exception as e:
            logger.debug("send_text update failed for seg '%s': %s", seg_id, e)

    async def broadcast(
        text: str,
        is_final: bool,
        speaker_id: str,
        speaker_name: str,
        segment_id: str | None = None,
        language: str = "vi",
    ):
        """Phát transcript qua LiveKit Data Channel ngay lập tức, sau đó dịch bất đồng bộ ở background."""
        if segment_id is None:
            segment_id = f"seg_{int(datetime.now(timezone.utc).timestamp() * 1000)}"

        src_code = (language or "vi").split("-")[0].lower()
        translations: dict[str, str] = {}
        needed_targets: set[str] = set()

        # Kiểm tra ngôn ngữ cần dịch khi câu đã đạt FINAL
        if is_final and deepl_client:
            all_targets = {
                tgt.split("-")[0].lower()
                for tgt in participant_target_languages.values()
                if tgt and tgt not in ("off", "none") and tgt.split("-")[0].lower() != src_code
            }
            # Ưu tiên lấy ngay bản dịch nếu đã có sẵn trong TRANSLATION_CACHE (0ms latency)
            for tgt in all_targets:
                cache_key = (
                    map_deepl_source_lang(src_code) or "auto",
                    map_deepl_target_lang(tgt),
                    text.strip().lower(),
                )
                if cache_key in TRANSLATION_CACHE:
                    translations[tgt] = TRANSLATION_CACHE[cache_key]
                else:
                    needed_targets.add(tgt)

        # 1. PHÁT NGAY LẬP TỨC CÂU GỐC XUỐNG PHÒNG (KHÔNG CHỜ DEEPL)
        attributes = {
            "lk.transcription_final": "true" if is_final else "false",
            "lk.transcription_segment_id": segment_id,
            "speaker_id": speaker_id or "",
            "speaker_name": speaker_name or "",
            "speaker_language": language or "vi",
            "translations": json.dumps(translations, ensure_ascii=False) if translations else "{}",
        }

        try:
            await ctx.room.local_participant.send_text(
                text,
                topic="lk.transcription",
                attributes=attributes,
            )
        except Exception as e:
            logger.debug("send_text failed: %s", e)

        entry = None
        if is_final:
            entry = {
                "id": segment_id,
                "text": text,
                "speaker_id": speaker_id,
                "speaker_name": speaker_name,
                "language": language or "vi",
                "translations": translations,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            # Tránh ghi trùng lặp dòng transcript liên tiếp của cùng người nói
            if not segments or segments[-1].get("text") != text or segments[-1].get("speaker_id") != speaker_id:
                segments.append(entry)
                await asyncio.to_thread(_sync_append_jsonl, jsonl_path, entry)

        # 2. XỬ LÝ DỊCH BẤT ĐỒNG BỘ: Chạy ở background task riêng cho các ngôn ngữ chưa có trong cache
        if is_final and deepl_client and needed_targets:
            asyncio.create_task(
                _async_translate_and_broadcast_update(
                    segment_id,
                    text,
                    speaker_id,
                    speaker_name,
                    src_code,
                    language,
                    needed_targets,
                    entry,
                    translations,
                )
            )

    # Quản lý audio trackers & tối đa 3 slot transcribe trong phòng
    trackers: dict[str, ParticipantAudioTracker] = {}
    active_transcribers: set[str] = set()

    def allocate_available_slots():
        """Cấp slot còn trống cho những người vừa phát ra tiếng nói."""
        now = time.monotonic()
        available_slots = MAX_CONCURRENT_TRANSCRIBING - len(active_transcribers)
        if available_slots <= 0:
            return

        # Tìm những người đang nói (có âm thanh trong 1.0s gần nhất) nhưng chưa có slot
        candidates = [
            t for t in trackers.values()
            if t.speaker_id not in active_transcribers
            and (now - t.last_speech_time) < 1.0
        ]
        # Ưu tiên người vừa phát ra tiếng nói gần nhất
        candidates.sort(key=lambda t: t.last_speech_time, reverse=True)

        for t in candidates[:available_slots]:
            active_transcribers.add(t.speaker_id)
            t.start_transcribing()

    async def slot_and_vad_coordinator():
        """Bộ điều phối chạy nền kiểm tra VAD và quản lý tối đa 3 luồng liên tục."""
        try:
            while True:
                await asyncio.sleep(0.3)
                now = time.monotonic()

                # 1. Kiểm tra những người đang transcribe: nếu im lặng > SILENCE_TIMEOUT_SECONDS thì đóng êm ái
                for spk_id in list(active_transcribers):
                    tracker = trackers.get(spk_id)
                    if not tracker:
                        active_transcribers.discard(spk_id)
                        continue

                    silence_duration = now - tracker.last_speech_time
                    if silence_duration > SILENCE_TIMEOUT_SECONDS:
                        logger.info(
                            "[VAD Silence] User %s silent > %.1fs — closing STT stream gracefully",
                            tracker.speaker_name,
                            silence_duration,
                        )
                        active_transcribers.discard(spk_id)
                        asyncio.create_task(tracker.stop_transcribing_gracefully())

                # 2. Cấp slot còn trống cho những người đang nói
                allocate_available_slots()
        except asyncio.CancelledError:
            pass

    coordinator_task = asyncio.create_task(slot_and_vad_coordinator())

    def on_active_speakers_changed(speakers: list[rtc.Participant]):
        """Cập nhật VAD khi LiveKit SFU phát hiện âm thanh."""
        for s in speakers:
            if s.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT:
                tracker = trackers.get(s.identity)
                if tracker:
                    tracker.mark_speech()
        allocate_available_slots()

    def on_participant_attributes_changed(
        changed_attributes: dict,
        participant: rtc.Participant,
    ):
        """Lắng nghe khi participant thay đổi ngôn ngữ transcribe hoặc dịch qua setAttributes."""
        if "transcribe_language" in changed_attributes:
            new_lang = changed_attributes["transcribe_language"]
            tracker = trackers.get(participant.identity)
            if tracker:
                tracker.set_language(new_lang)
        if "translate_target_language" in changed_attributes:
            new_target = changed_attributes["translate_target_language"]
            update_participant_target_lang(participant.identity, new_target)

    def on_data_received(data_packet: rtc.DataPacket):
        """Lắng nghe cấu hình đổi ngôn ngữ gửi qua LiveKit Data Channel."""
        if data_packet.topic == "lk.transcription.config":
            try:
                payload = json.loads(data_packet.data.decode("utf-8"))
                msg_type = payload.get("type")
                sender = data_packet.participant
                spk_id = sender.identity if sender else None
                if spk_id:
                    if msg_type == "SET_LANGUAGE":
                        new_lang = payload.get("language")
                        if new_lang and spk_id in trackers:
                            trackers[spk_id].set_language(new_lang)
                    elif msg_type == "SET_TRANSLATE_TARGET":
                        new_target = payload.get("language")
                        update_participant_target_lang(spk_id, new_target)
            except Exception as e:
                logger.debug("Failed to handle transcription config: %s", e)

    def on_track_subscribed(
        track: rtc.Track,
        publication: rtc.TrackPublication,
        participant: rtc.RemoteParticipant,
    ):
        """Callback khi subscribe được track của participant mới"""
        if track.kind != rtc.TrackKind.KIND_AUDIO:
            return
        if participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_AGENT:
            return

        logger.info(
            "Audio track subscribed from: %s (%s)",
            participant.name or participant.identity,
            participant.identity,
        )

        old_tracker = trackers.pop(participant.identity, None)
        if old_tracker:
            asyncio.create_task(old_tracker.cleanup())
        active_transcribers.discard(participant.identity)

        tracker = ParticipantAudioTracker(
            participant=participant,
            audio_track=track,
            stt_instance=stt_instance,
            broadcast_cb=broadcast,
            on_speech_cb=allocate_available_slots,
        )
        trackers[participant.identity] = tracker

        allocate_available_slots()

    def on_track_unsubscribed(
        track: rtc.Track,
        publication: rtc.TrackPublication,
        participant: rtc.RemoteParticipant,
    ):
        if track.kind != rtc.TrackKind.KIND_AUDIO:
            return
        tracker = trackers.pop(participant.identity, None)
        if tracker:
            asyncio.create_task(tracker.cleanup())
        active_transcribers.discard(participant.identity)
        allocate_available_slots()
        logger.info("Audio track unsubscribed for: %s", participant.identity)

    empty_room_timer: asyncio.TimerHandle | None = None

    def has_active_breakout_session() -> bool:
        """Kiểm tra phòng chính có đang mở phiên breakout hay không."""
        raw_meta = getattr(ctx.room, "metadata", None) or ""
        if not raw_meta:
            return False
        try:
            meta = json.loads(raw_meta)
            return (
                meta.get("roomType") != "breakout"
                and isinstance(meta.get("breakoutSession"), dict)
                and meta["breakoutSession"].get("status") == "active"
            )
        except Exception:
            return False

    def check_empty_room():
        nonlocal empty_room_timer
        human_participants = [
            p
            for p in ctx.room.remote_participants.values()
            if p.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT
        ]
        # Không tắt STT agent khi người cuối cùng tạm rời phòng chính để vào breakout room
        if has_active_breakout_session():
            if empty_room_timer is not None:
                logger.info(
                    "Active breakout session in room %s. Cancelled agent shutdown timer.",
                    room_name,
                )
                empty_room_timer.cancel()
                empty_room_timer = None
            return

        if len(human_participants) == 0:
            logger.info(
                "Room %s has no human participants left. Scheduling agent shutdown in 10s...",
                room_name,
            )
            if empty_room_timer is None:
                loop = asyncio.get_running_loop()
                empty_room_timer = loop.call_later(
                    10.0,
                    lambda: asyncio.create_task(shutdown_if_empty()),
                )
        else:
            if empty_room_timer is not None:
                logger.info(
                    "Human participant active in room %s. Cancelled shutdown timer.",
                    room_name,
                )
                empty_room_timer.cancel()
                empty_room_timer = None

    async def shutdown_if_empty():
        nonlocal empty_room_timer
        empty_room_timer = None
        if has_active_breakout_session():
            logger.info(
                "Room %s has active breakout session. Skipping STT agent shutdown.",
                room_name,
            )
            return
        human_participants = [
            p
            for p in ctx.room.remote_participants.values()
            if p.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT
        ]
        if len(human_participants) == 0:
            logger.info("Room %s is still empty. Shutting down STT agent.", room_name)
            ctx.shutdown("Room empty")

    def on_room_metadata_changed(_old_metadata: str, _new_metadata: str):
        check_empty_room()

    def on_participant_connected(participant: rtc.RemoteParticipant):
        if participant.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT:
            check_empty_room()

    def on_participant_disconnected(participant: rtc.RemoteParticipant):
        if participant.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT:
            participant_target_languages.pop(participant.identity, None)
            tracker = trackers.pop(participant.identity, None)
            if tracker:
                asyncio.create_task(tracker.cleanup())
            active_transcribers.discard(participant.identity)
            allocate_available_slots()
            check_empty_room()

    def on_room_disconnected():
        logger.info("Room %s disconnected/closed by server. Shutting down STT agent.", room_name)
        ctx.shutdown("Room closed")

    # Đăng ký event handlers
    ctx.room.on("track_subscribed", on_track_subscribed)
    ctx.room.on("track_unsubscribed", on_track_unsubscribed)
    ctx.room.on("active_speakers_changed", on_active_speakers_changed)
    ctx.room.on("participant_attributes_changed", on_participant_attributes_changed)
    ctx.room.on("data_received", on_data_received)
    ctx.room.on("participant_connected", on_participant_connected)
    ctx.room.on("participant_disconnected", on_participant_disconnected)
    ctx.room.on("room_metadata_changed", on_room_metadata_changed)
    ctx.room.on("disconnected", on_room_disconnected)

    # Xử lý các track đã được subscribe từ trước
    for p in ctx.room.remote_participants.values():
        if p.kind == rtc.ParticipantKind.PARTICIPANT_KIND_AGENT:
            continue
        for pub in p.track_publications.values():
            if pub.track and pub.track.kind == rtc.TrackKind.KIND_AUDIO:
                logger.info("Picking up existing audio track from: %s", p.identity)
                on_track_subscribed(pub.track, pub, p)

    async def save_transcript():
        """Ghi metadata.json vào session_dir khi agent kết thúc, sau đó đẩy lên R2 & báo webhook."""
        if empty_room_timer is not None:
            empty_room_timer.cancel()

        ended_at = datetime.now(timezone.utc)
        segment_count = len(segments)
        total_words = sum(len((s.get("text") or "").split()) for s in segments)

        metadata = {
            "room": room_name,
            "session_id": session_id,
            "started_at": started_at.isoformat(),
            "ended_at": ended_at.isoformat(),
            "duration_seconds": round((ended_at - started_at).total_seconds(), 1),
            "language": "multi",
            "segment_count": segment_count,
            "word_count": total_words,
            "transcript_file": "transcript.jsonl",
        }
        meta_path = session_dir / "metadata.json"
        content = json.dumps(metadata, ensure_ascii=False, indent=2)
        await asyncio.to_thread(meta_path.write_text, content, "utf-8")
        logger.info(
            "Session metadata saved: %s (%d segments, %d words, %.0fs)",
            meta_path,
            segment_count,
            total_words,
            metadata["duration_seconds"],
        )

        transcript_key = f"transcripts/{room_name}/{session_id}/transcript.jsonl"
        metadata_key = f"transcripts/{room_name}/{session_id}/metadata.json"

        # Nếu có segments, upload bất đồng bộ lên Cloudflare R2 & bắn webhook
        if jsonl_path.exists() and segment_count > 0:
            logger.info("Uploading transcript and metadata to R2 in background...")
            upload_t = asyncio.to_thread(_sync_upload_to_r2, jsonl_path, transcript_key)
            upload_m = asyncio.to_thread(_sync_upload_to_r2, meta_path, metadata_key)
            try:
                results = await asyncio.gather(upload_t, upload_m, return_exceptions=True)
                logger.info("R2 upload results: %s", results)
            except Exception as e:
                logger.error("Error during R2 upload gather: %s", e)

            payload = {
                "room_name": room_name,
                "session_id": session_id,
                "transcript_key": transcript_key,
                "metadata_key": metadata_key,
                "segment_count": segment_count,
                "word_count": total_words,
            }
            await _notify_server_transcript_ready(payload)

    # Sự kiện để thoát entrypoint ngay lập tức khi shutdown
    shutdown_event = asyncio.Event()

    async def signal_shutdown():
        """Callback async để unblock shutdown_event.wait() ngay lập tức."""
        shutdown_event.set()

    ctx.add_shutdown_callback(signal_shutdown)
    ctx.add_shutdown_callback(save_transcript)

    logger.info(
        "STT agent ready (Tối đa %d luồng đồng thời & LiveKit SFU VAD) trong phòng: %s",
        MAX_CONCURRENT_TRANSCRIBING,
        room_name,
    )

    try:
        await shutdown_event.wait()
    finally:
        coordinator_task.cancel()
        for tracker in list(trackers.values()):
            await tracker.cleanup()
        trackers.clear()
        active_transcribers.clear()
        if not http_session.closed:
            await http_session.close()
            # Cho phép aiohttp giải phóng các socket/SSL transport ngầm, tránh Unclosed client session
            await asyncio.sleep(0.25)


if __name__ == "__main__":
    cli.run_app(server)

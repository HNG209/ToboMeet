import asyncio
import json
import logging
import ssl
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

import aiohttp
import numpy as np
from dotenv import load_dotenv
from livekit.agents import JobContext, cli, AgentServer
from livekit.agents.stt import SpeechEventType
from livekit import rtc
from livekit.plugins import deepgram

load_dotenv()

logger = logging.getLogger("stt-agent")
logger.setLevel(logging.INFO)

TRANSCRIPT_DIR = Path("transcripts")
TRANSCRIPT_DIR.mkdir(exist_ok=True)

MAX_CONCURRENT_TRANSCRIBING = 3   # Tối đa 3 luồng transcribe cùng lúc trong 1 phòng
SILENCE_TIMEOUT_SECONDS = 10.0    # Đóng stream Deepgram khi người dùng im lặng > 10.0s (cho phép ngắt nghỉ tự nhiên)
PRE_ROLL_BUFFER_FRAMES = 20       # Giữ đệm ~400ms audio trước khi nói để không mất âm đầu


class ParticipantAudioTracker:
    """Quản lý audio stream, pre-roll buffer, VAD dựa trên RMS và phiên Deepgram STT cho từng người tham gia."""

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

        self.audio_stream = rtc.AudioStream(audio_track, sample_rate=16000, num_channels=1)
        self.pre_roll_buffer: deque = deque(maxlen=PRE_ROLL_BUFFER_FRAMES)
        self.frame_queue: asyncio.Queue = asyncio.Queue(maxsize=500)

        self.is_transcribing = False
        self._current_stt_stream = None
        self.stt_task: asyncio.Task | None = None
        self.last_speech_time: float = 0.0
        self._last_speech_trigger: float = 0.0
        self.last_final_text: str = ""
        self.last_final_time: float = 0.0

        self.read_task = asyncio.create_task(self._read_audio())

    async def _read_audio(self):
        """Đọc audio frame liên tục: kết hợp LiveKit SFU VAD (is_speaking) và peak check siêu nhẹ."""
        try:
            async for audio_frame_event in self.audio_stream:
                frame = audio_frame_event.frame

                # Nhận diện tiếng nói: ưu tiên VAD truyền xuống từ LiveKit SFU (is_speaking)
                # và kiểm tra biên độ mẫu thưa cực nhanh (< 0.01ms, không làm nghẽn asyncio loop)
                is_speech = getattr(self.participant, "is_speaking", False)
                if not is_speech and len(frame.data) > 0:
                    samples = np.frombuffer(frame.data, dtype=np.int16)
                    if len(samples) > 0 and np.max(np.abs(samples[::4])) > 800:
                        is_speech = True

                if is_speech:
                    now = time.monotonic()
                    self.last_speech_time = now
                    if not self.is_transcribing and self.on_speech_cb:
                        if now - self._last_speech_trigger > 0.4:
                            self._last_speech_trigger = now
                            self.on_speech_cb()

                if self.is_transcribing:
                    try:
                        self.frame_queue.put_nowait(frame)
                    except asyncio.QueueFull:
                        pass
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

        # Chuyển toàn bộ pre-roll buffer vào queue trước để Deepgram nhận trọn vẹn từ đầu câu
        while self.pre_roll_buffer:
            try:
                self.frame_queue.put_nowait(self.pre_roll_buffer.popleft())
            except asyncio.QueueFull:
                break

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
                self._current_stt_stream = stt_stream
                current_utterance_id = None

                async def push_frames_to_stt():
                    try:
                        while self.is_transcribing:
                            try:
                                frame = await asyncio.wait_for(self.frame_queue.get(), timeout=0.25)
                                stt_stream.push_frame(frame)
                            except asyncio.TimeoutError:
                                continue
                    except asyncio.CancelledError:
                        pass
                    except Exception as e:
                        logger.debug("Push frames finished for %s: %s", self.speaker_id, e)

                push_task = asyncio.create_task(push_frames_to_stt())

                try:
                    async for stt_event in stt_stream:
                        if not stt_event.alternatives:
                            continue
                        text = stt_event.alternatives[0].text.strip()
                        if not text:
                            continue

                        if stt_event.type == SpeechEventType.INTERIM_TRANSCRIPT:
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
                        elif stt_event.type == SpeechEventType.FINAL_TRANSCRIPT:
                            clean = text.strip()
                            now = time.monotonic()
                            # Tránh phát trùng lặp câu final giống hệt nhau trong vòng 2.5s
                            if clean == self.last_final_text and (now - self.last_final_time) < 2.5:
                                continue
                            self.last_final_text = clean
                            self.last_final_time = now

                            seg_id = current_utterance_id or f"seg_{int(datetime.now(timezone.utc).timestamp() * 1000)}"
                            current_utterance_id = None
                            asyncio.create_task(
                                self.broadcast_cb(
                                    clean,
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
                    if not push_task.done():
                        push_task.cancel()
                    await stt_stream.aclose()
                    self._current_stt_stream = None

                if not self.is_transcribing:
                    break
        finally:
            self.is_transcribing = False
            self._current_stt_stream = None
            # Xóa các frame cũ còn tồn đọng trong queue
            while not self.frame_queue.empty():
                try:
                    self.frame_queue.get_nowait()
                except asyncio.QueueEmpty:
                    break
            logger.info("Deepgram STT session closed for speaker: %s", self.speaker_name)

    async def stop_transcribing_gracefully(self):
        """Đóng stream STT một cách êm ái: đợi Deepgram trả nốt các từ cuối cùng trước khi đóng hẳn."""
        if not self.is_transcribing:
            return
        self.is_transcribing = False

        stt_stream = self._current_stt_stream
        if stt_stream:
            try:
                stt_stream.end_input()
            except Exception:
                pass

        if self.stt_task and not self.stt_task.done():
            try:
                # Đợi tối đa 1.5s để Deepgram kịp trả nốt kết quả final transcript
                await asyncio.wait_for(asyncio.shield(self.stt_task), timeout=1.5)
            except (asyncio.TimeoutError, Exception):
                if self.stt_task and not self.stt_task.done():
                    self.stt_task.cancel()

        if stt_stream:
            try:
                await stt_stream.aclose()
            except Exception:
                pass
        self._current_stt_stream = None
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
    session_id = started_at.strftime("%Y%m%d_%H%M%S")

    session_dir = TRANSCRIPT_DIR / room_name / session_id
    await asyncio.to_thread(lambda: session_dir.mkdir(parents=True, exist_ok=True))
    jsonl_path = session_dir / "transcript.jsonl"

    stt_instance = deepgram.STT(
        model="nova-2",
        language="vi",
        interim_results=True,
        punctuate=True,
        smart_format=True,
        endpointing_ms=300,
        http_session=http_session,
    )

    def _sync_append_jsonl(path: Path, data: dict):
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(data, ensure_ascii=False) + "\n")

    async def broadcast(
        text: str,
        is_final: bool,
        speaker_id: str,
        speaker_name: str,
        segment_id: str | None = None,
        language: str = "vi",
    ):
        """Phát transcript qua LiveKit Data Channel đến các client trong phòng"""
        if segment_id is None:
            segment_id = f"seg_{int(datetime.now(timezone.utc).timestamp() * 1000)}"

        attributes = {
            "lk.transcription_final": "true" if is_final else "false",
            "lk.transcription_segment_id": segment_id,
            "speaker_id": speaker_id or "",
            "speaker_name": speaker_name or "",
            "speaker_language": language or "vi",
        }

        try:
            await ctx.room.local_participant.send_text(
                text,
                topic="lk.transcription",
                attributes=attributes,
            )
        except Exception as e:
            logger.debug("send_text failed: %s", e)

        if is_final:
            entry = {
                "id": segment_id,
                "text": text,
                "speaker_id": speaker_id,
                "speaker_name": speaker_name,
                "language": language or "vi",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            # Tránh ghi trùng lặp dòng transcript liên tiếp của cùng người nói
            if not segments or segments[-1].get("text") != text or segments[-1].get("speaker_id") != speaker_id:
                segments.append(entry)
                await asyncio.to_thread(_sync_append_jsonl, jsonl_path, entry)

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
        """Lắng nghe khi participant thay đổi ngôn ngữ transcribe qua setAttributes."""
        if "transcribe_language" in changed_attributes:
            new_lang = changed_attributes["transcribe_language"]
            tracker = trackers.get(participant.identity)
            if tracker:
                tracker.set_language(new_lang)

    def on_data_received(data_packet: rtc.DataPacket):
        """Lắng nghe cấu hình đổi ngôn ngữ gửi qua LiveKit Data Channel."""
        if data_packet.topic == "lk.transcription.config":
            try:
                payload = json.loads(data_packet.data.decode("utf-8"))
                new_lang = payload.get("language")
                sender = data_packet.participant
                spk_id = sender.identity if sender else None
                if new_lang and spk_id and spk_id in trackers:
                    trackers[spk_id].set_language(new_lang)
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

    def check_empty_room():
        nonlocal empty_room_timer
        human_participants = [
            p
            for p in ctx.room.remote_participants.values()
            if p.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT
        ]
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
        human_participants = [
            p
            for p in ctx.room.remote_participants.values()
            if p.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT
        ]
        if len(human_participants) == 0:
            logger.info("Room %s is still empty. Shutting down STT agent.", room_name)
            ctx.shutdown("Room empty")

    def on_participant_connected(participant: rtc.RemoteParticipant):
        if participant.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT:
            check_empty_room()

    def on_participant_disconnected(participant: rtc.RemoteParticipant):
        if participant.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT:
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
        """Ghi metadata.json vào session_dir khi agent kết thúc."""
        if empty_room_timer is not None:
            empty_room_timer.cancel()

        ended_at = datetime.now(timezone.utc)
        metadata = {
            "room": room_name,
            "session_id": session_id,
            "started_at": started_at.isoformat(),
            "ended_at": ended_at.isoformat(),
            "duration_seconds": round((ended_at - started_at).total_seconds(), 1),
            "language": "multi",
            "segment_count": len(segments),
            "transcript_file": "transcript.jsonl",
        }
        meta_path = session_dir / "metadata.json"
        content = json.dumps(metadata, ensure_ascii=False, indent=2)
        await asyncio.to_thread(meta_path.write_text, content, "utf-8")
        logger.info(
            "Session metadata saved: %s (%d segments, %.0fs)",
            meta_path,
            len(segments),
            metadata["duration_seconds"],
        )

    # Sự kiện để thoát entrypoint ngay lập tức khi shutdown
    shutdown_event = asyncio.Event()

    async def signal_shutdown():
        """Callback async để unblock shutdown_event.wait() ngay lập tức."""
        shutdown_event.set()

    ctx.add_shutdown_callback(signal_shutdown)
    ctx.add_shutdown_callback(save_transcript)

    logger.info(
        "STT agent ready (Tối đa %d luồng đồng thời & VAD Audio Energy) trong phòng: %s",
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

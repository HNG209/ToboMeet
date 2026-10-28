import asyncio
import json
import logging
import ssl
from datetime import datetime, timezone
from pathlib import Path

import aiohttp
from dotenv import load_dotenv
from livekit.agents import JobContext, cli, AgentServer
from livekit.agents.stt import SpeechEventType
from livekit import rtc
from livekit.plugins import deepgram

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("stt-agent")

TRANSCRIPT_DIR = Path("transcripts")
TRANSCRIPT_DIR.mkdir(exist_ok=True)


server = AgentServer(
    initialize_process_timeout=60.0,
    load_threshold=float("inf"),
    num_idle_processes=0,
)


@server.rtc_session(agent_name="stt-transcriber")
async def entrypoint(ctx: JobContext):
    room_name = ctx.room.name
    ctx.log_context_fields = {"room": room_name}
    logger.info("Agent job started for room: %s", room_name)

    # Khởi tạo SSL context trong worker thread
    # và tái sử dụng cho http_session để không block asyncio event loop
    ssl_ctx = await asyncio.to_thread(ssl.create_default_context)
    connector = aiohttp.TCPConnector(ssl=ssl_ctx)
    http_session = aiohttp.ClientSession(connector=connector)

    # Kết nối vào LiveKit room (bắt buộc khi không dùng AgentSession)
    await ctx.connect()
    logger.info("Connected to room: %s", room_name)

    segments: list[dict] = []
    started_at = datetime.now(timezone.utc)
    session_id = started_at.strftime("%Y%m%d_%H%M%S")

    # Thư mục lưu transcript theo từng session: transcripts/{room}/{session_id}/
    # Dùng to_thread để tránh blocking mkdir trên event loop
    session_dir = TRANSCRIPT_DIR / room_name / session_id
    await asyncio.to_thread(session_dir.mkdir, True, True)
    jsonl_path = session_dir / "transcript.jsonl"

    active_tasks: dict[str, asyncio.Task] = {}

    # Deepgram STT - dùng chung một instance và http_session đã được khởi tạo SSL trong thread
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

    async def broadcast(text: str, is_final: bool, speaker_id: str, speaker_name: str, segment_id: str | None = None):
        """Phát transcript qua LiveKit Data Channel đến các client trong phòng"""
        if segment_id is None:
            segment_id = f"seg_{int(datetime.now(timezone.utc).timestamp() * 1000)}"
        kind = "FINAL" if is_final else "INTERIM"
        # logger.info("[%s] room=%s | speaker=%s | %s", kind, room_name, speaker_name, text)

        attributes = {
            "lk.transcription_final": "true" if is_final else "false",
            "lk.transcription_segment_id": segment_id,
            "speaker_id": speaker_id or "",
            "speaker_name": speaker_name or "",
        }

        # Text Stream
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
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            segments.append(entry)
            await asyncio.to_thread(_sync_append_jsonl, jsonl_path, entry)

    async def transcribe_track(participant: rtc.RemoteParticipant, audio_track: rtc.Track):
        """Lắng nghe audio từ một participant và stream tới Deepgram để transcribe.
        Dùng queue để tách audio reading khỏi STT stream, cho phép auto-reconnect.
        """
        speaker_id = participant.identity
        speaker_name = participant.name or participant.identity
        logger.info("Started transcribing track for participant: %s (%s)", speaker_name, speaker_id)

        audio_stream = rtc.AudioStream(audio_track, sample_rate=16000, num_channels=1)
        # Queue buffer audio frames — tránh mất frame khi STT stream restart
        frame_queue: asyncio.Queue = asyncio.Queue(maxsize=500)

        async def read_audio():
            """Đọc audio frames từ track và đẩy vào queue liên tục."""
            try:
                async for audio_frame_event in audio_stream:
                    try:
                        frame_queue.put_nowait(audio_frame_event.frame)
                    except asyncio.QueueFull:
                        pass  # Bỏ frame cũ nhất nếu queue đầy
                    await asyncio.sleep(0)
            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.warning("Audio read error for %s: %s", speaker_id, e)

        read_task = asyncio.create_task(read_audio())

        async def push_frames_to_stt(stream):
            """Lấy frames từ queue và đẩy vào STT stream được truyền vào.
            Nhận stream qua tham số (không phải closure) để tránh bug khi reconnect.
            """
            try:
                while True:
                    frame = await frame_queue.get()
                    stream.push_frame(frame)
            except asyncio.CancelledError:
                pass
            finally:
                logger.debug("Closing STT stream for %s", speaker_id)
                await stream.aclose()

        try:
            while True:  # Auto-reconnect loop khi Deepgram WebSocket drop
                logger.info("Starting new STT stream for %s", speaker_id)
                stt_stream = stt_instance.stream()
                current_utterance_id: str | None = None

                push_task = asyncio.create_task(push_frames_to_stt(stt_stream))

                try:
                    async for stt_event in stt_stream:
                        if not stt_event.alternatives:
                            continue
                        text = stt_event.alternatives[0].text.strip()
                        if not text:
                            continue

                        if stt_event.type == SpeechEventType.INTERIM_TRANSCRIPT:
                            # Tạo ID cố định cho utterance này nếu chưa có
                            if current_utterance_id is None:
                                current_utterance_id = f"seg_{int(datetime.now(timezone.utc).timestamp() * 1000)}"
                            asyncio.create_task(
                                broadcast(text, False, speaker_id, speaker_name, current_utterance_id)
                            )

                        elif stt_event.type == SpeechEventType.FINAL_TRANSCRIPT:
                            seg_id = current_utterance_id or f"seg_{int(datetime.now(timezone.utc).timestamp() * 1000)}"
                            current_utterance_id = None  # Reset cho utterance tiếp theo
                            asyncio.create_task(
                                broadcast(text, True, speaker_id, speaker_name, seg_id)
                            )

                except asyncio.CancelledError:
                    push_task.cancel()
                    raise  # Thoát hẳn vòng lặp
                except Exception as e:
                    logger.warning("STT stream error for %s: %s — will retry", speaker_id, e)
                finally:
                    push_task.cancel()

                logger.info("STT stream ended for %s — reconnecting in 1s...", speaker_id)
                await asyncio.sleep(1)

        except asyncio.CancelledError:
            pass
        finally:
            read_task.cancel()
            logger.info("Transcription stopped for participant: %s", speaker_id)

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

        # Huỷ task cũ nếu participant reconnect
        old_task = active_tasks.get(participant.identity)
        if old_task and not old_task.done():
            old_task.cancel()

        task = asyncio.ensure_future(transcribe_track(participant, track))
        active_tasks[participant.identity] = task

    def on_track_unsubscribed(
        track: rtc.Track,
        publication: rtc.TrackPublication,
        participant: rtc.RemoteParticipant,
    ):
        if track.kind != rtc.TrackKind.KIND_AUDIO:
            return
        task = active_tasks.pop(participant.identity, None)
        if task and not task.done():
            task.cancel()
        logger.info("Audio track unsubscribed for: %s", participant.identity)

    # Cơ chế tự động dừng agent khi phòng bị đóng hoặc không còn ai trong phòng
    empty_room_timer: asyncio.TimerHandle | None = None

    def check_empty_room():
        nonlocal empty_room_timer
        human_participants = [
            p for p in ctx.room.remote_participants.values()
            if p.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT
        ]
        if len(human_participants) == 0:
            logger.info("Room %s has no human participants left. Scheduling agent shutdown in 1s...", room_name)
            if empty_room_timer is None:
                loop = asyncio.get_running_loop()
                empty_room_timer = loop.call_later(
                    0.3,  # Safety net: nếu server chưa xóa phòng thì agent tự tắt sau 1s
                    lambda: asyncio.create_task(shutdown_if_empty()),
                )
        else:
            if empty_room_timer is not None:
                logger.info("Human participant active in room %s. Cancelled shutdown timer.", room_name)
                empty_room_timer.cancel()
                empty_room_timer = None

    async def shutdown_if_empty():
        human_participants = [
            p for p in ctx.room.remote_participants.values()
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
            task = active_tasks.pop(participant.identity, None)
            if task and not task.done():
                task.cancel()
            check_empty_room()

    def on_room_disconnected():
        logger.info("Room %s disconnected/closed by server. Shutting down STT agent.", room_name)
        ctx.shutdown("Room closed")

    # Đăng ký event handlers
    ctx.room.on("track_subscribed", on_track_subscribed)
    ctx.room.on("track_unsubscribed", on_track_unsubscribed)
    ctx.room.on("participant_connected", on_participant_connected)
    ctx.room.on("participant_disconnected", on_participant_disconnected)
    ctx.room.on("disconnected", on_room_disconnected)

    # Xử lý các track đã được subscribe từ trước (participant join trước agent)
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
            "language": "vi",
            "segment_count": len(segments),
            "transcript_file": "transcript.jsonl",
        }
        meta_path = session_dir / "metadata.json"
        content = json.dumps(metadata, ensure_ascii=False, indent=2)
        await asyncio.to_thread(meta_path.write_text, content, "utf-8")
        logger.info(
            "Session metadata saved: %s (%d segments, %.0fs)",
            meta_path, len(segments), metadata["duration_seconds"],
        )

    # Sự kiện để thoát entrypoint ngay lập tức khi shutdown
    shutdown_event = asyncio.Event()

    async def signal_shutdown():
        """Callback async để unblock shutdown_event.wait() ngay lập tức."""
        # Hủy mọi task STT trước
        for identity, task in list(active_tasks.items()):
            if not task.done():
                task.cancel()
        if active_tasks:
            await asyncio.gather(*active_tasks.values(), return_exceptions=True)
        active_tasks.clear()
        if not http_session.closed:
            await http_session.close()
        shutdown_event.set()

    ctx.add_shutdown_callback(signal_shutdown)
    ctx.add_shutdown_callback(save_transcript)

    logger.info("STT agent ready — waiting for audio tracks in room: %s", room_name)

    # Chờ cho đến khi agent được yêu cầu shutdown
    await shutdown_event.wait()


if __name__ == "__main__":
    cli.run_app(server)

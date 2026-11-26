import {
  Participant,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import { isAgentParticipant } from "@/utils/participant";

interface ConnectedAudioNode {
  trackId: string;
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
}

function isWaitingParticipant(participant: Participant): boolean {
  try {
    if (participant.metadata) {
      const meta = JSON.parse(participant.metadata);
      return meta.status === "waiting";
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Bộ trộn âm thanh tập trung chạy trên 1 AudioContext (48kHz) duy nhất:
 * - Tự động trộn toàn bộ âm thanh trong cuộc họp LiveKit:
 *   + Local Microphone + Local ScreenShareAudio
 *   + Remote Microphone + Remote ScreenShareAudio
 * - Không dùng audio loopback của Windows -> không lẫn âm thanh hệ thống/thông báo,
 *   không mở mic lần 2 -> tránh vọng tiếng và lệch clock.
 * - Gắn Silent Keep-Alive node (-140 dBFS) để giữ luồng audio xuất mẫu liên tục 48kHz
 *   ngay cả khi cả phòng im lặng/tắt mic -> đảm bảo đồng bộ A/V tuyệt đối.
 */
export class MeetingAudioMixer {
  private readonly room: Room;

  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private keepAliveSource: ConstantSourceNode | null = null;

  private readonly connectedNodes = new Map<string, ConnectedAudioNode>();
  private isStarted = false;
  private isDestroyed = false;

  constructor(room: Room) {
    this.room = room;
  }

  public async start(): Promise<MediaStreamTrack> {
    if (this.isDestroyed) {
      throw new Error("MeetingAudioMixer đã bị hủy.");
    }
    if (this.isStarted && this.destination) {
      const existing = this.destination.stream.getAudioTracks()[0];
      if (existing) return existing;
    }

    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioContext = new AudioCtx({ sampleRate: 48000 });
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    const masterGain = audioContext.createGain();
    masterGain.gain.value = 1.0;

    // Bộ nén nhẹ chống vỡ/clipping khi nhiều người nói cùng lúc
    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -6;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    const destination = audioContext.createMediaStreamDestination();

    masterGain.connect(compressor);
    compressor.connect(destination);

    // Silent keep-alive (-140 dBFS, hoàn toàn không nghe thấy) giúp WebAudio/Opus
    // không bao giờ dừng phát packet khi mọi người tắt mic -> chống trượt đồng bộ A/V
    const keepAliveSource = audioContext.createConstantSource();
    keepAliveSource.offset.value = 1e-7;
    keepAliveSource.connect(destination);
    keepAliveSource.start();

    this.audioContext = audioContext;
    this.masterGain = masterGain;
    this.compressor = compressor;
    this.destination = destination;
    this.keepAliveSource = keepAliveSource;

    this.bindRoomEvents();
    this.syncTracks();

    const audioTrack = destination.stream.getAudioTracks()[0];
    if (!audioTrack) {
      this.destroy();
      throw new Error("Không thể khởi tạo audio track đầu ra từ MeetingAudioMixer.");
    }

    this.isStarted = true;
    return audioTrack;
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.isStarted = false;

    this.unbindRoomEvents();

    // Chỉ ngắt node WebAudio, tuyệt đối KHÔNG stop() MediaStreamTrack gốc của LiveKit
    for (const key of Array.from(this.connectedNodes.keys())) {
      this.disconnectKey(key);
    }

    if (this.keepAliveSource) {
      try {
        this.keepAliveSource.stop();
        this.keepAliveSource.disconnect();
      } catch {
        // ignore
      }
      this.keepAliveSource = null;
    }

    if (this.masterGain) {
      try {
        this.masterGain.disconnect();
      } catch {
        // ignore
      }
      this.masterGain = null;
    }

    if (this.compressor) {
      try {
        this.compressor.disconnect();
      } catch {
        // ignore
      }
      this.compressor = null;
    }

    if (this.destination) {
      this.destination.stream.getTracks().forEach((t) => t.stop());
      this.destination = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {
        // ignore
      });
      this.audioContext = null;
    }
  }

  private readonly handleRoomChange = () => {
    if (this.isDestroyed) return;
    this.syncTracks();
  };

  private bindRoomEvents(): void {
    this.room.on(RoomEvent.TrackPublished, this.handleRoomChange);
    this.room.on(RoomEvent.TrackUnpublished, this.handleRoomChange);
    this.room.on(RoomEvent.TrackSubscribed, this.handleRoomChange);
    this.room.on(RoomEvent.TrackUnsubscribed, this.handleRoomChange);
    this.room.on(RoomEvent.LocalTrackPublished, this.handleRoomChange);
    this.room.on(RoomEvent.LocalTrackUnpublished, this.handleRoomChange);
    this.room.on(RoomEvent.TrackMuted, this.handleRoomChange);
    this.room.on(RoomEvent.TrackUnmuted, this.handleRoomChange);
    this.room.on(RoomEvent.ParticipantDisconnected, this.handleRoomChange);
    this.room.on(RoomEvent.ParticipantMetadataChanged, this.handleRoomChange);
    this.room.on(RoomEvent.ActiveDeviceChanged, this.handleRoomChange);
  }

  private unbindRoomEvents(): void {
    this.room.off(RoomEvent.TrackPublished, this.handleRoomChange);
    this.room.off(RoomEvent.TrackUnpublished, this.handleRoomChange);
    this.room.off(RoomEvent.TrackSubscribed, this.handleRoomChange);
    this.room.off(RoomEvent.TrackUnsubscribed, this.handleRoomChange);
    this.room.off(RoomEvent.LocalTrackPublished, this.handleRoomChange);
    this.room.off(RoomEvent.LocalTrackUnpublished, this.handleRoomChange);
    this.room.off(RoomEvent.TrackMuted, this.handleRoomChange);
    this.room.off(RoomEvent.TrackUnmuted, this.handleRoomChange);
    this.room.off(RoomEvent.ParticipantDisconnected, this.handleRoomChange);
    this.room.off(RoomEvent.ParticipantMetadataChanged, this.handleRoomChange);
    this.room.off(RoomEvent.ActiveDeviceChanged, this.handleRoomChange);
  }

  public syncTracks(): void {
    if (!this.audioContext || !this.masterGain || this.isDestroyed) return;

    const desiredTracks = new Map<
      string,
      { mediaStreamTrack: MediaStreamTrack; muted: boolean }
    >();

    const audioSources: Track.Source[] = [
      Track.Source.Microphone,
      Track.Source.ScreenShareAudio,
    ];

    // 1. Local audio tracks (Microphone + ScreenShareAudio nếu tự share có tiếng)
    const localParticipant = this.room.localParticipant;
    for (const source of audioSources) {
      const pub = localParticipant.getTrackPublication(source);
      const mst = pub?.track?.mediaStreamTrack;
      if (pub && mst && mst.readyState === "live") {
        const key = `local|${source}`;
        desiredTracks.set(key, {
          mediaStreamTrack: mst,
          muted: Boolean(pub.isMuted || !mst.enabled),
        });
      }
    }

    // 2. Remote audio tracks (Microphone + ScreenShareAudio)
    for (const participant of this.room.remoteParticipants.values()) {
      if (isWaitingParticipant(participant) || isAgentParticipant(participant)) {
        continue;
      }

      for (const source of audioSources) {
        const pub = participant.getTrackPublication(source) as
          | RemoteTrackPublication
          | undefined;
        if (!pub) continue;

        if (typeof pub.setSubscribed === "function" && !pub.isDesired) {
          pub.setSubscribed(true);
        }

        const mst = pub.track?.mediaStreamTrack;
        if (mst && mst.readyState === "live") {
          const key = `${participant.identity}|${source}`;
          desiredTracks.set(key, {
            mediaStreamTrack: mst,
            muted: Boolean(pub.isMuted || !mst.enabled),
          });
        }
      }
    }

    // 3. Gỡ bỏ các node không còn tồn tại hoặc đã đổi MediaStreamTrack (vd đổi mic)
    for (const [key, node] of Array.from(this.connectedNodes.entries())) {
      const desired = desiredTracks.get(key);
      if (!desired || desired.mediaStreamTrack.id !== node.trackId) {
        this.disconnectKey(key);
      }
    }

    // 4. Kết nối các track mới và cập nhật trạng thái mute mượt qua GainNode
    for (const [key, desired] of desiredTracks.entries()) {
      let node = this.connectedNodes.get(key);
      if (!node) {
        try {
          const stream = new MediaStream([desired.mediaStreamTrack]);
          const source = this.audioContext.createMediaStreamSource(stream);
          const gain = this.audioContext.createGain();
          gain.gain.value = desired.muted ? 0 : 1;

          source.connect(gain);
          gain.connect(this.masterGain);

          node = {
            trackId: desired.mediaStreamTrack.id,
            source,
            gain,
          };
          this.connectedNodes.set(key, node);
        } catch (err) {
          console.warn(`[MeetingAudioMixer] Không thể kết nối track ${key}:`, err);
        }
      } else {
        const targetGain = desired.muted ? 0 : 1;
        if (node.gain.gain.value !== targetGain) {
          node.gain.gain.setTargetAtTime(
            targetGain,
            this.audioContext.currentTime,
            0.01,
          );
        }
      }
    }
  }

  private disconnectKey(key: string): void {
    const node = this.connectedNodes.get(key);
    if (!node) return;
    try {
      node.source.disconnect();
      node.gain.disconnect();
    } catch {
      // ignore
    }
    this.connectedNodes.delete(key);
  }
}


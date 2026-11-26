import {
  LocalTrack,
  Participant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
  VideoQuality,
} from "livekit-client";
import { isAgentParticipant } from "@/utils/participant";

export interface CanvasCompositorOptions {
  width?: number;
  height?: number;
  fps?: number;
}

function isWaitingParticipant(participant: Participant): boolean {
  try {
    if (participant.metadata) {
      const meta = JSON.parse(participant.metadata);
      return meta.status === "waiting";
    }
  } catch {
    // ignore malformed metadata
  }
  return false;
}

/**
 * Tổng hợp luồng video cố định độ phân giải (mặc định 1920x1080 @ 30fps)
 * chỉ lấy duy nhất Track.Source.ScreenShare từ LiveKit Room (bỏ qua 100% Camera).
 * Khi không có ScreenShare (hoặc giữa 2 lượt share), canvas xuất màn hình đen thuần (#000000).
 *
 * Sử dụng:
 * - Thẻ <video> ẩn kích thước layout 1920x1080 trong viewport (opacity ~0, pointer-events: none)
 *   gắn qua track.attach() để LiveKit adaptiveStream luôn gửi layer độ phân giải cao nhất.
 * - Web Worker timer 30fps (không dùng requestAnimationFrame) để tránh bị đóng băng
 *   khi cửa sổ Electron bị minimize hoặc chạy nền.
 */
export class CanvasCompositor {
  private readonly room: Room;
  private readonly width: number;
  private readonly height: number;
  private readonly fps: number;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private videoContainer: HTMLDivElement | null = null;
  private videoEl: HTMLVideoElement | null = null;

  private attachedTrack: LocalTrack | RemoteTrack | null = null;
  private attachedTrackSid: string | null = null;

  private stream: MediaStream | null = null;
  private videoTrack: MediaStreamTrack | null = null;
  private useManualRequestFrame = false;

  private worker: Worker | null = null;
  private workerUrl: string | null = null;

  private isStarted = false;
  private isPaused = false;
  private isDestroyed = false;

  constructor(room: Room, options: CanvasCompositorOptions = {}) {
    this.room = room;
    this.width = options.width ?? 1920;
    this.height = options.height ?? 1080;
    this.fps = options.fps ?? 30;
  }

  public start(): MediaStreamTrack {
    if (this.isDestroyed) {
      throw new Error("CanvasCompositor đã bị hủy.");
    }
    if (this.isStarted && this.videoTrack) {
      return this.videoTrack;
    }

    // 1. Tạo Canvas cố định độ phân giải (opaque để tăng hiệu năng vẽ)
    const canvas = document.createElement("canvas");
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      throw new Error("Không thể khởi tạo 2D context cho CanvasCompositor.");
    }
    this.canvas = canvas;
    this.ctx = ctx;

    // 2. Tạo thẻ <video> ẩn kích thước layout cố định 1920x1080 trong viewport
    //    để LiveKit adaptiveStream luôn cấp độ phân giải cao nhất bất kể kích thước cửa sổ
    const container = document.createElement("div");
    container.setAttribute("data-tobomeet-recorder-stage", "true");
    container.style.position = "fixed";
    container.style.top = "0";
    container.style.left = "0";
    container.style.width = `${this.width}px`;
    container.style.height = `${this.height}px`;
    container.style.opacity = "0.001";
    container.style.pointerEvents = "none";
    container.style.zIndex = "-9999";
    container.style.overflow = "hidden";
    container.setAttribute("aria-hidden", "true");

    const videoEl = document.createElement("video");
    videoEl.muted = true;
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.style.width = "100%";
    videoEl.style.height = "100%";
    videoEl.style.objectFit = "contain";

    container.appendChild(videoEl);
    document.body.appendChild(container);
    this.videoContainer = container;
    this.videoEl = videoEl;

    // 3. Khởi tạo captureStream (ưu tiên manual requestFrame để ép CFR 30fps đều đặn)
    const probeStream = canvas.captureStream(0);
    const probeTrack = probeStream.getVideoTracks()[0];
    if (probeTrack && typeof (probeTrack as any).requestFrame === "function") {
      this.stream = probeStream;
      this.videoTrack = probeTrack;
      this.useManualRequestFrame = true;
    } else {
      probeTrack?.stop();
      this.stream = canvas.captureStream(this.fps);
      this.videoTrack = this.stream.getVideoTracks()[0];
      this.useManualRequestFrame = false;
    }

    if (!this.videoTrack) {
      this.destroy();
      throw new Error("Không thể tạo video track từ canvas.");
    }

    // 4. Đăng ký lắng nghe sự kiện LiveKit và đồng bộ ScreenShare hiện có
    this.bindRoomEvents();
    this.syncScreenShareTrack();

    // 5. Vẽ khung hình đầu tiên ngay lập tức (đen hoặc screenshare nếu sẵn sàng)
    this.drawFrame();

    // 6. Chạy Web Worker ticker 30fps độc lập khỏi rAF
    this.startTickerWorker();

    this.isStarted = true;
    this.isPaused = false;
    return this.videoTrack;
  }

  public pause(): void {
    this.isPaused = true;
  }

  public resume(): void {
    this.isPaused = false;
    this.drawFrame();
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.isStarted = false;
    this.isPaused = false;

    this.unbindRoomEvents();
    this.stopTickerWorker();
    this.detachCurrentTrack();

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      this.videoTrack = null;
    }

    if (this.videoContainer && this.videoContainer.parentNode) {
      this.videoContainer.parentNode.removeChild(this.videoContainer);
    }
    this.videoContainer = null;
    this.videoEl = null;
    this.ctx = null;
    this.canvas = null;
  }

  private readonly handleRoomChange = () => {
    if (this.isDestroyed) return;
    this.syncScreenShareTrack();
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
  }

  /**
   * Tìm ScreenShare track đang hoạt động (chỉ ScreenShare, tuyệt đối không lấy Camera).
   */
  public syncScreenShareTrack(): void {
    if (!this.videoEl || this.isDestroyed) return;

    let targetTrack: LocalTrack | RemoteTrack | null = null;
    let targetSid: string | null = null;

    // 1. Ưu tiên kiểm tra Local ScreenShare (nếu chính mình đang chia sẻ)
    const localPub = this.room.localParticipant.getTrackPublication(
      Track.Source.ScreenShare,
    );
    if (localPub?.track && !localPub.isMuted) {
      targetTrack = localPub.track;
      targetSid = localPub.trackSid || localPub.track.mediaStreamTrack.id;
    }

    // 2. Kiểm tra Remote ScreenShare
    if (!targetTrack) {
      for (const participant of this.room.remoteParticipants.values()) {
        if (isWaitingParticipant(participant) || isAgentParticipant(participant)) {
          continue;
        }
        const remotePub = participant.getTrackPublication(
          Track.Source.ScreenShare,
        ) as RemoteTrackPublication | undefined;

        if (!remotePub) continue;

        // Đảm bảo luôn subscribe và yêu cầu chất lượng cao nhất
        if (typeof remotePub.setSubscribed === "function" && !remotePub.isDesired) {
          remotePub.setSubscribed(true);
        }
        if (typeof remotePub.setVideoQuality === "function") {
          try {
            remotePub.setVideoQuality(VideoQuality.HIGH);
          } catch {
            // ignore nếu adaptiveStream đang kiểm soát
          }
        }

        if (remotePub.track && !remotePub.isMuted) {
          targetTrack = remotePub.track;
          targetSid = remotePub.trackSid || remotePub.track.mediaStreamTrack.id;
          break;
        }
      }
    }

    // Không thay đổi track -> bỏ qua
    if (targetTrack && targetSid && targetSid === this.attachedTrackSid) {
      return;
    }

    // Gỡ track cũ trước khi gắn track mới (hoặc chuyển sang màn hình đen)
    this.detachCurrentTrack();

    if (targetTrack && targetSid) {
      this.attachedTrack = targetTrack;
      this.attachedTrackSid = targetSid;
      targetTrack.attach(this.videoEl);
      this.videoEl.muted = true;
      this.videoEl.play().catch(() => {
        // Electron đã bật autoplayPolicy: no-user-gesture-required
      });
    }
  }

  private detachCurrentTrack(): void {
    if (this.attachedTrack && this.videoEl) {
      try {
        this.attachedTrack.detach(this.videoEl);
      } catch {
        // ignore
      }
    }
    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.srcObject = null;
    }
    this.attachedTrack = null;
    this.attachedTrackSid = null;
  }

  private drawFrame(): void {
    if (!this.ctx || !this.canvas || this.isDestroyed || this.isPaused) return;

    const ctx = this.ctx;
    const cw = this.width;
    const ch = this.height;

    // Luôn tô nền đen thuần (#000000) — hiển thị màn hình đen khi không có share
    // và làm viền letterbox/pillarbox khi tỷ lệ màn hình share khác 16:9
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, cw, ch);

    const video = this.videoEl;
    if (
      this.attachedTrack &&
      video &&
      video.readyState >= 2 &&
      video.videoWidth > 0 &&
      video.videoHeight > 0
    ) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const scale = Math.min(cw / vw, ch / vh);
      const dw = Math.round(vw * scale);
      const dh = Math.round(vh * scale);
      const dx = Math.floor((cw - dw) / 2);
      const dy = Math.floor((ch - dh) / 2);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(video, dx, dy, dw, dh);
    }

    if (this.useManualRequestFrame && this.videoTrack) {
      try {
        (this.videoTrack as any).requestFrame();
      } catch {
        // ignore
      }
    }
  }

  private startTickerWorker(): void {
    const intervalMs = 1000 / this.fps;
    const workerSource = `
      let timerId = null;
      self.onmessage = function(e) {
        if (e.data && e.data.type === 'start') {
          if (timerId !== null) clearInterval(timerId);
          timerId = setInterval(function() {
            self.postMessage('tick');
          }, e.data.intervalMs);
        } else if (e.data && e.data.type === 'stop') {
          if (timerId !== null) {
            clearInterval(timerId);
            timerId = null;
          }
        }
      };
    `;

    const blob = new Blob([workerSource], { type: "application/javascript" });
    this.workerUrl = URL.createObjectURL(blob);
    this.worker = new Worker(this.workerUrl);
    this.worker.onmessage = () => {
      this.drawFrame();
    };
    this.worker.postMessage({ type: "start", intervalMs });
  }

  private stopTickerWorker(): void {
    if (this.worker) {
      try {
        this.worker.postMessage({ type: "stop" });
        this.worker.terminate();
      } catch {
        // ignore
      }
      this.worker = null;
    }
    if (this.workerUrl) {
      URL.revokeObjectURL(this.workerUrl);
      this.workerUrl = null;
    }
  }
}


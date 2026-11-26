type Listener = (isRecording: boolean) => void;

let isLocalRecordingActive = false;
const listeners = new Set<Listener>();

/**
 * Trạng thái dùng chung cho Local Recording (Electron) để các hook như
 * useSelectiveSubscription luôn giữ subscribe track ScreenShare dù người dùng
 * chuyển sang trang Camera hay Whiteboard.
 */
export function getIsLocalRecording(): boolean {
  return isLocalRecordingActive;
}

export function setIsLocalRecording(active: boolean): void {
  if (isLocalRecordingActive === active) return;
  isLocalRecordingActive = active;
  listeners.forEach((listener) => {
    try {
      listener(active);
    } catch (err) {
      console.error("[localRecordingState] Listener error:", err);
    }
  });
}

export function subscribeLocalRecording(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}


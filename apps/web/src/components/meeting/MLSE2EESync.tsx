// apps/web/src/components/meeting/MLSE2EESync.tsx
"use client";

import { useEffect, useRef } from "react";
import { useRoomContext } from "@livekit/components-react";
import { ConnectionState, RoomEvent } from "livekit-client";

interface MLSE2EESyncProps {
  enabled: boolean;
  isMlsReady: boolean;
}

/**
 * Đồng bộ trạng thái mã hóa đầu cuối (E2EE) giữa LiveKit Room, LocalParticipant và MLS Key Provider.
 * Đảm bảo các luồng media (Camera, Micro, Màn hình) luôn được mã hóa AES-128-GCM trước khi truyền qua SFU.
 */
export function MLSE2EESync({ enabled, isMlsReady }: MLSE2EESyncProps) {
  const room = useRoomContext();
  const isSyncingRef = useRef(false);

  useEffect(() => {
    if (!enabled || !room) return;

    let isDisposed = false;

    const syncE2EE = async () => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;

      try {
        console.log("[MLS-E2EE-Sync] Kiểm tra trạng thái mã hóa E2EE của phòng:", {
          roomState: room.state,
          isE2EEEnabled: room.isE2EEEnabled,
          isLocalE2EEEnabled: room.localParticipant?.isE2EEEnabled,
          identity: room.localParticipant?.identity,
          isMlsReady,
        });

        // 1. Kích hoạt E2EE trên room
        if (!room.isE2EEEnabled) {
          console.log("[MLS-E2EE-Sync] Kích hoạt room.setE2EEEnabled(true)...");
          await room.setE2EEEnabled(true);
        }

        // 2. Đảm bảo localParticipant đã ở chế độ mã hóa E2EE
        if (room.localParticipant && !room.localParticipant.isE2EEEnabled) {
          console.log("[MLS-E2EE-Sync] Kích hoạt localParticipant.setE2EEEnabled(true)...");
          await room.localParticipant.setE2EEEnabled(true);
        }

        console.log("[MLS-E2EE-Sync] Đã đồng bộ E2EE thành công!", {
          isE2EEEnabled: room.isE2EEEnabled,
          isLocalE2EEEnabled: room.localParticipant?.isE2EEEnabled,
        });
      } catch (err) {
        if (!isDisposed) {
          console.error("[MLS-E2EE-Sync] Lỗi khi kích hoạt E2EE trên room:", err);
        }
      } finally {
        isSyncingRef.current = false;
      }
    };

    // Kích hoạt ngay khi component mount
    syncE2EE();

    // Lắng nghe sự kiện Room kết nối thành công để kích hoạt lại nếu trước đó identity chưa sẵn sàng
    const handleConnected = () => {
      console.log("[MLS-E2EE-Sync] Sự kiện Room Connected -> Kích hoạt E2EE");
      syncE2EE();
    };

    // Lắng nghe sự kiện lỗi mã hóa từ worker
    const handleEncryptionError = (error: Error) => {
      console.error("[MLS-E2EE-Sync] Cảnh báo lỗi mã hóa E2EE từ Worker:", error);
    };

    room.on(RoomEvent.Connected, handleConnected);
    room.on(RoomEvent.EncryptionError, handleEncryptionError);

    // Khi MLS đã sinh khóa giải mã xong
    if (isMlsReady) {
      syncE2EE();
    }

    return () => {
      isDisposed = true;
      room.off(RoomEvent.Connected, handleConnected);
      room.off(RoomEvent.EncryptionError, handleEncryptionError);
    };
  }, [enabled, room, isMlsReady]);

  return null;
}


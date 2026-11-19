// apps/web/src/hooks/useLiveKitMLS.ts
import { useEffect, useRef, useMemo, useState } from "react";
import { ExternalE2EEKeyProvider, Room } from "livekit-client";
import { socket } from "@/lib/socket";
import {
  MeetingMlsClient,
  serializeMlsData,
} from "@/lib/mls/meetingMlsClient";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

function toArrayBuffer(uint8: Uint8Array): ArrayBuffer {
  return uint8.buffer.slice(
    uint8.byteOffset,
    uint8.byteOffset + uint8.byteLength,
  ) as ArrayBuffer;
}

interface UseLiveKitMLSProps {
  meetingCode: string;
  userId: string;
  isHost: boolean;
  enabled: boolean;
  room?: Room | null;
}

export function useLiveKitMLS({
  meetingCode,
  userId,
  isHost,
  enabled,
  room,
}: UseLiveKitMLSProps) {
  const t = useTranslations("meeting");
  const mlsClientRef = useRef<MeetingMlsClient>(new MeetingMlsClient());
  const [isMlsReady, setIsMlsReady] = useState(false);

  // Khởi tạo LiveKit Key Provider
  const keyProvider = useMemo(() => {
    if (!enabled || typeof window === "undefined") return null;
    return new ExternalE2EEKeyProvider({
      keySize: 128,
    });
  }, [enabled]);

  // Cấu hình E2EE Room Options kèm Worker
  const e2eeConfig = useMemo(() => {
    if (!enabled || !keyProvider || typeof window === "undefined") return undefined;
    try {
      const worker = new Worker("/livekit-client.e2ee.worker.js");

      // Bọc bộ lắng nghe onmessage để ngăn lỗi race-condition của LiveKit SDK:
      // "couldn't set encryption status, participant not found" khi remote participant vừa ngắt kết nối hoặc chưa đồng bộ xong map
      let internalOnMessage: ((ev: MessageEvent) => void) | null = null;
      Object.defineProperty(worker, "onmessage", {
        get() {
          return internalOnMessage;
        },
        set(fn) {
          internalOnMessage = (ev: MessageEvent) => {
            try {
              if (fn) fn.call(worker, ev);
            } catch (err: any) {
              if (
                err &&
                err.message &&
                (err.message.includes("couldn't set encryption status") ||
                  err.message.includes("participant not found"))
              ) {
                console.warn(
                  "[MLS-E2EE] Bỏ qua race-condition cập nhật encryption status cho participant:",
                  err.message,
                );
                return;
              }
              throw err;
            }
          };
        },
      });

      return {
        keyProvider,
        worker,
      };
    } catch (err) {
      console.error("[MLS] Lỗi khi tạo E2EE Worker:", err);
      return undefined;
    }
  }, [enabled, keyProvider]);

  // Hàm tiện ích nạp khóa vào keyProvider và kích hoạt E2EE trên room nếu cần
  const applyEpochKey = async (rawKey: Uint8Array, contextLabel: string) => {
    if (!keyProvider) return;
    try {
      console.log(`[MLS] Đang nạp khóa giải mã (${contextLabel})...`);
      await keyProvider.setKey(toArrayBuffer(rawKey));
      setIsMlsReady(true);

      if (room && !room.isE2EEEnabled) {
        console.log(`[MLS] Kích hoạt room.setE2EEEnabled(true) sau khi có khóa (${contextLabel})...`);
        await room.setE2EEEnabled(true);
      }
    } catch (err) {
      console.error(`[MLS] Lỗi nạp khóa (${contextLabel}):`, err);
    }
  };

  useEffect(() => {
    if (!enabled || !meetingCode || !userId || !keyProvider) return;

    const mlsClient = mlsClientRef.current;
    let isMounted = true;

    async function initMLS() {
      try {
        if (!socket.connected) {
          socket.connect();
        }

        console.log(`[MLS] Đang sinh KeyPackage cho user ${userId}...`);
        const publicPkg = await mlsClient.init(userId);

        if (!isMounted) return;

        // Đăng ký tham gia nhóm MLS qua Socket BE (dùng serializeMlsData để tránh lỗi BigInt)
        socket.emit("mls:init_member", {
          meetingCode,
          userId,
          isHost,
          keyPackage: serializeMlsData(publicPkg),
        });
      } catch (error) {
        console.error("[MLS] Lỗi khởi tạo KeyPackage:", error);
      }
    }

    // 1. Được chỉ định làm Creator (người đầu tiên tạo phòng)
    const handleDesignatedAsCreator = async () => {
      try {
        console.log("[MLS] Được chỉ định làm Creator, khởi tạo Group...");
        const initialKey = await mlsClient.createGroup(meetingCode);
        await applyEpochKey(initialKey, "Creator initial group");
        console.log("[MLS] Khởi tạo phòng MLS thành công!");
      } catch (err) {
        console.error("[MLS] Lỗi tạo Group MLS:", err);
      }
    };

    // 2. Committer nhận yêu cầu commit thêm thành viên mới
    const handleRequestAddMember = async (data: {
      newMemberSocketId: string;
      userId: string;
      leafIndex: number;
      keyPackage: any;
    }) => {
      try {
        console.log(
          `[MLS Committer] Đang tạo Commit thêm thành viên ${data.userId}...`,
        );
        const { welcome, commit, newKey } = await mlsClient.addMember(
          data.keyPackage,
        );
        await applyEpochKey(newKey, `Add member ${data.userId}`);

        // Gửi kết quả Commit & Welcome lên Backend Relay
        socket.emit("mls:submit_add_commit", {
          meetingCode,
          targetSocketId: data.newMemberSocketId,
          welcomeMessage: serializeMlsData(welcome),
          commitMessage: serializeMlsData(commit),
        });
      } catch (err) {
        console.error("[MLS Committer] Lỗi khi thêm thành viên:", err);
      }
    };

    // 3. Thành viên mới nhận tin nhắn Welcome để gia nhập phòng
    const handleWelcomeReceived = async (data: { welcomeMessage: any }) => {
      try {
        console.log("[MLS Member] Nhận tin nhắn Welcome, đang nạp trạng thái...");
        const newKey = await mlsClient.joinFromWelcome(data.welcomeMessage);
        await applyEpochKey(newKey, "Join from Welcome");
        console.log("[MLS Member] Tham gia nhóm thành công, đã nạp khóa giải mã!");
        toast.success(
          t("e2ee_connected", {
            defaultValue: "Đã kết nối mã hóa đầu cuối an toàn",
          }),
        );
      } catch (err) {
        console.error("[MLS Member] Lỗi khi nhận Welcome:", err);
      }
    };

    // 4. Các thành viên hiện tại nhận Commit để xoay Epoch
    const handleCommitReceived = async (data: { commitMessage: any }) => {
      try {
        console.log("[MLS Member] Nhận Commit mới, đang cập nhật Epoch...");
        const newKey = await mlsClient.applyCommit(data.commitMessage);
        await applyEpochKey(newKey, "Commit received rotation");
        console.log("[MLS Member] Xoay Epoch thành công!");
      } catch (err) {
        console.error("[MLS Member] Lỗi khi áp dụng Commit:", err);
      }
    };

    // 5. Committer nhận yêu cầu commit xóa thành viên vừa rời phòng
    const handleRequestRemoveMember = async (data: {
      removedUserId: string;
      removedLeafIndex: number;
    }) => {
      try {
        console.log(
          `[MLS Committer] Đang tạo Commit xóa thành viên ${data.removedUserId}...`,
        );
        const { commit, newKey } = await mlsClient.removeMember(
          data.removedLeafIndex,
        );
        await applyEpochKey(newKey, `Remove member ${data.removedUserId}`);

        socket.emit("mls:submit_remove_commit", {
          meetingCode,
          commitMessage: serializeMlsData(commit),
        });
      } catch (err) {
        console.error("[MLS Committer] Lỗi khi remove member:", err);
      }
    };

    socket.on("mls:designated_as_creator", handleDesignatedAsCreator);
    socket.on("mls:request_add_member", handleRequestAddMember);
    socket.on("mls:welcome_received", handleWelcomeReceived);
    socket.on("mls:commit_received", handleCommitReceived);
    socket.on("mls:request_remove_member", handleRequestRemoveMember);

    initMLS();

    return () => {
      isMounted = false;
      socket.off("mls:designated_as_creator", handleDesignatedAsCreator);
      socket.off("mls:request_add_member", handleRequestAddMember);
      socket.off("mls:welcome_received", handleWelcomeReceived);
      socket.off("mls:commit_received", handleCommitReceived);
      socket.off("mls:request_remove_member", handleRequestRemoveMember);
    };
  }, [enabled, meetingCode, userId, isHost, keyProvider, room]);

  return {
    keyProvider,
    e2eeConfig,
    isMlsReady,
  };
}

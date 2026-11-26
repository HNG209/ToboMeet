import { useState } from "react";
import { toast } from "sonner";
import {
  useParticipants,
  useLocalParticipant,
  useRoomInfo,
} from "@livekit/components-react";
import { useHandRaise } from "@/hooks/useHandRaise";
import {
  useMuteParticipantMutation,
  useRemoveParticipantMutation,
  useApproveParticipantMutation,
  useRenameParticipantMutation,
} from "@/lib/redux/api/meetingsApi";
import { useTranslations } from "next-intl";
import {
  useTransferRoomOwnershipMutation,
  useUpdateChannelMemberRoleMutation,
} from "@/lib/redux/api/roomsApi";
import { useMeetingSessionContext } from "@/components/meeting/contexts/MeetingSessionContext";

import { isAgentParticipant } from "@/utils/participant";

export function useParticipantManager({
  meetingCode,
}: {
  meetingCode?: string;
}) {
  const t = useTranslations("meeting.participant_list");
  const tServer = useTranslations("server.errors");

  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const { getHandState } = useHandRaise();
  const { metadata: roomMetadata } = useRoomInfo();

  const { meetingData } = useMeetingSessionContext();

  const [removeParticipant] = useRemoveParticipantMutation();
  const [muteParticipantApi] = useMuteParticipantMutation();
  const [approveParticipantApi] = useApproveParticipantMutation(); // Khởi tạo mutation
  const [renameParticipantApi, { isLoading: isRenaming }] =
    useRenameParticipantMutation();
  const [updateRoleApi] = useUpdateChannelMemberRoleMutation();
  const [transferOwnership] = useTransferRoomOwnershipMutation();

  const [kickedUsers, setKickedUsers] = useState<string[]>([]);
  const [kickingUserId, setKickingUserId] = useState<string | null>(null);
  const [renameState, setRenameState] = useState<{
    isOpen: boolean;
    newName: string;
  } | null>(null);

  // Phân tích Room Metadata
  let approvalPermission = "admin_only";
  let isWaitingRoomEnabled = false;
  let isBreakoutRoom = false;
  try {
    if (roomMetadata) {
      const roomMeta = JSON.parse(roomMetadata);
      isBreakoutRoom = roomMeta.roomType === "breakout";
      approvalPermission = roomMeta.approvalPermission || "admin_only";
      isWaitingRoomEnabled = !isBreakoutRoom && roomMeta.isWaitingRoomEnabled === true;
    }
  } catch (error) { }

  // Phân tích Role của bản thân (vô hiệu hóa quyền quản trị khi đang trong phòng breakout)
  let localRole = "guest";
  try {
    if (localParticipant.metadata) {
      localRole = JSON.parse(localParticipant.metadata).role || "guest";
    }
  } catch (error) { }
  const canManageParticipants =
    !isBreakoutRoom && (localRole === "owner" || localRole === "admin");
  const isLocalAdmin = !isBreakoutRoom && localRole === "admin";
  const isLocalOwner = !isBreakoutRoom && localRole === "owner";

  const roleName = t("role_leader", { defaultValue: "Trưởng phòng" });

  // AI CÓ QUYỀN DUYỆT?
  let canApprove = false;
  if (!isBreakoutRoom && isWaitingRoomEnabled) {
    if (canManageParticipants) {
      canApprove = true; // Admin/Owner luôn có quyền
    } else if (approvalPermission === "everyone") {
      canApprove = true; // Mọi người đều có quyền
    } else if (
      approvalPermission === "member_and_admin" &&
      localRole === "member"
    ) {
      canApprove = true; // Thành viên cũng có quyền
    }
  }

  // Lọc ra danh sách ĐANG CHỜ (waiting) - bỏ qua agent/bot
  const waitingParticipants = participants.filter((p) => {
    if (isAgentParticipant(p)) return false;
    if (kickedUsers.includes(p.identity)) return false;
    try {
      if (p.metadata) {
        const meta = JSON.parse(p.metadata);
        return meta.status === "waiting";
      }
    } catch (e) { }
    return false;
  });

  // Lọc ra danh sách ĐÃ VÀO PHÒNG (joined/owner) - bỏ qua agent/bot
  const displayParticipants = participants
    .filter((p) => {
      if (isAgentParticipant(p)) return false;
      if (kickedUsers.includes(p.identity)) return false;
      try {
        if (p.metadata) {
          const meta = JSON.parse(p.metadata);
          return meta.status !== "waiting"; // Bỏ qua những người đang chờ
        }
      } catch (e) { }
      return true;
    })
    .sort((a, b) => {
      const stateA = getHandState(a);
      const stateB = getHandState(b);

      if (stateA.isRaised && stateB.isRaised) {
        return parseInt(stateA.raisedAt) - parseInt(stateB.raisedAt);
      }
      if (stateA.isRaised) return -1;
      if (stateB.isRaised) return 1;
      return 0;
    });

  // Hàm duyệt người dùng
  const handleApprove = async (identity: string, name: string) => {
    const isAll = identity === "all";

    toast.promise(
      approveParticipantApi({
        code: meetingCode!,
        identity,
      }).unwrap(),
      {
        loading: isAll
          ? t("approve_all_loading")
          : t("approve_loading", { name: name }),
        success: isAll
          ? t("approve_all_success")
          : t("approve_success", { name: name }),
        error: (err: any) =>
          err?.code
            ? tServer(String(err.code))
            : isAll
              ? t("approve_all_error")
              : t("approve_error"),
      },
    );
  };

  const handleRemove = async (identity: string) => {
    const participant = participants.find((p) => p.identity === identity);
    if (!participant) return;

    toast.warning(t("remove_confirm", { name: participant.name || "" }), {
      action: {
        label: t("confirm"),
        onClick: async () => {
          setKickingUserId(identity);
          try {
            if (!meetingCode) {
              toast.error(t("remove_error"));
              return;
            }

            await removeParticipant({
              code: meetingCode,
              identity,
            }).unwrap();
            setKickedUsers((prev) => [...prev, identity]);
            toast.success(
              t("remove_success", { name: participant.name || "" }),
            );
          } catch (error: any) {
            console.error(error);
            const msg = error?.code
              ? tServer(String(error.code))
              : t("remove_error");
            toast.error(msg);
          } finally {
            setKickingUserId(null);
          }
        },
      },
      cancel: {
        label: t("cancel"),
        onClick: () => { },
      },
      duration: Infinity,
    });
  };

  const handleUpdateRole = async (
    targetUserId: string,
    role: "admin" | "member",
  ) => {
    if (!meetingData || !meetingData.channelId || !meetingData.roomId) return;

    try {
      await updateRoleApi({
        roomId: meetingData.roomId,
        channelId: meetingData.channelId,
        targetUserId: targetUserId,
        role,
      }).unwrap();

      if (role === "admin") {
        toast.success(
          t("toast_appoint_vice_leader_success", {
            defaultValue: "Bổ nhiệm Phó nhóm thành công",
          }),
        );
      } else {
        toast.success(
          t("toast_revoke_vice_leader_success", {
            defaultValue: "Đã thu hồi Phó nhóm",
          }),
        );
      }
    } catch (err: any) {
      if (err?.code) {
        toast.error(tServer(String(err.code)));
      } else if (role === "admin") {
        const subTitle = t("role_vice_leader");
        toast.error(
          err?.data?.message ||
          t("toast_max_vice_leaders_reached", {
            role: subTitle,
            defaultValue: `Đã đạt số lượng tối đa 3 ${subTitle}`,
          }),
        );
      } else {
        toast.error(err?.data?.message || t("cannot_revoke_permission"));
      }
    }
  };

  const handleTransferOwnership = async (
    targetUserId: string,
    targetUserName: string,
  ) => {
    toast(
      t("transfer_modal_body", {
        role: roleName,
        name: targetUserName,
        defaultValue: t("transfer_modal_body", {
          role: roleName,
          name: targetUserName,
        }),
      }),
      {
        action: {
          label: t("confirm", { defaultValue: "Xác nhận" }),
          onClick: async () => {
            if (!meetingData || !meetingData.roomId) return;

            try {
              await transferOwnership({
                roomId: meetingData.roomId,
                newOwnerId: targetUserId,
              }).unwrap();

              toast.success(
                t("toast_transfer_success", {
                  actor: "",
                  role: t("role_leader"),
                  target: targetUserName,
                  defaultValue: "Chuyển quyền thành công!",
                }),
              );
            } catch (err: any) {
              console.error("[TransferOwnership] Transfer error:", err);

              const msg =
                (err?.code && tServer(String(err.code))) ||
                err?.data?.message ||
                err?.message ||
                t("cannot_transfer_role");

              toast.error(msg);
            }
          },
        },
        cancel: {
          label: t("cancel", { defaultValue: "Hủy" }),
          onClick: () => { },
        },
        duration: 10000,
      },
    );
  };

  const handleMute = async (
    identity: string,
    name: string,
    trackType: "audio" | "video",
  ) => {
    const typeLabel = trackType === "audio" ? "Mic" : "Camera";

    toast.promise(
      muteParticipantApi({
        code: meetingCode!,
        identity,
        trackType,
      }).unwrap(),
      {
        loading: t("mute_loading", {
          type: typeLabel,
          name: name,
        }),
        success: t("mute_success", {
          type: typeLabel,
          name: name,
        }),
        error: (err: any) =>
          err?.code
            ? tServer(String(err.code))
            : t("mute_error", {
              type: typeLabel,
            }),
      },
    );
  };

  const handleRenameSubmit = async () => {
    if (!renameState || !renameState.newName.trim() || !meetingCode || isRenaming) return;
    const newName = renameState.newName.trim();

    try {
      await renameParticipantApi({
        code: meetingCode,
        name: newName,
      }).unwrap();
      setRenameState(null);
    } catch (error: any) {
      console.error(error);
      toast.error(
        error?.data?.code
          ? tServer(String(error.data.code))
          : t("rename_error"),
      );
    }
  };

  return {
    localParticipant,
    displayParticipants, // Những người đã duyệt
    waitingParticipants, // Nhóm Đang chờ
    canManageParticipants,
    isLocalAdmin,
    isLocalOwner,
    canApprove,
    kickingUserId,
    renameState,
    setRenameState,
    handleRemove,
    handleMute,
    handleUpdateRole,
    handleTransferOwnership,
    handleRenameSubmit,
    handleApprove,
    getHandState,
    isRenaming,
  };
}

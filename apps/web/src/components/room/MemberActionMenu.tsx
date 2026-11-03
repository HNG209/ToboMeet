"use client";

import { useEffect, useRef } from "react";
import {
  ShieldCheck,
  UserCheck,
  UserMinus,
  UserPlus,
  UserX,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useDispatch } from "react-redux";
import {
  roomsApi,
  useUpdateChannelMemberRoleMutation,
  useAddChannelMemberMutation,
  useRemoveChannelMemberMutation,
} from "@/lib/redux/api/roomsApi";
import { AppDispatch } from "@/lib/redux/store";

interface MemberActionMenuProps {
  member: any;
  room: any;
  currentChannel: any;
  currentChannelId: string;
  userId: string; // ID của người đang đăng nhập
  isCurrentUserOwner: boolean;
  isCurrentUserRoomAdmin: boolean;
  canUserManageChannel: boolean;
  onClose: () => void;
  onViewProfile?: () => void;
  onReportUser: (member: { userId: string; displayName: string }) => void;
  onTransferOwnership: (member: {
    userId: string;
    displayName: string;
  }) => void;
  onRemoveMember: (member: { userId: string; displayName: string }) => void;
}

export default function MemberActionMenu({
  member,
  room,
  currentChannel,
  currentChannelId,
  userId,
  isCurrentUserOwner,
  isCurrentUserRoomAdmin,
  canUserManageChannel,
  onClose,
  onViewProfile,
  onReportUser,
  onTransferOwnership,
  onRemoveMember,
}: MemberActionMenuProps) {
  const t = useTranslations("room");
  const dispatch = useDispatch<AppDispatch>();

  const [updateChannelMemberRole] = useUpdateChannelMemberRoleMutation();
  const [addChannelMember] = useAddChannelMemberMutation();
  const [removeChannelMember] = useRemoveChannelMemberMutation();

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  const handleUpdateRole = async (role: "admin" | "member") => {
    onClose();
    if (!currentChannelId) return;

    try {
      await updateChannelMemberRole({
        roomId: room._id,
        channelId: currentChannelId,
        targetUserId: member.userId,
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
      if (role === "admin") {
        toast.error(
          err?.data?.message ||
            t("toast_max_vice_leaders_reached", {
              role: t("role_vice_leader"),
              defaultValue: `Đã đạt số lượng tối đa 3 Phó nhóm`,
            }),
        );
      } else {
        toast.error(err?.data?.message || "Không thể thu hồi quyền");
      }
    }
  };

  const handleTogglePrivateChannelAccess = async (action: "add" | "remove") => {
    onClose();
    try {
      let updatedRoom;
      if (action === "add") {
        updatedRoom = await addChannelMember({
          roomId: room._id,
          channelId: currentChannelId,
          targetUserId: member.userId,
        }).unwrap();
        toast.success(
          t("toast_add_to_private_channel_success", {
            defaultValue: "Đã thêm vào Kênh riêng tư",
          }),
        );
      } else {
        updatedRoom = await removeChannelMember({
          roomId: room._id,
          channelId: currentChannelId,
          targetUserId: member.userId,
        }).unwrap();
        toast.success(
          t("toast_remove_from_private_channel_success", {
            defaultValue: "Đã xóa khỏi Kênh riêng tư",
          }),
        );
      }

      if (updatedRoom) {
        dispatch(
          roomsApi.util.updateQueryData(
            "getRoomById",
            room._id,
            () => updatedRoom,
          ),
        );
      }
    } catch (err: any) {
      toast.error(
        err?.data?.message ||
          `Không thể ${action === "add" ? "thêm vào" : "xóa khỏi"} Kênh riêng tư`,
      );
    }
  };

  // Tính toán các trạng thái hiển thị nút
  const targetChannelRole = currentChannel?.members?.find(
    (m: any) =>
      m.userId === member.userId ||
      (member.supabaseId && m.userId === member.supabaseId) ||
      (member._id && m.userId === member._id),
  )?.role;
  const isAdmin = targetChannelRole === "admin";
  const isTargetRoomOwner =
    member.role === "owner" || member.userId === room?.ownerId;
  const isTargetInPrivateChannel = currentChannel?.members?.some(
    (m: any) =>
      (m.userId === member.userId ||
        (member.supabaseId && m.userId === member.supabaseId) ||
        (member._id && m.userId === member._id)) &&
      m.isLeft !== true &&
      m.status !== "REMOVED" &&
      m.status !== "LEFT",
  );

  const canRemoveFromRoom =
    isCurrentUserOwner ||
    (isCurrentUserRoomAdmin &&
      member.userId !== room?.ownerId &&
      member.userId !== userId &&
      member.role !== "owner" &&
      !isAdmin &&
      (currentChannel?.isPrivate === true || targetChannelRole !== "admin"));

  return (
    <div
      ref={menuRef}
      onClick={(e) => e.stopPropagation()}
      className="absolute right-4 z-50 w-56 bg-white border border-slate-200 rounded-xl shadow-xl py-1 mt-1 text-xs"
    >
        {/* Xem hồ sơ & Report */}
        <button
          onClick={() => {
            onClose();
            if (onViewProfile) onViewProfile();
          }}
          className="w-full text-left px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
        >
          {t("view_profile")}
        </button>

        <button
          onClick={(e) => {
          e.stopPropagation();
          onReportUser({
              userId: member.userId,
              displayName: member.displayName || "Người dùng",
            });
            onClose();
          }}
          className="w-full text-left px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
        >
          {t("report_user")}
        </button>

        {/* THAO TÁC QUẢN LÝ DÀNH CHO OWNER */}
        {isCurrentUserOwner && (
          <>
            {isAdmin ? (
              <button
                onClick={(e) => { e.stopPropagation(); handleUpdateRole("member"); }}
                className="w-full text-left px-4 py-2 font-semibold text-amber-600 hover:bg-amber-50 flex items-center gap-2"
              >
                <UserCheck className="w-3.5 h-3.5" />
                {t("revoke_vice_leader", {
                  defaultValue: "Thu hồi Phó nhóm",
                })}
              </button>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); handleUpdateRole("admin"); }}
                className="w-full text-left px-4 py-2 font-semibold text-blue-600 hover:bg-blue-50 flex items-center gap-2"
              >
                <UserCheck className="w-3.5 h-3.5" />
                {t("appoint_vice_leader", {
                  defaultValue: "Bổ nhiệm Phó nhóm",
                })}
              </button>
            )}

            <button
              onClick={(e) => {
          e.stopPropagation();
          onTransferOwnership({
                  userId: member.userId,
                  displayName: member.displayName || "Thành viên",
                });
                onClose();
              }}
              className="w-full text-left px-4 py-2 font-semibold text-amber-700 hover:bg-amber-50 flex items-center gap-2"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              {t("appoint_leader", { defaultValue: "Bổ nhiệm Trưởng nhóm" })}
            </button>
          </>
        )}

        {/* THAO TÁC KÊNH RIÊNG TƯ */}
        {canUserManageChannel &&
          member.userId !== room?.ownerId &&
          currentChannel?.isPrivate && (
            <div className="border-t border-slate-100 pt-1 mt-1">
              {isTargetInPrivateChannel ? (
                !isCurrentUserOwner && (isAdmin || isTargetRoomOwner) ? null : (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleTogglePrivateChannelAccess("remove"); }}
                    className="w-full text-left px-4 py-2 font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <UserMinus className="w-3.5 h-3.5" />
                    {t("remove_from_private_channel", {
                      defaultValue: "Xóa khỏi Kênh riêng tư",
                    })}
                  </button>
                )
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); handleTogglePrivateChannelAccess("add"); }}
                  className="w-full text-left px-4 py-2 font-semibold text-brand-600 hover:bg-brand-50 flex items-center gap-2"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {t("add_to_private_channel", {
                    defaultValue: "Thêm vào Kênh riêng tư",
                  })}
                </button>
              )}
            </div>
          )}

        {/* XÓA KHỎI PHÒNG */}
        {canRemoveFromRoom && (
          <button
            onClick={(e) => {
          e.stopPropagation();
          onRemoveMember({
                userId: member.userId,
                displayName: member.displayName || "Người dùng",
              });
              onClose();
            }}
            className="w-full text-left px-4 py-2 font-semibold text-red-600 hover:bg-red-50 border-t border-slate-100 flex items-center gap-2"
          >
            <UserX className="w-3.5 h-3.5" />
            {t("remove_from_room")}
          </button>
        )}
      </div>
  );
}

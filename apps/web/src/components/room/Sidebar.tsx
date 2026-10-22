"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChannelResponse, RoomResponse } from "@tobomeet/shared/types";
import {
  useAddChannelMutation,
  useLeaveRoomMutation,
  useInviteMemberMutation,
  useGetRoomMembersQuery,
  useDisbandRoomMutation,
  useLeaveChannelMutation,
  useRenameRoomMutation,
} from "@/lib/redux/api/roomsApi";
import { useGlobalUserSearch } from "@/hooks/useGlobalUserSearch";
import {
  Hash,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  Video,
  GraduationCap,
  Plus,
  X,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  UserPlus,
  Link as LinkIcon,
  LogOut,
  Trash2,
  Flag,
  Lock,
  MoreVertical,
  Edit3,
} from "lucide-react";
import { createPortal } from "react-dom";
import ReportRoomModal from "./ReportRoomModal";
import CreateChannelModal from "./CreateChannelModal";
import AddPrivateChannelMemberModal from "./AddPrivateChannelMemberModal";
import RenameChannelModal from "./RenameChannelModal";
import { axiosInstance as axios } from "@/lib/axios";
import UserAvatar from "@/components/common/UserAvatar";


interface SidebarProps {
  room: RoomResponse;
  userId: string;
  onClose?: () => void;
  activeChannel: string;
  setActiveChannel: (channelName: string) => void;
  roomMembers?: any[];
}

export default function Sidebar({
  room,
  userId,
  activeChannel,
  setActiveChannel,
  onClose,
  roomMembers: propRoomMembers,
}: SidebarProps) {

  const t = useTranslations("room");
  const tDashboard = useTranslations("dashboard");
  const router = useRouter();
  const [channelsExpanded, setChannelsExpanded] = useState(true);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const roomMenuRef = useRef<HTMLDivElement>(null);
  const channelMenuRef = useRef<HTMLDivElement>(null);

  const [showAddChannelModal, setShowAddChannelModal] = useState(false);
  const [channelToManage, setChannelToManage] = useState<ChannelResponse | null>(null);
  const [channelToLeave, setChannelToLeave] = useState<any | null>(null);
  const [channelToRename, setChannelToRename] = useState<any | null>(null);
  const [leaveChannelMutation, { isLoading: isLeavingChannel }] =
    useLeaveChannelMutation();
  const [openChannelMenuId, setOpenChannelMenuId] = useState<string | null>(
    null,
  );

  const [newChannelName, setNewChannelName] = useState("");
  const [addChannel, { isLoading }] = useAddChannelMutation();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // States cho menu quản lý phòng
  const [showMenu, setShowMenu] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaveRoom, { isLoading: isLeaving }] = useLeaveRoomMutation();
  const [showDisbandConfirm, setShowDisbandConfirm] = useState(false);
  const [disbandRoom, { isLoading: isDisbanding }] = useDisbandRoomMutation();
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renamingName, setRenamingName] = useState(room.name || "");
  const [renameRoom, { isLoading: isRenaming }] = useRenameRoomMutation();
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // Sync renamingName state when room.name changes
  useEffect(() => {
    setRenamingName(room.name || "");
  }, [room.name]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (showMenu && roomMenuRef.current && !roomMenuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
      if (openChannelMenuId && channelMenuRef.current && !channelMenuRef.current.contains(event.target as Node)) {
        setOpenChannelMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showMenu, openChannelMenuId]);

  // State cho Báo cáo phòng
  const [showReportModal, setShowReportModal] = useState(false);
  const [isReporting, setIsReporting] = useState(false);

  // States và Hooks cho bàn giao quyền chủ phòng
  const [selectedNewOwner, setSelectedNewOwner] = useState<string | null>(null);
  const { data: queryRoomMembers = [] } = useGetRoomMembersQuery(room._id, {
    skip: !!propRoomMembers,
  });
  const roomMembers = propRoomMembers || queryRoomMembers;
  const otherMembers = roomMembers.filter((m: any) => m.userId !== userId);


  // States và Hooks cho tính năng tìm kiếm gợi ý & mời thành viên
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!showInviteModal) {
      setSearchQuery("");
      setSelectedUser(null);
      setInviteError(null);
      setInviteSuccess(null);
    }
  }, [showInviteModal]);

  const {
    users: searchResults = [],
    isSearching,
    isLoadingMore,
    hasNext: hasNextPage,
    debouncedQuery,
    loadMore: loadMoreUsers,
  } = useGlobalUserSearch({
    q: searchQuery,
    skip: !showInviteModal || !searchQuery.trim(),
    debounceMs: 300,
  });

  const [inviteMember, { isLoading: isInviting }] = useInviteMemberMutation();

  const isUserInRoom = (u: any) => {
    if (!u) return false;
    const targetId = u.supabaseId || u._id || u.id;
    if (room.ownerId === targetId) return true;
    return (
      roomMembers.some((m: any) => {
        const mId = m.userId || m.supabaseId || m._id;
        return (
          mId === targetId &&
          m.status !== "removed" &&
          m.status !== "left"
        );
      }) || false
    );
  };

  const isSelectedUserInRoom = selectedUser ? isUserInRoom(selectedUser) : false;

  const handleInviteUser = async () => {
    setInviteError(null);
    setInviteSuccess(null);

    if (!selectedUser && !searchQuery.trim()) {
      setInviteError(t("invite_error_empty"));
      return;
    }

    try {
      await inviteMember({
        roomId: room._id,
        email: selectedUser ? undefined : searchQuery.trim(),
        targetUserId: selectedUser ? selectedUser.supabaseId : undefined,
      }).unwrap();

      setInviteSuccess(t("invite_success"));
      setSearchQuery("");
      setSelectedUser(null);
    } catch (err: any) {
      const rawMsg = err?.data?.message || err?.message;
      const parsedMsg = Array.isArray(rawMsg)
        ? rawMsg[0]
        : typeof rawMsg === "string"
          ? rawMsg
          : null;
      setInviteError(parsedMsg || t("invite_error_fallback"));
    }
  };

  const handleCopyLink = () => {
    const inviteLink = `${window.location.origin}/room/join?code=${room.code}`;
    navigator.clipboard.writeText(inviteLink).then(() => {
      setToastMessage(t("toast_copied_link"));
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    });
  };

  const handleLeaveRoom = async () => {
    try {
      await leaveRoom({
        roomId: room._id,
        newOwnerId: selectedNewOwner || undefined,
      }).unwrap();
      router.push("../dashboard");
    } catch (err: any) {
      toast.error(
        err?.data?.message || err?.message || t("leave_error_fallback"),
      );
    }
  };

  const handleDisbandRoom = async () => {
    try {
      await disbandRoom(room._id).unwrap();
      setShowDisbandConfirm(false);
      router.push("../dashboard");
    } catch (err: any) {
      toast.error(
        err?.data?.message || err?.message || t("disband_error", { defaultValue: "Không thể giải tán phòng" }),
      );
    }
  };

  // Tìm role trong roomMembers (từ API) trước, fallback sang room.members (từ response phòng)
  const rawUserRole = (
    roomMembers.find(
      (m: any) => m.userId === userId || (m.supabaseId && m.supabaseId === userId),
    )
    ?? room.members?.find(
      (m: any) => m.userId === userId || (m.supabaseId && m.supabaseId === userId),
    )
  )?.role as string | undefined;

  const currentUserRole = rawUserRole
    ? ["owner", "teacher", "leader"].includes(rawUserRole.toLowerCase())
      ? "owner"
      : ["vice", "vice_leader", "assistant", "admin"].includes(rawUserRole.toLowerCase())
        ? "admin"
        : "member"
    : "member";
  const isOwner = room.ownerId === userId || currentUserRole === "owner";


  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;
    setError(null);

    try {
      await addChannel({
        roomId: room._id,
        name: newChannelName.trim(),
      }).unwrap();
      setNewChannelName("");
      setShowAddChannelModal(false);
    } catch (err: any) {
      setError(err?.message || "Không thể tạo kênh. Vui lòng thử lại.");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading) {
      handleCreateChannel();
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(room.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <aside className="w-64 h-full bg-[#f5f5f5] flex flex-col border-r border-slate-200 select-none relative">
      {/* Room Header */}
      <div className="px-4 h-14 flex items-center justify-between border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <button
            onClick={() => router.push("../dashboard")}
            className="w-7 h-7 rounded-md hover:bg-slate-200 flex items-center justify-center transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-slate-900 truncate">
              {room.name}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Dropdown Menu Toggle */}
          <div className="relative" ref={roomMenuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="w-7 h-7 rounded-md hover:bg-slate-200 flex items-center justify-center transition-colors text-slate-500 hover:text-slate-800"
              title={t("room_options", { defaultValue: "Tùy chọn phòng" })}
            >
              <Plus className="w-4 h-4" />
            </button>

            {showMenu && (
              <>
                <div className="absolute right-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-xl py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-100">
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      setShowInviteModal(true);
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-slate-500" />
                    {t("add_member")}
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      handleCopyLink();
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <LinkIcon className="w-3.5 h-3.5 text-slate-500" />
                    {t("copy_link")}
                  </button>
                  {(isOwner || currentUserRole === "admin") && (
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setShowRenameModal(true);
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                      {t("rename_room")}
                    </button>
                  )}
                  <div className="border-t border-slate-100 my-1" />
                  {!isOwner && (
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setShowReportModal(true);
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <Flag className="w-3.5 h-3.5 text-slate-500" />
                      {t("report_room")}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      setShowLeaveConfirm(true);
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    {t("leave_room")}
                  </button>
                  {isOwner && (
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setShowDisbandConfirm(true);
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {t("dissolve_room")}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-md hover:bg-slate-200 text-slate-500"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* NHIỆM VỤ */}
      <div className="px-2 pt-3 pb-1 border-b border-slate-200">
        <button
          onClick={() => {
            setActiveChannel("__assignments__");
            if (onClose) onClose();
          }}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-semibold transition-colors ${
            activeChannel === "__assignments__"
              ? "bg-white text-brand-600 shadow-sm border border-slate-200/60"
              : "text-slate-700 hover:bg-slate-200/50"
          }`}
        >
          <span>{t("assignments")}</span>
        </button>
      </div>

      {/* Channels Section */}
      <div className="flex-1 overflow-y-auto py-3">
        <div className="w-full flex items-center justify-between px-4 py-1 text-xs font-semibold text-slate-500 tracking-wide">
          <button
            onClick={() => setChannelsExpanded(!channelsExpanded)}
            className="flex items-center gap-1 hover:text-slate-800 transition-colors"
          >
            {channelsExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            {t("channels")}
          </button>

          {isOwner && (
            <button
              onClick={() => setShowAddChannelModal(true)}
              className="p-1 rounded hover:bg-slate-200 text-slate-500 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {channelsExpanded && (
          <div className="mt-1 px-2 space-y-0.5">
            {room.channels.map((channel, index) => {
              const isActive = channel.name === activeChannel;
              const isDefaultChannel =
                index === 0 || channel.name === "General";
              // Phó nhóm cấp phòng (currentUserRole === "admin") có quyền quản lý mọi kênh
              // Phó nhóm cấp kênh (channel.members role === "admin") có quyền quản lý kênh đó
              const canManageThisChannel =
                isOwner ||
                currentUserRole === "admin" ||
                channel.members?.some(
                  (m: any) => m.userId === userId && m.role === "admin",
                );
              // isChannelMember: user có trong members[] của Private channel không
              // (Owner không cần check vì có quyền ngầm định)
              const isChannelMember = channel.isPrivate
                ? (channel.members?.some((m: any) => m.userId === userId) ??
                  false)
                : false;

              // Hiển thị 3-dot menu cho kênh:
              // - Trưởng nhóm hoặc Phó nhóm có toàn quyền quản lý/đổi tên trên bất kỳ kênh nào.
              // - Đối với thành viên thường, chỉ hiện 3-dot ở kênh riêng tư (không phải mặc định) để họ rời kênh.
              const showThreeDots =
                canManageThisChannel ||
                (channel.isPrivate && !isDefaultChannel && isChannelMember);


              return (
                <div
                  key={channel._id || channel.name}
                  className={`group relative flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${isActive
                    ? "bg-white text-slate-900 font-semibold shadow-sm border border-slate-200/60"
                    : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900"
                    }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActiveChannel(channel.name);
                      if (onClose) onClose();
                    }}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left"
                  >
                    {channel.isPrivate ? (
                      <Lock className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                    ) : (
                      <Hash className="w-4 h-4 shrink-0 opacity-50" />
                    )}
                    <span className="truncate">{channel.name}</span>
                  </button>

                  {showThreeDots && (
                    <div className="relative" ref={openChannelMenuId === (channel._id || channel.name) ? channelMenuRef : null}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const chId = channel._id || channel.name;
                          setOpenChannelMenuId(
                            openChannelMenuId === chId ? null : chId,
                          );
                        }}
                        title={t("channel_options", { defaultValue: "Tùy chọn kênh" })}
                        className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 opacity-70 group-hover:opacity-100 transition-opacity ml-1 shrink-0"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {openChannelMenuId === (channel._id || channel.name) && (
                        <>
                          <div className="absolute right-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-xl py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-100">
                            {channel.isPrivate && canManageThisChannel && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenChannelMenuId(null);
                                  setChannelToManage(channel);
                                }}
                                className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                              >
                                <UserPlus className="w-3.5 h-3.5 text-slate-500" />
                                <span>{t("add_member_to_channel")}</span>
                              </button>
                            )}

                            {canManageThisChannel && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenChannelMenuId(null);
                                  setChannelToRename(channel);
                                }}
                                className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                                <span>{t("rename_channel_title", { defaultValue: "Đổi tên kênh" })}</span>
                              </button>
                            )}

                            {/* Nút Rời khỏi kênh: chỉ hiện với Private channel, không phải Owner, user là member */}
                            {channel.isPrivate &&
                              !isOwner &&
                              !isDefaultChannel &&
                              isChannelMember && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenChannelMenuId(null);
                                    setChannelToLeave(channel);
                                  }}
                                  className="w-full text-left px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2"
                                >
                                  <LogOut className="w-3.5 h-3.5 text-red-500" />
                                  <span>{t("leave_channel")}</span>
                                </button>
                              )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Room Code Section ở đáy Sidebar */}
      <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex flex-col gap-2">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          {tDashboard("room_code_label")}
        </span>
        <div className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg p-2 shadow-sm">
          <span className="font-mono text-sm font-bold text-slate-700 tracking-wider">
            <span className="text-slate-300 mr-0.5">#</span>
            {room.code}
          </span>
          <button
            onClick={handleCopyCode}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all duration-200 ${copied
              ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
              : "bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100 hover:text-slate-700"
              }`}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>{tDashboard("copied")}</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>{tDashboard("copy_code")}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Add Channel Modal */}
      {showAddChannelModal && (
        <CreateChannelModal
          isOpen={showAddChannelModal}
          onClose={() => setShowAddChannelModal(false)}
          roomId={room._id}
          roomMembers={roomMembers || []}
          currentUserId={userId}
        />
      )}

      {/* Manage Private Channel Members Modal */}
      {channelToManage && (
        <AddPrivateChannelMemberModal
          isOpen={!!channelToManage}
          onClose={() => setChannelToManage(null)}
          roomId={room._id}
          channel={channelToManage}
          roomMembers={roomMembers || []}
          roomOwnerId={room.ownerId}
        />
      )}

      {/* Rename Channel Modal */}
      {channelToRename && (
        <RenameChannelModal
          isOpen={!!channelToRename}
          onClose={() => setChannelToRename(null)}
          roomId={room._id}
          channel={channelToRename}
        />
      )}


      {/* Modal Thêm thành viên */}
      {showInviteModal &&
        isMounted &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowInviteModal(false)}
            />

            {/* Dialog */}
            <div className="relative bg-white rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.15)] w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-2">
                <h2 className="text-lg font-bold text-slate-900">
                  {t("add_member_to_room")}
                </h2>
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 pt-4 pb-6 flex flex-col gap-4">
                {/* Tìm & Thêm Thành Viên */}
                <div className="flex flex-col gap-1.5 relative">
                  <label className="text-xs font-bold text-slate-700">
                    {t("search_member")}
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={
                          selectedUser
                            ? `${selectedUser.displayName} (${selectedUser.email || "Facebook"})`
                            : searchQuery
                        }
                        onChange={(e) => {
                          if (selectedUser) {
                            setSelectedUser(null);
                          }
                          setSearchQuery(e.target.value);
                          setInviteError(null);
                          setInviteSuccess(null);
                        }}
                        placeholder={t("search_member_placeholder")}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all pr-8"
                      />
                      {(searchQuery || selectedUser) && (
                        <button
                          onClick={() => {
                            setSearchQuery("");
                            setSelectedUser(null);
                            setInviteError(null);
                            setInviteSuccess(null);
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-4.5 h-4.5" />
                        </button>
                      )}
                    </div>
                    <button
                      onClick={handleInviteUser}
                      disabled={
                        isInviting ||
                        isSelectedUserInRoom ||
                        (!selectedUser && !searchQuery.trim())
                      }
                      className={`px-5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 shrink-0 ${isSelectedUserInRoom
                          ? "bg-slate-400 text-white cursor-not-allowed opacity-80"
                          : "bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white"
                        }`}
                    >
                      {isInviting && (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      )}
                      <span>
                        {isSelectedUserInRoom
                          ? t("already_member", { defaultValue: "Đã là thành viên" })
                          : t("add_action", { defaultValue: "Thêm" })}
                      </span>
                    </button>
                  </div>

                  {/* Dropdown Gợi ý tìm kiếm */}
                  {searchQuery.trim().length >= 1 && !selectedUser && (
                    <div className="w-full mt-2 bg-slate-50 border border-slate-200 rounded-xl py-1.5 max-h-56 overflow-y-auto custom-scrollbar shadow-sm">
                      {isSearching ? (
                        <div className="px-4 py-3 text-xs text-slate-400 flex items-center gap-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-500" />
                          <span>{t("searching")}</span>
                        </div>
                      ) : searchResults.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-slate-400 font-medium">
                          {t("no_member_found")}
                        </div>
                      ) : (
                        <>
                          {searchResults.map((user: any) => {
                            const userAlreadyInRoom = isUserInRoom(user);
                            return (
                              <button
                                key={user.supabaseId || user._id}
                                onClick={() => {
                                  setSelectedUser(user);
                                  setSearchQuery("");
                                }}
                                className="w-full flex items-center justify-between gap-2.5 px-3 py-2 hover:bg-slate-100 text-left transition-colors"
                              >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <UserAvatar
                                    avatarUrl={user.avatarUrl}
                                    displayName={user.displayName}
                                    size="w-7 h-7"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-slate-800 truncate">
                                      {user.displayName}
                                    </p>
                                    <p className="text-[10px] text-slate-400 truncate">
                                      {user.email || t("registered_via_facebook")}
                                    </p>
                                  </div>
                                </div>

                                {userAlreadyInRoom && (
                                  <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-md shrink-0">
                                    {t("already_member", { defaultValue: "Đã là thành viên" })}
                                  </span>
                                )}
                              </button>
                            );
                          })}

                          {hasNextPage && (
                            <div className="p-1.5 border-t border-slate-200/60">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  loadMoreUsers();
                                }}
                                disabled={isLoadingMore}
                                className="w-full py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50 rounded-lg flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                              >
                                {isLoadingMore ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span>
                                      {t("loading_more", {
                                        defaultValue: "Đang tải thêm...",
                                      })}
                                    </span>
                                  </>
                                ) : (
                                  <span>
                                    {t("load_more", {
                                      defaultValue: "Tải thêm",
                                    })}
                                  </span>
                                )}
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Phản hồi kết quả */}
                  {inviteError && (
                    <div className="flex items-center gap-1.5 mt-1 text-red-600 text-xs">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{inviteError}</span>
                    </div>
                  )}
                  {inviteSuccess && (
                    <div className="flex items-center gap-1.5 mt-1 text-emerald-600 text-xs font-semibold">
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>{inviteSuccess}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Modal Xác nhận rời phòng */}
      {showLeaveConfirm &&
        isMounted &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => !isLeaving && setShowLeaveConfirm(false)}
            />

            {/* Dialog */}
            <div className="relative bg-white rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.15)] w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-2">
                <h2 className="text-lg font-bold text-slate-900">
                  {isOwner ? t("owner_leave_title") : t("confirm_leave_title")}
                </h2>
                {!isLeaving && (
                  <button
                    onClick={() => {
                      setShowLeaveConfirm(false);
                      setSelectedNewOwner(null);
                    }}
                    className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
                  >
                    <X className="w-4 h-4 text-slate-500" />
                  </button>
                )}
              </div>

              {/* Body */}
              <div className="px-6 py-4">
                {isOwner ? (
                  otherMembers.length === 0 ? (
                    <p className="text-sm text-slate-600">
                      {t.rich("owner_leave_no_members_desc", {
                        name: room.name,
                        strong1: (chunks) => <strong>{chunks}</strong>,
                        strong2: (chunks) => <strong>{chunks}</strong>,
                      })}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-600">
                        {t.rich("owner_leave_has_members_desc", {
                          name: room.name,
                          strong1: (chunks) => <strong>{chunks}</strong>,
                          strong2: (chunks) => <strong>{chunks}</strong>,
                        })}
                      </p>

                      <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl p-2 space-y-1 bg-slate-50">
                        {otherMembers.map((m: any) => (
                          <button
                            key={m.userId}
                            type="button"
                            onClick={() => setSelectedNewOwner(m.userId)}
                            className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left transition-colors border ${selectedNewOwner === m.userId
                              ? "bg-brand-50 border-brand-300 text-brand-900"
                              : "bg-white border-transparent hover:bg-slate-100 text-slate-700"
                              }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-600 font-bold flex items-center justify-center text-xs uppercase shrink-0">
                                {m.displayName?.substring(0, 2) ||
                                  m.email?.substring(0, 2) ||
                                  "U"}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold truncate">
                                  {m.displayName ||
                                    m.email ||
                                    t("anonymous_user")}
                                </p>
                                <p className="text-[10px] text-slate-400 truncate">
                                  {m.email || t("no_email")}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center justify-center w-4 h-4 rounded-full border border-slate-300 bg-white shrink-0">
                              {selectedNewOwner === m.userId && (
                                <div className="w-2.5 h-2.5 rounded-full bg-brand-600" />
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                ) : (
                  <p className="text-sm text-slate-600">
                    {t.rich("confirm_leave_desc", {
                      name: room.name,
                      strong2: (chunks) => <strong>{chunks}</strong>,
                    })}
                  </p>
                )}
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 px-6 pb-6 pt-2">
                <button
                  onClick={() => {
                    setShowLeaveConfirm(false);
                    setSelectedNewOwner(null);
                  }}
                  disabled={isLeaving}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  {t("cancel")}
                </button>

                {isOwner ? (
                  otherMembers.length === 0 ? (
                    <button
                      onClick={handleLeaveRoom}
                      disabled={isLeaving}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-all disabled:opacity-50"
                    >
                      {isLeaving && (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      )}
                      {t("dissolve_room")}
                    </button>
                  ) : (
                    <button
                      onClick={handleLeaveRoom}
                      disabled={isLeaving || !selectedNewOwner}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-all disabled:opacity-50"
                    >
                      {isLeaving && (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      )}
                      {t("transfer_and_leave")}
                    </button>
                  )
                ) : (
                  <button
                    onClick={handleLeaveRoom}
                    disabled={isLeaving}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-all disabled:opacity-50"
                  >
                    {isLeaving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {t("confirm_leave_action")}
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Modal Xác nhận Giải tán phòng */}
      {showDisbandConfirm &&
        isMounted &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowDisbandConfirm(false)}
            />

            {/* Dialog */}
            <div className="relative bg-white rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.15)] w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-2">
                <h2 className="text-lg font-bold text-slate-900">
                  {t("disband_confirm_title")}
                </h2>
                <button
                  onClick={() => setShowDisbandConfirm(false)}
                  className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-4">
                <p className="text-sm text-slate-600">
                  {t("disband_confirm_desc")}
                </p>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 px-6 pb-6 pt-2">
                <button
                  onClick={() => setShowDisbandConfirm(false)}
                  disabled={isDisbanding}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  {t("cancel")}
                </button>
                <button
                  onClick={handleDisbandRoom}
                  disabled={isDisbanding}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-all disabled:opacity-50"
                >
                  {isDisbanding && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t("dissolve_room")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Modal Đổi tên phòng */}
      {showRenameModal &&
        isMounted &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowRenameModal(false)}
            />

            {/* Dialog */}
            <div className="relative bg-white rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.15)] w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-2">
                <h2 className="text-lg font-bold text-slate-900">
                  {t("rename_room_title")}
                </h2>
                <button
                  onClick={() => setShowRenameModal(false)}
                  className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-4 flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    {t("room_name_label")}
                  </label>
                  <input
                    type="text"
                    value={renamingName}
                    onChange={(e) => setRenamingName(e.target.value)}
                    placeholder={t("room_name_label")}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all text-slate-900"
                    maxLength={50}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 px-6 pb-6 pt-2">
                <button
                  onClick={() => {
                    setRenamingName(room.name || "");
                    setShowRenameModal(false);
                  }}
                  disabled={isRenaming}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  {t("cancel")}
                </button>
                <button
                  onClick={async () => {
                    if (!renamingName.trim()) {
                      toast.error(t("room_name_empty_error", { defaultValue: "Tên phòng không được để trống" }));
                      return;
                    }
                    try {
                      await renameRoom({
                        roomId: room._id,
                        name: renamingName.trim(),
                      }).unwrap();
                      toast.success(t("rename_room_success"));
                      setShowRenameModal(false);
                    } catch (err: any) {
                      toast.error(
                        err?.data?.message ||
                        err?.message ||
                        t("rename_room_error")
                      );
                    }
                  }}
                  disabled={isRenaming || !renamingName.trim() || renamingName.trim() === room.name}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-all disabled:opacity-50"
                >
                  {isRenaming && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t("confirm")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Toast Notification */}
      {showToast &&
        isMounted &&
        createPortal(
          <div className="fixed bottom-5 right-5 z-100 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{toastMessage}</span>
          </div>,
          document.body,
        )}

      {/* Modal Báo cáo phòng */}
      {showReportModal && isMounted && (
        <ReportRoomModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          roomId={room._id}
          roomName={room.name}
          isSubmitting={isReporting}
          onSubmitReport={async (reportData) => {
            try {
              setIsReporting(true);
              await axios.post("/reports/room", {
                roomId: room._id,
                reason: reportData.reason,
                description: reportData.description,
                attachments: reportData.attachments,
              });
              toast.success(
                t("report_room_success", {
                  defaultValue: "Đã gửi báo cáo thành công.",
                }),
              );
              setShowReportModal(false);
            } catch (err: unknown) {
              const errorObj = err as {
                response?: { data?: { message?: string } };
                message?: string;
              };
              const msg =
                errorObj?.response?.data?.message ||
                errorObj?.message ||
                t("report_room_error_failed", {
                  defaultValue: "Không thể gửi báo cáo phòng",
                });
              toast.error(msg);
              throw err;
            } finally {
              setIsReporting(false);
            }
          }}
        />
      )}


      {/* Modal Xác nhận Rời khỏi Kênh */}
      {channelToLeave &&
        isMounted &&
        createPortal(
          <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 flex flex-col gap-5 animate-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3.5 text-red-600">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                  <LogOut className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {t("leave_channel_confirm_title")} #{channelToLeave.name}?
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t("leave_channel_confirm_subtitle")}
                  </p>
                </div>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed">
                {t.rich("leave_channel_confirm_desc", {
                  name: channelToLeave.name,
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={isLeavingChannel}
                  onClick={() => setChannelToLeave(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  {t("leave_channel_cancel")}
                </button>
                <button
                  type="button"
                  disabled={isLeavingChannel}
                  onClick={async () => {
                    try {
                      await leaveChannelMutation({
                        roomId: room._id,
                        channelId: channelToLeave._id || channelToLeave.name,
                      }).unwrap();
                      toast.success(`${t("toast_leave_channel_success")}`);
                      setChannelToLeave(null);
                    } catch (err: any) {
                      toast.error(
                        err?.data?.message ||
                        err?.message ||
                        t("leave_channel_error"),
                      );
                    }
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 active:scale-95 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isLeavingChannel ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{t("leave_channel_loading")}</span>
                    </>
                  ) : (
                    <span>{t("leave_channel_action")}</span>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </aside>
  );
}

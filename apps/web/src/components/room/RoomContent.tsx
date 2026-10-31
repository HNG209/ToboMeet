"use client";

import { useEffect, useState, useCallback } from "react";
import {
  useGetRoomByIdQuery,
  useGetMyRoomsQuery,
  useGetRoomMembersQuery,
  useRemoveMemberMutation,
} from "@/lib/redux/api/roomsApi";
import Sidebar from "./Sidebar";
import { Loader2, Menu, X, Info, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSocket } from "@/hooks/useSocket";
import { toast } from "sonner";
import { useDispatch } from "react-redux";
import { AppDispatch } from "@/lib/redux/store";
import ReportUserModal from "./ReportUserModal";
import TransferOwnershipModal from "./TransferOwnershipModal";
import { useRoomUpdateListener } from "@/hooks/socket/useRoomUpdateListener";
import {
  meetingsApi,
  useGetActiveMeetingQuery,
} from "@/lib/redux/api/meetingsApi";
import NewsFeed from "./NewsFeed";
import ChannelFilesTab from "./ChannelFilesTab";
import ChannelSessionsTab from "./ChannelSessionsTab";
import RoomRightSidebar from "./RoomRightSidebar";
import ChannelMeetingModal from "../calendar/ChannelMeetingModal";
import ChannelMeetingButton from "./ChannelMeetingButton";
import AssignmentModule from "@/components/assignments/AssignmentModule";
import CreateTaskDropdown from "@/components/assignments/CreateTaskDropdown";

interface RoomContentProps {
  roomId: string;
  userId: string;
}

export default function RoomContent({ roomId, userId }: RoomContentProps) {
  const socket = useSocket();
  const t = useTranslations("room");
  const dispatch = useDispatch<AppDispatch>();

  const {
    data: fetchedRoom,
    isLoading: roomLoading,
    error: roomError,
  } = useGetRoomByIdQuery(roomId);
  const { data: myRooms } = useGetMyRoomsQuery();
  const room = fetchedRoom || myRooms?.find((r) => r._id === roomId);
  const { data: membersResponse, isLoading: membersLoading } =
    useGetRoomMembersQuery(roomId, { refetchOnMountOrArgChange: true });
  const members = membersResponse || [];

  const [removeMember] = useRemoveMemberMutation();

  // Trạng thái Layout, Tìm kiếm & Quản lý Phân quyền
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false);
  const [activeChannel, setActiveChannel] = useState<string>("General"); // Quản lý kênh đang chọn
  const [activeTab, setActiveTab] = useState<"feed" | "files" | "sessions">("feed");
  const [assignmentView, setAssignmentView] = useState("list");
  const [showChannelMeetingModal, setShowChannelMeetingModal] = useState(false);
  const [memberToReport, setMemberToReport] = useState<{
    userId: string;
    displayName: string;
  } | null>(null);
  const [memberToTransfer, setMemberToTransfer] = useState<{
    userId: string;
    displayName: string;
  } | null>(null);

  // useCallback để ổn định reference, tránh useRoomUpdateListener re-run liên tục
  const handleUserLeftChannel = useCallback(
    (leftChannelId: string) => {
      // Khi user vừa rời kênh, nếu đang ở kênh đó thì switch về General / kênh đầu tiên
      const leftChannelObj = room?.channels?.find((c: any) => (c._id || c.id) === leftChannelId);
      if (leftChannelObj && leftChannelObj.name === activeChannel) {
        const firstChannel = room?.channels?.find((c: any) => (c._id || c.id) !== leftChannelId);
        setActiveChannel(firstChannel?.name || "General");
      }
    },
    [room?.channels, activeChannel]
  );

  useRoomUpdateListener(roomId, userId, {
    onUserLeftChannel: handleUserLeftChannel,
  });

  // Tìm thông tin chi tiết của kênh đang được active
  const currentChannel = room?.channels.find(
    (c) => c.name === activeChannel,
  );
  const currentChannelId = currentChannel?._id?.toString() || "";
  const isCurrentUserOwner = room?.ownerId === userId;
  // Tìm kiếm vai trò người dùng trong room members
  const currentUserRoomRole = (() => {
    // Tìm trong useGetRoomMembersQuery cache (đã chuẩn hóa)
    const normalizedMember = members?.find(
      (m: any) =>
        m.userId === userId || (m.supabaseId && m.supabaseId === userId),
    );
    if (normalizedMember) return normalizedMember.role;

    // Tìm trong room.members raw từ DB
    const rawMember = room?.members?.find(
      (m: any) =>
        m.userId === userId || (m.supabaseId && m.supabaseId === userId),
    );
    return rawMember?.role;
  })();

  const [targetAssignmentId, setTargetAssignmentId] = useState<string | null>(null);

  // Đọc tham số URL "channel" và "assignmentId" khi tải trang
  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const urlChannel = searchParams.get("channel");
      const urlAssignmentId = searchParams.get("assignmentId");
      if (urlChannel === "__assignments__") {
        setActiveChannel("__assignments__");
        if (urlAssignmentId) {
          setTargetAssignmentId(urlAssignmentId);
        }
      } else if (urlChannel && room?.channels) {
        const matchingChan = room.channels.find(
          (c: any) => c.name === urlChannel || (c._id && c._id === urlChannel)
        );
        if (matchingChan) {
          setActiveChannel(matchingChan.name);
        }
      }
    }
  }, [room?.channels]);

  // Lắng nghe sự kiện chuyển trang nhiệm vụ từ PostCard
  useEffect(() => {
    const handleNavigateToAssignment = (e: any) => {
      const assignId = e.detail?.assignmentId;
      setActiveChannel("__assignments__");
      if (assignId) {
        setTargetAssignmentId(assignId);
      }
    };
    window.addEventListener("navigate-to-assignment", handleNavigateToAssignment);
    return () => {
      window.removeEventListener("navigate-to-assignment", handleNavigateToAssignment);
    };
  }, []);

  // Navigation Guard: Nếu kênh hiện tại không còn thuộc room.channels (do bị xóa hoặc vừa rời), tự động switch về kênh đầu tiên
  useEffect(() => {
    if (activeChannel === "__assignments__") return;
    if (room?.channels && room.channels.length > 0) {
      const channelExists = room.channels.some((c: any) => c.name === activeChannel);
      if (!channelExists) {
        setActiveChannel(room.channels[0].name || "General");
      }
    }
  }, [room?.channels, activeChannel]);

  const isCurrentUserRoomOwner =
    !!(isCurrentUserOwner ||
      (currentUserRoomRole && ["owner", "teacher", "leader"].includes(currentUserRoomRole.toLowerCase())));

  const currentUserChannelRole = currentChannel?.members?.find(
    (m: any) => m.userId === userId,
  )?.role;

  // Xác định Phó nhóm được phép xóa thành viên khỏi phòng:
  // 1. Phó nhóm cấp phòng (role "admin" ở cấp room)
  // 2. Phó nhóm cấp kênh tại KÊNH CÔNG KHAI (không phải isPrivate)
  const isCurrentUserRoomAdmin =
    !!(!isCurrentUserRoomOwner &&
      ((currentUserRoomRole && ["admin", "vice", "vice_leader", "assistant"].includes(currentUserRoomRole.toLowerCase())) ||
        (currentChannel?.isPrivate !== true &&
          currentUserChannelRole && ["admin", "vice", "vice_leader", "assistant"].includes(currentUserChannelRole.toLowerCase()))));

  const canUserManageChannel =
    !!(isCurrentUserRoomOwner ||
      isCurrentUserRoomAdmin ||
      (currentUserChannelRole && ["admin", "vice", "vice_leader", "assistant"].includes(currentUserChannelRole.toLowerCase())));

  const { data: activeMeeting } = useGetActiveMeetingQuery(
    { roomId, channelId: currentChannel?._id || "" },
    { skip: !currentChannel?._id },
  );

  // Navigation Guard: Nếu kênh hiện tại không nằm trong danh sách được phép truy cập (VD: bị xóa khỏi Kênh riêng tư)
  useEffect(() => {
    if (activeChannel === "__assignments__") return;
    if (room?.channels && room.channels.length > 0) {
      const channelExists = room.channels.some(
        (c: any) => c.name === activeChannel,
      );
      if (!channelExists) {
        const fallbackChannel = room.channels[0]?.name || "General";
        setActiveChannel(fallbackChannel);
      }
    }
  }, [room?.channels, activeChannel]);

  // Join/Leave channel và lắng nghe sự kiện thay đổi trạng thái cuộc họp
  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }

    const channelId = currentChannel?._id;
    if (!channelId) return;

    const joinChannel = () => {
      socket.emit("join_channel", channelId);
    };

    if (socket.connected) joinChannel();
    socket.on("connect", joinChannel); // Fix lỗi mất trạng thái khi Server Restart

    const handleStatusChanged = (data: any) => {
      dispatch(
        meetingsApi.util.updateQueryData(
          "getActiveMeeting",
          { roomId, channelId },
          (draft) => {
            draft.isOngoing = data.isOngoing;
            draft.meetingCode = data.meetingCode;
          },
        ),
      );

      // Đồng bộ lại trạng thái bằng cách cập nhật cache rtk khi phiên họp kết thúc
      if (!data.isOngoing) {
        const targetMeetingCode = data.meetingCode;
        if (targetMeetingCode) {
          dispatch(
            meetingsApi.util.updateQueryData(
              "getMeetingSessions",
              { meetingCode: targetMeetingCode, cursor: undefined, limit: 50 },
              (draft) => {
                if (draft?.items) {
                  draft.items.forEach((item) => {
                    if (item.status === "ongoing") {
                      item.status = "ended";
                      item.endedAt = new Date().toISOString();
                    }
                  });
                }
              },
            ),
          );
          dispatch(
            meetingsApi.util.invalidateTags([
              { type: "MeetingSessions", id: targetMeetingCode },
              { type: "MeetingSessions" },
            ]),
          );
        } else {
          dispatch(
            meetingsApi.util.invalidateTags([{ type: "MeetingSessions" }]),
          );
        }
      }
    };

    socket.on("meeting_status_changed", handleStatusChanged);

    return () => {
      socket.emit("leave_channel", channelId);
      socket.off("connect", joinChannel);
      socket.off("meeting_status_changed", handleStatusChanged);
    };
  }, [currentChannel?._id, dispatch]); // Chạy lại mỗi khi đổi kênh

  const [memberToRemove, setMemberToRemove] = useState<{
    userId: string;
    displayName: string;
  } | null>(null);
  const [isRemovingMember, setIsRemovingMember] = useState(false);

  const handleRemoveMember = async () => {
    if (!memberToRemove) return;
    try {
      setIsRemovingMember(true);
      await removeMember({ roomId, userId: memberToRemove.userId }).unwrap();
      toast.success(t("remove_member_success"));
      setMemberToRemove(null);
    } catch (err: any) {
      toast.error(
        err?.data?.message || err?.message || t("remove_member_error"),
      );
    } finally {
      setIsRemovingMember(false);
    }
  };

  if (roomLoading && !room) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (roomError) {
    const errData = roomError as any;
    const isLocked =
      errData.message?.includes("khóa") || errData.message?.includes("locked");
    if (errData.status === 403 && !isLocked) {
      const msg =
        errData.data?.message ||
        errData.message ||
        t("not_a_member_anymore", {
          defaultValue: "Bạn không còn là thành viên của phòng này",
        });
      return (
        <div className="h-screen flex flex-col items-center justify-center bg-white gap-3">
          <p className="text-slate-600 font-bold text-base">{msg}</p>
          <button
            onClick={() => (window.location.href = "/dashboard")}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            {t("back_to_dashboard", { defaultValue: "Quay lại Dashboard" })}
          </button>
        </div>
      );
    }
    if (isLocked) {
      return (
        <div className="h-screen flex items-center justify-center bg-white">
          <Loader2 className="w-10 h-10 text-brand-500 animate-spin" />
        </div>
      );
    }
  }

  if (roomError || !room) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <p className="text-slate-500 text-sm">{t("room_not_found")}</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex bg-white font-sans overflow-hidden text-slate-900">
      {/* ================= LEFT SIDEBAR (KÊNH) ================= */}
      <div
        className={`
          fixed inset-y-0 left-0 z-40 shrink-0 transition-transform duration-300 ease-in-out
          ${isLeftSidebarOpen ? "translate-x-0" : "-translate-x-full"}
          lg:relative lg:translate-x-0
        `}
      >
        <Sidebar
          room={room}
          userId={userId}
          activeChannel={activeChannel}
          setActiveChannel={setActiveChannel}
          onClose={() => setIsLeftSidebarOpen(false)}
          roomMembers={members}
        />

      </div>

      {/* Lớp phủ đen cho Left Sidebar trên Mobile & Tablet (sm & md) */}
      {isLeftSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setIsLeftSidebarOpen(false)}
        />
      )}

      {/* ================= MAIN CONTENT (BẢNG TIN / POSTS) ================= */}
      <div className="flex-1 flex flex-col h-full relative min-w-0 bg-white">
        {/* Header Kênh (Giống Teams) */}
        <header className="h-14 px-4 border-b border-slate-200 bg-white flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-4">
            <button
              className="lg:hidden p-1.5 -ml-1.5 hover:bg-slate-100 rounded-md text-slate-600"
              onClick={() => setIsLeftSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-brand-100 text-brand-600 rounded flex items-center justify-center font-bold text-sm">
                {room.name.charAt(0).toUpperCase()}
              </div>
              <h1 className="text-lg font-bold text-slate-800">
                {activeChannel === "__assignments__" ? t("assignments") : activeChannel}
              </h1>
            </div>

            {activeChannel !== "__assignments__" && (
              <div className="hidden sm:flex items-center gap-1 ml-4 text-sm font-medium">
                <button
                  onClick={() => setActiveTab("feed")}
                  className={`px-3 py-4 border-b-2 transition-colors cursor-pointer ${activeTab === "feed"
                    ? "border-brand-500 text-brand-600 font-semibold"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                    }`}
                >
                  {t("class_feed")}
                </button>
                {/* localized files tab */}
                <button
                  onClick={() => setActiveTab("files")}
                  className={`px-3 py-4 border-b-2 transition-colors cursor-pointer ${activeTab === "files"
                    ? "border-brand-500 text-brand-600 font-semibold"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                    }`}
                >
                  {t("files")}
                </button>
                {/* meeting sessions tab */}
                <button
                  onClick={() => setActiveTab("sessions")}
                  className={`px-3 py-4 border-b-2 transition-colors cursor-pointer ${activeTab === "sessions"
                    ? "border-brand-500 text-brand-600 font-semibold"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                    }`}
                >
                  {t("meeting_sessions", { defaultValue: "Phiên họp" })}
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Nút Cuộc họp / Tham gia */}
            {activeChannel !== "__assignments__" && (
              <ChannelMeetingButton
                roomId={roomId}
                channelId={currentChannelId}
                isOngoing={!!activeMeeting?.isOngoing}
                onScheduleMeeting={() => setShowChannelMeetingModal(true)}
              />
            )}

            {activeChannel === "__assignments__" &&
              (isCurrentUserOwner ||
                (currentUserRoomRole &&
                  ["owner", "admin", "teacher", "leader"].includes(currentUserRoomRole.toLowerCase()))) &&
              assignmentView === "list" && (
                <CreateTaskDropdown
                  onSelectAssignment={() =>
                    window.dispatchEvent(new CustomEvent("trigger-create-assignment"))
                  }
                  onSelectQuiz={() =>
                    window.dispatchEvent(new CustomEvent("trigger-create-quiz"))
                  }
                />
              )}

            <button
              onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
              className={`p-2 rounded-md transition-colors flex items-center gap-2 text-sm font-medium cursor-pointer ${isRightSidebarOpen
                ? "bg-brand-50 text-brand-600"
                : "hover:bg-slate-100 text-slate-600"
                }`}
            >
              <Info size={18} />
            </button>
          </div>
        </header>

        {/* News Feed / Files / Sessions / Assignment Panel */}
        {activeChannel === "__assignments__" ? (
          <AssignmentModule
            roomId={roomId}
            userId={userId}
            channels={room.channels}
            roomMembers={members}
            onViewChange={setAssignmentView}
            initialAssignmentId={targetAssignmentId}
          />
        ) : currentChannel ? (
          activeTab === "files" ? (
            <ChannelFilesTab
              key={`files-${currentChannel._id || activeChannel}`}
              roomId={roomId}
              channelId={currentChannel._id || ""}
              userId={userId}
              canManageFiles={isCurrentUserRoomOwner || isCurrentUserRoomAdmin}
            />
          ) : activeTab === "sessions" ? (
            <ChannelSessionsTab
              key={`sessions-${currentChannel._id || activeChannel}`}
              roomId={roomId}
              channelId={currentChannel._id || ""}
              channelName={activeChannel}
              userId={userId}
            />
          ) : (
            <NewsFeed
              key={`feed-${currentChannel._id || activeChannel}`}
              roomId={roomId}
              channelId={currentChannel._id || ""}
              userId={userId}
              userRole={
                (members.find((m: any) => m.userId === userId)?.role ||
                  "member") as "admin" | "owner" | "member"
              }
              channelName={activeChannel}
            />
          )
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            {t("select_channel_to_start", { defaultValue: "Chọn một kênh để bắt đầu trò chuyện" })}
          </div>
        )}
      </div>

      {/* ================= RIGHT SIDEBAR (THÔNG TIN KÊNH / THÀNH VIÊN) ================= */}
      <RoomRightSidebar
        room={room}
        members={members}
        membersLoading={membersLoading}
        userId={userId}
        currentChannel={currentChannel}
        currentChannelId={currentChannelId}
        isRightSidebarOpen={isRightSidebarOpen}
        setIsRightSidebarOpen={setIsRightSidebarOpen}
        isCurrentUserOwner={isCurrentUserOwner}
        currentUserRoomRole={currentUserRoomRole}
        isCurrentUserRoomAdmin={isCurrentUserRoomAdmin}
        canUserManageChannel={canUserManageChannel}
        onReportUser={setMemberToReport}
        onTransferOwnership={setMemberToTransfer}
        onRemoveMember={setMemberToRemove}
      />

      {/* Modal xác nhận xóa thành viên */}
      {memberToRemove && (
        <div className="fixed inset-0 z-110 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4 flex flex-col transform transition-all scale-100 duration-300">
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">
                {t("remove_member_title")}
              </h3>
              <button
                disabled={isRemovingMember}
                onClick={() => setMemberToRemove(null)}
                className="p-1.5 hover:bg-slate-100 rounded-md text-slate-500 transition-colors disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="mb-6">
              <p className="text-sm text-slate-600 leading-relaxed">
                {t.rich("remove_member_confirm", {
                  name: memberToRemove.displayName,
                  strong: (chunks: React.ReactNode) => (
                    <strong className="text-slate-900 font-bold">
                      {chunks}
                    </strong>
                  ),
                })}
              </p>
            </div>

            {/* Footer Buttons */}
            <div className="flex justify-end gap-3 shrink-0">
              <button
                disabled={isRemovingMember}
                onClick={() => setMemberToRemove(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
              >
                {t("remove_member_cancel")}
              </button>
              <button
                disabled={isRemovingMember}
                onClick={handleRemoveMember}
                className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded-xl transition-colors min-w-30"
              >
                {isRemovingMember ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {t("remove_member_loading")}
                  </>
                ) : (
                  t("remove_member_action")
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal báo cáo người dùng */}
      {memberToReport && (
        <ReportUserModal
          isOpen={!!memberToReport}
          onClose={() => setMemberToReport(null)}
          reportedUserId={memberToReport.userId}
          reportedUserName={memberToReport.displayName}
          roomId={room._id}
          roomName={room.name}
          roomCode={room.code}
        />
      )}

      {/* Modal chuyển quyền chủ phòng / Giảng viên / Trưởng nhóm */}
      {memberToTransfer && (
        <TransferOwnershipModal
          isOpen={!!memberToTransfer}
          onClose={() => setMemberToTransfer(null)}
          roomId={room._id}
          targetUserId={memberToTransfer.userId}
          targetUserName={memberToTransfer.displayName}
          roomType={room.type || "meeting"}
        />
      )}

      {/* Modal Lên lịch cuộc họp kênh dùng chung */}
      <ChannelMeetingModal
        isOpen={showChannelMeetingModal}
        onClose={() => setShowChannelMeetingModal(false)}
        initialRoom={room}
        initialChannel={currentChannel}
      />
    </div>
  );
}

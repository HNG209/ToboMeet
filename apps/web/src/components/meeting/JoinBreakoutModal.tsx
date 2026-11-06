import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Users,
  Clock,
  LogIn,
  Grid2X2,
  Loader2,
  Lock,
  UserPlus,
  Search,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { useDeviceId } from "@/hooks/useDeviceId";
import { useTranslations } from "next-intl";
import { useLocalParticipant, useParticipants } from "@livekit/components-react";

import {
  useAssignUsersToBreakoutMutation,
  useGetBreakoutCountsQuery,
} from "@/lib/redux/api/meetingsApi";
import { useMeetingSessionContext } from "./contexts/MeetingSessionContext";
import { useRoomSettings } from "@/hooks/useRoomSettings";
import { isAgentParticipant } from "@/utils/participant";

export default function JoinBreakoutModal({
  isOpen,
  onClose,
  rooms,
  meetingCode,
}: {
  isOpen: boolean;
  onClose: () => void;
  rooms: any[];
  meetingCode: string;
}) {
  const t = useTranslations("meeting.join_breakout_modal");
  const deviceId = useDeviceId();
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);

  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const { handleSwitchToBreakout } = useMeetingSessionContext();
  const { breakoutStartedAt, breakoutDuration, isHost, breakoutRoomsList } =
    useRoomSettings({
      meetingCode: meetingCode,
    });

  const [assignUsersApi] = useAssignUsersToBreakoutMutation();

  const [realTime, setRealTime] = useState(Date.now());
  const [timeOffset, setTimeOffset] = useState<number | null>(null);

  const activeRooms = rooms && rooms.length > 0 ? rooms : breakoutRoomsList;

  const { data } = useGetBreakoutCountsQuery(
    { code: meetingCode },
    {
      skip: !isOpen || !meetingCode,
      pollingInterval: 3000,
    },
  );

  const roomCounts = data?.counts || {};

  // Khi nhận được giờ từ Server, tính toán Độ lệch (Offset)
  useEffect(() => {
    if (data?.serverTime && timeOffset === null) {
      setTimeOffset(data.serverTime - Date.now());
    }
  }, [data?.serverTime, timeOffset]);

  // Chạy đếm ngược mượt mà mỗi 1 giây ở Local (áp dụng độ lệch)
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setRealTime(Date.now() + (timeOffset ?? 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, timeOffset]);

  // Reset expanded state khi đóng modal
  useEffect(() => {
    if (!isOpen) {
      setExpandedRoomId(null);
      setSearchQuery("");
      setAssigningUserId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const myIdentity = localParticipant?.identity;

  // Tính toán thời gian chung cho phiên Breakout (tất cả các phòng dùng chung thời gian)
  const durationMinutes =
    activeRooms?.[0]?.durationMinutes || breakoutDuration || 0;
  const startedAt = breakoutStartedAt || 0;

  let isExpired = false;
  let timeDisplay: string | null = null;

  if (durationMinutes > 0 && startedAt > 0) {
    if (timeOffset === null && !data?.serverTime) {
      timeDisplay = "--:--";
    } else {
      const endTime = startedAt + durationMinutes * 60 * 1000;
      const remainingMs = endTime - realTime;

      if (remainingMs <= 0) {
        isExpired = true;
        timeDisplay = t("time_expired");
      } else {
        const totalSeconds = Math.floor(remainingMs / 1000);
        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        timeDisplay = `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
      }
    }
  }

  const handleJoin = async (breakoutRoomId: string) => {
    if (!deviceId) {
      toast.error(t("device_not_found"));
      return;
    }

    try {
      setJoiningRoomId(breakoutRoomId);
      await handleSwitchToBreakout(breakoutRoomId);
      onClose();
    } catch (error) {
      toast.error(t("join_error"));
      console.error(error);
    } finally {
      setJoiningRoomId(null);
    }
  };

  const handleAddUser = async (roomId: string, userId: string) => {
    try {
      setAssigningUserId(userId);
      await assignUsersApi({
        code: meetingCode,
        breakoutRoomId: roomId,
        userIds: [userId],
      }).unwrap();
      toast.success(t("add_user_success"));
    } catch (error) {
      console.error("Lỗi khi thêm người dùng vào phòng:", error);
      toast.error(t("add_user_error"));
    } finally {
      setAssigningUserId(null);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md animate-fade-in transition-opacity"
        onClick={onClose}
      />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[10000] w-[94vw] max-w-lg bg-[#161619] border border-[#232328] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 backdrop-blur-xl">
        {/* HEADER */}
        <div className="px-5 py-4 border-b border-[#232328] flex items-center justify-between bg-[#111113]">
          <div className="flex items-center gap-2.5">
            <Grid2X2 size={20} className="text-blue-500 shrink-0" />
            <div>
              <h2 className="text-[15px] font-bold text-white tracking-wide">
                {t("modal_title")}
              </h2>
              {activeRooms && activeRooms.length > 0 && (
                <p className="text-[11px] text-slate-400 font-medium">
                  {t("rooms_count", { count: activeRooms.length })}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* THỜI GIAN ĐẾM NGƯỢC DUY NHẤT Ở HEADER */}
            {durationMinutes > 0 && timeDisplay && (
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${isExpired
                    ? "bg-red-500/10 border-red-500/30 text-red-400"
                    : "bg-blue-500/10 border-blue-500/30 text-blue-300"
                  }`}
                title={t("time_remaining")}
              >
                <Clock
                  size={13}
                  className={
                    isExpired ? "text-red-400" : "text-blue-400 animate-pulse"
                  }
                />
                <span className="font-mono tracking-wider">{timeDisplay}</span>
              </div>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-[#232328] rounded-lg transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* BODY */}
        <div className="p-4 sm:p-5 overflow-y-auto max-h-[60vh] space-y-2.5 custom-scrollbar bg-[#111113]">
          {activeRooms && activeRooms.length > 0 ? (
            activeRooms.map((room) => {
              const currentCount = roomCounts[room.id] || 0;
              const hasLimit = room.maxParticipants > 0;
              const isFull = hasLimit && currentCount >= room.maxParticipants;
              const isCurrentlyJoining = joiningRoomId === room.id;

              // Kiểm tra quyền vào phòng
              const assignedUsers = room.assignedUsers;
              const isAssignedMode = Array.isArray(assignedUsers);
              const isAssigned = isAssignedMode
                ? myIdentity
                  ? assignedUsers.includes(myIdentity)
                  : false
                : true;
              const canJoin = isHost || isAssigned;

              // Vô hiệu hoá nút nếu: Đầy phòng, đang join, hoặc đã HẾT GIỜ
              const isDisabled = isFull || isCurrentlyJoining || isExpired;
              const isExpanded = isAssignedMode && expandedRoomId === room.id;

              // Danh sách người tham gia phòng chính chưa được gán vào phòng này (loại bỏ Host / Admin)
              const eligibleParticipants = participants.filter((p) => {
                if (isAgentParticipant(p)) return false;
                let role = "guest";
                try {
                  if (p.metadata) {
                    const meta = JSON.parse(p.metadata);
                    role = meta.role || "guest";
                  }
                } catch (e) { }

                // Loại bỏ Host / Admin khỏi danh sách có thể gán
                if (
                  role === "owner" ||
                  role === "admin" ||
                  (p.isLocal && isHost)
                ) {
                  return false;
                }

                const alreadyAssigned =
                  Array.isArray(room.assignedUsers) &&
                  room.assignedUsers.includes(p.identity);
                if (alreadyAssigned) return false;

                if (searchQuery.trim()) {
                  const name = p.name || p.identity || "";
                  return name
                    .toLowerCase()
                    .includes(searchQuery.trim().toLowerCase());
                }
                return true;
              });

              return (
                <div
                  key={room.id}
                  className={`flex flex-col gap-2.5 p-3.5 bg-[#161619] border rounded-xl transition-all duration-200 ${isExpanded
                      ? "border-blue-500/50 shadow-md shadow-blue-500/5"
                      : "border-[#232328] hover:border-blue-500/30"
                    }`}
                >
                  {/* HÀNG CHÍNH: Thông tin phòng + Nút Thao tác */}
                  <div className="flex items-center justify-between gap-3">
                    {/* CỘT NỘI DUNG TRÁI: Tên phòng + Badge + Số người */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-200 text-sm truncate group-hover:text-white transition-colors">
                            {room.name}
                          </h3>
                          {Array.isArray(room.assignedUsers) &&
                            room.assignedUsers.length > 0 &&
                            isAssigned && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 border border-blue-500/30 text-blue-400 font-medium shrink-0">
                                {t("assigned_only")}
                              </span>
                            )}
                        </div>

                        <div className="flex items-center gap-1.5 text-slate-400 text-xs mt-0.5">
                          <Users
                            size={12}
                            className="text-slate-500 shrink-0"
                          />
                          <span>
                            {currentCount}
                            {hasLimit ? ` / ${room.maxParticipants}` : ""}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* CỘT PHẢI: Nút thêm người (Admin, chỉ khi phòng có assignedUsers) + Nút Tham gia */}
                    <div className="flex items-center gap-2 shrink-0">
                      {isHost && isAssignedMode && (
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedRoomId(isExpanded ? null : room.id);
                            setSearchQuery("");
                          }}
                          title={t("add_user")}
                          className={`p-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${isExpanded
                              ? "bg-blue-600 text-white border-blue-500 shadow-sm"
                              : "bg-[#1a1a1e] hover:bg-[#232328] text-slate-300 hover:text-white border-[#232328]"
                            }`}
                        >
                          <UserPlus size={14} />
                        </button>
                      )}

                      {canJoin ? (
                        <button
                          onClick={() => handleJoin(room.id)}
                          disabled={isDisabled}
                          className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all duration-200 ${isDisabled
                              ? "bg-[#232328] text-slate-500 border border-[#2e2e34] cursor-not-allowed"
                              : "bg-blue-600 hover:bg-blue-500 text-white shadow-sm hover:shadow-blue-500/20 active:scale-95 border border-blue-500 hover:border-blue-400 cursor-pointer"
                            }`}
                        >
                          {isCurrentlyJoining ? (
                            <Loader2
                              size={14}
                              className="animate-spin text-white"
                            />
                          ) : (
                            <LogIn
                              size={14}
                              className={
                                isDisabled
                                  ? ""
                                  : "group-hover:translate-x-0.5 transition-transform"
                              }
                            />
                          )}
                          <span>
                            {isExpired
                              ? t("room_closed")
                              : isFull
                                ? t("room_full")
                                : t("join")}
                          </span>
                        </button>
                      ) : (
                        <div className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-[#111113] text-slate-500 border border-[#232328]">
                          <Lock size={12} className="text-slate-500" />
                          <span>{t("assigned_only")}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* SỔ XUỐNG DANH SÁCH THÊM NGƯỜI (INLINE) */}
                  {isHost && isAssignedMode && isExpanded && (
                    <div className="pt-3 mt-1 border-t border-[#232328] flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-2 duration-150">
                      {/* Ô tìm kiếm cục bộ */}
                      <div className="relative">
                        <Search
                          size={13}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder={t("search_participant")}
                          className="w-full bg-[#111113] border border-[#232328] focus:border-blue-500 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder:text-slate-500 outline-none transition-colors"
                        />
                        {searchQuery && (
                          <button
                            onClick={() => setSearchQuery("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs cursor-pointer"
                          >
                            ×
                          </button>
                        )}
                      </div>

                      {/* Danh sách người tham gia có thể thêm */}
                      <div className="max-h-36 overflow-y-auto space-y-1.5 custom-scrollbar pr-0.5">
                        {eligibleParticipants.length > 0 ? (
                          eligibleParticipants.map((p) => {
                            let avatarUrl = "";
                            try {
                              if (p.metadata) {
                                const meta = JSON.parse(p.metadata);
                                avatarUrl = meta.avatarUrl || "";
                              }
                            } catch (e) { }

                            const isAdding = assigningUserId === p.identity;

                            return (
                              <div
                                key={p.identity}
                                className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-[#111113] hover:bg-[#1a1a1e] border border-[#232328] rounded-lg transition-colors"
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  {avatarUrl ? (
                                    <img
                                      src={avatarUrl}
                                      alt={p.name || ""}
                                      className="w-6 h-6 rounded-full object-cover shrink-0"
                                    />
                                  ) : (
                                    <div className="w-6 h-6 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                                      {(p.name || p.identity || "U")
                                        .charAt(0)
                                        .toUpperCase()}
                                    </div>
                                  )}
                                  <span className="text-xs text-slate-200 truncate font-medium">
                                    {p.name || p.identity}
                                    {p.isLocal ? " (Bạn)" : ""}
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleAddUser(room.id, p.identity)
                                  }
                                  disabled={isAdding}
                                  className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium flex items-center gap-1 transition-all disabled:opacity-50 shrink-0 cursor-pointer shadow-sm active:scale-95"
                                >
                                  {isAdding ? (
                                    <Loader2
                                      size={11}
                                      className="animate-spin text-white"
                                    />
                                  ) : (
                                    <Plus size={11} />
                                  )}
                                  <span>{t("add")}</span>
                                </button>
                              </div>
                            );
                          })
                        ) : (
                          <div className="py-2.5 text-center text-xs text-slate-500 font-medium">
                            {t("no_participants_to_add")}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-10 flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#161619] flex items-center justify-center border border-[#232328]">
                <Grid2X2 className="text-slate-500" size={22} />
              </div>
              <p className="text-slate-400 text-sm font-medium">
                {t("no_rooms_created")}
              </p>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}



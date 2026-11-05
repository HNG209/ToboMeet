import { useParticipantManager } from "@/hooks/useParticipantManager";
import {
  Edit2,
  Hand,
  Loader2,
  Mic,
  MicOff,
  MoreVertical,
  UserMinus,
  VideoOff,
  Clock,
  ShieldCheck,
  UserCheck,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { createPortal } from "react-dom";

export default function ParticipantList({
  meetingCode,
}: {
  meetingCode: string;
}) {
  const t = useTranslations("meeting.participant_list");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // State quản lý Tab hiển thị
  const [activeListTab, setActiveListTab] = useState<"joined" | "waiting">(
    "joined",
  );

  const {
    localParticipant,
    displayParticipants,
    waitingParticipants,
    canManageParticipants,
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
  } = useParticipantManager({ meetingCode });

  return (
    <div className="flex flex-col h-full">
      {/* ================= THANH ĐIỀU HƯỚNG TABS (CHỈ DÀNH CHO ADMIN) ================= */}
      {canApprove && (
        <div className="flex p-1 bg-[#161619] rounded-lg mb-2.5 mx-1 border border-[#232328]">
          <button
            onClick={() => setActiveListTab("joined")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all duration-300 ${activeListTab === "joined"
              ? "bg-[#232328] text-white shadow-sm"
              : "text-slate-400 hover:text-slate-200"
              }`}
          >
            {t("joined_members", { count: displayParticipants.length })}
          </button>

          <button
            onClick={() => setActiveListTab("waiting")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all duration-300 ${activeListTab === "waiting"
              ? "bg-[#232328] text-white shadow-sm"
              : "text-slate-400 hover:text-slate-200"
              }`}
          >
            {t("waiting_approval")}
            {waitingParticipants.length > 0
              ? ` (${waitingParticipants.length})`
              : ""}
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col gap-1 w-full overflow-y-auto custom-scrollbar pb-4 px-0.5">
        {/* ================= KHU VỰC PHÒNG CHỜ ================= */}
        {canApprove && activeListTab === "waiting" && (
          <div className="animate-fade-in">
            {waitingParticipants.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 opacity-60">
                <Clock
                  className="text-slate-500 mb-2"
                  size={28}
                  strokeWidth={1.5}
                />
                <p className="text-xs text-slate-400">
                  {t("waiting_room_empty")}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1 w-full">
                {/* NÚT DUYỆT TẤT CẢ */}
                <div className="flex w-full justify-between items-center px-1 pb-1">
                  <p className="text-xs text-slate-400">{t("everyone")}</p>
                  <button
                    onClick={() => handleApprove("all", t("everyone"))}
                    className="text-xs text-amber-400 hover:text-amber-300 font-semibold px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-md transition-colors"
                  >
                    {t("approve_all")}
                  </button>
                </div>

                {waitingParticipants.map((p) => {
                  let avatarUrl = "";
                  try {
                    if (p.metadata) {
                      const meta = JSON.parse(p.metadata);
                      avatarUrl = meta.avatarUrl;
                    }
                  } catch (error) { }

                  return (
                    <div
                      key={p.identity}
                      className="flex items-center gap-2.5 p-2 bg-[#222] hover:bg-[#2a2a2a] rounded-xl transition-all border border-[#333]"
                    >
                      <div className="relative shrink-0">
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt={p.name}
                            className="w-8 h-8 rounded-full object-cover border border-[#333] bg-[#111]"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-[#111] text-slate-400 border border-[#333] flex items-center justify-center font-bold text-xs uppercase">
                            {p.name?.charAt(0) || "?"}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <span className="text-xs font-semibold text-slate-200 truncate">
                          {p.name}
                        </span>
                        <span className="text-[10px] text-amber-400/90 font-medium">
                          {t("requesting_access")}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleRemove(p.identity)}
                          className="p-1 text-slate-400 hover:bg-red-500/15 hover:text-red-400 rounded-md transition-colors"
                          title={t("reject")}
                        >
                          <UserMinus size={14} />
                        </button>
                        <button
                          onClick={() =>
                            handleApprove(p.identity, p.name || t("default_user_name"))
                          }
                          className="px-2.5 py-1 bg-amber-500/15 text-amber-400 hover:bg-amber-500 hover:text-white border border-amber-500/30 text-xs font-semibold rounded-md transition-colors"
                        >
                          {t("approve")}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= KHU VỰC TRONG PHÒNG CHÍNH ================= */}
        {(!canApprove || activeListTab === "joined") && (
          <div className="animate-fade-in">
            {/* Header cho người dùng không phải Admin (Vì họ không thấy Tab) */}
            {!canApprove && (
              <div className="flex items-center justify-between mb-2 px-1 mt-0.5">
                <span className="text-xs font-medium text-slate-400">
                  {t("in_session")} ({displayParticipants.length})
                </span>
              </div>
            )}

            {displayParticipants.map((p) => {
              let avatarUrl = "";
              let role = "member";
              const { isRaised } = getHandState(p);
              try {
                if (p.metadata) {
                  const meta = JSON.parse(p.metadata);
                  avatarUrl = meta.avatarUrl;
                  role = meta.role || "member";
                }
              } catch (error) { }

              const isMe = p.identity === localParticipant.identity;
              const hasMenuOptions = isMe || canManageParticipants;

              // Xác định text chức danh hiển thị dựa theo roomType
              let roleText = "";
              if (role === "owner") {
                roleText = t("role_leader");
              } else if (role === "admin") {
                roleText = t("role_vice_leader");
              } else if (role === "guest") {
                roleText = t("guest_user");
              }

              return (
                <div
                  key={p.identity}
                  className="flex items-center gap-2.5 py-1.5 px-2 hover:bg-[#222] rounded-xl transition-all group border border-transparent hover:border-[#333]"
                >
                  <div className="relative shrink-0">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={p.name}
                        className="w-8 h-8 rounded-full object-cover border border-[#333] bg-[#111]"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[#232328] text-slate-300 border border-[#333] flex items-center justify-center font-bold text-xs uppercase shadow-sm">
                        {p.name?.charAt(0) || "?"}
                      </div>
                    )}
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-[#111] rounded-full"></div>
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <span className="text-xs font-semibold text-slate-200 truncate group-hover:text-white transition-colors">
                      {p.name}
                      {isMe && (
                        <span className="text-slate-500 font-normal ml-1">
                          {t("you_label")}
                        </span>
                      )}
                    </span>

                    {role !== "member" && roleText && (
                      <span className="text-[10px] text-slate-400 font-medium truncate">
                        {roleText}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {isRaised && (
                      <Hand
                        size={13}
                        className="text-amber-400 mr-0.5 fill-amber-400 animate-pulse"
                      />
                    )}

                    <div className="text-slate-400">
                      {p.isMicrophoneEnabled ? (
                        <div className="p-1 bg-[#222] border border-[#333] rounded-md">
                          <Mic size={13} className="text-slate-300" />
                        </div>
                      ) : (
                        <div className="p-1 bg-red-500/10 border border-red-500/20 rounded-md">
                          <MicOff size={13} className="text-red-400" />
                        </div>
                      )}
                    </div>

                    {hasMenuOptions && (
                      <div className="relative">
                        {kickingUserId === p.identity ? (
                          <div className="p-1 text-red-400 flex items-center justify-center">
                            <Loader2 size={14} className="animate-spin" />
                          </div>
                        ) : (
                          <button
                            onClick={() =>
                              setOpenMenuId(
                                openMenuId === p.identity ? null : p.identity,
                              )
                            }
                            className="p-1 hover:bg-[#232328] rounded-md text-slate-400 hover:text-white transition-colors cursor-pointer"
                          >
                            <MoreVertical size={14} />
                          </button>
                        )}

                        {openMenuId === p.identity && (
                          <>
                            <div
                              className="fixed inset-0 z-40"
                              onClick={() => setOpenMenuId(null)}
                            ></div>
                            <div className="absolute right-2 top-full mt-1 z-50 w-max min-w-44 origin-top-right bg-[#161619] border border-[#232328] rounded-xl py-1 shadow-2xl backdrop-blur-xl">
                              {isMe && (
                                <button
                                  onClick={() => {
                                    setRenameState({
                                      isOpen: true,
                                      newName: p.name || "",
                                    });
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full text-left px-3 py-2 text-xs font-medium text-slate-200 hover:bg-[#232328] flex items-center gap-2.5 transition-colors whitespace-nowrap cursor-pointer"
                                >
                                  <Edit2 size={14} className="text-slate-400" />
                                  <span>{t("rename_display_name")}</span>
                                </button>
                              )}

                              {/* MENU DÀNH CHO OWNER */}
                              {isLocalOwner && !isMe && role !== "guest" && (
                                <>
                                  {role === "admin" ? (
                                    <button
                                      onClick={() => {
                                        handleUpdateRole(p.identity, "member");
                                        setOpenMenuId(null);
                                      }}
                                      className="w-full text-left px-3 py-2 text-xs font-medium text-slate-200 hover:bg-[#232328] flex items-center gap-2.5 transition-colors whitespace-nowrap cursor-pointer"
                                    >
                                      <UserCheck size={14} className="text-slate-400" />
                                      <span>{t("revoke_vice_leader")}</span>
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        handleUpdateRole(p.identity, "admin");
                                        setOpenMenuId(null);
                                      }}
                                      className="w-full text-left px-3 py-2 text-xs font-medium text-slate-200 hover:bg-[#232328] flex items-center gap-2.5 transition-colors whitespace-nowrap cursor-pointer"
                                    >
                                      <UserCheck size={14} className="text-slate-400" />
                                      <span>{t("appoint_vice_leader")}</span>
                                    </button>
                                  )}

                                  <button
                                    onClick={() => {
                                      handleTransferOwnership(
                                        p.identity,
                                        p.name || t("default_member_name"),
                                      );
                                      setOpenMenuId(null);
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs font-medium text-slate-200 hover:bg-[#232328] flex items-center gap-2.5 transition-colors whitespace-nowrap cursor-pointer"
                                  >
                                    <ShieldCheck size={14} className="text-slate-400" />
                                    <span>{t("appoint_leader")}</span>
                                  </button>
                                  <div className="h-px bg-[#232328] my-1 mx-2" />
                                </>
                              )}

                              {/* CÁC THAO TÁC QUẢN LÝ CHUNG */}
                              {canManageParticipants && !isMe && (
                                <>
                                  {p.isMicrophoneEnabled && (
                                    <button
                                      onClick={() => {
                                        handleMute(
                                          p.identity,
                                          p.name || t("default_member_name"),
                                          "audio",
                                        );
                                        setOpenMenuId(null);
                                      }}
                                      className="w-full text-left px-3 py-2 text-xs font-medium text-slate-200 hover:bg-[#232328] flex items-center gap-2.5 transition-colors whitespace-nowrap cursor-pointer"
                                    >
                                      <MicOff size={14} className="text-slate-400" />
                                      <span>{t("mic_off")}</span>
                                    </button>
                                  )}

                                  {p.isCameraEnabled && (
                                    <button
                                      onClick={() => {
                                        handleMute(
                                          p.identity,
                                          p.name || t("default_member_name"),
                                          "video",
                                        );
                                        setOpenMenuId(null);
                                      }}
                                      className="w-full text-left px-3 py-2 text-xs font-medium text-slate-200 hover:bg-[#232328] flex items-center gap-2.5 transition-colors whitespace-nowrap cursor-pointer"
                                    >
                                      <VideoOff size={14} className="text-slate-400" />
                                      <span>{t("cam_off")}</span>
                                    </button>
                                  )}

                                  <button
                                    onClick={() => {
                                      handleRemove(p.identity);
                                      setOpenMenuId(null);
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 flex items-center gap-2.5 transition-colors whitespace-nowrap cursor-pointer"
                                  >
                                    <UserMinus size={14} className="text-red-400" />
                                    <span>{t("remove_from_meeting")}</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal đổi tên đồng bộ thiết kế Breakout */}
      {renameState?.isOpen &&
        createPortal(
          <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 animate-fade-in">
            <div className="bg-[#161619] border border-[#232328] rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-scale-in">
              {/* Header */}
              <div className="px-5 py-3.5 border-b border-[#232328] flex items-center justify-between bg-[#161619]">
                <div className="flex items-center gap-2 text-white">
                  <div className="p-1.5 rounded-lg bg-blue-600/10 text-blue-400 border border-blue-500/20">
                    <Edit2 size={15} />
                  </div>
                  <h3 className="text-sm font-bold tracking-tight text-white">
                    {t("rename_display_name")}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setRenameState(null)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-[#232328] rounded-lg transition-colors cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 bg-[#111113] space-y-2.5">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  {t("enter_new_name")}
                </label>
                <input
                  type="text"
                  value={renameState.newName}
                  onChange={(e) =>
                    setRenameState({ ...renameState, newName: e.target.value })
                  }
                  disabled={isRenaming}
                  placeholder={t("enter_new_name")}
                  className="w-full px-3.5 py-2.5 bg-[#161619] border border-[#232328] hover:border-[#333338] rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all disabled:opacity-50"
                  autoFocus
                  onKeyDown={(e) =>
                    e.key === "Enter" && !isRenaming && handleRenameSubmit()
                  }
                />
              </div>

              {/* Footer */}
              <div className="px-5 py-3.5 border-t border-[#232328] bg-[#111113] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenameState(null)}
                  disabled={isRenaming}
                  className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-[#232328] border border-[#232328] rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {t("cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleRenameSubmit}
                  disabled={!renameState.newName.trim() || isRenaming}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md shadow-blue-600/20 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isRenaming && <Loader2 size={13} className="animate-spin" />}
                  <span>{t("save_changes")}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

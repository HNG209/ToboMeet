"use client";

import { useState } from "react";
import { X, Search, MoreVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import RoleBadge from "./RoleBadge";
import MemberActionMenu from "./MemberActionMenu";
import UserAvatar from "@/components/common/UserAvatar";

interface RoomRightSidebarProps {
  room: any;
  members: any[];
  membersLoading: boolean;
  userId: string;
  currentChannel: any;
  currentChannelId: string;
  isRightSidebarOpen: boolean;
  setIsRightSidebarOpen: (isOpen: boolean) => void;
  // Các cờ phân quyền
  isCurrentUserOwner: boolean;
  currentUserRoomRole: string | undefined;
  isCurrentUserRoomAdmin: boolean;
  canUserManageChannel: boolean;
  // Các hàm callback
  onReportUser: (member: { userId: string; displayName: string }) => void;
  onTransferOwnership: (member: {
    userId: string;
    displayName: string;
  }) => void;
  onRemoveMember: (member: { userId: string; displayName: string }) => void;
}

export default function RoomRightSidebar({
  room,
  members,
  membersLoading,
  userId,
  currentChannel,
  currentChannelId,
  isRightSidebarOpen,
  setIsRightSidebarOpen,
  isCurrentUserOwner,
  currentUserRoomRole,
  isCurrentUserRoomAdmin,
  canUserManageChannel,
  onReportUser,
  onTransferOwnership,
  onRemoveMember,
}: RoomRightSidebarProps) {
  const t = useTranslations("room");
  const [memberSearch, setMemberSearch] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  return (
    <>
      {/* Mobile Backdrop */}
      {isRightSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setIsRightSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 right-0 z-40 flex flex-col bg-white border-l border-slate-200 shadow-xl lg:relative lg:translate-x-0 lg:shadow-none transition-all duration-300 ease-in-out overflow-hidden shrink-0 ${isRightSidebarOpen
            ? "translate-x-0 w-80 lg:w-80 lg:opacity-100"
            : "translate-x-full w-80 lg:w-0 lg:opacity-0 lg:border-none pointer-events-none lg:pointer-events-auto"
          }`}
      >
        <div className="h-14 flex items-center justify-between px-5 border-b border-slate-200 w-80 shrink-0">
          <h2 className="text-sm font-bold text-slate-800">
            {t("in_this_channel")}
          </h2>
          <button
            onClick={() => setIsRightSidebarOpen(false)}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 w-80 shrink-0">
          <div className="mb-6">
            {(() => {
              const displayedMembers = members.filter((member: any) => {
                if (currentChannel?.isPrivate) {
                  const isInPrivateChannel =
                    member.userId === room?.ownerId ||
                    currentChannel?.members?.some(
                      (cm: any) =>
                        (cm.userId === member.userId ||
                          (member.supabaseId &&
                            cm.userId === member.supabaseId) ||
                          (member._id && cm.userId === member._id)) &&
                        cm.isLeft !== true &&
                        cm.status !== "REMOVED" &&
                        cm.status !== "LEFT",
                    );
                  if (!isInPrivateChannel) return false;
                }
                if (!memberSearch.trim()) return true;
                const query = memberSearch.trim().toLowerCase();
                return (
                  member.displayName?.toLowerCase().includes(query) ||
                  member.email?.toLowerCase().includes(query)
                );
              });

              return (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold text-slate-500 uppercase">
                      {t("people")} ({displayedMembers.length})
                    </h3>
                    <button className="text-xs font-medium text-brand-600 hover:underline">
                      {t("view_all")}
                    </button>
                  </div>

                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder={t("search_member_placeholder", {
                        defaultValue: "Nhập email hoặc tên...",
                      })}
                      className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                  </div>

                  {membersLoading ? (
                    <div className="text-center text-slate-400 py-4 text-sm">
                      {t("loading_title")}
                    </div>
                  ) : displayedMembers.length === 0 ? (
                    <div className="text-center text-slate-400 py-4 text-sm">
                      {t("empty")}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {displayedMembers.map((member: any) => {
                        const isSelf = member.userId === userId;

                        return (
                          <div
                            key={member.userId}
                            className="group relative flex items-center gap-3 hover:bg-slate-50 p-2 rounded-lg transition-colors cursor-pointer"
                          >
                            {/* Avatar */}
                            <div className="relative shrink-0">
                              <UserAvatar
                                avatarUrl={member.avatarUrl}
                                displayName={member.displayName}
                                size="w-8 h-8"
                              />
                              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full"></div>
                            </div>

                            {/* Text Info */}
                            <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                              <p className="text-sm font-semibold text-slate-800 truncate">
                                {member.displayName}{" "}
                                {isSelf && (
                                  <span className="text-slate-400 font-normal ml-1 text-xs">
                                    ({t("you")})
                                  </span>
                                )}
                              </p>
                              <div className="flex items-center gap-1 flex-wrap">
                                {(() => {
                                  const tRole = currentChannel?.members?.find(
                                    (m: any) => m.userId === member.userId,
                                  )?.role;
                                  if (
                                    member.role === "owner" ||
                                    member.userId === room?.ownerId
                                  )
                                    return (
                                      <RoleBadge
                                        role={member.role}
                                      />
                                    );
                                  if (tRole === "admin")
                                    return (
                                      <RoleBadge
                                        role={tRole}
                                      />
                                    );
                                  return (
                                    <RoleBadge
                                      role="member"
                                    />
                                  );
                                })()}
                              </div>
                            </div>

                            {/* Action Menu (ĐÃ ĐƯỢC GỌI BẰNG COMPONENT) */}
                            {!isSelf && (
                              <div className="shrink-0">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuId(
                                      openMenuId === member.userId
                                        ? null
                                        : member.userId,
                                    );
                                  }}
                                  className="p-1 rounded hover:bg-slate-200 text-slate-400 opacity-100 transition-opacity"
                                >
                                  <MoreVertical size={16} />
                                </button>

                                {openMenuId === member.userId && (
                                  <MemberActionMenu
                                    member={member}
                                    room={room}
                                    currentChannel={currentChannel}
                                    currentChannelId={currentChannelId}
                                    userId={userId}
                                    isCurrentUserOwner={isCurrentUserOwner}
                                    isCurrentUserRoomAdmin={
                                      isCurrentUserRoomAdmin
                                    }
                                    canUserManageChannel={canUserManageChannel}
                                    onClose={() => setOpenMenuId(null)}
                                    onReportUser={onReportUser}
                                    onTransferOwnership={onTransferOwnership}
                                    onRemoveMember={onRemoveMember}
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
          <hr className="border-slate-100 my-4" />
          <div className="text-xs text-slate-500">
            <p className="mb-2 font-semibold">{t("room_description_title")}</p>
            <p>{t("room_description", { name: room.name })}</p>
          </div>
        </div>
      </aside>
    </>
  );
}

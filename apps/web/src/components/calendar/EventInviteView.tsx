"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  X,
  Search,
  Check,
  RefreshCw,
  Calendar,
  Clock,
  UserPlus,
} from "lucide-react";
import { useGlobalUserSearch } from "@/hooks/useGlobalUserSearch";
import { useInviteCalendarMembersMutation } from "@/lib/redux/api/calendarApi";
import { UserResponse } from "@tobomeet/shared/types";
import { CalendarEvent } from "./types";
import { toast } from "sonner";
import UserAvatar from "@/components/common/UserAvatar";

interface EventInviteViewProps {
  event: CalendarEvent;
  locale: string;
  onBack: () => void;
  onClose: () => void;
  existingMemberIds?: string[];
  existingEmails?: string[];
  onSuccess?: () => void;
}

export default function EventInviteView({
  event,
  locale,
  onBack,
  onClose,
  existingMemberIds = [],
  existingEmails = [],
  onSuccess,
}: EventInviteViewProps) {
  const t = useTranslations("calendar");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<UserResponse[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  const [inviteCalendarMembers, { isLoading: isInviting }] =
    useInviteCalendarMembersMutation();

  const {
    users = [],
    isSearching,
    isLoadingMore,
    hasNext,
    loadMore,
  } = useGlobalUserSearch({
    q: searchQuery,
    debounceMs: 300,
  });

  const normalizedExistingIds = new Set(
    existingMemberIds.filter(Boolean).map((id) => String(id)),
  );
  const normalizedExistingEmails = new Set(
    existingEmails.filter(Boolean).map((e) => e.toLowerCase()),
  );

  const isUserAlreadyInEvent = (user: UserResponse) => {
    const sId = user.supabaseId;
    const uId = (user as any)._id || (user as any).id;
    const email = user.email?.toLowerCase();

    if (sId && normalizedExistingIds.has(String(sId))) return true;
    if (uId && normalizedExistingIds.has(String(uId))) return true;
    if (email && normalizedExistingEmails.has(email)) return true;
    return false;
  };

  const isUserSelected = (user: UserResponse) => {
    return selectedUsers.some(
      (sel) =>
        (sel.supabaseId && sel.supabaseId === user.supabaseId) ||
        ((sel as any)._id && (sel as any)._id === (user as any)._id) ||
        sel.email.toLowerCase() === user.email.toLowerCase(),
    );
  };

  const handleToggleUser = (user: UserResponse) => {
    if (isUserAlreadyInEvent(user)) return;

    if (isUserSelected(user)) {
      setSelectedUsers(
        selectedUsers.filter(
          (sel) =>
            sel.supabaseId !== user.supabaseId &&
            (sel as any)._id !== (user as any)._id &&
            sel.email.toLowerCase() !== user.email.toLowerCase(),
        ),
      );
    } else {
      setSelectedUsers([...selectedUsers, user]);
    }
  };

  const handleRemoveSelected = (user: UserResponse) => {
    setSelectedUsers(
      selectedUsers.filter(
        (sel) =>
          sel.supabaseId !== user.supabaseId &&
          (sel as any)._id !== (user as any)._id &&
          sel.email.toLowerCase() !== user.email.toLowerCase(),
      ),
    );
  };

  const handleSendInvites = async () => {
    if (selectedUsers.length === 0) return;
    setErrorMsg("");

    try {
      const invitees = selectedUsers.map((u) => ({
        email: u.email,
        userId: u.supabaseId || (u as any)._id || (u as any).id,
        displayName: u.displayName || u.email,
      }));

      await inviteCalendarMembers({
        id: event._id,
        invitees,
      }).unwrap();

      toast.success(t("detail_modal.invite_success"));
      setSelectedUsers([]);
      onSuccess?.();
      onBack();
    } catch (err: any) {
      console.error("Lỗi gửi lời mời:", err);
      setErrorMsg(
        err.data?.message || err.message || t("detail_modal.invite_error"),
      );
    }
  };

  const formatTimeRange = (startStr: string, endStr: string) => {
    try {
      const start = new Date(startStr);
      const end = new Date(endStr);
      const pad = (n: number) => n.toString().padStart(2, "0");
      const timeStart = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
      const timeEnd = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
      const dateStr = `${pad(start.getDate())}/${pad(start.getMonth() + 1)}/${start.getFullYear()}`;
      return `${timeStart} - ${timeEnd}, ${dateStr}`;
    } catch {
      return "";
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden animate-in fade-in duration-200">
      {/* Header với nút quay về và tiêu đề Invite Participants */}
      <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 -ml-1.5 rounded-xl hover:bg-slate-200/70 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            title={t("detail_modal.back", { defaultValue: "Quay lại" })}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h3 className="font-bold text-slate-800 text-base leading-tight">
              {t("detail_modal.invite_title", {
                defaultValue: "Mời người tham gia",
              })}
            </h3>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              {t("detail_modal.invite_subtitle", {
                defaultValue: "Thêm thành viên vào sự kiện này",
              })}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Thông tin tóm tắt lịch bên dưới header */}
      <div className="mx-6 mt-4 p-3 bg-brand-50/60 border border-brand-100 rounded-2xl flex items-center gap-3 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center shrink-0">
          <Calendar className="w-4 h-4 text-brand-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-slate-800 truncate">
            {event.title}
          </h4>
          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">
              {formatTimeRange(event.startDate, event.endDate)}
            </span>
          </p>
        </div>
      </div>

      {/* Nội dung tìm kiếm và chọn người dùng */}
      <div className="p-6 pt-3 space-y-3.5 overflow-y-auto flex-1 min-h-0">
        {errorMsg && (
          <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-medium border border-red-100">
            {errorMsg}
          </div>
        )}

        {/* Ô tìm kiếm người dùng */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("detail_modal.search_placeholder", {
              defaultValue: "Tìm kiếm theo tên hoặc email...",
            })}
            className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-brand-500 focus:bg-white transition-all font-medium text-slate-800"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Danh sách người dùng đã chọn (Tags) */}
        {selectedUsers.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase">
              <span>
                {t("detail_modal.selected_count", {
                  count: selectedUsers.length,
                  defaultValue: `Đã chọn (${selectedUsers.length})`,
                })}
              </span>
              <button
                type="button"
                onClick={() => setSelectedUsers([])}
                className="text-[10px] text-rose-500 hover:underline font-semibold cursor-pointer"
              >
                {t("detail_modal.clear_all", { defaultValue: "Bỏ chọn tất cả" })}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 bg-slate-50 border border-slate-100 rounded-xl">
              {selectedUsers.map((user) => {
                const uId = user.supabaseId || (user as any)._id || user.email;
                return (
                  <span
                    key={uId}
                    className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 shadow-2xs"
                  >
                    <UserAvatar
                      avatarUrl={user.avatarUrl}
                      displayName={user.displayName || user.email}
                      size="w-4 h-4 text-[9px]"
                    />
                    <span className="truncate max-w-[120px]">
                      {user.displayName || user.email}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSelected(user)}
                      className="text-slate-400 hover:text-rose-600 p-0.5 rounded cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Danh sách gợi ý / kết quả tìm kiếm */}
        <div className="space-y-1">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {searchQuery
              ? t("detail_modal.search_results", {
                  defaultValue: "Kết quả tìm kiếm",
                })
              : t("detail_modal.suggested_users", {
                  defaultValue: "Người dùng gợi ý",
                })}
          </p>

          <div className="border border-slate-100 rounded-xl divide-y divide-slate-50 max-h-48 overflow-y-auto bg-white">
            {isSearching && users.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-600" />
                <span>{t("detail_modal.searching", { defaultValue: "Đang tìm..." })}</span>
              </div>
            ) : users.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                {searchQuery
                  ? t("detail_modal.no_users_found", {
                      defaultValue: "Không tìm thấy người dùng",
                    })
                  : t("detail_modal.empty_users", {
                      defaultValue: "Chưa có danh sách gợi ý",
                    })}
              </div>
            ) : (
              users.map((user) => {
                const isSelected = isUserSelected(user);
                const isExisting = isUserAlreadyInEvent(user);
                const uId = user.supabaseId || (user as any)._id || user.email;

                return (
                  <div
                    key={uId}
                    onClick={() => !isExisting && handleToggleUser(user)}
                    className={`flex items-center justify-between p-2.5 transition-colors ${
                      isExisting
                        ? "opacity-50 bg-slate-50/50 cursor-not-allowed"
                        : "hover:bg-slate-50 cursor-pointer"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserAvatar
                        avatarUrl={user.avatarUrl}
                        displayName={user.displayName || user.email}
                        size="w-7 h-7 text-xs"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">
                          {user.displayName || user.email}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {user.email}
                        </p>
                      </div>
                    </div>

                    <div>
                      {isExisting ? (
                        <span className="text-[10px] font-bold text-slate-400 px-2 py-0.5 bg-slate-100 rounded-md">
                          {t("detail_modal.joined", { defaultValue: "Đã tham gia" })}
                        </span>
                      ) : isSelected ? (
                        <div className="w-6 h-6 rounded-lg bg-brand-600 text-white flex items-center justify-center">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-lg border border-slate-200 hover:border-brand-500 flex items-center justify-center text-slate-400 hover:text-brand-600">
                          <UserPlus className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {hasNext && (
              <div className="p-2 text-center border-t border-slate-50">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50 cursor-pointer"
                >
                  {isLoadingMore
                    ? t("detail_modal.loading_more", { defaultValue: "Đang tải thêm..." })
                    : t("detail_modal.load_more", { defaultValue: "Xem thêm" })}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="px-6 py-4 bg-slate-50/60 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0 mt-auto">
        <button
          type="button"
          onClick={onBack}
          disabled={isInviting}
          className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
        >
          {t("detail_modal.cancel", { defaultValue: "Hủy" })}
        </button>
        <button
          type="button"
          onClick={handleSendInvites}
          disabled={isInviting || selectedUsers.length === 0}
          className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
        >
          {isInviting ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>{t("detail_modal.sending_invites", { defaultValue: "Đang gửi..." })}</span>
            </>
          ) : (
            <>
              <UserPlus className="w-3.5 h-3.5" />
              <span>
                {t("detail_modal.send_invites_count", {
                  count: selectedUsers.length,
                  defaultValue: `Gửi lời mời (${selectedUsers.length})`,
                })}
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

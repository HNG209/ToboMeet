"use client";

import React from "react";
import { useNotifications } from "@/hooks/useNotifications";
import { Bell, Loader2, X } from "lucide-react";
import NotificationCard from "./NotificationCard";
import { useTranslations } from "next-intl";

interface NotificationPopoverProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationDrawer({
  isOpen,
  onClose,
}: NotificationPopoverProps) {
  const t = useTranslations("notification");
  const { notifications, isLoading, isFetching, hasNext, loadMore } =
    useNotifications({ limit: 15, markAsRead: !isOpen });

  if (!isOpen) return null;

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 50) {
      if (hasNext && !isFetching) {
        loadMore();
      }
    }
  };

  return (
    <>
      {/* Click-away backdrop overlay */}
      <div
        className="fixed inset-0 z-[60]"
        onClick={onClose}
      />

      {/* Floating Popover directly below bell icon */}
      <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-slate-100 z-[70] animate-in fade-in zoom-in-95 duration-150 text-slate-800 flex flex-col max-h-[500px] overflow-hidden">
        {/* Popover Header */}
        <div className="h-12 px-4 flex items-center justify-between border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-brand-600" />
            <span className="text-sm font-bold text-slate-800">
              {t("drawer.title", { defaultValue: "Thông báo" })}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable List */}
        <div
          className="flex-1 overflow-y-auto custom-scrollbar p-2.5 space-y-2 max-h-[440px]"
          onScroll={handleScroll}
        >
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2.5">
              <Loader2 className="w-7 h-7 animate-spin text-brand-500" />
              <p className="text-xs font-medium text-slate-400">
                {t("drawer.loading", { defaultValue: "Đang tải thông báo..." })}
              </p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 opacity-70">
              <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100">
                <Bell className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-xs font-medium text-slate-500">
                {t("drawer.empty", { defaultValue: "Chưa có thông báo nào" })}
              </p>
            </div>
          ) : (
            <>
              {notifications.map((notif) => (
                <NotificationCard
                  key={notif._id}
                  notification={notif}
                  onCloseDrawer={onClose}
                />
              ))}

              {isFetching && !isLoading && (
                <div className="flex justify-center py-3">
                  <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

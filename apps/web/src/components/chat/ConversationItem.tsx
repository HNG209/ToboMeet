"use client";

import React from "react";
import { DirectConversationResponse } from "@/types/chat";
import { useTranslations } from "next-intl";
import UserAvatar from "@/components/common/UserAvatar";

interface ConversationItemProps {
  conversation: DirectConversationResponse;
  isActive: boolean;
  onClick: () => void;
}

function formatRelativeTime(dateStr?: string | null, yesterdayLabel = "Yesterday") {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    if (isYesterday) {
      return yesterdayLabel;
    }

    return `${date.getDate()}/${date.getMonth() + 1}`;
  } catch {
    return "";
  }
}

export default function ConversationItem({
  conversation,
  isActive,
  onClick,
}: ConversationItemProps) {
  const t = useTranslations("direct_chat");
  const { recipient, lastMessagePreview, lastMessageAt, unreadCount } =
    conversation;

  const timeFormatted = formatRelativeTime(lastMessageAt, t("yesterday"));
  const isOnline = recipient?.status === "ACTIVE";

  const renderPreview = () => {
    if (
      !lastMessagePreview ||
      lastMessagePreview === "Cuộc trò chuyện mới" ||
      lastMessagePreview === "New conversation"
    ) {
      return t("new_conversation");
    }
    if (lastMessagePreview === "📷 [Hình ảnh]" || lastMessagePreview === "📷 [Photo]") {
      return `📷 ${t("photo_snippet")}`;
    }
    if (lastMessagePreview === "🎥 [Video]") {
      return `🎥 ${t("video_snippet")}`;
    }
    return lastMessagePreview;
  };

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all duration-150 text-left border ${
        isActive
          ? "bg-brand-50/70 border-brand-200/80 shadow-xs"
          : "bg-transparent border-transparent hover:bg-slate-100/70"
      }`}
    >
      {/* Avatar with presence badge */}
      <UserAvatar
        avatarUrl={recipient?.avatarUrl}
        displayName={recipient?.displayName}
        size="w-12 h-12"
        showOnlineBadge
        isOnline={isOnline}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1 mb-1">
          <p
            className={`text-sm truncate ${
              unreadCount > 0
                ? "font-bold text-slate-900"
                : "font-semibold text-slate-800"
            }`}
          >
            {recipient?.displayName || t("user_fallback")}
          </p>
          {timeFormatted && (
            <span
              className={`text-[11px] shrink-0 ${
                unreadCount > 0
                  ? "text-brand-600 font-bold"
                  : "text-slate-400 font-normal"
              }`}
            >
              {timeFormatted}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p
            className={`text-xs truncate ${
              unreadCount > 0
                ? "font-semibold text-slate-800"
                : "text-slate-500"
            }`}
          >
            {renderPreview()}
          </p>

          {unreadCount > 0 && (
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0 shadow-xs">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

"use client";

import React, { useState, useRef, useEffect } from "react";
import { PinnedMessageDetail } from "@/types/chat";
import {
  Pin,
  PinOff,
  ChevronDown,
  ChevronUp,
  FileText,
  Image as ImageIcon,
  Video,
  CornerDownRight,
  Loader2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import UserAvatar from "@/components/common/UserAvatar";

interface PinnedMessagesBarProps {
  pinnedMessages: PinnedMessageDetail[];
  currentUserId?: string;
  onJumpToMessage: (messageId: string) => void;
  onUnpinMessage: (messageId: string) => Promise<void>;
  isLoadingPins?: boolean;
}

export default function PinnedMessagesBar({
  pinnedMessages,
  currentUserId,
  onJumpToMessage,
  onUnpinMessage,
  isLoadingPins,
}: PinnedMessagesBarProps) {
  const t = useTranslations("direct_chat");
  const [isExpanded, setIsExpanded] = useState(false);
  const [unpinningId, setUnpinningId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Click outside to collapse dropdown
  useEffect(() => {
    if (!isExpanded) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isExpanded]);

  if (!pinnedMessages || pinnedMessages.length === 0) {
    return null;
  }

  const count = pinnedMessages.length;
  // Tin nhắn ghim mới nhất
  const latestPinned = pinnedMessages[pinnedMessages.length - 1];

  const renderPreviewSnippet = (msg: PinnedMessageDetail) => {
    if (msg.attachments && msg.attachments.length > 0) {
      const first = msg.attachments[0];
      if (first.fileType === "image") {
        return (
          <span className="flex items-center gap-1 text-slate-600 truncate">
            <ImageIcon className="w-3.5 h-3.5 text-brand-500 shrink-0" />
            <span className="truncate">{msg.content || t("photos_shared")}</span>
          </span>
        );
      }
      if (first.fileType === "video") {
        return (
          <span className="flex items-center gap-1 text-slate-600 truncate">
            <Video className="w-3.5 h-3.5 text-purple-500 shrink-0" />
            <span className="truncate">{msg.content || "Video"}</span>
          </span>
        );
      }
      return (
        <span className="flex items-center gap-1 text-slate-600 truncate">
          <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span className="truncate">{first.fileName}</span>
        </span>
      );
    }
    return <span className="truncate text-slate-700">{msg.content}</span>;
  };

  const handleUnpin = async (e: React.MouseEvent, messageId: string) => {
    e.stopPropagation();
    if (unpinningId) return;
    setUnpinningId(messageId);
    try {
      await onUnpinMessage(messageId);
    } finally {
      setUnpinningId(null);
    }
  };

  return (
    <div ref={containerRef} className="relative z-20 shrink-0">
      {/* ── Main Bar ── */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-4 py-2 bg-amber-50/90 hover:bg-amber-100/80 backdrop-blur-xs border-b border-amber-200/70 transition-colors flex items-center justify-between cursor-pointer select-none shadow-2xs"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
          <div className="w-6 h-6 rounded-full bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0">
            <Pin className="w-3.5 h-3.5 rotate-45" />
          </div>

          <div className="flex items-center gap-2 min-w-0 text-xs">
            <span className="font-bold text-amber-900 shrink-0">
              {t("pinned_messages")} ({count}/3)
            </span>
            <span className="text-amber-400 shrink-0">•</span>
            <div className="truncate text-slate-700 font-medium">
              <span className="font-semibold text-slate-800 mr-1">
                {latestPinned.sender?.displayName || t("user_fallback")}:
              </span>
              {renderPreviewSnippet(latestPinned)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 text-amber-700 text-xs font-semibold">
          <span className="hidden sm:inline text-[11px] opacity-80">
            {isExpanded ? t("collapse") : t("expand")}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </div>
      </div>

      {/* ── Expanded Dropdown Menu ── */}
      {isExpanded && (
        <div className="absolute top-full left-0 right-0 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-lg p-3 max-h-80 overflow-y-auto space-y-2 animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1 pb-1 border-b border-slate-100">
            <span className="font-semibold text-slate-700">
              {t("pinned_messages_list")} ({count}/3)
            </span>
            <span className="text-[11px] text-slate-400">
              {t("click_to_view_pin")}
            </span>
          </div>

          {pinnedMessages.map((msg, index) => {
            const isUnpinning = unpinningId === msg.id;
            const pinnerName =
              msg.pinner?.displayName ||
              (msg.pinnedBy === currentUserId ? t("you") : t("user_fallback"));

            return (
              <div
                key={msg.id || index}
                onClick={() => {
                  onJumpToMessage(msg.id);
                  setIsExpanded(false);
                }}
                className="group relative flex items-start justify-between gap-3 p-2.5 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:bg-amber-50/50 hover:border-amber-200 transition-all cursor-pointer"
              >
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <UserAvatar
                    avatarUrl={msg.sender?.avatarUrl}
                    displayName={msg.sender?.displayName}
                    size="w-8 h-8"
                    className="mt-0.5 shrink-0 shadow-2xs"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-slate-800">
                        {msg.sender?.displayName || t("user_fallback")}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {msg.createdAt
                          ? new Date(msg.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </span>
                    </div>

                    {/* Preview Reply Quote nếu có */}
                    {msg.replyToId && (
                      <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5 truncate">
                        <CornerDownRight className="w-3 h-3 shrink-0" />
                        <span className="truncate italic">
                          {msg.replyToId.content || t("reply")}
                        </span>
                      </div>
                    )}

                    {/* Nội dung tin nhắn / đính kèm */}
                    <div className="text-xs text-slate-700 mt-1 leading-relaxed break-words">
                      {msg.content && <p>{msg.content}</p>}

                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {msg.attachments.map((att, attIdx) => (
                            <div
                              key={attIdx}
                              className="flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-slate-200 text-[11px] text-slate-600 font-medium"
                            >
                              {att.fileType === "image" && (
                                <ImageIcon className="w-3.5 h-3.5 text-brand-500" />
                              )}
                              {att.fileType === "video" && (
                                <Video className="w-3.5 h-3.5 text-purple-500" />
                              )}
                              {att.fileType === "file" && (
                                <FileText className="w-3.5 h-3.5 text-blue-500" />
                              )}
                              <span className="truncate max-w-[140px]">
                                {att.fileName}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Pinner meta tag */}
                    <div className="mt-1.5 flex items-center gap-1 text-[10px] text-amber-700/80 font-medium">
                      <Pin className="w-2.5 h-2.5 rotate-45 text-amber-600" />
                      <span>
                        {t("pinned_by")} {pinnerName}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions: Jump & Unpin */}
                <div className="flex items-center gap-1 shrink-0 pt-0.5">
                  <button
                    type="button"
                    onClick={(e) => handleUnpin(e, msg.id)}
                    disabled={isUnpinning}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
                    title={t("unpin_message")}
                  >
                    {isUnpinning ? (
                      <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                    ) : (
                      <PinOff className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

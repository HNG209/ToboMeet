"use client";

import React, { useState, useRef, useEffect } from "react";
import { DirectMessageResponse } from "@/types/chat";
import { ReplyBubbleQuote } from "./ReplyPreview";
import FileAttachment from "./FileAttachment";
import ReactionBar, { ReactionPicker } from "./ReactionBar";
import {
  Reply,
  Trash2,
  Smile,
  Ban,
  Pin,
  PinOff,
  Loader2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import UserAvatar from "@/components/common/UserAvatar";
import { useConfirm } from "@/providers/ConfirmProvider";

interface MessageBubbleProps {
  message: DirectMessageResponse;
  currentUserId?: string;
  isHighlighted?: boolean;
  isPinning?: boolean;
  onReply: (message: DirectMessageResponse) => void;
  onReact: (messageId: string, emoji: string) => void;
  onDelete: (messageId: string) => void;
  onTogglePin?: (message: DirectMessageResponse) => void;
  onOpenReactions?: (messageId: string, emoji?: string) => void;
}

function formatMessageTime(dateStr: string) {
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function MessageBubble({
  message,
  currentUserId,
  isHighlighted,
  isPinning,
  onReply,
  onReact,
  onDelete,
  onTogglePin,
  onOpenReactions,
}: MessageBubbleProps) {
  const t = useTranslations("direct_chat");
  const confirm = useConfirm();
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  // Click outside to close reaction picker
  useEffect(() => {
    if (!showPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showPicker]);

  const isMe = currentUserId ? message.senderId === currentUserId : false;
  const isDeleted = Boolean(message.deletedAt);
  const timeFormatted = formatMessageTime(message.createdAt);

  return (
    <div
      id={`message-${message.id}`}
      className={`group relative flex gap-2.5 px-4 py-1.5 transition-all duration-500 ${
        isMe ? "flex-row-reverse" : "flex-row"
      } ${
        isHighlighted
          ? "bg-amber-100/70 ring-2 ring-amber-400/90 rounded-2xl shadow-sm my-1"
          : ""
      }`}
    >
      {/* Avatar (chỉ hiển thị cho người khác gửi) */}
      {!isMe && (
        <UserAvatar
          avatarUrl={message.sender?.avatarUrl}
          displayName={message.sender?.displayName}
          size="w-8 h-8"
          className="self-end mb-1"
        />
      )}

      {/* Bubble Container */}
      <div className={`relative max-w-[75%] sm:max-w-[70%] md:max-w-[65%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
        {/* Sender Name (nếu không phải mình) */}
        {!isMe && message.sender?.displayName && (
          <span className="text-[11px] font-semibold text-slate-500 mb-1 ml-1">
            {message.sender.displayName}
          </span>
        )}

        {/* Message Card */}
        <div
          className={`relative px-3.5 py-2.5 rounded-2xl text-sm transition-all duration-200 ${
            isDeleted
              ? "bg-slate-100/80 border border-slate-200 text-slate-400 italic rounded-xl"
              : isMe
              ? "bg-brand-500 text-white shadow-sm rounded-br-xs selection:bg-white selection:text-brand-600"
              : "bg-white border border-slate-200/80 text-slate-800 shadow-xs rounded-bl-xs selection:bg-brand-100"
          }`}
        >
          {/* Huy hiệu đã ghim */}
          {!isDeleted && message.isPinned && (
            <div
              className={`flex items-center gap-1 text-[11px] font-semibold mb-1.5 ${
                isMe ? "text-amber-200" : "text-amber-600"
              }`}
              title={t("pinned_message")}
            >
              <Pin className="w-3 h-3 rotate-45 fill-current" />
              <span>{t("pinned")}</span>
            </div>
          )}

          {/* Trích dẫn tin nhắn được reply */}
          {!isDeleted && message.replyToId && (
            <ReplyBubbleQuote replyTo={message.replyToId} isMe={isMe} />
          )}

          {/* Nội dung text hoặc thông báo đã thu hồi */}
          {isDeleted ? (
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Ban className="w-3.5 h-3.5 shrink-0" />
              <span>{t("message_deleted")}</span>
            </div>
          ) : (
            <>
              {message.content && (
                <p className="whitespace-pre-wrap break-words leading-relaxed">
                  {message.content}
                </p>
              )}

              {/* Tệp đính kèm */}
              {message.attachments && message.attachments.length > 0 && (
                <div className="space-y-1.5 mt-1">
                  {message.attachments.map((att, idx) => (
                    <FileAttachment
                      key={`${att.url}-${idx}`}
                      attachment={att}
                      isMe={isMe}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* Thời gian gửi bên trong bubble */}
          <div
            className={`text-[10px] mt-1 flex items-center justify-end gap-1 ${
              isMe ? "text-blue-100/90" : "text-slate-400"
            }`}
          >
            <span>{timeFormatted}</span>
          </div>
        </div>

        {/* Reactions List */}
        {!isDeleted && (
          <ReactionBar
            reactions={message.reactions}
            currentUserId={currentUserId}
            onReact={(emoji) => onReact(message.id, emoji)}
            onClickReactionBadge={(emoji) => onOpenReactions?.(message.id, emoji)}
            isMe={isMe}
          />
        )}
      </div>

      {/* Floating Action Menu on hover */}
      {!isDeleted && (
        <div
          className={`opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 self-center ${
            isMe ? "mr-1" : "ml-1"
          }`}
        >
          {/* Quick Reaction Button */}
          <div ref={pickerRef} className="relative">
            <button
              onClick={() => setShowPicker(!showPicker)}
              className="p-1.5 rounded-full text-slate-400 hover:text-amber-500 hover:bg-slate-100 transition-colors"
              title={t("add_reaction")}
            >
              <Smile className="w-4 h-4" />
            </button>
            {showPicker && (
              <div className="absolute bottom-full mb-1 left-0 z-20">
                <ReactionPicker
                  onSelect={(emoji) => {
                    onReact(message.id, emoji);
                    setShowPicker(false);
                  }}
                  onClose={() => setShowPicker(false)}
                />
              </div>
            )}
          </div>

          {/* Pin / Unpin Button */}
          {onTogglePin && (
            <button
              type="button"
              onClick={() => onTogglePin(message)}
              disabled={isPinning}
              className={`p-1.5 rounded-full transition-colors cursor-pointer disabled:opacity-50 ${
                message.isPinned
                  ? "text-amber-600 bg-amber-50 hover:bg-amber-100"
                  : "text-slate-400 hover:text-amber-600 hover:bg-slate-100"
              }`}
              title={message.isPinned ? t("unpin_message") : t("pin_message")}
            >
              {isPinning ? (
                <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
              ) : message.isPinned ? (
                <PinOff className="w-4 h-4" />
              ) : (
                <Pin className="w-4 h-4 rotate-45" />
              )}
            </button>
          )}

          {/* Reply Button */}
          <button
            onClick={() => onReply(message)}
            className="p-1.5 rounded-full text-slate-400 hover:text-brand-500 hover:bg-slate-100 transition-colors"
            title={t("reply")}
          >
            <Reply className="w-4 h-4" />
          </button>

          {/* Delete (Recall) Button - only for sender */}
          {isMe && (
            <button
              onClick={() =>
                confirm({
                  title: t("delete_confirm_title"),
                  message: t("delete_confirm"),
                  confirmText: t("delete_confirm_ok"),
                  cancelText: t("delete_confirm_cancel"),
                  onConfirm: async () => {
                    onDelete(message.id);
                  },
                })
              }
              className="p-1.5 rounded-full text-slate-400 hover:text-red-500 hover:bg-slate-100 transition-colors"
              title={t("delete_message")}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

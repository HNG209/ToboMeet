"use client";

import React from "react";
import { X, CornerDownRight, FileText, Image, Video } from "lucide-react";
import { DirectMessageResponse } from "@/types/chat";
import { useTranslations } from "next-intl";

interface ReplyInputBannerProps {
  replyTo: DirectMessageResponse | null;
  onCancel: () => void;
}

export function ReplyInputBanner({ replyTo, onCancel }: ReplyInputBannerProps) {
  const t = useTranslations("direct_chat");
  if (!replyTo) return null;

  const senderName = replyTo.sender?.displayName || t("user_fallback");
  let previewText = replyTo.content || "";
  if (!previewText && replyTo.attachments?.length) {
    const first = replyTo.attachments[0];
    if (first.fileType === "image") previewText = `[${t("attach_image")}]`;
    else if (first.fileType === "video") previewText = `[${t("attach_video")}]`;
    else previewText = `[${t("attach_file")}: ${first.fileName}]`;
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-slate-100/90 border-t border-slate-200 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <CornerDownRight className="w-4 h-4 text-brand-500 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold text-slate-700 truncate">
            {t("replying_to")}{" "}
            <span className="text-brand-600">{senderName}</span>
          </p>
          <p className="text-slate-500 truncate text-[11px]">{previewText}</p>
        </div>
      </div>

      <button
        onClick={onCancel}
        className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors shrink-0"
        title={t("cancel_reply")}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

interface ReplyBubbleQuoteProps {
  replyTo?: {
    _id: string;
    content: string;
    senderId: string;
    type: "text" | "file" | "video" | "image";
    attachments?: any[];
    deletedAt?: string | null;
  } | null;
  isMe?: boolean;
}

export function ReplyBubbleQuote({ replyTo, isMe }: ReplyBubbleQuoteProps) {
  const t = useTranslations("direct_chat");
  if (!replyTo) return null;

  if (replyTo.deletedAt) {
    return (
      <div
        className={`text-[11px] italic px-2.5 py-1 mb-1.5 rounded border-l-2 opacity-75 ${
          isMe
            ? "border-white/60 bg-white/10 text-white/80"
            : "border-slate-300 bg-slate-100 text-slate-500"
        }`}
      >
        {t("replied_message_deleted")}
      </div>
    );
  }

  let preview = replyTo.content;
  if (!preview && replyTo.attachments?.length) {
    const first = replyTo.attachments[0];
    if (first.fileType === "image") preview = `📷 ${t("attach_image")}`;
    else if (first.fileType === "video") preview = `🎥 ${t("attach_video")}`;
    else preview = `📎 ${first.fileName || t("attach_file")}`;
  }

  return (
    <div
      className={`text-xs px-2.5 py-1 mb-1.5 rounded border-l-3 max-w-sm truncate ${
        isMe
          ? "border-brand-300 bg-brand-700/30 text-white/90"
          : "border-brand-500 bg-slate-100 text-slate-700"
      }`}
    >
      <span className="font-semibold block text-[10px] opacity-80 uppercase tracking-wider mb-0.5">
        Trả lời
      </span>
      <span className="truncate block">{preview || "..."}</span>
    </div>
  );
}

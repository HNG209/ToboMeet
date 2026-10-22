"use client";

import React from "react";
import { ChatMessageReaction } from "@/types/chat";
import { SmilePlus } from "lucide-react";

export const COMMON_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "😡"];

interface ReactionBarProps {
  reactions?: ChatMessageReaction[];
  currentUserId?: string;
  onReact: (emoji: string) => void;
  onClickReactionBadge?: (emoji: string) => void;
  isMe?: boolean;
}

export default function ReactionBar({
  reactions = [],
  currentUserId,
  onReact,
  onClickReactionBadge,
  isMe,
}: ReactionBarProps) {
  const activeReactions = (reactions || []).filter(
    (r) => r.userIds && r.userIds.length > 0,
  );
  if (activeReactions.length === 0) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-1 mt-1 ${
        isMe ? "justify-end" : "justify-start"
      }`}
    >
      {activeReactions.map((r) => {
        const hasReacted = currentUserId ? r.userIds.includes(currentUserId) : false;
        return (
          <button
            key={r.emoji}
            type="button"
            onClick={() => {
              if (onClickReactionBadge) {
                onClickReactionBadge(r.emoji);
              } else {
                onReact(r.emoji);
              }
            }}
            title="Xem người đã bày tỏ cảm xúc"
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all border cursor-pointer ${
              hasReacted
                ? "bg-brand-50 border-brand-300 text-brand-700 font-semibold shadow-2xs hover:bg-brand-100"
                : "bg-white/90 border-slate-200 text-slate-600 hover:bg-slate-100"
            }`}
          >
            <span>{r.emoji}</span>
            <span className="text-[11px]">{r.userIds.length}</span>
          </button>
        );
      })}
    </div>
  );
}

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  onClose?: () => void;
}

export function ReactionPicker({ onSelect, onClose }: ReactionPickerProps) {
  return (
    <div className="flex items-center gap-1 p-1 bg-white rounded-full shadow-lg border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
      {COMMON_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => {
            onSelect(emoji);
            onClose?.();
          }}
          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-slate-100 transition-transform hover:scale-125 text-sm"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

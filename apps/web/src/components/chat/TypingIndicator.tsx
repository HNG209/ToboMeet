"use client";

import React from "react";
import { useTranslations } from "next-intl";
import UserAvatar from "@/components/common/UserAvatar";

interface TypingIndicatorProps {
  displayName?: string;
  avatarUrl?: string;
}

export default function TypingIndicator({
  displayName,
  avatarUrl,
}: TypingIndicatorProps) {
  const t = useTranslations("direct_chat");

  return (
    <div className="flex items-end gap-2.5 px-4 py-2">
      <UserAvatar
        avatarUrl={avatarUrl}
        displayName={displayName}
        size="w-7 h-7"
      />

      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex items-center gap-1.5">
        <div className="flex items-center gap-1">
          <span
            className="w-2 h-2 rounded-full bg-slate-400 animate-bounce"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="w-2 h-2 rounded-full bg-slate-400 animate-bounce"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="w-2 h-2 rounded-full bg-slate-400 animate-bounce"
            style={{ animationDelay: "300ms" }}
          />
        </div>
        <span className="text-xs text-slate-400 ml-1 font-medium">
          {displayName ? `${displayName} ${t("typing")}` : t("typing")}
        </span>
      </div>
    </div>
  );
}

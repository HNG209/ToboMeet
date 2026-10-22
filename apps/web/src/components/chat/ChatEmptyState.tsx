"use client";

import React from "react";
import { MessageSquare, Plus, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

interface ChatEmptyStateProps {
  onStartNewChat?: () => void;
}

export default function ChatEmptyState({ onStartNewChat }: ChatEmptyStateProps) {
  const t = useTranslations("direct_chat");

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50">
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-3xl bg-brand-50 border border-brand-100 flex items-center justify-center shadow-md shadow-brand-500/5 transition-transform hover:scale-105 duration-300">
          <MessageSquare className="w-10 h-10 text-brand-500" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
      </div>

      <h3 className="text-xl font-bold text-slate-800 mb-2">
        {t("select_conversation")}
      </h3>
      <p className="text-sm text-slate-500 max-w-sm mb-6 leading-relaxed">
        {t("no_conversations_desc")}
      </p>

      {onStartNewChat && (
        <button
          onClick={onStartNewChat}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 active:scale-98 text-white font-medium text-sm shadow-md shadow-brand-500/20 transition-all duration-200"
        >
          <Plus className="w-4 h-4" />
          <span>{t("new_chat")}</span>
        </button>
      )}
    </div>
  );
}

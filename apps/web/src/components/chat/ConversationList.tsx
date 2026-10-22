"use client";

import React, { useState } from "react";
import { DirectConversationResponse } from "@/types/chat";
import ConversationItem from "./ConversationItem";
import {
  Search,
  MessageSquareDashed,
  X,
  UserPlus,
  Loader2,
  MessageCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useGlobalUserSearch } from "@/hooks/useGlobalUserSearch";

interface ConversationListProps {
  conversations: DirectConversationResponse[];
  selectedId: string | null;
  currentUserId?: string;
  onSelect: (conversation: DirectConversationResponse) => void;
  onSelectUser: (user: any) => void;
  isLoading?: boolean;
}

export default function ConversationList({
  conversations,
  selectedId,
  currentUserId,
  onSelect,
  onSelectUser,
  isLoading,
}: ConversationListProps) {
  const t = useTranslations("direct_chat");
  const [filterQuery, setFilterQuery] = useState("");

  // Tìm kiếm người dùng trên toàn hệ thống database khi có từ khóa
  const trimmedQuery = filterQuery.trim();
  const { users: globalUsers, isSearching } = useGlobalUserSearch({
    q: trimmedQuery,
    limit: 10,
    skip: !trimmedQuery,
  });

  // 1. Lọc các cuộc trò chuyện đang có sẵn
  const filteredConversations = conversations.filter((c) => {
    if (!trimmedQuery) return true;
    const q = trimmedQuery.toLowerCase();
    const name = c.recipient?.displayName?.toLowerCase() || "";
    const email = c.recipient?.email?.toLowerCase() || "";
    const preview = c.lastMessagePreview?.toLowerCase() || "";
    return name.includes(q) || email.includes(q) || preview.includes(q);
  });

  // 2. Lọc danh sách người dùng trong hệ thống:
  // Loại bỏ chính mình và những người đã có trong filteredConversations
  const existingRecipientIds = new Set(
    filteredConversations.map((c) => c.recipient?.supabaseId).filter(Boolean),
  );

  const newSystemUsers = globalUsers.filter((u: any) => {
    const uid = u.supabaseId || u._id;
    if (uid === currentUserId) return false;
    if (existingRecipientIds.has(uid)) return false;
    return true;
  });

  const isFiltering = Boolean(trimmedQuery);
  const hasNoResults =
    isFiltering &&
    !isSearching &&
    filteredConversations.length === 0 &&
    newSystemUsers.length === 0;

  return (
    <div className="w-full md:w-80 lg:w-96 h-full flex flex-col border-r border-slate-200/80 bg-white shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
            <MessageCircle className="w-5 h-5 text-brand-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 tracking-tight">
            {t("title")}
          </h2>
        </div>

        {/* Unified Search Input */}
        <div className="relative">
          {isSearching ? (
            <Loader2 className="w-4 h-4 text-brand-500 absolute left-3 top-1/2 -translate-y-1/2 animate-spin" />
          ) : (
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          )}
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder={t("search_placeholder")}
            className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-100/80 border border-transparent focus:border-brand-400 focus:bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-none transition-all"
          />
          {filterQuery && (
            <button
              onClick={() => setFilterQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* List Area */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-12 h-12 rounded-full bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-slate-200 rounded-md w-3/4" />
                  <div className="h-3 bg-slate-100 rounded-md w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : hasNoResults ? (
          <div className="flex flex-col items-center justify-center h-64 p-6 text-center text-slate-400">
            <MessageSquareDashed className="w-10 h-10 text-slate-300 stroke-1 mb-2" />
            <p className="text-sm font-medium text-slate-600">
              {t("no_results_title")}
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-[220px]">
              {t("no_results_desc")}
            </p>
          </div>
        ) : !isFiltering && conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 p-6 text-center text-slate-400">
            <MessageSquareDashed className="w-10 h-10 text-slate-300 stroke-1 mb-2" />
            <p className="text-sm font-medium text-slate-600">
              {t("no_conversations")}
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-[220px]">
              {t("start_chat_hint")}
            </p>
          </div>
        ) : (
          <>
            {/* Nhóm 1: Cuộc trò chuyện khớp với tìm kiếm */}
            {filteredConversations.length > 0 && (
              <div className="space-y-1">
                {isFiltering && (
                  <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    {t("section_conversations")} ({filteredConversations.length})
                  </div>
                )}
                {filteredConversations.map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conversation={conv}
                    isActive={conv.id === selectedId}
                    onClick={() => {
                      onSelect(conv);
                      setFilterQuery("");
                    }}
                  />
                ))}
              </div>
            )}

            {/* Nhóm 2: Người dùng tìm thấy trong database hệ thống */}
            {isFiltering && newSystemUsers.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
                {newSystemUsers.map((user: any) => {
                  const uid = user.supabaseId || user._id;
                  return (
                    <button
                      key={uid}
                      onClick={() => {
                        onSelectUser(user);
                        setFilterQuery("");
                      }}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-brand-50/70 transition-colors text-left group"
                    >
                      <div className="w-10 h-10 rounded-full bg-slate-200 border border-slate-300 overflow-hidden shrink-0 flex items-center justify-center text-xs font-semibold text-slate-600 group-hover:border-brand-300 shadow-xs">
                        {user.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={user.avatarUrl}
                            alt={user.displayName || "User"}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          user.displayName?.charAt(0).toUpperCase() || "U"
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate group-hover:text-brand-600 transition-colors">
                          {user.displayName || t("user_fallback")}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {user.email}
                        </p>
                      </div>

                      <div className="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-brand-500 group-hover:text-white flex items-center justify-center text-slate-400 transition-all shrink-0">
                        <MessageCircle className="w-3.5 h-3.5" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { Search, X, Loader2, UserPlus, MessageCircle } from "lucide-react";
import { useGlobalUserSearch } from "@/hooks/useGlobalUserSearch";
import { useTranslations } from "next-intl";
import UserAvatar from "@/components/common/UserAvatar";

interface UserSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectUser: (user: any) => void;
  isLoading?: boolean;
}

export default function UserSearchModal({
  isOpen,
  onClose,
  onSelectUser,
  isLoading,
}: UserSearchModalProps) {
  const t = useTranslations("direct_chat");
  const [searchTerm, setSearchTerm] = useState("");

  const { users, isSearching } = useGlobalUserSearch({
    q: searchTerm,
    limit: 20,
    skip: !isOpen,
  });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
              <UserPlus className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-slate-800 text-base">{t("new_chat")}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("search_placeholder")}
              className="w-full pl-10 pr-9 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-800 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 placeholder-slate-400 transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-slate-50 min-h-[220px]">
          {isSearching || isLoading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
              <span className="text-xs">{t("searching")}</span>
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-400 text-center px-4">
              <MessageCircle className="w-8 h-8 text-slate-300 stroke-1" />
              <p className="text-sm font-medium text-slate-600">
                {searchTerm ? t("no_users_found") : t("search_users")}
              </p>
              <p className="text-xs text-slate-400 max-w-xs">
                {searchTerm
                  ? t("search_users_not_found_hint")
                  : t("search_users_hint")}
              </p>
            </div>
          ) : (
            users.map((user: any) => (
              <button
                key={user.supabaseId || user._id}
                onClick={() => onSelectUser(user)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-brand-50/60 transition-colors text-left group"
              >
                <UserAvatar
                  avatarUrl={user.avatarUrl}
                  displayName={user.displayName}
                  size="w-10 h-10"
                />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate group-hover:text-brand-600 transition-colors">
                    {user.displayName || t("user_fallback")}
                  </p>
                  <p className="text-xs text-slate-400 truncate mt-0.5">
                    {user.email}
                  </p>
                </div>

                <div className="w-8 h-8 rounded-full bg-slate-100 group-hover:bg-brand-500 group-hover:text-white flex items-center justify-center text-slate-400 transition-all shrink-0">
                  <MessageCircle className="w-4 h-4" />
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

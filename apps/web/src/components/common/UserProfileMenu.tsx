"use client";

import React, { useState, useRef, useEffect } from "react";
import { UserResponse } from "@tobomeet/shared/types";
import { Settings, LogOut, ChevronDown } from "lucide-react";
import UserAvatar from "./UserAvatar";
import { useTranslations } from "next-intl";

interface UserProfileMenuProps {
  user?: UserResponse;
  onOpenSettings: () => void;
  onLogout: () => void;
}

export default function UserProfileMenu({
  user,
  onOpenSettings,
  onLogout,
}: UserProfileMenuProps) {
  const t = useTranslations("dashboard");
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1.5 rounded-full hover:bg-slate-100 transition-colors focus:outline-none"
        title={user?.displayName || "Tài khoản"}
      >
        <UserAvatar
          avatarUrl={user?.avatarUrl}
          displayName={user?.displayName || user?.email}
          size="w-8 h-8"
        />
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] border border-slate-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-150 text-slate-700">
          {/* User info header */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
            <UserAvatar
              avatarUrl={user?.avatarUrl}
              displayName={user?.displayName || user?.email}
              size="w-10 h-10"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-800 truncate">
                {user?.displayName || user?.email?.split("@")[0] || "User"}
              </p>
              <p className="text-xs text-slate-400 truncate">{user?.email}</p>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <button
              onClick={() => {
                setIsOpen(false);
                onOpenSettings();
              }}
              className="flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors w-full text-left"
            >
              <Settings className="w-4 h-4 text-slate-400" />
              <span>{t("settings", { defaultValue: "Cài đặt" })}</span>
            </button>

            <div className="h-px bg-slate-100 my-1 w-full" />

            <button
              onClick={() => {
                setIsOpen(false);
                onLogout();
              }}
              className="flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors w-full text-left"
            >
              <LogOut className="w-4 h-4" />
              <span>{t("logout", { defaultValue: "Đăng xuất" })}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

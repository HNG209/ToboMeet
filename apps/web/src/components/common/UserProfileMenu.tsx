"use client";

import React, { useState, useRef, useEffect } from "react";
import { UserResponse } from "@tobomeet/shared/types";
import {
  Settings,
  LogOut,
  ChevronDown,
  Link2,
  Loader2,
  User,
  ExternalLink,
} from "lucide-react";
import UserAvatar from "./UserAvatar";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useEnsurePersonalMeetingMutation } from "@/lib/redux/api/meetingsApi";
import EditProfileModal from "./EditProfileModal";

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
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [ensurePersonalMeeting, { isLoading: isCopyingLink }] =
    useEnsurePersonalMeetingMutation();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCopyPersonalMeetingLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await ensurePersonalMeeting().unwrap();
      if (res?.meetingCode) {
        const url = `${window.location.origin}/meeting/${res.meetingCode}`;
        await navigator.clipboard.writeText(url);
        toast.success(
          t("copied_personal_meeting_link", {
            defaultValue: "Đã sao chép link cuộc họp cá nhân!",
          })
        );
        setIsOpen(false);
      }
    } catch (err: any) {
      toast.error(
        err?.data?.message ||
          err?.message ||
          t("error_personal_meeting_link", {
            defaultValue: "Không thể lấy link cuộc họp cá nhân",
          })
      );
    }
  };

  return (
    <>
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 p-1.5 rounded-full hover:bg-slate-100 transition-colors focus:outline-none cursor-pointer"
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
          <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] border border-slate-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-150 text-slate-700">
            {/* User info header — bấm vào để mở EditProfileModal */}
            <div
              onClick={() => {
                setIsOpen(false);
                setIsEditProfileOpen(true);
              }}
              className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 hover:bg-slate-50 cursor-pointer transition-colors group select-none"
              title={t("view_edit_profile", {
                defaultValue: "Bấm để xem & chỉnh sửa thông tin cá nhân",
              })}
            >
              <div className="relative">
                <UserAvatar
                  avatarUrl={user?.avatarUrl}
                  displayName={user?.displayName || user?.email}
                  size="w-10 h-10"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-800 truncate group-hover:text-brand-600 transition-colors">
                    {user?.displayName || user?.email?.split("@")[0] || "User"}
                  </p>
                </div>
                <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                <span className="text-[10px] text-brand-600 font-medium group-hover:underline mt-0.5 inline-block">
                  {t("edit_profile_hint", {
                    defaultValue: "Chỉnh sửa trang cá nhân →",
                  })}
                </span>
              </div>
            </div>

            {/* Menu items */}
            <div className="py-1">
              {/* Sao chép link cuộc họp cá nhân */}
              <button
                type="button"
                onClick={handleCopyPersonalMeetingLink}
                disabled={isCopyingLink}
                className="flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-brand-600 transition-colors w-full text-left cursor-pointer group disabled:opacity-50"
              >
                {isCopyingLink ? (
                  <Loader2 className="w-4 h-4 text-brand-500 animate-spin" />
                ) : (
                  <Link2 className="w-4 h-4 text-slate-400 group-hover:text-brand-500 transition-colors" />
                )}
                <span className="truncate">
                  {t("copy_personal_meeting_link", {
                    defaultValue: "Sao chép link cuộc họp cá nhân",
                  })}
                </span>
              </button>

              {/* Cài đặt */}
              <button
                onClick={() => {
                  setIsOpen(false);
                  onOpenSettings();
                }}
                className="flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors w-full text-left cursor-pointer"
              >
                <Settings className="w-4 h-4 text-slate-400" />
                <span>{t("settings", { defaultValue: "Cài đặt" })}</span>
              </button>

              <div className="h-px bg-slate-100 my-1 w-full" />

              {/* Đăng xuất */}
              <button
                onClick={() => {
                  setIsOpen(false);
                  onLogout();
                }}
                className="flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors w-full text-left cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>{t("logout", { defaultValue: "Đăng xuất" })}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Chỉnh sửa trang cá nhân */}
      <EditProfileModal
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
        user={user}
      />
    </>
  );
}

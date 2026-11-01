"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  X,
  MessageSquare,
  Calendar,
  Shield,
  Mail,
  Loader2,
} from "lucide-react";
import { useCreateOrGetConversationMutation } from "@/lib/redux/api/directChatApi";
import UserAvatar from "@/components/common/UserAvatar";
import RoleBadge from "./RoleBadge";

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: any;
  currentUserId?: string;
  room?: any;
}

export default function UserProfileModal({
  isOpen,
  onClose,
  member,
  currentUserId,
}: UserProfileModalProps) {
  const t = useTranslations("room");
  const locale = useLocale();
  const router = useRouter();

  const [createOrGetConversation, { isLoading: isStartingChat }] =
    useCreateOrGetConversationMutation();

  if (!isOpen || !member) return null;

  const isSelf = member.userId === currentUserId;

  const handleStartChat = async () => {
    if (!member.userId || isSelf) return;

    try {
      const res = await createOrGetConversation({
        recipientId: member.userId,
      }).unwrap();

      const convId = res.id || (res as any)._id;
      onClose();
      router.push(`/${locale}/chat?convId=${convId}`);
    } catch (err: any) {
      toast.error(
        err?.data?.message || err?.message || "Không thể tạo cuộc trò chuyện",
      );
      onClose();
      router.push(`/${locale}/chat`);
    }
  };

  const formattedJoinedDate = member.joinedAt
    ? new Date(member.joinedAt).toLocaleDateString(
        locale === "vi" ? "vi-VN" : "en-US",
        {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        },
      )
    : null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl p-6 sm:p-7 max-w-sm w-full shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150 relative"
      >
        {/* Nút đóng góc phải */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>

        {/* Thông tin chính: Avatar & Tên */}
        <div className="flex flex-col items-center text-center pt-2 pb-4">
          <div className="relative">
            <UserAvatar
              avatarUrl={member.avatarUrl}
              displayName={member.displayName}
              size="w-20 h-20 text-2xl"
              className="rounded-full ring-4 ring-slate-100 shadow-sm"
            />
          </div>
          <h3 className="font-bold text-slate-900 text-lg mt-3.5 leading-snug">
            {member.displayName || "Người dùng"}
          </h3>
          {member.email && (
            <p className="text-xs text-slate-500 font-medium mt-1 flex items-center gap-1.5 justify-center">
              <Mail size={13} className="text-slate-400" />
              <span>{member.email}</span>
            </p>
          )}
        </div>

        {/* Khối chi tiết ngắn gọn */}
        <div className="bg-slate-50/80 border border-slate-100 rounded-2xl p-4 my-2 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <Shield size={14} className="text-slate-400" />
              <span>{t("channel_role", { defaultValue: "Channel Role" })}</span>
            </span>
            <RoleBadge role={member.role || "member"} />
          </div>

          {formattedJoinedDate && (
            <div className="flex items-center justify-between text-xs pt-2.5 border-t border-slate-200/60">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <Calendar size={14} className="text-slate-400" />
                <span>{t("joined_date", { defaultValue: "Tham gia ngày" })}</span>
              </span>
              <span className="font-semibold text-slate-700">
                {formattedJoinedDate}
              </span>
            </div>
          )}
        </div>

        {/* Các nút hành động */}
        <div className="flex gap-3 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
          >
            {t("report_cancel", { defaultValue: "Đóng" })}
          </button>

          {!isSelf && (
            <button
              type="button"
              onClick={handleStartChat}
              disabled={isStartingChat}
              className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isStartingChat ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <MessageSquare size={16} />
              )}
              <span>{t("send_message", { defaultValue: "Nhắn tin" })}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


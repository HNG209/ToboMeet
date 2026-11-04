"use client";

import React, { useState, useCallback } from "react";
import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";
import { Loader2, WifiOff, X, Layers, RefreshCw, ExternalLink, Settings, Eye } from "lucide-react";
import { useMeetingWhiteboardLogic } from "@/hooks/useMeetingWhiteboardLogic";
import { useSafeMeetingWhiteboard } from "@/components/meeting/contexts/MeetingWhiteboardContext";
import WhiteboardSettingsModal from "@/components/meeting/WhiteboardSettingsModal";
import {
  useGetWhiteboardAccessQuery,
  useGetWhiteboardSettingsQuery,
  useUpdateWhiteboardSettingsMutation,
} from "@/lib/redux/api/meetingsApi";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { WhiteboardPermissionLevel, WhiteboardSettings } from "@tobomeet/shared/types";

export interface MeetingWhiteboardProps {
  meetingCode: string;
  token?: string | null;
  whiteboardUrl?: string | null;
  isStandalone?: boolean;
  onClose?: () => void;
}

interface MeetingWhiteboardCanvasProps extends MeetingWhiteboardProps {
  onRetryVersion?: () => void;
  onPermissionRevoked?: () => void;
  onPermissionChanged?: (newPermLevel: WhiteboardPermissionLevel) => void;
}

function MeetingWhiteboardCanvas({
  meetingCode,
  whiteboardUrl,
  isStandalone = false,
  onClose,
  onRetryVersion,
  onPermissionRevoked,
  onPermissionChanged,
}: MeetingWhiteboardCanvasProps) {
  const {
    store,
    user,
    isReadOnly,
    isTransferred,
    leaveWhiteboard,
    handleRetry,
    t,
  } = useMeetingWhiteboardLogic({
    meetingCode,
    whiteboardUrl,
    onClose,
    onRetry: onRetryVersion,
    onPermissionRevoked,
    onPermissionChanged,
  });

  const tToolbar = useTranslations("meeting.toolbar");
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Lấy quyền Whiteboard trực tiếp từ API (không phụ thuộc participant metadata)
  const { data: wbAccessData } = useGetWhiteboardAccessQuery(
    meetingCode || "",
    { skip: !meetingCode },
  );

  const canManageSettings =
    wbAccessData?.hasAdminPowers ||
    wbAccessData?.role === "owner" ||
    wbAccessData?.role === "admin";

  const { data: serverWbSettings } = useGetWhiteboardSettingsQuery(
    meetingCode || "",
    { skip: !meetingCode || !canManageSettings },
  );

  const [updateWhiteboardSettingsApi] = useUpdateWhiteboardSettingsMutation();

  const handleSaveSettings = async (newSettings: WhiteboardSettings) => {
    await updateWhiteboardSettingsApi({
      code: meetingCode,
      settings: newSettings,
    }).unwrap();
  };

  const handleOpenInNewTab = useCallback(() => {
    window.open(`/whiteboard/${meetingCode}`, "_blank");
  }, [meetingCode]);

  if (store.status === "loading") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#0e0e11] text-white select-none">
        <div className="p-6 rounded-2xl bg-[#161619] border border-[#232328] flex flex-col items-center gap-4 max-w-sm shadow-2xl">
          <div className="relative">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
            <div className="absolute inset-0 rounded-full bg-blue-500/20 blur-md -z-10" />
          </div>
          <div className="text-center">
            <h3 className="text-sm font-bold text-white mb-1">{t("loading_title")}</h3>
            <p className="text-xs text-slate-400">{t("loading_desc")}</p>
          </div>
          <button
            onClick={leaveWhiteboard}
            className="px-4 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-300 transition-colors cursor-pointer"
          >
            {isStandalone ? t("close") : t("back_to_meeting")}
          </button>
        </div>
      </div>
    );
  }

  if (isTransferred) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#0e0e11] text-white p-4 select-none">
        <div className="p-6 rounded-2xl bg-[#161619] border border-amber-500/30 flex flex-col items-center gap-4 max-w-md text-center shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <ExternalLink className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white mb-1.5">
              {t("session_transferred_title")}
            </h3>
            <p className="text-xs text-slate-400 mb-3 leading-relaxed">
              {t("session_transferred_desc")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRetry}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw size={14} />
              <span>{t("reconnect_here")}</span>
            </button>
            <button
              onClick={leaveWhiteboard}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              {t("close")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (store.status === "error") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#0e0e11] text-white p-4 select-none">
        <div className="p-6 rounded-2xl bg-[#161619] border border-red-500/30 flex flex-col items-center gap-4 max-w-md text-center shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
            <WifiOff className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white mb-1.5">{t("error_title")}</h3>
            <p className="text-xs text-slate-400 mb-3">
              {store.error?.message || t("error_default_desc")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRetry}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw size={14} />
              <span>{t("retry")}</span>
            </button>
            <button
              onClick={leaveWhiteboard}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              {t("close_whiteboard")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#111113]">
      {/* Top Floating Control Bar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 sm:gap-2 bg-[#161619]/90 backdrop-blur-md border border-[#232328] rounded-xl px-2.5 sm:px-3 py-1.5 shadow-xl select-none max-w-[95vw]">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-200 shrink-0">
          <div className="w-6 h-6 rounded-lg bg-blue-600 flex items-center justify-center text-white shrink-0">
            <Layers size={14} />
          </div>
          <span className="font-semibold text-xs hidden lg:inline">{t("title")}</span>
        </div>

        {isReadOnly && (
          <>
            <div className="h-4 w-px bg-[#232328]" />
            <div
              title={t("view_only_mode")}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] font-medium shrink-0"
            >
              <Eye size={12} className="shrink-0" />
              <span className="hidden lg:inline">{t("view_only_mode")}</span>
            </div>
          </>
        )}

        {/* Nút Mở trên tab mới: Chỉ hiển thị khi đang ở chế độ nhúng (không phải standalone) */}
        {!isStandalone && (
          <>
            <div className="h-4 w-px bg-[#232328]" />
            <button
              onClick={handleOpenInNewTab}
              title={t("open_in_new_tab")}
              className="flex items-center gap-1.5 px-2 py-1 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0"
            >
              <ExternalLink size={14} />
              <span className="hidden lg:inline">{t("open_new_tab")}</span>
            </button>
          </>
        )}

        {/* Nút Cài đặt Whiteboard: Chỉ hiển thị cho Admin hoặc Owner */}
        {canManageSettings && (
          <>
            <div className="h-4 w-px bg-[#232328]" />
            <button
              onClick={() => setIsSettingsModalOpen(true)}
              title={tToolbar("whiteboard_settings")}
              className="flex items-center gap-1.5 px-2 py-1 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0"
            >
              <Settings size={14} />
              <span className="hidden lg:inline">{tToolbar("whiteboard_settings")}</span>
            </button>
          </>
        )}

        <div className="h-4 w-px bg-[#232328]" />

        <button
          onClick={leaveWhiteboard}
          title={t("close_tooltip")}
          className="flex items-center gap-1.5 px-2 py-1 bg-white/5 hover:bg-red-500/20 text-slate-300 hover:text-red-400 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0"
        >
          <X size={14} />
          <span className="hidden lg:inline">{t("close")}</span>
        </button>
      </div>

      {/* Tldraw Canvas */}
      <div className="w-full h-full">
        <Tldraw
          store={store.store}
          user={user}
          licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
          autoFocus
        />
      </div>

      {/* Modal Cài đặt Whiteboard (Chỉ hiện với Admin / Owner) */}
      {canManageSettings && (
        <WhiteboardSettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          currentSettings={
            serverWbSettings || {
              allowedRoles: ["admin", "member", "guest"],
              memberPermission: "edit",
              guestPermission: "edit",
            }
          }
          onSave={handleSaveSettings}
        />
      )}
    </div>
  );
}

export default function MeetingWhiteboard({
  meetingCode,
  whiteboardUrl,
  isStandalone = false,
  onClose,
}: MeetingWhiteboardProps) {
  const [sessionVersion, setSessionVersion] = useState(0);
  const safeContext = useSafeMeetingWhiteboard();
  const t = useTranslations("meeting.whiteboard");

  const handleLeaveWhiteboard = useCallback(() => {
    if (onClose) {
      onClose();
    } else if (safeContext?.leaveWhiteboard) {
      safeContext.leaveWhiteboard();
    } else if (typeof window !== "undefined") {
      window.close();
    }
  }, [onClose, safeContext]);

  const handlePermissionRevoked = useCallback(() => {
    toast.error(t("access_revoked_by_host"));
    handleLeaveWhiteboard();
  }, [t, handleLeaveWhiteboard]);

  const handlePermissionChanged = useCallback(
    (permLevel: WhiteboardPermissionLevel) => {
      if (permLevel === "view") {
        toast.info(t("switched_to_view_only"));
      } else {
        toast.success(t("switched_to_edit"));
      }
      setSessionVersion((v) => v + 1);
    },
    [t]
  );

  return (
    <MeetingWhiteboardCanvas
      key={sessionVersion}
      meetingCode={meetingCode}
      whiteboardUrl={whiteboardUrl}
      isStandalone={isStandalone}
      onClose={onClose}
      onRetryVersion={() => setSessionVersion((v) => v + 1)}
      onPermissionRevoked={handlePermissionRevoked}
      onPermissionChanged={handlePermissionChanged}
    />
  );
}

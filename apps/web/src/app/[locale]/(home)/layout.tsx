"use client";

import React, { useState, useEffect, createContext, useContext } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Video, Settings, Calendar, Bell, MessageCircle } from "lucide-react";
import NotificationDrawer from "@/components/notification/NotificationDrawer";
import JoinDialog from "@/components/dashboard/JoinDialog";
import SettingsDialog from "@/components/dashboard/SettingsDialog";
import CreateRoomDialog from "@/components/dashboard/CreateRoomDialog";
import { useNotificationCacheManager } from "@/hooks/useNotificationCacheManager";
import { useGetMeQuery } from "@/lib/redux/api/usersApi";
import StoreProvider from "@/lib/redux/StoreProvider";
import ToboAgentChat from "@/components/ai-agent/ToboAgentChat";

// Context để các trang con (children) gọi lệnh mở Modal dùng chung
interface HomeContextType {
  setShowJoinDialog: (show: boolean) => void;
  setShowCreateDialog: (show: boolean) => void;
}

const HomeContext = createContext<HomeContextType>({} as HomeContextType);
export const useHomeContext = () => useContext(HomeContext);

// ─── Inner Layout (cần Redux context) ────────────────────────────────────────
function HomeLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname(); // Lấy đường dẫn hiện tại
  const { data: myProfile } = useGetMeQuery();
  const { updateUnreadNotificationBadge } = useNotificationCacheManager();

  // Chuyển hướng nếu có link mời tham gia
  useEffect(() => {
    const pendingCode = localStorage.getItem("pending_join_code");
    if (pendingCode) {
      localStorage.removeItem("pending_join_code");
      router.push(`/room/join?code=${pendingCode}`);
    }
  }, [router]);

  // Các state quản lý UI dùng chung
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const handleLogout = () => {
    window.location.href = `/api/auth/logout?locale=${locale}`;
  };

  const navItems = [
    {
      id: "teams",
      icon: Video,
      label: t("tab_teams", { defaultValue: "Teams" }),
      href: `/${locale}/dashboard`,
      // Bật active nếu đúng trang chủ dashboard
      isActive: pathname === `/${locale}/dashboard`,
    },
    {
      id: "notifications",
      icon: Bell,
      label: t("tab_notifications", { defaultValue: "Notifications" }),
      onClick: () => {
        // Tắt chấm đỏ ngay lập tức khi người dùng click vào menu (trước khi gọi API)
        if (myProfile?.hasUnreadNotifications) {
          updateUnreadNotificationBadge(false);
        }
        setShowNotifications(!showNotifications);
      },
      // Bật active khi drawer thông báo đang mở
      isActive: showNotifications,
      badge: myProfile?.hasUnreadNotifications || false, // Cờ hiển thị chấm đỏ
    },
    {
      id: "calendar",
      icon: Calendar,
      label: t("tab_calendar", { defaultValue: "Calendar" }),
      href: `/${locale}/calendar`,
      // Bật active nếu đường dẫn bắt đầu bằng /calendar (hỗ trợ cho cả các route con bên trong calendar nếu có)
      isActive: pathname.startsWith(`/${locale}/calendar`),
    },
    {
      id: "chat",
      icon: MessageCircle,
      label: t("tab_chat", { defaultValue: "Chat" }),
      href: `/${locale}/chat`,
      // Bật active nếu đường dẫn bắt đầu bằng /chat
      isActive: pathname.startsWith(`/${locale}/chat`),
    },
  ];

  return (
    <HomeContext.Provider value={{ setShowJoinDialog, setShowCreateDialog }}>
      {/* Container chính dạng flex-row để Sidebar full height và thích ứng dynamic viewport trên mobile browser */}
      <div className="h-screen h-[100dvh] bg-[#f5f5f5] font-sans flex overflow-hidden">
        {/* ── Left Sidebar (Full Height) ── */}
        <aside className="w-16 md:w-20 h-full bg-[#f8f9fa] border-r border-slate-200 flex flex-col justify-between items-center py-4 shrink-0 z-50 shadow-[2px_0_8px_rgba(0,0,0,0.02)] relative">
          <div className="w-full flex flex-col items-center gap-1.5">
            {/* Tự động render danh sách Menu */}
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.onClick) item.onClick();
                    if (item.href) router.push(item.href);
                  }}
                  className={`flex flex-col items-center justify-center gap-1.5 w-full py-3 px-1 md:px-1.5 transition-all group border-l-2 ${item.isActive
                    ? "text-brand-600 bg-brand-50/50 border-brand-500 font-semibold"
                    : "text-slate-600 hover:bg-slate-50 border-transparent font-medium"
                    }`}
                >
                  <div className="relative">
                    <Icon className="w-5.5 h-5.5 group-hover:scale-110 transition-transform" />
                    {item.badge && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 border-2 border-white" />
                    )}
                  </div>
                  <span className="hidden md:block text-[10px] tracking-tight text-center leading-tight truncate max-w-[72px]">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Settings */}
          <div className="relative">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`flex flex-col items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-xl transition-colors ${showSettings
                ? "bg-slate-200/80 text-slate-800"
                : "text-slate-400 hover:bg-slate-200/60 hover:text-slate-700"
                }`}
            >
              <Settings className="w-5.5 h-5.5" />
            </button>

            {showSettings && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowSettings(false)}
                />
                <div className="absolute left-full bottom-0 mb-2 ml-4 w-56 bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-slate-100 py-2 z-50 flex flex-col text-[14px]">
                  <button
                    onClick={() => {
                      setShowSettings(false);
                      setShowSettingsDialog(true);
                    }}
                    className="flex items-center gap-3 px-4 py-2.5 text-slate-700 hover:bg-slate-50 transition-colors w-full text-left font-medium"
                  >
                    <Settings className="w-4.5 h-4.5 text-slate-500" />
                    <span>{t("settings")}</span>
                  </button>
                  <div className="h-px bg-slate-100 my-1.5 w-full"></div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50 transition-colors w-full text-left"
                  >
                    <span>{t("logout")}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </aside>

        {/* Ngăn kéo thông báo chung */}
        <NotificationDrawer
          isOpen={showNotifications}
          onClose={() => setShowNotifications(false)}
        />

        {/* ── Main Content Area ── */}
        <div className="flex-1 flex flex-col relative min-w-0 overflow-hidden">
          {children}
        </div>

        {/* Các Dialog chung toàn cục */}
        {showJoinDialog && (
          <JoinDialog onClose={() => setShowJoinDialog(false)} />
        )}
        {showCreateDialog && (
          <CreateRoomDialog onClose={() => setShowCreateDialog(false)} />
        )}
        {showSettingsDialog && (
          <SettingsDialog onClose={() => setShowSettingsDialog(false)} />
        )}

        {/* ── Tobo AI Agent floating chat widget (chỉ hiển thị trong (home)) ── */}
        <ToboAgentChat />
      </div>
    </HomeContext.Provider>
  );
}

// ─── Root Layout (bọc StoreProvider để tất cả hooks có Redux context) ─────────
export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <StoreProvider>
      <HomeLayoutInner>{children}</HomeLayoutInner>
    </StoreProvider>
  );
}

"use client";

import React, { useState, useEffect, createContext, useContext, Suspense } from "react";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Video, Calendar, Bell, MessageCircle } from "lucide-react";
import NotificationDrawer from "@/components/notification/NotificationDrawer";
import JoinDialog from "@/components/dashboard/JoinDialog";
import SettingsDialog from "@/components/dashboard/SettingsDialog";
import CreateRoomDialog from "@/components/dashboard/CreateRoomDialog";
import { useNotificationCacheManager } from "@/hooks/useNotificationCacheManager";
import { useGetMeQuery } from "@/lib/redux/api/usersApi";
import { useGetMyRoomsQuery } from "@/lib/redux/api/roomsApi";
import StoreProvider from "@/lib/redux/StoreProvider";
import ToboAgentChat from "@/components/ai-agent/ToboAgentChat";
import GlobalSearch from "@/components/common/GlobalSearch";
import UserProfileMenu from "@/components/common/UserProfileMenu";

// Persistent Tab Views
import DashboardContent from "@/components/dashboard/DashboardContent";
import CalendarView from "@/components/calendar/CalendarView";
import ChatLayout from "@/components/chat/ChatLayout";
import RoomContent from "@/components/room/RoomContent";

type TabType = "teams" | "calendar" | "chat";

function getTabFromPath(path: string): TabType {
  if (path.includes("/chat")) return "chat";
  if (path.includes("/calendar")) return "calendar";
  return "teams";
}

function getRoomIdFromPath(path: string): string | null {
  const match = path.match(/\/room\/([a-zA-Z0-9_-]+)/);
  if (match && match[1] !== "join") {
    return match[1];
  }
  return null;
}

// Context để các trang con (children) gọi lệnh mở Modal dùng chung
interface HomeContextType {
  setShowJoinDialog: (show: boolean) => void;
  setShowCreateDialog: (show: boolean) => void;
  selectedRoomId: string | null;
  selectRoom: (roomId: string | null) => void;
}

const HomeContext = createContext<HomeContextType>({} as HomeContextType);
export const useHomeContext = () => useContext(HomeContext);

function DashboardTab() {
  const { data: initialRooms } = useGetMyRoomsQuery();
  return <DashboardContent initialRooms={initialRooms} />;
}

function TabFallback() {
  return (
    <div className="h-full w-full flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
    </div>
  );
}

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

  // Xác định tab ban đầu và roomId dựa vào URL
  const initialTab = getTabFromPath(pathname);
  const initialRoomId = getRoomIdFromPath(pathname) || (typeof window !== "undefined" ? getRoomIdFromPath(window.location.pathname) : null);

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(initialRoomId);
  const isInRoom = activeTab === "teams" && Boolean(selectedRoomId);
  const [mountedTabs, setMountedTabs] = useState<Record<TabType, boolean>>({
    teams: initialTab === "teams",
    calendar: initialTab === "calendar",
    chat: initialTab === "chat",
  });

  // Hàm chọn phòng tức thì (0ms) và đồng bộ URL Teams style
  const selectRoom = (roomId: string | null) => {
    setSelectedRoomId(roomId);
    setActiveTab("teams");
    setMountedTabs((prev) => ({ ...prev, teams: true }));

    if (roomId) {
      window.history.pushState({ tab: "teams", roomId }, "", `/${locale}/room/${roomId}`);
    } else {
      window.history.pushState({ tab: "teams", roomId: null }, "", `/${locale}/dashboard`);
    }
  };

  // Đồng bộ khi pathname thay đổi từ bên ngoài (ví dụ router.push từ GlobalSearch hoặc Header)
  useEffect(() => {
    const tab = getTabFromPath(pathname);
    setActiveTab(tab);
    setMountedTabs((prev) => ({ ...prev, [tab]: true }));
    const rId = getRoomIdFromPath(pathname);
    if (rId !== selectedRoomId) {
      setSelectedRoomId(rId);
    }
  }, [pathname]);

  // Đồng bộ khi người dùng bấm nút Back / Forward trên trình duyệt
  useEffect(() => {
    const handlePopState = () => {
      const currentPath = window.location.pathname;
      const tab = getTabFromPath(currentPath);
      const rId = getRoomIdFromPath(currentPath);
      setActiveTab(tab);
      setSelectedRoomId(rId);
      setMountedTabs((prev) => ({ ...prev, [tab]: true }));
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Lắng nghe sự kiện custom "select-room" phát từ bất kỳ đâu (GlobalSearch, EventDetailModal, ...)
  useEffect(() => {
    const handleCustomSelectRoom = (e: any) => {
      const rId = e.detail?.roomId;
      if (rId) {
        selectRoom(rId);
      }
    };
    window.addEventListener("select-room", handleCustomSelectRoom);
    return () => window.removeEventListener("select-room", handleCustomSelectRoom);
  }, [locale]);

  // Chuyển tab lập tức (0ms) và đồng bộ URL bằng pushState (không gọi request server _rsc)
  const handleTabClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    targetTab: TabType,
    href: string,
  ) => {
    // Nếu click chuột giữa hoặc giữ Ctrl/Cmd để mở tab mới -> để trình duyệt xử lý bình thường
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;

    e.preventDefault();

    if (targetTab === "teams" && activeTab === "teams" && selectedRoomId) {
      // Nếu đang trong room và bấm lại vào tab Teams -> Quay về danh sách Dashboard
      selectRoom(null);
      return;
    }

    if (activeTab === targetTab) return;

    setActiveTab(targetTab);
    setMountedTabs((prev) => ({ ...prev, [targetTab]: true }));

    const targetUrl = targetTab === "teams" && selectedRoomId
      ? `/${locale}/room/${selectedRoomId}`
      : `/${locale}${href}`;
    window.history.pushState({ tab: targetTab, roomId: targetTab === "teams" ? selectedRoomId : null }, "", targetUrl);
  };

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
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const handleLogout = () => {
    window.location.href = `/api/auth/logout?locale=${locale}`;
  };

  const navItems = [
    {
      id: "teams" as const,
      icon: Video,
      label: t("tab_teams", { defaultValue: "Rooms" }),
      href: "/dashboard",
      isActive: activeTab === "teams",
    },
    {
      id: "calendar" as const,
      icon: Calendar,
      label: t("tab_calendar", { defaultValue: "Calendar" }),
      href: "/calendar",
      isActive: activeTab === "calendar",
    },
    {
      id: "chat" as const,
      icon: MessageCircle,
      label: t("tab_chat", { defaultValue: "Chat" }),
      href: "/chat",
      isActive: activeTab === "chat",
    },
  ];

  return (
    <HomeContext.Provider
      value={{
        setShowJoinDialog,
        setShowCreateDialog,
        selectedRoomId,
        selectRoom,
      }}
    >
      {/* Container chính với Top Header và Main Content */}
      <div className="h-screen h-[100dvh] bg-[#f5f5f5] font-sans flex flex-col overflow-hidden">
        {/* ── Global Top Bar (Teams Style) ── */}
        <header className="h-12 bg-white border-b border-slate-200/80 px-3 md:px-5 flex items-center justify-between shrink-0 z-50 select-none">
          {/* Góc trái: Logo ToboMeet */}
          <div className="flex items-center gap-2.5 w-44 md:w-56 shrink-0">
            <Link
              href="/dashboard"
              onClick={(e) => handleTabClick(e, "teams", "/dashboard")}
              className="flex items-center gap-2.5 group text-left hover:opacity-90 transition-opacity"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-600 to-brand-500 flex items-center justify-center text-white shadow-sm shadow-brand-500/20 group-hover:scale-105 transition-transform">
                <Video className="w-4.5 h-4.5 fill-white/20" />
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-base md:text-lg tracking-tight text-slate-800 leading-none">
                  Tobo<span className="text-brand-600">Meet</span>
                </span>
              </div>
            </Link>
          </div>

          {/* Ở giữa: Thanh tìm kiếm chung (Global Search) */}
          <div className="flex-1 max-w-xl mx-2 md:mx-4 flex justify-center">
            <GlobalSearch />
          </div>

          {/* Góc phải: Nút Chuông Thông báo + Menu Avatar User */}
          <div className="flex items-center justify-end gap-1.5 sm:gap-2.5 w-44 md:w-56 shrink-0">
            {/* Cụm thông báo lơ lửng gắn liền với Icon chuông */}
            <div className="relative">
              <button
                onClick={() => {
                  if (myProfile?.hasUnreadNotifications) {
                    updateUnreadNotificationBadge(false);
                  }
                  setShowNotifications(!showNotifications);
                }}
                className={`relative p-2 rounded-full transition-colors focus:outline-none ${showNotifications
                    ? "bg-slate-100 text-brand-600"
                    : "hover:bg-slate-100 text-slate-500 hover:text-slate-800"
                  }`}
                title={t("tab_notifications", { defaultValue: "Thông báo" })}
              >
                <Bell className="w-5 h-5" />
                {myProfile?.hasUnreadNotifications && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white ring-1 ring-red-500/20" />
                )}
              </button>

              <NotificationDrawer
                isOpen={showNotifications}
                onClose={() => setShowNotifications(false)}
              />
            </div>

            <UserProfileMenu
              user={myProfile}
              onOpenSettings={() => setShowSettingsDialog(true)}
              onLogout={handleLogout}
            />
          </div>
        </header>

        {/* ── Workspace Area (Sidebar + Children) ── */}
        <div className="flex-1 flex overflow-hidden min-h-0 relative">
          {/* ── Left Sidebar (Ẩn đi khi đang vào trong 1 phòng cụ thể) ── */}
          {!isInRoom && (
            <aside className="w-16 md:w-20 h-full bg-[#f8f9fa] border-r border-slate-200 flex flex-col justify-between items-center py-3 shrink-0 z-40 shadow-[1px_0_6px_rgba(0,0,0,0.02)] relative">
              <div className="w-full flex flex-col items-center gap-1.5">
                {/* Tự động render danh sách Menu */}
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      prefetch={true}
                      onClick={(e) => handleTabClick(e, item.id, item.href)}
                      className={`flex flex-col items-center justify-center gap-1.5 w-full py-3 px-1 md:px-1.5 transition-all group border-l-2 ${item.isActive
                          ? "text-brand-600 bg-brand-50/50 border-brand-500 font-semibold"
                          : "text-slate-600 hover:bg-slate-50 border-transparent font-medium"
                        }`}
                    >
                      <div className="relative">
                        <Icon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                      </div>
                      <span className="hidden md:block text-[10px] tracking-tight text-center leading-tight truncate max-w-[72px]">
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </aside>
          )}

          {/* ── Main Content Area (Persistent Tabs Shell) ── */}
          <div className="flex-1 flex flex-col relative min-w-0 overflow-hidden bg-[#fcfcfc]">
            {/* Tab 1: Teams / Dashboard hoặc Room Detail (Teams Style) */}
            <div
              className={`h-full w-full flex-col min-h-0 ${activeTab === "teams" ? "flex" : "hidden"
                }`}
            >
              {mountedTabs.teams && (
                selectedRoomId ? (
                  <RoomContent
                    roomId={selectedRoomId}
                    userId={myProfile?.supabaseId || ""}
                    onBack={() => selectRoom(null)}
                  />
                ) : (
                  <DashboardTab />
                )
              )}
            </div>

            {/* Tab 2: Calendar */}
            <div
              className={`h-full w-full flex-col min-h-0 ${activeTab === "calendar" ? "flex" : "hidden"
                }`}
            >
              {mountedTabs.calendar && (
                <Suspense fallback={<TabFallback />}>
                  <CalendarView />
                </Suspense>
              )}
            </div>

            {/* Tab 3: Chat */}
            <div
              className={`h-full w-full flex-col min-h-0 ${activeTab === "chat" ? "flex" : "hidden"
                }`}
            >
              {mountedTabs.chat && (
                <Suspense fallback={<TabFallback />}>
                  <ChatLayout />
                </Suspense>
              )}
            </div>

            {/* Nếu là route con khác ngoài 3 tab chính */}
            {!["teams", "calendar", "chat"].includes(activeTab) && children}
          </div>
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

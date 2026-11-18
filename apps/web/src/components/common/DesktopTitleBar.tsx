"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "@/i18n/navigation";
import { useIsElectron } from "@/hooks/useIsElectron";
import DesktopWindowControls from "./DesktopWindowControls";
import { Video } from "lucide-react";

export default function DesktopTitleBar() {
  const isElectron = useIsElectron();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Chỉ hiển thị trong môi trường Electron sau khi đã mount ở client
  if (!mounted || !isElectron) {
    return null;
  }

  // 1. Khi người dùng đang ở trong (home) layout (Dashboard, Calendar, Chat, Chi tiết Room),
  // các nút điều khiển cửa sổ đã được tích hợp trực tiếp vào header chính -> Ẩn thanh TitleBar phụ này.
  const isHomeRoute =
    pathname.includes("/dashboard") ||
    pathname.includes("/calendar") ||
    pathname.includes("/chat") ||
    (pathname.includes("/room/") && !pathname.includes("/room/join"));

  if (isHomeRoute) {
    return null;
  }

  // 2. Nếu đang ở các popup window riêng biệt như bảng trắng /whiteboard -> Ẩn thanh này
  if (pathname.includes("/whiteboard")) {
    return null;
  }

  const isMeetingRoute = pathname.includes("/meeting");

  // Giao diện thanh tiêu đề tối màu cho trang Meeting
  if (isMeetingRoute) {
    return (
      <div
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        className="h-8 bg-[#111113] border-b border-[#232328] px-3 flex items-center justify-between shrink-0 select-none z-[9999] sticky top-0 w-full"
      >
        {/* Góc trái: Logo và Tên ứng dụng trên nền tối */}
        <div
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          className="flex items-center gap-2"
        >
          <div className="w-4 h-4 rounded bg-brand-600 flex items-center justify-center text-white">
            <Video className="w-2.5 h-2.5 fill-white/20" />
          </div>
          <span className="text-xs font-semibold text-slate-300 tracking-tight">
            ToboMeet Meeting
          </span>
        </div>

        {/* Góc phải: Nút điều khiển cửa sổ dark theme */}
        <div
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          className="flex items-center"
        >
          <DesktopWindowControls variant="dark" />
        </div>
      </div>
    );
  }

  // Giao diện thanh tiêu đề sáng màu cho các trang còn lại (Admin, Login, Register, ...)
  return (
    <div
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      className="h-8 bg-white border-b border-slate-200/80 px-3 flex items-center justify-between shrink-0 select-none z-[9999] sticky top-0 w-full"
    >
      {/* Góc trái: Logo và Tên ứng dụng ToboMeet */}
      <div
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        className="flex items-center gap-2"
      >
        <div className="w-4.5 h-4.5 rounded bg-brand-600 flex items-center justify-center text-white">
          <Video className="w-3 h-3 fill-white/20" />
        </div>
        <span className="text-xs font-semibold text-slate-700 tracking-tight">
          ToboMeet
        </span>
      </div>

      {/* Góc phải: Nút điều khiển cửa sổ (Minimize, Maximize, Close) */}
      <div
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        className="flex items-center"
      >
        <DesktopWindowControls variant="titlebar" />
      </div>
    </div>
  );
}


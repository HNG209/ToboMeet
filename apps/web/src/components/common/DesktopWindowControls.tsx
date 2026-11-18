"use client";

import React, { useState, useEffect } from "react";
import { useIsElectron } from "@/hooks/useIsElectron";

interface DesktopWindowControlsProps {
  variant?: "header" | "titlebar" | "dark";
}

export default function DesktopWindowControls({
  variant = "header",
}: DesktopWindowControlsProps) {
  const isElectron = useIsElectron();
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const api = (window as any).electronAPI;
    if (!api?.windowControls) return;

    // Lấy trạng thái phóng to hiện tại từ Electron Main Process
    api.windowControls.isMaximized?.().then((max: boolean) => {
      setIsMaximized(max);
    });

    // Lắng nghe sự kiện maximize / unmaximize từ Main Process
    const cleanup = api.windowControls.onMaximizeChange?.((max: boolean) => {
      setIsMaximized(max);
    });

    return () => {
      if (typeof cleanup === "function") cleanup();
    };
  }, []);

  // Nếu chạy trên Web thông thường thì không hiển thị
  if (!isElectron) {
    return null;
  }

  const api = typeof window !== "undefined" ? (window as any).electronAPI : null;

  const handleMinimize = () => {
    api?.windowControls?.minimize();
  };

  const handleToggleMaximize = () => {
    api?.windowControls?.toggleMaximize();
  };

  const handleClose = () => {
    api?.windowControls?.close();
  };

  const isHeader = variant === "header";
  const isDark = variant === "dark";

  const normalBtnClass = isDark
    ? "h-8 w-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
    : `h-8 w-9 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors ${
        isHeader ? "rounded-md" : ""
      }`;

  const closeBtnClass = isDark
    ? "h-8 w-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#e81123] active:bg-[#c4101e] transition-colors"
    : `h-8 w-9 flex items-center justify-center text-slate-500 hover:text-white hover:bg-[#e81123] active:bg-[#c4101e] transition-colors ${
        isHeader ? "rounded-md" : ""
      }`;

  return (
    <div
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      className={`flex items-center select-none ${
        isHeader ? "border-l border-slate-200/80 pl-1.5 ml-1" : ""
      }`}
    >
      {/* Nút Thu nhỏ (Minimize) */}
      <button
        type="button"
        onClick={handleMinimize}
        title="Thu nhỏ"
        className={normalBtnClass}
      >
        <svg width="10" height="1" viewBox="0 0 10 1" fill="none">
          <rect width="10" height="1" fill="currentColor" />
        </svg>
      </button>

      {/* Nút Phóng to / Khôi phục kích thước (Maximize / Restore) */}
      <button
        type="button"
        onClick={handleToggleMaximize}
        title={isMaximized ? "Khôi phục" : "Phóng to"}
        className={normalBtnClass}
      >
        {isMaximized ? (
          // Icon Khôi phục kích thước (Restore - 2 ô vuông lồng nhau)
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect
              x="2.5"
              y="0.5"
              width="7"
              height="7"
              stroke="currentColor"
              strokeWidth="1"
            />
            <path
              d="M0.5 2.5V9.5H7.5"
              stroke="currentColor"
              strokeWidth="1"
              fill="none"
            />
          </svg>
        ) : (
          // Icon Phóng to (Maximize - 1 ô vuông)
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect
              x="0.5"
              y="0.5"
              width="9"
              height="9"
              stroke="currentColor"
              strokeWidth="1"
            />
          </svg>
        )}
      </button>

      {/* Nút Đóng (Close) - Hiệu ứng hover đỏ đặc trưng của Windows */}
      <button
        type="button"
        onClick={handleClose}
        title="Đóng"
        className={closeBtnClass}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path
            d="M1 1L9 9M9 1L1 9"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}


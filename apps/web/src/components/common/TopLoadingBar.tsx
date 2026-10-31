"use client";

import React, { useEffect, useState, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export default function TopLoadingBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<NodeJS.Timeout[]>([]);

  const clearTimers = () => {
    timerRef.current.forEach((t) => clearTimeout(t));
    timerRef.current = [];
  };

  const startProgress = () => {
    clearTimers();
    setVisible(true);
    setProgress(25);

    timerRef.current.push(
      setTimeout(() => {
        setProgress(65);
      }, 150),
    );

    timerRef.current.push(
      setTimeout(() => {
        setProgress(85);
      }, 350),
    );
  };

  const completeProgress = () => {
    clearTimers();
    setProgress(100);

    timerRef.current.push(
      setTimeout(() => {
        setVisible(false);
      }, 250),
    );

    timerRef.current.push(
      setTimeout(() => {
        setProgress(0);
      }, 400),
    );
  };

  // Hoàn tất progress khi pathname hoặc searchParams thay đổi (navigation xong)
  useEffect(() => {
    if (visible) {
      completeProgress();
    }
  }, [pathname, searchParams]);

  // Lắng nghe click vào các liên kết nội bộ để kích hoạt thanh tiến trình
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      // Bỏ qua nếu event đã bị preventDefault hoặc nhấn kèm phím tắt mở tab mới
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      // Bỏ qua nếu người dùng click vào button hoặc phần tử tương tác
      const clickedInteractive = (e.target as HTMLElement)?.closest(
        "button, [role='button'], input, select, textarea",
      );
      if (clickedInteractive) return;

      const target = (e.target as HTMLElement)?.closest("a");
      if (!target || !target.href) return;

      // Bỏ qua nếu có target="_blank" hoặc tải file
      if (target.target === "_blank" || target.hasAttribute("download")) return;

      try {
        const url = new URL(target.href);
        const currentUrl = new URL(window.location.href);

        // Chỉ áp dụng cho liên kết nội bộ cùng domain và khác path/query
        if (
          url.origin === currentUrl.origin &&
          (url.pathname !== currentUrl.pathname || url.search !== currentUrl.search) &&
          !url.hash.startsWith("#")
        ) {
          startProgress();
        }
      } catch {
        // Bỏ qua URL không hợp lệ
      }
    };

    const handlePopState = () => {
      startProgress();
    };

    document.addEventListener("click", handleDocumentClick);
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleDocumentClick);
      window.removeEventListener("popstate", handlePopState);
      clearTimers();
    };
  }, []);

  if (!visible && progress === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-[99999] pointer-events-none h-[2.5px] overflow-hidden"
    >
      <div
        style={{
          width: `${progress}%`,
          opacity: visible ? 1 : 0,
          transition:
            progress === 100
              ? "width 0.15s ease-out, opacity 0.25s ease-out 0.1s"
              : progress === 0
                ? "none"
                : "width 0.35s cubic-bezier(0.1, 0.5, 0.1, 1), opacity 0.15s ease-out",
        }}
        className="h-full bg-gradient-to-r from-brand-500 via-indigo-500 to-brand-600 shadow-[0_0_8px_rgba(79,70,229,0.7),0_0_4px_rgba(99,102,241,0.5)]"
      />
    </div>
  );
}


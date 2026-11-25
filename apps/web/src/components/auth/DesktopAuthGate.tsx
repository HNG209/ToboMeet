"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useLocale } from "next-intl";
import {
  ExternalLink,
  Loader2,
  RefreshCw,
  UserPlus,
  Video,
  AlertCircle,
  X,
} from "lucide-react";
import { useIsElectron } from "@/hooks/useIsElectron";
import LanguageSwitcher from "@/components/commons/LanguageSwitcher";
import AuthLeftPanel from "@/components/auth/AuthLeftPanel";

type DesktopAuthStatus = "idle" | "waiting" | "exchanging" | "error";

export function DesktopAuthGate() {
  const locale = useLocale();
  const isVi = locale === "vi";

  const [status, setStatus] = useState<DesktopAuthStatus>("idle");
  const [activeMode, setActiveMode] = useState<"login" | "signup">("login");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const openBrowserAuth = useCallback(
    async (mode: "login" | "signup") => {
      const electronAuth = (window as any)?.electronAPI?.auth;
      if (!electronAuth?.openExternal) {
        setErrorMsg(
          isVi
            ? "Không tìm thấy cầu nối Desktop. Vui lòng khởi động lại ứng dụng."
            : "Desktop bridge unavailable. Please restart the app.",
        );
        setStatus("error");
        return;
      }

      setActiveMode(mode);
      setErrorMsg(null);
      setStatus("waiting");

      try {
        const res = await electronAuth.openExternal({ mode, locale });
        if (!res?.success) {
          setErrorMsg(
            res?.error ||
              (isVi
                ? "Không thể mở trình duyệt web."
                : "Unable to open external browser."),
          );
          setStatus("error");
        }
      } catch (err: any) {
        setErrorMsg(
          err?.message ||
            (isVi
              ? "Không thể mở trình duyệt web."
              : "Unable to open external browser."),
        );
        setStatus("error");
      }
    },
    [isVi, locale],
  );

  const handleCancel = useCallback(async () => {
    try {
      await (window as any)?.electronAPI?.auth?.cancelExternal?.();
    } catch {}
    setStatus("idle");
    setErrorMsg(null);
  }, []);

  useEffect(() => {
    const electronAuth = (window as any)?.electronAPI?.auth;
    if (!electronAuth) return;

    const cleanupCallback = electronAuth.onAuthCallback?.(
      async (payload: { code?: string; state?: string }) => {
        if (!payload?.code || !payload?.state) {
          setErrorMsg(
            isVi
              ? "Thiếu mã xác thực trả về từ trình duyệt."
              : "Missing authentication code from browser.",
          );
          setStatus("error");
          return;
        }

        setStatus("exchanging");
        setErrorMsg(null);

        try {
          const res = await fetch("/api/auth/desktop-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              code: payload.code,
              state: payload.state,
            }),
          });

          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data?.success) {
            throw new Error(
              data?.error ||
                (isVi
                  ? "Không thể hoàn tất đăng nhập trên Desktop."
                  : "Failed to complete Desktop sign-in."),
            );
          }

          const destination =
            data.role === "admin"
              ? `/${locale}/admin`
              : `/${locale}/dashboard`;
          window.location.replace(destination);
        } catch (err: any) {
          setErrorMsg(
            err?.message ||
              (isVi
                ? "Xác thực thất bại. Vui lòng thử lại."
                : "Authentication failed. Please try again."),
          );
          setStatus("error");
        }
      },
    );

    const cleanupError = electronAuth.onAuthError?.(
      (payload: { message?: string }) => {
        setErrorMsg(
          payload?.message ||
            (isVi
              ? "Đăng nhập bị hủy hoặc đã hết hạn."
              : "Sign-in was cancelled or expired."),
        );
        setStatus("error");
      },
    );

    return () => {
      cleanupCallback?.();
      cleanupError?.();
    };
  }, [isVi, locale]);

  return (
    <div className="p-8 sm:p-10 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100">
      {/* Logo */}
      <div className="flex justify-center mb-6">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-11 w-11 items-center justify-center">
            <div className="absolute inset-0 bg-linear-to-tr from-[#0052FF] to-indigo-500 rounded-xl transform rotate-3 shadow-md" />
            <div className="relative z-10 text-white">
              <Video size={20} strokeWidth={2.5} />
            </div>
          </div>
          <span className="text-[24px] font-black tracking-tighter text-[#0F172A]">
            Tobo
            <span className="text-transparent bg-clip-text bg-linear-to-r from-[#0052FF] to-indigo-500">
              Meet
            </span>
          </span>
        </div>
      </div>

      <div className="text-center mb-7">
        <h1 className="text-2xl font-bold text-[#0F172A] mb-2">
          {isVi ? "Đăng nhập ToboMeet Desktop" : "Sign in to ToboMeet Desktop"}
        </h1>
        <p className="text-gray-500 text-sm leading-relaxed">
          {isVi
            ? "Quá trình đăng nhập và đăng ký được thực hiện an toàn trên trình duyệt web của bạn, sau đó tự động quay lại ứng dụng."
            : "Sign in or create an account securely in your web browser, and you'll be redirected back to the app automatically."}
        </p>
      </div>

      {errorMsg && (
        <div className="mb-5 p-3.5 bg-red-50 text-red-600 border border-red-100 rounded-2xl text-xs font-medium flex items-start gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {status === "waiting" ? (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-blue-50/70 border border-blue-100 text-center">
            <Loader2 className="w-7 h-7 text-[#0052FF] animate-spin mx-auto mb-3" />
            <p className="text-sm font-bold text-[#0F172A]">
              {isVi
                ? "Đang chờ hoàn tất trên trình duyệt..."
                : "Waiting for browser authentication..."}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {isVi
                ? "Hãy hoàn tất đăng nhập trên trình duyệt vừa mở để tự động quay lại ToboMeet."
                : "Complete sign-in in the browser window that just opened to return automatically."}
            </p>
          </div>

          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => openBrowserAuth(activeMode)}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors cursor-pointer"
            >
              <RefreshCw size={15} />
              <span>{isVi ? "Mở lại trình duyệt" : "Reopen Browser"}</span>
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-full border border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-slate-500 text-sm font-semibold transition-colors cursor-pointer"
            >
              <X size={15} />
              <span>{isVi ? "Hủy" : "Cancel"}</span>
            </button>
          </div>
        </div>
      ) : status === "exchanging" ? (
        <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center">
          <Loader2 className="w-8 h-8 text-[#0052FF] animate-spin mx-auto mb-3" />
          <p className="text-sm font-bold text-[#0F172A]">
            {isVi
              ? "Đang đồng bộ phiên đăng nhập..."
              : "Completing sign-in..."}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {isVi
              ? "Vui lòng đợi trong giây lát."
              : "Please wait a moment."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => openBrowserAuth("login")}
            className="w-full bg-[#0052FF] hover:bg-[#0040D1] text-white px-5 py-3.5 rounded-full font-semibold text-[15px] transition-colors shadow-sm flex items-center justify-center gap-2.5 cursor-pointer"
          >
            <ExternalLink size={17} />
            <span>
              {isVi ? "Đăng nhập qua trình duyệt" : "Sign in via Browser"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => openBrowserAuth("signup")}
            className="w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-5 py-3.5 rounded-full font-semibold text-[15px] transition-colors flex items-center justify-center gap-2.5 cursor-pointer"
          >
            <UserPlus size={17} />
            <span>
              {isVi ? "Tạo tài khoản mới" : "Create a New Account"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Ẩn hoàn toàn form đăng nhập/đăng ký và tab bên trái khi chạy trên Electron Desktop,
 * căn giữa DesktopAuthGate toàn màn hình. Trên trình duyệt web vẫn giữ nguyên bố cục 2 cột.
 */
export default function AuthDesktopSwitch({
  serverIsDesktop,
  children,
}: {
  serverIsDesktop: boolean;
  children: React.ReactNode;
}) {
  const clientIsElectron = useIsElectron();
  const isDesktop = serverIsDesktop || clientIsElectron;

  if (isDesktop) {
    return (
      <div className="relative flex h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden bg-[#FAFAFA] font-sans">
        <div className="absolute top-4 right-4 sm:top-6 sm:right-8 z-50">
          <LanguageSwitcher />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="flex min-h-full w-full items-center justify-center px-4 py-12 sm:px-6">
            <div className="w-full max-w-md">
              <DesktopAuthGate />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-white font-sans">
      <AuthLeftPanel />

      <div className="relative flex h-full min-h-0 flex-1 flex-col bg-[#FAFAFA] lg:w-[45%] xl:w-[40%] border-l border-gray-100">
        <div className="absolute top-4 right-4 sm:top-6 sm:right-8 z-50">
          <LanguageSwitcher />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="flex min-h-full w-full items-center justify-center px-4 py-16 sm:px-6">
            <div className="w-full max-w-110">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}


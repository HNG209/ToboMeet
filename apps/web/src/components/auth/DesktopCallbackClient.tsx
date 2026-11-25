"use client";

import React, { useEffect, useState, useRef } from "react";
import { useLocale } from "next-intl";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  AlertCircle,
  LogOut,
  Video,
} from "lucide-react";

interface DesktopCallbackClientProps {
  state: string;
  callbackMode: "protocol" | "loopback";
  callbackPort: number | null;
  userEmail: string;
}

export default function DesktopCallbackClient({
  state,
  callbackMode,
  callbackPort,
  userEmail,
}: DesktopCallbackClientProps) {
  const locale = useLocale();
  const isVi = locale === "vi";

  const [status, setStatus] = useState<"generating" | "ready" | "error">(
    "generating",
  );
  const [callbackUrl, setCallbackUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    if (hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;

    async function generateAndRedirect() {
      if (!state || state.length < 16) {
        setErrorMsg(
          isVi
            ? "Thiếu hoặc sai tham số xác thực (state). Vui lòng thử đăng nhập lại từ ứng dụng Desktop."
            : "Missing or invalid state parameter. Please restart sign-in from the Desktop app.",
        );
        setStatus("error");
        return;
      }

      try {
        // Gọi qua Next.js proxy (/api/auth/desktop-code -> NestJS POST /api/auth/desktop-code)
        // tự động đính kèm Bearer token từ HTTP-only cookie của phiên web hiện tại
        const res = await fetch("/api/auth/desktop-code", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ state }),
        });

        const json = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            json?.message ||
              json?.error ||
              (isVi
                ? "Không thể tạo mã xác thực Desktop."
                : "Failed to generate Desktop authentication code."),
          );
        }

        const payload = json?.result ?? json;
        const code: string | undefined = payload?.code;
        if (!code) {
          throw new Error(
            isVi
              ? "Máy chủ không trả về mã xác thực."
              : "Server did not return an auth code.",
          );
        }

        let targetUrl: string;
        if (
          callbackMode === "loopback" &&
          callbackPort &&
          callbackPort >= 1024 &&
          callbackPort <= 65535
        ) {
          targetUrl = `http://127.0.0.1:${callbackPort}/auth-callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
        } else {
          targetUrl = `tobomeet://auth-callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
        }

        setCallbackUrl(targetUrl);
        setStatus("ready");

        // Tự động điều hướng về ứng dụng ToboMeet Desktop
        window.location.href = targetUrl;
      } catch (err: any) {
        setErrorMsg(
          err?.message ||
            (isVi
              ? "Có lỗi xảy ra khi kết nối với ứng dụng Desktop."
              : "Something went wrong while connecting to the Desktop app."),
        );
        setStatus("error");
      }
    }

    generateAndRedirect();
  }, [callbackMode, callbackPort, isVi, state]);

  const handleSwitchAccount = () => {
    const params = new URLSearchParams();
    params.set("source", "desktop");
    params.set("state", state);
    params.set("callback_mode", callbackMode);
    if (callbackMode === "loopback" && callbackPort) {
      params.set("callback_port", String(callbackPort));
    }
    const loginPath = `/${locale}/login?${params.toString()}`;
    window.location.href = `/api/auth/logout?locale=${locale}&redirect=${encodeURIComponent(loginPath)}`;
  };

  return (
    <div className="min-h-dvh w-full bg-[#FAFAFA] flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200/80 shadow-[0_10px_35px_rgba(15,23,42,0.06)] p-8 sm:p-10 text-center">
        {/* Brand */}
        <div className="flex justify-center mb-6">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-10 w-10 items-center justify-center">
              <div className="absolute inset-0 bg-linear-to-tr from-[#0052FF] to-indigo-500 rounded-xl transform rotate-3 shadow-md" />
              <div className="relative z-10 text-white">
                <Video size={19} strokeWidth={2.5} />
              </div>
            </div>
            <span className="text-[22px] font-black tracking-tighter text-[#0F172A]">
              Tobo
              <span className="text-transparent bg-clip-text bg-linear-to-r from-[#0052FF] to-indigo-500">
                Meet
              </span>
            </span>
          </div>
        </div>

        {status === "generating" && (
          <div className="py-4">
            <Loader2 className="w-10 h-10 text-[#0052FF] animate-spin mx-auto mb-4" />
            <h1 className="text-xl font-bold text-[#0F172A] mb-2">
              {isVi
                ? "Đang kết nối với ToboMeet Desktop..."
                : "Connecting to ToboMeet Desktop..."}
            </h1>
            <p className="text-sm text-slate-500">
              {isVi
                ? "Vui lòng đợi trong giây lát."
                : "Please wait a moment."}
            </p>
          </div>
        )}

        {status === "ready" && (
          <div>
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={30} />
            </div>
            <h1 className="text-xl font-bold text-[#0F172A] mb-2">
              {isVi ? "Đăng nhập thành công!" : "Signed in successfully!"}
            </h1>
            {userEmail && (
              <p className="text-xs font-semibold text-slate-600 bg-slate-100 rounded-full px-3 py-1 inline-block mb-3">
                {userEmail}
              </p>
            )}
            <p className="text-sm text-slate-500 leading-relaxed mb-6">
              {isVi
                ? "Trình duyệt đang tự động chuyển hướng về ứng dụng ToboMeet Desktop. Bạn có thể đóng tab này sau khi ứng dụng đã mở."
                : "Redirecting you back to ToboMeet Desktop. You may close this tab once the app opens."}
            </p>

            {callbackUrl && (
              <a
                href={callbackUrl}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-full bg-[#0052FF] hover:bg-[#0040D1] text-white font-semibold text-sm transition-colors shadow-sm mb-3"
              >
                <ExternalLink size={16} />
                <span>
                  {isVi ? "Mở ứng dụng ToboMeet" : "Open ToboMeet App"}
                </span>
              </a>
            )}

            <button
              type="button"
              onClick={handleSwitchAccount}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <LogOut size={14} />
              <span>
                {isVi ? "Đăng nhập bằng tài khoản khác" : "Use another account"}
              </span>
            </button>
          </div>
        )}

        {status === "error" && (
          <div>
            <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-100 text-red-500 flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={30} />
            </div>
            <h1 className="text-xl font-bold text-[#0F172A] mb-2">
              {isVi ? "Không thể chuyển về ứng dụng" : "Unable to return to app"}
            </h1>
            <p className="text-sm text-red-600 mb-6">{errorMsg}</p>
            <button
              type="button"
              onClick={handleSwitchAccount}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-[#0052FF] hover:bg-[#0040D1] text-white font-semibold text-sm transition-colors cursor-pointer"
            >
              <span>{isVi ? "Thử đăng nhập lại" : "Try signing in again"}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


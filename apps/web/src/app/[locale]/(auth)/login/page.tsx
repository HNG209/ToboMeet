"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { login, loginWithOAuth, type FormState } from "../../auth/actions";
import { Eye, EyeOff, Monitor, Video } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

const initialState: FormState = { error: null, message: null };

export default function LoginPage() {
  const t = useTranslations();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);

  const pathError = searchParams.get("error");
  const rawRedirectUrl = searchParams.get("redirect") || "";
  const sourceParam = searchParams.get("source");
  const stateParam = searchParams.get("state") || "";
  const callbackMode = searchParams.get("callback_mode") || "protocol";
  const callbackPort = searchParams.get("callback_port") || "";

  const isDesktopAuth = sourceParam === "desktop" && Boolean(stateParam);
  const desktopQueryString = isDesktopAuth
    ? new URLSearchParams({
        source: "desktop",
        state: stateParam,
        callback_mode: callbackMode,
        ...(callbackPort ? { callback_port: callbackPort } : {}),
      }).toString()
    : "";
  const desktopCallbackUrl = isDesktopAuth
    ? `/${locale}/auth/desktop-callback?${new URLSearchParams({
        state: stateParam,
        callback_mode: callbackMode,
        ...(callbackPort ? { callback_port: callbackPort } : {}),
      }).toString()}`
    : "";
  const redirectUrl = rawRedirectUrl || desktopCallbackUrl;

  const [loginState, loginAction, isLoginPending] = useActionState(
    login,
    initialState,
  );

  const [googleState, googleAction, isGooglePending] = useActionState(
    loginWithOAuth.bind(null, "google"),
    initialState,
  );

  const [fbState, fbAction, isFbPending] = useActionState(
    loginWithOAuth.bind(null, "facebook"),
    initialState,
  );

  const error =
    loginState.error || googleState.error || fbState.error || pathError;
  const isPending = isLoginPending || isGooglePending || isFbPending;

  return (
    <div className="p-8 sm:p-10 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100">
      {/* Logo hiển thị riêng cho màn hình Mobile */}
      <div className="flex justify-center mb-6 lg:hidden">
        <Link href="/" className="flex items-center gap-2.5 group shrink-0">
          <div className="relative flex h-9 w-9 items-center justify-center">
            {/* Nền gradient chéo */}
            <div className="absolute inset-0 bg-linear-to-tr from-brand-600 to-indigo-500 rounded-xl transform rotate-3 group-hover:rotate-6 transition-transform duration-300 shadow-md"></div>
            {/* Nền đổ bóng mờ ảo */}
            <div className="absolute inset-0 bg-brand-500 blur opacity-40 rounded-xl group-hover:opacity-60 transition-opacity duration-300"></div>
            {/* Icon */}
            <div className="relative z-10 text-white">
              <Video
                size={18}
                strokeWidth={2.5}
                className="group-hover:scale-110 transition-transform duration-300"
              />
            </div>
          </div>
          <span className="text-[22px] font-black tracking-tighter text-navy">
            Tobo
            <span className="text-transparent bg-clip-text bg-linear-to-r from-brand-600 to-indigo-500">
              Meet
            </span>
          </span>
        </Link>
      </div>

      {isDesktopAuth && (
        <div className="mb-4 flex items-center justify-center gap-2 px-3.5 py-2 rounded-full bg-blue-50 border border-blue-100 text-[#0052FF] text-xs font-semibold">
          <Monitor size={14} className="shrink-0" />
          <span>
            {locale === "vi"
              ? "Đang đăng nhập cho ứng dụng ToboMeet Desktop"
              : "Signing in for ToboMeet Desktop App"}
          </span>
        </div>
      )}

      <div className="text-center mb-4">
        <h1 className="text-2xl font-bold text-[#0F172A] mb-2">
          {t("login.welcome_back")}
        </h1>
        <p className="text-gray-500 text-sm">
          {t("login.sign_in_to_continue")}
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-600 border border-red-100 rounded-2xl text-sm font-medium">
          {error.startsWith("error.") ? t(error) : error}
        </div>
      )}

      {/* --- NÚT ĐĂNG NHẬP MẠNG XÃ HỘI --- */}
      <div className="flex flex-col gap-3 mb-6">
        <form action={googleAction}>
          <input type="hidden" name="redirect" value={redirectUrl} />
          <button
            disabled={isPending}
            type="submit"
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200 rounded-full font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            {isGooglePending
              ? t("login.signing_in")
              : t("login.continue_with_google")}
          </button>
        </form>

        <form action={fbAction}>
          <input type="hidden" name="redirect" value={redirectUrl} />
          <button
            disabled={isPending}
            type="submit"
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200 rounded-full font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <svg
              className="w-5 h-5 text-[#1877F2]"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            {isFbPending
              ? t("login.signing_in")
              : t("login.continue_with_facebook")}
          </button>
        </form>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="h-px flex-1 bg-gray-200"></div>
        <span className="text-sm font-medium text-gray-400 uppercase">
          {t("login.or_text")}
        </span>
        <div className="h-px flex-1 bg-gray-200"></div>
      </div>

      <form action={loginAction} className="flex flex-col gap-5">
        <input type="hidden" name="redirect" value={redirectUrl} />
        <div>
          <label className="block mb-1.5 text-sm font-semibold text-gray-700">
            Email
          </label>
          <input
            name="email"
            type="email"
            required
            className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#0052FF]/10 focus:border-[#0052FF] focus:bg-white transition-all text-gray-900"
            placeholder="nhap@email.com"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="block text-sm font-semibold text-gray-700">
              {t("login.password")}
            </label>
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-[#0052FF] hover:underline"
            >
              {t("login.forgot_password")}
            </Link>
          </div>
          <div className="relative">
            <input
              name="password"
              // Thay đổi type dựa trên trạng thái showPassword
              type={showPassword ? "text" : "password"}
              required
              className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#0052FF]/10 focus:border-[#0052FF] focus:bg-white transition-all text-gray-900"
              placeholder="••••••••"
            />
            <button
              type="button"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full mt-2 bg-[#0052FF] text-white px-4 py-3.5 rounded-full font-medium text-[15px] hover:bg-[#0040D1] transition-colors disabled:opacity-70 flex justify-center items-center gap-2"
        >
          {isLoginPending ? (
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
          ) : (
            t("login.sign_in")
          )}
        </button>
      </form>

      <p className="text-center mt-8 text-sm text-gray-500 font-medium">
        {t("login.dont_have_account")}{" "}
        <Link
          href={desktopQueryString ? `/signup?${desktopQueryString}` : "/signup"}
          className="text-[#0052FF] hover:underline"
        >
          {t("login.sign_up")}
        </Link>
      </p>
    </div>
  );
}

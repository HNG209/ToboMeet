"use client";

import { useState } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { FormState, loginWithOAuth, signup } from "../../auth/actions";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { validatePasswordPolicy } from "@tobomeet/shared/utils";
import { Eye, EyeOff, Monitor, Video } from "lucide-react";

const initialState: FormState = { error: null, message: null };

export default function SignupPage() {
  const t = useTranslations();
  const locale = useLocale();
  const tPolicy = useTranslations("forgot_password");
  const searchParams = useSearchParams();

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

  const [state, action, isPending] = useActionState(signup, initialState);
  const [localError, setLocalError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);

  const {
    hasMinLength,
    hasLetter,
    hasUpper,
    hasLower,
    hasNumber,
    noConsecutive,
    isValid: passwordValid,
  } = validatePasswordPolicy(password);

  const [googleState, googleAction, isGooglePending] = useActionState(
    loginWithOAuth.bind(null, "google"),
    initialState,
  );

  const [fbState, fbAction, isFbPending] = useActionState(
    loginWithOAuth.bind(null, "facebook"),
    initialState,
  );

  const error = googleState.error || fbState.error || localError;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    setLocalError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    const password = formData.get("password") as string | null;
    const confirm = formData.get("confirmPassword") as string | null;

    if (password == null || confirm == null) {
      setLocalError("error.auth.missing_fields");
      e.preventDefault();
      return;
    }

    if (password.length < 6) {
      setLocalError("error.auth.password_too_short");
      e.preventDefault();
      return;
    }

    if (password !== confirm) {
      setLocalError("error.auth.password_mismatch");
      e.preventDefault();
      return;
    }
  };

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
              ? "Đang đăng ký cho ứng dụng ToboMeet Desktop"
              : "Signing up for ToboMeet Desktop App"}
          </span>
        </div>
      )}

      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-[#0F172A] mb-2">
          {t("signup.sign_up")}
        </h1>
        <p className="text-gray-500 text-sm">
          {t("signup.create_account_to_continue")}
        </p>
      </div>

      {/* Khung báo lỗi server-side */}
      {state.error && (
        <div className="mb-6 p-4 bg-red-50 text-red-600 border border-red-100 rounded-2xl text-sm font-medium">
          {t(state.error)}
        </div>
      )}

      {/* Khung báo lỗi client-side */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-600 border border-red-100 rounded-2xl text-sm font-medium">
          {t(error)}
        </div>
      )}

      {/* Khung báo thành công (Yêu cầu check email) */}
      {state.message && (
        <div className="mb-6 p-4 bg-green-50 text-green-700 border border-green-200 rounded-2xl text-sm font-medium flex items-start gap-3">
          <svg
            className="w-5 h-5 text-green-500 mt-0.5 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{t(state.message)}</span>
        </div>
      )}

      <form
        action={action}
        onSubmit={handleSubmit}
        className="flex flex-col gap-5"
      >
        {desktopCallbackUrl && (
          <input type="hidden" name="redirect" value={desktopCallbackUrl} />
        )}
        <div>
          <label className="block mb-1.5 text-sm font-semibold text-gray-700">
            {t("signup.work_email")}
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
          <label className="block mb-1.5 text-sm font-semibold text-gray-700">
            {t("signup.password")}
          </label>
          <div className="relative">
            <input
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type={showPassword ? "text" : "password"}
              onFocus={() => setIsPasswordFocused(true)}
              onBlur={() => setIsPasswordFocused(false)}
              required
              minLength={8}
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

        {isPasswordFocused && (
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
            <p className="text-[13px] font-bold text-gray-800 mb-2">
              {tPolicy("reset_policy_title")}
            </p>
            <ul className="space-y-1.5 mb-3">
              {[
                {
                  id: 1,
                  text: tPolicy("reset_policy_length"),
                  valid: hasMinLength,
                },
                {
                  id: 2,
                  text: tPolicy("reset_policy_letter"),
                  valid: hasLetter,
                },
                { id: 3, text: tPolicy("reset_policy_upper"), valid: hasUpper },
                { id: 4, text: tPolicy("reset_policy_lower"), valid: hasLower },
                {
                  id: 5,
                  text: tPolicy("reset_policy_number"),
                  valid: hasNumber,
                },
              ].map((req) => (
                <li
                  key={req.id}
                  className="flex items-center gap-2 text-[13px]"
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${req.valid ? "bg-[#0052FF]" : "bg-gray-300"}`}
                  />
                  <span
                    className={
                      req.valid ? "text-gray-800 font-medium" : "text-gray-500"
                    }
                  >
                    {req.text}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex items-start gap-2 text-[13px]">
              <div
                className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${noConsecutive ? "bg-[#0052FF]" : "bg-gray-300"}`}
              />
              <span
                className={
                  noConsecutive
                    ? "text-gray-800 font-medium"
                    : "text-gray-500 leading-relaxed"
                }
              >
                {tPolicy("reset_policy_no_consecutive_desc")}
              </span>
            </div>
          </div>
        )}

        <div>
          <label className="block mb-1.5 text-sm font-semibold text-gray-700">
            {t("signup.confirm_password")}
          </label>
          <div className="relative">
            <input
              name="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              type={showConfirmPassword ? "text" : "password"}
              required
              minLength={8}
              className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#0052FF]/10 focus:border-[#0052FF] focus:bg-white transition-all text-gray-900"
              placeholder="••••••••"
            />
            <button
              type="button"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full mt-2 bg-[#0052FF] text-white px-4 py-3.5 rounded-full font-medium text-[15px] hover:bg-[#0040D1] transition-colors disabled:opacity-70 flex justify-center items-center gap-2"
        >
          {isPending ? (
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
          ) : (
            t("login.sign_up")
          )}
        </button>
      </form>

      <p className="text-center mt-8 mb-8 text-sm text-gray-500 font-medium">
        {t("signup.already_have_account")}{" "}
        <Link
          href={desktopQueryString ? `/login?${desktopQueryString}` : "/login"}
          className="text-[#0052FF] hover:underline"
        >
          {t("login.sign_in")}
        </Link>
      </p>

      <div className="flex items-center gap-3 mb-6">
        <div className="h-px flex-1 bg-gray-200"></div>
        <span className="text-sm font-medium text-gray-400 uppercase">
          {t("login.or_text")}
        </span>
        <div className="h-px flex-1 bg-gray-200"></div>
      </div>

      <div className="flex flex-col gap-3 mb-2">
        <form action={googleAction}>
          {desktopCallbackUrl && (
            <input type="hidden" name="redirect" value={desktopCallbackUrl} />
          )}
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
          {desktopCallbackUrl && (
            <input type="hidden" name="redirect" value={desktopCallbackUrl} />
          )}
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
    </div>
  );
}

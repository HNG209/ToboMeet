"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Mail,
  ArrowLeft,
  CheckCircle2,
  Send,
  RefreshCw,
  AlertCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  sendPasswordResetOtp,
  updatePassword,
  verifyPasswordResetOtp,
} from "@/app/[locale]/auth/actions";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { validatePasswordPolicy } from "@tobomeet/shared/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
type FormStep = "email" | "otp" | "reset" | "success";

// ─── Component ────────────────────────────────────────────────────────────────
export default function ForgotPasswordForm() {
  const t = useTranslations("forgot_password");
  const t1 = useTranslations("password_reset");
  const tGlobal = useTranslations();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const getErrorMessage = (errorKey: string | null | undefined, defaultKey: string) => {
    if (errorKey === "error.auth.user_locked" || errorKey === "user_locked") {
      return tGlobal("error.auth.user_locked");
    }
    return t1(errorKey || defaultKey);
  };

  // Flow State
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [shaking, setShaking] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Form Fields
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // UI States
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Refs
  const emailInputRef = useRef<HTMLInputElement>(null);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const currentStep = searchParams.get("step") as FormStep;
  const [step, setStep] = useState<FormStep>(
    currentStep === "reset" ? "reset" : "email",
  );

  // ── Countdown timer ──
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // ── Helpers ──
  const validateEmail = (val: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());

  const triggerShake = () => {
    setShaking(true);
    setTimeout(() => setShaking(false), 600);
  };

  const {
    hasMinLength,
    hasLetter,
    hasUpper,
    hasLower,
    hasNumber,
    noConsecutive,
    isValid: passwordValid,
  } = validatePasswordPolicy(newPassword);

  // ── Submit Handlers ──
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!validateEmail(email)) {
      setErrorMsg(t("error_invalid_email") || "Email không hợp lệ.");
      triggerShake();
      emailInputRef.current?.focus();
      return;
    }

    setIsLoading(true);
    // Gọi Server Action
    const res = await sendPasswordResetOtp(email);
    setIsLoading(false);

    if (res.success) {
      setStep("otp");
      setCountdown(300); // 5 minutes countdown
    } else {
      setErrorMsg(getErrorMessage(res.error, "otp_send_failed"));
      triggerShake();
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    const val = value.replace(/[^0-9]/g, "");
    if (val.length > 1) {
      const pasted = val.slice(0, 6).split(""); // Sửa thành 8
      const newOtp = [...otp];
      pasted.forEach((char, i) => {
        if (index + i < 6) newOtp[index + i] = char; // Sửa thành 8
      });
      setOtp(newOtp);
      const focusIndex = Math.min(index + pasted.length, 5);
      otpRefs.current[focusIndex]?.focus();
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = val;
    setOtp(newOtp);

    if (val && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    const code = otp.join("");
    if (code.length < 6) {
      setErrorMsg(t("error_invalid_otp") || "Mã xác minh không chính xác.");
      triggerShake();
      return;
    }

    setIsLoading(true);
    // Gọi Server Action
    const res = await verifyPasswordResetOtp(email, code);
    setIsLoading(false);

    if (res.success) {
      setStep("reset");
      router.replace(`${pathname}?step=reset`);
    } else {
      setErrorMsg(getErrorMessage(res.error, "otp_invalid_or_expired"));
      triggerShake();
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!passwordValid) {
      setErrorMsg("Vui lòng đáp ứng tất cả các điều kiện mật khẩu.");
      triggerShake();
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg("Mật khẩu xác nhận không khớp.");
      triggerShake();
      return;
    }

    setIsLoading(true);
    // Gọi Server Action
    const res = await updatePassword(newPassword);
    setIsLoading(false);

    if (res.success) {
      setStep("success");
      router.replace(pathname);
    } else {
      setErrorMsg(getErrorMessage(res.error, "password_update_failed"));
      triggerShake();
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;

    setIsLoading(true);
    // Gọi lại Server Action
    const res = await sendPasswordResetOtp(email);
    setIsLoading(false);

    if (res.success) {
      setCountdown(300);
      setErrorMsg("");
    } else {
      setErrorMsg(getErrorMessage(res.error, "otp_send_failed"));
      triggerShake();
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="w-full max-w-110 p-8 sm:p-10 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100">
        {/* ─── STEP 1: EMAIL ─── */}
        {step === "email" && (
          <div className="animate-fade-in-up">
            <div className="mb-8 text-center">
              <div className="shrink-0 inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-brand-50 border border-brand-100 mb-4 mx-auto">
                <Mail size={22} className="text-brand-500" strokeWidth={1.8} />
              </div>
              <h2 className="text-[28px] sm:text-[32px] font-black tracking-tighter text-navy leading-tight mb-2 whitespace-nowrap">
                {t("title")}
              </h2>
              <p className="text-slate-500 text-[15px] leading-relaxed">
                {t("subtitle")}
              </p>
            </div>

            <form
              onSubmit={handleEmailSubmit}
              className={`space-y-5 transition-transform ${shaking ? "animate-[shake_0.5s_ease-in-out]" : ""}`}
              style={
                shaking ? { animation: "shake 0.5s ease-in-out" } : undefined
              }
            >
              <div>
                <label
                  htmlFor="forgot-email-input"
                  className="block text-[13px] font-semibold text-slate-700 mb-1.5"
                >
                  {t("email_label")}
                </label>
                <div
                  className={`relative flex items-center rounded-xl border bg-white transition-all duration-200 shadow-sm ${
                    errorMsg
                      ? "border-rose-300 ring-2 ring-rose-100"
                      : "border-slate-200 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100"
                  }`}
                >
                  <Mail
                    size={16}
                    className={`ml-4 shrink-0 ${errorMsg ? "text-rose-400" : "text-slate-400"}`}
                  />
                  <input
                    id="forgot-email-input"
                    ref={emailInputRef}
                    type="email"
                    autoFocus
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setErrorMsg("");
                    }}
                    placeholder={t("email_placeholder")}
                    className="flex-1 bg-transparent border-none outline-none px-3 py-3.5 text-[15px] text-navy placeholder-slate-400"
                  />
                </div>
                {errorMsg && (
                  <div className="mt-2 flex items-center gap-1.5 animate-slide-up">
                    <AlertCircle size={13} className="text-rose-500 shrink-0" />
                    <p className="text-[13px] text-rose-500 font-medium">
                      {errorMsg}
                    </p>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-enterprise w-full h-12 text-[15px] disabled:opacity-70"
              >
                {isLoading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Đang gửi...</span>
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    {t("submit_btn")}
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-slate-500 hover:text-navy transition-colors"
              >
                <ArrowLeft size={16} />
                {t("back_to_login")}
              </Link>
            </div>
          </div>
        )}

        {/* ─── STEP 2: OTP ─── */}
        {step === "otp" && (
          <div className="animate-fade-in-up text-center">
            <h2 className="text-[32px] font-black tracking-tighter text-navy mb-2">
              {t("otp_title")}
            </h2>
            <p className="text-slate-500 text-[15px] leading-relaxed mb-8 max-w-xs mx-auto">
              {t("otp_subtitle", { email: email })}
            </p>

            <form
              onSubmit={handleOtpSubmit}
              className={`transition-transform ${shaking ? "animate-[shake_0.5s_ease-in-out]" : ""}`}
              style={
                shaking ? { animation: "shake 0.5s ease-in-out" } : undefined
              }
            >
              <div className="flex items-center justify-center gap-1.5 sm:gap-2 mb-6">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      otpRefs.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={8}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    className="w-9 h-12 sm:w-10 sm:h-14 text-center text-xl font-bold text-navy bg-white border border-slate-200 rounded-lg focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none transition-all"
                  />
                ))}
              </div>

              {errorMsg && (
                <div className="mb-4 flex items-center justify-center gap-1.5 animate-slide-up">
                  <AlertCircle size={13} className="text-rose-500" />
                  <p className="text-[13px] text-rose-500 font-medium">
                    {errorMsg}
                  </p>
                </div>
              )}

              <div className="text-[14px] text-slate-500 mb-8">
                {countdown > 0 ? (
                  <>
                    Bạn không nhận được mã?{" "}
                    <span className="text-slate-400">
                      Gửi lại sau {countdown} giây
                    </span>
                  </>
                ) : (
                  <>
                    Bạn không nhận được mã?{" "}
                    <button
                      type="button"
                      onClick={handleResend}
                      className="text-brand-500 font-semibold hover:text-brand-600"
                    >
                      Gửi lại ngay
                    </button>
                  </>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-slate-100 hover:bg-brand-500 hover:text-white text-slate-700 font-bold rounded-xl transition-colors disabled:opacity-50"
              >
                {isLoading ? (
                  <RefreshCw size={16} className="animate-spin mx-auto" />
                ) : (
                  t("otp_submit_btn")
                )}
              </button>
            </form>
          </div>
        )}

        {/* ─── STEP 3: RESET PASSWORD ─── */}
        {step === "reset" && (
          <div className="animate-fade-in-up">
            <div className="mb-8 text-center">
              <h2 className="text-[32px] font-black tracking-tighter text-navy mb-2">
                {t("reset_title")}
              </h2>
              <p className="text-slate-500 text-[14px] leading-relaxed max-w-sm mx-auto">
                {t("reset_subtitle", { email: email })}
              </p>
            </div>

            <form
              onSubmit={handleResetSubmit}
              className={`space-y-4 transition-transform ${shaking ? "animate-[shake_0.5s_ease-in-out]" : ""}`}
              style={
                shaking ? { animation: "shake 0.5s ease-in-out" } : undefined
              }
            >
              <div>
                <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">
                  {t("reset_new_pwd")}
                </label>
                <div className="relative flex items-center rounded-xl border border-slate-200 bg-white shadow-sm focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setErrorMsg("");
                    }}
                    className="flex-1 bg-transparent border-none outline-none px-4 py-3 text-[15px] text-navy"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="px-4 text-slate-400 hover:text-slate-600"
                  >
                    {showNewPassword ? <Eye size={18} /> : <EyeOff size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">
                  {t("reset_confirm_pwd")}
                </label>
                <div className="relative flex items-center rounded-xl border border-slate-200 bg-white shadow-sm focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setErrorMsg("");
                    }}
                    className="flex-1 bg-transparent border-none outline-none px-4 py-3 text-[15px] text-navy"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="px-4 text-slate-400 hover:text-slate-600"
                  >
                    {showConfirmPassword ? (
                      <Eye size={18} />
                    ) : (
                      <EyeOff size={18} />
                    )}
                  </button>
                </div>
              </div>

              {errorMsg && (
                <div className="flex items-center gap-1.5 text-rose-500 animate-slide-up">
                  <AlertCircle size={13} />
                  <p className="text-[13px] font-medium">{errorMsg}</p>
                </div>
              )}

              {/* Password Policy */}
              <div className="py-4">
                <p className="text-[14px] font-bold text-slate-800 mb-2">
                  {t("reset_policy_title")}
                </p>
                <ul className="space-y-1.5 mb-4">
                  {[
                    {
                      id: 1,
                      text: t("reset_policy_length"),
                      valid: hasMinLength,
                    },
                    { id: 2, text: t("reset_policy_letter"), valid: hasLetter },
                    { id: 3, text: t("reset_policy_upper"), valid: hasUpper },
                    { id: 4, text: t("reset_policy_lower"), valid: hasLower },
                    { id: 5, text: t("reset_policy_number"), valid: hasNumber },
                  ].map((req) => (
                    <li
                      key={req.id}
                      className="flex items-center gap-2 text-[14px]"
                    >
                      <div
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${req.valid ? "bg-brand-500" : "bg-slate-300"}`}
                      />
                      <span
                        className={
                          req.valid ? "text-slate-800" : "text-slate-500"
                        }
                      >
                        {req.text}
                      </span>
                    </li>
                  ))}
                </ul>

                <p className="text-[14px] font-bold text-slate-800 mb-2">
                  {t("reset_policy_no_consecutive_title")}
                </p>
                <div className="flex items-start gap-2 text-[14px]">
                  <div
                    className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${noConsecutive ? "bg-brand-500" : "bg-slate-300"}`}
                  />
                  <span
                    className={
                      noConsecutive
                        ? "text-slate-800"
                        : "text-slate-500 leading-relaxed"
                    }
                  >
                    {t("reset_policy_no_consecutive_desc")}
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-enterprise w-full h-12 text-[15px] disabled:opacity-70"
              >
                {isLoading ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  t("reset_submit_btn")
                )}
              </button>
            </form>
          </div>
        )}

        {/* ─── STEP 4: SUCCESS ─── */}
        {step === "success" && (
          <div className="animate-scale-in text-center">
            <div className="relative inline-flex items-center justify-center w-24 h-24 mb-8">
              <div className="absolute inset-0 rounded-full bg-emerald-100 animate-ping-slow" />
              <div className="relative w-24 h-24 rounded-full bg-linear-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-xl">
                <CheckCircle2
                  size={42}
                  className="text-white"
                  strokeWidth={2}
                />
              </div>
            </div>
            <h2 className="text-[32px] font-black tracking-tighter text-navy mb-3">
              Đổi mật khẩu thành công!
            </h2>
            <p className="text-slate-500 text-[15px] leading-relaxed mb-8 max-w-sm mx-auto">
              Mật khẩu của bạn đã được cập nhật. Bạn có thể sử dụng mật khẩu mới
              để đăng nhập vào hệ thống.
            </p>
            <Link
              href="/login"
              className="btn-enterprise w-full h-12 text-[15px] justify-center"
            >
              <ArrowLeft size={16} /> Quay lại đăng nhập
            </Link>
          </div>
        )}
      </div>{" "}
      {/* ── Shake keyframe ── */}
      <style>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            15%       { transform: translateX(-6px); }
            30%       { transform: translateX(6px); }
            45%       { transform: translateX(-4px); }
            60%       { transform: translateX(4px); }
            75%       { transform: translateX(-2px); }
            90%       { transform: translateX(2px); }
          }
        `}</style>
    </>
  );
}

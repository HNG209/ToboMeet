"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { toast } from "sonner";
import {
  X,
  Camera,
  Mail,
  User,
  Shield,
  KeyRound,
  Eye,
  EyeOff,
  Loader2,
  Check,
  CheckCircle2,
  ChevronRight,
  ArrowLeft,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { UserResponse } from "@tobomeet/shared/types";
import { validatePasswordPolicy } from "@tobomeet/shared/utils";
import {
  useGetAvatarUploadPresignedUrlMutation,
  useUpdateProfileMutation,
} from "@/lib/redux/api/usersApi";
import {
  getUserAuthInfo,
  updateUserPassword,
  resetUserPasswordWithRecoverySession,
} from "@/app/[locale]/auth/profile-actions";
import {
  sendPasswordResetOtp,
  verifyPasswordResetOtp,
} from "@/app/[locale]/auth/actions";
import UserAvatar from "./UserAvatar";


// In-memory cache for user auth provider info to avoid re-fetching on every modal open
const authInfoCache = new Map<string, { providers: string[]; hasPassword: boolean }>();

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: UserResponse;
}

export default function EditProfileModal({
  isOpen,
  onClose,
  user,
}: EditProfileModalProps) {
  const t = useTranslations("profile");
  const tPolicy = useTranslations("forgot_password");
  const t1 = useTranslations("password_reset");
  const locale = useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // View state: "profile" (main tab), "password" (change/set password tab), "forgot-password" (embedded forgot password flow)
  const [view, setView] = useState<"profile" | "password" | "forgot-password">("profile");

  // Forgot password sub-flow state (embedded inside modal)
  const [forgotStep, setForgotStep] = useState<"email" | "otp" | "reset" | "success">("email");
  const [forgotOtp, setForgotOtp] = useState<string[]>(Array(6).fill(""));
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
  const [showForgotNewPassword, setShowForgotNewPassword] = useState(false);
  const [showForgotConfirmPassword, setShowForgotConfirmPassword] = useState(false);
  const [forgotCountdown, setForgotCountdown] = useState(0);
  const [isSendingForgotOtp, setIsSendingForgotOtp] = useState(false);
  const [isVerifyingForgotOtp, setIsVerifyingForgotOtp] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [forgotErrorMsg, setForgotErrorMsg] = useState("");
  const forgotOtpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Profile editing state
  const [displayName, setDisplayName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const userKey = user?._id || user?.email || "";
  const cachedAuth = userKey ? authInfoCache.get(userKey) : undefined;

  // Auth identities / providers state (cached across modal opens)
  const [connectedProviders, setConnectedProviders] = useState<Set<string>>(
    () => (cachedAuth ? new Set(cachedAuth.providers) : new Set())
  );
  const [hasPassword, setHasPassword] = useState<boolean>(
    () => (cachedAuth ? cachedAuth.hasPassword : false)
  );
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(
    () => !cachedAuth
  );

  // Password setup / change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);

  // RTK Query Mutations
  const [getAvatarUploadPresignedUrl] =
    useGetAvatarUploadPresignedUrlMutation();
  const [updateProfile] = useUpdateProfileMutation();

  // Validate password using shared policy (matches signup)
  const {
    hasMinLength,
    hasLetter,
    hasUpper,
    hasLower,
    hasNumber,
    noConsecutive,
    isValid: isPasswordPolicyValid,
  } = validatePasswordPolicy(newPassword);

  // Validate forgot password policy
  const {
    hasMinLength: forgotHasMinLength,
    hasLetter: forgotHasLetter,
    hasUpper: forgotHasUpper,
    hasLower: forgotHasLower,
    hasNumber: forgotHasNumber,
    noConsecutive: forgotNoConsecutive,
    isValid: isForgotPolicyValid,
  } = validatePasswordPolicy(forgotNewPassword);

  // Forgot Password Countdown timer
  useEffect(() => {
    if (forgotCountdown <= 0) return;
    const timer = setTimeout(() => setForgotCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [forgotCountdown]);

  // Reset view & states on modal close/open
  useEffect(() => {
    if (!isOpen) {
      setView("profile");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setForgotStep("email");
      setForgotOtp(Array(6).fill(""));
      setForgotNewPassword("");
      setForgotConfirmPassword("");
      setShowForgotNewPassword(false);
      setShowForgotConfirmPassword(false);
      setForgotErrorMsg("");
      setForgotCountdown(0);
    }
  }, [isOpen]);

  // ESC key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (view === "forgot-password") {
          setView("password");
        } else if (view === "password") {
          setView("profile");
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, view, onClose]);

  // Sync displayName when user changes
  useEffect(() => {
    if (user?.displayName) {
      setDisplayName(user.displayName);
    } else if (user?.email) {
      setDisplayName(user.email.split("@")[0]);
    }
  }, [user]);

  // Fetch authentication identities & providers via Server Action (reads HTTP-only cookies)
  const fetchAuthProviders = useCallback(async (force = false) => {
    const key = user?._id || user?.email;
    if (!key) return;

    if (!force && authInfoCache.has(key)) {
      const cached = authInfoCache.get(key)!;
      setConnectedProviders(new Set(cached.providers));
      setHasPassword(cached.hasPassword);
      setIsLoadingAuth(false);
      return;
    }

    try {
      setIsLoadingAuth(true);
      const res = await getUserAuthInfo();

      if (res.success && Array.isArray(res.providers)) {
        const detected = new Set(res.providers.map((p) => p.toLowerCase()));
        setConnectedProviders(detected);
        setHasPassword(res.hasPassword);
        authInfoCache.set(key, {
          providers: res.providers.map((p) => p.toLowerCase()),
          hasPassword: res.hasPassword,
        });
      } else {
        // Fallback if user has email
        if (user?.email) {
          const fallback = ["email"];
          setConnectedProviders(new Set(fallback));
          setHasPassword(true);
          authInfoCache.set(key, {
            providers: fallback,
            hasPassword: true,
          });
        }
      }
    } catch {
      if (user?.email) {
        const fallback = ["email"];
        setConnectedProviders(new Set(fallback));
        setHasPassword(true);
        authInfoCache.set(key, {
          providers: fallback,
          hasPassword: true,
        });
      }
    } finally {
      setIsLoadingAuth(false);
    }
  }, [user?._id, user?.email]);

  useEffect(() => {
    if (isOpen) {
      const key = user?._id || user?.email;
      if (key && authInfoCache.has(key)) {
        const cached = authInfoCache.get(key)!;
        setConnectedProviders(new Set(cached.providers));
        setHasPassword(cached.hasPassword);
        setIsLoadingAuth(false);
      } else if (key) {
        fetchAuthProviders();
      }
    }
  }, [isOpen, user?._id, user?.email, fetchAuthProviders]);

  if (!isOpen) return null;

  // Handle Display Name save
  const handleSaveDisplayName = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) {
      toast.error(
        t("error_name_empty", {
          defaultValue: "Tên hiển thị không được để trống",
        })
      );
      return;
    }
    if (trimmed === user?.displayName) return;

    try {
      setIsSavingName(true);
      await updateProfile({ displayName: trimmed }).unwrap();
      toast.success(
        t("success_name_updated", {
          defaultValue: "Đã cập nhật tên hiển thị thành công!",
        })
      );
    } catch (err: any) {
      toast.error(
        err?.data?.message ||
        err?.message ||
        t("error_update_name", {
          defaultValue: "Không thể cập nhật tên hiển thị",
        })
      );
    } finally {
      setIsSavingName(false);
    }
  };

  // Handle Avatar file selection & upload
  const handleAvatarFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error(
        t("error_avatar_too_large", {
          defaultValue: "Kích thước ảnh tối đa là 5MB",
        })
      );
      return;
    }

    // Validate type
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      toast.error(
        t("error_avatar_format", {
          defaultValue:
            "Định dạng ảnh không được hỗ trợ (JPEG, PNG, WEBP, GIF)",
        })
      );
      return;
    }

    try {
      setIsUploadingAvatar(true);
      // 1. Get presigned upload URL
      const { signedUrl, publicUrl } = await getAvatarUploadPresignedUrl({
        fileName: file.name,
        contentType: file.type,
      }).unwrap();

      // 2. Upload file directly
      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!uploadRes.ok) {
        throw new Error("Lỗi khi tải ảnh lên máy chủ lưu trữ");
      }

      // 3. Update MongoDB user profile with new avatar URL
      await updateProfile({ avatarUrl: publicUrl }).unwrap();

      toast.success(
        t("success_avatar_updated", {
          defaultValue: "Đã cập nhật ảnh đại diện thành công!",
        })
      );
    } catch (err: any) {
      toast.error(
        err?.data?.message ||
        err?.message ||
        t("error_upload_avatar", {
          defaultValue: "Không thể tải lên ảnh đại diện",
        })
      );
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Handle password setup / change via NestJS backend (enforces current password validation)
  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (hasPassword && !currentPassword.trim()) {
      toast.error(
        t("error_current_password_empty", {
          defaultValue: "Vui lòng nhập mật khẩu hiện tại",
        })
      );
      return;
    }

    if (!newPassword.trim()) {
      toast.error(
        t("error_password_empty", {
          defaultValue: "Vui lòng nhập mật khẩu mới",
        })
      );
      return;
    }

    if (hasPassword && currentPassword.trim() === newPassword.trim()) {
      toast.error(
        t("error_new_same", {
          defaultValue: "Mật khẩu mới không được trùng với mật khẩu hiện tại",
        })
      );
      return;
    }

    if (!isPasswordPolicyValid) {
      toast.error(
        t("error_password_policy", {
          defaultValue: "Mật khẩu chưa đáp ứng đầy đủ yêu cầu bảo mật",
        })
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error(
        t("error_password_mismatch", {
          defaultValue: "Xác nhận mật khẩu không khớp",
        })
      );
      return;
    }

    try {
      setIsSubmittingPassword(true);
      const res = await updateUserPassword({
        currentPassword: hasPassword ? currentPassword.trim() : undefined,
        newPassword: newPassword.trim(),
      });

      if (!res.success) {
        if (res.isWrongCurrent) {
          toast.error(
            t("error_wrong_current", {
              defaultValue: "Mật khẩu hiện tại không chính xác",
            })
          );
          return;
        }
        toast.error(
          res.error ||
            t("error_set_password", {
              defaultValue: "Không thể thiết lập mật khẩu",
            })
        );
        return;
      }

      toast.success(
        hasPassword
          ? t("success_password_updated", {
            defaultValue: "Đã đổi mật khẩu thành công!",
          })
          : t("success_password_set", {
            defaultValue:
              "Đã thiết lập mật khẩu thành công! Giờ đây bạn có thể đăng nhập bằng email và mật khẩu này.",
          })
      );

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setHasPassword(true);
      setView("profile");

      // Cập nhật cache ngay lập tức và làm mới thông tin auth
      const key = user?._id || user?.email;
      if (key) {
        const existing = authInfoCache.get(key);
        const updatedProviders = Array.from(
          new Set([...(existing?.providers || []), "email"])
        );
        authInfoCache.set(key, {
          providers: updatedProviders,
          hasPassword: true,
        });
        setConnectedProviders(new Set(updatedProviders));
      }
      await fetchAuthProviders(true);
    } catch (err: any) {
      console.error("[EditProfileModal] Error changing password:", err);
      toast.error(
        err?.message ||
          t("error_set_password", {
            defaultValue: "Không thể thiết lập mật khẩu",
          })
      );
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  // OTP input helpers for forgot password flow
  const handleForgotOtpChange = (index: number, value: string) => {
    const val = value.replace(/[^0-9]/g, "");
    if (val.length > 1) {
      const pasted = val.slice(0, 6).split("");
      const newOtp = [...forgotOtp];
      pasted.forEach((char, i) => {
        if (index + i < 6) newOtp[index + i] = char;
      });
      setForgotOtp(newOtp);
      const focusIndex = Math.min(index + pasted.length, 5);
      forgotOtpRefs.current[focusIndex]?.focus();
      return;
    }

    const newOtp = [...forgotOtp];
    newOtp[index] = val;
    setForgotOtp(newOtp);

    if (val && index < 5) {
      forgotOtpRefs.current[index + 1]?.focus();
    }
  };

  const handleForgotOtpKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace" && !forgotOtp[index] && index > 0) {
      forgotOtpRefs.current[index - 1]?.focus();
    }
  };

  // Step 1: Send OTP to user's registered email
  const handleForgotSendOtp = async () => {
    const targetEmail = user?.email;
    if (!targetEmail) {
      toast.error(
        tPolicy("error_invalid_email", {
          defaultValue: "Không tìm thấy email của tài khoản.",
        }),
      );
      return;
    }
    try {
      setIsSendingForgotOtp(true);
      setForgotErrorMsg("");
      const res = await sendPasswordResetOtp(targetEmail);
      if (res.success) {
        setForgotStep("otp");
        setForgotCountdown(300);
        setForgotOtp(Array(6).fill(""));
        toast.success(
          t1("otp_sent", {
            defaultValue: "Đã gửi mã xác thực tới email của bạn.",
          }),
        );
      } else {
        setForgotErrorMsg(t1(res.error || "otp_send_failed"));
      }
    } catch {
      setForgotErrorMsg(
        t("error_network", {
          defaultValue: "Lỗi kết nối, vui lòng thử lại.",
        }),
      );
    } finally {
      setIsSendingForgotOtp(false);
    }
  };

  // Step 2: Verify OTP and establish recovery session
  const handleForgotVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = forgotOtp.join("");
    if (code.length < 6) {
      setForgotErrorMsg(
        tPolicy("error_invalid_otp", {
          defaultValue: "Vui lòng nhập đầy đủ mã xác thực 6 số.",
        }),
      );
      return;
    }
    const targetEmail = user?.email;
    if (!targetEmail) return;

    try {
      setIsVerifyingForgotOtp(true);
      setForgotErrorMsg("");
      const res = await verifyPasswordResetOtp(targetEmail, code);
      if (res.success) {
        setForgotStep("reset");
      } else {
        setForgotErrorMsg(t1(res.error || "otp_invalid_or_expired"));
      }
    } catch {
      setForgotErrorMsg(
        t("error_network", {
          defaultValue: "Lỗi kết nối, vui lòng thử lại.",
        }),
      );
    } finally {
      setIsVerifyingForgotOtp(false);
    }
  };

  // Step 3: Reset password using recovery session (without logging out)
  const handleForgotResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isForgotPolicyValid) {
      setForgotErrorMsg(
        t("error_password_policy", {
          defaultValue: "Mật khẩu chưa đáp ứng đầy đủ yêu cầu bảo mật.",
        }),
      );
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotErrorMsg(
        t("error_password_mismatch", {
          defaultValue: "Xác nhận mật khẩu không khớp.",
        }),
      );
      return;
    }

    try {
      setIsResettingPassword(true);
      setForgotErrorMsg("");
      const res =
        await resetUserPasswordWithRecoverySession(forgotNewPassword);
      if (res.success) {
        setForgotStep("success");
        setHasPassword(true);
        toast.success(
          t("success_password_updated", {
            defaultValue: "Đã đổi mật khẩu thành công!",
          }),
        );
        const key = user?._id || user?.email;
        if (key) {
          const existing = authInfoCache.get(key);
          const updatedProviders = Array.from(
            new Set([...(existing?.providers || []), "email"]),
          );
          authInfoCache.set(key, {
            providers: updatedProviders,
            hasPassword: true,
          });
          setConnectedProviders(new Set(updatedProviders));
        }
      } else {
        setForgotErrorMsg(
          res.error ||
            t("error_set_password", {
              defaultValue: "Không thể đổi mật khẩu.",
            }),
        );
      }
    } catch {
      setForgotErrorMsg(
        t("error_network", {
          defaultValue: "Lỗi kết nối, vui lòng thử lại.",
        }),
      );
    } finally {
      setIsResettingPassword(false);
    }
  };

  // Primary authentication methods to display
  const primaryProviders = [
    {
      id: "google",
      name: "Google",
      icon: (
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
      ),
    },
    {
      id: "facebook",
      name: "Facebook",
      icon: (
        <svg className="w-4 h-4 fill-[#1877F2] shrink-0" viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
    },
    {
      id: "email",
      name: t("method_email_password", { defaultValue: "Email & Mật khẩu" }),
      icon: <Mail className="w-4 h-4 text-brand-600 shrink-0" />,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal Card with Dynamic View Transition */}
      <div className="relative bg-white border border-slate-200/80 rounded-3xl shadow-[0_32px_64px_rgba(15,23,42,0.18)] w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col transition-all duration-300 ease-in-out">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-slate-100/80 hover:bg-slate-200/80 border border-slate-200/40 flex items-center justify-center transition-all duration-200 hover:rotate-90 active:scale-90 cursor-pointer"
        >
          <X className="w-4 h-4 text-slate-600" />
        </button>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* VIEW 1: MAIN PROFILE VIEW                                       */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {view === "profile" && (
          <div className="flex flex-col h-full overflow-hidden animate-in fade-in duration-200">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
              <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800 tracking-tight">
                  {t("title", { defaultValue: "Thông tin cá nhân" })}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {t("subtitle", {
                    defaultValue:
                      "Xem và cập nhật thông tin hiển thị, tài khoản và phương thức bảo mật",
                  })}
                </p>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              {/* ── Section 1: Avatar & Display Name ──────────────────── */}
              <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-2xl bg-slate-50/70 border border-slate-100">
                {/* Avatar with Upload Hover */}
                <div className="relative group shrink-0">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleAvatarFileChange}
                    className="hidden"
                  />
                  <div
                    onClick={() =>
                      !isUploadingAvatar && fileInputRef.current?.click()
                    }
                    className="relative cursor-pointer rounded-full overflow-hidden border-2 border-white shadow-md ring-2 ring-brand-500/20 transition-transform active:scale-95"
                  >
                    <UserAvatar
                      avatarUrl={user?.avatarUrl}
                      displayName={user?.displayName || user?.email}
                      size="w-20 h-20"
                    />
                    {/* Overlay on hover or loading */}
                    <div
                      className={`absolute inset-0 bg-slate-900/60 flex flex-col items-center justify-center text-white transition-opacity ${isUploadingAvatar
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100"
                        }`}
                    >
                      {isUploadingAvatar ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : (
                        <>
                          <Camera className="w-5 h-5 mb-1" />
                          <span className="text-[10px] font-semibold">
                            {t("change_avatar", { defaultValue: "Đổi ảnh" })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* User Basic Info */}
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <h4 className="text-base font-bold text-slate-800 truncate">
                    {user?.displayName || "Người dùng"}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 truncate">
                    {user?.email}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      !isUploadingAvatar && fileInputRef.current?.click()
                    }
                    disabled={isUploadingAvatar}
                    className="mt-2 text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline flex items-center justify-center sm:justify-start gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>
                      {isUploadingAvatar
                        ? t("uploading", { defaultValue: "Đang tải ảnh lên..." })
                        : t("upload_new_photo", {
                          defaultValue: "Tải lên ảnh mới",
                        })}
                    </span>
                  </button>
                </div>
              </div>

              {/* ── Section 2: Form Chỉnh sửa Tên hiển thị & Email ────── */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-brand-600" />
                  <span>
                    {t("section_info", { defaultValue: "Thông tin hiển thị" })}
                  </span>
                </h4>

                {/* Display Name Input */}
                <form onSubmit={handleSaveDisplayName} className="space-y-2">
                  <label className="text-xs font-semibold text-slate-600 block">
                    {t("display_name_label", { defaultValue: "Tên hiển thị" })}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={t("display_name_placeholder", {
                        defaultValue: "Nhập tên hiển thị của bạn",
                      })}
                      className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                    />
                    <button
                      type="submit"
                      disabled={
                        isSavingName ||
                        !displayName.trim() ||
                        displayName.trim() === user?.displayName
                      }
                      className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed shrink-0"
                    >
                      {isSavingName ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>{t("save_name", { defaultValue: "Lưu tên" })}</span>
                    </button>
                  </div>
                </form>

                {/* Email (Disabled, No Extra Badges) */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-600 block">
                    {t("email_label", { defaultValue: "Địa chỉ Email" })}
                  </label>
                  <div className="relative flex items-center">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                    <input
                      type="email"
                      disabled
                      value={user?.email || ""}
                      className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed select-all"
                    />
                  </div>
                </div>
              </div>

              {/* ── Section 3: Phương thức đăng nhập đã liên kết ───────── */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-brand-600" />
                  <span>
                    {t("section_auth_methods", {
                      defaultValue: "Phương thức đăng nhập",
                    })}
                  </span>
                </h4>

                {isLoadingAuth ? (
                  <div className="py-4 flex items-center gap-2 text-slate-400 text-xs">
                    <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
                    <span>
                      {t("loading_auth", {
                        defaultValue: "Đang tải danh sách phương thức...",
                      })}
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {primaryProviders.map((prov) => {
                      const isLinked =
                        prov.id === "email"
                          ? connectedProviders.has("email") || hasPassword
                          : connectedProviders.has(prov.id);

                      return (
                        <div
                          key={prov.id}
                          className={`flex flex-col justify-between p-3 rounded-2xl border transition-all ${isLinked
                            ? "bg-slate-50/90 border-slate-200 text-slate-800 shadow-2xs"
                            : "bg-white border-slate-100 text-slate-400 opacity-70"
                            }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 rounded-lg bg-white shadow-2xs border border-slate-100">
                              {prov.icon}
                            </div>
                            <span className="text-xs font-bold truncate">
                              {prov.name}
                            </span>
                          </div>
                          <div className="flex items-center">
                            {isLinked ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                {t("connected", { defaultValue: "Đã liên kết" })}
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                {t("not_connected", {
                                  defaultValue: "Chưa liên kết",
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Section 4: Mật khẩu (Chuyển sang Tab mới qua Mũi tên phải) ── */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setNewPassword("");
                    setConfirmPassword("");
                    setView("password");
                  }}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/70 hover:bg-slate-100/80 hover:border-slate-300 transition-all text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center text-brand-600 shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 tracking-tight">
                        {hasPassword
                          ? t("password_section_title", {
                            defaultValue: "Mật khẩu tài khoản",
                          })
                          : t("set_password_title", {
                            defaultValue: "Thiết lập mật khẩu",
                          })}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {hasPassword
                          ? t("password_row_desc_has", {
                            defaultValue: "Đổi mật khẩu đăng nhập của bạn",
                          })
                          : t("password_row_desc_no", {
                            defaultValue:
                              "Tạo mật khẩu để có thể đăng nhập bằng email",
                          })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 text-slate-400 group-hover:text-brand-600 transition-colors">
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* VIEW 2: PASSWORD TAB (THIẾT LẬP HOẶC ĐỔI MẬT KHẨU)            */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {view === "password" && (
          <div className="flex flex-col h-full overflow-hidden animate-in fade-in duration-200">
            {/* Password Tab Header with Back Button */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setView("profile")}
                className="w-8 h-8 rounded-xl bg-white hover:bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors cursor-pointer shrink-0"
                title={t("back", { defaultValue: "Quay lại" })}
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-slate-800 tracking-tight">
                  {hasPassword
                    ? t("btn_change_password", { defaultValue: "Đổi mật khẩu" })
                    : t("set_password_title", {
                      defaultValue: "Thiết lập mật khẩu",
                    })}
                </h3>
                <p className="text-xs text-slate-400 truncate mt-0.5">
                  {hasPassword
                    ? t("change_pw_header", {
                      defaultValue: "Cập nhật mật khẩu bảo vệ tài khoản của bạn",
                    })
                    : t("set_pw_header", {
                      defaultValue:
                        "Tạo mật khẩu mới để có thể đăng nhập bằng email",
                    })}
                </p>
              </div>
            </div>

            {/* Password Form Content */}
            <form
              onSubmit={handleSavePassword}
              className="flex-1 overflow-y-auto p-6 flex flex-col gap-5"
            >
              {/* Current Password (only when user already has a password) */}
              {hasPassword && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 block">
                      {t("current_password_label", {
                        defaultValue: "Mật khẩu hiện tại",
                      })}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setView("forgot-password");
                        setForgotStep("email");
                        setForgotErrorMsg("");
                      }}
                      className="text-[11px] font-medium text-brand-600 hover:text-brand-700 hover:underline cursor-pointer"
                    >
                      {t("forgot_password_link", {
                        defaultValue: "Quên mật khẩu?",
                      })}
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder={t("current_password_placeholder", {
                        defaultValue: "Nhập mật khẩu hiện tại của bạn",
                      })}
                      className="w-full px-4 py-2.5 pr-10 text-sm rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* New Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">
                  {t("new_password_label", { defaultValue: "Mật khẩu mới" })}
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t("new_password_placeholder", {
                      defaultValue: "Tối thiểu 8 ký tự",
                    })}
                    className="w-full px-4 py-2.5 pr-10 text-sm rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showNewPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Password Policy Checklist (matches signup) */}
              {newPassword && (
                <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/80 space-y-2">
                  <p className="text-[12px] font-bold text-slate-800">
                    {tPolicy("reset_policy_title", {
                      defaultValue: "Yêu cầu mật khẩu:",
                    })}
                  </p>
                  <ul className="space-y-1.5">
                    {[
                      {
                        id: 1,
                        text: tPolicy("reset_policy_length", {
                          defaultValue: "Tối thiểu 8 ký tự",
                        }),
                        valid: hasMinLength,
                      },
                      {
                        id: 2,
                        text: tPolicy("reset_policy_letter", {
                          defaultValue: "Chứa ít nhất 1 chữ cái",
                        }),
                        valid: hasLetter,
                      },
                      {
                        id: 3,
                        text: tPolicy("reset_policy_upper", {
                          defaultValue: "Chứa ít nhất 1 chữ hoa",
                        }),
                        valid: hasUpper,
                      },
                      {
                        id: 4,
                        text: tPolicy("reset_policy_lower", {
                          defaultValue: "Chứa ít nhất 1 chữ thường",
                        }),
                        valid: hasLower,
                      },
                      {
                        id: 5,
                        text: tPolicy("reset_policy_number", {
                          defaultValue: "Chứa ít nhất 1 chữ số",
                        }),
                        valid: hasNumber,
                      },
                    ].map((req) => (
                      <li
                        key={req.id}
                        className="flex items-center gap-2 text-[12px]"
                      >
                        <div
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${req.valid ? "bg-[#0052FF]" : "bg-slate-300"
                            }`}
                        />
                        <span
                          className={
                            req.valid
                              ? "text-slate-800 font-medium"
                              : "text-slate-500"
                          }
                        >
                          {req.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-start gap-2 text-[12px] pt-1.5 border-t border-slate-100">
                    <div
                      className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${noConsecutive ? "bg-[#0052FF]" : "bg-slate-300"
                        }`}
                    />
                    <span
                      className={
                        noConsecutive
                          ? "text-slate-800 font-medium"
                          : "text-slate-500 leading-relaxed"
                      }
                    >
                      {tPolicy("reset_policy_no_consecutive_desc", {
                        defaultValue:
                          "Không chứa nhiều hơn 3 ký tự liên tiếp giống nhau",
                      })}
                    </span>
                  </div>
                </div>
              )}

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">
                  {t("confirm_password_label", {
                    defaultValue: "Xác nhận mật khẩu",
                  })}
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t("confirm_password_placeholder", {
                      defaultValue: "Nhập lại mật khẩu mới",
                    })}
                    className="w-full px-4 py-2.5 pr-10 text-sm rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowConfirmPassword(!showConfirmPassword)
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Bottom Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5 mt-auto border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setView("profile")}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  {t("cancel", { defaultValue: "Hủy" })}
                </button>
                <button
                  type="submit"
                  disabled={
                    isSubmittingPassword ||
                    !newPassword ||
                    (hasPassword && !currentPassword)
                  }
                  className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingPassword ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {hasPassword
                      ? t("btn_save_password", {
                        defaultValue: "Cập nhật mật khẩu",
                      })
                      : t("btn_confirm_set_password", {
                        defaultValue: "Lưu mật khẩu",
                      })}
                  </span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ─── VIEW 3: FORGOT PASSWORD FLOW (EMBEDDED INSIDE MODAL) ─── */}
        {view === "forgot-password" && (
          <div className="flex flex-col h-full overflow-hidden animate-in fade-in duration-200">
            {/* Header with Back button */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setView("password")}
                  className="w-8 h-8 rounded-xl bg-white hover:bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors cursor-pointer shrink-0"
                  title={t("back", { defaultValue: "Quay lại" })}
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {tPolicy("title", { defaultValue: "Quên mật khẩu" })}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {forgotStep === "email" &&
                      t("forgot_password_confirm_subtitle", {
                        defaultValue:
                          "Hãy xác nhận đây là email của bạn và gửi mã OTP để đặt lại mật khẩu",
                      })}
                    {forgotStep === "otp" &&
                      (tPolicy("otp_subtitle", {
                        defaultValue: "Nhập mã xác thực 6 số gửi đến email",
                      }))}
                    {forgotStep === "reset" &&
                      (tPolicy("reset_subtitle", {
                        defaultValue: "Nhập mật khẩu mới của bạn",
                      }))}
                    {forgotStep === "success" &&
                      t("reset_password_success_title", {
                        defaultValue: "Đặt lại mật khẩu thành công",
                      })}
                  </p>
                </div>
              </div>
            </div>

            {/* Body Content */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
              {/* Error Alert */}
              {forgotErrorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-600 flex items-start gap-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="flex-1">{forgotErrorMsg}</span>
                </div>
              )}

              {/* STEP 1: EMAIL CONFIRMATION & SEND OTP */}
              {forgotStep === "email" && (
                <div
                  key="forgot-step-email"
                  className="flex flex-col items-center justify-center py-6 text-center space-y-5 my-auto animate-in fade-in slide-in-from-right-4 duration-300"
                >
                  <div className="w-14 h-14 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 shadow-sm">
                    <Mail className="w-7 h-7" />
                  </div>
                  <div className="max-w-xs space-y-1.5">
                    <h4 className="text-sm font-bold text-slate-800">
                      {t("confirm_email_title", { defaultValue: "Xác nhận địa chỉ email" })}
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {t("forgot_password_confirm_desc", {
                        defaultValue:
                          "Hãy xác nhận đây là email của bạn và nhấn gửi mã OTP để đặt lại mật khẩu:",
                      })}
                    </p>
                  </div>
                  <div className="w-full max-w-sm px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-xl text-sm font-semibold text-slate-800 break-all select-all">
                    {user?.email}
                  </div>
                  <div className="w-full max-w-sm pt-2">
                    <button
                      type="button"
                      onClick={handleForgotSendOtp}
                      disabled={isSendingForgotOtp}
                      className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 shadow-sm"
                    >
                      {isSendingForgotOtp ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Mail className="w-4 h-4" />
                      )}
                      <span>
                        {t("send_otp_btn", { defaultValue: "Gửi mã OTP xác nhận" })}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: OTP INPUT */}
              {forgotStep === "otp" && (
                <form
                  key="forgot-step-otp"
                  onSubmit={handleForgotVerifyOtp}
                  className="flex flex-col items-center justify-center py-4 space-y-5 my-auto animate-in fade-in slide-in-from-right-4 duration-300"
                >
                  <div className="w-12 h-12 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
                    <KeyRound className="w-6 h-6" />
                  </div>
                  <div className="text-center space-y-1 max-w-xs">
                    <h4 className="text-sm font-bold text-slate-800">
                      Nhập mã xác thực
                    </h4>
                    <p className="text-xs text-slate-500">
                      Mã đã được gửi đến <span className="font-semibold text-slate-700">{user?.email}</span>
                    </p>
                  </div>

                  {/* 6 Digit OTP Input Boxes */}
                  <div className="flex items-center justify-center gap-2 sm:gap-2.5">
                    {forgotOtp.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => {
                          forgotOtpRefs.current[index] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleForgotOtpChange(index, e.target.value)}
                        onKeyDown={(e) => handleForgotOtpKeyDown(index, e)}
                        className="w-10 h-12 sm:w-11 sm:h-12 text-center text-lg font-bold rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-sm"
                      />
                    ))}
                  </div>

                  {/* Resend OTP */}
                  <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
                    {forgotCountdown > 0 ? (
                      <span>
                        Gửi lại mã sau{" "}
                        <strong className="text-slate-700">
                          {Math.floor(forgotCountdown / 60)}:
                          {(forgotCountdown % 60).toString().padStart(2, "0")}
                        </strong>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleForgotSendOtp}
                        disabled={isSendingForgotOtp}
                        className="text-brand-600 hover:text-brand-700 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Gửi lại mã</span>
                      </button>
                    )}
                  </div>

                  <div className="w-full max-w-sm pt-2">
                    <button
                      type="submit"
                      disabled={isVerifyingForgotOtp || forgotOtp.join("").length < 6}
                      className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 shadow-sm"
                    >
                      {isVerifyingForgotOtp ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      <span>Xác nhận mã OTP</span>
                    </button>
                  </div>
                </form>
              )}

              {/* STEP 3: RESET PASSWORD */}
              {forgotStep === "reset" && (
                <form
                  key="forgot-step-reset"
                  onSubmit={handleForgotResetPassword}
                  className="flex flex-col gap-4 py-2 animate-in fade-in slide-in-from-right-4 duration-300"
                >
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-800">
                      Thiết lập mật khẩu mới
                    </h4>
                    <p className="text-xs text-slate-500">
                      Phiên khôi phục đã được xác thực. Vui lòng nhập mật khẩu mới.
                    </p>
                  </div>

                  {/* New Password */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 block">
                      {t("new_password_label", { defaultValue: "Mật khẩu mới" })}
                    </label>
                    <div className="relative">
                      <input
                        type={showForgotNewPassword ? "text" : "password"}
                        value={forgotNewPassword}
                        onChange={(e) => setForgotNewPassword(e.target.value)}
                        placeholder={t("new_password_placeholder", {
                          defaultValue: "Tối thiểu 8 ký tự",
                        })}
                        className="w-full px-4 py-2.5 pr-10 text-sm rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowForgotNewPassword(!showForgotNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showForgotNewPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Password Policy Checklist */}
                  {forgotNewPassword && (
                    <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/80 space-y-2">
                      <p className="text-[12px] font-bold text-slate-800">
                        {tPolicy("reset_policy_title", {
                          defaultValue: "Yêu cầu mật khẩu:",
                        })}
                      </p>
                      <ul className="space-y-1.5">
                        {[
                          {
                            id: 1,
                            text: tPolicy("reset_policy_length", {
                              defaultValue: "Tối thiểu 8 ký tự",
                            }),
                            valid: forgotHasMinLength,
                          },
                          {
                            id: 2,
                            text: tPolicy("reset_policy_letter", {
                              defaultValue: "Chứa ít nhất 1 chữ cái",
                            }),
                            valid: forgotHasLetter,
                          },
                          {
                            id: 3,
                            text: tPolicy("reset_policy_upper", {
                              defaultValue: "Chứa ít nhất 1 chữ hoa",
                            }),
                            valid: forgotHasUpper,
                          },
                          {
                            id: 4,
                            text: tPolicy("reset_policy_lower", {
                              defaultValue: "Chứa ít nhất 1 chữ thường",
                            }),
                            valid: forgotHasLower,
                          },
                          {
                            id: 5,
                            text: tPolicy("reset_policy_number", {
                              defaultValue: "Chứa ít nhất 1 chữ số",
                            }),
                            valid: forgotHasNumber,
                          },
                        ].map((req) => (
                          <li
                            key={req.id}
                            className="flex items-center gap-2 text-[12px]"
                          >
                            <div
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                req.valid ? "bg-[#0052FF]" : "bg-slate-300"
                              }`}
                            />
                            <span
                              className={
                                req.valid
                                  ? "text-slate-800 font-medium"
                                  : "text-slate-500"
                              }
                            >
                              {req.text}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="flex items-start gap-2 text-[12px] pt-1.5 border-t border-slate-100">
                        <div
                          className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${
                            forgotNoConsecutive ? "bg-[#0052FF]" : "bg-slate-300"
                          }`}
                        />
                        <span
                          className={
                            forgotNoConsecutive
                              ? "text-slate-800 font-medium"
                              : "text-slate-500 leading-relaxed"
                          }
                        >
                          {tPolicy("reset_policy_consecutive", {
                            defaultValue: "Không lặp lại 4 ký tự liên tiếp",
                          })}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Confirm Password */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 block">
                      {t("confirm_password_label", {
                        defaultValue: "Xác nhận mật khẩu",
                      })}
                    </label>
                    <div className="relative">
                      <input
                        type={showForgotConfirmPassword ? "text" : "password"}
                        value={forgotConfirmPassword}
                        onChange={(e) => setForgotConfirmPassword(e.target.value)}
                        placeholder={t("confirm_password_placeholder", {
                          defaultValue: "Nhập lại mật khẩu mới",
                        })}
                        className="w-full px-4 py-2.5 pr-10 text-sm rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowForgotConfirmPassword(!showForgotConfirmPassword)
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showForgotConfirmPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Bottom Buttons */}
                  <div className="pt-2 flex items-center justify-end gap-2.5 mt-auto border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setView("password")}
                      className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                    >
                      {t("cancel", { defaultValue: "Hủy" })}
                    </button>
                    <button
                      type="submit"
                      disabled={
                        isResettingPassword ||
                        !forgotNewPassword ||
                        !isForgotPolicyValid ||
                        forgotNewPassword !== forgotConfirmPassword
                      }
                      className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      {isResettingPassword ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>Lưu mật khẩu mới</span>
                    </button>
                  </div>
                </form>
              )}

              {/* STEP 4: SUCCESS */}
              {forgotStep === "success" && (
                <div
                  key="forgot-step-success"
                  className="flex flex-col items-center justify-center py-8 text-center space-y-4 my-auto animate-in fade-in zoom-in-95 duration-300"
                >
                  <div className="w-16 h-16 rounded-3xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 shadow-sm">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>
                  <div className="space-y-1.5 max-w-xs">
                    <h4 className="text-base font-bold text-slate-900">
                      {t("reset_password_success_title", {
                        defaultValue: "Đổi mật khẩu thành công!",
                      })}
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {t("reset_password_success_desc", {
                        defaultValue:
                          "Mật khẩu của bạn đã được thay đổi. Phiên làm việc đã được cập nhật với mật khẩu mới.",
                      })}
                    </p>
                  </div>
                  <div className="pt-3 w-full max-w-xs">
                    <button
                      type="button"
                      onClick={() => setView("profile")}
                      className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-sm"
                    >
                      {t("back_to_profile_btn", {
                        defaultValue: "Quay lại thông tin cá nhân",
                      })}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Step indicator dots at bottom center */}
            <div className="py-3.5 border-t border-slate-100 flex items-center justify-center gap-2 bg-slate-50/50 shrink-0">
              {(["email", "otp", "reset"] as const).map((s, idx) => {
                const stepOrder = { email: 0, otp: 1, reset: 2, success: 3 };
                const active = stepOrder[forgotStep] >= idx;
                const isCurrent = forgotStep === s;
                return (
                  <div
                    key={s}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      isCurrent
                        ? "w-6 bg-brand-600"
                        : active
                        ? "w-2 bg-brand-600/70"
                        : "w-2 bg-slate-300"
                    }`}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

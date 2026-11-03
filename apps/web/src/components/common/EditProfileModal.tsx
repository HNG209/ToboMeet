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
} from "lucide-react";
import { UserResponse } from "@tobomeet/shared/types";
import { validatePasswordPolicy } from "@tobomeet/shared/utils";
import {
  useGetAvatarUploadPresignedUrlMutation,
  useUpdateProfileMutation,
  useChangePasswordMutation,
} from "@/lib/redux/api/usersApi";
import { getUserAuthInfo } from "@/app/[locale]/auth/profile-actions";
import { refreshWebSession } from "@/lib/auth/session";
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
  const locale = useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // View state: "profile" (main tab) or "password" (dedicated password setup tab)
  const [view, setView] = useState<"profile" | "password">("profile");

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
  const [changePasswordMutation] = useChangePasswordMutation();

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

  // Reset view on modal close/open
  useEffect(() => {
    if (!isOpen) {
      setView("profile");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
    }
  }, [isOpen]);

  // ESC key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (view === "password") {
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
      const res = await changePasswordMutation({
        currentPassword: hasPassword ? currentPassword.trim() : undefined,
        newPassword: newPassword.trim(),
      }).unwrap();

      if (res?.session) {
        await refreshWebSession(res.session);
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
      const errMsg =
        err?.data?.message ||
        err?.message ||
        t("error_set_password", {
          defaultValue: "Không thể thiết lập mật khẩu",
        });
      toast.error(errMsg);
    } finally {
      setIsSubmittingPassword(false);
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
                    <Link
                      href={`/${locale}/forgot-password`}
                      target="_blank"
                      className="text-[11px] font-medium text-brand-600 hover:text-brand-700 hover:underline"
                    >
                      {t("forgot_password_link", {
                        defaultValue: "Quên mật khẩu?",
                      })}
                    </Link>
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
      </div>
    </div>
  );
}

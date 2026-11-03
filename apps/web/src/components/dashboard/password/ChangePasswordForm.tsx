"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2, Circle } from "lucide-react";
import { useChangePasswordMutation } from "@/lib/redux/api/usersApi";
import { refreshWebSession } from "@/lib/auth/session";
import { PasswordField } from "./PasswordField";
import { PasswordActions } from "./PasswordActions";

interface FormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface FormErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
  api?: string;
}

const INITIAL_VALUES: FormValues = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

// Supabase password policy: lowercase, uppercase, digit, special char
const PASSWORD_RULES = {
  minLength: (v: string) => v.length >= 8,
  hasLowercase: (v: string) => /[a-z]/.test(v),
  hasUppercase: (v: string) => /[A-Z]/.test(v),
  hasDigit: (v: string) => /[0-9]/.test(v),
  hasSpecial: (v: string) =>
    /[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?`~]/.test(v),
};

function PasswordStrengthHints({
  password,
  t,
}: {
  password: string;
  t: ReturnType<typeof useTranslations>;
}) {
  if (!password) return null;

  const rules = [
    { key: "hint_min", pass: PASSWORD_RULES.minLength(password) },
    { key: "hint_uppercase", pass: PASSWORD_RULES.hasUppercase(password) },
    { key: "hint_lowercase", pass: PASSWORD_RULES.hasLowercase(password) },
    { key: "hint_digit", pass: PASSWORD_RULES.hasDigit(password) },
    { key: "hint_special", pass: PASSWORD_RULES.hasSpecial(password) },
  ] as const;

  const allPass = rules.every((r) => r.pass);
  if (allPass) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-1.5">
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
        {t("hint_title")}
      </p>
      {rules.map((rule) => (
        <div key={rule.key} className="flex items-center gap-2">
          {rule.pass ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          ) : (
            <Circle className="w-3.5 h-3.5 text-slate-300 shrink-0" />
          )}
          <span
            className={`text-[12px] ${rule.pass ? "text-emerald-600" : "text-slate-500"}`}
          >
            {t(rule.key)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ChangePasswordForm() {
  const t = useTranslations("settings.password");

  const [values, setValues] = useState<FormValues>(INITIAL_VALUES);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<keyof FormValues, boolean>>({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });

  const [changePassword, { isLoading }] = useChangePasswordMutation();

  // --- Validation ---
  const validateField = useCallback(
    (field: keyof FormValues, vals: FormValues): string | undefined => {
      switch (field) {
        case "currentPassword":
          if (!vals.currentPassword.trim()) return t("error_current_required");
          return undefined;

        case "newPassword": {
          const p = vals.newPassword;
          if (!p.trim()) return t("error_new_required");
          if (!PASSWORD_RULES.minLength(p)) return t("error_new_min");
          if (!PASSWORD_RULES.hasUppercase(p)) return t("error_new_uppercase");
          if (!PASSWORD_RULES.hasLowercase(p)) return t("error_new_lowercase");
          if (!PASSWORD_RULES.hasDigit(p)) return t("error_new_digit");
          if (!PASSWORD_RULES.hasSpecial(p)) return t("error_new_special");
          if (vals.currentPassword.trim() && p === vals.currentPassword)
            return t("error_new_same");
          return undefined;
        }

        case "confirmPassword":
          if (!vals.confirmPassword.trim()) return t("error_confirm_required");
          if (vals.confirmPassword !== vals.newPassword)
            return t("error_confirm_mismatch");
          return undefined;

        default:
          return undefined;
      }
    },
    [t]
  );

  const validateAll = useCallback(
    (vals: FormValues): FormErrors => ({
      currentPassword: validateField("currentPassword", vals),
      newPassword: validateField("newPassword", vals),
      confirmPassword: validateField("confirmPassword", vals),
    }),
    [validateField]
  );

  const isFormValid = useCallback(
    (vals: FormValues, errs: FormErrors): boolean => {
      if (!vals.currentPassword.trim()) return false;
      const p = vals.newPassword;
      if (!p.trim()) return false;
      if (!PASSWORD_RULES.minLength(p)) return false;
      if (!PASSWORD_RULES.hasUppercase(p)) return false;
      if (!PASSWORD_RULES.hasLowercase(p)) return false;
      if (!PASSWORD_RULES.hasDigit(p)) return false;
      if (!PASSWORD_RULES.hasSpecial(p)) return false;
      if (p === vals.currentPassword) return false;
      if (vals.confirmPassword !== vals.newPassword) return false;
      return !errs.currentPassword && !errs.newPassword && !errs.confirmPassword;
    },
    []
  );

  // --- Handlers ---
  const handleChange = useCallback(
    (field: keyof FormValues) => (value: string) => {
      const nextValues = { ...values, [field]: value };
      setValues(nextValues);

      if (touched[field]) {
        const nextErrors: FormErrors = {
          ...errors,
          [field]: validateField(field, nextValues),
          api: undefined,
        };
        // Re-validate confirmPassword khi newPassword thay doi
        if (field === "newPassword" && touched.confirmPassword) {
          nextErrors.confirmPassword = validateField("confirmPassword", nextValues);
        }
        setErrors(nextErrors);
      }
    },
    [values, touched, errors, validateField]
  );

  const handleBlur = useCallback(
    (field: keyof FormValues) => () => {
      setTouched((prev) => ({ ...prev, [field]: true }));
      setErrors((prev) => ({
        ...prev,
        [field]: validateField(field, values),
        api: undefined,
      }));
    },
    [validateField, values]
  );

  const handleCancel = useCallback(() => {
    setValues(INITIAL_VALUES);
    setErrors({});
    setTouched({
      currentPassword: false,
      newPassword: false,
      confirmPassword: false,
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ currentPassword: true, newPassword: true, confirmPassword: true });
    const allErrors = validateAll(values);
    setErrors(allErrors);
    if (allErrors.currentPassword || allErrors.newPassword || allErrors.confirmPassword) return;

    try {
      const res = await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }).unwrap();

      console.log("[ChangePasswordForm] Result:", res);

      if (res?.session) {
        await refreshWebSession(res.session);
      }

      toast.success(t("success"));
      handleCancel();
    } catch (err: unknown) {
      console.error('[ChangePasswordForm] Error:', err);
      const apiErr = err as { code?: number; message?: string };
      const code = apiErr?.code;
      const message = (apiErr?.message ?? "").toLowerCase();

      const isWrongCurrent =
        code === 400 ||
        code === 401 ||
        message.includes("current") ||
        message.includes("incorrect") ||
        message.includes("invalid") ||
        message.includes("wrong") ||
        message.includes("khong chinh xac") ||
        message.includes("sai mat khau");

      if (isWrongCurrent) {
        setErrors((prev) => ({ ...prev, currentPassword: t("error_wrong_current") }));
        return;
      }
      if (code === 5000 || code === 503 || message.includes("connect")) {
        setErrors((prev) => ({ ...prev, api: t("error_network") }));
        return;
      }
      setErrors((prev) => ({ ...prev, api: t("error_generic") }));
    }
  };

  const formValid = isFormValid(values, errors);

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {/* API-level error */}
      {errors.api && (
        <div className="px-4 py-3 rounded-xl border border-red-200 bg-red-50/50 text-[13px] text-red-600">
          {errors.api}
        </div>
      )}

      <PasswordField
        id="currentPassword"
        name="currentPassword"
        label={t("current_label")}
        placeholder={t("current_placeholder")}
        value={values.currentPassword}
        error={touched.currentPassword ? errors.currentPassword : undefined}
        disabled={isLoading}
        onChange={handleChange("currentPassword")}
        onBlur={handleBlur("currentPassword")}
      />

      <div className="flex flex-col gap-2">
        <PasswordField
          id="newPassword"
          name="newPassword"
          label={t("new_label")}
          placeholder={t("new_placeholder")}
          value={values.newPassword}
          error={touched.newPassword ? errors.newPassword : undefined}
          disabled={isLoading}
          onChange={handleChange("newPassword")}
          onBlur={handleBlur("newPassword")}
        />
        {/* Password strength hints — chi hien khi dang nhap */}
        <PasswordStrengthHints password={values.newPassword} t={t} />
      </div>

      <PasswordField
        id="confirmPassword"
        name="confirmPassword"
        label={t("confirm_label")}
        placeholder={t("confirm_placeholder")}
        value={values.confirmPassword}
        error={touched.confirmPassword ? errors.confirmPassword : undefined}
        disabled={isLoading}
        onChange={handleChange("confirmPassword")}
        onBlur={handleBlur("confirmPassword")}
      />

      <PasswordActions
        isLoading={isLoading}
        disabled={!formValid}
        onCancel={handleCancel}
        submitLabel={t("submit")}
        submittingLabel={t("submitting")}
        cancelLabel={t("cancel")}
      />
    </form>
  );
}

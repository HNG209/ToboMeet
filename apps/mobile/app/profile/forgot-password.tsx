import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { toast } from "../../lib/toast";
import { supabaseAuth } from "../../lib/supabase";
import { useGetMeQuery } from "../../lib/redux/features/users/usersApi";
import { validatePasswordPolicy } from "@tobomeet/shared/utils";

type Step = "email" | "otp" | "reset" | "success";

export default function ProfileForgotPasswordScreen() {
  const { t } = useTranslation();
  const { data: profile } = useGetMeQuery();

  const [step, setStep] = useState<Step>("email");
  const [countdown, setCountdown] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Step 2: OTP
  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const otpRefs = useRef<(TextInput | null)[]>([]);

  // Step 3: Passwords
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    hasMinLength,
    hasLetter,
    hasUpper,
    hasLower,
    hasNumber,
    noConsecutive,
    isValid: isPasswordPolicyValid,
  } = validatePasswordPolicy(newPassword);

  // Countdown timer for OTP
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const userEmail = profile?.email || "";

  // Step 1: Send OTP to user's email
  const handleSendOtp = async () => {
    if (!userEmail) {
      toast.error(
        t("forgot_password.error_invalid_email", "Không tìm thấy email tài khoản.")
      );
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg("");
      await supabaseAuth.sendPasswordResetOtp(userEmail);
      setStep("otp");
      setCountdown(300);
      setOtp(Array(6).fill(""));
      toast.success(
        t("password_reset.otp_sent", "Đã gửi mã xác thực tới email của bạn.")
      );
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          t("password_reset.otp_send_failed", "Không thể gửi mã xác nhận, vui lòng thử lại sau.")
      );
    } finally {
      setIsLoading(false);
    }
  };

  // OTP inputs handling
  const handleOtpChange = (index: number, value: string) => {
    const val = value.replace(/[^0-9]/g, "");
    if (val.length > 1) {
      const pasted = val.slice(0, 6).split("");
      const newOtp = [...otp];
      pasted.forEach((char, i) => {
        if (index + i < 6) newOtp[index + i] = char;
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

  const handleOtpKeyPress = (index: number, key: string) => {
    if (key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  // Step 2: Verify OTP -> establishes recovery session
  const handleVerifyOtp = async () => {
    const code = otp.join("");
    if (code.length < 6) {
      setErrorMsg(
        t("forgot_password.error_invalid_otp", "Vui lòng nhập đầy đủ 6 chữ số mã xác thực.")
      );
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg("");
      // Gán recovery session vào phiên hiện tại qua verifyOtp
      await supabaseAuth.verifyPasswordResetOtp(userEmail, code);
      setStep("reset");
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          t("forgot_password.error_invalid_otp", "Mã xác thực không hợp lệ hoặc đã hết hạn.")
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Reset password using recovery session and update to new active session
  const handleResetPassword = async () => {
    if (!isPasswordPolicyValid) {
      setErrorMsg(
        t("settings.password.error_policy", "Mật khẩu chưa đáp ứng đầy đủ yêu cầu bảo mật.")
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg(
        t("settings.password.error_mismatch", "Xác nhận mật khẩu không khớp.")
      );
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg("");
      // Cập nhật mật khẩu và lưu phiên mới mà không đăng xuất
      await supabaseAuth.resetPasswordStayLoggedIn(newPassword);
      setStep("success");
      toast.success(
        t("settings.password.success_changed", "Đã đổi mật khẩu thành công!")
      );
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          t("password_reset.password_update_failed", "Không thể cập nhật mật khẩu.")
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-slate-50"
    >
      {/* Header */}
      <View className="px-5 py-4 bg-white border-b border-slate-100 flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <TouchableOpacity
            onPress={() => router.back()}
            className="p-1 -ml-1 rounded-full active:bg-slate-100"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="arrow-left" size={24} color="#0f172a" />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-slate-900">
            {t("forgot_password.title", "Quên mật khẩu")}
          </Text>
        </View>

        {/* Step indicator */}
        <View className="flex-row items-center gap-1.5">
          {(["email", "otp", "reset"] as const).map((s, idx) => {
            const stepOrder = { email: 0, otp: 1, reset: 2, success: 3 };
            const active = stepOrder[step] >= idx;
            return (
              <View
                key={s}
                className={`w-2 h-2 rounded-full ${
                  active ? "bg-[#0052FF]" : "bg-slate-200"
                }`}
              />
            );
          })}
        </View>
      </View>

      <ScrollView className="flex-1 p-5" showsVerticalScrollIndicator={false}>
        <View className="gap-5 pb-12">
          {/* Error Message Alert */}
          {errorMsg ? (
            <View className="flex-row items-start gap-2 bg-rose-50 border border-rose-200 p-3.5 rounded-xl">
              <Feather name="alert-circle" size={16} color="#e11d48" className="mt-0.5" />
              <Text className="flex-1 text-xs text-rose-600 font-medium leading-relaxed">
                {errorMsg}
              </Text>
            </View>
          ) : null}

          {/* STEP 1: EMAIL CONFIRMATION & SEND OTP */}
          {step === "email" && (
            <View className="bg-white border border-slate-200/80 rounded-2xl p-6 items-center shadow-sm gap-5">
              <View className="w-16 h-16 rounded-3xl bg-blue-50 border border-blue-100 items-center justify-center">
                <Feather name="mail" size={28} color="#0052FF" />
              </View>

              <View className="items-center gap-1.5 text-center">
                <Text className="text-base font-bold text-slate-900 text-center">
                  {t("forgot_password.confirm_email_title", "Gửi mã xác thực")}
                </Text>
                <Text className="text-xs text-slate-500 text-center px-4 leading-relaxed">
                  {t(
                    "forgot_password.confirm_email_desc",
                    "Mã xác thực gồm 6 chữ số sẽ được gửi về địa chỉ email tài khoản của bạn:"
                  )}
                </Text>
              </View>

              <View className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 items-center">
                <Text className="text-sm font-semibold text-slate-800">
                  {userEmail}
                </Text>
              </View>

              <TouchableOpacity
                onPress={handleSendOtp}
                disabled={isLoading}
                activeOpacity={0.85}
                className="w-full bg-[#0052FF] py-3.5 rounded-xl items-center justify-center flex-row gap-2 active:bg-blue-700 disabled:opacity-50 mt-1"
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Feather name="send" size={16} color="#ffffff" />
                    <Text className="text-white text-sm font-bold">
                      {t("forgot_password.btn_send_otp", "Gửi mã OTP qua email")}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 2: OTP VERIFICATION */}
          {step === "otp" && (
            <View className="bg-white border border-slate-200/80 rounded-2xl p-6 items-center shadow-sm gap-5">
              <View className="w-16 h-16 rounded-3xl bg-blue-50 border border-blue-100 items-center justify-center">
                <Feather name="key" size={28} color="#0052FF" />
              </View>

              <View className="items-center gap-1.5 text-center">
                <Text className="text-base font-bold text-slate-900 text-center">
                  {t("forgot_password.otp_title_screen", "Nhập mã xác thực")}
                </Text>
                <Text className="text-xs text-slate-500 text-center px-4 leading-relaxed">
                  {t("forgot_password.otp_desc_screen", "Mã 6 chữ số đã được gửi đến")}{"\n"}
                  <Text className="font-semibold text-slate-700">{userEmail}</Text>
                </Text>
              </View>

              {/* 6 Digit Inputs */}
              <View className="flex-row items-center justify-center gap-2.5 my-2">
                {otp.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={(el) => {
                      otpRefs.current[index] = el;
                    }}
                    value={digit}
                    onChangeText={(val) => handleOtpChange(index, val)}
                    onKeyPress={({ nativeEvent }) =>
                      handleOtpKeyPress(index, nativeEvent.key)
                    }
                    keyboardType="number-pad"
                    maxLength={1}
                    className="w-11 h-13 text-center text-xl font-bold rounded-xl border border-slate-200 bg-slate-50 text-slate-900"
                  />
                ))}
              </View>

              {/* Resend timer */}
              <View className="items-center">
                {countdown > 0 ? (
                  <Text className="text-xs text-slate-400">
                    {t("forgot_password.resend_in", "Gửi lại mã sau")}{" "}
                    <Text className="font-bold text-slate-600">
                      {Math.floor(countdown / 60)}:
                      {(countdown % 60).toString().padStart(2, "0")}
                    </Text>
                  </Text>
                ) : (
                  <TouchableOpacity
                    onPress={handleSendOtp}
                    disabled={isLoading}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text className="text-xs font-bold text-[#0052FF]">
                      {t("forgot_password.resend_btn", "Gửi lại mã OTP")}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                onPress={handleVerifyOtp}
                disabled={isLoading || otp.join("").length < 6}
                activeOpacity={0.85}
                className="w-full bg-[#0052FF] py-3.5 rounded-xl items-center justify-center flex-row gap-2 active:bg-blue-700 disabled:opacity-50 mt-1"
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Feather name="check" size={16} color="#ffffff" />
                    <Text className="text-white text-sm font-bold">
                      {t("forgot_password.btn_verify_otp", "Xác nhận mã OTP")}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 3: RESET PASSWORD */}
          {step === "reset" && (
            <View className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm gap-4">
              <View className="gap-1 mb-1">
                <Text className="text-base font-bold text-slate-900">
                  {t("forgot_password.reset_title_screen", "Thiết lập mật khẩu mới")}
                </Text>
                <Text className="text-xs text-slate-500 leading-relaxed">
                  {t(
                    "forgot_password.reset_desc_screen",
                    "Phiên khôi phục đã được xác thực thành công. Vui lòng nhập mật khẩu mới."
                  )}
                </Text>
              </View>

              {/* New Password */}
              <View className="gap-1.5">
                <Text className="text-xs font-semibold text-slate-600">
                  {t("settings.password.new_label", "Mật khẩu mới")}
                </Text>
                <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
                  <TextInput
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showNewPassword}
                    placeholder={t("settings.password.new_placeholder", "Nhập mật khẩu mới")}
                    placeholderTextColor="#94A3B8"
                    className="flex-1 text-sm text-slate-800 p-0"
                  />
                  <TouchableOpacity
                    onPress={() => setShowNewPassword(!showNewPassword)}
                  >
                    <Feather
                      name={showNewPassword ? "eye-off" : "eye"}
                      size={16}
                      color="#94A3B8"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Password Policy Checklist */}
              {newPassword.length > 0 && (
                <View className="bg-slate-50 border border-slate-100 p-3 rounded-xl gap-1.5">
                  <Text className="text-[11px] font-bold text-slate-600 mb-0.5">
                    {t("settings.password.requirements_title", "Yêu cầu mật khẩu:")}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    <Feather
                      name={hasMinLength ? "check-circle" : "circle"}
                      size={14}
                      color={hasMinLength ? "#0052FF" : "#cbd5e1"}
                    />
                    <Text
                      className={`text-xs ${
                        hasMinLength ? "text-slate-800 font-medium" : "text-slate-400"
                      }`}
                    >
                      {t("settings.password.min_length", "Tối thiểu 8 ký tự")}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Feather
                      name={hasLetter ? "check-circle" : "circle"}
                      size={14}
                      color={hasLetter ? "#0052FF" : "#cbd5e1"}
                    />
                    <Text
                      className={`text-xs ${
                        hasLetter ? "text-slate-800 font-medium" : "text-slate-400"
                      }`}
                    >
                      {t("settings.password.has_letter", "Chứa ít nhất 1 chữ cái")}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Feather
                      name={hasUpper && hasLower ? "check-circle" : "circle"}
                      size={14}
                      color={hasUpper && hasLower ? "#0052FF" : "#cbd5e1"}
                    />
                    <Text
                      className={`text-xs ${
                        hasUpper && hasLower
                          ? "text-slate-800 font-medium"
                          : "text-slate-400"
                      }`}
                    >
                      {t("settings.password.has_case", "Bao gồm chữ hoa và chữ thường")}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Feather
                      name={hasNumber ? "check-circle" : "circle"}
                      size={14}
                      color={hasNumber ? "#0052FF" : "#cbd5e1"}
                    />
                    <Text
                      className={`text-xs ${
                        hasNumber ? "text-slate-800 font-medium" : "text-slate-400"
                      }`}
                    >
                      {t("settings.password.has_digit", "Chứa ít nhất 1 chữ số")}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Feather
                      name={noConsecutive ? "check-circle" : "circle"}
                      size={14}
                      color={noConsecutive ? "#0052FF" : "#cbd5e1"}
                    />
                    <Text
                      className={`text-xs ${
                        noConsecutive ? "text-slate-800 font-medium" : "text-slate-400"
                      }`}
                    >
                      {t("settings.password.no_consecutive", "Không lặp lại 4 ký tự liên tiếp")}
                    </Text>
                  </View>
                </View>
              )}

              {/* Confirm Password */}
              <View className="gap-1.5">
                <Text className="text-xs font-semibold text-slate-600">
                  {t("settings.password.confirm_label", "Xác nhận mật khẩu")}
                </Text>
                <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
                  <TextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirmPassword}
                    placeholder={t("settings.password.confirm_placeholder", "Nhập lại mật khẩu mới")}
                    placeholderTextColor="#94A3B8"
                    className="flex-1 text-sm text-slate-800 p-0"
                  />
                  <TouchableOpacity
                    onPress={() =>
                      setShowConfirmPassword(!showConfirmPassword)
                    }
                  >
                    <Feather
                      name={showConfirmPassword ? "eye-off" : "eye"}
                      size={16}
                      color="#94A3B8"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                onPress={handleResetPassword}
                disabled={
                  isLoading ||
                  !newPassword ||
                  !isPasswordPolicyValid ||
                  newPassword !== confirmPassword
                }
                activeOpacity={0.85}
                className="w-full bg-[#0052FF] py-3.5 rounded-xl items-center justify-center flex-row gap-2 active:bg-blue-700 disabled:opacity-50 mt-2"
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Feather name="save" size={16} color="#ffffff" />
                    <Text className="text-white text-sm font-bold">
                      {t("forgot_password.btn_save_new", "Lưu mật khẩu mới")}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 4: SUCCESS */}
          {step === "success" && (
            <View className="bg-white border border-slate-200/80 rounded-2xl p-8 items-center shadow-sm gap-5 my-auto">
              <View className="w-20 h-20 rounded-full bg-emerald-50 border border-emerald-100 items-center justify-center">
                <Feather name="check-circle" size={40} color="#10b981" />
              </View>

              <View className="items-center gap-2 text-center">
                <Text className="text-lg font-bold text-slate-900 text-center">
                  {t("forgot_password.success_title", "Đổi mật khẩu thành công!")}
                </Text>
                <Text className="text-xs text-slate-500 text-center px-4 leading-relaxed">
                  {t(
                    "forgot_password.success_desc",
                    "Mật khẩu của bạn đã được cập nhật thành công. Phiên làm việc của bạn vẫn đang hoạt động với mật khẩu mới mà không bị gián đoạn."
                  )}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => router.replace("/profile")}
                activeOpacity={0.85}
                className="w-full bg-[#0052FF] py-3.5 rounded-xl items-center justify-center active:bg-blue-700 mt-2"
              >
                <Text className="text-white text-sm font-bold">
                  {t("forgot_password.btn_back_to_profile", "Quay lại thông tin cá nhân")}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}


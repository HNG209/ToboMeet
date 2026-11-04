import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons, Feather } from "@expo/vector-icons";
import { supabase, supabaseAuth } from "../../../lib/supabase";
import { validatePasswordPolicy } from "@tobomeet/shared/utils";
import { useTranslation } from "react-i18next";

type FormStep = "email" | "otp" | "reset" | "success";

// Dùng chung cho trang đăng kí
export const renderConstraintRow = (label: string, isValid: boolean) => {
  return (
    <View className="flex-row items-center space-x-2 mb-1.5">
      <Ionicons
        name={isValid ? "checkmark-circle" : "ellipse-outline"}
        size={16}
        color={isValid ? "#0052FF" : "#94A3B8"}
      />
      <Text
        className={`text-xs ml-1.5 ${isValid ? "text-brand-500 font-semibold" : "text-slate-400"}`}
      >
        {label}
      </Text>
    </View>
  );
};

export default function ForgotPasswordScreen() {
  const router = useRouter();

  const { t } = useTranslation();

  const [step, setStep] = useState<FormStep>("email");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [countdown, setCountdown] = useState(0);

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Trạng thái focus của các input để làm hiệu ứng viền màu xanh
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  const otpRefs = useRef<(TextInput | null)[]>([]);
  // Ràng buộc mật khẩu (real-time)
  const {
    hasMinLength,
    hasLetter,
    hasUpper,
    hasLower,
    hasNumber,
    noConsecutive,
    isValid: isPasswordValid,
  } = validatePasswordPolicy(newPassword);

  // const getPasswordErrorMessage = () => {
  //   if (!newPassword || isPasswordValid) return "";

  //   const errors: string[] = [];
  //   const isVi = lang === "vi";

  //   if (!hasMinLength)
  //     errors.push(isVi ? "tối thiểu 8 ký tự" : "at least 8 characters");
  //   if (!hasLetter) errors.push(isVi ? "chứa chữ cái" : "contain letters");
  //   else {
  //     if (!hasUpper) errors.push(isVi ? "1 chữ in hoa" : "1 uppercase letter");
  //     if (!hasLower)
  //       errors.push(isVi ? "1 chữ in thường" : "1 lowercase letter");
  //   }
  //   if (!hasNumber) errors.push(isVi ? "1 chữ số" : "1 number");
  //   if (!noConsecutive)
  //     errors.push(
  //       isVi
  //         ? "không lặp 4 ký tự liên tiếp"
  //         : "no 4 identical consecutive chars",
  //     );

  //   return (
  //     (isVi ? "Mật khẩu phải: " : "Password must: ") + errors.join(", ") + "."
  //   );
  // };

  const passwordError = "";

  // Chặn người dùng đã đăng nhập vào trang quên mật khẩu ngoài luồng public
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session && step === "email") {
        router.replace("/dashboard");
      }
    });
  }, [step, router]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleEmailSubmit = async () => {
    if (!email) {
      setErrorMsg(t("forgot_password.error_invalid_email"));
      return;
    }
    setIsLoading(true);
    setErrorMsg("");
    try {
      await supabaseAuth.sendPasswordResetOtp(email);
      setStep("otp");
      setCountdown(300);
    } catch (error: unknown) {
      setErrorMsg(
        error instanceof Error
          ? error.message
          : t("password_reset.otp_send_failed"),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (text: string, index: number) => {
    const newOtp = [...otp];

    // Nếu nhập số
    if (text.length === 1) {
      newOtp[index] = text;
      setOtp(newOtp);
      // Tự động nhảy ô tiếp theo
      if (index < 5) otpRefs.current[index + 1]?.focus();
    }
    // Nếu xóa (xảy ra trong onKeyPress)
    else if (text.length === 0) {
      newOtp[index] = "";
      setOtp(newOtp);
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    // Nếu nhấn Backspace và ô hiện tại đang trống, nhảy về ô trước
    if (e.nativeEvent.key === "Backspace" && otp[index] === "" && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpSubmit = async () => {
    const code = otp.join("");
    if (code.length < 6) {
      setErrorMsg(t("forgot_password.error_invalid_otp"));
      return;
    }
    setIsLoading(true);
    setErrorMsg("");
    try {
      // Supabase tự động thiết lập Session, không cần hứng token
      await supabaseAuth.verifyPasswordResetOtp(email, code);
      setStep("reset");
    } catch (error: unknown) {
      setErrorMsg(
        error instanceof Error
          ? error.message
          : t("forgot_password.error_invalid_otp"),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSubmit = async () => {
    if (newPassword !== confirmPassword) {
      setErrorMsg(t("password_reset.password_update_failed"));
      return;
    }
    if (!isPasswordValid) return;

    setIsLoading(true);
    setErrorMsg("");
    try {
      await supabaseAuth.updatePassword(newPassword);
      setStep("success");
    } catch (error: unknown) {
      setErrorMsg(
        error instanceof Error
          ? error.message
          : t("password_reset.password_update_failed"),
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-slate-100" // Nền màu trắng xám chuẩn
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
          paddingTop: Platform.OS === "ios" ? 60 : 40,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Khung Card chính chứa biểu mẫu, căn chỉnh chính giữa */}
        <View className="bg-white rounded-3xl p-6 shadow-xl border border-slate-200/50 w-full max-w-md">
          {/* LOGO TOBOMEET DỰNG SẴN CĂN GIỮA (ĐÃ ĐƯỢC ĐƯA VÀO TRONG CARD VÀ BO GÓC) */}
          <View className="items-center mb-6 flex-row justify-center">
            {/* Biểu tượng Camera trắng trong khung xanh bo góc tròn tuyệt đẹp có độ nghiêng nghệ thuật và đổ bóng phát sáng */}
            <View
              className="w-12 h-12 bg-[#0052FF] rounded-2xl items-center justify-center mr-4"
              style={{
                transform: [{ rotate: "3deg" }],
                shadowColor: "#0052FF",
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.35,
                shadowRadius: 10,
                elevation: 8,
              }}
            >
              <Ionicons name="videocam" size={26} color="white" />
            </View>
            {/* Chữ thương hiệu ToboMeet */}
            <Text className="text-3xl font-extrabold text-slate-800 tracking-tight">
              Tobo<Text className="text-[#0052FF]">Meet</Text>
            </Text>
          </View>

          {/* BƯỚC 1: NHẬP EMAIL */}
          {step === "email" && (
            <View>
              <View className="mb-6 items-center">
                <Text className="text-2xl font-bold text-slate-800 mb-2 uppercase tracking-wide">
                  {t("forgot_password.title")}
                </Text>
                <Text className="text-slate-500 text-sm leading-5 text-center px-2">
                  {t("forgot_password.subtitle")}
                </Text>
              </View>

              <View className="space-y-4">
                <View className="gap-1.5">
                  <Text className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    {t("forgot_password.email_label")}
                  </Text>
                  <View
                    className={`w-full flex-row items-center bg-slate-50 border rounded-xl px-3.5 py-2.5 ${
                      focusedInput === "email"
                        ? "border-[#0052FF] bg-white"
                        : "border-slate-200"
                    }`}
                  >
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      placeholder="nhap@email.com"
                      placeholderTextColor="#94A3B8"
                      onFocus={() => setFocusedInput("email")}
                      onBlur={() => setFocusedInput(null)}
                      className="flex-1 text-sm text-slate-800 p-0"
                    />
                  </View>
                  {errorMsg ? (
                    <View className="flex-row items-center mt-2">
                      <Ionicons
                        name="alert-circle-outline"
                        size={16}
                        color="#EF4444"
                      />
                      <Text className="text-red-500 text-xs ml-1.5 font-medium">
                        {errorMsg}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <TouchableOpacity
                  onPress={handleEmailSubmit}
                  disabled={isLoading || !email}
                  className={`w-full mt-4 py-4 rounded-full flex-row justify-center items-center gap-2 shadow-sm ${
                    isLoading || !email ? "opacity-70" : "active:opacity-90"
                  }`}
                  style={{ backgroundColor: "#0052FF" }} // Nút màu xanh thương hiệu
                >
                  {isLoading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white font-bold text-base">
                      {t("forgot_password.submit_btn")}
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => router.back()}
                  className="mt-5 items-center"
                >
                  <Text className="text-slate-500 font-bold text-sm">
                    {t("forgot_password.back_to_login")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* BƯỚC 2: NHẬP OTP */}
          {step === "otp" && (
            <View>
              <View className="mb-6 items-center">
                <Text className="text-2xl font-bold text-slate-800 mb-2 uppercase tracking-wide">
                  {t("forgot_password.otp_title")}
                </Text>
                <Text className="text-slate-500 text-sm leading-5 text-center px-2">
                  {t("forgot_password.otp_subtitle")}{" "}
                  <Text className="font-bold text-slate-700">{email}</Text>
                </Text>
              </View>

              <View className="space-y-6">
                <View className="flex-row justify-between">
                  {otp.map((digit, index) => (
                    <TextInput
                      key={index}
                      // Gán ref để điều khiển focus
                      ref={(ref: TextInput | null) => {
                        otpRefs.current[index] = ref;
                      }}
                      className={`w-12 h-14 bg-slate-50 border rounded-2xl text-center text-2xl font-bold text-slate-800 ${
                        errorMsg
                          ? "border-red-500"
                          : focusedInput === `otp${index}`
                            ? "border-[#0052FF]"
                            : "border-slate-200"
                      }`}
                      maxLength={1}
                      keyboardType="number-pad"
                      value={digit}
                      onChangeText={(text) => handleOtpChange(text, index)}
                      onKeyPress={(e) => handleKeyPress(e, index)}
                      onFocus={() => setFocusedInput(`otp${index}`)}
                      onBlur={() => setFocusedInput(null)}
                    />
                  ))}
                </View>

                {errorMsg ? (
                  <View className="flex-row items-center justify-center mt-2">
                    <Ionicons
                      name="alert-circle-outline"
                      size={16}
                      color="#EF4444"
                    />
                    <Text className="text-red-500 text-xs ml-1.5 font-medium">
                      {errorMsg}
                    </Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  onPress={handleOtpSubmit}
                  disabled={isLoading || otp.join("").length < 6}
                  className={`w-full mt-4 py-4 rounded-full flex-row justify-center items-center gap-2 shadow-sm ${
                    isLoading || otp.join("").length < 6 ? "opacity-70" : ""
                  }`}
                  style={{ backgroundColor: "#0052FF" }} // Nút màu xanh thương hiệu
                >
                  {isLoading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white font-bold text-base">
                      {t("forgot_password.otp_submit_btn")}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* BƯỚC 3: ĐẶT MẬT KHẨU MỚI */}
          {step === "reset" && (
            <View>
              <View className="mb-6 items-center">
                <Text className="text-2xl font-bold text-slate-800 mb-2 uppercase tracking-wide">
                  {t("forgot_password.reset_title")}
                </Text>
                <Text className="text-slate-500 text-sm leading-5 text-center">
                  {t("forgot_password.reset_subtitle")}
                </Text>
              </View>

              <View className="space-y-4">
                {/* Mật khẩu mới */}
                <View className="gap-1.5">
                  <Text className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    {t("password_reset.new_password")}
                  </Text>
                  <View
                    className={`w-full flex-row items-center bg-slate-50 border rounded-xl px-3.5 py-2.5 ${
                      focusedInput === "newPassword"
                        ? "border-[#0052FF] bg-white"
                        : "border-slate-200"
                    }`}
                  >
                    <TextInput
                      className="flex-1 text-sm text-slate-800 p-0"
                      placeholder={t("password_reset.new_password_placeholder")}
                      placeholderTextColor="#94A3B8"
                      secureTextEntry={!showPassword}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      onFocus={() => setFocusedInput("newPassword")}
                      onBlur={() => setFocusedInput(null)}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather
                        name={showPassword ? "eye-off" : "eye"}
                        size={16}
                        color="#94A3B8"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Xác nhận mật khẩu mới */}
                <View className="gap-1.5 mt-3">
                  <Text className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    {t("password_reset.confirm_password")}
                  </Text>
                  <View
                    className={`w-full flex-row items-center bg-slate-50 border rounded-xl px-3.5 py-2.5 ${
                      focusedInput === "confirmPassword"
                        ? "border-[#0052FF] bg-white"
                        : "border-slate-200"
                    }`}
                  >
                    <TextInput
                      className="flex-1 text-sm text-slate-800 p-0"
                      placeholder={t(
                        "password_reset.confirm_password_placeholder",
                      )}
                      placeholderTextColor="#94A3B8"
                      secureTextEntry={!showConfirm}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      onFocus={() => setFocusedInput("confirmPassword")}
                      onBlur={() => setFocusedInput(null)}
                    />
                    <TouchableOpacity
                      onPress={() => setShowConfirm(!showConfirm)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather
                        name={showConfirm ? "eye-off" : "eye"}
                        size={16}
                        color="#94A3B8"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* THÔNG BÁO LỖI CHI TIẾT MÀU ĐỎ GIỐNG HÌNH 1 */}
                {passwordError ? (
                  <View className="mt-3 p-3 bg-red-50 rounded-xl border border-red-100">
                    <Text className="text-red-500 text-xs leading-5 font-medium">
                      {passwordError}
                    </Text>
                  </View>
                ) : null}

                {errorMsg ? (
                  <View className="flex-row items-center mt-2">
                    <Ionicons
                      name="alert-circle-outline"
                      size={16}
                      color="#EF4444"
                    />
                    <Text className="text-red-500 text-xs ml-1.5 font-medium">
                      {errorMsg}
                    </Text>
                  </View>
                ) : null}

                {/* KHU VỰC RÀNG BUỘC MẬT KHẨU (VALIDATOR) */}
                <View className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mt-4">
                  <Text className="text-slate-800 font-bold text-sm mb-3">
                    {t("forgot_password.reset_policy_title")}
                  </Text>
                  {renderConstraintRow(
                    t("forgot_password.reset_policy_length"),
                    hasMinLength,
                  )}
                  {renderConstraintRow(
                    t("forgot_password.reset_policy_letter"),
                    hasLetter,
                  )}
                  {renderConstraintRow(
                    t("forgot_password.reset_policy_upper"),
                    hasUpper,
                  )}
                  {renderConstraintRow(
                    t("forgot_password.reset_policy_lower"),
                    hasLower,
                  )}
                  {renderConstraintRow(
                    t("forgot_password.reset_policy_number"),
                    hasNumber,
                  )}
                  <View className="h-px bg-slate-200 my-3" />
                  <Text className="text-slate-800 font-bold text-sm mb-2">
                    {t("forgot_password.reset_policy_no_consecutive_title")}
                  </Text>
                  {renderConstraintRow(
                    t("forgot_password.reset_policy_no_consecutive_desc"),
                    noConsecutive,
                  )}
                </View>

                <TouchableOpacity
                  onPress={handleResetSubmit}
                  disabled={
                    isLoading ||
                    !isPasswordValid ||
                    newPassword !== confirmPassword
                  }
                  className={`w-full mt-4 py-4 rounded-full flex-row justify-center items-center gap-2 shadow-sm ${
                    isLoading ||
                    !isPasswordValid ||
                    newPassword !== confirmPassword
                      ? "opacity-50"
                      : "active:opacity-90"
                  }`}
                  style={{ backgroundColor: "#0052FF" }} // Nút màu xanh thương hiệu
                >
                  {isLoading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white font-bold text-base">
                      {t("forgot_password.reset_submit_btn")}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* BƯỚC 4: THÀNH CÔNG */}
          {step === "success" && (
            <View className="items-center py-6">
              <View className="w-20 h-20 bg-green-50 rounded-full items-center justify-center mb-6 border border-green-100">
                <Ionicons name="checkmark-circle" size={48} color="#10B981" />
              </View>
              <Text className="text-2xl font-bold text-slate-900 mb-3 text-center">
                {t("password_reset.password_success")}
              </Text>
              <Text className="text-slate-500 text-sm text-center mb-6 leading-6">
                {t("password_reset.password_update_success")}
              </Text>
              <TouchableOpacity
                onPress={() => router.replace("/(auth)/login")}
                className="w-full rounded-xl py-4 items-center justify-center shadow-md"
                style={{ backgroundColor: "#0052FF" }} // Nút màu xanh thương hiệu
              >
                <Text className="text-white font-bold text-base">
                  {t("forgot_password.back_to_login")}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

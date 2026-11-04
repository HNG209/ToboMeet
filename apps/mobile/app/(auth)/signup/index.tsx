import React, { useState } from "react";
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
import { supabaseAuth } from "../../../lib/supabase";
import { validatePasswordPolicy } from "@tobomeet/shared/utils";
import { renderConstraintRow } from "../forgot-password";
import * as WebBrowser from "expo-web-browser";
import { useOAuth } from "../../../hooks/useOAuth";
import { useTranslation } from "react-i18next";

WebBrowser.maybeCompleteAuthSession();

export default function SignupScreen() {
  const router = useRouter();

  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const { handleOAuthLogin, isGoogleLoading, isFbLoading, oauthError } =
    useOAuth();

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const displayError = errorMsg || oauthError;

  const {
    hasMinLength,
    hasLetter,
    hasUpper,
    hasLower,
    hasNumber,
    noConsecutive,
    isValid: passwordValid,
  } = validatePasswordPolicy(password);

  // ── XỬ LÝ ĐĂNG KÝ ──
  const handleSignup = async () => {
    setErrorMsg("");
    setSuccessMsg("");

    if (!email || !password || !confirmPassword) {
      setErrorMsg("Vui lòng nhập đầy đủ thông tin.");
      return;
    }

    if (!passwordValid) {
      setErrorMsg("Vui lòng đáp ứng tất cả các điều kiện mật khẩu.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg("Mật khẩu xác nhận không khớp.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await supabaseAuth.signUp(email, password);

      if (result.requiresEmailConfirmation) {
        setSuccessMsg("Vui lòng kiểm tra hộp thư email để xác nhận tài khoản.");
      } else {
        // Đăng ký xong có session luôn (nếu tắt xác nhận email)
        router.replace("/home");
      }
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : t(""));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-slate-50"
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          padding: 20,
          paddingTop: 50,
          paddingBottom: 50,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 w-full max-w-md mx-auto">
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

          <View className="text-center mb-6 items-center">
            <Text className="text-2xl font-bold text-slate-900 mb-2">
              {t("signup.sign_up")}
            </Text>
            <Text className="text-slate-500 text-sm">
              {t("signup.create_account_to_continue")}
            </Text>
          </View>

          {/* Lỗi */}
          {displayError ? (
            <View className="mb-5 p-3.5 bg-red-50 rounded-2xl border border-red-100 flex-row items-center">
              <Ionicons name="alert-circle" size={18} color="#EF4444" />
              <Text className="text-red-500 text-xs font-medium ml-2 flex-1">
                {displayError}
              </Text>
            </View>
          ) : null}

          {/* Thành công (Yêu cầu check email) */}
          {successMsg ? (
            <View className="mb-5 p-3.5 bg-green-50 rounded-2xl border border-green-100 flex-row items-center">
              <Ionicons name="checkmark-circle" size={18} color="#10B981" />
              <Text className="text-green-700 text-xs font-medium ml-2 flex-1">
                {successMsg}
              </Text>
            </View>
          ) : null}

          <View className="gap-4">
            {/* Input Email */}
            <View className="gap-1.5">
              <Text className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                {t("signup.work_email")}
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
            </View>

            {/* Input Mật khẩu */}
            <View className="gap-1.5">
              <Text className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                {t("signup.password")}
              </Text>
              <View
                className={`w-full flex-row items-center bg-slate-50 border rounded-xl px-3.5 py-2.5 ${
                  focusedInput === "password"
                    ? "border-[#0052FF] bg-white"
                    : "border-slate-200"
                }`}
              >
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#94A3B8"
                  onFocus={() => setFocusedInput("password")}
                  onBlur={() => setFocusedInput(null)}
                  className="flex-1 text-sm text-slate-800 p-0"
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

            {/* BẢNG ĐIỀU KIỆN MẬT KHẨU */}
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

            {/* Input Xác nhận mật khẩu */}
            <View>
              <Text className="block mb-1.5 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                {t("signup.confirm_password_placeholder")}
              </Text>
              <View
                className={`w-full border rounded-2xl px-4 py-3.5 flex-row items-center bg-slate-50 ${
                  focusedInput === "confirm"
                    ? "border-[#0052FF] bg-white"
                    : "border-slate-200"
                }`}
              >
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirm}
                  placeholder="••••••••"
                  placeholderTextColor="#94A3B8"
                  onFocus={() => setFocusedInput("confirm")}
                  onBlur={() => setFocusedInput(null)}
                  className="flex-1 text-slate-900"
                />
                <TouchableOpacity
                  onPress={() => setShowConfirm(!showConfirm)}
                  className="pl-3"
                >
                  <Ionicons
                    name={showConfirm ? "eye-outline" : "eye-off-outline"}
                    size={20}
                    color="#64748B"
                  />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleSignup}
              disabled={isLoading || (password.length > 0 && !passwordValid)}
              className={`w-full mt-2 py-4 rounded-full flex-row justify-center items-center gap-2 shadow-sm ${
                isLoading || (password.length > 0 && !passwordValid)
                  ? "opacity-50"
                  : "active:opacity-90"
              }`}
              style={{ backgroundColor: "#0052FF" }}
            >
              {isLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-bold text-[15px]">
                  {t("login.sign_up")}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <View className="flex-row justify-center mt-8 mb-6">
            <Text className="text-sm text-slate-500 font-medium">
              {t("signup.already_have_account")}{" "}
            </Text>
            <TouchableOpacity onPress={() => router.push("/(auth)/login")}>
              <Text className="text-sm text-[#0052FF] font-bold">
                {t("login.sign_in")}
              </Text>
            </TouchableOpacity>
          </View>

          <View className="flex-row items-center gap-3 mb-6">
            <View className="h-px flex-1 bg-slate-200" />
            <Text className="text-xs font-semibold text-slate-400 uppercase">
              {t("login.or_text")}
            </Text>
            <View className="h-px flex-1 bg-slate-200" />
          </View>

          <View className="gap-3">
            <TouchableOpacity
              onPress={() => handleOAuthLogin("google")}
              disabled={isGoogleLoading || isFbLoading || isLoading}
              className="w-full flex-row items-center justify-center gap-3 px-4 py-3.5 border border-slate-200 rounded-full active:bg-slate-50"
            >
              {isGoogleLoading ? (
                <ActivityIndicator size="small" color="#4285F4" />
              ) : (
                <Ionicons name="logo-google" size={20} color="#DB4437" />
              )}
              <Text className="font-medium text-slate-700">
                {t("login.continue_with_google")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleOAuthLogin("facebook")}
              disabled={isGoogleLoading || isFbLoading || isLoading}
              className="w-full flex-row items-center justify-center gap-3 px-4 py-3.5 border border-slate-200 rounded-full active:bg-slate-50"
            >
              {isFbLoading ? (
                <ActivityIndicator size="small" color="#1877F2" />
              ) : (
                <Ionicons name="logo-facebook" size={20} color="#1877F2" />
              )}
              <Text className="font-medium text-slate-700">
                {t("login.continue_with_facebook")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

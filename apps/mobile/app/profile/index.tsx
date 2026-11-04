import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { toast } from "../../lib/toast";
import { supabase, supabaseAuth } from "../../lib/supabase";
import {
  useGetMeQuery,
  useUpdateProfileMutation,
  useGetAvatarUploadPresignedUrlMutation,
} from "../../lib/redux/features/users/usersApi";
import { validatePasswordPolicy } from "@tobomeet/shared/utils";

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { data: profile, refetch: refetchProfile } = useGetMeQuery();
  const [updateProfile, { isLoading: isUpdatingProfile }] =
    useUpdateProfileMutation();
  const [getAvatarUploadPresignedUrl] =
    useGetAvatarUploadPresignedUrlMutation();
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Basic Info State
  const [displayName, setDisplayName] = useState("");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Auth identities & Providers state
  const [providers, setProviders] = useState<string[]>([]);
  const [hasPassword, setHasPassword] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // Password Section State
  const [isPasswordSectionExpanded, setIsPasswordSectionExpanded] =
    useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Password Policy
  const {
    hasMinLength,
    hasLetter,
    hasUpper,
    hasLower,
    hasNumber,
    noConsecutive,
    isValid: isPasswordPolicyValid,
  } = validatePasswordPolicy(newPassword);

  useEffect(() => {
    if (profile?.displayName) {
      setDisplayName(profile.displayName);
    } else if (profile?.email) {
      setDisplayName(profile.email.split("@")[0]);
    }
  }, [profile]);

  // Load identities from Supabase
  useEffect(() => {
    let mounted = true;
    const fetchIdentities = async () => {
      try {
        setIsLoadingAuth(true);
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user && mounted) {
          const detected = new Set<string>();

          if (Array.isArray(user.identities)) {
            user.identities.forEach((id) => {
              if (id.provider) detected.add(id.provider.toLowerCase());
            });
          }

          const appProviders = user.app_metadata?.providers;
          if (Array.isArray(appProviders)) {
            appProviders.forEach((p) => p && detected.add(p.toLowerCase()));
          }
          if (user.app_metadata?.provider) {
            detected.add(user.app_metadata.provider.toLowerCase());
          }

          if (detected.size === 0 && user.email) {
            detected.add("email");
          }

          const hasPwd = detected.has("email");
          setProviders(Array.from(detected));
          setHasPassword(hasPwd);
        }
      } catch (err) {
        console.warn("[ProfileScreen] Failed to load identities:", err);
      } finally {
        if (mounted) setIsLoadingAuth(false);
      }
    };

    fetchIdentities();
    return () => {
      mounted = false;
    };
  }, []);

  // Handle Avatar pick and upload
  const handlePickAvatar = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        toast.error(
          t("profile.permission_denied", "Vui lòng cấp quyền truy cập ảnh để đổi avatar")
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      setIsUploadingAvatar(true);

      const fileName = asset.fileName || `avatar_${Date.now()}.jpg`;
      const contentType = asset.mimeType || "image/jpeg";

      const { signedUrl, publicUrl } = await getAvatarUploadPresignedUrl({
        fileName,
        contentType,
      }).unwrap();

      const uploadResult = await FileSystem.uploadAsync(signedUrl, asset.uri, {
        httpMethod: "PUT",
        headers: {
          "Content-Type": contentType,
        },
      });

      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new Error(
          t("profile.avatar_error", "Không thể tải ảnh lên máy chủ lưu trữ")
        );
      }

      await updateProfile({ avatarUrl: publicUrl }).unwrap();
      await refetchProfile();
      toast.success(
        t("profile.avatar_updated", "Cập nhật ảnh đại diện thành công!")
      );
    } catch (err: any) {
      console.error("[ProfileScreen] Upload avatar error:", err);
      toast.error(
        err?.data?.message ||
          err?.message ||
          t("profile.avatar_error", "Lỗi khi cập nhật avatar")
      );
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Handle Display Name save
  const handleSaveDisplayName = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      toast.error(
        t("profile.name_empty", "Tên hiển thị không được để trống")
      );
      return;
    }
    if (trimmed === profile?.displayName) {
      return;
    }

    try {
      await updateProfile({ displayName: trimmed }).unwrap();
      await refetchProfile();
      toast.success(
        t("profile.name_updated", "Đã cập nhật tên hiển thị thành công!")
      );
    } catch (err: any) {
      toast.error(
        err?.data?.message ||
          err?.message ||
          t("profile.name_error", "Không thể cập nhật tên")
      );
    }
  };

  // Handle Password Save / Change
  const handleSavePassword = async () => {
    if (hasPassword && !currentPassword.trim()) {
      toast.error(
        t("settings.password.error_current_empty", "Vui lòng nhập mật khẩu hiện tại")
      );
      return;
    }
    if (!newPassword.trim()) {
      toast.error(
        t("settings.password.error_new_empty", "Vui lòng nhập mật khẩu mới")
      );
      return;
    }
    if (hasPassword && currentPassword.trim() === newPassword.trim()) {
      toast.error(
        t("settings.password.error_same", "Mật khẩu mới không được trùng mật khẩu cũ")
      );
      return;
    }
    if (!isPasswordPolicyValid) {
      toast.error(
        t("settings.password.error_policy", "Mật khẩu chưa đáp ứng yêu cầu bảo mật")
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(
        t("settings.password.error_mismatch", "Mật khẩu xác nhận không khớp")
      );
      return;
    }

    try {
      setIsChangingPassword(true);
      await supabaseAuth.updateUserPassword(
        newPassword.trim(),
        hasPassword ? currentPassword.trim() : undefined
      );

      toast.success(
        hasPassword
          ? t("settings.password.success_changed", "Đã đổi mật khẩu thành công!")
          : t("settings.password.success_set", "Đã thiết lập mật khẩu thành công!")
      );

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setHasPassword(true);
      if (!providers.includes("email")) {
        setProviders([...providers, "email"]);
      }
      setIsPasswordSectionExpanded(false);
    } catch (err: any) {
      console.error("[ProfileScreen] Change password error:", err);
      const msg = (err?.message || "").toLowerCase();
      const isWrongCurrent =
        msg.includes("current") ||
        msg.includes("incorrect") ||
        msg.includes("invalid") ||
        msg.includes("wrong");

      if (isWrongCurrent) {
        toast.error(
          t("settings.password.error_wrong_current", "Mật khẩu hiện tại không chính xác")
        );
        return;
      }

      toast.error(
        err?.message ||
          t("settings.password.error_generic", "Không thể đổi mật khẩu, vui lòng thử lại sau")
      );
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-slate-50"
    >
      {/* Header with Back button */}
      <View className="px-5 py-4 bg-white border-b border-slate-100 flex-row items-center gap-3">
        <TouchableOpacity
          onPress={() => router.back()}
          className="p-1 -ml-1 rounded-full active:bg-slate-100"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="arrow-left" size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-slate-900">
          {t("profile.header_title", "Thông tin cá nhân")}
        </Text>
      </View>

      <ScrollView className="flex-1 p-5" showsVerticalScrollIndicator={false}>
        <View className="gap-6 pb-12">
          {/* Avatar Section */}
          <View className="items-center bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm">
            <View className="relative">
              <View className="w-24 h-24 rounded-full bg-blue-100 border-2 border-white shadow-md overflow-hidden items-center justify-center">
                {profile?.avatarUrl ? (
                  <Image
                    source={{ uri: profile.avatarUrl }}
                    className="w-full h-full"
                  />
                ) : (
                  <Text className="text-3xl font-bold text-[#0052FF]">
                    {(profile?.displayName || "U").charAt(0).toUpperCase()}
                  </Text>
                )}
                {isUploadingAvatar && (
                  <View className="absolute inset-0 bg-black/40 items-center justify-center">
                    <ActivityIndicator size="small" color="#ffffff" />
                  </View>
                )}
              </View>

              {/* Edit button */}
              <TouchableOpacity
                onPress={handlePickAvatar}
                disabled={isUploadingAvatar}
                activeOpacity={0.8}
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#0052FF] border-2 border-white items-center justify-center shadow-md active:bg-blue-700"
              >
                <Feather name="camera" size={14} color="#ffffff" />
              </TouchableOpacity>
            </View>

            <Text className="text-xs text-slate-400 mt-3 font-medium">
              {t("profile.avatar_hint", "Chạm vào máy ảnh để thay đổi ảnh đại diện")}
            </Text>
          </View>

          {/* Basic Info Inputs */}
          <View className="bg-white border border-slate-200/80 rounded-2xl p-5 gap-4 shadow-sm">
            <Text className="text-sm font-bold text-slate-800">
              {t("profile.account_info", "Thông tin tài khoản")}
            </Text>

            {/* Display Name Input */}
            <View className="gap-1.5">
              <Text className="text-xs font-semibold text-slate-600">
                {t("profile.display_name", "Tên hiển thị")}
              </Text>
              <View className="flex-row items-center gap-2">
                <View className="flex-1 flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
                  <Feather
                    name="user"
                    size={16}
                    color="#64748B"
                    style={{ marginRight: 8 }}
                  />
                  <TextInput
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder={t("profile.display_name_placeholder", "Nhập tên hiển thị")}
                    placeholderTextColor="#94A3B8"
                    className="flex-1 text-sm text-slate-800 p-0"
                  />
                </View>

                {displayName.trim() !== (profile?.displayName || "") && (
                  <TouchableOpacity
                    onPress={handleSaveDisplayName}
                    disabled={isUpdatingProfile}
                    className="bg-[#0052FF] px-4 py-2.5 rounded-xl items-center justify-center"
                  >
                    {isUpdatingProfile ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text className="text-xs font-bold text-white">
                        {t("common.save", "Lưu")}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Email (Readonly) */}
            <View className="gap-1.5">
              <Text className="text-xs font-semibold text-slate-600">
                {t("profile.email", "Địa chỉ Email")}
              </Text>
              <View className="flex-row items-center bg-slate-100/70 border border-slate-200/60 rounded-xl px-3.5 py-2.5">
                <Feather
                  name="mail"
                  size={16}
                  color="#94A3B8"
                  style={{ marginRight: 8 }}
                />
                <TextInput
                  value={profile?.email || ""}
                  editable={false}
                  className="flex-1 text-sm text-slate-500 p-0"
                />
              </View>
            </View>
          </View>

          {/* Connected Login Providers */}
          <View className="bg-white border border-slate-200/80 rounded-2xl p-5 gap-3 shadow-sm">
            <Text className="text-sm font-bold text-slate-800">
              {t("profile.connected_methods", "Phương thức đăng nhập đã liên kết")}
            </Text>
            <Text className="text-xs text-slate-400 leading-relaxed">
              {t(
                "profile.connected_methods_desc",
                "Các phương thức bạn có thể sử dụng để đăng nhập vào tài khoản."
              )}
            </Text>

            {isLoadingAuth ? (
              <ActivityIndicator size="small" color="#0052FF" className="py-2" />
            ) : (
              <View className="gap-2.5 mt-1">
                {/* Google */}
                {providers.includes("google") && (
                  <View className="flex-row items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <View className="flex-row items-center gap-3">
                      <MaterialCommunityIcons
                        name="google"
                        size={20}
                        color="#EA4335"
                      />
                      <Text className="text-xs font-semibold text-slate-800">
                        Google
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                      <Feather name="check" size={11} color="#059669" />
                      <Text className="text-[10px] font-bold text-emerald-700">
                        {t("profile.linked", "Đã liên kết")}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Facebook */}
                {providers.includes("facebook") && (
                  <View className="flex-row items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <View className="flex-row items-center gap-3">
                      <MaterialCommunityIcons
                        name="facebook"
                        size={20}
                        color="#1877F2"
                      />
                      <Text className="text-xs font-semibold text-slate-800">
                        Facebook
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                      <Feather name="check" size={11} color="#059669" />
                      <Text className="text-[10px] font-bold text-emerald-700">
                        {t("profile.linked", "Đã liên kết")}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Email / Password */}
                {hasPassword && (
                  <View className="flex-row items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <View className="flex-row items-center gap-3">
                      <Feather name="key" size={18} color="#0052FF" />
                      <Text className="text-xs font-semibold text-slate-800">
                        {t("profile.email_and_password", "Email & Mật khẩu")}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                      <Feather name="check" size={11} color="#059669" />
                      <Text className="text-[10px] font-bold text-emerald-700">
                        {t("profile.configured", "Đã thiết lập")}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Password Management Section */}
          <View className="bg-white border border-slate-200/80 rounded-2xl p-5 gap-3 shadow-sm">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-sm font-bold text-slate-800">
                  {hasPassword
                    ? t("settings.password.header", "Đổi mật khẩu")
                    : t("profile.set_password", "Thiết lập mật khẩu")}
                </Text>
                <Text className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  {hasPassword
                    ? t("profile.change_password_desc", "Thay đổi mật khẩu đăng nhập của tài khoản.")
                    : t(
                        "profile.set_password_desc",
                        "Thiết lập mật khẩu để có thể đăng nhập bằng email nếu cần."
                      )}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() =>
                  setIsPasswordSectionExpanded(!isPasswordSectionExpanded)
                }
                activeOpacity={0.7}
                className="p-2 rounded-xl bg-slate-50 border border-slate-200"
              >
                <Feather
                  name={
                    isPasswordSectionExpanded ? "chevron-up" : "chevron-down"
                  }
                  size={18}
                  color="#475569"
                />
              </TouchableOpacity>
            </View>

            {/* Expanded Password Form */}
            {isPasswordSectionExpanded && (
              <View className="gap-3.5 pt-3 border-t border-slate-100 mt-1">
                {/* Current password (only if user already has password) */}
                {hasPassword && (
                  <View className="gap-1.5">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-semibold text-slate-600">
                        {t("settings.password.current_label", "Mật khẩu hiện tại")}
                      </Text>
                      <TouchableOpacity
                        onPress={() => router.push("/profile/forgot-password")}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text className="text-xs font-medium text-[#0052FF]">
                          {t("profile.forgot_password_link", "Quên mật khẩu?")}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
                      <TextInput
                        value={currentPassword}
                        onChangeText={setCurrentPassword}
                        secureTextEntry={!showCurrentPassword}
                        placeholder={t("settings.password.current_placeholder", "Nhập mật khẩu hiện tại")}
                        placeholderTextColor="#94A3B8"
                        className="flex-1 text-sm text-slate-800 p-0"
                      />
                      <TouchableOpacity
                        onPress={() =>
                          setShowCurrentPassword(!showCurrentPassword)
                        }
                      >
                        <Feather
                          name={showCurrentPassword ? "eye-off" : "eye"}
                          size={16}
                          color="#94A3B8"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

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
                      <View
                        className={`w-1.5 h-1.5 rounded-full ${
                          hasMinLength ? "bg-[#0052FF]" : "bg-slate-300"
                        }`}
                      />
                      <Text
                        className={`text-[11px] ${
                          hasMinLength
                            ? "text-slate-800 font-semibold"
                            : "text-slate-500"
                        }`}
                      >
                        {t("settings.password.min_length", "Tối thiểu 8 ký tự")}
                      </Text>
                    </View>

                    <View className="flex-row items-center gap-2">
                      <View
                        className={`w-1.5 h-1.5 rounded-full ${
                          hasLetter ? "bg-[#0052FF]" : "bg-slate-300"
                        }`}
                      />
                      <Text
                        className={`text-[11px] ${
                          hasLetter
                            ? "text-slate-800 font-semibold"
                            : "text-slate-500"
                        }`}
                      >
                        {t("settings.password.has_letter", "Bao gồm chữ cái")}
                      </Text>
                    </View>

                    <View className="flex-row items-center gap-2">
                      <View
                        className={`w-1.5 h-1.5 rounded-full ${
                          hasUpper && hasLower ? "bg-[#0052FF]" : "bg-slate-300"
                        }`}
                      />
                      <Text
                        className={`text-[11px] ${
                          hasUpper && hasLower
                            ? "text-slate-800 font-semibold"
                            : "text-slate-500"
                        }`}
                      >
                        {t("settings.password.has_case", "Chữ hoa và chữ thường")}
                      </Text>
                    </View>

                    <View className="flex-row items-center gap-2">
                      <View
                        className={`w-1.5 h-1.5 rounded-full ${
                          hasNumber ? "bg-[#0052FF]" : "bg-slate-300"
                        }`}
                      />
                      <Text
                        className={`text-[11px] ${
                          hasNumber
                            ? "text-slate-800 font-semibold"
                            : "text-slate-500"
                        }`}
                      >
                        {t("settings.password.has_digit", "Bao gồm ít nhất một chữ số")}
                      </Text>
                    </View>

                    <View className="flex-row items-center gap-2">
                      <View
                        className={`w-1.5 h-1.5 rounded-full ${
                          noConsecutive ? "bg-[#0052FF]" : "bg-slate-300"
                        }`}
                      />
                      <Text
                        className={`text-[11px] ${
                          noConsecutive
                            ? "text-slate-800 font-semibold"
                            : "text-slate-500"
                        }`}
                      >
                        {t(
                          "settings.password.no_consecutive",
                          "Không chứa quá 3 ký tự liên tiếp giống nhau"
                        )}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Confirm Password */}
                <View className="gap-1.5">
                  <Text className="text-xs font-semibold text-slate-600">
                    {t("settings.password.confirm_label", "Xác nhận mật khẩu mới")}
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

                {/* Submit Password Button */}
                <TouchableOpacity
                  onPress={handleSavePassword}
                  disabled={
                    isChangingPassword ||
                    !newPassword ||
                    (hasPassword && !currentPassword)
                  }
                  activeOpacity={0.85}
                  className="bg-[#0052FF] py-3 rounded-xl items-center justify-center mt-2 active:bg-blue-700"
                >
                  {isChangingPassword ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text className="text-xs font-bold text-white">
                      {hasPassword
                        ? t("settings.password.btn_change", "Cập nhật mật khẩu")
                        : t("settings.password.btn_set", "Lưu mật khẩu")}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

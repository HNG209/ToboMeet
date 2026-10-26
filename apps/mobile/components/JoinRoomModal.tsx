import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useJoinRoomMutation } from "../lib/redux/features/rooms/roomsApi";
import { Feather } from "@expo/vector-icons";

interface JoinRoomModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (roomId: string) => void;
}

export default function JoinRoomModal({
  visible,
  onClose,
  onSuccess,
}: JoinRoomModalProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [joinRoom, { isLoading }] = useJoinRoomMutation();
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async () => {
    if (!code.trim()) return;
    setError(null);

    try {
      const room = await joinRoom({ code: code.trim() }).unwrap();
      setCode("");
      onSuccess(room._id);
    } catch (err: any) {
      setError(
        err?.data?.message ||
          err?.message ||
          t("dashboard.room_not_found_code"),
      );
    }
  };

  const handleClose = () => {
    setCode("");
    setError(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 justify-center items-center bg-black/45 px-5"
      >
        {/* Backdrop Tap to Close */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleClose}
          className="absolute inset-0"
        />

        {/* Dialog */}
        <View
          className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl border border-slate-100"
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.15,
            shadowRadius: 24,
            elevation: 10,
          }}
        >
          {/* Header */}
          <View className="flex-row justify-between items-center mb-5">
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-xl bg-blue-50/80 justify-center items-center">
                <Feather name="users" size={18} color="#0052FF" />
              </View>
              <Text className="text-base font-bold text-slate-900 tracking-tight">
                {t("dashboard.join_team")}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              className="w-8 h-8 rounded-lg bg-slate-100/70 justify-center items-center"
            >
              <Feather name="x" size={16} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <View className="mb-5">
            <TextInput
              value={code}
              onChangeText={(text) => {
                setCode(text);
                if (error) setError(null);
              }}
              placeholder={t("dashboard.room_code_placeholder")}
              placeholderTextColor="#94A3B8"
              autoFocus
              autoCapitalize="characters"
              autoCorrect={false}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/60 text-sm text-slate-900 font-medium"
            />

            {error && (
              <View className="flex-row items-center gap-2 mt-3 bg-red-50/80 p-3 rounded-xl border border-red-100">
                <Feather name="alert-circle" size={14} color="#EF4444" />
                <Text className="text-red-600 text-xs flex-1 font-medium leading-relaxed">
                  {error}
                </Text>
              </View>
            )}
          </View>

          {/* Footer */}
          <View className="flex-row justify-end gap-2.5">
            <TouchableOpacity
              onPress={handleClose}
              className="px-4 py-2.5 rounded-xl bg-slate-100/80 justify-center items-center active:bg-slate-200"
            >
              <Text className="text-xs font-semibold text-slate-600">
                {t("dashboard.cancel")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleJoin}
              disabled={!code.trim() || isLoading}
              className={`px-5 py-2.5 rounded-xl justify-center items-center flex-row gap-2 shadow-sm ${
                !code.trim() || isLoading ? "bg-blue-300" : "bg-[#0052FF]"
              }`}
              style={{
                shadowColor: "#0052FF",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: 2,
              }}
            >
              {isLoading && <ActivityIndicator size="small" color="#ffffff" />}
              <Text className="text-white font-bold text-xs">
                {t("dashboard.join")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

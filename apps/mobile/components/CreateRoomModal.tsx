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
import { useCreateRoomMutation } from "../lib/redux/features/rooms/roomsApi";
import { Feather } from "@expo/vector-icons";

interface CreateRoomModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (roomId: string) => void;
}

export default function CreateRoomModal({
  visible,
  onClose,
  onSuccess,
}: CreateRoomModalProps) {
  const { t } = useTranslation();
  const [roomName, setRoomName] = useState("");
  const [createRoom, { isLoading }] = useCreateRoomMutation();
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!roomName.trim()) return;
    setError(null);

    try {
      const room = await createRoom({
        name: roomName.trim(),
      }).unwrap();

      setRoomName("");
      onSuccess(room._id);
    } catch (err: any) {
      setError(
        err?.data?.message ||
          err?.message ||
          t("dashboard.create_room_failed"),
      );
    }
  };

  const handleClose = () => {
    setRoomName("");
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
        {/* Backdrop đóng modal */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleClose}
          className="absolute inset-0"
        />

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
                <Feather name="plus" size={18} color="#0052FF" />
              </View>
              <Text className="text-base font-bold text-slate-900 tracking-tight">
                {t("dashboard.create_team", { defaultValue: "Tạo phòng mới" })}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              className="w-8 h-8 rounded-lg bg-slate-100/70 justify-center items-center"
            >
              <Feather name="x" size={16} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Form nhập tên phòng */}
          <View className="mb-5">
            <TextInput
              value={roomName}
              onChangeText={(text) => {
                setRoomName(text);
                if (error) setError(null);
              }}
              placeholder={t("dashboard.room_name_placeholder", {
                defaultValue: "Nhập tên phòng...",
              })}
              placeholderTextColor="#94A3B8"
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/60 text-sm text-slate-900 font-medium"
            />

            {/* Thông báo lỗi */}
            {error && (
              <View className="flex-row items-center gap-2 mt-3 bg-red-50/80 p-3 rounded-xl border border-red-100">
                <Feather name="alert-circle" size={14} color="#EF4444" />
                <Text className="text-red-600 text-xs flex-1 font-medium leading-relaxed">
                  {error}
                </Text>
              </View>
            )}
          </View>

          {/* Các nút hành động */}
          <View className="flex-row justify-end gap-2.5">
            <TouchableOpacity
              onPress={handleClose}
              className="px-4 py-2.5 rounded-xl bg-slate-100/80 justify-center items-center active:bg-slate-200"
            >
              <Text className="text-xs font-semibold text-slate-600">
                {t("dashboard.cancel", { defaultValue: "Hủy" })}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleCreate}
              disabled={!roomName.trim() || isLoading}
              className={`px-5 py-2.5 rounded-xl justify-center items-center flex-row gap-2 shadow-sm ${
                !roomName.trim() || isLoading ? "bg-blue-300" : "bg-[#0052FF]"
              }`}
              style={{
                shadowColor: "#0052FF",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: 2,
              }}
            >
              {isLoading && (
                <ActivityIndicator size="small" color="#ffffff" />
              )}
              <Text className="text-white font-bold text-xs">
                {t("dashboard.create_room", { defaultValue: "Tạo phòng" })}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

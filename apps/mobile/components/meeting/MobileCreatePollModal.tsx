import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { toast } from "../../lib/toast";
import { useCreatePollMutation } from "../../lib/redux/api/pollsApi";

interface MobileCreatePollModalProps {
  visible: boolean;
  onClose: () => void;
  meetingCode: string;
}

export default function MobileCreatePollModal({
  visible,
  onClose,
  meetingCode,
}: MobileCreatePollModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [createPoll, { isLoading }] = useCreatePollMutation();

  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [allowMultiple, setAllowMultiple] = useState(false);

  useEffect(() => {
    if (visible) {
      setQuestion("");
      setOptions(["", ""]);
      setAllowMultiple(false);
    }
  }, [visible]);

  const handleAddOption = () => {
    if (options.length >= 50) {
      toast.error(
        t("meeting.poll.max_options_reached", {
          defaultValue: "Đã đạt số lượng tối đa 50 lựa chọn",
        }),
      );
      return;
    }
    setOptions((prev) => [...prev, ""]);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) {
      toast.error(
        t("meeting.poll.min_options_required", {
          defaultValue: "Cần ít nhất 2 lựa chọn hợp lệ",
        }),
      );
      return;
    }
    setOptions((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleOptionChange = (index: number, value: string) => {
    setOptions((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  const handleSubmit = async () => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      toast.error(
        t("meeting.poll.question_required", {
          defaultValue: "Vui lòng nhập câu hỏi bình chọn",
        }),
      );
      return;
    }

    const cleanedOptions = options
      .map((opt) => opt.trim())
      .filter((opt) => opt.length > 0);

    if (cleanedOptions.length < 2) {
      toast.error(
        t("meeting.poll.min_options_required", {
          defaultValue: "Cần ít nhất 2 lựa chọn hợp lệ",
        }),
      );
      return;
    }

    try {
      await createPoll({
        meetingCode,
        question: trimmedQuestion,
        options: cleanedOptions,
        allowMultiple,
      }).unwrap();

      toast.success(
        t("meeting.poll.create_success", {
          defaultValue: "Đã tạo cuộc bình chọn thành công!",
        }),
      );
      onClose();
    } catch (err: any) {
      console.error("Create poll failed:", err);
      toast.error(
        err?.data?.message ||
          t("meeting.poll.create_failed", {
            defaultValue: "Thao tác thất bại, vui lòng thử lại sau",
          }),
      );
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-end bg-black/70"
        style={{ paddingTop: Math.max(insets.top, 20) }}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          className="flex-1"
        />
        <View
          style={{
            height: "85%",
            paddingBottom: Math.max(insets.bottom, 20) + 12,
          }}
          className="bg-[#161619] rounded-t-3xl border-t border-[#232328] overflow-hidden flex-col"
        >
          {/* Drag Handle */}
          <View className="w-10 h-1 bg-[#3a3a42] rounded-full self-center mt-3 mb-1" />

          {/* Header */}
          <View className="flex-row items-center justify-between px-5 py-4 border-b border-[#232328]">
            <View className="flex-row items-center gap-2.5 flex-1 pr-2">
              <Feather name="bar-chart-2" size={20} color="#3b82f6" />
              <View className="flex-1">
                <Text className="text-white text-base font-bold" numberOfLines={1}>
                  {t("meeting.poll.create_modal_title", { defaultValue: "Tạo cuộc bình chọn mới" })}
                </Text>
                <Text className="text-slate-400 text-xs mt-0.5" numberOfLines={1}>
                  {t("meeting.poll.create_modal_subtitle", {
                    defaultValue: "Đặt câu hỏi và phương án cho mọi người",
                  })}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="p-2 rounded-lg bg-[#232328] active:bg-[#2e2e34]"
            >
              <Feather name="x" size={18} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {/* Form Content */}
          <ScrollView
            className="flex-1 p-5"
            contentContainerStyle={{ paddingBottom: 20 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Question Field */}
            <View className="mb-5">
              <Text className="text-slate-200 text-xs font-semibold mb-2">
                {t("meeting.poll.question_label", { defaultValue: "Câu hỏi bình chọn" })}{" "}
                <Text className="text-red-400">*</Text>
              </Text>
              <TextInput
                value={question}
                onChangeText={setQuestion}
                placeholder={t("meeting.poll.question_placeholder", {
                  defaultValue: "Nhập câu hỏi tại đây...",
                })}
                placeholderTextColor="#64748b"
                multiline
                numberOfLines={3}
                className="bg-[#1b1b1f] border border-[#2a2a32] rounded-2xl p-3.5 text-white text-sm"
                style={{ minHeight: 70, textAlignVertical: "top" }}
              />
            </View>

            {/* Options List */}
            <View className="mb-5">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-slate-200 text-xs font-semibold">
                  {t("meeting.poll.options_label", { defaultValue: "Danh sách lựa chọn" })}{" "}
                  <Text className="text-red-400">*</Text>
                </Text>
                <Text className="text-slate-500 text-xs font-mono">
                  {options.length}/50
                </Text>
              </View>

              <View className="gap-2.5">
                {options.map((opt, idx) => (
                  <View
                    key={idx}
                    className="flex-row items-center gap-2 bg-[#1b1b1f] border border-[#2a2a32] rounded-xl px-3 py-1"
                  >
                    <Text className="text-slate-500 text-xs font-mono font-bold w-5">
                      {idx + 1}.
                    </Text>
                    <TextInput
                      value={opt}
                      onChangeText={(val) => handleOptionChange(idx, val)}
                      placeholder={`${t("meeting.poll.option_placeholder", { defaultValue: "Lựa chọn" })} ${idx + 1}`}
                      placeholderTextColor="#64748b"
                      className="flex-1 text-white text-sm py-2"
                    />
                    {options.length > 2 && (
                      <TouchableOpacity
                        onPress={() => handleRemoveOption(idx)}
                        className="p-1.5 rounded-lg active:bg-red-500/10"
                      >
                        <Feather name="trash-2" size={15} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>

              {options.length < 50 && (
                <TouchableOpacity
                  onPress={handleAddOption}
                  className="flex-row items-center justify-center gap-2 py-3 mt-3 rounded-xl border border-dashed border-[#3a3a42] bg-[#1a1a1f] active:bg-[#222228]"
                >
                  <Feather name="plus" size={16} color="#60a5fa" />
                  <Text className="text-blue-400 text-xs font-semibold">
                    {t("meeting.poll.add_option", { defaultValue: "Thêm lựa chọn" })}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Multiple Choice Toggle */}
            <View className="p-4 rounded-2xl bg-[#1b1b1f] border border-[#2a2a32] flex-row items-center justify-between mb-5">
              <View className="flex-1 pr-3">
                <Text className="text-slate-200 text-sm font-semibold">
                  {t("meeting.poll.allow_multiple_label", {
                    defaultValue: "Cho phép chọn nhiều phương án",
                  })}
                </Text>
                <Text className="text-slate-400 text-xs mt-0.5">
                  {t("meeting.poll.allow_multiple_desc", {
                    defaultValue: "Người tham gia có thể chọn nhiều hơn 1 đáp án",
                  })}
                </Text>
              </View>
              <Switch
                value={allowMultiple}
                onValueChange={setAllowMultiple}
                trackColor={{ false: "#334155", true: "#2563eb" }}
                thumbColor={allowMultiple ? "#ffffff" : "#94a3b8"}
              />
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View className="flex-row items-center gap-3 px-5 pt-3 border-t border-[#232328]">
            <TouchableOpacity
              onPress={onClose}
              disabled={isLoading}
              className="flex-1 py-3 rounded-xl bg-[#232328] active:bg-[#2e2e34] items-center"
            >
              <Text className="text-slate-300 font-semibold text-sm">
                {t("meeting.poll.cancel", { defaultValue: "Hủy" })}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={isLoading}
              className="flex-1 py-3 rounded-xl bg-blue-600 active:bg-blue-700 items-center justify-center flex-row gap-2"
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Feather name="check" size={16} color="#ffffff" />
              )}
              <Text className="text-white font-bold text-sm">
                {t("meeting.poll.create_submit", { defaultValue: "Tạo bình chọn" })}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}


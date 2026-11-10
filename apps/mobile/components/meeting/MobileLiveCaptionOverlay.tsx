import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  FlatList,
  Image,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Room } from "livekit-client";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLiveCaptions, LiveCaptionItem } from "../../hooks/useLiveCaptions";

interface MobileLiveCaptionOverlayProps {
  room: Room | undefined;
  enabled: boolean;
  onClose: () => void;
}

const DEEPGRAM_LANGUAGES = [
  { code: "vi", label: "Tiếng Việt", native: "Vietnamese" },
  { code: "en", label: "Tiếng Anh", native: "English" },
  { code: "en-US", label: "English (US)", native: "United States" },
  { code: "en-GB", label: "English (UK)", native: "United Kingdom" },
  { code: "zh", label: "Tiếng Trung (Phổ thông)", native: "中文" },
  { code: "zh-CN", label: "Tiếng Trung (Giản thể)", native: "简体中文" },
  { code: "zh-TW", label: "Tiếng Trung (Phồn thể)", native: "繁體中文" },
  { code: "ja", label: "Tiếng Nhật", native: "日本語" },
  { code: "ko", label: "Tiếng Hàn", native: "한국어" },
  { code: "fr", label: "Tiếng Pháp", native: "Français" },
  { code: "de", label: "Tiếng Đức", native: "Deutsch" },
  { code: "es", label: "Tiếng Tây Ban Nha", native: "Español" },
  { code: "pt", label: "Tiếng Bồ Đào Nha", native: "Português" },
  { code: "ru", label: "Tiếng Nga", native: "Русский" },
  { code: "it", label: "Tiếng Ý", native: "Italiano" },
  { code: "id", label: "Tiếng Indonesia", native: "Bahasa Indonesia" },
  { code: "th", label: "Tiếng Thái", native: "ไทย" },
  { code: "hi", label: "Tiếng Hindi", native: "हिन्दी" },
  { code: "tr", label: "Tiếng Thổ Nhĩ Kỳ", native: "Türkçe" },
  { code: "nl", label: "Tiếng Hà Lan", native: "Nederlands" },
  { code: "pl", label: "Tiếng Ba Lan", native: "Polski" },
  { code: "sv", label: "Tiếng Thụy Điển", native: "Svenska" },
  { code: "da", label: "Tiếng Đan Mạch", native: "Dansk" },
  { code: "no", label: "Tiếng Na Uy", native: "Norsk" },
  { code: "uk", label: "Tiếng Ukraina", native: "Українська" },
  { code: "ta", label: "Tiếng Tamil", native: "தமிழ்" },
  { code: "cs", label: "Tiếng Séc", native: "Čeština" },
  { code: "el", label: "Tiếng Hy Lạp", native: "Ελληνικά" },
  { code: "fi", label: "Tiếng Phần Lan", native: "Suomi" },
  { code: "hu", label: "Tiếng Hungary", native: "Magyar" },
  { code: "ms", label: "Tiếng Mã Lai", native: "Bahasa Melayu" },
  { code: "ro", label: "Tiếng Romania", native: "Română" },
  { code: "sk", label: "Tiếng Slovakia", native: "Slovenčina" },
  { code: "bg", label: "Tiếng Bulgaria", native: "Български" },
  { code: "hr", label: "Tiếng Croatia", native: "Hrvatski" },
  { code: "ar", label: "Tiếng Ả Rập", native: "العربية" },
  { code: "multi", label: "Đa ngôn ngữ", native: "Multilingual" },
];

const TRANSLATE_LANG_OPTIONS = [
  { code: "off", label: "Tắt dịch", native: "Off", badge: "OFF" },
  { code: "vi", label: "Tiếng Việt", native: "Vietnamese", badge: "VI" },
  { code: "en", label: "Tiếng Anh", native: "English", badge: "EN" },
  { code: "zh", label: "Tiếng Trung", native: "Chinese", badge: "ZH" },
  { code: "ja", label: "Tiếng Nhật", native: "Japanese", badge: "JA" },
  { code: "ko", label: "Tiếng Hàn", native: "Korean", badge: "KO" },
  { code: "fr", label: "Tiếng Pháp", native: "French", badge: "FR" },
  { code: "de", label: "Tiếng Đức", native: "German", badge: "DE" },
  { code: "es", label: "Tiếng Tây Ban Nha", native: "Spanish", badge: "ES" },
  { code: "pt", label: "Tiếng Bồ Đào Nha", native: "Portuguese", badge: "PT" },
  { code: "ru", label: "Tiếng Nga", native: "Russian", badge: "RU" },
  { code: "it", label: "Tiếng Ý", native: "Italian", badge: "IT" },
  { code: "id", label: "Tiếng Indonesia", native: "Indonesian", badge: "ID" },
  { code: "nl", label: "Tiếng Hà Lan", native: "Dutch", badge: "NL" },
  { code: "pl", label: "Tiếng Ba Lan", native: "Polish", badge: "PL" },
  { code: "sv", label: "Tiếng Thụy Điển", native: "Swedish", badge: "SV" },
  { code: "tr", label: "Tiếng Thổ Nhĩ Kỳ", native: "Turkish", badge: "TR" },
  { code: "uk", label: "Tiếng Ukraina", native: "Ukrainian", badge: "UK" },
  { code: "ar", label: "Tiếng Ả Rập", native: "Arabic", badge: "AR" },
];

function getLangBadge(code: string): string {
  const c = (code || "").split("-")[0].toLowerCase();
  const found = TRANSLATE_LANG_OPTIONS.find((l) => l.code === c);
  return found?.badge || c.toUpperCase();
}

function getTranscribeShortLabel(code: string): string {
  const found = DEEPGRAM_LANGUAGES.find((l) => l.code === code);
  return found?.label || code;
}

interface DisplayCaptionItem {
  id: string;
  text: string;
  isFinal: boolean;
  timestamp: number;
  speakerLanguage?: string;
  appliedTargetLang: string;
  appliedTranslation?: string;
}

interface CaptionGroup {
  speakerId: string;
  speakerName: string;
  isMe: boolean;
  avatarUrl: string;
  initial: string;
  timeStr: string;
  items: DisplayCaptionItem[];
}

export default function MobileLiveCaptionOverlay({
  room,
  enabled,
  onClose,
}: MobileLiveCaptionOverlayProps) {
  const { t } = useTranslation();
  const { captions, clearCaptions } = useLiveCaptions(room, enabled);
  const scrollViewRef = useRef<ScrollView>(null);
  const isAtBottomRef = useRef(true);

  // 1. Ngôn ngữ phiên âm (Nói)
  const [transcribeLanguage, setTranscribeLanguage] = useState<string>("vi");
  const [showTranscribeModal, setShowTranscribeModal] = useState(false);
  const [searchTranscribeText, setSearchTranscribeText] = useState("");

  // 2. Ngôn ngữ dịch (Dịch)
  const [translateTargetLang, setTranslateTargetLang] = useState<string>("off");
  const [showTranslateModal, setShowTranslateModal] = useState(false);
  const [searchTranslateText, setSearchTranslateText] = useState("");

  // Tải cấu hình đã lưu khi mount - Mặc định vào phòng mới luôn là "off" (không dịch)
  useEffect(() => {
    AsyncStorage.getItem("tobomeet_transcribe_language").then((val) => {
      if (val) setTranscribeLanguage(val);
    });
    // Bỏ lưu ngôn ngữ dịch cũ, reset về mặc định
    AsyncStorage.removeItem("tobomeet_translate_target_language").catch(() => {});
  }, []);

  // Đổi ngôn ngữ phiên âm (Nói)
  const handleSelectTranscribeLang = async (code: string) => {
    setTranscribeLanguage(code);
    setShowTranscribeModal(false);
    setSearchTranscribeText("");
    await AsyncStorage.setItem("tobomeet_transcribe_language", code);

    if (room?.localParticipant) {
      room.localParticipant.setAttributes({ transcribe_language: code }).catch(() => {});
      try {
        const payload = JSON.stringify({
          type: "SET_LANGUAGE",
          language: code,
        });
        room.localParticipant.publishData(new TextEncoder().encode(payload), {
          reliable: true,
          topic: "lk.transcription.config",
        }).catch(() => {});
      } catch {}
    }
  };

  // Đổi ngôn ngữ dịch
  const handleSelectTranslateLang = async (code: string) => {
    setTranslateTargetLang(code);
    setShowTranslateModal(false);
    setSearchTranslateText("");

    if (room?.localParticipant) {
      room.localParticipant.setAttributes({ translate_target_language: code }).catch(() => {});
      try {
        const payload = JSON.stringify({
          type: "SET_TRANSLATE_TARGET",
          language: code,
        });
        room.localParticipant.publishData(new TextEncoder().encode(payload), {
          reliable: true,
          topic: "lk.transcription.config",
        }).catch(() => {});
      } catch {}
    }
  };

  // Snapshot bản dịch tại thời điểm diễn ra (không đổi khi đổi ngôn ngữ sau này)
  const snapshotRef = useRef<
    Record<string, { appliedTargetLang: string; appliedTranslation?: string }>
  >({});

  const processedItems: DisplayCaptionItem[] = useMemo(() => {
    const currentTarget = (translateTargetLang || "off").split("-")[0].toLowerCase();
    const isTranslateOn = currentTarget !== "off" && currentTarget !== "none";

    return captions.map((caption) => {
      let snap = snapshotRef.current[caption.id];

      if (!snap) {
        if (isTranslateOn) {
          snap = {
            appliedTargetLang: currentTarget,
            appliedTranslation: caption.translations?.[currentTarget],
          };
        } else {
          snap = {
            appliedTargetLang: "off",
          };
        }
        snapshotRef.current[caption.id] = snap;
      } else {
        if (
          snap.appliedTargetLang !== "off" &&
          !snap.appliedTranslation &&
          caption.translations?.[snap.appliedTargetLang]
        ) {
          snap.appliedTranslation = caption.translations[snap.appliedTargetLang];
        }
      }

      return {
        id: caption.id,
        text: caption.text,
        isFinal: caption.isFinal,
        timestamp: caption.timestamp,
        speakerLanguage: caption.speakerLanguage,
        appliedTargetLang: snap.appliedTargetLang,
        appliedTranslation: snap.appliedTranslation,
      };
    });
  }, [captions, translateTargetLang]);

  // Nhóm các đoạn thoại liên tiếp của cùng 1 người nói
  const groupedCaptions = useMemo(() => {
    const localIdentity = room?.localParticipant?.identity;
    const groups: CaptionGroup[] = [];

    for (const item of processedItems) {
      if (!item.text.trim()) continue;

      const rawCaption = captions.find((c) => c.id === item.id);
      const rawSpeakerId = rawCaption?.speakerId || "";
      const rawSpeakerName = rawCaption?.speakerName || "";

      const isMe = Boolean(
        (rawSpeakerId && localIdentity && rawSpeakerId === localIdentity) ||
          rawSpeakerName === "Bạn" ||
          rawSpeakerName === room?.localParticipant?.name,
      );

      const p = isMe
        ? room?.localParticipant
        : rawSpeakerId
          ? room?.getParticipantByIdentity(rawSpeakerId)
          : undefined;

      let avatarUrl = "";
      let name = isMe
        ? "Bạn"
        : p?.name || rawSpeakerName || "Người tham gia";

      if (p?.metadata) {
        try {
          const meta = JSON.parse(p.metadata);
          avatarUrl = meta.avatar || meta.avatarUrl || meta.picture || "";
        } catch {}
      }
      const initial = (name || "?").charAt(0).toUpperCase();
      const timeStr = new Date(item.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      const lastGroup = groups[groups.length - 1];
      if (
        lastGroup &&
        (lastGroup.speakerId === rawSpeakerId ||
          (!rawSpeakerId && lastGroup.speakerName === name))
      ) {
        lastGroup.items.push(item);
      } else {
        groups.push({
          speakerId: rawSpeakerId,
          speakerName: name,
          isMe,
          avatarUrl,
          initial,
          timeStr,
          items: [item],
        });
      }
    }

    return groups;
  }, [processedItems, captions, room]);

  // Cuộn tự động
  useEffect(() => {
    if (enabled) {
      isAtBottomRef.current = true;
      const timer = setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: false });
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [enabled]);

  useEffect(() => {
    if (isAtBottomRef.current && groupedCaptions.length > 0) {
      const timer = setTimeout(() => {
        if (isAtBottomRef.current) {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [groupedCaptions]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    if (contentSize.height <= layoutMeasurement.height) {
      isAtBottomRef.current = true;
      return;
    }
    const paddingToBottom = 25;
    const isCloseToBottom =
      layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
    isAtBottomRef.current = isCloseToBottom;
  };

  const filteredTranscribeLangs = useMemo(() => {
    if (!searchTranscribeText.trim()) return DEEPGRAM_LANGUAGES;
    const q = searchTranscribeText.toLowerCase();
    return DEEPGRAM_LANGUAGES.filter(
      (l) => l.label.toLowerCase().includes(q) || l.native.toLowerCase().includes(q) || l.code.includes(q),
    );
  }, [searchTranscribeText]);

  const filteredTranslateLangs = useMemo(() => {
    if (!searchTranslateText.trim()) return TRANSLATE_LANG_OPTIONS;
    const q = searchTranslateText.toLowerCase();
    return TRANSLATE_LANG_OPTIONS.filter(
      (l) => l.label.toLowerCase().includes(q) || l.native.toLowerCase().includes(q) || l.code.includes(q),
    );
  }, [searchTranslateText]);

  if (!enabled) return null;

  return (
    <View className="w-full bg-[#111113]/95 border-t border-b border-[#232328] px-3 py-2 z-20">
      {/* ===== HEADER BAR TỐI GIẢN (CHỌN NGÔN NGỮ NÓI & DỊCH, NÚT XOÁ, NÚT ĐÓNG) ===== */}
      <View className="flex-row items-center justify-between pb-2 border-b border-white/5 mb-1.5">
        {/* Cụm 2 nút chọn ngôn ngữ đặt cạnh nhau */}
        <View className="flex-row items-center gap-1.5 flex-1 pr-2">
          {/* Nút 1: Ngôn ngữ phiên âm (Nói) */}
          <TouchableOpacity
            onPress={() => setShowTranscribeModal(true)}
            activeOpacity={0.7}
            className="flex-row items-center gap-1 px-2 py-1 rounded bg-[#18181c] border border-[#2b2b36]"
          >
            <Feather name="mic" size={11} color="#94a3b8" />
            <Text className="text-[11px] text-slate-300 max-w-[80px]" numberOfLines={1}>
              {getTranscribeShortLabel(transcribeLanguage)}
            </Text>
            <Feather name="chevron-down" size={10} color="#64748b" />
          </TouchableOpacity>

          {/* Nút 2: Ngôn ngữ dịch (Dịch) */}
          <TouchableOpacity
            onPress={() => setShowTranslateModal(true)}
            activeOpacity={0.7}
            className="flex-row items-center gap-1 px-2 py-1 rounded bg-[#18181c] border border-[#2b2b36]"
          >
            <Feather name="globe" size={11} color="#94a3b8" />
            <Text className="text-[11px] text-slate-300 max-w-[70px]" numberOfLines={1}>
              {translateTargetLang === "off"
                ? "Tắt dịch"
                : getLangBadge(translateTargetLang)}
            </Text>
            <Feather name="chevron-down" size={10} color="#64748b" />
          </TouchableOpacity>
        </View>

        {/* Nút xoá lịch sử & nút đóng */}
        <View className="flex-row items-center gap-2">
          {captions.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                clearCaptions();
                snapshotRef.current = {};
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
              className="p-1"
            >
              <Feather name="trash-2" size={13} color="#94a3b8" />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
            className="w-5 h-5 rounded-full bg-white/10 items-center justify-center border border-white/10"
          >
            <Feather name="x" size={12} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ===== DANH SÁCH BONG BÓNG PHỤ ĐỀ (BÊN PHẢI KHI LÀ BẠN, BÊN TRÁI KHI LÀ NGƯỜI KHÁC) ===== */}
      <ScrollView
        ref={scrollViewRef}
        onScroll={handleScroll}
        onContentSizeChange={() => {
          if (isAtBottomRef.current) {
            scrollViewRef.current?.scrollToEnd({ animated: true });
          }
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={true}
        style={{ maxHeight: 200 }}
        contentContainerStyle={{ flexGrow: 1, paddingVertical: 2 }}
      >
        {groupedCaptions.length === 0 ? (
          <View className="py-4 items-center justify-center">
            <Text className="text-xs text-slate-400 italic">
              Chưa có phụ đề
            </Text>
          </View>
        ) : (
          groupedCaptions.map((group, groupIndex) => {
            const { isMe, speakerName, avatarUrl, initial, timeStr, items } = group;

            return (
              <View
                key={`grp_${groupIndex}`}
                className={`flex-row items-start gap-2 mb-2.5 w-full ${
                  isMe ? "flex-row-reverse" : "flex-row"
                }`}
              >
                {/* Avatar người nói: chỉ hiển thị 1 lần cho cả nhóm */}
                <View className="shrink-0 pt-0.5">
                  {avatarUrl ? (
                    <Image
                      source={{ uri: avatarUrl }}
                      className="w-6 h-6 rounded-full object-cover bg-slate-800"
                    />
                  ) : (
                    <View
                      className={`w-6 h-6 rounded-full items-center justify-center ${
                        isMe
                          ? "bg-blue-600/30 border border-blue-500/40"
                          : "bg-slate-800 border border-[#333]"
                      }`}
                    >
                      <Text
                        className={`text-[10px] font-bold ${
                          isMe ? "text-blue-300" : "text-slate-300"
                        }`}
                      >
                        {initial}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Cụm bong bóng */}
                <View
                  className={`flex-col max-w-[84%] ${
                    isMe ? "items-end" : "items-start"
                  }`}
                >
                  {/* Tên & thời gian */}
                  <View
                    className={`flex-row items-center gap-1.5 mb-1 px-1 ${
                      isMe ? "flex-row-reverse" : "flex-row"
                    }`}
                  >
                    <Text
                      className="text-[10px] font-bold text-slate-400 max-w-[120px]"
                      numberOfLines={1}
                    >
                      {speakerName}
                    </Text>
                    <Text className="text-[9px] text-slate-500">{timeStr}</Text>
                  </View>

                  {/* Danh sách các câu thoại */}
                  <View
                    className={`flex-col gap-1 w-full ${
                      isMe ? "items-end" : "items-start"
                    }`}
                  >
                    {items.map((item, itemIdx) => {
                      const isTranslateActive =
                        item.appliedTargetLang &&
                        item.appliedTargetLang !== "off" &&
                        item.appliedTargetLang !== "none";

                      const srcCode = (item.speakerLanguage || "vi").split("-")[0].toLowerCase();
                      const tgtCode = (item.appliedTargetLang || "").split("-")[0].toLowerCase();
                      const isSameLanguage = isTranslateActive && srcCode === tgtCode;
                      const shouldShowTranslation = item.isFinal && isTranslateActive && !isSameLanguage;

                      const translatedText = item.appliedTranslation;
                      const langBadge = getLangBadge(item.appliedTargetLang);

                      return (
                        <View
                          key={item.id}
                          className={`rounded-2xl px-3 py-1.5 border max-w-[96%] ${
                            isMe
                              ? `bg-blue-600/25 border-blue-500/30 ${
                                  itemIdx === 0 ? "rounded-tr-xs" : ""
                                }`
                              : `bg-[#18181c] border-[#2b2b36] ${
                                  itemIdx === 0 ? "rounded-tl-xs" : ""
                                }`
                          }`}
                        >
                          {/* Câu gốc */}
                          <Text
                            className={`text-xs leading-4 ${
                              item.isFinal
                                ? "text-slate-100 font-medium"
                                : "text-slate-300 italic"
                            }`}
                          >
                            {item.text}
                            {!item.isFinal && (
                              <Text className="text-sky-400 font-bold not-italic">
                                {" "}
                                ...
                              </Text>
                            )}
                          </Text>

                          {/* Dòng bản dịch bên dưới chân: chỉ hiện khi là bản final, đã bật dịch và ngôn ngữ không trùng */}
                          {shouldShowTranslation && (
                            <View className="mt-1 pt-1 border-t border-white/10 flex-col gap-0.5">
                              <View className="flex-row items-center gap-1">
                                <View className="px-1 py-0.2 rounded bg-emerald-500/15 border border-emerald-500/20">
                                  <Text className="text-[8px] font-mono font-bold text-emerald-400">
                                    {langBadge}
                                  </Text>
                                </View>
                              </View>
                              <Text className="text-[11px] text-emerald-300 leading-4 font-normal">
                                {translatedText || (
                                  <Text className="text-slate-500 italic text-[10px]">
                                    Đang dịch...
                                  </Text>
                                )}
                              </Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ===== MODAL CHỌN NGÔN NGỮ NÓI (PHIÊN ÂM) ===== */}
      <Modal
        visible={showTranscribeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTranscribeModal(false)}
      >
        <View className="flex-1 bg-black/70 justify-center items-center px-4">
          <View className="w-full max-w-sm bg-[#161619] border border-[#27272a] rounded-2xl p-4 max-h-[75%]">
            <View className="flex-row items-center justify-between pb-3 border-b border-[#27272a]">
              <Text className="text-sm font-bold text-slate-100">
                Ngôn ngữ bạn nói
              </Text>
              <TouchableOpacity
                onPress={() => setShowTranscribeModal(false)}
                className="p-1 rounded-full bg-white/5"
              >
                <Feather name="x" size={16} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {/* Tìm kiếm */}
            <View className="flex-row items-center bg-[#232328] rounded-lg px-2.5 py-1.5 my-3">
              <Feather name="search" size={13} color="#64748b" />
              <TextInput
                value={searchTranscribeText}
                onChangeText={setSearchTranscribeText}
                placeholder="Tìm ngôn ngữ..."
                placeholderTextColor="#64748b"
                className="flex-1 ml-2 text-xs text-slate-100 py-0"
              />
            </View>

            {/* Danh sách */}
            <FlatList
              data={filteredTranscribeLangs}
              keyExtractor={(item) => item.code}
              showsVerticalScrollIndicator={true}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => handleSelectTranscribeLang(item.code)}
                  className="flex-row items-center justify-between py-2.5 px-2 border-b border-white/5"
                >
                  <View>
                    <Text
                      className={`text-xs ${
                        transcribeLanguage === item.code
                          ? "text-blue-400 font-bold"
                          : "text-slate-200"
                      }`}
                    >
                      {item.label}
                    </Text>
                    <Text className="text-[10px] text-slate-500">{item.native}</Text>
                  </View>
                  {transcribeLanguage === item.code && (
                    <Feather name="check" size={14} color="#60a5fa" />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* ===== MODAL CHỌN NGÔN NGỮ DỊCH ===== */}
      <Modal
        visible={showTranslateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTranslateModal(false)}
      >
        <View className="flex-1 bg-black/70 justify-center items-center px-4">
          <View className="w-full max-w-sm bg-[#161619] border border-[#27272a] rounded-2xl p-4 max-h-[75%]">
            <View className="flex-row items-center justify-between pb-3 border-b border-[#27272a]">
              <Text className="text-sm font-bold text-slate-100">
                Dịch phụ đề sang
              </Text>
              <TouchableOpacity
                onPress={() => setShowTranslateModal(false)}
                className="p-1 rounded-full bg-white/5"
              >
                <Feather name="x" size={16} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {/* Tìm kiếm */}
            <View className="flex-row items-center bg-[#232328] rounded-lg px-2.5 py-1.5 my-3">
              <Feather name="search" size={13} color="#64748b" />
              <TextInput
                value={searchTranslateText}
                onChangeText={setSearchTranslateText}
                placeholder="Tìm ngôn ngữ dịch..."
                placeholderTextColor="#64748b"
                className="flex-1 ml-2 text-xs text-slate-100 py-0"
              />
            </View>

            {/* Danh sách */}
            <FlatList
              data={filteredTranslateLangs}
              keyExtractor={(item) => item.code}
              showsVerticalScrollIndicator={true}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => handleSelectTranslateLang(item.code)}
                  className="flex-row items-center justify-between py-2.5 px-2 border-b border-white/5"
                >
                  <View>
                    <Text
                      className={`text-xs ${
                        translateTargetLang === item.code
                          ? "text-emerald-400 font-bold"
                          : "text-slate-200"
                      }`}
                    >
                      {item.label} ({item.native})
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <View className="px-1.5 py-0.5 rounded bg-slate-800">
                      <Text className="text-[10px] font-mono text-slate-400">
                        {item.badge}
                      </Text>
                    </View>
                    {translateTargetLang === item.code && (
                      <Feather name="check" size={14} color="#10b981" />
                    )}
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Platform,
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardEvent,
  LayoutAnimation,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useDispatch } from "react-redux";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { axiosInstance } from "../../lib/axios";
import { calendarApi } from "../../lib/redux/api/calendarApi";
import DashboardHeader from "../../components/dashboard/DashboardHeader";

interface ToolInvocation {
  toolName: string;
  args?: any;
  result?: any;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  toolInvocations?: ToolInvocation[];
}

const STORAGE_KEY = "@tobo_agent_chat_history";

export default function AgentScreen() {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const flatListRef = useRef<FlatList<Message>>(null);

  // 1. Tải lịch sử trò chuyện từ AsyncStorage
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved && isMounted) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMessages(parsed);
          }
        }
      } catch (err) {
        console.warn("[AgentScreen] Error loading history:", err);
      } finally {
        if (isMounted) setIsHistoryLoaded(true);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Lưu lịch sử khi có tin nhắn mới (giữ lại tối đa 30 tin nhắn)
  useEffect(() => {
    if (!isHistoryLoaded) return;
    try {
      if (messages.length > 0) {
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
      } else {
        AsyncStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      console.warn("[AgentScreen] Error saving history:", err);
    }
  }, [messages, isHistoryLoaded]);

  // Tự động cuộn xuống cuối khi có tin nhắn mới hoặc đang loading
  const scrollToBottom = useCallback((animated = true) => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated });
    }, 100);
  }, []);

  useEffect(() => {
    scrollToBottom(true);
  }, [messages.length, loading, scrollToBottom]);

  // Theo dõi bàn phím — áp dụng cơ chế từ MobileChatModal, đẩy input lên sát mép bàn phím
  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: KeyboardEvent) => {
      if (Platform.OS === "ios") {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
      scrollToBottom(true);
    };
    const onHide = () => {
      if (Platform.OS === "ios") {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      setKeyboardHeight(0);
    };

    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [scrollToBottom]);

  // Khoảng hở đáy (đảm bảo đáy input sát mép bàn phím và có khoảng hở ra xíu 10px)
  // Bàn phím che lên Tab bar (60px) và SafeAreaView bottom nếu có
  const bottomPad =
    keyboardHeight > 0
      ? Math.max(10, keyboardHeight - 60 - (Platform.OS === "ios" ? insets.bottom : 0) + 10)
      : 10;

  // Xóa lịch sử trò chuyện với hộp thoại xác nhận
  const handleClearHistory = () => {
    if (messages.length === 0) return;
    Alert.alert(
      t("ai_agent.clear_history_title", "Xóa lịch sử trò chuyện"),
      t(
        "ai_agent.clear_history_confirm",
        "Bạn có chắc chắn muốn xóa toàn bộ lịch sử trò chuyện với Tobo Agent?",
      ),
      [
        {
          text: t("ai_agent.clear_history_cancel", "Hủy"),
          style: "cancel",
        },
        {
          text: t("ai_agent.clear_history_ok", "Xóa"),
          style: "destructive",
          onPress: () => {
            setMessages([]);
            AsyncStorage.removeItem(STORAGE_KEY).catch(() => { });
          },
        },
      ],
    );
  };

  // Gửi tin nhắn tới AI agent backend
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const locale = i18n.language === "vi" ? "vi-VN" : "en-US";
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    scrollToBottom(true);

    try {
      const historyPayload = messages.slice(-20).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Gọi API /ai-agent/chat với timeout 30s để AI suy luận & gọi tool
      const res = (await axiosInstance.post(
        "/ai-agent/chat",
        {
          message: text,
          history: historyPayload,
        },
        { timeout: 30000 },
      )) as {
        reply: string;
        toolInvocations?: ToolInvocation[];
        error?: string;
      };

      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: res?.reply || t("ai_agent.welcome_title"),
        timestamp: new Date().toLocaleTimeString(locale, {
          hour: "2-digit",
          minute: "2-digit",
        }),
        toolInvocations: res?.toolInvocations,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // Nếu tool đã tạo lịch thành công, tự động cập nhật cache Calendar để tab Lịch cập nhật ngay lập tức!
      if (
        res?.toolInvocations?.some(
          (inv) => inv.toolName === "createCalendarEvent" && inv.result?.success,
        )
      ) {
        dispatch(calendarApi.util.invalidateTags(["CalendarEvent"]));
      }
    } catch (err: any) {
      const errMsg: Message = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content:
          err?.message ||
          t("ai_agent.error_connection", "Rất tiếc, đã có lỗi kết nối tới Tobo Agent. Vui lòng thử lại sau."),
        timestamp: new Date().toLocaleTimeString(locale, {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
      scrollToBottom(true);
    }
  };

  // Danh sách gợi ý câu hỏi nhanh khi bắt đầu
  const quickPrompts = [
    {
      label: t("ai_agent.prompt_today_label", "Lịch hôm nay của tôi thế nào?"),
      text: t("ai_agent.prompt_today_text", "Hôm nay tôi có lịch họp gì không?"),
      icon: "calendar",
    },
    {
      label: t("ai_agent.prompt_free_label", "Ngày mai tôi có rảnh lúc 10h không?"),
      text: t("ai_agent.prompt_free_text", "Ngày mai lúc 10:00 tôi có rảnh không?"),
      icon: "clock",
    },
    {
      label: t("ai_agent.prompt_create_label", "Tạo lịch họp 9h sáng mai"),
      text: t(
        "ai_agent.prompt_create_text",
        "Tạo cho tôi một cuộc họp 'Họp công việc' vào lúc 9h sáng mai trong 1 tiếng",
      ),
      icon: "plus-circle",
    },
  ];

  // Helper render text hỗ trợ markdown cơ bản (**in đậm**, - danh sách)
  const renderFormattedText = (content: string, isUser: boolean) => {
    const lines = content.split("\n");
    return (
      <View className="space-y-1">
        {lines.map((line, lineIdx) => {
          const trimmed = line.trim();
          if (!trimmed) {
            return <View key={lineIdx} className="h-1.5" />;
          }

          const isBullet = trimmed.startsWith("- ") || trimmed.startsWith("* ");
          const lineText = isBullet ? trimmed.substring(2) : line;

          const parts = lineText.split(/(\*\*[^*]+\*\*)/g);
          const renderedParts = parts.map((part, pIdx) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return (
                <Text
                  key={pIdx}
                  className={`font-bold ${isUser ? "text-white" : "text-slate-900"}`}
                >
                  {part.slice(2, -2)}
                </Text>
              );
            }
            return (
              <Text
                key={pIdx}
                className={isUser ? "text-white" : "text-slate-800"}
              >
                {part}
              </Text>
            );
          });

          if (isBullet) {
            return (
              <View key={lineIdx} className="flex-row items-start pl-1 my-0.5">
                <View
                  className={`w-1.5 h-1.5 rounded-full mt-2 mr-2 ${isUser ? "bg-white" : "bg-indigo-600"
                    }`}
                />
                <Text className="flex-1 leading-5 text-[14px]">
                  {renderedParts}
                </Text>
              </View>
            );
          }

          return (
            <Text
              key={lineIdx}
              className={`leading-5 text-[14px] ${isUser ? "text-white" : "text-slate-800"}`}
            >
              {renderedParts}
            </Text>
          );
        })}
      </View>
    );
  };

  // Render thẻ kết quả Tool invocations (Kiểm tra lịch, Tạo lịch)
  const renderToolInvocations = (invocations?: ToolInvocation[]) => {
    if (!invocations || invocations.length === 0) return null;

    return (
      <View className="mb-2 pb-2 border-b border-slate-100 space-y-1.5">
        {invocations.map((inv, idx) => {
          if (inv.toolName === "checkCalendarAvailability") {
            const isFree = inv.result?.isFree;
            const count = inv.result?.eventCount || 0;
            return (
              <View
                key={idx}
                className="flex-row items-center bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-indigo-100"
              >
                <Feather name="calendar" size={13} color="#4F46E5" />
                <Text className="text-[12px] font-semibold text-indigo-700 ml-1.5 flex-1">
                  {isFree
                    ? t("ai_agent.calendar_free", "Lịch đang trống")
                    : t("ai_agent.calendar_busy", {
                      count,
                      defaultValue: `Có ${count} sự kiện`,
                    })}
                </Text>
              </View>
            );
          }

          if (inv.toolName === "createCalendarEvent") {
            const isSuccess = inv.result?.success;
            return (
              <View
                key={idx}
                className={`flex-row items-center px-2.5 py-1.5 rounded-lg border ${isSuccess
                    ? "bg-emerald-50 border-emerald-200"
                    : "bg-rose-50 border-rose-200"
                  }`}
              >
                <Feather
                  name={isSuccess ? "check-circle" : "alert-circle"}
                  size={13}
                  color={isSuccess ? "#059669" : "#E11D48"}
                />
                <Text
                  className={`text-[12px] font-semibold ml-1.5 flex-1 ${isSuccess ? "text-emerald-700" : "text-rose-700"
                    }`}
                >
                  {isSuccess
                    ? t("ai_agent.tool_created", {
                      title: inv.result?.title || "",
                      defaultValue: `Đã tạo: "${inv.result?.title || ""}"`,
                    })
                    : t("ai_agent.tool_create_failed", "Tạo lịch không thành công")}
                </Text>
              </View>
            );
          }

          if (
            inv.toolName === "semanticSearchCalendar" ||
            inv.toolName === "searchCalendar"
          ) {
            const count = inv.result?.matchCount ?? inv.result?.total ?? 0;
            return (
              <View
                key={idx}
                className="flex-row items-center bg-purple-50 px-2.5 py-1.5 rounded-lg border border-purple-100"
              >
                <Feather name="search" size={13} color="#7C3AED" />
                <Text className="text-[12px] font-semibold text-purple-700 ml-1.5 flex-1">
                  {count > 0
                    ? `Tìm thấy ${count} cuộc họp tương đồng`
                    : "Không tìm thấy cuộc họp phù hợp"}
                </Text>
              </View>
            );
          }

          return null;
        })}
      </View>
    );
  };

  // Render từng tin nhắn trong danh sách
  const renderMessageItem = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";

    return (
      <View
        className={`mb-3.5 px-4 flex-row ${isUser ? "justify-end" : "justify-start"
          }`}
      >
        {!isUser && (
          <View className="w-8 h-8 rounded-full bg-indigo-600 items-center justify-center mr-2 mt-0.5 shadow-xs">
            <MaterialCommunityIcons name="robot" size={18} color="#ffffff" />
          </View>
        )}

        <View className={`max-w-[82%] ${isUser ? "items-end" : "items-start"}`}>
          <View
            className={`rounded-2xl px-4 py-3 shadow-xs ${isUser
                ? "bg-[#0052FF] rounded-tr-xs"
                : "bg-white border border-slate-200/80 rounded-tl-xs"
              }`}
          >
            {!isUser && renderToolInvocations(item.toolInvocations)}
            {renderFormattedText(item.content, isUser)}
          </View>

          <Text className="text-[10px] text-slate-400 mt-1 px-1">
            {item.timestamp}
          </Text>
        </View>
      </View>
    );
  };

  // Màn hình trống: Lời chào + gợi ý câu hỏi nhanh
  const renderEmptyState = () => (
    <View className="px-5 py-6 items-center">
      <View className="w-16 h-16 rounded-3xl bg-indigo-600 items-center justify-center shadow-lg shadow-indigo-200 mb-3.5">
        <MaterialCommunityIcons name="robot" size={36} color="#ffffff" />
      </View>

      <Text className="text-lg font-bold text-slate-800 text-center mb-1.5">
        {t("ai_agent.welcome_title", "Xin chào! Tôi có thể giúp gì cho bạn?")}
      </Text>

      <Text className="text-[13px] text-slate-500 text-center leading-5 max-w-[320px] mb-6">
        {t(
          "ai_agent.welcome_desc",
          "Tôi là trợ lý AI của ToboMeet. Bạn có thể hỏi xem lịch của mình có đang trống không hoặc nhờ tôi tạo lịch họp mới.",
        )}
      </Text>

      {/* Danh sách gợi ý */}
      <View className="w-full">
        <Text className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5 px-1">
          {t("ai_agent.quick_prompts", "Gợi ý nhanh")}
        </Text>

        <View className="space-y-2">
          {quickPrompts.map((q, idx) => (
            <TouchableOpacity
              key={idx}
              activeOpacity={0.7}
              onPress={() => handleSendMessage(q.text)}
              className="bg-white p-3.5 rounded-2xl border border-slate-200/90 flex-row items-center justify-between shadow-xs"
            >
              <View className="flex-row items-center flex-1 mr-2">
                <View className="w-8 h-8 rounded-xl bg-indigo-50 items-center justify-center mr-3">
                  <Feather
                    name={q.icon as any}
                    size={16}
                    color="#4F46E5"
                  />
                </View>
                <Text className="text-[13px] font-medium text-slate-700 flex-1">
                  {q.label}
                </Text>
              </View>
              <Feather name="arrow-up-right" size={16} color="#94A3B8" />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-[#F8FAFC]">
      {/* ── Header đồng bộ (Teams style) ── */}
      <DashboardHeader
        title={t("dashboard.tab_agent", "Agent")}
        rightAction={
          messages.length > 0 ? (
            <TouchableOpacity
              onPress={handleClearHistory}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: "#F1F5F9",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Feather name="rotate-ccw" size={15} color="#64748B" />
            </TouchableOpacity>
          ) : undefined
        }
      />

      {/* ── Danh sách tin nhắn ── */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessageItem}
        contentContainerStyle={{
          paddingVertical: 16,
          flexGrow: 1,
        }}
        ListEmptyComponent={renderEmptyState}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListFooterComponent={
          loading ? (
            <View className="mb-3 px-4 flex-row justify-start items-center">
              <View className="w-8 h-8 rounded-full bg-indigo-600 items-center justify-center mr-2 shadow-xs">
                <MaterialCommunityIcons name="robot" size={18} color="#ffffff" />
              </View>
              <View className="bg-white border border-slate-200/80 rounded-2xl rounded-tl-xs px-3.5 py-2.5 shadow-xs flex-row items-center">
                <ActivityIndicator size="small" color="#4F46E5" />
                <Text className="text-[12px] text-slate-600 ml-2 font-medium">
                  {t("ai_agent.thinking", "Tobo Agent đang xử lý...")}
                </Text>
              </View>
            </View>
          ) : null
        }
      />

      {/* ── Ô nhập tin nhắn ── */}
      <View
        style={{ paddingBottom: bottomPad }}
        className="px-3 pt-2 bg-white border-t border-slate-100"
      >
        <View className="flex-row items-center bg-slate-50 rounded-2xl border border-slate-200 pl-3.5 pr-2 py-1.5 focus:border-indigo-500 min-h-[46px]">
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t(
              "ai_agent.input_placeholder",
              "Hỏi về lịch hoặc yêu cầu tạo lịch mới...",
            )}
            placeholderTextColor="#94A3B8"
            multiline
            maxLength={1000}
            editable={!loading}
            style={{
              textAlignVertical: "center",
              paddingTop: Platform.OS === "ios" ? 8 : 4,
              paddingBottom: Platform.OS === "ios" ? 8 : 4,
              minHeight: 36,
            }}
            className="flex-1 text-[14px] text-slate-800 max-h-24 mr-2"
          />

          <TouchableOpacity
            onPress={() => handleSendMessage()}
            disabled={!input.trim() || loading}
            activeOpacity={0.7}
            className={`w-9 h-9 rounded-xl items-center justify-center shrink-0 ${
              input.trim() && !loading ? "bg-[#0052FF]" : "bg-slate-200"
            }`}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Feather
                name="send"
                size={16}
                color={input.trim() ? "#ffffff" : "#94A3B8"}
              />
            )}
          </TouchableOpacity>
        </View>

        <Text className="text-[10px] text-slate-400 text-center mt-1.5">
          {t(
            "ai_agent.disclaimer",
            "Tobo AI có thể có nhầm lẫn. Vui lòng kiểm tra lại thông tin quan trọng.",
          )}
        </Text>
      </View>
    </View>
  );
}

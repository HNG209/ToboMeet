import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import {
  useAskSessionQaMutation,
  useGetSessionQaSuggestionsQuery,
} from "../../lib/redux/features/meetings/meetingsApi";
import { MeetingCitation } from "@tobomeet/shared/types";
import { toast } from "../../lib/toast";

interface MeetingQaSectionProps {
  meetingCode: string;
  sessionId: string;
  isOngoing?: boolean;
  t: (key: string, values?: Record<string, any>) => string;
}

interface QaMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: MeetingCitation[];
  suggestedFollowUps?: string[];
  createdAt: string;
}

export default function MeetingQaSection({
  meetingCode,
  sessionId,
  isOngoing = false,
  t,
}: MeetingQaSectionProps) {
  const [messages, setMessages] = useState<QaMessage[]>([]);
  const [inputQuestion, setInputQuestion] = useState("");
  const [expandedCitations, setExpandedCitations] = useState<Record<string, boolean>>({});
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);

  const storageKey = `meeting_qa_history_${sessionId}`;

  // 1. Đọc lịch sử hỏi đáp từ AsyncStorage theo sessionId
  useEffect(() => {
    let isMounted = true;
    if (!sessionId) {
      setIsHistoryLoaded(true);
      return;
    }

    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (!isMounted) return;
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              setMessages(parsed);
            } else {
              setMessages([]);
            }
          } catch {
            setMessages([]);
          }
        } else {
          setMessages([]);
        }
        setIsHistoryLoaded(true);
      })
      .catch((err) => {
        console.error("Lỗi khi đọc lịch sử hỏi đáp từ AsyncStorage:", err);
        if (isMounted) setIsHistoryLoaded(true);
      });

    return () => {
      isMounted = false;
    };
  }, [sessionId, storageKey]);

  // 2. Lưu lịch sử hỏi đáp vào AsyncStorage khi messages thay đổi
  useEffect(() => {
    if (!isHistoryLoaded || !sessionId) return;
    AsyncStorage.setItem(storageKey, JSON.stringify(messages)).catch((err) => {
      console.error("Lỗi khi lưu lịch sử hỏi đáp vào AsyncStorage:", err);
    });
  }, [messages, isHistoryLoaded, sessionId, storageKey]);

  // Lấy các câu hỏi gợi ý từ nội dung phiên họp (tạo 1 lần ở bước tóm tắt)
  const { data: suggestions } = useGetSessionQaSuggestionsQuery(
    { meetingCode, sessionId },
    { skip: isOngoing || !sessionId },
  );

  const [askSessionQa, { isLoading: isAsking }] = useAskSessionQaMutation();

  const toggleCitation = (msgId: string) => {
    setExpandedCitations((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };

  const handleClearHistory = async () => {
    if (!sessionId) return;
    setMessages([]);
    try {
      await AsyncStorage.removeItem(storageKey);
      toast.success("Đã xóa lịch sử hỏi đáp của phiên họp");
    } catch (err) {
      console.error("Lỗi khi xóa lịch sử hỏi đáp:", err);
    }
  };

  const handleSend = async (questionText?: string) => {
    const q = (questionText || inputQuestion).trim();
    if (!q || isAsking || isOngoing) return;

    const userMsg: QaMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content: q,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuestion("");

    try {
      const response = await askSessionQa({
        meetingCode,
        sessionId,
        question: q,
      }).unwrap();

      const aiMsg: QaMessage = {
        id: `ai_${Date.now()}`,
        role: "assistant",
        content: response.answer,
        citations: response.citations,
        suggestedFollowUps: response.suggestedFollowUps,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      console.error("Lỗi khi hỏi đáp phiên họp:", err);
      const errorMsg =
        err?.data?.message || err?.message || "Không thể xử lý câu hỏi lúc này.";
      toast.error(errorMsg);

      const aiErrorMsg: QaMessage = {
        id: `ai_${Date.now()}`,
        role: "assistant",
        content: `Đã xảy ra lỗi: ${errorMsg}`,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, aiErrorMsg]);
    }
  };

  return (
    <View className="mt-5 pt-5 border-t border-slate-200/90">
      {/* Header */}
      <View className="flex-row items-center justify-between gap-2 mb-1.5">
        <View className="flex-row items-center gap-2 flex-1">
          <View className="w-6 h-6 rounded-md bg-indigo-50 border border-indigo-100 items-center justify-center">
            <Feather name="message-square" size={13} color="#4F46E5" />
          </View>
          <Text className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
            {t("room.session_qa_title")}
          </Text>
        </View>

        {messages.length > 0 && !isOngoing && (
          <TouchableOpacity
            onPress={handleClearHistory}
            className="flex-row items-center gap-1 px-2 py-1 rounded-md active:bg-rose-50"
            activeOpacity={0.7}
          >
            <Feather name="rotate-ccw" size={11} color="#94A3B8" />
            <Text className="text-[11px] font-medium text-slate-400">
              {t("room.session_qa_clear_history")}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <Text className="text-[11px] text-slate-500 mb-3 leading-relaxed">
        {t("room.session_qa_desc")}
      </Text>

      {/* Suggested Questions Chips */}
      {!isOngoing && suggestions && suggestions.length > 0 ? (
        <View className="mb-3.5">
          <View className="flex-row items-center gap-1.5 mb-2">
            <Feather name="help-circle" size={12} color="#6366F1" />
            <Text className="text-[11px] font-semibold text-slate-500">
              {t("room.session_qa_suggestions_title")}
            </Text>
          </View>
          <View className="flex-row flex-wrap gap-1.5">
            {suggestions.map((suggestion, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => handleSend(suggestion)}
                disabled={isAsking}
                activeOpacity={0.7}
                className="px-2.5 py-1.5 rounded-lg bg-indigo-50/70 border border-indigo-200/70 active:bg-indigo-100"
              >
                <Text className="text-xs text-indigo-800 leading-snug">
                  {suggestion}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      {/* Ongoing Notice */}
      {isOngoing && (
        <View className="p-3 bg-slate-50 rounded-xl border border-dashed border-slate-200 flex-row items-center gap-2 mb-2">
          <Feather name="clock" size={14} color="#94A3B8" />
          <Text className="text-xs text-slate-500 flex-1">
            {t("room.session_qa_ongoing_notice")}
          </Text>
        </View>
      )}

      {/* Thread & Input Container */}
      {!isOngoing && (
        <View className="rounded-xl border border-slate-200 bg-slate-50/50 overflow-hidden">
          {/* Messages List */}
          <View className="p-3 space-y-3">
            {messages.length === 0 ? (
              <View className="py-5 items-center justify-center">
                <Feather name="message-circle" size={22} color="#CBD5E1" />
                <Text className="text-[11px] text-slate-400 text-center mt-1.5 px-4 leading-relaxed">
                  {t("room.session_qa_empty_thread")}
                </Text>
              </View>
            ) : (
              messages.map((msg) => {
                const isUser = msg.role === "user";
                const isExpanded = !!expandedCitations[msg.id];
                const hasCitations = msg.citations && msg.citations.length > 0;

                return (
                  <View
                    key={msg.id}
                    className={`flex-col ${isUser ? "items-end" : "items-start"} mb-2`}
                  >
                    {/* Role header */}
                    <View className="flex-row items-center gap-1 mb-1 px-1">
                      {isUser ? (
                        <>
                          <Text className="text-[10px] font-semibold text-slate-500">
                            Bạn
                          </Text>
                          <Feather name="user" size={10} color="#64748B" />
                        </>
                      ) : (
                        <>
                          <Feather name="zap" size={10} color="#4F46E5" />
                          <Text className="text-[10px] font-semibold text-indigo-700">
                            Tobo Meeting Assistant
                          </Text>
                        </>
                      )}
                    </View>

                    {/* Bubble */}
                    <View
                      className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 ${
                        isUser
                          ? "bg-[#0052FF] rounded-tr-xs"
                          : "bg-white border border-slate-200/90 rounded-tl-xs"
                      }`}
                    >
                      <Text
                        className={`text-xs leading-relaxed ${
                          isUser ? "text-white" : "text-slate-800"
                        }`}
                      >
                        {msg.content}
                      </Text>

                      {/* Citations section */}
                      {!isUser && hasCitations ? (
                        <View className="mt-2.5 pt-2 border-t border-slate-100">
                          <TouchableOpacity
                            onPress={() => toggleCitation(msg.id)}
                            activeOpacity={0.7}
                            className="flex-row items-center gap-1.5"
                          >
                            <Feather name="file-text" size={11} color="#4F46E5" />
                            <Text className="text-[11px] font-semibold text-indigo-600">
                              {t("room.session_qa_citations", {
                                count: msg.citations!.length,
                              })}
                            </Text>
                            <Feather
                              name={isExpanded ? "chevron-up" : "chevron-down"}
                              size={12}
                              color="#4F46E5"
                            />
                          </TouchableOpacity>

                          {isExpanded ? (
                            <View className="mt-2 space-y-2">
                              {msg.citations!.map((cit, cIdx) => (
                                <View
                                  key={cIdx}
                                  className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 mb-1.5"
                                >
                                  <View className="flex-row items-center justify-between mb-1">
                                    <Text className="text-[10px] font-semibold text-indigo-700 flex-1 mr-2">
                                      {cit.speakers && cit.speakers.length > 0
                                        ? cit.speakers.join(", ")
                                        : "Người phát biểu"}
                                    </Text>
                                    {cit.startTime ? (
                                      <Text className="text-[10px] text-slate-500 font-mono">
                                        {cit.startTime}
                                        {cit.endTime ? ` - ${cit.endTime}` : ""}
                                      </Text>
                                    ) : null}
                                  </View>
                                  <Text className="text-[11px] italic text-slate-600 leading-snug">
                                    {cit.text}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </View>

                    {/* Follow-up suggestions */}
                    {!isUser &&
                    msg.suggestedFollowUps &&
                    msg.suggestedFollowUps.length > 0 ? (
                      <View className="mt-2 flex-row flex-wrap gap-1.5 max-w-[92%]">
                        {msg.suggestedFollowUps.map((fu, fuIdx) => (
                          <TouchableOpacity
                            key={fuIdx}
                            onPress={() => handleSend(fu)}
                            disabled={isAsking}
                            activeOpacity={0.7}
                            className="px-2.5 py-1 rounded-md bg-white border border-slate-200 active:bg-slate-50"
                          >
                            <Text className="text-[11px] text-slate-700">
                              👉 {fu}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}

            {/* Thinking Loading State */}
            {isAsking && (
              <View className="flex-row items-center gap-2 mt-1">
                <View className="w-5 h-5 rounded-full bg-indigo-50 border border-indigo-200 items-center justify-center">
                  <Feather name="zap" size={10} color="#4F46E5" />
                </View>
                <View className="bg-white rounded-2xl rounded-tl-xs px-3 py-2 border border-slate-200 flex-row items-center gap-2">
                  <ActivityIndicator size="small" color="#4F46E5" />
                  <Text className="text-xs text-slate-600">
                    {t("room.session_qa_thinking")}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Input Bar */}
          <View className="p-2.5 bg-white border-t border-slate-200 flex-row items-center gap-2">
            <TextInput
              value={inputQuestion}
              onChangeText={setInputQuestion}
              placeholder={t("room.session_qa_input_placeholder")}
              placeholderTextColor="#94A3B8"
              editable={!isAsking && !isOngoing}
              returnKeyType="send"
              onSubmitEditing={() => handleSend()}
              className="flex-1 text-xs px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900"
            />
            <TouchableOpacity
              onPress={() => handleSend()}
              disabled={isAsking || !inputQuestion.trim() || isOngoing}
              activeOpacity={0.8}
              className={`px-3.5 py-2.5 rounded-xl flex-row items-center justify-center gap-1.5 ${
                isAsking || !inputQuestion.trim() || isOngoing
                  ? "bg-slate-200"
                  : "bg-[#0052FF]"
              }`}
            >
              {isAsking ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Feather
                    name="send"
                    size={13}
                    color={!inputQuestion.trim() ? "#94A3B8" : "#FFFFFF"}
                  />
                  <Text
                    className={`text-xs font-semibold ${
                      !inputQuestion.trim() ? "text-slate-400" : "text-white"
                    }`}
                  >
                    {t("room.session_qa_ask_btn")}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}


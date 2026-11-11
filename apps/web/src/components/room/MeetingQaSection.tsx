"use client";

import { useState, useRef, useEffect } from "react";
import localforage from "localforage";
import {
  MessageSquareQuote,
  Send,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  User,
  Quote,
  Clock,
  HelpCircle,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import {
  useAskSessionQaMutation,
  useGetSessionQaSuggestionsQuery,
} from "@/lib/redux/api/meetingsApi";
import { MeetingCitation } from "@tobomeet/shared/types";

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
  createdAt: Date | string;
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

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const storageKey = `meeting_qa_history_${sessionId}`;

  // 1. Đọc lịch sử hỏi đáp của phiên họp từ localForage
  useEffect(() => {
    let isMounted = true;
    if (!sessionId) {
      setIsHistoryLoaded(true);
      return;
    }

    localforage
      .getItem<QaMessage[]>(storageKey)
      .then((saved) => {
        if (isMounted) {
          if (Array.isArray(saved) && saved.length > 0) {
            setMessages(saved);
          } else {
            setMessages([]);
          }
          setIsHistoryLoaded(true);
        }
      })
      .catch((err) => {
        console.error("Lỗi khi đọc lịch sử hỏi đáp từ localForage:", err);
        if (isMounted) setIsHistoryLoaded(true);
      });

    return () => {
      isMounted = false;
    };
  }, [sessionId, storageKey]);

  // 2. Lưu tin nhắn vào localForage khi danh sách messages thay đổi
  useEffect(() => {
    if (!isHistoryLoaded || !sessionId) return;
    localforage
      .setItem(storageKey, messages)
      .catch((err) => {
        console.error("Lỗi khi lưu lịch sử hỏi đáp vào localForage:", err);
      });
  }, [messages, isHistoryLoaded, sessionId, storageKey]);

  // Lấy các câu hỏi gợi ý từ nội dung phiên họp (đã tạo 1 lần ở bước tóm tắt)
  const { data: suggestions, isLoading: isLoadingSuggestions } =
    useGetSessionQaSuggestionsQuery(
      { meetingCode, sessionId },
      { skip: isOngoing || !sessionId },
    );

  const [askSessionQa, { isLoading: isAsking }] = useAskSessionQaMutation();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, isAsking]);

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
      await localforage.removeItem(storageKey);
      toast.success("Đã xóa lịch sử hỏi đáp của phiên họp");
    } catch (err) {
      console.error("Lỗi khi xóa lịch sử hỏi đáp:", err);
    }
  };

  const handleSend = async (questionText?: string) => {
    const q = (questionText || inputQuestion).trim();
    if (!q || isAsking || isOngoing) return;

    const userMsgId = `user_${Date.now()}`;
    const userMsg: QaMessage = {
      id: userMsgId,
      role: "user",
      content: q,
      createdAt: new Date(),
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
        createdAt: new Date(),
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
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, aiErrorMsg]);
    }
  };

  return (
    <div className="mt-6 pt-6 border-t border-slate-200/90">
      {/* Section Header */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
            <MessageSquareQuote size={14} />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              {t("session_qa_title")}
            </h4>
          </div>
        </div>

        {/* Nút xóa lịch sử hỏi đáp nếu có tin nhắn */}
        {messages.length > 0 && !isOngoing && (
          <button
            type="button"
            onClick={handleClearHistory}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
            title="Xóa lịch sử hỏi đáp của phiên họp này"
          >
            <RotateCcw size={12} />
            <span>Xóa lịch sử</span>
          </button>
        )}
      </div>

      <p className="text-[11px] text-slate-500 mb-3">
        {t("session_qa_desc")}
      </p>

      {/* Suggested Questions Chips (tạo từ nội dung cuộc họp) */}
      {!isOngoing && suggestions && suggestions.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 mb-2">
            <HelpCircle size={13} className="text-indigo-500" />
            <span>{t("session_qa_suggestions_title")}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(suggestion)}
                disabled={isAsking}
                className="text-left text-xs px-3 py-1.5 rounded-lg bg-indigo-50/50 hover:bg-indigo-100/70 text-indigo-800 border border-indigo-200/60 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                <span>{suggestion}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Ongoing Notice */}
      {isOngoing && (
        <div className="p-3 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500 flex items-center gap-2 mb-3">
          <Clock size={15} className="text-slate-400 shrink-0" />
          <span>{t("session_qa_ongoing_notice")}</span>
        </div>
      )}

      {/* Q&A Conversation Thread Container */}
      {!isOngoing && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/40 overflow-hidden mb-3">
          {/* Messages list */}
          <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="py-6 text-center text-slate-400">
                <MessageSquareQuote size={24} className="mx-auto mb-1.5 text-slate-300" />
                <p className="text-xs">
                  {t("session_qa_empty_thread")}
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isUser = msg.role === "user";
                const isExpanded = !!expandedCitations[msg.id];
                const hasCitations = msg.citations && msg.citations.length > 0;

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                  >
                    {/* Role header */}
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 mb-1 px-1">
                      {isUser ? (
                        <>
                          <span>Bạn</span>
                          <User size={12} />
                        </>
                      ) : (
                        <>
                          <Sparkles size={12} className="text-indigo-600" />
                          <span className="text-indigo-700">Tobo Meeting Assistant</span>
                        </>
                      )}
                    </div>

                    {/* Bubble content */}
                    <div
                      className={`max-w-xl rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                        isUser
                          ? "bg-brand-600 text-white rounded-tr-xs"
                          : "bg-white text-slate-800 border border-slate-200/90 shadow-2xs rounded-tl-xs whitespace-pre-wrap"
                      }`}
                    >
                      {msg.content}

                      {/* Citations section if available */}
                      {!isUser && hasCitations && (
                        <div className="mt-3 pt-2.5 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => toggleCitation(msg.id)}
                            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 transition-colors cursor-pointer"
                          >
                            <Quote size={12} />
                            <span>
                              {t("session_qa_citations", {
                                count: msg.citations!.length,
                              })}
                            </span>
                            {isExpanded ? (
                              <ChevronUp size={12} />
                            ) : (
                              <ChevronDown size={12} />
                            )}
                          </button>

                          {isExpanded && (
                            <div className="mt-2 space-y-2">
                              {msg.citations!.map((cit, cIdx) => (
                                <div
                                  key={cIdx}
                                  className="p-2 rounded-lg bg-slate-50 border border-slate-200/70 text-[11px] text-slate-700"
                                >
                                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mb-1">
                                    <span className="font-semibold text-indigo-700">
                                      {cit.speakers && cit.speakers.length > 0
                                        ? cit.speakers.join(", ")
                                        : "Người phát biểu"}
                                    </span>
                                    {cit.startTime && (
                                      <span>
                                        {cit.startTime}
                                        {cit.endTime ? ` - ${cit.endTime}` : ""}
                                      </span>
                                    )}
                                  </div>
                                  <p className="italic text-slate-600">
                                    {cit.text}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Suggested follow-up chips under AI message */}
                    {!isUser && msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5 max-w-xl">
                        {msg.suggestedFollowUps.map((fu, fuIdx) => (
                          <button
                            key={fuIdx}
                            type="button"
                            onClick={() => handleSend(fu)}
                            disabled={isAsking}
                            className="text-left text-[11px] px-2.5 py-1 rounded-md bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
                          >
                            👉 {fu}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Loading thinking indicator */}
            {isAsking && (
              <div className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles size={11} />
                </div>
                <div className="bg-white rounded-2xl rounded-tl-xs px-3.5 py-2 border border-slate-200 shadow-2xs text-xs text-slate-600 flex items-center gap-2">
                  <Loader2 size={13} className="animate-spin text-indigo-600" />
                  <span>{t("session_qa_thinking")}</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input field bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="p-2.5 bg-white border-t border-slate-200 flex items-center gap-2"
          >
            <input
              type="text"
              value={inputQuestion}
              onChange={(e) => setInputQuestion(e.target.value)}
              placeholder={t("session_qa_input_placeholder")}
              disabled={isAsking || isOngoing}
              className="flex-1 text-xs px-3.5 py-2 rounded-xl bg-slate-50/80 border border-slate-200 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 transition-all placeholder:text-slate-400 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isAsking || !inputQuestion.trim() || isOngoing}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold shadow-xs disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 cursor-pointer"
            >
              {isAsking ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Send size={13} />
              )}
              <span className="hidden sm:inline">{t("session_qa_ask_btn")}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

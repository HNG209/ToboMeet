"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot,
  Send,
  RotateCcw,
  Calendar,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { axiosInstance } from "@/lib/axios";
import { useDispatch } from "react-redux";
import { calendarApi } from "@/lib/redux/api/calendarApi";

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

const STORAGE_KEY = "tobo_agent_chat_history";
const CORNER_KEY = "tobo_agent_corner";
const BUTTON_SIZE = 56; // 56px (w-14 h-14)

type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * Tính toán toạ độ (x, y) trên màn hình dựa theo góc được ghim (Corner).
 * - Phía bên trái chừa lề tối thiểu để không đè lên Sidebar chính.
 */
function getCornerPosition(
  corner: Corner,
  w = typeof window !== "undefined" ? window.innerWidth : 1200,
  h = typeof window !== "undefined" ? window.innerHeight : 800,
) {
  const isDesktop = w >= 768;
  const leftMargin = isDesktop ? 96 : 80;
  const rightMargin = 24;
  const topMargin = 24;
  const bottomMargin = 24;

  switch (corner) {
    case "top-left":
      return { x: leftMargin, y: topMargin };
    case "top-right":
      return { x: Math.max(leftMargin, w - BUTTON_SIZE - rightMargin), y: topMargin };
    case "bottom-left":
      return { x: leftMargin, y: Math.max(topMargin, h - BUTTON_SIZE - bottomMargin) };
    case "bottom-right":
    default:
      return {
        x: Math.max(leftMargin, w - BUTTON_SIZE - rightMargin),
        y: Math.max(topMargin, h - BUTTON_SIZE - bottomMargin),
      };
  }
}

/**
 * Xác định class vị trí mở khung chat theo góc hiện tại của button
 */
function getDialogPositionClass(corner: Corner) {
  switch (corner) {
    case "top-left":
      return "fixed top-6 left-20 md:left-24 animate-in fade-in slide-in-from-top-4";
    case "top-right":
      return "fixed top-6 right-6 animate-in fade-in slide-in-from-top-4";
    case "bottom-left":
      return "fixed bottom-6 left-20 md:left-24 animate-in fade-in slide-in-from-bottom-4";
    case "bottom-right":
    default:
      return "fixed bottom-6 right-6 animate-in fade-in slide-in-from-bottom-4";
  }
}

export default function ToboAgentChat() {
  const t = useTranslations("ai_agent");
  const dispatch = useDispatch();

  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  // Vị trí và góc neo của robot icon
  const [corner, setCorner] = useState<Corner>("bottom-right");
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Dữ liệu phục vụ việc kéo thả (drag)
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    hasMoved: boolean;
  }>({ startX: 0, startY: 0, origX: 0, origY: 0, hasMoved: false });

  // Khôi phục góc neo và lịch sử chat từ localStorage
  useEffect(() => {
    setMounted(true);

    try {
      const savedCorner = localStorage.getItem(CORNER_KEY) as Corner | null;
      const initialCorner: Corner =
        savedCorner && ["top-left", "top-right", "bottom-left", "bottom-right"].includes(savedCorner)
          ? savedCorner
          : "bottom-right";
      setCorner(initialCorner);
      setPosition(getCornerPosition(initialCorner));

      const savedHistory = localStorage.getItem(STORAGE_KEY);
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch {
      setPosition(getCornerPosition("bottom-right"));
    }
  }, []);

  // Cập nhật lại toạ độ khi đổi kích thước màn hình
  useEffect(() => {
    if (!mounted) return;
    const handleResize = () => {
      if (!isDragging) {
        setPosition(getCornerPosition(corner));
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [corner, isDragging, mounted]);

  // Lưu lịch sử chat
  useEffect(() => {
    if (!mounted) return;
    try {
      if (messages.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-20)));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Bỏ qua lỗi quota
    }
  }, [messages, mounted]);

  // Tự động cuộn xuống cuối khi có tin nhắn mới
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, loading]);

  // Focus ô nhập khi mở khung chat
  useEffect(() => {
    if (isOpen) {
      setHasNewMessage(false);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  // Xử lý kéo thả và tự động snap vào góc màn hình
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return; // Chỉ nhận chuột trái hoặc cảm ứng

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: position.x,
      origY: position.y,
      hasMoved: false,
    };
    setIsDragging(true);

    const onPointerMove = (moveEv: PointerEvent) => {
      const dx = moveEv.clientX - dragRef.current.startX;
      const dy = moveEv.clientY - dragRef.current.startY;

      if (Math.hypot(dx, dy) > 5) {
        dragRef.current.hasMoved = true;
      }

      const isDesktop = window.innerWidth >= 768;
      const minLeft = isDesktop ? 96 : 80;
      const maxRight = window.innerWidth - BUTTON_SIZE - 16;
      const minTop = 16;
      const maxBottom = window.innerHeight - BUTTON_SIZE - 16;

      const rawX = dragRef.current.origX + dx;
      const rawY = dragRef.current.origY + dy;

      setPosition({
        x: Math.max(minLeft, Math.min(maxRight, rawX)),
        y: Math.max(minTop, Math.min(maxBottom, rawY)),
      });
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      setIsDragging(false);

      // Nếu người dùng chỉ click (không kéo) -> mở hộp thoại
      if (!dragRef.current.hasMoved) {
        setIsOpen(true);
        return;
      }

      // Nếu người dùng đã kéo -> snap vô góc gần nhất
      setPosition((curr) => {
        const cx = curr.x + BUTTON_SIZE / 2;
        const cy = curr.y + BUTTON_SIZE / 2;
        const isLeft = cx < window.innerWidth / 2;
        const isTop = cy < window.innerHeight / 2;

        let targetCorner: Corner = "bottom-right";
        if (isTop && isLeft) targetCorner = "top-left";
        else if (isTop && !isLeft) targetCorner = "top-right";
        else if (!isTop && isLeft) targetCorner = "bottom-left";
        else targetCorner = "bottom-right";

        setCorner(targetCorner);
        try {
          localStorage.setItem(CORNER_KEY, targetCorner);
        } catch {
          // Bỏ qua lỗi storage
        }

        return getCornerPosition(targetCorner);
      });
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const handleClearHistory = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const historyPayload = messages.slice(-20).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = (await axiosInstance.post("/ai-agent/chat", {
        message: text,
        history: historyPayload,
      })) as {
        reply: string;
        toolInvocations?: ToolInvocation[];
        error?: string;
      };

      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: res?.reply || t("welcome_title"),
        timestamp: new Date().toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        toolInvocations: res?.toolInvocations,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // Nếu đã tạo sự kiện mới, cập nhật cache lịch
      if (
        res?.toolInvocations?.some(
          (inv) => inv.toolName === "createCalendarEvent" && inv.result?.success,
        )
      ) {
        dispatch(calendarApi.util.invalidateTags(["CalendarEvent"]));
      }

      if (!isOpen) {
        setHasNewMessage(true);
      }
    } catch (err: any) {
      const errMsg: Message = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: err?.message || t("error_connection"),
        timestamp: new Date().toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const quickPrompts = [
    { label: t("prompt_today_label"), text: t("prompt_today_text") },
    { label: t("prompt_free_label"), text: t("prompt_free_text") },
    { label: t("prompt_create_label"), text: t("prompt_create_text") },
  ];

  // Helper render text có hỗ trợ markdown cơ bản
  const renderFormattedText = (content: string) => {
    const lines = content.split("\n");
    return lines.map((line, idx) => {
      const isBullet = line.trim().startsWith("- ") || line.trim().startsWith("* ");
      const cleanLine = isBullet ? line.trim().substring(2) : line;

      const parts = cleanLine.split(/(\*\*[^*]+\*\*)/g);
      const renderedParts = parts.map((part, pIdx) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={pIdx} className="font-semibold text-slate-900">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      });

      if (isBullet) {
        return (
          <li key={idx} className="ml-4 list-disc text-slate-700 leading-relaxed my-0.5">
            {renderedParts}
          </li>
        );
      }

      if (!line.trim()) {
        return <div key={idx} className="h-1.5" />;
      }

      return (
        <p key={idx} className="leading-relaxed my-0.5">
          {renderedParts}
        </p>
      );
    });
  };

  if (!mounted) return null;

  return (
    <>
      {/* ── Nút nổi Robot (Chỉ hiện icon robot, có thể kéo và tự snap vô góc) ── */}
      {!isOpen && (
        <div
          style={{
            transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
            transition: isDragging
              ? "none"
              : "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
          className="fixed top-0 left-0 z-40 w-14 h-14 select-none touch-none"
        >
          <button
            onPointerDown={handlePointerDown}
            aria-label={t("open_assistant")}
            className={`group relative w-full h-full rounded-full flex items-center justify-center ${isDragging
              ? "cursor-grabbing shadow-[0_16px_36px_rgba(79,70,229,0.55)] scale-105"
              : "cursor-grab shadow-[0_8px_25px_rgba(79,70,229,0.4)] hover:shadow-[0_12px_32px_rgba(79,70,229,0.6)]"
              } bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 text-white border-2 border-white/20 backdrop-blur-md transition-shadow duration-200`}
          >
            {/* Vòng hiệu ứng phát sáng nhẹ xung quanh */}
            <span className="absolute -inset-1 bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 rounded-full blur-md opacity-35 group-hover:opacity-65 transition-opacity duration-300 pointer-events-none" />

            {/* Icon Robot trung tâm */}
            <div className="relative flex items-center justify-center pointer-events-none">
              <Bot className="w-7 h-7 text-white drop-shadow-sm group-hover:scale-110 transition-transform duration-200" />
            </div>

            {/* Chấm đỏ báo tin nhắn mới */}
            {hasNewMessage && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 border-2 border-white rounded-full animate-bounce shadow-md pointer-events-none" />
            )}

            {/* Tooltip khi hover */}
            {!isDragging && (
              <div
                className={`absolute pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 px-3 py-1.5 rounded-xl bg-slate-900/95 text-white text-[12px] font-medium shadow-xl border border-white/10 whitespace-nowrap z-50 ${corner.includes("right")
                  ? "right-full mr-3 top-1/2 -translate-y-1/2"
                  : "left-full ml-3 top-1/2 -translate-y-1/2"
                  }`}
              >
                <div className="flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{t("title")}</span>
                </div>
                <span className="block text-[10px] text-slate-400 font-normal">
                  {t("drag_hint")}
                </span>
              </div>
            )}
          </button>
        </div>
      )}

      {/* ── Khung chat với Tobo Agent ── */}
      {isOpen && (
        <div
          className={`${getDialogPositionClass(
            corner,
          )} z-50 w-[92vw] sm:w-[410px] h-[580px] max-h-[85vh] bg-white rounded-2xl shadow-[0_12px_45px_rgba(15,23,42,0.18)] border border-slate-200/90 flex flex-col overflow-hidden duration-200`}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-4 py-3.5 flex items-center justify-between text-white shrink-0 border-b border-indigo-900/50">
            <div className="flex items-center gap-2.5">
              <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 shadow-inner">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-semibold text-[14px] leading-tight">
                    {t("title")}
                  </h3>
                </div>
                <p className="text-[11px] text-slate-300 leading-tight flex items-center gap-1">
                  {t("subtitle")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  title={t("clear_history")}
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                title={t("minimize")}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              >
                <ChevronDown className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>

          {/* Vùng tin nhắn */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/50">
            {/* Tin nhắn chào mừng ban đầu */}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center text-center py-6 px-2">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs border border-indigo-100 mb-3">
                  <Sparkles className="w-6 h-6 text-indigo-600" />
                </div>
                <h4 className="font-semibold text-slate-800 text-[15px] mb-1">
                  {t("welcome_title")}
                </h4>
                <p className="text-[12.5px] text-slate-500 max-w-[300px] mb-4 leading-relaxed">
                  {t("welcome_desc")}
                </p>

                {/* Gợi ý câu hỏi nhanh */}
                <div className="w-full space-y-2 mt-2">
                  <p className="text-[11px] font-medium text-slate-400 text-left px-1 uppercase tracking-wider">
                    {t("quick_prompts")}
                  </p>
                  {quickPrompts.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => handleSendMessage(q.text)}
                      className="w-full text-left p-2.5 rounded-xl bg-white hover:bg-indigo-50/70 border border-slate-200/80 hover:border-indigo-200 text-slate-700 text-[12.5px] font-medium transition-all shadow-xs flex items-center justify-between group cursor-pointer"
                    >
                      <span className="truncate pr-2">{q.label}</span>
                      <Send className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition-colors shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Danh sách tin nhắn */}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"
                  }`}
              >
                <div
                  className={`relative max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] shadow-xs ${msg.role === "user"
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-br-xs"
                    : "bg-white text-slate-800 border border-slate-200/80 rounded-bl-xs"
                    }`}
                >
                  {/* Tool invocation badge nếu có */}
                  {msg.toolInvocations && msg.toolInvocations.length > 0 && (
                    <div className="mb-2 space-y-1.5 pb-2 border-b border-slate-100">
                      {msg.toolInvocations.map((inv, idx) => {
                        if (inv.toolName === "checkCalendarAvailability") {
                          const isFree = inv.result?.isFree;
                          return (
                            <div
                              key={idx}
                              className="flex items-center gap-1.5 text-[11px] font-medium text-indigo-700 bg-indigo-50/80 px-2 py-1 rounded-md border border-indigo-100"
                            >
                              <Calendar className="w-3 h-3 text-indigo-600 shrink-0" />
                              <span className="truncate">
                                {isFree
                                  ? t("calendar_free")
                                  : t("calendar_busy", {
                                    count: inv.result?.eventCount || 0,
                                  })}
                              </span>
                            </div>
                          );
                        }

                        if (inv.toolName === "createCalendarEvent") {
                          const isSuccess = inv.result?.success;
                          return (
                            <div
                              key={idx}
                              className={`flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md border ${isSuccess
                                ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                                : "text-rose-700 bg-rose-50 border-rose-200"
                                }`}
                            >
                              {isSuccess ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                              ) : (
                                <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                              )}
                              <span className="truncate">
                                {isSuccess
                                  ? t("tool_created", {
                                    title: inv.result?.title || "",
                                  })
                                  : t("tool_create_failed")}
                              </span>
                            </div>
                          );
                        }

                        if (
                          inv.toolName === "semanticSearchCalendar" ||
                          inv.toolName === "searchCalendar"
                        ) {
                          const count =
                            inv.result?.matchCount ?? inv.result?.total ?? 0;
                          return (
                            <div
                              key={idx}
                              className="flex items-center gap-1.5 text-[11px] font-medium text-purple-700 bg-purple-50 px-2 py-1 rounded-md border border-purple-200"
                            >
                              <Sparkles className="w-3 h-3 text-purple-600 shrink-0" />
                              <span className="truncate">
                                {count > 0
                                  ? `Đã tìm thấy ${count} lịch họp tương đồng`
                                  : "Không tìm thấy lịch họp phù hợp"}
                              </span>
                            </div>
                          );
                        }

                        return null;
                      })}
                    </div>
                  )}

                  {/* Nội dung tin nhắn */}
                  <div className="leading-relaxed">
                    {renderFormattedText(msg.content)}
                  </div>
                </div>

                {/* Timestamp */}
                <span className="text-[10px] text-slate-400 mt-1 px-1">
                  {msg.timestamp}
                </span>
              </div>
            ))}

            {/* Trạng thái đang tải / AI đang xử lý */}
            {loading && (
              <div className="flex items-start gap-2">
                <div className="bg-white border border-slate-200/80 rounded-2xl rounded-bl-xs px-3.5 py-3 shadow-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" />
                    <span className="text-[11.5px] text-slate-500 font-medium ml-1.5">
                      {t("thinking")}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Ô nhập tin nhắn */}
          <div className="p-3 bg-white border-t border-slate-200/80">
            <div className="relative flex items-end gap-2 bg-slate-50 rounded-xl border border-slate-200/90 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/20 p-2 transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("input_placeholder")}
                rows={1}
                disabled={loading}
                className="flex-1 bg-transparent resize-none outline-none text-[13px] text-slate-800 placeholder:text-slate-400 max-h-24 min-h-[24px] leading-relaxed disabled:opacity-50"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={!input.trim() || loading}
                aria-label={t("send")}
                className="p-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-lg transition-colors shrink-0 shadow-xs cursor-pointer disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 text-center">
              {t("input_hint")}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

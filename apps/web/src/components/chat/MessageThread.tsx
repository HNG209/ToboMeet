"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  DirectConversationResponse,
  DirectMessageResponse,
  ChatAttachment,
  PinnedMessageDetail,
} from "@/types/chat";
import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";
import TypingIndicator from "./TypingIndicator";
import PinnedMessagesBar from "./PinnedMessagesBar";
import {
  ArrowLeft,
  Info,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface MessageThreadProps {
  conversation: DirectConversationResponse;
  currentUserId?: string;
  messages: DirectMessageResponse[];
  pinnedMessages?: PinnedMessageDetail[];
  highlightedMessageId?: string | null;
  pinningMessageId?: string | null;
  hasMore: boolean;
  isLoadingMessages?: boolean;
  isLoadingMore?: boolean;
  isRecipientTyping?: boolean;
  onLoadMore: () => void;
  onSendMessage: (payload: {
    content?: string;
    type?: "text" | "file" | "video" | "image";
    attachments?: ChatAttachment[];
    replyToId?: string;
  }) => Promise<void>;
  onReactMessage: (messageId: string, emoji: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onPinMessage: (messageId: string) => Promise<void>;
  onUnpinMessage: (messageId: string) => Promise<void>;
  onJumpToMessage: (messageId: string) => void;
  onTyping: (isTyping: boolean) => void;
  onOpenReactions?: (messageId: string, emoji?: string) => void;
  onBackMobile?: () => void;
  onToggleDetails?: () => void;
  showDetails?: boolean;
}

function formatDateSeparator(dateStr: string, t: (key: any) => string) {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) return t("today");

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    if (isYesterday) return t("yesterday");

    return date.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export default function MessageThread({
  conversation,
  currentUserId,
  messages,
  pinnedMessages = [],
  highlightedMessageId,
  pinningMessageId,
  hasMore,
  isLoadingMessages,
  isLoadingMore,
  isRecipientTyping,
  onLoadMore,
  onSendMessage,
  onReactMessage,
  onDeleteMessage,
  onPinMessage,
  onUnpinMessage,
  onJumpToMessage,
  onTyping,
  onOpenReactions,
  onBackMobile,
  onToggleDetails,
  showDetails,
}: MessageThreadProps) {
  const t = useTranslations("direct_chat");
  const [replyTo, setReplyTo] = useState<DirectMessageResponse | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [mobileViewportHeight, setMobileViewportHeight] = useState<number | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);

  // Deduplicate messages by ID to prevent duplicate React keys if network/socket sends redundant frames
  const uniqueMessages = useMemo(() => {
    const seen = new Set<string>();
    return messages.filter((msg, idx) => {
      const id = msg.id || (msg as any)._id || `msg_fallback_${idx}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [messages]);

  // Auto-scroll to bottom on first load and on new message if close to bottom
  const scrollToBottom = useCallback((smooth = true) => {
    const container = scrollContainerRef.current;
    if (container) {
      if (smooth) {
        container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      } else {
        container.scrollTop = container.scrollHeight;
      }
    }
    if (bottomAnchorRef.current) {
      bottomAnchorRef.current.scrollIntoView({
        behavior: smooth ? "smooth" : "auto",
        block: "end",
      });
    }
  }, []);

  useEffect(() => {
    scrollToBottom(false);
  }, [conversation.id, scrollToBottom]);

  useEffect(() => {
    // Only smooth scroll if user is near bottom
    const container = scrollContainerRef.current;
    if (container) {
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight < 200;
      if (isNearBottom) {
        scrollToBottom(true);
      }
    }
  }, [uniqueMessages.length, scrollToBottom]);

  // Track scroll position for infinite scroll & floating scroll button
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Check if scrolled up
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    isNearBottomRef.current = isNearBottom;
    setShowScrollBottom(!isNearBottom);

    // Infinite scroll up
    if (container.scrollTop < 60 && hasMore && !isLoadingMore) {
      onLoadMore();
    }
  };

  // Theo dõi window.visualViewport trên thiết bị di động để tự động co lại vùng chat theo bàn phím
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;

    const handleVisualViewportChange = () => {
      const vv = window.visualViewport;
      if (!vv) return;

      // Chỉ kích hoạt xử lý khi ở chế độ mobile (chiều rộng màn hình < 768px)
      if (window.innerWidth < 768) {
        // Cố định scroll window ở 0 để ngăn chặn Safari tự ý trượt khung trang
        if (window.scrollY !== 0) {
          window.scrollTo(0, 0);
        }

        setMobileViewportHeight(vv.height);

        // Tự động cuộn thông minh: nếu trước đó người dùng đang ở cuối danh sách, lập tức ghim ở cuối
        if (isNearBottomRef.current) {
          const container = scrollContainerRef.current;
          if (container) {
            container.scrollTop = container.scrollHeight;
          }
          requestAnimationFrame(() => {
            scrollToBottom(true);
          });
        }
      } else {
        setMobileViewportHeight(null);
      }
    };

    const vv = window.visualViewport;
    vv.addEventListener("resize", handleVisualViewportChange);
    vv.addEventListener("scroll", handleVisualViewportChange);

    return () => {
      vv.removeEventListener("resize", handleVisualViewportChange);
      vv.removeEventListener("scroll", handleVisualViewportChange);
    };
  }, [scrollToBottom]);

  // Khi container thay đổi kích thước (ví dụ khi bàn phím mở làm co chiều cao),
  // tự động ghim vị trí cuộn ở cuối nếu người dùng đang xem ở cuối để không bao giờ bị miss tin nhắn cuối
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    let previousHeight = container.clientHeight;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const currentHeight = entry.contentRect.height;
        // Nếu chiều cao bị co lại (bàn phím mở) và người dùng đang ở cuối
        if (currentHeight < previousHeight && isNearBottomRef.current) {
          container.scrollTop = container.scrollHeight;
          requestAnimationFrame(() => {
            scrollToBottom(false);
          });
        }
        previousHeight = currentHeight;
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [scrollToBottom]);

  const { recipient } = conversation;
  const isOnline = recipient?.status === "ACTIVE";

  // Group messages by day for date dividers
  let lastDateStr = "";

  return (
    <div
      style={
        mobileViewportHeight
          ? {
              height: `${mobileViewportHeight}px`,
              maxHeight: `${mobileViewportHeight}px`,
            }
          : undefined
      }
      className="flex-1 h-full flex flex-col bg-[#fcfcfc] overflow-hidden relative"
    >
      {/* ── Thread Header ── */}
      <div className="h-16 px-4 bg-white border-b border-slate-200/80 flex items-center justify-between shrink-0 shadow-xs z-10">
        <div className="flex items-center gap-3">
          {/* Back button for mobile */}
          {onBackMobile && (
            <button
              onClick={onBackMobile}
              className="md:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 mr-1"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          {/* Recipient Avatar */}
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-slate-200 border border-slate-300 overflow-hidden flex items-center justify-center text-sm font-semibold text-slate-600 shadow-xs">
              {recipient?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={recipient.avatarUrl}
                  alt={recipient.displayName || "User"}
                  className="w-full h-full object-cover"
                />
              ) : (
                recipient?.displayName?.charAt(0).toUpperCase() || "U"
              )}
            </div>
            <span
              className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                isOnline ? "bg-emerald-500" : "bg-slate-300"
              }`}
            />
          </div>

          {/* Recipient Name and Status */}
          <div>
            <h3 className="text-sm font-bold text-slate-800 leading-tight">
              {recipient?.displayName || t("user_fallback")}
            </h3>
            <p className="text-[11px] text-slate-400 font-medium">
              {isOnline ? t("online") : t("offline")}
            </p>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1">
          {onToggleDetails && (
            <button
              onClick={onToggleDetails}
              className={`p-2 rounded-xl transition-colors ${
                showDetails
                  ? "bg-brand-50 text-brand-600"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              }`}
              title={t("details")}
            >
              <Info className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Pinned Messages Bar (0/3 -> 3/3) ── */}
      <PinnedMessagesBar
        pinnedMessages={pinnedMessages}
        currentUserId={currentUserId}
        onJumpToMessage={onJumpToMessage}
        onUnpinMessage={onUnpinMessage}
      />

      {/* ── Messages Scroll Area ── */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-2 py-4 space-y-2"
      >
        {/* Load more spinner */}
        {isLoadingMore && (
          <div className="flex items-center justify-center py-2">
            <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
          </div>
        )}

        {/* Loading messages initial */}
        {isLoadingMessages ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
            <span className="text-xs">{t("loading_messages")}</span>
          </div>
        ) : uniqueMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-slate-400">
            <p className="text-sm font-medium text-slate-600 mb-1">
              {t("no_messages")}
            </p>
          </div>
        ) : (
          uniqueMessages.map((msg, idx) => {
            const dateStr = formatDateSeparator(msg.createdAt, t);
            const showDate = dateStr !== lastDateStr;
            if (showDate) {
              lastDateStr = dateStr;
            }

            const isMsgPinned = Boolean(
              msg.isPinned ||
              pinnedMessages.some(
                (p) =>
                  p.id === msg.id ||
                  (p._id && p._id === msg._id) ||
                  (p.id && msg._id && p.id === msg._id),
              ),
            );

            const enrichedMsg = {
              ...msg,
              isPinned: isMsgPinned,
            };

            const itemKey = msg.id || (msg as any)._id || `msg_${idx}`;

            return (
              <React.Fragment key={itemKey}>
                {showDate && (
                  <div className="flex items-center justify-center my-3">
                    <span className="px-3 py-1 rounded-full bg-slate-200/70 text-slate-500 text-[11px] font-semibold tracking-wide">
                      {dateStr}
                    </span>
                  </div>
                )}
                <MessageBubble
                  message={enrichedMsg}
                  currentUserId={currentUserId}
                  isHighlighted={highlightedMessageId === msg.id}
                  isPinning={pinningMessageId === msg.id}
                  onReply={(m) => setReplyTo(m)}
                  onReact={onReactMessage}
                  onDelete={onDeleteMessage}
                  onOpenReactions={onOpenReactions}
                  onTogglePin={(m) => {
                    if (isMsgPinned) {
                      onUnpinMessage(m.id);
                    } else {
                      onPinMessage(m.id);
                    }
                  }}
                />
              </React.Fragment>
            );
          })
        )}

        {/* Typing indicator */}
        {isRecipientTyping && (
          <TypingIndicator
            displayName={recipient?.displayName}
            avatarUrl={recipient?.avatarUrl}
          />
        )}

        <div ref={bottomAnchorRef} className="h-2 shrink-0" />
      </div>

      {/* Floating Scroll-to-Bottom Button */}
      {showScrollBottom && (
        <button
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-20 right-6 p-2 rounded-full bg-white border border-slate-200 shadow-md text-slate-600 hover:text-brand-600 hover:bg-slate-50 transition-all z-20"
        >
          <ChevronDown className="w-5 h-5" />
        </button>
      )}

      {/* ── Input Area ── */}
      <MessageInput
        conversationId={conversation.id}
        onSendMessage={async (payload) => {
          isNearBottomRef.current = true;
          await onSendMessage(payload);
          requestAnimationFrame(() => scrollToBottom(true));
        }}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onTyping={onTyping}
        onFocus={() => {
          if (window.innerWidth < 768) {
            if (window.scrollY !== 0) {
              window.scrollTo(0, 0);
            }
            if (isNearBottomRef.current) {
              requestAnimationFrame(() => {
                if (bottomAnchorRef.current) {
                  bottomAnchorRef.current.scrollIntoView({
                    behavior: "smooth",
                    block: "end",
                  });
                }
              });
            }
          }
        }}
      />
    </div>
  );
}

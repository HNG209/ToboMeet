"use client";

import { createPortal } from "react-dom";
import {
  Send,
  Lock,
  Paperclip,
  FileText,
  X,
  ChevronDown,
  Reply,
  Info,
  Check,
  Users,
  User,
} from "lucide-react";
import { ChatMessage } from "@tobomeet/shared/types";
import { useChatManager } from "@/hooks/useChatManager";
import { useRoomSettings } from "@/hooks/useRoomSettings";
import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";

interface MeetingChatProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  meetingCode: string;
}

/** Nhóm tin nhắn liên tiếp của cùng 1 người */
function groupMessages(messages: ChatMessage[]) {
  const groups: {
    senderIdentity: string;
    senderName: string;
    messages: ChatMessage[];
  }[] = [];

  for (const msg of messages) {
    const last = groups[groups.length - 1];
    if (last && last.senderIdentity === msg.senderIdentity) {
      last.messages.push(msg);
    } else {
      groups.push({
        senderIdentity: msg.senderIdentity,
        senderName: msg.senderName,
        messages: [msg],
      });
    }
  }
  return groups;
}

export default function MeetingChat({
  setMessages,
  messages,
  meetingCode,
}: MeetingChatProps) {
  const t = useTranslations("meeting.chat");
  const { canChat } = useRoomSettings({ meetingCode });
  const {
    localParticipant,
    otherParticipants,
    inputValue,
    setInputValue,
    replyingTo,
    setReplyingTo,
    selectedTarget,
    setSelectedTarget,
    previewMedia,
    setPreviewMedia,
    reactionDetails,
    setReactionDetails,
    scrollContainerRef,
    fileInputRef,
    QUICK_EMOJIS,
    handleSendMessage,
    handleFileChange,
    handleReact,
    getParticipantDetails,
  } = useChatManager({ messages, setMessages, meetingCode });

  const messageGroups = useMemo(() => groupMessages(messages), [messages]);
  const [isTargetDropdownOpen, setIsTargetDropdownOpen] = useState(false);

  const currentTargetLabel = useMemo(() => {
    if (selectedTarget === "all") return t("chat_target_all");
    const p = otherParticipants.find((item) => item.identity === selectedTarget);
    return t("chat_target_specific", { name: p?.name || "" });
  }, [selectedTarget, otherParticipants, t]);

  return (
    <div className="flex flex-col h-full bg-transparent relative">
      {/* ===== MODAL CHI TIẾT CẢM XÚC ===== */}
      {reactionDetails &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-9999 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in"
            onClick={() => setReactionDetails(null)}
          >
            <div
              className="bg-[#161619] border border-[#232328] rounded-2xl w-full max-w-xs shadow-2xl overflow-hidden flex flex-col animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center px-4 py-3 border-b border-[#232328] bg-[#161619]">
                <h3 className="text-sm font-semibold text-white">
                  {t("chat_reaction_details_title")}
                </h3>
                <button
                  onClick={() => setReactionDetails(null)}
                  className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-[#232328] cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="p-3 max-h-60 overflow-y-auto custom-scrollbar flex flex-col gap-3 bg-[#111113]">
                {Object.entries(reactionDetails).map(([emoji, users]) => {
                  if (users.length === 0) return null;
                  return (
                    <div key={emoji} className="flex flex-col gap-1">
                      <div className="text-sm border-b border-[#262626] pb-1.5 mb-1 flex items-center gap-2">
                        <span className="text-base">{emoji}</span>
                        <span className="text-[11px] font-medium text-slate-400">
                          {t("chat_reaction_count", { count: users.length })}
                        </span>
                      </div>
                      {users.map((userId) => {
                        const { displayName, initial, avatarUrl } =
                          getParticipantDetails(userId);
                        return (
                          <div
                            key={userId}
                            className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-[#222] rounded-lg transition-colors"
                          >
                            {avatarUrl ? (
                              <img
                                src={avatarUrl}
                                alt={displayName}
                                className="w-6 h-6 rounded-full object-cover bg-slate-700 ring-1 ring-[#333]"
                              />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] text-white font-bold">
                                {initial}
                              </div>
                            )}
                            <span className="text-[13px] text-slate-300 font-medium">
                              {displayName}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ===== MODAL PREVIEW MEDIA ===== */}
      {previewMedia &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-9999 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in"
            onClick={() => setPreviewMedia(null)}
          >
            <div
              className="relative max-w-full max-h-full flex flex-col items-center animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setPreviewMedia(null)}
                className="absolute -top-11 right-0 p-2 text-white/80 hover:text-white bg-[#222] hover:bg-[#333] border border-[#333] rounded-full transition-colors"
              >
                <X size={20} />
              </button>

              {previewMedia.type.startsWith("image/") ? (
                <img
                  src={previewMedia.url}
                  alt={previewMedia.name}
                  className="max-w-[90vw] max-h-[82vh] object-contain rounded-xl shadow-2xl border border-[#333]"
                />
              ) : previewMedia.type.startsWith("video/") ? (
                <video
                  src={previewMedia.url}
                  controls
                  autoPlay
                  className="max-w-[90vw] max-h-[82vh] rounded-xl shadow-2xl border border-[#333]"
                />
              ) : null}

              <a
                href={previewMedia.url}
                download={previewMedia.name}
                className="mt-3 text-xs text-slate-300 hover:text-blue-400 transition-colors"
              >
                {t("chat_download_file", { name: previewMedia.name })}
              </a>
            </div>
          </div>,
          document.body,
        )}

      {/* Ẩn input file */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        disabled={!canChat}
      />

      {/* ===== DANH SÁCH TIN NHẮN (đã gom nhóm) ===== */}
      <div
        ref={scrollContainerRef}
        className="flex-1 pt-3 overflow-y-auto pr-1.5 space-y-3 mb-3 custom-scrollbar"
      >
        {messages.length === 0 ? (
          <div className="h-full text-[13px] flex items-center justify-center text-slate-500 text-sm">
            {t("chat_empty_state")}
          </div>
        ) : (
          messageGroups.map((group) => {
            const isMe = group.senderIdentity === localParticipant?.identity;
            const { displayName: realtimeSenderName } = getParticipantDetails(
              group.senderIdentity,
              group.senderName,
            );

            return (
              <div
                key={group.messages[0].id}
                className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
              >
                {/* Tên + giờ chỉ hiện 1 lần đầu nhóm */}
                <div className="flex items-center gap-1.5 mb-1 px-0.5">
                  <span className="text-[11px] font-semibold text-slate-400">
                    {isMe ? t("you_text") : realtimeSenderName}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {new Date(group.messages[0].timestamp).toLocaleTimeString(
                      [],
                      { hour: "2-digit", minute: "2-digit" },
                    )}
                  </span>
                </div>

                {/* Các tin trong nhóm */}
                <div
                  className={`flex flex-col gap-1 w-full max-w-[92%] ${isMe ? "items-end" : "items-start"
                    }`}
                >
                  {group.messages.map((msg, idx) => {
                    const isFirst = idx === 0;
                    const isLast = idx === group.messages.length - 1;

                    // Bo góc theo vị trí trong nhóm
                    const bubbleRadius = isMe
                      ? `rounded-2xl ${isFirst ? "rounded-tr-md" : "rounded-tr-lg"} ${isLast ? "" : "rounded-br-lg"}`
                      : `rounded-2xl ${isFirst ? "rounded-tl-md" : "rounded-tl-lg"} ${isLast ? "" : "rounded-bl-lg"}`;

                    let realtimeReplySenderName = msg.replyToSender;
                    if (msg.replyToMsgId) {
                      const originalMsg = messages.find(
                        (m) => m.id === msg.replyToMsgId,
                      );
                      if (originalMsg) {
                        realtimeReplySenderName = getParticipantDetails(
                          originalMsg.senderIdentity,
                          msg.replyToSender,
                        ).displayName;
                      }
                    }

                    return (
                      <div
                        key={msg.id}
                        className={`group relative flex flex-col ${isMe ? "items-end" : "items-start"
                          }`}
                      >
                        {/* Menu hover */}
                        <div
                          className={`absolute -top-9 ${isMe ? "right-1" : "left-1"
                            } opacity-0 group-hover:opacity-100 transition-opacity bg-[#1c1c1c]/95 border border-[#333] backdrop-blur-md rounded-xl shadow-xl flex items-center p-0.5 z-20 gap-0.5`}
                        >
                          <button
                            onClick={() => setReplyingTo(msg)}
                            title={t("chat_reply_button_title")}
                            className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-[#333] rounded-lg transition-colors"
                          >
                            <Reply size={14} />
                          </button>
                          <div className="w-px h-3.5 bg-[#333] mx-0.5" />
                          {QUICK_EMOJIS.map((emj) => (
                            <button
                              key={emj}
                              onClick={() => handleReact(msg.id, emj)}
                              className="px-1 py-0.5 text-sm hover:scale-125 transition-transform"
                            >
                              {emj}
                            </button>
                          ))}
                        </div>

                        {/* Reply quote */}
                        {msg.replyToMsgId && (
                          <div
                            className={`text-[11px] px-2.5 py-1 mb-0.5 rounded-lg border-l-2 max-w-full line-clamp-2 ${isMe
                              ? "border-blue-400/60 bg-blue-900/25 text-blue-100/90"
                              : "border-slate-500 bg-[#222] text-slate-300"
                              }`}
                          >
                            <span className="font-semibold block text-[10px] opacity-80">
                              {realtimeReplySenderName}
                            </span>
                            <span className="opacity-90">
                              {msg.replyToContent}
                            </span>
                          </div>
                        )}

                        {/* Ảnh / Video */}
                        {msg.publicUrl &&
                          (msg.fileType?.startsWith("image/") ||
                            msg.fileType?.startsWith("video/")) && (
                            <div
                              className="cursor-pointer overflow-hidden rounded-xl relative group/media shadow-sm max-w-full border border-[#333]"
                              onClick={() =>
                                setPreviewMedia({
                                  url: msg.publicUrl!,
                                  type: msg.fileType!,
                                  name: msg.fileName!,
                                })
                              }
                            >
                              {msg.fileType?.startsWith("image/") ? (
                                <img
                                  src={msg.publicUrl}
                                  alt={msg.fileName}
                                  className="max-w-full max-h-44 object-contain transition-transform duration-300 group-hover/media:scale-[1.02]"
                                />
                              ) : (
                                <video
                                  src={msg.publicUrl}
                                  className="max-w-full max-h-44 object-cover"
                                />
                              )}
                              <div className="absolute inset-0 bg-black/0 group-hover/media:bg-black/25 transition-colors flex items-center justify-center">
                                <span className="opacity-0 group-hover/media:opacity-100 text-white bg-black/60 px-2.5 py-1 rounded-md text-[11px] font-medium backdrop-blur-sm">
                                  {t("chat_zoom")}
                                </span>
                              </div>
                            </div>
                          )}

                        {/* File khác */}
                        {msg.publicUrl &&
                          !msg.fileType?.startsWith("image/") &&
                          !msg.fileType?.startsWith("video/") && (
                            <a
                              href={msg.publicUrl}
                              download={msg.fileName}
                              className="flex items-center gap-2 px-3 py-2 rounded-xl transition-colors bg-[#222] border border-[#333] hover:bg-[#2a2a2a] shadow-sm max-w-full"
                            >
                              <FileText
                                size={16}
                                className={
                                  isMe ? "text-blue-400" : "text-sky-400"
                                }
                              />
                              <span className="truncate text-[13px] font-medium text-slate-200 underline underline-offset-2">
                                {msg.fileName}
                              </span>
                            </a>
                          )}

                        {/* Text bubble */}
                        {msg.content && (
                          <div
                            className={`px-3 py-1.5 text-[13px] leading-relaxed shadow-sm ${bubbleRadius} ${isMe
                              ? "bg-blue-600 text-white shadow-blue-600/20"
                              : "bg-[#222] border border-[#333] text-slate-100"
                              }`}
                          >
                            <p className="whitespace-pre-wrap wrap-break-words">
                              {msg.content}
                            </p>
                          </div>
                        )}

                        {/* Reactions */}
                        {msg.reactions &&
                          Object.values(msg.reactions).some(
                            (users) => users.length > 0,
                          ) && (
                            <div
                              className={`flex flex-wrap gap-1 my-1 mx-0.5 ${isMe ? "justify-end" : "justify-start"
                                }`}
                            >
                              {Object.entries(msg.reactions).map(
                                ([emoji, users]) => {
                                  if (users.length === 0) return null;
                                  const hasReacted = users.includes(
                                    localParticipant?.identity || "",
                                  );
                                  return (
                                    <button
                                      key={emoji}
                                      onClick={() => handleReact(msg.id, emoji)}
                                      className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full ring-1 transition-colors ${hasReacted
                                        ? "bg-blue-900/40 ring-blue-500/50 text-blue-300"
                                        : "bg-[#222] ring-[#333] text-slate-400 hover:bg-[#2a2a2a]"
                                        }`}
                                    >
                                      <span>{emoji}</span>
                                      <span className="font-medium">
                                        {users.length}
                                      </span>
                                    </button>
                                  );
                                },
                              )}
                              <button
                                onClick={() =>
                                  setReactionDetails(msg.reactions!)
                                }
                                title={t("chat_view_reactions_title")}
                                className="p-0.5 text-slate-500 hover:text-slate-300 hover:bg-[#333] rounded-full transition-colors"
                              >
                                <Info size={11} />
                              </button>
                            </div>
                          )}

                        {/* Private indicator */}
                        {msg.isPrivate && (
                          <div className="flex items-center gap-1 mt-0.5 text-[10px] text-amber-400/90">
                            <Lock size={9} />
                            <span>
                              {isMe
                                ? t("chat_private_to", {
                                  name: msg.targetIdentity
                                    ? (getParticipantDetails(
                                      msg.targetIdentity,
                                      msg.targetName,
                                    ).displayName ?? "")
                                    : (msg.targetName ?? ""),
                                })
                                : t("chat_private_to_you")}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ===== VÙNG NHẬP (đồng bộ màu với Breakout) ===== */}
      <div className="shrink-0 flex flex-col gap-1.5 relative">
        {/* Overlay khi chat bị khóa */}
        {!canChat && (
          <div className="absolute inset-0 z-10 bg-[#111113]/80 backdrop-blur-xs flex flex-col items-center justify-center rounded-lg pointer-events-none border border-[#232328]">
            <div className="bg-[#161619] text-slate-300 px-3.5 py-1.5 rounded-lg flex items-center gap-2 text-xs shadow-lg border border-[#232328]">
              <Lock size={13} className="text-rose-400" />
              {t("chat_locked")}
            </div>
          </div>
        )}

        {/* Banner đang trả lời */}
        {replyingTo && (
          <div className="bg-[#161619] border border-[#232328] px-3 py-2 rounded-lg text-xs text-slate-300 flex justify-between items-center shadow-sm">
            <div className="truncate pr-2">
              <span className="font-semibold text-blue-400 mr-1">
                {t("chat_replying_to", { name: replyingTo.senderName })}
              </span>
              {replyingTo.content ||
                (replyingTo.fileName
                  ? t("chat_reply_file", { name: replyingTo.fileName })
                  : t("chat_reply_media"))}
            </div>
            <button
              onClick={() => setReplyingTo(null)}
              className="p-1 rounded-lg hover:bg-[#232328] text-slate-400 hover:text-white transition-colors shrink-0 cursor-pointer"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Select đối tượng + Form nhập gộp gọn */}
        <div className="flex flex-col gap-1.5">
          {/* Custom Select đối tượng (Mở chiều ngược lên, phong cách tương tự Calendar view select) */}
          <div className="relative">
            <button
              type="button"
              disabled={!canChat}
              onClick={() => setIsTargetDropdownOpen(!isTargetDropdownOpen)}
              className="w-full flex items-center justify-between text-xs px-3 py-2 rounded-lg border border-[#232328] hover:border-[#333338] bg-[#161619] text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500/40 cursor-pointer transition-all disabled:opacity-50 select-none shadow-xs active:scale-[0.99]"
              aria-label="Chọn đối tượng nhận tin nhắn"
            >
              <div className="flex items-center gap-2 min-w-0 pr-2">
                {selectedTarget === "all" ? (
                  <Users className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                ) : (
                  <User className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                )}
                <span className="truncate font-medium text-slate-200">
                  {currentTargetLabel}
                </span>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${
                  isTargetDropdownOpen ? "rotate-180 text-blue-400" : ""
                }`}
              />
            </button>

            {isTargetDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-[60]"
                  onClick={() => setIsTargetDropdownOpen(false)}
                />
                <div className="absolute bottom-full mb-1.5 left-0 right-0 z-[70] bg-[#161619] rounded-xl border border-[#232328] shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-1.5 animate-in fade-in zoom-in-95 duration-150">
                  <div className="max-h-56 overflow-y-auto space-y-1 custom-scrollbar">
                    {/* Mục: Tất cả mọi người */}
                    <button
                      key="target-all"
                      type="button"
                      onClick={() => {
                        setSelectedTarget("all");
                        setIsTargetDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
                        selectedTarget === "all"
                          ? "bg-blue-600/15 text-blue-400 font-semibold border border-blue-500/25"
                          : "text-slate-300 hover:bg-[#232328] hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 mr-2">
                        <Users
                          className={`w-3.5 h-3.5 shrink-0 ${
                            selectedTarget === "all"
                              ? "text-blue-400"
                              : "text-slate-400"
                          }`}
                        />
                        <span className="truncate">{t("chat_target_all")}</span>
                      </div>
                      {selectedTarget === "all" && (
                        <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      )}
                    </button>

                    {/* Danh sách từng thành viên khác */}
                    {otherParticipants.map((p) => {
                      const isSelected = selectedTarget === p.identity;
                      return (
                        <button
                          key={p.identity}
                          type="button"
                          onClick={() => {
                            setSelectedTarget(p.identity);
                            setIsTargetDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
                            isSelected
                              ? "bg-blue-600/15 text-blue-400 font-semibold border border-blue-500/25"
                              : "text-slate-300 hover:bg-[#232328] hover:text-white"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 mr-2">
                            <User
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isSelected ? "text-blue-400" : "text-slate-400"
                              }`}
                            />
                            <span className="truncate">
                              {t("chat_target_specific", { name: p.name || "" })}
                            </span>
                          </div>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          <form
            onSubmit={handleSendMessage}
            className="relative flex items-center rounded-lg border border-[#232328] hover:border-[#333338] bg-[#161619] px-2 py-1.5 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/20 transition-all"
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!canChat}
              className="p-1.5 text-slate-400 hover:text-blue-400 disabled:opacity-40 transition-colors shrink-0 cursor-pointer"
            >
              <Paperclip size={16} />
            </button>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={!canChat}
              placeholder={
                canChat
                  ? t("chat_input_placeholder")
                  : t("chat_input_placeholder_locked")
              }
              className="flex-1 bg-transparent text-xs text-slate-200 px-2 py-1 focus:outline-none min-w-0 placeholder:text-slate-500"
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || !canChat}
              className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-30 disabled:bg-[#232328] ml-1 transition-all shrink-0 shadow-sm cursor-pointer"
            >
              <Send size={14} />
            </button>
          </form>
        </div>

        <p className="text-[10px] text-slate-500 text-center leading-tight">
          {t("chat_input_hint")}
        </p>
      </div>
    </div>
  );
}

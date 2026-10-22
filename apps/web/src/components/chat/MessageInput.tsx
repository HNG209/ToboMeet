"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Paperclip,
  Image,
  Smile,
  X,
  Loader2,
} from "lucide-react";
import { DirectMessageResponse, ChatAttachment } from "@/types/chat";
import { ReplyInputBanner } from "./ReplyPreview";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useGetChatUploadUrlMutation } from "@/lib/redux/api/directChatApi";
import { COMMON_EMOJIS } from "./ReactionBar";

interface MessageInputProps {
  conversationId: string;
  onSendMessage: (payload: {
    content?: string;
    type?: "text" | "file" | "video" | "image";
    attachments?: ChatAttachment[];
    replyToId?: string;
  }) => Promise<void>;
  replyTo: DirectMessageResponse | null;
  onCancelReply: () => void;
  onTyping: (isTyping: boolean) => void;
  onFocus?: () => void;
  disabled?: boolean;
}

export default function MessageInput({
  conversationId,
  onSendMessage,
  replyTo,
  onCancelReply,
  onTyping,
  onFocus,
  disabled,
}: MessageInputProps) {
  const t = useTranslations("direct_chat");
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);

  const [getUploadUrl] = useGetChatUploadUrlMutation();

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const nextHeight = Math.min(textareaRef.current.scrollHeight, 120);
      textareaRef.current.style.height = `${nextHeight}px`;
    }
  }, [content]);

  // Click outside to close Emoji Picker
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(e.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showEmojiPicker]);

  // Upload handler
  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isVideo = file.type.startsWith("video/");
        const isImage = file.type.startsWith("image/");
        const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;

        if (file.size > maxSize) {
          toast.error(
            isVideo ? t("file_too_large_video") : t("file_too_large_image"),
          );
          continue;
        }

        // 1. Get signed upload URL from server
        const res = await getUploadUrl({
          conversationId,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || "application/octet-stream",
        }).unwrap();

        // 2. Upload file to Supabase Storage via signed URL
        const uploadRes = await fetch(res.signedUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });

        if (!uploadRes.ok) {
          throw new Error("Upload to storage failed");
        }

        const newAttachment: ChatAttachment = {
          url: res.url,
          fileName: res.fileName,
          fileSize: res.fileSize,
          mimeType: res.mimeType,
          fileType: isImage ? "image" : isVideo ? "video" : "file",
        };

        setAttachments((prev) => [...prev, newAttachment]);
      }
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error(t("upload_failed"));
    } finally {
      setIsUploading(false);
      // Reset file inputs
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const handleSend = async () => {
    const trimmed = content.trim();
    if (!trimmed && attachments.length === 0) return;
    if (isUploading) return;

    let type: "text" | "file" | "video" | "image" = "text";
    if (attachments.length > 0 && !trimmed) {
      type = attachments[0].fileType;
    }

    const currentContent = trimmed;
    const currentAttachments = [...attachments];
    const currentReplyToId = replyTo?.id;

    // Reset giao diện NGAY LẬP TỨC (0ms) để người dùng có thể tiếp tục gõ tin khác ngay
    setContent("");
    setAttachments([]);
    onCancelReply();
    onTyping(false);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.focus();
    }

    try {
      await onSendMessage({
        content: currentContent,
        type,
        attachments: currentAttachments,
        replyToId: currentReplyToId,
      });
    } catch (err: any) {
      // Khôi phục lại nội dung nếu gửi thất bại
      setContent(currentContent);
      setAttachments(currentAttachments);
      const errMsg =
        err?.message ||
        err?.data?.message ||
        (typeof err === "string" ? err : "");
      console.warn("[MessageInput] Send error:", errMsg || err);
      toast.error(errMsg || t("send_failed"));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    onTyping(val.length > 0);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="bg-white border-t border-slate-200 shrink-0 relative">
      {/* Reply Banner */}
      <ReplyInputBanner replyTo={replyTo} onCancel={onCancelReply} />

      {/* Attachment Previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-slate-100 bg-slate-50/50">
          {attachments.map((att, idx) => (
            <div
              key={`${att.url}-${idx}`}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs shadow-xs"
            >
              <span className="truncate max-w-[150px] font-medium text-slate-700">
                {att.fileName}
              </span>
              <button
                onClick={() => removeAttachment(idx)}
                className="text-slate-400 hover:text-red-500 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Row */}
      <div className="flex items-end gap-1.5 px-3 py-2.5">
        {/* Hidden File Inputs */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => handleUploadFiles(e.target.files)}
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleUploadFiles(e.target.files)}
        />
        {/* Attachment Buttons */}
        <div className="flex items-center gap-0.5 pb-1">
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={isUploading || disabled}
            className="p-2 rounded-xl text-slate-500 hover:text-brand-600 hover:bg-slate-100 transition-colors"
            title={t("attach_image")}
          >
            <Image className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || disabled}
            className="p-2 rounded-xl text-slate-500 hover:text-brand-600 hover:bg-slate-100 transition-colors"
            title={t("attach_file")}
          >
            <Paperclip className="w-5 h-5" />
          </button>

          {/* Emoji Popover Button */}
          <div ref={emojiPickerRef} className="relative">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-2 rounded-xl text-slate-500 hover:text-amber-500 hover:bg-slate-100 transition-colors"
              title="Emoji"
            >
              <Smile className="w-5 h-5" />
            </button>
            {showEmojiPicker && (
              <div className="absolute bottom-full mb-2 left-0 z-30 p-2 bg-white rounded-2xl shadow-xl border border-slate-200 flex gap-1.5 animate-in fade-in zoom-in-95">
                {COMMON_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      setContent((prev) => prev + emoji);
                      setShowEmojiPicker(false);
                      textareaRef.current?.focus();
                    }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-transform hover:scale-125 text-base"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Text Area */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            rows={1}
            value={content}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onFocus={onFocus}
            disabled={disabled}
            placeholder={t("type_message")}
            className="w-full resize-none py-2 px-3.5 max-h-28 rounded-2xl bg-slate-100/80 border border-transparent focus:border-brand-400 focus:bg-white focus:outline-none text-sm text-slate-800 placeholder-slate-400 transition-all leading-relaxed"
          />
        </div>

        {/* Send Button */}
        <div className="pb-1">
          <button
            type="button"
            onClick={handleSend}
            disabled={
              (!content.trim() && attachments.length === 0) ||
              isUploading ||
              disabled
            }
            className={`p-2.5 rounded-2xl flex items-center justify-center transition-all ${
              (content.trim() || attachments.length > 0) && !isUploading && !disabled
                ? "bg-brand-500 hover:bg-brand-600 text-white shadow-md shadow-brand-500/20 active:scale-95"
                : "bg-slate-100 text-slate-300 cursor-not-allowed"
            }`}
            title={t("send")}
          >
            {isUploading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import {
  DirectConversationResponse,
  DirectMessageResponse,
  ChatAttachment,
} from "@/types/chat";
import { X, Image as ImageIcon, FileText, Download, User, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

async function downloadFile(url: string, fileName: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

interface ConversationDetailsDrawerProps {
  conversation: DirectConversationResponse;
  messages: DirectMessageResponse[];
  isOpen: boolean;
  onClose: () => void;
}

export default function ConversationDetailsDrawer({
  conversation,
  messages,
  isOpen,
  onClose,
}: ConversationDetailsDrawerProps) {
  const t = useTranslations("direct_chat");
  const [activeTab, setActiveTab] = useState<"media" | "files">("media");
  const [downloadingName, setDownloadingName] = useState<string | null>(null);

  const handleDownloadFile = async (
    e: React.MouseEvent,
    url: string,
    fileName: string,
  ) => {
    e.stopPropagation();
    if (downloadingName) return;
    setDownloadingName(fileName);
    try {
      await downloadFile(url, fileName);
    } catch (err) {
      console.error("[ConversationDetailsDrawer] Download error:", err);
      window.open(url, "_blank", "noreferrer");
    } finally {
      setDownloadingName(null);
    }
  };

  if (!isOpen) return null;

  const { recipient } = conversation;

  // Extract all media and files from messages
  const allAttachments: { attachment: ChatAttachment; createdAt: string }[] = [];
  messages.forEach((msg) => {
    if (msg.attachments && !msg.deletedAt) {
      msg.attachments.forEach((att) => {
        allAttachments.push({ attachment: att, createdAt: msg.createdAt });
      });
    }
  });

  const mediaList = allAttachments.filter((item) =>
    ["image", "video"].includes(item.attachment.fileType),
  );
  const fileList = allAttachments.filter(
    (item) => item.attachment.fileType === "file",
  );

  return (
    <div className="w-72 lg:w-80 h-full border-l border-slate-200/80 bg-white flex flex-col shrink-0 animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <h3 className="font-bold text-slate-800 text-sm">{t("details")}</h3>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          title={t("close_details")}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Recipient Profile */}
      <div className="p-6 flex flex-col items-center text-center border-b border-slate-100">
        <div className="w-20 h-20 rounded-full bg-slate-200 border-2 border-slate-300 overflow-hidden flex items-center justify-center text-2xl font-bold text-slate-600 shadow-sm mb-3">
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

        <h4 className="font-bold text-slate-800 text-base">
          {recipient?.displayName || "Người dùng"}
        </h4>
        <p className="text-xs text-slate-400 mt-0.5">{recipient?.email}</p>

        <div className="flex items-center gap-1.5 mt-2">
          <span
            className={`w-2 h-2 rounded-full ${
              recipient?.status === "ACTIVE" ? "bg-emerald-500" : "bg-slate-300"
            }`}
          />
          <span className="text-xs text-slate-500 font-medium">
            {recipient?.status === "ACTIVE" ? t("online") : t("offline")}
          </span>
        </div>
      </div>

      {/* Media & Files Tabs */}
      <div className="flex border-b border-slate-100">
        <button
          onClick={() => setActiveTab("media")}
          className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
            activeTab === "media"
              ? "border-brand-500 text-brand-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>{t("photos_shared")}</span>
        </button>

        <button
          onClick={() => setActiveTab("files")}
          className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
            activeTab === "files"
              ? "border-brand-500 text-brand-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>{t("files_shared")}</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === "media" ? (
          mediaList.length === 0 ? (
            <p className="text-center text-xs text-slate-400 py-8">
              {t("no_media_shared")}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {mediaList.map((item, idx) => (
                <a
                  key={idx}
                  href={item.attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  className="aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-100 relative group"
                >
                  {item.attachment.fileType === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.attachment.url}
                      alt={item.attachment.fileName}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <video
                      src={item.attachment.url}
                      className="w-full h-full object-cover"
                    />
                  )}
                </a>
              ))}
            </div>
          )
        ) : fileList.length === 0 ? (
          <p className="text-center text-xs text-slate-400 py-8">
            {t("no_files_shared")}
          </p>
        ) : (
          <div className="space-y-2">
            {fileList.map((item, idx) => {
              const isCurrentDownloading =
                downloadingName === item.attachment.fileName;
              return (
                <div
                  key={`${item.attachment.url}-${idx}`}
                  onClick={() =>
                    window.open(item.attachment.url, "_blank", "noreferrer")
                  }
                  className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs transition-colors cursor-pointer group"
                  title={item.attachment.fileName}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-blue-500 shrink-0 group-hover:scale-105 transition-transform" />
                    <span className="truncate font-medium text-slate-700 group-hover:text-brand-600 transition-colors">
                      {item.attachment.fileName}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) =>
                      handleDownloadFile(
                        e,
                        item.attachment.url,
                        item.attachment.fileName,
                      )
                    }
                    disabled={isCurrentDownloading}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-white transition-colors shrink-0 disabled:opacity-60 cursor-pointer"
                    title={t("download") || "Tải xuống"}
                  >
                    {isCurrentDownloading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-500" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

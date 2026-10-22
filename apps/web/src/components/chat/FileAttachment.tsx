"use client";

import React, { useState } from "react";
import {
  FileText,
  Download,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  File,
  X,
  Eye,
  Loader2,
  Maximize2,
} from "lucide-react";
import { ChatAttachment } from "@/types/chat";
import { useTranslations } from "next-intl";

interface FileAttachmentProps {
  attachment: ChatAttachment;
  isMe?: boolean;
}

function formatBytes(bytes: number, decimals = 1) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function getFileIcon(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
    return <FileArchive className="w-5 h-5 text-amber-500" />;
  }
  if (["js", "ts", "tsx", "jsx", "html", "css", "py", "json"].includes(ext)) {
    return <FileCode className="w-5 h-5 text-emerald-500" />;
  }
  if (["xls", "xlsx", "csv"].includes(ext)) {
    return <FileSpreadsheet className="w-5 h-5 text-emerald-600" />;
  }
  if (["pdf", "doc", "docx", "txt"].includes(ext)) {
    return <FileText className="w-5 h-5 text-blue-500" />;
  }
  return <File className="w-5 h-5 text-slate-500" />;
}

/**
 * Force-download a file by fetching it as a Blob first.
 * This bypasses the browser's CORS restriction that prevents
 * the `download` attribute from working on cross-origin URLs
 * (e.g. Supabase Storage).
 */
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

  // Revoke after a short delay to ensure the click is processed
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

export default function FileAttachment({
  attachment,
  isMe,
}: FileAttachmentProps) {
  const t = useTranslations("direct_chat");
  const [showLightbox, setShowLightbox] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      await downloadFile(attachment.url, attachment.fileName);
    } catch (err) {
      console.error("[FileAttachment] Download error:", err);
      // Fallback: open in new tab if fetch fails (e.g. network error)
      window.open(attachment.url, "_blank", "noreferrer");
    } finally {
      setIsDownloading(false);
    }
  };

  // 1. Image attachment
  if (attachment.fileType === "image") {
    return (
      <>
        <div className="relative group overflow-hidden rounded-xl border border-slate-200/80 bg-slate-100 max-w-sm mt-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={attachment.url}
            alt={attachment.fileName}
            className="w-full max-h-72 object-cover rounded-xl cursor-pointer transition-transform duration-200 group-hover:scale-[1.02]"
            onClick={() => setShowLightbox(true)}
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 pointer-events-none">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowLightbox(true);
              }}
              className="p-2 rounded-full bg-white/90 text-slate-700 hover:bg-white transition-colors pointer-events-auto shadow-md"
              title={t("view_image")}
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="p-2 rounded-full bg-white/90 text-slate-700 hover:bg-white transition-colors pointer-events-auto shadow-md disabled:opacity-60"
              title={t("download")}
            >
              {isDownloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Lightbox Modal — logic giữ nguyên */}
        {showLightbox && (
          <div
            className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setShowLightbox(false)}
          >
            <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
              <button
                onClick={() => setShowLightbox(false)}
                className="absolute -top-[35px] right-0 p-1.5 rounded-full bg-white/20 hover:bg-white/40 text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={attachment.url}
                alt={attachment.fileName}
                className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
              <div className="mt-3 flex items-center justify-between w-full text-white/90 text-xs px-1">
                <span className="truncate max-w-md font-medium text-white">{attachment.fileName}</span>
                <button
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium transition-colors disabled:opacity-60"
                >
                  {isDownloading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  {t("download")}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // 2. Video attachment
  if (attachment.fileType === "video") {
    return (
      <>
        <div className="relative group overflow-hidden rounded-xl border border-slate-200 bg-black max-w-sm mt-1">
          <div
            className="relative cursor-pointer"
            onClick={() => setShowLightbox(true)}
          >
            <video
              src={attachment.url}
              className="w-full max-h-72 object-contain rounded-t-xl"
              preload="metadata"
              controlsList="nodownload noplaybackrate"
              disablePictureInPicture
              onContextMenu={(e) => e.preventDefault()}
            />
            {/* Play / Expand overlay on hover */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowLightbox(true);
                }}
                className="p-3 rounded-full bg-white/90 text-slate-800 hover:bg-white transition-all shadow-lg hover:scale-105"
                title={t("view_fullscreen") || "Xem toàn màn hình"}
              >
                <Maximize2 className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Footer bar with file info and direct Download button */}
          <div className="bg-slate-900/95 px-3 py-2 flex items-center justify-between text-xs text-slate-300 border-t border-slate-800">
            <div className="flex flex-col min-w-0 pr-2">
              <span className="truncate max-w-[200px] font-medium text-white" title={attachment.fileName}>
                {attachment.fileName}
              </span>
              <span className="text-[11px] text-slate-400">
                {formatBytes(attachment.fileSize)}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowLightbox(true)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                title={t("view_fullscreen") || "Xem toàn màn hình"}
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleDownload}
                disabled={isDownloading}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-60"
                title={t("download")}
              >
                {isDownloading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Video Fullscreen Lightbox Modal */}
        {showLightbox && (
          <div
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setShowLightbox(false)}
          >
            <div
              className="relative w-full max-w-5xl max-h-[90vh] flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button
                onClick={() => setShowLightbox(false)}
                className="absolute -top-11 right-0 p-2 rounded-full bg-white/20 hover:bg-white/40 text-white transition-colors cursor-pointer"
                title={t("close") || "Đóng"}
              >
                <X className="w-5 h-5" />
              </button>

              {/* Video Player */}
              <div className="w-full flex justify-center bg-black rounded-xl overflow-hidden shadow-2xl">
                <video
                  src={attachment.url}
                  controls
                  autoPlay
                  className="max-h-[75vh] w-auto max-w-full rounded-xl object-contain"
                  controlsList="nodownload noplaybackrate"
                  disablePictureInPicture
                  onContextMenu={(e) => e.preventDefault()}
                />
              </div>

              {/* Modal Footer Bar */}
              <div className="mt-3 w-full flex items-center justify-between text-white/90 text-xs px-2">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-sm text-white truncate max-w-md">
                    {attachment.fileName}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold transition-colors disabled:opacity-60 cursor-pointer shadow-sm"
                  >
                    {isDownloading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>{t("download")}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  const [showPdfModal, setShowPdfModal] = useState(false);
  const isPdf =
    attachment.fileName?.toLowerCase().endsWith(".pdf") ||
    attachment.mimeType === "application/pdf";

  // 3. Document / other file attachment
  return (
    <>
      <div
        onClick={() => {
          if (isPdf) {
            setShowPdfModal(true);
          }
        }}
        className={`flex items-center gap-3 p-3 rounded-xl border transition-all mt-1 max-w-sm ${
          isPdf ? "cursor-pointer hover:border-red-400 hover:shadow-sm" : ""
        } ${
          isMe
            ? "bg-brand-600/10 border-brand-200 text-slate-800"
            : "bg-white border-slate-200 text-slate-800 shadow-sm"
        }`}
      >
        <div className={`p-2.5 rounded-lg shrink-0 ${isPdf ? "bg-red-50" : "bg-slate-100"}`}>
          {getFileIcon(attachment.fileName)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold truncate text-slate-800" title={attachment.fileName}>
              {attachment.fileName}
            </p>
            {isPdf && (
              <span className="px-1.5 py-0.2 rounded bg-red-100 text-red-600 font-bold text-[9px]">
                PDF
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {formatBytes(attachment.fileSize)}
            {isPdf && (
              <span className="ml-2 text-blue-600 font-medium hover:underline">
                {t("preview")}
              </span>
            )}
          </p>
        </div>

        {/* Nút Download riêng biệt */}
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="p-2 rounded-lg text-slate-500 hover:text-brand-600 hover:bg-brand-50 transition-colors shrink-0 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          title={t("download")}
        >
          {isDownloading ? (
            <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
          ) : (
            <Download className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* PDF Modal Viewer for Web */}
      {isPdf && showPdfModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setShowPdfModal(false)}
        >
          <div
            className="relative w-full max-w-4xl h-[88vh] bg-slate-900 rounded-2xl flex flex-col shadow-2xl overflow-hidden border border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 text-white">
              <div className="flex items-center gap-2 min-w-0 pr-3">
                <FileText className="w-5 h-5 text-red-500 shrink-0" />
                <span className="font-semibold text-sm truncate" title={attachment.fileName}>
                  {attachment.fileName}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors disabled:opacity-60 cursor-pointer shadow-sm"
                >
                  {isDownloading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>{t("download")}</span>
                </button>
                <button
                  onClick={() => setShowPdfModal(false)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title={t("close") || "Đóng"}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* PDF iframe renderer */}
            <div className="flex-1 w-full bg-slate-950 relative">
              <iframe
                src={attachment.url}
                className="w-full h-full border-0"
                title={attachment.fileName}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

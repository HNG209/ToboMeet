"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Room } from "livekit-client";
import { useLiveCaptions } from "@/hooks/useLiveCaptions";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

interface LiveCaptionOverlayProps {
  room: Room | undefined;
  enabled: boolean;
  onClose: () => void;
}

// Chia văn bản thành các dòng không vượt quá maxChars (ngắt theo từ)
function wrapTextToLines(text: string, maxChars = 52): string[] {
  const words = text.trim().split(/\s+/);
  if (!words.length || !words[0]) return [];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

interface FormattedLine {
  id: string;
  speakerId?: string;
  speakerName?: string;
  showSpeaker: boolean;
  text: string;
}

export default function LiveCaptionOverlay({
  room,
  enabled,
  onClose,
}: LiveCaptionOverlayProps) {
  const t = useTranslations("meeting.toolbar");
  const { captions } = useLiveCaptions(room, enabled);

  // Tự động ẩn phụ đề sau 5s nếu không có ai nói tiếp
  const [isVisible, setIsVisible] = useState(true);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Thông báo ban đầu khi vừa bật phụ đề (tự ẩn sau 3.5s)
  const [showNotice, setShowNotice] = useState(true);

  // Ngôn ngữ dịch phụ đề được chọn
  const [translateTargetLang, setTranslateTargetLang] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("tobomeet_translate_target_language") || "off";
    }
    return "off";
  });

  useEffect(() => {
    const handler = (e: any) => {
      setTranslateTargetLang(e.detail || "off");
    };
    window.addEventListener("tobomeet_translate_target_changed", handler);
    return () => window.removeEventListener("tobomeet_translate_target_changed", handler);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => setShowNotice(false), 3500);
    return () => clearTimeout(timer);
  }, [enabled]);

  // Lấy tối đa 3 câu gần nhất có nội dung (bao gồm cả interim và final)
  const recentCaptions = useMemo(() => {
    return captions.filter((c) => c.text.trim().length > 0).slice(-3);
  }, [captions]);

  const latestCaption = recentCaptions[recentCaptions.length - 1];

  useEffect(() => {
    if (latestCaption) {
      setIsVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        setIsVisible(false);
      }, 5000);
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [latestCaption?.id, latestCaption?.text, latestCaption?.translations]);

  const targetCode = (translateTargetLang || "off").split("-")[0].toLowerCase();
  const isTranslateActive = targetCode !== "off" && targetCode !== "none";

  // Xử lý các dòng hiển thị:
  // - Giới hạn ký tự mỗi hàng (~52 ký tự)
  // - Tối đa 2 hàng hiển thị, nếu quá dài thì trôi/reset các dòng cũ
  // - Nếu cùng 1 người nói thì không hiển thị lại tên ở hàng dưới
  const displayLines = useMemo(() => {
    if (recentCaptions.length === 0) return [];

    const allLines: {
      id: string;
      speakerId?: string;
      speakerName?: string;
      text: string;
    }[] = [];

    for (const caption of recentCaptions) {
      const lines = wrapTextToLines(caption.text, 52);
      lines.forEach((lineText, index) => {
        const lastLine = allLines[allLines.length - 1];
        const isDuplicate =
          lastLine &&
          lastLine.text.trim().toLowerCase() === lineText.trim().toLowerCase() &&
          ((lastLine.speakerId && caption.speakerId && lastLine.speakerId === caption.speakerId) ||
            (lastLine.speakerName && caption.speakerName && lastLine.speakerName === caption.speakerName));

        if (!isDuplicate) {
          allLines.push({
            id: `${caption.id}_${index}`,
            speakerId: caption.speakerId,
            speakerName: caption.speakerName,
            text: lineText,
          });
        }
      });
    }

    // Chỉ lấy tối đa 2 dòng mới nhất ("nếu quá dài thì reset lại")
    const recentLines = allLines.slice(-2);
    if (recentLines.length === 0) return [];

    const result: FormattedLine[] = [];
    for (let i = 0; i < recentLines.length; i++) {
      const line = recentLines[i];
      let showSpeaker = false;

      if (i === 0) {
        // Hàng đầu tiên: hiển thị tên người nói nếu có
        showSpeaker = !!line.speakerName;
      } else {
        // Hàng thứ hai: kiểm tra xem có cùng người nói với hàng 1 không
        const prevLine = recentLines[i - 1];
        const isSameSpeaker =
          Boolean(
            (line.speakerId && prevLine.speakerId && line.speakerId === prevLine.speakerId) ||
            (line.speakerName && prevLine.speakerName && line.speakerName === prevLine.speakerName)
          );

        // Chỉ hiện tên ở hàng 2 nếu là NGƯỜI KHÁC NÓI
        if (!isSameSpeaker && line.speakerName) {
          showSpeaker = true;
        }
      }

      result.push({
        id: line.id,
        speakerId: line.speakerId,
        speakerName: line.speakerName,
        showSpeaker,
        text: line.text,
      });
    }

    return result;
  }, [recentCaptions]);

  if (!enabled) return null;

  // Chưa có câu nói nào: hiện thông báo đang lắng nghe trong 3.5s đầu
  if (recentCaptions.length === 0) {
    if (!showNotice) return null;
    return (
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-auto transition-opacity duration-300 animate-fade-in select-none">
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/30 backdrop-blur-sm border border-white/15 text-xs text-slate-200 shadow-lg shadow-black/30">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>
            {t("live_caption")} • {t("live_caption_desc")}
          </span>
        </div>
      </div>
    );
  }

  // Khung phụ đề thiết kế lại: nền trong suốt, thấy rõ nội dung phía sau, chữ sắc nét
  return (
    <div
      className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-40 w-fit max-w-[92%] sm:max-w-xl md:max-w-2xl pointer-events-auto transition-all duration-300 select-none group ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
        }`}
    >
      <div className="relative bg-black/25 sm:bg-black/30 backdrop-blur-[2px] border border-white/15 rounded-xl px-4 py-2 sm:px-5 sm:py-2.5 shadow-xl shadow-black/40 text-left">
        {/* Nút đóng phụ đề tối giản */}
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-2 -right-2 p-1 rounded-full bg-black/70 hover:bg-black text-slate-400 hover:text-white border border-white/20 transition-all opacity-0 group-hover:opacity-100 cursor-pointer shadow-md"
          title={t("cancel")}
        >
          <X size={12} />
        </button>

        {/* Chỉ báo ngôn ngữ dịch nếu đang bật dịch */}
        {isTranslateActive && (
          <div className="flex items-center gap-1.5 mb-1 text-[10px] text-emerald-400 font-medium select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>
              {t("translated_tag")} ({targetCode.toUpperCase()})
            </span>
          </div>
        )}

        {/* Nội dung: Khi bật dịch -> hiện 2 dòng cho bản dịch và bản phụ đề; Khi tắt -> tối đa 2 dòng câu nói gốc */}
        {isTranslateActive ? (
          <div className="flex flex-col gap-1.5 justify-center">
            {recentCaptions.slice(-1).map((caption) => {
              const translatedText =
                caption.translations?.[targetCode] ||
                caption.translations?.[translateTargetLang];

              return (
                <div key={caption.id} className="flex flex-col gap-1 max-w-full">
                  {/* Dòng 1: Bản phụ đề gốc */}
                  <p className="text-xs sm:text-sm font-medium text-white leading-relaxed tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] max-w-full">
                    {caption.speakerName && (
                      <span className="text-emerald-400 font-semibold mr-1.5 text-[11px] sm:text-xs select-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]">
                        {caption.speakerName}:
                      </span>
                    )}
                    <span className="select-text">{caption.text}</span>
                  </p>

                  {/* Dòng 2: Bản dịch */}
                  {translatedText ? (
                    <p className="text-[11px] sm:text-xs font-semibold text-emerald-300 leading-snug pl-2 border-l-2 border-emerald-400 select-text drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] max-w-full">
                      <span className="text-[9px] uppercase font-bold text-emerald-400/90 mr-1.5 select-none bg-emerald-950/70 px-1 py-0.5 rounded border border-emerald-500/30">
                        {targetCode.toUpperCase()}
                      </span>
                      <span>{translatedText}</span>
                    </p>
                  ) : (
                    !caption.isFinal && (
                      <p className="text-[10px] text-slate-400/70 italic pl-2 border-l-2 border-slate-600 select-none animate-pulse">
                        Đang nói... (sẽ dịch sau khi nói xong)
                      </p>
                    )
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 justify-center">
            {displayLines.map((line) => (
              <p
                key={line.id}
                className="text-xs sm:text-sm font-medium text-white leading-relaxed tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] truncate max-w-full"
              >
                {line.showSpeaker && line.speakerName && (
                  <span className="text-emerald-400 font-semibold mr-1.5 text-[11px] sm:text-xs select-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]">
                    {line.speakerName}:
                  </span>
                )}
                <span className="select-text">{line.text}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

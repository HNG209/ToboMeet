"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useRoomContext } from "@livekit/components-react";
import { useLiveCaptions } from "@/hooks/useLiveCaptions";
import {
  Captions,
  Globe,
  Languages,
  Trash2,
  ChevronDown,
  ArrowDown,
  Power,
  Search,
  Check,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface MeetingCaptionsProps {
  meetingCode: string;
  isLiveCaptionEnabled: boolean;
  onToggleLiveCaption: () => void;
}

const DEEPGRAM_LANGUAGES = [
  { code: "vi", label: "Tiếng Việt", native: "Vietnamese" },
  { code: "en", label: "Tiếng Anh", native: "English" },
  { code: "en-US", label: "English (US)", native: "United States" },
  { code: "en-GB", label: "English (UK)", native: "United Kingdom" },
  { code: "zh", label: "Tiếng Trung (Phổ thông)", native: "中文" },
  { code: "zh-CN", label: "Tiếng Trung (Giản thể)", native: "简体中文" },
  { code: "zh-TW", label: "Tiếng Trung (Phồn thể)", native: "繁體中文" },
  { code: "ja", label: "Tiếng Nhật", native: "日本語" },
  { code: "ko", label: "Tiếng Hàn", native: "한국어" },
  { code: "fr", label: "Tiếng Pháp", native: "Français" },
  { code: "de", label: "Tiếng Đức", native: "Deutsch" },
  { code: "es", label: "Tiếng Tây Ban Nha", native: "Español" },
  { code: "pt", label: "Tiếng Bồ Đào Nha", native: "Português" },
  { code: "ru", label: "Tiếng Nga", native: "Русский" },
  { code: "it", label: "Tiếng Ý", native: "Italiano" },
  { code: "id", label: "Tiếng Indonesia", native: "Bahasa Indonesia" },
  { code: "th", label: "Tiếng Thái", native: "ไทย" },
  { code: "hi", label: "Tiếng Hindi", native: "हिन्दी" },
  { code: "tr", label: "Tiếng Thổ Nhĩ Kỳ", native: "Türkçe" },
  { code: "nl", label: "Tiếng Hà Lan", native: "Nederlands" },
  { code: "pl", label: "Tiếng Ba Lan", native: "Polski" },
  { code: "sv", label: "Tiếng Thụy Điển", native: "Svenska" },
  { code: "da", label: "Tiếng Đan Mạch", native: "Dansk" },
  { code: "no", label: "Tiếng Na Uy", native: "Norsk" },
  { code: "uk", label: "Tiếng Ukraina", native: "Українська" },
  { code: "ta", label: "Tiếng Tamil", native: "தமிழ்" },
  { code: "cs", label: "Tiếng Séc", native: "Čeština" },
  { code: "el", label: "Tiếng Hy Lạp", native: "Ελληνικά" },
  { code: "fi", label: "Tiếng Phần Lan", native: "Suomi" },
  { code: "hu", label: "Tiếng Hungary", native: "Magyar" },
  { code: "ms", label: "Tiếng Mã Lai", native: "Bahasa Melayu" },
  { code: "ro", label: "Tiếng Romania", native: "Română" },
  { code: "sk", label: "Tiếng Slovakia", native: "Slovenčina" },
  { code: "bg", label: "Tiếng Bulgaria", native: "Български" },
  { code: "hr", label: "Tiếng Croatia", native: "Hrvatski" },
  { code: "ar", label: "Tiếng Ả Rập", native: "العربية" },
  { code: "multi", label: "Đa ngôn ngữ", native: "Multilingual" },
];

const TRANSLATE_LANG_OPTIONS = [
  { code: "off", label: "Tắt dịch", native: "Off", badge: "OFF" },
  { code: "vi", label: "Tiếng Việt", native: "Vietnamese", badge: "VI" },
  { code: "en", label: "Tiếng Anh", native: "English", badge: "EN" },
  { code: "zh", label: "Tiếng Trung", native: "Chinese", badge: "ZH" },
  { code: "ja", label: "Tiếng Nhật", native: "Japanese", badge: "JA" },
  { code: "ko", label: "Tiếng Hàn", native: "Korean", badge: "KO" },
  { code: "fr", label: "Tiếng Pháp", native: "French", badge: "FR" },
  { code: "de", label: "Tiếng Đức", native: "German", badge: "DE" },
  { code: "es", label: "Tiếng Tây Ban Nha", native: "Spanish", badge: "ES" },
  { code: "pt", label: "Tiếng Bồ Đào Nha", native: "Portuguese", badge: "PT" },
  { code: "ru", label: "Tiếng Nga", native: "Russian", badge: "RU" },
  { code: "it", label: "Tiếng Ý", native: "Italian", badge: "IT" },
  { code: "id", label: "Tiếng Indonesia", native: "Indonesian", badge: "ID" },
  { code: "nl", label: "Tiếng Hà Lan", native: "Dutch", badge: "NL" },
  { code: "pl", label: "Tiếng Ba Lan", native: "Polish", badge: "PL" },
  { code: "sv", label: "Tiếng Thụy Điển", native: "Swedish", badge: "SV" },
  { code: "tr", label: "Tiếng Thổ Nhĩ Kỳ", native: "Turkish", badge: "TR" },
  { code: "uk", label: "Tiếng Ukraina", native: "Ukrainian", badge: "UK" },
  { code: "ar", label: "Tiếng Ả Rập", native: "Arabic", badge: "AR" },
];

function getLangBadge(code: string): string {
  const c = (code || "").split("-")[0].toLowerCase();
  const found = TRANSLATE_LANG_OPTIONS.find((l) => l.code === c);
  return found?.badge || c.toUpperCase();
}

function getLangLabel(code: string): string {
  const c = (code || "").split("-")[0].toLowerCase();
  const found = TRANSLATE_LANG_OPTIONS.find((l) => l.code === c);
  return found ? `${found.label} (${found.native})` : code;
}

function getTranscribeShortLabel(code: string): string {
  const found = DEEPGRAM_LANGUAGES.find((l) => l.code === code);
  return found?.label || code;
}

interface DisplayCaptionItem {
  id: string;
  text: string;
  isFinal: boolean;
  timestamp: number;
  appliedTargetLang: string;
  appliedTranslation?: string;
}

interface CaptionGroup {
  speakerId: string;
  speakerName: string;
  isMe: boolean;
  avatarUrl: string;
  initial: string;
  timeStr: string;
  items: DisplayCaptionItem[];
}

export default function MeetingCaptions({
  meetingCode,
  isLiveCaptionEnabled,
  onToggleLiveCaption,
}: MeetingCaptionsProps) {
  const t = useTranslations("meeting");
  const room = useRoomContext();
  const localParticipant = room?.localParticipant;

  const { captions, clearCaptions } = useLiveCaptions(room, isLiveCaptionEnabled);

  // 1. Ngôn ngữ phiên âm (Nói)
  const [transcribeLanguage, setTranscribeLanguage] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("tobomeet_transcribe_language") || "vi";
    }
    return "vi";
  });
  const [isTranscribeDropdownOpen, setIsTranscribeDropdownOpen] = useState(false);
  const [searchTranscribeLang, setSearchTranscribeLang] = useState("");
  const transcribeDropdownRef = useRef<HTMLDivElement>(null);

  // 2. Ngôn ngữ dịch đích (Dịch)
  const [translateTargetLang, setTranslateTargetLang] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("tobomeet_translate_target_language") || "off";
    }
    return "off";
  });
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const [searchLang, setSearchLang] = useState("");
  const translateDropdownRef = useRef<HTMLDivElement>(null);

  // Lắng nghe sự kiện thay đổi ngôn ngữ dịch từ các nguồn khác
  useEffect(() => {
    const handler = (e: any) => {
      setTranslateTargetLang(e.detail || "off");
    };
    window.addEventListener("tobomeet_translate_target_changed", handler);
    return () => window.removeEventListener("tobomeet_translate_target_changed", handler);
  }, []);

  // Lắng nghe sự kiện thay đổi ngôn ngữ phiên âm
  useEffect(() => {
    const handler = (e: any) => {
      setTranscribeLanguage(e.detail || "vi");
    };
    window.addEventListener("tobomeet_transcribe_language_changed", handler);
    return () => window.removeEventListener("tobomeet_transcribe_language_changed", handler);
  }, []);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        translateDropdownRef.current &&
        !translateDropdownRef.current.contains(event.target as Node)
      ) {
        setIsLangDropdownOpen(false);
        setSearchLang("");
      }
      if (
        transcribeDropdownRef.current &&
        !transcribeDropdownRef.current.contains(event.target as Node)
      ) {
        setIsTranscribeDropdownOpen(false);
        setSearchTranscribeLang("");
      }
    };
    if (isLangDropdownOpen || isTranscribeDropdownOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isLangDropdownOpen, isTranscribeDropdownOpen]);

  // Đổi ngôn ngữ phiên âm
  const handleSelectTranscribeLang = (code: string) => {
    setTranscribeLanguage(code);
    setIsTranscribeDropdownOpen(false);
    setSearchTranscribeLang("");

    if (typeof window !== "undefined") {
      localStorage.setItem("tobomeet_transcribe_language", code);
      window.dispatchEvent(
        new CustomEvent("tobomeet_transcribe_language_changed", { detail: code }),
      );
    }

    if (room?.localParticipant) {
      room.localParticipant.setAttributes({ transcribe_language: code }).catch(() => {});
      try {
        const payload = JSON.stringify({
          type: "SET_LANGUAGE",
          language: code,
        });
        room.localParticipant.publishData(new TextEncoder().encode(payload), {
          reliable: true,
          topic: "lk.transcription.config",
        }).catch(() => {});
      } catch {}
    }
  };

  // Đổi ngôn ngữ dịch
  const handleSelectTranslateLang = (code: string) => {
    setTranslateTargetLang(code);
    setIsLangDropdownOpen(false);
    setSearchLang("");

    if (typeof window !== "undefined") {
      localStorage.setItem("tobomeet_translate_target_language", code);
      window.dispatchEvent(
        new CustomEvent("tobomeet_translate_target_changed", { detail: code }),
      );
    }

    if (room?.localParticipant) {
      room.localParticipant.setAttributes({ translate_target_language: code }).catch(() => {});
      try {
        const payload = JSON.stringify({
          type: "SET_TRANSLATE_TARGET",
          language: code,
        });
        room.localParticipant.publishData(new TextEncoder().encode(payload), {
          reliable: true,
          topic: "lk.transcription.config",
        }).catch(() => {});
      } catch {}
    }
  };

  // Snapshot ngôn ngữ dịch tại thời điểm nhận bản dịch (ko thay đổi khi người dùng đổi ngôn ngữ sau này)
  const snapshotRef = useRef<
    Record<string, { appliedTargetLang: string; appliedTranslation?: string }>
  >({});

  // Cập nhật snapshot cho từng caption
  const processedItems: DisplayCaptionItem[] = useMemo(() => {
    const currentTarget = (translateTargetLang || "off").split("-")[0].toLowerCase();
    const isTranslateOn = currentTarget !== "off" && currentTarget !== "none";

    return captions.map((caption) => {
      let snap = snapshotRef.current[caption.id];

      if (!snap) {
        // Lần đầu ghi nhận: lưu snapshot ngôn ngữ dịch hiện tại
        if (isTranslateOn) {
          snap = {
            appliedTargetLang: currentTarget,
            appliedTranslation: caption.translations?.[currentTarget],
          };
        } else {
          snap = {
            appliedTargetLang: "off",
          };
        }
        snapshotRef.current[caption.id] = snap;
      } else {
        // Nếu đã có snapshot nhưng lúc trước chưa kịp có translation (đang chờ DeepL trả về)
        if (
          snap.appliedTargetLang !== "off" &&
          !snap.appliedTranslation &&
          caption.translations?.[snap.appliedTargetLang]
        ) {
          snap.appliedTranslation = caption.translations[snap.appliedTargetLang];
        }
      }

      return {
        id: caption.id,
        text: caption.text,
        isFinal: caption.isFinal,
        timestamp: caption.timestamp,
        appliedTargetLang: snap.appliedTargetLang,
        appliedTranslation: snap.appliedTranslation,
      };
    });
  }, [captions, translateTargetLang]);

  // Gộp các tin nhắn liên tiếp của cùng 1 người nói
  const messageGroups = useMemo(() => {
    const groups: CaptionGroup[] = [];

    for (const item of processedItems) {
      if (!item.text.trim()) continue;

      const rawSpeakerId = (captions.find((c) => c.id === item.id)?.speakerId) || "";
      const rawSpeakerName = (captions.find((c) => c.id === item.id)?.speakerName) || "";
      const isMe = Boolean(localParticipant && rawSpeakerId === localParticipant.identity);

      const p = isMe
        ? localParticipant
        : rawSpeakerId
          ? room?.getParticipantByIdentity(rawSpeakerId)
          : undefined;

      let avatarUrl = "";
      let name = p?.name || rawSpeakerName || (isMe ? "Bạn" : "Người tham gia");
      if (p?.metadata) {
        try {
          const meta = JSON.parse(p.metadata);
          avatarUrl = meta.avatar || meta.avatarUrl || meta.picture || "";
        } catch {}
      }
      const initial = (name || "?").charAt(0).toUpperCase();
      const timeStr = new Date(item.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      const lastGroup = groups[groups.length - 1];
      // Nếu cùng 1 người nói liên tiếp -> gộp vào nhóm
      if (lastGroup && (lastGroup.speakerId === rawSpeakerId || (!rawSpeakerId && lastGroup.speakerName === name))) {
        lastGroup.items.push(item);
      } else {
        groups.push({
          speakerId: rawSpeakerId,
          speakerName: isMe ? "Bạn" : name,
          isMe,
          avatarUrl,
          initial,
          timeStr,
          items: [item],
        });
      }
    }

    return groups;
  }, [processedItems, captions, localParticipant, room]);

  // Cuộn tự động
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      setShowScrollBottom(false);
    }
  };

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 80;
    setShowScrollBottom(!isNearBottom);
  };

  useEffect(() => {
    if (!showScrollBottom) {
      scrollToBottom();
    }
  }, [messageGroups, showScrollBottom]);

  const filteredTranscribeOptions = useMemo(() => {
    if (!searchTranscribeLang.trim()) return DEEPGRAM_LANGUAGES;
    const q = searchTranscribeLang.toLowerCase();
    return DEEPGRAM_LANGUAGES.filter(
      (l) => l.label.toLowerCase().includes(q) || l.native.toLowerCase().includes(q) || l.code.toLowerCase().includes(q),
    );
  }, [searchTranscribeLang]);

  const filteredTranslateOptions = useMemo(() => {
    if (!searchLang.trim()) return TRANSLATE_LANG_OPTIONS;
    const q = searchLang.toLowerCase();
    return TRANSLATE_LANG_OPTIONS.filter(
      (l) => l.label.toLowerCase().includes(q) || l.native.toLowerCase().includes(q) || l.code.includes(q),
    );
  }, [searchLang]);

  return (
    <div className="flex flex-col h-full bg-transparent relative min-h-0">
      {/* ===== HEADER ĐIỀU KHIỂN PHIÊN ÂM & DỊCH THUẬT (GỌN GÀNG, BỎ TRẠNG THÁI) ===== */}
      <div className="flex items-center justify-between gap-1.5 pb-2.5 mb-2 border-b border-[#232328] shrink-0 text-xs select-none">
        {/* Cụm 2 Dropdown chọn Ngôn ngữ nói & Ngôn ngữ dịch đặt cạnh nhau */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {/* DROPDOWN 1: NGÔN NGỮ PHIÊN ÂM (NÓI) */}
          <div className="relative shrink-0" ref={transcribeDropdownRef}>
            <button
              type="button"
              onClick={() => {
                setIsTranscribeDropdownOpen((prev) => !prev);
                setIsLangDropdownOpen(false);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded bg-[#18181b] hover:bg-[#232328] border border-[#27272a] text-slate-300 hover:text-white transition-colors cursor-pointer text-[11px]"
              title="Ngôn ngữ phiên âm (Nói)"
            >
              <Languages size={13} className="text-slate-400 shrink-0" />
              <span className="truncate max-w-[80px]">
                {getTranscribeShortLabel(transcribeLanguage)}
              </span>
              <ChevronDown size={11} className="text-slate-500 shrink-0" />
            </button>

            {isTranscribeDropdownOpen && (
              <div className="absolute left-0 top-full mt-1 w-56 max-h-64 flex flex-col bg-[#161619] border border-[#232328] rounded-lg shadow-xl overflow-hidden z-50">
                <div className="p-2 border-b border-[#232328] bg-[#161619] sticky top-0 z-10">
                  <div className="relative flex items-center">
                    <Search size={12} className="absolute left-2 text-slate-500" />
                    <input
                      type="text"
                      value={searchTranscribeLang}
                      onChange={(e) => setSearchTranscribeLang(e.target.value)}
                      placeholder="Tìm ngôn ngữ nói..."
                      className="w-full bg-[#232328] text-xs text-slate-200 placeholder-slate-500 rounded pl-6 pr-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                    />
                  </div>
                </div>
                <div className="overflow-y-auto flex-1 py-1 custom-scrollbar">
                  {filteredTranscribeOptions.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => handleSelectTranscribeLang(lang.code)}
                      className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-[#232328] flex items-center justify-between transition-colors cursor-pointer"
                    >
                      <div className="flex flex-col">
                        <span
                          className={
                            transcribeLanguage === lang.code
                              ? "text-emerald-400 font-medium"
                              : "text-slate-200"
                          }
                        >
                          {lang.label}
                        </span>
                        <span className="text-[10px] text-slate-500">{lang.native}</span>
                      </div>
                      {transcribeLanguage === lang.code && (
                        <Check size={13} className="text-emerald-400 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* DROPDOWN 2: NGÔN NGỮ DỊCH (PHIÊN DỊCH) */}
          <div className="relative shrink-0" ref={translateDropdownRef}>
            <button
              type="button"
              onClick={() => {
                setIsLangDropdownOpen((prev) => !prev);
                setIsTranscribeDropdownOpen(false);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded bg-[#18181b] hover:bg-[#232328] border border-[#27272a] text-slate-300 hover:text-white transition-colors cursor-pointer text-[11px]"
              title="Ngôn ngữ dịch phụ đề"
            >
              <Globe size={13} className="text-slate-400 shrink-0" />
              <span className="truncate max-w-[80px]">
                {translateTargetLang === "off"
                  ? "Tắt dịch"
                  : getLangBadge(translateTargetLang)}
              </span>
              <ChevronDown size={11} className="text-slate-500 shrink-0" />
            </button>

            {isLangDropdownOpen && (
              <div className="absolute left-0 top-full mt-1 w-56 max-h-64 flex flex-col bg-[#161619] border border-[#232328] rounded-lg shadow-xl overflow-hidden z-50">
                <div className="p-2 border-b border-[#232328] bg-[#161619] sticky top-0 z-10">
                  <div className="relative flex items-center">
                    <Search size={12} className="absolute left-2 text-slate-500" />
                    <input
                      type="text"
                      value={searchLang}
                      onChange={(e) => setSearchLang(e.target.value)}
                      placeholder="Tìm ngôn ngữ dịch..."
                      className="w-full bg-[#232328] text-xs text-slate-200 placeholder-slate-500 rounded pl-6 pr-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                    />
                  </div>
                </div>
                <div className="overflow-y-auto flex-1 py-1 custom-scrollbar">
                  {filteredTranslateOptions.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => handleSelectTranslateLang(lang.code)}
                      className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-[#232328] flex items-center justify-between transition-colors cursor-pointer"
                    >
                      <span
                        className={
                          translateTargetLang === lang.code
                            ? "text-emerald-400 font-medium"
                            : "text-slate-300"
                        }
                      >
                        {lang.label} ({lang.native})
                      </span>
                      <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-slate-800 text-slate-400">
                        {lang.badge}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Nút xoá lịch sử phụ đề */}
        {captions.length > 0 && (
          <button
            type="button"
            onClick={() => {
              clearCaptions();
              snapshotRef.current = {};
            }}
            className="p-1 rounded hover:bg-[#232328] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer shrink-0"
            title="Xoá lịch sử phụ đề"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* ===== DANH SÁCH BONG BÓNG PHỤ ĐỀ & BẢN DỊCH ===== */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col min-h-0"
      >
        {/* Khi phụ đề chưa bật */}
        {!isLiveCaptionEnabled && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-400 select-none">
            <div className="w-10 h-10 rounded-full bg-[#18181b] border border-[#27272a] flex items-center justify-center text-slate-500 mb-3">
              <Power size={18} />
            </div>
            <h4 className="text-xs font-semibold text-slate-200 mb-1">
              Phụ đề đang tắt
            </h4>
            <p className="text-[11px] text-slate-400 max-w-[220px] mb-3 leading-relaxed">
              Bật tính năng này để theo dõi phụ đề và bản dịch của các thành viên theo thời gian thực.
            </p>
            <button
              type="button"
              onClick={onToggleLiveCaption}
              className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors cursor-pointer"
            >
              Bật phụ đề
            </button>
          </div>
        )}

        {/* Khi đã bật nhưng chưa có ai nói */}
        {isLiveCaptionEnabled && messageGroups.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-400 select-none">
            <div className="w-10 h-10 rounded-full bg-[#18181b] border border-[#27272a] flex items-center justify-center text-slate-400 mb-3">
              <Captions size={18} />
            </div>
            <h4 className="text-xs font-semibold text-slate-200 mb-1">
              Chưa có phụ đề
            </h4>
            <p className="text-[11px] text-slate-400 max-w-[220px] leading-relaxed">
              Hệ thống đang lắng nghe âm thanh. Khi các thành viên phát biểu, phụ đề và bản dịch sẽ hiển thị ở đây.
            </p>
          </div>
        )}

        {/* Danh sách các nhóm bong bóng */}
        {isLiveCaptionEnabled &&
          messageGroups.map((group, groupIdx) => {
            const { isMe, speakerName, avatarUrl, initial, timeStr, items } = group;

            return (
              <div
                key={`${group.speakerId}_${groupIdx}`}
                className={`flex gap-2.5 mb-3.5 w-full ${
                  isMe ? "flex-row-reverse" : "flex-row"
                }`}
              >
                {/* Avatar người nói: chỉ hiển thị 1 lần cho cả nhóm */}
                <div className="shrink-0 pt-0.5">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={speakerName}
                      className="w-7 h-7 rounded-full object-cover bg-slate-800 ring-1 ring-[#333]"
                    />
                  ) : (
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                        isMe
                          ? "bg-blue-600/25 text-blue-300 ring-1 ring-blue-500/30"
                          : "bg-slate-800 text-slate-300 ring-1 ring-[#333]"
                      }`}
                    >
                      {initial}
                    </div>
                  )}
                </div>

                {/* Cụm bong bóng phụ đề */}
                <div
                  className={`flex flex-col max-w-[82%] min-w-0 ${
                    isMe ? "items-end" : "items-start"
                  }`}
                >
                  {/* Tên & thời điểm phát biểu */}
                  <div
                    className={`flex items-center gap-1.5 mb-1 px-1 text-[11px] text-slate-400 ${
                      isMe ? "flex-row-reverse" : "flex-row"
                    }`}
                  >
                    <span className="font-semibold truncate max-w-[140px]">
                      {speakerName}
                    </span>
                    <span className="text-[10px] text-slate-500">{timeStr}</span>
                  </div>

                  {/* Các câu nói trong nhóm */}
                  <div
                    className={`flex flex-col gap-1.5 w-full ${
                      isMe ? "items-end" : "items-start"
                    }`}
                  >
                    {items.map((item, itemIdx) => {
                      const isTranslateActive =
                        item.appliedTargetLang &&
                        item.appliedTargetLang !== "off" &&
                        item.appliedTargetLang !== "none";

                      const translatedText = item.appliedTranslation;
                      const langBadge = getLangBadge(item.appliedTargetLang);
                      const langLabel = getLangLabel(item.appliedTargetLang);

                      return (
                        <div
                          key={item.id}
                          className={`px-3 py-2 text-xs rounded-xl text-left border ${
                            isMe
                              ? `bg-[#182333] border-blue-500/20 text-slate-100 ${
                                  itemIdx === 0 ? "rounded-tr-xs" : ""
                                }`
                              : `bg-[#18181b] border-[#27272a] text-slate-100 ${
                                  itemIdx === 0 ? "rounded-tl-xs" : ""
                                }`
                          } ${!item.isFinal ? "opacity-75 italic" : ""}`}
                        >
                          {/* Câu phát biểu gốc */}
                          <div className="leading-relaxed break-words">
                            {item.text}
                          </div>

                          {/* Dòng bản dịch bên dưới chân (chỉ hiện khi có target translation) */}
                          {isTranslateActive && (
                            <div className="mt-1.5 pt-1.5 border-t border-white/10 flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5 text-[9px] font-mono text-emerald-400">
                                <span className="px-1 py-0.2 rounded bg-emerald-500/15 border border-emerald-500/20 font-semibold">
                                  {langBadge}
                                </span>
                                <span className="text-slate-400 font-sans truncate">
                                  {langLabel}
                                </span>
                              </div>
                              <div className="text-emerald-300 leading-relaxed break-words font-sans text-xs">
                                {translatedText || (
                                  <span className="text-slate-500 italic text-[11px]">
                                    {item.isFinal
                                      ? "Đang dịch..."
                                      : "Chờ kết thúc câu..."}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {/* ===== NÚT CUỘN XUỐNG DƯỚI NẾU ĐANG XEM TIN CŨ ===== */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-2 right-2 p-1.5 rounded-full bg-[#232328] hover:bg-[#2b2b32] text-slate-300 hover:text-white border border-[#333] shadow-md transition-colors cursor-pointer z-10"
          title="Cuộn xuống mới nhất"
        >
          <ArrowDown size={14} />
        </button>
      )}
    </div>
  );
}

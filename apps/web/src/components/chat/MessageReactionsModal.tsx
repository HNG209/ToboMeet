"use client";

import { useEffect, useState } from "react";
import { useGetMessageReactionsQuery } from "@/lib/redux/api/directChatApi";
import { X, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import UserAvatar from "@/components/common/UserAvatar";

interface MessageReactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  messageId: string;
  initialTab?: string;
}

export default function MessageReactionsModal({
  isOpen,
  onClose,
  messageId,
  initialTab = "all",
}: MessageReactionsModalProps) {
  const t = useTranslations("direct_chat");
  const { data: reactions = [], isLoading } = useGetMessageReactionsQuery(messageId, {
    skip: !isOpen || !messageId,
  });

  const [activeTab, setActiveTab] = useState<string>("all");

  // Đồng bộ initialTab khi mở modal
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab || "all");
    }
  }, [isOpen, initialTab]);

  // Đóng bằng phím ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Tính số lượng cho các tab
  const totalCount = reactions.length;
  const emojiCounts: Record<string, number> = {};
  reactions.forEach((r) => {
    emojiCounts[r.reaction] = (emojiCounts[r.reaction] || 0) + 1;
  });

  // Lọc danh sách theo tab được chọn
  const filteredReactions =
    activeTab === "all"
      ? reactions
      : reactions.filter((r) => r.reaction === activeTab);

  // Danh sách các emoji duy nhất có trong reactions để làm tab filter
  const activeEmojis = Object.keys(emojiCounts);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col max-h-[500px] overflow-hidden animate-scale-up z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">
            {t("reactions_modal_title")} ({totalCount})
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
            <span className="text-xs">{t("loading_reactions")}</span>
          </div>
        ) : (
          <>
            {/* Tabs Filter */}
            <div className="flex items-center gap-1.5 px-5 py-2.5 bg-slate-50 border-b border-slate-100 overflow-x-auto scrollbar-none">
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === "all"
                    ? "bg-brand-600 text-white shadow-xs shadow-brand-500/20"
                    : "bg-white hover:bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                {t("reactions_tab_all")} ({totalCount})
              </button>

              {activeEmojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setActiveTab(emoji)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    activeTab === emoji
                      ? "bg-brand-600 text-white shadow-xs shadow-brand-500/20"
                      : "bg-white hover:bg-slate-100 text-slate-600 border border-slate-200"
                  }`}
                >
                  <span>{emoji}</span>
                  <span className="opacity-90">({emojiCounts[emoji]})</span>
                </button>
              ))}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {filteredReactions.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  {t("no_reactions_found")}
                </div>
              ) : (
                filteredReactions.map((item, idx) => (
                  <div
                    key={`${item.userId}-${idx}`}
                    className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    {/* User Info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <UserAvatar
                        avatarUrl={item.user?.avatarUrl}
                        displayName={item.user?.displayName}
                        size="w-9 h-9"
                      />

                      <div className="text-left min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {item.user?.displayName || t("user_fallback")}
                        </p>
                      </div>
                    </div>

                    {/* Reaction Icon */}
                    <div className="text-xl shrink-0 select-none ml-2">
                      {item.reaction}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

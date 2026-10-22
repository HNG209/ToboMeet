"use client";

import { useEffect, useState } from "react";
import { useGetPostReactionsQuery } from "@/lib/redux/api/newsFeedApi";
import { X, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import UserAvatar from "@/components/common/UserAvatar";

interface ReactionsListModalProps {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
}

export default function ReactionsListModal({ isOpen, onClose, postId }: ReactionsListModalProps) {
  const t = useTranslations();
  const { data: reactions = [], isLoading } = useGetPostReactionsQuery(postId, {
    skip: !isOpen || !postId,
  });

  const [activeTab, setActiveTab] = useState<string>("all");

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

  const getRoleLabel = (role: string) => {
    if (role === "owner") return "Chủ phòng";
    if (role === "admin") return "Quản trị";
    return "Thành viên";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col max-h-[500px] overflow-hidden animate-scale-up z-10 mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">
            Người đã bày tỏ cảm xúc ({totalCount})
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
            <span className="text-xs">Đang tải danh sách...</span>
          </div>
        ) : (
          <>
            {/* Tabs Filter */}
            <div className="flex items-center gap-1.5 px-5 py-2.5 bg-slate-50 border-b border-slate-100 overflow-x-auto scrollbar-none">
              <button
                onClick={() => setActiveTab("all")}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeTab === "all"
                    ? "bg-brand-600 text-white shadow-sm shadow-brand-500/20"
                    : "bg-white hover:bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                Tất cả ({totalCount})
              </button>

              {activeEmojis.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => setActiveTab(emoji)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    activeTab === emoji
                      ? "bg-brand-600 text-white shadow-sm shadow-brand-500/20"
                      : "bg-white hover:bg-slate-100 text-slate-600 border border-slate-200"
                  }`}
                >
                  <span>{emoji}</span>
                  <span className="opacity-90">({emojiCounts[emoji]})</span>
                </button>
              ))}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {filteredReactions.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  Không tìm thấy cảm xúc nào.
                </div>
              ) : (
                filteredReactions.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    {/* User Info */}
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        avatarUrl={item.user?.avatarUrl}
                        displayName={item.user?.displayName}
                        size="w-9 h-9"
                      />

                      <div className="text-left">
                        <p className="text-sm font-semibold text-slate-800">
                          {item.user?.displayName}
                        </p>
                        <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded mt-0.5 uppercase tracking-wider ${
                          item.user?.role === "owner"
                            ? "text-amber-700 bg-amber-50"
                            : item.user?.role === "admin"
                            ? "text-blue-700 bg-blue-50"
                            : "text-slate-600 bg-slate-100"
                        }`}>
                          {getRoleLabel(item.user?.role)}
                        </span>
                      </div>
                    </div>

                    {/* Reaction Icon */}
                    <div className="text-xl shrink-0 select-none">
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

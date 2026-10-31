"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { RoomResponse } from "@tobomeet/shared/types";
import { useDispatch } from "react-redux";
import { AppDispatch } from "@/lib/redux/store";
import { roomsApi } from "@/lib/redux/api/roomsApi";
import { Users, Hash, Layers, Copy, Check } from "lucide-react";

// Gradient presets nâng cấp tương tự Microsoft Teams / Slack
const CARD_GRADIENTS = [
  "from-violet-600 via-purple-600 to-indigo-700",
  "from-blue-600 via-indigo-600 to-cyan-700",
  "from-teal-500 via-emerald-600 to-teal-800",
  "from-rose-500 via-pink-600 to-red-700",
  "from-amber-500 via-orange-600 to-red-600",
  "from-cyan-500 via-blue-600 to-indigo-700",
  "from-fuchsia-500 via-purple-600 to-pink-700",
  "from-emerald-500 via-teal-600 to-cyan-700",
];

function getGradient(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CARD_GRADIENTS[Math.abs(hash) % CARD_GRADIENTS.length];
}

interface RoomCardProps {
  room: RoomResponse;
}

export default function RoomCard({ room }: RoomCardProps) {
  const t = useTranslations("dashboard");
  const gradient = getGradient(room._id);

  const [copied, setCopied] = useState(false);
  const dispatch = useDispatch<AppDispatch>();

  const handleWarmCache = () => {
    dispatch(roomsApi.util.upsertQueryData("getRoomById", room._id, room));
  };

  const handleCopyCode = (e: React.MouseEvent) => {
    e.stopPropagation(); // Ngăn không cho click lan ra ngoài thẻ card
    e.preventDefault();
    if (!room.code) return;

    navigator.clipboard.writeText(room.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Trả lại trạng thái ban đầu sau 2 giây
    });
  };

  return (
    <Link
      id={`room-card-${room._id}`}
      href={`/room/${room._id}`}
      prefetch={true}
      onMouseEnter={handleWarmCache}
      onClick={handleWarmCache}
      className="group relative text-left w-full bg-white rounded-2xl overflow-hidden border border-slate-200/80
                 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 hover:border-slate-300
                 hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col justify-between block"
    >
      {/* Header Banner — Teams & Slack style */}
      <div
        className={`h-28 bg-gradient-to-br ${gradient} relative overflow-hidden p-4 flex flex-col justify-between`}
      >
        {/* Background decorative elements */}
        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-white/10 blur-xl group-hover:scale-125 transition-transform duration-500" />
        <div className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full bg-black/10 blur-md" />

        {room.code && (
          <div
            className="self-end relative z-10"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
          >
            <button
              type="button"
              onClick={handleCopyCode}
              title="Sao chép mã phòng"
              className="group/code inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/20 hover:bg-black/40 backdrop-blur-md text-[11px] font-mono text-white/90 border border-white/10 hover:border-white/30 font-semibold tracking-wider shadow-sm transition-all"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <>
                  <Hash className="w-3.5 h-3.5 text-white/70 group-hover/code:hidden" />
                  <Copy className="w-3.5 h-3.5 text-white/90 hidden group-hover/code:block" />
                </>
              )}

              {/* Hiển thị **** và 3 số cuối ở trạng thái bình thường */}
              <span className="mt-px block group-hover/code:hidden transition-all duration-200">
                ****{room.code.slice(-3)}
              </span>

              {/* Hiển thị full mã phòng khi hover */}
              <span className="mt-px hidden group-hover/code:block transition-all duration-200">
                {room.code}
              </span>
            </button>
          </div>
        )}

        {/* Avatar đại diện tên phòng */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white font-extrabold text-lg shadow-inner group-hover:scale-105 transition-transform duration-300">
            {room.name.charAt(0).toUpperCase()}
          </div>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4 flex-1 flex flex-col justify-between bg-white">
        <div>
          {/* Tên phòng */}
          <h3 className="text-base font-bold text-slate-800 truncate mb-1 group-hover:text-brand-600 transition-colors">
            {room.name}
          </h3>
        </div>

        {/* Footer info & CTA */}
        <div className="mt-1 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-3">
            {/* Số lượng thành viên */}
            <span
              className="flex items-center gap-1.5 font-medium text-slate-600"
              title="Thành viên"
            >
              <Users className="w-3.5 h-3.5 text-slate-400" />
              {room.members?.length || 0}
            </span>

            {/* Số lượng kênh (Channel) nếu có */}
            {room.channels && room.channels.length > 0 && (
              <span
                className="flex items-center gap-1.5 font-medium text-slate-600"
                title="Kênh"
              >
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                {room.channels.length}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

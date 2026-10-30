"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useGetMyRoomsQuery } from "@/lib/redux/api/roomsApi";
import { RoomResponse } from "@tobomeet/shared/types";
import { Plus, Loader2, FolderOpen, Search, X, Users } from "lucide-react";
import RoomCard from "./RoomCard";
import { useHomeContext } from "@/app/[locale]/(home)/layout";

interface DashboardContentProps {
  initialRooms?: RoomResponse[];
}

export default function DashboardContent({
  initialRooms = [],
}: DashboardContentProps) {
  const t = useTranslations("dashboard");
  const { data: rooms = initialRooms, isLoading } = useGetMyRoomsQuery();

  const { setShowJoinDialog, setShowCreateDialog } = useHomeContext();

  const [searchQuery, setSearchQuery] = useState("");
  const [showMenu, setShowMenu] = useState(false);

  const filteredRooms = rooms?.filter(
    (room) =>
      room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (room.code &&
        room.code.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  return (
    <div className="flex flex-col h-full w-full bg-[#fcfcfc] overflow-hidden">
      {/* ── Main Scrollable Content ── */}
      <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
        <div className="max-w-7xl mx-auto w-full">
          {/* ── Content Subheader Toolbar (Tương tự Microsoft Teams) ── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/70 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0 shadow-xs">
                <Users className="w-5 h-5 text-brand-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                    {t("title", { defaultValue: "Teams" })}
                  </h1>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {t("subtitle", { defaultValue: "Quản lý và tham gia các nhóm học tập & cuộc họp của bạn" })}
                </p>
              </div>
            </div>

            {/* Cụm nút Tạo & Tham gia phòng đưa xuống dưới content chính như Teams */}
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                onClick={() => setShowJoinDialog(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-xs active:scale-[0.98] transition-all"
              >
                <Users className="w-4 h-4 text-slate-500" />
                <span>{t("join_team", { defaultValue: "Tham gia bằng mã" })}</span>
              </button>

              <button
                onClick={() => setShowCreateDialog(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold shadow-sm shadow-brand-500/20 active:scale-[0.98] transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>{t("create_team", { defaultValue: "Tạo nhóm mới" })}</span>
              </button>
            </div>
          </div>
          <div className="w-full">
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-32 gap-4">
                <Loader2 className="w-10 h-10 text-brand-500 animate-spin" />
                <p className="text-slate-500 text-sm font-medium">
                  {t("loading_rooms")}
                </p>
              </div>
            )}

            {!isLoading && (!rooms || rooms.length === 0) && (
              <div className="flex flex-col items-center justify-center py-32 gap-6">
                <div className="w-20 h-20 rounded-3xl bg-white border border-slate-100 shadow-sm flex items-center justify-center">
                  <FolderOpen className="w-10 h-10 text-slate-300" />
                </div>
                <div className="text-center">
                  <h2 className="text-xl font-bold text-slate-800 mb-2">
                    {t("empty_title")}
                  </h2>
                  <p className="text-slate-500 max-w-md">
                    {t("empty_description")}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowJoinDialog(true)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-xs active:scale-[0.98] transition-all"
                  >
                    <Users className="w-4 h-4 text-slate-500" />
                    <span>{t("join_team", { defaultValue: "Tham gia bằng mã" })}</span>
                  </button>
                  <button
                    onClick={() => setShowCreateDialog(true)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-500 text-white text-xs font-bold
                         hover:bg-brand-600 transition-all shadow-md shadow-brand-500/20 active:scale-[0.98]"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{t("create_team", { defaultValue: "Tạo nhóm mới" })}</span>
                  </button>
                </div>
              </div>
            )}

            {!isLoading && filteredRooms && filteredRooms.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 md:gap-6">
                {filteredRooms.map((room) => (
                  <RoomCard key={room._id} room={room} />
                ))}
              </div>
            )}

            {!isLoading &&
              rooms &&
              rooms.length > 0 &&
              filteredRooms &&
              filteredRooms.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                  <div className="w-16 h-16 rounded-full bg-white shadow-sm border border-slate-100 flex items-center justify-center text-slate-400">
                    <Search className="w-6 h-6" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-base font-bold text-slate-800">
                      {t("no_results_title")}
                    </h3>
                    <p className="text-[13px] text-slate-400 mt-1">
                      {t("no_results_desc")}
                    </p>
                  </div>
                </div>
              )}
          </div>
        </div>
      </main>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useGetSessionsQuery } from "@/lib/redux/api/usersApi";
import { X, Globe, Check, Monitor, Video, Radio } from "lucide-react";
import { DeviceSettings } from "./DeviceSettings";
import { RecordingSettings } from "./RecordingSettings";
import { PersonalMeetingSettings } from "./PersonalMeetingSettings";
import { useIsElectron } from "@/hooks/useIsElectron";

interface SettingsDialogProps {
  onClose: () => void;
}

type Tab = "language" | "devices" | "recording" | "personal_meeting";

export default function SettingsDialog({ onClose }: SettingsDialogProps) {
  const t = useTranslations("settings");
  const currentLocale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>("language");

  const isElectron = useIsElectron();

  // Lấy dữ liệu sessions để hiển thị badge số lượng thiết bị ở Sidebar
  const { data: sessions } = useGetSessionsQuery();
  const otherSessionsCount = sessions?.otherDevices?.length ?? 0;
  const totalSessionsCount = sessions ? 1 + otherSessionsCount : 0;

  // Xử lý sự kiện nhấn phím ESC để đóng
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleLanguageChange = (newLocale: "vi" | "en") => {
    if (newLocale === currentLocale) return;
    router.replace(pathname, { locale: newLocale });
  };

  const [isPersonalMeetingHistory, setIsPersonalMeetingHistory] =
    useState(false);

  // Khi chuyển tab, reset trạng thái history
  useEffect(() => {
    if (activeTab !== "personal_meeting") {
      setIsPersonalMeetingHistory(false);
    }
  }, [activeTab]);

  const maxWidthClass =
    activeTab === "personal_meeting" && isPersonalMeetingHistory
      ? "max-w-5xl"
      : activeTab === "devices" ||
          activeTab === "recording" ||
          activeTab === "personal_meeting"
        ? "max-w-3xl"
        : "max-w-2xl";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        className={`relative bg-white border border-slate-200/60 rounded-3xl shadow-[0_32px_64px_rgba(15,23,42,0.18)] w-full ${maxWidthClass} h-[85vh] max-h-[700px] overflow-hidden flex flex-col md:flex-row animate-scale-in transition-all duration-300`}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-slate-100/80 hover:bg-slate-200/80 border border-slate-200/30 flex items-center justify-center transition-all duration-200 hover:rotate-90 active:scale-90"
        >
          <X className="w-4 h-4 text-slate-600" />
        </button>

        {/* Left Sidebar */}
        <aside className="w-full md:w-56 bg-slate-50/70 border-b md:border-b-0 md:border-r border-slate-100 p-4 flex flex-col gap-6 flex-shrink-0 select-none">
          <div className="px-2 pt-2">
            <h2 className="text-xl font-black text-slate-800 tracking-tight">
              {t("title")}
            </h2>
          </div>

          <nav className="flex flex-row md:flex-col gap-1.5">
            <button
              onClick={() => setActiveTab("language")}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-250 w-full text-left
                ${activeTab === "language" ? "bg-linear-to-r from-brand-500 to-indigo-600 text-white shadow-lg shadow-brand-500/25 scale-[1.02]" : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900"}`}
            >
              <Globe className="w-4 h-4" />
              <span>{t("tabs.language")}</span>
            </button>

            <button
              onClick={() => setActiveTab("devices")}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-250 w-full text-left
                ${activeTab === "devices" ? "bg-linear-to-r from-brand-500 to-indigo-600 text-white shadow-lg shadow-brand-500/25 scale-[1.02]" : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900"}`}
            >
              <Monitor className="w-4 h-4" />
              <span>{t("tabs.devices")}</span>
              {totalSessionsCount > 0 && (
                <span
                  className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === "devices" ? "bg-white/20 text-white" : "bg-brand-100 text-brand-600"}`}
                >
                  {totalSessionsCount}
                </span>
              )}
            </button>

            {/* TAB GHI HINH CHI HIEN THI KHI O DESKTOP APP */}
            {isElectron && (
              <button
                onClick={() => setActiveTab("recording")}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-250 w-full text-left
                  ${activeTab === "recording" ? "bg-linear-to-r from-brand-500 to-indigo-600 text-white shadow-lg shadow-brand-500/25 scale-[1.02]" : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900"}`}
              >
                <Video className="w-4 h-4" />
                <span>{t("tabs.recording")}</span>
              </button>
            )}

            {/* TAB CUOC HOP CA NHAN */}
            <button
              onClick={() => setActiveTab("personal_meeting")}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-250 w-full text-left
                ${activeTab === "personal_meeting" ? "bg-linear-to-r from-brand-500 to-indigo-600 text-white shadow-lg shadow-brand-500/25 scale-[1.02]" : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900"}`}
            >
              <Video className="w-4 h-4" />
              <span>{t("tabs.personal_meeting", { defaultValue: "Cuộc họp cá nhân" })}</span>
            </button>
          </nav>
        </aside>

        {/* Right Content Area */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {/* ── Tab Language ─────────────────────────────────────────────── */}
          {activeTab === "language" && (
            <div className="flex-1 p-8 overflow-y-auto flex flex-col gap-6 animate-fade-in">
              <div>
                <h3 className="text-lg font-bold text-slate-800 tracking-tight">
                  {t("language.header")}
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {t("language.desc")}
                </p>
              </div>

              <div className="flex flex-col gap-3 mt-1">
                <button
                  onClick={() => handleLanguageChange("vi")}
                  className={`group relative flex items-center justify-between px-5 py-4 rounded-2xl border text-sm font-semibold transition-all duration-300 text-left w-full overflow-hidden active:scale-[0.99]
                    ${
                      currentLocale === "vi"
                        ? "border-brand-500 bg-brand-50/15 text-brand-600 shadow-md shadow-brand-500/5"
                        : "border-slate-200/80 text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm"
                    }`}
                >
                  {currentLocale === "vi" && (
                    <div className="absolute inset-0 bg-linear-to-r from-brand-500/5 to-indigo-500/5 pointer-events-none" />
                  )}
                  <div className="flex items-center gap-4 z-10">
                    <div className="w-8 h-6 rounded-md overflow-hidden shadow-sm border border-slate-100 flex-shrink-0 group-hover:scale-110 transition-transform duration-200">
                      <svg
                        viewBox="0 0 30 20"
                        className="w-full h-full object-cover"
                      >
                        <rect width="30" height="20" fill="#da251d" />
                        <polygon
                          points="15,4 16.17,7.62 20,7.62 16.9,9.88 18.08,13.5 15,11.25 11.92,13.5 13.1,9.88 10,7.62 13.83,7.62"
                          fill="#ffff00"
                        />
                      </svg>
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-800 group-hover:text-brand-600 transition-colors">
                        {t("language.vietnamese")}
                      </span>
                      <span className="text-[11px] text-slate-400 font-normal mt-0.5">
                        Vietnamese
                      </span>
                    </div>
                  </div>
                  <div className="z-10">
                    {currentLocale === "vi" ? (
                      <div className="w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center text-white shadow-sm shadow-brand-500/30">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full border border-slate-200 group-hover:border-slate-400 transition-colors" />
                    )}
                  </div>
                </button>

                <button
                  onClick={() => handleLanguageChange("en")}
                  className={`group relative flex items-center justify-between px-5 py-4 rounded-2xl border text-sm font-semibold transition-all duration-300 text-left w-full overflow-hidden active:scale-[0.99]
                    ${
                      currentLocale === "en"
                        ? "border-brand-500 bg-brand-50/15 text-brand-600 shadow-md shadow-brand-500/5"
                        : "border-slate-200/80 text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm"
                    }`}
                >
                  {currentLocale === "en" && (
                    <div className="absolute inset-0 bg-linear-to-r from-brand-500/5 to-indigo-500/5 pointer-events-none" />
                  )}
                  <div className="flex items-center gap-4 z-10">
                    <div className="w-8 h-6 rounded-md overflow-hidden shadow-sm border border-slate-100 flex-shrink-0 group-hover:scale-110 transition-transform duration-200">
                      <svg
                        viewBox="0 0 52 39"
                        className="w-full h-full object-cover"
                      >
                        <rect width="52" height="39" fill="#ffffff" />
                        <path
                          d="M0,1.5 h52 M0,7.5 h52 M0,13.5 h52 M0,19.5 h52 M0,25.5 h52 M0,31.5 h52 M0,37.5 h52"
                          stroke="#b22234"
                          strokeWidth="3"
                        />
                        <rect width="22" height="21" fill="#3c3b6e" />
                        <path
                          d="
                          M2.5,3 h0.1 M7,3 h0.1 M11.5,3 h0.1 M16,3 h0.1 M20.5,3 h0.1
                          M4.5,6.5 h0.1 M9,6.5 h0.1 M13.5,6.5 h0.1 M18,6.5 h0.1
                          M2.5,10 h0.1 M7,10 h0.1 M11.5,10 h0.1 M16,10 h0.1 M20.5,10 h0.1
                          M4.5,13.5 h0.1 M9,13.5 h0.1 M13.5,13.5 h0.1 M18,13.5 h0.1
                          M2.5,17 h0.1 M7,17 h0.1 M11.5,17 h0.1 M16,17 h0.1 M20.5,17 h0.1
                        "
                          stroke="#ffffff"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-800 group-hover:text-brand-600 transition-colors">
                        {t("language.english")}
                      </span>
                      <span className="text-[11px] text-slate-400 font-normal mt-0.5">
                        Tiếng Anh (Mỹ)
                      </span>
                    </div>
                  </div>
                  <div className="z-10">
                    {currentLocale === "en" ? (
                      <div className="w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center text-white shadow-sm shadow-brand-500/30">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full border border-slate-200 group-hover:border-slate-400 transition-colors" />
                    )}
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* ── Tab Devices ───────────────────────────────────────────────── */}
          {activeTab === "devices" && (
            <DeviceSettings t={t} currentLocale={currentLocale} />
          )}

          {/* Tab Ghi hinh */}
          {activeTab === "recording" && <RecordingSettings />}

          {/* Tab Cuộc họp cá nhân */}
          {activeTab === "personal_meeting" && (
            <PersonalMeetingSettings
              onClose={onClose}
              isViewingHistory={isPersonalMeetingHistory}
              onToggleHistory={setIsPersonalMeetingHistory}
            />
          )}
        </main>
      </div>
    </div>
  );
}

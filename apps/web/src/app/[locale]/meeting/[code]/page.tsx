// src/app/[locale]/meeting/[code]/page.tsx
"use client";

import {
  LiveKitRoom,
  RoomAudioRenderer,
  useRoomContext,
} from "@livekit/components-react";
import "@livekit/components-styles";
import MeetingRoomContent from "@/components/meeting/MeetingRoomContent";
import { Loader2, Smartphone, Clock, Users, LogOut } from "lucide-react";
import MeetingLobby from "@/components/meeting/MeetingLobby";
import { useEffect, useState } from "react";
import { RoomEvent } from "livekit-client";
import { toast } from "sonner";
import { useParticipantManager } from "@/hooks/useParticipantManager";
import { useTranslations } from "next-intl";
import {
  MeetingSessionProvider,
  useMeetingSessionContext,
} from "@/components/meeting/contexts/MeetingSessionContext";
import { useBreakoutSync } from "@/hooks/useBreakoutSync";
import { MeetingWhiteboardProvider } from "@/components/meeting/contexts/MeetingWhiteboardContext";

function MeetingPageContent() {
  const t = useTranslations("meeting.meeting_page");
  const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  const {
    isAuthenticated,
    meetingCode,
    status,
    meetingData,
    isDisconnecting,
    isJoining,
    camOn,
    micOn,
    displayName,
    hardwareConfig,

    setCamOn,
    setMicOn,
    setDisplayName,
    handleDisconnect,
  } = useMeetingSessionContext();

  // GỘP CHUNG CÁC TRẠNG THÁI LOADING THÀNH 1 BIẾN
  const isLoadingState =
    isAuthenticated === null ||
    status === "RECONNECTING" ||
    status === "SWITCHING_BREAKOUT" ||
    status === "RETURNING_TO_MAIN";

  if (isLoadingState) {
    let loadingDesc = "";

    // Gán nội dung tương ứng theo trạng thái
    if (isAuthenticated === null) {
      loadingDesc = t("loading_wait");
    } else if (status === "RECONNECTING") {
      loadingDesc = t("loading_reconnecting");
    } else if (status === "SWITCHING_BREAKOUT") {
      loadingDesc = t("loading_joining_breakout");
    } else if (status === "RETURNING_TO_MAIN") {
      loadingDesc = t("loading_returning_main");
    }

    return (
      <div className="flex flex-col h-screen items-center justify-center bg-[#111] text-white space-y-6">
        <style>{`
          @keyframes slideUpFade {
            0% { opacity: 0; transform: translateY(15px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          .animate-slide-up-fade {
            animation: slideUpFade 0.4s ease-out forwards;
          }
        `}</style>

        <div className="h-20 flex flex-col items-center justify-start overflow-hidden">
          <div
            key={loadingDesc}
            className="flex flex-col items-center animate-slide-up-fade"
          >
            <p className="text-gray-400 text-sm mt-2 flex items-center gap-2">
              <Loader2 className="animate-spin text-blue-500" size={16} />
              {loadingDesc}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Chưa đăng nhập
  if (isAuthenticated === false) {
    return <UnauthenticatedView meetingCode={meetingCode} />;
  }

  // Rời phòng
  if (isDisconnecting) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-[#111] text-white space-y-6 transition-opacity duration-500">
        <p className="text-gray-400 text-sm flex items-center gap-2">
          <Loader2 className="animate-spin text-gray-500" size={16} />
          {t("cleaning_up")}
        </p>
      </div>
    );
  }

  // Sảnh chờ (chuẩn bị mic/cam nếu tham gia bằng link, đợi chủ phòng duyệt)
  if (status === "IN_LOBBY") {
    return (
      <MeetingLobby
        meetingCode={meetingCode}
        displayName={displayName}
        setDisplayName={setDisplayName}
        camOn={camOn}
        setCamOn={setCamOn}
        micOn={micOn}
        setMicOn={setMicOn}
        isJoining={isJoining}
      />
    );
  }

  if (!meetingData || !LIVEKIT_URL) return null;

  return (
    <LiveKitRoom
      video={camOn}
      audio={micOn}
      token={meetingData.token}
      serverUrl={LIVEKIT_URL}
      connect={true}
      connectOptions={{
        autoSubscribe: false, // chỉ subscribe những track dùng để hiển thị
      }}
      options={{
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: {
          deviceId: hardwareConfig.parsedCameraConfig?.deviceId,
          resolution: {
            width: hardwareConfig.parsedCameraConfig?.width ?? 1280,
            height: hardwareConfig.parsedCameraConfig?.height ?? 720,
            frameRate: 30,
          },
        },
        ...(hardwareConfig.micId && {
          audioCaptureDefaults: {
            deviceId: hardwareConfig.micId,
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: false,
          },
        }),
        ...(hardwareConfig.speakerId && {
          audioOutput: { deviceId: hardwareConfig.speakerId },
        }),
      }}
      onDisconnected={handleDisconnect}
    >
      <RoomAudioRenderer volume={1.0} />
      <RoomContentGuard meetingData={meetingData} meetingCode={meetingCode} />
    </LiveKitRoom>
  );
}

export default function MeetingPage() {
  return (
    <MeetingSessionProvider>
      <MeetingPageContent />
    </MeetingSessionProvider>
  );
}

function RoomContentGuard({ meetingData, meetingCode }: any) {
  const t = useTranslations("meeting.meeting_page");
  const room = useRoomContext();

  // Lắng nghe các sự kiện breakout
  useBreakoutSync();
  const { handleDisconnect } = useMeetingSessionContext();

  const { displayParticipants } = useParticipantManager({
    meetingCode: meetingCode,
  });

  const [participantStatus, setParticipantStatus] = useState(() => {
    try {
      const base64Url = meetingData.token.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const jsonPayload = decodeURIComponent(
        window
          .atob(base64)
          .split("")
          .map(function (c) {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join(""),
      );
      const payload = JSON.parse(jsonPayload);

      if (payload.metadata) {
        const meta = JSON.parse(payload.metadata);
        return meta.status || "joined";
      }
    } catch (e) {
      console.error("Lỗi parse JWT:", e);
    }
    return "joined";
  });

  useEffect(() => {
    const handleMetadataChanged = (
      prevMetadata: string | undefined,
      participant: any,
    ) => {
      if (participant.identity === room.localParticipant?.identity) {
        try {
          if (participant.metadata) {
            const meta = JSON.parse(participant.metadata);
            const prevMeta = prevMetadata ? JSON.parse(prevMetadata) : null;

            if (
              meta.status &&
              meta.status === "joined" &&
              prevMeta?.status !== "joined" // Chỉ thông báo khi trạng thái thay đổi từ "waiting" sang "joined"
            ) {
              toast.success(t("toast_approved"));
            }

            if (meta.status) {
              setParticipantStatus(meta.status);
            }
          }
        } catch (e) {
          console.error("Lỗi parse metadata:", e);
        }
      }
    };

    room.on(RoomEvent.ParticipantMetadataChanged, handleMetadataChanged);

    return () => {
      room.off(RoomEvent.ParticipantMetadataChanged, handleMetadataChanged);
    };
  }, [room]);

  if (participantStatus === "waiting") {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#09090b] flex items-center justify-center p-4 lg:p-8 font-sans">
        {/* Ambient Glows */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-950/25 via-[#09090b] to-[#09090b]" />
          <div className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full bg-blue-600/10 blur-3xl" />
          <div className="absolute top-1/3 -right-24 w-[380px] h-[380px] rounded-full bg-indigo-500/10 blur-3xl" />
          <div className="absolute -bottom-40 left-1/3 w-[460px] h-[460px] rounded-full bg-sky-500/8 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
              backgroundSize: "28px 28px",
            }}
          />
        </div>

        {/* Main Card */}
        <div className="relative z-10 w-full max-w-lg animate-fade-in">
          <div className="rounded-3xl border border-white/10 bg-[#121216]/90 backdrop-blur-2xl shadow-2xl shadow-black/70 overflow-hidden p-6 lg:p-8 text-center">
            {/* Title with bouncing wave dots */}
            <div className="flex items-center justify-center gap-2 mb-2">
              <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">
                {t("waiting_title")}
              </h1>
              <div className="flex items-center gap-1 mt-2">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" />
              </div>
            </div>

            <p className="text-slate-400 text-sm leading-relaxed max-w-sm mx-auto mb-6">
              {t("waiting_desc")}
            </p>

            {/* Active Participants Subcard */}
            <div className="w-full rounded-2xl bg-white/[0.03] border border-white/5 p-4 mb-6 text-left">
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    {t("waiting_in_meeting")}
                  </span>
                </div>
                {displayParticipants.length > 0 && (
                  <span className="text-[11px] font-medium text-slate-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
                    {displayParticipants.length} người
                  </span>
                )}
              </div>

              {displayParticipants.length > 0 ? (
                <div className="flex items-center justify-center flex-wrap gap-3 py-1">
                  {displayParticipants.slice(0, 5).map((p) => {
                    let avatarUrl = "";
                    try {
                      if (p.metadata) {
                        const meta = JSON.parse(p.metadata);
                        avatarUrl = meta.avatar || meta.avatarUrl || "";
                      }
                    } catch (e) { }

                    return (
                      <div
                        key={p.identity}
                        className="flex flex-col items-center gap-1.5 w-14 group"
                      >
                        <div className="relative">
                          {avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt={p.name}
                              className="w-11 h-11 rounded-full object-cover border-2 border-white/10 group-hover:border-blue-500/60 transition-colors"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300 border-2 border-white/10 group-hover:border-blue-500/60 transition-colors uppercase">
                              {p.name?.charAt(0) || "?"}
                            </div>
                          )}
                          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 ring-2 ring-[#121216] rounded-full" />
                        </div>
                        <span className="text-[10px] text-slate-400 text-center truncate w-full group-hover:text-slate-200 transition-colors">
                          {p.name || "Ẩn danh"}
                        </span>
                      </div>
                    );
                  })}

                  {displayParticipants.length > 5 && (
                    <div className="w-full text-center text-xs text-slate-500 font-medium pt-1">
                      {t("waiting_others_count", {
                        count: displayParticipants.length - 5,
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-4 text-center text-xs text-slate-500">
                  {t("waiting_no_one")}
                </div>
              )}
            </div>

            {/* Leave Waiting Room Button */}
            <button
              type="button"
              onClick={handleDisconnect}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-rose-300 bg-white/5 hover:bg-rose-500/15 border border-white/10 hover:border-rose-500/30 transition-all duration-200 active:scale-95 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>{t("waiting_leave_btn")}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <MeetingWhiteboardProvider meetingCode={meetingCode}>
      <MeetingRoomContent meetingCode={meetingCode} />
    </MeetingWhiteboardProvider>
  );
}

function UnauthenticatedView({ meetingCode }: { meetingCode: string }) {
  const t = useTranslations("meeting.meeting_page");
  return (
    <div className="min-h-screen bg-[#111] flex items-center justify-center p-4 lg:p-8 font-sans transition-colors duration-700">
      <style>{`
        @keyframes smoothFadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes slideUpStagger {
          0% { opacity: 0; transform: translateY(30px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: smoothFadeIn 0.8s ease-out forwards;
        }
        .animate-slide-up-1 {
          opacity: 0;
          animation: slideUpStagger 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards;
        }
        .animate-slide-up-2 {
          opacity: 0;
          animation: slideUpStagger 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.2s forwards;
        }
        .animate-slide-up-3 {
          opacity: 0;
          animation: slideUpStagger 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.3s forwards;
        }
      `}</style>

      <div className="bg-[#222] rounded-3xl shadow-2xl border border-[#333] w-full max-w-md p-8 text-center animate-fade-in">
        <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-blue-500/20 animate-slide-up-1">
          <Smartphone className="text-blue-500 w-10 h-10" />
        </div>

        <h1 className="text-2xl font-bold text-slate-100 mb-3 animate-slide-up-1">
          {t("unauth_title")}
        </h1>
        <p className="text-slate-400 text-sm mb-8 animate-slide-up-2">
          {t("unauth_desc")}
        </p>

        <div className="flex flex-col gap-4 animate-slide-up-3">
          <a
            href={`intent://meeting/${meetingCode}#Intent;scheme=tobomeet;package=com.hng209.mobile;end;`}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-blue-900/20 transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 text-sm"
          >
            {t("unauth_open_app")}
          </a>

          <a
            href={`/login?redirect=/meeting/${meetingCode}`}
            className="w-full bg-[#333] hover:bg-[#444] text-white py-3.5 rounded-xl font-bold shadow-md transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 text-sm border border-[#444]"
          >
            {t("unauth_login_web")}
          </a>
        </div>
      </div>
    </div>
  );
}

// src/app/[locale]/room/[id]/page.tsx
"use client";

import { useIsRecording, useRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";
import { Grid2X2, X, Users, MessageSquare, BarChart2, Captions, ShieldCheck } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import localforage from "localforage";
import "@livekit/components-styles";
import ParticipantList from "@/components/meeting/ParticipantList";
import CustomToolbar from "@/components/meeting/CustomToolbar";
import CustomVideoGrid from "@/components/meeting/CustomVideoGrid";
import MeetingChat from "@/components/meeting/MeetingChat";
import MeetingPolls from "@/components/meeting/MeetingPolls";
import CreatePollModal from "@/components/meeting/CreatePollModal";
import MeetingCaptions from "@/components/meeting/MeetingCaptions";
import { axiosInstance } from "@/lib/axios";
import { ChatMessage } from "@tobomeet/shared/types";
import { useTranslations } from "next-intl";
import { useRoomSettings } from "@/hooks/useRoomSettings";
import { useBreakoutTimer } from "@/hooks/useBreakoutTimer";
import { useIsElectron } from "@/hooks/useIsElectron";

export default function MeetingRoomContent({
  meetingCode,
  initialMeetingData,
}: any) {
  const t = useTranslations("meeting");
  const room = useRoomContext();
  const isLivekitRecording = useIsRecording();
  const {
    roomName,
    roomType,
    meetingType,
    channelName,
    ownerName,
    breakoutStartedAt,
    breakoutDuration,
    recordingInfo,
    isCloudRecordingActive,
    isCloudRecordingStopping,
    isHost,
    isE2EE,
  } = useRoomSettings({ meetingCode: meetingCode });
  const isElectron = useIsElectron();
  const isBreakoutRoom = roomType === "breakout";

  const displayTitle = useMemo(() => {
    if (isBreakoutRoom) {
      return roomName || "";
    }
    const effectiveMeetingType =
      meetingType || initialMeetingData?.meetingType;
    const effectiveOwnerName = ownerName || initialMeetingData?.ownerName;
    const effectiveChannelName =
      channelName || initialMeetingData?.channelName;
    const effectiveRoomName = roomName || initialMeetingData?.roomName;

    if (effectiveMeetingType === "personal") {
      const name =
        effectiveOwnerName ||
        (effectiveRoomName
          ? effectiveRoomName.replace(/^Cuộc họp cá nhân của\s*/i, "")
          : "");
      if (name) {
        return t("personal_meeting_title", {
          name,
          defaultValue: `Cuộc họp cá nhân của ${name}`,
        });
      }
      return t("personal_meeting_default", {
        defaultValue: "Cuộc họp cá nhân",
      });
    }
    return (
      effectiveChannelName ||
      effectiveRoomName ||
      t("channel_meeting_default", { defaultValue: "Cuộc họp kênh" })
    );
  }, [
    isBreakoutRoom,
    roomName,
    meetingType,
    ownerName,
    channelName,
    initialMeetingData,
    t,
  ]);
  const isRecording =
    !isCloudRecordingStopping &&
    (isLivekitRecording || isCloudRecordingActive || (!!recordingInfo?.isRecording && recordingInfo?.status !== "stopping"));

  const timeDisplay = useBreakoutTimer({
    startedAt: breakoutStartedAt,
    durationMinutes: breakoutDuration,
    meetingCode: meetingCode,
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"chat" | "people" | "polls" | "captions">("chat");
  const [isCreatePollOpen, setIsCreatePollOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasUnreadChat, setHasUnreadChat] = useState(false);
  const [screenSources, setScreenSources] = useState<any[]>([]);
  const [isLiveCaptionEnabled, setIsLiveCaptionEnabled] = useState(false);

  const handleToggleLiveCaption = () => {
    if (isBreakoutRoom) return;
    setIsLiveCaptionEnabled((prev) => {
      const nextState = !prev;
      if (nextState) {
        if (meetingCode) {
          axiosInstance.post(`/meetings/${meetingCode}/captions/ensure`).catch(() => {});
        }
        setSidebarTab("captions");
        setIsSidebarOpen(true);
      }
      return nextState;
    });
  };

  // Tự động đóng tab Bình chọn / Phụ đề và modal tạo poll khi vào phòng breakout
  useEffect(() => {
    if (isBreakoutRoom) {
      setIsCreatePollOpen(false);
      setIsLiveCaptionEnabled(false);
      if (sidebarTab === "polls" || sidebarTab === "captions") {
        setIsSidebarOpen(false);
      }
    }
  }, [isBreakoutRoom, sidebarTab]);

  const storageKey = `meeting_chat_${meetingCode}`;

  // Dùng useRef để tránh "stale closure" trong sự kiện LiveKit
  const isChatOpenRef = useRef(false);

  useEffect(() => {
    // Kiểm tra xem có đang chạy trong Electron không
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      (window as any).electronAPI.onScreenShareRequest((sources: any[]) => {
        setScreenSources(sources); // Mở modal và hiển thị danh sách
      });
    }
  }, []);

  const handleSelectSource = (id: string | null) => {
    if ((window as any).electronAPI) {
      (window as any).electronAPI.selectScreenShare(id); // Gửi ID về lại cho Electron
    }
    setScreenSources([]); // Đóng modal
  };

  useEffect(() => {
    isChatOpenRef.current = isSidebarOpen && sidebarTab === "chat";
    // Nếu vừa mở khung chat lên, tắt chấm đỏ ngay
    if (isChatOpenRef.current) {
      setHasUnreadChat(false);
    }
  }, [isSidebarOpen, sidebarTab]);

  // Load dữ liệu chat từ Indexed DB khi component mount
  useEffect(() => {
    const loadSavedChat = async () => {
      try {
        const savedChat = await localforage.getItem<ChatMessage[]>(storageKey);
        if (savedChat && Array.isArray(savedChat)) {
          setMessages(savedChat);
        }
      } catch (error) { }
    };
    loadSavedChat();
  }, [storageKey]);

  // Lưu dữ liệu chat vào Indexed DB khi có tin nhắn mới
  useEffect(() => {
    if (messages.length > 0) {
      const saveChat = async () => {
        try {
          const MAX_MESSAGES_TO_SAVE = 10000;
          const messagesToSave =
            messages.length > MAX_MESSAGES_TO_SAVE
              ? messages.slice(messages.length - MAX_MESSAGES_TO_SAVE)
              : messages;
          await localforage.setItem(storageKey, messagesToSave);
        } catch (error) { }
      };
      saveChat();
    }
  }, [messages, storageKey]);

  // Lắng nghe sự kiện nhận dữ liệu từ LiveKit
  useEffect(() => {
    if (!room) return;

    const handleDataReceived = (payload: Uint8Array) => {
      const decoder = new TextDecoder();
      const jsonString = decoder.decode(payload);

      try {
        const data = JSON.parse(jsonString) as ChatMessage;

        // Nhận dữ liệu CHAT (bao gồm cả File dạng Link S3)
        if (data.type === "CHAT") {
          data.reactions = data.reactions || {};
          setMessages((prev) => [...prev, data]);
          if (!isChatOpenRef.current) setHasUnreadChat(true);
        }

        // Xử lý thả cảm xúc (REACTION)
        else if (data.type === "REACT" && data.targetMessageId && data.emoji) {
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id === data.targetMessageId) {
                const newReactions = { ...(msg.reactions || {}) };
                const usersWhoReacted = newReactions[data.emoji!] || [];

                if (!usersWhoReacted.includes(data.senderIdentity)) {
                  newReactions[data.emoji!] = [
                    ...usersWhoReacted,
                    data.senderIdentity,
                  ];
                } else {
                  newReactions[data.emoji!] = usersWhoReacted.filter(
                    (id) => id !== data.senderIdentity,
                  );
                }
                return { ...msg, reactions: newReactions };
              }
              return msg;
            }),
          );
        }
      } catch (error) { }
    };

    room.on(RoomEvent.DataReceived, handleDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived);
    };
  }, [room]);

  return (
    <div
      className={`flex flex-row w-screen bg-[#0d0d10] text-slate-100 overflow-hidden font-sans fixed inset-x-0 bottom-0 ${
        isElectron ? "top-8" : "top-0"
      }`}
    >
      {/* MAIN MEETING COLUMN (Header, Video Grid, Toolbar) */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden transition-all duration-300">
        <header className="relative z-50 h-16 shrink-0 px-5 flex items-center justify-between bg-[#111113] border-b border-[#232328]">
          <div className="flex items-center gap-2.5 min-w-0">
            {isBreakoutRoom && <Grid2X2 size={18} className="text-blue-400 shrink-0" />}

            {/* Cụm tên phòng / kênh và biểu tượng khiên an toàn */}
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[15px] font-semibold tracking-wide flex items-center gap-1.5 text-slate-100 truncate">
                {displayTitle}
                {isBreakoutRoom && timeDisplay && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs">
                    {timeDisplay}
                  </span>
                )}
              </span>

              {/* Biểu tượng khiên mã hoá an toàn - kéo gần lại tên */}
              {isE2EE && (
                <div className="relative group flex items-center">
                  <button
                    type="button"
                    className="p-1 rounded-md text-emerald-400 hover:text-emerald-300 hover:bg-white/5 transition-colors cursor-pointer focus:outline-none flex items-center justify-center"
                    aria-label={t("e2ee_aria_label", {
                      defaultValue: "Mã hoá đầu cuối an toàn",
                    })}
                  >
                    <ShieldCheck size={16} className="text-emerald-400" />
                  </button>

                  {/* Tooltip hiển thị khi hover */}
                  <div className="absolute left-0 top-full mt-1.5 hidden group-hover:flex items-center px-2.5 py-1 bg-[#1c1c1f] border border-[#2e2e34] rounded-lg shadow-xl z-50 pointer-events-none whitespace-nowrap animate-in fade-in zoom-in-95 duration-150">
                    <span className="text-[11px] text-slate-200">
                      {t("e2ee_tooltip", {
                        defaultValue: "Cuộc họp đã được mã hoá đầu cuối an toàn",
                      })}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Trạng thái ghi hình cạnh tên phòng chính */}
            {isRecording && !isBreakoutRoom && (
              <div
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-600 text-white text-[11px] font-bold select-none shadow-sm shadow-red-600/30 tracking-wider animate-fade-in ml-1"
                title={t("toolbar.recording_in_progress")}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-white shrink-0"></span>
                <span>REC</span>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 flex overflow-hidden relative min-h-0 w-full bg-[#0a0a0c]">
          <CustomVideoGrid />
        </main>

        <div className="shrink-0 w-full relative z-[500]">
          {/* MODAL CHỌN MÀN HÌNH CHIA SẺ (CHỈ HIỂN THỊ KHI CHẠY TRÊN ELECTRON) */}
          {screenSources.length > 0 && (
            <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/80 p-4">
              <div className="bg-[#222] border border-[#444] rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[85vh]">
                <div className="p-4 border-b border-slate-800 flex justify-between items-center shrink-0">
                  <h2 className="text-lg font-bold text-slate-100">
                    {t("screen_share_modal.title")}
                  </h2>
                  <button
                    onClick={() => handleSelectSource(null)}
                    className="p-2 bg-[#333] hover:bg-slate-700 rounded-lg text-slate-400 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                    {screenSources.map((source) => (
                      <div
                        key={source.id}
                        onClick={() => handleSelectSource(source.id)}
                        className="flex flex-col gap-3 p-3 bg-slate-800/50 hover:bg-slate-700/80 border border-slate-700 hover:border-emerald-500/50 rounded-xl cursor-pointer transition-all group"
                      >
                        <div className="aspect-video bg-black rounded-lg overflow-hidden border border-slate-900 group-hover:shadow-lg">
                          <img
                            src={source.thumbnail}
                            alt={source.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <span className="text-sm font-medium text-slate-300 text-center truncate px-2">
                          {source.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 border-t border-slate-800 flex justify-end shrink-0 bg-slate-900/50 rounded-b-2xl">
                  <button
                    onClick={() => handleSelectSource(null)}
                    className="px-6 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
                  >
                    {t("screen_share_modal.cancel")}
                  </button>
                </div>
              </div>
            </div>
          )}

          <CustomToolbar
            meetingCode={meetingCode || ""}
            hasUnreadChat={hasUnreadChat}
            activeTab={isSidebarOpen ? sidebarTab : null}
            isLiveCaptionEnabled={isLiveCaptionEnabled}
            onToggleLiveCaption={handleToggleLiveCaption}
            onCreatePoll={() => setIsCreatePollOpen(true)}
            onToggleSidebar={(tab) => {
              if (isSidebarOpen && sidebarTab === tab) setIsSidebarOpen(false);
              else {
                setSidebarTab(tab);
                setIsSidebarOpen(true);
              }
            }}
          />
        </div>
      </div>

      {/* SIDEBAR CỤM CHAT, PARTICIPANTS & POLLS NẰM NGOÀI CÙNG */}
      {isSidebarOpen && (
        <aside className="fixed inset-0 z-50 flex flex-col bg-[#111113] lg:static lg:w-[360px] xl:w-[380px] lg:z-auto lg:border-l lg:border-[#232328] shadow-2xl transition-all duration-300 ease-in-out shrink-0 h-full">
          {/* Header đồng bộ chiều cao (h-16) và cỡ chữ với header chính của MeetingRoomContent & thanh toolbar */}
          <div className="h-16 px-5 flex items-center justify-between border-b border-[#232328] bg-[#111113] shrink-0">
            <div className="flex items-center gap-2.5 text-slate-100 min-w-0">
              {sidebarTab === "chat" ? (
                <MessageSquare size={18} className="text-slate-100 shrink-0" />
              ) : sidebarTab === "people" ? (
                <Users size={18} className="text-slate-100 shrink-0" />
              ) : sidebarTab === "polls" ? (
                <BarChart2 size={18} className="text-slate-100 shrink-0" />
              ) : (
                <Captions size={18} className="text-slate-100 shrink-0" />
              )}
              <h2 className="text-[15px] font-semibold text-slate-100 tracking-wide truncate">
                {sidebarTab === "chat"
                  ? t("chat_header")
                  : sidebarTab === "people"
                    ? t("participant_header")
                    : sidebarTab === "polls"
                      ? t("polls_header")
                      : (t("captions_header") || "Phụ đề")}
              </h2>
            </div>

            <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer shrink-0"
              title={t("close")}
            >
              <X size={18} />
            </button>
          </div>

          {/* Body nội dung với spacing đều và bo góc chuẩn */}
          <div className="flex-1 p-3.5 overflow-hidden flex flex-col min-h-0 bg-[#111113]">
            {sidebarTab === "chat" ? (
              <MeetingChat
                meetingCode={meetingCode}
                messages={messages}
                setMessages={setMessages}
              />
            ) : sidebarTab === "people" ? (
              <ParticipantList meetingCode={meetingCode} />
            ) : sidebarTab === "polls" ? (
              <MeetingPolls
                meetingCode={meetingCode}
                isHost={isHost}
                onCreatePoll={() => setIsCreatePollOpen(true)}
              />
            ) : (
              <MeetingCaptions
                meetingCode={meetingCode}
                isLiveCaptionEnabled={isLiveCaptionEnabled}
                onToggleLiveCaption={handleToggleLiveCaption}
              />
            )}
          </div>
        </aside>
      )}

      {/* MODAL TẠO BÌNH CHỌN CHO HOST/ADMIN (CHỈ Ở PHÒNG CHÍNH) */}
      {!isBreakoutRoom && (
        <CreatePollModal
          isOpen={isCreatePollOpen}
          onClose={() => setIsCreatePollOpen(false)}
          meetingCode={meetingCode}
        />
      )}
    </div>
  );
}

// hooks/useSelectiveSubscription.ts

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  TrackReferenceOrPlaceholder,
  useTracks,
  useRoomContext,
} from "@livekit/components-react";
import {
  Participant,
  RemoteTrackPublication,
  RoomEvent,
  Track,
} from "livekit-client";
import { useSafeMeetingWhiteboard } from "@/components/meeting/contexts/MeetingWhiteboardContext";
import { isAgentParticipant } from "@/utils/participant";
import {
  getIsLocalRecording,
  subscribeLocalRecording,
} from "@/lib/recording/localRecordingState";

function makeKey(identity: string, source: Track.Source) {

  return `${identity}|${source}`;
}

function isWaiting(participant: Participant): boolean {
  try {
    if (participant.metadata) {
      const meta = JSON.parse(participant.metadata);
      return meta.status === "waiting";
    }
  } catch (e) { }
  return false;
}

export function useSelectiveSubscription() {
  const room = useRoomContext();
  const wbContext = useSafeMeetingWhiteboard();
  const isWhiteboardActive = !!wbContext?.isWhiteboardActive;

  const allTracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const [isMobile, setIsMobile] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [metaTick, setMetaTick] = useState(0);
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);
  const [isLocalRecording, setIsLocalRecording] = useState<boolean>(() =>
    getIsLocalRecording(),
  );

  // Đồng bộ trạng thái Local Recording để giữ subscribe ScreenShare ở mọi trang
  useEffect(() => {
    setIsLocalRecording(getIsLocalRecording());
    return subscribeLocalRecording(setIsLocalRecording);
  }, []);

  // Selective Subscription Refs
  const lastDesiredRef = useRef<Set<string>>(new Set());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mobile/Desktop
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Metadata change (duyệt vào phòng)
  useEffect(() => {
    const handleMetadataChanged = () => {
      setMetaTick((t) => t + 1);
      ensureAudioSubscribed();
    };

    room.on(RoomEvent.ParticipantMetadataChanged, handleMetadataChanged);
    return () => {
      room.off(RoomEvent.ParticipantMetadataChanged, handleMetadataChanged);
    };
  }, [room]);

  // Lọc người đang chờ và agent/bot (không tạo tile hiển thị cho agent)
  const validTracks = useMemo(() => {
    return allTracks.filter(
      (t) => !isWaiting(t.participant) && !isAgentParticipant(t.participant),
    );
  }, [allTracks, metaTick]);

  // Nếu người bị pin rời phòng / mất track → tự clear pin
  useEffect(() => {
    if (!pinnedKey) return;
    const stillExists = validTracks.some(
      (t) => makeKey(t.participant.identity, t.source) === pinnedKey,
    );
    if (!stillExists) {
      setPinnedKey(null);
    }
  }, [validTracks, pinnedKey]);

  const pageSize = isMobile ? 4 : 16;

  // Tính pages (có hỗ trợ whiteboard và pinned)
  const pages = useMemo(() => {
    const screenTracks = validTracks.filter(
      (t) => t.source === Track.Source.ScreenShare,
    );
    let cameraTracks = validTracks.filter(
      (t) => t.source !== Track.Source.ScreenShare,
    );

    // Ghim local lên đầu + sort ổn định
    cameraTracks.sort((a, b) => {
      if (a.participant.isLocal && !b.participant.isLocal) return -1;
      if (!a.participant.isLocal && b.participant.isLocal) return 1;
      return a.participant.identity.localeCompare(b.participant.identity);
    });

    // Tìm track đang được pin (chỉ pin camera, không pin screenshare)
    const pinnedTrack = pinnedKey
      ? cameraTracks.find(
        (t) => makeKey(t.participant.identity, t.source) === pinnedKey,
      )
      : undefined;

    // Lọc người đã pin khỏi camera pages để tránh trùng
    if (pinnedTrack) {
      cameraTracks = cameraTracks.filter(
        (t) => makeKey(t.participant.identity, t.source) !== pinnedKey,
      );
    }

    const newPages: {
      type: "screenshare" | "whiteboard" | "pinned" | "camera";
      tracks: TrackReferenceOrPlaceholder[];
    }[] = [];

    // 1. Screen share luôn ưu tiên cao nhất
    if (screenTracks.length > 0) {
      newPages.push({ type: "screenshare", tracks: screenTracks });
    }

    // 2. Trang Whiteboard (nếu đang bật)
    if (isWhiteboardActive) {
      newPages.push({ type: "whiteboard", tracks: [] });
    }

    // 3. Trang pinned (nếu có)
    if (pinnedTrack) {
      newPages.push({ type: "pinned", tracks: [pinnedTrack] });
    }

    // 4. Các trang camera
    for (let i = 0; i < cameraTracks.length; i += pageSize) {
      newPages.push({
        type: "camera",
        tracks: cameraTracks.slice(i, i + pageSize),
      });
    }

    // Nếu không có track camera/screenshare nào nhưng có whiteboard
    if (newPages.length === 0 && isWhiteboardActive) {
      newPages.push({ type: "whiteboard", tracks: [] });
    }

    return newPages;
  }, [validTracks, pageSize, pinnedKey, isWhiteboardActive]);


  const pinTrack = useCallback((trackRef: TrackReferenceOrPlaceholder) => {
    // Chỉ cho phép pin camera
    if (trackRef.source !== Track.Source.Camera) return;

    const key = makeKey(trackRef.participant.identity, trackRef.source);
    setPinnedKey((prev) => {
      // Toggle: nếu đang pin đúng người này → bỏ pin
      if (prev === key) return null;
      return key;
    });
  }, []);

  const unpin = useCallback(() => {
    setPinnedKey(null);
  }, []);

  const isPinned = useCallback(
    (trackRef: TrackReferenceOrPlaceholder) => {
      if (!pinnedKey) return false;
      return (
        makeKey(trackRef.participant.identity, trackRef.source) === pinnedKey
      );
    },
    [pinnedKey],
  );

  // Audio luôn subscribe (Microphone + ScreenShareAudio, trừ người chờ và agent)
  const ensureAudioSubscribed = useCallback(() => {
    room.remoteParticipants.forEach((participant) => {
      if (isAgentParticipant(participant)) return;

      const shouldSubscribe = !isWaiting(participant);
      [Track.Source.Microphone, Track.Source.ScreenShareAudio].forEach(
        (audioSource) => {
          const audioPub = participant.getTrackPublication(audioSource) as
            | RemoteTrackPublication
            | undefined;

          if (audioPub && typeof audioPub.setSubscribed === "function") {
            if (audioPub.isDesired !== shouldSubscribe) {
              audioPub.setSubscribed(shouldSubscribe);
            }
          }
        },
      );
    });
  }, [room]);

  // Áp dụng subscribe video
  const applySubscriptions = useCallback(
    (desiredKeys: Set<string>) => {
      if (
        desiredKeys.size === lastDesiredRef.current.size &&
        [...desiredKeys].every((k) => lastDesiredRef.current.has(k))
      ) {
        ensureAudioSubscribed();
        return;
      }

      lastDesiredRef.current = desiredKeys;

      room.remoteParticipants.forEach((participant) => {
        [Track.Source.Camera, Track.Source.ScreenShare].forEach((source) => {
          const pub = participant.getTrackPublication(source) as
            | RemoteTrackPublication
            | undefined;
          if (!pub || typeof pub.setSubscribed !== "function") return;

          const key = makeKey(participant.identity, source);
          const shouldSubscribe = desiredKeys.has(key);

          if (pub.isDesired !== shouldSubscribe) {
            pub.setSubscribed(shouldSubscribe);
            console.log(
              `[Web Reconciliation] ${shouldSubscribe ? "🟢 SUB" : "🔴 UNSUB"} → ${key}`,
            );
          }
        });

        // Audio (Microphone + ScreenShareAudio)
        if (!isAgentParticipant(participant)) {
          const shouldSubscribeAudio = !isWaiting(participant);
          [Track.Source.Microphone, Track.Source.ScreenShareAudio].forEach(
            (audioSource) => {
              const audioPub = participant.getTrackPublication(audioSource) as
                | RemoteTrackPublication
                | undefined;

              if (audioPub && typeof audioPub.setSubscribed === "function") {
                if (audioPub.isDesired !== shouldSubscribeAudio) {
                  audioPub.setSubscribed(shouldSubscribeAudio);
                }
              }
            },
          );
        }
      });
    },
    [room, ensureAudioSubscribed],
  );

  const scheduleApply = useCallback(
    (desiredKeys: Set<string>) => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

      debounceTimerRef.current = setTimeout(() => {
        applySubscriptions(desiredKeys);
      }, 180);
    },
    [applySubscriptions],
  );

  // Effect chính: subscribe theo trang hiện tại + luôn giữ pinned
  // Khi đang quay Local (isLocalRecording): LUÔN giữ subscribe ScreenShare dù đang ở trang Camera hay Whiteboard
  useEffect(() => {
    const screenShareKeys = isLocalRecording
      ? validTracks
          .filter((t) => t.source === Track.Source.ScreenShare)
          .map((t) => makeKey(t.participant.identity, t.source))
      : [];

    if (!pages.length) {
      scheduleApply(new Set(screenShareKeys));
      return;
    }

    const currentData = pages[currentPage];
    const isWhiteboardPage = currentData?.type === "whiteboard";

    let desired: Set<string>;

    if (isWhiteboardPage) {
      // Khi đang xem whiteboard: không subscribe camera, chỉ giữ ScreenShare nếu đang quay Local
      desired = new Set<string>(screenShareKeys);
    } else {
      const activeItems = currentData?.tracks ?? [];
      desired = new Set<string>(
        activeItems.map((t) => makeKey(t.participant.identity, t.source)),
      );

      // Luôn giữ track đang pin trong desired
      if (pinnedKey) {
        desired.add(pinnedKey);
      }

      // Khi đang quay Local: luôn giữ ScreenShare kể cả khi lật sang trang Camera
      screenShareKeys.forEach((k) => desired.add(k));
    }

    scheduleApply(desired);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [currentPage, pages, pinnedKey, isLocalRecording, validTracks, scheduleApply]);

  // Track mới publish
  useEffect(() => {
    const onTrackPublished = (
      publication: RemoteTrackPublication,
      participant: any,
    ) => {
      if (isWaiting(participant) || isAgentParticipant(participant)) return;

      if (
        publication.source === Track.Source.Microphone ||
        publication.source === Track.Source.ScreenShareAudio
      ) {
        if (!publication.isDesired) {
          publication.setSubscribed(true);
        }
        return;
      }

      if (
        publication.source !== Track.Source.Camera &&
        publication.source !== Track.Source.ScreenShare
      )
        return;

      const key = makeKey(participant.identity, publication.source);
      const forceScreenShareForRecording =
        getIsLocalRecording() && publication.source === Track.Source.ScreenShare;

      if (
        (lastDesiredRef.current.has(key) || forceScreenShareForRecording) &&
        !publication.isDesired
      ) {
        publication.setSubscribed(true);
        console.log(`[Web TrackPublished] 🟢 SUB immediate → ${key}`);
      }
    };

    room.on(RoomEvent.TrackPublished, onTrackPublished);
    return () => {
      room.off(RoomEvent.TrackPublished, onTrackPublished);
    };
  }, [room]);

  const hasScreenShare = validTracks.some(
    (t) => t.source === Track.Source.ScreenShare,
  );

  const isSomeoneElseSharing = validTracks.some(
    (t) => t.source === Track.Source.ScreenShare && !t.participant.isLocal,
  );

  // Participant join → audio
  useEffect(() => {
    const onParticipantConnected = () => {
      ensureAudioSubscribed();
    };

    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    return () => {
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
    };
  }, [room, ensureAudioSubscribed]);

  useEffect(() => {
    ensureAudioSubscribed();
  }, [ensureAudioSubscribed]);

  // Khi whiteboard được bật → tự động chuyển sang trang whiteboard
  const prevWhiteboardActiveRef = useRef(false);
  useEffect(() => {
    if (isWhiteboardActive && !prevWhiteboardActiveRef.current) {
      const wbIdx = pages.findIndex((p) => p.type === "whiteboard");
      if (wbIdx >= 0) {
        setCurrentPage(wbIdx);
      }
    }
    prevWhiteboardActiveRef.current = isWhiteboardActive;
  }, [isWhiteboardActive, pages]);

  // Có screen share → nhảy về trang 0 (trừ khi đang xem whiteboard)
  useEffect(() => {
    if (hasScreenShare && !isWhiteboardActive) setCurrentPage(0);
  }, [hasScreenShare, isWhiteboardActive]);

  // Có pin mới → nhảy về trang pinned (thường là sau screenshare)
  useEffect(() => {
    if (!pinnedKey) return;
    const pinnedPageIndex = pages.findIndex((p) => p.type === "pinned");
    if (pinnedPageIndex >= 0) {
      setCurrentPage(pinnedPageIndex);
    }
  }, [pinnedKey]); // chỉ khi pin thay đổi

  // Không bị lố trang
  useEffect(() => {
    if (pages.length > 0 && currentPage >= pages.length) {
      setCurrentPage(pages.length - 1);
    }
  }, [pages.length, currentPage]);

  return {
    tracks: validTracks,
    pages,
    currentPage,
    setCurrentPage,
    isMobile,
    // Pin API
    pinnedKey,
    pinTrack,
    unpin,
    isPinned,
    isSomeoneElseSharing,
    isWhiteboardActive,
  };
}


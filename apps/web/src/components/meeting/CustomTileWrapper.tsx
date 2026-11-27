import { useHandRaise } from "@/hooks/useHandRaise";
import {
  ParticipantTile,
  TrackReferenceOrPlaceholder,
  useIsSpeaking,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import {
  Hand,
  MicOff,
  Monitor,
  ZoomIn,
  MoreVertical,
  Pin,
  PinOff,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

interface CustomTileWrapperProps {
  trackRef: TrackReferenceOrPlaceholder;
  className?: string;
  isMain?: boolean;
  style?: React.CSSProperties;
  isPinned?: boolean;
  onPinToggle?: (trackRef: TrackReferenceOrPlaceholder) => void;
  hideMenu?: boolean;
}

export default function CustomTileWrapper({
  trackRef,
  className,
  style,
  isMain = false,
  isPinned = false,
  onPinToggle,
  hideMenu = false,
}: CustomTileWrapperProps) {
  const t = useTranslations("meeting.participant_tile");
  const participant = trackRef.participant;
  const isScreenShare = trackRef.source === Track.Source.ScreenShare;
  const { getHandState } = useHandRaise();
  const handState = getHandState(participant);
  const isSpeaking = useIsSpeaking(participant);

  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  const posRef = useRef({ x: 0, y: 0 });
  const dragOriginRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  /**
   * Tính giới hạn kéo (maxX, maxY) dựa theo kích thước thực tế của khung hình video (object-contain)
   * bên trong container để các cạnh video luôn áp sát/snap vào khung nhìn, không kéo trôi ra ngoài view.
   */
  const getPanBounds = useCallback(
    (targetScale: number) => {
      const container = containerRef.current;
      if (!container || targetScale <= 1) {
        return { maxX: 0, maxY: 0 };
      }

      const containerW = container.clientWidth;
      const containerH = container.clientHeight;
      if (containerW <= 0 || containerH <= 0) {
        return { maxX: 0, maxY: 0 };
      }

      let renderedW = containerW;
      let renderedH = containerH;

      // Khi isMain && isScreenShare dùng object-contain -> tính kích thước hiển thị thật của video
      if (isMain && isScreenShare) {
        const videoEl = container.querySelector("video");
        const vw = videoEl?.videoWidth || 0;
        const vh = videoEl?.videoHeight || 0;
        if (vw > 0 && vh > 0) {
          const videoRatio = vw / vh;
          const containerRatio = containerW / containerH;
          if (videoRatio > containerRatio) {
            renderedW = containerW;
            renderedH = containerW / videoRatio;
          } else {
            renderedH = containerH;
            renderedW = containerH * videoRatio;
          }
        }
      }

      const maxX = Math.max(0, (renderedW * targetScale - containerW) / 2);
      const maxY = Math.max(0, (renderedH * targetScale - containerH) / 2);
      return { maxX, maxY };
    },
    [isMain, isScreenShare],
  );

  const clampAndSnapPos = useCallback(
    (
      nextPos: { x: number; y: number },
      targetScale: number,
      snapEdgeThreshold = 0,
    ) => {
      if (targetScale <= 1) return { x: 0, y: 0 };
      const { maxX, maxY } = getPanBounds(targetScale);

      let x = Math.min(Math.max(nextPos.x, -maxX), maxX);
      let y = Math.min(Math.max(nextPos.y, -maxY), maxY);

      // Snap nhẹ các cạnh video sát khít vào viền khung nhìn khi thả chuột ở gần biên
      if (snapEdgeThreshold > 0) {
        if (maxX > 0 && maxX - Math.abs(x) <= snapEdgeThreshold) {
          x = x >= 0 ? maxX : -maxX;
        }
        if (maxY > 0 && maxY - Math.abs(y) <= snapEdgeThreshold) {
          y = y >= 0 ? maxY : -maxY;
        }
      }

      return { x, y };
    },
    [getPanBounds],
  );

  // Zoom bằng lăn chuột theo vị trí con trỏ + tự động ép/snap các cạnh vào trong view
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isScreenShare) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomSensitivity = 0.002;
      const delta = -e.deltaY * zoomSensitivity;

      const prevScale = scaleRef.current;
      const prevPos = posRef.current;
      const newScale = Math.min(Math.max(1, prevScale + delta), 5);

      if (newScale === prevScale) return;

      let nextPos = { x: 0, y: 0 };
      if (newScale > 1) {
        const rect = container.getBoundingClientRect();
        const cx = e.clientX - (rect.left + rect.width / 2);
        const cy = e.clientY - (rect.top + rect.height / 2);
        const ratio = newScale / prevScale;

        const rawPos = {
          x: cx - (cx - prevPos.x) * ratio,
          y: cy - (cy - prevPos.y) * ratio,
        };
        nextPos = clampAndSnapPos(rawPos, newScale);
      }

      scaleRef.current = newScale;
      posRef.current = nextPos;
      setScale(newScale);
      setPos(nextPos);
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [isScreenShare, clampAndSnapPos]);

  // Tự động ép lại vị trí khi khung chứa thay đổi kích thước (mở/đóng sidebar, resize cửa sổ)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isScreenShare) return;

    const observer = new ResizeObserver(() => {
      const clamped = clampAndSnapPos(posRef.current, scaleRef.current);
      if (clamped.x !== posRef.current.x || clamped.y !== posRef.current.y) {
        posRef.current = clamped;
        setPos(clamped);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [isScreenShare, clampAndSnapPos]);

  // Theo dõi kéo toàn cục trên window để mượt và luôn snap cạnh khi thả chuột
  useEffect(() => {
    if (!isDragging) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      const rawPos = {
        x: e.clientX - dragOriginRef.current.x,
        y: e.clientY - dragOriginRef.current.y,
      };
      const clamped = clampAndSnapPos(rawPos, scaleRef.current);
      posRef.current = clamped;
      setPos(clamped);
    };

    const handleWindowMouseUp = () => {
      setIsDragging(false);
      const snapped = clampAndSnapPos(posRef.current, scaleRef.current, 12);
      posRef.current = snapped;
      setPos(snapped);
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [isDragging, clampAndSnapPos]);

  // Đóng menu khi click ra ngoài
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest("[data-menu-trigger]")
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isScreenShare || scaleRef.current <= 1) return;
    const { maxX, maxY } = getPanBounds(scaleRef.current);
    if (maxX <= 0 && maxY <= 0) return;

    e.preventDefault();
    setIsDragging(true);
    dragOriginRef.current = {
      x: e.clientX - posRef.current.x,
      y: e.clientY - posRef.current.y,
    };
  };

  const handleDoubleClick = () => {
    if (!isScreenShare || scaleRef.current <= 1) return;
    scaleRef.current = 1;
    posRef.current = { x: 0, y: 0 };
    setScale(1);
    setPos({ x: 0, y: 0 });
  };

  let avatarUrl = "";
  try {
    if (participant.metadata) {
      avatarUrl = JSON.parse(participant.metadata).avatarUrl;
    }
  } catch (error) {}

  const isCameraOff = !isScreenShare && !participant.isCameraEnabled;
  const isMicOff = !participant.isMicrophoneEnabled;

  const handlePinClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onPinToggle?.(trackRef);
    setMenuOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={`
        relative overflow-hidden rounded-xl
        transition-all duration-200 ease-out group
        ${className}
        ${
          isSpeaking && !isScreenShare
            ? "ring-[3px] ring-emerald-400 shadow-[0_0_0_1px_rgba(52,211,153,0.3),0_0_20px_rgba(52,211,153,0.25)] z-30"
            : "ring-1 ring-white/5"
        }
      `}
      style={{
        ...style,
        cursor:
          isScreenShare && scale > 1
            ? isDragging
              ? "grabbing"
              : "grab"
            : "default",
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      {/* Video + ẩn hoàn toàn overlay mặc định của LiveKit */}
      <div
        className={`w-full h-full origin-center bg-[#0a0a0a] ${
          isDragging
            ? "transition-none"
            : "transition-transform duration-150 ease-out"
        }`}
        style={{
          transform: `translate3d(${pos.x}px, ${pos.y}px, 0) scale(${scale})`,
        }}
      >
        <ParticipantTile
          trackRef={trackRef}
          className={`
            w-full h-full pointer-events-none
            [&_video]:!bg-[#0a0a0a]
            /* Ẩn watermark / tên mặc định của LiveKit */
            [&_.lk-participant-metadata]:!hidden
            [&_.lk-participant-placeholder]:!hidden
            [&_.lk-focus-toggle-button]:!hidden
            ${
              isMain && isScreenShare
                ? "[&_video]:!object-contain [&_video]:!w-full [&_video]:!h-full"
                : "[&_video]:!object-cover [&_video]:!w-full [&_video]:!h-full"
            }
          `}
        />
      </div>

      {/* Chỉ báo zoom */}
      {isScreenShare && scale > 1 && (
        <div className="absolute top-2.5 left-2.5 bg-black/70 text-white text-[11px] px-2.5 py-1 rounded-lg backdrop-blur-md flex items-center gap-1.5 z-20 pointer-events-none border border-white/10">
          <ZoomIn size={13} className="opacity-80" />
          <span className="font-medium tabular-nums">
            {Math.round(scale * 100)}%
          </span>
        </div>
      )}

      {/* Icon giơ tay */}
      {handState.isRaised && (
        <div className="absolute top-2.5 right-2.5 bg-amber-500/95 text-white px-2.5 py-1.5 rounded-lg shadow-lg z-20 flex items-center gap-1.5 backdrop-blur-sm pointer-events-none border border-amber-400/30">
          <Hand size={14} className="fill-white animate-bounce" />
          <span className="text-[11px] font-semibold tracking-wide">
            {t("raised_hand")}
          </span>
        </div>
      )}

      {/* Menu 3 chấm */}
      {!hideMenu && onPinToggle && (
        <div className="absolute top-2 right-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            data-menu-trigger
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white/80 hover:text-white backdrop-blur-md border border-white/10 transition-colors"
            aria-label={t("options")}
          >
            <MoreVertical size={16} />
          </button>

          {menuOpen && (
            <div
              ref={menuRef}
              className="absolute right-0 top-full mt-1.5 min-w-[140px] py-1 rounded-xl bg-[#161619] backdrop-blur-xl border border-[#232328] shadow-2xl z-50 overflow-hidden"
            >
              <button
                onClick={handlePinClick}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-white/90 hover:bg-[#232328] transition-colors cursor-pointer"
              >
                {isPinned ? (
                  <>
                    <PinOff size={14} className="text-rose-400" />
                    <span>{t("unpin")}</span>
                  </>
                ) : (
                  <>
                    <Pin size={14} className="text-emerald-400" />
                    <span>{t("pin")}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Avatar khi tắt camera */}
      {isCameraOff && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 bg-[#121212]">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={participant.name || "User"}
              className={`
                ${isMain ? "w-36 h-36" : "w-20 h-20 sm:w-24 sm:h-24"}
                rounded-full object-cover shadow-2xl ring-2 ring-white/10
              `}
            />
          ) : (
            <div
              className={`
                ${isMain ? "w-36 h-36 text-4xl" : "w-20 h-20 sm:w-24 sm:h-24 text-2xl sm:text-3xl"}
                rounded-full bg-gradient-to-br from-slate-700 to-slate-800
                text-slate-200 flex items-center justify-center font-semibold uppercase
                shadow-2xl ring-2 ring-white/10
              `}
            >
              {participant.name?.charAt(0) || "?"}
            </div>
          )}
        </div>
      )}

      {/* Nhãn tên (custom, thay thế watermark LiveKit) */}
      <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none">
        <div className="bg-gradient-to-t from-black/80 via-black/50 to-transparent px-3 py-2.5 pt-6">
          <div className="flex items-center gap-1.5 max-w-full">
            {isPinned && !isScreenShare && (
              <Pin size={12} className="text-emerald-400 shrink-0" />
            )}
            {isScreenShare ? (
              <Monitor size={13} className="text-sky-400 shrink-0" />
            ) : isMicOff ? (
              <MicOff size={13} className="text-rose-400 shrink-0" />
            ) : null}

            <span className="text-[12px] font-medium text-white/95 truncate drop-shadow-sm">
              {participant.name || t("guest")}
              {isScreenShare && (
                <span className="text-[11px] text-white/60 ml-1.5 font-normal">
                  · {t("sharing_screen")}
                </span>
              )}
              {isPinned && !isScreenShare && (
                <span className="text-[11px] text-emerald-400/90 ml-1.5 font-normal">
                  · {t("pinned")}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

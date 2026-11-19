import { useParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import CustomTileWrapper from "./CustomTileWrapper";
import { useSelectiveSubscription } from "@/hooks/useSelectiveSubscription";
import { useSafeMeetingWhiteboard } from "./contexts/MeetingWhiteboardContext";
import MeetingWhiteboard from "@/components/whiteboard/MeetingWhiteboard";

export default function CustomVideoGrid() {
  const t = useTranslations("meeting.video_grid");
  const params = useParams();
  const meetingCode = (params?.code as string) || "";

  const wbContext = useSafeMeetingWhiteboard();
  const isWhiteboardActive = !!wbContext?.isWhiteboardActive;
  const whiteboardUrl = wbContext?.whiteboardUrl || null;

  const {
    tracks,
    pages,
    currentPage,
    setCurrentPage,
    isMobile,
    pinTrack,
    isPinned,
  } = useSelectiveSubscription();

  if (tracks.length === 0 && !isWhiteboardActive) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-slate-400">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-full bg-white/5 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-slate-500 animate-pulse" />
          </div>
          <p className="text-sm">{t("waiting_others")}</p>
        </div>
      </div>
    );
  }

  const currentData = pages[currentPage];
  if (!currentData) return null;

  const handleNext = () =>
    setCurrentPage((p) => Math.min(p + 1, pages.length - 1));
  const handlePrev = () => setCurrentPage((p) => Math.max(p - 1, 0));

  const hasPagination = pages.length > 1;

  // Render Whiteboard toàn màn hình nếu trang hiện tại là whiteboard
  if (currentData.type === "whiteboard") {
    return (
      <div className="relative w-full h-full flex flex-col bg-[#0a0a0a] overflow-hidden">
        <div className="flex-1 flex flex-row w-full min-h-0">
          {/* Nút lùi trang nằm ở cột riêng bên ngoài, không đè lên whiteboard */}
          {hasPagination && (
            <div className="w-10 md:w-14 shrink-0 flex items-center justify-center z-10 bg-[#0a0a0a]">
              {currentPage > 0 && (
                <button
                  onClick={handlePrev}
                  className="w-9 h-16 md:w-11 md:h-20 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/5 rounded-xl transition-all cursor-pointer"
                  aria-label={t("prev_page")}
                  title={t("prev_page")}
                >
                  <ChevronLeft size={isMobile ? 28 : 36} strokeWidth={1.5} />
                </button>
              )}
            </div>
          )}

          {/* Khung vẽ Whiteboard độc lập ở giữa */}
          <div className="flex-1 h-full min-h-0 relative">
            <MeetingWhiteboard
              meetingCode={meetingCode}
              whiteboardUrl={whiteboardUrl}
            />
          </div>

          {/* Nút tiến trang nằm ở cột riêng bên ngoài, không đè lên whiteboard */}
          {hasPagination && (
            <div className="w-10 md:w-14 shrink-0 flex items-center justify-center z-10 bg-[#0a0a0a]">
              {currentPage < pages.length - 1 && (
                <button
                  onClick={handleNext}
                  className="w-9 h-16 md:w-11 md:h-20 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/5 rounded-xl transition-all cursor-pointer"
                  aria-label={t("next_page")}
                  title={t("next_page")}
                >
                  <ChevronRight size={isMobile ? 28 : 36} strokeWidth={1.5} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Dấu chấm trang nằm độc lập ở giữa khung vẽ và toolbar */}
        {hasPagination && (
          <div className="shrink-0 py-2.5 flex items-center justify-center select-none bg-[#0a0a0a]">
            <div className="flex items-center gap-1.5 bg-black/60 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/10 shadow-lg">
              {pages.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentPage(idx)}
                  className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${currentPage === idx
                    ? p.type === "whiteboard"
                      ? "w-6 bg-blue-500"
                      : "w-5 bg-emerald-400"
                    : "w-1.5 bg-white/30 hover:bg-white/60"
                    }`}
                  aria-label={`Trang ${idx + 1}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const getOptimalCols = (count: number, isMobile: boolean): number => {
    if (isMobile) {
      if (count === 1) return 1;
      if (count === 2) return 1;
      if (count <= 4) return 2;
      return 2;
    }
    if (count === 1) return 1;
    if (count === 2) return 2;
    if (count === 3) return 3;
    if (count === 4) return 2;
    if (count === 5 || count === 6) return 3;
    if (count <= 9) return 3;
    if (count <= 12) return 4;
    if (count <= 16) return 4;
    return 5;
  };

  const isSpecialPage =
    currentData.type === "screenshare" || currentData.type === "pinned";
  const count = currentData.tracks.length;
  const cols = isSpecialPage ? 1 : getOptimalCols(count, isMobile);
  const rows = Math.ceil(count / cols);


  return (
    <div className="relative w-full h-full flex flex-col bg-[#0a0a0a] overflow-hidden">
      <div className="flex-1 flex flex-row w-full min-h-0">
        {hasPagination && (
          <div className="w-10 md:w-14 shrink-0 flex items-center justify-center z-10">
            {currentPage > 0 && (
              <button
                onClick={handlePrev}
                className="w-9 h-16 md:w-11 md:h-20 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                aria-label={t("prev_page")}
              >
                <ChevronLeft size={isMobile ? 28 : 36} strokeWidth={1.5} />
              </button>
            )}
          </div>
        )}

        <div className="flex-1 h-full min-h-0 p-3 md:p-4">
          <div
            className="w-full h-full grid gap-2.5 md:gap-3"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            }}
          >
            {currentData.tracks.map((t) => (
              <div
                key={`${t.participant.identity}_${t.source}`}
                className="min-w-0 min-h-0 flex"
              >
                <CustomTileWrapper
                  trackRef={t}
                  isMain={isSpecialPage}
                  isPinned={isPinned(t)}
                  onPinToggle={pinTrack}
                  className="w-full h-full bg-[#111]"
                />
              </div>
            ))}
          </div>
        </div>

        {hasPagination && (
          <div className="w-10 md:w-14 shrink-0 flex items-center justify-center z-10">
            {currentPage < pages.length - 1 && (
              <button
                onClick={handleNext}
                className="w-9 h-16 md:w-11 md:h-20 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                aria-label={t("next_page")}
              >
                <ChevronRight size={isMobile ? 28 : 36} strokeWidth={1.5} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Dấu chấm trang nằm độc lập ở giữa các tile và toolbar, không đè lên tile */}
      {hasPagination && (
        <div className="shrink-0 pb-2.5 flex items-center justify-center select-none">
          <div className="flex items-center gap-1.5 bg-black/60 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/10 shadow-lg">
            {pages.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentPage(idx)}
                className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${currentPage === idx
                  ? "w-5 bg-emerald-400"
                  : "w-1.5 bg-white/30 hover:bg-white/60"
                  }`}
                aria-label={`Trang ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

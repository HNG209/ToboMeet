import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Plus,
  Trash2,
  Loader2,
  Grid2X2,
  Users,
  Wand2,
  Hand,
  Clock,
  Sparkles,
  ArrowLeft,
  ArrowRight,
  MoreVertical,
  UserMinus,
  ArrowRightLeft,
  ArrowRightCircle,
  UserPlus,
  Search,
  CheckSquare,
  Square,
  RefreshCw,
  Edit2,
  Check,
  Settings,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useStartBreakoutSessionMutation } from "@/lib/redux/api/meetingsApi";
import { toast } from "sonner";
import { useParticipantManager } from "@/hooks/useParticipantManager";
import { CreateBreakoutRoomDto } from "@tobomeet/shared/types";
import { useTranslations } from "next-intl";

interface CreateBreakoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  meetingCode: string;
}

type BreakoutMode = "auto" | "manual" | "free_choose";

interface LocalRoom {
  id: string;
  name: string;
  assignedUserIds: string[];
}

export default function CreateBreakoutModal({
  isOpen,
  onClose,
  meetingCode,
}: CreateBreakoutModalProps) {
  const t = useTranslations("meeting.create_breakout_modal");
  const tServer = useTranslations("server.errors");

  const { displayParticipants } = useParticipantManager({
    meetingCode: meetingCode,
  });

  const [startBreakoutApi, { isLoading }] = useStartBreakoutSessionMutation();

  // Step state: 1 (Setup) | 2 (Assignment & Review)
  const [step, setStep] = useState<1 | 2>(1);

  // Mode state
  const [mode, setMode] = useState<BreakoutMode>("auto");

  // Step 1 Form States
  const [roomCount, setRoomCount] = useState<number>(2);
  const [roomPrefix, setRoomPrefix] = useState<string>(t("room_prefix"));

  // Step 2 Local Rooms State
  const [rooms, setRooms] = useState<LocalRoom[]>([]);

  // Expanded room IDs state (Accordion: Set of room IDs that are open)
  const [expandedRoomIds, setExpandedRoomIds] = useState<Set<string>>(new Set());

  // Editing Room Name inline state
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editingRoomName, setEditingRoomName] = useState<string>("");

  // Action Menu state on participant (3 dots menu)
  const [activeMenuUserId, setActiveMenuUserId] = useState<string | null>(null);
  const [activeSubMenu, setActiveSubMenu] = useState<"move" | "exchange" | null>(null);

  // Settings / Options Popover state (Zoom-style options popup)
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isAutoCloseEnabled, setIsAutoCloseEnabled] = useState<boolean>(false);
  const [autoCloseMinutes, setAutoCloseMinutes] = useState<number>(15);

  const settingsRef = useRef<HTMLDivElement>(null);

  // Multi-select Add Participants Modal State
  const [addModalTargetRoomId, setAddModalTargetRoomId] = useState<string | null>(null);
  const [selectedUserIdsToAdd, setSelectedUserIdsToAdd] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Assignable participants (if multiple, exclude host/local if possible, else take all)
  const assignableParticipants = useMemo(() => {
    const nonLocal = displayParticipants.filter((p) => !p.isLocal);
    return nonLocal.length > 0 ? nonLocal : displayParticipants;
  }, [displayParticipants]);

  // Unassigned participants pool
  const unassignedParticipants = useMemo(() => {
    const assignedSet = new Set<string>();
    rooms.forEach((r) => r.assignedUserIds.forEach((uid) => assignedSet.add(uid)));
    return assignableParticipants.filter((p) => !assignedSet.has(p.identity));
  }, [assignableParticipants, rooms]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setMode("auto");
      setRoomCount(2);
      setRoomPrefix(t("room_prefix"));
      setRooms([]);
      setExpandedRoomIds(new Set());
      setEditingRoomId(null);
      setActiveMenuUserId(null);
      setActiveSubMenu(null);
      setIsSettingsOpen(false);
      setIsAutoCloseEnabled(false);
      setAutoCloseMinutes(15);
      setAddModalTargetRoomId(null);
    }
  }, [isOpen, t]);

  // Close popup menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setIsSettingsOpen(false);
      }
    };
    if (isSettingsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isSettingsOpen]);

  if (!isOpen) return null;

  // Helper to generate & partition rooms
  const generateRoomsForStep2 = (currentMode: BreakoutMode, count: number, prefix: string) => {
    const pfx = prefix.trim() || t("room_prefix");
    const countNum = Math.max(1, count);

    const newRooms: LocalRoom[] = Array.from({ length: countNum }, (_, i) => ({
      id: `room_${Date.now()}_${i + 1}`,
      name: `${pfx} ${i + 1}`,
      assignedUserIds: [],
    }));

    if (currentMode === "auto") {
      // Shuffle and partition evenly
      const shuffled = [...assignableParticipants].sort(() => 0.5 - Math.random());
      shuffled.forEach((p, index) => {
        const targetRoomIndex = index % countNum;
        newRooms[targetRoomIndex].assignedUserIds.push(p.identity);
      });
    }

    setRooms(newRooms);
    // Expand all rooms by default for quick overview
    setExpandedRoomIds(new Set(newRooms.map((r) => r.id)));
  };

  // Step 1 -> Step 2
  const handleProceedToStep2 = () => {
    if (roomCount < 1) {
      toast.error(t("error_min_room"));
      return;
    }

    generateRoomsForStep2(mode, roomCount, roomPrefix);
    setStep(2);
  };

  // Toggle room expand/collapse
  const toggleRoomExpand = (roomId: string) => {
    setExpandedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) {
        next.delete(roomId);
      } else {
        next.add(roomId);
      }
      return next;
    });
  };

  // Expand all / Collapse all toggle
  const toggleAllRooms = () => {
    if (expandedRoomIds.size === rooms.length) {
      setExpandedRoomIds(new Set());
    } else {
      setExpandedRoomIds(new Set(rooms.map((r) => r.id)));
    }
  };

  // Shuffle again in Step 2 (Auto mode)
  const handleShuffleAgain = () => {
    if (rooms.length === 0) return;
    const shuffled = [...assignableParticipants].sort(() => 0.5 - Math.random());
    const updated = rooms.map((r) => ({ ...r, assignedUserIds: [] as string[] }));

    shuffled.forEach((p, index) => {
      const targetRoomIndex = index % updated.length;
      updated[targetRoomIndex].assignedUserIds.push(p.identity);
    });

    setRooms(updated);
  };

  // Add new room in Step 2
  const handleAddRoom = () => {
    const pfx = roomPrefix.trim() || t("room_prefix");
    const newId = `room_${Date.now()}_${rooms.length + 1}`;
    const newRoom: LocalRoom = {
      id: newId,
      name: `${pfx} ${rooms.length + 1}`,
      assignedUserIds: [],
    };
    setRooms((prev) => [...prev, newRoom]);
    setExpandedRoomIds((prev) => new Set([...prev, newId]));
  };

  // Delete room in Step 2
  const handleDeleteRoom = (roomId: string) => {
    if (rooms.length <= 1) {
      toast.error(t("error_min_room"));
      return;
    }
    setRooms((prev) => prev.filter((r) => r.id !== roomId));
    setExpandedRoomIds((prev) => {
      const next = new Set(prev);
      next.delete(roomId);
      return next;
    });
    if (editingRoomId === roomId) {
      setEditingRoomId(null);
    }
  };

  // Rename room inline
  const handleStartRenameRoom = (roomId: string, currentName: string) => {
    setEditingRoomId(roomId);
    setEditingRoomName(currentName);
  };

  const handleSaveRoomName = (roomId: string) => {
    if (!editingRoomName.trim()) {
      toast.error(t("error_room_name_empty"));
      return;
    }
    setRooms((prev) =>
      prev.map((r) => (r.id === roomId ? { ...r, name: editingRoomName.trim() } : r)),
    );
    setEditingRoomId(null);
  };

  // Remove participant from room
  const handleRemoveParticipant = (roomId: string, userId: string) => {
    setRooms((prev) =>
      prev.map((r) =>
        r.id === roomId
          ? { ...r, assignedUserIds: r.assignedUserIds.filter((id) => id !== userId) }
          : r,
      ),
    );
    setActiveMenuUserId(null);
    setActiveSubMenu(null);
  };

  // Move participant to another room
  const handleMoveParticipant = (fromRoomId: string, toRoomId: string, userId: string) => {
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id === fromRoomId) {
          return {
            ...r,
            assignedUserIds: r.assignedUserIds.filter((id) => id !== userId),
          };
        }
        if (r.id === toRoomId) {
          return {
            ...r,
            assignedUserIds: [...r.assignedUserIds, userId],
          };
        }
        return r;
      }),
    );
    setActiveMenuUserId(null);
    setActiveSubMenu(null);
  };

  // Exchange participant with someone in another room
  const handleExchangeParticipant = (
    fromRoomId: string,
    fromUserId: string,
    toRoomId: string,
    toUserId: string,
  ) => {
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id === fromRoomId) {
          return {
            ...r,
            assignedUserIds: r.assignedUserIds.map((id) =>
              id === fromUserId ? toUserId : id,
            ),
          };
        }
        if (r.id === toRoomId) {
          return {
            ...r,
            assignedUserIds: r.assignedUserIds.map((id) =>
              id === toUserId ? fromUserId : id,
            ),
          };
        }
        return r;
      }),
    );
    setActiveMenuUserId(null);
    setActiveSubMenu(null);
  };

  // Open multi-select modal for adding users
  const handleOpenAddModal = (roomId: string) => {
    setAddModalTargetRoomId(roomId);
    setSelectedUserIdsToAdd([]);
    setSearchQuery("");
  };

  // Confirm multi-select add users
  const handleConfirmAddUsers = () => {
    if (!addModalTargetRoomId || selectedUserIdsToAdd.length === 0) return;

    setRooms((prev) =>
      prev.map((r) =>
        r.id === addModalTargetRoomId
          ? { ...r, assignedUserIds: [...r.assignedUserIds, ...selectedUserIdsToAdd] }
          : r,
      ),
    );
    setExpandedRoomIds((prev) => new Set([...prev, addModalTargetRoomId]));
    setAddModalTargetRoomId(null);
    setSelectedUserIdsToAdd([]);
  };

  // Toggle user selection in add modal
  const handleToggleUserSelection = (userId: string) => {
    setSelectedUserIdsToAdd((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  // Submit and start breakout session
  const handleSubmit = async () => {
    if (rooms.length === 0) {
      toast.error(t("error_min_room"));
      return;
    }
    if (rooms.some((r) => !r.name.trim())) {
      toast.error(t("error_room_name_empty"));
      return;
    }

    const durationToUse =
      isAutoCloseEnabled && autoCloseMinutes > 0 ? autoCloseMinutes : undefined;

    const payloadRooms: CreateBreakoutRoomDto[] = rooms.map((r) => ({
      name: r.name.trim(),
      durationMinutes: durationToUse,
      assignedUsers: mode === "free_choose" ? undefined : r.assignedUserIds,
    }));

    try {
      await startBreakoutApi({
        code: meetingCode,
        rooms: payloadRooms,
        durationMinutes: durationToUse,
      }).unwrap();

      toast.success(t("success_start"));
      onClose();
    } catch (error: any) {
      if (error?.code) {
        toast.error(tServer(String(error.code)));
      } else if (error?.status === 400) {
        toast.error(t("error_invalid_data"));
      } else {
        toast.error(t("error_create_failed"));
      }
    }
  };

  // Find user details helper
  const getParticipantInfo = (userId: string) => {
    const p = displayParticipants.find((item) => item.identity === userId);
    return {
      name: p?.name || userId,
      initial: (p?.name || userId).charAt(0).toUpperCase(),
    };
  };

  // Target room for the Add Modal
  const targetRoomForAdd = rooms.find((r) => r.id === addModalTargetRoomId);

  // Filter unassigned participants for the add modal
  const filteredUnassigned = unassignedParticipants.filter((p) =>
    (p.name || p.identity).toLowerCase().includes(searchQuery.toLowerCase().trim()),
  );

  if (!isOpen) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      {/* Backdrop làm mờ toàn bộ phần dưới */}
      <div
        className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md animate-fade-in transition-opacity"
        onClick={() => {
          if (activeMenuUserId) {
            setActiveMenuUserId(null);
            setActiveSubMenu(null);
          } else if (isSettingsOpen) {
            setIsSettingsOpen(false);
          } else {
            onClose();
          }
        }}
      />

      {/* Main Modal Container (Clean, compact width suitable for Zoom-like style) */}
      <div
        className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[10000] w-[92vw] bg-[#161619] border border-[#232328] rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ease-out ${step === 1
          ? "max-w-[480px] h-auto max-h-[82vh]"
          : "max-w-[560px] h-[82vh] max-h-[660px]"
          }`}
      >
        {/* MODAL HEADER */}
        <div className="px-5 py-3.5 border-b border-[#232328] flex items-center justify-between bg-[#111113] shrink-0">
          <div className="flex items-center gap-2.5">
            <Grid2X2 size={20} className="text-blue-500 shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white">
                  {step === 1 ? t("step_1_title") : t("step_2_title")}
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-[#232328] text-slate-400 border border-[#232328] rounded-full">
                  {step === 1 ? "1 / 2" : "2 / 2"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {step === 1 ? t("step_1_subtitle") : t("step_2_subtitle")}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-[#232328] rounded-lg transition-colors cursor-pointer"
          >
            <X size={17} />
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 min-h-0 overflow-hidden bg-[#111113] flex flex-col relative">
          {/* ================= STEP 1: SETUP & MODE SELECTION (NO DURATION) ================= */}
          {step === 1 && (
            <div
              className="p-5 overflow-y-auto custom-scrollbar flex flex-col gap-4"
            >
              {/* Room Count Input Box */}
              <div className="bg-[#161619] p-4 rounded-xl border border-[#232328]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                      {t("room_count")}
                    </label>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {t("total_participants_hint", {
                        count: assignableParticipants.length,
                      })}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRoomCount((c) => Math.max(1, c - 1))}
                      className="w-6 h-6 pb-1 rounded-lg bg-[#232328] hover:bg-[#2e2e34] border border-[#232328] text-white flex items-center justify-center font-bold text-base transition-colors cursor-pointer"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={roomCount}
                      onChange={(e) => setRoomCount(Math.max(1, Number(e.target.value)))}
                      className="w-14 h-8 bg-[#111113] border border-[#232328] text-white text-center font-mono font-bold text-sm rounded-lg focus:border-blue-500 outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setRoomCount((c) => c + 1)}
                      className="w-6 h-6 pb-1 rounded-lg bg-[#232328] hover:bg-[#2e2e34] border border-[#232328] text-white flex items-center justify-center font-bold text-base transition-colors cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>

                {mode === "auto" && assignableParticipants.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[#232328] flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">{t("expected_distribution")}</span>
                    <span className="text-blue-400 font-semibold">
                      {t("auto_calc_hint", {
                        count: Math.ceil(assignableParticipants.length / Math.max(1, roomCount)),
                      })}
                    </span>
                  </div>
                )}
              </div>

              {/* Mode Selection Cards */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                  {t("mode_title")}
                </label>

                {/* Option 1: Auto */}
                <div
                  onClick={() => setMode("auto")}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${mode === "auto"
                    ? "border-blue-500 bg-blue-500/10 shadow-md shadow-blue-500/5"
                    : "border-[#232328] bg-[#161619] hover:border-[#333338] hover:bg-[#1a1a1e]"
                    }`}
                >
                  <div
                    className={`p-2 rounded-lg shrink-0 mt-0.5 ${mode === "auto"
                      ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30"
                      : "bg-[#232328] border border-[#232328] text-slate-400"
                      }`}
                  >
                    <Wand2 size={17} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-bold ${mode === "auto" ? "text-blue-400" : "text-slate-200"
                          }`}
                      >
                        {t("mode_auto")}
                      </span>
                      <div
                        className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${mode === "auto" ? "border-blue-500 bg-blue-500" : "border-slate-600"
                          }`}
                      >
                        {mode === "auto" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      {t("mode_auto_desc")}
                    </p>
                  </div>
                </div>

                {/* Option 2: Manual */}
                <div
                  onClick={() => setMode("manual")}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${mode === "manual"
                    ? "border-blue-500 bg-blue-500/10 shadow-md shadow-blue-500/5"
                    : "border-[#232328] bg-[#161619] hover:border-[#333338] hover:bg-[#1a1a1e]"
                    }`}
                >
                  <div
                    className={`p-2 rounded-lg shrink-0 mt-0.5 ${mode === "manual"
                      ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30"
                      : "bg-[#232328] border border-[#232328] text-slate-400"
                      }`}
                  >
                    <Hand size={17} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-bold ${mode === "manual" ? "text-blue-400" : "text-slate-200"
                          }`}
                      >
                        {t("mode_manual")}
                      </span>
                      <div
                        className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${mode === "manual" ? "border-blue-500 bg-blue-500" : "border-slate-600"
                          }`}
                      >
                        {mode === "manual" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      {t("mode_manual_desc")}
                    </p>
                  </div>
                </div>

                {/* Option 3: Free choose */}
                <div
                  onClick={() => setMode("free_choose")}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${mode === "free_choose"
                    ? "border-blue-500 bg-blue-500/10 shadow-md shadow-blue-500/5"
                    : "border-[#232328] bg-[#161619] hover:border-[#333338] hover:bg-[#1a1a1e]"
                    }`}
                >
                  <div
                    className={`p-2 rounded-lg shrink-0 mt-0.5 ${mode === "free_choose"
                      ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30"
                      : "bg-[#232328] border border-[#232328] text-slate-400"
                      }`}
                  >
                    <Sparkles size={17} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-bold ${mode === "free_choose" ? "text-blue-400" : "text-slate-200"
                          }`}
                      >
                        {t("mode_free")}
                      </span>
                      <div
                        className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${mode === "free_choose" ? "border-blue-500 bg-blue-500" : "border-slate-600"
                          }`}
                      >
                        {mode === "free_choose" && (
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      {t("mode_free_desc")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 2: ASSIGNMENT & ROOM MANAGEMENT (ZOOM-STYLE LIST) ================= */}
          {step === 2 && (
            <div className="flex-1 min-h-0 h-0 flex flex-col overflow-hidden">
              {/* Step 2 Top Sub-Bar */}
              <div className="px-5 py-2.5 border-b border-[#232328] bg-[#161619] flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  {mode !== "free_choose" && (
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded truncate ${unassignedParticipants.length > 0
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                        : "bg-[#232328] text-slate-400 border border-[#232328]"
                        }`}
                    >
                      {t("unassigned_count", {
                        count: unassignedParticipants.length,
                      })}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Shuffle again (Auto mode only) */}
                  {mode === "auto" && (
                    <button
                      onClick={handleShuffleAgain}
                      className="px-2.5 py-1 bg-[#1a1a1e] hover:bg-[#232328] text-slate-300 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-[#232328] transition-colors cursor-pointer"
                      title={t("shuffle_again")}
                    >
                      <RefreshCw size={12} /> {t("shuffle_again")}
                    </button>
                  )}

                  {/* Expand / Collapse all toggle */}
                  <button
                    onClick={toggleAllRooms}
                    className="px-2 py-1 text-slate-400 hover:text-slate-200 hover:bg-[#232328] rounded-lg text-xs font-medium transition-colors cursor-pointer"
                    title={
                      expandedRoomIds.size === rooms.length
                        ? t("collapse_all")
                        : t("expand_all")
                    }
                  >
                    {expandedRoomIds.size === rooms.length ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )}
                  </button>

                  {/* Add Room button */}
                  <button
                    onClick={handleAddRoom}
                    className="px-2.5 py-1 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 hover:text-blue-300 border border-blue-500/30 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Plus size={13} /> {t("add_room")}
                  </button>
                </div>
              </div>

              {/* Step 2 Rooms Vertical List Content (Zoom-Style Accordion) */}
              <div
                className="h-0 flex-1 min-h-0 overflow-y-auto bg-[#111113] p-4 flex flex-col gap-2.5 custom-scrollbar"
              >
                {mode === "free_choose" && (
                  <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-300 text-xs flex items-center gap-2">
                    <Sparkles size={16} className="shrink-0 text-blue-400" />
                    <span>{t("free_choose_notice")}</span>
                  </div>
                )}

                {/* Vertical Rooms List */}
                {rooms.map((room) => {
                  const isExpanded = expandedRoomIds.has(room.id);
                  const isEditing = editingRoomId === room.id;

                  return (
                    <div
                      key={room.id}
                      className="shrink-0 bg-[#161619] border border-[#232328] rounded-xl overflow-hidden shadow-sm transition-colors hover:border-[#333338]"
                    >
                      {/* Room Item Header Row */}
                      <div
                        className={`px-3.5 py-2.5 flex items-center justify-between gap-2 select-none cursor-pointer transition-colors ${isExpanded ? "bg-[#1a1a1e] border-b border-[#232328]" : "bg-[#161619] hover:bg-[#1a1a1e]"
                          }`}
                        onClick={() => toggleRoomExpand(room.id)}
                      >
                        {/* Left: Expand Chevron + Room Name & Count */}
                        <div
                          className="flex items-center gap-2 min-w-0 flex-1"
                          onClick={(e) => {
                            if (isEditing) e.stopPropagation();
                          }}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRoomExpand(room.id);
                            }}
                            className="p-1 -ml-1 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
                          >
                            {isExpanded ? (
                              <ChevronDown size={16} className="text-slate-300" />
                            ) : (
                              <ChevronRight size={16} className="text-slate-400" />
                            )}
                          </button>

                          {isEditing ? (
                            <div
                              className="flex items-center gap-1.5 flex-1 max-w-[240px]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="text"
                                autoFocus
                                value={editingRoomName}
                                onChange={(e) => setEditingRoomName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveRoomName(room.id);
                                  if (e.key === "Escape") setEditingRoomId(null);
                                }}
                                className="w-full bg-[#111113] border border-blue-500 text-white text-xs font-bold rounded px-2 py-1 outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveRoomName(room.id)}
                                className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded cursor-pointer"
                              >
                                <Check size={14} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 min-w-0 truncate">
                              <span className="font-bold text-xs text-white truncate">
                                {room.name}
                              </span>

                              {mode !== "free_choose" && (
                                <span className="text-[11px] font-medium text-slate-400">
                                  ({room.assignedUserIds.length})
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Right: Room Action Buttons */}
                        <div
                          className="flex items-center gap-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* "+ Chỉ định" / Add participants button */}
                          {mode !== "free_choose" && (
                            <button
                              type="button"
                              onClick={() => handleOpenAddModal(room.id)}
                              className="px-2 py-1 text-xs font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                              title={t("add_participants")}
                            >
                              <UserPlus size={13} />
                              <span className="hidden sm:inline">{t("assign_participants")}</span>
                            </button>
                          )}

                          {/* Rename Room button */}
                          <button
                            type="button"
                            onClick={() => handleStartRenameRoom(room.id, room.name)}
                            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-[#232328] rounded-md transition-colors cursor-pointer"
                            title={t("rename_room")}
                          >
                            <Edit2 size={13} />
                          </button>

                          {/* Delete Room button */}
                          <button
                            type="button"
                            onClick={() => handleDeleteRoom(room.id)}
                            disabled={rooms.length <= 1}
                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:hover:text-slate-400 disabled:hover:bg-transparent rounded-md transition-colors cursor-pointer"
                            title={t("delete_room_tooltip")}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Room Sub-Rows */}
                      {isExpanded && (
                        <div className="divide-y divide-[#232328] bg-[#131315]">
                          {mode === "free_choose" ? (
                            <div className="py-3 px-4 text-center text-slate-500 text-xs italic flex items-center justify-center gap-2">
                              <Users size={14} className="text-slate-500" />
                              <span>{t("mode_free_desc")}</span>
                            </div>
                          ) : room.assignedUserIds.length === 0 ? (
                            <div className="py-2.5 px-4 pl-9 flex items-center justify-between text-xs text-slate-500 italic">
                              <span>{t("no_participants")}</span>
                              <button
                                type="button"
                                onClick={() => handleOpenAddModal(room.id)}
                                className="not-italic text-[11px] font-semibold text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 cursor-pointer"
                              >
                                <Plus size={12} /> {t("add_participants")}
                              </button>
                            </div>
                          ) : (
                            room.assignedUserIds.map((userId) => {
                              const pInfo = getParticipantInfo(userId);
                              const isMenuOpen = activeMenuUserId === userId;

                              return (
                                <div key={userId} className="flex flex-col">
                                  {/* Participant Main Row */}
                                  <div
                                    className={`relative flex items-center justify-between pl-8 pr-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-[#1a1a1e] group ${isMenuOpen ? "bg-[#1a1a1e]" : ""
                                      }`}
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <div className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 shadow-sm">
                                        {pInfo.initial}
                                      </div>
                                      <span className="truncate text-xs text-slate-200">
                                        {pInfo.name}
                                      </span>
                                    </div>

                                    {/* Action Menu Trigger (3 Dots) */}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (isMenuOpen) {
                                          setActiveMenuUserId(null);
                                          setActiveSubMenu(null);
                                        } else {
                                          setActiveMenuUserId(userId);
                                          setActiveSubMenu(null);
                                        }
                                      }}
                                      className={`p-1 rounded text-slate-400 hover:text-white hover:bg-[#232328] transition-colors cursor-pointer ${isMenuOpen
                                        ? "text-white bg-[#232328]"
                                        : "opacity-60 group-hover:opacity-100"
                                        }`}
                                      title={t("options_button")}
                                    >
                                      <MoreVertical size={13} />
                                    </button>
                                  </div>

                                  {/* In-Flow Action Panel */}
                                  {isMenuOpen && (
                                    <div
                                      onClick={(e) => e.stopPropagation()}
                                      className="mx-3.5 my-2 p-2 bg-[#111113] border border-[#232328] rounded-xl flex flex-col gap-1.5 shadow-inner animate-in fade-in slide-in-from-top-1 duration-150"
                                    >
                                      {/* Option 1: Remove from room */}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleRemoveParticipant(room.id, userId);
                                          setActiveMenuUserId(null);
                                        }}
                                        className="w-full px-2.5 py-1.5 rounded-lg text-left text-xs font-semibold text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-colors cursor-pointer"
                                      >
                                        <UserMinus size={13} />
                                        {t("remove_from_room")}
                                      </button>

                                      {/* Option 2: Move to another room */}
                                      <div className="flex flex-col">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setActiveSubMenu((prev) =>
                                              prev === "move" ? null : "move",
                                            )
                                          }
                                          className={`w-full px-2.5 py-1.5 rounded-lg text-left text-xs font-semibold flex items-center justify-between gap-2 transition-colors cursor-pointer ${activeSubMenu === "move"
                                            ? "bg-[#1a1a1e] text-blue-400"
                                            : "text-slate-300 hover:bg-[#1a1a1e]"
                                            }`}
                                        >
                                          <div className="flex items-center gap-2">
                                            <ArrowRightCircle size={13} />
                                            {t("move_to_room")}
                                          </div>
                                          <ChevronDown
                                            size={12}
                                            className={`transition-transform opacity-60 ${activeSubMenu === "move" ? "rotate-180" : ""
                                              }`}
                                          />
                                        </button>

                                        {activeSubMenu === "move" && (
                                          <div
                                            className="mt-1 ml-2 pl-2 border-l border-[#232328] flex flex-col gap-1 max-h-48 overflow-y-auto custom-scrollbar py-1"
                                          >
                                            {rooms
                                              .filter((r) => r.id !== room.id)
                                              .map((otherRoom) => (
                                                <button
                                                  key={otherRoom.id}
                                                  type="button"
                                                  onClick={() => {
                                                    handleMoveParticipant(
                                                      room.id,
                                                      otherRoom.id,
                                                      userId,
                                                    );
                                                    setActiveMenuUserId(null);
                                                  }}
                                                  className="w-full px-2 py-1 text-left text-xs font-medium text-slate-300 hover:text-white hover:bg-blue-600/20 rounded truncate transition-colors flex items-center justify-between gap-2 cursor-pointer"
                                                >
                                                  <span className="truncate">{otherRoom.name}</span>
                                                  <span className="text-[10px] text-slate-500 shrink-0">
                                                    ({otherRoom.assignedUserIds.length})
                                                  </span>
                                                </button>
                                              ))}
                                          </div>
                                        )}
                                      </div>

                                      {/* Option 3: Exchange with participant in another room */}
                                      <div className="flex flex-col">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setActiveSubMenu((prev) =>
                                              prev === "exchange" ? null : "exchange",
                                            )
                                          }
                                          className={`w-full px-2.5 py-1.5 rounded-lg text-left text-xs font-semibold flex items-center justify-between gap-2 transition-colors cursor-pointer ${activeSubMenu === "exchange"
                                            ? "bg-[#1a1a1e] text-amber-400"
                                            : "text-slate-300 hover:bg-[#1a1a1e]"
                                            }`}
                                        >
                                          <div className="flex items-center gap-2">
                                            <ArrowRightLeft size={13} />
                                            {t("exchange_with")}
                                          </div>
                                          <ChevronDown
                                            size={12}
                                            className={`transition-transform opacity-60 ${activeSubMenu === "exchange" ? "rotate-180" : ""
                                              }`}
                                          />
                                        </button>

                                        {activeSubMenu === "exchange" && (
                                          <div
                                            className="mt-1 ml-2 pl-2 border-l border-[#232328] flex flex-col gap-1.5 max-h-52 overflow-y-auto custom-scrollbar py-1"
                                          >
                                            {rooms
                                              .filter((r) => r.id !== room.id)
                                              .flatMap((otherRoom) =>
                                                otherRoom.assignedUserIds.map((otherUid) => ({
                                                  room: otherRoom,
                                                  uid: otherUid,
                                                  info: getParticipantInfo(otherUid),
                                                })),
                                              )
                                              .map(({ room: oRoom, uid: oUid, info: oInfo }) => (
                                                <button
                                                  key={oUid}
                                                  type="button"
                                                  onClick={() => {
                                                    handleExchangeParticipant(
                                                      room.id,
                                                      userId,
                                                      oRoom.id,
                                                      oUid,
                                                    );
                                                    setActiveMenuUserId(null);
                                                  }}
                                                  className="w-full px-2 py-1 text-left text-xs font-medium text-slate-300 hover:text-white hover:bg-amber-500/20 rounded flex items-center justify-between gap-2 transition-colors cursor-pointer"
                                                >
                                                  <span className="truncate">{oInfo.name}</span>
                                                  <span className="text-[10px] text-slate-500 shrink-0">
                                                    ({oRoom.name})
                                                  </span>
                                                </button>
                                              ))}

                                            {rooms.filter(
                                              (r) =>
                                                r.id !== room.id &&
                                                r.assignedUserIds.length > 0,
                                            ).length === 0 && (
                                                <p className="text-[10px] text-slate-500 italic p-1">
                                                  {t("no_other_participants")}
                                                </p>
                                              )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================= MULTI-SELECT ADD PARTICIPANTS MODAL ================= */}
          {addModalTargetRoomId && targetRoomForAdd && (
            <div className="absolute inset-0 z-60 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm bg-[#161619] border border-[#232328] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-in"
              >
                {/* Header */}
                <div className="px-4 py-3 border-b border-[#232328] flex items-center justify-between bg-[#111113]">
                  <div>
                    <h3 className="text-xs font-bold text-white">
                      {t("select_participants_title", {
                        roomName: targetRoomForAdd.name,
                      })}
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      {t("unassigned_count", {
                        count: unassignedParticipants.length,
                      })}
                    </p>
                  </div>
                  <button
                    onClick={() => setAddModalTargetRoomId(null)}
                    className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-[#232328] transition-colors"
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* Search & Select All */}
                <div className="p-2.5 border-b border-[#232328] bg-[#111113] flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search
                      size={13}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      placeholder={t("search_participant")}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full h-7 pl-7 pr-2.5 bg-[#161619] border border-[#232328] text-white text-xs rounded-lg focus:border-blue-500 outline-none"
                    />
                  </div>

                  {filteredUnassigned.length > 0 && (
                    <button
                      onClick={() => {
                        if (selectedUserIdsToAdd.length === filteredUnassigned.length) {
                          setSelectedUserIdsToAdd([]);
                        } else {
                          setSelectedUserIdsToAdd(filteredUnassigned.map((p) => p.identity));
                        }
                      }}
                      className="px-2 py-1 bg-[#1a1a1e] hover:bg-[#232328] text-slate-300 text-[11px] font-semibold rounded-lg shrink-0 border border-[#232328] transition-colors"
                    >
                      {selectedUserIdsToAdd.length === filteredUnassigned.length
                        ? t("deselect_all")
                        : t("select_all")}
                    </button>
                  )}
                </div>

                {/* Participant List */}
                <div
                  className="p-2.5 max-h-56 overflow-y-auto custom-scrollbar flex flex-col gap-1.5 bg-[#161619]"
                >
                  {filteredUnassigned.length === 0 ? (
                    <div className="text-center py-6 text-slate-500 text-xs italic">
                      {t("no_unassigned_found")}
                    </div>
                  ) : (
                    filteredUnassigned.map((p) => {
                      const isSelected = selectedUserIdsToAdd.includes(p.identity);
                      return (
                        <div
                          key={p.identity}
                          onClick={() => handleToggleUserSelection(p.identity)}
                          className={`p-2 rounded-lg border cursor-pointer flex items-center justify-between gap-2.5 transition-colors ${isSelected
                            ? "bg-blue-600/15 border-blue-500/50 text-white"
                            : "bg-[#111113] border-[#232328] hover:border-[#333338] text-slate-300 hover:bg-[#1a1a1e]"
                            }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                              {(p.name || p.identity).charAt(0).toUpperCase()}
                            </div>
                            <span className="text-xs font-medium truncate">
                              {p.name || p.identity}
                            </span>
                          </div>

                          <div className="shrink-0 text-blue-400">
                            {isSelected ? (
                              <CheckSquare size={16} />
                            ) : (
                              <Square size={16} className="text-slate-500" />
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer */}
                <div className="p-2.5 border-t border-[#232328] bg-[#111113] flex items-center justify-end gap-2">
                  <button
                    onClick={() => setAddModalTargetRoomId(null)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-[#232328] rounded-lg transition-colors"
                  >
                    {t("cancel")}
                  </button>
                  <button
                    onClick={handleConfirmAddUsers}
                    disabled={selectedUserIdsToAdd.length === 0}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold rounded-lg shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5"
                  >
                    <Plus size={13} />
                    {t("add_selected", { count: selectedUserIdsToAdd.length })}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="px-5 py-3.5 border-t border-[#232328] bg-[#111113] flex items-center justify-between shrink-0 relative">
          <div className="flex items-center gap-2">
            {step === 2 && (
              <>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white hover:bg-[#232328] rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <ArrowLeft size={14} /> {t("btn_back")}
                </button>

                {/* Settings / Options Button (Zoom-Style Options Gear) */}
                <div className="relative" ref={settingsRef}>
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen((prev) => !prev)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all ${isSettingsOpen || isAutoCloseEnabled
                      ? "bg-blue-600/15 border-blue-500/40 text-blue-400"
                      : "bg-[#161619] border-[#232328] text-slate-300 hover:text-white hover:bg-[#232328]"
                      }`}
                    title={t("options_button")}
                  >
                    <Settings size={13} className={isAutoCloseEnabled ? "text-blue-400" : ""} />
                    <span>{t("options_button")}</span>
                    {isAutoCloseEnabled && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    )}
                  </button>

                  {/* Settings Popover / Dropdown Menu */}
                  {isSettingsOpen && (
                    <div className="absolute left-0 bottom-full mb-2 z-70 w-80 bg-[#161619] border border-[#232328] rounded-xl shadow-2xl p-3.5 flex flex-col gap-3 animate-scale-in">
                      <div className="flex items-center justify-between border-b border-[#232328] pb-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                          <Settings size={14} className="text-blue-400" />
                          <span>{t("options_title")}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsSettingsOpen(false)}
                          className="text-slate-400 hover:text-white p-0.5 rounded hover:bg-[#232328] transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>

                      {/* Auto close option */}
                      <div className="flex flex-col gap-2">
                        <label className="flex items-start gap-2.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isAutoCloseEnabled}
                            onChange={(e) => setIsAutoCloseEnabled(e.target.checked)}
                            className="mt-0.5 rounded border-[#232328] text-blue-600 focus:ring-0 focus:ring-offset-0 bg-[#111113]"
                          />
                          <div className="text-xs text-slate-200">
                            <span>{t("auto_close_checkbox")}</span>
                            <div className="flex items-center gap-1.5 mt-2">
                              <input
                                type="number"
                                min={1}
                                max={300}
                                disabled={!isAutoCloseEnabled}
                                value={autoCloseMinutes}
                                onChange={(e) =>
                                  setAutoCloseMinutes(Math.max(1, Number(e.target.value)))
                                }
                                className="w-14 h-7 bg-[#111113] border border-[#232328] disabled:opacity-40 text-white text-center font-mono font-bold text-xs rounded focus:border-blue-500 outline-none"
                              />
                              <span className="text-slate-400 text-xs">{t("minutes_unit")}</span>
                            </div>
                          </div>
                        </label>
                      </div>

                      <div className="pt-2 border-t border-[#232328] flex items-center justify-between text-[11px] text-slate-400">
                        <span>{t("status_label")}</span>
                        <span className="font-semibold text-slate-300">
                          {isAutoCloseEnabled
                            ? t("time_limit", { count: autoCloseMinutes })
                            : t("unlimited_time")}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-[#232328] rounded-lg transition-colors"
            >
              {t("cancel")}
            </button>

            {step === 1 ? (
              <button
                onClick={handleProceedToStep2}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-lg shadow-blue-500/20 transition-all"
              >
                {t("btn_next")}
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={isLoading}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-lg shadow-blue-500/20 transition-all"
              >
                {isLoading && <Loader2 size={14} className="animate-spin" />}
                {t("start_breakout")}
              </button>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

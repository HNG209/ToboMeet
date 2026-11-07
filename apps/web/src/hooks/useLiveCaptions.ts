"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Room } from "livekit-client";

export interface LiveCaptionItem {
  id: string;
  text: string;
  speakerId?: string;
  speakerName?: string;
  isFinal: boolean;
  timestamp: number;
}

function normalizeCaptionText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,!?;:…"'“”()[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function useLiveCaptions(room: Room | undefined, enabled: boolean) {
  const [captions, setCaptions] = useState<LiveCaptionItem[]>([]);
  const roomRef = useRef<Room | undefined>(room);
  roomRef.current = room;

  const resolveSpeakerName = useCallback(
    (speakerId?: string, fallbackName?: string) => {
      if (fallbackName && fallbackName.trim()) {
        return fallbackName;
      }
      const currentRoom = roomRef.current;
      if (!currentRoom || !speakerId) {
        return "Người tham gia";
      }

      if (currentRoom.localParticipant?.identity === speakerId) {
        return currentRoom.localParticipant.name || "Bạn";
      }

      const remote = currentRoom.getParticipantByIdentity(speakerId);
      return remote?.name || speakerId;
    },
    [],
  );

  const upsertCaption = useCallback(
    (
      id: string,
      text: string,
      isFinal: boolean,
      speakerId?: string,
      rawSpeakerName?: string,
      timestamp?: number,
    ) => {
      const cleanText = text.trim();
      if (!cleanText) return;

      const speakerName = resolveSpeakerName(speakerId, rawSpeakerName);
      const now = timestamp || Date.now();

      setCaptions((prev) => {
        const item: LiveCaptionItem = {
          id,
          text: cleanText,
          speakerId,
          speakerName,
          isFinal,
          timestamp: now,
        };

        // 1. Nếu trùng ID chính xác -> cập nhật
        const existingIndex = prev.findIndex((c) => c.id === id);
        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = item;
          return next;
        }

        // 2. Tìm câu gần nhất của cùng một người nói để chống trùng lặp
        let lastSpeakerIdx = -1;
        for (let i = prev.length - 1; i >= 0; i--) {
          const p = prev[i];
          if (
            (speakerId && p.speakerId && p.speakerId === speakerId) ||
            (speakerName && p.speakerName && p.speakerName === speakerName)
          ) {
            lastSpeakerIdx = i;
            break;
          }
        }

        if (lastSpeakerIdx >= 0) {
          const lastItem = prev[lastSpeakerIdx];
          const normPrev = normalizeCaptionText(lastItem.text);
          const normCurr = normalizeCaptionText(cleanText);

          // a. Nếu câu trước là interim (chưa chốt) -> thay thế luôn bằng câu mới (kể cả khác ID)
          if (!lastItem.isFinal) {
            const next = [...prev];
            next[lastSpeakerIdx] = item;
            return next;
          }

          // b. Nếu nội dung giống hệt câu trước của cùng người nói -> cập nhật chứ không thêm mới
          if (normPrev === normCurr) {
            const next = [...prev];
            next[lastSpeakerIdx] = item;
            return next;
          }

          // c. Nếu câu mới là phần mở rộng trực tiếp của câu trước trong thời gian ngắn (< 3.5s)
          const isRecent = Math.abs(now - lastItem.timestamp) < 3500;
          if (isRecent && normCurr.startsWith(normPrev)) {
            const next = [...prev];
            next[lastSpeakerIdx] = item;
            return next;
          }
        }

        // 3. Câu mới hoàn toàn -> giữ tối đa 50 câu gần nhất
        return [...prev.slice(-49), item];
      });
    },
    [resolveSpeakerName],
  );

  useEffect(() => {
    if (!room || !enabled) return;

    const streamHandler = async (
      reader: any,
      participantInfo: { identity?: string },
    ) => {
      try {
        const text = await reader.readAll();
        if (!text?.trim()) return;

        const info = reader.info;
        const attributes = info?.attributes || {};
        const segmentId =
          attributes["lk.transcription_segment_id"] ||
          info?.id ||
          `seg_${Date.now()}`;
        const isFinal = attributes["lk.transcription_final"] === "true";
        const speakerId = attributes["speaker_id"] || participantInfo?.identity;
        const speakerName = attributes["speaker_name"];

        upsertCaption(segmentId, text, isFinal, speakerId, speakerName);
      } catch (err) {
        console.error("[useLiveCaptions] Error reading text stream:", err);
      }
    };

    try {
      room.registerTextStreamHandler?.("lk.transcription", streamHandler);
    } catch (e) {
      console.warn("[useLiveCaptions] Could not register text stream handler:", e);
    }

    return () => {
      try {
        room.unregisterTextStreamHandler?.("lk.transcription");
      } catch { }
    };
  }, [room, enabled, upsertCaption]);

  // Khi tắt phụ đề -> xóa danh sách
  useEffect(() => {
    if (!enabled) {
      setCaptions([]);
    }
  }, [enabled]);

  const clearCaptions = useCallback(() => {
    setCaptions([]);
  }, []);

  return {
    captions,
    clearCaptions,
  };
}
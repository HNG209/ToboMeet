import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  Image,
  Animated,
  PanResponder,
  TouchableOpacity,
  LayoutChangeEvent,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { Track, VideoTrack } from "livekit-client";
import { useHandRaise } from "../../hooks/useHandRaise";
import { VideoView } from "@livekit/react-native";

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.2;
const DOUBLE_TAP_DELAY = 280;
const EDGE_SNAP_THRESHOLD = 12;

function getTouchDistance(
  t1: { pageX: number; pageY: number },
  t2: { pageX: number; pageY: number },
) {
  const dx = t1.pageX - t2.pageX;
  const dy = t1.pageY - t2.pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

// COMPONENT: Ô VIDEO TÁI SỬ DỤNG (TILE)
export default function ParticipantTile({
  trackRef,
  onZoomChange,
}: {
  trackRef: any;
  onZoomChange?: (zoomed: boolean) => void;
}) {
  const publication = trackRef.publication;
  const isScreenShare = trackRef.source === Track.Source.ScreenShare;
  const isRemoteScreenShare =
    isScreenShare && !trackRef.participant?.isLocal;

  const [videoTrack, setVideoTrack] = useState(
    publication?.track as VideoTrack | undefined,
  );

  const isMuted = publication?.isMuted ?? false;
  const showVideo = !!videoTrack && !isMuted;
  const canZoom = isRemoteScreenShare && showVideo;

  const { getHandState } = useHandRaise();
  const handState = getHandState(trackRef.participant);

  // State & Animated values cho pinch-to-zoom & pan trên Screen Share của người khác
  const [zoomPercent, setZoomPercent] = useState(100);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const translateXAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(0)).current;

  const scaleRef = useRef(1);
  const posRef = useRef({ x: 0, y: 0 });
  const containerSizeRef = useRef({ width: 0, height: 0 });
  const isZoomedReportedRef = useRef(false);

  // Refs theo dõi gesture hiện tại
  const pinchInitialDistRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef(1);
  const pinchStartPosRef = useRef({ x: 0, y: 0 });
  const panStartPosRef = useRef({ x: 0, y: 0 });
  const lastTapTimeRef = useRef(0);
  const wasMultiTouchRef = useRef(false);
  const canZoomRef = useRef(canZoom);
  canZoomRef.current = canZoom;

  const videoTrackRef = useRef(videoTrack);
  videoTrackRef.current = videoTrack;

  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;

  const notifyZoomState = useCallback((nextScale: number) => {
    const zoomed = nextScale > 1.02;
    if (isZoomedReportedRef.current !== zoomed) {
      isZoomedReportedRef.current = zoomed;
      onZoomChangeRef.current?.(zoomed);
    }
    setZoomPercent(Math.round(nextScale * 100));
  }, []);

  /**
   * Tính giới hạn pan (maxX, maxY) theo kích thước thật của video (objectFit="contain")
   * để video luôn áp sát các cạnh khung nhìn, không bị kéo trôi ra khỏi màn hình.
   */
  const getPanBounds = useCallback((targetScale: number) => {
    const { width: containerW, height: containerH } = containerSizeRef.current;
    if (containerW <= 0 || containerH <= 0 || targetScale <= 1) {
      return { maxX: 0, maxY: 0 };
    }

    let renderedW = containerW;
    let renderedH = containerH;

    const dims = (videoTrackRef.current as any)?.dimensions;
    const vw = dims?.width || 0;
    const vh = dims?.height || 0;

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

    const maxX = Math.max(0, (renderedW * targetScale - containerW) / 2);
    const maxY = Math.max(0, (renderedH * targetScale - containerH) / 2);
    return { maxX, maxY };
  }, []);

  const clampPos = useCallback(
    (
      nextPos: { x: number; y: number },
      targetScale: number,
      snapThreshold = 0,
    ) => {
      if (targetScale <= 1) return { x: 0, y: 0 };
      const { maxX, maxY } = getPanBounds(targetScale);

      let x = Math.min(Math.max(nextPos.x, -maxX), maxX);
      let y = Math.min(Math.max(nextPos.y, -maxY), maxY);

      if (snapThreshold > 0) {
        if (maxX > 0 && maxX - Math.abs(x) <= snapThreshold) {
          x = x >= 0 ? maxX : -maxX;
        }
        if (maxY > 0 && maxY - Math.abs(y) <= snapThreshold) {
          y = y >= 0 ? maxY : -maxY;
        }
      }

      return { x, y };
    },
    [getPanBounds],
  );

  const applyTransform = useCallback(
    (nextScale: number, nextPos: { x: number; y: number }, animated = false) => {
      const clampedScale = Math.min(Math.max(MIN_SCALE, nextScale), MAX_SCALE);
      const clampedPos =
        clampedScale <= 1.01 ? { x: 0, y: 0 } : clampPos(nextPos, clampedScale);
      const finalScale = clampedScale <= 1.01 ? 1 : clampedScale;

      scaleRef.current = finalScale;
      posRef.current = clampedPos;

      if (animated) {
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: finalScale,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.timing(translateXAnim, {
            toValue: clampedPos.x,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.timing(translateYAnim, {
            toValue: clampedPos.y,
            duration: 180,
            useNativeDriver: true,
          }),
        ]).start();
      } else {
        scaleAnim.setValue(finalScale);
        translateXAnim.setValue(clampedPos.x);
        translateYAnim.setValue(clampedPos.y);
      }

      notifyZoomState(finalScale);
    },
    [clampPos, notifyZoomState, scaleAnim, translateXAnim, translateYAnim],
  );

  const resetZoom = useCallback(
    (animated = true) => {
      applyTransform(1, { x: 0, y: 0 }, animated);
    },
    [applyTransform],
  );

  // Reset zoom khi track kết thúc hoặc component unmount
  useEffect(() => {
    if (!canZoom) {
      resetZoom(false);
    }
  }, [canZoom, resetZoom]);

  useEffect(() => {
    return () => {
      if (isZoomedReportedRef.current) {
        isZoomedReportedRef.current = false;
        onZoomChangeRef.current?.(false);
      }
    };
  }, []);

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      containerSizeRef.current = { width, height };
      if (scaleRef.current > 1) {
        const clamped = clampPos(posRef.current, scaleRef.current);
        posRef.current = clamped;
        translateXAnim.setValue(clamped.x);
        translateYAnim.setValue(clamped.y);
      }
    },
    [clampPos, translateXAnim, translateYAnim],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) => {
          if (!canZoomRef.current) return false;
          return evt.nativeEvent.touches.length >= 2;
        },
        onStartShouldSetPanResponderCapture: (evt) => {
          if (!canZoomRef.current) return false;
          // Chặn ngay khi chạm 2 ngón (pinch) để TouchableOpacity / FlatList không nuốt sự kiện
          return evt.nativeEvent.touches.length >= 2;
        },
        onMoveShouldSetPanResponder: (evt, gestureState) => {
          if (!canZoomRef.current) return false;
          const touches = evt.nativeEvent.touches;
          if (touches.length >= 2) return true;
          // Chỉ chiếm quyền kéo 1 ngón khi đang zoom > 1x; nếu 1x nhường cho FlatList vuốt chuyển trang
          if (
            scaleRef.current > 1.02 &&
            (Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4)
          ) {
            return true;
          }
          return false;
        },
        onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
          if (!canZoomRef.current) return false;
          const touches = evt.nativeEvent.touches;
          if (touches.length >= 2) return true;
          // Giành lại quyền kéo 1 ngón từ TouchableOpacity bên trong khi đang zoom > 1x
          if (
            scaleRef.current > 1.02 &&
            (Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4)
          ) {
            return true;
          }
          return false;
        },
        onPanResponderTerminationRequest: () => {
          // Không cho FlatList cướp gesture khi đang pinch hoặc đang zoom > 1x
          return scaleRef.current <= 1.02 && pinchInitialDistRef.current === null;
        },
        onPanResponderGrant: (evt) => {
          const touches = evt.nativeEvent.touches;
          if (touches.length >= 2) {
            wasMultiTouchRef.current = true;
            pinchInitialDistRef.current = getTouchDistance(
              touches[0],
              touches[1],
            );
            pinchStartScaleRef.current = scaleRef.current;
            pinchStartPosRef.current = { ...posRef.current };
          } else {
            wasMultiTouchRef.current = false;
            pinchInitialDistRef.current = null;
            panStartPosRef.current = { ...posRef.current };
          }
        },
        onPanResponderMove: (evt, gestureState) => {
          if (!canZoomRef.current) return;
          const touches = evt.nativeEvent.touches;

          if (touches.length >= 2) {
            wasMultiTouchRef.current = true;
            const currentDist = getTouchDistance(touches[0], touches[1]);
            if (pinchInitialDistRef.current === null) {
              pinchInitialDistRef.current = currentDist;
              pinchStartScaleRef.current = scaleRef.current;
              pinchStartPosRef.current = { ...posRef.current };
              return;
            }
            if (pinchInitialDistRef.current <= 0) return;

            const ratio = currentDist / pinchInitialDistRef.current;
            const nextScale = Math.min(
              Math.max(MIN_SCALE, pinchStartScaleRef.current * ratio),
              MAX_SCALE,
            );
            const scaleFactor = nextScale / pinchStartScaleRef.current;
            const scaledPos = {
              x: pinchStartPosRef.current.x * scaleFactor,
              y: pinchStartPosRef.current.y * scaleFactor,
            };

            applyTransform(nextScale, scaledPos, false);
          } else if (touches.length === 1 && scaleRef.current > 1.02) {
            // Nếu vừa chuyển từ 2 ngón xuống 1 ngón, cập nhật mốc kéo để tránh bị nhảy
            if (pinchInitialDistRef.current !== null) {
              pinchInitialDistRef.current = null;
              panStartPosRef.current = {
                x: posRef.current.x - gestureState.dx,
                y: posRef.current.y - gestureState.dy,
              };
            }

            const nextPos = {
              x: panStartPosRef.current.x + gestureState.dx,
              y: panStartPosRef.current.y + gestureState.dy,
            };
            applyTransform(scaleRef.current, nextPos, false);
          }
        },
        onPanResponderRelease: (_evt, gestureState) => {
          pinchInitialDistRef.current = null;

          // Kiểm tra double-tap (chỉ khi chạm 1 ngón và không kéo)
          if (
            !wasMultiTouchRef.current &&
            Math.abs(gestureState.dx) < 8 &&
            Math.abs(gestureState.dy) < 8
          ) {
            const now = Date.now();
            if (now - lastTapTimeRef.current < DOUBLE_TAP_DELAY) {
              lastTapTimeRef.current = 0;
              if (scaleRef.current > 1.05) {
                resetZoom(true);
              } else {
                applyTransform(DOUBLE_TAP_SCALE, { x: 0, y: 0 }, true);
              }
              return;
            }
            lastTapTimeRef.current = now;
          }

          wasMultiTouchRef.current = false;

          // Snap cạnh khi thả tay ở gần viền khung nhìn
          if (scaleRef.current > 1.02) {
            const snapped = clampPos(
              posRef.current,
              scaleRef.current,
              EDGE_SNAP_THRESHOLD,
            );
            applyTransform(scaleRef.current, snapped, true);
          } else {
            resetZoom(true);
          }
        },
        onPanResponderTerminate: () => {
          pinchInitialDistRef.current = null;
          wasMultiTouchRef.current = false;
        },
      }),
    [applyTransform, clampPos, resetZoom],
  );

  useEffect(() => {
    const track = publication?.track as VideoTrack | undefined;
    setVideoTrack(track);

    // Lắng nghe khi track được attach
    const onSubscribed = () => {
      setVideoTrack(publication?.track as VideoTrack);
    };
    const onUnsubscribed = () => {
      setVideoTrack(undefined);
    };

    publication?.on("subscribed", onSubscribed);
    publication?.on("unsubscribed", onUnsubscribed);

    return () => {
      publication?.off("subscribed", onSubscribed);
      publication?.off("unsubscribed", onUnsubscribed);
    };
  }, [publication]);

  // Xử lý Metadata để lấy Avatar
  let avatarUrl = null;
  try {
    if (trackRef.participant.metadata) {
      const meta = JSON.parse(trackRef.participant.metadata);
      avatarUrl = meta.avatarUrl;
    }
  } catch (error) {
    console.error(error);
  }

  // Hỗ trợ double-tap cả khi ở trạng thái 1x (khi PanResponder chưa capture touch đơn)
  const handleSingleTapFallback = useCallback(() => {
    if (!canZoomRef.current) return;
    const now = Date.now();
    if (now - lastTapTimeRef.current < DOUBLE_TAP_DELAY) {
      lastTapTimeRef.current = 0;
      if (scaleRef.current > 1.05) {
        resetZoom(true);
      } else {
        applyTransform(DOUBLE_TAP_SCALE, { x: 0, y: 0 }, true);
      }
    } else {
      lastTapTimeRef.current = now;
    }
  }, [applyTransform, resetZoom]);

  return (
    <View
      onLayout={handleLayout}
      {...(canZoom ? panResponder.panHandlers : {})}
      style={{
        flex: 1,
        backgroundColor: "#121215",
        borderRadius: 0,
        overflow: "hidden",
        borderWidth: isScreenShare ? 2 : 0,
        borderColor: isScreenShare ? "#3b82f6" : "transparent",
      }}
    >
      {/* VIDEO HOẶC AVATAR */}
      {showVideo ? (
        canZoom ? (
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleSingleTapFallback}
            style={{ flex: 1, backgroundColor: "#0a0a0c" }}
          >
            <Animated.View
              style={{
                flex: 1,
                backgroundColor: "#0a0a0c",
                transform: [
                  { translateX: translateXAnim },
                  { translateY: translateYAnim },
                  { scale: scaleAnim },
                ],
              }}
            >
              <VideoView
                style={{ flex: 1, backgroundColor: "#0a0a0c" }}
                videoTrack={videoTrack}
                objectFit="contain"
              />
            </Animated.View>
          </TouchableOpacity>
        ) : (
          <VideoView
            style={{ flex: 1, backgroundColor: "#0a0a0c" }}
            videoTrack={videoTrack}
            objectFit={isScreenShare ? "contain" : "cover"}
          />
        )
      ) : (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "#121215",
          }}
        >
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={{ width: 64, height: 64, borderRadius: 32 }}
            />
          ) : (
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: "#232328",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Text
                style={{ color: "white", fontSize: 28, fontWeight: "bold" }}
              >
                {trackRef.participant.name?.charAt(0).toUpperCase() || "?"}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* CHỈ BÁO MỨC ZOOM (Bấm vào để reset nhanh về 100%) */}
      {canZoom && zoomPercent > 100 && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => resetZoom(true)}
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            backgroundColor: "rgba(17, 17, 19, 0.85)",
            borderWidth: 1,
            borderColor: "rgba(255, 255, 255, 0.14)",
            paddingHorizontal: 9,
            paddingVertical: 4,
            borderRadius: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            zIndex: 20,
          }}
        >
          <Feather name="zoom-in" size={12} color="#60a5fa" />
          <Text style={{ color: "white", fontSize: 11, fontWeight: "700" }}>
            {zoomPercent}%
          </Text>
          <Feather name="x" size={11} color="#94a3b8" />
        </TouchableOpacity>
      )}

      {/* BADGE GIƠ TAY */}
      {handState.isRaised && (
        <View
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            backgroundColor: "rgba(245, 158, 11, 0.9)",
            paddingHorizontal: 6,
            paddingVertical: 3,
            borderRadius: 4,
            flexDirection: "row",
            alignItems: "center",
            zIndex: 10,
          }}
        >
          <Ionicons
            name="hand-left"
            size={12}
            color="white"
            style={{ marginRight: 4 }}
          />
          <Text style={{ color: "white", fontSize: 10, fontWeight: "bold" }}>
            Giơ tay
          </Text>
        </View>
      )}

      {/* BADGE TÊN & TRẠNG THÁI */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: 6,
          left: 6,
          backgroundColor: "rgba(17, 17, 19, 0.85)",
          borderWidth: 1,
          borderColor: "rgba(255, 255, 255, 0.08)",
          paddingHorizontal: 7,
          paddingVertical: 4,
          borderRadius: 6,
          flexDirection: "row",
          alignItems: "center",
          maxWidth: "90%",
        }}
      >
        {isScreenShare && (
          <Feather
            name="monitor"
            size={12}
            color="#60a5fa"
            style={{ marginRight: 4 }}
          />
        )}
        {!showVideo && !isScreenShare && (
          <Feather
            name="video-off"
            size={12}
            color="#ef4444"
            style={{ marginRight: 4 }}
          />
        )}
        <Text
          style={{ color: "white", fontSize: 12, fontWeight: "bold" }}
          numberOfLines={1}
        >
          {trackRef.participant.name || "Khách"} {isScreenShare && "(Chia sẻ)"}
        </Text>
      </View>
    </View>
  );
}

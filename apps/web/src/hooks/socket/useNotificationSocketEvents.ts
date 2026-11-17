// hooks/socket/useNotificationSocketEvents.ts
import { useEffect } from "react";
import { useSocket } from "@/hooks/useSocket";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useRoomCacheManager } from "../useRoomCacheManager";
import { NotificationResponse } from "@tobomeet/shared/types";
import { useNotificationCacheManager } from "../useNotificationCacheManager";
import { useTranslations } from "next-intl";

import { useDispatch } from "react-redux";
import { notificationsApi } from "@/lib/redux/api/notificationsApi";
import { usersApi } from "@/lib/redux/api/usersApi";
import { AppDispatch } from "@/lib/redux/store";

export function useNotificationSocketEvents() {
  const socket = useSocket();
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const t = useTranslations("notification");
  const { removeRoomFromMyList } = useRoomCacheManager();
  const { addNotificationsToCache, updateUnreadNotificationBadge } =
    useNotificationCacheManager();

  useEffect(() => {
    const handleNotifications = (notifications: NotificationResponse[]) => {
      const currentPath = window.location.pathname;
      if (!notifications || notifications.length === 0) return;

      // Sắp xếp các thông báo theo createdAt mới nhất lên đầu
      const sortedNotifications = [...notifications].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      // Cập nhật cache ngay lập tức để hiện lên drawer thông báo
      addNotificationsToCache(sortedNotifications);

      // Cập nhật badge unread của người dùng
      updateUnreadNotificationBadge(true);

      sortedNotifications.forEach((notif, index) => {
        const roomId = notif.metadata?.roomId;
        const isCurrentlyInRoom = currentPath.includes(`/room/${roomId}`);
        const canPopup = notif.canPopup;

        // Bỏ qua những thông báo không cho popup
        if (!canPopup) return;

        setTimeout(() => {
          const livePath = typeof window !== "undefined" ? window.location.pathname : currentPath;
          const isCurrentlyInRoom = Boolean(roomId && livePath.includes(`/room/${roomId}`));

          switch (notif.type) {
            case "KICKED": {
              if (roomId) removeRoomFromMyList(roomId); // dọn cache rtk query

              toast.info(t("toast.system_notification"), {
                description: t("types.kicked.title", {
                  roomName: notif.metadata?.roomName || "",
                }),
                duration: 8000,
              });

              // Dọn dẹp storage và đóng cửa sổ meeting
              localStorage.removeItem(`active_meeting_${roomId}`);
              window.dispatchEvent(
                new CustomEvent("FORCE_CLOSE_MEETING_WINDOW", {
                  detail: roomId,
                }),
              );

              if (isCurrentlyInRoom) {
                // Nếu đang trong phòng bị kick thì tự động văng ra ngoài
                setTimeout(() => {
                  router.push("/dashboard");
                }, 1500);
              }
              break;
            }

            case "ROOM_DISBANDED": {
              if (roomId) removeRoomFromMyList(roomId);

              toast.info(t("toast.room_disbanded"), {
                description: t("types.room_disbanded.content", {
                  roomName: notif.metadata?.roomName || t("common.room"),
                }),
                duration: 8000,
              });

              if (isCurrentlyInRoom) {
                setTimeout(() => {
                  router.push("/dashboard");
                }, 1500);
              }
              break;
            }

            case "PARTICIPANT_REMOVED": {
              const meetingCode = notif.metadata?.meetingCode || "";
              toast.error(
                t("types.participant_removed.content", { meetingCode }),
              );
              break;
            }

            case "CALENDAR_INVITE": {
              const title =
                notif.metadata?.title || notif.metadata?.eventTitle || "";
              const inviter =
                notif.metadata?.inviterName || t("common.someone");
              toast.info(t("toast.event_invite"), {
                description: t("types.calendar_invite.content", {
                  inviterName: inviter,
                  title,
                }),
                duration: 8000,
              });
              break;
            }

            case "CALENDAR_START": {
              const title =
                notif.metadata?.title ||
                notif.metadata?.eventTitle ||
                t("common.event");
              const meetingCode = notif.metadata?.meetingCode;
              toast.info(t("toast.event_start"), {
                description: t("toast.event_start_desc", { title }),
                action: meetingCode
                  ? {
                      label: t("actions.join"),
                      onClick: () => router.push(`/meeting/${meetingCode}`),
                    }
                  : undefined,
                duration: 15000,
              });
              break;
            }

            case "ROOM_REPORTED": {
              toast.warning(t("types.room_reported.title"), {
                description: t("types.room_reported.content"),
                duration: 8000,
              });
              break;
            }

            case "REPORT_RESOLVED": {
              toast.success(t("types.report_resolved.title"), {
                description: t("types.report_resolved.content"),
                duration: 8000,
              });
              break;
            }

            case "ROOM_BLOCKED": {
              toast.error(t("types.room_blocked.title"), {
                description: t("types.room_blocked.content"),
                duration: 8000,
              });
              break;
            }

            case "CHANNEL_POST": {
              if (isCurrentlyInRoom) break;
              const channelName = notif.metadata?.channelName || "";
              const authorName =
                notif.metadata?.authorName || t("common.someone");
              const postRoomId = notif.metadata?.roomId;
              const channelId = notif.metadata?.channelId;

              toast.info(t("toast.channel_post"), {
                description: t("types.channel_post.toast_desc", {
                  authorName,
                  channelName,
                }),
                action:
                  postRoomId && channelId
                    ? {
                        label: t("actions.view_channel"),
                        onClick: () => {
                          router.push(`/room/${postRoomId}?channel=${channelId}`);
                          window.dispatchEvent(
                            new CustomEvent("navigate-to-channel", {
                              detail: { channelId, channelName },
                            }),
                          );
                        },
                      }
                    : undefined,
                duration: 8000,
              });
              break;
            }

            case "ASSIGNMENT_CREATED": {
              if (isCurrentlyInRoom) break;
              const channelName = notif.metadata?.channelName || "";
              const authorName =
                notif.metadata?.authorName || t("common.someone");
              const assignTitle = notif.metadata?.title || "";
              const assignRoomId = notif.metadata?.roomId;
              const channelId = notif.metadata?.channelId;
              const assignmentId = notif.metadata?.assignmentId;

              toast.info(t("toast.assignment_created"), {
                description: t("types.assignment_created.toast_desc", {
                  authorName,
                  title: assignTitle,
                  channelName,
                }),
                action:
                  assignRoomId && channelId
                    ? {
                        label: t("actions.view_channel"),
                        onClick: () => {
                          router.push(
                            `/room/${assignRoomId}?channel=${channelId}`,
                          );
                          window.dispatchEvent(
                            new CustomEvent("navigate-to-channel", {
                              detail: { channelId, channelName },
                            }),
                          );
                          if (assignmentId) {
                            window.dispatchEvent(
                              new CustomEvent("navigate-to-assignment", {
                                detail: { assignmentId },
                              }),
                            );
                          }
                        },
                      }
                    : undefined,
                duration: 8000,
              });
              break;
            }

            case "CHANNEL_EVENT_CREATED": {
              if (isCurrentlyInRoom) break;
              const channelName = notif.metadata?.channelName || "";
              const hostName =
                notif.metadata?.hostName || t("common.someone");
              const eventTitle = notif.metadata?.title || "";
              const eventRoomId = notif.metadata?.roomId;
              const channelId = notif.metadata?.channelId;

              toast.info(t("toast.channel_event_created"), {
                description: t("types.channel_event_created.toast_desc", {
                  hostName,
                  title: eventTitle,
                  channelName,
                }),
                action:
                  eventRoomId && channelId
                    ? {
                        label: t("actions.view_channel"),
                        onClick: () => {
                          router.push(
                            `/room/${eventRoomId}?channel=${channelId}`,
                          );
                          window.dispatchEvent(
                            new CustomEvent("navigate-to-channel", {
                              detail: { channelId, channelName },
                            }),
                          );
                        },
                      }
                    : undefined,
                duration: 8000,
              });
              break;
            }

            default:
              console.warn(
                "Chưa hỗ trợ hiển thị loại thông báo này:",
                notif.type,
              );
          }
        }, index * 500);
      });

      const notifIds = notifications.map((n) => n._id);
      socket.emit("mark_notifications_notified", notifIds); // ack lại cho server biết đã popup rồi
    };

    const handleNotificationDeleted = () => {
      dispatch(notificationsApi.util.invalidateTags(["Notification"]));
      dispatch(usersApi.util.invalidateTags(["User"]));
    };

    socket.on("receive_notifications", handleNotifications);
    socket.on("notification_deleted", handleNotificationDeleted);

    return () => {
      socket.off("receive_notifications", handleNotifications);
      socket.off("notification_deleted", handleNotificationDeleted);
    };
  }, [
    dispatch,
    t,
    router,
    removeRoomFromMyList,
    addNotificationsToCache,
    updateUnreadNotificationBadge,
  ]);
}



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



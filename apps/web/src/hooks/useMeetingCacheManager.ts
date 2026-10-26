import { useDispatch } from "react-redux";
import { AppDispatch } from "@/lib/redux/store";
import { useDeviceId } from "./useDeviceId";
import { meetingsApi } from "@/lib/redux/api/meetingsApi";

export function useMeetingCacheManager() {
  const dispatch = useDispatch<AppDispatch>();
  const deviceId = useDeviceId();

  /**
   * Làm sạch trạng thái thiết bị trong cuộc họp
   */
  const clearMeetingDeviceStatus = (meetingCode: string) => {
    if (!deviceId || !meetingCode) return;

    dispatch(
      meetingsApi.util.invalidateTags([
        {
          type: "DeviceStatus",
          id: `${meetingCode}-${deviceId}`,
        },
      ]),
    );
  };

  /**
   * Đồng bộ lại trạng thái phiên họp trong RTK cache khi phiên họp kết thúc
   */
  const syncMeetingEnded = (meetingCode: string) => {
    if (!meetingCode) return;

    dispatch(
      meetingsApi.util.updateQueryData(
        "getMeetingSessions",
        { meetingCode, cursor: undefined, limit: 50 },
        (draft) => {
          if (draft?.items) {
            draft.items.forEach((item) => {
              if (item.status === "ongoing") {
                item.status = "ended";
                item.endedAt = new Date().toISOString();
              }
            });
          }
        },
      ),
    );

    dispatch(
      meetingsApi.util.invalidateTags([
        {
          type: "MeetingSessions",
          id: meetingCode,
        },
        {
          type: "MeetingSessions",
        },
      ]),
    );
  };

  return {
    clearMeetingDeviceStatus,
    syncMeetingEnded,
  };
}

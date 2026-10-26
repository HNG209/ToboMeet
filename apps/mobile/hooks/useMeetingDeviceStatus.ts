// hooks/useMeetingDeviceStatus.ts
import { useGetActiveMeetingQuery } from "../lib/redux/features/meetings/meetingsApi";

export function useMeetingDeviceStatus(
  roomId: string,
  activeChannelId: string | null,
) {
  // Theo dõi trạng thái cuộc họp hiện tại từ Server
  const { data: activeMeeting } = useGetActiveMeetingQuery(
    { roomId, channelId: activeChannelId || "" },
    { skip: !roomId || !activeChannelId, refetchOnMountOrArgChange: true },
  );

  return { isJoinedOnThisDevice: false, activeMeeting };
}

import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { useSocket } from "./useSocket";
import {
  pollsApi,
  useGetPollsQuery,
} from "@/lib/redux/api/pollsApi";
import { PollResponse } from "@tobomeet/shared/types";
import { AppDispatch } from "@/lib/redux/store";

export function useMeetingPolls(meetingCode: string) {
  const dispatch = useDispatch<AppDispatch>();
  const socket = useSocket();

  const {
    data: polls = [],
    isLoading,
    isFetching,
    refetch,
  } = useGetPollsQuery({ meetingCode }, { skip: !meetingCode });

  useEffect(() => {
    if (!meetingCode) return;

    // Đăng ký tham gia room socket của meeting
    socket.emit("join_meeting", { meetingCode });

    const handleCreated = (newPoll: PollResponse) => {
      if (newPoll.meetingCode === meetingCode) {
        dispatch(
          pollsApi.util.updateQueryData("getPolls", { meetingCode }, (draft) => {
            const exists = draft.some((p) => p._id === newPoll._id);
            if (!exists) {
              draft.unshift(newPoll);
            }
          }),
        );
      }
    };

    const handleVoted = (updatedPoll: PollResponse) => {
      if (updatedPoll.meetingCode === meetingCode) {
        dispatch(
          pollsApi.util.updateQueryData("getPolls", { meetingCode }, (draft) => {
            const index = draft.findIndex((p) => p._id === updatedPoll._id);
            if (index !== -1) {
              draft[index] = updatedPoll;
            }
          }),
        );
      }
    };

    const handleClosed = (closedPoll: PollResponse) => {
      if (closedPoll.meetingCode === meetingCode) {
        dispatch(
          pollsApi.util.updateQueryData("getPolls", { meetingCode }, (draft) => {
            const index = draft.findIndex((p) => p._id === closedPoll._id);
            if (index !== -1) {
              draft[index] = closedPoll;
            }
          }),
        );
      }
    };

    const handleDeleted = ({ pollId }: { pollId: string }) => {
      dispatch(
        pollsApi.util.updateQueryData("getPolls", { meetingCode }, (draft) => {
          return draft.filter((p) => p._id !== pollId);
        }),
      );
    };

    socket.on("poll_created", handleCreated);
    socket.on("poll_voted", handleVoted);
    socket.on("poll_closed", handleClosed);
    socket.on("poll_deleted", handleDeleted);

    return () => {
      socket.off("poll_created", handleCreated);
      socket.off("poll_voted", handleVoted);
      socket.off("poll_closed", handleClosed);
      socket.off("poll_deleted", handleDeleted);
      socket.emit("leave_meeting", { meetingCode });
    };
  }, [meetingCode, socket, dispatch]);

  return {
    polls,
    isLoading,
    isFetching,
    refetch,
  };
}


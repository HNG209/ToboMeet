import {
  CreatePollRequest,
  PollResponse,
  VotePollRequest,
} from "@tobomeet/shared/types";
import { baseApi } from "./baseApi";

export const pollsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getPolls: builder.query<
      PollResponse[],
      { meetingCode: string; sessionId?: string }
    >({
      query: ({ meetingCode, sessionId }) => ({
        url: `/meetings/${meetingCode}/polls`,
        method: "GET",
        params: sessionId ? { sessionId } : undefined,
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ _id }) => ({ type: "Polls" as const, id: _id })),
              { type: "Polls", id: "LIST" },
            ]
          : [{ type: "Polls", id: "LIST" }],
    }),

    createPoll: builder.mutation<
      PollResponse,
      { meetingCode: string } & CreatePollRequest
    >({
      query: ({ meetingCode, ...data }) => ({
        url: `/meetings/${meetingCode}/polls`,
        method: "POST",
        data,
      }),
      invalidatesTags: [{ type: "Polls", id: "LIST" }],
    }),

    votePoll: builder.mutation<
      PollResponse,
      { meetingCode: string; pollId: string } & VotePollRequest
    >({
      query: ({ meetingCode, pollId, ...data }) => ({
        url: `/meetings/${meetingCode}/polls/${pollId}/vote`,
        method: "POST",
        data,
      }),
      invalidatesTags: (_result, _error, { pollId }) => [
        { type: "Polls", id: pollId },
      ],
    }),

    closePoll: builder.mutation<
      PollResponse,
      { meetingCode: string; pollId: string }
    >({
      query: ({ meetingCode, pollId }) => ({
        url: `/meetings/${meetingCode}/polls/${pollId}/close`,
        method: "PATCH",
      }),
      invalidatesTags: (_result, _error, { pollId }) => [
        { type: "Polls", id: pollId },
      ],
    }),

    deletePoll: builder.mutation<
      { success: boolean; pollId: string },
      { meetingCode: string; pollId: string }
    >({
      query: ({ meetingCode, pollId }) => ({
        url: `/meetings/${meetingCode}/polls/${pollId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { pollId }) => [
        { type: "Polls", id: pollId },
        { type: "Polls", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetPollsQuery,
  useCreatePollMutation,
  useVotePollMutation,
  useClosePollMutation,
  useDeletePollMutation,
} = pollsApi;


import { createApi } from "@reduxjs/toolkit/query/react";
import { axiosBaseQuery } from "./axiosBaseQuery";

export const baseApi = createApi({
  reducerPath: "api",
  baseQuery: axiosBaseQuery(),
  tagTypes: [
    "User",
    "Room",
    "UserSessions",
    "Post",
    "Comment",
    "DeviceStatus",
    "ChannelFile",
    "UserSearch",
    "Notification",
    "MeetingSessions",
    "Assignments",
    "Submissions",
    "CalendarEvent",
    "CalendarRsvp",
    "DirectConversation",
    "DirectMessage",
  ],
  endpoints: () => ({}),
});

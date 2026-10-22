import { createApi } from "@reduxjs/toolkit/query/react";
import { axiosBaseQuery } from "./axiosBaseQuery";

export const baseApi = createApi({
  reducerPath: "api",
  baseQuery: axiosBaseQuery(),
  tagTypes: [
    "User",
    "Room",
    "Meetings",
    "UserSessions",
    "Report",
    "Post",
    "Comment",
    "DeviceStatus",
    "ChannelFile",
    "Notification",
    "UserSearch",
    "MeetingSessions",
    "CalendarEvent",
    "CalendarRsvp",
    "Assignments",
    "Submissions",
    "DirectConversation",
    "DirectMessage",
  ],
  endpoints: () => ({}),
});

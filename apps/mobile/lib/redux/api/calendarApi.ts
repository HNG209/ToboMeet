import { baseApi } from "./baseApi";
import { generateOccurrencesForRange } from "../../../hooks/useCalendarCacheManager";

export const calendarApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getCalendarEvents: builder.query<any[], { start: string; end: string }>({
      query: ({ start, end }) => ({
        url: `/calendar?start=${start}&end=${end}`,
        method: "GET",
      }),
      providesTags: ["CalendarEvent"],
    }),
    getCalendarRsvp: builder.query<any[], string>({
      query: (eventId) => ({
        url: `/calendar/${eventId}/rsvp`,
        method: "GET",
      }),
      providesTags: (result, error, eventId) => [{ type: "CalendarRsvp", id: eventId }],
    }),
    createCalendarEvent: builder.mutation<any, any>({
      query: (body) => ({
        url: "/calendar",
        method: "POST",
        data: body,
      }),
      async onQueryStarted(arg, { dispatch, getState, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          const createdEvent = data?.event || data;
          if (createdEvent?._id) {
            const state = getState() as any;
            const queries = state.api?.queries || {};
            Object.values(queries).forEach((q: any) => {
              if (q?.endpointName === "getCalendarEvents" && q?.originalArgs) {
                const args = q.originalArgs;
                const rangeStart = new Date(args.start);
                const rangeEnd = new Date(args.end);
                const occurrences = generateOccurrencesForRange(
                  createdEvent,
                  rangeStart,
                  rangeEnd
                );

                if (occurrences.length > 0) {
                  dispatch(
                    calendarApi.util.updateQueryData("getCalendarEvents", args, (draft: any[]) => {
                      let i = draft.length;
                      while (i--) {
                        if (draft[i]._id === createdEvent._id) {
                          draft.splice(i, 1);
                        }
                      }
                      draft.push(...occurrences);
                      draft.sort(
                        (a, b) =>
                          new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
                      );
                    })
                  );
                }
              }
            });
          }
        } catch {
          // ignore error
        }
      },
    }),
    updateCalendarEvent: builder.mutation<any, { id: string; body: any }>({
      query: ({ id, body }) => ({
        url: `/calendar/${id}?type=all`,
        method: "PUT",
        data: body,
      }),
      invalidatesTags: (result, error, { id }) => [{ type: "CalendarRsvp", id }],
      async onQueryStarted({ id, body }, { dispatch, getState, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          const updatedEvent = data?.event || data;
          if (updatedEvent?._id) {
            const state = getState() as any;
            const queries = state.api?.queries || {};

            Object.values(queries).forEach((q: any) => {
              if (q?.endpointName === "getCalendarEvents" && q?.originalArgs) {
                const args = q.originalArgs;
                const rangeStart = new Date(args.start);
                const rangeEnd = new Date(args.end);
                const occurrences = generateOccurrencesForRange(
                  updatedEvent,
                  rangeStart,
                  rangeEnd
                );

                dispatch(
                  calendarApi.util.updateQueryData("getCalendarEvents", args, (draft: any[]) => {
                    let i = draft.length;
                    while (i--) {
                      if (draft[i]._id === id) {
                        draft.splice(i, 1);
                      }
                    }

                    if (occurrences.length > 0) {
                      draft.push(...occurrences);
                    }

                    draft.sort(
                      (a, b) =>
                        new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
                    );
                  })
                );
              }
            });
          }
        } catch {
          // ignore error
        }
      },
    }),
    deleteCalendarEvent: builder.mutation<
      void,
      string | { id: string; type?: "single" | "all"; occurrenceDate?: string }
    >({
      query: (arg) => {
        if (typeof arg === "string") {
          return {
            url: `/calendar/${arg}?type=all`,
            method: "DELETE",
          };
        }
        const { id, type = "all", occurrenceDate } = arg;
        const queryParams = new URLSearchParams({ type });
        if (occurrenceDate) queryParams.append("occurrenceDate", occurrenceDate);
        return {
          url: `/calendar/${id}?${queryParams.toString()}`,
          method: "DELETE",
        };
      },
      invalidatesTags: (result, error, arg) => {
        const id = typeof arg === "string" ? arg : arg.id;
        return [{ type: "CalendarRsvp", id }];
      },
      async onQueryStarted(arg, { dispatch, getState, queryFulfilled }) {
        const id = typeof arg === "string" ? arg : arg.id;
        const type = typeof arg === "string" ? "all" : (arg.type || "all");
        const occurrenceDate = typeof arg === "string" ? undefined : arg.occurrenceDate;
        const cleanDate = occurrenceDate?.substring(0, 10);

        try {
          await queryFulfilled;
          const state = getState() as any;
          const queries = state.api?.queries || {};

          Object.values(queries).forEach((q: any) => {
            if (q?.endpointName === "getCalendarEvents" && q?.originalArgs) {
              dispatch(
                calendarApi.util.updateQueryData("getCalendarEvents", q.originalArgs, (draft: any[]) => {
                  if (type === "single" && cleanDate) {
                    const idx = draft.findIndex(
                      (item) =>
                        item._id === id &&
                        (item.occurrenceDate === cleanDate ||
                          item.startDate?.startsWith(cleanDate))
                    );
                    if (idx !== -1) draft.splice(idx, 1);
                    draft.forEach((item) => {
                      if (item._id === id) {
                        if (!item.recurrenceExceptions) item.recurrenceExceptions = [];
                        if (!item.recurrenceExceptions.includes(cleanDate)) {
                          item.recurrenceExceptions.push(cleanDate);
                        }
                      }
                    });
                  } else {
                    return draft.filter((item) => item._id !== id);
                  }
                })
              );
            }
          });
        } catch {
          // ignore error
        }
      },
    }),
    restoreCalendarOccurrence: builder.mutation<
      { success: boolean; recurrenceExceptions: string[]; event?: any },
      { id: string; occurrenceDate: string }
    >({
      query: ({ id, occurrenceDate }) => ({
        url: `/calendar/${id}/restore`,
        method: "POST",
        data: { occurrenceDate },
      }),
      invalidatesTags: (result, error, { id }) => [{ type: "CalendarRsvp", id }],
      async onQueryStarted({ id, occurrenceDate }, { dispatch, getState, queryFulfilled }) {
        const cleanDate = occurrenceDate?.substring(0, 10);
        try {
          const { data } = await queryFulfilled;
          const event = data?.event;
          const state = getState() as any;
          const queries = state.api?.queries || {};

          Object.values(queries).forEach((q: any) => {
            if (q?.endpointName === "getCalendarEvents" && q?.originalArgs) {
              const args = q.originalArgs;
              dispatch(
                calendarApi.util.updateQueryData("getCalendarEvents", args, (draft: any[]) => {
                  if (cleanDate && event) {
                    const [y, m, d] = cleanDate.split("-").map(Number);
                    const origStart = new Date(event.startDate);
                    const origEnd = new Date(event.endDate || event.startDate);
                    const duration = origEnd.getTime() - origStart.getTime();

                    const restoredStart = new Date(
                      y,
                      m - 1,
                      d,
                      origStart.getHours(),
                      origStart.getMinutes(),
                      origStart.getSeconds()
                    );
                    const restoredEnd = new Date(restoredStart.getTime() + duration);
                    const rangeStart = new Date(args.start);
                    const rangeEnd = new Date(args.end);

                    if (restoredStart <= rangeEnd && restoredEnd >= rangeStart) {
                      const exists = draft.some(
                        (item) =>
                          item._id === id &&
                          (item.occurrenceDate === cleanDate ||
                            item.startDate?.startsWith(cleanDate))
                      );
                      if (!exists) {
                        draft.push({
                          ...event,
                          startDate: restoredStart.toISOString(),
                          endDate: restoredEnd.toISOString(),
                          isOccurrence: true,
                          occurrenceDate: cleanDate,
                        });
                      }
                    }
                  }

                  draft.forEach((item) => {
                    if (item._id === id && item.recurrenceExceptions) {
                      item.recurrenceExceptions = item.recurrenceExceptions.filter(
                        (ex: string) => ex !== cleanDate
                      );
                    }
                  });

                  draft.sort(
                    (a, b) =>
                      new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
                  );
                })
              );
            }
          });
        } catch {
          // ignore error
        }
      },
    }),
    inviteCalendarMembers: builder.mutation<
      { success: boolean; count: number; event: any },
      { id: string; userIds?: string[]; invitees?: any[] }
    >({
      query: ({ id, userIds, invitees }) => ({
        url: `/calendar/${id}/invite`,
        method: "POST",
        data: { userIds, invitees },
      }),
      invalidatesTags: ["CalendarEvent", "CalendarRsvp"],
    }),
    leaveCalendarEvent: builder.mutation<{ success: boolean; message: string }, string>({
      query: (id) => ({
        url: `/calendar/${id}/leave`,
        method: "POST",
      }),
      invalidatesTags: ["CalendarEvent", "CalendarRsvp", "Notification"],
    }),
    updateCalendarRsvp: builder.mutation<
      { success: boolean; status: "ACCEPTED" | "DECLINED" | "TENTATIVE" },
      { eventId: string; status: "ACCEPTED" | "DECLINED" | "TENTATIVE" }
    >({
      query: ({ eventId, status }) => ({
        url: `/calendar/${eventId}/rsvp`,
        method: "PATCH",
        data: { status },
      }),
      invalidatesTags: ["CalendarEvent", "CalendarRsvp", "Notification"],
    }),
    searchCalendarEvents: builder.query<any[], string>({
      query: (query) => ({
        url: `/calendar/search?q=${encodeURIComponent(query.trim())}`,
        method: "GET",
      }),
      providesTags: ["CalendarEvent"],
    }),
    toggleCalendarNotification: builder.mutation<
      { code: number; success: boolean; notificationsEnabled: boolean; event: any },
      { id: string; enabled?: boolean }
    >({
      query: ({ id, enabled }) => ({
        url: `/calendar/${id}/notification`,
        method: "PATCH",
        data: { enabled },
      }),
      invalidatesTags: ["CalendarEvent"],
    }),
  }),
});

export const {
  useGetCalendarEventsQuery,
  useLazyGetCalendarEventsQuery,
  useGetCalendarRsvpQuery,
  useLazyGetCalendarRsvpQuery,
  useCreateCalendarEventMutation,
  useUpdateCalendarEventMutation,
  useDeleteCalendarEventMutation,
  useRestoreCalendarOccurrenceMutation,
  useInviteCalendarMembersMutation,
  useLeaveCalendarEventMutation,
  useUpdateCalendarRsvpMutation,
  useSearchCalendarEventsQuery,
  useLazySearchCalendarEventsQuery,
  useToggleCalendarNotificationMutation,
} = calendarApi;


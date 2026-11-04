import { PageResponse, UserResponse } from "@tobomeet/shared/types";
import { baseApi } from "./baseApi";

export interface UserSession {
  id: string;
  ip: string;
  location?: string;
  city?: string;
  country?: string;
  isp?: string;
  ipAddress?: string | null;
  isGps?: boolean;
  os: string;
  browser: string;
  deviceName: string;
  loginMethod: string;
  isMobile: boolean;
  isDesktop: boolean;
  isCurrent: boolean;
  isFamiliar: boolean;
  createdAt: string;
  updatedAt: string;
  loggedOutAt?: string;
}

export interface SessionsResponse {
  currentDevice: UserSession;
  otherDevices: UserSession[];
  recentlyLoggedOut: UserSession[];
  totalLoggedOut: number;
}

export type SearchUsersArgs = {
  q: string;
  cursor?: string;
  limit?: number;
};


export const usersApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMe: builder.query<UserResponse, void>({
      query: () => ({
        url: "/users/me",
        method: "GET",
      }),
      providesTags: ["User"],
    }),

    // TÃ¬m kiáº¿m toÃ n cá»¥c + phÃ¢n trang cursor
    searchUsers: builder.query<PageResponse<UserResponse>, SearchUsersArgs>({
      query: (args) => ({
        url: "/users/search",
        params: args,
      }),

      // Chá»‰ táº¡o khoÃ¡ (Cache Key) dá»±a trÃªn tá»« khÃ³a tÃ¬m kiáº¿m (q), bá» qua cursor vÃ  limit
      serializeQueryArgs: ({ endpointName, queryArgs }) => {
        const queryKey = queryArgs.q || "";
        return `${endpointName}-${queryKey}`;
      },

      // Gá»™p (Merge) dá»¯ liá»‡u má»›i vÃ o cache cÅ© khi cuá»™n táº£i thÃªm
      merge: (currentCache, newItems, { arg }) => {
        if (!arg.cursor) {
          // Náº¿u gá»i láº¡i khÃ´ng cÃ³ cursor (khi search tá»« khÃ³a má»›i hoáº·c refresh), ghi Ä‘Ã¨ toÃ n bá»™
          return newItems;
        }

        // Náº¿u gá»i cÃ¡c trang tiáº¿p theo, ná»‘i (push) thÃªm dá»¯ liá»‡u vÃ o máº£ng items cÅ©
        currentCache.items.push(...newItems.items);

        // Cáº­p nháº­t láº¡i cÃ¡c thÃ´ng tin phÃ¢n trang
        currentCache.nextCursor = newItems.nextCursor;
        currentCache.hasNext = newItems.hasNext;
        currentCache.limit = newItems.limit;
      },

      // Báº¯t buá»™c gá»i láº¡i API khi cursor thay Ä‘á»•i hoáº·c tá»« khÃ³a q thay Ä‘á»•i
      forceRefetch({ currentArg, previousArg }) {
        return (
          currentArg?.cursor !== previousArg?.cursor ||
          currentArg?.q !== previousArg?.q
        );
      },

      providesTags: ["UserSearch"],
    }),

    getSessions: builder.query<SessionsResponse, void>({
      query: () => ({
        url: "/users/me/sessions",
        method: "GET",
      }),
      providesTags: ["UserSessions"],
    }),

    getLoggedOutSessions: builder.query<
      { sessions: UserSession[]; total: number; page: number; limit: number },
      { page: number; limit: number }
    >({
      query: ({ page, limit }) => ({
        url: "/users/me/sessions/logged-out",
        method: "GET",
        params: { page, limit },
      }),
      providesTags: ["UserSessions"],
    }),

    revokeSession: builder.mutation<
      { success: boolean; message: string },
      string
    >({
      query: (sessionId) => ({
        url: `/users/me/sessions/${sessionId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["UserSessions"],
    }),

    revokeOtherSessions: builder.mutation<
      { success: boolean; message: string },
      { socketId?: string } | void
    >({
      query: (arg) => {
        const socketId = arg && (arg as { socketId?: string }).socketId;
        return {
          url: "/users/me/sessions/others",
          method: "DELETE",
          ...(socketId ? { headers: { "X-Socket-Id": socketId } } : {}),
        };
      },
      invalidatesTags: ["UserSessions"],
    }),

    updateCurrentSessionLocation: builder.mutation<
      void,
      { city: string; country: string }
    >({
      query: (data) => ({
        url: "/users/me/sessions/current/location",
        method: "PUT",
        data,
      }),
      invalidatesTags: ["UserSessions"],
    }),

    reverseGeocode: builder.query<
      { city: string; country: string },
      { lat: number; lon: number }
    >({
      query: ({ lat, lon }) => ({
        url: "/users/geo/reverse",
        method: "GET",
        params: { lat, lon },
      }),
    }),

    getAvatarUploadPresignedUrl: builder.mutation<
      { signedUrl: string; publicUrl: string; key: string },
      { fileName: string; contentType: string }
    >({
      query: (data) => ({
        url: "/users/me/avatar/presigned-url",
        method: "POST",
        data,
      }),
    }),

    updateProfile: builder.mutation<
      UserResponse,
      { displayName?: string; avatarUrl?: string }
    >({
      query: (data) => ({
        url: "/users/me/profile",
        method: "PUT",
        data,
      }),
      invalidatesTags: ["User"],
    }),
  }),
  overrideExisting: true,
});

export const {
  useGetMeQuery,
  useGetSessionsQuery,
  useGetLoggedOutSessionsQuery,
  useLazyGetLoggedOutSessionsQuery,
  useRevokeSessionMutation,
  useRevokeOtherSessionsMutation,
  useUpdateCurrentSessionLocationMutation,
  useSearchUsersQuery,
  useLazyReverseGeocodeQuery,
  useGetAvatarUploadPresignedUrlMutation,
  useUpdateProfileMutation,
} = usersApi;

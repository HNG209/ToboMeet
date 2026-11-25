import { baseApi } from "./baseApi";

export interface AdminStatsResponse {
  totalUsers: number;
  onlineUsers: number;
  activeMeetings: number;
  totalMeetings: number;
  roomsCreatedToday: number;
  averageMeetingDuration: number;
  chartData: { date: string; count: number }[];
  recentRooms: { id: string; name: string; code: string; createdAt: string }[];
  recentMeetings: { id: string; meetingCode: string; status: string; createdAt: string }[];
}

export interface AdminUserResponse {
  id: string;
  supabaseId: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  role: "admin" | "user" | "moderator";
  status: "ACTIVE" | "BLOCKED" | "active" | "locked";
  lockType?: string;
  lockSource?: string;
  lockedAt?: string;
  lockedUntil?: string;
  lockReason?: string;
  lockedBy?: string;
  recommendedDuration?: string;
  actualDuration?: string;
  violationType?: string;
  violationCounts?: Record<string, number>;
  lockHistory?: any[];
  createdAt: string;
  emailWarning?: string;
}

export interface AdminUsersPaginationResponse {
  users: AdminUserResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const adminApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    getAdminStats: builder.query<AdminStatsResponse, void>({
      query: () => ({
        url: "/admin/stats",
        method: "GET",
      }),
    }),
    getAdminUsers: builder.query<AdminUsersPaginationResponse, { query?: string; page?: number; limit?: number } | void>({
      query: (params) => ({
        url: "/admin/users",
        method: "GET",
        params: params ? {
          query: params.query || undefined,
          page: params.page || undefined,
          limit: params.limit || undefined,
        } : undefined,
      }),
    }),
    createUser: builder.mutation<AdminUserResponse, Partial<AdminUserResponse> & { password?: string }>({
      query: (data) => ({
        url: "/admin/users",
        method: "POST",
        data,
      }),
      invalidatesTags: ["User"],
    }),
    updateUser: builder.mutation<AdminUserResponse, { id: string; displayName: string; role: string; status: string }>({
      query: ({ id, ...data }) => ({
        url: `/admin/users/${id}`,
        method: "PUT",
        data,
      }),
      invalidatesTags: ["User"],
    }),
    resetPassword: builder.mutation<{ success: boolean; message: string }, string>({
      query: (id) => ({
        url: `/admin/users/${id}/reset-password`,
        method: "PUT",
      }),
    }),
    deleteUser: builder.mutation<{ success: boolean; message: string }, string>({
      query: (id) => ({
        url: `/admin/users/${id}`,
        method: "DELETE",
      }),
    }),
    lockUser: builder.mutation<
      AdminUserResponse,
      {
        id: string;
        violationType: string;
        recommendedDuration: string;
        actualDuration: string;
        lockReason: string;
        sendEmail: boolean;
        lockSource?: string;
      }
    >({
      query: ({ id, ...data }) => ({
        url: `/admin/users/${id}/lock`,
        method: "POST",
        data,
      }),
    }),
    unlockUser: builder.mutation<{ success: boolean; message: string }, string>({
      query: (id) => ({
        url: `/admin/users/${id}/unlock`,
        method: "POST",
      }),
    }),
    extendUserLock: builder.mutation<
      { success: boolean; message: string; emailWarning?: string },
      { id: string; actualDuration: string; lockReason: string }
    >({
      query: ({ id, ...data }) => ({
        url: `/admin/users/${id}/extend-lock`,
        method: "POST",
        data,
      }),
    }),
    getAdminRooms: builder.query<any, any>({
      query: (params) => ({
        url: "/admin/rooms",
        method: "GET",
        params,
      }),
      providesTags: ["Room"],
    }),
    getAdminRoomStats: builder.query<any, void>({
      query: () => ({
        url: "/admin/rooms/stats",
        method: "GET",
      }),
      providesTags: ["Room"],
    }),
    getAdminRoomDetails: builder.query<any, string>({
      query: (id) => ({
        url: `/admin/rooms/${id}`,
        method: "GET",
      }),
      providesTags: ["Room"],
    }),
    disbandRoom: builder.mutation<any, { id: string; reason: string }>({
      query: ({ id, reason }) => ({
        url: `/admin/rooms/${id}/disband`,
        method: "POST",
        data: { reason },
      }),
      invalidatesTags: ["Room"],
    }),
    // ─── Admin Report Endpoints ─────────────────────────────────────────────
    getAdminReportStats: builder.query<AdminReportStats, { range?: string } | void>({
      query: (params) => ({
        url: "/admin/reports/stats",
        method: "GET",
        params: params || undefined,
      }),
      providesTags: ["Report"],
    }),
    getAdminReports: builder.query<AdminReportListResponse, AdminReportFilters>({
      query: (params) => ({
        url: "/admin/reports",
        method: "GET",
        params,
      }),
      providesTags: ["Report"],
    }),
    getAdminReportById: builder.query<AdminReportDetail, string>({
      query: (id) => ({
        url: `/admin/reports/${id}`,
        method: "GET",
      }),
      providesTags: (_result: any, _error: any, id: string) => [{ type: "Report" as const, id }],
    }),
    updateReportStatus: builder.mutation<
      AdminReportDetail,
      { id: string; status: string; note?: string }
    >({
      query: ({ id, ...data }) => ({
        url: `/admin/reports/${id}/status`,
        method: "PATCH",
        data,
      }),
      invalidatesTags: ["Report"],
    }),
    addReportNote: builder.mutation<
      AdminReportDetail,
      { id: string; content: string }
    >({
      query: ({ id, content }) => ({
        url: `/admin/reports/${id}/notes`,
        method: "POST",
        data: { content },
      }),
      invalidatesTags: ["Report"],
    }),
    updateReportConclusion: builder.mutation<
      AdminReportDetail,
      { id: string; conclusion: string }
    >({
      query: ({ id, conclusion }) => ({
        url: `/admin/reports/${id}/conclusion`,
        method: "PATCH",
        data: { conclusion },
      }),
      invalidatesTags: ["Report"],
    }),
    exportAdminReports: builder.query<AdminReportExportRow[], AdminReportFilters>({
      query: (params) => ({
        url: "/admin/reports/export",
        method: "GET",
        params,
      }),
    }),
    // ─── Admin Room Report Endpoints ─────────────────────────────────────────
    getAdminRoomReports: builder.query<
      { reports: any[]; total: number; page: number; totalPages: number },
      { page?: number; limit?: number; status?: string; search?: string }
    >({
      query: (params) => ({
        url: "/admin/reports/rooms/list",
        method: "GET",
        params,
      }),
      providesTags: ["Report"],
    }),
    getAdminRoomReportById: builder.query<any, string>({
      query: (id) => ({
        url: `/admin/reports/rooms/${id}`,
        method: "GET",
      }),
      providesTags: (_result, _error, id) => [{ type: "Report" as const, id }],
    }),
    updateRoomReportStatus: builder.mutation<
      any,
      {
        id: string;
        status: string;
        actionResult?: "none" | "blocked" | "disbanded" | "warning";
        note?: string;
      }
    >({
      query: ({ id, ...data }) => ({
        url: `/admin/reports/rooms/${id}/status`,
        method: "PATCH",
        data,
      }),
      invalidatesTags: ["Report"],
    }),
  }),
});

// ─── Report Types ──────────────────────────────────────────────────────────────
export interface AdminReportFilters {
  page?: number;
  limit?: number;
  status?: string;
  reason?: string;
  hasEvidence?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
  [key: string]: string | number | undefined;
}

export interface AdminReportUserInfo {
  supabaseId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  status?: string;
}

export interface AdminReportRoomInfo {
  roomId?: string;
  roomName?: string;
  roomCode?: string;
  hostName?: string;
  occurredAt?: string;
}

export interface AdminReportEvidence {
  url: string;
  fileName: string;
  fileSize: number;
  uploadedAt?: string;
}

export interface AdminNote {
  content: string;
  adminId: string;
  adminEmail: string;
  createdAt: string;
}

export interface ProcessingLogEntry {
  action: string;
  fromStatus?: string;
  toStatus?: string;
  adminId: string;
  adminEmail: string;
  note?: string;
  timestamp: string;
}

export interface AdminReportListItem {
  _id: string;
  reporterId: string;
  reportedUserId: string;
  title?: string;
  reason: string;
  description: string;
  status: string;
  conclusion?: string | null;
  roomInfo?: AdminReportRoomInfo;
  evidences?: AdminReportEvidence[];
  reporter?: AdminReportUserInfo | null;
  reported?: AdminReportUserInfo | null;
  createdAt: string;
  resolvedAt?: string;
  closedAt?: string;
}

export interface AdminReportDetail extends AdminReportListItem {
  adminNotes?: AdminNote[];
  processingLog?: ProcessingLogEntry[];
}

export interface AdminReportListResponse {
  reports: AdminReportListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface RecentActivity {
  id: string;
  timestamp: string;
  reportId: string;
  reason: string;
  action: string;
  fromStatus?: string;
  toStatus?: string;
  adminEmail?: string;
  status: string;
  note?: string;
}

export interface AdminReportStats {
  total: number;
  pending: number;
  investigating: number;
  resolved: number;
  rejected: number;
  closed: number;
  today: number;
  chartData: { date: string; count: number }[];
  byStatus: { status: string; count: number; label: string }[];
  byType: { type: string; count: number }[];
  recentActivities?: RecentActivity[];
}

export interface AdminReportExportRow {
  id: string;
  title: string;
  reason: string;
  description: string;
  status: string;
  conclusion: string;
  reporterEmail: string;
  reporterName: string;
  reportedEmail: string;
  reportedName: string;
  roomName: string;
  hasEvidence: string;
  createdAt: string;
  resolvedAt: string;
  closedAt: string;
}

export const {
  useGetAdminStatsQuery,
  useGetAdminUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useResetPasswordMutation,
  useDeleteUserMutation,
  useLockUserMutation,
  useUnlockUserMutation,
  useExtendUserLockMutation,
  useGetAdminRoomsQuery,
  useGetAdminRoomStatsQuery,
  useGetAdminRoomDetailsQuery,
  useDisbandRoomMutation,
  // Report hooks
  useGetAdminReportStatsQuery,
  useGetAdminReportsQuery,
  useGetAdminReportByIdQuery,
  useUpdateReportStatusMutation,
  useAddReportNoteMutation,
  useUpdateReportConclusionMutation,
  useLazyExportAdminReportsQuery,
  // Room reports
  useGetAdminRoomReportsQuery,
  useGetAdminRoomReportByIdQuery,
  useUpdateRoomReportStatusMutation,
} = adminApi;

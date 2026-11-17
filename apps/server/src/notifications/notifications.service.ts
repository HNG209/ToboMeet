import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { AppGateway } from "../core/gateways/app.gateway";
import {
  Notification,
  NotificationDocument,
} from "./schemas/notification.schema";
import { GetNotificationsDto } from "./dto/get-notifications.dto";
import { NotificationResponse, PageResponse } from "@tobomeet/shared/types";
import { User, UserDocument } from "../users/schemas/user.schema";
import { Room, RoomDocument } from "../rooms/schemas/room.schema";

@Injectable()
export class NotificationsService {
  constructor(
    private appGateway: AppGateway,

    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    @InjectModel(Room.name)
    private roomModel: Model<RoomDocument>,
  ) { }

  /**
   * Helper cập nhật trạng thái có thông báo chưa đọc cho User(s).
   * Chạy bất đồng bộ (không block luồng chính).
   */
  async toggleUnreadStatus(userIds: string | string[], hasUnread: boolean) {
    try {
      const ids = Array.isArray(userIds) ? userIds : [userIds];
      if (ids.length === 0) return;

      await this.userModel.updateMany(
        { supabaseId: { $in: ids } },
        { $set: { hasUnreadNotifications: hasUnread } },
      );
    } catch (error) {
      console.error("Lỗi khi cập nhật trạng thái Unread Notification:", error);
    }
  }

  /**
   * Lấy danh sách thông báo theo phân trang cursor
   */
  async getUserNotifications(
    userId: string,
    query: GetNotificationsDto,
  ): Promise<PageResponse<NotificationResponse>> {
    const { cursor, limit = 20, type, isRead } = query;

    // Build filter an toàn: Bắt buộc filter phải chứa userId của người đang login
    const filter: Record<string, any> = { userId };

    if (type) {
      filter.type = type;
    }

    if (isRead !== undefined) {
      filter.isRead = isRead === "true";
    }

    if (cursor && Types.ObjectId.isValid(cursor)) {
      filter._id = { $lt: new Types.ObjectId(cursor) };
    }

    // Query limit + 1 phần tử để xác định hasNext mà không cần countDocuments
    const notifications = await this.notificationModel
      .find(filter)
      .sort({ _id: -1 }) // Cố định mới nhất lên đầu theo _id ObjectId
      .limit(limit + 1)
      .exec();

    this.toggleUnreadStatus(userId, false);

    const hasNext = notifications.length > limit;
    const pagedDocs = hasNext ? notifications.slice(0, limit) : notifications;

    // Map dữ liệu
    const items: NotificationResponse[] = pagedDocs.map((doc: any) => ({
      _id: doc._id.toString(),
      userId: doc.userId,
      type: doc.type,
      referenceId: doc.referenceId,
      metadata: doc.metadata,
      isRead: doc.isRead,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }));

    const nextCursor =
      hasNext && items.length > 0 ? items[items.length - 1]._id : null;

    return {
      items,
      nextCursor,
      hasNext,
      limit,
    };
  }

  // Thông báo cho người bị kick
  @OnEvent("notification.kicked", { async: true })
  async handleUserKicked(payload: {
    userId: string;
    metadata: Record<string, unknown>;
  }) {
    try {
      const roomId = payload.metadata?.roomId as string | undefined;

      // Tìm thông báo KICKED cũ của cùng roomId để tái sử dụng
      let notif = roomId
        ? await this.notificationModel.findOne({
            userId: payload.userId,
            type: "KICKED",
            $or: [{ referenceId: roomId }, { "metadata.roomId": roomId }],
          })
        : null;

      if (notif) {
        // Tái sử dụng lại nếu cùng 1 roomId, cập nhật lại thông tin phòng và thời gian
        notif.referenceId = roomId;
        notif.metadata = {
          ...notif.metadata,
          ...payload.metadata,
        };
        notif.isRead = false;
        notif.isNotified = false;
        notif.canPopup = true;
        notif.createdAt = new Date();
        notif.markModified("metadata");
        await notif.save();
      } else {
        notif = await this.notificationModel.create({
          userId: payload.userId,
          type: "KICKED",
          referenceId: roomId,
          metadata: payload.metadata,
          isRead: false,
          isNotified: false,
          canPopup: true,
        });
      }

      this.toggleUnreadStatus(payload.userId, true);

      this.appGateway.server
        .to(`user_${payload.userId}`)
        .emit("receive_notifications", [notif]);
    } catch (error) {
      console.error(error);
    }
  }

  // Thông báo cho tất cả thành viên khi giải tán nhóm
  @OnEvent("notification.room_disbanded", { async: true })
  async handleRoomDisbanded(payload: {
    userIds: string[];
    metadata: Record<string, unknown>;
  }) {
    try {
      if (!payload.userIds?.length) return;

      const notificationsToInsert = payload.userIds.map((userId) => ({
        userId,
        type: "ROOM_DISBANDED",
        metadata: payload.metadata,
        isRead: false,
        isNotified: false,
        canPopup: true,
      }));

      const insertedNotifs = await this.notificationModel.insertMany(
        notificationsToInsert,
      );

      this.toggleUnreadStatus(payload.userIds, true);

      insertedNotifs.forEach((notif) => {
        this.appGateway.server
          .to(`user_${notif.userId}`)
          .emit("receive_notifications", [notif]);
      });
    } catch (error) {
      console.error(error);
    }
  }

  // Thông báo cho người bị xoá khỏi cuộc họp
  @OnEvent("notification.participant_removed", { async: true })
  async handleParticipantRemoved(payload: {
    userId: string;
    metadata: Record<string, unknown>;
  }) {
    const newNotif = {
      userId: payload.userId,
      type: "PARTICIPANT_REMOVED",
      metadata: payload.metadata,
    };

    // Không lưu thông báo này

    this.appGateway.server
      .to(`user_${payload.userId}`)
      .emit("receive_notifications", [newNotif]);
  }

  // Thông báo khi phòng bị báo cáo (Gửi cho chủ phòng)
  @OnEvent("notification.room_reported", { async: true })
  async handleRoomReported(payload: {
    userId: string;
    metadata: Record<string, unknown>;
  }) {
    try {
      const newNotif = await this.notificationModel.create({
        userId: payload.userId,
        type: "ROOM_REPORTED",
        metadata: payload.metadata,
        isRead: false,
        isNotified: false,
        canPopup: true,
      });

      this.toggleUnreadStatus(payload.userId, true);

      this.appGateway.server
        .to(`user_${payload.userId}`)
        .emit("receive_notifications", [newNotif]);
    } catch (error) {
      console.error("Lỗi khi tạo thông báo ROOM_REPORTED:", error);
    }
  }

  // Thông báo kết quả báo cáo (Gửi cho người báo cáo)
  @OnEvent("notification.report_resolved", { async: true })
  async handleReportResolved(payload: {
    userId: string;
    metadata: Record<string, unknown>;
  }) {
    try {
      const newNotif = await this.notificationModel.create({
        userId: payload.userId,
        type: "REPORT_RESOLVED",
        metadata: payload.metadata,
        isRead: false,
        isNotified: false,
        canPopup: true,
      });

      this.toggleUnreadStatus(payload.userId, true);

      this.appGateway.server
        .to(`user_${payload.userId}`)
        .emit("receive_notifications", [newNotif]);
    } catch (error) {
      console.error("Lỗi khi tạo thông báo REPORT_RESOLVED:", error);
    }
  }

  // Thông báo khi phòng bị khoá (Gửi cho chủ phòng)
  @OnEvent("notification.room_blocked", { async: true })
  async handleRoomBlocked(payload: {
    userId: string;
    metadata: Record<string, unknown>;
  }) {
    try {
      const newNotif = await this.notificationModel.create({
        userId: payload.userId,
        type: "ROOM_BLOCKED",
        metadata: payload.metadata,
        isRead: false,
        isNotified: false,
        canPopup: true,
      });

      this.toggleUnreadStatus(payload.userId, true);

      this.appGateway.server
        .to(`user_${payload.userId}`)
        .emit("receive_notifications", [newNotif]);
    } catch (error) {
      console.error("Lỗi khi tạo thông báo ROOM_BLOCKED:", error);
    }
  }

  // Thông báo lời mời tham gia lịch họp
  @OnEvent("notification.calendar_invite", { async: true })
  async handleCalendarInvite(payload: {
    userIds: string[];
    referenceId?: string;
    metadata: Record<string, unknown>;
  }) {
    try {
      if (!payload.userIds?.length) return;

      const notificationsToInsert = payload.userIds.map((userId) => ({
        userId,
        type: "CALENDAR_INVITE",
        referenceId: payload.referenceId || (payload.metadata?.eventId as string) || "",
        metadata: payload.metadata,
        isRead: false,
        isNotified: false,
        canPopup: true,
      }));

      const insertedNotifs = await this.notificationModel.insertMany(
        notificationsToInsert,
      );

      this.toggleUnreadStatus(payload.userIds, true);

      insertedNotifs.forEach((notif) => {
        this.appGateway.server
          .to(`user_${notif.userId}`)
          .emit("receive_notifications", [notif]);
      });
    } catch (error) {
      console.error("Lỗi khi tạo thông báo CALENDAR_INVITE:", error);
    }
  }

  // Thông báo khi cuộc họp đến thời điểm bắt đầu
  @OnEvent("notification.calendar_start", { async: true })
  async handleCalendarStart(payload: {
    userIds: string[];
    referenceId?: string;
    metadata: Record<string, unknown>;
  }) {
    try {
      if (!payload.userIds?.length) return;

      const notificationsToInsert = payload.userIds.map((userId) => ({
        userId,
        type: "CALENDAR_START",
        referenceId:
          payload.referenceId || (payload.metadata?.eventId as string) || "",
        metadata: payload.metadata,
        isRead: false,
        isNotified: false,
        canPopup: true,
      }));

      const insertedNotifs = await this.notificationModel.insertMany(
        notificationsToInsert,
      );

      this.toggleUnreadStatus(payload.userIds, true);

      insertedNotifs.forEach((notif) => {
        this.appGateway.server
          .to(`user_${notif.userId}`)
          .emit("receive_notifications", [notif]);
      });
    } catch (error) {
      console.error("Lỗi khi tạo thông báo CALENDAR_START:", error);
    }
  }

  // Cập nhật trạng thái thông báo khi user phản hồi RSVP
  @OnEvent("notification.calendar_rsvp", { async: true })
  async handleCalendarRSVP(payload: {
    userId: string;
    eventId: string;
    status: string;
  }) {
    try {
      await this.notificationModel.updateMany(
        {
          userId: payload.userId,
          type: "CALENDAR_INVITE",
          referenceId: payload.eventId,
        },
        {
          $set: {
            "metadata.rsvpStatus": payload.status,
            isRead: true,
          },
        },
      );
    } catch (error) {
      console.error("Lỗi khi cập nhật trạng thái thông báo CALENDAR_INVITE:", error);
    }
  }

  // Xử lý xóa thông báo khi người dùng hủy tham gia / rời lịch họp
  @OnEvent("notification.calendar_leave", { async: true })
  async handleCalendarLeave(payload: {
    userId: string;
    userIds?: string[];
    eventId: string;
  }) {
    try {
      const userIds = payload.userIds?.length
        ? payload.userIds
        : [payload.userId];

      await this.notificationModel.deleteMany({
        userId: { $in: userIds },
        $or: [
          { referenceId: payload.eventId },
          { "metadata.eventId": payload.eventId },
        ],
      });

      for (const uid of userIds) {
        const hasUnread = await this.notificationModel.exists({
          userId: uid,
          isRead: false,
        });
        if (!hasUnread) {
          await this.toggleUnreadStatus(uid, false);
        }

        this.appGateway.server
          .to(`user_${uid}`)
          .emit("notification_deleted", {
            referenceId: payload.eventId,
            userId: uid,
          });
      }
    } catch (error) {
      console.error("Lỗi khi xóa thông báo khi huỷ tham gia lịch:", error);
    }
  }

  /**
   * Helper tìm danh sách userId các thành viên nhận thông báo (loại trừ author/chính bản thân):
   * - Nếu là kênh riêng tư: gửi cho danh sách members của kênh đó (+ chủ phòng ngầm định)
   * - Nếu là kênh công khai: gửi cho toàn bộ members của phòng
   * Đồng thời lấy thông tin roomName, channelName bất đồng bộ.
   */
  private async getRoomRecipientMembers(
    roomId: string,
    excludeUserId: string,
    channelId?: string,
    channelIds?: string[],
  ): Promise<{
    roomName: string;
    channelName: string;
    recipientUserIds: string[];
  }> {
    try {
      const room = await this.roomModel
        .findOne({ _id: roomId, isDeleted: { $ne: true } })
        .select("name ownerId channels members")
        .lean();

      if (!room) {
        return { roomName: "", channelName: "", recipientUserIds: [] };
      }

      // Chuẩn bị danh sách target channel IDs
      const targetChannelIds = new Set<string>();
      if (channelId) targetChannelIds.add(channelId.toString());
      if (channelIds && Array.isArray(channelIds)) {
        channelIds.forEach((id) => id && targetChannelIds.add(id.toString()));
      }

      // Tìm thông tin các kênh tương ứng trong room.channels
      const matchingChannels = (room.channels || []).filter((c: any) =>
        targetChannelIds.has(c._id?.toString()),
      );

      // Kênh đại diện để hiển thị tên trên thông báo
      const primaryChannel =
        matchingChannels[0] ||
        (channelId
          ? (room.channels || []).find((c: any) => c._id?.toString() === channelId)
          : undefined);
      const channelName = primaryChannel?.name || "";

      // Danh sách thành viên active trong phòng
      const activeRoomMemberMap = new Map<string, any>();
      (room.members || []).forEach((m: any) => {
        if (m.userId && m.status !== "left" && m.status !== "removed") {
          activeRoomMemberMap.set(m.userId, m);
        }
      });
      // Chủ phòng luôn có toàn quyền và active trong phòng
      if (room.ownerId && !activeRoomMemberMap.has(room.ownerId)) {
        activeRoomMemberMap.set(room.ownerId, { userId: room.ownerId, role: "owner" });
      }

      let recipientUserIds: string[] = [];

      // Kiểm tra tính riêng tư:
      // Nếu có kênh mục tiêu và tất cả kênh mục tiêu đều là riêng tư (isPrivate === true)
      const hasChannels = matchingChannels.length > 0;
      const isAllPrivate =
        hasChannels && matchingChannels.every((c: any) => c.isPrivate === true);

      if (isAllPrivate) {
        // Kênh riêng tư: Lấy danh sách thành viên trong mảng members của (các) kênh đó
        const privateChannelMemberIds = new Set<string>();

        matchingChannels.forEach((c: any) => {
          (c.members || []).forEach((cm: any) => {
            const uid = cm?.userId || (typeof cm === "string" ? cm : null);
            if (uid) privateChannelMemberIds.add(uid);
          });
        });

        // Chủ phòng luôn ngầm định có quyền trong mọi kênh riêng tư
        if (room.ownerId) {
          privateChannelMemberIds.add(room.ownerId);
        }

        // Lọc: phải là thành viên còn active trong phòng và loại trừ chính bản thân người gửi
        recipientUserIds = Array.from(privateChannelMemberIds).filter(
          (uid) => uid !== excludeUserId && activeRoomMemberMap.has(uid),
        );
      } else {
        // Kênh công khai hoặc thông báo toàn phòng: Gửi toàn bộ members của room (trừ chính bản thân)
        recipientUserIds = Array.from(activeRoomMemberMap.keys()).filter(
          (uid) => uid !== excludeUserId,
        );
      }

      return {
        roomName: room.name || "",
        channelName,
        recipientUserIds,
      };
    } catch (err) {
      console.error("Lỗi khi truy vấn thành viên phòng cho thông báo:", err);
      return { roomName: "", channelName: "", recipientUserIds: [] };
    }
  }

  // Thông báo khi có bài viết mới trong kênh
  @OnEvent("notification.post_created", { async: true })
  async handleChannelPostCreated(payload: {
    roomId?: string;
    channelId?: string;
    authorId?: string;
    authorName?: string;
    authorAvatarUrl?: string;
    summary?: string;
    userIds?: string[];
    referenceId?: string;
    metadata?: Record<string, unknown>;
  }) {
    try {
      let recipientUserIds = payload.userIds || [];
      let roomName = (payload.metadata?.roomName as string) || "";
      let channelName = (payload.metadata?.channelName as string) || "";

      if (!recipientUserIds.length && payload.roomId && payload.authorId) {
        const queryRes = await this.getRoomRecipientMembers(
          payload.roomId,
          payload.authorId,
          payload.channelId,
        );
        recipientUserIds = queryRes.recipientUserIds;
        roomName = queryRes.roomName || roomName;
        channelName = queryRes.channelName || channelName;
      }

      if (!recipientUserIds.length) return;

      const metadata: Record<string, any> = {
        roomId: payload.roomId || (payload.metadata?.roomId as string),
        roomName,
        channelId: payload.channelId || (payload.metadata?.channelId as string),
        channelName,
        postId:
          payload.referenceId || (payload.metadata?.postId as string) || "",
        authorId: payload.authorId || (payload.metadata?.authorId as string),
        authorName:
          payload.authorName ||
          (payload.metadata?.authorName as string) ||
          "Người dùng",
        authorAvatarUrl:
          payload.authorAvatarUrl ||
          (payload.metadata?.authorAvatarUrl as string) ||
          "",
        summary: payload.summary || (payload.metadata?.summary as string) || "",
        ...(payload.metadata || {}),
      };

      const notificationsToInsert = recipientUserIds.map((userId) => ({
        userId,
        type: "CHANNEL_POST",
        referenceId: payload.referenceId || metadata.postId || "",
        metadata,
        isRead: false,
        isNotified: false,
        canPopup: true,
      }));

      const insertedNotifs = await this.notificationModel.insertMany(
        notificationsToInsert,
      );

      this.toggleUnreadStatus(recipientUserIds, true);

      insertedNotifs.forEach((notif) => {
        this.appGateway.server
          .to(`user_${notif.userId}`)
          .emit("receive_notifications", [notif]);
      });
    } catch (error) {
      console.error("Lỗi khi tạo thông báo CHANNEL_POST:", error);
    }
  }

  // Thông báo khi có nhiệm vụ mới trong kênh / phòng
  @OnEvent("notification.assignment_created", { async: true })
  async handleAssignmentCreated(payload: {
    roomId?: string;
    channelId?: string;
    channelIds?: string[];
    authorId?: string;
    title?: string;
    deadline?: Date;
    userIds?: string[];
    referenceId?: string;
    metadata?: Record<string, unknown>;
  }) {
    try {
      let recipientUserIds = payload.userIds || [];
      let roomName = (payload.metadata?.roomName as string) || "";
      let channelName = (payload.metadata?.channelName as string) || "";

      if (!recipientUserIds.length && payload.roomId && payload.authorId) {
        const queryRes = await this.getRoomRecipientMembers(
          payload.roomId,
          payload.authorId,
          payload.channelId,
          payload.channelIds,
        );
        recipientUserIds = queryRes.recipientUserIds;
        roomName = queryRes.roomName || roomName;
        channelName = queryRes.channelName || channelName;
      }

      if (!recipientUserIds.length) return;

      let authorName = (payload.metadata?.authorName as string) || "";
      let authorAvatarUrl = (payload.metadata?.authorAvatarUrl as string) || "";

      if (!authorName && payload.authorId) {
        const authorUser = await this.userModel
          .findOne({ supabaseId: payload.authorId })
          .select("displayName avatarUrl email")
          .lean();
        authorName =
          authorUser?.displayName ||
          authorUser?.email?.split("@")[0] ||
          "Giáo viên";
        authorAvatarUrl = authorUser?.avatarUrl || "";
      }

      const metadata: Record<string, any> = {
        roomId: payload.roomId || (payload.metadata?.roomId as string),
        roomName,
        channelId: payload.channelId || (payload.metadata?.channelId as string),
        channelName,
        assignmentId:
          payload.referenceId ||
          (payload.metadata?.assignmentId as string) ||
          "",
        authorId: payload.authorId || (payload.metadata?.authorId as string),
        authorName: authorName || "Giáo viên",
        authorAvatarUrl,
        title: payload.title || (payload.metadata?.title as string) || "",
        deadline: payload.deadline || (payload.metadata?.deadline as any),
        ...(payload.metadata || {}),
      };

      const notificationsToInsert = recipientUserIds.map((userId) => ({
        userId,
        type: "ASSIGNMENT_CREATED",
        referenceId: payload.referenceId || metadata.assignmentId || "",
        metadata,
        isRead: false,
        isNotified: false,
        canPopup: true,
      }));

      const insertedNotifs = await this.notificationModel.insertMany(
        notificationsToInsert,
      );

      this.toggleUnreadStatus(recipientUserIds, true);

      insertedNotifs.forEach((notif) => {
        this.appGateway.server
          .to(`user_${notif.userId}`)
          .emit("receive_notifications", [notif]);
      });
    } catch (error) {
      console.error("Lỗi khi tạo thông báo ASSIGNMENT_CREATED:", error);
    }
  }

  // Thông báo khi có lịch họp / sự kiện mới trong kênh
  @OnEvent("notification.channel_event_created", { async: true })
  async handleChannelEventCreated(payload: {
    roomId?: string;
    channelId?: string;
    hostId?: string;
    hostName?: string;
    hostAvatarUrl?: string;
    title?: string;
    startDate?: string;
    endDate?: string;
    location?: string;
    roomType?: string;
    userIds?: string[];
    referenceId?: string;
    metadata?: Record<string, unknown>;
  }) {
    try {
      let recipientUserIds = payload.userIds || [];
      let roomName = (payload.metadata?.roomName as string) || "";
      let channelName = (payload.metadata?.channelName as string) || "";

      if (!recipientUserIds.length && payload.roomId && payload.hostId) {
        const queryRes = await this.getRoomRecipientMembers(
          payload.roomId,
          payload.hostId,
          payload.channelId,
        );
        recipientUserIds = queryRes.recipientUserIds;
        roomName = queryRes.roomName || roomName;
        channelName = queryRes.channelName || channelName;
      }

      if (!recipientUserIds.length) return;

      const metadata: Record<string, any> = {
        roomId: payload.roomId || (payload.metadata?.roomId as string),
        roomName,
        channelId: payload.channelId || (payload.metadata?.channelId as string),
        channelName,
        eventId:
          payload.referenceId || (payload.metadata?.eventId as string) || "",
        hostId: payload.hostId || (payload.metadata?.hostId as string),
        hostName:
          payload.hostName ||
          (payload.metadata?.hostName as string) ||
          "Người tổ chức",
        hostAvatarUrl:
          payload.hostAvatarUrl ||
          (payload.metadata?.hostAvatarUrl as string) ||
          "",
        title: payload.title || (payload.metadata?.title as string) || "",
        startDate:
          payload.startDate || (payload.metadata?.startDate as string) || "",
        endDate: payload.endDate || (payload.metadata?.endDate as string) || "",
        location:
          payload.location || (payload.metadata?.location as string) || "",
        roomType:
          payload.roomType ||
          (payload.metadata?.roomType as string) ||
          "channel_meeting",
        ...(payload.metadata || {}),
      };

      const notificationsToInsert = recipientUserIds.map((userId) => ({
        userId,
        type: "CHANNEL_EVENT_CREATED",
        referenceId:
          payload.referenceId ||
          (payload.metadata?.eventId as string) ||
          metadata.eventId ||
          "",
        metadata,
        isRead: false,
        isNotified: false,
        canPopup: true,
      }));

      const insertedNotifs = await this.notificationModel.insertMany(
        notificationsToInsert,
      );

      this.toggleUnreadStatus(recipientUserIds, true);

      insertedNotifs.forEach((notif) => {
        this.appGateway.server
          .to(`user_${notif.userId}`)
          .emit("receive_notifications", [notif]);
      });
    } catch (error) {
      console.error("Lỗi khi tạo thông báo CHANNEL_EVENT_CREATED:", error);
    }
  }
}


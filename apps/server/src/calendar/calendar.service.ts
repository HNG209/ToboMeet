import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";

import { CalendarEvent, CalendarEventDocument } from "./schemas/calendar-event.schema";
import { User, UserDocument } from "../users/schemas/user.schema";
import { Room, RoomDocument } from "../rooms/schemas/room.schema";
import { rrulestr } from "rrule";
import { AppGateway } from "../core/gateways/app.gateway";
import { UpdateEventDto } from "./dto/update-event.dto";
import { CreateEventDto } from "./dto/create-event.dto";
import {
  CalendarRSVPMember,
  CalendarRSVPStatus,
  ErrorCode,
} from "@tobomeet/shared/types";
import { AppException } from "../core/exceptions/app.exception";
import { MeetingsService } from "../meetings/meetings.service";
import { EventEmitter2 } from "@nestjs/event-emitter";

import { Assignment, AssignmentDocument } from "../assignments/schemas/assignment.schema";
import {
  AssignmentSubmission,
  AssignmentSubmissionDocument,
} from "../assignments/schemas/submission.schema";
import { SchedulerClientService } from "../scheduler-client/scheduler-client.service";
import { VectorDbService } from "../vector-db/vector-db.service";

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    @InjectModel(CalendarEvent.name)
    private calendarEventModel: Model<CalendarEventDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Room.name) private roomModel: Model<RoomDocument>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @InjectModel("Post") private postModel: Model<any>,
    @InjectModel(Assignment.name)
    private assignmentModel: Model<AssignmentDocument>,
    @InjectModel(AssignmentSubmission.name)
    private submissionModel: Model<AssignmentSubmissionDocument>,
    private readonly appGateway: AppGateway,
    private readonly meetingsService: MeetingsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly schedulerClientService: SchedulerClientService,
    private readonly vectorDbService: VectorDbService,
  ) { }

  /**
   * Tạo lịch họp mới
   */
  async createEvent(userId: string, data: CreateEventDto) {
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);

    // Kiểm tra tính hợp lệ của Room và Channel trong DB cho channel_meeting
    if (data.roomType === "channel_meeting" && data.roomId && data.channelId) {
      const room = await this.roomModel.findOne({
        _id: data.roomId,
        isDeleted: { $ne: true },
      });
      if (!room) {
        throw new AppException(ErrorCode.CALENDAR_ROOM_NOT_FOUND);
      }
      const channelExists = room.channels.some(
        (ch) => ch._id?.toString() === data.channelId,
      );
      if (!channelExists) {
        throw new AppException(ErrorCode.CALENDAR_CHANNEL_NOT_FOUND);
      }
    }

    // Lấy meeting code từ MeetingService thay cho random string
    const { meetingCode } = await this.meetingsService.ensureMeetingCode({
      roomType: data.roomType,
      userId,
      roomId: data.roomId,
      channelId: data.channelId,
    });

    // Lấy mảng userIds cho khách mời riêng lẻ
    const inviteeUserIds: string[] = [];
    if (data.invitees && data.invitees.length > 0) {
      for (const invitee of data.invitees) {
        let uId = invitee.userId;
        if (!uId && invitee.email) {
          const u = await this.userModel.findOne({ email: invitee.email }).exec();
          if (u) uId = u.supabaseId;
        }
        if (uId && uId !== userId && !inviteeUserIds.includes(uId)) {
          inviteeUserIds.push(uId);
        }
      }
    }

    // Nếu tạo cuộc họp kênh (channel meeting), ghi nhận toàn bộ thành viên trong kênh vào acceptedUserIds (không thông báo)
    let acceptedUserIds: string[] = [];
    const isChannelMeeting = Boolean(
      (data.roomType === "channel_meeting" || data.channelId) &&
      data.roomId &&
      data.channelId,
    );

    if (isChannelMeeting) {
      const room = await this.roomModel.findOne({
        _id: data.roomId,
        isDeleted: { $ne: true },
      });
      if (room) {
        const channel = room.channels.find(
          (ch) => ch._id?.toString() === data.channelId,
        );
        if (channel) {
          const channelMemberIds = new Set<string>();
          if (room.ownerId) channelMemberIds.add(room.ownerId);

          if (channel.isPrivate) {
            // Kênh riêng tư: Lấy thành viên được phân quyền trong channel.members
            channel.members?.forEach((m) => {
              if (m.userId) channelMemberIds.add(m.userId);
            });
          } else {
            // Kênh công khai: Tất cả thành viên trong room còn active (trừ người đã rời kênh)
            const leftSet = new Set(channel.leftMemberIds || []);
            room.members?.forEach((m) => {
              if (
                m.userId &&
                m.status !== "left" &&
                m.status !== "removed" &&
                !leftSet.has(m.userId)
              ) {
                channelMemberIds.add(m.userId);
              }
            });
          }

          acceptedUserIds = Array.from(
            new Set([...acceptedUserIds, ...channelMemberIds]),
          ).filter((id) => id !== userId);
        }
      }
    }

    // Trích xuất recurrenceEndDate từ RRULE (nếu có UNTIL)
    let isRecurring = false;
    let recurrenceEndDate: Date | null = null;
    if (data.recurrenceRule) {
      isRecurring = true;
      const match = data.recurrenceRule.match(/UNTIL=([^;]+)/);
      if (match) {
        const untilStr = match[1];
        const formattedStr = untilStr.replace(
          /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
          "$1-$2-$3T$4:$5:$6Z",
        );
        recurrenceEndDate = new Date(formattedStr);
      }
    }

    // Tạo Event mới
    const event = await this.calendarEventModel.create({
      ...data,
      hostId: userId,
      meetingCode,
      startDate: start,
      endDate: end,
      isRecurring,
      recurrenceEndDate,
      acceptedUserIds,
      pendingUserIds: isChannelMeeting ? [] : inviteeUserIds,
      notificationsEnabledUserIds: Array.from(
        new Set([userId, ...acceptedUserIds, ...inviteeUserIds]),
      ),
    });

    // Đồng bộ vector lên Pinecone
    try {
      await this.vectorDbService.upsertEventVector(
        event._id.toString(),
        event.title,
        event.description,
        userId,
        event.acceptedUserIds || [],
      );
    } catch (err: any) {
      this.logger.warn(`Failed to upsert event vector: ${err?.message}`);
    }

    // Gửi thông báo lời mời cho những người được mời riêng lẻ (không gửi thông báo riêng cho thành viên kênh nếu là cuộc họp kênh)
    if (!isChannelMeeting && inviteeUserIds.length > 0) {
      const hostUser = await this.userModel
        .findOne({ supabaseId: userId })
        .select("displayName email avatarUrl")
        .exec();
      const hostDisplayName =
        hostUser?.displayName ||
        hostUser?.email?.split("@")[0] ||
        "Người tổ chức";

      this.eventEmitter.emit("notification.calendar_invite", {
        userIds: inviteeUserIds,
        referenceId: event._id.toString(),
        metadata: {
          eventId: event._id.toString(),
          title: event.title,
          startDate: event.startDate.toISOString(),
          endDate: event.endDate.toISOString(),
          inviterId: userId,
          inviterName: hostDisplayName,
          inviterAvatarUrl: hostUser?.avatarUrl || "",
          meetingCode: event.meetingCode,
          location: event.location,
          description: event.description,
          roomType: event.roomType,
        },
      });
    }

    // Đính kèm thông tin host để FE hiển thị ngay không cần fetch lại
    const hostUser = await this.userModel
      .findOne({ supabaseId: userId })
      .select("email displayName avatarUrl")
      .exec();
    const eventWithHost = {
      ...event.toObject(),
      hostEmail: hostUser?.email || "",
      hostDisplayName:
        hostUser?.displayName || hostUser?.email?.split("@")[0] || "",
      hostAvatarUrl: hostUser?.avatarUrl || "",
    };

    // Nếu tạo trong Group/Channel, gửi cho mọi thành viên trong kênh qua Socket
    if (data.channelId && data.roomType === "channel_meeting" && data.roomId) {
      this.appGateway.server
        .to(data.channelId)
        .emit("channel_calendar_event_created", eventWithHost);

      // Tự động tạo meeting post trong bảng tin kênh
      try {
        const meetingPost = await this.postModel.create({
          roomId: data.roomId,
          channelId: data.channelId,
          authorId: userId,
          content: "Đã lên lịch cuộc họp",
          isMeeting: true,
          meetingId: event._id.toString(),
          meetingTitle: event.title,
          meetingStartDate: event.startDate,
          meetingEndDate: event.endDate,
          meetingCode: event.meetingCode,
          attachments: [],
          reactions: [],
          isEdited: false,
        });

        // Lấy thông tin user để emit realtime
        const authorUser = await this.userModel
          .findOne({ supabaseId: userId })
          .exec();
        const postWithAuthor = {
          ...meetingPost.toObject(),
          author: {
            userId: userId,
            displayName:
              authorUser?.displayName ||
              authorUser?.email?.split("@")[0] ||
              "Người dùng ẩn danh",
            avatarUrl: authorUser?.avatarUrl || "",
            role: "member",
          },
          commentsCount: 0,
          reactionStats: [],
          userReaction: null,
        };

        // Phát realtime qua Socket IO cho kênh bảng tin
        this.appGateway.server
          .to(`room_${data.roomId}`)
          .emit("post_created", postWithAuthor);
      } catch (err) {
        console.error("Lỗi khi tự động tạo post lịch họp kênh:", err);
      }

      // Chỉ emit cho các thành viên trong phòng họp kênh
      if (acceptedUserIds.length > 0) {
        for (const memberId of acceptedUserIds) {
          this.appGateway.server
            .to(`user_${memberId}`)
            .emit("calendar_event_created", eventWithHost);
        }
      }
    } else if (data.channelId) {
      this.appGateway.server
        .to(data.channelId)
        .emit("channel_calendar_event_created", eventWithHost);

      if (acceptedUserIds.length > 0) {
        for (const memberId of acceptedUserIds) {
          this.appGateway.server
            .to(`user_${memberId}`)
            .emit("calendar_event_created", eventWithHost);
        }
      }
    }

    // Tính toán thời điểm đầu tiên để gọi scheduler service
    const firstTriggerDate = this.calculateFirstOccurrence(
      event.startDate,
      event.isRecurring,
      event.recurrenceRule,
      event.recurrenceExceptions,
    );

    this.schedulerClientService
      .scheduleJob({
        targetQueue: "calendar",
        triggerAt: firstTriggerDate,
        payload: {
          eventId: event._id.toString(),
          occurrenceDate: firstTriggerDate.toISOString(),
          title: event.title,
          meetingCode: event.meetingCode,
        },
      })
      .catch((err) => {
        this.logger.error(
          `Lỗi khi gửi lịch trình ban đầu sang Scheduler Service cho sự kiện ${event._id}:`,
          err,
        );
      });

    return { event: eventWithHost };
  }

  /**
   * Truy vấn lịch họp theo khoảng thời gian và sinh chuỗi lặp ảo
   */
  async getEvents(
    userId: string,
    startRange: string,
    endRange: string,
    filters?: { roomId?: string; createdByMe?: boolean },
  ) {
    const rangeStart = new Date(startRange);
    const rangeEnd = new Date(endRange);

    const andConditions: any[] = [];

    // Điều kiện quyền truy cập
    if (filters?.createdByMe) {
      andConditions.push({ hostId: userId });
    } else if (filters?.roomId) {
      andConditions.push({ roomId: filters.roomId });
    } else {
      // Lấy sự kiện tôi làm host HOẶC tôi đã ACCEPT
      andConditions.push({
        $or: [{ hostId: userId }, { acceptedUserIds: userId }],
      });
    }

    // Điều kiện thời gian
    // TH1: Sự kiện đơn lẻ — nằm trong khoảng range (overlap)
    // TH2: Sự kiện lặp — chuỗi đã bắt đầu trước rangeEnd và chưa kết thúc trước rangeStart
    andConditions.push({
      $or: [
        // TH1: Sự kiện đơn lẻ (isRecurring = false hoặc không có)
        {
          $and: [
            { isRecurring: { $ne: true } },
            { startDate: { $lte: rangeEnd } },
            { endDate: { $gte: rangeStart } },
          ],
        },
        // TH2: Sự kiện Lặp (isRecurring = true)
        {
          $and: [
            { isRecurring: true },
            { startDate: { $lte: rangeEnd } }, // Chuỗi đã bắt đầu trước khi range kết thúc
            {
              $or: [
                { recurrenceEndDate: null },           // Lặp vô hạn
                { recurrenceEndDate: { $exists: false } },
                { recurrenceEndDate: { $gte: rangeStart } }, // Kết thúc sau khi range bắt đầu
              ],
            },
          ],
        },
      ],
    });

    const query = { $and: andConditions };
    const events = await this.calendarEventModel.find(query).exec();
    const resultEvents = [];

    for (const event of events) {
      if (!event.isRecurring) {
        // Sự kiện đơn lẻ thông thường
        resultEvents.push(event);
      } else {
        // Sự kiện lặp chuẩn RFC 5545
        try {
          const offsetMs = 7 * 60 * 60 * 1000; // GMT+07:00 (Asia/Ho_Chi_Minh)
          const localStart = new Date(event.startDate.getTime() + offsetMs);
          const localRangeStart = new Date(rangeStart.getTime() + offsetMs);
          const localRangeEnd = new Date(rangeEnd.getTime() + offsetMs);

          const rule = rrulestr(event.recurrenceRule, { dtstart: localStart });
          const occurrences = rule.between(localRangeStart, localRangeEnd, true);

          const duration = event.endDate.getTime() - event.startDate.getTime();

          for (const occ of occurrences) {
            const dateStr = occ.toISOString().substring(0, 10);

            // Bỏ qua nếu ngày này nằm trong danh sách ngoại lệ (bị hủy)
            if (event.recurrenceExceptions?.includes(dateStr)) {
              continue;
            }

            const occStart = new Date(occ.getTime() - offsetMs);
            const occEnd = new Date(occStart.getTime() + duration);

            // Clone Event
            resultEvents.push({
              ...event.toObject(),
              startDate: occStart,
              endDate: occEnd,
              isOccurrence: true,
              occurrenceDate: dateStr,
            });
          }
        } catch (e) {
          console.error("Lỗi parse RRULE:", e);
        }
      }
    }

    // Đính kèm thông tin người tổ chức (hostEmail, hostDisplayName)
    const finalEvents = [];
    for (const e of resultEvents) {
      const hostUser = await this.userModel
        .findOne({ supabaseId: e.hostId })
        .select("email displayName avatarUrl")
        .exec();

      const eventObj = typeof e.toObject === "function" ? e.toObject() : e;
      finalEvents.push({
        ...eventObj,
        hostEmail: hostUser ? hostUser.email : "",
        hostDisplayName: hostUser
          ? hostUser.displayName || hostUser.email.split("@")[0]
          : "",
        hostAvatarUrl: hostUser ? hostUser.avatarUrl : "",
      });
    }

    // Tìm các nhiệm vụ (Assignment) có hạn nộp (deadline) trong khoảng thời gian [rangeStart, rangeEnd]
    const assignmentQuery: Record<string, unknown> = {
      deadline: { $gte: rangeStart, $lte: rangeEnd },
      status: "published",
    };

    if (filters?.roomId) {
      assignmentQuery.roomId = filters.roomId;
    }

    const assignments = await this.assignmentModel.find(assignmentQuery).exec();
    const now = new Date();

    if (assignments.length > 0) {
      const roomIds = Array.from(new Set(assignments.map((a) => a.roomId)));
      const rooms = await this.roomModel.find({ _id: { $in: roomIds } }).exec();
      const roomMap = new Map(rooms.map((r) => [r._id.toString(), r]));

      for (const assignment of assignments) {
        const room = roomMap.get(assignment.roomId);
        if (!room) continue;

        const isCreator = assignment.createdBy === userId;
        const member = room.members?.find(
          (m) => m.userId === userId && m.status === "active",
        );

        // Quyền truy cập: Người tạo HOẶC thành viên hợp lệ trong phòng
        if (!isCreator) {
          if (!member) continue;

          if (
            (assignment.recipientType === "specific_members" ||
              assignment.recipientType === "current_members") &&
            assignment.recipientMemberIds?.length > 0
          ) {
            const userMemberId = (member as any)._id?.toString();
            const hasAccess =
              assignment.recipientMemberIds.includes(userId) ||
              (userMemberId &&
                assignment.recipientMemberIds.includes(userMemberId));
            if (!hasAccess) continue;
          }
        }

        // Xác định trạng thái của nhiệm vụ đối với người dùng này
        let assignmentStatus:
          | "in_progress"
          | "submitted"
          | "graded"
          | "overdue"
          | "closed" = "in_progress";
        const submission = await this.submissionModel
          .findOne({
            assignmentId: assignment._id.toString(),
            studentId: userId,
          })
          .exec();

        if (
          assignment.submissionPolicy === "lock_after_deadline" &&
          assignment.deadline &&
          now > assignment.deadline
        ) {
          assignmentStatus = "closed";
        }

        if (submission) {
          if (submission.score !== undefined && submission.score !== null) {
            assignmentStatus = "graded";
          } else {
            assignmentStatus = "submitted";
          }
        } else if (assignment.deadline && now > assignment.deadline) {
          if (assignmentStatus !== "closed") {
            assignmentStatus = "overdue";
          }
        }

        // Thông tin người giao
        const creatorUser = await this.userModel
          .findOne({ supabaseId: assignment.createdBy })
          .select("email displayName avatarUrl")
          .exec();

        finalEvents.push({
          _id: `assignment_${assignment._id}`,
          assignmentId: assignment._id.toString(),
          title: assignment.title || "Nhiệm vụ",
          description: assignment.description || "",
          startDate: assignment.deadline,
          endDate: assignment.deadline,
          assignmentStartDate:
            assignment.startDate || (assignment as any).createdAt,
          assignmentDueDate: assignment.deadline,
          eventType: "assignment",
          assignmentStatus,
          roomId: assignment.roomId,
          channelIds: assignment.channelIds || [],
          meetingCode: "",
          hostId: assignment.createdBy,
          hostEmail: creatorUser ? creatorUser.email : "",
          hostDisplayName: creatorUser
            ? creatorUser.displayName || creatorUser.email.split("@")[0]
            : "",
          hostAvatarUrl: creatorUser ? creatorUser.avatarUrl : "",
          roomType: "classroom",
          status: "active",
        });
      }
    }

    return finalEvents;
  }

  /**
   * Cập nhật lịch họp (Chỉ lần này / Toàn chuỗi)
   */
  async updateEvent(
    userId: string,
    eventId: string,
    updateType: "single" | "all",
    data: Partial<UpdateEventDto>,
    occurrenceDate?: string,
  ) {
    const event = await this.calendarEventModel.findById(eventId);
    if (!event) {
      throw new AppException(ErrorCode.CALENDAR_EVENT_NOT_FOUND);
    }

    // Kiểm tra quyền (Chỉ host mới có quyền sửa đổi)
    if (event.hostId !== userId) {
      throw new AppException(ErrorCode.CALENDAR_EVENT_FORBIDDEN);
    }

    if (updateType === "single" && event.recurrenceRule && occurrenceDate) {
      // Chỉ chỉnh sửa 1 buổi đơn lẻ trong chuỗi lặp
      event.recurrenceExceptions.push(occurrenceDate);
      await event.save();

      // Tạo một CalendarEvent mới không lặp riêng biệt cho ngày này
      const originalStart = new Date(data.startDate || event.startDate);
      const originalEnd = new Date(data.endDate || event.endDate);

      const newEvent = await this.calendarEventModel.create({
        ...event.toObject(),
        _id: undefined,
        startDate: originalStart,
        endDate: originalEnd,
        recurrenceRule: undefined,
        recurrenceExceptions: [],
        title: data.title || event.title,
        description: data.description || event.description,
      });

      // Upsert vector cho sự kiện tách lẻ
      this.vectorDbService
        .upsertEventVector(
          newEvent._id.toString(),
          newEvent.title,
          newEvent.description,
          newEvent.hostId,
          newEvent.acceptedUserIds || [],
        )
        .catch((err) => {
          this.logger.warn(`Failed to upsert newEvent vector: ${err?.message}`);
        });

      const hostUser = await this.userModel
        .findOne({ supabaseId: event.hostId })
        .select("email displayName avatarUrl")
        .exec();
      const newEventWithHost = {
        ...newEvent.toObject(),
        hostEmail: hostUser?.email || "",
        hostDisplayName:
          hostUser?.displayName || hostUser?.email?.split("@")[0] || "",
        hostAvatarUrl: hostUser?.avatarUrl || "",
      };

      // Chỉ gửi realtime thông báo cho những người đã chấp nhận (acceptedUserIds) và host
      const targetUserIds = Array.from(
        new Set([event.hostId, ...(event.acceptedUserIds || [])]),
      ).filter(Boolean);

      const updatePayload = {
        eventId,
        updateType,
        occurrenceDate,
        event: newEventWithHost,
      };

      for (const uid of targetUserIds) {
        this.appGateway.server
          .to(`user_${uid}`)
          .emit("calendar_event_updated", updatePayload);
      }
      return newEventWithHost;
    } else {
      // Chỉnh sửa toàn bộ chuỗi
      const updateData: any = {};
      if (data.title !== undefined) updateData.title = data.title;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.location !== undefined) updateData.location = data.location;
      if (data.roomType !== undefined) updateData.roomType = data.roomType;
      if (data.startDate) updateData.startDate = new Date(data.startDate);
      if (data.endDate) updateData.endDate = new Date(data.endDate);

      if (data.recurrenceRule !== undefined) {
        if (data.recurrenceRule && data.recurrenceRule !== "NONE") {
          updateData.isRecurring = true;
          updateData.recurrenceRule = data.recurrenceRule;
          const match = data.recurrenceRule.match(/UNTIL=([^;]+)/);
          if (match) {
            const untilStr = match[1];
            const formattedStr = untilStr.replace(
              /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
              "$1-$2-$3T$4:$5:$6Z",
            );
            updateData.recurrenceEndDate = new Date(formattedStr);
          } else {
            updateData.recurrenceEndDate = null;
          }
        } else {
          updateData.isRecurring = false;
          updateData.recurrenceRule = null;
          updateData.recurrenceEndDate = null;
        }
      }

      const updatedEvent = await this.calendarEventModel.findByIdAndUpdate(
        eventId,
        { $set: updateData },
        { new: true },
      );

      if (!updatedEvent) {
        throw new AppException(ErrorCode.CALENDAR_EVENT_NOT_FOUND);
      }

      // Cập nhật vector sự kiện lên Pinecone
      this.vectorDbService
        .upsertEventVector(
          updatedEvent._id.toString(),
          updatedEvent.title,
          updatedEvent.description,
          updatedEvent.hostId,
          updatedEvent.acceptedUserIds || [],
        )
        .catch((err) => {
          this.logger.warn(`Failed to update event vector: ${err?.message}`);
        });

      // Cập nhật lại bài đăng meeting post nếu là cuộc họp kênh
      if (
        updatedEvent.roomType === "channel_meeting" &&
        updatedEvent.roomId &&
        updatedEvent.channelId
      ) {
        try {
          const post = await this.postModel.findOneAndUpdate(
            { meetingId: eventId, isDeleted: { $ne: true } },
            {
              $set: {
                meetingTitle: updatedEvent.title,
                meetingStartDate: updatedEvent.startDate,
                meetingEndDate: updatedEvent.endDate,
              },
            },
            { new: true },
          );

          if (post) {
            const authorUser = await this.userModel
              .findOne({ supabaseId: post.authorId })
              .exec();
            const postWithAuthor = {
              ...post.toObject(),
              author: {
                userId: post.authorId,
                displayName:
                  authorUser?.displayName ||
                  authorUser?.email?.split("@")[0] ||
                  "Người dùng ẩn danh",
                avatarUrl: authorUser?.avatarUrl || "",
                role: "member",
              },
            };
            this.appGateway.server
              .to(`room_${updatedEvent.roomId}`)
              .emit("post_updated", postWithAuthor);
          }
        } catch (err) {
          console.error("Lỗi cập nhật post lịch họp:", err);
        }
      }

      const hostUser = await this.userModel
        .findOne({ supabaseId: updatedEvent.hostId })
        .select("email displayName avatarUrl")
        .exec();
      const updatedEventWithHost = {
        ...updatedEvent.toObject(),
        hostEmail: hostUser?.email || "",
        hostDisplayName:
          hostUser?.displayName || hostUser?.email?.split("@")[0] || "",
        hostAvatarUrl: hostUser?.avatarUrl || "",
      };

      // Chỉ gửi realtime thông báo cho những người đã chấp nhận (acceptedUserIds) và host
      const targetUserIds = Array.from(
        new Set([updatedEvent.hostId, ...(updatedEvent.acceptedUserIds || [])]),
      ).filter(Boolean);

      const updatePayload = {
        eventId,
        updateType,
        event: updatedEventWithHost,
      };

      for (const uid of targetUserIds) {
        this.appGateway.server
          .to(`user_${uid}`)
          .emit("calendar_event_updated", updatePayload);
      }
      return updatedEventWithHost;
    }
  }

  /**
   * Hủy lịch họp (Chỉ lần này / Toàn chuỗi)
   */
  async deleteEvent(
    userId: string,
    eventId: string,
    deleteType: "single" | "all",
    occurrenceDate?: string,
  ) {
    const event = await this.calendarEventModel.findById(eventId);
    if (!event) {
      throw new AppException(ErrorCode.CALENDAR_EVENT_NOT_FOUND);
    }

    if (event.hostId !== userId) {
      throw new AppException(ErrorCode.CALENDAR_EVENT_FORBIDDEN);
    }

    if (
      deleteType === "single" &&
      (event.recurrenceRule || event.isRecurring) &&
      occurrenceDate
    ) {
      // Chỉ hủy buổi này: Thêm ngày hủy vào danh sách exceptions
      const cleanDate = occurrenceDate.substring(0, 10);
      if (!event.recurrenceExceptions) {
        event.recurrenceExceptions = [];
      }
      if (!event.recurrenceExceptions.includes(cleanDate)) {
        event.recurrenceExceptions.push(cleanDate);
        await event.save();
      }

      const targetUserIds = Array.from(
        new Set([event.hostId, ...(event.acceptedUserIds || [])]),
      ).filter(Boolean);

      const deletePayload = {
        eventId,
        deleteType,
        occurrenceDate: cleanDate,
        recurrenceExceptions: event.recurrenceExceptions,
      };

      for (const uid of targetUserIds) {
        this.appGateway.server
          .to(`user_${uid}`)
          .emit("calendar_event_deleted", deletePayload);
      }

      return { success: true, recurrenceExceptions: event.recurrenceExceptions };
    } else {
      // Xử lý xóa bài đăng cuộc họp kênh trong bảng tin khi xóa toàn bộ
      if (
        event.roomType === "channel_meeting" &&
        event.roomId &&
        event.channelId
      ) {
        try {
          const post = await this.postModel.findOneAndUpdate(
            { meetingId: eventId, isDeleted: { $ne: true } },
            { $set: { isDeleted: true } },
            { new: true },
          );
          if (post) {
            this.appGateway.server
              .to(`room_${event.roomId}`)
              .emit("post_deleted", { postId: post._id });
          }
        } catch (err) {
          console.error("Lỗi xóa bài đăng lịch họp:", err);
        }
      }

      const targetUserIds = Array.from(
        new Set([event.hostId, ...(event.acceptedUserIds || [])]),
      ).filter(Boolean);

      // Hủy toàn bộ chuỗi
      await this.calendarEventModel.findByIdAndDelete(eventId);

      // Xóa vector tương ứng trên Pinecone
      this.vectorDbService.deleteEventVector(eventId).catch((err) => {
        this.logger.warn(`Failed to delete event vector: ${err?.message}`);
      });

      // Hủy / xóa job tương ứng trong Scheduler Service
      this.schedulerClientService.cancelJobByEvent(eventId).catch((err) => {
        this.logger.error(
          `Lỗi khi hủy job trong Scheduler Service cho sự kiện ${eventId}:`,
          err,
        );
      });

      const deletePayload = {
        eventId,
        deleteType,
      };

      for (const uid of targetUserIds) {
        this.appGateway.server
          .to(`user_${uid}`)
          .emit("calendar_event_deleted", deletePayload);
      }

      return { success: true };
    }
  }

  /**
   * Khôi phục 1 ngày đã hủy trong chuỗi lặp
   */
  async restoreOccurrence(
    userId: string,
    eventId: string,
    occurrenceDate: string,
  ) {
    const event = await this.calendarEventModel.findById(eventId);
    if (!event) {
      throw new AppException(ErrorCode.CALENDAR_EVENT_NOT_FOUND);
    }

    if (event.hostId !== userId) {
      throw new AppException(ErrorCode.CALENDAR_EVENT_FORBIDDEN);
    }

    const cleanDate = occurrenceDate.substring(0, 10);
    if (
      event.recurrenceExceptions &&
      event.recurrenceExceptions.includes(cleanDate)
    ) {
      event.recurrenceExceptions = event.recurrenceExceptions.filter(
        (d) => d !== cleanDate,
      );
      await event.save();
    }

    const hostUser = await this.userModel
      .findOne({ supabaseId: event.hostId })
      .select("email displayName avatarUrl")
      .exec();
    const eventWithHost = {
      ...event.toObject(),
      hostEmail: hostUser?.email || "",
      hostDisplayName:
        hostUser?.displayName || hostUser?.email?.split("@")[0] || "",
      hostAvatarUrl: hostUser?.avatarUrl || "",
    };

    const targetUserIds = Array.from(
      new Set([event.hostId, ...(event.acceptedUserIds || [])]),
    ).filter(Boolean);

    const restorePayload = {
      eventId,
      updateType: "restore",
      occurrenceDate: cleanDate,
      event: eventWithHost,
    };

    for (const uid of targetUserIds) {
      this.appGateway.server
        .to(`user_${uid}`)
        .emit("calendar_event_updated", restorePayload);
    }

    return {
      success: true,
      recurrenceExceptions: event.recurrenceExceptions || [],
      event: eventWithHost,
    };
  }

  /**
   * Phản hồi trạng thái RSVP
   */
  async updateRSVP(
    userId: string,
    eventId: string,
    status: CalendarRSVPStatus,
  ) {
    const event = await this.calendarEventModel.findById(eventId);
    if (!event) {
      throw new AppException(ErrorCode.CALENDAR_EVENT_NOT_FOUND);
    }

    // Host luôn là người tổ chức, không cần lưu vào mảng RSVP
    if (event.hostId === userId) {
      return { success: true, status: "ACCEPTED" };
    }

    // Rút user ra khỏi tất cả các mảng để làm sạch
    await this.calendarEventModel.findByIdAndUpdate(eventId, {
      $pull: {
        pendingUserIds: userId,
        acceptedUserIds: userId,
        declinedUserIds: userId,
      },
    });

    // Phân loại mảng cần đẩy vào
    let targetArray = "pendingUserIds";
    if (status === "ACCEPTED") targetArray = "acceptedUserIds";
    if (status === "DECLINED") targetArray = "declinedUserIds";

    // Đẩy user vào mảng tương ứng
    const updatedEvent = await this.calendarEventModel.findByIdAndUpdate(
      eventId,
      { $push: { [targetArray]: userId } },
      { new: true },
    );

    if (!updatedEvent) {
      throw new AppException(ErrorCode.CALENDAR_EVENT_NOT_FOUND);
    }

    // Phát event qua NotificationService để cập nhật trạng thái thông báo
    this.eventEmitter.emit("notification.calendar_rsvp", {
      userId,
      eventId,
      status,
    });

    // Cập nhật lại metadata acceptedUserIds trên Pinecone
    this.vectorDbService
      .updateAcceptedUsers(
        eventId,
        updatedEvent.hostId,
        updatedEvent.acceptedUserIds || [],
      )
      .catch((err) => {
        this.logger.warn(
          `Failed to update accepted users vector on RSVP: ${err?.message}`,
        );
      });

    // Emit Realtime cho host
    this.appGateway.server
      .to(`user_${updatedEvent.hostId}`)
      .emit("rsvp_updated", { eventId, userId, status });

    return { success: true, status };
  }

  /**
   * Lấy chi tiết RSVP của sự kiện bao gồm người tổ chức (hostId) và các thành viên được mời
   */
  async getRSVPList(eventId: string): Promise<CalendarRSVPMember[]> {
    const event = await this.calendarEventModel.findById(eventId).exec();
    if (!event) {
      throw new AppException(ErrorCode.CALENDAR_EVENT_NOT_FOUND);
    }

    const hostId = event.hostId;
    const acceptedIds = (event.acceptedUserIds || []).filter(
      (id) => id && id !== hostId,
    );
    const pendingIds = (event.pendingUserIds || []).filter(
      (id) => id && id !== hostId,
    );
    const declinedIds = (event.declinedUserIds || []).filter(
      (id) => id && id !== hostId,
    );

    // Luôn đưa hostId lên đầu danh sách, tiếp theo là accepted, pending, declined
    const allUserIds = Array.from(
      new Set([
        ...(hostId ? [hostId] : []),
        ...acceptedIds,
        ...pendingIds,
        ...declinedIds,
      ]),
    );

    if (allUserIds.length === 0) {
      return [];
    }

    const isValidObjectId = (id: string) => /^[0-9a-fA-F]{24}$/.test(id);
    const validObjectIds = allUserIds.filter(isValidObjectId);

    const users = await this.userModel
      .find({
        $or: [
          { supabaseId: { $in: allUserIds } },
          ...(validObjectIds.length > 0 ? [{ _id: { $in: validObjectIds } }] : []),
        ],
      })
      .select("_id supabaseId email displayName avatarUrl")
      .exec();

    const userMap = new Map<string, any>();
    users.forEach((u) => {
      if (u.supabaseId) userMap.set(u.supabaseId, u);
      if (u._id) userMap.set(u._id.toString(), u);
    });

    return allUserIds.map((uid) => {
      const u = userMap.get(uid);
      const isHost = uid === hostId;

      let status: CalendarRSVPStatus = "PENDING";
      if (isHost || acceptedIds.includes(uid)) {
        status = "ACCEPTED";
      } else if (declinedIds.includes(uid)) {
        status = "DECLINED";
      }

      return {
        userId: uid,
        email: u?.email || "",
        displayName:
          u?.displayName ||
          u?.email?.split("@")[0] ||
          (isHost ? "Người tổ chức" : "Người dùng"),
        avatarUrl: u?.avatarUrl || "",
        status,
        isHost,
      };
    });
  }


  /**
   * Tìm kiếm sự kiện của người dùng theo từ khóa (gần đúng, không phân biệt hoa thường)
   */
  async searchEvents(userId: string, queryText: string) {
    if (!queryText || queryText.trim() === "") {
      return [];
    }

    const trimmedQuery = queryText.trim();

    const query: Record<string, unknown> = {
      $or: [{ title: { $regex: trimmedQuery, $options: "i" } }],
    };

    const events = await this.calendarEventModel
      .find(query)
      .select("_id title startDate endDate roomType hostId")
      .sort({ startDate: -1 })
      .limit(10)
      .exec();

    const results = [];
    for (const event of events) {
      const hostUser = await this.userModel
        .findOne({ supabaseId: event.hostId })
        .select("email")
        .exec();
      results.push({
        ...event.toObject(),
        hostEmail: hostUser ? hostUser.email : "",
      });
    }
    return results;
  }

  /**
   * Mời thêm người dùng vào sự kiện đã có
   */
  async inviteUsers(
    userId: string,
    eventId: string,
    data: { invitees?: any[]; userIds?: string[] },
  ) {
    const event = await this.calendarEventModel.findById(eventId);
    if (!event) {
      throw new AppException(ErrorCode.CALENDAR_EVENT_NOT_FOUND);
    }

    // Host hoặc người tham gia đã được chấp nhận đều có thể mời (hoặc ưu tiên host)
    if (event.hostId !== userId && !event.acceptedUserIds?.includes(userId)) {
      throw new AppException(ErrorCode.CALENDAR_EVENT_FORBIDDEN);
    }

    const candidateIds = new Set<string>();

    if (data.userIds && Array.isArray(data.userIds)) {
      data.userIds.forEach((id) => {
        if (id && typeof id === "string") candidateIds.add(id);
      });
    }

    if (data.invitees && Array.isArray(data.invitees)) {
      for (const inv of data.invitees) {
        let uId = inv.userId;
        if (!uId && inv.email) {
          const userObj = await this.userModel.findOne({ email: inv.email }).exec();
          if (userObj) uId = userObj.supabaseId;
        }
        if (uId) candidateIds.add(uId);
      }
    }

    // Loại bỏ các ID đã có trong sự kiện mà không thể mời lại:
    // hostId, acceptedUserIds, pendingUserIds
    // (Nếu ai đó trong declinedUserIds mà host mời lại, sẽ cho phép mời và chuyển sang pending)
    const existingIds = new Set<string>([
      event.hostId,
      ...(event.acceptedUserIds || []),
      ...(event.pendingUserIds || []),
    ]);

    const newInviteeIds = Array.from(candidateIds).filter(
      (id) => !existingIds.has(id),
    );

    if (newInviteeIds.length === 0) {
      return { success: true, count: 0, event };
    }

    const updatedEvent = await this.calendarEventModel.findByIdAndUpdate(
      eventId,
      {
        $addToSet: {
          pendingUserIds: { $each: newInviteeIds },
          notificationsEnabledUserIds: { $each: newInviteeIds },
        },
        $pull: { declinedUserIds: { $in: newInviteeIds } },
      },
      { new: true },
    );

    // Gửi notification lời mời
    const hostUser = await this.userModel
      .findOne({ supabaseId: userId })
      .select("displayName email avatarUrl")
      .exec();
    const hostDisplayName =
      hostUser?.displayName ||
      hostUser?.email?.split("@")[0] ||
      "Người tổ chức";

    this.eventEmitter.emit("notification.calendar_invite", {
      userIds: newInviteeIds,
      referenceId: event._id.toString(),
      metadata: {
        eventId: event._id.toString(),
        title: event.title,
        startDate: event.startDate.toISOString(),
        endDate: event.endDate.toISOString(),
        inviterId: userId,
        inviterName: hostDisplayName,
        inviterAvatarUrl: hostUser?.avatarUrl || "",
        meetingCode: event.meetingCode,
        location: event.location,
        description: event.description,
        roomType: event.roomType,
      },
    });

    const targetUserIds = Array.from(
      new Set([
        event.hostId,
        ...(updatedEvent.acceptedUserIds || []),
        ...newInviteeIds,
      ]),
    ).filter(Boolean);

    for (const uid of targetUserIds) {
      this.appGateway.server
        .to(`user_${uid}`)
        .emit("calendar_event_updated", {
          eventId,
          updateType: "all",
          event: updatedEvent,
        });
    }

    return {
      success: true,
      count: newInviteeIds.length,
      event: updatedEvent,
    };
  }

  /**
   * Thành viên (không phải Host) hủy tham gia / rời khỏi lịch họp
   */
  async leaveEvent(userId: string, eventId: string) {
    const event = await this.calendarEventModel.findById(eventId);
    if (!event) {
      throw new AppException(ErrorCode.CALENDAR_EVENT_NOT_FOUND);
    }

    // Host không thể tự rời khỏi lịch do mình tạo (Host cần xóa/hủy lịch)
    if (event.hostId === userId) {
      throw new AppException(ErrorCode.CALENDAR_EVENT_FORBIDDEN);
    }

    const isValidObjectId = (id: string) => /^[0-9a-fA-F]{24}$/.test(id);
    const user = await this.userModel.findOne({
      $or: [
        { supabaseId: userId },
        ...(isValidObjectId(userId) ? [{ _id: userId }] : []),
      ],
    });

    const userIdsToRemove = new Set<string>([userId]);
    if (user) {
      if (user.supabaseId) userIdsToRemove.add(user.supabaseId);
      if (user._id) userIdsToRemove.add(user._id.toString());
    }

    const removeList = Array.from(userIdsToRemove);

    // Rút user ra khỏi tất cả các mảng: accepted, pending, declined
    // để làm sạch và cho phép host có thể mời lại sau này
    const updatedEvent = await this.calendarEventModel.findByIdAndUpdate(
      eventId,
      {
        $pull: {
          acceptedUserIds: { $in: removeList },
          pendingUserIds: { $in: removeList },
          declinedUserIds: { $in: removeList },
          notificationsEnabledUserIds: { $in: removeList },
        },
      },
      { new: true },
    );

    if (!updatedEvent) {
      throw new AppException(ErrorCode.CALENDAR_EVENT_NOT_FOUND);
    }

    // Cập nhật lại vector metadata khi thành viên rời lịch
    this.vectorDbService
      .updateAcceptedUsers(
        eventId,
        updatedEvent.hostId,
        updatedEvent.acceptedUserIds || [],
      )
      .catch((err) => {
        this.logger.warn(
          `Failed to update accepted users vector on leave: ${err?.message}`,
        );
      });

    // Phát event để xoá thông báo có referenceId là calendar event này
    this.eventEmitter.emit("notification.calendar_leave", {
      userId,
      userIds: removeList,
      eventId: event._id.toString(),
    });

    // Thông báo cho host là người này đã hủy tham gia
    this.appGateway.server
      .to(`user_${event.hostId}`)
      .emit("rsvp_updated", { eventId, userId, status: "DECLINED" });

    const targetUserIds = Array.from(
      new Set([
        event.hostId,
        ...(updatedEvent.acceptedUserIds || []),
        userId,
      ]),
    ).filter(Boolean);

    // Phát socket cập nhật sự kiện cho các client liên quan
    for (const uid of targetUserIds) {
      this.appGateway.server
        .to(`user_${uid}`)
        .emit("calendar_event_updated", {
          eventId,
          updateType: "all",
          event: updatedEvent,
        });
    }

    return { success: true, message: "Left calendar event successfully" };
  }

  /**
   * Tính toán thời điểm diễn ra đầu tiên của sự kiện để gửi Scheduler
   */
  calculateFirstOccurrence(
    startDate: Date,
    isRecurring: boolean,
    recurrenceRule?: string,
    recurrenceExceptions: string[] = [],
  ): Date {
    const start = new Date(startDate);
    const now = new Date();

    if (!isRecurring || !recurrenceRule) {
      return start;
    }

    // Nếu thời gian bắt đầu vẫn còn ở tương lai, đó chính là lần chạy đầu tiên
    if (start.getTime() >= now.getTime()) {
      return start;
    }

    // Nếu startDate đã qua trong quá khứ, tìm lần tiếp theo kể từ bây giờ bằng RRULE
    try {
      const offsetMs = 7 * 60 * 60 * 1000; // GMT+07
      const localStart = new Date(start.getTime() + offsetMs);
      const localNow = new Date(now.getTime() + offsetMs);
      const rule = rrulestr(recurrenceRule, { dtstart: localStart });

      let nextLocal = rule.after(localNow, true); // bao gồm cả thời điểm hiện tại
      while (nextLocal) {
        const dateStr = nextLocal.toISOString().substring(0, 10);
        if (!recurrenceExceptions.includes(dateStr)) {
          return new Date(nextLocal.getTime() - offsetMs);
        }
        nextLocal = rule.after(nextLocal, false);
      }
    } catch (err) {
      this.logger.error("Lỗi khi tính toán first occurrence qua RRULE:", err);
    }

    return start;
  }

  /**
   * Xử lý task tới hạn được Scheduler Service đẩy về qua queue 'calendar'
   * - Gửi thông báo tới tất cả mọi người tham gia lịch
   * - Nếu là sự kiện lặp, tính toán thời điểm tiếp theo và gọi REST API sang Scheduler
   */
  async handleCalendarTaskFromQueue(data: {
    eventId: string;
    occurrenceDate?: string;
    title?: string;
    meetingCode?: string;
  }) {
    if (!data.eventId) return;

    const event = await this.calendarEventModel.findById(data.eventId).exec();
    if (!event) return;

    let isCanceled = false;
    if (data.occurrenceDate && event.recurrenceExceptions && event.recurrenceExceptions.length > 0) {
      // Cắt chuỗi ISO lấy định dạng YYYY-MM-DD
      const cleanDate = data.occurrenceDate.substring(0, 10);
      if (event.recurrenceExceptions.includes(cleanDate)) {
        isCanceled = true;
      }
    }

    if (!isCanceled) {
      // Tập hợp danh sách người dùng nhận thông báo
      const declinedSet = new Set(event.declinedUserIds || []);

      // Lấy danh sách người dùng đã bật thông báo cho lịch này
      // Đối với sự kiện cũ chưa có trường này, mặc định gồm host + accepted + pending
      const enabledList = event.notificationsEnabledUserIds ?? [
        event.hostId,
        ...(event.acceptedUserIds || []),
        ...(event.pendingUserIds || []),
      ];

      const targetUserIds = Array.from(new Set(enabledList))
        .filter((uid) => uid && !declinedSet.has(uid));

      if (targetUserIds.length > 0) {
        // Gửi thông báo CALENDAR_START tới các người dùng đã bật thông báo
        this.eventEmitter.emit("notification.calendar_start", {
          userIds: targetUserIds,
          referenceId: event._id.toString(),
          metadata: {
            eventId: event._id.toString(),
            title: event.title,
            meetingCode: event.meetingCode,
            startDate: event.startDate,
            roomId: event.roomId,
            channelId: event.channelId,
            roomType: event.roomType,
          },
        });
      }
    }

    // Nếu không phải sự kiện lặp hoặc không có luật RRULE, kết thúc
    if (!event.isRecurring || !event.recurrenceRule) return;

    // Tính toán thời điểm tiếp theo cho sự kiện lặp
    try {
      const offsetMs = 7 * 60 * 60 * 1000; // GMT+07
      const localStart = new Date(event.startDate.getTime() + offsetMs);
      const rule = rrulestr(event.recurrenceRule, { dtstart: localStart });

      const currentOccDate = data.occurrenceDate
        ? new Date(data.occurrenceDate)
        : new Date();
      const currentLocal = new Date(currentOccDate.getTime() + offsetMs);

      // Tìm thời điểm tiếp theo sau lần hiện tại
      let nextOccLocal = rule.after(currentLocal, false);
      let nextOccUtc: Date | null = null;

      while (nextOccLocal) {
        const nextUtc = new Date(nextOccLocal.getTime() - offsetMs);
        const dateStr = nextOccLocal.toISOString().substring(0, 10);

        // Bỏ qua nếu ngày này nằm trong danh sách ngoại lệ
        if (
          event.recurrenceExceptions &&
          event.recurrenceExceptions.includes(dateStr)
        ) {
          this.logger.log(
            `[Calendar Service] Ngày ngoại lệ ${dateStr} bị hủy, tìm ngày tiếp theo...`,
          );
          nextOccLocal = rule.after(nextOccLocal, false);
          continue;
        }

        // Kiểm tra nếu vượt quá ngày kết thúc chuỗi lặp
        if (
          event.recurrenceEndDate &&
          nextUtc.getTime() > event.recurrenceEndDate.getTime()
        ) {
          this.logger.log(
            `[Calendar Service] Lần chạy tiếp theo ${nextUtc.toISOString()} vượt quá recurrenceEndDate. Kết thúc chuỗi lặp.`,
          );
          nextOccUtc = null;
          break;
        }

        nextOccUtc = nextUtc;
        break;
      }

      if (nextOccUtc) {
        this.logger.log(
          `[Calendar Service] Tính được thời điểm kế tiếp cho sự kiện "${event.title}": ${nextOccUtc.toISOString()}. Đang gửi qua Scheduler Service...`,
        );

        const res = await this.schedulerClientService.scheduleJob({
          targetQueue: "calendar",
          triggerAt: nextOccUtc,
          payload: {
            eventId: event._id.toString(),
            occurrenceDate: nextOccUtc.toISOString(),
            title: event.title,
            meetingCode: event.meetingCode,
          },
        });

        if (res) {
          this.logger.log(
            `[Calendar Service] Đã lên lịch thành công lần kế tiếp (Job ID: ${res.jobId}, triggerAt: ${nextOccUtc.toISOString()})`,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `[Calendar Service] Lỗi khi tính toán thời điểm kế tiếp cho sự kiện ${event._id}:`,
        err,
      );
    }
  }

  /**
   * Bật hoặc tắt thông báo sự kiện cho một người dùng cụ thể
   */
  async toggleNotification(
    userId: string,
    eventId: string,
    enabled?: boolean,
  ) {
    const event = await this.calendarEventModel.findById(eventId).exec();
    if (!event) {
      throw new AppException(ErrorCode.CALENDAR_EVENT_NOT_FOUND);
    }

    // Nếu trường notificationsEnabledUserIds chưa khởi tạo (sự kiện cũ), mặc định gồm host + accepted + pending
    const currentList = event.notificationsEnabledUserIds ?? [
      event.hostId,
      ...(event.acceptedUserIds || []),
      ...(event.pendingUserIds || []),
    ];

    const isCurrentlyEnabled = currentList.includes(userId);
    const targetEnabled = enabled !== undefined ? enabled : !isCurrentlyEnabled;

    let updatedList: string[];
    if (targetEnabled) {
      updatedList = Array.from(new Set([...currentList, userId]));
    } else {
      updatedList = currentList.filter((id) => id !== userId);
    }

    event.notificationsEnabledUserIds = updatedList;
    await event.save();

    // Lấy thông tin host để trả về đầy đủ format cho FE
    const hostUser = await this.userModel
      .findOne({ supabaseId: event.hostId })
      .select("email displayName avatarUrl")
      .exec();

    const eventWithHost = {
      ...event.toObject(),
      hostEmail: hostUser?.email || "",
      hostDisplayName:
        hostUser?.displayName || hostUser?.email?.split("@")[0] || "",
      hostAvatarUrl: hostUser?.avatarUrl || "",
    };

    // Bắn socket cập nhật cho user
    this.appGateway.server
      .to(`user_${userId}`)
      .emit("calendar_event_updated", {
        eventId: event._id.toString(),
        updateType: "all",
        event: eventWithHost,
      });

    return {
      code: 200,
      success: true,
      notificationsEnabled: targetEnabled,
      event: eventWithHost,
    };
  }
}


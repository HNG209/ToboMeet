import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Assignment, AssignmentDocument } from "./schemas/assignment.schema";
import { AssignmentSubmission, AssignmentSubmissionDocument } from "./schemas/submission.schema";
import { AssignmentComment, AssignmentCommentDocument } from "./schemas/assignment-comment.schema";
import { CreateAssignmentDto, AttachmentDto } from "./dto/create-assignment.dto";
import { SubmitAssignmentDto } from "./dto/submit-assignment.dto";
import { GradeSubmissionDto } from "./dto/grade-submission.dto";
import { RoomsService } from "../rooms/rooms.service";
import { AssignmentsGateway } from "./assignments.gateway";
import { Room, RoomDocument } from "../rooms/schemas/room.schema";
import { RoomMember } from "../rooms/schemas/room-member.schema";
import { Channel } from "../rooms/schemas/channel.schema";
import { ChannelMember } from "../rooms/schemas/channel-member.schema";
import { UsersService } from "../users/users.service";
import { RoomMemberService } from "../rooms/room-member.service";
import { Workbook } from "exceljs";
import type { Response } from "express";
import { Post, PostDocument } from "../news-feed/schemas/post.schema";
import { User, UserDocument } from "../users/schemas/user.schema";
import { AppGateway } from "../core/gateways/app.gateway";

@Injectable()
export class AssignmentsService {
  constructor(
    @InjectModel(Assignment.name) private assignmentModel: Model<AssignmentDocument>,
    @InjectModel(AssignmentSubmission.name) private submissionModel: Model<AssignmentSubmissionDocument>,
    @InjectModel(AssignmentComment.name) private commentModel: Model<AssignmentCommentDocument>,
    @InjectModel(Room.name) private roomModel: Model<RoomDocument>,
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private roomsService: RoomsService,
    private assignmentsGateway: AssignmentsGateway,
    private usersService: UsersService,
    private roomMemberService: RoomMemberService,
    private readonly appGateway: AppGateway,
  ) {}

  private async verifyUserRole(roomId: string, userId: string): Promise<{ isOwner: boolean; isOwnerOrAdmin: boolean; isMember: boolean }> {
    const room = await this.roomModel
      .findOne({ _id: roomId, isDeleted: { $ne: true } })
      .select("ownerId members")
      .lean()
      .exec();
    if (!room) {
      throw new NotFoundException("Room not found");
    }
    const isOwner = room.ownerId?.toString() === userId?.toString();
    const member = room.members?.find(
      (m: RoomMember) =>
        m.userId?.toString() === userId?.toString() &&
        m.status !== "removed" &&
        m.status !== "left",
    );
    const isMember = !!member || isOwner;
    const memberRole = member?.role?.toLowerCase();
    const isOwnerOrAdmin = isOwner || memberRole === "owner" || memberRole === "admin";
    return { isOwner: !!isOwner, isOwnerOrAdmin: !!isOwnerOrAdmin, isMember };
  }

  /**
   * Kiểm tra user có quyền truy cập vào bất kỳ kênh nào trong danh sách channelIds của bài tập hay không.
   * - Owner phòng: luôn hợp lệ
   * - Với mỗi kênh: nếu private -> check channel.members; nếu public -> ai trong phòng cũng truy cập được
   */
  private isUserInAnyChannel(room: RoomDocument, channelIds: string[], userId: string): boolean {
    if (room.ownerId === userId) return true;
    if (!channelIds || channelIds.length === 0) return false;

    return channelIds.some((cId: string) => {
      const channel = room.channels?.find((c: Channel) => c._id?.toString() === cId);
      if (!channel) return false;

      if (channel.isPrivate) {
        return channel.members?.some((m: ChannelMember) => m.userId === userId) ?? false;
      } else {
        return true;
      }
    });
  }

  /**
   * Lấy snapshot danh sách userId của tất cả thành viên thuộc TẤT CẢ các kênh trong channelIds tại thời điểm hiện tại.
   * Loại bỏ toàn bộ userId trùng lặp.
   * Dùng khi tạo/cập nhật nhiệm vụ với recipientType = "current_members".
   */
  private async getMultiChannelMemberSnapshot(roomId: string, channelIds: string[]): Promise<string[]> {
    const room = await this.roomModel.findOne({ _id: roomId });
    if (!room) return [];

    const memberSet = new Set<string>([room.ownerId]);

    for (const cId of channelIds) {
      const channel = room.channels?.find((c: Channel) => c._id?.toString() === cId);
      if (!channel) continue;

      if (channel.isPrivate) {
        (channel.members || []).forEach((m: ChannelMember) => memberSet.add(m.userId));
      } else {
        (room.members || [])
          .filter((m: RoomMember) => m.status === "active")
          .forEach((m: RoomMember) => memberSet.add(m.userId));
      }
    }

    return [...memberSet];
  }

  /**
   * Tự động tạo hoặc đồng bộ bài đăng nhiệm vụ trên Bảng tin của các kênh được giao
   */
  private async syncAssignmentPosts(assignment: AssignmentDocument, authorId: string) {
    if (assignment.status !== "published") return;

    const targetChannelIds = assignment.channelIds?.length
      ? assignment.channelIds
      : (assignment.channelId ? [assignment.channelId] : []);

    if (targetChannelIds.length === 0) return;

    try {
      const authorUser = await this.userModel.findOne({ supabaseId: authorId }).exec();
      const authorInfo = {
        userId: authorId,
        displayName: authorUser?.displayName || authorUser?.email?.split("@")[0] || "Người dùng ẩn danh",
        avatarUrl: authorUser?.avatarUrl || "",
        role: "teacher",
      };

      const existingPosts = await this.postModel.find({
        assignmentId: assignment._id.toString(),
        isDeleted: { $ne: true },
      }).exec();

      const existingChannelIds = new Set(existingPosts.map((p) => p.channelId));
      const targetChannelSet = new Set(targetChannelIds);

      // 1. Xóa các bài đăng ở kênh không còn được giao nữa
      const postsToDelete = existingPosts.filter((p) => !targetChannelSet.has(p.channelId));
      for (const p of postsToDelete) {
        await this.postModel.findByIdAndDelete(p._id);
        this.appGateway.server.to(`room_${assignment.roomId}`).emit("post_deleted", { postId: p._id.toString() });
      }

      // 2. Cập nhật các bài đăng ở kênh vẫn còn giữ
      const postsToUpdate = existingPosts.filter((p) => targetChannelSet.has(p.channelId));
      for (const p of postsToUpdate) {
        p.assignmentTitle = assignment.title || "";
        p.assignmentDeadline = assignment.deadline;
        p.recipientType = assignment.recipientType || "";
        p.recipientMemberIds = assignment.recipientMemberIds || [];
        await p.save();

        const postWithAuthor = {
          ...p.toObject(),
          author: authorInfo,
          commentsCount: 0,
          reactionStats: [],
          userReaction: null,
        };
        this.appGateway.server.to(`room_${assignment.roomId}`).emit("post_updated", postWithAuthor);
      }

      // 3. Tạo bài đăng mới ở các kênh mới được chọn
      const channelsToCreate = targetChannelIds.filter((cId) => !existingChannelIds.has(cId));
      for (const cId of channelsToCreate) {
        const newPost = await this.postModel.create({
          roomId: assignment.roomId,
          channelId: cId,
          authorId: authorId,
          content: "Đã giao nhiệm vụ",
          isAssignment: true,
          assignmentId: assignment._id.toString(),
          assignmentTitle: assignment.title || "",
          assignmentDeadline: assignment.deadline,
          recipientType: assignment.recipientType || "",
          recipientMemberIds: assignment.recipientMemberIds || [],
          attachments: [],
          reactions: [],
          isEdited: false,
        });

        const postWithAuthor = {
          ...newPost.toObject(),
          author: authorInfo,
          commentsCount: 0,
          reactionStats: [],
          userReaction: null,
        };
        this.appGateway.server.to(`room_${assignment.roomId}`).emit("post_created", postWithAuthor);
      }
    } catch (err) {
      console.error("Lỗi khi đồng bộ bài đăng nhiệm vụ vào bảng tin:", err);
    }
  }

  /**
   * Tự động xóa tất cả bài đăng bảng tin của một nhiệm vụ khi nhiệm vụ bị xóa
   */
  private async deleteAssignmentPosts(assignmentId: string, roomId: string) {
    try {
      const posts = await this.postModel.find({ assignmentId }).exec();
      await this.postModel.deleteMany({ assignmentId });
      for (const p of posts) {
        this.appGateway.server.to(`room_${roomId}`).emit("post_deleted", { postId: p._id.toString() });
      }
    } catch (err) {
      console.error("Lỗi khi xóa bài đăng nhiệm vụ trên bảng tin:", err);
    }
  }

  async create(createDto: CreateAssignmentDto, userId: string) {
    const { isOwnerOrAdmin } = await this.verifyUserRole(createDto.roomId, userId);
    if (!isOwnerOrAdmin) {
      throw new ForbiddenException("Only room owners/teachers can create assignments");
    }

    // Nếu Giao bài (published): Bắt buộc kiểm tra các trường
    if (createDto.status === "published") {
      if (!createDto.title || !createDto.title.trim()) {
        throw new BadRequestException("Assignment title is required when publishing");
      }
      if (!createDto.deadline) {
        throw new BadRequestException("Assignment deadline is required when publishing");
      }
      if (createDto.gradingType === "graded" && (!createDto.maxScore || createDto.maxScore <= 0)) {
        throw new BadRequestException("Max score is required and must be greater than 0 for graded assignments");
      }
    }

    const rawChannelIds = createDto.channelIds?.length
      ? createDto.channelIds
      : (createDto.channelId ? [createDto.channelId] : []);

    let finalRecipientMemberIds = createDto.recipientMemberIds || [];
    if (createDto.recipientType === "current_members") {
      // Snapshot thành viên của TẤT CẢ KÊNH được chọn (không trùng lặp)
      finalRecipientMemberIds = await this.getMultiChannelMemberSnapshot(createDto.roomId, rawChannelIds);
    }

    // Tiêu đề mặc định cho bản nháp
    const finalTitle = createDto.title?.trim() || "Untitled Draft";

    // Validation: loại bỏ người tạo nhiệm vụ khỏi danh sách người nhận
    // (người tạo không được giao nhiệm vụ cho chính mình)
    if (finalRecipientMemberIds.length > 0) {
      finalRecipientMemberIds = finalRecipientMemberIds.filter((id) => id !== userId);
    }

    const assignment = new this.assignmentModel({
      ...createDto,
      title: finalTitle,
      channelId: rawChannelIds[0] || "",
      channelIds: rawChannelIds,
      recipientMemberIds: finalRecipientMemberIds,
      createdBy: userId,
    });
    const saved = await assignment.save();

    if (saved.status === "published") {
      this.assignmentsGateway.notifyAssignmentPublished(saved.roomId, saved.channelId, saved);
      await this.syncAssignmentPosts(saved, userId);
      this.appGateway.server.emit("calendar_event_created", saved);
    } else {
      this.assignmentsGateway.notifyAssignmentCreated(saved.roomId, saved.channelId, saved);
    }
    return saved;
  }

  async update(id: string, updateDto: Partial<CreateAssignmentDto>, userId: string) {
    const assignment = await this.assignmentModel.findById(id);
    if (!assignment) {
      throw new NotFoundException("Assignment not found");
    }

    const { isOwnerOrAdmin } = await this.verifyUserRole(assignment.roomId, userId);
    if (!isOwnerOrAdmin) {
      throw new ForbiddenException("Only room owners/teachers can update assignments");
    }

    if (assignment.status === "draft" && assignment.createdBy !== userId) {
      throw new ForbiddenException("You do not have permission to update this draft");
    }

    const wasDraft = assignment.status === "draft";
    Object.assign(assignment, updateDto);

    // Nếu chuyển sang published hoặc update khi published: validate bắt buộc
    if (assignment.status === "published") {
      if (!assignment.title || !assignment.title.trim() || assignment.title === "Untitled Draft") {
        throw new BadRequestException("Assignment title is required when publishing");
      }
      if (!assignment.deadline) {
        throw new BadRequestException("Assignment deadline is required when publishing");
      }
      if (assignment.gradingType === "graded" && (!assignment.maxScore || assignment.maxScore <= 0)) {
        throw new BadRequestException("Max score is required and must be greater than 0 for graded assignments");
      }
    }

    const rawChannelIds = updateDto.channelIds?.length
      ? updateDto.channelIds
      : (updateDto.channelId ? [updateDto.channelId] : (assignment.channelIds?.length ? assignment.channelIds : (assignment.channelId ? [assignment.channelId] : [])));

    if (updateDto.channelIds || updateDto.channelId) {
      assignment.channelIds = rawChannelIds;
      assignment.channelId = rawChannelIds[0] || "";
    }

    if (updateDto.recipientType === "current_members") {
      // Snapshot thành viên của tất cả các kênh được chọn
      assignment.recipientMemberIds = await this.getMultiChannelMemberSnapshot(assignment.roomId, rawChannelIds);
    }

    // Validation: loại bỏ người tạo/cập nhật nhiệm vụ khỏi danh sách người nhận
    if (assignment.recipientMemberIds?.length > 0) {
      assignment.recipientMemberIds = assignment.recipientMemberIds.filter((id: string) => id !== userId);
    }

    const saved = await assignment.save();

    if (wasDraft && saved.status === "published") {
      this.assignmentsGateway.notifyAssignmentPublished(saved.roomId, saved.channelId, saved);
      await this.syncAssignmentPosts(saved, userId);
    } else {
      this.assignmentsGateway.notifyAssignmentUpdated(saved.roomId, saved.channelId, saved);
      if (saved.status === "published") {
        await this.syncAssignmentPosts(saved, assignment.createdBy || userId);
      } else if (saved.status === "draft") {
        await this.deleteAssignmentPosts(saved._id.toString(), saved.roomId);
      }
      this.appGateway.server.emit("calendar_event_updated", saved);
    }
    return saved;
  }

  async delete(id: string, userId: string) {
    const assignment = await this.assignmentModel.findById(id);
    if (!assignment) {
      throw new NotFoundException("Assignment not found");
    }

    const { isOwnerOrAdmin } = await this.verifyUserRole(assignment.roomId, userId);
    if (!isOwnerOrAdmin) {
      throw new ForbiddenException("Only room owners/teachers can delete assignments");
    }

    if (assignment.status === "draft" && assignment.createdBy !== userId) {
      throw new ForbiddenException("You do not have permission to delete this draft");
    }

    await this.assignmentModel.findByIdAndDelete(id);
    await this.submissionModel.deleteMany({ assignmentId: id });
    await this.deleteAssignmentPosts(id, assignment.roomId);
    this.assignmentsGateway.notifyAssignmentDeleted(assignment.roomId, assignment.channelId, id);
    this.appGateway.server.emit("calendar_event_deleted", { eventId: `assignment_${id}` });
    return { success: true };
  }

  async getRoomAssignments(roomId: string, userId: string, status?: string) {
    const { isOwnerOrAdmin, isMember } = await this.verifyUserRole(roomId, userId);
    if (!isMember) {
      throw new ForbiddenException("You are not a member of this room");
    }

    const query: Record<string, any> = { roomId };
    if (status) {
      query.status = status;
      if (status === "draft") {
        query.createdBy = userId;
      }
    }

    // Owner/Admin thấy toàn bộ (kể cả draft nếu không truyền status lọc cụ thể)
    if (isOwnerOrAdmin) {
      const assignments = await this.assignmentModel.find(query).sort({ createdAt: -1 }).exec();
      const roomSubmissions = await this.submissionModel
        .find({ roomId })
        .sort({ submittedAt: -1, updatedAt: -1 })
        .exec();

      const submissionsMap = new Map<string, Map<string, AssignmentSubmissionDocument>>();
      for (const sub of roomSubmissions) {
        const aId = sub.assignmentId.toString();
        const sId = sub.studentId?.toString();
        if (!submissionsMap.has(aId)) {
          submissionsMap.set(aId, new Map());
        }
        const studentMap = submissionsMap.get(aId)!;
        if (!studentMap.has(sId)) {
          studentMap.set(sId, sub);
        }
      }

      return assignments.map(item => ({
        ...item.toObject(),
        submissions: Array.from(submissionsMap.get(item._id.toString())?.values() || []),
      }));
    }

    // Học viên không được phép xem các bài tập draft
    if (status === "draft") {
      throw new ForbiddenException("Members cannot view draft assignments");
    }

    query.status = "published";
    const assignments = await this.assignmentModel.find(query).sort({ createdAt: -1 }).exec();
    const userSubmissions = await this.submissionModel.find({ roomId, studentId: userId }).exec();

    const mySubmissionsMap = new Map(userSubmissions.map(s => [s.assignmentId.toString(), s]));

    // Load room để check channel membership cho nhiệm vụ loại current_and_future_members
    const room = await this.roomModel.findOne({ _id: roomId, isDeleted: { $ne: true } });

    const filtered = assignments.filter(item => {
      const rType = item.recipientType;

      // Loại snapshot: chỉ check recipientMemberIds đã chốt tại thời điểm giao
      // KHÔNG check channel membership hiện tại — thành viên cũ bị xóa vẫn thấy, thành viên mới KHÔNG thấy
      if (rType === "current_members" || rType === "specific_members") {
        return item.recipientMemberIds?.includes(userId) ?? false;
      }

      // Loại dynamic: check channel membership tại thời điểm xem đối với các kênh được chọn
      // Thành viên mới vào kênh sau sẽ thấy các nhiệm vụ loại này
      if (rType === "current_and_future_members" || rType === "all_current_and_future") {
        const itemChannelIds = item.channelIds?.length ? item.channelIds : (item.channelId ? [item.channelId] : []);
        return room ? this.isUserInAnyChannel(room, itemChannelIds, userId) : false;
      }

      return false; // fallback an toàn
    });

    return filtered.map(item => ({
      ...item.toObject(),
      mySubmission: mySubmissionsMap.get(item._id.toString()) || null,
    }));
  }

  async findOne(id: string, userId: string) {
    const assignment = await this.assignmentModel.findById(id);
    if (!assignment) {
      throw new NotFoundException("Assignment not found");
    }

    const { isOwnerOrAdmin, isMember } = await this.verifyUserRole(assignment.roomId, userId);
    if (!isMember) {
      throw new ForbiddenException("You are not a member of this room");
    }

    if (assignment.status === "draft") {
      if (assignment.createdBy !== userId) {
        throw new ForbiddenException("You do not have permission to view this draft");
      }
    } else {
      // Học viên truy cập trực tiếp bằng ID qua URL / API
      if (!isOwnerOrAdmin) {
        const rType = assignment.recipientType;

        if (rType === "current_members" || rType === "specific_members") {
          // Loại snapshot: chỉ check danh sách đã chốt, không check channel membership hiện tại
          if (!assignment.recipientMemberIds?.includes(userId)) {
            throw new ForbiddenException("You are not assigned to this assignment");
          }
        } else {
          // Loại dynamic (current_and_future_members): check channel membership hiện tại
          const room = await this.roomModel.findOne({ _id: assignment.roomId, isDeleted: { $ne: true } });
          const itemChannelIds = assignment.channelIds?.length ? assignment.channelIds : (assignment.channelId ? [assignment.channelId] : []);
          if (!room || !this.isUserInAnyChannel(room, itemChannelIds, userId)) {
            throw new ForbiddenException("You do not have access to this assignment's channel");
          }
        }
      }
    }

    return assignment;
  }

  async submit(assignmentId: string, submitDto: SubmitAssignmentDto, userId: string) {
    const assignment = await this.assignmentModel.findById(assignmentId);
    if (!assignment) {
      throw new NotFoundException("Assignment not found");
    }

    if (assignment.status !== "published") {
      throw new BadRequestException("This assignment is not published yet");
    }

    const { isMember } = await this.verifyUserRole(assignment.roomId, userId);
    if (!isMember) {
      throw new ForbiddenException("You are not a member of this room");
    }

    // Check recipients — phân biệt snapshot vs dynamic
    const rType = assignment.recipientType;
    let isAudience: boolean;
    if (rType === "current_members" || rType === "specific_members") {
      // Loại snapshot: chỉ check danh sách đã chốt lúc giao nhiệm vụ
      isAudience = assignment.recipientMemberIds?.includes(userId) ?? false;
    } else {
      // Loại dynamic (current_and_future_members): check channel membership hiện tại
      const submitRoom = await this.roomModel.findOne({ _id: assignment.roomId, isDeleted: { $ne: true } });
      const itemChannelIds = assignment.channelIds?.length ? assignment.channelIds : (assignment.channelId ? [assignment.channelId] : []);
      isAudience = submitRoom ? this.isUserInAnyChannel(submitRoom, itemChannelIds, userId) : false;
    }

    if (!isAudience) {
      throw new ForbiddenException("You are not assigned to this assignment");
    }

    const now = new Date();
    const deadline = new Date(assignment.deadline);

    const isPastDeadline = now.getTime() > deadline.getTime();

    // N?u khóa sau deadline
    if (isPastDeadline && assignment.submissionPolicy === "lock_after_deadline") {
      throw new BadRequestException("Ðã h?t h?n n?p bài");
    }

    // Tính s? phút tr?
    const lateMinutes = isPastDeadline
      ? Math.max(0, Math.floor((now.getTime() - deadline.getTime()) / 60000))
      : 0;

    const submissionStatus = isPastDeadline ? "late" : "on_time";

    // Tìm xem đã nộp chưa để cập nhật hoặc tạo mới
    let submission = await this.submissionModel.findOne({ assignmentId, studentId: userId });

    if (submission) {
      // Cho phép cập nhật/nộp lại
      if (isPastDeadline && assignment.submissionPolicy === "lock_after_deadline") {
        throw new BadRequestException("Đã hết hạn nộp bài");
      }

      const existingAttachmentsMap = new Map(
        (submission.attachments || []).map(att => [att.url, att.uploadedAt || submission.submittedAt || now])
      );

      const updatedAttachments = submitDto.attachments.map((att: AttachmentDto) => ({
        name: att.name,
        url: att.url,
        size: att.size,
        type: att.type,
        uploadedAt: att.uploadedAt ? new Date(att.uploadedAt) : (existingAttachmentsMap.get(att.url) || now),
      }));

      submission.attachments = updatedAttachments as typeof submission.attachments;
      submission.submittedAt = now;
      submission.submissionStatus = submissionStatus;
      submission.lateMinutes = lateMinutes;
      submission = await submission.save();
    } else {
      const formattedAttachments = submitDto.attachments.map((att: AttachmentDto) => ({
        name: att.name,
        url: att.url,
        size: att.size,
        type: att.type,
        uploadedAt: att.uploadedAt ? new Date(att.uploadedAt) : now,
      }));

      submission = new this.submissionModel({
        assignmentId,
        studentId: userId,
        roomId: assignment.roomId,
        channelId: assignment.channelId,
        attachments: formattedAttachments,
        submittedAt: now,
        submissionStatus,
        lateMinutes,
      });
      submission = await submission.save();
    }

    this.assignmentsGateway.notifyAssignmentSubmitted(assignment.roomId, assignment.channelId, submission);
    return submission;
  }

  async getSubmissions(assignmentId: string, userId: string) {
    const assignment = await this.assignmentModel.findById(assignmentId);
    if (!assignment) {
      throw new NotFoundException("Assignment not found");
    }

    const { isOwnerOrAdmin } = await this.verifyUserRole(assignment.roomId, userId);
    if (!isOwnerOrAdmin) {
      throw new ForbiddenException("Only owners/teachers can view all submissions");
    }

    const submissions = await this.submissionModel
      .find({ assignmentId })
      .sort({ submittedAt: -1, updatedAt: -1 })
      .exec();

    // Deduplicate by studentId to guarantee teacher receives exactly 1 authoritative record per student
    const deduplicatedMap = new Map<string, AssignmentSubmissionDocument>();
    for (const sub of submissions) {
      const studentId = sub.studentId?.toString();
      if (!deduplicatedMap.has(studentId)) {
        deduplicatedMap.set(studentId, sub);
      }
    }
    return Array.from(deduplicatedMap.values());
  }

  async getMySubmission(assignmentId: string, userId: string) {
    return this.submissionModel.findOne({ assignmentId, studentId: userId }).exec();
  }

  async grade(submissionId: string, gradeDto: GradeSubmissionDto, userId: string) {
    const submission = await this.submissionModel.findById(submissionId);
    if (!submission) {
      throw new NotFoundException("Submission not found");
    }

    const assignment = await this.assignmentModel.findById(submission.assignmentId);
    if (!assignment) {
      throw new NotFoundException("Assignment not found");
    }

    const { isOwnerOrAdmin } = await this.verifyUserRole(submission.roomId, userId);
    if (!isOwnerOrAdmin) {
      throw new ForbiddenException("Only teachers can grade submissions");
    }

    // Validate score
    if (assignment.gradingType === "graded" && gradeDto.score !== undefined) {
      if (gradeDto.score < 0 || (assignment.maxScore !== undefined && gradeDto.score > assignment.maxScore)) {
        throw new BadRequestException(`Score must be between 0 and max score (${assignment.maxScore})`);
      }
    }

    if (gradeDto.score !== undefined) submission.score = gradeDto.score;
    if (gradeDto.feedback !== undefined) submission.feedback = gradeDto.feedback;
    submission.gradedBy = userId;
    submission.gradedAt = new Date();

    const saved = await submission.save();
    this.assignmentsGateway.notifyAssignmentGradingUpdated(submission.roomId, submission.channelId, submission.studentId, saved);
    return saved;
  }

  async gradeStudent(assignmentId: string, studentId: string, gradeDto: GradeSubmissionDto, userId: string) {
    const assignment = await this.assignmentModel.findById(assignmentId);
    if (!assignment) {
      throw new NotFoundException("Assignment not found");
    }

    const { isOwnerOrAdmin } = await this.verifyUserRole(assignment.roomId, userId);
    if (!isOwnerOrAdmin) {
      throw new ForbiddenException("Only teachers can grade submissions");
    }

    // Validate score
    if (assignment.gradingType === "graded" && gradeDto.score !== undefined) {
      if (gradeDto.score < 0 || (assignment.maxScore !== undefined && gradeDto.score > assignment.maxScore)) {
        throw new BadRequestException(`Score must be between 0 and max score (${assignment.maxScore})`);
      }
    }

    let submission = await this.submissionModel.findOne({ assignmentId, studentId });
    if (!submission) {
      submission = new this.submissionModel({
        assignmentId,
        studentId,
        roomId: assignment.roomId,
        channelId: assignment.channelId || assignment.channelIds?.[0] || "",
        attachments: [],
        submissionStatus: "not_submitted",
        score: gradeDto.score,
        feedback: gradeDto.feedback,
        gradedBy: userId,
        gradedAt: new Date(),
      });
    } else {
      if (gradeDto.score !== undefined) submission.score = gradeDto.score;
      if (gradeDto.feedback !== undefined) submission.feedback = gradeDto.feedback;
      submission.gradedBy = userId;
      submission.gradedAt = new Date();
    }

    const saved = await submission.save();
    this.assignmentsGateway.notifyAssignmentGradingUpdated(submission.roomId, submission.channelId, submission.studentId, saved);
    return saved;
  }

  async deleteSubmission(assignmentId: string, userId: string) {
    const assignment = await this.assignmentModel.findById(assignmentId);
    if (!assignment) {
      throw new NotFoundException("Assignment not found");
    }

    const now = new Date();
    const deadline = new Date(assignment.deadline);
    const isPastDeadline = now.getTime() > deadline.getTime();
    if (isPastDeadline && assignment.submissionPolicy === "lock_after_deadline") {
      throw new BadRequestException("Đã hết hạn nộp bài và nhiệm vụ đã bị khóa");
    }

    const submission = await this.submissionModel.findOne({ assignmentId, studentId: userId });
    if (!submission) {
      throw new NotFoundException("Submission not found");
    }

    if (submission.score !== undefined || submission.feedback) {
      submission.attachments = [];
      submission.submittedAt = undefined as any;
      submission.submissionStatus = "not_submitted";
      await submission.save();
      console.log(
        `[BACKEND] Submission ${submission._id} reset to not_submitted (preserved score/feedback) for assignment ${assignmentId} student ${userId}`
      );
    } else {
      await this.submissionModel.deleteOne({ _id: submission._id });
      console.log(
        `[BACKEND] DB deleted submission ${submission._id} for assignment ${assignmentId} student ${userId}`
      );
    }

    this.assignmentsGateway.notifySubmissionDeleted(
      submission.roomId,
      submission.channelId,
      assignmentId,
      submission._id.toString(),
      userId
    );
    return { success: true };
  }

  async addComment(submissionId: string, content: string, userId: string) {
    const submission = await this.submissionModel.findById(submissionId);
    if (!submission) {
      throw new NotFoundException("Submission not found");
    }

    const user = await this.usersService.findBySupabaseId(userId);
    const userName = user?.displayName || "Thành viên";

    if (!submission.comments) {
      submission.comments = [];
    }

    submission.comments.push({
      userId,
      userName,
      content,
      createdAt: new Date(),
    });

    return submission.save();
  }

  async addAssignmentComment(
    assignmentId: string,
    content: string,
    userId: string,
    targetMemberId?: string
  ) {
    const assignment = await this.assignmentModel.findById(assignmentId).select("roomId").lean().exec();
    if (!assignment) {
      throw new NotFoundException("Assignment not found");
    }

    const { isOwner, isOwnerOrAdmin, isMember } = await this.verifyUserRole(assignment.roomId, userId);
    if (!isMember) {
      throw new ForbiddenException("You are not a member of this room");
    }

    const user = await this.usersService.findBySupabaseId(userId);
    const userName = user?.displayName || "Thành viên";
    const avatarUrl = user?.avatarUrl;

    let role = "member";
    if (isOwnerOrAdmin) {
      role = isOwner ? "owner" : "admin";
    }

    // Xử lý memberId đại diện cho luồng hội thoại bài nộp của thành viên
    let memberId = userId;
    if (isOwnerOrAdmin) {
      // Nếu là Trưởng nhóm hoặc Phó nhóm, ưu tiên gửi vào luồng của targetMemberId
      memberId = targetMemberId || userId;
    } else {
      // Nếu là thành viên, luôn là luồng của chính mình (chống giả mạo)
      memberId = userId;
    }

    // Tìm bài nộp nếu có để liên kết submissionId
    const submission = await this.submissionModel.findOne({ assignmentId, studentId: memberId }).select("_id").lean().exec();

    const comment = new this.commentModel({
      assignmentId,
      roomId: assignment.roomId,
      memberId,
      submissionId: submission ? submission._id.toString() : undefined,
      userId,
      userName,
      avatarUrl,
      role,
      content,
    });

    const saved = await comment.save();

    // Phát socket realtime
    this.assignmentsGateway.notifyCommentAdded(assignment.roomId, assignmentId, saved);

    return saved;
  }

  async getAssignmentComments(assignmentId: string, userId: string, memberId?: string) {
    const assignment = await this.assignmentModel.findById(assignmentId);
    if (!assignment) {
      throw new NotFoundException("Assignment not found");
    }

    const { isOwnerOrAdmin, isMember } = await this.verifyUserRole(assignment.roomId, userId);
    if (!isMember) {
      throw new ForbiddenException("You are not a member of this room");
    }

    // Phân quyền bảo mật:
    if (!isOwnerOrAdmin) {
      // Thành viên chỉ được xem bình luận trong luồng của chính mình
      if (memberId && memberId !== userId) {
        throw new ForbiddenException("You can only view comments for your own submission");
      }
      return this.commentModel
        .find({
          assignmentId,
          $or: [{ memberId: userId }, { memberId: { $exists: false }, userId }],
        })
        .sort({ createdAt: 1 })
        .lean()
        .exec();
    }

    // Trưởng nhóm / Phó nhóm:
    if (memberId) {
      // Lấy toàn bộ bình luận của 1 thành viên cụ thể
      return this.commentModel
        .find({
          assignmentId,
          $or: [{ memberId }, { memberId: { $exists: false }, userId: memberId }],
        })
        .sort({ createdAt: 1 })
        .lean()
        .exec();
    }

    // Lấy tất cả bình luận của nhiệm vụ (để Trưởng nhóm tính comment counts theo member trong bảng)
    return this.commentModel.find({ assignmentId }).sort({ createdAt: 1 }).lean().exec();
  }

  async deleteAssignmentComment(assignmentId: string, commentId: string, userId: string) {
    const comment = await this.commentModel.findById(commentId);
    if (!comment) {
      throw new NotFoundException("Comment not found");
    }

    if (comment.assignmentId.toString() !== assignmentId) {
      throw new BadRequestException("Comment does not belong to this assignment");
    }

    const assignment = await this.assignmentModel.findById(assignmentId);
    const { isOwnerOrAdmin } = assignment
      ? await this.verifyUserRole(assignment.roomId, userId)
      : { isOwnerOrAdmin: false };

    // Người dùng được xóa comment do chính mình tạo, hoặc Giáo viên quản lý phòng
    if (comment.userId !== userId && !isOwnerOrAdmin) {
      throw new ForbiddenException("You can only delete your own comments");
    }

    await this.commentModel.findByIdAndDelete(commentId);

    // Phát socket realtime
    this.assignmentsGateway.notifyCommentDeleted(comment.roomId, assignmentId, commentId);

    return { success: true, commentId };
  }

  async exportExcel(assignmentId: string, userId: string, res: Response) {
    const assignment = await this.assignmentModel.findById(assignmentId);
    if (!assignment) {
      throw new NotFoundException("Assignment not found");
    }

    const { isOwnerOrAdmin } = await this.verifyUserRole(assignment.roomId, userId);
    if (!isOwnerOrAdmin) {
      throw new ForbiddenException("Only room owners/teachers can export assignment results");
    }

    const roomMembers = await this.roomMemberService.getRoomMembers(assignment.roomId);
    let targetMembers = roomMembers.filter((m) => m.userId !== assignment.createdBy);
    if (assignment.recipientMemberIds && assignment.recipientMemberIds.length > 0) {
      const recipientSet = new Set(assignment.recipientMemberIds);
      targetMembers = targetMembers.filter((m) => recipientSet.has(m.userId));
    }

    const submissions = await this.submissionModel.find({ assignmentId }).exec();
    const submissionMap = new Map(submissions.map((s) => [s.studentId, s]));

    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet("Kết quả nhiệm vụ");

    worksheet.columns = [
      { header: "Họ và tên", key: "displayName", width: 28 },
      { header: "Địa chỉ email", key: "email", width: 32 },
      { header: "Điểm đạt được", key: "score", width: 16 },
      { header: "Điểm tối đa", key: "maxScore", width: 16 },
      { header: "Phản hồi", key: "feedback", width: 35 },
      { header: "Thời gian nộp", key: "submissionTiming", width: 25 },
    ];

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0052FF" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 28;

    const deadlineTime = assignment.deadline ? new Date(assignment.deadline).getTime() : 0;

    for (const member of targetMembers) {
      const sub = submissionMap.get(member.userId);
      let timingText = "Chưa nộp";

      if (sub?.submittedAt && deadlineTime > 0) {
        const subTime = new Date(sub.submittedAt).getTime();
        const diffMs = subTime - deadlineTime;
        const diffMinutes = Math.round(Math.abs(diffMs) / 60000);

        if (Math.abs(diffMs) < 60000) {
          timingText = "Đúng hạn";
        } else if (subTime < deadlineTime) {
          if (diffMinutes < 60) {
            timingText = `Sớm ${diffMinutes} phút`;
          } else if (diffMinutes < 1440) {
            const hours = Math.floor(diffMinutes / 60);
            const mins = diffMinutes % 60;
            timingText = mins > 0 ? `Sớm ${hours} giờ ${mins} phút` : `Sớm ${hours} giờ`;
          } else {
            const days = Math.floor(diffMinutes / 1440);
            const remainingHours = Math.floor((diffMinutes % 1440) / 60);
            timingText = remainingHours > 0 ? `Sớm ${days} ngày ${remainingHours} giờ` : `Sớm ${days} ngày`;
          }
        } else {
          if (diffMinutes < 60) {
            timingText = `Trễ ${diffMinutes} phút`;
          } else if (diffMinutes < 1440) {
            const hours = Math.floor(diffMinutes / 60);
            const mins = diffMinutes % 60;
            timingText = mins > 0 ? `Trễ ${hours} giờ ${mins} phút` : `Trễ ${hours} giờ`;
          } else {
            const days = Math.floor(diffMinutes / 1440);
            const remainingHours = Math.floor((diffMinutes % 1440) / 60);
            timingText = remainingHours > 0 ? `Trễ ${days} ngày ${remainingHours} giờ` : `Trễ ${days} ngày`;
          }
        }
      }

      const row = worksheet.addRow({
        displayName: member.displayName || "Người dùng",
        email: member.email || "—",
        score: sub?.score !== undefined ? sub.score : "—",
        maxScore: assignment.gradingType === "graded" ? (assignment.maxScore ?? 10) : "—",
        feedback: sub?.feedback || "—",
        submissionTiming: timingText,
      });

      row.alignment = { vertical: "middle" };
      row.height = 22;
    }

    const nowStr = new Date().toISOString().slice(0, 10);
    const rawTitle = (assignment.title || "nhiem-vu")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 40);
    const fileName = `ket-qua-nhiem-vu-${rawTitle}-${nowStr}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // QUIZ METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Bắt đầu làm bài kiểm tra:
   * - Kiểm tra thời gian (startDate, endDate, closeDate, acceptingResponses)
   * - Tạo hoặc lấy lại Submission hiện có
   * - Sinh shuffleSeed nếu chưa có, lưu startedAt
   * - Trả về câu hỏi ĐÃ strip isCorrect (bảo mật)
   */
  async startQuiz(assignmentId: string, userId: string) {
    const assignment = await this.assignmentModel.findById(assignmentId);
    if (!assignment) throw new NotFoundException("Assignment not found");
    if (assignment.type !== "quiz") throw new BadRequestException("This is not a quiz");
    if (assignment.status !== "published") throw new BadRequestException("Quiz is not published yet");

    const { isMember } = await this.verifyUserRole(assignment.roomId, userId);
    if (!isMember) throw new ForbiddenException("You are not a member of this room");

    const settings = assignment.quizSettings;
    const now = new Date();

    // Kiểm tra acceptingResponses
    if (settings && !settings.acceptingResponses) {
      throw new BadRequestException("This quiz is not accepting responses");
    }

    // Kiểm tra closeDate — backend authority
    if (settings?.closeDate && now > new Date(settings.closeDate)) {
      throw new BadRequestException("This quiz is closed");
    }

    // Kiểm tra startDate
    if (settings?.startDate && now < new Date(settings.startDate)) {
      throw new BadRequestException("This quiz has not started yet");
    }

    // Kiểm tra endDate (không cho bắt đầu mới sau endDate)
    if (settings?.endDate && now > new Date(settings.endDate)) {
      throw new BadRequestException("This quiz has ended");
    }

    // Lấy attempt đang active (chưa nộp)
    let submission = await this.submissionModel.findOne({ assignmentId, studentId: userId, submittedAt: null });

    const allowMultipleAttempts = settings?.allowMultipleAttempts ?? false;

    if (!submission) {
      if (!allowMultipleAttempts) {
        // Chế độ 1 lần: kiểm tra xem đã có submission (có thể đã nộp) chưa
        const existingSubmitted = await this.submissionModel.findOne({ assignmentId, studentId: userId });
        if (existingSubmitted) {
          // Đã nộp rồi — trả về submission cũ (xử lý xuất hiện kết quả)
          submission = existingSubmitted;
        } else {
          // Chưa có gì: tạo mới
          const shuffleSeed = `${userId}_${assignmentId}_${Date.now()}`;
          try {
            submission = await this.submissionModel.findOneAndUpdate(
              { assignmentId, studentId: userId },
              {
                $setOnInsert: {
                  assignmentId,
                  studentId: userId,
                  roomId: assignment.roomId,
                  channelId: assignment.channelId || assignment.channelIds?.[0] || "",
                  attachments: [],
                  submissionStatus: "not_submitted",
                  startedAt: now,
                  shuffleSeed,
                  quizAnswers: [],
                  gradingStatus: null,
                  attemptNumber: 1,
                },
              },
              { upsert: true, new: true }
            );
          } catch {
            submission = await this.submissionModel.findOne({ assignmentId, studentId: userId });
          }
        }
      } else {
        // Chế độ nhiều lần: luôn tạo submission mới
        const previousCount = await this.submissionModel.countDocuments({ assignmentId, studentId: userId });
        const shuffleSeed = `${userId}_${assignmentId}_${Date.now()}`;
        submission = await this.submissionModel.create({
          assignmentId,
          studentId: userId,
          roomId: assignment.roomId,
          channelId: assignment.channelId || assignment.channelIds?.[0] || "",
          attachments: [],
          submissionStatus: "not_submitted",
          startedAt: now,
          shuffleSeed,
          quizAnswers: [],
          gradingStatus: null,
          attemptNumber: previousCount + 1,
        });
      }
    } else if (!submission.startedAt) {
      // Đã có submission nhưng chưa bắt đầu (edge case)
      submission.startedAt = now;
      if (!submission.shuffleSeed) {
        submission.shuffleSeed = `${userId}_${assignmentId}_${Date.now()}`;
      }
      await submission.save();
    } else {
      // Kiểm tra hết thời gian cá nhân
      if (settings && settings.timeLimitMinutes > 0) {
        const elapsed = (now.getTime() - submission.startedAt.getTime()) / 1000 / 60;
        if (elapsed >= settings.timeLimitMinutes && !submission.submittedAt) {
          throw new BadRequestException("Time limit exceeded. Please submit your quiz.");
        }
      }
    }

    // Strip isCorrect khỏi response
    const safeQuestions = (assignment.questions || []).map((q) => ({
      _id: q._id,
      questionType: q.questionType,
      title: q.title,
      points: q.points,
      isRequired: q.isRequired,
      shuffleOptions: q.shuffleOptions,
      allowMultiple: q.allowMultiple,
      options: (q.options || []).map((opt) => ({
        _id: opt._id,
        text: opt.text,
        // isCorrect KHÔNG được trả về
      })),
    }));

    return {
      submission: {
        _id: submission!._id,
        startedAt: submission!.startedAt,
        shuffleSeed: submission!.shuffleSeed,
        quizAnswers: submission!.quizAnswers,
        submittedAt: submission!.submittedAt,
        submissionStatus: submission!.submissionStatus,
        gradingStatus: submission!.gradingStatus,
        quizScore: submission!.quizScore,
        attemptNumber: submission!.attemptNumber ?? 1,
      },
      questions: safeQuestions,
      settings: {
        timeLimitMinutes: settings?.timeLimitMinutes ?? 0,
        shuffleQuestions: settings?.shuffleQuestions ?? false,
        allowMultipleAttempts: settings?.allowMultipleAttempts ?? false,
      },
    };
  }

  /**
   * Lấy attempt hiện tại (để tiếp tục bài hoặc xem kết quả).
   * Trả về câu hỏi không có isCorrect nếu chưa nộp.
   */
  async getMyQuizAttempt(assignmentId: string, userId: string) {
    const assignment = await this.assignmentModel.findById(assignmentId);
    if (!assignment) throw new NotFoundException("Assignment not found");
    if (assignment.type !== "quiz") throw new BadRequestException("This is not a quiz");

    const { isMember } = await this.verifyUserRole(assignment.roomId, userId);
    if (!isMember) throw new ForbiddenException("You are not a member of this room");

    const submission = await this.submissionModel.findOne({ assignmentId, studentId: userId });
    if (!submission) return null;

    const settings = assignment.quizSettings;
    const now = new Date();

    // Xác định có được xem đáp án đúng không
    const canSeeCorrectAnswers =
      settings?.showResultsAfterSubmit === true &&
      !!submission.submittedAt &&
      (!settings?.closeDate || now > new Date(settings.closeDate));

    const questions = (assignment.questions || []).map((q) => ({
      _id: q._id,
      questionType: q.questionType,
      title: q.title,
      points: q.points,
      isRequired: q.isRequired,
      shuffleOptions: q.shuffleOptions,
      allowMultiple: q.allowMultiple,
      options: (q.options || []).map((opt) => ({
        _id: opt._id,
        text: opt.text,
        // Chỉ lộ isCorrect khi đủ điều kiện
        ...(canSeeCorrectAnswers ? { isCorrect: opt.isCorrect } : {}),
      })),
    }));

    return {
      submission: {
        _id: submission._id,
        startedAt: submission.startedAt,
        shuffleSeed: submission.shuffleSeed,
        quizAnswers: submission.quizAnswers,
        submittedAt: submission.submittedAt,
        submissionStatus: submission.submissionStatus,
        gradingStatus: submission.gradingStatus,
        quizScore: submission.quizScore,
        score: submission.score,
      },
      questions,
      canSeeCorrectAnswers,
    };
  }

  /**
   * Nộp bài trắc nghiệm:
   * - Validate thời gian (timeLimitMinutes, closeDate)
   * - Validate câu bắt buộc
   * - Tự động chấm điểm MCQ
   * - Set gradingStatus phù hợp
   */
  async submitQuiz(
    assignmentId: string,
    userId: string,
    answers: { questionId: string; selectedOptionIds?: string[]; textAnswer?: string }[],
  ) {
    const assignment = await this.assignmentModel.findById(assignmentId);
    if (!assignment) throw new NotFoundException("Assignment not found");
    if (assignment.type !== "quiz") throw new BadRequestException("This is not a quiz");
    if (assignment.status !== "published") throw new BadRequestException("Quiz is not published");

    const { isMember } = await this.verifyUserRole(assignment.roomId, userId);
    if (!isMember) throw new ForbiddenException("You are not a member of this room");

    const settings = assignment.quizSettings;
    const now = new Date();

    // Kiểm tra closeDate — backend authority
    if (settings?.closeDate && now > new Date(settings.closeDate)) {
      throw new BadRequestException("This quiz is closed and no longer accepts submissions");
    }

    const submission = await this.submissionModel.findOne({ assignmentId, studentId: userId, submittedAt: null });
    if (!submission) throw new BadRequestException("No active quiz attempt found. Please start the quiz first.");
    // Đượng hướng cũ: không cần kiểm tra submission.submittedAt vì query đã lọc

    // Kiểm tra timeLimitMinutes — backend authority
    if (settings && settings.timeLimitMinutes > 0 && submission.startedAt) {
      const elapsed = (now.getTime() - submission.startedAt.getTime()) / 1000 / 60;
      if (elapsed > settings.timeLimitMinutes + 1) {
        // +1 phút buffer cho latency
        throw new BadRequestException("Time limit exceeded");
      }
    }

    // Validate câu bắt buộc
    const answersMap = new Map(answers.map((a) => [a.questionId, a]));
    for (const q of assignment.questions || []) {
      if (!q.isRequired) continue;
      const ans = answersMap.get(q._id);
      if (!ans) {
        throw new BadRequestException(`Question "${q.title}" is required`);
      }
      if (q.questionType === "choice") {
        if (!ans.selectedOptionIds || ans.selectedOptionIds.length === 0) {
          throw new BadRequestException(`Question "${q.title}" is required`);
        }
      } else {
        if (!ans.textAnswer || !ans.textAnswer.trim()) {
          throw new BadRequestException(`Question "${q.title}" is required`);
        }
      }
    }

    // Chấm điểm MCQ tự động
    let mcqScore = 0;
    let hasEssay = false;
    const scoredQuizAnswers: {
      questionId: string;
      selectedOptionIds: string[];
      textAnswer: string;
      score: number;
    }[] = [];

    for (const q of assignment.questions || []) {
      const ans = answersMap.get(q._id);

      if (q.questionType === "text") {
        hasEssay = true;
        scoredQuizAnswers.push({
          questionId: q._id,
          selectedOptionIds: [],
          textAnswer: ans?.textAnswer ?? "",
          score: 0,
        });
        continue;
      }

      const userSelected = (ans?.selectedOptionIds || []).map(String);
      const correctOptionIds = (q.options || [])
        .filter((opt) => opt.isCorrect)
        .map((opt) => String(opt._id));

      let earnedPoints = 0;
      const maxPoints = q.points ?? 0;

      if (userSelected.length > 0 && correctOptionIds.length > 0) {
        if (q.allowMultiple) {
          const correctCount = correctOptionIds.length;
          const correctSelected = userSelected.filter((id) =>
            correctOptionIds.includes(id)
          ).length;
          const wrongSelected = userSelected.filter(
            (id) => !correctOptionIds.includes(id)
          ).length;

          // Áp dụng công thức Phương án 1 (Chuẩn LMS/Moodle):
          // Điểm = Max(0, round(((correctSelected - wrongSelected) / correctCount) * maxPoints, 2))
          const rawPoints = ((correctSelected - wrongSelected) / correctCount) * maxPoints;
          earnedPoints = Math.max(0, Math.round(rawPoints * 100) / 100);
        } else {
          // Single choice: chỉ đúng khi chọn đúng duy nhất 1 đáp án đúng
          if (
            userSelected.length === 1 &&
            correctOptionIds.includes(userSelected[0])
          ) {
            earnedPoints = maxPoints;
          }
        }
      }

      mcqScore += earnedPoints;
      scoredQuizAnswers.push({
        questionId: q._id,
        selectedOptionIds: userSelected,
        textAnswer: "",
        score: earnedPoints,
      });
    }

    mcqScore = Math.round(mcqScore * 100) / 100;
    const gradingStatus = hasEssay ? "pending_manual" : "auto_graded";

    // Lưu
    submission.quizAnswers = scoredQuizAnswers as typeof submission.quizAnswers;
    submission.quizScore = mcqScore;
    submission.gradingStatus = gradingStatus;
    submission.submittedAt = now;
    submission.submissionStatus = "on_time";
    if (!hasEssay) {
      submission.score = mcqScore;
    }

    const saved = await submission.save();

    this.assignmentsGateway.notifyAssignmentSubmitted(
      assignment.roomId,
      assignment.channelId || "",
      saved,
    );

    return {
      success: true,
      quizScore: mcqScore,
      gradingStatus,
      submittedAt: saved.submittedAt,
    };
  }

  /**
   * Trưởng nhóm chấm điểm câu tự luận cho một thành viên cụ thể
   */
  async gradeEssayQuestion(
    assignmentId: string,
    studentId: string,
    essayScores: { questionId: string; score: number }[],
    userId: string,
  ) {
    const assignment = await this.assignmentModel.findById(assignmentId);
    if (!assignment) throw new NotFoundException("Assignment not found");
    if (assignment.type !== "quiz") throw new BadRequestException("This is not a quiz");

    const { isOwnerOrAdmin } = await this.verifyUserRole(assignment.roomId, userId);
    if (!isOwnerOrAdmin) throw new ForbiddenException("Only room owners/teachers can grade essays");

    const submission = await this.submissionModel.findOne({ assignmentId, studentId });
    if (!submission) throw new NotFoundException("Submission not found");

    // Tính tổng điểm = MCQ + essay
    let essayTotal = 0;
    for (const es of essayScores) {
      const question = (assignment.questions || []).find((q) => q._id === es.questionId);
      if (!question) continue;
      const maxPts = question.points ?? 0;
      if (es.score < 0 || es.score > maxPts) {
        throw new BadRequestException(
          `Score for question "${question.title}" must be between 0 and ${maxPts}`,
        );
      }
      essayTotal += es.score;
      const subAns = (submission.quizAnswers || []).find((a) => a.questionId === es.questionId);
      if (subAns) {
        subAns.score = es.score;
      }
    }

    submission.score = (submission.quizScore ?? 0) + essayTotal;
    submission.gradingStatus = "graded";
    submission.gradedBy = userId;
    submission.gradedAt = new Date();

    const saved = await submission.save();
    this.assignmentsGateway.notifyAssignmentGradingUpdated(
      submission.roomId,
      submission.channelId,
      studentId,
      saved,
    );

    return saved;
  }

  /**
   * Lấy kết quả quiz:
   * - Trưởng nhóm: luôn thấy đầy đủ (kể cả isCorrect)
   * - Thành viên: kiểm tra closeDate + showResultsAfterSubmit
   */
  async getQuizResults(assignmentId: string, userId: string) {
    const assignment = await this.assignmentModel.findById(assignmentId);
    if (!assignment) throw new NotFoundException("Assignment not found");
    if (assignment.type !== "quiz") throw new BadRequestException("This is not a quiz");

    const { isOwnerOrAdmin, isMember } = await this.verifyUserRole(assignment.roomId, userId);
    if (!isMember) throw new ForbiddenException("You are not a member of this room");

    const settings = assignment.quizSettings;
    const now = new Date();

    if (isOwnerOrAdmin) {
      // Trưởng nhóm thấy tất cả submissions + đáp án đúng
      const submissions = await this.submissionModel.find({ assignmentId }).exec();
      return {
        canSeeCorrectAnswers: true,
        questions: assignment.questions,
        submissions,
      };
    }

    // Thành viên: lấy submission của mình
    const submission = await this.submissionModel.findOne({ assignmentId, studentId: userId });
    if (!submission || !submission.submittedAt) {
      throw new ForbiddenException("You have not submitted this quiz");
    }

    // Xác định có được xem điểm chưa
    const closeDatePassed = settings?.closeDate ? now > new Date(settings.closeDate) : false;
    const canSeeScore = closeDatePassed || !settings?.closeDate;

    if (!canSeeScore) {
      return {
        canSeeScore: false,
        message: "Results will be available after the quiz closes",
        submittedAt: submission.submittedAt,
      };
    }

    // Xác định có được xem đáp án đúng không
    const canSeeCorrectAnswers =
      settings?.showResultsAfterSubmit === true && closeDatePassed;

    const questions = (assignment.questions || []).map((q) => ({
      _id: q._id,
      questionType: q.questionType,
      title: q.title,
      points: q.points,
      allowMultiple: q.allowMultiple,
      options: (q.options || []).map((opt) => ({
        _id: opt._id,
        text: opt.text,
        ...(canSeeCorrectAnswers ? { isCorrect: opt.isCorrect } : {}),
      })),
    }));

    return {
      canSeeScore: true,
      canSeeCorrectAnswers,
      quizScore: submission.quizScore,
      score: submission.score,
      gradingStatus: submission.gradingStatus,
      quizAnswers: submission.quizAnswers,
      questions,
      passScore: settings?.passScore ?? 0,
      totalPoints: (assignment.questions || []).reduce((sum, q) => sum + (q.points ?? 0), 0),
    };
  }
}


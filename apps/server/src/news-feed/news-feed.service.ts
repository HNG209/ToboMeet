import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Post, PostDocument } from "./schemas/post.schema";
import { Comment, CommentDocument } from "./schemas/comment.schema";
import { Room, RoomDocument } from "../rooms/schemas/room.schema";
import { User, UserDocument } from "../users/schemas/user.schema";
import {
  CalendarEvent,
  CalendarEventDocument,
} from "../calendar/schemas/calendar-event.schema";
import { MeetingsGateway } from "../meetings/meetings.gateway";
import { SupabaseService } from "../supabase/supabase.service";
import { CreatePostDto } from "./dto/create-post.dto";
import { CreateCommentDto } from "./dto/create-comment.dto";
import * as path from "path";
import * as crypto from "crypto";

// ─── Local Types ──────────────────────────────────────────────────────────────
interface PostReaction {
  userId: string;
  reaction: string;
  reactedAt?: Date;
}

interface PostAttachment {
  url: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  thumbnail?: string;
}

type PopulateItem = PostDocument | CommentDocument;

type PopulatedPost = Omit<PostDocument, "reactions"> & { reactions?: unknown };

const EMOJI_MAP: Record<string, string> = {
  "👍": "like",
  "❤️": "heart",
  "😂": "laugh",
  "😮": "surprised",
  "😢": "sad",
  "👏": "clap",
  "🎉": "party",
};

const REVERSE_EMOJI_MAP: Record<string, string> = {
  like: "👍",
  heart: "❤️",
  laugh: "😂",
  surprised: "😮",
  sad: "😢",
  clap: "👏",
  party: "🎉",
};

@Injectable()
export class NewsFeedService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<PostDocument>,
    @InjectModel(Comment.name)
    private readonly commentModel: Model<CommentDocument>,
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(CalendarEvent.name)
    private readonly calendarEventModel: Model<CalendarEventDocument>,
    private readonly meetingsGateway: MeetingsGateway,
    private readonly supabaseService: SupabaseService,
  ) {}

  private getReactionStatsAndUserReaction(
    reactionsArray: PostReaction[],
    currentUserId: string,
  ) {
    const statsMap: Record<string, number> = {};
    let userReactionEmoji: string | null = null;

    reactionsArray.forEach((r) => {
      const emoji = REVERSE_EMOJI_MAP[r.reaction] || r.reaction;
      statsMap[emoji] = (statsMap[emoji] || 0) + 1;

      if (r.userId === currentUserId) {
        userReactionEmoji = emoji;
      }
    });

    const reactionStats = Object.keys(statsMap).map((emoji) => ({
      reaction: emoji,
      count: statsMap[emoji],
    }));

    return { reactionStats, userReaction: userReactionEmoji };
  }

  /**
   * Helper kiểm tra thành viên phòng họp & quyền truy cập Kênh riêng tư
   */
  private async checkRoomMember(roomId: string, userId: string) {
    const room = await this.roomModel.findById(roomId);
    if (!room || room.isDeleted) {
      throw new NotFoundException("Phòng họp không tồn tại");
    }

    const userDoc = await this.userModel.findOne({ supabaseId: userId }).exec();

    const allowedUserIds = new Set<string>([userId]);
    if (userDoc) {
      if (userDoc.supabaseId) allowedUserIds.add(userDoc.supabaseId);
      if (userDoc._id) allowedUserIds.add(userDoc._id.toString());
    }

    const member = room.members.find(
      (m) => allowedUserIds.has(m.userId) && m.status === "active",
    );

    if (!member) {
      throw new ForbiddenException("Bạn không phải thành viên của phòng này");
    }

    return { room, member, allowedUserIds };
  }

  private async checkChannelAccess(
    roomId: string,
    channelId: string,
    userId: string,
  ) {
    const { room, member, allowedUserIds } = await this.checkRoomMember(
      roomId,
      userId,
    );

    if (allowedUserIds.has(room.ownerId)) {
      return { room, member };
    }

    const channel = room.channels.find((c) => c._id?.toString() === channelId);
    if (!channel) {
      throw new NotFoundException("Kênh không tồn tại");
    }

    if (channel.isPrivate) {
      const channelMember = channel.members?.find((m) =>
        allowedUserIds.has(m.userId),
      );

      if (!channelMember) {
        throw new ForbiddenException(
          "Bạn không có quyền truy cập kênh riêng tư này",
        );
      }
    }

    return { room, member, channel };
  }

  /**
   * Helper populate thông tin tác giả và vai trò trong phòng
   */
  private async populateAuthors(items: PopulateItem[], roomId: string) {
    const room = await this.roomModel.findById(roomId);
    const authorIds = Array.from(new Set(items.map((item) => item.authorId)));
    const users = await this.userModel
      .find({ supabaseId: { $in: authorIds } })
      .exec();

    return items.map((item) => {
      const itemObj = item.toObject ? item.toObject() : item;
      const user = users.find((u) => u.supabaseId === item.authorId);
      const member = room?.members.find((m) => m.userId === item.authorId);

      return {
        ...itemObj,
        author: {
          userId: item.authorId,
          displayName: user?.displayName || "Người dùng ẩn danh",
          avatarUrl: user?.avatarUrl || "",
          role: member?.role || "member",
        },
      };
    });
  }

  /**
   * Lấy danh sách bài viết theo Kênh
   */
  async getPosts(
    roomId: string,
    channelId: string,
    userId: string,
  ): Promise<unknown[]> {
    const { room, member } = await this.checkChannelAccess(roomId, channelId, userId);
    const isOwnerOrAdmin =
      room.ownerId === userId ||
      (member && ["owner", "admin", "teacher", "leader"].includes(member.role?.toLowerCase()));

    const posts = await this.postModel
      .find({ roomId, channelId, isDeleted: { $ne: true } })
      .sort({ createdAt: -1 })
      .exec();

    // Lọc bài đăng nhiệm vụ theo quyền của user
    const accessiblePosts = posts.filter((post) => {
      if (!post.isAssignment) return true;

      // Người tạo nhiệm vụ và Chủ phòng/Admin luôn thấy bài đăng
      if (post.authorId === userId || isOwnerOrAdmin) {
        return true;
      }

      // Nếu giao cho thành viên cụ thể: Chỉ người được giao mới thấy
      if (
        post.recipientType === "specific_members" ||
        post.recipientType === "current_members"
      ) {
        return post.recipientMemberIds?.includes(userId) ?? false;
      }

      // Nếu giao cho kênh: Thành viên trong kênh được thấy
      return true;
    });

    // Lấy số lượng comment cho từng bài viết
    const populated = await this.populateAuthors(accessiblePosts, roomId);

    // Batch get các calendar events cho các post là cuộc họp (tránh N+1 query)
    const eventIds = Array.from(
      new Set(
        populated
          .filter((p: any) => p.isMeeting && p.eventId)
          .map((p: any) => p.eventId)
          .filter(Boolean),
      ),
    );

    let eventMap = new Map<string, any>();
    if (eventIds.length > 0) {
      const events = await this.calendarEventModel
        .find({ _id: { $in: eventIds } })
        .exec();
      events.forEach((ev) => {
        eventMap.set(ev._id.toString(), ev);
      });
    }

    const postsWithCommentCount = await Promise.all(
      populated.map(async (post: any) => {
        const commentCount = await this.commentModel.countDocuments({
          postId: post._id,
        });
        const { reactionStats, userReaction } =
          this.getReactionStatsAndUserReaction(post.reactions || [], userId);
        const postWithoutRawReactions = { ...post } as Partial<PopulatedPost>;
        delete postWithoutRawReactions.reactions;

        // Bổ sung thông tin calendar event và trạng thái tham gia
        let calendarEventData: any = undefined;
        if (post.isMeeting && post.eventId) {
          const ev = eventMap.get(post.eventId.toString());
          if (ev) {
            const isHost = ev.hostId === userId;
            const isAccepted = Array.isArray(ev.acceptedUserIds) && ev.acceptedUserIds.includes(userId);
            const isJoined = isHost || isAccepted;

            calendarEventData = {
              _id: ev._id.toString(),
              title: ev.title,
              startDate: ev.startDate,
              endDate: ev.endDate,
              meetingCode: ev.meetingCode || post.meetingCode,
              hostId: ev.hostId,
              roomId: ev.roomId,
              channelId: ev.channelId,
              roomType: ev.roomType,
              isJoined,
              isHost,
            };
          }
        }

        return {
          ...postWithoutRawReactions,
          calendarEvent: calendarEventData,
          commentsCount: commentCount,
          reactionStats,
          userReaction,
        };
      }),
    );

    return postsWithCommentCount;
  }

  /**
   * Tạo bài viết mới
   */
  async createPost(userId: string, dto: CreatePostDto) {
    await this.checkChannelAccess(dto.roomId, dto.channelId, userId);

    if (
      !dto.content?.trim() &&
      (!dto.attachments || dto.attachments.length === 0)
    ) {
      throw new BadRequestException(
        "Nội dung bài viết hoặc tệp đính kèm là bắt buộc",
      );
    }

    if (dto.attachments && dto.attachments.length > 10) {
      throw new BadRequestException("Tối đa chỉ được đính kèm 10 tệp tin");
    }

    const post = await this.postModel.create({
      roomId: dto.roomId,
      channelId: dto.channelId,
      authorId: userId,
      content: dto.content,
      attachments: dto.attachments || [],
      reactions: [],
      isEdited: false,
    });

    const populated = (await this.populateAuthors([post], dto.roomId))[0];
    const postWithCount = {
      ...populated,
      commentsCount: 0,
      reactionStats: [],
      userReaction: null,
    } as Partial<PopulatedPost>;
    delete postWithCount.reactions;

    // Phát sự kiện Realtime Socket.io cho tất cả thành viên trong phòng
    this.meetingsGateway.server
      .to(`room_${dto.roomId}`)
      .emit("post_created", postWithCount);

    return postWithCount;
  }

  /**
   * Chỉnh sửa bài viết
   */
  async updatePost(
    userId: string,
    postId: string,
    content: string,
    attachments?: PostAttachment[],
  ) {
    const post = await this.postModel.findById(postId);
    if (!post || post.isDeleted) {
      throw new NotFoundException("Bài viết không tồn tại");
    }

    await this.checkChannelAccess(post.roomId, post.channelId, userId);

    if (post.authorId !== userId) {
      throw new ForbiddenException("Bạn không có quyền chỉnh sửa bài viết này");
    }

    if (!content?.trim() && (!attachments || attachments.length === 0)) {
      throw new BadRequestException(
        "Nội dung bài viết hoặc tệp đính kèm là bắt buộc",
      );
    }

    post.content = content;
    if (attachments) {
      post.attachments = attachments;
    }
    post.isEdited = true;
    await post.save();

    const populated = (await this.populateAuthors([post], post.roomId))[0];
    const commentCount = await this.commentModel.countDocuments({
      postId: post._id,
    });
    const { reactionStats, userReaction } =
      this.getReactionStatsAndUserReaction(post.reactions || [], userId);
    const postWithCount = {
      ...populated,
      commentsCount: commentCount,
      reactionStats,
      userReaction,
    } as Partial<PopulatedPost>;
    delete postWithCount.reactions;

    this.meetingsGateway.server
      .to(`room_${post.roomId}`)
      .emit("post_updated", postWithCount);

    return postWithCount;
  }

  /**
   * Xóa bài viết
   */
  async deletePost(userId: string, postId: string) {
    const post = await this.postModel.findById(postId);
    if (!post || post.isDeleted) {
      throw new NotFoundException("Bài viết không tồn tại");
    }

    const { member } = await this.checkChannelAccess(
      post.roomId,
      post.channelId,
      userId,
    );
    const isTeacher = member.role === "owner" || member.role === "admin";

    // Phân quyền: Tác giả bài viết hoặc Giáo viên (Owner/Admin) mới được xóa
    if (post.authorId !== userId && !isTeacher) {
      throw new ForbiddenException("Bạn không có quyền xóa bài viết này");
    }

    post.isDeleted = true;
    await post.save();

    this.meetingsGateway.server
      .to(`room_${post.roomId}`)
      .emit("post_deleted", { postId });

    return { success: true };
  }

  /**
   * Thả cảm xúc cho bài viết
   */
  async togglePostReaction(userId: string, postId: string, type: string) {
    const post = await this.postModel.findById(postId);
    if (!post || post.isDeleted) {
      throw new NotFoundException("Bài viết không tồn tại");
    }

    await this.checkChannelAccess(post.roomId, post.channelId, userId);

    const reactionKey = EMOJI_MAP[type] || type;

    const existingIndex = post.reactions.findIndex((r) => r.userId === userId);
    if (existingIndex > -1) {
      if (post.reactions[existingIndex].reaction === reactionKey) {
        // Nếu click lại cùng reaction -> Xóa bỏ (Toggle off)
        post.reactions.splice(existingIndex, 1);
      } else {
        // Đổi loại reaction
        post.reactions[existingIndex].reaction = reactionKey;
        post.reactions[existingIndex].reactedAt = new Date();
      }
    } else {
      // Thêm reaction mới
      post.reactions.push({
        userId,
        reaction: reactionKey,
        reactedAt: new Date(),
      });
    }

    await post.save();

    const { reactionStats, userReaction } =
      this.getReactionStatsAndUserReaction(post.reactions || [], userId);

    this.meetingsGateway.server
      .to(`room_${post.roomId}`)
      .emit("post_reaction_updated", {
        postId,
        userId,
        userReaction,
        reactionStats,
      });

    return {
      reactionStats,
      userReaction,
    };
  }

  /**
   * Lấy bình luận của bài viết
   */
  async getComments(postId: string, userId: string) {
    const post = await this.postModel.findById(postId);
    if (!post || post.isDeleted) {
      throw new NotFoundException("Bài viết không tồn tại");
    }

    await this.checkChannelAccess(post.roomId, post.channelId, userId);

    const comments = await this.commentModel
      .find({ postId: new Types.ObjectId(postId) })
      .sort({ createdAt: 1 })
      .exec();

    return this.populateAuthors(comments, post.roomId);
  }

  /**
   * Tạo bình luận mới (Hoặc phản hồi bình luận)
   */
  async createComment(userId: string, dto: CreateCommentDto) {
    const post = await this.postModel.findById(dto.postId);
    if (!post || post.isDeleted) {
      throw new NotFoundException("Bài viết không tồn tại");
    }

    await this.checkChannelAccess(post.roomId, post.channelId, userId);

    if (
      !dto.content?.trim() &&
      (!dto.attachments || dto.attachments.length === 0)
    ) {
      throw new BadRequestException(
        "Nội dung bình luận hoặc tệp đính kèm là bắt buộc",
      );
    }

    const comment = await this.commentModel.create({
      postId: new Types.ObjectId(dto.postId),
      parentId: dto.parentId ? new Types.ObjectId(dto.parentId) : null,
      authorId: userId,
      content: dto.content,
      attachments: dto.attachments || [],
      reactions: [],
      isEdited: false,
    });

    const populated = (await this.populateAuthors([comment], post.roomId))[0];

    this.meetingsGateway.server
      .to(`room_${post.roomId}`)
      .emit("comment_created", populated);

    return populated;
  }

  /**
   * Chỉnh sửa bình luận
   */
  async updateComment(userId: string, commentId: string, content: string) {
    const comment = await this.commentModel.findById(commentId);
    if (!comment) {
      throw new NotFoundException("Bình luận không tồn tại");
    }

    const post = await this.postModel.findById(comment.postId);
    await this.checkChannelAccess(post!.roomId, post!.channelId, userId);

    if (comment.authorId !== userId) {
      throw new ForbiddenException(
        "Bạn không có quyền chỉnh sửa bình luận này",
      );
    }

    if (!content?.trim()) {
      throw new BadRequestException("Nội dung bình luận không được để trống");
    }

    comment.content = content;
    comment.isEdited = true;
    await comment.save();

    const populated = (await this.populateAuthors([comment], post!.roomId))[0];

    this.meetingsGateway.server
      .to(`room_${post!.roomId}`)
      .emit("comment_updated", populated);

    return populated;
  }

  /**
   * Xóa bình luận
   */
  async deleteComment(userId: string, commentId: string) {
    const comment = await this.commentModel.findById(commentId);
    if (!comment) {
      throw new NotFoundException("Bình luận không tồn tại");
    }

    const post = await this.postModel.findById(comment.postId);
    const { member } = await this.checkChannelAccess(
      post!.roomId,
      post!.channelId,
      userId,
    );
    const isTeacher = member.role === "owner" || member.role === "admin";

    // Phân quyền: Chủ bình luận hoặc Giáo viên mới được xóa
    if (comment.authorId !== userId && !isTeacher) {
      throw new ForbiddenException("Bạn không có quyền xóa bình luận này");
    }

    // Tìm tất cả ID của các bình luận con cháu nhiều cấp bên dưới
    const getAllDescendantIds = async (parentIdStr: string): Promise<Types.ObjectId[]> => {
      const children = await this.commentModel
        .find({ parentId: new Types.ObjectId(parentIdStr) }, { _id: 1 })
        .exec();
      let allIds = children.map((c) => c._id as Types.ObjectId);
      for (const child of children) {
        const subIds = await getAllDescendantIds(child._id.toString());
        allIds = allIds.concat(subIds);
      }
      return allIds;
    };

    const descendantIds = await getAllDescendantIds(commentId);
    const allIdsToDelete = [new Types.ObjectId(commentId), ...descendantIds];

    await this.commentModel.deleteMany({
      _id: { $in: allIdsToDelete },
    });

    this.meetingsGateway.server
      .to(`room_${post!.roomId}`)
      .emit("comment_deleted", {
        commentId,
        deletedCommentIds: allIdsToDelete.map((id) => id.toString()),
        postId: comment.postId.toString(),
        parentId: comment.parentId ? comment.parentId.toString() : null,
      });

    return { success: true };
  }

  /**
   * Thả cảm xúc cho bình luận
   */
  async toggleCommentReaction(userId: string, commentId: string, type: string) {
    const comment = await this.commentModel.findById(commentId);
    if (!comment) {
      throw new NotFoundException("Bình luận không tồn tại");
    }

    const post = await this.postModel.findById(comment.postId);
    await this.checkChannelAccess(post!.roomId, post!.channelId, userId);

    const allowedReactions = ["👍", "❤️", "😂", "😮", "😢", "👏", "🎉"];
    if (!allowedReactions.includes(type)) {
      throw new BadRequestException("Reaction type không hợp lệ");
    }

    const existingIndex = comment.reactions.findIndex(
      (r) => r.userId === userId,
    );
    if (existingIndex > -1) {
      if (comment.reactions[existingIndex].type === type) {
        comment.reactions.splice(existingIndex, 1);
      } else {
        comment.reactions[existingIndex].type = type;
      }
    } else {
      comment.reactions.push({ userId, type });
    }

    await comment.save();

    this.meetingsGateway.server
      .to(`room_${post!.roomId}`)
      .emit("comment_reaction_updated", {
        commentId,
        postId: comment.postId.toString(),
        reactions: comment.reactions,
      });

    return comment.reactions;
  }

  /**
   * Khởi tạo bucket và sinh Signed Upload URL cho file phương tiện đính kèm bảng tin
   */
  private async ensureBucketExists(bucketName: string) {
    try {
      const { data: buckets, error: listError } =
        await this.supabaseService.admin.storage.listBuckets();
      if (listError) throw listError;
      const exists = buckets.some((b) => b.name === bucketName);
      if (!exists) {
        const { error: createError } =
          await this.supabaseService.admin.storage.createBucket(bucketName, {
            public: true,
            fileSizeLimit: 50 * 1024 * 1024, // 50MB limit (compatible with Supabase free tier)
          });
        if (createError) throw createError;
      }
    } catch (err) {
      console.error(`Failed to ensure bucket "${bucketName}" exists:`, err);
      throw err;
    }
  }

  async createSignedUploadUrl(originalFileName: string) {
    const bucketName = "news-feed-attachments";
    await this.ensureBucketExists(bucketName);

    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const uuid = crypto.randomUUID();
    const timestamp = Date.now();
    const ext = path.extname(originalFileName).toLowerCase();
    const uniqueFileName = `${uuid}-${timestamp}${ext}`;
    const filePath = `${year}/${month}/${uniqueFileName}`;

    const { data, error } = await this.supabaseService.admin.storage
      .from(bucketName)
      .createSignedUploadUrl(filePath);

    if (error) {
      throw new BadRequestException(
        `Không thể tạo signed upload URL: ${error.message}`,
      );
    }

    const { data: publicUrlData } = this.supabaseService.admin.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    return {
      signedUrl: data.signedUrl,
      url: publicUrlData.publicUrl,
      fileName: uniqueFileName,
    };
  }

  async getPostReactions(postId: string, userId: string) {
    const post = await this.postModel.findById(postId);
    if (!post || post.isDeleted) {
      throw new NotFoundException("Bài viết không tồn tại");
    }

    await this.checkRoomMember(post.roomId, userId);

    const userIds = post.reactions.map((r) => r.userId);
    const users = await this.userModel
      .find({ supabaseId: { $in: userIds } })
      .exec();
    const room = await this.roomModel.findById(post.roomId);

    return post.reactions.map((r) => {
      const user = users.find((u) => u.supabaseId === r.userId);
      const member = room?.members.find((m) => m.userId === r.userId);
      const emoji = REVERSE_EMOJI_MAP[r.reaction] || r.reaction;
      return {
        userId: r.userId,
        reaction: emoji,
        reactedAt: r.reactedAt,
        user: {
          displayName: user?.displayName || "Người dùng ẩn danh",
          avatarUrl: user?.avatarUrl || "",
          role: member?.role || "member",
        },
      };
    });
  }
}

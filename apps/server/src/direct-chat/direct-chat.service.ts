import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import * as crypto from "crypto";
import * as path from "path";
import {
  DirectConversation,
  DirectConversationDocument,
} from "./schemas/direct-conversation.schema";
import {
  DirectMessage,
  DirectMessageDocument,
} from "./schemas/direct-message.schema";
import { User, UserDocument } from "../users/schemas/user.schema";
import { SupabaseService } from "../supabase/supabase.service";
import { SendMessageDto } from "./dto/send-message.dto";
import { GetChatUploadUrlDto } from "./dto/chat-actions.dto";
import { AppGateway } from "../core/gateways/app.gateway";

@Injectable()
export class DirectChatService {
  private readonly verifiedBuckets = new Set<string>();

  constructor(
    @InjectModel(DirectConversation.name)
    private conversationModel: Model<DirectConversationDocument>,
    @InjectModel(DirectMessage.name)
    private messageModel: Model<DirectMessageDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private supabaseService: SupabaseService,
    private appGateway: AppGateway,
  ) {}

  private async ensureBucketExists(bucketName: string) {
    if (this.verifiedBuckets.has(bucketName)) {
      return;
    }
    try {
      const { data: buckets, error: listError } =
        await this.supabaseService.admin.storage.listBuckets();
      if (listError) {
        throw listError;
      }

      const exists = buckets?.some((b) => b.name === bucketName);
      if (!exists) {
        const { error: createError } =
          await this.supabaseService.admin.storage.createBucket(bucketName, {
            public: true,
            fileSizeLimit: 50 * 1024 * 1024, // 50MB cho video
          });
        if (createError) {
          throw createError;
        }
      }
      this.verifiedBuckets.add(bucketName);
    } catch (err) {
      console.error(`Failed to ensure chat bucket "${bucketName}" exists:`, err);
    }
  }

  /**
   * Tạo mới hoặc lấy cuộc trò chuyện 1-1 giữa 2 người dùng
   */
  async getOrCreateConversation(currentUserId: string, recipientId: string) {
    if (!recipientId) {
      throw new BadRequestException("ID người nhận không hợp lệ");
    }
    if (currentUserId === recipientId) {
      throw new BadRequestException("Không thể tạo cuộc trò chuyện với chính mình");
    }

    const recipientUser = await this.userModel
      .findOne({ supabaseId: recipientId })
      .select("supabaseId displayName avatarUrl email status")
      .lean();

    if (!recipientUser) {
      throw new NotFoundException("Không tìm thấy người dùng");
    }

    const participantIds = [currentUserId, recipientId].sort();

    let conversation = await this.conversationModel
      .findOne({ participantIds })
      .lean();

    if (!conversation) {
      const newDoc = await this.conversationModel.create({
        participantIds,
        lastMessageAt: new Date(),
        lastMessagePreview: "Cuộc trò chuyện mới",
        unreadCounts: {
          [currentUserId]: 0,
          [recipientId]: 0,
        },
      });
      conversation = newDoc.toObject();
    }

    return this.formatConversation(conversation, currentUserId, [recipientUser]);
  }

  /**
   * Lấy danh sách cuộc trò chuyện của người dùng hiện tại
   */
  async getConversations(currentUserId: string) {
    const rawConversations = await this.conversationModel
      .find({ participantIds: currentUserId })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .lean();

    const allParticipantIds = new Set<string>();
    for (const c of rawConversations) {
      for (const pid of c.participantIds) {
        if (pid !== currentUserId) {
          allParticipantIds.add(pid);
        }
      }
    }

    const otherUsers = await this.userModel
      .find({ supabaseId: { $in: Array.from(allParticipantIds) } })
      .select("supabaseId displayName avatarUrl email status")
      .lean();

    return rawConversations.map((conv) =>
      this.formatConversation(conv, currentUserId, otherUsers),
    );
  }

  /**
   * Lấy chi tiết một cuộc trò chuyện
   */
  async getConversationById(conversationId: string, currentUserId: string) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new BadRequestException("Mã cuộc trò chuyện không hợp lệ");
    }

    const conversation = await this.conversationModel
      .findById(conversationId)
      .lean();

    if (!conversation) {
      throw new NotFoundException("Không tìm thấy cuộc trò chuyện");
    }

    if (!conversation.participantIds.includes(currentUserId)) {
      throw new ForbiddenException("Bạn không có quyền truy cập cuộc trò chuyện này");
    }

    const otherIds = conversation.participantIds.filter((id) => id !== currentUserId);
    const otherUsers = await this.userModel
      .find({ supabaseId: { $in: otherIds } })
      .select("supabaseId displayName avatarUrl email status")
      .lean();

    return this.formatConversation(conversation, currentUserId, otherUsers);
  }

  /**
   * Lấy lịch sử tin nhắn có phân trang (cursor-based: before messageId)
   */
  async getMessages(
    conversationId: string,
    currentUserId: string,
    options: { before?: string; limit?: number } = {},
  ) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new BadRequestException("Mã cuộc trò chuyện không hợp lệ");
    }

    const conversation = await this.conversationModel.findById(conversationId).lean();
    if (!conversation) {
      throw new NotFoundException("Không tìm thấy cuộc trò chuyện");
    }

    if (!conversation.participantIds.includes(currentUserId)) {
      throw new ForbiddenException("Bạn không có quyền truy cập cuộc trò chuyện này");
    }

    const limit = Math.min(Math.max(options.limit || 30, 1), 50);
    const query: any = { conversationId: new Types.ObjectId(conversationId) };

    if (options.before && Types.ObjectId.isValid(options.before)) {
      query._id = { $lt: new Types.ObjectId(options.before) };
    }

    const rawMessages = await this.messageModel
      .find(query)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate({
        path: "replyToId",
        select: "_id content senderId type attachments deletedAt",
      })
      .lean();

    const hasMore = rawMessages.length > limit;
    if (hasMore) {
      rawMessages.pop();
    }

    // Lấy thông tin người gửi
    const senderIds = Array.from(new Set(rawMessages.map((m) => m.senderId)));
    const senders = await this.userModel
      .find({ supabaseId: { $in: senderIds } })
      .select("supabaseId displayName avatarUrl email")
      .lean();

    const senderMap = new Map<string, any>(
      senders.map((s) => [s.supabaseId, s]),
    );

    // Lấy map tin nhắn đã ghim trong conversation để đồng bộ isPinned chính xác
    const pinnedMap = new Map<string, any>(
      (conversation.pinnedMessages || []).map((p: any) => [
        p.messageId.toString(),
        p,
      ]),
    );

    // Format & đảo ngược danh sách để hiển thị từ cũ -> mới theo thứ tự thời gian
    const messages = rawMessages.reverse().map((msg) => {
      const pinInfo = pinnedMap.get(msg._id.toString());
      return {
        ...msg,
        id: msg._id.toString(),
        isPinned: Boolean(pinInfo || msg.isPinned),
        pinnedBy: pinInfo?.pinnedBy || msg.pinnedBy || null,
        pinnedAt: pinInfo?.pinnedAt || msg.pinnedAt || null,
        sender: senderMap.get(msg.senderId) || {
          supabaseId: msg.senderId,
          displayName: "Người dùng",
          avatarUrl: null,
        },
      };
    });

    return {
      messages,
      hasMore,
      nextCursor: hasMore && messages.length > 0 ? messages[0].id : null,
    };
  }

  /**
   * Gửi tin nhắn mới
   */
  async sendMessage(
    conversationId: string,
    currentUserId: string,
    dto: SendMessageDto,
  ) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new BadRequestException("Mã cuộc trò chuyện không hợp lệ");
    }

    const trimmedContent = dto.content?.trim() || "";
    const hasAttachments = Boolean(dto.attachments && dto.attachments.length > 0);

    if (!trimmedContent && !hasAttachments) {
      throw new BadRequestException("Nội dung tin nhắn hoặc tệp đính kèm là bắt buộc");
    }

    let type = dto.type || "text";
    if (hasAttachments && type === "text") {
      type = dto.attachments![0].fileType || "file";
    }

    // 1. Song song hóa: Kiểm tra conversation, lấy thông tin sender và tin nhắn reply (nếu có)
    const replyPromise =
      dto.replyToId && Types.ObjectId.isValid(dto.replyToId)
        ? (this.messageModel
            .findOne({
              _id: new Types.ObjectId(dto.replyToId),
              conversationId: new Types.ObjectId(conversationId),
            } as any)
            .lean() as Promise<any>)
        : Promise.resolve(null);

    const [conversation, sender, replyMsg]: [any, any, any] = await Promise.all([
      this.conversationModel.findById(conversationId),
      this.userModel
        .findOne({ supabaseId: currentUserId })
        .select("supabaseId displayName avatarUrl email")
        .lean(),
      replyPromise,
    ]);

    if (!conversation) {
      throw new NotFoundException("Không tìm thấy cuộc trò chuyện");
    }

    if (!conversation.participantIds.includes(currentUserId)) {
      throw new ForbiddenException("Bạn không thể gửi tin nhắn vào cuộc trò chuyện này");
    }

    let replyToObjectId: Types.ObjectId | null = null;
    if (replyMsg?._id) {
      replyToObjectId = replyMsg._id as Types.ObjectId;
    }

    // 2. Tạo tin nhắn mới trong Database
    const createdMsg: any = await this.messageModel.create({
      conversationId: new Types.ObjectId(conversationId),
      senderId: currentUserId,
      type,
      content: trimmedContent,
      attachments: dto.attachments || [],
      replyToId: replyToObjectId,
      reactions: [],
      deletedAt: null,
    } as any);

    // 3. Tạo preview tóm tắt cho conversation
    let previewText = trimmedContent;
    if (hasAttachments) {
      const firstAtt = dto.attachments![0];
      if (firstAtt.fileType === "image") {
        previewText = trimmedContent ? `📷 ${trimmedContent}` : "📷 [Hình ảnh]";
      } else if (firstAtt.fileType === "video") {
        previewText = trimmedContent ? `🎥 ${trimmedContent}` : "🎥 [Video]";
      } else {
        previewText = trimmedContent
          ? `📎 ${trimmedContent}`
          : `📎 [Tệp: ${firstAtt.fileName}]`;
      }
    }

    // 4. Cập nhật conversation & tăng unread count cho người nhận trong background (không chặn HTTP)
    const otherParticipantId = conversation.participantIds.find(
      (id: string) => id !== currentUserId,
    );

    const updateOps: any = {
      $set: {
        lastMessageAt: new Date(),
        lastMessagePreview: previewText,
      },
    };

    if (otherParticipantId) {
      updateOps.$inc = { [`unreadCounts.${otherParticipantId}`]: 1 };
    }

    this.conversationModel
      .findByIdAndUpdate(conversationId, updateOps)
      .catch((err) => {
        console.error("[DirectChat] Background update conversation error:", err);
      });

    // 5. Khởi tạo đối tượng populatedMsg trực tiếp từ dữ liệu bộ nhớ (không cần query lại database)
    const populatedMsg: any = {
      _id: createdMsg._id,
      id: createdMsg._id.toString(),
      conversationId: createdMsg.conversationId.toString(),
      senderId: currentUserId,
      type: createdMsg.type,
      content: createdMsg.content,
      attachments: createdMsg.attachments || [],
      reactions: [],
      replyToId: replyMsg
        ? {
            _id: replyMsg._id.toString(),
            id: replyMsg._id.toString(),
            content: replyMsg.content,
            senderId: replyMsg.senderId,
            type: replyMsg.type,
            attachments: replyMsg.attachments || [],
            deletedAt: replyMsg.deletedAt,
          }
        : null,
      sender: sender || {
        supabaseId: currentUserId,
        displayName: "Người dùng",
        avatarUrl: null,
      },
      createdAt: createdMsg.createdAt
        ? createdMsg.createdAt.toISOString()
        : new Date().toISOString(),
      updatedAt: createdMsg.updatedAt
        ? createdMsg.updatedAt.toISOString()
        : new Date().toISOString(),
    };

    // 6. Phát sự kiện Socket realtime ngay lập tức
    try {
      if (this.appGateway?.server) {
        this.appGateway.server
          .to(`chat_${conversationId}`)
          .emit("chat:new_message", populatedMsg);
        console.log(`[DirectChat] Emitted chat:new_message to chat_${conversationId}`);
        if (otherParticipantId) {
          this.appGateway.server
            .to(`user_${otherParticipantId}`)
            .emit("chat:conversation_updated", {
              conversationId,
              previewText,
            });
          console.log(
            `[DirectChat] Emitted chat:conversation_updated to user_${otherParticipantId}`,
          );
        }
      } else {
        console.warn(
          "[DirectChat] appGateway.server is not initialized during sendMessage!",
        );
      }
    } catch (socketErr) {
      console.error("[DirectChat] Socket emit error:", socketErr);
    }

    return populatedMsg;
  }

  /**
   * Đánh dấu cuộc trò chuyện đã đọc
   */
  async markAsRead(conversationId: string, currentUserId: string) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new BadRequestException("Mã cuộc trò chuyện không hợp lệ");
    }

    await this.conversationModel.findByIdAndUpdate(conversationId, {
      $set: { [`unreadCounts.${currentUserId}`]: 0 },
    });

    try {
      if (this.appGateway?.server) {
        this.appGateway.server.to(`chat_${conversationId}`).emit("chat:read_updated", {
          conversationId,
          readerId: currentUserId,
        });
      }
    } catch (socketErr) {
      console.error("[DirectChat] Socket emit read error:", socketErr);
    }

    return { success: true };
  }

  /**
   * Thả cảm xúc (reaction) vào tin nhắn
   */
  async reactMessage(messageId: string, currentUserId: string, emoji: string) {
    if (!Types.ObjectId.isValid(messageId)) {
      throw new BadRequestException("Mã tin nhắn không hợp lệ");
    }
    if (!emoji || typeof emoji !== "string") {
      throw new BadRequestException("Emoji không hợp lệ");
    }

    const message = await this.messageModel.findById(messageId);
    if (!message) {
      throw new NotFoundException("Không tìm thấy tin nhắn");
    }
    if (message.deletedAt) {
      throw new BadRequestException("Không thể tương tác với tin nhắn đã xóa");
    }

    // 1. Gỡ bỏ user khỏi tất cả các reaction hiện tại trên tin nhắn này
    const reactions = (message.reactions || []).map((r) => ({
      emoji: r.emoji,
      userIds: [...(r.userIds || [])],
    }));

    let wasSameEmoji = false;
    for (let i = reactions.length - 1; i >= 0; i--) {
      const r = reactions[i];
      const uIdx = r.userIds.indexOf(currentUserId);
      if (uIdx > -1) {
        if (r.emoji === emoji) {
          wasSameEmoji = true;
        }
        r.userIds.splice(uIdx, 1);
        if (r.userIds.length === 0) {
          reactions.splice(i, 1);
        }
      }
    }

    // 2. Nếu không phải click lại chính emoji đó (toggle-off), thêm user vào emoji mới
    if (!wasSameEmoji) {
      const targetIndex = reactions.findIndex((r) => r.emoji === emoji);
      if (targetIndex > -1) {
        reactions[targetIndex].userIds.push(currentUserId);
      } else {
        reactions.push({ emoji, userIds: [currentUserId] });
      }
    }

    // 3. Lọc bỏ hoàn toàn các emoji không còn ai thả
    const cleanReactions = reactions.filter((r) => r.userIds && r.userIds.length > 0);
    message.reactions = cleanReactions as any;
    await message.save();

    const conversationId = message.conversationId.toString();
    try {
      if (this.appGateway?.server) {
        this.appGateway.server.to(`chat_${conversationId}`).emit("chat:reaction_updated", {
          messageId,
          reactions: cleanReactions,
        });
      }
    } catch (socketErr) {
      console.error("[DirectChat] Socket emit reaction error:", socketErr);
    }

    return { messageId, reactions: cleanReactions };
  }

  /**
   * Lấy danh sách người đã reaction vào tin nhắn
   */
  async getMessageReactions(messageId: string, currentUserId: string) {
    if (!Types.ObjectId.isValid(messageId)) {
      throw new BadRequestException("Mã tin nhắn không hợp lệ");
    }

    const message = await this.messageModel.findById(messageId);
    if (!message) {
      throw new NotFoundException("Không tìm thấy tin nhắn");
    }

    // Kiểm tra quyền: currentUserId phải là thành viên trong cuộc trò chuyện
    const conversation = await this.conversationModel.findById(message.conversationId);
    if (!conversation) {
      throw new NotFoundException("Không tìm thấy cuộc trò chuyện");
    }
    if (!conversation.participantIds?.includes(currentUserId)) {
      throw new ForbiddenException("Bạn không có quyền xem thông tin tin nhắn này");
    }

    const reactions = message.reactions || [];
    const allUserIds = new Set<string>();
    reactions.forEach((r) => {
      (r.userIds || []).forEach((uid) => allUserIds.add(uid));
    });

    if (allUserIds.size === 0) {
      return [];
    }

    const users = await this.userModel
      .find({ supabaseId: { $in: Array.from(allUserIds) } })
      .select("supabaseId displayName avatarUrl email")
      .lean();

    const userMap = new Map<string, any>(users.map((u) => [u.supabaseId, u]));

    const result: Array<{
      userId: string;
      reaction: string;
      user: {
        supabaseId: string;
        displayName: string;
        avatarUrl?: string;
      };
    }> = [];

    reactions.forEach((r) => {
      (r.userIds || []).forEach((uid) => {
        const u = userMap.get(uid);
        result.push({
          userId: uid,
          reaction: r.emoji,
          user: {
            supabaseId: uid,
            displayName: u?.displayName || "Người dùng",
            avatarUrl: u?.avatarUrl || "",
          },
        });
      });
    });

    return result;
  }

  /**
   * Thu hồi / Xóa tin nhắn (soft delete)
   */
  async deleteMessage(messageId: string, currentUserId: string) {
    if (!Types.ObjectId.isValid(messageId)) {
      throw new BadRequestException("Mã tin nhắn không hợp lệ");
    }

    const message = await this.messageModel.findById(messageId);
    if (!message) {
      throw new NotFoundException("Không tìm thấy tin nhắn");
    }

    if (message.senderId !== currentUserId) {
      throw new ForbiddenException("Chỉ người gửi mới có quyền thu hồi tin nhắn này");
    }

    const conversationId = message.conversationId.toString();

    // Nếu tin nhắn đang được ghim, tự động gỡ bỏ khỏi danh sách ghim
    const wasPinned = Boolean(message.isPinned);
    if (wasPinned) {
      message.isPinned = false;
      message.pinnedBy = null;
      message.pinnedAt = null;
      await this.conversationModel.findByIdAndUpdate(conversationId, {
        $pull: { pinnedMessages: { messageId: new Types.ObjectId(messageId) } },
      });
    }

    message.deletedAt = new Date();
    message.content = "Tin nhắn đã bị thu hồi";
    message.attachments = [];
    await message.save();

    let updatedPinnedMessages: any[] = [];
    if (wasPinned) {
      updatedPinnedMessages = await this.getPinnedMessagesDetail(conversationId);
    }

    try {
      if (this.appGateway?.server) {
        this.appGateway.server.to(`chat_${conversationId}`).emit("chat:message_deleted", {
          messageId,
          conversationId,
          wasPinned,
          pinnedMessages: updatedPinnedMessages,
        });
        console.log(`[DirectChat] Emitted chat:message_deleted to chat_${conversationId} for message ${messageId}`);
      } else {
        console.warn("[DirectChat] appGateway.server is not initialized during deleteMessage!");
      }
    } catch (socketErr) {
      console.error("[DirectChat] Socket emit delete error:", socketErr);
    }

    return { messageId, deletedAt: message.deletedAt, wasPinned };
  }

  /**
   * Lấy chi tiết các tin nhắn đã ghim trong một cuộc trò chuyện
   */
  async getPinnedMessagesDetail(conversationId: string) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new BadRequestException("Mã cuộc trò chuyện không hợp lệ");
    }

    const conversation = await this.conversationModel
      .findById(conversationId)
      .lean();

    if (!conversation) {
      throw new NotFoundException("Không tìm thấy cuộc trò chuyện");
    }

    const pinnedItems = conversation.pinnedMessages || [];
    if (pinnedItems.length === 0) {
      return [];
    }

    const messageIds = pinnedItems.map((p) => p.messageId);
    const messages = await this.messageModel
      .find({
        _id: { $in: messageIds },
        conversationId: new Types.ObjectId(conversationId),
        deletedAt: null, // Không lấy tin đã thu hồi
      })
      .populate({
        path: "replyToId",
        select: "_id content senderId type attachments deletedAt",
      })
      .lean();

    // Lấy thông tin senders và pinners
    const userIds = new Set<string>();
    messages.forEach((m) => userIds.add(m.senderId));
    pinnedItems.forEach((p) => userIds.add(p.pinnedBy));

    const users = await this.userModel
      .find({ supabaseId: { $in: Array.from(userIds) } })
      .select("supabaseId displayName avatarUrl email")
      .lean();

    const userMap = new Map<string, any>(users.map((u) => [u.supabaseId, u]));
    const msgMap = new Map<string, any>(messages.map((m) => [m._id.toString(), m]));

    // Sắp xếp theo đúng thứ tự pinnedItems (thứ tự được ghim)
    const result: any[] = [];
    for (const item of pinnedItems) {
      const msg = msgMap.get(item.messageId.toString());
      if (msg) {
        result.push({
          ...msg,
          id: msg._id.toString(),
          isPinned: true,
          pinnedBy: item.pinnedBy,
          pinnedAt: item.pinnedAt,
          pinner: userMap.get(item.pinnedBy) || {
            supabaseId: item.pinnedBy,
            displayName: "Người dùng",
            avatarUrl: null,
          },
          sender: userMap.get(msg.senderId) || {
            supabaseId: msg.senderId,
            displayName: "Người dùng",
            avatarUrl: null,
          },
        });
      }
    }

    return result;
  }

  /**
   * Lấy danh sách tin nhắn đã ghim (cho client gọi qua Controller)
   */
  async getPinnedMessages(conversationId: string, currentUserId: string) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new BadRequestException("Mã cuộc trò chuyện không hợp lệ");
    }

    const conversation = await this.conversationModel.findById(conversationId).lean();
    if (!conversation) {
      throw new NotFoundException("Không tìm thấy cuộc trò chuyện");
    }

    if (!conversation.participantIds.includes(currentUserId)) {
      throw new ForbiddenException("Bạn không có quyền truy cập cuộc trò chuyện này");
    }

    return this.getPinnedMessagesDetail(conversationId);
  }

  /**
   * Ghim tin nhắn (Tối đa 3 tin trên toàn bộ cuộc trò chuyện, bảo đảm chống race condition)
   */
  async pinMessage(messageId: string, currentUserId: string) {
    if (!Types.ObjectId.isValid(messageId)) {
      throw new BadRequestException("Mã tin nhắn không hợp lệ");
    }

    const message = await this.messageModel.findById(messageId);
    if (!message) {
      throw new NotFoundException("Không tìm thấy tin nhắn");
    }

    if (message.deletedAt) {
      throw new BadRequestException("Không thể ghim tin nhắn đã bị thu hồi");
    }

    const conversationId = message.conversationId.toString();
    const conversation = await this.conversationModel.findById(conversationId);
    if (!conversation) {
      throw new NotFoundException("Không tìm thấy cuộc trò chuyện");
    }

    if (!conversation.participantIds.includes(currentUserId)) {
      throw new ForbiddenException("Bạn không có quyền thao tác trên cuộc trò chuyện này");
    }

    // 1. Kiểm tra xem tin nhắn đã được ghim chưa
    const alreadyPinned = conversation.pinnedMessages?.some(
      (p) => p.messageId.toString() === messageId,
    );
    if (alreadyPinned) {
      // Đồng bộ lại isPinned: true trên message document nếu bị lệch
      await this.messageModel.findByIdAndUpdate(messageId, {
        isPinned: true,
        pinnedBy: currentUserId,
        pinnedAt: new Date(),
      });
      throw new BadRequestException("Tin nhắn này đã được ghim");
    }

    // 2. Kiểm tra giới hạn 3 tin nhắn
    if ((conversation.pinnedMessages?.length || 0) >= 3) {
      throw new BadRequestException(
        "Cuộc trò chuyện chỉ được ghim tối đa 3 tin nhắn. Vui lòng bỏ ghim một tin nhắn trước khi ghim tin mới.",
      );
    }

    const pinnedAtDate = new Date();

    // 3. Thực hiện Atomic Update: kiểm tra cả kích thước mảng < 3 và không tồn tại messageId
    const updatedConv = await this.conversationModel.findOneAndUpdate(
      {
        _id: conversation._id,
        "pinnedMessages.messageId": { $ne: new Types.ObjectId(messageId) },
        $expr: { $lt: [{ $size: { $ifNull: ["$pinnedMessages", []] } }, 3] },
      },
      {
        $push: {
          pinnedMessages: {
            messageId: new Types.ObjectId(messageId),
            pinnedBy: currentUserId,
            pinnedAt: pinnedAtDate,
          },
        },
      },
      { new: true },
    );

    if (!updatedConv) {
      // Race condition: kiểm tra lại
      const recheckedConv = await this.conversationModel.findById(conversationId).lean();
      if ((recheckedConv?.pinnedMessages?.length || 0) >= 3) {
        throw new BadRequestException(
          "Cuộc trò chuyện chỉ được ghim tối đa 3 tin nhắn. Vui lòng bỏ ghim một tin nhắn trước khi ghim tin mới.",
        );
      }
      throw new BadRequestException("Tin nhắn này đã được ghim");
    }

    // 4. Cập nhật trạng thái trên document DirectMessage (dùng findByIdAndUpdate tránh trigger hook validation khác)
    await this.messageModel.findByIdAndUpdate(messageId, {
      isPinned: true,
      pinnedBy: currentUserId,
      pinnedAt: pinnedAtDate,
    });

    // 5. Lấy danh sách chi tiết các tin ghim đã cập nhật
    const detailedPinnedList = await this.getPinnedMessagesDetail(conversationId);

    // 6. Format tin nhắn vừa ghim
    const sender = await this.userModel
      .findOne({ supabaseId: message.senderId })
      .select("supabaseId displayName avatarUrl email")
      .lean();

    const populatedMsg: any = await this.messageModel
      .findById(message._id)
      .populate({
        path: "replyToId",
        select: "_id content senderId type attachments deletedAt",
      })
      .lean();

    populatedMsg.id = populatedMsg._id.toString();
    populatedMsg.isPinned = true;
    populatedMsg.pinnedBy = currentUserId;
    populatedMsg.pinnedAt = pinnedAtDate;
    populatedMsg.sender = sender || {
      supabaseId: message.senderId,
      displayName: "Người dùng",
      avatarUrl: null,
    };

    // 7. Emit Socket.io realtime event
    try {
      if (this.appGateway?.server) {
        this.appGateway.server.to(`chat_${conversationId}`).emit("chat:message_pinned", {
          conversationId,
          message: populatedMsg,
          pinnedMessages: detailedPinnedList,
        });
        console.log(`[DirectChat] Emitted chat:message_pinned to chat_${conversationId}`);
      }
    } catch (socketErr) {
      console.error("[DirectChat] Socket emit message_pinned error:", socketErr);
    }

    return {
      success: true,
      message: populatedMsg,
      pinnedMessages: detailedPinnedList,
    };
  }

  /**
   * Bỏ ghim tin nhắn
   */
  async unpinMessage(messageId: string, currentUserId: string) {
    if (!Types.ObjectId.isValid(messageId)) {
      throw new BadRequestException("Mã tin nhắn không hợp lệ");
    }

    const message = await this.messageModel.findById(messageId);
    if (!message) {
      throw new NotFoundException("Không tìm thấy tin nhắn");
    }

    const conversationId = message.conversationId.toString();
    const conversation = await this.conversationModel.findById(conversationId);
    if (!conversation) {
      throw new NotFoundException("Không tìm thấy cuộc trò chuyện");
    }

    if (!conversation.participantIds.includes(currentUserId)) {
      throw new ForbiddenException("Bạn không có quyền thao tác trên cuộc trò chuyện này");
    }

    // 1. Gỡ tin khỏi conversation.pinnedMessages
    await this.conversationModel.findByIdAndUpdate(conversationId, {
      $pull: { pinnedMessages: { messageId: new Types.ObjectId(messageId) } },
    });

    // 2. Cập nhật document DirectMessage (dùng findByIdAndUpdate tránh trigger hook validation khác)
    await this.messageModel.findByIdAndUpdate(messageId, {
      isPinned: false,
      pinnedBy: null,
      pinnedAt: null,
    });

    // 3. Lấy danh sách chi tiết các tin ghim còn lại
    const detailedPinnedList = await this.getPinnedMessagesDetail(conversationId);

    // 4. Emit Socket.io realtime event
    try {
      if (this.appGateway?.server) {
        this.appGateway.server.to(`chat_${conversationId}`).emit("chat:message_unpinned", {
          conversationId,
          messageId,
          pinnedMessages: detailedPinnedList,
        });
        console.log(`[DirectChat] Emitted chat:message_unpinned to chat_${conversationId}`);
      }
    } catch (socketErr) {
      console.error("[DirectChat] Socket emit message_unpinned error:", socketErr);
    }

    return {
      success: true,
      messageId,
      pinnedMessages: detailedPinnedList,
    };
  }

  /**
   * Tạo Signed Upload URL cho ảnh, video hoặc tệp tài liệu trong chat
   */
  async getChatUploadUrl(
    conversationId: string,
    currentUserId: string,
    dto: GetChatUploadUrlDto,
  ) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new BadRequestException("Mã cuộc trò chuyện không hợp lệ");
    }

    const conversation = await this.conversationModel.findById(conversationId).lean();
    if (!conversation || !conversation.participantIds.includes(currentUserId)) {
      throw new ForbiddenException("Bạn không thuộc cuộc trò chuyện này");
    }

    const bucketName = "chat-attachments";
    await this.ensureBucketExists(bucketName);

    // Giới hạn dung lượng: Video <= 50MB, File/Image <= 10MB
    const isVideo = dto.mimeType?.startsWith("video/") || false;
    const maxLimit = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;

    if (dto.fileSize > maxLimit) {
      const limitMb = isVideo ? "50MB" : "10MB";
      throw new BadRequestException(`Dung lượng tệp vượt quá giới hạn cho phép (${limitMb})`);
    }

    const ext = path.extname(dto.fileName).toLowerCase() || "";
    const uniqueName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
    const filePath = `conversations/${conversationId}/${uniqueName}`;

    const { data, error } = await this.supabaseService.admin.storage
      .from(bucketName)
      .createSignedUploadUrl(filePath);

    if (error) {
      throw new BadRequestException(`Không thể tạo signed upload URL: ${error.message}`);
    }

    const { data: publicUrlData } = this.supabaseService.admin.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    let fileType: "image" | "video" | "file" = "file";
    if (dto.mimeType?.startsWith("image/")) {
      fileType = "image";
    } else if (dto.mimeType?.startsWith("video/")) {
      fileType = "video";
    }

    return {
      signedUrl: data.signedUrl,
      url: publicUrlData.publicUrl,
      fileName: dto.fileName,
      fileType,
      fileSize: dto.fileSize,
      mimeType: dto.mimeType,
    };
  }

  /**
   * Helper format dữ liệu conversation trả về cho client
   */
  private formatConversation(
    conv: any,
    currentUserId: string,
    otherUsers: any[],
  ) {
    const recipientId = conv.participantIds.find((id: string) => id !== currentUserId);
    const recipient = otherUsers.find((u) => u.supabaseId === recipientId) || {
      supabaseId: recipientId,
      displayName: "Người dùng",
      avatarUrl: null,
      email: "",
      status: "ACTIVE",
    };

    let unreadCount = 0;
    if (conv.unreadCounts) {
      if (conv.unreadCounts instanceof Map) {
        unreadCount = conv.unreadCounts.get(currentUserId) || 0;
      } else {
        unreadCount = (conv.unreadCounts as any)[currentUserId] || 0;
      }
    }

    return {
      id: conv._id.toString(),
      participantIds: conv.participantIds,
      recipient,
      lastMessageAt: conv.lastMessageAt,
      lastMessagePreview: conv.lastMessagePreview,
      unreadCount,
      pinnedCount: conv.pinnedMessages?.length || 0,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    };
  }
}

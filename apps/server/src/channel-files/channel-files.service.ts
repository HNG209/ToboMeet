import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import * as path from "path";
import * as crypto from "crypto";
import { Room, RoomDocument } from "../rooms/schemas/room.schema";
import { User, UserDocument } from "../users/schemas/user.schema";
import { ChannelFile, ChannelFileDocument } from "./schemas/channel-file.schema";
import { UserPinnedFile, UserPinnedFileDocument } from "./schemas/user-pinned-file.schema";
import { SupabaseService } from "../supabase/supabase.service";
import { RoomsGateway } from "../rooms/rooms.gateway";
import { CreateFileMetaDto } from "./dto/channel-files.dto";
import type * as archiver from "archiver";
import { normalizeRole } from "../rooms/helpers/room-role.helper";

@Injectable()
export class ChannelFilesService {
  private readonly bucketName = "channel-files";

  constructor(
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(ChannelFile.name)
    private readonly fileModel: Model<ChannelFileDocument>,
    @InjectModel(UserPinnedFile.name)
    private readonly userPinnedFileModel: Model<UserPinnedFileDocument>,
    private readonly supabaseService: SupabaseService,
    private readonly roomsGateway: RoomsGateway,
  ) {}

  private async ensureBucketExists() {
    try {
      const { data: buckets, error: listError } =
        await this.supabaseService.admin.storage.listBuckets();
      if (listError) throw listError;
      const exists = buckets.some((b) => b.name === this.bucketName);
      if (!exists) {
        const { error: createError } =
          await this.supabaseService.admin.storage.createBucket(
            this.bucketName,
            {
              public: true,
              fileSizeLimit: 50 * 1024 * 1024, // 50MB
            },
          );
        if (createError) throw createError;
      }
    } catch (err) {
      console.error(`Failed to ensure bucket "${this.bucketName}" exists:`, err);
    }
  }

  /**
   * Kiểm tra user có thuộc room & channel (bao gồm Private Channel check)
   */
  private async assertChannelAccess(
    userId: string,
    roomId: string,
    channelId: string,
  ): Promise<RoomDocument> {
    const room = await this.roomModel.findOne({
      _id: roomId,
      isDeleted: { $ne: true },
    });
    if (!room) {
      throw new NotFoundException("Phòng không tồn tại");
    }

    // Check room membership
    const isOwner = room.ownerId === userId;
    const roomMember = room.members?.find(
      (m) =>
        m.userId === userId &&
        m.status !== "removed" &&
        m.status !== "left",
    );

    if (!isOwner && !roomMember) {
      throw new ForbiddenException({
        success: false,
        message: "Bạn không phải là thành viên của phòng này.",
      });
    }

    // Check channel existence
    const channel = room.channels?.find(
      (c) => c._id?.toString() === channelId,
    );
    if (!channel) {
      throw new NotFoundException("Kênh không tồn tại");
    }

    // Private channel check
    if (channel.isPrivate && !isOwner) {
      const isChannelMember = channel.members?.some(
        (m) => m.userId === userId,
      );
      if (!isChannelMember) {
        throw new ForbiddenException({
          success: false,
          message: "Bạn không có quyền truy cập kênh riêng tư này.",
        });
      }
    }

    return room;
  }

  /**
   * Kiểm tra quyền quản lý file (Owner hoặc Admin/Phó nhóm)
   */
  private assertCanManageFiles(room: RoomDocument, channelId: string, userId: string): void {
    if (room.ownerId === userId) return;

    // 1. Kiểm tra vai trò cấp phòng (Room level)
    const member = room.members?.find(
      (m) =>
        m.userId === userId &&
        m.status !== "removed" &&
        m.status !== "left",
    );

    const isRoomAdmin = member && ["owner", "admin"].includes(normalizeRole(member.role));

    // 2. Kiểm tra vai trò cấp kênh (Channel level)
    const channel = room.channels?.find((c) => c._id?.toString() === channelId);
    const channelMember = channel?.members?.find((m) => m.userId === userId);
    const isChannelAdmin = channelMember && normalizeRole(channelMember.role) === "admin";

    // Cho phép nếu là room admin HOẶC (kênh công khai và là channel admin)
    const isAllowed = isRoomAdmin || (channel?.isPrivate !== true && isChannelAdmin);

    if (!isAllowed) {
      throw new ForbiddenException({
        success: false,
        message: "You do not have permission to upload files.",
      });
    }
  }

  /**
   * Tạo Signed Upload URL (Owner / Admin)
   */
  async createSignedUploadUrl(
    userId: string,
    roomId: string,
    channelId: string,
    originalFileName: string,
  ) {
    const room = await this.assertChannelAccess(userId, roomId, channelId);
    this.assertCanManageFiles(room, channelId, userId);

    await this.ensureBucketExists();

    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const uuid = crypto.randomUUID();
    const timestamp = Date.now();
    const ext = path.extname(originalFileName).toLowerCase();
    const uniqueFileName = `${uuid}-${timestamp}${ext}`;
    const filePath = `${roomId}/${channelId}/${year}/${month}/${uniqueFileName}`;

    const { data, error } = await this.supabaseService.admin.storage
      .from(this.bucketName)
      .createSignedUploadUrl(filePath);

    if (error) {
      throw new BadRequestException(
        `Không thể tạo signed upload URL: ${error.message}`,
      );
    }

    const { data: publicUrlData } = this.supabaseService.admin.storage
      .from(this.bucketName)
      .getPublicUrl(filePath);

    return {
      signedUrl: data.signedUrl,
      publicUrl: publicUrlData.publicUrl,
      storagePath: filePath,
    };
  }

  /**
   * Lưu Metadata của File sau khi upload thành công (Owner / Admin)
   */
  async saveFileMeta(userId: string, dto: CreateFileMetaDto) {
    const room = await this.assertChannelAccess(
      userId,
      dto.roomId,
      dto.channelId,
    );
    this.assertCanManageFiles(room, dto.channelId, userId);

    // Fetch user info for cache
    const user = await this.userModel
      .findOne({ supabaseId: userId })
      .lean()
      .exec();

    const newFile = await this.fileModel.create({
      roomId: dto.roomId,
      channelId: dto.channelId,
      uploadedBy: userId,
      uploadedByName: user?.displayName || user?.email || "Thành viên",
      fileName: dto.fileName,
      storagePath: dto.storagePath || "",
      publicUrl: dto.publicUrl || "",
      mimeType: dto.mimeType || (dto.isFolder ? "directory" : "application/octet-stream"),
      fileSize: dto.fileSize || 0,
      isFolder: dto.isFolder || false,
      parentFolderId: dto.parentFolderId || null,
      isDeleted: false,
    });

    const result = newFile.toObject();

    // Emit Realtime socket event to all room members
    this.roomsGateway.notifyFileUploaded(dto.roomId, dto.channelId, result);

    return result;
  }

  /**
   * Lấy danh sách file trong kênh (Mọi thành viên trong Kênh)
   */
  async getChannelFiles(userId: string, roomId: string, channelId: string) {
    await this.assertChannelAccess(userId, roomId, channelId);

    const files = await this.fileModel
      .find({
        roomId,
        channelId,
        isDeleted: { $ne: true },
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    // Lấy danh sách các tệp/thư mục được ghim của người dùng hiện tại trong kênh này
    const pins = await this.userPinnedFileModel
      .find({ userId, channelId })
      .lean()
      .exec();

    const pinMap = new Map<string, Date>();
    for (const pin of pins) {
      pinMap.set(pin.fileId.toString(), (pin as unknown as { createdAt: Date }).createdAt);
    }

    return files.map((file) => {
      const isPinned = pinMap.has(file._id.toString());
      return {
        ...file,
        isPinned,
        pinnedAt: isPinned ? pinMap.get(file._id.toString()) : undefined,
      };
    });
  }

  /**
   * Đổi tên file (Owner / Admin)
   */
  async renameFile(userId: string, fileId: string, newName: string) {
    const file = await this.fileModel.findById(fileId);
    if (!file || file.isDeleted) {
      throw new NotFoundException("Tệp không tồn tại");
    }

    const room = await this.assertChannelAccess(
      userId,
      file.roomId,
      file.channelId,
    );
    this.assertCanManageFiles(room, file.channelId, userId);

    file.fileName = newName.trim();
    await file.save();

    // Socket notification
    this.roomsGateway.notifyFileRenamed(
      file.roomId,
      file.channelId,
      fileId,
      file.fileName,
    );

    return file.toObject();
  }

  /**
   * Xóa file (Owner / Admin)
   */
  async deleteFile(userId: string, fileId: string) {
    const file = await this.fileModel.findById(fileId);
    if (!file || file.isDeleted) {
      throw new NotFoundException("Tệp không tồn tại");
    }

    const room = await this.assertChannelAccess(
      userId,
      file.roomId,
      file.channelId,
    );
    this.assertCanManageFiles(room, file.channelId, userId);

    await this.recursivelyDelete(file);

    return { success: true };
  }

  private async recursivelyDelete(file: ChannelFileDocument) {
    file.isDeleted = true;
    await file.save();

    if (!file.isFolder) {
      if (file.storagePath) {
        try {
          await this.supabaseService.admin.storage
            .from(this.bucketName)
            .remove([file.storagePath]);
        } catch (err) {
          console.error(`Failed to remove file from Supabase storage:`, err);
        }
      }
    } else {
      const children = await this.fileModel.find({
        parentFolderId: file._id.toString(),
        isDeleted: { $ne: true },
      });
      for (const child of children) {
        await this.recursivelyDelete(child);
      }
    }

    // Tự động xóa trạng thái ghim của tệp này (nếu có)
    await this.userPinnedFileModel.deleteMany({ fileId: file._id });

    this.roomsGateway.notifyFileDeleted(file.roomId, file.channelId, file._id.toString());
  }

  /**
   * Sinh Signed Download URL hết hạn trong 60 giây (Thành viên có quyền xem kênh)
   */
  async getDownloadUrl(userId: string, fileId: string, download?: boolean) {
    const file = await this.fileModel.findById(fileId);
    if (!file || file.isDeleted) {
      throw new NotFoundException("Tệp không tồn tại");
    }

    await this.assertChannelAccess(userId, file.roomId, file.channelId);

    let downloadName = file.fileName;
    if (download) {
      if (file.storagePath) {
        const ext = path.extname(file.storagePath); // e.g. ".png"
        if (ext && !downloadName.toLowerCase().endsWith(ext.toLowerCase())) {
          downloadName = `${downloadName}${ext}`;
        }
      }
    }

    const options = download ? { download: downloadName } : undefined;

    const { data, error } = await this.supabaseService.admin.storage
      .from(this.bucketName)
      .createSignedUrl(file.storagePath, 60, options);

    if (error || !data) {
      throw new BadRequestException("Không thể tạo liên kết tải xuống.");
    }

    return { downloadUrl: data.signedUrl, fileName: downloadName };
  }

  /**
   * Lấy thông tin thư mục và kiểm tra quyền truy cập tải xuống
   */
  async getFolderForDownload(userId: string, folderId: string) {
    const folder = await this.fileModel.findById(folderId);
    if (!folder || folder.isDeleted || !folder.isFolder) {
      throw new NotFoundException("Thư mục không tồn tại");
    }
    await this.assertChannelAccess(userId, folder.roomId, folder.channelId);
    return folder;
  }

  /**
   * Đóng gói đệ quy toàn bộ thư mục/file con vào archive (ZIP)
   */
  async archiveFolderContents(
    userId: string,
    folderId: string,
    currentPath: string,
    archive: archiver.Archiver,
  ) {
    const items = await this.fileModel.find({
      parentFolderId: folderId,
      isDeleted: { $ne: true },
    }).lean().exec();

    if (items.length === 0) {
      // Thư mục rỗng
      archive.append("", { name: currentPath });
      return;
    }

    for (const item of items) {
      const itemPath = `${currentPath}${item.fileName}`;
      if (item.isFolder) {
        await this.archiveFolderContents(userId, item._id.toString(), `${itemPath}/`, archive);
      } else {
        if (!item.storagePath) continue;
        try {
          const { data, error } = await this.supabaseService.admin.storage
            .from(this.bucketName)
            .download(item.storagePath);
          if (error || !data) {
            console.error(`Failed to download file ${item.fileName} from Supabase:`, error);
            continue;
          }
          const buffer = Buffer.from(await data.arrayBuffer());
          archive.append(buffer, { name: itemPath });
        } catch (err) {
          console.error(`Error downloading file ${item.fileName}:`, err);
        }
      }
    }
  }

  /**
   * Ghim tệp hoặc thư mục (Tối đa 3 mục mỗi người dùng trên mỗi kênh)
   */
  async pinFile(userId: string, fileId: string) {
    const file = await this.fileModel.findById(fileId);
    if (!file || file.isDeleted) {
      throw new NotFoundException("Tệp không tồn tại");
    }

    await this.assertChannelAccess(userId, file.roomId, file.channelId);

    // Kiểm tra xem đã ghim tệp này chưa
    const existingPin = await this.userPinnedFileModel.findOne({
      userId,
      fileId: file._id,
    });
    if (existingPin) {
      return { success: true };
    }

    // Lấy tất cả pinned files của user trong kênh này để kiểm tra và đếm các tệp thực sự còn hoạt động
    const pins = await this.userPinnedFileModel.find({
      userId,
      channelId: file.channelId,
    });

    let activePinCount = 0;
    for (const pin of pins) {
      const targetFile = await this.fileModel.findById(pin.fileId);
      if (targetFile && !targetFile.isDeleted) {
        activePinCount++;
      } else {
        // Tự động dọn dẹp bản ghi ghim mồ côi/rác của tệp đã bị xóa hoặc không tồn tại
        await this.userPinnedFileModel.deleteOne({ _id: pin._id });
      }
    }

    if (activePinCount >= 3) {
      throw new BadRequestException("Bạn chỉ có thể ghim tối đa 3 tệp hoặc thư mục.");
    }

    // Tạo bản ghi ghim
    await this.userPinnedFileModel.create({
      userId,
      fileId: file._id,
      roomId: file.roomId,
      channelId: file.channelId,
    });

    // Kích hoạt notify socket realtime
    this.roomsGateway.notifyFilePinned(
      file.roomId,
      file.channelId,
      file._id.toString(),
      userId,
    );

    return { success: true };
  }

  /**
   * Bỏ ghim tệp hoặc thư mục
   */
  async unpinFile(userId: string, fileId: string) {
    const file = await this.fileModel.findById(fileId);
    if (!file || file.isDeleted) {
      throw new NotFoundException("Tệp không tồn tại");
    }

    await this.assertChannelAccess(userId, file.roomId, file.channelId);

    await this.userPinnedFileModel.deleteOne({
      userId,
      fileId: file._id,
    });

    // Kích hoạt notify socket realtime
    this.roomsGateway.notifyFileUnpinned(
      file.roomId,
      file.channelId,
      file._id.toString(),
      userId,
    );

    return { success: true };
  }
}

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  Req,
  BadRequestException,
  Res,
} from "@nestjs/common";
import { Request, Response } from "express";
import type * as archiver from "archiver";
import { ThrottlerGuard, Throttle } from "nestjs-advanced-rate-limiter";
import { SupabaseGuard } from "../core/guards/supabase.guard";
import { ChannelFilesService } from "./channel-files.service";
import {
  SignedUrlRequestDto,
  CreateFileMetaDto,
  RenameFileDto,
} from "./dto/channel-files.dto";

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
  };
}

@Controller("channel-files")
@UseGuards(SupabaseGuard)
export class ChannelFilesController {
  constructor(private readonly filesService: ChannelFilesService) {}

  @Post("signed-url")
  @UseGuards(ThrottlerGuard)
  @Throttle({ algorithm: "token-bucket", capacity: 20, refillRate: 2 })
  async createSignedUploadUrl(
    @Body() dto: SignedUrlRequestDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id;
    return this.filesService.createSignedUploadUrl(
      userId,
      dto.roomId,
      dto.channelId,
      dto.fileName,
    );
  }

  @Post()
  async saveFileMeta(
    @Body() dto: CreateFileMetaDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id;
    return this.filesService.saveFileMeta(userId, dto);
  }

  @Get()
  async getChannelFiles(
    @Query("roomId") roomId: string,
    @Query("channelId") channelId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!roomId || !channelId) {
      throw new BadRequestException("roomId và channelId là bắt buộc");
    }
    const userId = req.user.id;
    return this.filesService.getChannelFiles(userId, roomId, channelId);
  }

  @Patch(":id/rename")
  async renameFile(
    @Param("id") fileId: string,
    @Body() dto: RenameFileDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!dto.newName || !dto.newName.trim()) {
      throw new BadRequestException("Tên mới không được để trống");
    }
    const userId = req.user.id;
    return this.filesService.renameFile(userId, fileId, dto.newName);
  }

  @Delete(":id")
  async deleteFile(
    @Param("id") fileId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id;
    return this.filesService.deleteFile(userId, fileId);
  }

  @Get(":id/download-url")
  async getDownloadUrl(
    @Param("id") fileId: string,
    @Req() req: AuthenticatedRequest,
    @Query("download") download?: string,
  ) {
    const userId = req.user.id;
    const isDownload = download === "true";
    return this.filesService.getDownloadUrl(userId, fileId, isDownload);
  }

  @Get(":id/download-folder")
  async downloadFolder(
    @Param("id") folderId: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const userId = req.user.id;
    const folder = await this.filesService.getFolderForDownload(userId, folderId);

    // Set headers for file download
    res.setHeader("Content-Type", "application/zip");
    
    // Support UTF-8 filenames in header
    const safeFilename = encodeURIComponent(folder.fileName);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFilename}.zip"; filename*=UTF-8''${safeFilename}.zip`
    );

    const { ZipArchive } = await (eval('import("archiver")') as Promise<{
      ZipArchive: new (options?: unknown) => archiver.Archiver;
    }>);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    archive.on("error", (err: Error) => {
      console.error("Archive error:", err);
      if (!res.headersSent) {
        res.status(500).send("Không thể tải xuống thư mục. Vui lòng thử lại.");
      }
    });

    // Pipe archive output stream to HTTP response
    archive.pipe(res);

    // Recursively append contents starting with directory prefix
    await this.filesService.archiveFolderContents(userId, folderId, `${folder.fileName}/`, archive);

    await archive.finalize();
  }

  @Post(":id/pin")
  async pinFile(
    @Param("id") fileId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id;
    return this.filesService.pinFile(userId, fileId);
  }

  @Delete(":id/pin")
  async unpinFile(
    @Param("id") fileId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id;
    return this.filesService.unpinFile(userId, fileId);
  }
}

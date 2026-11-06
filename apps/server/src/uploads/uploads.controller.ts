import {
  Controller,
  Post,
  BadRequestException,
  UseGuards,
  Body,
} from "@nestjs/common";
import * as path from "path";
import { ThrottlerGuard, Throttle } from "nestjs-advanced-rate-limiter";
import { SupabaseGuard } from "../core/guards/supabase.guard";
import { UploadsService } from "./uploads.service";

@Controller("uploads")
@UseGuards(SupabaseGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post("report-evidence/signed-url")
  @UseGuards(ThrottlerGuard)
  @Throttle({ algorithm: "token-bucket", capacity: 20, refillRate: 2 })
  async createSignedUploadUrl(
    @Body() body: { fileName: string; mimeType?: string }
  ) {
    if (!body || !body.fileName) {
      throw new BadRequestException("fileName là bắt buộc");
    }

    const mimeType = (body.mimeType || "").toLowerCase();
    const ext = path.extname(body.fileName).toLowerCase();

    const allowedExtensions = [
      ".pdf",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".ppt",
      ".pptx",
      ".txt",
      ".csv",
      ".zip",
      ".rar",
      ".7z",
      ".tar",
      ".gz",
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
      ".gif",
      ".bmp",
      ".svg",
      ".mp4",
      ".mov",
      ".avi",
      ".mkv",
      ".webm",
      ".mp3",
      ".wav",
      ".m4a",
      ".ogg",
    ];

    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/bmp",
      "image/svg+xml",
      "application/pdf",
      "application/x-pdf",
      "application/acrobat",
      "applications/pdf",
      "text/pdf",
      "text/x-pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/zip",
      "application/x-zip-compressed",
      "application/x-rar-compressed",
      "application/x-7z-compressed",
      "application/octet-stream",
      "text/plain",
      "text/csv",
      "video/mp4",
      "video/quicktime",
      "video/x-msvideo",
      "video/webm",
      "video/x-matroska",
      "audio/mpeg",
      "audio/wav",
      "audio/mp3",
      "audio/mp4",
      "audio/m4a",
      "audio/x-m4a",
      "audio/ogg",
    ];

    const isExtensionAllowed = allowedExtensions.includes(ext);
    const isMimeTypeAllowed = allowedMimeTypes.includes(mimeType);

    if (!isExtensionAllowed && !isMimeTypeAllowed) {
      throw new BadRequestException(
        `Định dạng file không được hỗ trợ (${ext || mimeType}). Vui lòng tải lên file PDF, Word, Excel, PowerPoint, ZIP, RAR, Ảnh hoặc Video/Audio.`
      );
    }

    return this.uploadsService.createSignedUploadUrl(body.fileName);
  }
}

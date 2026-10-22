export class AttachmentDto {
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileType: "image" | "video" | "file";
}

export class SendMessageDto {
  content?: string;
  type?: "text" | "file" | "video" | "image";
  attachments?: AttachmentDto[];
  replyToId?: string;
}

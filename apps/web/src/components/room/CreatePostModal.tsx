"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  X,
  Loader2,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Smile,
  Paperclip,
  Image as ImageIcon,
  Video as VideoIcon,
  FileText,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useGetRoomMembersQuery } from "@/lib/redux/api/roomsApi";
import { useGetSignedUploadUrlMutation } from "@/lib/redux/api/newsFeedApi";
import axios from "axios";
import { useTranslations } from "next-intl";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { parseMarkdownToHtml, htmlToMarkdown } from "@/utils/markdownParser";

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  channelId: string;
  onSuccess: (post: any) => void;
  // Cho phép edit bài viết hiện tại
  editPostData?: {
    id: string;
    content: string;
    attachments: any[];
  } | null;
}

interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: "uploading" | "success" | "error";
  url?: string;
  fileName?: string;
  fileType: "image" | "video" | "file";
  errorMsg?: string;
}

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "👏", "🎉", "🔥", "🚀", "💡", "💯", "❌"];

export default function CreatePostModal({
  isOpen,
  onClose,
  roomId,
  channelId,
  onSuccess,
  editPostData,
}: CreatePostModalProps) {
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const t = useTranslations("news_feed");

  // Mention @ States
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(-1);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: members = [] } = useGetRoomMembersQuery(roomId, { skip: !isOpen });
  const [getSignedUrl] = useGetSignedUploadUrlMutation();

  // TipTap Rich Text Editor Configuration
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: {
          HTMLAttributes: {
            class: "list-disc pl-5 my-1",
          },
        },
        orderedList: {
          HTMLAttributes: {
            class: "list-decimal pl-5 my-1",
          },
        },
      }),
      Underline,
      Placeholder.configure({
        placeholder: t("comment_placeholder"),
      }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class:
          "outline-none min-h-[140px] w-full text-sm text-slate-800 placeholder-slate-400 focus:outline-none prose prose-slate max-w-none [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.is-editor-empty:first-child::before]:text-slate-400 [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:h-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
      },
    },
    onUpdate: ({ editor }) => {
      setContent(editor.getHTML());

      // Check for @ mention trigger
      const { from } = editor.state.selection;
      const textBefore = editor.state.doc.textBetween(0, from, "\n");
      const lastAtPos = textBefore.lastIndexOf("@");

      if (
        lastAtPos !== -1 &&
        (lastAtPos === 0 ||
          textBefore[lastAtPos - 1] === " " ||
          textBefore[lastAtPos - 1] === "\n")
      ) {
        const query = textBefore.substring(lastAtPos + 1);
        if (!query.includes(" ")) {
          setMentionQuery(query);
          setMentionIndex(lastAtPos);
          setShowMentionDropdown(true);
          return;
        }
      }
      setShowMentionDropdown(false);
    },
  });

  // Populate data if in edit mode or reset on open
  useEffect(() => {
    if (isOpen) {
      if (editPostData) {
        const initialHtml = parseMarkdownToHtml(editPostData.content);
        setContent(initialHtml || editPostData.content);
        if (editor) {
          editor.commands.setContent(initialHtml || editPostData.content);
        }
        setFiles(
          editPostData.attachments.map((att, idx) => ({
            id: `edit-${idx}`,
            file: new File([], att.fileName), // Empty file mock for already uploaded attachments
            progress: 100,
            status: "success",
            url: att.url,
            fileName: att.fileName,
            fileType: att.fileType,
          }))
        );
      } else {
        setContent("");
        if (editor) {
          editor.commands.setContent("");
        }
        setFiles([]);
      }
      setValidationError(null);
      setShowEmojiPicker(false);
      setShowMentionDropdown(false);
    }
  }, [isOpen, editPostData, editor]);

  if (!isOpen) return null;

  const selectMention = (member: any) => {
    if (!editor) return;
    const { from } = editor.state.selection;
    const textBefore = editor.state.doc.textBetween(0, from, "\n");
    const lastAtPos = textBefore.lastIndexOf("@");
    if (lastAtPos !== -1) {
      editor
        .chain()
        .focus()
        .deleteRange({ from: lastAtPos + 1, to: from + 1 })
        .insertContent(`@${member.displayName} `)
        .run();
    }
    setShowMentionDropdown(false);
  };

  // Filter members for mention
  const filteredMembers = members.filter((m: any) =>
    m.displayName?.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  // File Upload Handling
  const validateFile = (file: File): { valid: boolean; error?: string } => {
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    const isImage = [".jpg", ".png", ".jpeg", ".webp"].includes(ext);
    const isVideo = [".mp4", ".mov", ".avi"].includes(ext);
    const isDoc = [".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".zip", ".rar"].includes(ext);

    if (!isImage && !isVideo && !isDoc) {
      return { valid: false, error: `Tệp "${file.name}" không đúng định dạng cho phép.` };
    }

    if (isImage && file.size > 20 * 1024 * 1024) {
      return { valid: false, error: `Ảnh "${file.name}" vượt quá giới hạn 20MB.` };
    }
    if (isVideo && file.size > 500 * 1024 * 1024) {
      return { valid: false, error: `Video "${file.name}" vượt quá giới hạn 500MB.` };
    }
    if (isDoc && file.size > 100 * 1024 * 1024) {
      return { valid: false, error: `Tài liệu "${file.name}" vượt quá giới hạn 100MB.` };
    }

    return { valid: true };
  };

  const startUpload = async (fileObj: UploadingFile) => {
    // Nếu mock file (đã upload trước đó ở chế độ Edit)
    if (fileObj.file.size === 0) return;

    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileObj.id
          ? { ...f, status: "uploading", progress: 0, errorMsg: undefined }
          : f
      )
    );

    try {
      // 1. Lấy Signed Upload URL từ server
      const { signedUrl, url, fileName } = await getSignedUrl({
        fileName: fileObj.file.name,
      }).unwrap();

      // 2. Upload trực tiếp lên Supabase
      await axios.put(signedUrl, fileObj.file, {
        headers: {
          "Content-Type": fileObj.file.type || "application/octet-stream",
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setFiles((prev) =>
              prev.map((f) => (f.id === fileObj.id ? { ...f, progress } : f))
            );
          }
        },
      });

      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileObj.id
            ? { ...f, status: "success", progress: 100, url, fileName }
            : f
        )
      );
    } catch (err: any) {
      console.error("Upload error:", err);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileObj.id
            ? { ...f, status: "error", errorMsg: err?.message || "Tải lên thất bại." }
            : f
        )
      );
    }
  };

  const handleFilesInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files);
    }
  };

  const addFiles = (fileList: FileList) => {
    setValidationError(null);

    if (files.length + fileList.length > 10) {
      setValidationError(t("max_files_error"));
      return;
    }

    const newFiles: UploadingFile[] = [];

    Array.from(fileList).forEach((file) => {
      const validation = validateFile(file);
      if (!validation.valid) {
        setValidationError(validation.error || "File không hợp lệ");
        return;
      }

      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      let fileType: "image" | "video" | "file" = "file";
      if ([".jpg", ".png", ".jpeg", ".webp"].includes(ext)) fileType = "image";
      else if ([".mp4", ".mov", ".avi"].includes(ext)) fileType = "video";

      const fileObj: UploadingFile = {
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        progress: 0,
        status: "uploading",
        fileType,
      };

      newFiles.push(fileObj);
    });

    if (newFiles.length > 0) {
      setFiles((prev) => [...prev, ...newFiles]);
      newFiles.forEach((f) => startUpload(f));
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const retryUpload = (fileObj: UploadingFile) => {
    startUpload(fileObj);
  };

  // Drag and Drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // Kiểm tra có file nào đang upload dở không
    const hasUploading = files.some((f) => f.status === "uploading");
    if (hasUploading) {
      setValidationError(t("wait_upload_error"));
      return;
    }

    // Kiểm tra có file nào bị lỗi upload không
    const hasError = files.some((f) => f.status === "error");
    if (hasError) {
      setValidationError(t("upload_error_retry"));
      return;
    }

    const htmlContent = editor?.getHTML() || content;
    const markdownContent = htmlToMarkdown(htmlContent);

    // Kiểm tra nội dung rỗng
    if (!markdownContent.trim() && files.length === 0) {
      setValidationError(t("content_required_error"));
      return;
    }

    try {
      setIsSubmitting(true);

      const attachments = files.map((f) => ({
        url: f.url || "",
        fileName: f.fileName || f.file.name,
        fileType: f.fileType,
        fileSize: f.file.size || 0,
      }));

      onSuccess({
        content: markdownContent,
        attachments,
      });
      onClose();
    } catch (err: any) {
      setValidationError(err?.message || t("failed_create_post"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={() => !isSubmitting && onClose()} />

      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`relative bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col z-10 transition-all border duration-200 overflow-hidden ${
          dragActive ? "border-brand-500 bg-brand-50/10 scale-[0.99]" : "border-slate-200"
        }`}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-base font-bold text-slate-800">
            {editPostData ? t("edit_post_title") : t("new_post_title")}
          </h3>
          <button
            disabled={isSubmitting}
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded text-slate-500 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-y-auto max-h-[80vh] p-6 space-y-4">
          {/* Main Input TipTap Rich Text Area */}
          <div
            onClick={() => editor?.commands.focus()}
            className="relative flex-1 min-h-[140px] cursor-text"
          >
            <EditorContent editor={editor} />

            {/* Mention Dropdown */}
            {showMentionDropdown && filteredMembers.length > 0 && (
              <div className="absolute left-0 bottom-full mb-1 z-30 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto w-48">
                {filteredMembers.map((m: any) => (
                  <button
                    key={m.userId}
                    type="button"
                    onClick={() => selectMention(m)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2 text-slate-700 cursor-pointer"
                  >
                    {m.avatarUrl ? (
                      <img src={m.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center font-bold text-[10px]">
                        {m.displayName?.charAt(0)}
                      </div>
                    )}
                    <span className="font-semibold truncate">{m.displayName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Validation Error Alert */}
          {validationError && (
            <div className="flex items-center gap-2 text-xs font-semibold text-red-600 bg-red-50 p-3 rounded-xl">
              <AlertCircle size={16} className="shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Upload Attachments Preview List */}
          {files.length > 0 && (
            <div className="grid grid-cols-2 gap-3 pb-2">
              {files.map((fileObj) => (
                <div
                  key={fileObj.id}
                  className="relative group border border-slate-100 rounded-xl p-2.5 bg-slate-50 flex items-center gap-2.5 overflow-hidden"
                >
                  {/* File Type Icon */}
                  <div className="w-9 h-9 flex items-center justify-center bg-white border border-slate-100 rounded-lg shrink-0 text-slate-500">
                    {fileObj.fileType === "image" ? (
                      <ImageIcon size={18} />
                    ) : fileObj.fileType === "video" ? (
                      <VideoIcon size={18} />
                    ) : (
                      <FileText size={18} />
                    )}
                  </div>

                  {/* File Info & Upload Status */}
                  <div className="flex-1 min-w-0 pr-6 text-left">
                    <p className="text-xs font-semibold text-slate-700 truncate">
                      {fileObj.fileName || fileObj.file.name}
                    </p>
                    {fileObj.status === "uploading" && (
                      <div className="mt-1 w-full">
                        <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="bg-brand-500 h-full rounded-full transition-all duration-300"
                            style={{ width: `${fileObj.progress}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-400 mt-0.5 inline-block">
                          Đang tải lên ({fileObj.progress}%)
                        </span>
                      </div>
                    )}
                    {fileObj.status === "success" && (
                      <span className="text-[10px] text-emerald-600 font-medium">{t("upload_success")}</span>
                    )}
                    {fileObj.status === "error" && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[10px] text-red-500 font-medium truncate">
                          {t("upload_failed")}
                        </span>
                        <button
                          type="button"
                          onClick={() => retryUpload(fileObj)}
                          title="Tải lại file"
                          className="p-0.5 text-slate-500 hover:text-brand-600 rounded cursor-pointer"
                        >
                          <RefreshCw size={10} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Remove Button */}
                  <button
                    type="button"
                    onClick={() => removeFile(fileObj.id)}
                    className="absolute top-2.5 right-2.5 p-1 bg-white border border-slate-100 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full shadow-sm transition-colors cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Form Bottom Bar - Rich Text Toolbar & Upload Buttons */}
          <div className="border-t border-slate-100 pt-4 flex flex-wrap items-center justify-between gap-3 bg-white">
            {/* Rich Text Options */}
            <div className="flex items-center gap-0.5 border border-slate-200 rounded-lg p-0.5 bg-slate-50">
              <button
                type="button"
                onClick={() => editor?.chain().focus().toggleBold().run()}
                title={t("bold")}
                className={`p-1.5 rounded transition-colors cursor-pointer ${
                  editor?.isActive("bold")
                    ? "bg-white shadow-xs text-brand-600 font-bold"
                    : "hover:bg-white hover:shadow-xs text-slate-600"
                }`}
              >
                <Bold size={16} />
              </button>
              <button
                type="button"
                onClick={() => editor?.chain().focus().toggleItalic().run()}
                title={t("italic")}
                className={`p-1.5 rounded transition-colors cursor-pointer ${
                  editor?.isActive("italic")
                    ? "bg-white shadow-xs text-brand-600 font-bold"
                    : "hover:bg-white hover:shadow-xs text-slate-600"
                }`}
              >
                <Italic size={16} />
              </button>
              <button
                type="button"
                onClick={() => editor?.chain().focus().toggleUnderline().run()}
                title={t("underline")}
                className={`p-1.5 rounded transition-colors cursor-pointer ${
                  editor?.isActive("underline")
                    ? "bg-white shadow-xs text-brand-600 font-bold"
                    : "hover:bg-white hover:shadow-xs text-slate-600"
                }`}
              >
                <UnderlineIcon size={16} />
              </button>
              <div className="h-4 w-[1px] bg-slate-200 mx-1" />
              <button
                type="button"
                onClick={() => editor?.chain().focus().toggleBulletList().run()}
                title={t("list")}
                className={`p-1.5 rounded transition-colors cursor-pointer ${
                  editor?.isActive("bulletList")
                    ? "bg-white shadow-xs text-brand-600 font-bold"
                    : "hover:bg-white hover:shadow-xs text-slate-600"
                }`}
              >
                <List size={16} />
              </button>
              <button
                type="button"
                onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                title={t("ordered_list")}
                className={`p-1.5 rounded transition-colors cursor-pointer ${
                  editor?.isActive("orderedList")
                    ? "bg-white shadow-xs text-brand-600 font-bold"
                    : "hover:bg-white hover:shadow-xs text-slate-600"
                }`}
              >
                <ListOrdered size={16} />
              </button>
              <div className="h-4 w-[1px] bg-slate-200 mx-1" />

              {/* Emojis Trigger */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  title={t("add_emoji")}
                  className={`p-1.5 rounded transition-colors cursor-pointer ${
                    showEmojiPicker
                      ? "bg-white shadow-xs text-brand-600"
                      : "hover:bg-white hover:shadow-xs text-slate-600"
                  }`}
                >
                  <Smile size={16} />
                </button>
                {showEmojiPicker && (
                  <div className="absolute bottom-full left-0 mb-2 p-2 bg-white border border-slate-200 rounded-xl shadow-xl grid grid-cols-6 gap-1 w-44 z-30">
                    {EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          editor?.chain().focus().insertContent(emoji).run();
                          setShowEmojiPicker(false);
                        }}
                        className="w-6 h-6 flex items-center justify-center text-sm hover:bg-slate-100 rounded cursor-pointer"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Media Attachment Actions */}
            <div className="flex items-center gap-1.5">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFilesInput}
                className="hidden"
                accept="image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.rar"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title={t("attach_files")}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                <Paperclip size={14} />
                <span>{t("attach_files")}</span>
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>{t("saving")}</span>
                  </>
                ) : (
                  <span>{t("post_button")}</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

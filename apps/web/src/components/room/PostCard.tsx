"use client";

import React, { useState, useMemo } from "react";
import {
  MoreVertical,
  ThumbsUp,
  MessageSquare,
  Share2,
  Trash2,
  Edit,
  Download,
  FileText,
  CornerDownRight,
  Send,
  Loader2,
  Heart,
  Laugh,
  CheckCircle,
  CalendarDays,
  ClipboardList,
} from "lucide-react";
import {
  PostDto,
  CommentDto,
  useTogglePostReactionMutation,
  useDeletePostMutation,
  useGetCommentsQuery,
  useCreateCommentMutation,
  useDeleteCommentMutation,
  useToggleCommentReactionMutation,
} from "@/lib/redux/api/newsFeedApi";
import { parseMarkdownToHtml } from "@/utils/markdownParser";
import ReactionsListModal from "./ReactionsListModal";
import { toast } from "sonner";
import { useTranslations, useLocale } from "next-intl";
import { useConfirm } from "@/providers/ConfirmProvider";
import UserAvatar from "@/components/common/UserAvatar";

interface PostCardProps {
  post: PostDto;
  userId: string;
  userRole: "owner" | "admin" | "member";
  onEdit: (post: PostDto) => void;
}

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "👏", "🎉"];

const REACTION_LABELS: Record<string, string> = {
  "👍": "Thích",
  "❤️": "Yêu thích",
  "😂": "Haha",
  "😮": "Wow",
  "😢": "Buồn",
  "👏": "Vỗ tay",
  "🎉": "Chúc mừng",
};

interface CommentNode extends CommentDto {
  children: CommentNode[];
  replyToAuthor?: { displayName?: string };
}

interface ThreadedCommentItemProps {
  comment: CommentNode;
  level: number;
  userId: string;
  isTeacher: boolean;
  replyToId: string | null;
  replyText: string;
  onSetReplyTo: (id: string | null) => void;
  onSetReplyText: (text: string) => void;
  onSubmitReply: (e: React.FormEvent, parentId: string) => void;
  onDeleteComment: (id: string) => void;
  getRoleLabel: (role?: string) => React.ReactNode;
  formatTimeAgo: (dateStr: string) => string;
  t: (key: string, options?: any) => string;
}

function ThreadedCommentItem({
  comment,
  level,
  userId,
  isTeacher,
  replyToId,
  replyText,
  onSetReplyTo,
  onSetReplyText,
  onSubmitReply,
  onDeleteComment,
  getRoleLabel,
  formatTimeAgo,
  t,
}: ThreadedCommentItemProps) {
  const isCommentAuthor = comment.authorId === userId;
  const isReplying = replyToId === comment._id;
  // Giới hạn thụt lề tối đa ở level 4 để không làm co hẹp khung chat
  const clampedIndent =
    level > 0
      ? level <= 4
        ? "pl-6 sm:pl-7 border-l-2 border-slate-100"
        : "pl-3 border-l-2 border-slate-100"
      : "";

  return (
    <div className={`text-left ${clampedIndent} space-y-2 mt-2.5`}>
      <div className="flex gap-2.5 items-start group/comment">
        {level > 0 && (
          <CornerDownRight size={13} className="text-slate-300 shrink-0 mt-2" />
        )}
        <UserAvatar
          avatarUrl={comment.author?.avatarUrl}
          displayName={comment.author?.displayName}
          size={level > 0 ? "w-7 h-7" : "w-8 h-8"}
        />

        <div className="flex-1 min-w-0">
          <div className="bg-slate-50/80 hover:bg-slate-50 rounded-2xl px-3.5 py-2 inline-block max-w-full">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-800">
                {comment.author?.displayName}
              </span>
              {getRoleLabel(comment.author?.role)}
              <span className="text-[10px] text-slate-400">
                {formatTimeAgo(comment.createdAt)}
              </span>
            </div>
            <p className="text-xs text-slate-700 mt-1 whitespace-pre-wrap leading-relaxed">
              {comment.replyToAuthor?.displayName && (
                <span className="text-brand-600 font-bold mr-1 select-none">
                  @{comment.replyToAuthor.displayName}
                </span>
              )}
              {comment.content}
            </p>
          </div>

          {/* Comment Action Links: Trả lời & Xóa cho MỌI CẤP */}
          <div className="flex items-center gap-3 mt-1 pl-2 text-[10px] text-slate-400 font-semibold">
            <button
              onClick={() => {
                if (isReplying) {
                  onSetReplyTo(null);
                } else {
                  onSetReplyTo(comment._id);
                  onSetReplyText("");
                }
              }}
              className="hover:text-brand-600 transition-colors cursor-pointer"
            >
              {t("reply")}
            </button>
            {(isCommentAuthor || isTeacher) && (
              <button
                onClick={() => onDeleteComment(comment._id)}
                className="hover:text-red-500 transition-colors cursor-pointer"
              >
                {t("delete")}
              </button>
            )}
          </div>

          {/* Form trả lời ngay bên dưới bình luận */}
          {isReplying && (
            <form
              onSubmit={(e) => onSubmitReply(e, comment._id)}
              className="mt-2 flex items-center gap-2 animate-fade-in"
            >
              <div className="flex-1 flex items-center gap-1.5 border border-slate-200 rounded-xl px-3 py-1.5 bg-white focus-within:border-brand-500 shadow-2xs">
                <span className="text-[11px] font-bold text-brand-600 shrink-0 select-none">
                  @{comment.author?.displayName || "User"}
                </span>
                <input
                  type="text"
                  autoFocus
                  placeholder={t("write_reply")}
                  value={replyText}
                  onChange={(e) => onSetReplyText(e.target.value)}
                  className="flex-1 text-xs text-slate-800 placeholder-slate-400 bg-transparent focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="bg-brand-600 hover:bg-brand-700 text-white p-2 rounded-xl transition-colors shadow-sm shrink-0 cursor-pointer"
              >
                <Send size={12} />
              </button>
              <button
                type="button"
                onClick={() => onSetReplyTo(null)}
                className="border border-slate-200 hover:bg-slate-50 text-slate-500 px-2.5 py-1.5 rounded-xl text-[10px] font-bold cursor-pointer"
              >
                {t("cancel")}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Đệ quy hiển thị các phản hồi con cháu (Threaded Children) */}
      {comment.children && comment.children.length > 0 && (
        <div className="space-y-1">
          {comment.children.map((child) => (
            <ThreadedCommentItem
              key={child._id}
              comment={child}
              level={level + 1}
              userId={userId}
              isTeacher={isTeacher}
              replyToId={replyToId}
              replyText={replyText}
              onSetReplyTo={onSetReplyTo}
              onSetReplyText={onSetReplyText}
              onSubmitReply={onSubmitReply}
              onDeleteComment={onDeleteComment}
              getRoleLabel={getRoleLabel}
              formatTimeAgo={formatTimeAgo}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PostCard({ post, userId, userRole, onEdit }: PostCardProps) {
  const t = useTranslations("news_feed");
  const locale = useLocale();
  const confirm = useConfirm();
  const [showMenu, setShowMenu] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [isContentExpanded, setIsContentExpanded] = useState(false);
  const [isReactionsModalOpen, setIsReactionsModalOpen] = useState(false);

  // Comments State
  const [commentText, setCommentText] = useState("");
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const [togglePostReaction] = useTogglePostReactionMutation();
  const [deletePost, { isLoading: isDeletingPost }] = useDeletePostMutation();

  const { data: comments = [], isLoading: isLoadingComments } = useGetCommentsQuery(post._id, {
    skip: !showComments,
  });

  const [createComment, { isLoading: isCreatingComment }] = useCreateCommentMutation();
  const [deleteComment] = useDeleteCommentMutation();
  const [toggleCommentReaction] = useToggleCommentReactionMutation();

  const isTeacher = userRole === "owner" || userRole === "admin";
  const isAuthor = post.authorId === userId;

  const handleCopyLink = () => {
    const link = `${window.location.origin}${window.location.pathname}?postId=${post._id}`;
    navigator.clipboard.writeText(link);
    toast.success(t("copy_link_success"));
    setShowMenu(false);
  };

  const handleDeletePost = () => {
    confirm({
      title: t("delete_post"),
      message: t("delete_post_confirm"),
      onConfirm: async () => {
        try {
          await deletePost(post._id).unwrap();
          toast.success(t("success_delete_post"));
        } catch (err: any) {
          toast.error(err?.data?.message || t("failed_delete_post"));
          throw err;
        }
      },
    });
  };

  const handleToggleReaction = async (emoji: string) => {
    try {
      await togglePostReaction({
        postId: post._id,
        type: emoji,
        roomId: post.roomId,
        channelId: post.channelId,
      }).unwrap();
    } catch (err) {
      console.error("Reaction failed:", err);
    }
  };

  const handleCreateComment = async (e: React.FormEvent, parentId: string | null = null) => {
    e.preventDefault();
    const text = parentId ? replyText : commentText;
    if (!text.trim()) return;

    try {
      await createComment({
        postId: post._id,
        parentId: parentId || undefined,
        content: text.trim(),
      }).unwrap();

      if (parentId) {
        setReplyText("");
        setReplyToId(null);
      } else {
        setCommentText("");
      }
    } catch (err: any) {
      toast.error(err?.data?.message || t("failed_create_comment", { fallback: "Bình luận thất bại." }));
    }
  };

  const handleDeleteComment = (commentId: string) => {
    confirm({
      title: t("delete"),
      message: t("delete_comment_confirm"),
      onConfirm: async () => {
        try {
          await deleteComment(commentId).unwrap();
          toast.success(t("success_delete_comment", { fallback: "Đã xóa bình luận thành công." }));
        } catch (err: any) {
          toast.error(err?.data?.message || t("failed_delete_comment", { fallback: "Xóa bình luận thất bại." }));
          throw err;
        }
      },
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);

    if (diffMs < 0 || diffSec < 60) return "Vừa xong";
    if (diffMin < 60) return `${diffMin} phút trước`;
    if (diffHr < 24) return `${diffHr} giờ trước`;

    // Quá 24h thì hiển thị ngày giờ đầy đủ
    const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const dateFormatted = date.toLocaleDateString("vi-VN");
    return `${time} ${dateFormatted}`;
  };

  // Attachments Filter
  const images = post.attachments.filter((a) => a.fileType === "image");
  const videos = post.attachments.filter((a) => a.fileType === "video");
  const docs = post.attachments.filter((a) => a.fileType === "file");

  // Render Image Grid
  const renderImagesGrid = () => {
    if (images.length === 0) return null;
    if (images.length === 1) {
      return (
        <img
          src={images[0].url}
          alt=""
          onClick={() => window.open(images[0].url, "_blank")}
          className="w-full max-h-[320px] object-cover rounded-xl cursor-pointer border border-slate-100"
        />
      );
    }
    if (images.length === 2) {
      return (
        <div className="grid grid-cols-2 gap-2">
          {images.map((img, idx) => (
            <img
              key={idx}
              src={img.url}
              alt=""
              onClick={() => window.open(img.url, "_blank")}
              className="w-full h-48 object-cover rounded-xl cursor-pointer border border-slate-100"
            />
          ))}
        </div>
      );
    }
    if (images.length === 3) {
      return (
        <div className="grid grid-cols-3 gap-2 h-56">
          <img
            src={images[0].url}
            alt=""
            onClick={() => window.open(images[0].url, "_blank")}
            className="col-span-2 w-full h-full object-cover rounded-l-xl cursor-pointer border border-slate-100"
          />
          <div className="grid grid-rows-2 gap-2 h-full">
            {images.slice(1).map((img, idx) => (
              <img
                key={idx}
                src={img.url}
                alt=""
                onClick={() => window.open(img.url, "_blank")}
                className="w-full h-[106px] object-cover rounded-r-xl cursor-pointer border border-slate-100"
              />
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-4 gap-2 h-44">
        {images.slice(0, 3).map((img, idx) => (
          <img
            key={idx}
            src={img.url}
            alt=""
            onClick={() => window.open(img.url, "_blank")}
            className="w-full h-full object-cover rounded-xl cursor-pointer border border-slate-100"
          />
        ))}
        <div className="relative w-full h-full">
          <img
            src={images[3].url}
            alt=""
            className="w-full h-full object-cover rounded-xl border border-slate-100"
          />
          {images.length > 4 && (
            <div
              onClick={() => window.open(images[3].url, "_blank")}
              className="absolute inset-0 bg-black/60 text-white flex items-center justify-center font-bold text-sm rounded-xl cursor-pointer"
            >
              +{images.length - 4}
            </div>
          )}
        </div>
      </div>
    );
  };

  const getRoleLabel = (role?: string) => {
    const r = role?.toLowerCase();
    if (r === "owner" || r === "admin") {
      return (
        <span className="bg-brand-50 text-brand-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
          {t("teacher_label")}
        </span>
      );
    }
    return null;
  };

  const totalReactionsCount = post.reactionStats?.reduce((sum, curr) => sum + curr.count, 0) || 0;
  const userReaction = post.userReaction;

  // Xây dựng cây bình luận đa cấp (Threaded Comment Tree)
  const commentTree = useMemo(() => {
    const map = new Map<string, CommentNode>();
    const roots: CommentNode[] = [];

    comments.forEach((c) => {
      map.set(c._id, { ...c, children: [] });
    });

    comments.forEach((c) => {
      const node = map.get(c._id)!;
      if (c.parentId && map.has(c.parentId)) {
        const parent = map.get(c.parentId)!;
        node.replyToAuthor = parent.author;
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }, [comments]);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UserAvatar
            avatarUrl={post.author?.avatarUrl}
            displayName={post.author?.displayName}
            size="w-10 h-10"
          />
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-800">
                {post.author?.displayName}
              </span>
              {getRoleLabel(post.author?.role)}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-400">
              <span>{formatTimeAgo(post.createdAt)}</span>
              {post.isEdited && (
                <>
                  <span>•</span>
                  <span>{t("edited")}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Menu Trigger */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
          >
            <MoreVertical size={16} />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 mt-1 z-20 w-44 bg-white border border-slate-200 rounded-xl shadow-lg py-1">
                {!post.isMeeting && !post.isAssignment && (isAuthor || isTeacher) && (
                  <>
                    {isAuthor && (
                      <button
                        onClick={() => {
                          onEdit(post);
                          setShowMenu(false);
                        }}
                        className="w-full text-left px-4 py-2 text-xs hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                      >
                        <Edit size={14} />
                        <span>{t("edit")}</span>
                      </button>
                    )}
                    <button
                      onClick={handleDeletePost}
                      className="w-full text-left px-4 py-2 text-xs hover:bg-red-50 flex items-center gap-2 text-red-600"
                    >
                      <Trash2 size={14} />
                      <span>{t("delete_post")}</span>
                    </button>
                    <div className="h-[1px] bg-slate-100 my-1" />
                  </>
                )}
                <button
                  onClick={handleCopyLink}
                  className="w-full text-left px-4 py-2 text-xs hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                >
                  <Share2 size={14} />
                  <span>{t("copy_link")}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Content Text hoặc Meeting Card hoặc Assignment Card */}
      {post.isMeeting ? (
        <div className="space-y-4">
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4.5 text-left flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:bg-slate-100/40">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 flex items-center justify-center rounded-xl text-indigo-600 shrink-0">
                <CalendarDays className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-slate-800 tracking-tight truncate">
                  {post.meetingTitle}
                </h4>
                <p className="text-xs text-slate-400 font-semibold mt-1">
                  {(() => {
                    if (!post.meetingStartDate) return "";
                    const date = new Date(post.meetingStartDate);
                    const daysVi = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
                    const daysEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                    const isVi = locale === "vi";
                    const dayName = isVi ? daysVi[date.getDay()] : daysEn[date.getDay()];
                    
                    const hours = date.getHours().toString().padStart(2, "0");
                    const minutes = date.getMinutes().toString().padStart(2, "0");
                    
                    // Định dạng text
                    if (isVi) {
                      return `${dayName}, ${date.getDate()} tháng ${date.getMonth() + 1}, ${date.getFullYear()} ${hours}:${minutes}`;
                    } else {
                      const monthsEn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                      return `${dayName}, ${monthsEn[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} ${hours}:${minutes}`;
                    }
                  })()}
                </p>
              </div>
            </div>
            
            <button
              onClick={() => {
                // Tham gia cuộc họp kênh: điều hướng trực tiếp vào room/channel
                window.location.href = `/${locale}/room/${post.roomId}?channel=${post.channelId}`;
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs shrink-0 self-start sm:self-center"
            >
              {locale === "vi" ? "Tham gia" : "Join"}
            </button>
          </div>
          
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider text-left pl-1 select-none">
            {locale === "vi" ? "Đã lên lịch cuộc họp" : "Scheduled a meeting"}
          </div>
        </div>
      ) : post.isAssignment ? (
        <div className="space-y-4">
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4.5 text-left flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:bg-slate-100/40">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 bg-blue-50 border border-blue-100 flex items-center justify-center rounded-xl text-blue-600 shrink-0">
                <ClipboardList className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-slate-800 tracking-tight truncate">
                  {post.assignmentTitle}
                </h4>
                <p className="text-xs text-slate-400 font-semibold mt-1">
                  {(() => {
                    if (!post.assignmentDeadline) return locale === "vi" ? "Không có hạn chót" : "No deadline";
                    const date = new Date(post.assignmentDeadline);
                    const daysVi = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
                    const daysEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                    const isVi = locale === "vi";
                    const dayName = isVi ? daysVi[date.getDay()] : daysEn[date.getDay()];
                    
                    const hours = date.getHours().toString().padStart(2, "0");
                    const minutes = date.getMinutes().toString().padStart(2, "0");
                    
                    if (isVi) {
                      return `${dayName}, ${date.getDate()} tháng ${date.getMonth() + 1}, ${date.getFullYear()} ${hours}:${minutes}`;
                    } else {
                      const monthsEn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                      return `${dayName}, ${monthsEn[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} ${hours}:${minutes}`;
                    }
                  })()}
                </p>
              </div>
            </div>
            
            <button
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent("navigate-to-assignment", {
                    detail: { assignmentId: post.assignmentId },
                  })
                );
                const newUrl = `/${locale}/room/${post.roomId}?channel=__assignments__&assignmentId=${post.assignmentId}`;
                window.history.pushState({}, "", newUrl);
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs shrink-0 self-start sm:self-center cursor-pointer"
            >
              {locale === "vi" ? "Nhiệm vụ" : "Task"}
            </button>
          </div>
          
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider text-left pl-1 select-none">
            {locale === "vi" ? "Đã giao nhiệm vụ" : "Assigned a task"}
          </div>
        </div>
      ) : (
        <div className="text-sm text-slate-700 text-left leading-relaxed">
          {post.content.length > 300 && !isContentExpanded ? (
            <div>
              <div
                className="rich-text-content"
                dangerouslySetInnerHTML={{
                  __html: parseMarkdownToHtml(post.content.substring(0, 300) + "..."),
                }}
              />
              <button
                onClick={() => setIsContentExpanded(true)}
                className="text-xs font-bold text-brand-600 hover:underline mt-1"
              >
                {t("view_more")}
              </button>
            </div>
          ) : (
            <div>
              <div
                className="rich-text-content"
                dangerouslySetInnerHTML={{ __html: parseMarkdownToHtml(post.content) }}
              />
              {post.content.length > 300 && (
                <button
                  onClick={() => setIsContentExpanded(false)}
                  className="text-xs font-bold text-brand-600 hover:underline mt-1"
                >
                  {t("show_less")}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Grid Images */}
      {renderImagesGrid()}

      {/* Video Players */}
      {videos.map((vid, idx) => (
        <div key={idx} className="rounded-xl overflow-hidden border border-slate-100 bg-black">
          <video src={vid.url} controls className="w-full max-h-[300px]" />
        </div>
      ))}

      {/* Document File Cards */}
      {docs.length > 0 && (
        <div className="space-y-2">
          {docs.map((doc, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-3 border border-slate-100 hover:border-slate-200 bg-slate-50/50 rounded-xl transition-all"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 bg-white border border-slate-100 flex items-center justify-center rounded-lg text-slate-500 shrink-0">
                  <FileText size={18} />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-xs font-bold text-slate-700 truncate">{doc.fileName}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {formatFileSize(doc.fileSize)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => window.open(doc.url, "_blank")}
                className="p-2 bg-white hover:bg-brand-50 border border-slate-100 hover:border-brand-100 hover:text-brand-600 rounded-lg shadow-sm transition-all"
              >
                <Download size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Post Actions Stats & Interaction Buttons */}
      <div className="border-t border-b border-slate-100 py-2.5 flex items-center justify-start gap-2 bg-white">
        {/* Reaction Hover Tray & Reaction Count */}
        <div className="flex items-center gap-1.5 relative group">
          <button
            type="button"
            onClick={() => handleToggleReaction(userReaction ? userReaction : "👍")}
            className={`flex items-center gap-1.5 cursor-pointer py-1.5 px-3 hover:bg-slate-50 rounded-xl transition-colors ${
              userReaction ? "text-brand-600 font-bold" : "text-slate-500 font-semibold"
            }`}
          >
            {userReaction ? (
              <span className="text-base">{userReaction}</span>
            ) : (
              <ThumbsUp size={16} />
            )}
            <span className="text-xs">
              {userReaction ? REACTION_LABELS[userReaction] || "Đã thích" : t("like")}
            </span>
          </button>

          {/* Emoji Popover Tray (Có padding-bottom làm cầu nối hover liên tục) */}
          <div className="absolute bottom-full left-0 pb-2 hidden group-hover:flex z-20 animate-fade-in">
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-full shadow-xl px-2.5 py-1.5">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleToggleReaction(emoji)}
                  className="text-lg hover:scale-125 transition-transform"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Total Reaction Badge counts */}
          {totalReactionsCount > 0 && (
            <div
              onClick={() => setIsReactionsModalOpen(true)}
              title="Xem danh sách bày tỏ cảm xúc"
              className="flex items-center gap-1 text-[11px] text-slate-400 bg-slate-50 hover:bg-slate-100 cursor-pointer border border-slate-100 px-2 py-0.5 rounded-full shrink-0 transition-colors"
            >
              <span className="flex items-center gap-0.5">
                {post.reactionStats?.slice(0, 3).map((s) => s.reaction)}
              </span>
              <span className="font-bold text-slate-600 ml-0.5">{totalReactionsCount}</span>
            </div>
          )}
        </div>

        {/* Comment Switch Button */}
        <button
          onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-1.5 py-1.5 px-3 hover:bg-slate-50 rounded-xl transition-colors text-slate-500"
        >
          <MessageSquare size={16} />
          <span className="text-xs font-semibold">{t("add_comment_with_count", { count: post.commentsCount || 0 })}</span>
        </button>
      </div>

      {/* Comments Panel */}
      {showComments && (
        <div className="pt-2 space-y-4 border-t border-slate-100 animate-slide-down">
          {/* Comments Loader */}
          {isLoadingComments ? (
            <div className="flex items-center justify-center py-6 text-slate-400 text-xs gap-1.5">
              <Loader2 className="animate-spin" size={14} />
              <span>{t("loading_comments")}</span>
            </div>
          ) : commentTree.length === 0 ? (
            <p className="text-center text-slate-400 text-xs py-4">{t("no_comments")}</p>
          ) : (
            <div className="space-y-3 pr-1">
              {commentTree.map((comment) => (
                <ThreadedCommentItem
                  key={comment._id}
                  comment={comment}
                  level={0}
                  userId={userId}
                  isTeacher={isTeacher}
                  replyToId={replyToId}
                  replyText={replyText}
                  onSetReplyTo={setReplyToId}
                  onSetReplyText={setReplyText}
                  onSubmitReply={handleCreateComment}
                  onDeleteComment={handleDeleteComment}
                  getRoleLabel={getRoleLabel}
                  formatTimeAgo={formatTimeAgo}
                  t={t}
                />
              ))}
            </div>
          )}

          {/* Root Comment Input Box */}
          <form onSubmit={(e) => handleCreateComment(e, null)} className="flex items-center gap-2.5 pt-2">
            <input
              type="text"
              placeholder={t("comment_placeholder")}
              value={commentText}
              disabled={isCreatingComment}
              onChange={(e) => setCommentText(e.target.value)}
              className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 bg-transparent focus:outline-none"
            />
            <button
              type="submit"
              disabled={isCreatingComment || !commentText.trim()}
              className="bg-brand-600 hover:bg-brand-700 text-white p-2.5 rounded-xl transition-colors shadow-sm shrink-0 disabled:opacity-50"
            >
              {isCreatingComment ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
            </button>
          </form>
        </div>
      )}
      {/* Modal danh sách người bày tỏ cảm xúc */}
      <ReactionsListModal
        isOpen={isReactionsModalOpen}
        onClose={() => setIsReactionsModalOpen(false)}
        postId={post._id}
      />
    </div>
  );
}

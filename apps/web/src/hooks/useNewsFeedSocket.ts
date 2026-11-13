import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { useSocket } from "./useSocket";
import { newsFeedApi, PostDto, CommentDto } from "@/lib/redux/api/newsFeedApi";
import { AppDispatch } from "@/lib/redux/store";

export function useNewsFeedSocket(roomId: string, channelId: string, currentUserId?: string) {
  const dispatch = useDispatch<AppDispatch>();
  const socket = useSocket();

  useEffect(() => {
    if (!roomId || !channelId) return;

    // Lắng nghe tạo bài viết mới
    socket.on("post_created", (newPost: PostDto) => {
      if (newPost.channelId === channelId) {
        // Kiểm tra quyền client-side cho bài đăng nhiệm vụ
        if (newPost.isAssignment) {
          const isAuthor = currentUserId && newPost.authorId === currentUserId;
          const isAssigned =
            newPost.recipientType === "specific_members" || newPost.recipientType === "current_members"
              ? currentUserId && newPost.recipientMemberIds?.includes(currentUserId)
              : true;
          if (!isAuthor && !isAssigned) {
            return;
          }
        }

        dispatch(
          newsFeedApi.util.updateQueryData("getPosts", { roomId, channelId }, (draft) => {
            const exists = draft.some((p) => p._id === newPost._id);
            if (!exists) {
              draft.unshift(newPost); // Thêm lên đầu danh sách bài viết
            }
          })
        );
      }
    });

    // Lắng nghe cập nhật bài viết
    socket.on("post_updated", (updatedPost: PostDto) => {
      if (updatedPost.channelId === channelId) {
        if (updatedPost.isAssignment) {
          const isAuthor = currentUserId && updatedPost.authorId === currentUserId;
          const isAssigned =
            updatedPost.recipientType === "specific_members" || updatedPost.recipientType === "current_members"
              ? currentUserId && updatedPost.recipientMemberIds?.includes(currentUserId)
              : true;
          if (!isAuthor && !isAssigned) {
            // Nếu bị gỡ khỏi danh sách người nhận, xóa bài viết khỏi feed hiện tại
            dispatch(
              newsFeedApi.util.updateQueryData("getPosts", { roomId, channelId }, (draft) => {
                return draft.filter((p) => p._id !== updatedPost._id);
              })
            );
            return;
          }
        }

        dispatch(
          newsFeedApi.util.updateQueryData("getPosts", { roomId, channelId }, (draft) => {
            const index = draft.findIndex((p) => p._id === updatedPost._id);
            if (index !== -1) {
              draft[index] = { ...draft[index], ...updatedPost };
            }
          })
        );
      }
    });

    // Lắng nghe xóa bài viết
    socket.on("post_deleted", (data: { postId: string }) => {
      dispatch(
        newsFeedApi.util.updateQueryData("getPosts", { roomId, channelId }, (draft) => {
          return draft.filter((p) => p._id !== data.postId);
        })
      );
    });

    // Lắng nghe cập nhật reaction của bài viết
    socket.on(
      "post_reaction_updated",
      (data: {
        postId: string;
        reactionStats: any[];
        userId?: string;
        userReaction?: string | null;
      }) => {
        dispatch(
          newsFeedApi.util.updateQueryData("getPosts", { roomId, channelId }, (draft) => {
            const index = draft.findIndex((p) => p._id === data.postId);
            if (index !== -1) {
              draft[index].reactionStats = data.reactionStats;
              if (currentUserId && data.userId === currentUserId) {
                draft[index].userReaction = data.userReaction ?? null;
              }
            }
          })
        );
        dispatch(newsFeedApi.util.invalidateTags([{ type: "Post", id: data.postId }]));
      }
    );

    // Lắng nghe tạo bình luận mới
    socket.on("comment_created", (newComment: CommentDto) => {
      // Cập nhật số lượng comment trong post
      dispatch(
        newsFeedApi.util.updateQueryData("getPosts", { roomId, channelId }, (draft) => {
          const index = draft.findIndex((p) => p._id === newComment.postId);
          if (index !== -1) {
            draft[index].commentsCount = (draft[index].commentsCount || 0) + 1;
          }
        })
      );

      // Cập nhật danh sách bình luận
      dispatch(
        newsFeedApi.util.updateQueryData("getComments", newComment.postId, (draft) => {
          const exists = draft.some((c) => c._id === newComment._id);
          if (!exists) {
            draft.push(newComment); // Thêm vào cuối danh sách bình luận
          }
        })
      );
    });

    // Lắng nghe cập nhật bình luận
    socket.on("comment_updated", (updatedComment: CommentDto) => {
      dispatch(
        newsFeedApi.util.updateQueryData("getComments", updatedComment.postId, (draft) => {
          const index = draft.findIndex((c) => c._id === updatedComment._id);
          if (index !== -1) {
            draft[index] = { ...draft[index], ...updatedComment };
          }
        })
      );
    });

    // Lắng nghe xóa bình luận
    socket.on("comment_deleted", (data: { commentId: string; postId: string; parentId: string | null }) => {
      // Giảm số lượng comment trong bài viết
      dispatch(
        newsFeedApi.util.updateQueryData("getPosts", { roomId, channelId }, (draft) => {
          const index = draft.findIndex((p) => p._id === data.postId);
          if (index !== -1) {
            draft[index].commentsCount = Math.max(0, (draft[index].commentsCount || 1) - 1);
          }
        })
      );

      // Xóa bình luận khỏi danh sách
      dispatch(
        newsFeedApi.util.updateQueryData("getComments", data.postId, (draft) => {
          // Xóa comment đó và các replies con của nó (nếu có parentId trùng khớp)
          return draft.filter((c) => c._id !== data.commentId && c.parentId !== data.commentId);
        })
      );
    });

    // Lắng nghe cập nhật reaction của bình luận
    socket.on("comment_reaction_updated", (data: { commentId: string; postId: string; reactions: any[] }) => {
      dispatch(
        newsFeedApi.util.updateQueryData("getComments", data.postId, (draft) => {
          const index = draft.findIndex((c) => c._id === data.commentId);
          if (index !== -1) {
            draft[index].reactions = data.reactions;
          }
        })
      );
    });

    // Lắng nghe cập nhật RSVP sự kiện lịch họp
    socket.on("rsvp_updated", (data: { eventId: string; userId: string; status: string }) => {
      dispatch(
        newsFeedApi.util.updateQueryData("getPosts", { roomId, channelId }, (draft) => {
          draft.forEach((p) => {
            const evId = p.calendarEvent?._id || p.eventId || p.meetingId;
            if (p.isMeeting && evId === data.eventId) {
              if (currentUserId && data.userId === currentUserId && p.calendarEvent) {
                p.calendarEvent.isJoined = data.status === "ACCEPTED";
              }
            }
          });
        })
      );
    });

    return () => {
      socket.off("post_created");
      socket.off("post_updated");
      socket.off("post_deleted");
      socket.off("post_reaction_updated");
      socket.off("comment_created");
      socket.off("comment_updated");
      socket.off("comment_deleted");
      socket.off("comment_reaction_updated");
      socket.off("rsvp_updated");
    };
  }, [roomId, channelId, currentUserId, dispatch]);
}

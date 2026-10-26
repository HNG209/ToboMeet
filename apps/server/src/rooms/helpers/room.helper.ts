import { RoomResponse } from "@tobomeet/shared/types";
import { RoomMember } from "../schemas/room-member.schema";
import { RoomDocument } from "../schemas/room.schema";
import { getDisplayRole } from "./room-role.helper";

/**
 * Map room document to RoomResponse.
 * @param room - The room document.
 * @param forUserId - Optional: filter channels visible to this user only.
 *                   Owner luôn thấy tất cả kênh.
 */
export function mapToRoomResponse(
  room: RoomDocument,
  forUserId?: string,
): RoomResponse {
  const plainRoom = room.toObject?.() ?? room;

  const safeToIsoString = (value: unknown): string => {
    if (!value) return new Date().toISOString();

    const date = value instanceof Date ? value : new Date(value as string);

    return isNaN(date.getTime())
      ? new Date().toISOString()
      : date.toISOString();
  };

  const activeRoomMembers =
    plainRoom.members
      ?.filter(
        (member: RoomMember) =>
          member.status !== "removed" && member.status !== "left",
      )
      .map((member: RoomMember) => {
        // Đảm bảo DUY NHẤT room.ownerId mang role 'owner'
        const isActualOwner = member.userId === plainRoom.ownerId;
        const effectiveRole = isActualOwner
          ? "owner"
          : member.role === "owner"
            ? "member"
            : (member.role ?? "member");

        return {
          userId: member.userId,
          role: effectiveRole,
          displayRole: getDisplayRole(effectiveRole),
          joinedAt: safeToIsoString(member.joinedAt),
          supabaseId: member.userId,
        };
      }) ?? [];

  const isOwner = forUserId && plainRoom.ownerId === forUserId;

  // Filter channels visible to the requesting user
  const filteredChannels =
    plainRoom.channels?.filter((channel: any) => {
      // Owner luôn thấy tất cả kênh
      if (!forUserId || isOwner) return true;

      if (channel.isPrivate) {
        // Private: user phải có trong members[]
        return channel.members?.some((m: any) => m.userId === forUserId);
      } else {
        // Public: kênh công khai hiển thị cho mọi thành viên trong phòng
        return true;
      }
    }) ?? [];

  return {
    _id: plainRoom._id?.toString() ?? "",
    name: plainRoom.name ?? "",
    code: plainRoom.code ?? "",
    ownerId: plainRoom.ownerId ?? "",
    channels:
      filteredChannels.map((channel: any) => {
        if (channel.isPrivate) {
          return {
            ...channel,
            _id: channel._id?.toString() ?? "",
            members: channel.members ?? [],
          };
        }

        const memberRoles = new Map(
          (channel.members ?? []).map((member: any) => [
            member.userId,
            member.role,
          ]),
        );

        return {
          ...channel,
          _id: channel._id?.toString() ?? "",
          members: activeRoomMembers.map((member) => ({
            userId: member.userId,
            role: memberRoles.get(member.userId) ?? "member",
          })),
        };
      }) ?? [],
    members: activeRoomMembers,
    createdAt: safeToIsoString(plainRoom.createdAt),
    updatedAt: safeToIsoString(plainRoom.updatedAt),
  };
}

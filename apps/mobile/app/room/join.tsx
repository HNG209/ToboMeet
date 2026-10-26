// app/room/join.tsx
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  useCheckMemberByCodeQuery,
  useGetRoomByCodeQuery,
  useJoinRoomMutation,
} from "../../lib/redux/features/rooms/roomsApi";
import { toast } from "../../lib/toast";

export default function JoinScreen() {
  const router = useRouter();

  // Trích xuất param "code" từ deep link tobomeet://room/join?code=XYZ
  const { code } = useLocalSearchParams<{ code: string }>();

  // Kiểm tra xem user đã là thành viên hay chưa
  const { data: checkData, isLoading: isChecking } = useCheckMemberByCodeQuery(
    code || "",
    {
      skip: !code,
      refetchOnMountOrArgChange: true,
      refetchOnFocus: true,
    },
  );
  const isAlreadyMember = checkData?.isMember || false;

  // Fetch chi tiết phòng để lấy tên và _id
  const {
    data: roomDetails,
    isLoading: isFetchRoomLoading,
    error: fetchRoomError,
  } = useGetRoomByCodeQuery(code || "", {
    skip: !code,
  });

  const [joinRoom, { isLoading: isJoining }] = useJoinRoomMutation();

  const handleConfirmJoin = async () => {
    if (!code) return;
    try {
      const room = await joinRoom({ code: code.trim() }).unwrap();
      router.replace(`/room/${room._id}`);
    } catch (err: any) {
      console.error(err);
      toast.error(
        err?.data?.message ||
          err?.message ||
          "Không thể tham gia phòng. Vui lòng thử lại!",
      );
    }
  };

  const handleGoToRoom = () => {
    if (roomDetails?._id) {
      router.replace(`/room/${roomDetails._id}`);
    }
  };

  const handleCancel = () => {
    router.replace("/dashboard");
  };

  // Lỗi thiếu Code
  if (!code) {
    return (
      <View className="flex-1 bg-slate-50 justify-center items-center p-4">
        <Text className="text-lg font-bold text-red-500 mb-2">
          Lỗi liên kết
        </Text>
        <Text className="text-sm text-slate-500 text-center mb-6">
          Mã phòng không hợp lệ hoặc bị thiếu.
        </Text>
        <TouchableOpacity
          className="w-full bg-slate-200 py-3.5 rounded-xl items-center justify-center"
          onPress={handleCancel}
        >
          <Text className="text-slate-700 font-bold text-[15px]">
            Về trang chủ
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Đang tải dữ liệu
  if (isChecking || isFetchRoomLoading) {
    return (
      <View className="flex-1 bg-slate-50 justify-center items-center p-4">
        <ActivityIndicator size="large" color="#0284c7" className="mb-4" />
        <Text className="text-[15px] text-slate-500 font-medium">
          Đang kiểm tra thông tin phòng...
        </Text>
      </View>
    );
  }

  // Phòng không tồn tại hoặc lỗi API
  if (fetchRoomError) {
    return (
      <View className="flex-1 bg-slate-50 justify-center items-center p-4">
        <Text className="text-lg font-bold text-red-500 mb-2">
          Phòng họp không tồn tại
        </Text>
        <Text className="text-sm text-slate-500 text-center mb-6">
          Mã phòng hoặc liên kết tham gia không hợp lệ hoặc đã hết hạn.
        </Text>
        <TouchableOpacity
          className="w-full bg-slate-200 py-3.5 rounded-xl items-center justify-center"
          onPress={handleCancel}
        >
          <Text className="text-slate-700 font-bold text-[15px]">
            Về trang chủ
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Màn hình xác nhận chính
  return (
    <View className="flex-1 bg-slate-50 justify-center items-center p-4">
      <View className="bg-white w-full max-w-[400px] rounded-2xl p-6 shadow-md items-center shadow-black/10">
        <Text className="text-xl font-bold text-slate-900 mb-2 text-center">
          {isAlreadyMember ? "Vào phòng họp" : "Tham gia phòng họp"}
        </Text>

        <Text className="text-sm text-slate-600 text-center mb-5">
          {isAlreadyMember
            ? "Bạn đã là thành viên của phòng họp này."
            : "Bạn đang yêu cầu tham gia vào phòng họp."}
        </Text>

        {/* Khối hiển thị Tên Phòng */}
        {roomDetails?.name && (
          <View className="bg-slate-100 py-3 px-4 rounded-lg w-full mb-6 items-center">
            <Text className="text-xs text-slate-500 mb-1">Tên phòng:</Text>
            <Text className="text-base font-bold text-slate-900 text-center">
              {roomDetails.name}
            </Text>
          </View>
        )}

        {/* Khối Nút Bấm */}
        <View className="flex-row gap-3 w-full">
          <TouchableOpacity
            className="flex-1 bg-slate-100 py-3.5 rounded-xl items-center justify-center"
            onPress={handleCancel}
            disabled={isJoining}
          >
            <Text className="text-slate-700 font-bold text-[15px]">Hủy bỏ</Text>
          </TouchableOpacity>

          {isAlreadyMember ? (
            <TouchableOpacity
              className="flex-1 py-3.5 rounded-xl items-center justify-center"
              style={{ backgroundColor: "#0052FF" }}
              onPress={handleGoToRoom}
            >
              <Text className="text-white font-bold text-[15px]">
                Vào phòng
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              className={`flex-1 py-3.5 rounded-xl items-center justify-center flex-row gap-2 ${isJoining ? "opacity-60" : ""}`}
              style={{ backgroundColor: "#0052FF" }}
              onPress={handleConfirmJoin}
              disabled={isJoining}
            >
              {isJoining && <ActivityIndicator color="#ffffff" size="small" />}
              <Text className="text-white font-bold text-[15px]">
                Xác nhận tham gia
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

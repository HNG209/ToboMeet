import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  TextInput,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { User } from "@supabase/supabase-js";
import { useTranslation } from "react-i18next";
import { supabase } from "../../lib/supabase";
import { useGetMeQuery } from "../../lib/redux/features/users/usersApi";
import { useGetMyRoomsQuery, roomsApi } from "../../lib/redux/features/rooms/roomsApi";
import { useDispatch } from "react-redux";
import { AppDispatch } from "../../lib/redux/store";
import { RoomResponse } from "@tobomeet/shared/types";
import { Feather } from "@expo/vector-icons";
import JoinRoomModal from "../../components/JoinRoomModal";
import CreateRoomModal from "../../components/CreateRoomModal";
import { toast } from "../../lib/toast";
import RoomCard from "../../components/dashboard/RoomCard";
import DashboardHeader from "../../components/dashboard/DashboardHeader";

export default function DashboardScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // Modals state
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  // Trạng thái pull-to-refresh
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sử dụng cache của RTK Query, chỉ gọi lại khi người dùng pull-to-refresh
  const { data: profile, refetch: refetchProfile } = useGetMeQuery();
  const {
    data: rooms,
    isLoading: isRoomsLoading,
    refetch: refetchRooms,
  } = useGetMyRoomsQuery();

  const handleOpenRoom = (room: RoomResponse) => {
    // Làm ấm cache getRoomById để khi vào room/[id] hiển thị tức thì (0ms)
    dispatch(roomsApi.util.upsertQueryData("getRoomById", room._id, room));
    router.push(`/room/${room._id}`);
  };

  useEffect(() => {
    fetchSession();
  }, []);

  const fetchSession = async () => {
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) throw error;

      if (session?.user) {
        setUser(session.user);
      } else {
        router.replace("/(auth)/login");
      }
    } catch (error) {
      console.error(error);
      toast.error("Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Gọi refetch song song để làm mới cả danh sách phòng và thông tin user
      await Promise.all([refetchRooms(), refetchProfile()]);
    } catch (error) {
      console.log(error);
      toast.error("Không thể tải lại dữ liệu");
    } finally {
      setIsRefreshing(false);
    }
  }, [refetchRooms, refetchProfile]);

  const filteredRooms = rooms?.filter(
    (room) =>
      room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      room.code.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Chỉ hiển thị spinner chặn màn hình khi CHƯA có dữ liệu trong cache
  if ((loading && !user && !profile) || (isRoomsLoading && !rooms)) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-50">
        <ActivityIndicator size="large" color="#0052FF" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      {/* Header đồng bộ (Teams style) */}
      <DashboardHeader
        title={t("dashboard.tab_rooms", "Nhóm")}
        rightAction={
          <TouchableOpacity
            onPress={() => {
              setIsSearching(!isSearching);
              if (isSearching) {
                setSearchQuery("");
              }
            }}
            className="p-2"
          >
            <Feather
              name="search"
              size={20}
              color={isSearching ? "#0052FF" : "#64748B"}
            />
          </TouchableOpacity>
        }
      />

      {/* Main Content Area */}
      <View className="flex-1">
        {/* Action Row */}
        <View className="p-6 pb-4 gap-4">
          {/* Ô tìm kiếm xuất hiện bên dưới Header khi active */}
          {isSearching && (
            <View className="relative flex-row items-center bg-white border border-slate-100 rounded-2xl px-4 py-3 shadow-sm">
              <Feather
                name="search"
                size={18}
                color="#94A3B8"
                style={{ marginRight: 10 }}
              />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={t("dashboard.search_placeholder")}
                placeholderTextColor="#94A3B8"
                autoFocus
                className="flex-1 text-sm text-slate-800 p-0"
              />
              <TouchableOpacity
                onPress={() => {
                  setIsSearching(false);
                  setSearchQuery("");
                }}
              >
                <Feather name="x" size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>
          )}
          {/* Join or Create buttons — Phong cách thanh lịch, sang trọng chuẩn Web */}
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => setShowJoinModal(true)}
              activeOpacity={0.7}
              className="flex-1 bg-white border border-slate-200/90 py-3.5 px-4 rounded-xl flex-row justify-center items-center gap-2 shadow-xs"
              style={{
                shadowColor: "#0F172A",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 2,
                elevation: 1,
              }}
            >
              <Feather name="users" size={16} color="#64748B" />
              <Text className="text-slate-700 font-bold text-xs tracking-tight">
                {t("dashboard.join_team")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowCreateModal(true)}
              activeOpacity={0.85}
              className="flex-1 bg-[#0052FF] py-3.5 px-4 rounded-xl flex-row justify-center items-center gap-2 shadow-sm"
              style={{
                shadowColor: "#0052FF",
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.25,
                shadowRadius: 6,
                elevation: 2,
              }}
            >
              <Feather name="plus" size={16} color="#FFFFFF" />
              <Text className="text-white font-bold text-xs tracking-tight">
                {t("dashboard.create_team")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Rooms List */}
        <FlatList
          data={filteredRooms}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              colors={["#0052FF"]} // Màu vòng xoay trên Android
              tintColor="#0052FF" // Màu vòng xoay trên iOS
            />
          }
          ListEmptyComponent={
            searchQuery !== "" ? (
              <View className="items-center justify-center py-20 gap-4">
                <View className="w-16 h-16 rounded-full bg-slate-100 items-center justify-center">
                  <Feather name="search" size={24} color="#94A3B8" />
                </View>
                <View className="items-center">
                  <Text className="text-sm font-bold text-slate-800">
                    {t("dashboard.no_results_title")}
                  </Text>
                  <Text className="text-xs text-slate-400 mt-1">
                    {t("dashboard.no_results_desc")}
                  </Text>
                </View>
              </View>
            ) : (
              <View className="items-center justify-center py-20 gap-5">
                <View className="w-16 h-16 rounded-full bg-slate-100 items-center justify-center border border-slate-200/60">
                  <Feather name="folder" size={24} color="#94A3B8" />
                </View>
                <View className="items-center px-6">
                  <Text className="text-base font-bold text-slate-800 text-center">
                    {t("dashboard.empty_title")}
                  </Text>
                  <Text className="text-xs text-slate-400 mt-1.5 text-center leading-relaxed">
                    {t("dashboard.empty_description")}
                  </Text>
                </View>
                <View className="flex-row gap-3 mt-2 px-2">
                  <TouchableOpacity
                    onPress={() => setShowJoinModal(true)}
                    activeOpacity={0.7}
                    className="bg-white border border-slate-200/90 py-2.5 px-4 rounded-xl flex-row items-center gap-2 shadow-xs"
                    style={{
                      shadowColor: "#0F172A",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.05,
                      shadowRadius: 2,
                      elevation: 1,
                    }}
                  >
                    <Feather name="users" size={15} color="#64748B" />
                    <Text className="text-slate-700 font-bold text-xs">
                      {t("dashboard.join_team")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowCreateModal(true)}
                    activeOpacity={0.85}
                    className="bg-[#0052FF] py-2.5 px-4 rounded-xl flex-row items-center gap-2 shadow-sm"
                    style={{
                      shadowColor: "#0052FF",
                      shadowOffset: { width: 0, height: 3 },
                      shadowOpacity: 0.2,
                      shadowRadius: 5,
                      elevation: 2,
                    }}
                  >
                    <Feather name="plus" size={15} color="#FFFFFF" />
                    <Text className="text-white font-bold text-xs">
                      {t("dashboard.create_team")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )
          }
          renderItem={({ item }) => (
            <RoomCard
              item={item}
              onPress={() => handleOpenRoom(item)}
            />
          )}
        />
      </View>

      {/* Modals */}
      <JoinRoomModal
        visible={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        onSuccess={(roomId) => {
          setShowJoinModal(false);
          router.push(`/room/${roomId}`);
        }}
      />

      <CreateRoomModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={(roomId) => {
          setShowCreateModal(false);
          router.push(`/room/${roomId}`);
        }}
      />
    </View>
  );
}

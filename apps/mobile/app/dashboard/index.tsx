import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  TextInput,
  Image,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { User } from "@supabase/supabase-js";
import { useTranslation } from "react-i18next";
import { supabase } from "../../lib/supabase";
import { useGetMeQuery } from "../../lib/redux/features/users/usersApi";
import { useGetMyRoomsQuery } from "../../lib/redux/features/rooms/roomsApi";
import { Feather } from "@expo/vector-icons";
import JoinRoomModal from "../../components/JoinRoomModal";
import CreateRoomModal from "../../components/CreateRoomModal";
import { toast } from "../../lib/toast";
import RoomCard from "../../components/dashboard/RoomCard";
import DashboardHeader from "../../components/dashboard/DashboardHeader";

export default function DashboardScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // Modals state
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  // Trạng thái pull-to-refresh
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: profile, refetch: refetchProfile } = useGetMeQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });
  const {
    data: rooms,
    isLoading: isRoomsLoading,
    refetch: refetchRooms,
  } = useGetMyRoomsQuery(undefined, { refetchOnMountOrArgChange: true });

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

  if (loading || isRoomsLoading) {
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
          {/* Join or Create buttons */}
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => setShowJoinModal(true)}
              className="flex-1 bg-blue-50 border border-blue-100 py-4 rounded-2xl flex-row justify-center items-center gap-2 active:bg-blue-100"
            >
              <Feather name="user-plus" size={16} color="#0052FF" />
              <Text className="text-[#0052FF] font-bold text-xs">
                {t("dashboard.join_team")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowCreateModal(true)}
              className="flex-1 bg-[#0052FF] py-4 rounded-2xl flex-row justify-center items-center gap-2 active:opacity-90"
            >
              <Feather name="plus" size={16} color="#ffffff" />
              <Text className="text-white font-bold text-xs">
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
              <View className="items-center justify-center py-20 gap-4">
                <View className="w-16 h-16 rounded-full bg-slate-100 items-center justify-center">
                  <Feather name="folder" size={24} color="#94A3B8" />
                </View>
                <View className="items-center">
                  <Text className="text-sm font-bold text-slate-800">
                    {t("dashboard.empty_title")}
                  </Text>
                  <Text className="text-xs text-slate-400 mt-1">
                    {t("dashboard.empty_description")}
                  </Text>
                </View>
              </View>
            )
          }
          renderItem={({ item }) => (
            <RoomCard
              item={item}
              onPress={() => router.push(`/room/${item._id}`)}
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

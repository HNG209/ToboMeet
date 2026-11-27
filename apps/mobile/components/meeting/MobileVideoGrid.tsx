import React, { useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  FlatList,
  useWindowDimensions,
} from "react-native";
import { TrackReference } from "@livekit/components-react";
import ParticipantTile from "./ParticipantTile";
import { useSelectiveSubscription } from "../../hooks/useSelectiveSubscription";

export default function MobileVideoGrid() {
  const { width: windowWidth } = useWindowDimensions();
  const { tracks, pages, currentPage, setCurrentPage } =
    useSelectiveSubscription();

  // Khóa vuốt chuyển trang của FlatList khi người dùng đang zoom vào screen share
  const [isScreenShareZoomed, setIsScreenShareZoomed] = useState(false);

  // Tự động mở khóa cuộn nếu đổi trang hoặc không còn trang screenshare
  useEffect(() => {
    const activePage = pages[currentPage];
    if (!activePage || activePage.type !== "screenshare") {
      setIsScreenShareZoomed(false);
    }
  }, [currentPage, pages]);

  const handleZoomChange = useCallback((zoomed: boolean) => {
    setIsScreenShareZoomed(zoomed);
  }, []);

  const renderPage = useCallback(
    ({ item }: { item: any }) => {
      const isScreenShare = item.type === "screenshare";
      const tracksCount = item.items.length;

      return (
        <View
          style={{ width: windowWidth }}
          className="flex-1 flex-row flex-wrap content-center justify-center"
        >
          {item.items.map((trackRef: TrackReference) => {
            let itemClass = "border border-[#232328] bg-[#121215]";

            if (isScreenShare || tracksCount === 1) {
              itemClass = "w-full h-full border-0 bg-[#121215]";
            } else if (tracksCount === 2) {
              itemClass += " w-full h-1/2";
            } else {
              itemClass += " w-1/2 h-1/2";
            }

            return (
              <View
                key={`${trackRef.participant.identity}_${trackRef.source}`}
                className={itemClass}
              >
                <ParticipantTile
                  trackRef={trackRef}
                  onZoomChange={isScreenShare ? handleZoomChange : undefined}
                />
              </View>
            );
          })}
        </View>
      );
    },
    [windowWidth, handleZoomChange],
  );

  if (tracks.length === 0) {
    return (
      <View className="flex-1 justify-center items-center bg-[#0a0a0c]">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="text-slate-400 mt-3 text-xs">
          Đang đợi người khác tham gia...
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#0a0a0c]">
      {/* Vùng hiển thị video chiếm trọn không gian phía trên thanh chấm phân trang */}
      <View className="flex-1">
        <FlatList
          data={pages}
          horizontal
          pagingEnabled
          scrollEnabled={!isScreenShareZoomed}
          showsHorizontalScrollIndicator={false}
          renderItem={renderPage}
          keyExtractor={(_, index) => `page_${index}`}
          onMomentumScrollEnd={(e) => {
            if (windowWidth <= 0) return;
            const newIndex = Math.round(
              e.nativeEvent.contentOffset.x / windowWidth,
            );
            setCurrentPage(newIndex);
          }}
          initialNumToRender={1}
          maxToRenderPerBatch={1}
          windowSize={3}
          removeClippedSubviews={true}
        />
      </View>

      {/* Chấm tròn phân trang nằm kẹp riêng giữa khung video và thanh dưới, không che nội dung */}
      {pages.length > 1 && (
        <View className="py-2 bg-[#0d0d10] border-t border-[#1c1c22] items-center justify-center">
          <View className="flex-row justify-center items-center bg-[#141418] border border-[#232328] py-1.5 px-2.5 rounded-full">
            {pages.map((_, index) => (
              <View
                key={index}
                className={`h-1.5 rounded-full mx-1 ${
                  currentPage === index
                    ? "w-4 bg-blue-500"
                    : "w-1.5 bg-[#4b4b58]"
                }`}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  StatusBar,
  SafeAreaView,
  Platform,
  ScrollView,
  Dimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import * as FileSystem from "expo-file-system/legacy";
import { ChatAttachment } from "../../types/chat";
import { useTranslation } from "react-i18next";

let WebView: any = null;
try {
  const rnw = require("react-native-webview");
  WebView = rnw?.WebView || rnw?.default || rnw;
} catch (e) {
  console.warn("react-native-webview is not available in native binary:", e);
  WebView = null;
}

let Sharing: any = null;
try {
  Sharing = require("expo-sharing");
} catch (e) {
  console.warn("expo-sharing is not available natively:", e);
}

interface MobileAttachmentViewerModalProps {
  visible: boolean;
  attachment: ChatAttachment | null;
  onClose: () => void;
  onDownload?: (attachment: ChatAttachment) => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function isPdfAttachment(attachment?: ChatAttachment | null): boolean {
  if (!attachment) return false;
  if (attachment.mimeType === "application/pdf") return true;
  if (attachment.fileName?.toLowerCase().endsWith(".pdf")) return true;
  if (attachment.url?.toLowerCase().includes(".pdf")) return true;
  return false;
}

export default function MobileAttachmentViewerModal({
  visible,
  attachment,
  onClose,
  onDownload,
}: MobileAttachmentViewerModalProps) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const screenWidth = Dimensions.get("window").width;
  const screenHeight = Dimensions.get("window").height;

  useEffect(() => {
    if (visible && attachment) {
      setHasError(false);
      setIsLoading(attachment.fileType === "image");

      if (isPdfAttachment(attachment)) {
        // Tự động mở tài liệu PDF siêu tốc bằng In-App Browser phần cứng của máy (< 1s)
        WebBrowser.openBrowserAsync(attachment.url, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
          toolbarColor: "#0F172A",
          controlsColor: "#FFFFFF",
        }).catch((err) => {
          console.warn("[AttachmentViewer] Auto open browser error:", err);
        });
      }
    }
  }, [visible, attachment?.url]);

  if (!visible || !attachment) return null;

  const isImage = attachment.fileType === "image";
  const isPdf = isPdfAttachment(attachment);

  // Xử lý tải file về thiết bị (Chỉ khi nhấn nút Download)
  const handleDownload = async () => {
    if (!attachment.url) return;
    if (onDownload) {
      onDownload(attachment);
      return;
    }

    setIsDownloading(true);
    try {
      const rawName = attachment.fileName || (isPdf ? "document.pdf" : "image.jpg");
      const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const localUri = `${FileSystem.documentDirectory}${Date.now()}_${safeName}`;

      const downloadResult = await FileSystem.downloadAsync(attachment.url, localUri);

      if (downloadResult.status !== 200) {
        throw new Error(
          t("chat.download_error", { defaultValue: "Không thể tải tập tin về máy." })
        );
      }

      if (Sharing && typeof Sharing.isAvailableAsync === "function") {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(downloadResult.uri, {
            mimeType:
              attachment.mimeType ||
              (isPdf ? "application/pdf" : isImage ? "image/jpeg" : "application/octet-stream"),
            dialogTitle: attachment.fileName || "Tải xuống",
            UTI: isPdf ? "com.adobe.pdf" : isImage ? "public.image" : "public.data",
          });
          return;
        }
      }

      Alert.alert(
        t("common.notice", { defaultValue: "Thông báo" }),
        t("chat.file_saved", { defaultValue: `Đã lưu tệp vào máy: ${downloadResult.uri}` })
      );
    } catch (err: any) {
      console.error("[AttachmentViewer] Download error:", err);
      Alert.alert(
        t("common.error", { defaultValue: "Lỗi" }),
        err?.message || t("chat.download_error", { defaultValue: "Tải file thất bại." })
      );
    } finally {
      setIsDownloading(false);
    }
  };

  // Nguồn dữ liệu render PDF
  // iOS WebKit có sẵn PDF renderer rất mượt.
  // Android WebView cần Google Docs Viewer URL để render inline bên trong WebView thay vì tải về.
  const pdfViewerUri =
    Platform.OS === "android"
      ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(attachment.url)}`
      : attachment.url;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0B1120" />
      <View className="flex-1 bg-slate-950">
        {/* Header Bar - Hạ xuống dưới thanh trạng thái của máy mà không dùng hook */}
        <View
          style={{
            paddingTop:
              Platform.OS === "android"
                ? (StatusBar.currentHeight || 32) + 12
                : 50,
            paddingBottom: 14,
          }}
          className="flex-row items-center justify-between px-3 bg-slate-900/95 border-b border-slate-800 z-20"
        >
          <TouchableOpacity
            onPress={onClose}
            className="w-10 h-10 rounded-full bg-slate-800/80 items-center justify-center active:opacity-70"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="x" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View className="flex-1 mx-3 items-center justify-center">
            <Text
              className="text-white font-semibold text-sm text-center"
              numberOfLines={1}
            >
              {attachment.fileName || (isPdf ? "Tài liệu PDF" : "Hình ảnh")}
            </Text>
          </View>

          {/* Nút Download độc lập */}
          <TouchableOpacity
            onPress={handleDownload}
            disabled={isDownloading}
            className="w-10 h-10 rounded-full bg-blue-600 items-center justify-center active:opacity-80 disabled:opacity-50"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {isDownloading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Feather name="download" size={18} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>

        {/* Content Viewer Body */}
        <View className="flex-1 bg-black justify-center items-center relative overflow-hidden">
          {/* Trạng thái Loading chung */}
          {isLoading && !hasError && (
            <View className="absolute inset-0 z-10 bg-black/70 items-center justify-center">
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text className="text-slate-300 text-xs mt-3 font-medium">
                {isPdf
                  ? t("chat.loading_pdf", { defaultValue: "Đang tải tài liệu PDF..." })
                  : t("chat.loading_image", { defaultValue: "Đang tải ảnh..." })}
              </Text>
            </View>
          )}

          {/* Trạng thái Error nếu không tải được */}
          {hasError && (
            <View className="items-center justify-center p-6 max-w-sm">
              <View className="w-16 h-16 rounded-full bg-red-500/10 items-center justify-center mb-3">
                <Feather name="alert-circle" size={32} color="#EF4444" />
              </View>
              <Text className="text-white font-bold text-base text-center mb-1">
                {t("chat.file_load_failed", { defaultValue: "Không thể hiển thị tệp" })}
              </Text>
              <Text className="text-slate-400 text-xs text-center mb-5 leading-relaxed">
                {t("chat.file_load_failed_hint", {
                  defaultValue: "Liên kết tệp có thể đã hết hạn hoặc không khả dụng. Bạn có thể nhấn Tải xuống để lưu về máy.",
                })}
              </Text>
              <TouchableOpacity
                onPress={handleDownload}
                className="bg-blue-600 px-5 py-2.5 rounded-xl flex-row items-center active:opacity-80"
              >
                <Feather name="download" size={16} color="#FFFFFF" />
                <Text className="text-white font-bold text-xs ml-2">
                  {t("chat.download_now", { defaultValue: "Tải file về máy" })}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 1. XEM ẢNH TRỰC TIẾP VỚI PINCH-TO-ZOOM */}
          {isImage && !hasError && (
            <ScrollView
              style={{ width: "100%", height: "100%" }}
              contentContainerStyle={{
                flexGrow: 1,
                justifyContent: "center",
                alignItems: "center",
              }}
              maximumZoomScale={3.5}
              minimumZoomScale={1}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              centerContent
            >
              <Image
                source={{ uri: attachment.url, cache: "force-cache" }}
                style={{
                  width: screenWidth,
                  height: screenHeight * 0.8,
                }}
                resizeMode="contain"
                onLoadStart={() => setIsLoading(true)}
                onLoadEnd={() => setIsLoading(false)}
                onError={() => {
                  setIsLoading(false);
                  setHasError(true);
                }}
              />
            </ScrollView>
          )}

          {/* 2. XEM PDF TRỰC TIẾP QUA IN-APP BROWSER TỐC ĐỘ CAO */}
          {isPdf && !hasError && (
            <View className="items-center justify-center p-6 bg-slate-900 border border-slate-800 rounded-3xl max-w-sm">
              <View className="w-20 h-20 rounded-2xl bg-red-500/10 items-center justify-center mb-4">
                <Feather name="file-text" size={44} color="#EF4444" />
              </View>
              <Text className="text-white font-bold text-base text-center mb-1" numberOfLines={2}>
                {attachment.fileName || "Tài liệu PDF"}
              </Text>
              <Text className="text-slate-400 text-xs text-center mb-6">
                {formatBytes(attachment.fileSize)}
              </Text>

              <View className="flex-col gap-3 w-full">
                <TouchableOpacity
                  onPress={async () => {
                    try {
                      await WebBrowser.openBrowserAsync(attachment.url, {
                        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
                        toolbarColor: "#0F172A",
                        controlsColor: "#FFFFFF",
                      });
                    } catch (err) {
                      console.warn("Failed to open browser:", err);
                    }
                  }}
                  activeOpacity={0.8}
                  className="w-full flex-row items-center justify-center bg-blue-600 py-3.5 rounded-xl shadow-lg"
                >
                  <Feather name="eye" size={16} color="#FFFFFF" />
                  <Text className="text-white font-bold text-sm ml-2">
                    {t("chat.view_document", { defaultValue: "Xem tài liệu ngay (Tốc độ cao)" })}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleDownload}
                  disabled={isDownloading}
                  activeOpacity={0.8}
                  className="w-full flex-row items-center justify-center bg-slate-800 border border-slate-700 py-3 rounded-xl disabled:opacity-50"
                >
                  {isDownloading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Feather name="download" size={16} color="#FFFFFF" />
                      <Text className="text-white font-bold text-xs ml-1.5">
                        {t("chat.download", { defaultValue: "Tải file về máy" })}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* 3. CÁC ĐỊNH DẠNG TẬP TIN KHÁC (ZIP, DOCX, ETC.) */}
          {!isImage && !isPdf && !hasError && (
            <View className="items-center justify-center p-6 bg-slate-900 border border-slate-800 rounded-3xl max-w-sm">
              <View className="w-20 h-20 rounded-2xl bg-blue-500/10 items-center justify-center mb-4">
                <Feather name="file-text" size={44} color="#3B82F6" />
              </View>
              <Text className="text-white font-bold text-base text-center mb-1" numberOfLines={2}>
                {attachment.fileName || "Tập tin đính kèm"}
              </Text>
              <Text className="text-slate-400 text-xs text-center mb-6">
                {formatBytes(attachment.fileSize)}
              </Text>
              <TouchableOpacity
                onPress={handleDownload}
                className="w-full bg-blue-600 py-3.5 px-6 rounded-2xl flex-row items-center justify-center active:opacity-80"
              >
                <Feather name="download" size={18} color="#FFFFFF" />
                <Text className="text-white font-bold text-sm ml-2">
                  {t("chat.download_file", { defaultValue: "Tải tệp về thiết bị" })}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

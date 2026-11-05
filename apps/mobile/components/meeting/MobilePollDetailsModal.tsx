import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { PollResponse } from "@tobomeet/shared/types";

interface MobilePollDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  poll: PollResponse | null;
  theme?: "dark" | "light";
}

export default function MobilePollDetailsModal({
  visible,
  onClose,
  poll,
  theme = "dark",
}: MobilePollDetailsModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isLight = theme === "light";

  if (!poll) return null;

  const totalVotes = poll.options.reduce(
    (sum, opt) => sum + (opt.voters?.length || 0),
    0,
  );

  const formattedDate = poll.createdAt
    ? new Date(poll.createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      })
    : "";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        className="flex-1 justify-end bg-black/70"
        style={{ paddingTop: Math.max(insets.top, 20) }}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          className="flex-1"
        />
        <View
          style={{
            height: "85%",
            paddingBottom: Math.max(insets.bottom, 20) + 12,
          }}
          className={`${
            isLight
              ? "bg-white border-t border-slate-200"
              : "bg-[#161619] border-t border-[#232328]"
          } rounded-t-3xl overflow-hidden flex-col`}
        >
          {/* Drag Handle */}
          <View
            className={`w-10 h-1 ${
              isLight ? "bg-slate-300" : "bg-[#3a3a42]"
            } rounded-full self-center mt-3 mb-1`}
          />

          {/* Header */}
          <View
            className={`flex-row items-center justify-between px-5 py-4 border-b ${
              isLight ? "border-slate-100" : "border-[#232328]"
            }`}
          >
            <View className="flex-row items-center gap-2.5 flex-1 pr-2">
              <View
                className={`p-2 rounded-xl ${
                  isLight
                    ? "bg-blue-50 border border-blue-200"
                    : "bg-blue-500/10 border border-blue-500/20"
                }`}
              >
                <Feather
                  name="bar-chart-2"
                  size={18}
                  color={isLight ? "#0052FF" : "#60a5fa"}
                />
              </View>
              <View className="flex-1">
                <Text
                  className={`${
                    isLight ? "text-slate-900" : "text-white"
                  } text-base font-bold`}
                  numberOfLines={1}
                >
                  {t("meeting.poll.poll_details_title", {
                    defaultValue: "Chi tiết cuộc bình chọn",
                  })}
                </Text>
                <View className="flex-row items-center gap-2 mt-0.5">
                  <Text
                    className={`${
                      isLight ? "text-slate-500" : "text-slate-400"
                    } text-xs`}
                  >
                    {poll.allowMultiple
                      ? t("meeting.poll.multiple_choice", {
                          defaultValue: "Chọn nhiều phương án",
                        })
                      : t("meeting.poll.single_choice", {
                          defaultValue: "Chọn 1 phương án",
                        })}
                  </Text>
                </View>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className={`p-2 rounded-lg ${
                isLight
                  ? "bg-slate-100 active:bg-slate-200"
                  : "bg-[#232328] active:bg-[#2e2e34]"
              }`}
            >
              <Feather
                name="x"
                size={18}
                color={isLight ? "#64748b" : "#94a3b8"}
              />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <ScrollView
            className="flex-1 p-5"
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Question Card */}
            <View
              className={`p-4 rounded-2xl ${
                isLight
                  ? "bg-slate-50 border border-slate-200"
                  : "bg-[#1f1f23] border border-[#2e2e35]"
              } mb-5`}
            >
              <Text
                className={`${
                  isLight ? "text-slate-900" : "text-white"
                } text-sm font-bold leading-5`}
              >
                {poll.question}
              </Text>
              <View
                className={`flex-row items-center justify-between pt-3 mt-3 border-t ${
                  isLight ? "border-slate-200" : "border-[#2a2a32]"
                }`}
              >
                <View className="flex-row items-center gap-1.5 flex-1">
                  {poll.creatorAvatar ? (
                    <Image
                      source={{ uri: poll.creatorAvatar }}
                      className="w-4 h-4 rounded-full"
                    />
                  ) : (
                    <Feather
                      name="user"
                      size={13}
                      color={isLight ? "#64748b" : "#94a3b8"}
                    />
                  )}
                  <Text
                    className={`text-xs ${
                      isLight ? "text-slate-500" : "text-slate-400"
                    }`}
                    numberOfLines={1}
                  >
                    {t("meeting.poll.created_by", { defaultValue: "Tạo bởi" })}:{" "}
                    <Text
                      className={`${
                        isLight ? "text-slate-800" : "text-slate-200"
                      } font-semibold`}
                    >
                      {poll.creatorName}
                    </Text>
                  </Text>
                </View>

                {formattedDate ? (
                  <View className="flex-row items-center gap-1 ml-2">
                    <Feather
                      name="clock"
                      size={11}
                      color={isLight ? "#94a3b8" : "#64748b"}
                    />
                    <Text
                      className={`text-[11px] ${
                        isLight ? "text-slate-500" : "text-slate-400"
                      } font-mono`}
                    >
                      {formattedDate}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Results Breakdown */}
            <View className="flex-row items-center justify-between mb-3">
              <Text
                className={`${
                  isLight ? "text-slate-600" : "text-slate-400"
                } text-xs font-bold uppercase tracking-wider`}
              >
                {t("meeting.poll.results_breakdown", {
                  defaultValue: "Kết quả bình chọn",
                })}
              </Text>
              <Text
                className={`${
                  isLight ? "text-slate-500" : "text-slate-400"
                } text-xs font-medium`}
              >
                {t("meeting.poll.votes_count", {
                  count: totalVotes,
                  defaultValue: `${totalVotes} lượt bình chọn`,
                })}
              </Text>
            </View>

            <View className="gap-3">
              {poll.options.map((option, idx) => {
                const voteCount = option.voters?.length || 0;
                const percentage =
                  totalVotes > 0
                    ? Math.round((voteCount / totalVotes) * 100)
                    : 0;

                return (
                  <View
                    key={option.id || idx}
                    className={`p-4 rounded-2xl ${
                      isLight
                        ? "bg-slate-50/80 border border-slate-200"
                        : "bg-[#1b1b1f] border border-[#2a2a32]"
                    }`}
                  >
                    {/* Option Text & Pct */}
                    <View className="flex-row items-start justify-between gap-3 mb-2">
                      <Text
                        className={`${
                          isLight ? "text-slate-800" : "text-slate-200"
                        } text-sm font-semibold flex-1 leading-5`}
                      >
                        {idx + 1}. {option.text}
                      </Text>
                      <View className="flex-row items-center gap-1">
                        <Text className="text-blue-600 text-sm font-bold">
                          {percentage}%
                        </Text>
                        <Text
                          className={`${
                            isLight ? "text-slate-500" : "text-slate-500"
                          } text-xs`}
                        >
                          ({voteCount})
                        </Text>
                      </View>
                    </View>

                    {/* Progress Bar */}
                    <View
                      className={`w-full h-2 rounded-full ${
                        isLight ? "bg-slate-200" : "bg-[#282830]"
                      } overflow-hidden mb-3`}
                    >
                      <View
                        className="h-full bg-blue-600 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </View>

                    {/* Voters List */}
                    <View
                      className={`pt-2 border-t ${
                        isLight ? "border-slate-200" : "border-[#26262e]"
                      }`}
                    >
                      <Text
                        className={`text-[11px] font-semibold ${
                          isLight ? "text-slate-500" : "text-slate-400"
                        } uppercase tracking-wider mb-2`}
                      >
                        {t("meeting.poll.voters_list", {
                          defaultValue: "Danh sách người bình chọn",
                        })}{" "}
                        ({voteCount}):
                      </Text>

                      {!option.voters || option.voters.length === 0 ? (
                        <Text
                          className={`text-xs ${
                            isLight ? "text-slate-400" : "text-slate-500"
                          } italic`}
                        >
                          {t("meeting.poll.no_voters_for_option", {
                            defaultValue:
                              "Chưa có ai bình chọn cho phương án này",
                          })}
                        </Text>
                      ) : (
                        <View className="gap-1.5">
                          {option.voters.map((voter) => (
                            <View
                              key={voter.userId}
                              className={`flex-row items-center justify-between p-2 rounded-xl ${
                                isLight
                                  ? "bg-white border border-slate-200"
                                  : "bg-[#222228]"
                              }`}
                            >
                              <View className="flex-row items-center gap-2 flex-1 pr-2">
                                {voter.avatar ? (
                                  <Image
                                    source={{ uri: voter.avatar }}
                                    className="w-5 h-5 rounded-full"
                                  />
                                ) : (
                                  <View
                                    className={`w-5 h-5 rounded-full ${
                                      isLight
                                        ? "bg-blue-100"
                                        : "bg-blue-600/30"
                                    } items-center justify-center`}
                                  >
                                    <Text
                                      className={`${
                                        isLight
                                          ? "text-blue-700"
                                          : "text-blue-300"
                                      } text-[10px] font-bold`}
                                    >
                                      {(voter.name || "U")
                                        .charAt(0)
                                        .toUpperCase()}
                                    </Text>
                                  </View>
                                )}
                                <Text
                                  className={`text-xs ${
                                    isLight ? "text-slate-800" : "text-slate-200"
                                  } font-medium flex-1`}
                                  numberOfLines={1}
                                >
                                  {voter.name}
                                </Text>
                              </View>

                              {voter.votedAt ? (
                                <Text
                                  className={`text-[10px] ${
                                    isLight
                                      ? "text-slate-400"
                                      : "text-slate-400"
                                  } font-mono`}
                                >
                                  {new Date(voter.votedAt).toLocaleTimeString(
                                    [],
                                    {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    },
                                  )}
                                </Text>
                              ) : null}
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>

          {/* Footer */}
          <View
            className={`px-5 pt-3 border-t ${
              isLight ? "border-slate-200" : "border-[#232328]"
            }`}
          >
            <TouchableOpacity
              onPress={onClose}
              className={`w-full py-3 rounded-xl ${
                isLight
                  ? "bg-slate-100 active:bg-slate-200"
                  : "bg-[#232328] active:bg-[#2e2e34]"
              } items-center`}
            >
              <Text
                className={`${
                  isLight ? "text-slate-700" : "text-slate-200"
                } font-semibold text-sm`}
              >
                {t("meeting.poll.close", { defaultValue: "Đóng" })}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

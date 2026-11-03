import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function LanguageSettingsScreen() {
  const { t, i18n } = useTranslation();

  const handleLanguageChange = async (newLocale: "vi" | "en") => {
    if (i18n.language.startsWith(newLocale)) return;
    await i18n.changeLanguage(newLocale);
    try {
      await AsyncStorage.setItem("settings.lang", newLocale);
    } catch (e) {
      console.log("Error saving locale to AsyncStorage:", e);
    }
  };

  return (
    <View className="flex-1 bg-slate-50">
      {/* Header */}
      <View className="px-6 py-4 bg-white border-b border-slate-100 flex-row items-center gap-4">
        <TouchableOpacity
          onPress={() => router.back()}
          className="p-1 -ml-1 rounded-full active:bg-slate-100"
        >
          <Feather name="arrow-left" size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-slate-900">
          {t("settings.tabs.language")}
        </Text>
      </View>

      {/* Content */}
      <ScrollView className="flex-1 p-6">
        <View className="gap-6">
          <View>
            <Text className="text-base font-bold text-slate-800">
              {t("settings.language.header")}
            </Text>
            <Text className="text-xs text-slate-400 mt-1 leading-relaxed">
              {t("settings.language.desc")}
            </Text>
          </View>

          {/* Language list */}
          <View className="gap-3">
            {/* Vietnamese */}
            <TouchableOpacity
              onPress={() => handleLanguageChange("vi")}
              className={`flex-row items-center justify-between px-5 py-4 rounded-2xl border ${
                i18n.language.startsWith("vi")
                  ? "border-[#0052FF] bg-blue-50/10"
                  : "border-slate-200/80 bg-white"
              }`}
            >
              <View className="flex-row items-center gap-4">
                <Text className="text-2xl">🇻🇳</Text>
                <View>
                  <Text className="font-bold text-slate-800">
                    {t("settings.language.vietnamese")}
                  </Text>
                  <Text className="text-[10px] text-slate-400 mt-0.5">
                    Vietnamese
                  </Text>
                </View>
              </View>
              {i18n.language.startsWith("vi") ? (
                <View className="w-5 h-5 rounded-full bg-[#0052FF] items-center justify-center">
                  <Feather name="check" size={12} color="#ffffff" />
                </View>
              ) : (
                <View className="w-5 h-5 rounded-full border border-slate-200" />
              )}
            </TouchableOpacity>

            {/* English */}
            <TouchableOpacity
              onPress={() => handleLanguageChange("en")}
              className={`flex-row items-center justify-between px-5 py-4 rounded-2xl border ${
                i18n.language.startsWith("en")
                  ? "border-[#0052FF] bg-blue-50/10"
                  : "border-slate-200/80 bg-white"
              }`}
            >
              <View className="flex-row items-center gap-4">
                <Text className="text-2xl">🇺🇸</Text>
                <View>
                  <Text className="font-bold text-slate-800">
                    {t("settings.language.english")}
                  </Text>
                  <Text className="text-[10px] text-slate-400 mt-0.5">
                    Tiếng Anh (Mỹ)
                  </Text>
                </View>
              </View>
              {i18n.language.startsWith("en") ? (
                <View className="w-5 h-5 rounded-full bg-[#0052FF] items-center justify-center">
                  <Feather name="check" size={12} color="#ffffff" />
                </View>
              ) : (
                <View className="w-5 h-5 rounded-full border border-slate-200" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}


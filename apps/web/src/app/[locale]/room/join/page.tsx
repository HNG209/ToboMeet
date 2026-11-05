"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  useJoinRoomMutation,
  useCheckMemberByCodeQuery,
  useGetRoomByCodeQuery,
} from "@/lib/redux/api/roomsApi";
import { Loader2, AlertCircle, Users } from "lucide-react";
import StoreProvider from "@/lib/redux/StoreProvider";

function JoinRoomContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const t = useTranslations("room");

  const {
    data: checkMemberData,
    isLoading: isCheckingMember,
    error: checkMemberError,
  } = useCheckMemberByCodeQuery(code || "", {
    skip: !code,
  });

  const {
    data: roomDetails,
    error: fetchRoomError,
    isLoading: isFetchRoomLoading,
  } = useGetRoomByCodeQuery(code || "", {
    skip: !code,
  });

  const [joinRoom, { isLoading: isJoining }] = useJoinRoomMutation();
  const [error, setError] = useState<string | null>(null);

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isCheckingMember && !isFetchRoomLoading) {
      if (checkMemberData !== undefined || roomDetails !== undefined) {
        // Có bất kỳ dữ liệu nào trả về thành công -> Đã đăng nhập
        setIsAuthenticated(true);
      } else if (checkMemberError || fetchRoomError) {
        // Lỗi 401/403 -> Chưa đăng nhập
        setIsAuthenticated(false);
      }
    }
  }, [
    isCheckingMember,
    isFetchRoomLoading,
    checkMemberData,
    roomDetails,
    checkMemberError,
    fetchRoomError,
  ]);

  const isAlreadyMember = checkMemberData?.isMember || false;
  // Lấy ID phòng từ roomDetails nếu đã là thành viên để phục vụ nút "Vào phòng"
  const existingRoomId = roomDetails?._id || null;

  const handleConfirmJoin = async () => {
    if (!code) return;
    setError(null);
    try {
      const room = await joinRoom({ code: code.trim() }).unwrap();
      router.replace(`/room/${room._id}`);
    } catch (err: any) {
      setError(err?.data?.message || err?.message || t("error_join_failed"));
    }
  };

  const handleGoToRoom = () => {
    if (existingRoomId) {
      router.replace(`/room/${existingRoomId}`);
    }
  };

  const handleCancelJoin = () => {
    router.replace("/dashboard");
  };

  if (!code) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-lg font-bold text-slate-900 mb-2">
            {t("error_missing_code_title")}
          </h1>
          <p className="text-sm text-slate-500 mb-6">
            {t("error_missing_code_desc")}
          </p>
          <button
            onClick={() => router.replace("/dashboard")}
            className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-semibold transition-colors"
          >
            {t("back_home")}
          </button>
        </div>
      </div>
    );
  }

  // Đang kiểm tra xác thực và nạp dữ liệu phòng
  if (isCheckingMember || isFetchRoomLoading || isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <Loader2 className="w-12 h-12 text-brand-600 animate-spin mx-auto mb-4" />
          <h1 className="text-lg font-bold text-slate-900 mb-2">
            {t("loading_title", { defaultValue: "Đang tải..." })}
          </h1>
          <p className="text-sm text-slate-500">{t("loading_preparing")}</p>
        </div>
      </div>
    );
  }

  // CHỈ HIỆN MÀN HÌNH LỖI (Phòng không tồn tại) NẾU ĐÃ ĐĂNG NHẬP THÀNH CÔNG NHƯNG PHÒNG SAI
  if (fetchRoomError && isAuthenticated === true) {
    const errData = fetchRoomError as any;
    if (
      errData.code === 403 ||
      errData.status === 403 ||
      errData.message?.includes("khóa") ||
      errData.message?.includes("locked")
    ) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
            <Loader2 className="w-12 h-12 text-brand-600 animate-spin mx-auto mb-4" />
            <h1 className="text-lg font-bold text-slate-900 mb-2">
              Đang chuyển hướng...
            </h1>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4 animate-bounce" />
          <h1 className="text-lg font-bold text-slate-900 mb-2">
            {t("error_not_exist_title")}
          </h1>
          <p className="text-sm text-slate-500 mb-6">
            {t("error_not_exist_desc")}
          </p>
          <button
            onClick={() => router.replace("/dashboard")}
            className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-semibold transition-colors"
          >
            {t("back_home")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-md w-full text-center animate-in fade-in zoom-in duration-300">
        <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-5 text-brand-600 border border-brand-100">
          <Users className="w-8 h-8" />
        </div>

        <h1 className="text-xl font-extrabold text-slate-900 mb-2">
          {isAuthenticated === false
            ? t("unauth_join_title", { defaultValue: "Tham gia nhóm" })
            : isAlreadyMember
              ? t("already_member_title")
              : t("join_room_title")}
        </h1>

        <p className="text-sm text-slate-600 mb-6">
          {isAuthenticated === false
            ? (roomDetails?.name
                ? t.rich("join_room_confirm", {
                    name: roomDetails.name,
                    strong2: (chunks) => (
                      <strong className="text-slate-950 font-bold">{chunks}</strong>
                    ),
                  })
                : t("unauth_join_desc", {
                    defaultValue:
                      "Bạn chưa đăng nhập. Vui lòng đăng nhập trên web hoặc mở ứng dụng ToboMeet để tiếp tục tham gia nhóm.",
                  }))
            : isAlreadyMember
              ? t.rich("already_member_confirm", {
                  name: roomDetails?.name || "",
                  strong2: (chunks) => (
                    <strong className="text-slate-950 font-bold">{chunks}</strong>
                  ),
                })
              : t.rich("join_room_confirm", {
                  name: roomDetails?.name || "",
                  strong2: (chunks) => (
                    <strong className="text-slate-950 font-bold">{chunks}</strong>
                  ),
                })}
        </p>

        {error && (
          <div className="flex items-center gap-2 mb-5 text-red-600 text-sm bg-red-50 p-3 rounded-xl border border-red-100 text-left">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {/* NÚT TRÊN WEB: Chờ xác định xong auth (isAuthenticated === true) mới hiện */}
          {isAuthenticated === true && (
            <div className="flex gap-4">
              <button
                onClick={handleCancelJoin}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all cursor-pointer"
              >
                {t("cancel_action")}
              </button>

              {isAlreadyMember ? (
                <button
                  onClick={handleGoToRoom}
                  className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold transition-all shadow-md shadow-brand-600/10 cursor-pointer"
                >
                  {t("go_to_room_action")}
                </button>
              ) : (
                <button
                  onClick={handleConfirmJoin}
                  disabled={isJoining}
                  className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-md shadow-brand-600/10 cursor-pointer"
                >
                  {isJoining && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{t("confirm_join_action")}</span>
                </button>
              )}
            </div>
          )}

          {/* NÚT KHI CHƯA ĐĂNG NHẬP: Có cả mở app mobile lẫn đăng nhập trên web kèm redirect */}
          {isAuthenticated === false && (
            <div className="flex flex-col gap-3">
              {code && (
                <a
                  href={`intent://room/join?code=${code.trim()}#Intent;scheme=tobomeet;package=com.hng209.mobile;end;`}
                  className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-md shadow-brand-600/10"
                >
                  {t("unauth_open_app", { defaultValue: "Mở ToboMeet App" })}
                </a>
              )}
              <Link
                href={`/login?redirect=${encodeURIComponent(`/room/join?code=${code?.trim() || ""}`)}`}
                className="w-full py-3 bg-[#333] hover:bg-[#444] text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-md border border-[#444]"
              >
                {t("unauth_login_web", { defaultValue: "Đăng nhập trên Web" })}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function JoinRoomPage() {
  const t = useTranslations("room");

  return (
    <StoreProvider>
      <Suspense
        fallback={
          <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
              <Loader2 className="w-12 h-12 text-brand-600 animate-spin mx-auto mb-4" />
              <h1 className="text-lg font-bold text-slate-900 mb-2">
                {t("loading_title", { defaultValue: "Đang tải..." })}
              </h1>
            </div>
          </div>
        }
      >
        <JoinRoomContent />
      </Suspense>
    </StoreProvider>
  );
}

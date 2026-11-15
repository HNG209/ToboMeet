// src/meetings/attendance.service.ts
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { RoomServiceClient } from "livekit-server-sdk";
import { isLoadTestMode, createMockLiveKitProxy } from "./utils/mock-livekit.util";
import { AppException } from "../core/exceptions/app.exception";
import { ErrorCode } from "@tobomeet/shared/types";
import {
    Attendance,
    AttendanceDocument,
} from "./schemas/attendance.schema";
import {
    MeetingSession,
    MeetingSessionDocument,
} from "./schemas/meeting-session.schema";
import * as ExcelJS from 'exceljs';
import {
    getAttendanceExportDict,
    formatExportDuration,
} from "./i18n/attendance-export.i18n";

const formatDate = (dateInput?: Date): string => {
    if (!dateInput) return '-';

    const d = new Date(dateInput);
    const pad = (n: number) => n.toString().padStart(2, '0');

    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    const seconds = pad(d.getSeconds());

    const day = pad(d.getDate());
    const month = pad(d.getMonth() + 1); // Tháng trong JS bắt đầu từ 0
    const year = d.getFullYear();

    return `${hours}:${minutes}:${seconds} ${day}/${month}/${year}`;
};

@Injectable()
export class AttendanceService {
    private readonly logger = new Logger(AttendanceService.name);
    private livekitRoomService: RoomServiceClient;

    constructor(
        @InjectModel(Attendance.name)
        private attendanceModel: Model<AttendanceDocument>,
        @InjectModel(MeetingSession.name)
        private sessionModel: Model<MeetingSessionDocument>,
    ) {
        const livekitHost = process.env.LIVEKIT_API_URL;
        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;

        if (isLoadTestMode()) {
            this.livekitRoomService = createMockLiveKitProxy<RoomServiceClient>("AttendanceService");
        } else if (livekitHost && apiKey && apiSecret) {
            this.livekitRoomService = new RoomServiceClient(
                livekitHost,
                apiKey,
                apiSecret,
            );
        }
    }

    /**
     * Tìm session đang ongoing theo meetingCode
     */
    private async findOngoingSession(meetingCode: string) {
        return this.sessionModel
            .findOne({ meetingCode, status: "ongoing" })
            .lean()
            .exec();
    }

    /**
     * User join phòng
     */
    async markJoined(
        meetingCode: string,
        userId: string,
        displayName?: string,
    ) {
        if (
            !userId ||
            userId.startsWith("EG_") ||
            userId.startsWith("agent-") ||
            userId.includes("stt-transcriber") ||
            displayName?.includes("stt-transcriber")
        ) {
            return;
        }

        const session = await this.findOngoingSession(meetingCode);
        if (!session) return;

        const sessionId = session._id.toString();
        const now = new Date();

        const existing = await this.attendanceModel
            .findOne({ sessionId, userId }, { visits: 1 })
            .lean();

        const hasOpenVisit = existing?.visits?.some((v) => !v.leftAt);
        if (hasOpenVisit) {
            // Reconnect → chỉ cập nhật tên
            if (displayName) {
                await this.attendanceModel.updateOne(
                    { sessionId, userId },
                    { $set: { displayName } },
                );
            }
            return;
        }

        await this.attendanceModel.findOneAndUpdate(
            { sessionId, userId },
            {
                $set: {
                    displayName,
                    meetingCode,
                },
                $push: {
                    visits: {
                        joinedAt: now,
                        durationSeconds: 0,
                    },
                },
                $setOnInsert: {
                    sessionId,
                    userId,
                    totalDurationSeconds: 0,
                },
            },
            { upsert: true },
        );
    }

    /**
     * User leave phòng
     */
    async markLeft(meetingCode: string, userId: string) {
        if (
            !userId ||
            userId.startsWith("EG_") ||
            userId.startsWith("agent-") ||
            userId.includes("stt-transcriber")
        ) {
            return;
        }

        const session = await this.findOngoingSession(meetingCode);
        if (!session) return;

        const sessionId = session._id.toString();
        const doc = await this.attendanceModel
            .findOne({ sessionId, userId })
            .lean();

        if (!doc?.visits?.length) return;

        const openIndex = doc.visits.findIndex((v) => !v.leftAt);
        if (openIndex === -1) return;

        const openVisit = doc.visits[openIndex];
        const leftAt = new Date();
        const thisDuration = Math.floor(
            (leftAt.getTime() - new Date(openVisit.joinedAt).getTime()) / 1000,
        );
        const newTotal = (doc.totalDurationSeconds || 0) + thisDuration;

        await this.attendanceModel.updateOne(
            { sessionId, userId },
            {
                $set: {
                    [`visits.${openIndex}.leftAt`]: leftAt,
                    [`visits.${openIndex}.durationSeconds`]: thisDuration,
                    totalDurationSeconds: newTotal,
                },
            },
        );
    }

    /**
     * Đóng tất cả visit đang mở khi phòng kết thúc
     */
    async closeAllOpenVisits(meetingCode: string) {
        const session = await this.findOngoingSession(meetingCode);
        if (!session) return;

        const sessionId = session._id.toString();
        const docs = await this.attendanceModel.find({
            sessionId,
            visits: { $elemMatch: { leftAt: { $exists: false } } },
        });

        if (docs.length === 0) return;

        const now = new Date();
        const bulkOps = docs
            .map((doc) => {
                const openIndex = doc.visits.findIndex((v) => !v.leftAt);
                if (openIndex === -1) return null;

                const openVisit = doc.visits[openIndex];
                const thisDuration = Math.floor(
                    (now.getTime() - openVisit.joinedAt.getTime()) / 1000,
                );
                const newTotal = (doc.totalDurationSeconds || 0) + thisDuration;

                return {
                    updateOne: {
                        filter: { _id: doc._id },
                        update: {
                            $set: {
                                [`visits.${openIndex}.leftAt`]: now,
                                [`visits.${openIndex}.durationSeconds`]: thisDuration,
                                totalDurationSeconds: newTotal,
                            },
                        },
                    },
                };
            })
            .filter(Boolean);

        if (bulkOps.length > 0) {
            await this.attendanceModel.bulkWrite(bulkOps as any);
        }
    }

    /**
     * Lấy danh sách điểm danh theo session
     */
    async getBySession(sessionId: string) {
        const list = await this.attendanceModel
            .find({ sessionId })
            .select("-__v")
            .lean();

        return list.map((item) => ({
            userId: item.userId,
            displayName: item.displayName,
            totalDurationSeconds: item.totalDurationSeconds,
            visitCount: item.visits?.length || 0,
            visits: item.visits,
            firstJoinedAt: item.visits?.[0]?.joinedAt,
            lastLeftAt: item.visits?.slice(-1)?.[0]?.leftAt,
        }));
    }

    async generateAttendanceExcel(
        attendances: AttendanceDocument[],
        lang: string = 'vi',
        mode: 'detailed' | 'minimal' | 'summary' = 'detailed',
    ): Promise<Buffer> {
        const dict = getAttendanceExportDict(lang);
        const workbook = new ExcelJS.Workbook();

        const isMinimal = mode === 'minimal' || mode === 'summary';
        const sheetTitle = isMinimal ? dict.sheetNameMinimal : dict.sheetNameDetailed;
        const sheet = workbook.addWorksheet(sheetTitle);

        if (isMinimal) {
            // Chế độ tối giản: STT, Tên, Vào đầu tiên, Ra cuối cùng, Tổng thời gian, Số lượt
            sheet.columns = [
                { header: dict.headers.stt, key: 'stt', width: 8 },
                { header: dict.headers.displayName, key: 'name', width: 28 },
                { header: dict.headers.firstJoinedAt, key: 'firstJoined', width: 24 },
                { header: dict.headers.lastLeftAt, key: 'lastLeft', width: 24 },
                { header: dict.headers.totalDuration, key: 'total', width: 20 },
                { header: dict.headers.visitCount, key: 'visitCount', width: 14 },
            ];

            attendances.forEach((record, index) => {
                const visits = record.visits || [];
                const firstJoined = visits.length > 0 ? formatDate(visits[0].joinedAt) : '-';
                let lastLeft = '-';
                if (visits.length > 0) {
                    const lastVisit = visits[visits.length - 1];
                    lastLeft = lastVisit.leftAt ? formatDate(lastVisit.leftAt) : dict.values.inCall;
                }

                sheet.addRow({
                    stt: index + 1,
                    name: record.displayName || dict.values.guest,
                    firstJoined,
                    lastLeft,
                    total: formatExportDuration(record.totalDurationSeconds, dict),
                    visitCount: visits.length,
                });
            });
        } else {
            // Chế độ chi tiết: STT, Tên, Tổng thời gian, Lượt, Vào, Ra, Thời lượng lượt
            sheet.columns = [
                { header: dict.headers.stt, key: 'stt', width: 8 },
                { header: dict.headers.displayName, key: 'name', width: 28 },
                { header: dict.headers.totalDuration, key: 'total', width: 20 },
                { header: dict.headers.visitIndex, key: 'visitIndex', width: 10 },
                { header: dict.headers.joinedAt, key: 'join', width: 24 },
                { header: dict.headers.leftAt, key: 'leave', width: 24 },
                { header: dict.headers.visitDuration, key: 'duration', width: 20 },
            ];

            let stt = 1;

            attendances.forEach((record) => {
                const visits = record.visits || [];
                if (visits.length > 0) {
                    visits.forEach((visit, index) => {
                        sheet.addRow({
                            stt: index === 0 ? stt : '',
                            name: record.displayName || dict.values.guest,
                            total: index === 0 ? formatExportDuration(record.totalDurationSeconds, dict) : '',
                            visitIndex: index + 1,
                            join: formatDate(visit.joinedAt),
                            leave: visit.leftAt ? formatDate(visit.leftAt) : dict.values.inCall,
                            duration: formatExportDuration(visit.durationSeconds, dict),
                        });
                    });
                } else {
                    sheet.addRow({
                        stt: stt,
                        name: record.displayName || dict.values.guest,
                        total: `0 ${dict.values.minutesUnit}`,
                        visitIndex: dict.values.none,
                        join: '-',
                        leave: '-',
                        duration: '-',
                    });
                }

                stt++; // Sang user tiếp theo
            });
        }

        // Định dạng Header sang trọng
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF1E40AF' }, // Dark Blue #1E40AF
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 28;

        // Định dạng viền và căn chỉnh cho toàn bộ các dòng dữ liệu
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                row.height = 22;
                row.eachCell((cell, colNumber) => {
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    };
                    // Cột Tên (cột 2) căn trái, còn lại căn giữa
                    if (colNumber === 2) {
                        cell.alignment = { vertical: 'middle', horizontal: 'left' };
                    } else {
                        cell.alignment = { vertical: 'middle', horizontal: 'center' };
                    }
                });
            }
        });

        const excelData = await workbook.xlsx.writeBuffer();
        return Buffer.from(excelData);
    }

    /**
     * Lấy điểm danh theo meetingCode (session ongoing hoặc gần nhất)
     */
    async getByMeetingCode(meetingCode: string, sessionId?: string) {
        let targetSessionId = sessionId;

        if (!targetSessionId) {
            const session = await this.sessionModel
                .findOne({ meetingCode })
                .sort({ createdAt: -1 })
                .lean();
            if (!session) return [];
            targetSessionId = session._id.toString();
        }

        return this.getBySession(targetSessionId);
    }

    /**
     * Xuất danh sách điểm danh ra file Excel:
     * Dùng batch get để lấy từng trang attendance rồi gọi generateAttendanceExcel.
     */
    async exportAttendanceExcel(
        meetingCode: string,
        sessionId?: string,
        lang: string = 'vi',
        mode: 'detailed' | 'minimal' | 'summary' = 'detailed',
    ): Promise<{ buffer: Buffer; fileName: string }> {
        let targetSessionId = sessionId;

        if (!targetSessionId) {
            const session = await this.sessionModel
                .findOne({ meetingCode })
                .sort({ createdAt: -1 })
                .lean();
            if (!session) {
                throw new AppException(ErrorCode.MEETING_NOT_FOUND);
            }
            targetSessionId = session._id.toString();
        }

        // Lấy tất cả attendance bằng batch processing
        const batchSize = 100;
        let skip = 0;
        const allAttendances: AttendanceDocument[] = [];
        let hasMore = true;

        while (hasMore) {
            const batch = await this.attendanceModel
                .find({ sessionId: targetSessionId })
                .sort({ createdAt: 1 })
                .skip(skip)
                .limit(batchSize)
                .exec();

            if (batch.length > 0) {
                allAttendances.push(...batch);
                skip += batch.length;
                if (batch.length < batchSize) {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }
        }

        const dict = getAttendanceExportDict(lang);
        const buffer = await this.generateAttendanceExcel(allAttendances, lang, mode);
        const isMinimal = mode === 'minimal' || mode === 'summary';
        const modeSuffix = isMinimal ? 'summary' : 'detailed';
        const fileName = `${dict.fileNamePrefix}-${meetingCode}-${targetSessionId.slice(-6)}-${modeSuffix}.xlsx`;

        return { buffer, fileName };
    }

    /**
     * Đổi tên người dùng trong cuộc họp:
     * 1. Cập nhật tên trong Attendance DB trước.
     * 2. Nếu ghi DB lỗi thì ném AppException.
     * 3. Sau đó gọi LiveKit RoomService để đồng bộ realtime cho mọi người trong phòng.
     */
    async renameParticipant(
        meetingCode: string,
        userId: string,
        newName: string,
    ): Promise<void> {
        if (!newName || !newName.trim()) {
            throw new BadRequestException("Tên người dùng không được để trống");
        }
        const trimmedName = newName.trim();

        // Cập nhật DB trước
        try {
            const session = await this.findOngoingSession(meetingCode);
            if (session) {
                const sessionId = session._id.toString();
                await this.attendanceModel.updateOne(
                    { sessionId, userId },
                    {
                        $set: {
                            displayName: trimmedName,
                            meetingCode,
                        },
                        $setOnInsert: {
                            sessionId,
                            userId,
                            totalDurationSeconds: 0,
                            visits: [],
                        },
                    },
                    { upsert: true },
                );
            } else {
                await this.attendanceModel.updateOne(
                    { meetingCode, userId },
                    { $set: { displayName: trimmedName } },
                );
            }
        } catch (error) {
            throw new AppException(ErrorCode.RENAME_PARTICIPANT_FAILED);
        }

        // Gọi LiveKit cập nhật realtime
        if (this.livekitRoomService) {
            try {
                await this.livekitRoomService.updateParticipant(
                    meetingCode,
                    userId,
                    { name: trimmedName },
                );
            } catch (error) {
                throw new AppException(ErrorCode.RENAME_PARTICIPANT_FAILED);
            }
        }
    }
}
import { Injectable, Logger } from "@nestjs/common";
import {
    RoomServiceClient,
    EgressClient,
    SegmentedFileOutput,
    SegmentedFileProtocol,
    S3Upload,
    EncodingOptionsPreset,
    EgressStatus,
} from "livekit-server-sdk";
import { isLoadTestMode, createMockLiveKitProxy } from "./utils/mock-livekit.util";
import { AppException } from "../core/exceptions/app.exception";
import { ErrorCode } from "@tobomeet/shared/types";
import * as crypto from "crypto";
import { InjectModel } from "@nestjs/mongoose";
import mongoose, { Model } from "mongoose";
import {
    MeetingSession,
    MeetingSessionDocument,
} from "./schemas/meeting-session.schema";

@Injectable()
export class RecordingsService {
    private livekitRoomService: RoomServiceClient;
    private egressClient: EgressClient;
    private readonly logger = new Logger(RecordingsService.name);

    constructor(
        @InjectModel(MeetingSession.name)
        private sessionModel: Model<MeetingSessionDocument>,
    ) {
        const livekitHost = process.env.LIVEKIT_API_URL || process.env.LIVEKIT_URL;
        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;

        if (isLoadTestMode()) {
            this.livekitRoomService = createMockLiveKitProxy<RoomServiceClient>("RecordingsService");
            this.egressClient = createMockLiveKitProxy<EgressClient>("RecordingsService.Egress");
        } else if (livekitHost && apiKey && apiSecret) {
            this.livekitRoomService = new RoomServiceClient(livekitHost, apiKey, apiSecret);
            this.egressClient = new EgressClient(livekitHost, apiKey, apiSecret);
        }
    }

    /**
     * Trích xuất sessionId trực tiếp từ LiveKit room metadata
     */
    private async extractSessionId(meetingCode: string): Promise<string> {
        if (!this.livekitRoomService) return "";
        try {
            const rooms = await this.livekitRoomService.listRooms([meetingCode]);
            if (rooms && rooms.length > 0 && rooms[0].metadata) {
                const meta = JSON.parse(rooms[0].metadata);
                return meta.sessionId || "";
            }
        } catch (error) {
            this.logger.error(`Lỗi khi trích xuất sessionId từ LiveKit room ${meetingCode}:`, error);
        }
        return "";
    }

    /**
     * Bắt đầu ghi hình cuộc họp bằng LiveKit Room Composite Egress (Xuất định dạng HLS thẳng lên Cloudflare R2)
     * Quy tắc:
     * - Chỉ cho phép quay phòng chính (không phải breakout)
     * - Chỉ 1 người quay duy nhất tại 1 thời điểm
     */
    async startRecording(meetingCode: string, userId?: string): Promise<void> {
        if (!this.egressClient || !this.livekitRoomService) {
            this.logger.error("EgressClient hoặc RoomServiceClient chưa được khởi tạo");
            throw new AppException(ErrorCode.SERVER_ERROR);
        }

        // 1. Chặn phòng breakout theo tên phòng
        if (meetingCode.includes("_sub_")) {
            throw new AppException(ErrorCode.CANNOT_RECORD_BREAKOUT_ROOM);
        }

        // 2. Lấy thông tin phòng và metadata từ LiveKit
        const rooms = await this.livekitRoomService.listRooms([meetingCode]);
        if (!rooms || rooms.length === 0) {
            throw new AppException(ErrorCode.MEETING_NOT_FOUND);
        }

        const room = rooms[0];
        let roomMeta: any = {};
        if (room.metadata) {
            try {
                roomMeta = JSON.parse(room.metadata);
            } catch (e) {
                this.logger.error(`Lỗi parse metadata phòng ${meetingCode}:`, e);
            }
        }

        // Chặn phòng breakout theo metadata
        if (roomMeta.roomType === "breakout") {
            throw new AppException(ErrorCode.CANNOT_RECORD_BREAKOUT_ROOM);
        }

        // Chặn phòng đã bật mã hóa đầu cuối (E2EE) vì Egress không thể giải mã
        if (roomMeta.isE2EE) {
            throw new AppException(ErrorCode.CANNOT_RECORD_E2EE_ROOM);
        }

        // 3. Đảm bảo chỉ 1 người quay duy nhất (chặn người khác)
        if (roomMeta.recording?.isRecording) {
            throw new AppException(ErrorCode.RECORDING_ALREADY_IN_PROGRESS);
        }

        const activeEgresses = await this.egressClient.listEgress({
            roomName: meetingCode,
            active: true,
        });

        if (activeEgresses.length > 0) {
            throw new AppException(ErrorCode.RECORDING_ALREADY_IN_PROGRESS);
        }

        const sessionId = await this.extractSessionId(meetingCode);
        const sessionFolder = sessionId || meetingCode;
        const recordingFolderName = `rec_${crypto.randomUUID()}`;
        const timestamp = Date.now();

        // 4. Cấu hình S3Upload kết nối Cloudflare R2
        const s3Upload = new S3Upload({
            endpoint: process.env.R2_ENDPOINT_URL || "",
            accessKey: process.env.R2_ACCESS_KEY_ID || "",
            secret: process.env.R2_SECRET_ACCESS_KEY || "",
            region: "auto",
            bucket: process.env.R2_BUCKET_NAME || "",
            forcePathStyle: true,
        });

        // 5. Cấu hình HLS SegmentedFileOutput đẩy thẳng lên R2
        const filenamePrefix = `recordings/${sessionFolder}/${recordingFolderName}/`;
        const playlistName = "index.m3u8";

        const hlsOutput = new SegmentedFileOutput({
            protocol: SegmentedFileProtocol.HLS_PROTOCOL,
            filenamePrefix,
            playlistName,
            segmentDuration: 6,
            output: {
                case: "s3",
                value: s3Upload,
            },
        });

        try {
            // 6. Khởi chạy Room Composite Egress
            // Template mặc định: Tự động chia lưới (grid) và tự động Spotlight màn hình khi có thành viên Screen Share
            const egressInfo = await this.egressClient.startRoomCompositeEgress(
                meetingCode,
                hlsOutput,
                {
                    layout: "grid",
                    encodingOptions: EncodingOptionsPreset.H264_1080P_30,
                }
            );

            this.logger.log(
                `[RecordingsService] Khởi động Room Composite Egress thành công: ${egressInfo.egressId} (phòng: ${meetingCode}, prefix: ${filenamePrefix})`
            );

            // 7. Cập nhật LiveKit Room Metadata để đồng bộ realtime trạng thái người quay
            roomMeta.recording = {
                isRecording: true,
                status: "recording",
                recorderId: userId || "",
                startedAt: timestamp,
                egressId: egressInfo.egressId,
                sessionFolder,
                recordingFolderName,
            };
            await this.livekitRoomService.updateRoomMetadata(
                meetingCode,
                JSON.stringify(roomMeta),
            );

            return;
        } catch (error) {
            if (error instanceof AppException) throw error;
            this.logger.error("Lỗi khi khởi động Room Composite Egress:", error);
            throw new AppException(ErrorCode.SERVER_ERROR);
        }
    }

    /**
     * Dừng toàn bộ các tiến trình ghi hình của phòng
     * Quy tắc: Chỉ người bắt đầu quay mới được phép dừng (trừ trường hợp forceStop)
     */
    async stopRecording(
        meetingCode: string,
        userId?: string,
        forceStop: boolean = false,
    ): Promise<void> {
        if (!this.egressClient) {
            throw new AppException(ErrorCode.SERVER_ERROR);
        }

        try {
            // Lấy metadata để kiểm tra quyền người dừng
            let roomMeta: any = {};
            if (this.livekitRoomService) {
                try {
                    const rooms = await this.livekitRoomService.listRooms([meetingCode]);
                    if (rooms && rooms.length > 0 && rooms[0].metadata) {
                        roomMeta = JSON.parse(rooms[0].metadata);
                    }
                } catch (e) {
                    this.logger.error(`Lỗi đọc metadata khi stopRecording: ${meetingCode}`, e);
                }
            }

            // Kiểm tra: Chỉ người bắt đầu quay mới có quyền dừng
            if (!forceStop && roomMeta.recording?.recorderId && userId) {
                if (roomMeta.recording.recorderId !== userId) {
                    throw new AppException(ErrorCode.ONLY_RECORDER_CAN_STOP_RECORDING);
                }
            }

            // Bắt toàn bộ các Egress đang chạy của phòng
            const activeEgresses = await this.egressClient.listEgress({
                roomName: meetingCode,
                active: true,
            });

            if (activeEgresses.length === 0) {
                // Xoá cờ recording trong metadata nếu còn sót
                if (this.livekitRoomService && roomMeta.recording) {
                    delete roomMeta.recording;
                    await this.livekitRoomService.updateRoomMetadata(
                        meetingCode,
                        JSON.stringify(roomMeta),
                    );
                }
                return;
            }

            // Dừng các tiến trình Egress đang chạy
            const stopPromises = activeEgresses.map((egress) =>
                this.egressClient.stopEgress(egress.egressId)
            );
            await Promise.all(stopPromises);
            this.logger.log(`[RecordingsService] Đã gửi lệnh dừng ${activeEgresses.length} Egress cho phòng ${meetingCode}`);

            // Cập nhật metadata: chuyển sang trạng thái đang dừng để tất cả client trong phòng đồng bộ
            if (this.livekitRoomService && roomMeta.recording) {
                roomMeta.recording.isRecording = false;
                roomMeta.recording.status = "stopping";
                await this.livekitRoomService.updateRoomMetadata(
                    meetingCode,
                    JSON.stringify(roomMeta),
                );
            }

            // Egress sẽ tự upload playlist hoàn chỉnh lên Cloudflare R2 và kích hoạt Webhook egress_ended
            return;
        } catch (error) {
            if (error instanceof AppException) throw error;
            this.logger.error("Lỗi khi dừng Egress:", error);
            throw new AppException(ErrorCode.SERVER_ERROR);
        }
    }

    /**
     * Tự động dừng ghi hình nếu người đang quay thoát khỏi cuộc họp
     */
    async handleParticipantLeft(meetingCode: string, userId: string): Promise<void> {
        if (!this.livekitRoomService || !this.egressClient) return;
        try {
            const rooms = await this.livekitRoomService.listRooms([meetingCode]);
            if (!rooms || rooms.length === 0 || !rooms[0].metadata) return;

            const meta = JSON.parse(rooms[0].metadata);
            if (meta.recording?.isRecording && meta.recording?.recorderId === userId) {
                this.logger.log(
                    `[RecordingsService] Người quay ${userId} đã thoát phòng ${meetingCode}. Đang tự động kết thúc ghi hình...`
                );
                await this.stopRecording(meetingCode, userId, true /* forceStop */);
            }
        } catch (error) {
            this.logger.error(
                `Lỗi khi xử lý tự động dừng quay cho người dùng ${userId} tại phòng ${meetingCode}:`,
                error,
            );
        }
    }

    /**
     * Xử lý webhook `egress_ended` từ LiveKit Server / LiveKit Cloud
     * Lưu thông tin bản ghi HLS trên Cloudflare R2 vào MongoDB MeetingSession
     */
    async handleEgressEnded(egressInfo: any): Promise<void> {
        if (!egressInfo) return;

        const { egressId, roomName: meetingCode, status } = egressInfo;
        if (meetingCode?.includes("_sub_")) {
            this.logger.log(`[RecordingsService] Bỏ qua egress_ended cho breakout room: ${meetingCode}`);
            return;
        }
        this.logger.log(`[RecordingsService] Nhận webhook egress_ended: ${egressId} (room: ${meetingCode}, status: ${status})`);

        // Dọn dẹp cờ recording trong room metadata khi Egress đã thoát hẳn
        if (this.livekitRoomService && meetingCode) {
            try {
                const rooms = await this.livekitRoomService.listRooms([meetingCode]);
                if (rooms && rooms.length > 0 && rooms[0].metadata) {
                    const meta = JSON.parse(rooms[0].metadata);
                    if (meta.recording) {
                        delete meta.recording;
                        await this.livekitRoomService.updateRoomMetadata(
                            meetingCode,
                            JSON.stringify(meta),
                        );
                    }
                }
            } catch (e) {
                this.logger.error(`[RecordingsService] Lỗi dọn dẹp metadata sau khi Egress kết thúc: ${meetingCode}`, e);
            }
        }

        if (status !== EgressStatus.EGRESS_COMPLETE && status !== 3) {
            this.logger.error(
                `[RecordingsService] Egress ${egressId} kết thúc không thành công. Status: ${status}, Error: ${egressInfo.error || egressInfo.details}`
            );
            return;
        }

        try {
            // 1. Trích xuất thông tin HLS segment kết quả
            const segmentResult = egressInfo.segmentResults?.[0];
            const sizeBytes = Number(segmentResult?.size || 0);

            // Tính thời lượng video (nanoseconds -> seconds)
            let durationSeconds = 0;
            if (segmentResult?.duration) {
                durationSeconds = Math.round(Number(segmentResult.duration) / 1e9);
            } else if (egressInfo.duration) {
                durationSeconds = Math.round(Number(egressInfo.duration) / 1e9);
            } else if (egressInfo.startedAt && egressInfo.endedAt) {
                durationSeconds = Math.round((Number(egressInfo.endedAt) - Number(egressInfo.startedAt)) / 1e9);
            }

            // 2. Chuẩn hóa storagePath: chỉ giữ phần relative path bắt đầu từ recordings/
            let storagePath = segmentResult?.playlistLocation || "";
            if (storagePath.includes("recordings/")) {
                storagePath = storagePath.substring(storagePath.indexOf("recordings/"));
            } else if (storagePath) {
                storagePath = storagePath.replace(/^s3:\/\/[^\/]+\//, "").replace(/^https?:\/\/[^\/]+\/[^\/]+\//, "").replace(/^\/+/, "");
            }

            // Fallback: nếu storagePath chưa có hoặc chỉ là index.m3u8, lấy từ cấu hình request ban đầu
            if (!storagePath || storagePath === "index.m3u8") {
                const reqSegments =
                    egressInfo.request?.roomComposite?.segmentOutputs?.[0] ||
                    egressInfo.request?.segmentOutputs?.[0];
                const prefix = reqSegments?.filenamePrefix || "";
                const playlistName = reqSegments?.playlistName || "index.m3u8";
                storagePath = `${prefix}${playlistName}`.replace(/^\/+/, "");
                if (storagePath.includes("recordings/")) {
                    storagePath = storagePath.substring(storagePath.indexOf("recordings/"));
                }
            }

            // 3. Phân tách sessionFolder và folderName từ storagePath
            // Cấu trúc: recordings/${sessionFolder}/${recordingFolderName}/index.m3u8
            const pathParts = storagePath.split("/");
            const folderName = pathParts.length >= 3 ? pathParts[pathParts.length - 2] : `rec_${crypto.randomUUID()}`;
            const sessionFolder = pathParts.length >= 3 ? pathParts[pathParts.length - 3] : meetingCode;

            // 4. Tạo URL công khai tới file playlist HLS
            const r2PublicUrl = process.env.R2_PUBLIC_URL || "";
            const playlistUrl = r2PublicUrl
                ? `${r2PublicUrl.replace(/\/$/, "")}/${storagePath}`
                : storagePath;

            const recordingItem = {
                recordingId: crypto.randomUUID(),
                folderName,
                storagePath,
                playlistUrl,
                durationSeconds,
                sizeBytes,
                createdAt: new Date(),
            };

            // 5. Tìm MeetingSession tương ứng để lưu
            let sessionDoc = null;
            if (sessionFolder && mongoose.Types.ObjectId.isValid(sessionFolder)) {
                sessionDoc = await this.sessionModel.findById(sessionFolder);
            }
            if (!sessionDoc && sessionFolder) {
                sessionDoc = await this.sessionModel.findOne({ sessionFolder });
            }
            if (!sessionDoc && meetingCode) {
                sessionDoc = await this.sessionModel.findOne({ meetingCode, status: "ongoing" });
            }
            if (!sessionDoc && meetingCode) {
                sessionDoc = await this.sessionModel.findOne({ meetingCode }).sort({ createdAt: -1 });
            }

            if (sessionDoc) {
                sessionDoc.recordings.push(recordingItem as any);
                if (!sessionDoc.sessionFolder) {
                    sessionDoc.sessionFolder = sessionFolder;
                }
                await sessionDoc.save();
                this.logger.log(
                    `[RecordingsService] Đã lưu bản ghi HLS ${recordingItem.recordingId} vào session ${sessionDoc._id} (meetingCode: ${meetingCode}, storagePath: ${storagePath})`
                );
            } else {
                const newSession = await this.sessionModel.create({
                    meetingCode: meetingCode || "default_meeting",
                    status: "ended",
                    sessionFolder,
                    recordings: [recordingItem],
                    startedAt: new Date(Date.now() - durationSeconds * 1000),
                    endedAt: new Date(),
                });
                this.logger.log(
                    `[RecordingsService] Đã tạo mới session ${newSession._id} chứa bản ghi HLS ${recordingItem.recordingId}`
                );
            }
        } catch (error) {
            this.logger.error(`[RecordingsService] Lỗi khi xử lý lưu bản ghi từ egress_ended cho phòng ${meetingCode}:`, error);
        }
    }
}

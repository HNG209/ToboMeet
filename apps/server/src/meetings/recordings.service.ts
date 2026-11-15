import { Injectable, Logger } from "@nestjs/common";
import {
    RoomServiceClient,
    TrackSource,
    EgressClient,
    EncodedFileOutput,
    DirectFileOutput,
    EncodedFileType,
} from "livekit-server-sdk";
import { isLoadTestMode, createMockLiveKitProxy } from "./utils/mock-livekit.util";
import { AppException } from "../core/exceptions/app.exception";
import { ErrorCode } from "@tobomeet/shared/types";
import { exec, execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { InjectModel } from "@nestjs/mongoose";
import mongoose, { Model } from "mongoose";
import { PutObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
    MeetingSession,
    MeetingSessionDocument,
} from "./schemas/meeting-session.schema";
import {
    RecordingWebhookDto,
    TimelineData,
    TimelineSegmentAudio,
    TimelineSegmentScreen,
} from "@tobomeet/shared/types"

const execPromise = promisify(exec);
const execFilePromise = promisify(execFile);

@Injectable()
export class RecordingsService {
    private livekitRoomService: RoomServiceClient;
    private egressClient: EgressClient;
    private readonly logger = new Logger(RecordingsService.name);

    constructor(
        @InjectQueue("meeting") private meetingQueue: Queue,
        @InjectModel(MeetingSession.name)
        private sessionModel: Model<MeetingSessionDocument>,
    ) {
        const livekitHost = process.env.LIVEKIT_API_URL;
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
     * Trích xuất sessionId trực tiếp từ LiveKit room metadata (tránh query database)
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
     * Bắt đầu ghi hình phân tách: Âm thanh tổng (MP4) + Màn hình chia sẻ (WebM Raw)
     * Quy tắc:
     * - Chỉ cho phép quay phòng chính (không phải breakout)
     * - Chỉ 1 người quay duy nhất tại 1 thời điểm
     */
    async startRecording(meetingCode: string, userId?: string): Promise<void> {
        if (!this.egressClient || !this.livekitRoomService) {
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
        const folderName = sessionId || meetingCode;
        const timestamp = Date.now();
        const egressJobs: string[] = [];

        const audioOutput = new EncodedFileOutput({
            fileType: EncodedFileType.MP4,
            filepath: `/out/${folderName}/${meetingCode}-${timestamp}-audio.mp4`,
        });

        try {
            const audioJob = await this.egressClient.startRoomCompositeEgress(
                meetingCode,
                audioOutput,
                { audioOnly: true, videoOnly: false }
            );
            egressJobs.push(audioJob.egressId);

            const participants = await this.livekitRoomService.listParticipants(meetingCode);
            let screenShareTrackId = null;

            for (const p of participants) {
                const track = p.tracks.find((t) => t.source === TrackSource.SCREEN_SHARE);
                if (track) {
                    screenShareTrackId = track.sid;
                    break; // Lấy luồng màn hình đầu tiên tìm thấy
                }
            }

            if (screenShareTrackId) {
                const screenOutput = new DirectFileOutput({
                    filepath: `/out/${folderName}/${meetingCode}-${timestamp}-screen.webm`,
                });

                const screenJob = await this.egressClient.startTrackEgress(
                    meetingCode,
                    screenOutput,
                    screenShareTrackId
                );
                egressJobs.push(screenJob.egressId);
            }

            // Cập nhật LiveKit Room Metadata để đồng bộ realtime trạng thái người quay
            roomMeta.recording = {
                isRecording: true,
                recorderId: userId || "",
                startedAt: timestamp,
            };
            await this.livekitRoomService.updateRoomMetadata(
                meetingCode,
                JSON.stringify(roomMeta),
            );

            return;
        } catch (error) {
            if (error instanceof AppException) throw error;
            console.error("Lỗi khi khởi động Egress:", error);
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

            // Trích xuất sessionId trực tiếp từ LiveKit room metadata để truyền vào worker mà không cần fetch DB
            const sessionId = await this.extractSessionId(meetingCode);

            // Tắt đồng loạt
            const stopPromises = activeEgresses.map((egress) =>
                this.egressClient.stopEgress(egress.egressId)
            );

            await Promise.all(stopPromises);

            // Cập nhật metadata xoá thông tin quay
            if (this.livekitRoomService && roomMeta.recording) {
                delete roomMeta.recording;
                await this.livekitRoomService.updateRoomMetadata(
                    meetingCode,
                    JSON.stringify(roomMeta),
                );
            }

            await this.meetingQueue.add(
                "process-recording",
                { meetingCode, sessionId },
                {
                    delay: 10000,      // Đợi 10 giây để Egress chép xong file JSON/Video ra ổ cứng
                    removeOnComplete: true, // Chạy xong tự xóa khỏi Redis cho nhẹ máy
                    attempts: 3,       // Tự động thử lại tối đa 3 lần nếu FFmpeg lỗi
                    backoff: {
                        type: 'exponential',
                        delay: 5000      // Nếu lỗi, lần 1 đợi 5s, lần 2 đợi 10s...
                    }
                }
            );

            return;
        } catch (error) {
            if (error instanceof AppException) throw error;
            console.error("Lỗi khi dừng Egress:", error);
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
     * (Webhook) Tự động bắt luồng màn hình mới nếu phòng đang trong trạng thái ghi hình
     */
    async handleNewScreenShareTrack(meetingCode: string, trackId: string) {
        if (!this.egressClient) return;

        try {
            // Kiểm tra xem phòng này có đang được ghi hình (quay audio) không
            const activeEgresses = await this.egressClient.listEgress({
                roomName: meetingCode,
                active: true,
            });

            if (activeEgresses.length === 0) return;

            const sessionId = await this.extractSessionId(meetingCode);
            const folderName = sessionId || meetingCode;

            const screenOutput = new DirectFileOutput({
                filepath: `/out/${folderName}/${meetingCode}-${Date.now()}-screen.webm`,
            });

            await this.egressClient.startTrackEgress(
                meetingCode,
                screenOutput,
                trackId
            );
        } catch (error) {
            console.error("Lỗi khi tự động quay màn hình từ Webhook:", error);
        }
    }

    /**
    * (Worker) Xử lý hậu kì (ghép audio và screenshare) khi kết thúc quay cuộc họp
    */
    async handlePostProcessing(meetingCode: string, sessionId?: string) {
        try {
            const basePath = process.env.RECORDING_STORAGE_PATH || path.join(process.cwd(), "recordings");
            const folderName = sessionId || meetingCode;
            let recordingsDir = path.join(basePath, folderName);

            let stats = await fs.stat(recordingsDir).catch(() => null);
            if (!stats || !stats.isDirectory()) {
                // Fallback kiểm tra nếu lưu bằng meetingCode
                const fallbackDir = path.join(basePath, meetingCode);
                const fallbackStats = await fs.stat(fallbackDir).catch(() => null);
                if (fallbackStats && fallbackStats.isDirectory()) {
                    recordingsDir = fallbackDir;
                } else {
                    this.logger.warn(`Thư mục recordings không tồn tại cho ${folderName} (hoặc ${meetingCode})`);
                    return;
                }
            }

            const files = await fs.readdir(recordingsDir);
            const jsonFiles = files.filter(f => f.endsWith(".json"));

            let audioManifest: any = null;
            let audioFileLocalPath = "";
            const screenSegments: { file: string; startOffset: number; endOffset: number }[] = [];
            const processedJsonFiles: string[] = [];
            const processedMediaFiles: string[] = [];

            // Phân tích các file JSON để tìm Audio gốc và các đoạn Video
            for (const jsonFile of jsonFiles) {
                const jsonFilePath = path.join(recordingsDir, jsonFile);
                const jsonContent = await fs.readFile(jsonFilePath, "utf8");
                const manifest = JSON.parse(jsonContent);

                if (!manifest.files || manifest.files.length === 0) continue;

                const internalFilename = manifest.files[0].filename; // vd: /out/<folder>/...-audio.mp4
                const actualFileName = path.basename(internalFilename);
                const actualFilePath = path.join(recordingsDir, actualFileName);

                if (internalFilename.includes("audio")) {
                    audioManifest = manifest;
                    audioFileLocalPath = actualFilePath;
                    processedJsonFiles.push(jsonFilePath);
                    processedMediaFiles.push(actualFilePath);
                } else if (internalFilename.includes("screen")) {
                    screenSegments.push({
                        manifest,
                        actualFilePath
                    } as any);
                    processedJsonFiles.push(jsonFilePath);
                    processedMediaFiles.push(actualFilePath);
                }
            }

            if (!audioManifest) {
                this.logger.warn(`Không tìm thấy file audio cho ${meetingCode} (folder: ${folderName}). Hủy ghép video.`);
                return;
            }

            // Dùng trực tiếp folderName (sessionId) làm sessionFolder trên local và R2
            const sessionFolder = folderName;

            // Tạo tên thư mục ngẫu nhiên cho lần recording này (hậu kỳ cục bộ và R2)
            const recordingFolderName = `rec_${crypto.randomUUID()}`;

            // Thời gian bắt đầu tuyệt đối (Nanoseconds -> Seconds)
            const audioStartTime = audioManifest.started_at;

            // Tính toán Timeline cho từng đoạn Screen Share (có Calibration)
            const segmentsToRender = await Promise.all(
                screenSegments.map(async (seg: any) => {
                    // Tính offset gốc từ manifest
                    let startOffset = (seg.manifest.started_at - audioStartTime) / 1e9;
                    let endOffset = (seg.manifest.ended_at - audioStartTime) / 1e9;

                    // startOffset += this.CALIBRATION_OFFSET;
                    // endOffset += this.CALIBRATION_OFFSET;

                    // Không cho giá trị âm
                    startOffset = Math.max(0, startOffset);
                    endOffset = Math.max(startOffset, endOffset);

                    // Lấy duration thực từ file để chính xác hơn
                    try {
                        const { stdout } = await execPromise(
                            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${seg.actualFilePath}"`
                        );
                        const realDuration = parseFloat(stdout.trim());
                        if (!isNaN(realDuration) && realDuration > 0) {
                            endOffset = startOffset + realDuration;
                        }
                    } catch (err) {
                        this.logger.warn(`Không lấy được duration thực của ${seg.actualFilePath}, dùng ended_at`);
                    }

                    return {
                        file: seg.actualFilePath,
                        startOffset,
                        endOffset,
                    };
                })
            );

            segmentsToRender.sort((a, b) => a.startOffset - b.startOffset);

            // Tạo một thư mục con riêng biệt với tên random để chứa playlist (.m3u8) và các phân đoạn (.ts)
            const hlsOutputDir = path.join(recordingsDir, recordingFolderName);
            await fs.mkdir(hlsOutputDir, { recursive: true });

            const finalOutputPath = path.join(hlsOutputDir, `index.m3u8`);

            let ffmpegCmd = `ffmpeg -y -f lavfi -i color=c=black:s=1920x1080:r=30 `;
            ffmpegCmd += `-i "${audioFileLocalPath}" `;

            // Input các đoạn screen
            segmentsToRender.forEach((seg) => {
                ffmpegCmd += `-i "${seg.file}" `;
            });

            let filterComplex = ``;
            let lastOutput = `0:v`;

            segmentsToRender.forEach((seg, index) => {
                const inputIndex = index + 2;
                const shifted = `shifted${index}`;
                const overlayOut = `out${index}`;

                filterComplex += `[${inputIndex}:v]scale=1920:1080:force_original_aspect_ratio=decrease,` +
                    `pad=1920:1080:(ow-iw)/2:(oh-ih)/2,` +
                    `setpts=PTS-STARTPTS+${seg.startOffset}/TB[${shifted}];`;

                filterComplex += `[${lastOutput}][${shifted}]overlay=x=0:y=0:` +
                    `enable='between(t,${seg.startOffset},${seg.endOffset})'[${overlayOut}];`;

                lastOutput = overlayOut;
            });

            // Định nghĩa cấu hình HLS (Cắt nhỏ file)
            const baseEncoding = `-c:v libx264 -preset veryfast -r 30 -crf 23 -c:a copy`;
            // -hls_time 10: Độ dài mỗi chunk video là 10 giây.
            // -hls_list_size 0: Lưu lại toàn bộ các chunk vào playlist
            const hlsConfig = `-f hls -hls_time 10 -hls_list_size 0 -hls_segment_filename "${path.join(hlsOutputDir, 'segment_%03d.ts')}"`;

            if (filterComplex.length > 0) {
                ffmpegCmd += `-filter_complex "${filterComplex}" ` +
                    `-map "[${lastOutput}]" -map 1:a ` +
                    `${baseEncoding} -shortest ${hlsConfig} "${finalOutputPath}"`;
            } else {
                ffmpegCmd += `-map 0:v -map 1:a ${baseEncoding} -shortest ${hlsConfig} "${finalOutputPath}"`;
            }

            this.logger.log(`Bắt đầu chạy FFmpeg (HLS) cho ${meetingCode} vào thư mục ${recordingFolderName}`);

            await execPromise(ffmpegCmd);
            this.logger.log(`Hậu kỳ HLS thành công cho ${meetingCode}. Bắt đầu đẩy lên Cloudflare R2...`);

            // Tính thời lượng thực tế của video HLS
            let durationSeconds = 0;
            try {
                const { stdout } = await execPromise(
                    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${finalOutputPath}"`
                );
                const parsed = parseFloat(stdout.trim());
                if (!isNaN(parsed) && parsed > 0) {
                    durationSeconds = Math.round(parsed);
                }
            } catch (e) {
                if (audioManifest.ended_at && audioManifest.started_at) {
                    durationSeconds = Math.round((audioManifest.ended_at - audioManifest.started_at) / 1e9);
                }
            }

            // Bắn thư mục HLS vừa tạo lên R2 Object Storage
            const uploadResult = await this.uploadHlsToR2(sessionFolder, recordingFolderName, hlsOutputDir);

            // Xoá các file raw và JSON đã xử lý để tránh xung đột cho lần quay sau
            for (const p of [...processedJsonFiles, ...processedMediaFiles]) {
                await fs.unlink(p).catch(() => null);
            }

            // Chèn recording metadata vào MeetingSession
            const storagePath = `recordings/${sessionFolder}/${recordingFolderName}/index.m3u8`;
            const r2PublicUrl = process.env.R2_PUBLIC_URL || "";
            const playlistUrl = r2PublicUrl
                ? `${r2PublicUrl.replace(/\/$/, "")}/${storagePath}`
                : storagePath;

            const recordingItem = {
                recordingId: crypto.randomUUID(),
                folderName: recordingFolderName,
                storagePath,
                playlistUrl,
                durationSeconds,
                sizeBytes: uploadResult?.totalSizeBytes || 0,
                createdAt: new Date(),
            };

            if (sessionId) {
                await this.sessionModel.findByIdAndUpdate(
                    sessionId,
                    {
                        $set: { sessionFolder },
                        $push: { recordings: recordingItem },
                    },
                    { new: true }
                );
                this.logger.log(
                    `Đã chèn recording ${recordingItem.recordingId} vào session ${sessionId} thành công (R2 path: ${storagePath}).`
                );
            } else {
                await this.sessionModel.findOneAndUpdate(
                    { meetingCode, status: "ongoing" },
                    {
                        $set: { sessionFolder },
                        $push: { recordings: recordingItem },
                    },
                    { new: true, sort: { createdAt: -1 } }
                );
                this.logger.log(
                    `Đã chèn recording ${recordingItem.recordingId} vào session của meeting ${meetingCode} (R2 path: ${storagePath}).`
                );
            }
        } catch (error) {
            this.logger.error(`Lỗi xử lý hậu kỳ cho ${meetingCode}:`, error);
        }
    }

    /**
     * (Worker) Xử lý hậu kì bản ghi cuộc họp nhận từ Webhook của Recorder Bot Python
     */
    async handleWebhookPostProcessing(payload: RecordingWebhookDto): Promise<void> {
        const { room_name, session_id, folder, r2 } = payload;

        const sessionFolder = session_id || room_name;
        // Tạo thư mục tạm cô lập để xử lý job này
        const tempId = crypto.randomUUID();
        const sessionDir = path.resolve(
            process.env.RECORDING_STORAGE_PATH || path.join(process.cwd(), "recordings"),
            "temp",
            `job_${sessionFolder}_${tempId}`
        );

        try {
            await fs.mkdir(sessionDir, { recursive: true });
            this.logger.log(`[Webhook Post-Processing] Thư mục làm việc tạm: ${sessionDir}`);

            // Tải timeline.json trực tiếp từ Cloudflare R2
            const timelinePath = path.join(sessionDir, "timeline.json");
            const bucketName = r2?.bucket_name || process.env.R2_BUCKET_NAME || "";
            const s3 = this.getR2Client(r2?.endpoint_url);
            const timelineKey = r2?.timeline_key || `${(r2?.folder_prefix || folder).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")}/timeline.json`;

            const downloadedTimeline = await this.downloadFromR2(s3, bucketName, timelineKey, timelinePath);
            if (!downloadedTimeline) {
                this.logger.error(`[Webhook Post-Processing] Không thể tải timeline.json từ R2 (key: ${timelineKey}). Hủy xử lý.`);
                await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => null);
                return;
            }

            let timeline: TimelineData;
            try {
                const rawContent = await fs.readFile(timelinePath, "utf8");
                timeline = JSON.parse(rawContent);
            } catch (err) {
                this.logger.error(`[Webhook Post-Processing] Không thể đọc/parse timeline.json tại ${timelinePath}:`, err);
                await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => null);
                return;
            }

            const audioSegments = timeline.audio_segments || [];
            const screenSegments = timeline.screen_segments || [];

            if (audioSegments.length === 0 && screenSegments.length === 0) {
                this.logger.error(`[Webhook Post-Processing] Không tìm thấy segment media nào trong timeline.json tại ${sessionDir}`);
                await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => null);
                return;
            }

            // Tải toàn bộ các file media thô (audio/screen) được liệt kê trong timeline từ R2 về thư mục tạm
            const folderPrefix = (r2?.folder_prefix || folder || `recordings/${room_name}/${session_id}`)
                .replace(/\\/g, "/")
                .replace(/^\/+|\/+$/g, "");

            const allFilesToCheck = [
                ...audioSegments.map((s) => s.file),
                ...screenSegments.filter((s) => !!s.file).map((s) => s.file),
            ];

            for (const fileName of allFilesToCheck) {
                if (!fileName) continue;
                const localFilePath = path.join(sessionDir, fileName);
                const s3Key = `${folderPrefix}/${fileName}`;
                this.logger.log(`[Webhook Post-Processing] Tải file thô từ R2 (${s3Key})...`);
                const ok = await this.downloadFromR2(s3, bucketName, s3Key, localFilePath);
                if (!ok) {
                    this.logger.warn(`[Webhook Post-Processing] Không thể tải file ${fileName} từ R2 (${s3Key})`);
                }
            }

            const allStarts = [
                ...audioSegments.map((s) => s.start),
                ...screenSegments.filter((s) => !!s.file).map((s) => s.start),
            ];
            const globalT0 = allStarts.length > 0 ? Math.min(...allStarts) : 0.0;
            this.logger.log(`[Webhook Post-Processing] global_t0 = ${globalT0.toFixed(3)}s`);

            // Input 0: Nền đen 1920x1080 r30
            const ffmpegArgs: string[] = [
                "-y",
                "-f", "lavfi",
                "-i", "color=c=black:s=1920x1080:r=30",
            ];

            // Input 1..N: Audio WAV inputs
            const audioInputIndices: { idx: number; seg: TimelineSegmentAudio }[] = [];
            let currentInputIdx = 1;

            for (const seg of audioSegments) {
                const audioFile = path.join(sessionDir, seg.file);
                try {
                    await fs.access(audioFile);
                    ffmpegArgs.push("-i", audioFile);
                    audioInputIndices.push({ idx: currentInputIdx, seg });
                    currentInputIdx++;
                } catch {
                    this.logger.warn(`[Webhook Post-Processing] File audio không tồn tại: ${audioFile}, bỏ qua.`);
                }
            }

            // Input N+1..M: Screen WebM inputs
            const screenInputIndices: {
                idx: number;
                seg: TimelineSegmentScreen;
                startOffset: number;
                endOffset: number;
            }[] = [];

            for (const seg of screenSegments) {
                if (!seg.file) continue;
                const screenFile = path.join(sessionDir, seg.file);
                try {
                    await fs.access(screenFile);
                } catch {
                    this.logger.warn(`[Webhook Post-Processing] File screen không tồn tại: ${screenFile}, bỏ qua.`);
                    continue;
                }

                const realDur = await this.getRealDuration(screenFile);
                const startOffset = Math.max(0.0, seg.start - globalT0);
                const endOffset = realDur ? startOffset + realDur : Math.max(startOffset, seg.end - globalT0);

                ffmpegArgs.push("-i", screenFile);
                screenInputIndices.push({
                    idx: currentInputIdx,
                    seg,
                    startOffset,
                    endOffset,
                });
                currentInputIdx++;
            }

            if (audioInputIndices.length === 0 && screenInputIndices.length === 0) {
                this.logger.error("[Webhook Post-Processing] Không có file media hợp lệ nào để ghép.");
                await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => null);
                return;
            }

            // Xây dựng filter_complex
            const filterParts: string[] = [];
            let lastVideoOut = "0:v";

            // Overlay từng đoạn screen
            for (const item of screenInputIndices) {
                const shiftedLabel = `shifted${item.idx}`;
                const overlayLabel = `vout${item.idx}`;

                filterParts.push(
                    `[${item.idx}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setpts=(PTS-STARTPTS)+${item.startOffset.toFixed(3)}/TB[${shiftedLabel}]`
                );
                filterParts.push(
                    `[${lastVideoOut}][${shiftedLabel}]overlay=x=0:y=0:enable='between(t,${item.startOffset.toFixed(3)},${item.endOffset.toFixed(3)})'[${overlayLabel}]`
                );
                lastVideoOut = overlayLabel;
            }

            // Delay & mix audio
            const delayedAudioLabels: string[] = [];
            for (const item of audioInputIndices) {
                const audioDelayMs = Math.max(0.0, (item.seg.start - globalT0) * 1000);
                const delayedLabel = `adelayed${item.idx}`;
                if (audioDelayMs > 0) {
                    filterParts.push(
                        `[${item.idx}:a]adelay=${Math.round(audioDelayMs)}:all=1[${delayedLabel}]`
                    );
                    delayedAudioLabels.push(`[${delayedLabel}]`);
                } else {
                    delayedAudioLabels.push(`[${item.idx}:a]`);
                }
            }

            let audioMap: string | null = null;
            if (delayedAudioLabels.length > 1) {
                const audioInputsStr = delayedAudioLabels.join("");
                filterParts.push(
                    `${audioInputsStr}amix=inputs=${delayedAudioLabels.length}:duration=longest[aout]`
                );
                audioMap = "[aout]";
            } else if (delayedAudioLabels.length === 1) {
                const label = delayedAudioLabels[0];
                if (label.includes("adelayed")) {
                    audioMap = label;
                } else {
                    audioMap = `${audioInputIndices[0].idx}:a`;
                }
            }

            if (filterParts.length > 0) {
                ffmpegArgs.push("-filter_complex", filterParts.join(";"));
                ffmpegArgs.push("-map", `[${lastVideoOut}]`);
            } else {
                ffmpegArgs.push("-map", "0:v");
            }

            if (audioMap) {
                ffmpegArgs.push("-map", audioMap);
            }

            const tempOutputMp4Path = path.join(sessionDir, "temp_output.mp4");
            ffmpegArgs.push(
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-r", "30",
                "-crf", "23",
                "-c:a", "aac",
                "-shortest",
                tempOutputMp4Path
            );

            this.logger.log(`[Webhook Post-Processing] Bắt đầu chạy FFmpeg tạo ${tempOutputMp4Path}...`);
            await execFilePromise("ffmpeg", ffmpegArgs);
            this.logger.log(`[Webhook Post-Processing] Ghép video FFmpeg thành công: ${tempOutputMp4Path}`);

            // Đóng gói sang playlist HLS (index.m3u8 + segments)
            const recordingFolderName = `rec_${crypto.randomUUID()}`;
            const hlsOutputDir = path.join(sessionDir, recordingFolderName);
            await fs.mkdir(hlsOutputDir, { recursive: true });

            const hlsPlaylistPath = path.join(hlsOutputDir, "index.m3u8");
            const hlsSegmentPattern = path.join(hlsOutputDir, "segment_%03d.ts");

            await execFilePromise("ffmpeg", [
                "-y",
                "-i", tempOutputMp4Path,
                "-c", "copy",
                "-f", "hls",
                "-hls_time", "10",
                "-hls_list_size", "0",
                "-hls_segment_filename", hlsSegmentPattern,
                hlsPlaylistPath,
            ]);

            // Tính thời lượng thực tế
            let durationSeconds = payload.duration_sec || (timeline.duration_sec ? Math.round(timeline.duration_sec) : 0);
            const realDuration = await this.getRealDuration(tempOutputMp4Path);
            if (realDuration) {
                durationSeconds = Math.round(realDuration);
            }

            // Đẩy toàn bộ thư mục HLS (chỉ gồm index.m3u8 và các file .ts) lên Cloudflare R2
            const uploadResult = await this.uploadHlsToR2(
                sessionFolder,
                recordingFolderName,
                hlsOutputDir,
                r2?.endpoint_url,
                r2?.bucket_name
            );

            // Dọn dẹp toàn bộ thư mục tạm trên local sau khi hoàn tất upload
            await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => null);

            // Cập nhật metadata bản ghi vào MongoDB MeetingSession
            const storagePath = `recordings/${sessionFolder}/${recordingFolderName}/index.m3u8`;
            const r2PublicUrl = r2?.public_base_url || process.env.R2_PUBLIC_URL || "";
            const playlistUrl = r2PublicUrl
                ? `${r2PublicUrl.replace(/\/$/, "")}/${storagePath}`
                : storagePath;

            const recordingItem = {
                recordingId: crypto.randomUUID(),
                folderName: recordingFolderName,
                storagePath,
                playlistUrl,
                durationSeconds,
                sizeBytes: uploadResult?.totalSizeBytes || 0,
                createdAt: new Date(),
            };

            let sessionDoc = null;
            if (session_id && mongoose.Types.ObjectId.isValid(session_id)) {
                sessionDoc = await this.sessionModel.findById(session_id);
            }
            if (!sessionDoc && session_id) {
                sessionDoc = await this.sessionModel.findOne({ sessionFolder: session_id });
            }
            if (!sessionDoc && room_name) {
                sessionDoc = await this.sessionModel.findOne({ meetingCode: room_name, status: "ongoing" });
            }
            if (!sessionDoc && room_name) {
                sessionDoc = await this.sessionModel.findOne({ meetingCode: room_name }).sort({ createdAt: -1 });
            }

            if (sessionDoc) {
                sessionDoc.recordings.push(recordingItem as any);
                if (!sessionDoc.sessionFolder) {
                    sessionDoc.sessionFolder = sessionFolder;
                }
                await sessionDoc.save();
                this.logger.log(
                    `[Webhook Post-Processing] Đã lưu recording ${recordingItem.recordingId} vào session ${sessionDoc._id} (meetingCode: ${sessionDoc.meetingCode})`,
                );
            } else {
                const newSession = await this.sessionModel.create({
                    meetingCode: room_name || "default_meeting",
                    status: "ended",
                    sessionFolder,
                    recordings: [recordingItem],
                    startedAt: new Date(Date.now() - durationSeconds * 1000),
                    endedAt: new Date(),
                });
                this.logger.log(
                    `[Webhook Post-Processing] Đã tạo mới session ${newSession._id} cho meeting ${room_name} chứa recording ${recordingItem.recordingId}`,
                );
            }
        } catch (error) {
            this.logger.error(`[Webhook Post-Processing] Lỗi trong quá trình xử lý hậu kì cho ${room_name}:`, error);
            await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => null);
        }
    }

    // Helper, utils...

    private getR2Client(customEndpoint?: string): S3Client {
        return new S3Client({
            region: "auto",
            endpoint: customEndpoint || process.env.R2_ENDPOINT_URL,
            credentials: {
                accessKeyId: process.env.R2_ACCESS_KEY_ID!,
                secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
            },
        });
    }

    private async downloadFromR2(
        s3: S3Client,
        bucketName: string,
        key: string,
        destPath: string,
    ): Promise<boolean> {
        try {
            const cleanKey = key.replace(/\\/g, "/").replace(/^\/+/, "");
            const res = await s3.send(
                new GetObjectCommand({
                    Bucket: bucketName,
                    Key: cleanKey,
                }),
            );
            if (!res.Body) return false;
            const bytes = await res.Body.transformToByteArray();
            await fs.mkdir(path.dirname(destPath), { recursive: true });
            await fs.writeFile(destPath, Buffer.from(bytes));
            return true;
        } catch (err) {
            this.logger.error(`Lỗi khi tải file ${key} từ R2 (bucket: ${bucketName}):`, err);
            return false;
        }
    }

    private async getRealDuration(filepath: string): Promise<number | null> {
        try {
            const { stdout } = await execFilePromise("ffprobe", [
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                filepath,
            ]);
            const val = parseFloat(stdout.trim());
            return !isNaN(val) && val > 0 ? val : null;
        } catch {
            return null;
        }
    }

    private async uploadHlsToR2(
        sessionFolder: string,
        recordingFolderName: string,
        hlsDirPath: string,
        customEndpoint?: string,
        customBucket?: string,
    ): Promise<{ totalSizeBytes: number; fileCount: number }> {
        const s3 = this.getR2Client(customEndpoint);

        let totalSizeBytes = 0;
        let fileCount = 0;

        try {
            const bucketName = customBucket || process.env.R2_BUCKET_NAME;
            const files = await fs.readdir(hlsDirPath);

            for (const file of files) {
                const filePath = path.join(hlsDirPath, file);
                const fileContent = await fs.readFile(filePath);
                totalSizeBytes += fileContent.length;
                fileCount++;

                // Cấu trúc thư mục trên R2: recordings/sessionFolder/recordingFolder/file
                const s3Key = `recordings/${sessionFolder}/${recordingFolderName}/${file}`;

                let contentType = 'application/octet-stream';
                if (file.endsWith('.m3u8')) contentType = 'application/x-mpegURL';
                else if (file.endsWith('.ts')) contentType = 'video/MP2T';
                else if (file.endsWith('.mp4')) contentType = 'video/mp4';
                else if (file.endsWith('.webm')) contentType = 'video/webm';
                else if (file.endsWith('.json')) contentType = 'application/json';

                await s3.send(new PutObjectCommand({
                    Bucket: bucketName,
                    Key: s3Key,
                    Body: fileContent,
                    ContentType: contentType,
                }));
            }

            this.logger.log(
                `Đã upload toàn bộ file HLS của recording ${recordingFolderName} (session: ${sessionFolder}) lên R2 (${fileCount} files, ${totalSizeBytes} bytes).`
            );

            // Dọn dẹp ổ cứng sau khi upload thành công
            await fs.rm(hlsDirPath, { recursive: true, force: true });
        } catch (error) {
            this.logger.error("Lỗi khi upload lên R2:", error);
        }

        return { totalSizeBytes, fileCount };
    }
}

import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { BreakoutRoomsService } from "../breakout-rooms.service";
import { AttendanceService } from "../attendance.service";
import { MeetingsService } from "../meetings.service";
import { RecordingsService } from "../recordings.service";
import { MeetingSummaryService } from "../meeting-summary.service";
import { TranscriptReadyWebhookDto } from "@tobomeet/shared/types";

export interface AutoEndBreakoutJobData {
  mainMeetingCode: string;
  sessionStartedAt: number;
}

export interface AttendanceJobData {
  meetingCode: string;
  userId: string;
  displayName?: string;
}

@Processor("meeting", { concurrency: 10 })
export class MeetingProcessor extends WorkerHost {
  private readonly logger = new Logger(MeetingProcessor.name);

  constructor(
    private readonly breakoutRoomsService: BreakoutRoomsService,
    private readonly attendanceService: AttendanceService,
    private readonly meetingsService: MeetingsService,
    private readonly recordingService: RecordingsService,
    private readonly meetingSummaryService: MeetingSummaryService,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    this.logger.log(`Processing job ${job.name} (ID: ${job.id})`);

    switch (job.name) {
      case "auto-end-breakout": {
        const { mainMeetingCode, sessionStartedAt } = job.data;
        await this.breakoutRoomsService.handleAutoEndBreakout(
          mainMeetingCode,
          sessionStartedAt,
        );
        break;
      }

      case "attendance-joined": {
        const { meetingCode, userId, displayName } =
          job.data as AttendanceJobData;
        if (this.meetingsService.isBreakoutRoomCode(meetingCode)) break;
        await this.attendanceService.markJoined(
          meetingCode,
          userId,
          displayName,
        );
        break;
      }

      case "attendance-left": {
        const { meetingCode, userId } = job.data as AttendanceJobData;
        if (this.meetingsService.isBreakoutRoomCode(meetingCode)) break;
        await this.recordingService.handleParticipantLeft(meetingCode, userId);
        await this.attendanceService.markLeft(meetingCode, userId);
        // Kiểm tra phòng trống sau khi leave (bỏ qua nếu đang có breakout hoạt động)
        await this.meetingsService.checkAndCloseEmptyRoom(meetingCode);
        break;
      }

      case "attendance-close-all": {
        const { meetingCode } = job.data as { meetingCode: string };
        if (this.meetingsService.isBreakoutRoomCode(meetingCode)) break;
        if (await this.meetingsService.hasActiveBreakoutRooms(meetingCode)) {
          this.logger.log(
            `[MeetingProcessor] Bỏ qua đóng session phòng chính ${meetingCode} vì đang có breakout room hoạt động.`,
          );
          break;
        }
        await this.attendanceService.closeAllOpenVisits(meetingCode);
        await this.meetingsService.endMeetingByCode(meetingCode);
        break;
      }

      case "generate-meeting-summary": {
        const payload = job.data as TranscriptReadyWebhookDto;
        await this.meetingSummaryService.handleSummaryJob(payload);
        break;
      }

      default:
        this.logger.warn(`Unhandled job type: ${job.name}`);
        break;
    }
  }
}

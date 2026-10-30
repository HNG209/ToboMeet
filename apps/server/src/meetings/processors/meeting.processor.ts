import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { BreakoutRoomsService } from "../breakout-rooms.service";
import { AttendanceService } from "../attendance.service";
import { MeetingsService } from "../meetings.service";
import { RecordingsService } from "../recordings.service";
import { RecordingWebhookDto } from "@tobomeet/shared/types";

export interface AutoEndBreakoutJobData {
  mainMeetingCode: string;
  sessionStartedAt: number;
}

export interface AttendanceJobData {
  meetingCode: string;
  userId: string;
  displayName?: string;
}

export interface ProcessRecordingJobData {
  meetingCode: string;
  sessionId?: string;
}

@Processor("meeting", { concurrency: 10 })
export class MeetingProcessor extends WorkerHost {
  private readonly logger = new Logger(MeetingProcessor.name);

  constructor(
    private readonly breakoutRoomsService: BreakoutRoomsService,
    private readonly attendanceService: AttendanceService,
    private readonly meetingsService: MeetingsService,
    private readonly recordingService: RecordingsService) {
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
        await this.attendanceService.markJoined(
          meetingCode,
          userId,
          displayName,
        );
        break;
      }

      case "attendance-left": {
        const { meetingCode, userId } = job.data as AttendanceJobData;
        await this.recordingService.handleParticipantLeft(meetingCode, userId);
        await this.attendanceService.markLeft(meetingCode, userId);
        // Kiểm tra phòng trống sau khi leave
        await this.meetingsService.checkAndCloseEmptyRoom(meetingCode);
        break;
      }

      case "attendance-close-all": {
        const { meetingCode } = job.data as { meetingCode: string };
        await this.attendanceService.closeAllOpenVisits(meetingCode);
        await this.meetingsService.endMeetingByCode(meetingCode);
        break;
      }

      case "process-recording": {
        const { meetingCode, sessionId } = job.data as ProcessRecordingJobData;
        await this.recordingService.handlePostProcessing(meetingCode, sessionId);
        break;
      }

      case "process-recording-webhook": {
        const payload = job.data as RecordingWebhookDto;
        await this.recordingService.handleWebhookPostProcessing(payload);
        break;
      }

      default:
        this.logger.warn(`Unhandled job type: ${job.name}`);
        break;
    }
  }
}

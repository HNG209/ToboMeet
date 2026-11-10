// src/webhooks/webhooks.controller.ts
import {
  Controller,
  Post,
  Req,
  RawBodyRequest,
  Headers,
  HttpCode,
  HttpStatus,
  Body,
  Logger,
} from "@nestjs/common";
import { TrackSource, WebhookReceiver } from "livekit-server-sdk";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { RecordingsService } from "../meetings/recordings.service";
import { RecordingWebhookDto, TranscriptReadyWebhookDto } from "@tobomeet/shared/types";

@Controller("webhooks")
export class WebhooksController {
  private receiver: WebhookReceiver;
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    @InjectQueue("meeting") private readonly meetingQueue: Queue,
    private readonly recordingsService: RecordingsService,
  ) {
    this.receiver = new WebhookReceiver(
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
    );
  }

  @Post('recordings')
  @HttpCode(HttpStatus.OK)
  async handleRecordingWebhook(@Body() payload: RecordingWebhookDto) {
    await this.meetingQueue.add(
      "process-recording-webhook",
      payload,
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );

    return {
      received: true,
      message: "Recording webhook queued for post-processing",
      room_name: payload.room_name,
      session_id: payload.session_id,
    };
  }

  @Post("transcripts/ready")
  @HttpCode(HttpStatus.OK)
  async handleTranscriptReady(@Body() payload: TranscriptReadyWebhookDto) {
    this.logger.log(
      `Received transcript ready webhook for room: ${payload.room_name}, session: ${payload.session_id} (${payload.segment_count} segments, ${payload.word_count} words)`,
    );

    await this.meetingQueue.add(
      "generate-meeting-summary",
      payload,
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );

    return {
      received: true,
      message: "Transcript webhook queued for summary generation",
      room_name: payload.room_name,
      session_id: payload.session_id,
    };
  }

  @Post("livekit")
  async handleLiveKitWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("authorization") authHeader: string,
  ) {
    const rawBody = req.rawBody ? req.rawBody.toString() : "";
    const event = await this.receiver.receive(rawBody, authHeader);

    const meetingCode = event.room?.name;
    const userId = event.participant?.identity;
    const displayName = event.participant?.name;
    const isAgent =
      !userId ||
      userId.startsWith("EG_") ||
      userId.startsWith("agent-") ||
      userId.includes("stt-transcriber") ||
      displayName?.includes("stt-transcriber") ||
      (event.participant as any)?.kind === 2 ||
      Boolean((event.participant as any)?.isAgent);

    switch (event.event) {
      case "participant_joined":
        if (meetingCode && userId) {
          // Bỏ qua egress client và Agent
          if (isAgent) break;
          await this.meetingQueue.add(
            "attendance-joined",
            { meetingCode, userId, displayName },
            {
              attempts: 3,
              backoff: { type: "exponential", delay: 2000 },
              removeOnComplete: 100,
              removeOnFail: 50,
            },
          );
        }
        break;

      case "participant_left":
        if (meetingCode && userId) {
          // Bỏ qua egress client và Agent
          if (isAgent) break;
          // Tự động dừng ghi hình nếu người thoát chính là người đang quay cuộc họp
          await this.recordingsService.handleParticipantLeft(meetingCode, userId);

          await this.meetingQueue.add(
            "attendance-left",
            { meetingCode, userId },
            {
              attempts: 3,
              backoff: { type: "exponential", delay: 2000 },
              removeOnComplete: 100,
              removeOnFail: 50,
            },
          );
        }
        break;

      case "room_finished":
        if (meetingCode) {
          // Đóng hết visit còn mở + end session nếu cần
          await this.meetingQueue.add(
            "attendance-close-all",
            { meetingCode },
            {
              attempts: 3,
              removeOnComplete: true,
            },
          );
        }
        break;

      case "track_published":
        if (event.track.source === TrackSource.SCREEN_SHARE) {
          await this.recordingsService.handleNewScreenShareTrack(
            event.room.name, // meetingCode
            event.track.sid  // trackId
          );

        }
    }

    return { received: true };
  }
}
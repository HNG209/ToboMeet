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
import { WebhookReceiver } from "livekit-server-sdk";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { RecordingsService } from "../meetings/recordings.service";
import { TranscriptReadyWebhookDto } from "@tobomeet/shared/types";

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

  @Post("transcripts/ready")
  @HttpCode(HttpStatus.OK)
  async handleTranscriptReady(@Body() payload: TranscriptReadyWebhookDto) {
    // Không ghi nhận transcript / summary session cho breakout room
    if (payload.room_name?.includes("_sub_")) {
      this.logger.log(
        `Ignoring transcript webhook for breakout room: ${payload.room_name}`,
      );
      return {
        received: true,
        ignored: true,
        reason: "Breakout room does not record session",
      };
    }

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
    const isBreakoutRoom = Boolean(
      meetingCode?.includes("_sub_") ||
        (() => {
          try {
            if (event.room?.metadata) {
              return JSON.parse(event.room.metadata)?.roomType === "breakout";
            }
          } catch {}
          return false;
        })(),
    );
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
      case "egress_started":
        this.logger.log(
          `[LiveKitWebhook] Egress started: ${event.egressInfo?.egressId} (room: ${event.egressInfo?.roomName})`,
        );
        break;

      case "egress_updated":
        this.logger.log(
          `[LiveKitWebhook] Egress updated: ${event.egressInfo?.egressId} (status: ${event.egressInfo?.status})`,
        );
        break;

      case "egress_ended":
        if (event.egressInfo) {
          await this.recordingsService.handleEgressEnded(event.egressInfo);
        }
        break;

      case "participant_joined":
        if (meetingCode && userId) {
          // Bỏ qua egress client, Agent và phòng breakout (không ghi nhận session/attendance cho breakout)
          if (isAgent || isBreakoutRoom) break;
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
          // Bỏ qua egress client, Agent và phòng breakout
          if (isAgent || isBreakoutRoom) break;
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
          // Không ghi nhận/đóng session cho breakout room
          if (isBreakoutRoom) break;
          // Đóng hết visit còn mở + end session nếu không có breakout đang hoạt động
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
    }

    return { received: true };
  }
}

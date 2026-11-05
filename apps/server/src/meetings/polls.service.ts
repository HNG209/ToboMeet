import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Poll, PollDocument } from "./schemas/poll.schema";
import {
  MeetingSession,
  MeetingSessionDocument,
} from "./schemas/meeting-session.schema";
import { User, UserDocument } from "../users/schemas/user.schema";
import { MeetingsGateway } from "./meetings.gateway";
import { CreatePollDto, VotePollDto } from "./dtos/poll.dto";
import { AppException } from "../core/exceptions/app.exception";
import { ErrorCode } from "@tobomeet/shared/types";

@Injectable()
export class PollsService {
  private readonly logger = new Logger(PollsService.name);

  constructor(
    @InjectModel(Poll.name)
    private readonly pollModel: Model<PollDocument>,
    @InjectModel(MeetingSession.name)
    private readonly sessionModel: Model<MeetingSessionDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly meetingsGateway: MeetingsGateway,
  ) { }

  /**
   * Tạo cuộc bình chọn mới trong phiên họp
   */
  async createPoll(
    meetingCode: string,
    userId: string,
    dto: CreatePollDto,
  ): Promise<Poll> {
    let session = await this.sessionModel.findOne({
      meetingCode,
      status: "ongoing",
    });

    if (!session) {
      throw new AppException(ErrorCode.MEETING_NOT_STARTED_OR_ENDED);
    }

    const cleanedOptions = dto.options
      .map((opt) => opt.trim())
      .filter((opt) => opt.length > 0);

    if (cleanedOptions.length < 2 || cleanedOptions.length > 50) {
      throw new AppException(ErrorCode.POLL_INVALID_OPTIONS);
    }

    const user = await this.userModel
      .findOne({ supabaseId: userId })
      .lean()
      .exec();

    const creatorName = user?.displayName || user?.email || "Chủ phòng";
    const creatorAvatar = user?.avatarUrl;

    const options = cleanedOptions.map((text, idx) => ({
      id: `opt_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
      text,
      voters: [],
    }));

    const poll = await this.pollModel.create({
      sessionId: new Types.ObjectId(session._id),
      meetingCode,
      question: dto.question.trim(),
      options,
      allowMultiple: !!dto.allowMultiple,
      creatorId: userId,
      creatorName,
      creatorAvatar,
      status: "active",
    });

    this.meetingsGateway.notifyPollCreated(meetingCode, poll);
    this.logger.log(
      `[Poll] Created poll "${poll.question}" in meeting ${meetingCode} by user ${userId}`,
    );

    return poll;
  }

  /**
   * Lấy danh sách các cuộc bình chọn
   */
  async getPolls(meetingCode: string, sessionId?: string): Promise<Poll[]> {
    const buildSessionFilter = (id: any) => {
      const idStr = typeof id === "string" ? id : id?.toString?.() || "";
      if (Types.ObjectId.isValid(idStr)) {
        return {
          $in: [new Types.ObjectId(idStr), idStr],
        };
      }
      return id;
    };

    if (sessionId) {
      return this.pollModel
        .find({
          meetingCode,
          sessionId: buildSessionFilter(sessionId),
        })
        .sort({ createdAt: -1 })
        .lean()
        .exec();
    }

    const session = await this.sessionModel
      .findOne({ meetingCode, status: "ongoing" })
      .lean()
      .exec();

    if (!session) {
      const latestSession = await this.sessionModel
        .findOne({ meetingCode })
        .sort({ createdAt: -1 })
        .lean()
        .exec();

      if (!latestSession) {
        return this.pollModel
          .find({ meetingCode })
          .sort({ createdAt: -1 })
          .lean()
          .exec();
      }

      return this.pollModel
        .find({
          meetingCode,
          sessionId: buildSessionFilter(latestSession._id),
        })
        .sort({ createdAt: -1 })
        .lean()
        .exec();
    }

    return this.pollModel
      .find({
        meetingCode,
        sessionId: buildSessionFilter(session._id),
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  /**
   * Bỏ phiếu bình chọn
   */
  async votePoll(
    meetingCode: string,
    pollId: string,
    userId: string,
    dto: VotePollDto,
  ): Promise<Poll> {
    const poll = await this.pollModel.findOne({
      _id: Types.ObjectId.isValid(pollId) ? new Types.ObjectId(pollId) : pollId,
      meetingCode,
    });
    if (!poll) {
      throw new AppException(ErrorCode.POLL_NOT_FOUND);
    }

    if (poll.status === "closed") {
      throw new AppException(ErrorCode.POLL_CLOSED);
    }

    // Chặn bình chọn nếu phiên họp (session) đã kết thúc
    const session = await this.sessionModel
      .findById(poll.sessionId)
      .lean()
      .exec();
    if (!session || session.status === "ended") {
      throw new AppException(ErrorCode.MEETING_NOT_STARTED_OR_ENDED);
    }

    if (!dto.optionIds || dto.optionIds.length === 0) {
      throw new AppException(ErrorCode.POLL_INVALID_OPTIONS);
    }

    if (!poll.allowMultiple && dto.optionIds.length > 1) {
      throw new AppException(ErrorCode.POLL_INVALID_OPTIONS);
    }

    const validOptionIds = new Set(poll.options.map((o) => o.id));
    for (const optId of dto.optionIds) {
      if (!validOptionIds.has(optId)) {
        throw new AppException(ErrorCode.POLL_INVALID_OPTIONS);
      }
    }

    const user = await this.userModel
      .findOne({ supabaseId: userId })
      .lean()
      .exec();

    const voterName = user?.displayName || user?.email || "Người tham gia";
    const voterAvatar = user?.avatarUrl;

    // Xóa phiếu bầu trước đó của người dùng trên mọi lựa chọn trong cuộc bình chọn này
    for (const option of poll.options) {
      option.voters = option.voters.filter((v) => v.userId !== userId);
    }

    // Thêm người dùng vào các lựa chọn đã chọn
    for (const optId of dto.optionIds) {
      const targetOption = poll.options.find((o) => o.id === optId);
      if (targetOption) {
        targetOption.voters.push({
          userId,
          name: voterName,
          avatar: voterAvatar,
          votedAt: new Date(),
        });
      }
    }

    await poll.save();

    this.meetingsGateway.notifyPollVoted(meetingCode, poll);
    this.logger.log(
      `[Poll] User ${userId} voted on poll ${pollId} in meeting ${meetingCode}`,
    );

    return poll;
  }

  /**
   * Đóng cuộc bình chọn
   */
  async closePoll(
    meetingCode: string,
    pollId: string,
    userId: string,
  ): Promise<Poll> {
    const poll = await this.pollModel.findOne({
      _id: Types.ObjectId.isValid(pollId) ? new Types.ObjectId(pollId) : pollId,
      meetingCode,
    });
    if (!poll) {
      throw new AppException(ErrorCode.POLL_NOT_FOUND);
    }

    poll.status = "closed";
    await poll.save();

    this.meetingsGateway.notifyPollClosed(meetingCode, poll);
    this.logger.log(
      `[Poll] Closed poll ${pollId} in meeting ${meetingCode} by user ${userId}`,
    );

    return poll;
  }

  /**
   * Xóa cuộc bình chọn
   */
  async deletePoll(
    meetingCode: string,
    pollId: string,
    userId: string,
  ): Promise<{ success: boolean; pollId: string }> {
    const poll = await this.pollModel.findOneAndDelete({
      _id: Types.ObjectId.isValid(pollId) ? new Types.ObjectId(pollId) : pollId,
      meetingCode,
    });

    if (!poll) {
      throw new AppException(ErrorCode.POLL_NOT_FOUND);
    }

    this.meetingsGateway.notifyPollDeleted(meetingCode, pollId);
    this.logger.log(
      `[Poll] Deleted poll ${pollId} in meeting ${meetingCode} by user ${userId}`,
    );

    return { success: true, pollId };
  }
}

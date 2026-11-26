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
import { RedisService } from "../redis/redis.service";

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
    private readonly redisService: RedisService,
  ) { }

  /**
   * Tạo cuộc bình chọn mới trong phiên họp
   */
  async createPoll(
    meetingCode: string,
    userId: string,
    dto: CreatePollDto,
  ): Promise<Poll> {
    if (meetingCode?.includes("_sub_")) {
      throw new AppException(ErrorCode.INVALID_PERMISSION);
    }

    const session = await this.sessionModel
      .findOne({
        meetingCode,
        status: "ongoing",
      })
      .select("_id")
      .lean()
      .exec();

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
      .select("displayName email avatarUrl")
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

    // Khởi tạo Redis In-Memory Counter cho các lựa chọn của cuộc bình chọn
    if (this.redisService.isReady) {
      const pollIdStr = poll._id.toString();
      for (const opt of options) {
        await this.redisService.hset(`poll:${pollIdStr}:counts`, opt.id, "0");
      }
      await this.redisService.expire(`poll:${pollIdStr}:counts`, 86400);
      await this.redisService.set(
        `poll:${pollIdStr}:meta`,
        JSON.stringify(poll),
        86400,
      );
    }

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
      .select("status")
      .lean()
      .exec();
    if (!session || session.status === "ended") {
      throw new AppException(ErrorCode.MEETING_NOT_STARTED_OR_ENDED);
    }

    const optionIds = dto.optionIds || [];

    if (!poll.allowMultiple && optionIds.length > 1) {
      throw new AppException(ErrorCode.POLL_INVALID_OPTIONS);
    }

    const validOptionIds = new Set(poll.options.map((o) => o.id));
    for (const optId of optionIds) {
      if (!validOptionIds.has(optId)) {
        throw new AppException(ErrorCode.POLL_INVALID_OPTIONS);
      }
    }

    // Tối ưu hóa: Kiểm tra xem user đã từng vote trước đó chưa
    let hasVotedBefore = false;
    let voterName = "Người tham gia";
    let voterAvatar = "";

    const pollIdStr = poll._id.toString();

    // 1. Cập nhật bộ đếm nguyên tử In-Memory trên Redis nếu Redis sẵn sàng
    if (this.redisService.isReady) {
      const prevVoterDataStr = await this.redisService.hget(
        `poll:${pollIdStr}:voters`,
        userId,
      );

      let prevOptionIds: string[] = [];
      if (prevVoterDataStr) {
        try {
          const parsed = JSON.parse(prevVoterDataStr);
          prevOptionIds = parsed.optionIds || [];
          hasVotedBefore = true;
          voterName = parsed.name || voterName;
          voterAvatar = parsed.avatar || voterAvatar;
        } catch {}
      }

      // Giảm atomic counter của những options bị bỏ chọn
      for (const oldOpt of prevOptionIds) {
        if (!optionIds.includes(oldOpt)) {
          await this.redisService.hincrby(`poll:${pollIdStr}:counts`, oldOpt, -1);
        }
      }

      // Tăng atomic counter của những options mới được vote
      for (const newOpt of optionIds) {
        if (!prevOptionIds.includes(newOpt)) {
          await this.redisService.hincrby(`poll:${pollIdStr}:counts`, newOpt, 1);
        }
      }

      // Cập nhật chi tiết voter vào Redis Hash
      await this.redisService.hset(
        `poll:${pollIdStr}:voters`,
        userId,
        JSON.stringify({
          optionIds,
          name: voterName,
          avatar: voterAvatar,
          votedAt: new Date().toISOString(),
        }),
      );

      await this.redisService.expire(`poll:${pollIdStr}:counts`, 86400);
      await this.redisService.expire(`poll:${pollIdStr}:voters`, 86400);
    }

    if (!hasVotedBefore) {
      for (const opt of poll.options) {
        if (Array.isArray(opt.voters)) {
          const v = opt.voters.find((voter: any) => voter.userId === userId);
          if (v) {
            hasVotedBefore = true;
            voterName = v.name || voterName;
            voterAvatar = v.avatar || voterAvatar;
            break;
          }
        }
      }
    }

    // Nếu chưa từng có trong poll, mới cần query DB tìm thông tin user
    if (!hasVotedBefore && voterName === "Người tham gia") {
      const user = await this.userModel
        .findOne({ supabaseId: userId })
        .select("displayName email avatarUrl")
        .lean()
        .exec();
      if (user) {
        voterName = user.displayName || user.email || voterName;
        voterAvatar = user.avatarUrl || "";
      }
    }

    // CẬP NHẬT NGUYÊN TỬ (ATOMIC UPDATE) - CHỐNG RACE CONDITION
    // 1. Chỉ gọi $pull khi user ĐÃ TỪNG VOTE trước đó (Tiết kiệm 50% thao tác ghi MongoDB khi 200 users vote lần đầu)
    if (hasVotedBefore) {
      await this.pollModel.updateOne(
        { _id: poll._id },
        { $pull: { "options.$[].voters": { userId } } }
      );
    }

    // 2. Thêm người dùng vào các lựa chọn đã chọn (nguyên tử với arrayFilters, không dùng poll.save())
    await this.pollModel.updateOne(
      { _id: poll._id },
      {
        $push: {
          "options.$[elem].voters": {
            userId,
            name: voterName,
            avatar: voterAvatar,
            votedAt: new Date(),
          },
        },
      },
      {
        arrayFilters: [{ "elem.id": { $in: optionIds } }],
      }
    );

    const updatedPoll = await this.pollModel.findById(poll._id).lean().exec();

    // Cập nhật lại poll meta trong Redis Cache
    if (this.redisService.isReady && updatedPoll) {
      await this.redisService.set(
        `poll:${pollIdStr}:meta`,
        JSON.stringify(updatedPoll),
        86400,
      );
    }

    this.meetingsGateway.notifyPollVoted(meetingCode, updatedPoll);
    this.logger.log(
      `[Poll] User ${userId} voted on poll ${pollId} in meeting ${meetingCode}`,
    );

    return updatedPoll as any;
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

    if (this.redisService.isReady) {
      await this.redisService.del(`poll:${poll._id}:meta`);
    }

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

    if (this.redisService.isReady) {
      const pollIdStr = pollId.toString();
      await this.redisService.del([
        `poll:${pollIdStr}:meta`,
        `poll:${pollIdStr}:counts`,
        `poll:${pollIdStr}:voters`,
      ]);
    }

    this.meetingsGateway.notifyPollDeleted(meetingCode, pollId);
    this.logger.log(
      `[Poll] Deleted poll ${pollId} in meeting ${meetingCode} by user ${userId}`,
    );

    return { success: true, pollId };
  }
}

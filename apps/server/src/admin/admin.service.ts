import {
  Injectable,
  Inject,
  forwardRef,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import * as nodemailer from "nodemailer";
import * as fs from "fs";
import * as path from "path";
import { User, UserDocument } from "../users/schemas/user.schema";
import {
  DeviceSession,
  DeviceSessionDocument,
} from "../users/schemas/device-session.schema";
import { Room, RoomDocument } from "../rooms/schemas/room.schema";
import { Meeting, MeetingDocument } from "../meetings/schemas/meeting.schema";
import { MeetingsGateway } from "../meetings/meetings.gateway";
import { AppGateway } from "../core/gateways/app.gateway";
import { SupabaseGuard } from "../core/guards/supabase.guard";
import { ConfigService } from "@nestjs/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

@Injectable()
export class AdminService {
  private supabaseAdmin: SupabaseClient;

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(DeviceSession.name)
    private sessionModel: Model<DeviceSessionDocument>,
    @InjectModel(Room.name) private roomModel: Model<RoomDocument>,
    @InjectModel(Meeting.name) private meetingModel: Model<MeetingDocument>,
    @Inject(forwardRef(() => MeetingsGateway))
    private readonly meetingsGateway: MeetingsGateway,
    private readonly appGateway: AppGateway,
    private configService: ConfigService,
  ) {
    const supabaseUrl = this.configService.get<string>("SUPABASE_URL");
    const supabaseServiceRole = this.configService.get<string>(
      "SUPABASE_SERVICE_ROLE_KEY",
    );
    this.supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  logEmailDebug(message: string, error?: unknown) {
    try {
      const logPath = path.join(process.cwd(), "debug_email.log");
      const time = new Date().toISOString();
      let logMsg = `[${time}] ${message}\n`;
      if (error) {
        const errObj = error as { stack?: string; message?: string };
        logMsg += `[${time}] ERROR DETAILS: ${errObj.stack || errObj.message || JSON.stringify(error)}\n`;
      }
      fs.appendFileSync(logPath, logMsg);
      console.log(`[Email Log] ${message}`);
    } catch (e) {
      console.error("Không thể ghi file debug_email.log", e);
    }
  }

  async getDashboardStats() {
    const totalUsers = await this.userModel.countDocuments().exec();

    // Đếm lượng socket connected thực tế làm online users
    const onlineUsers = this.meetingsGateway.server?.engine?.clientsCount || 0;

    const activeMeetings = await this.meetingModel
      .countDocuments({ status: "ongoing" })
      .exec();

    const totalMeetings = await this.meetingModel.countDocuments().exec();

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const roomsCreatedToday = await this.roomModel
      .countDocuments({ createdAt: { $gte: startOfDay } })
      .exec();

    // Tính thời lượng họp trung bình (phút) của cuộc họp đã kết thúc (status = "ended")
    const endedMeetings = await this.meetingModel
      .find({ status: "ended" })
      .exec();

    let totalDurationMinutes = 0;
    endedMeetings.forEach((m) => {
      const doc = m as unknown as Record<string, unknown>;
      const updatedAt = doc.updatedAt as Date | undefined;
      const createdAt = doc.createdAt as Date | undefined;
      const durationSeconds =
        ((updatedAt?.getTime() || 0) - (createdAt?.getTime() || 0)) / 1000;
      totalDurationMinutes += durationSeconds / 60;
    });

    const averageMeetingDuration =
      endedMeetings.length > 0
        ? Math.round(totalDurationMinutes / endedMeetings.length)
        : 0;

    // Lấy dữ liệu biểu đồ lượt sử dụng theo ngày (365 ngày gần nhất để hỗ trợ bộ lọc lên tới 1 năm ở frontend)
    const oneYearAgo = new Date();
    oneYearAgo.setDate(oneYearAgo.getDate() - 365);

    const meetings = await this.meetingModel
      .find({ createdAt: { $gte: oneYearAgo } })
      .select("createdAt")
      .exec();

    // Group theo ngày định dạng YYYY-MM-DD
    const chartDataMap: Record<string, number> = {};
    for (let i = 364; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      chartDataMap[key] = 0;
    }

    meetings.forEach((m) => {
      const doc = m as unknown as Record<string, unknown>;
      const createdAt = doc.createdAt as Date | undefined;
      const key = createdAt ? createdAt.toISOString().split("T")[0] : "";
      if (chartDataMap[key] !== undefined) {
        chartDataMap[key]++;
      }
    });

    const chartData = Object.keys(chartDataMap).map((date) => ({
      date,
      count: chartDataMap[date],
    }));

    // Hoạt động gần đây (Recent rooms/meetings)
    const recentRooms = await this.roomModel
      .find()
      .sort({ createdAt: -1 })
      .limit(5)
      .exec();

    const recentMeetings = await this.meetingModel
      .find()
      .sort({ createdAt: -1 })
      .limit(5)
      .exec();

    return {
      totalUsers,
      onlineUsers,
      activeMeetings,
      totalMeetings,
      roomsCreatedToday,
      averageMeetingDuration,
      chartData,
      recentRooms: recentRooms.map((r) => ({
        id: r._id,
        name: r.name,
        code: r.code,
        createdAt: (r as unknown as Record<string, unknown>).createdAt,
      })),
      recentMeetings: recentMeetings.map((m) => ({
        id: m._id,
        meetingCode: m.meetingCode,
        createdAt: (m as unknown as Record<string, unknown>).createdAt,
      })),
    };
  }

  async getUsersList(
    searchQuery?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const filter: Record<string, unknown> = {};

    if (searchQuery && searchQuery.trim()) {
      const searchRegex = new RegExp(searchQuery.trim(), "i");
      filter.$or = [{ email: searchRegex }, { displayName: searchRegex }];
    }

    const total = await this.userModel.countDocuments(filter).exec();
    const skip = (page - 1) * limit;
    const users = await this.userModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    const usersWithStatus = await Promise.all(
      users.map(async (u) => {
        let currentStatus = u.status || "ACTIVE";
        let lockType = u.lockType;
        let lockedUntil = u.lockedUntil;

        // Tự động mở khóa (self-healing) nếu thời hạn khóa đã hết
        if (
          currentStatus === "BLOCKED" &&
          u.lockType === "TEMPORARY" &&
          u.lockedUntil &&
          new Date() >= u.lockedUntil
        ) {
          try {
            await this.unlockUserAccount(
              u._id.toString(),
              "System (Self-healing)",
            );
            currentStatus = "ACTIVE";
            lockType = null;
            lockedUntil = null;
          } catch (e) {
            this.logEmailDebug(`Lỗi tự động mở khóa khi duyệt danh sách: ${e}`);
          }
        }

        let violationCountsObj = {};
        if (u.violationCounts) {
          violationCountsObj = Object.fromEntries(u.violationCounts);
        }

        return {
          id: u._id,
          supabaseId: u.supabaseId,
          email: u.email,
          displayName: u.displayName || "",
          avatarUrl: u.avatarUrl || "",
          role: u.role || "user",
          status: currentStatus,
          lockType,
          lockSource: u.lockSource,
          lockedAt: u.lockedAt,
          lockedUntil,
          lockReason: u.lockReason,
          lockedBy: u.lockedBy,
          recommendedDuration: u.recommendedDuration,
          actualDuration: u.actualDuration,
          violationType: u.violationType,
          violationCounts: violationCountsObj,
          lockHistory: u.lockHistory || [],
          createdAt: (u as unknown as Record<string, unknown>).createdAt,
        };
      }),
    );

    return {
      users: usersWithStatus,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async createUserAccount(
    email: string,
    password?: string,
    displayName?: string,
    role?: string,
  ) {
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Kiểm tra Email tồn tại trong MongoDB trước để tránh gọi API Supabase không cần thiết
    const existingUser = await this.userModel
      .findOne({
        email: { $regex: new RegExp(`^${normalizedEmail}$`, "i") },
      })
      .exec();
    if (existingUser) {
      throw new ConflictException("Email đã tồn tại.");
    }

    // 2. Chuẩn bị mật khẩu
    const finalPassword =
      password && password.trim() ? password.trim() : "12345678";

    // 3. Tạo tài khoản trên Supabase Auth
    const normalizedRole = (role || "user").trim().toLowerCase();
    const { data: supabaseUser, error: supabaseError } =
      await this.supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password: finalPassword,
        email_confirm: true,
        app_metadata: { role: normalizedRole },
        user_metadata: {
          displayName: displayName || normalizedEmail.split("@")[0],
        },
      });

    if (supabaseError || !supabaseUser?.user) {
      const errMsg = supabaseError?.message || "";
      if (
        errMsg.includes("already registered") ||
        errMsg.includes("already exists")
      ) {
        throw new ConflictException("Email đã tồn tại.");
      }
      throw new BadRequestException(
        "Không thể tạo tài khoản trên Supabase: " +
        (supabaseError?.message || "Lỗi không xác định"),
      );
    }

    const supabaseId = supabaseUser.user.id;

    // 4. Tạo tài khoản trên MongoDB
    try {
      const newUser = await this.userModel.create({
        supabaseId,
        email: normalizedEmail,
        displayName: displayName || normalizedEmail.split("@")[0],
        role: role || "user",
        status: "ACTIVE",
      });

      return {
        id: newUser._id,
        supabaseId: newUser.supabaseId,
        email: newUser.email,
        displayName: newUser.displayName,
        role: role || "user",
        status: "ACTIVE",
        createdAt: (newUser as unknown as Record<string, unknown>).createdAt,
      };
    } catch (dbError) {
      // Rollback: Xóa tài khoản trên Supabase nếu lưu DB lỗi
      await this.supabaseAdmin.auth.admin.deleteUser(supabaseId);
      throw new BadRequestException("Lỗi lưu trữ dữ liệu MongoDB: " + dbError);
    }
  }

  async updateUserAccount(
    id: string,
    displayName: string,
    role: string,
    status?: string,
    adminEmail?: string,
  ) {
    const normalizedRole = (role || "user").trim().toLowerCase();

    const user = Types.ObjectId.isValid(id)
      ? await this.userModel.findById(id).exec()
      : await this.userModel.findOne({ supabaseId: id }).exec();

    if (!user) {
      throw new NotFoundException("Người dùng không tồn tại");
    }

    const updateFields: Record<string, unknown> = {
      role: normalizedRole,
    };
    if (displayName && displayName.trim()) {
      updateFields.displayName = displayName.trim();
    }

    const normalizedStatus = status?.trim().toLowerCase();
    if (normalizedStatus === "active") {
      updateFields.status = "ACTIVE";
    } else if (normalizedStatus === "locked") {
      updateFields.status = "BLOCKED";
    }

    // 1. Cập nhật vai trò (role) trong app_metadata lên Supabase trước để đảm bảo đồng bộ
    const supabaseUpdatePayload: Record<string, any> = {
      app_metadata: { role: normalizedRole },
    };
    if (normalizedStatus === "active" && user.status === "BLOCKED") {
      supabaseUpdatePayload.ban_duration = "none";
    }

    const { error: roleError } =
      await this.supabaseAdmin.auth.admin.updateUserById(
        user.supabaseId,
        supabaseUpdatePayload,
      );
    if (roleError) {
      throw new BadRequestException(
        `Không thể cập nhật quyền trên Supabase: ${roleError.message}`,
      );
    }

    // 2. Đồng bộ trực tiếp vào MongoDB bằng $set (tránh lỗi validation từ các trường legacy khác)
    const previousRole = (user.role || "user").trim().toLowerCase();
    const updatedUser = await this.userModel
      .findByIdAndUpdate(user._id, { $set: updateFields }, { new: true })
      .exec();

    if (!updatedUser) {
      throw new NotFoundException("Không thể cập nhật người dùng trong MongoDB");
    }

    // 3. Nếu người dùng vừa được thay đổi quyền (đặc biệt khi cấp quyền admin),
    // đăng xuất ngay trên tất cả thiết bị để lần đăng nhập tới nhận access token mới có quyền admin
    if (previousRole !== normalizedRole) {
      await this.forceLogoutAllUserSessions(
        user.supabaseId,
        normalizedRole === "admin" ? "role_promoted_admin" : "role_updated",
      );
    }

    return {
      id: updatedUser._id,
      supabaseId: updatedUser.supabaseId,
      email: updatedUser.email,
      displayName: updatedUser.displayName,
      role: updatedUser.role,
      status: updatedUser.status || "ACTIVE",
      createdAt: (updatedUser as unknown as Record<string, unknown>).createdAt,
    };
  }

  /**
   * Thu hồi toàn bộ phiên đăng nhập của user (MongoDB DeviceSession + Supabase + WebSocket force_logout)
   * để đảm bảo access token cũ không còn hiệu lực và client đăng xuất ngay lập tức.
   */
  private async forceLogoutAllUserSessions(
    supabaseId: string,
    reason: string,
  ): Promise<void> {
    if (!supabaseId) return;

    // 1. Đánh dấu thu hồi tất cả session trong MongoDB & xóa cache của SupabaseGuard
    try {
      await this.sessionModel
        .updateMany(
          { userId: supabaseId, isRevoked: { $ne: true } },
          { $set: { isRevoked: true, revokedAt: new Date() } },
        )
        .exec();
      SupabaseGuard.invalidateSessionCache(supabaseId);
    } catch (err) {
      this.logEmailDebug(
        `Lỗi thu hồi DeviceSession trong MongoDB cho user ${supabaseId}`,
        err,
      );
    }

    // 2. Thu hồi phiên đăng nhập phía Supabase Auth
    try {
      await this.supabaseAdmin.auth.admin.signOut(supabaseId);
    } catch (err) {
    }

    // 3. Bắn sự kiện WebSocket force_logout tới mọi thiết bị đang mở của user
    try {
      if (this.appGateway?.server) {
        this.appGateway.server
          .to(`user_${supabaseId}`)
          .emit("force_logout", { reason });
      }
    } catch (err) {
      this.logEmailDebug(
        `Lỗi bắn WebSocket force_logout cho user ${supabaseId}`,
        err,
      );
    }
  }

  async sendLockEmail(email: string) {
    const host = this.configService.get<string>("SMTP_HOST");
    const port = this.configService.get<number>("SMTP_PORT") || 587;
    const user = this.configService.get<string>("SMTP_USER");
    const pass = this.configService.get<string>("SMTP_PASS");
    const from =
      this.configService.get<string>("SMTP_FROM") ||
      '"ToboMeet Support" <noreply@tobomeet.com>';

    this.logEmailDebug(
      `[SMTP Config] host=${host || "missing"}, port=${port}, user=${user || "missing"}, pass=${pass ? "***" : "missing"}`,
    );

    if (!host || !user || !pass) {
      throw new Error(
        "Cấu hình SMTP (SMTP_HOST, SMTP_USER, SMTP_PASS) bị thiếu trong file .env của server.",
      );
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: Number(port) === 465,
      auth: { user, pass },
    });

    const mailOptions = {
      from,
      to: email,
      subject: "Thông báo tài khoản bị khóa",
      text: `Chào bạn,

Tài khoản của bạn trên hệ thống ToboMeet đã bị khóa bởi Quản trị viên.
Bạn sẽ không thể đăng nhập vào hệ thống cho đến khi tài khoản được mở khóa.

Nếu bạn cần hỗ trợ hoặc cho rằng đây là một sự nhầm lẫn, vui lòng liên hệ với Quản trị viên của chúng tôi.

Trân trọng,
Đội ngũ hỗ trợ ToboMeet`,
    };

    await transporter.sendMail(mailOptions);
  }

  async sendUnlockEmail(email: string) {
    const host = this.configService.get<string>("SMTP_HOST");
    const port = this.configService.get<number>("SMTP_PORT") || 587;
    const user = this.configService.get<string>("SMTP_USER");
    const pass = this.configService.get<string>("SMTP_PASS");
    const from =
      this.configService.get<string>("SMTP_FROM") ||
      '"ToboMeet Support" <noreply@tobomeet.com>';

    this.logEmailDebug(
      `[SMTP Config] host=${host || "missing"}, port=${port}, user=${user || "missing"}, pass=${pass ? "***" : "missing"}`,
    );

    if (!host || !user || !pass) {
      throw new Error(
        "Cấu hình SMTP (SMTP_HOST, SMTP_USER, SMTP_PASS) bị thiếu trong file .env của server.",
      );
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: Number(port) === 465,
      auth: { user, pass },
    });

    const mailOptions = {
      from,
      to: email,
      subject: "Thông báo tài khoản đã được mở khóa",
      text: `Chào bạn,

Tài khoản của bạn trên hệ thống ToboMeet đã được mở khóa bởi Quản trị viên.
Bạn có thể đăng nhập và sử dụng hệ thống bình thường kể từ bây giờ.

Nếu bạn vẫn gặp sự cố khi đăng nhập, vui lòng liên hệ với Quản trị viên của chúng tôi để được hỗ trợ.

Trân trọng,
Đội ngũ hỗ trợ ToboMeet`,
    };

    await transporter.sendMail(mailOptions);
  }

  generateRandomPassword(): string {
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const numbers = "0123456789";
    const symbols = "!@#$%^&*()_+";

    let password = "";
    password += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
    password += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
    password += numbers.charAt(Math.floor(Math.random() * numbers.length));
    password += symbols.charAt(Math.floor(Math.random() * symbols.length));

    const allChars = uppercase + lowercase + numbers + symbols;
    for (let i = 0; i < 6; i++) {
      password += allChars.charAt(Math.floor(Math.random() * allChars.length));
    }

    return password
      .split("")
      .sort(() => 0.5 - Math.random())
      .join("");
  }

  async sendResetPasswordEmail(email: string, newPassword: string) {
    const host = this.configService.get<string>("SMTP_HOST");
    const port = this.configService.get<number>("SMTP_PORT") || 587;
    const user = this.configService.get<string>("SMTP_USER");
    const pass = this.configService.get<string>("SMTP_PASS");
    const from =
      this.configService.get<string>("SMTP_FROM") ||
      '"ToboMeet Support" <noreply@tobomeet.com>';

    this.logEmailDebug(
      `[SMTP Config] host=${host || "missing"}, port=${port}, user=${user || "missing"}, pass=${pass ? "***" : "missing"}`,
    );

    if (!host || !user || !pass) {
      throw new Error("Cấu hình SMTP bị thiếu.");
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: Number(port) === 465,
      auth: { user, pass },
    });

    const mailOptions = {
      from,
      to: email,
      subject: "Mật khẩu tài khoản đã được đặt lại",
      text: `Xin chào,

Quản trị viên đã đặt lại mật khẩu cho tài khoản của bạn.

Mật khẩu mới:

${newPassword}

Bạn có thể sử dụng mật khẩu này để đăng nhập vào hệ thống.

Để đảm bảo an toàn, vui lòng đổi mật khẩu sau khi đăng nhập.

Trân trọng,
Đội ngũ hỗ trợ ToboMeet`,
    };

    await transporter.sendMail(mailOptions);
  }

  async resetUserPassword(id: string, adminEmail: string) {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException("Người dùng không tồn tại");
    }

    // Kiểm tra trạng thái khóa từ Supabase Auth
    const {
      data: { user: sbUser },
      error: getSbError,
    } = await this.supabaseAdmin.auth.admin.getUserById(user.supabaseId);
    if (getSbError || !sbUser) {
      throw new BadRequestException(
        "Không tìm thấy tài khoản tương ứng trên Supabase",
      );
    }

    const isLocked =
      sbUser.banned_until && new Date(sbUser.banned_until) > new Date();
    if (isLocked) {
      throw new ForbiddenException(
        "Tài khoản này đang bị khóa. Vui lòng mở khóa trước khi đặt lại mật khẩu.",
      );
    }

    // Sinh mật khẩu ngẫu nhiên
    const randomPassword = this.generateRandomPassword();

    // Cập nhật trực tiếp mật khẩu người dùng trên Supabase qua Admin Auth API
    const { error: resetError } =
      await this.supabaseAdmin.auth.admin.updateUserById(user.supabaseId, {
        password: randomPassword,
      });

    if (resetError) {
      throw new BadRequestException(
        "Không thể đặt lại mật khẩu: " + resetError.message,
      );
    }

    // Gửi email tùy chỉnh qua SMTP
    try {
      await this.sendResetPasswordEmail(user.email, randomPassword);
    } catch (emailErr: unknown) {
      this.logEmailDebug(
        `Gửi email mật khẩu mới thất bại đến ${user.email}`,
        emailErr,
      );
    }

    // Ghi Audit Log vào audit.log
    try {
      const logPath = path.join(process.cwd(), "audit.log");
      const time = new Date().toISOString();
      const logMsg = `[${time}] Admin: ${adminEmail} | Target User: ${user.email} | Action: Yêu cầu đặt lại mật khẩu.\n`;
      fs.appendFileSync(logPath, logMsg);
    } catch (e) {
      console.error("Không thể ghi file audit.log", e);
    }

    return {
      success: true,
      message:
        "Đã đặt lại mật khẩu thành công và gửi mật khẩu mới đến email của người dùng.",
    };
  }

  async sendDeleteEmail(email: string) {
    const host = this.configService.get<string>("SMTP_HOST");
    const port = this.configService.get<number>("SMTP_PORT") || 587;
    const user = this.configService.get<string>("SMTP_USER");
    const pass = this.configService.get<string>("SMTP_PASS");
    const from =
      this.configService.get<string>("SMTP_FROM") ||
      '"ToboMeet Support" <noreply@tobomeet.com>';

    this.logEmailDebug(
      `[SMTP Config] host=${host || "missing"}, port=${port}, user=${user || "missing"}, pass=${pass ? "***" : "missing"}`,
    );

    if (!host || !user || !pass) {
      throw new Error("Cấu hình SMTP bị thiếu.");
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: Number(port) === 465,
      auth: { user, pass },
    });

    const mailOptions = {
      from,
      to: email,
      subject: "Thông báo tài khoản bị xóa vĩnh viễn",
      text: `Chào bạn,

Tài khoản của bạn trên hệ thống ToboMeet đã bị xóa vĩnh viễn bởi Quản trị viên.
Bạn sẽ không thể tiếp tục đăng nhập hoặc sử dụng hệ thống này nữa.

Trân trọng,
Đội ngũ hỗ trợ ToboMeet`,
    };

    await transporter.sendMail(mailOptions);
  }

  async deleteUserAccount(id: string) {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException("Người dùng không tồn tại");
    }

    // 1. Gửi email thông báo xóa vĩnh viễn trước khi xóa
    this.logEmailDebug(
      `[Debug] Bắt đầu gọi sendDeleteEmail cho email: ${user.email}`,
    );
    try {
      await this.sendDeleteEmail(user.email);
      this.logEmailDebug(
        `[Debug] Đã gửi email xóa vĩnh viễn thành công tới ${user.email}`,
      );
    } catch (err: unknown) {
      this.logEmailDebug(
        `[Debug ERROR] Gửi email xóa vĩnh viễn thất bại đến ${user.email}`,
        err,
      );
    }

    // 2. Xóa trên Supabase
    const { error: deleteError } =
      await this.supabaseAdmin.auth.admin.deleteUser(user.supabaseId);

    if (deleteError) {
      console.warn(
        "Cảnh báo: Lỗi xóa trên Supabase Auth (hoặc tài khoản đã bị xóa trước):",
        deleteError.message,
      );
    }

    // 3. Xóa hoàn toàn bản ghi trong MongoDB
    await this.userModel.deleteOne({ _id: user._id }).exec();

    return { success: true, message: "Đã xóa tài khoản vĩnh viễn thành công" };
  }

  // --- HỆ THỐNG XỬ LÝ VI PHẠM & KHÓA TÀI KHOẢN ---

  async sendPenaltyEmail(
    email: string,
    details: {
      violationType: string;
      lockReason: string;
      actualDuration: string;
      lockedAt: Date;
      lockedUntil?: Date;
    },
  ) {
    const host = this.configService.get<string>("SMTP_HOST");
    const port = this.configService.get<number>("SMTP_PORT") || 587;
    const user = this.configService.get<string>("SMTP_USER");
    const pass = this.configService.get<string>("SMTP_PASS");
    const from =
      this.configService.get<string>("SMTP_FROM") ||
      '"ToboMeet Support" <noreply@tobomeet.com>';

    if (!host || !user || !pass) {
      throw new Error("Cấu hình SMTP bị thiếu.");
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: Number(port) === 465,
      auth: { user, pass },
    });

    const formatTime = (d?: Date) => {
      if (!d)
        return "Tài khoản của bạn đã bị khóa cho đến khi quản trị viên mở khóa.";
      return d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    };

    const isWarning =
      details.actualDuration === "Cảnh báo" ||
      details.actualDuration === "warning";
    const subject = isWarning
      ? "Cảnh cáo vi phạm tài khoản ToboMeet"
      : "Thông báo tài khoản bị khóa";

    let text = `Chào bạn,\n\n`;
    if (isWarning) {
      text += `Tài khoản của bạn trên ToboMeet đã bị nhắc nhở/cảnh cáo vì hành vi vi phạm.\n\n`;
    } else {
      text += `Tài khoản của bạn trên ToboMeet đã bị khóa.\n\n`;
    }

    text += `Chi tiết xử lý vi phạm:\n`;
    text += `- Hành vi vi phạm: ${details.violationType}\n`;
    text += `- Lý do khóa: ${details.lockReason}\n`;
    text += `- Thời gian áp dụng: ${details.actualDuration}\n`;
    text += `- Thời điểm bắt đầu: ${formatTime(details.lockedAt)}\n`;

    if (!isWarning) {
      if (!details.lockedUntil) {
        text += `- Thời điểm kết thúc dự kiến: Tài khoản của bạn đã bị khóa cho đến khi quản trị viên mở khóa.\n\n`;
      } else {
        text += `- Thời điểm kết thúc dự kiến: ${formatTime(details.lockedUntil)}\n\n`;
      }
      text += `Bạn sẽ không thể đăng nhập hoặc thực hiện các cuộc họp trong thời gian bị khóa.\n`;
    } else {
      text += `\nLưu ý: Đây là cảnh cáo đầu tiên. Nếu bạn tiếp tục vi phạm hành vi này, tài khoản của bạn sẽ bị tạm khóa theo quy định.\n`;
    }

    text += `\nNếu bạn có thắc mắc hoặc cho rằng đây là một sự nhầm lẫn, vui lòng liên hệ với Quản trị viên để được hỗ trợ.\n\n`;
    text += `Trân trọng,\nĐội ngũ hỗ trợ ToboMeet`;

    const mailOptions = {
      from,
      to: email,
      subject,
      text,
    };

    await transporter.sendMail(mailOptions);
  }

  async checkLockByEmail(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.userModel
      .findOne({
        email: { $regex: new RegExp(`^${normalizedEmail}$`, "i") },
      })
      .exec();

    if (!user) {
      return { isLocked: false };
    }

    // Tự động mở khóa (self-healing) nếu thời hạn khóa đã hết
    if (
      user.status === "BLOCKED" &&
      user.lockType === "TEMPORARY" &&
      user.lockedUntil &&
      new Date() >= user.lockedUntil
    ) {
      try {
        await this.unlockUserAccount(
          user._id.toString(),
          "System (Self-healing)",
        );
        return { isLocked: false };
      } catch (e) {
        this.logEmailDebug(`Lỗi tự động mở khóa khi checkLockByEmail: ${e}`);
      }
    }

    if (user.status === "BLOCKED") {
      return {
        isLocked: true,
        status: user.status,
        lockType: user.lockType,
        lockedUntil: user.lockedUntil,
        lockReason: user.lockReason,
        violationType: user.violationType,
      };
    }

    return { isLocked: false };
  }

  async lockUserAccount(
    id: string,
    body: {
      violationType: string;
      recommendedDuration: string;
      actualDuration: string;
      lockReason: string;
      sendEmail?: boolean;
      lockSource?: string;
    },
    adminEmail: string,
  ) {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException("Người dùng không tồn tại");
    }

    const {
      violationType,
      recommendedDuration,
      actualDuration,
      lockReason,
      lockSource,
    } = body;

    const mapping: Record<string, string> = {
      Spam: "Spam / Quảng cáo",
      Harassment: "Quấy rối người khác",
      Inappropriate_Content: "Nội dung không phù hợp",
      Impersonation: "Mạo danh",
      Malware_Fraud: "Phát tán mã độc / Lừa đảo",
    };

    let finalReason = lockReason;
    let finalViolationType = violationType;

    if (violationType === "OTHER" || violationType === "Other") {
      finalViolationType = "OTHER";
      if (!lockReason || !lockReason.trim()) {
        throw new BadRequestException("Vui lòng nhập lý do khóa tài khoản.");
      }
      finalReason = lockReason.trim();
    } else {
      finalReason = mapping[violationType] || violationType;
    }

    // 1. Cập nhật violationCounts
    const counts = user.violationCounts || new Map<string, number>();
    const normalizedViolation = finalViolationType.trim();
    const currentCount = (counts.get(normalizedViolation) || 0) + 1;
    counts.set(normalizedViolation, currentCount);
    user.violationCounts = counts;

    // 2. Phân tích actualDuration
    let durationType: "TEMPORARY" | "INDEFINITE" | "WARNING" = "TEMPORARY";
    let durationMs: number | undefined;
    let untilDate: Date | undefined;

    if (actualDuration === "Cảnh báo" || actualDuration === "warning") {
      durationType = "WARNING";
    } else if (
      actualDuration === "Vô thời hạn" ||
      actualDuration === "indefinite" ||
      actualDuration === "Khóa cho đến khi quản trị viên mở khóa"
    ) {
      durationType = "INDEFINITE";
    } else if (
      actualDuration.includes("-") &&
      !isNaN(Date.parse(actualDuration))
    ) {
      untilDate = new Date(actualDuration);
      durationMs = untilDate.getTime() - Date.now();
      if (durationMs < 0) durationMs = 0;
    } else {
      const map: Record<string, number> = {
        "1 giờ": 1 * 60 * 60 * 1000,
        "1h": 1 * 60 * 60 * 1000,
        "6 giờ": 6 * 60 * 60 * 1000,
        "6h": 6 * 60 * 60 * 1000,
        "12 giờ": 12 * 60 * 60 * 1000,
        "12h": 12 * 60 * 60 * 1000,
        "24 giờ": 24 * 60 * 60 * 1000,
        "24h": 24 * 60 * 60 * 1000,
        "3 ngày": 3 * 24 * 60 * 60 * 1000,
        "3d": 3 * 24 * 60 * 60 * 1000,
        "7 ngày": 7 * 24 * 60 * 60 * 1000,
        "7d": 7 * 24 * 60 * 60 * 1000,
        "30 ngày": 30 * 24 * 60 * 60 * 1000,
        "30d": 30 * 24 * 60 * 60 * 1000,
      };
      durationMs = map[actualDuration] || 24 * 60 * 60 * 1000;
      untilDate = new Date(Date.now() + durationMs);
    }

    const lockedAt = new Date();

    // 3. Thực hiện khóa hoặc cảnh báo
    let emailSentSuccess = false;

    const validLockSource: "MANUAL" | "AI" =
      lockSource === "AI" ? "AI" : "MANUAL";

    if (durationType === "WARNING") {
      user.lockHistory.push({
        lockedBy: adminEmail,
        lockedAt,
        lockType: "WARNING",
        lockSource: validLockSource,
        violationType: normalizedViolation,
        violationCount: currentCount,
        recommendedDuration,
        actualDuration,
        lockReason: finalReason,
        emailSent: false, // sẽ cập nhật lại sau khi gửi email
      });
    } else {
      user.status = "BLOCKED";
      user.lockType = durationType;
      user.lockSource = validLockSource;
      user.lockedAt = lockedAt;
      user.lockedUntil = untilDate || null;
      user.lockReason = finalReason;
      user.lockedBy = adminEmail;
      user.recommendedDuration = recommendedDuration;
      user.actualDuration = actualDuration;
      user.violationType = normalizedViolation;

      user.lockHistory.push({
        lockedBy: adminEmail,
        lockedAt,
        lockedUntil: untilDate,
        lockType: durationType,
        lockSource: validLockSource,
        violationType: normalizedViolation,
        violationCount: currentCount,
        recommendedDuration,
        actualDuration,
        lockReason: finalReason,
        emailSent: false, // sẽ cập nhật lại sau khi gửi email
      });

      const banDuration =
        durationType === "INDEFINITE"
          ? "876000h"
          : `${Math.ceil((durationMs || 0) / (60 * 60 * 1000))}h`;

      const { error: banError } =
        await this.supabaseAdmin.auth.admin.updateUserById(user.supabaseId, {
          ban_duration: banDuration,
        });
      if (banError) {
        this.logEmailDebug(
          `Lỗi đồng bộ trạng thái khóa sang Supabase: ${banError.message}`,
        );
      }

      const { error: signOutError } =
        await this.supabaseAdmin.auth.admin.signOut(user.supabaseId);
      if (signOutError) {
        this.logEmailDebug(
          `Lỗi thu hồi phiên đăng nhập trên Supabase: ${signOutError.message}`,
        );
      }
    }

    // 4. Gửi email thông báo (bắt buộc)
    let emailWarning: string | undefined = undefined;
    try {
      await this.sendPenaltyEmail(user.email, {
        violationType: normalizedViolation,
        lockReason: finalReason,
        actualDuration,
        lockedAt,
        lockedUntil: untilDate,
      });
      emailSentSuccess = true;
    } catch (err: unknown) {
      const errObj = err as Error;
      this.logEmailDebug(
        `Lỗi gửi email phạt cho ${user.email}: ${errObj.message}`,
      );
      emailWarning =
        "Tài khoản đã được khóa thành công nhưng hệ thống không thể gửi email thông báo. Vui lòng kiểm tra dịch vụ Email.";
    }

    if (user.lockHistory.length > 0) {
      user.lockHistory[user.lockHistory.length - 1].emailSent =
        emailSentSuccess;
    }

    await user.save();

    let violationCountsObj = {};
    if (user.violationCounts) {
      violationCountsObj = Object.fromEntries(user.violationCounts);
    }

    return {
      id: user._id,
      email: user.email,
      status: user.status,
      lockType: user.lockType,
      lockedUntil: user.lockedUntil,
      violationCounts: violationCountsObj,
      emailSent: emailSentSuccess,
      emailWarning,
    };
  }

  async unlockUserAccount(id: string, adminEmail: string) {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException("Người dùng không tồn tại");
    }

    user.status = "ACTIVE";
    user.lockType = null;
    user.lockSource = null;
    user.lockedAt = null;
    user.lockedUntil = null;
    user.lockReason = null;
    user.lockedBy = null;
    user.recommendedDuration = null;
    user.actualDuration = null;
    user.violationType = null;

    if (user.lockHistory && user.lockHistory.length > 0) {
      const lastLock = user.lockHistory[user.lockHistory.length - 1];
      if (!lastLock.unlockedAt) {
        lastLock.unlockedAt = new Date();
        lastLock.unlockedBy = adminEmail;
      }
    }

    await user.save();

    const { error: banError } =
      await this.supabaseAdmin.auth.admin.updateUserById(user.supabaseId, {
        ban_duration: "none",
      });
    if (banError) {
      this.logEmailDebug(`Lỗi gỡ ban trên Supabase: ${banError.message}`);
    }

    try {
      await this.sendUnlockEmail(user.email);
    } catch (err: unknown) {
      const errObj = err as Error;
      this.logEmailDebug(
        `Lỗi gửi email mở khóa đến ${user.email}: ${errObj.message}`,
      );
    }

    return { success: true, message: "Mở khóa tài khoản thành công" };
  }

  async extendUserLock(
    id: string,
    body: { actualDuration: string; lockReason: string },
    adminEmail: string,
  ) {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException("Người dùng không tồn tại");
    }

    const { actualDuration, lockReason } = body;
    const lockedAt = new Date();

    let durationType: "TEMPORARY" | "INDEFINITE" = "TEMPORARY";
    let durationMs: number | undefined;
    let untilDate: Date | undefined;

    if (
      actualDuration === "Vô thời hạn" ||
      actualDuration === "indefinite" ||
      actualDuration === "Khóa cho đến khi quản trị viên mở khóa"
    ) {
      durationType = "INDEFINITE";
    } else if (
      actualDuration.includes("-") &&
      !isNaN(Date.parse(actualDuration))
    ) {
      untilDate = new Date(actualDuration);
      durationMs = untilDate.getTime() - Date.now();
      if (durationMs < 0) durationMs = 0;
    } else {
      const map: Record<string, number> = {
        "1 giờ": 1 * 60 * 60 * 1000,
        "1h": 1 * 60 * 60 * 1000,
        "6 giờ": 6 * 60 * 60 * 1000,
        "6h": 6 * 60 * 60 * 1000,
        "12 giờ": 12 * 60 * 60 * 1000,
        "12h": 12 * 60 * 60 * 1000,
        "24 giờ": 24 * 60 * 60 * 1000,
        "24h": 24 * 60 * 60 * 1000,
        "3 ngày": 3 * 24 * 60 * 60 * 1000,
        "3d": 3 * 24 * 60 * 60 * 1000,
        "7 ngày": 7 * 24 * 60 * 60 * 1000,
        "7d": 7 * 24 * 60 * 60 * 1000,
        "30 ngày": 30 * 24 * 60 * 60 * 1000,
        "30d": 30 * 24 * 60 * 60 * 1000,
      };
      durationMs = map[actualDuration] || 24 * 60 * 60 * 1000;
      untilDate = new Date(Date.now() + durationMs);
    }

    user.lockType = durationType;
    user.lockedAt = lockedAt;
    user.lockedUntil = untilDate || null;
    user.lockReason = `${user.lockReason || ""} | Gia hạn: ${lockReason}`;
    user.lockedBy = adminEmail;
    user.actualDuration = actualDuration;

    user.lockHistory.push({
      lockedBy: adminEmail,
      lockedAt,
      lockedUntil: untilDate,
      lockType: durationType,
      lockSource: "MANUAL",
      violationType: `${user.violationType || "Vi phạm"} (Gia hạn)`,
      violationCount: 0,
      recommendedDuration: "N/A",
      actualDuration,
      lockReason,
      emailSent: false, // sẽ cập nhật lại sau khi gửi email
    });

    const banDuration =
      durationType === "INDEFINITE"
        ? "876000h"
        : `${Math.ceil((durationMs || 0) / (60 * 60 * 1000))}h`;

    await this.supabaseAdmin.auth.admin.updateUserById(user.supabaseId, {
      ban_duration: banDuration,
    });

    let emailSentSuccess = false;
    let emailWarning: string | undefined = undefined;
    try {
      await this.sendPenaltyEmail(user.email, {
        violationType: `${user.violationType || "Vi phạm"} (Gia hạn)`,
        lockReason,
        actualDuration,
        lockedAt,
        lockedUntil: untilDate,
      });
      emailSentSuccess = true;
    } catch (err: unknown) {
      const errObj = err as Error;
      this.logEmailDebug(
        `Lỗi gửi email gia hạn khóa đến ${user.email}: ${errObj.message}`,
      );
      emailWarning =
        "Tài khoản đã được khóa thành công nhưng hệ thống không thể gửi email thông báo. Vui lòng kiểm tra dịch vụ Email.";
    }

    if (user.lockHistory.length > 0) {
      user.lockHistory[user.lockHistory.length - 1].emailSent =
        emailSentSuccess;
    }

    await user.save();

    return {
      success: true,
      message: "Gia hạn thời gian khóa thành công",
      emailWarning,
    };
  }
}

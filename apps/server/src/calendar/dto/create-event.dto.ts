import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsArray,
  ValidateNested,
  IsEmail,
  IsIn,
  ValidateIf,
} from "class-validator";
import { Type } from "class-transformer";
import { IsAfterDate, IsFutureDate } from "../validators/calendar.validators";

export class InviteeDto {
  @IsOptional()
  @IsEmail({}, { message: "Email khách mời không đúng định dạng" })
  email?: string;

  @IsOptional()
  @IsString({ message: "UserId phải là chuỗi ký tự" })
  userId?: string;

  @IsOptional()
  @IsString()
  displayName?: string;
}

export class CreateEventDto {
  @IsNotEmpty({ message: "Tiêu đề cuộc họp không được để trống" })
  @IsString({ message: "Tiêu đề phải là chuỗi ký tự" })
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @ValidateIf((o: CreateEventDto) => o.roomType === "channel_meeting")
  @IsNotEmpty({ message: "Cuộc họp kênh yêu cầu phải chọn phòng và kênh." })
  @IsOptional()
  @IsString()
  roomId?: string;

  @ValidateIf((o: CreateEventDto) => o.roomType === "channel_meeting")
  @IsNotEmpty({ message: "Cuộc họp kênh yêu cầu phải chọn phòng và kênh." })
  @IsOptional()
  @IsString()
  channelId?: string;

  @IsOptional()
  @IsIn(["meeting", "classroom", "channel_meeting"], {
    message: "Loại cuộc họp không hợp lệ",
  })
  roomType?: "meeting" | "classroom" | "channel_meeting";

  @IsNotEmpty({ message: "Thời gian bắt đầu không được để trống" })
  @IsDateString({}, { message: "Thời gian bắt đầu không đúng định dạng" })
  @IsFutureDate({ message: "Thời gian bắt đầu họp phải sau thời gian hiện tại" })
  startDate: string;

  @IsNotEmpty({ message: "Thời gian kết thúc không được để trống" })
  @IsDateString({}, { message: "Thời gian kết thúc không đúng định dạng" })
  @IsAfterDate("startDate", {
    message: "Thời gian bắt đầu phải trước thời gian kết thúc",
  })
  endDate: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  meetingPassword?: string;

  @IsOptional()
  @IsString()
  recurrenceRule?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InviteeDto)
  invitees?: InviteeDto[];
}

// src/notifications/dto/get-notifications.dto.ts
import {
  IsOptional,
  IsString,
  IsBooleanString,
  IsInt,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

export class GetNotificationsDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsBooleanString() // Chấp nhận chuỗi 'true' hoặc 'false' từ URL
  isRead?: string;
}

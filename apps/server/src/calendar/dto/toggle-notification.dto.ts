import { IsBoolean, IsOptional } from "class-validator";

export class ToggleNotificationDto {
  @IsOptional()
  @IsBoolean({ message: "Trạng thái thông báo phải là kiểu boolean" })
  enabled?: boolean;
}

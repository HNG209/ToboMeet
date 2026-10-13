import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsIn,
} from "class-validator";
import { Type } from "class-transformer";

export class ChatMessageItemDto {
  @IsNotEmpty()
  @IsIn(["user", "assistant", "system"])
  role: "user" | "assistant" | "system";

  @IsNotEmpty()
  @IsString()
  content: string;
}

export class ChatAgentDto {
  @IsNotEmpty({ message: "Nội dung tin nhắn không được để trống" })
  @IsString({ message: "Nội dung tin nhắn phải là chuỗi ký tự" })
  message: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageItemDto)
  history?: ChatMessageItemDto[];
}

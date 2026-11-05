import {
  IsString,
  IsNotEmpty,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsBoolean,
  IsOptional,
} from "class-validator";

export class CreatePollDto {
  @IsString()
  @IsNotEmpty({ message: "Câu hỏi bình chọn không được để trống" })
  question: string;

  @IsArray({ message: "Danh sách lựa chọn phải là một mảng" })
  @ArrayMinSize(2, { message: "Phải có ít nhất 2 lựa chọn" })
  @ArrayMaxSize(50, { message: "Tối đa 50 lựa chọn" })
  @IsString({ each: true, message: "Mỗi lựa chọn phải là chuỗi ký tự" })
  options: string[];

  @IsBoolean()
  @IsOptional()
  allowMultiple?: boolean;
}

export class VotePollDto {
  @IsArray({ message: "Danh sách phương án bình chọn phải là một mảng" })
  @ArrayMinSize(1, { message: "Phải chọn ít nhất 1 phương án" })
  @IsString({ each: true })
  optionIds: string[];
}


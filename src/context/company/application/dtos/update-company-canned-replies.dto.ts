import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  CANNED_REPLY_BODY_MAX,
  CANNED_REPLY_TITLE_MAX,
  COMPANY_CANNED_REPLIES_MAX,
} from 'src/context/shared/domain/canned-reply';

export class CompanyCannedReplyItemDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ maxLength: CANNED_REPLY_TITLE_MAX })
  @IsString()
  @MaxLength(CANNED_REPLY_TITLE_MAX, {
    message: `El título no puede superar ${CANNED_REPLY_TITLE_MAX} caracteres`,
  })
  title: string;

  @ApiProperty({ maxLength: CANNED_REPLY_BODY_MAX })
  @IsString()
  @MaxLength(CANNED_REPLY_BODY_MAX, {
    message: `El texto no puede superar ${CANNED_REPLY_BODY_MAX} caracteres`,
  })
  body: string;
}

export class UpdateCompanyCannedRepliesDto {
  @ApiProperty({ type: [CompanyCannedReplyItemDto] })
  @IsArray()
  @ArrayMaxSize(COMPANY_CANNED_REPLIES_MAX, {
    message: `No puedes guardar más de ${COMPANY_CANNED_REPLIES_MAX} frases`,
  })
  @ValidateNested({ each: true })
  @Type(() => CompanyCannedReplyItemDto)
  items: CompanyCannedReplyItemDto[];
}

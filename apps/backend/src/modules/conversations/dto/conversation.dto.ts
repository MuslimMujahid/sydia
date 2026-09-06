import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class SendMessageDto {
  @IsOptional()
  @IsString()
  conversationId?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  content!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  attachmentIds?: string[];

  @IsString()
  @IsUUID()
  idempotencyKey!: string;
}

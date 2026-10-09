import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class ChatPreviewScopeDto {
  @IsOptional()
  @IsUUID()
  previewSessionId?: string;

  @IsOptional()
  @IsIn(['web', 'telegram', 'whatsapp'])
  previewChannel?: 'web' | 'telegram' | 'whatsapp';
}

export class SendMessageDto extends ChatPreviewScopeDto {
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

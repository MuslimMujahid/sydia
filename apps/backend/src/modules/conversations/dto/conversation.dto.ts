import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ValidateNested,
  ValidateIf,
  IsArray,
  IsNotEmpty,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
} from 'class-validator';

export class ChatPreviewScopeDto {
  @IsOptional()
  @IsUUID()
  previewSessionId?: string;

  @IsOptional()
  @IsIn(['web', 'telegram', 'whatsapp'])
  previewChannel?: 'web' | 'telegram' | 'whatsapp';
}

export class ChatSourceDto {
  @IsIn(['file', 'folder', 'note'])
  kind!: 'file' | 'folder' | 'note';

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  id!: string;

  @IsString()
  @MaxLength(500)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  path?: string;
}
export class ChatSegmentDto {
  @IsIn(['text', 'source'])
  type!: 'text' | 'source';

  @ValidateIf((value: ChatSegmentDto) => value.type === 'text')
  @IsString()
  @MaxLength(20000)
  text!: string;

  @ValidateIf((value: ChatSegmentDto) => value.type === 'source')
  @ValidateNested()
  @Type(() => ChatSourceDto)
  @IsNotEmpty()
  source!: ChatSourceDto;
}

export class SendMessageDto extends ChatPreviewScopeDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  @Matches(/^(custom:[a-zA-Z0-9_-]+|daily:\d{4}-\d{2}-\d{2})$/)
  activeNoteRef?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ChatSegmentDto)
  sourceSegments?: ChatSegmentDto[];

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

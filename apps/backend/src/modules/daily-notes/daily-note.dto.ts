import {
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  Matches,
} from 'class-validator';
import { DAY_KEY_PATTERN } from '../../database/entities';

export class DailyNoteRangeDto {
  @IsOptional()
  @Matches(DAY_KEY_PATTERN, {
    message: 'from must be a calendar date in YYYY-MM-DD form.',
  })
  from?: string;

  @IsOptional()
  @Matches(DAY_KEY_PATTERN, {
    message: 'to must be a calendar date in YYYY-MM-DD form.',
  })
  to?: string;
}

/**
 * The Tiptap document is checked as a non-empty object here and validated
 * structurally in the service, where the node vocabulary is understood.
 */
export class SaveDailyNoteDto {
  @IsObject()
  @IsNotEmptyObject()
  content!: Record<string, unknown>;
}

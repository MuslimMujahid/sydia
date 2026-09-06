import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from '../../database/entities';

export class CreateTaskDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  title!: string;

  @IsOptional() @IsString() @MaxLength(4000) description?: string | null;
  @IsOptional() @IsIn(TASK_PRIORITIES) priority?: TaskPriority;
  @ValidateIf(
    (_o: unknown, value: unknown) => value !== undefined && value !== null,
  )
  @IsDateString()
  dueAt?: string | null;

  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}
export class UpdateTaskDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @IsIn(TASK_PRIORITIES)
  priority?: TaskPriority;

  @ValidateIf(
    (_o: unknown, value: unknown) => value !== undefined && value !== null,
  )
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: TaskStatus;
}
export class TaskFiltersDto {
  @IsOptional() @IsIn(TASK_STATUSES) status?: TaskStatus;
  @IsOptional() @IsIn(['today', 'upcoming', 'overdue', 'none']) due?:
    'today' | 'upcoming' | 'overdue' | 'none';

  @IsOptional() @IsString() search?: string;
}

import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type {
  AdminUsersInput,
  AdminUserStatus,
} from '../../database/interfaces';

export class AdminUsersQueryDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER) offset = 0;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
  @IsOptional() @IsString() @MaxLength(255) q?: string;
  @IsOptional() @IsIn(['active', 'banned']) status?: AdminUserStatus;
  @IsOptional()
  @IsIn(['trial', 'plus', 'expired'])
  plan?: AdminUsersInput['plan'];

  @IsOptional()
  @IsIn(['active', 'inactive'])
  activity?: AdminUsersInput['activity'];

  @IsOptional()
  @IsIn(['trial-expiring', 'plus-expiring'])
  attention?: AdminUsersInput['attention'];

  @IsOptional()
  @IsIn(['newest', 'oldest', 'activity'])
  sort?: AdminUsersInput['sort'];
}

export class AdminDashboardQueryDto {
  @Type(() => Number) @IsIn([7, 30, 90]) period: 7 | 30 | 90 = 30;
}

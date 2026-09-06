import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  CATEGORY_REPOSITORY,
  type ICategoryRepository,
} from '../../database/interfaces';
import {
  CATEGORY_COLORS,
  CATEGORY_ICON_KEYS,
  type CategoryColor,
  type CategoryIconKey,
} from '../../database/entities';
import { ApiException, ErrorCodes } from '../../shared/errors';

class CreateCategoryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  @IsIn(CATEGORY_COLORS) color!: CategoryColor;
  @IsIn(CATEGORY_ICON_KEYS) iconKey!: CategoryIconKey;
}

class UpdateCategoryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name?: string;

  @IsOptional() @IsIn(CATEGORY_COLORS) color?: CategoryColor;
  @IsOptional() @IsIn(CATEGORY_ICON_KEYS) iconKey?: CategoryIconKey;
}

@Controller('categories')
export class CategoriesController {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categories: ICategoryRepository,
  ) {}

  @Get() list(@Session() session: UserSession) {
    return this.categories.list(session.user.id);
  }

  @Post() async create(
    @Session() session: UserSession,
    @Body() input: CreateCategoryDto,
  ) {
    try {
      return await this.categories.create(session.user.id, input);
    } catch (error) {
      throw this.categoryError(error);
    }
  }

  @Patch(':id') async update(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() input: UpdateCategoryDto,
  ) {
    try {
      const category = await this.categories.update(session.user.id, id, input);
      if (!category) throw this.notFound();

      return category;
    } catch (error) {
      if (error instanceof ApiException) throw error;
      throw this.categoryError(error);
    }
  }

  @Delete(':id') async remove(
    @Session() session: UserSession,
    @Param('id') id: string,
  ) {
    const category = await this.categories.delete(session.user.id, id);
    if (!category) throw this.notFound();

    return category;
  }

  private notFound(): ApiException {
    return new ApiException({
      code: ErrorCodes.NOT_FOUND,
      message: 'Kategori tidak ditemukan.',
      status: HttpStatus.NOT_FOUND,
    });
  }

  private categoryError(error: unknown): ApiException {
    const message =
      error instanceof Error ? error.message : 'Kategori tidak dapat disimpan.';

    const conflict = message.includes('Unique constraint');

    return new ApiException({
      code: conflict ? ErrorCodes.CONFLICT : ErrorCodes.BAD_REQUEST,
      message: conflict ? 'Nama kategori sudah digunakan.' : message,
      status: conflict ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST,
    });
  }
}

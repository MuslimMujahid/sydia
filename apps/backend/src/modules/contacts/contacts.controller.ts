import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  CONTACT_GROUP_REPOSITORY,
  CONTACT_REPOSITORY,
  type IContactGroupRepository,
  type IContactRepository,
} from '../../database/interfaces';
import { ApiException, ErrorCodes } from '../../shared/errors';
import {
  CreateContactDto,
  CreateContactGroupDto,
  UpdateContactDto,
  UpdateContactGroupDto,
} from './contact.dto';

@Roles(['user'])
@Controller('contact-groups')
export class ContactGroupsController {
  constructor(
    @Inject(CONTACT_GROUP_REPOSITORY)
    private readonly groups: IContactGroupRepository,
  ) {}

  @Get() list(@Session() session: UserSession) {
    return this.groups.list(session.user.id);
  }

  @Post() async create(
    @Session() session: UserSession,
    @Body() input: CreateContactGroupDto,
  ) {
    try {
      return await this.groups.create(session.user.id, input);
    } catch (error) {
      throw this.groupError(error);
    }
  }

  @Patch(':id') async update(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() input: UpdateContactGroupDto,
  ) {
    try {
      const group = await this.groups.update(session.user.id, id, input);
      if (!group) throw this.notFound();

      return group;
    } catch (error) {
      if (error instanceof ApiException) throw error;
      throw this.groupError(error);
    }
  }

  @Delete(':id') async remove(
    @Session() session: UserSession,
    @Param('id') id: string,
  ) {
    const group = await this.groups.delete(session.user.id, id);
    if (!group) throw this.notFound();

    return group;
  }

  private notFound(): ApiException {
    return new ApiException({
      code: ErrorCodes.NOT_FOUND,
      message: 'Grup tidak ditemukan.',
      status: HttpStatus.NOT_FOUND,
    });
  }

  private groupError(error: unknown): ApiException {
    const message =
      error instanceof Error ? error.message : 'Grup tidak dapat disimpan.';

    const conflict = message.includes('Unique constraint');

    return new ApiException({
      code: conflict ? ErrorCodes.CONFLICT : ErrorCodes.BAD_REQUEST,
      message: conflict ? 'Nama grup sudah digunakan.' : message,
      status: conflict ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST,
    });
  }
}

@Roles(['user'])
@Controller('contacts')
export class ContactsController {
  constructor(
    @Inject(CONTACT_REPOSITORY) private readonly contacts: IContactRepository,
  ) {}

  @Get() list(
    @Session() session: UserSession,
    @Query('q') query?: string,
    @Query('groupId') groupId?: string,
  ) {
    return this.contacts.list(session.user.id, { query, groupId });
  }

  @Get(':id') async get(
    @Session() session: UserSession,
    @Param('id') id: string,
  ) {
    return this.required(await this.contacts.findById(session.user.id, id));
  }

  @Post() async create(
    @Session() session: UserSession,
    @Body() input: CreateContactDto,
  ) {
    try {
      return await this.contacts.create(session.user.id, input);
    } catch (error) {
      throw this.contactError(error);
    }
  }

  @Patch(':id') async update(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() input: UpdateContactDto,
  ) {
    try {
      return this.required(
        await this.contacts.update(session.user.id, id, input),
      );
    } catch (error) {
      if (error instanceof ApiException) throw error;
      throw this.contactError(error);
    }
  }

  @Delete(':id') @HttpCode(HttpStatus.NO_CONTENT) async remove(
    @Session() session: UserSession,
    @Param('id') id: string,
  ) {
    if (!(await this.contacts.delete(session.user.id, id)))
      throw this.notFound();
  }

  private required<T>(value: T | null): T {
    if (!value) throw this.notFound();

    return value;
  }

  private notFound(): ApiException {
    return new ApiException({
      code: ErrorCodes.NOT_FOUND,
      message: 'Kontak tidak ditemukan.',
      status: HttpStatus.NOT_FOUND,
    });
  }

  private contactError(error: unknown): ApiException {
    return new ApiException({
      code: ErrorCodes.BAD_REQUEST,
      message:
        error instanceof Error ? error.message : 'Kontak tidak dapat disimpan.',
      status: HttpStatus.BAD_REQUEST,
    });
  }
}

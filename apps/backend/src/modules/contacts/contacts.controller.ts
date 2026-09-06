import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { CONTACT_REPOSITORY, type IContactRepository } from '../../database/interfaces';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { CreateContactDto, UpdateContactDto } from './contact.dto';

@Controller('contacts')
export class ContactsController {
  constructor(@Inject(CONTACT_REPOSITORY) private readonly contacts: IContactRepository) {}
  @Get() list(@Session() session: UserSession, @Query('q') query?: string) { return this.contacts.list(session.user.id, query); }
  @Get(':id') async get(@Session() session: UserSession, @Param('id') id: string) { return this.required(await this.contacts.findById(session.user.id, id)); }
  @Post() create(@Session() session: UserSession, @Body() input: CreateContactDto) { return this.contacts.create(session.user.id, input); }
  @Patch(':id') async update(@Session() session: UserSession, @Param('id') id: string, @Body() input: UpdateContactDto) { return this.required(await this.contacts.update(session.user.id, id, input)); }
  @Delete(':id') @HttpCode(HttpStatus.NO_CONTENT) async remove(@Session() session: UserSession, @Param('id') id: string) { if (!await this.contacts.delete(session.user.id, id)) throw this.notFound(); }
  private required<T>(value: T | null): T { if (!value) throw this.notFound(); return value; }
  private notFound(): ApiException { return new ApiException({ code: ErrorCodes.NOT_FOUND, message: 'Kontak tidak ditemukan.', status: HttpStatus.NOT_FOUND }); }
}

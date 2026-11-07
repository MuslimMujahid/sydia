import { RecordUserActivity } from '../../shared/activity/user-activity';
import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import {
  AllowAnonymous,
  Roles,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';
import { AllowInactiveBilling } from '../billing';
import { RecordNotesService } from './record-notes.service';

@Controller('record-notes')
export class RecordNotesController {
  constructor(private readonly records: RecordNotesService) {}
  @RecordUserActivity('notes')
  @Roles(['user'])
  @Post()
  create(@Session() session: UserSession, @Body() body: unknown) {
    return this.records.create(session.user.id, body);
  }

  @Roles(['user']) @Get(':id/metadata') metadata(
    @Session() session: UserSession,
    @Param('id') id: string,
  ) {
    return this.records.metadata(session.user.id, id);
  }

  @Roles(['user']) @Post(':id/content') @AllowInactiveBilling() content(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.records.content(session.user.id, id, body);
  }

  @RecordUserActivity('notes')
  @Roles(['user'])
  @Post(':id/mutations')
  mutate(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.records.mutate(session.user.id, id, body);
  }

  @Roles(['user']) @Post('query') @AllowInactiveBilling() query(
    @Session() session: UserSession,
    @Body() body: unknown,
  ) {
    return this.records.query(session.user.id, body);
  }

  @Roles(['user']) @Post(':id/export') @AllowInactiveBilling() export(
    @Session() session: UserSession,
    @Param('id') id: string,
  ) {
    return this.records.exportLink(session.user.id, id);
  }

  @Roles(['user']) @Get(':id/csv') @AllowInactiveBilling() async csv(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    this.send(response, await this.records.export(session.user.id, id));
  }

  @AllowAnonymous()
  @Get('download/:token')
  @AllowInactiveBilling()
  async download(@Param('token') token: string, @Res() response: Response) {
    this.send(response, await this.records.download(token));
  }

  private send(
    response: Response,
    saved: Awaited<ReturnType<RecordNotesService['export']>>,
  ) {
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="records.csv"; filename*=UTF-8''${encodeURIComponent(saved.filename)}`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Record-Revision', String(saved.revision));
    response.send(saved.csv);
  }
}

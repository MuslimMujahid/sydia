import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';
import {
  DOCUMENT_REPOSITORY,
  type IDocumentRepository,
} from '../../database/interfaces';
import { StorageService } from '../../infra/storage';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { DocumentService } from './document.service';

type UploadedDocument = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};
@Roles(['user'])
@Controller('documents')
export class DocumentsController {
  constructor(
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documents: IDocumentRepository,
    private readonly service: DocumentService,
    private readonly storage: StorageService,
  ) {}

  @Get() list(@Session() session: UserSession) {
    return this.documents.list(session.user.id);
  }

  @Get(':id') async get(
    @Session() session: UserSession,
    @Param('id') id: string,
  ) {
    return this.required(
      await this.documents.findById(session.user.id, id, true),
    );
  }

  @Get(':id/content') async content(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const document = this.required(
      await this.documents.findById(session.user.id, id),
    );

    const storageKey = this.required(
      await this.documents.storageKey(session.user.id, id),
    );

    const file = await this.storage.get(storageKey);
    response
      .type(document.file.mimeType)
      .setHeader(
        'Content-Disposition',
        `inline; filename*=UTF-8''${encodeURIComponent(document.file.originalName)}`,
      )
      .send(file);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024, files: 1 },
    }),
  )
  async upload(
    @Session() session: UserSession,
    @UploadedFile() file?: UploadedDocument,
  ) {
    if (!file)
      throw new ApiException({
        code: ErrorCodes.BAD_REQUEST,
        message: 'File wajib dipilih.',
        status: HttpStatus.BAD_REQUEST,
      });

    return this.service.ingest(session.user.id, file);
  }

  @Post(':id/retry') async retry(
    @Session() session: UserSession,
    @Param('id') id: string,
  ) {
    return this.required(await this.service.retry(id, session.user.id));
  }

  @Delete(':id') @HttpCode(HttpStatus.NO_CONTENT) async remove(
    @Session() session: UserSession,
    @Param('id') id: string,
  ) {
    const key = await this.documents.storageKey(session.user.id, id);
    if (!key) throw this.notFound();
    await this.storage.delete(key);
    await this.documents.delete(session.user.id, id);
  }

  private required<T>(value: T | null): T {
    if (!value) throw this.notFound();

    return value;
  }

  private notFound(): ApiException {
    return new ApiException({
      code: ErrorCodes.NOT_FOUND,
      message: 'File tidak ditemukan.',
      status: HttpStatus.NOT_FOUND,
    });
  }
}

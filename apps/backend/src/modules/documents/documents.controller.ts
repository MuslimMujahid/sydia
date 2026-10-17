import {
  Controller,
  Body,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { Roles, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';
import {
  DOCUMENT_REPOSITORY,
  type IDocumentRepository,
} from '../../database/interfaces';
import { StorageService } from '../../infra/storage';
import { ApiException, ErrorCodes } from '../../shared/errors';
import type { Document } from '../../database/entities';
import { DocumentService } from './document.service';
import { UpdateDocumentDto } from './dto';
import { DocumentUploadInterceptor } from './document-upload.interceptor';
import { UploadFileFolderDto } from './file-library.dto';

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
    @Query('download') download?: string,
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
        `${download === '1' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(document.title)}`,
      )
      .send(file);
  }

  @Post()
  @UseInterceptors(DocumentUploadInterceptor)
  async upload(
    @Session() session: UserSession,
    @UploadedFile() file?: UploadedDocument,
    @Body() body?: UploadFileFolderDto,
  ) {
    if (!file)
      throw new ApiException({
        code: ErrorCodes.BAD_REQUEST,
        message: 'File wajib dipilih.',
        status: HttpStatus.BAD_REQUEST,
      });

    return this.service.ingest(
      session.user.id,
      file,
      body?.folderId ? { folderId: body.folderId } : undefined,
    );
  }

  @Patch(':id')
  async update(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() body: UpdateDocumentDto,
  ): Promise<Document> {
    if (body.title === undefined && body.description === undefined)
      throw new ApiException({
        code: ErrorCodes.BAD_REQUEST,
        message: 'Tidak ada perubahan yang dikirim.',
        status: HttpStatus.BAD_REQUEST,
      });

    return this.required(await this.service.update(session.user.id, id, body));
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
    if (!(await this.service.remove(session.user.id, id)))
      throw this.notFound();
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

import { describe, expect, jest, it } from '@jest/globals';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';
import type { Document } from '../../database/entities';
import type { IDocumentRepository } from '../../database/interfaces';
import type { StorageService } from '../../infra/storage';
import type { DocumentService } from './document.service';
import { DocumentsController } from './documents.controller';

function contentBoundary() {
  const document = {
    id: 'document-1',
    title: 'Invoice 1.pdf',
    file: { mimeType: 'application/pdf' },
  } as Document;

  const documents = {
    findById: jest
      .fn<IDocumentRepository['findById']>()
      .mockResolvedValue(document),
    storageKey: jest
      .fn<IDocumentRepository['storageKey']>()
      .mockResolvedValue('private/document-1'),
  };

  const storage = {
    get: jest
      .fn<StorageService['get']>()
      .mockResolvedValue(Buffer.from('file bytes')),
  };

  const response = {
    type: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };

  const controller = new DocumentsController(
    documents as unknown as IDocumentRepository,
    {} as DocumentService,
    storage as unknown as StorageService,
  );

  const session = { user: { id: 'user-1' } } as UserSession;

  return { controller, session, response, documents };
}

describe('file content disposition', () => {
  it('opens file content inline by default', async () => {
    const { controller, session, response } = contentBoundary();
    await controller.content(
      session,
      'document-1',
      response as unknown as Response,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      "inline; filename*=UTF-8''Invoice%201.pdf",
    );
  });
  it('downloads the file as an attachment when requested', async () => {
    const { controller, session, response } = contentBoundary();
    await controller.content(
      session,
      'document-1',
      response as unknown as Response,
      '1',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      "attachment; filename*=UTF-8''Invoice%201.pdf",
    );
  });
  it('uses the authenticated owner when resolving the requested content', async () => {
    const { controller, session, response, documents } = contentBoundary();
    await controller.content(
      session,
      'document-1',
      response as unknown as Response,
      '1',
    );
    expect(documents.findById).toHaveBeenCalledWith('user-1', 'document-1');
  });
  it('rejects content access when the owned document is absent', async () => {
    const { controller, session, response, documents } = contentBoundary();
    documents.findById.mockResolvedValue(null);
    await expect(
      controller.content(
        session,
        'document-1',
        response as unknown as Response,
        '1',
      ),
    ).rejects.toMatchObject({
      status: 404,
      response: {
        error: { code: 'NOT_FOUND', message: 'File tidak ditemukan.' },
      },
    });
  });
});

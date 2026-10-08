import {
  type CallHandler,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  type NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Observable } from 'rxjs';
import { MAX_DOCUMENT_BYTES } from '../../infra/document-parser';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { documentParserFailureMessage } from './document-parser-errors';

const MultipartDocumentInterceptor = FileInterceptor('file', {
  // Busboy emits its size-limit error when the byte count reaches the limit.
  // One byte of headroom accepts exactly 25 MiB; the next byte is rejected.
  limits: { fileSize: MAX_DOCUMENT_BYTES + 1, files: 1 },
});

@Injectable()
export class DocumentUploadInterceptor implements NestInterceptor {
  private readonly multipart = new MultipartDocumentInterceptor();

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    try {
      return await this.multipart.intercept(context, next);
    } catch (error: unknown) {
      if (error instanceof PayloadTooLargeException)
        throw new ApiException({
          code: ErrorCodes.BAD_REQUEST,
          status: HttpStatus.PAYLOAD_TOO_LARGE,
          message: documentParserFailureMessage('FILE_TOO_LARGE'),
          details: { parserCode: 'FILE_TOO_LARGE' },
        });
      throw error;
    }
  }
}

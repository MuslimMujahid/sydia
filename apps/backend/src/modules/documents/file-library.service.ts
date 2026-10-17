import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  FILE_LIBRARY_REPOSITORY,
  type IFileLibraryRepository,
} from '../../database/interfaces';
import { FileLibraryError } from '../../database/entities';
import { ApiException, ErrorCodes } from '../../shared/errors';

@Injectable()
export class FileLibraryService {
  private readonly logger = new Logger(FileLibraryService.name);
  constructor(
    @Inject(FILE_LIBRARY_REPOSITORY)
    readonly repository: IFileLibraryRepository,
  ) {}

  async execute<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error: unknown) {
      this.logger.warn('File library action failed.', error);

      if (error instanceof FileLibraryError) {
        const status =
          error.reason === 'not_found'
            ? HttpStatus.NOT_FOUND
            : error.reason === 'invalid_name'
              ? HttpStatus.BAD_REQUEST
              : HttpStatus.CONFLICT;

        throw new ApiException({
          status,
          code:
            status === HttpStatus.NOT_FOUND
              ? ErrorCodes.NOT_FOUND
              : status === HttpStatus.BAD_REQUEST
                ? ErrorCodes.BAD_REQUEST
                : ErrorCodes.CONFLICT,
          message: error.message,
          details: { reason: error.reason, ...error.details },
        });
      }

      throw error;
    }
  }
}

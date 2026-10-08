import { parseLocalDocument } from './parser-engine';
import {
  DocumentParserError,
  type ParserRequest,
  type ParserResponse,
} from './document-parser.types';

process.once('message', (request: ParserRequest) => {
  void (async () => {
    let response: ParserResponse;

    try {
      const result = await parseLocalDocument(
        request,
        (stage, active) =>
          new Promise<void>((resolve, reject) => {
            if (!process.send) {
              reject(new DocumentParserError('PARSER_PROCESS_STOPPED', true));

              return;
            }

            process.send({ stage, active }, (error: Error | null) => {
              if (error) reject(error);
              else resolve();
            });
          }),
      );

      response = { ok: true, result };
    } catch (error: unknown) {
      const officeIssue =
        error && typeof error === 'object' && 'officeIssue' in error
          ? error.officeIssue
          : undefined;

      const libraryCode =
        error &&
        typeof error === 'object' &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : officeIssue &&
              typeof officeIssue === 'object' &&
              'code' in officeIssue &&
              typeof officeIssue.code === 'string'
            ? officeIssue.code
            : undefined;

      response = {
        ok: false,
        code:
          error instanceof DocumentParserError
            ? error.code
            : (libraryCode ?? 'CORRUPT_DOCUMENT'),
        retryable: error instanceof DocumentParserError && error.retryable,
      };
    }

    process.send?.(response, () => process.disconnect?.());
  })();
});

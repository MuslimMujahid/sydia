import { Module } from '@nestjs/common';
import { DocumentParserService } from './document-parser.service';
import { DocumentParserSettings } from './document-parser.config';

@Module({
  providers: [DocumentParserSettings, DocumentParserService],
  exports: [DocumentParserSettings, DocumentParserService],
})
export class DocumentParserModule {}

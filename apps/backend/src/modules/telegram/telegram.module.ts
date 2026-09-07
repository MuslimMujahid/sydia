import { Module } from '@nestjs/common';
import { AuditModule } from '../../database/audit.module';
import {
  TELEGRAM_REPOSITORY,
  USER_REPOSITORY,
} from '../../database/interfaces';
import {
  PrismaTelegramRepository,
  PrismaUserRepository,
} from '../../database/repositories';
import { ModelGatewayModule } from '../../infra/model-gateway';
import { TelegramInfraModule } from '../../infra/telegram';
import { DocumentsModule } from '../documents/documents.module';
import { MessagingModule } from '../messaging';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';

@Module({
  imports: [
    TelegramInfraModule,
    MessagingModule,
    DocumentsModule,
    ModelGatewayModule,
    AuditModule,
  ],
  controllers: [TelegramController],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: TELEGRAM_REPOSITORY, useClass: PrismaTelegramRepository },
    TelegramService,
  ],
  exports: [TelegramService],
})
export class TelegramModule {}

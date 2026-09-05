import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../infra/prisma';
import { AUDIT_EVENT_REPOSITORY } from './interfaces';
import { PrismaAuditEventRepository } from './repositories';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: AUDIT_EVENT_REPOSITORY,
      useClass: PrismaAuditEventRepository,
    },
  ],
  exports: [AUDIT_EVENT_REPOSITORY],
})
export class AuditModule {}

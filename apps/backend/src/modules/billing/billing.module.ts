import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BILLING_REPOSITORY, USER_REPOSITORY } from '../../database/interfaces';
import {
  PrismaBillingRepository,
  PrismaUserRepository,
} from '../../database/repositories';
import { MayarModule } from '../../infra/mayar';
import { BillingAccessService } from './billing-access.service';
import { BillingAccessInterceptor } from './billing-access.interceptor';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { BillingWebhookController } from './billing-webhook.controller';
import { StorageQuotaService } from './storage-quota.service';
import { BillingOperationsService } from './billing-operations.service';

@Global()
@Module({
  imports: [MayarModule],
  controllers: [BillingController, BillingWebhookController],
  providers: [
    { provide: BILLING_REPOSITORY, useClass: PrismaBillingRepository },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    BillingAccessService,
    BillingService,
    StorageQuotaService,
    BillingOperationsService,
    { provide: APP_INTERCEPTOR, useClass: BillingAccessInterceptor },
  ],
  exports: [
    BillingAccessService,
    BillingService,
    StorageQuotaService,
    BillingOperationsService,
  ],
})
export class BillingModule {}

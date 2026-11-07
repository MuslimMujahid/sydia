import { ConfigService } from '@nestjs/config';
import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  AUDIT_EVENT_REPOSITORY,
  type IAdminRepository,
  type AdminUsersInput,
  type IAuditEventRepository,
} from '../../database/interfaces';
import { StorageService } from '../../infra/storage';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { PaginatedResult } from '../../shared/response';
import { extractionKey } from '../../shared/documents';

export type AdminAction = 'ban' | 'unban' | 'force-sign-out' | 'delete';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepository: IAdminRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditEvents: IAuditEventRepository,
    private readonly storage: StorageService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  overview() {
    return this.adminRepository.overview(new Date());
  }

  async users(input: AdminUsersInput) {
    const result = await this.adminRepository.users(new Date(), {
      ...input,
      environment: this.config?.getOrThrow<string>('MAYAR_ENVIRONMENT'),
      rolloutAt: this.config?.get<string>('BACKEND_BILLING_ROLLOUT_AT')
        ? new Date(this.config.getOrThrow<string>('BACKEND_BILLING_ROLLOUT_AT'))
        : undefined,
    });

    return new PaginatedResult(result.items, {
      offset: result.offset,
      limit: input.limit,
      total: result.total,
    });
  }

  async act(
    actorId: string,
    userId: string,
    action: AdminAction,
  ): Promise<{ success: true }> {
    if (actorId === userId && (action === 'ban' || action === 'delete')) {
      throw new ApiException({
        code: ErrorCodes.BAD_REQUEST,
        message:
          'Administrator tidak dapat memblokir atau menghapus akunnya sendiri.',
        status: HttpStatus.BAD_REQUEST,
      });
    }

    let found = true;
    let cleanupIncomplete = false;

    if (action === 'ban') {
      found = await this.adminRepository.ban(
        userId,
        'Dinonaktifkan oleh administrator Sydia.',
      );
    } else if (action === 'unban') {
      found = await this.adminRepository.unban(userId);
    } else if (action === 'force-sign-out') {
      await this.adminRepository.revokeSessions(userId);
    } else {
      const storageKeys = await this.adminRepository.storageKeys(userId);

      // Keep the account until every original and extraction artifact is removed.
      try {
        for (const key of storageKeys) {
          await this.storage.delete(extractionKey(key));
          await this.storage.delete(key);
        }
      } catch (error: unknown) {
        this.logger.error('Admin document cleanup failed', error);
        const failure = new ApiException({
          code: ErrorCodes.SERVICE_UNAVAILABLE,
          status: HttpStatus.SERVICE_UNAVAILABLE,
          message:
            'Pengguna belum dihapus karena pembersihan file belum selesai. Coba kembali atau hubungi administrator.',
          details: { cleanupIncomplete: true, accountDeleted: false },
        });

        failure.cause = error;
        throw failure;
      }

      found = await this.adminRepository.deleteUser(userId);

      if (found) {
        // A worker may have saved a checkpoint while the account was being deleted.
        // Subsequent writes are removed by the worker's missing-record cleanup.
        const cleanup = await Promise.allSettled(
          storageKeys.map((key) => this.storage.delete(extractionKey(key))),
        );

        for (const result of cleanup) {
          if (result.status === 'rejected')
            this.logger.error(
              'Deleted user document cleanup remains incomplete',
              result.reason,
            );
        }

        cleanupIncomplete = cleanup.some(
          (result) => result.status === 'rejected',
        );
      }
    }

    if (!found) {
      throw new ApiException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Pengguna tidak ditemukan.',
        status: HttpStatus.NOT_FOUND,
      });
    }

    await this.auditEvents.record({
      // The deleted target can no longer be an audit-event foreign key.
      userId: action === 'delete' ? actorId : userId,
      eventType: `admin.user.${action}`,
      metadata: {
        actorId,
        ...(action === 'delete' ? { targetUserId: userId } : {}),
      },
    });

    if (cleanupIncomplete)
      throw new ApiException({
        code: ErrorCodes.SERVICE_UNAVAILABLE,
        status: HttpStatus.SERVICE_UNAVAILABLE,
        message:
          'Pengguna telah dihapus, tetapi pembersihan dokumen belum selesai. Hubungi administrator.',
        details: { cleanupIncomplete: true, accountDeleted: true },
      });

    return { success: true };
  }
}

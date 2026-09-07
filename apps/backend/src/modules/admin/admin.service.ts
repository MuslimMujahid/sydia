import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  AUDIT_EVENT_REPOSITORY,
  type IAdminRepository,
  type IAuditEventRepository,
} from '../../database/interfaces';
import { StorageService } from '../../infra/storage';
import { ApiException, ErrorCodes } from '../../shared/errors';

export type AdminAction = 'ban' | 'unban' | 'force-sign-out' | 'delete';

@Injectable()
export class AdminService {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepository: IAdminRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditEvents: IAuditEventRepository,
    private readonly storage: StorageService,
  ) {}

  overview() {
    return this.adminRepository.overview(new Date());
  }

  users() {
    return this.adminRepository.users(new Date());
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
      await Promise.all(storageKeys.map((key) => this.storage.delete(key)));
      found = await this.adminRepository.deleteUser(userId);
    }

    if (!found) {
      throw new ApiException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Pengguna tidak ditemukan.',
        status: HttpStatus.NOT_FOUND,
      });
    }

    await this.auditEvents.record({
      userId,
      eventType: `admin.user.${action}`,
      metadata: { actorId },
    });

    return { success: true };
  }
}

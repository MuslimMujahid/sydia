import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_EVENT_REPOSITORY,
  USER_REPOSITORY,
  type IAuditEventRepository,
  type IUserRepository,
} from '../../../database/interfaces';
import { type User, type UserProfileUpdate } from '../../../database/entities';

const PROFILE_UPDATED_EVENT = 'user.profile.updated';

@Injectable()
export class UpdateUserProfileService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditEventRepository: IAuditEventRepository,
  ) {}

  async execute(id: string, input: UserProfileUpdate): Promise<User | null> {
    const updatedUser = await this.userRepository.updateProfile(id, input);

    if (!updatedUser) {
      return null;
    }

    await this.auditEventRepository.record({
      userId: updatedUser.id,
      eventType: PROFILE_UPDATED_EVENT,
      metadata: {
        changedFields: Object.keys(input).sort(),
      },
    });

    return updatedUser;
  }
}

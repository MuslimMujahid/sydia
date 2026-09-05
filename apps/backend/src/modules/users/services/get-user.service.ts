import { Inject, Injectable } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type IUserRepository,
} from '../../../database/interfaces';

@Injectable()
export class GetUserService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  byId(id: string) {
    return this.userRepository.findById(id);
  }
}

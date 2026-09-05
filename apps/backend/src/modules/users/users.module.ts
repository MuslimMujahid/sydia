import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { GetUserService } from './services';
import { USER_REPOSITORY } from '../../database/interfaces';
import { PrismaUserRepository } from '../../database/repositories';

@Module({
  controllers: [UsersController],
  providers: [
    {
      provide: USER_REPOSITORY,
      useClass: PrismaUserRepository,
    },
    GetUserService,
  ],
  exports: [],
})
export class UsersModule {}

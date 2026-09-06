import { Module } from '@nestjs/common';
import {
  CATEGORY_REPOSITORY,
  TASK_REPOSITORY,
  USER_REPOSITORY,
} from '../../database/interfaces';
import {
  PrismaCategoryRepository,
  PrismaTaskRepository,
  PrismaUserRepository,
} from '../../database/repositories';
import { TasksController } from './tasks.controller';

@Module({
  controllers: [TasksController],
  providers: [
    { provide: TASK_REPOSITORY, useClass: PrismaTaskRepository },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: CATEGORY_REPOSITORY, useClass: PrismaCategoryRepository },
  ],
  exports: [TASK_REPOSITORY, CATEGORY_REPOSITORY],
})
export class TasksModule {}

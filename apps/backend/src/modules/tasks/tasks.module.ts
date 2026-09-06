import { Module } from '@nestjs/common';
import { TASK_REPOSITORY, USER_REPOSITORY } from '../../database/interfaces';
import {
  PrismaTaskRepository,
  PrismaUserRepository,
} from '../../database/repositories';
import { TasksController } from './tasks.controller';

@Module({
  controllers: [TasksController],
  providers: [
    { provide: TASK_REPOSITORY, useClass: PrismaTaskRepository },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
  ],
  exports: [TASK_REPOSITORY],
})
export class TasksModule {}

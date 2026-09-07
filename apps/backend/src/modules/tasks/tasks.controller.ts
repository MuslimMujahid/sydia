import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  AUDIT_EVENT_REPOSITORY,
  TASK_REPOSITORY,
  USER_REPOSITORY,
  type IAuditEventRepository,
  type ITaskRepository,
  type IUserRepository,
} from '../../database/interfaces';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { CreateTaskDto, TaskFiltersDto, UpdateTaskDto } from './task.dto';

@Roles(['user'])
@Controller('tasks')
export class TasksController {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: ITaskRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly audit: IAuditEventRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
  ) {}

  @Get() async list(@Session() s: UserSession, @Query() q: TaskFiltersDto) {
    const timezone = (await this.users.findById(s.user.id))?.timezone ?? 'UTC';

    return this.tasks.list(s.user.id, { ...q, timezone });
  }

  @Get(':id') async get(@Session() s: UserSession, @Param('id') id: string) {
    return this.required(await this.tasks.findById(s.user.id, id));
  }

  @Post() async create(
    @Session() s: UserSession,
    @Body() input: CreateTaskDto,
  ) {
    const task = await this.tasks.create(s.user.id, {
      ...input,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
    });

    await this.record(s.user.id, 'task.created', task.id);

    return task;
  }

  @Patch(':id') async update(
    @Session() s: UserSession,
    @Param('id') id: string,
    @Body() input: UpdateTaskDto,
  ) {
    const task = await this.tasks.update(s.user.id, id, {
      ...input,
      dueAt:
        input.dueAt === undefined
          ? undefined
          : input.dueAt
            ? new Date(input.dueAt)
            : null,
    });

    await this.record(s.user.id, 'task.updated', id);

    return this.required(task);
  }

  @Delete(':id') @HttpCode(HttpStatus.NO_CONTENT) async remove(
    @Session() s: UserSession,
    @Param('id') id: string,
  ) {
    if (!(await this.tasks.delete(s.user.id, id))) throw this.notFound();
    await this.record(s.user.id, 'task.deleted', id);
  }

  private required<T>(value: T | null): T {
    if (!value) throw this.notFound();

    return value;
  }

  private notFound() {
    return new ApiException({
      code: ErrorCodes.NOT_FOUND,
      message: 'Tugas tidak ditemukan.',
      status: HttpStatus.NOT_FOUND,
    });
  }

  private record(userId: string, eventType: string, id: string) {
    return this.audit.record({ userId, eventType, metadata: { id } });
  }
}

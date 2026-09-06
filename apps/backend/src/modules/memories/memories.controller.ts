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
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  AUDIT_EVENT_REPOSITORY,
  MEMORY_REPOSITORY,
  type IAuditEventRepository,
  type IMemoryRepository,
} from '../../database/interfaces';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { MemoryService } from './memory.service';
import {
  CreateMemoryDto,
  MemoryFiltersDto,
  MemorySearchDto,
  UpdateMemoryDto,
} from './memory.dto';

@Controller('memories')
export class MemoriesController {
  constructor(
    @Inject(MEMORY_REPOSITORY) private readonly memories: IMemoryRepository,
    private readonly service: MemoryService,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly audit: IAuditEventRepository,
  ) {}

  @Get() list(@Session() s: UserSession, @Query() q: MemoryFiltersDto) {
    return this.memories.list(s.user.id, q);
  }

  @Get('search') search(
    @Session() s: UserSession,
    @Query() q: MemorySearchDto,
  ) {
    return this.service.search(s.user.id, q.q);
  }

  @Get(':id') async get(@Session() s: UserSession, @Param('id') id: string) {
    return this.required(await this.memories.findById(s.user.id, id));
  }

  @Post() async create(
    @Session() s: UserSession,
    @Body() input: CreateMemoryDto,
  ) {
    const memory = await this.service.create(s.user.id, {
      ...input,
      sourceType: 'dashboard',
    });

    await this.record(s.user.id, 'memory.created', memory.id);

    return memory;
  }

  @Patch(':id') async update(
    @Session() s: UserSession,
    @Param('id') id: string,
    @Body() input: UpdateMemoryDto,
  ) {
    const memory = await this.service.update(s.user.id, id, input);
    await this.record(s.user.id, 'memory.updated', id);

    return this.required(memory);
  }

  @Delete(':id') @HttpCode(HttpStatus.NO_CONTENT) async remove(
    @Session() s: UserSession,
    @Param('id') id: string,
  ) {
    if (!(await this.memories.delete(s.user.id, id))) throw this.notFound();
    await this.record(s.user.id, 'memory.deleted', id);
  }

  private required<T>(value: T | null): T {
    if (!value) throw this.notFound();

    return value;
  }

  private notFound() {
    return new ApiException({
      code: ErrorCodes.NOT_FOUND,
      message: 'Memori tidak ditemukan.',
      status: HttpStatus.NOT_FOUND,
    });
  }

  private record(userId: string, eventType: string, id: string) {
    return this.audit.record({ userId, eventType, metadata: { id } });
  }
}

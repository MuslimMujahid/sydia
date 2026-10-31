import { Inject, Injectable, Logger } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import {
  NOTE_PRESENCE_REPOSITORY,
  NOTE_WORK_REPOSITORY,
  type INotePresenceRepository,
  type INoteWorkRepository,
} from '../../database/interfaces';
import type {
  NoteWork,
  NoteWorkPayload,
  NoteWorkValue,
} from '../../database/entities';

@Injectable()
export class NoteMutationService {
  private readonly logger = new Logger(NoteMutationService.name);
  constructor(
    @Inject(NOTE_PRESENCE_REPOSITORY)
    private readonly presence: INotePresenceRepository,
    @Inject(NOTE_WORK_REPOSITORY) private readonly work: INoteWorkRepository,
  ) {}

  async execute(
    input: {
      userId: string;
      sourceMessageId: string;
      sourceWork?: NoteWork;
      key: string;
      tool: string;
      arguments: NoteWorkPayload;
      destinationRef?: string;
      refs: () => Promise<readonly string[]>;
    },
    mutation: () => Promise<NoteWorkValue>,
  ): Promise<NoteWorkValue> {
    const payload = { tool: input.tool, arguments: input.arguments };

    if (
      input.sourceWork &&
      (input.sourceWork.userId !== input.userId ||
        !(await this.work.sourceValid(input.sourceWork)))
    ) {
      this.logger.warn(
        'Rejected note mutation with invalid or foreign source evidence.',
      );
      throw new Error(
        'Note mutation requires current owner-scoped source evidence.',
      );
    }

    const work = input.sourceWork
      ? await this.work.spawn(
          input.sourceWork,
          input.key,
          'tool',
          payload,
          input.destinationRef,
        )
      : await this.work.acceptMessage({
          userId: input.userId,
          sourceMessageId: input.sourceMessageId,
          key: input.key,
          stage: 'tool',
          destinationRef: input.destinationRef,
          payload,
        });

    if (
      work.sourceRef !==
        (input.sourceWork?.sourceRef ?? input.sourceMessageId) ||
      !isDeepStrictEqual(work.payload, JSON.parse(JSON.stringify(payload))) ||
      (work.destinationRef ?? undefined) !== input.destinationRef
    ) {
      this.logger.warn(
        'Rejected note operation identity reused for different arguments.',
      );
      throw new Error(
        'A note operation identity cannot be reused for a different mutation.',
      );
    }

    if (work.status === 'applied') return work.result;

    try {
      const result = await this.presence.write(input.userId, input.refs, () =>
        this.work.apply(work.id, input.userId, mutation),
      );

      if (result.status === 'completed') return result.value;
      await this.work.defer(work.id, input.userId, result.reason);

      return {
        status: 'deferred',
        reason: 'note_open',
        workId: work.id,
        saved: false,
        instruction:
          'The request is durably pending, but no note was changed. Briefly acknowledge receipt for later writing. Writing resumes after all editors for this note close. Do not claim it was saved, suggest keeping the note open, write elsewhere, or create a replacement note.',
      };
    } catch (error) {
      this.logger.warn(
        'Note mutation failed; durable work retained for fresh planning.',
        {
          workId: work.id,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        },
      );
      await this.work.fail(work.id, input.userId, 'mutation_failed');
      throw error;
    }
  }
}

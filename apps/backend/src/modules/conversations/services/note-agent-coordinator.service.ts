import { createNoteProposalResolutionTool } from './note-proposal-resolution-tool';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  CONVERSATION_REPOSITORY,
  NOTE_AGENT_RUN_REPOSITORY,
  NOTE_WORK_REPOSITORY,
  type IConversationRepository,
  type INoteAgentRunRepository,
  type INoteWorkRepository,
} from '../../../database/interfaces';
import {
  LANGUAGE_MODEL,
  type LanguageModelGateway,
} from '../../../infra/model-gateway';
import { SkillCatalogService } from '../../secretary/skill-catalog.service';
import { runNoteAgent } from './note-agent-runner';
import { claimNoteAgentTools } from './note-agent-tools';
import { createNoteProposalTool } from './note-agent-proposals';
import { createBackgroundNoteQuestionTool } from './note-question-tools';
import { NotesService } from '../../notes/notes.service';
import { DailyNoteService } from '../../daily-notes/daily-note.service';
import {
  ASSISTANT_TOOLS,
  ToolExecutorService,
  type AssistantTool,
} from './tool-executor.service';

const MAX_SOURCES_PER_RUN = 12;
const ORGANIZATION_GOAL_VERSION = 'maintained-records-v1';
const ORGANIZATION_GOAL = `Background note organization goal: maintain useful homes for the owner's records. A successful conversational capture does not settle organization: consider where the records can be compared and maintained. A single useful record can justify initializing a collection; do not require another explicit request solely because the owner has not yet asked for that organization. Honor actual destination requests and preserve original daily captures and owner deletions. No change is appropriate for non-record evidence or material already in a suitable maintained home. In proposal mode describe concrete destination and resulting document changes rather than offering to do them later. Choose useful inspections and actions freely; no fixed workflow is required.`;

@Injectable()
export class NoteAgentCoordinatorService {
  private readonly logger = new Logger(NoteAgentCoordinatorService.name);
  private readonly mode: 'proposal' | 'apply';
  private readonly idleMs: number;
  private readonly catalog: string;

  constructor(
    @Inject(NOTE_WORK_REPOSITORY) private readonly work: INoteWorkRepository,
    @Inject(NOTE_AGENT_RUN_REPOSITORY)
    private readonly runs: INoteAgentRunRepository,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: IConversationRepository,
    @Inject(ASSISTANT_TOOLS) private readonly tools: AssistantTool[],
    @Inject(LANGUAGE_MODEL) private readonly model: LanguageModelGateway,
    skills: SkillCatalogService,
    config: ConfigService,
    private readonly notes: NotesService,
    private readonly daily: DailyNoteService,
  ) {
    this.catalog = [
      ORGANIZATION_GOAL,
      'Available skills: load relevant guidance with load_skill; loading does not grant authority beyond this note run.',
      ...skills.skills.map(
        (skill) => `- ${skill.name}@${skill.version}: ${skill.description}`,
      ),
    ].join('\n');
    this.mode = config.get<'proposal' | 'apply'>(
      'BACKEND_NOTE_ORGANIZATION_MODE',
      'proposal',
    );
    if (!['proposal', 'apply'].includes(this.mode))
      throw new Error(
        'BACKEND_NOTE_ORGANIZATION_MODE must be proposal or apply.',
      );
    this.idleMs = Number(
      config.get<number | string>('BACKEND_MEMORY_DREAM_IDLE_MS', 15 * 60_000),
    );
    if (!Number.isFinite(this.idleMs) || this.idleMs < 0)
      throw new Error(
        'BACKEND_MEMORY_DREAM_IDLE_MS must be finite and non-negative.',
      );
  }

  recover(userId?: string) {
    return this.runBatch({ userId, mode: this.mode, idleMs: this.idleMs });
  }

  /** Development review stays owner-scoped and never changes global activation. */
  async review(
    userId: string,
    mode: 'proposal' | 'apply',
    sourceWorkId?: string,
  ) {
    if (!userId.trim() || !['proposal', 'apply'].includes(mode))
      throw new Error('Note review requires an owner and a valid mode.');
    await this.work.expedite(userId, sourceWorkId);

    return this.runBatch({
      userId,
      mode,
      idleMs: 0,
      includeProposals: true,
      sourceWorkId,
    });
  }

  private async runBatch(input: {
    userId?: string;
    mode: 'proposal' | 'apply';
    idleMs: number;
    includeProposals?: boolean;
    sourceWorkId?: string;
  }) {
    await this.work.collectSources(100, input.idleMs, input.userId);
    if (input.mode === 'apply')
      await this.work.publishQuestions(12, input.userId);
    let inspected = 0;
    let failed = 0;
    let deferred = 0;

    for (let i = 0; i < MAX_SOURCES_PER_RUN; i++) {
      const claim = await this.runs.claim({
        userId: input.userId,
        idleMs: input.idleMs,
        includeProposals: input.includeProposals ?? input.mode === 'apply',
        sourceWorkId: input.sourceWorkId,
      });

      if (!claim) break;
      inspected++;
      const source = claim.source;

      try {
        const [history, context, conversation] = await Promise.all([
          this.work.history(source.userId, source.sourceRef),
          this.work.recentMessages(source),
          this.work.clarificationContext(source),
        ]);

        const executor = new ToolExecutorService(
          this.conversations,
          input.mode === 'proposal'
            ? [
                ...this.tools,
                createNoteProposalTool({
                  tools: this.tools,
                  claim,
                  runs: this.runs,
                  notes: this.notes,
                  daily: this.daily,
                }),
              ]
            : [
                ...claimNoteAgentTools(this.tools, claim, this.runs),
                createBackgroundNoteQuestionTool(claim, this.runs),
                createNoteProposalResolutionTool(claim, this.runs),
              ],
        );

        const result = await runNoteAgent({
          model: this.model,
          executor,
          catalog: this.catalog,
          userId: source.userId,
          runId: randomUUID(),
          sourceRef: source.sourceRef,
          sourceWork: source,
          mode: input.mode,
          proposalWorkIds: history
            .filter(
              (item) =>
                item.stage === 'note_proposal' &&
                !['applied', 'stale', 'rejected'].includes(item.status),
            )
            .map((item) => item.id),
          evidence: {
            source: {
              id: source.id,
              kind: source.sourceKind,
              ref: source.sourceRef,
              version: source.sourceVersion,
              at: source.sourceAt,
              timezone: source.timezone,
              content: source.sourceContent,
            },
            context,
            conversation,
            priorWork: history
              .filter((item) => item.id !== source.id)
              .map((item) => ({
                id: item.id,
                key: item.key,
                stage: item.stage,
                status: item.status,
                destinationRef: item.destinationRef,
                payload: item.payload,
                result: item.result,
              })),
            clarification: source.payload,
          },
        });

        const current = await this.work.history(
          source.userId,
          source.sourceRef,
        );

        const unfinished = current.filter(
          (item) =>
            (item.stage === 'tool' || item.stage === 'note_proposal') &&
            !['applied', 'stale', 'rejected'].includes(item.status),
        );

        const status =
          input.mode === 'proposal'
            ? 'proposal'
            : unfinished.length
              ? 'deferred'
              : 'applied';

        if (status === 'deferred') deferred++;
        const recorded = await this.runs.finish(claim, {
          status,
          value: {
            goalVersion: ORGANIZATION_GOAL_VERSION,
            text: result.text,
            calls: result.calls,
            loadedSkills: result.loadedSkills,
            pendingWorkIds: unfinished.map((item) => item.id),
          },
        });

        if (recorded !== 'recorded') {
          deferred++;
          this.logger.warn(
            'Note agent result was not accepted; current source and claim must be recovered.',
            {
              workId: source.id,
              reason: recorded,
            },
          );
        }
      } catch (error) {
        failed++;
        this.logger.error(
          'Note agent run failed; durable work remains recoverable within its retry limit.',
          {
            workId: source.id,
            errorName: error instanceof Error ? error.name : 'UnknownError',
          },
        );
        const recorded = await this.runs.finish(claim, {
          status: 'failed',
          value: { saved: false },
          errorCode: 'note_agent_failed',
        });

        if (recorded !== 'recorded')
          this.logger.warn(
            'Failed note agent result could not update an expired or stale claim.',
            {
              workId: source.id,
              reason: recorded,
            },
          );
      }
    }

    if (input.mode === 'apply')
      await this.work.publishQuestions(12, input.userId);

    return { inspected, failed, deferred, mode: input.mode };
  }
}

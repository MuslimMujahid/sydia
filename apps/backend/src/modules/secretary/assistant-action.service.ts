import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  ASSISTANT_ACTION_REPOSITORY,
  CONVERSATION_REPOSITORY,
  REMINDER_REPOSITORY,
  TASK_REPOSITORY,
  USER_REPOSITORY,
  type IAssistantActionRepository,
  type IConversationRepository,
  type IReminderRepository,
  type ITaskRepository,
  type IUserRepository,
} from '../../database/interfaces';
import type {
  AssistanceBehavior,
  AssistantAction,
  AssistantActionEvidence,
  AssistantActionType,
} from '../../database/entities';
import { ApiException } from '../../shared/errors';
import { plainTextToRichText } from '../../shared/rich-text/document';
import { CalendarService } from '../calendar/calendar.service';
import { NotesService } from '../notes/notes.service';
import { ReminderSchedulerService } from '../reminders/reminder-scheduler.service';
import { AssistancePolicyService } from './assistance-policy.service';
import {
  AvailabilityService,
  AvailabilityUnavailableError,
  type AvailabilityResult,
} from './availability.service';
import { localDateTime } from './local-time';
import { schedulingInstant, SchedulingInputError } from './scheduling';
import { SECRETARY_CLOCK, type SecretaryClock } from './secretary-clock';

export const ACTION_EXECUTION_LEASE_MS = 60_000;
export const ACTION_MAX_USEFUL_MS = 24 * 60 * 60_000;
/** Open conversational offers shown per conversation context block. */
export const OPEN_OFFER_LIMIT = 5;

export class ActionInputError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ActionInputError';
  }
}

export type PrepareActionInput = {
  userId: string;
  conversationId: string;
  preparedBy: string;
  behavior: AssistanceBehavior;
  actionType: AssistantActionType;
  targetRef: string;
  initiative: 'unsolicited' | 'requested';
  parameters: Record<string, unknown>;
  reason: string;
  evidence: AssistantActionEvidence[];
  /** Evaluation clock; defaults to the system clock. */
  now?: Date;
};

export type PrepareActionResult =
  | {
      status: 'prepared';
      actionId: string;
      version: number;
      offer: string;
      usefulUntil: string;
      instruction: string;
    }
  | {
      status: 'already_offered';
      actionId: string;
      actionStatus: string;
      offer: string;
      instruction: string;
    }
  | { status: 'suppressed'; reason: string; instruction: string }
  | { status: 'invalid'; code: string; message: string };

export type ActionResponseResult = Record<string, unknown> & { status: string };

type NormalizedParameters = {
  parameters: Record<string, unknown>;
  offer: string;
  usefulUntil: Date;
  materialKey: string;
};

const TARGET_REF =
  /^(task|event|note|daily|effort|commitment):[\p{L}\p{N}_.:-]{1,120}$/u;

function text(
  value: unknown,
  field: string,
  max = 200,
  required = true,
): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (required)
      throw new ActionInputError('missing_field', `${field} is required.`);

    return undefined;
  }

  if (typeof value !== 'string')
    throw new ActionInputError('invalid_field', `${field} must be text.`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max)
    throw new ActionInputError(
      'invalid_field',
      `${field} must be 1-${max} characters.`,
    );

  return trimmed;
}

function localParts(
  value: string,
  field: string,
): { date: string; time: string } {
  const match = /^(\d{4}-\d{2}-\d{2})[ T]([01]\d|2[0-3]):([0-5]\d)$/.exec(
    value,
  );

  if (!match)
    throw new ActionInputError(
      'invalid_datetime',
      `${field} must be local "YYYY-MM-DD HH:mm".`,
    );

  return { date: match[1]!, time: `${match[2]}:${match[3]}` };
}

/** Stored action parameters are JSON scalars; render them without object coercion. */
function str(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

function digest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex')
    .slice(0, 32);
}

/**
 * Minimal shared pending-action state for concrete inferred mutations.
 * Preparation, consent, and execution are separate, durable transitions.
 */
@Injectable()
export class AssistantActionService {
  private readonly logger = new Logger(AssistantActionService.name);

  constructor(
    @Inject(ASSISTANT_ACTION_REPOSITORY)
    private readonly actions: IAssistantActionRepository,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: IConversationRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(TASK_REPOSITORY) private readonly tasks: ITaskRepository,
    @Inject(REMINDER_REPOSITORY)
    private readonly reminders: IReminderRepository,
    private readonly reminderScheduler: ReminderSchedulerService,
    private readonly calendar: CalendarService,
    private readonly notes: NotesService,
    private readonly availability: AvailabilityService,
    private readonly policy: AssistancePolicyService,
    @Inject(SECRETARY_CLOCK) private readonly clock: SecretaryClock,
  ) {}

  async prepare(input: PrepareActionInput): Promise<PrepareActionResult> {
    const user = await this.users.findById(input.userId);
    if (!user)
      throw new Error('Action preparation requires an existing owner.');
    const now = input.now ?? this.clock.now();

    if (!TARGET_REF.test(input.targetRef))
      return {
        status: 'invalid',
        code: 'invalid_target',
        message:
          'targetRef must look like task:<id>, event:<id>, note:<id>, effort:<slug>, or commitment:<slug>.',
      };

    if (input.initiative === 'unsolicited') {
      const gate = await this.policy.unsolicitedAllowed(
        input.userId,
        input.behavior,
        now,
      );

      if (!gate.allowed)
        return {
          status: 'suppressed',
          reason: gate.reason,
          instruction:
            'Do not offer this action. Continue with the requested assistance only.',
        };
    }

    const sameTurn = await this.actions.listPreparedBy(
      input.userId,
      input.preparedBy,
    );

    if (
      sameTurn.length >= 2 ||
      (input.initiative === 'unsolicited' && sameTurn.length >= 1)
    )
      return {
        status: 'suppressed',
        reason: 'turn_suggestion_limit',
        instruction:
          'At most one unsolicited suggestion per reply. Do not add another offer.',
      };

    let normalized: NormalizedParameters;

    try {
      normalized = await this.normalize(
        input.userId,
        user.timezone,
        input.actionType,
        input.parameters,
        now,
      );
    } catch (error) {
      if (
        error instanceof ActionInputError ||
        error instanceof SchedulingInputError
      )
        return { status: 'invalid', code: error.code, message: error.message };
      if (error instanceof AvailabilityUnavailableError)
        return { status: 'invalid', code: error.code, message: error.message };
      throw error;
    }

    const evidenceVersion = digest(
      [...input.evidence]
        .map(({ kind, id, version }) => `${kind}:${id}:${version}`)
        .sort(),
    );

    // A dismissal suppresses equivalent help on the same target until material evidence changes.
    const prior = await this.actions.listForTarget(
      input.userId,
      input.behavior,
      input.targetRef,
    );

    const dismissed = prior.find(
      (action) =>
        action.status === 'dismissed' &&
        digest(
          [...action.evidence]
            .map(({ kind, id, version }) => `${kind}:${id}:${version}`)
            .sort(),
        ) === evidenceVersion,
    );

    if (dismissed && input.initiative === 'unsolicited')
      return {
        status: 'suppressed',
        reason: 'dismissed_by_user',
        instruction:
          'The user already declined this suggestion and its supporting facts have not changed. Do not offer it again in any wording.',
      };

    const deduplicationKey = digest([
      input.userId,
      input.behavior,
      input.actionType,
      input.targetRef,
      normalized.materialKey,
      evidenceVersion,
    ]);

    const { action, created } = await this.actions.prepare({
      userId: input.userId,
      conversationId: input.conversationId,
      preparedBy: input.preparedBy,
      behavior: input.behavior,
      actionType: input.actionType,
      targetRef: input.targetRef,
      parameters: normalized.parameters,
      reason: input.reason.slice(0, 300),
      evidence: input.evidence.slice(0, 24),
      deduplicationKey,
      usefulUntil: normalized.usefulUntil,
    });

    if (!created) {
      const reusable =
        action.status === 'prepared' ||
        (['expired', 'invalidated'].includes(action.status) &&
          action.acceptedAt === null);

      if (reusable) {
        // An unshown or lapsed equivalent is re-armed for this turn instead of
        // duplicated; an unshown action never suppressed a real offer.
        const rearmed = await this.actions.transition(
          input.userId,
          action.id,
          ['prepared', 'expired', 'invalidated'],
          {
            status: 'prepared',
            statusReason: 'reprepared',
            usefulUntil: normalized.usefulUntil,
            offerMessageId: null,
            preparedBy: input.preparedBy,
            conversationId: input.conversationId,
          },
        );

        if (rearmed)
          return this.prepared(rearmed, normalized.offer, user.timezone);
      }

      return {
        status: 'already_offered',
        actionId: action.id,
        actionStatus: action.status,
        offer: normalized.offer,
        instruction:
          action.status === 'offered' || action.status === 'snoozed'
            ? 'This exact action was already shown to the user (possibly in another conversation or channel). Do not offer it again unless they explicitly ask to see it.'
            : 'An equivalent action already exists; describe its actual state instead of offering it again.',
      };
    }

    // A revised offer for the same target replaces the earlier one shown in
    // this conversation; "yes" can then only refer to the current version.
    const superseded = await this.actions.listForConversation(
      input.userId,
      input.conversationId,
      ['offered'],
    );

    for (const old of superseded)
      if (
        old.id !== action.id &&
        old.behavior === input.behavior &&
        old.actionType === input.actionType &&
        old.targetRef === input.targetRef
      )
        await this.actions.transition(input.userId, old.id, ['offered'], {
          status: 'invalidated',
          statusReason: 'superseded_by_revised_offer',
        });

    return this.prepared(action, normalized.offer, user.timezone);
  }

  private prepared(
    action: AssistantAction,
    offer: string,
    timezone: string,
  ): PrepareActionResult {
    return {
      status: 'prepared',
      actionId: action.id,
      version: action.version,
      offer,
      usefulUntil: localDateTime(action.usefulUntil, timezone),
      instruction:
        'Prepared but not yet shown or saved. In your reply, describe exactly this action and ask whether the user wants it. Do not claim it is saved. It becomes acceptable only after your reply is delivered.',
    };
  }

  /** Validates parameters and derives the human description and material identity. */
  private async normalize(
    userId: string,
    timezone: string,
    type: AssistantActionType,
    raw: Record<string, unknown>,
    now: Date,
  ): Promise<NormalizedParameters> {
    const cap = (until?: Date): Date => {
      const limit = new Date(now.getTime() + ACTION_MAX_USEFUL_MS);

      return until && until < limit ? until : limit;
    };

    if (type === 'create_task') {
      const title = text(raw.title, 'title')!;
      const dueText = text(raw.dueAt, 'dueAt', 20, false);
      const due = dueText ? localParts(dueText, 'dueAt') : null;
      const dueAt = due
        ? schedulingInstant(due.date, due.time, timezone)
        : null;

      if (dueAt && dueAt <= now)
        throw new ActionInputError('past_due', 'dueAt must be in the future.');

      return {
        parameters: {
          title,
          dueAt: due ? `${due.date} ${due.time}` : null,
          timezone,
        },
        offer: `Create task "${title}"${due ? ` due ${due.date} ${due.time} (${timezone})` : ' with no due date'}.`,
        usefulUntil: cap(dueAt ?? undefined),
        materialKey: digest([title.toLocaleLowerCase(), due]),
      };
    }

    if (type === 'create_reminder') {
      const title = text(raw.title, 'title')!;
      const at = localParts(text(raw.at, 'at', 20)!, 'at');
      const instant = schedulingInstant(at.date, at.time, timezone);
      if (instant <= now)
        throw new ActionInputError(
          'past_time',
          'Reminder time must be in the future.',
        );

      return {
        parameters: { title, at: `${at.date} ${at.time}`, timezone },
        offer: `Create reminder "${title}" at ${at.date} ${at.time} (${timezone}).`,
        usefulUntil: cap(instant),
        materialKey: digest([title.toLocaleLowerCase(), at]),
      };
    }

    if (type === 'create_calendar_event') {
      const title = text(raw.title, 'title')!;
      const date = text(raw.date, 'date', 10)!;
      const start = text(raw.start, 'start', 5)!;
      const end = text(raw.end, 'end', 5)!;
      const startAt = schedulingInstant(date, start, timezone);
      const endAt = schedulingInstant(date, end, timezone);
      if (endAt <= startAt)
        throw new ActionInputError(
          'invalid_interval',
          'end must be after start on the same date.',
        );
      if (startAt <= now)
        throw new ActionInputError(
          'past_time',
          'The interval must start in the future.',
        );
      const bufferMinutes =
        typeof raw.bufferMinutes === 'number' &&
        Number.isInteger(raw.bufferMinutes)
          ? raw.bufferMinutes
          : null;

      // Without an explicit window the interval itself bounds the check.
      const windowStart =
        text(raw.windowStart, 'windowStart', 5, false) ?? start;

      const windowEnd = text(raw.windowEnd, 'windowEnd', 5, false) ?? end;
      if (bufferMinutes === null || bufferMinutes < 0 || bufferMinutes > 240)
        throw new ActionInputError(
          'invalid_buffer',
          'bufferMinutes must be the verified required gap (0-240).',
        );
      const taskId = text(raw.taskId, 'taskId', 120, false) ?? null;
      const durationMinutes = (endAt.getTime() - startAt.getTime()) / 60_000;

      // An offer must describe a currently valid slot.
      const check = await this.availability.check(
        userId,
        {
          date,
          durationMinutes,
          windowStart,
          windowEnd,
          bufferMinutes,
          requestedStart: start,
          ...(taskId ? { taskId } : {}),
        },
        now,
      );

      if (!check.requested?.available)
        throw new ActionInputError(
          'slot_unavailable',
          `That interval is not available: ${JSON.stringify(check.requested?.conflicts ?? [])}. Offer one of the calculated slots instead: ${JSON.stringify(check.slots)}.`,
        );

      return {
        parameters: {
          title,
          date,
          start,
          end,
          timezone,
          bufferMinutes,
          windowStart,
          windowEnd,
          taskId,
        },
        offer: `Schedule calendar event "${title}" on ${date} ${start}–${end} (${timezone}) in Sydia calendar${taskId ? ' linked to the task' : ''}.`,
        usefulUntil: cap(startAt),
        materialKey: digest([date, start, end, taskId]),
      };
    }

    const title = text(raw.title, 'title')!;
    const content = text(raw.content, 'content', 8000)!;

    return {
      parameters: { title, content, destination: 'notes_root' },
      offer: `Save a new note "${title}" in Notes with the drafted content.`,
      usefulUntil: cap(),
      materialKey: digest([title.toLocaleLowerCase(), content]),
    };
  }

  /** Current offers in a conversation that a reply could refer to. */
  async openOffers(
    userId: string,
    conversationId: string,
  ): Promise<AssistantAction[]> {
    const now = this.clock.now();
    const offers = await this.actions.listForConversation(
      userId,
      conversationId,
      ['offered', 'failed', 'completed', 'snoozed'],
      OPEN_OFFER_LIMIT * 2,
    );

    const open: AssistantAction[] = [];

    for (const action of offers) {
      if (action.status === 'offered' && action.usefulUntil <= now) {
        await this.actions.transition(userId, action.id, ['offered'], {
          status: 'expired',
          statusReason: 'useful_time_passed',
        });
        continue;
      }

      if (
        action.status === 'completed' &&
        action.decidedAt &&
        now.getTime() - action.decidedAt.getTime() > ACTION_MAX_USEFUL_MS
      )
        continue;
      if (action.status === 'failed' && !action.acceptedAt) continue;
      open.push(action);
    }

    return open.slice(0, OPEN_OFFER_LIMIT);
  }

  /** Context description for the agent: references only, no stale payload replay for completed actions. */
  async describeOpenOffers(
    userId: string,
    conversationId: string,
    timezone: string,
  ): Promise<string | null> {
    const open = await this.openOffers(userId, conversationId);
    if (!open.length) return null;

    return [
      'Concrete actions offered in this conversation (state is authoritative; resolve a reply with respond_to_action):',
      ...open.map((action) =>
        JSON.stringify({
          actionId: action.id,
          version: action.version,
          status: action.status,
          actionType: action.actionType,
          offer:
            action.status === 'completed' ? undefined : this.summary(action),
          result: action.resultId
            ? { type: action.resultType, id: action.resultId }
            : undefined,
          lastError: action.lastErrorCode ?? undefined,
          snoozedUntil: action.snoozedUntil
            ? localDateTime(action.snoozedUntil, timezone)
            : undefined,
          usefulUntil: localDateTime(action.usefulUntil, timezone),
        }),
      ),
      'Resolve the user’s reply about these with respond_to_action: accept only when it clearly agrees to that specific unmodified action; dismiss when they decline, say it is not needed, or reject the suggestion; not_now or snooze when they postpone. If several offers are open and the reply does not identify one, ask which. A reply that changes parameters is not acceptance of the old ones. Never describe a declined offer as still open.',
    ].join('\n');
  }

  /**
   * Owner-wide decisions about offers already shown, across conversations and
   * channels, so a new chat does not repeat or resurrect them. Summaries only.
   */
  async ownerDecisions(
    userId: string,
    timezone: string,
  ): Promise<Array<Record<string, unknown>>> {
    const since = new Date(this.clock.now().getTime() - ACTION_MAX_USEFUL_MS);
    const actions = await this.actions.listRecentForOwner(
      userId,
      since,
      ['offered', 'snoozed', 'dismissed', 'completed'],
      10,
    );

    return actions.map((action) => ({
      behavior: action.behavior,
      targetRef: action.targetRef,
      offer: this.summary(action),
      state:
        action.status === 'offered'
          ? 'already_shown_awaiting_reply'
          : action.status === 'snoozed'
            ? `snoozed_until ${action.snoozedUntil ? localDateTime(action.snoozedUntil, timezone) : 'later'}`
            : action.status === 'dismissed'
              ? 'declined_by_user'
              : 'already_done',
    }));
  }

  summary(action: AssistantAction): string {
    const p = action.parameters;

    switch (action.actionType) {
      case 'create_task':
        return `Create task "${str(p.title)}"${p.dueAt ? ` due ${str(p.dueAt)}` : ''}`;
      case 'create_reminder':
        return `Create reminder "${str(p.title)}" at ${str(p.at)}`;
      case 'create_calendar_event':
        return `Schedule calendar event "${str(p.title)}" ${str(p.date)} ${str(p.start)}–${str(p.end)}`;
      default:
        return `Save note "${str(p.title)}"`;
    }
  }

  async respond(input: {
    userId: string;
    conversationId: string;
    sourceMessageId: string;
    actionId: string;
    version: number;
    decision: 'accept' | 'dismiss' | 'snooze' | 'not_now' | 'retry';
    snoozeUntil?: string;
    referenceBasis: 'only_open_offer' | 'explicit_reference';
  }): Promise<ActionResponseResult> {
    const user = await this.users.findById(input.userId);
    if (!user) throw new Error('Action response requires an existing owner.');
    const now = this.clock.now();
    const action = await this.actions.findById(input.userId, input.actionId);

    if (!action || action.conversationId !== input.conversationId)
      return {
        status: 'not_found',
        instruction:
          'No such action was offered in this conversation. Ask the user what they want.',
      };

    // The authorizing reply must be an owned user message in this conversation, after the offer.
    const offerMessage = action.offerMessageId;
    if (!offerMessage)
      return {
        status: 'not_shown',
        instruction:
          'This action was never shown to the user, so a reply cannot accept it.',
      };
    const content = await this.conversations.findUserMessageContent(
      input.userId,
      input.sourceMessageId,
    );

    const thread = await this.conversations.findMessagesSince(
      input.userId,
      input.conversationId,
      action.createdAt,
    );

    const replyIndex = thread.findIndex(
      (message) => message.id === input.sourceMessageId,
    );

    const offerIndex = thread.findIndex(
      (message) => message.id === offerMessage,
    );

    if (
      content === null ||
      replyIndex < 0 ||
      offerIndex < 0 ||
      replyIndex < offerIndex
    )
      return {
        status: 'not_authorized',
        instruction:
          'The current user message does not follow this offer, so it cannot decide it.',
      };

    if (
      input.referenceBasis === 'only_open_offer' &&
      ['accept', 'retry'].includes(input.decision)
    ) {
      const open = (
        await this.openOffers(input.userId, input.conversationId)
      ).filter(
        (candidate) =>
          candidate.status === 'offered' ||
          (candidate.status === 'failed' && candidate.acceptedAt),
      );

      if (open.length > 1)
        return {
          status: 'ambiguous',
          openOffers: open.map((candidate) => ({
            actionId: candidate.id,
            offer: this.summary(candidate),
          })),
          instruction:
            'More than one offer is open and the reply does not identify one. Ask which action the user means; execute nothing.',
        };
    }

    if (input.version !== action.version)
      return {
        status: 'stale_version',
        currentVersion: action.version,
        instruction:
          'The offer changed after it was shown; present the current offer again.',
      };

    if (input.decision === 'dismiss' || input.decision === 'not_now') {
      const updated = await this.actions.transition(
        input.userId,
        action.id,
        ['offered', 'snoozed', 'prepared'],
        {
          status: 'dismissed',
          statusReason: input.decision,
          decidedAt: now,
        },
      );

      return updated
        ? {
            status: 'dismissed',
            instruction:
              'Acknowledge briefly. Do not offer the same action again.',
          }
        : {
            status: action.status,
            instruction:
              'The action is no longer open; describe its actual state.',
          };
    }

    if (input.decision === 'snooze') {
      const until = input.snoozeUntil
        ? localParts(input.snoozeUntil, 'snoozeUntil')
        : null;

      const instant = until
        ? schedulingInstant(until.date, until.time, user.timezone)
        : null;

      if (!instant || instant <= now)
        return {
          status: 'needs_time',
          instruction:
            'Ask for one concrete future date and time for the snooze.',
        };
      if (instant >= action.usefulUntil)
        return {
          status: 'snooze_past_useful_time',
          usefulUntil: localDateTime(action.usefulUntil, user.timezone),
          instruction:
            'That time is after this offer stops being useful; say so and ask for an earlier time or dismissal.',
        };
      const updated = await this.actions.transition(
        input.userId,
        action.id,
        ['offered', 'snoozed'],
        {
          status: 'snoozed',
          snoozedUntil: instant,
          statusReason: 'user_snooze',
          decidedAt: now,
        },
      );

      return updated
        ? {
            status: 'snoozed',
            until: localDateTime(instant, user.timezone),
            instruction:
              'Confirm the snooze time. It will be rechecked before resurfacing.',
          }
        : {
            status: action.status,
            instruction: 'The action is no longer open.',
          };
    }

    // accept or retry
    if (action.status === 'completed')
      return this.acknowledgeCompleted(action, user.timezone);

    if (action.status === 'offered') {
      if (input.decision === 'retry')
        return {
          status: 'not_accepted',
          instruction:
            'A retry request cannot supply initial consent. Ask whether the user wants this action.',
        };

      if (action.usefulUntil <= now) {
        await this.actions.transition(input.userId, action.id, ['offered'], {
          status: 'expired',
          statusReason: 'useful_time_passed',
        });

        return {
          status: 'expired',
          instruction:
            'The offer expired; do not execute it. Offer a fresh option if still useful.',
        };
      }

      const authorized = await this.actions.transition(
        input.userId,
        action.id,
        ['offered'],
        {
          status: 'authorized',
          acceptedAt: now,
          acceptedMessageId: input.sourceMessageId,
          decidedAt: now,
          receiptKey: `assistant-action-${action.id}-v${action.version}`,
        },
      );

      if (!authorized) {
        const current = await this.actions.findById(input.userId, action.id);

        return current?.status === 'completed'
          ? this.acknowledgeCompleted(current, user.timezone)
          : {
              status: current?.status ?? 'unknown',
              instruction:
                'The action is being processed elsewhere; do not execute again.',
            };
      }
    } else if (!(
      ['failed', 'executing', 'authorized'].includes(action.status) &&
      action.acceptedAt
    )) {
      return {
        status: action.status,
        instruction:
          'The action is not open for acceptance; describe its actual state without executing.',
      };
    }

    return this.execute(input.userId, action.id, user.timezone);
  }

  private async acknowledgeCompleted(
    action: AssistantAction,
    timezone: string,
  ): Promise<ActionResponseResult> {
    const available = await this.resultAvailable(action);

    return available
      ? {
          status: 'already_completed',
          result: { type: action.resultType, id: action.resultId },
          instruction:
            'This action already ran once; confirm the existing result without creating another.',
        }
      : {
          status: 'result_retired',
          result: { type: action.resultType, id: action.resultId },
          instruction:
            'The saved result has since been removed, trashed, or cancelled. Do not recreate or restore it; a new save requires a new explicit request.',
          localTime: localDateTime(this.clock.now(), timezone),
        };
  }

  private async resultAvailable(action: AssistantAction): Promise<boolean> {
    if (!action.resultId) return false;

    switch (action.resultType) {
      case 'task':
        return (
          (await this.tasks.findById(action.userId, action.resultId)) !== null
        );
      case 'reminder':
        return (
          (await this.reminders.findById(action.userId, action.resultId)) !==
          null
        );

      case 'event': {
        const event = await this.calendar.findById(
          action.userId,
          action.resultId,
        );

        return event !== null && event.status !== 'cancelled';
      }

      case 'note':
        try {
          await this.notes.find(action.userId, action.resultId);

          return true;
        } catch (error) {
          if (
            error instanceof ApiException &&
            error.getStatus() === Number(HttpStatus.NOT_FOUND)
          )
            return false;
          throw error;
        }

      default:
        return false;
    }
  }

  /** Executes an authorized action exactly once under its original identity. */
  async execute(
    userId: string,
    actionId: string,
    timezone: string,
  ): Promise<ActionResponseResult> {
    const now = this.clock.now();
    const claimed = await this.actions.claimExecution(
      userId,
      actionId,
      now,
      new Date(now.getTime() + ACTION_EXECUTION_LEASE_MS),
    );

    if (!claimed) {
      const current = await this.actions.findById(userId, actionId);
      if (current?.status === 'completed')
        return this.acknowledgeCompleted(current, timezone);

      return {
        status: current?.status ?? 'unknown',
        instruction:
          'The action is already executing or not authorized; do not claim a result.',
      };
    }

    const p = claimed.parameters;

    try {
      // Revalidate the offered state before any side effect.
      if (claimed.actionType === 'create_calendar_event') {
        const check = await this.availability.check(userId, {
          date: str(p.date),
          durationMinutes:
            (schedulingInstant(str(p.date), str(p.end), timezone).getTime() -
              schedulingInstant(
                str(p.date),
                str(p.start),
                timezone,
              ).getTime()) /
            60_000,
          windowStart: str(p.windowStart),
          windowEnd: str(p.windowEnd),
          bufferMinutes: Number(str(p.bufferMinutes)),
          requestedStart: str(p.start),
          ...(p.taskId ? { taskId: str(p.taskId) } : {}),
        });

        if (!check.requested?.available)
          return this.invalidate(claimed, 'slot_unavailable', check);
      }

      if (
        claimed.actionType === 'create_task' ||
        claimed.actionType === 'create_reminder'
      ) {
        const at = String(
          claimed.actionType === 'create_task' ? (p.dueAt ?? '') : p.at,
        );

        if (at) {
          const parts = localParts(at, 'time');
          if (schedulingInstant(parts.date, parts.time, timezone) <= now)
            return this.invalidate(claimed, 'time_passed');
        }
      }

      const result = await this.mutate(claimed, timezone);
      const completed = await this.actions.transition(
        userId,
        claimed.id,
        ['executing'],
        {
          status: 'completed',
          resultType: result.type,
          resultId: result.id,
          executionLeaseUntil: null,
          lastErrorCode: null,
          statusReason: 'executed',
          decidedAt: this.clock.now(),
        },
      );

      if (!completed)
        this.logger.error(
          JSON.stringify({
            event: 'assistant_action_completion_lost',
            actionId: claimed.id,
            remediation:
              'The mutation succeeded but the action lease was lost; the receipt key prevents duplicates on retry.',
          }),
        );

      return {
        status: 'completed',
        result,
        instruction:
          'Confirm the actual saved result briefly. Do not ask for another confirmation.',
      };
    } catch (error) {
      const code =
        error instanceof AvailabilityUnavailableError
          ? error.code
          : 'action_failed';

      this.logger.warn(
        JSON.stringify({
          event: 'assistant_action_failed',
          actionId: claimed.id,
          actionType: claimed.actionType,
          code,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          remediation:
            'The accepted action remains recoverable; a conversational retry reuses its identity.',
        }),
      );
      await this.actions.transition(userId, claimed.id, ['executing'], {
        status: 'failed',
        lastErrorCode: code,
        executionLeaseUntil: null,
        statusReason: 'execution_failed',
      });

      return {
        status: 'failed',
        code,
        instruction:
          'Report that saving failed; nothing was confirmed saved. The user can ask to retry the same action.',
      };
    }
  }

  private async invalidate(
    action: AssistantAction,
    reason: string,
    check?: AvailabilityResult,
  ): Promise<ActionResponseResult> {
    await this.actions.transition(action.userId, action.id, ['executing'], {
      status: 'invalidated',
      statusReason: reason,
      executionLeaseUntil: null,
    });

    return {
      status: 'revalidation_failed',
      reason,
      conflicts: check?.requested?.conflicts,
      alternatives: check?.slots,
      instruction:
        'Nothing was saved. Explain what changed. Any new interval requires a new offer and a new acceptance.',
    };
  }

  private async mutate(
    action: AssistantAction,
    timezone: string,
  ): Promise<{ type: string; id: string; title: string; when?: string }> {
    const p = action.parameters;
    const receiptKey =
      action.receiptKey ?? `assistant-action-${action.id}-v${action.version}`;

    const sourceMessageId = action.acceptedMessageId;

    if (action.actionType === 'create_calendar_event') {
      const event = await this.calendar.create(
        action.userId,
        {
          title: str(p.title),
          startAt: schedulingInstant(str(p.date), str(p.start), timezone),
          endAt: schedulingInstant(str(p.date), str(p.end), timezone),
          timezone,
          description: p.taskId
            ? `Waktu kerja untuk tugas ${str(p.taskId)}`
            : null,
        },
        'local',
        receiptKey,
      );

      return {
        type: 'event',
        id: event.id,
        title: event.title,
        when: `${str(p.date)} ${str(p.start)}–${str(p.end)}`,
      };
    }

    if (action.actionType === 'create_task') {
      const title = str(p.title);
      // Recover a create that succeeded before the completion write was lost.
      const existing = (
        await this.tasks.list(action.userId, { search: title })
      ).find(
        (task) =>
          task.source.messageId === sourceMessageId && task.title === title,
      );

      const due = p.dueAt ? localParts(str(p.dueAt), 'dueAt') : null;
      const task =
        existing ??
        (await this.tasks.create(action.userId, {
          title,
          dueAt: due ? schedulingInstant(due.date, due.time, timezone) : null,
          sourceType: 'chat',
          sourceMessageId,
        }));

      return {
        type: 'task',
        id: task.id,
        title: task.title,
        when: p.dueAt ? str(p.dueAt) : undefined,
      };
    }

    if (action.actionType === 'create_reminder') {
      const title = str(p.title);
      const at = localParts(str(p.at), 'at');
      const scheduledAt = schedulingInstant(at.date, at.time, timezone);
      const existing = (
        await this.reminders.list(action.userId, { search: title })
      ).find(
        (reminder) =>
          reminder.source.messageId === sourceMessageId &&
          reminder.scheduledAt.getTime() === scheduledAt.getTime(),
      );

      const reminder =
        existing ??
        (await this.reminders.create(action.userId, {
          title,
          scheduledAt,
          timezone,
          sourceType: 'chat',
          sourceMessageId,
        }));

      if (!existing) await this.reminderScheduler.schedule(reminder);

      return {
        type: 'reminder',
        id: reminder.id,
        title: reminder.title,
        when: str(p.at),
      };
    }

    const note = await this.notes.create(
      action.userId,
      {
        kind: 'note',
        title: str(p.title),
        parentId: null,
        requestKey: receiptKey,
        content: plainTextToRichText(str(p.content)),
      },
      'chat',
    );

    return { type: 'note', id: note.id, title: note.title };
  }

  /** Background wake for snoozed actions: revalidate, then re-arm or expire. */
  async wakeSnoozed(limit = 25): Promise<AssistantAction[]> {
    const now = this.clock.now();
    const due = await this.actions.listDueSnoozed(now, limit);
    const ready: AssistantAction[] = [];

    for (const action of due) {
      if (action.usefulUntil <= now) {
        await this.actions.transition(action.userId, action.id, ['snoozed'], {
          status: 'expired',
          statusReason: 'expired_while_snoozed',
        });
        continue;
      }

      ready.push(action);
    }

    return ready;
  }

  async markOffered(
    userId: string,
    preparedBy: string,
    messageId: string,
    actionIds?: readonly string[],
  ): Promise<number> {
    return this.actions.markOffered(userId, preparedBy, messageId, actionIds);
  }

  async preparedInRun(
    userId: string,
    preparedBy: string,
  ): Promise<AssistantAction[]> {
    return (await this.actions.listPreparedBy(userId, preparedBy)).filter(
      (action) => action.status === 'prepared',
    );
  }

  transition = (
    ...args: Parameters<IAssistantActionRepository['transition']>
  ) => this.actions.transition(...args);
}

import { HttpStatus } from '@nestjs/common';
import {
  TOPIC_ITEM_TYPES,
  type TopicItemType,
} from '../../../database/entities';
import { ApiException, ErrorCodes } from '../../../shared/errors';
import {
  DISCONNECT_SCOPES,
  type DisconnectInput,
  type DisconnectScope,
  type TopicDisconnectService,
} from '../../topics/topic-disconnect.service';
import type { AssistantTool } from './tool-executor.service';

function invalid(message: string): ApiException {
  return new ApiException({
    code: ErrorCodes.BAD_REQUEST,
    status: HttpStatus.BAD_REQUEST,
    message,
  });
}

function parse(value: unknown): DisconnectInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalid('Arguments must be an object.');
  const input = value as Record<string, unknown>;
  const topicId = typeof input.topicId === 'string' ? input.topicId.trim() : '';
  if (!topicId) throw invalid('topicId is required.');
  if (!DISCONNECT_SCOPES.includes(input.scope as DisconnectScope))
    throw invalid(`scope must be one of ${DISCONNECT_SCOPES.join(', ')}.`);
  const scope = input.scope as DisconnectScope;

  if (scope !== 'item') return { topicId, scope };
  if (!TOPIC_ITEM_TYPES.includes(input.itemType as TopicItemType))
    throw invalid('itemType is required for scope item.');
  if (typeof input.itemId !== 'string' || !input.itemId.trim())
    throw invalid('itemId is required for scope item.');

  return {
    topicId,
    scope,
    itemType: input.itemType as TopicItemType,
    itemId: input.itemId.trim(),
  };
}

/** TOPIC-DISC-01: the user's correction of a topic Sydia brought in. */
export function createTopicTools(
  disconnect: Pick<TopicDisconnectService, 'disconnect'>,
): AssistantTool[] {
  return [
    {
      definition: {
        name: 'disconnect_topic',
        label: 'Disconnect a topic',
        description:
          "Undo a topic connection the user says is wrong, using the topicId from the topic context. episode: this message and the rest of this conversation are not about the topic. item: one listed item does not belong to the topic. topic_complete: the user says the effort is over (call it then, even when other questions remain; it changes no item). topic_forget: the user asks to forget the topic entirely. Only on the user's words; never on your own judgement.",
        parameters: {
          type: 'object',
          properties: {
            topicId: { type: 'string' },
            scope: { type: 'string', enum: [...DISCONNECT_SCOPES] },
            itemType: {
              type: 'string',
              enum: [...TOPIC_ITEM_TYPES],
              description: "Only for scope item: the listed item's type.",
            },
            itemId: {
              type: 'string',
              description: "Only for scope item: the listed item's id.",
            },
          },
          required: ['topicId', 'scope'],
          additionalProperties: false,
        },
      },
      parseArguments: (value) => parse(value),
      execute: async ({ userId, arguments: raw, context }) =>
        disconnect.disconnect(userId, context?.conversationId, parse(raw)),
    },
  ];
}

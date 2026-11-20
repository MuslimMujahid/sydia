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
import type { TopicDirectoryService } from '../../topics/topic-directory.service';
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

  if (scope === 'split') {
    const newLabel =
      typeof input.newLabel === 'string' ? input.newLabel.trim() : '';

    const items = Array.isArray(input.items)
      ? input.items.flatMap((entry: unknown) => {
          if (!entry || typeof entry !== 'object') return [];
          const { type, id } = entry as Record<string, unknown>;

          return TOPIC_ITEM_TYPES.includes(type as TopicItemType) &&
            typeof id === 'string' &&
            id.trim()
            ? [{ type: type as TopicItemType, id: id.trim() }]
            : [];
        })
      : [];

    if (!newLabel) throw invalid('newLabel is required for scope split.');
    if (!items.length)
      throw invalid('items (listed type and id) are required for scope split.');

    return { topicId, scope, newLabel, items };
  }

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
  directory: Pick<TopicDirectoryService, 'list'>,
): AssistantTool[] {
  return [
    {
      definition: {
        name: 'list_topics',
        label: 'List remembered topics',
        description:
          'Topics (ongoing efforts) Sydia tracks for this user, with status, latest decision, next step and pending items. Use for "what do you remember" questions, or to get a topicId the context lacks.',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
      readOnly: true,
      parseArguments: () => ({}),
      execute: async ({ userId }) => ({ topics: await directory.list(userId) }),
    },
    {
      definition: {
        name: 'disconnect_topic',
        label: 'Disconnect a topic',
        description:
          "Apply the user's correction to a topic (topicId from the topic context or list_topics). episode: this conversation is not about it. item: one listed item does not belong. split: listed items belong to another effort (newLabel, items). topic_complete: the effort is over. topic_forget: forget it. Only on the user's words.",
        parameters: {
          type: 'object',
          properties: {
            topicId: { type: 'string' },
            scope: { type: 'string', enum: [...DISCONNECT_SCOPES] },
            itemType: { type: 'string', enum: [...TOPIC_ITEM_TYPES] },
            itemId: { type: 'string' },
            newLabel: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: [...TOPIC_ITEM_TYPES] },
                  id: { type: 'string' },
                },
                required: ['type', 'id'],
                additionalProperties: false,
              },
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

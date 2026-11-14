import { allocateStepCosts, toolFeature, usageFeature } from './usage-features';

describe('toolFeature', () => {
  it.each([
    ['create_task', 'tasks'],
    ['list_categories', 'tasks'],
    ['snooze_reminder', 'reminders'],
    ['search_memories', 'memory'],
    ['add_record_rows', 'notes'],
    ['write_daily_note', 'notes'],
    ['save_attached_files', 'documents'],
    ['create_calendar_event', 'calendar'],
    ['resolve_contact', 'contacts'],
    ['update_plan', 'overhead'],
  ])('maps %s to %s', (name, feature) => {
    expect(toolFeature(name)).toBe(feature);
  });

  it('leaves an unknown tool without a feature', () => {
    expect(toolFeature('brand_new_tool')).toBeNull();
  });
});

describe('usageFeature', () => {
  it('prefers the stage over the queue it ran in', () => {
    expect(
      usageFeature({
        stage: 'embedding',
        job: 'memory-dreams',
        kind: 'background',
      }),
    ).toBe('memory');
    expect(
      usageFeature({ stage: 'decision.turn', job: null, kind: 'message' }),
    ).toBe('overhead');
  });

  it('treats an unlabelled message-time call as chat and anything else as other', () => {
    expect(
      usageFeature({ stage: 'generation', job: null, kind: 'message' }),
    ).toBe('chat');
    expect(
      usageFeature({ stage: 'generation', job: null, kind: 'other' }),
    ).toBe('other');
  });

  it('charges an embedding outside a feature queue to retrieval overhead', () => {
    expect(
      usageFeature({ stage: 'embedding', job: null, kind: 'message' }),
    ).toBe('overhead');
  });
});

describe('allocateStepCosts', () => {
  it('charges a tool step to its features and the following reply to the same features', () => {
    expect(
      allocateStepCosts([
        { costUsd: 0.04, tools: ['create_task', 'save_memory'] },
        { costUsd: 0.02, tools: [] },
      ]),
    ).toEqual({ tasks: 0.03, memory: 0.03 });
  });

  it('charges a reply that follows no tool step to chat', () => {
    expect(
      allocateStepCosts([
        { costUsd: 0.01, tools: ['search_notes'] },
        { costUsd: 0.02, tools: [] },
        { costUsd: 0.05, tools: [] },
      ]),
    ).toEqual({ notes: 0.03, chat: 0.05 });
  });

  it('charges a reply after housekeeping alone to chat, and the housekeeping step to overhead', () => {
    expect(
      allocateStepCosts([
        { costUsd: 0.01, tools: ['get_current_datetime'] },
        { costUsd: 0.02, tools: [] },
      ]),
    ).toEqual({ overhead: 0.01, chat: 0.02 });
  });

  it('charges a reply to the last real feature even when housekeeping came between', () => {
    expect(
      allocateStepCosts([
        { costUsd: 0.01, tools: ['create_task'] },
        { costUsd: 0.01, tools: ['get_current_datetime'] },
        { costUsd: 0.02, tools: [] },
      ]),
    ).toEqual({ tasks: 0.03, overhead: 0.01 });
  });

  it('charges a step that mixes a real tool with housekeeping to the real feature only', () => {
    expect(
      allocateStepCosts([
        { costUsd: 0.04, tools: ['create_task', 'get_current_datetime'] },
      ]),
    ).toEqual({ tasks: 0.04 });
  });

  it('ignores steps whose cost is unknown', () => {
    expect(allocateStepCosts([{ tools: ['create_task'] }])).toEqual({});
  });
});

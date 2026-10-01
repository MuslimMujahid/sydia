import { schemaOnlyTools } from './optimization.tool-schemas';
import { toolNamesForGroups } from '../../src/modules/conversations/services/tool-groups';

test('real schemas cover all 37 domain tools without any executable function', () => {
  const tools = schemaOnlyTools();
  expect(Object.keys(tools)).toHaveLength(37);
  for (const value of Object.values(tools))
    expect(value.execute).toBeUndefined();
  expect(tools.create_task?.description).toContain('task');
});

test('selection preserves registry order and task terminal schema without executing anything', () => {
  const full = schemaOnlyTools();
  const selected = toolNamesForGroups(['tasks']);
  const tools = schemaOnlyTools(selected);
  expect(Object.keys(tools)).toEqual(
    Object.keys(full).filter((name) => selected.includes(name)),
  );
  expect(JSON.stringify(tools.create_task?.inputSchema)).toContain(
    'completeTurn',
  );
  expect(JSON.stringify(tools.create_task?.inputSchema)).toEqual(
    JSON.stringify(full.create_task?.inputSchema),
  );
  expect(schemaOnlyTools([])).toEqual({});
});

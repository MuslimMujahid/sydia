import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultSkillDirectory, loadSkillCatalog } from './skill-catalog';

// Jest runs from apps/backend (ESM, so no __dirname).
const ROUTES = join(process.cwd(), '../frontend/src/routes');

function guide() {
  const skill = loadSkillCatalog(defaultSkillDirectory()).find(
    (item) => item.name === 'sydia-guide',
  );

  if (!skill) throw new Error('The sydia-guide skill is not in the catalog.');

  return skill;
}

/** App paths the guide names in code spans or links, e.g. `/settings/profile`. */
function namedPaths(text: string): string[] {
  const paths = new Set<string>();
  // Pages appear as (`/path`) or [label](/path); a bare `/new` is a chat command.
  for (const match of text.matchAll(/(?:\(`|\]\()(\/[a-z0-9/-]*)(?:`\)|\))/g))
    paths.add(match[1]!);

  return [...paths];
}

/** The file-route source that renders a signed-in app page at this path. */
function routeSource(path: string): string | null {
  const segments = path.split('/').filter(Boolean);
  const candidates = [
    `_app.${segments.length ? segments.join('.') : 'index'}.tsx`,
    `${segments.join('.')}.tsx`,
  ];

  for (const file of candidates) {
    const full = join(ROUTES, file);
    if (existsSync(full)) return readFileSync(full, 'utf8');
  }

  return null;
}

describe('sydia-guide skill', () => {
  test('unlocks the timezone change it tells the assistant to make', () => {
    expect(guide().tools).toEqual(
      expect.arrayContaining(['set_timezone', 'list_reminders']),
    );
  });

  test('every page it names is a real page, not a redirect', () => {
    const skill = guide();
    const text = [skill.body, ...Object.values(skill.references)].join('\n');
    const paths = namedPaths(text);

    expect(paths.length).toBeGreaterThan(5);

    for (const path of paths) {
      const source = routeSource(path);
      expect({ path, exists: source !== null }).toEqual({
        path,
        exists: true,
      });
      // Redirect-only routes (old /settings/whatsapp, /tasks) render nothing.
      expect({ path, renders: /^\s*component:/m.test(source!) }).toEqual({
        path,
        renders: true,
      });
    }
  });
});

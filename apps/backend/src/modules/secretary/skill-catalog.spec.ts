import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  defaultSkillDirectory,
  loadSkillCatalog,
  renderSkillCatalog,
  SkillCatalogError,
} from './skill-catalog';

function skill(
  root: string,
  name: string,
  frontmatter: string,
  body = '# Body\n\nGuidance.',
): void {
  mkdirSync(join(root, name), { recursive: true });
  writeFileSync(
    join(root, name, 'SKILL.md'),
    `---\n${frontmatter}\n---\n${body}\n`,
  );
}

describe('skill catalog', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'skills-'));
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  test('loads the repository catalog with versions, tools, and references', () => {
    const skills = loadSkillCatalog(defaultSkillDirectory());

    expect(skills.map((item) => item.name)).toEqual([
      'commitment-capture',
      'meeting-preparation',
      'scheduling',
      'work-resumption',
    ]);
    const scheduling = skills.find((item) => item.name === 'scheduling')!;
    expect(scheduling.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(scheduling.tools).toContain('check_availability');
    expect(Object.keys(scheduling.references)).toEqual([
      'availability-rules.md',
    ]);
  });

  test('the compact catalog carries descriptions but not skill bodies', () => {
    const skills = loadSkillCatalog(defaultSkillDirectory());
    const catalog = renderSkillCatalog(skills);

    for (const item of skills) {
      expect(catalog).toContain(`${item.name}@${item.version}`);
      expect(catalog).not.toContain(item.body);
    }
  });

  test('a declared folder without its SKILL.md body fails with an actionable error', () => {
    skill(root, 'present', 'name: present\nversion: 1.0.0\ndescription: ok');
    mkdirSync(join(root, 'missing'));

    expect(() => loadSkillCatalog(root)).toThrow(SkillCatalogError);
    expect(() => loadSkillCatalog(root)).toThrow(/missing.*declared body/);
  });

  test('a missing declared reference fails instead of shrinking the catalog', () => {
    skill(
      root,
      'present',
      'name: present\nversion: 1.0.0\ndescription: ok\nreferences:\n  - rules.md',
    );

    expect(() => loadSkillCatalog(root)).toThrow(/declares missing reference/);
  });

  test('rejects unregistered tools, name mismatches, and invalid versions', () => {
    skill(
      root,
      'alpha',
      'name: alpha\nversion: 1.0.0\ndescription: ok\ntools:\n  - ghost_tool',
    );
    expect(() => loadSkillCatalog(root, ['real_tool'])).toThrow(
      /unregistered tools ghost_tool/,
    );

    rmSync(join(root, 'alpha'), { recursive: true });
    skill(root, 'beta', 'name: gamma\nversion: 1.0.0\ndescription: ok');
    expect(() => loadSkillCatalog(root)).toThrow(/must match its folder/);

    rmSync(join(root, 'beta'), { recursive: true });
    skill(root, 'delta', 'name: delta\nversion: one\ndescription: ok');
    expect(() => loadSkillCatalog(root)).toThrow(/semantic/);
  });

  test('every repository skill tool is a registered assistant tool name', () => {
    const skills = loadSkillCatalog(defaultSkillDirectory());
    const declared = new Set(skills.flatMap((item) => item.tools));

    expect([...declared].every((name) => /^[a-z_]+$/.test(name))).toBe(true);
  });
});

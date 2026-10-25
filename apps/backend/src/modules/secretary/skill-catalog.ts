import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Compact metadata shown to the agent on every turn. */
export type SkillSummary = {
  name: string;
  version: string;
  description: string;
};

export type SkillDefinition = SkillSummary & {
  body: string;
  /** Tools the skill's guidance relies on; loading it makes them available. */
  tools: readonly string[];
  references: Readonly<Record<string, string>>;
};

export class SkillCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillCatalogError';
  }
}

const NAME = /^[a-z][a-z0-9-]{1,63}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const REFERENCE = /^[a-z0-9][a-z0-9-]*\.md$/;
/** Bounds keep a single load from crowding out the conversation. */
export const SKILL_BODY_MAX_CHARS = 6000;
export const SKILL_REFERENCE_MAX_CHARS = 4000;

type Frontmatter = Record<string, string | string[]>;

/** Parses the small YAML subset used by SKILL.md: scalars and string lists. */
function parseFrontmatter(
  source: string,
  file: string,
): {
  meta: Frontmatter;
  body: string;
} {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(
    source.replace(/\r\n?/g, '\n'),
  );

  if (!match)
    throw new SkillCatalogError(
      `${file} must start with a --- frontmatter block.`,
    );
  const meta: Frontmatter = {};
  let list: string | null = null;

  for (const line of match[1]!.split('\n')) {
    if (!line.trim()) continue;
    const item = /^\s+-\s+(.+)$/.exec(line);

    if (item) {
      const current = list ? meta[list] : undefined;
      if (!list || !Array.isArray(current))
        throw new SkillCatalogError(`${file}: list item without a list key.`);
      current.push(item[1]!.trim());
      continue;
    }

    const pair = /^([a-z]+):\s*(.*)$/.exec(line);
    if (!pair) throw new SkillCatalogError(`${file}: invalid line "${line}".`);
    const [, key, value] = pair as unknown as [string, string, string];

    if (key in meta) throw new SkillCatalogError(`${file}: duplicate ${key}.`);

    if (value.trim()) {
      meta[key] = value.trim();
      list = null;
    } else {
      meta[key] = [];
      list = key;
    }
  }

  return { meta, body: match[2]!.trim() };
}

function scalar(meta: Frontmatter, key: string, file: string): string {
  const value = meta[key];
  if (typeof value !== 'string' || !value)
    throw new SkillCatalogError(`${file}: missing required "${key}".`);

  return value;
}

function strings(meta: Frontmatter, key: string, file: string): string[] {
  const value = meta[key];
  if (value === undefined) return [];
  if (!Array.isArray(value))
    throw new SkillCatalogError(`${file}: "${key}" must be a list.`);

  return value;
}

/**
 * Loads and validates repository-maintained skills. A missing declared body or
 * reference is a configuration error that fails startup, never a silently
 * shorter catalog.
 */
export function loadSkillCatalog(
  directory: string,
  registeredTools?: readonly string[],
): SkillDefinition[] {
  if (!existsSync(directory))
    throw new SkillCatalogError(`Skill directory is missing: ${directory}`);
  const entries = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (entries.length === 0)
    throw new SkillCatalogError(`No skills found in ${directory}.`);

  const skills = entries.map((folder): SkillDefinition => {
    const file = join(directory, folder, 'SKILL.md');
    if (!existsSync(file))
      throw new SkillCatalogError(
        `Skill "${folder}" is missing its declared body ${file}.`,
      );
    const { meta, body } = parseFrontmatter(readFileSync(file, 'utf8'), file);
    const name = scalar(meta, 'name', file);
    const version = scalar(meta, 'version', file);
    const description = scalar(meta, 'description', file);

    if (name !== folder || !NAME.test(name))
      throw new SkillCatalogError(
        `${file}: name must match its folder and use lowercase-hyphen form.`,
      );
    if (!VERSION.test(version))
      throw new SkillCatalogError(`${file}: version must be semantic (x.y.z).`);
    if (description.length > 240)
      throw new SkillCatalogError(`${file}: description exceeds 240 chars.`);
    if (!body) throw new SkillCatalogError(`${file}: body is empty.`);
    if (body.length > SKILL_BODY_MAX_CHARS)
      throw new SkillCatalogError(
        `${file}: body exceeds ${SKILL_BODY_MAX_CHARS} chars; move detail into a reference.`,
      );

    const tools = strings(meta, 'tools', file);

    if (registeredTools) {
      const unknown = tools.filter((tool) => !registeredTools.includes(tool));
      if (unknown.length)
        throw new SkillCatalogError(
          `${file}: declares unregistered tools ${unknown.join(', ')}.`,
        );
    }

    const references: Record<string, string> = {};

    for (const reference of strings(meta, 'references', file)) {
      if (!REFERENCE.test(reference))
        throw new SkillCatalogError(
          `${file}: invalid reference "${reference}".`,
        );
      const path = join(directory, folder, reference);
      if (!existsSync(path))
        throw new SkillCatalogError(
          `Skill "${name}" declares missing reference ${path}.`,
        );
      const content = readFileSync(path, 'utf8').trim();
      if (!content || content.length > SKILL_REFERENCE_MAX_CHARS)
        throw new SkillCatalogError(
          `${path}: reference must be non-empty and at most ${SKILL_REFERENCE_MAX_CHARS} chars.`,
        );
      references[reference] = content;
    }

    return { name, version, description, body, tools, references };
  });

  return skills;
}

export function defaultSkillDirectory(): string {
  return typeof __dirname === 'string'
    ? join(__dirname, 'skills')
    : join(process.cwd(), 'src/modules/secretary/skills');
}

/** The catalog block exposed to the agent; bodies load on demand. */
export function renderSkillCatalog(skills: readonly SkillSummary[]): string {
  return [
    "Secretary behavior (built in, overrides the general rule against unsolicited suggestions for work topics): when the conversation touches recorded work (a meeting, a commitment, resuming or continuing an effort, a proposed time), call get_work_context and load the matching skill before replying, then give the help that clearly fits, without asking permission to look things up. “Continue”/“lanjutkan” about an effort means do its next step now (for writing work, draft it in chat), not ask the user to supply it. Unrelated questions get only their answer. At most one unsolicited suggestion per reply, and none when the user asked you not to offer anything. Complete every part of the user's request; a preference change or recognized commitment never replaces the work they asked for. Hard rules: (1) Never state that a time is free, busy, or the best option unless check_availability calculated it this turn. (2) Before asking whether to save, create, schedule, or remind, prefer calling prepare_action for exactly that action so acceptance saves what the user saw, once; do not offer one it returned as suppressed or already_offered. Nothing inferred is saved until the user agrees in conversation.",
    'Skills (domain guidance you can load with load_skill when relevant; loading needs no user approval and makes the skill’s tools available for the rest of the turn):',
    ...skills.map(
      (skill) => `- ${skill.name}@${skill.version}: ${skill.description}`,
    ),
    'Load a skill only when the request or retrieved evidence makes it relevant; you may load more later in the turn. Do not load skills or add suggestions for unrelated questions. Skills inform judgment; you still compose the answer and decide whether any suggestion helps.',
  ].join('\n');
}

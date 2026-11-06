import type { Check, RunRecord } from './harness';

type Args = Record<string, unknown>;

function callsOf(run: RunRecord, name: string) {
  return run.calls.filter((call) => call.name === name);
}

/** The tool was called, optionally with arguments satisfying a predicate. */
export function called(
  name: string,
  predicate?: (args: Args) => boolean,
  label?: string,
): Check {
  return {
    name: `calls ${name}${label ? ` (${label})` : ''}`,
    test: (run) => {
      const calls = callsOf(run, name);
      if (!calls.length) return `${name} was not called`;
      if (predicate && !calls.some(({ args }) => predicate(args)))
        return `${name} arguments did not match: ${JSON.stringify(calls.map(({ args }) => args))}`;

      return true;
    },
  };
}

export function notCalled(...names: string[]): Check {
  return {
    name: `does not call ${names.join(', ')}`,
    test: (run) => {
      const hit = names.filter((name) => callsOf(run, name).length);

      return hit.length ? `called ${hit.join(', ')}` : true;
    },
  };
}

/** At most `max` calls of the tool (for example, one suggestion per reply). */
export function calledAtMost(name: string, max: number): Check {
  return {
    name: `calls ${name} at most ${max}×`,
    test: (run) => {
      const count = callsOf(run, name).length;

      return count <= max || `${name} called ${count}×`;
    },
  };
}

/** Only tools from this list (plus always-available reads) were called. */
export function onlyCalled(...names: string[]): Check {
  const allowed = new Set([
    ...names,
    'load_skill',
    'get_current_datetime',
    'get_work_context',
  ]);

  return {
    name: `calls only ${names.join(', ') || 'no domain tools'}`,
    test: (run) => {
      const extra = [
        ...new Set(
          run.calls.map(({ name }) => name).filter((n) => !allowed.has(n)),
        ),
      ];

      return extra.length ? `also called ${extra.join(', ')}` : true;
    },
  };
}

export function contains(...fragments: string[]): Check {
  return {
    name: `mentions ${fragments.map((f) => JSON.stringify(f)).join(', ')}`,
    test: (run) => {
      const text = run.text.toLocaleLowerCase();
      const missing = fragments.filter(
        (fragment) => !text.includes(fragment.toLocaleLowerCase()),
      );

      return missing.length ? `missing ${missing.join(', ')}` : true;
    },
  };
}

export function notContains(...fragments: string[]): Check {
  return {
    name: `does not mention ${fragments.map((f) => JSON.stringify(f)).join(', ')}`,
    test: (run) => {
      const text = run.text.toLocaleLowerCase();
      const found = fragments.filter((fragment) =>
        text.includes(fragment.toLocaleLowerCase()),
      );

      return found.length ? `mentions ${found.join(', ')}` : true;
    },
  };
}

export function matches(pattern: RegExp, name: string): Check {
  return {
    name,
    test: (run) => pattern.test(run.text) || `text does not match ${pattern}`,
  };
}

export function notMatches(pattern: RegExp, name: string): Check {
  return {
    name,
    test: (run) => {
      const hit = pattern.exec(run.text);

      return hit ? `found ${JSON.stringify(hit[0])}` : true;
    },
  };
}

export function maxChars(limit: number): Check {
  return {
    name: `at most ${limit} characters`,
    test: (run) => run.text.length <= limit || `${run.text.length} characters`,
  };
}

const INDONESIAN =
  /\b(yang|dan|untuk|sudah|akan|kamu|anda|saya|aku|ini|itu|ada|tidak|bisa|dengan|besok|jam|ya)\b/gi;

const ENGLISH =
  /\b(the|and|you|your|have|will|with|this|that|there|tomorrow|for|is|are)\b/gi;

function score(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

export function inIndonesian(): Check {
  return {
    name: 'replies in Indonesian',
    test: (run) =>
      score(run.text, INDONESIAN) > score(run.text, ENGLISH) ||
      'reply reads as English',
  };
}

export function inEnglish(): Check {
  return {
    name: 'replies in English',
    test: (run) =>
      score(run.text, ENGLISH) > score(run.text, INDONESIAN) ||
      'reply reads as Indonesian',
  };
}

/** Process talk the system policy forbids ("saved to memory", "database"). */
export function noProcessTalk(): Check {
  return notMatches(
    /\b(database|basis data|tool|alat bantu|queue|antrean|penyimpanan memori|disimpan (?:ke|di) memori|saved (?:to|in) (?:my )?memory|memory record)\b/i,
    'keeps tools and storage internal',
  );
}

/** WhatsApp renders no Markdown: no **bold**, headings, or tables. */
export function whatsappPlain(): Check {
  return notMatches(
    /\*\*[^*]+\*\*|^#{1,6}\s|^\s*\|.*\|\s*$|\]\(#/m,
    'uses WhatsApp-native formatting',
  );
}

export function noWebLinks(): Check {
  return notMatches(
    /\]\(#(?:task|event|reminder|note)\//,
    'no web-only entity links',
  );
}

export function noErrors(): Check {
  return {
    name: 'completes without error',
    test: (run) => (run.error ? run.error : true),
  };
}

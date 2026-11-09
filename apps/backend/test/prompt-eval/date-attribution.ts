import type { Check } from './harness';

export const DATE_ATTRIBUTION_VERSION = 'date-attribution-v2';

export type DateAttributionSpec = {
  today: string;
  requestedDate: string;
  rows: Array<{ fragment: string; date: string }>;
  /** Validate an explicitly claimed currency total for the requested day. */
  totalIdr?: number;
};

type Scope = string;
type Cue = { start: number; end: number; scope: Scope };
const MONTHS = [
  'jan(?:uary|uari)?',
  'feb(?:ruary|ruari)?',
  'mar(?:ch|et)?',
  'apr(?:il)?',
  'may|mei',
  'jun(?:e|i)?',
  'jul(?:y|i)?',
  'aug(?:ust|ustus)?|agu(?:stus)?',
  'sep(?:tember)?',
  'oct(?:ober)?|okt(?:ober)?',
  'nov(?:ember)?',
  'dec(?:ember)?|des(?:ember)?',
];

export function shiftDate(date: string, offset: number): string {
  const instant = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(instant.getTime()))
    throw new Error(`Invalid evaluation date: ${date}`);
  instant.setUTCDate(instant.getUTCDate() + offset);

  return instant.toISOString().slice(0, 10);
}

function cues(text: string, spec: DateAttributionSpec): Cue[] {
  const result: Cue[] = [];
  const add = (match: RegExpMatchArray, scope: Scope) =>
    result.push({
      start: match.index!,
      end: match.index! + match[0].length,
      scope,
    });

  for (const match of text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g))
    add(match, match[0]);

  for (const [month, pattern] of MONTHS.entries()) {
    const date = new RegExp(
      `\\b(\\d{1,2})\\s+(?:${pattern})\\.?(?:\\s+(\\d{4}))?\\b`,
      'gi',
    );

    for (const match of text.matchAll(date))
      add(
        match,
        `${match[2] ?? spec.today.slice(0, 4)}-${String(month + 1).padStart(2, '0')}-${match[1]!.padStart(2, '0')}`,
      );
  }

  for (const match of text.matchAll(
    /\b(selain hari ini|sebelum hari ini|hari ini|today|kemarin|yesterday|besok|tomorrow|sebelumnya|previous(?:ly)?|earlier|older|historical|riwayat|baris lainnya|dua baris lainnya)\b/gi,
  )) {
    const word = match[0].toLowerCase();
    add(
      match,
      /^(hari ini|today)$/.test(word)
        ? spec.today
        : /^(kemarin|yesterday)$/.test(word)
          ? shiftDate(spec.today, -1)
          : /^(besok|tomorrow)$/.test(word)
            ? shiftDate(spec.today, 1)
            : 'other',
    );
  }

  return result.sort((a, b) => a.start - b.start || b.end - a.end);
}

/**
 * A bounded text check for the eval's dated row fixtures. Dates on a row take
 * precedence over inherited section headings. Unlabelled answers inherit the
 * requested day, so an extra row needs a distinguishable date/history context.
 * Unrecognised or contradictory attribution fails visibly rather than passing.
 */
export function checkDateAttribution(
  text: string,
  spec: DateAttributionSpec,
): true | string {
  if (!spec.rows.some((row) => row.date === spec.requestedDate))
    throw new Error('Date attribution fixture has no requested rows.');
  shiftDate(spec.today, 0);
  if (spec.rows.some((row) => !row.fragment.trim()))
    throw new Error('Date attribution requires nonempty row fragments.');
  const normal = text
    .toLowerCase()
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '');

  const seen = new Set<string>();
  let inherited: Scope = spec.requestedDate;

  for (const line of normal.split(/\n|(?<=[.!?])\s+(?=[^\d])/u)) {
    // A follow-up offer is not an assertion that its mentioned rows belong to
    // the result just listed. Declarative repeated rows are still checked.
    if (/\?/.test(line) && /\b(mau|ingin|boleh|would|want|could)\b/.test(line))
      continue;
    const events = cues(line, spec);
    const mentions = spec.rows
      .flatMap((row) => {
        const fragment = row.fragment.toLowerCase();
        const hits: Array<{ row: typeof row; start: number; end: number }> = [];
        let from = 0;

        for (
          let index = line.indexOf(fragment, from);
          index >= 0;
          index = line.indexOf(fragment, from)
        ) {
          hits.push({ row, start: index, end: index + fragment.length });
          from = index + fragment.length;
        }

        return hits;
      })
      .sort((a, b) => a.start - b.start);

    for (const [index, mention] of mentions.entries()) {
      const before = events.filter((cue) => cue.end <= mention.start).at(-1);
      const next = mentions[index + 1]?.start ?? line.length;
      const after = events.find(
        (cue) =>
          cue.start >= mention.end &&
          cue.end <= next &&
          !line.slice(cue.end).trimStart().startsWith(':') &&
          !line.slice(mention.end, cue.start).includes(';'),
      );

      const scope = after?.scope ?? before?.scope ?? inherited;
      const expected = mention.row.date;
      // The contract concerns the requested day. A dated historical range may
      // describe several other dates without pairing each extra row to a day.
      if ((expected === spec.requestedDate) !== (scope === spec.requestedDate))
        return `Date attribution for ${mention.row.fragment} is ${scope}; expected ${expected}.`;
      seen.add(mention.row.fragment);
    }

    // A row's trailing date does not retitle the next list item. Headings do.
    if (!mentions.length && events.length) inherited = events.at(-1)!.scope;

    if (mentions.length) {
      const heading = events
        .filter((cue) => cue.end <= mentions[0]!.start)
        .at(-1);

      if (heading) inherited = heading.scope;
    }

    const requestedCue = events.some((cue) => cue.scope === spec.requestedDate);
    const outsideCue = events.some((cue) => cue.scope !== spec.requestedDate);
    const tableWide =
      /\b(keseluruhan|overall|semua|all|seluruh)\b/.test(line) ||
      (outsideCue &&
        /\b(tabel|table|tersimpan|termasuk|sejak|since)\b/.test(line));

    const amounts = [
      ...line.matchAll(/\btotal(?:nya)?\b[^\n]*?\brp\s*([\d.,]+)/g),
    ];

    if (spec.totalIdr !== undefined && (!tableWide || requestedCue)) {
      for (const amount of amounts) {
        const scope =
          events
            .filter((cue) => cue.end <= amount.index + amount[0].length)
            .at(-1)?.scope ?? inherited;

        if (scope !== spec.requestedDate) continue;
        const value = Number(
          amount[1]!.replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'),
        );

        if (!Number.isFinite(value) || value !== spec.totalIdr)
          return `Requested-day total is ${amount[1]}; expected IDR ${spec.totalIdr}.`;
      }
    }

    const count = /\btotal(?:nya)?\b[^\n]*?\b(\d+)\s+(?:baris|rows)\b/.exec(
      line,
    );

    const countScope = count
      ? (events.filter((cue) => cue.end <= count.index + count[0].length).at(-1)
          ?.scope ?? inherited)
      : inherited;

    if (
      count &&
      (!tableWide || requestedCue) &&
      countScope === spec.requestedDate
    ) {
      const expected = spec.rows.filter(
        (row) => row.date === spec.requestedDate,
      ).length;

      if (Number(count[1]) !== expected)
        return `Requested-day row count is ${count[1]}; expected ${expected}.`;
    }
  }

  const missing = spec.rows.filter(
    (row) => row.date === spec.requestedDate && !seen.has(row.fragment),
  );

  return missing.length
    ? `Missing requested rows: ${missing.map((row) => row.fragment).join(', ')}.`
    : true;
}

export function dateScopedRows(spec: DateAttributionSpec): Check {
  return {
    name: 'correctly attributes requested-day rows and totals',
    test: (run) => checkDateAttribution(run.text, spec),
  };
}

/** Same fixture expectations for live evaluation and offline historical scoring. */
export function dateScopeSpec(
  scenarioId: string,
  today: string,
): DateAttributionSpec | undefined {
  const row = (fragment: string, offset: number) => ({
    fragment,
    date: shiftDate(today, offset),
  });

  if (
    [
      'open-named-note-today-held-out',
      'open-named-note-held-out-lihat',
      'open-named-note-held-out-buka',
      'open-named-note-held-out-tanya',
    ].includes(scenarioId)
  )
    return {
      today,
      requestedDate: today,
      rows: [
        row('Gula', 0),
        row('Telur', 0),
        row('Minyak', -1),
        row('Tepung', -2),
      ],
    };
  if (scenarioId === 'open-named-note-today')
    return {
      today,
      requestedDate: today,
      rows: [row('Bu Rina', 0), row('Pak Dedi', 0), row('Bu Sari', -1)],
    };
  if (scenarioId === 'named-table-yesterday-held-out')
    return {
      today,
      requestedDate: shiftDate(today, -1),
      rows: [
        row('Galon', -1),
        row('listrik', -1),
        row('LPG', -3),
        row('Plastik', 0),
      ],
      totalIdr: 120000,
    };

  return undefined;
}

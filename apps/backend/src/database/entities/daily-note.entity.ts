import type { RichTextDocument } from '../../shared/rich-text';

export const DAILY_NOTE_SOURCES = [
  'dashboard',
  'chat',
  'whatsapp',
  'telegram',
] as const;
export type DailyNoteSource = (typeof DAILY_NOTE_SOURCES)[number];

export const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type DailyNote = {
  id: string;
  /** The owner's local calendar date in YYYY-MM-DD form. */
  date: string;
  content: RichTextDocument;
  /** Server-derived plain text; what gets embedded and previewed. */
  text: string;
  createdAt: Date;
  updatedAt: Date;
  source: {
    type: DailyNoteSource;
    label: string | null;
  };
};

export type DailyNoteSummary = {
  date: string;
  excerpt: string;
  updatedAt: Date;
};

export type DailyNoteChunk = {
  id: string;
  chunkIndex: number;
  content: string;
};

export type DailyNoteWrite = {
  date: string;
  timezone: string;
  content: RichTextDocument;
  text: string;
  sourceType: DailyNoteSource;
  sourceMessageId?: string | null;
};

/** A matched passage, carrying the note day it belongs to for provenance. */
export type DailyNoteChunkMatch = {
  date: string;
  chunkIndex: number;
  content: string;
};

export type DailyNoteSearchHit = {
  date: string;
  content: string;
};

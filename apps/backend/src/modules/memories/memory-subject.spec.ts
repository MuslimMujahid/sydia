import { canonicalMemorySubject } from './memory-subject';

const profile = { name: 'Demo User', preferredAddress: 'Kak Muslim' };

test.each([
  ['Kak Muslim suka makan nasi goreng', 'The user suka makan nasi goreng'],
  ['Demo User works as a developer.', 'The user works as a developer.'],
  [
    "Kak Muslim's favourite food is nasi goreng.",
    "The user's favourite food is nasi goreng.",
  ],
  ['kak muslim works as a developer.', 'The user works as a developer.'],
  ['Kak Muslimah likes tea.', 'Kak Muslimah likes tea.'],
  [
    'The user has a friend named Kak Muslim.',
    'The user has a friend named Kak Muslim.',
  ],
])(
  'normalizes only the profile owner at the start of a fact: %s',
  (text, expected) => {
    expect(canonicalMemorySubject(text, profile)).toBe(expected);
  },
);

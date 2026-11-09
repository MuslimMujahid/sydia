import { containsMemoryCredential } from './memory-admission';

test.each([
  'Ingat ya, PIN ATM aku 482913.',
  'my pin: 1234',
  'cvv 123',
  'Please remember my credit card number: 4111 1111 1111 1111.',
  'no rek BCA 1234567890',
  'nomor rekening mandiri 123-456-7890',
  'my Gmail password is hunter2Secret!',
])('%s is credential material that never enters memory', (value) => {
  expect(containsMemoryCredential(value)).toBe(true);
});

test.each([
  'Remember my phone number is 0812 3456 7890',
  'debit 150000 rupiah',
  'I paid 2500000 with my credit card',
  'my order ID is 1234567890123',
  'I pinned the note 3 times',
  'My visa interview is on 15 November 2026',
])('%s stays rememberable', (value) => {
  expect(containsMemoryCredential(value)).toBe(false);
});

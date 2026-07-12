import test from 'node:test';
import assert from 'node:assert/strict';
import { amsterdamToUtc } from '../src/utils/time.js';

test('September kickoff is CEST (UTC+2)', () => {
  assert.equal(amsterdamToUtc('2026-09-24', '20:45'), '2026-09-24T18:45:00.000Z');
});

test('November kickoff is CET (UTC+1)', () => {
  assert.equal(amsterdamToUtc('2026-11-16', '20:45'), '2026-11-16T19:45:00.000Z');
});

test('DST switch day (25 Oct 2026) handled', () => {
  assert.equal(amsterdamToUtc('2026-10-24', '12:00'), '2026-10-24T10:00:00.000Z');
  assert.equal(amsterdamToUtc('2026-10-26', '12:00'), '2026-10-26T11:00:00.000Z');
});

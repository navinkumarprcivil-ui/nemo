import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { computeStreak, weekOf } from '../api/tank-streak.js';

test('the server derives consecutive upload weeks from verified timestamps', () => {
  const now = Date.parse('2026-08-17T12:00:00Z');
  assert.deepEqual(computeStreak({
    '2026-07-27': {entryId:'a'},
    '2026-08-03': {entryId:'b'},
    '2026-08-10': {entryId:'c'},
  }, now), {current:3,best:3,lastWeek:'2026-08-10'});
});

test('a week is named by its Monday and turns over at midnight in India', () => {
  // A Sunday belongs to the week that began the previous Monday.
  assert.equal(weekOf(Date.parse('2026-08-16T12:00:00Z')), '2026-08-10');
  // 18:30 UTC is midnight IST, which is where one week ends and the next begins.
  assert.equal(weekOf(Date.parse('2026-08-16T18:29:59Z')), '2026-08-10');
  assert.equal(weekOf(Date.parse('2026-08-16T18:30:00Z')), '2026-08-17');
});

test('an old verified upload remains in best but no longer counts as current', () => {
  const now = Date.parse('2026-08-17T12:00:00Z');
  assert.deepEqual(computeStreak({
    '2026-07-06': {},
    '2026-07-13': {},
    '2026-07-20': {},
  }, now), {current:0,best:3,lastWeek:'2026-07-20'});
});

test('the server and the app agree on what a week is', () => {
  /* totmWeekOf in app.jsx and weekOf here must not drift: one writes the key the other reads. */
  const src = readFileSync(new URL('../app.jsx', import.meta.url), 'utf8');
  assert.match(src, /const dow=\(d\.getUTCDay\(\)\+6\)%7;/);
});

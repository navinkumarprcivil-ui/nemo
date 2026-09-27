import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.jsx', import.meta.url), 'utf8');

/* The body of clearAllCaches, which is what the admin's Clear Cache & Reload button runs.
   Slicing it out keeps these assertions from being satisfied by an IDB call somewhere else
   in the file — mediaDel deletes one key and would otherwise pass for all of this. */
function clearAllCachesBody(){
  const at = app.indexOf('async function clearAllCaches(){');
  assert.ok(at > -1, 'clearAllCaches not found');
  const end = app.indexOf('\n}', at);
  assert.ok(end > at, 'clearAllCaches end not found');
  return app.slice(at, end);
}

test('clearAllCaches clears the IndexedDB media store, not just localStorage', () => {
  const body = clearAllCachesBody();

  /* The whole point. Cached images live in IndexedDB (mediaSet writes there whenever
     HAS_IDB, and localStorage only as the fallback), so a clear that scans localStorage
     alone reports "0 images" and leaves every photo on the device. That was the bug: the
     one thing the button exists for — an old product photo still showing — was the one
     thing it could not do. */
  assert.match(body, /IDB\.keys\(\)/, 'must enumerate the IndexedDB media store');
  assert.match(body, /IDB\.del\(/, 'must delete the keys it finds');
});

test('the IndexedDB sweep is filtered by prefix and counted as media', () => {
  const body = clearAllCachesBody();
  const at = body.indexOf('IDB.keys()');

  /* Filtered, not wiped: the store is this app's, but deleting every key in it would also
     take anything a later change puts there. MEDIA_PREFIX is the same list step 2 uses on
     localStorage, so the two halves cannot drift apart. */
  const after = body.slice(at);
  assert.match(after, /MEDIA_PREFIX\.some/, 'must reuse MEDIA_PREFIX rather than wiping the store');
  assert.match(after, /report\.media\+\+/, 'cleared images must reach the count the button reports');
});

test('MEDIA_PREFIX is declared before both sweeps use it', () => {
  const body = clearAllCachesBody();
  const decl = body.indexOf('const MEDIA_PREFIX=');
  assert.ok(decl > -1, 'MEDIA_PREFIX not declared in clearAllCaches');
  assert.ok(decl < body.indexOf('IDB.keys()'), 'MEDIA_PREFIX must be in scope for the IndexedDB sweep');
  /* Declared at function scope rather than inside step 2's try block — if it is ever moved
     back in there, the IndexedDB sweep throws a ReferenceError that its own catch swallows,
     and the button silently regresses to exactly the bug this file exists to prevent. */
  const step2 = body.indexOf('const doomed=[];');
  assert.ok(decl < step2, 'MEDIA_PREFIX must be declared outside the localStorage try block');
});

/**
 * The offline notice belongs at the bottom of the screen.
 *
 * It shipped pinned to the top three times, shrinking on each pass — 12px of type in 9px of
 * padding, then 11px in 5px — and the complaint never changed, because the size was never the
 * problem. `position:fixed; top:0` overlays the header at any height, so every revision was a
 * smaller rectangle covering the same coin balance and avatar. In the installed app it is worse:
 * edge-to-edge means the notice also has to pad past the status bar.
 *
 * These pin the shape of the fix rather than its pixel values, so the notice can be restyled
 * freely but cannot drift back to the top.
 */
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const app = readFileSync(new URL('../app.jsx', import.meta.url), 'utf8');

function offlineBarSource() {
  const start = app.indexOf('function OfflineBar()');
  assert.ok(start > 0, 'OfflineBar is gone — this whole file needs rewriting, not deleting');
  const end = app.indexOf('\n}\n', start);
  return app.slice(start, end);
}

test('the offline notice renders through the pill class, not inline top positioning', () => {
  const src = offlineBarSource();
  assert.match(src, /className="offline-pill"/);
  // The regression being guarded: any top anchoring at all, inline or otherwise.
  assert.doesNotMatch(src, /top:\s*0/);
  assert.doesNotMatch(src, /safe-area-inset-top/);
  // It must stay announced to a screen reader without stealing focus.
  assert.match(src, /role="status"/);
  assert.match(src, /aria-live="polite"/);
});

test('the pill is anchored to the bottom and clears the nav, the cart bar and the taps', () => {
  const css = app.slice(app.indexOf('.offline-pill{'));
  const rule = css.slice(0, css.indexOf('}') + 1);
  assert.match(rule, /position:fixed/);
  assert.match(rule, /bottom:calc\(env\(safe-area-inset-bottom, 0px\) \+ 78px\)/);
  assert.doesNotMatch(rule, /top:/);
  /* Without this the pill eats taps on whatever it floats over — a worse bug than the one it
     was introduced to fix, and an invisible one. */
  assert.match(rule, /pointer-events:none/);
  // Steps over the Add-to-cart bar rather than landing on it.
  assert.match(app, /body:has\(\.floating-cart-bar\) \.offline-pill\{bottom:calc\(env\(safe-area-inset-bottom, 0px\) \+ 134px\);?\}/);
  /* Both widths that hide .mobile-bottom-nav must bring the pill back down; a pill hovering
     78px up a desktop window with no nav under it reads as a rendering fault. */
  assert.match(app, /@media\(min-width:1000px\)\{\.offline-pill\{bottom:calc\(env\(safe-area-inset-bottom, 0px\) \+ 18px\);?\}\}/);
});

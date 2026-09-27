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

/* The app's own stylesheet, which is the only one whose rules read --safe-b. Slicing it out
   keeps these assertions from being satisfied by an identical line in one of the generated
   documents (the invoice, the bill) that carry their own <style>. */
function stylesBlock(){
  const at = app.indexOf('const STYLES = `');
  assert.ok(at > -1, 'STYLES not found');
  const end = app.indexOf('`;', at + 16);
  assert.ok(end > at, 'STYLES end not found');
  return app.slice(at, end);
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
  assert.match(rule, /bottom:calc\(var\(--safe-b\) \+ 78px\)/);
  assert.doesNotMatch(rule, /top:/);
  /* Without this the pill eats taps on whatever it floats over — a worse bug than the one it
     was introduced to fix, and an invisible one. */
  assert.match(rule, /pointer-events:none/);
  // Steps over the Add-to-cart bar rather than landing on it.
  assert.match(app, /body:has\(\.floating-cart-bar\) \.offline-pill\{bottom:calc\(var\(--safe-b\) \+ 134px\);?\}/);
  /* Both widths that hide .mobile-bottom-nav must bring the pill back down; a pill hovering
     78px up a desktop window with no nav under it reads as a rendering fault. */
  assert.match(app, /@media\(min-width:1000px\)\{\.offline-pill\{bottom:calc\(var\(--safe-b\) \+ 18px\);?\}\}/);
});

/* The Android app is edge-to-edge by design, so the WebView is not padded and the CSS
   environment variable for the bottom inset is correctly zero there. Everything anchored to the
   bottom therefore has to read --safe-b, which folds in the value MainActivity injects. A raw
   env() call anywhere else is the bug: it works in a browser and silently sits under the
   navigation buttons in the installed app. */
test('every bottom-anchored rule reads --safe-b, not the raw environment variable', () => {
  /* Inside STYLES, not merely somewhere in the file. This assertion used to search the whole
     source, so it went on passing when c240efb put the definition in the invoice document's
     own <style> — a separate page that reads it nowhere. Every rule here then referenced an
     undefined property, and an undefined custom property invalidates the whole declaration
     rather than falling back: the floating cart bar lost its bottom offset and drew at the top
     of the screen, and the mini-cart's padding shorthand collapsed to zero on all four sides.
     Nothing errored, no test failed, and it shipped. */
  const styles = stylesBlock();
  assert.match(styles, /:root\{--safe-b:max\(env\(safe-area-inset-bottom, 0px\), var\(--nemo-nav-inset, 0px\)\);\}/);
  // And it must come before the first rule that reads it, or the cascade never sees a value.
  assert.ok(styles.indexOf('--safe-b:max(') < styles.indexOf('var(--safe-b)'),
    'the definition must precede its first use inside STYLES');
  // Defined once, in one place.
  assert.equal((app.match(/--safe-b:max\(/g) || []).length, 1);
  // Exactly one raw call survives, inside that definition.
  const raw = app.match(/env\(safe-area-inset-bottom[^)]*\)/g) || [];
  assert.equal(raw.length, 1, 'raw bottom env() calls outside the :root definition: ' + (raw.length - 1));
  // The definition must not be self-referential.
  assert.doesNotMatch(app, /--safe-b:max\(var\(--safe-b\)/);
});

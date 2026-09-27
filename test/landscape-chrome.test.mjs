import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.jsx', import.meta.url), 'utf8');

/* A phone on its side is about 390px tall. At 873px wide it also gets the tablet layout, so
   .desk-nav pins itself at the top and .shop-bar pins under it at top:0 — roughly 230px of
   chrome, more than the products got. Only one of the two can stay pinned on a screen that
   short, and it has to be the one carrying navigation. */
test('the Shop bar stops being sticky on a short landscape viewport', () => {
  const block = app.match(
    /@media\(orientation:landscape\) and \(max-height:620px\)\{[^}]*(?:\}[^@]*?)*?\n\}/
  );
  assert.ok(block, 'the short-viewport landscape media query is gone');
  assert.match(block[0], /\.shop-bar\{position:static !important;\}/);
});

/* The Shop bar is only worth unpinning because something else stays pinned. If the top nav
   ever stops being sticky, unpinning the Shop bar leaves the page with no fixed way out. */
test('the top nav bar is still sticky, since it is what the Shop bar gives way to', () => {
  const nav = app.match(/<div className="desk-nav"[^>]*>/);
  assert.ok(nav, '.desk-nav element not found');
  assert.match(nav[0], /position:"sticky"/);
});

/* Portrait is untouched: the bar is pinned there and should stay pinned, because a portrait
   viewport has the height to spare and the pills are how customers switch category. */
test('the Shop bar is still sticky by default', () => {
  const bar = app.match(/<div className="vh-head shop-bar"[^>]*>/);
  assert.ok(bar, '.shop-bar element not found');
  assert.match(bar[0], /position:"sticky"/);
  assert.match(bar[0], /top:0/);
});

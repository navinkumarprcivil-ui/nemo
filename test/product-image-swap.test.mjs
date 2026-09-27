import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const app = readFileSync(new URL('../app.jsx', import.meta.url), 'utf8');

test('a changed photo mounts a fresh element instead of repainting the old one', () => {
  const block = app.slice(app.indexOf('function SmoothImg('), app.indexOf('function Toast('));
  /* Reusing one <img> across products means the browser keeps painting the previous bitmap
     until the new src decodes, and data-loaded — set imperatively — is still "1", so the
     element never fades from nothing. Opening a product from "Goes well with" showed the
     photo of the product you came from. */
  assert.match(block, /<img key=\{src\}/);
  assert.match(block, /data-loaded/);
});

test('the fade starts from invisible, so a fresh element cannot flash', () => {
  assert.match(app, /img\.smooth-img\{opacity:0;/);
  assert.match(app, /img\.smooth-img\[data-loaded="1"\]\{opacity:1;\}/);
});

test('both photo surfaces go through SmoothImg, so neither can regress alone', () => {
  assert.equal((app.match(/<SmoothImg /g) || []).length, 2); // catalogue card, product hero
  const from = app.indexOf('{/* Hero media gallery */}');
  const hero = app.slice(from, app.indexOf('{/* Content */}', from));
  assert.match(hero, /<SmoothImg src=\{s\.src\}/);
  assert.doesNotMatch(hero, /<img /); // a raw <img> here would bring the carry-over back
});

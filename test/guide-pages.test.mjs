/**
 * The care guides, where a search engine can reach them.
 *
 * The guides were written, published and invisible: page==="guides" inside the single-page app,
 * with no URL, no server-rendered HTML and no sitemap entry. These pin the three things that
 * decide whether that stays fixed.
 */
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  guideBodyHtml, guidePage, guidesIndexPage, sitemapXml, isSampleGuideRecord, BASE,
} from '../lib/catalog.mjs';

const cat = { products: [], slugMap: {}, STORE: 'Nemo Aqua Store', AREAS: 'Salem', WA: '919360921030' };

const guide = {
  id: 'ga1', title: 'Feeding a Betta', category: 'Fish Care', hasImg: false,
  content: 'Bettas eat little and often.\n\n• 2–3 pellets, twice a day\n• Fast one day a week\n\n1. Soak the pellets\n2. Drop them in\n',
};
const gcat = { guides: [guide], slugMap: { ga1: 'feeding-a-betta' }, bySlug: { 'feeding-a-betta': guide } };

test('a guide body becomes real markup, not one run-on paragraph', () => {
  const html = guideBodyHtml(guide.content);
  assert.match(html, /<p>Bettas eat little and often\.<\/p>/);
  // Runs of one kind collapse into a single list rather than one list per line.
  assert.equal((html.match(/<ul>/g) || []).length, 1);
  assert.equal((html.match(/<ol>/g) || []).length, 1);
  assert.match(html, /<ul><li>2–3 pellets, twice a day<\/li><li>Fast one day a week<\/li><\/ul>/);
  assert.match(html, /<ol><li>Soak the pellets<\/li><li>Drop them in<\/li><\/ol>/);
});

test('a line the parser does not recognise is kept, not dropped', () => {
  // The store's own words are never worth losing to a formatting rule.
  assert.match(guideBodyHtml('Just a sentence.'), /<p>Just a sentence\.<\/p>/);
  assert.equal(guideBodyHtml(''), '');
});

test('guide markup escapes what the admin typed', () => {
  const html = guideBodyHtml('• <script>alert(1)</script>');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('a guide page carries the canonical, the crumb and Article schema', () => {
  const html = guidePage(guide, gcat, cat);
  assert.match(html, new RegExp(`<link rel="canonical" href="${BASE}/guide/feeding-a-betta"`));
  assert.match(html, /"@type":"Article"/);
  assert.match(html, /"@type":"BreadcrumbList"/);
  // HowTo would be the richer claim, and wrong: these mix steps with standing advice.
  assert.doesNotMatch(html, /"@type":"HowTo"/);
  assert.match(html, /index,follow/);
  assert.match(html, /href="\/\?guide=ga1"/); // back into the app, at the same guide
});

test('the index lists every guide and says so in schema', () => {
  const html = guidesIndexPage(gcat, cat);
  assert.match(html, /"@type":"ItemList"/);
  assert.match(html, /href="\/guide\/feeding-a-betta"/);
  assert.match(html, new RegExp(`<link rel="canonical" href="${BASE}/guide/"`));
});

test('the sitemap carries guides, and omits the index when there are none', () => {
  const withGuides = sitemapXml(cat, gcat);
  assert.match(withGuides, new RegExp(`<loc>${BASE}/guide/</loc>`));
  assert.match(withGuides, new RegExp(`<loc>${BASE}/guide/feeding-a-betta</loc>`));

  // An index promising care advice and showing none is a thin page.
  const empty = sitemapXml(cat, { guides: [], slugMap: {}, bySlug: {} });
  assert.doesNotMatch(empty, /\/guide\//);
  // Called the old way it must still render the products half.
  assert.match(sitemapXml(cat), new RegExp(`<loc>${BASE}/p/</loc>`));
});

test('the sitemap lists the two standing pages that were never in it', () => {
  const xml = sitemapXml(cat, gcat);
  assert.match(xml, /privacy\.html/);
  assert.match(xml, /delete-account\.html/);
});

test('the built-in sample guides are never published to Google', () => {
  // They are placeholder copy shipped with the app, not the store's writing.
  assert.ok(isSampleGuideRecord({ id: 'x', title: 'Anything', sample: true }));
  assert.ok(isSampleGuideRecord({ id: 'g1', title: 'Betta Fish Care Basics' }));
  // A real guide that merely reuses a sample id is the store's own and must survive.
  assert.ok(!isSampleGuideRecord({ id: 'g1', title: 'Our Betta Routine' }));
  assert.ok(!isSampleGuideRecord(guide));
});

test('the Worker serves /guide before it falls through to the app shell', () => {
  const worker = readFileSync(new URL('../cloudflare/worker.js', import.meta.url), 'utf8');
  assert.match(worker, /path === '\/guide' \|\| path\.startsWith\('\/guide\/'\)/);
  assert.ok(worker.indexOf("path.startsWith('/guide/')") < worker.indexOf("path === '/p' ||"));
});

test('the app opens the guide a /guide/<slug> reader was already reading', () => {
  const app = readFileSync(new URL('../app.jsx', import.meta.url), 'utf8');
  assert.match(app, /get\("guide"\)/);
  assert.match(app, /initialOpenId=\{guideOpenId\}/);
  assert.match(app, /useState\(initialOpenId\|\|null\)/);
});

/* The bug these two pin cost the live sitemap its guide URLs for an hour.
   loadGuides collapsed a failed READ and a genuinely empty node into the same `[]`, so one
   blip was cached as "this store has no guides" — and Google reads a missing URL as a
   deletion, not as an outage. */
test('loadGuides throws on a failed read instead of reporting an empty library', () => {
  const src = readFileSync(new URL('../lib/catalog.mjs', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export async function loadGuides'));
  const fn = body.slice(0, body.indexOf('\n}\n') + 3);
  assert.match(fn, /if \(!res\.ok\) throw new Error/);
  // No catch-to-null anywhere in the function: that is precisely what hid the failure.
  assert.doesNotMatch(fn, /catch\(\s*\(\)\s*=>\s*null\s*\)/);
  assert.doesNotMatch(fn, /\.catch\(\s*\(\)\s*=>\s*null\s*\)/);
});

test('a sitemap that lost its guides is cached for minutes, not an hour', () => {
  const src = readFileSync(new URL('../api/sitemap.js', import.meta.url), 'utf8');
  assert.match(src, /const ok = gcat !== null;/);
  assert.match(src, /s-maxage=3600, stale-while-revalidate=86400/);
  assert.match(src, /s-maxage=300/);
  // The long TTL must be the OK branch, never the fallback.
  assert.ok(src.indexOf('s-maxage=3600') < src.indexOf('s-maxage=300'));
});

/* Fourteen guides sat in the database while the website said "New guides are on the way" and
   the sitemap listed none of them. They were not samples and nothing had failed: loadGuides
   required a non-empty `content`, and this store writes its guides as posters — content is ""
   and hasImg is true. The filter that was added to let Google reach the care guides was the
   thing keeping Google away from them. */
test('a guide whose body is a poster is published, not filtered out', () => {
  const src = readFileSync(new URL('../lib/catalog.mjs', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export async function loadGuides'));
  const filter = body.slice(0, body.indexOf('isSampleGuideRecord'));
  assert.match(filter, /String\(g\.content \|\| ''\)\.trim\(\) \|\| g\.hasImg/);
});

/* The page has to be worth the URL it is listed under. A poster guide carries its title as the
   image's alt text and as the h1, so it is a real page rather than an empty frame. */
test('an image-only guide still renders a titled page with its poster', () => {
  const g = { id: 'gimg1', title: 'The Basic Needs of Bettas', category: 'Fish Care', content: '', hasImg: true };
  const gcat = { guides: [g], slugMap: { gimg1: 'the-basic-needs-of-bettas' }, bySlug: {} };
  const html = guidePage(g, gcat, cat);
  assert.match(html, /<h1>The Basic Needs of Bettas<\/h1>/);
  assert.match(html, /alt="The Basic Needs of Bettas"/);
  // The description degrades to the title plus the store, never to a bare dash.
  assert.match(html, /<meta name="description" content="The Basic Needs of Bettas — a care guide from/);
  assert.match(html, new RegExp(`<link rel="canonical" href="${BASE}/guide/the-basic-needs-of-bettas"`));
});

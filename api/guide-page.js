/**
 * /guide and /guide/<slug> — the care guides, where a search engine can reach them.
 *
 * The guides were written, published and then invisible. They live at `page==="guides"` inside
 * the single-page app: no URL of their own, no server-rendered HTML, no sitemap entry. Someone
 * searching "how often to feed a betta" could not be shown an answer this store had already
 * written, and that is the traffic a small shop can actually win — a product page competes with
 * every other shop selling the same product; a care guide competes on the writing.
 *
 * Same shape as `api/product-page.js` and for the same reasons: read the guides when the request
 * arrives, render, cache at the edge. Nothing to regenerate, nothing to remember, and a deleted
 * guide leaves the sitemap on its own.
 */

import { loadCatalogue, loadGuides, guidePage, guidesIndexPage, guideNotFoundPage } from '../lib/catalog.mjs';

export default async function handler(req, res) {
  const slug = String((req.query && req.query.slug) || '').trim();

  let cat = null, gcat = null;
  try {
    // The catalogue is here for the store's name, service area and WhatsApp number, which every
    // page footer carries. loadGuides needs the settings loadCatalogue fetches anyway.
    [cat, gcat] = await Promise.all([loadCatalogue(), loadGuides()]);
  } catch (e) {
    // A slow database must not make the library look deleted. 503 with a retry tells a crawler
    // to come back rather than drop the URL.
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Retry-After', '120');
    return res.status(503).send(guideNotFoundPage());
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Guides change far less often than prices do, so they sit at the edge for an hour rather
  // than the products' ten minutes, and serve stale while they refresh.
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  if (!slug) return res.status(200).send(guidesIndexPage(gcat, cat));

  const guide = gcat.bySlug[slug];
  if (!guide) {
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    return res.status(404).send(guideNotFoundPage(cat.STORE));
  }

  return res.status(200).send(guidePage(guide, gcat, cat));
}

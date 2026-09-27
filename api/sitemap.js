/**
 * /sitemap.xml, built from the live catalogue.
 *
 * The committed sitemap.xml listed whatever products existed the last time
 * someone ran the generator, so a product listed since then was invisible to
 * Google and a deleted one kept an entry pointing at a 404. Reading the
 * catalogue per request means the file is correct without anyone maintaining
 * it. `vercel.json` rewrites /sitemap.xml here; robots.txt is unchanged.
 */

import { loadCatalogue, loadGuides, sitemapXml, BASE } from '../lib/catalog.mjs';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');

  try {
    /* Guides are fetched beside the catalogue rather than in their own pass: the sitemap is
       the only thing that knows about both, and a search engine asking for it should not pay
       for two round trips. A guides node that cannot be read yields an empty list, which costs
       the sitemap its guide entries for one hour — the products are still listed. */
    const [cat, gcat] = await Promise.all([loadCatalogue(), loadGuides().catch(() => null)]);
    // Search engines fetch this at most a few times a day; an hour at the edge
    // is plenty and still picks up a new product the same day it is listed.
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(sitemapXml(cat, gcat));
  } catch (e) {
    // Serving an empty sitemap would ask Google to forget the whole site, so a
    // database blip falls back to the two pages that are true regardless.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${BASE}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
<url><loc>${BASE}/p/</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>
</urlset>
`);
  }
}

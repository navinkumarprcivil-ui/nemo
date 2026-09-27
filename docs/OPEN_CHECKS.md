# Open checks — things that are done but not yet confirmed

Written 27 September 2026, at the end of the session that shipped version code 16 and the
`--safe-b` fix, and updated the same day when 16 went for production review. Everything here is **work that is already deployed**. What is missing in each case
is an observation that can only be made later, or on a device, or by Google — not more code.

Each item says what to look at, where, and what the answer should be. When one is settled, delete
it; when it is settled *wrongly*, the "if it is wrong" line says where the cause will be.

---

## Now — version 16 is at 100% in production

Promoted straight from internal testing on 27 September 2026, submitted as a 20% staged rollout,
cleared review the same day and **taken to 100% the same day**. Production had been on 14 (2.0.3)
since before the navigation-bar fix existed, so every device on it still had the bar over the system
buttons — which is the case for going fast, and is why the percentage went up quickly.

**What 100% changes.** The staged rollout was the safety margin, and it is spent. Halting now is
close to meaningless: it stops devices that have not yet fetched the update, but Play has already
offered 16 to everyone and takes nothing back from a device that installed it. **A problem found from
here is fixed by shipping version code 17**, built and uploaded fresh — a bundle that has been rolled
out can never be re-uploaded under the same version code.

**Still worth watching, days 1 to 3:** Play Console → **Quality → Android vitals → Crashes and
ANRs**, filtered to version code 16, and **Ratings and reviews**. A layout regression arrives in the
reviews, not in vitals, because a misplaced bar is not a crash.

**Read the first day's numbers loosely.** At 100% Play still distributes over several days — devices
update when they update — so day one is a thin sample and a single crash can look like a terrible
rate. Compare 16 against what 14 was doing over an equivalent window, not against a round number.

**Where the risk actually is:** `minSdk` is 24 and the inset handling has only ever run on API 33 to
36. `tappableElement()` is API 29+ and below that `WindowInsetsCompat` should fall back to
`systemBars()`. If 16 misbehaves anywhere, an old Android version is the first place to look, and a
review naming an old phone is the signal to start building 17 rather than to wait — see *API 24 to
28* below.

---

## Settled — 27 September 2026

**The WELCOME100 flash is gone.** Confirmed after `80346e2` with the day key cleared, so the popup
genuinely opened rather than being suppressed by its once-a-day guard — it showed the purple card
alone. The `ordersReady` gate holds.

That also closes the logcat check that never ran conclusively. It only ever existed because the
flash was first reported as a crash; it was a popup reading an empty `orders` list, there was
nothing in the log to find, and the symptom is now gone.

## Within a week — Search Console, issue #35

The care guides were invisible to Google until the sitemap started carrying them. `/guide/` plus
16 guide URLs are in `sitemap.xml`, the sitemap was resubmitted, and `/guide/` and
`/guide/the-nitrogen-cycle` were URL-inspected with indexing requested. The live test came back
*URL is available to Google / Page can be indexed*, and **Last crawl was N/A** — so the old empty
version was never indexed and there is no stale copy to overwrite.

**Check in about a week:** Search Console → **Pages**. The guide URLs should move from *Discovered –
currently not indexed* to *Indexed*.

**Check in two to three weeks:** Search Console → **Performance**, filtered on `/guide/`. Impressions
appearing at all is the result; position will be poor for a while and that is normal for new pages.

**Expected noise:** the six test guides (`9`, `10`, `11`, `12`, `test`, `fish-comp`) will probably
sit in *Crawled – currently not indexed*. They are thin, Google is right, and nothing needs doing —
the sitemap regenerates from the database, so deleting them from the admin drops them out on its own.

**The limit, stated plainly:** a guide whose content is a poster image cannot rank on words it does
not contain. Indexing is what was broken and what was fixed; ranking is a content question.

---

## Around 8 October — the Firebase reading

### The admin orders listener

Parked deliberately until the billing month rolls over and there is a real number to reason about.
See `docs/BANDWIDTH.md` for the routine.

**The design problem, which the parked plan does not solve:** orders are stored nested, at
`orders/<uid>/<id>`, and the admin listener flattens two levels. So `limitToLast(N)` on
`ref("orders")` would limit **customers**, not orders — a shop with 50 customers and 5,000 orders
would still download all 5,000. The intended one-liner is not a one-liner; it needs either a flat
index node written alongside each order, or a per-customer fan-out. Decide that with the quota
reading in hand, not before.

---

## No deadline

### Play's pre-launch report

Never read, for 15 or for 16. It runs on Google's own hardware after each upload and is free —
worth a look at least once, particularly the stability and accessibility tabs, before a version
goes to production again.

### Native debug symbols

Every upload draws: *This App Bundle contains native code, and you've not uploaded debug symbols.*
Advisory, and it only costs readable crash stacks in Play's console. The fix is a `release` block in
`app/build.gradle.kts`:

```kotlin
buildTypes { release { ndk { debugSymbolLevel = "SYMBOL_TABLE" } } }
```

Worth checking whether it actually yields usable symbols, since Gradle already reports it cannot
strip `libdatastore_shared_counter.so`.

### The status bar strip

The top edge still shows the window background against the page's white. Same underlying cause the
navigation bar had, other edge, not yet fixed. Also listed in `docs/ANDROID.md`.

### The six test guides

`9`, `10`, `11`, `12`, `test` and `fish-comp` are still live guides. Delete them from the admin when
convenient — the sitemap regenerates from the database, so they leave it on their own and no code
change is involved. Nothing breaks if they stay; they will simply sit in Google's *Crawled –
currently not indexed* bucket forever.

### API 24 to 28

`minSdk = 24`, and the inset fix has only been run on API 33 to 36. `tappableElement()` is API 29+;
below that `WindowInsetsCompat` should fall back to `systemBars()`. Should. That is reasoning, not a
test, and no device or emulator that old has been tried.

---

## Not open — do not restart these without a fresh request

Each of these was considered and dropped on purpose. They are listed so a later reader does not
mistake them for oversights.

- The Free Database Space prune.
- The three code gaps from the testers' report: the onboarding walkthrough, email sign-in, the FAQ.
- Padding the app to 20 MB.
- The narrow screenshot in `manifest.webmanifest`.

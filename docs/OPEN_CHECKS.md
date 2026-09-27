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

## Now — publish the rules that make orders undeletable

`database.rules.json` changed on 27 September 2026: the write rule on `orders/$uid/$oid` now starts
`auth != null && newData.exists() &&`, so **nobody can delete an order — not a customer, not the
admin, not a co-admin**. The same day Go Live — Clear Test Orders and Delete This Order were removed from
the admin, after real, paid, delivered orders from the gateway-testing period went missing from it.
Clean Up Old Orders came back at the owner's request, narrowed: finished orders only, a year old at
least, nothing open on them, backup downloaded first (`orderCleanupEligible` in `app.jsx`).

**Open decision, due by about September 2027.** Under these rules the database refuses the cleanup's
deletes too, and the button reports them as "refused by the database and kept". No order can
qualify until one is a year old, so nothing is lost by leaving this until then. At that point the
choice is either to keep the rules as they are and never clear orders, or to change the `$oid`
`.write` rule so an admin may delete an order only when it is Delivered or Cancelled and its
`paymentDeadline` is more than a year old. The owner makes that rules edit in the Firebase Console;
it was not made from the repo.

**The repo copy does nothing until it is published.** Firebase Console → Realtime Database →
**Rules** → paste the whole file → **Publish**.

**What the answer should be:** in the Rules tab, the `"$oid"` block's `.write` begins with
`auth != null && newData.exists() &&`. Placing an order, paying, and moving an order through
Confirmed → Shipped → Delivered all keep working, because each of those writes data rather than
removing it.

**If it is wrong:** an order that should not count is **Cancelled**, never deleted — cancelling
writes a status, so the rule allows it. If a future feature genuinely needs to remove an order, the
test `the database rules refuse to delete an order` in `test/admin-panel-layout.test.mjs` will fail
first; that is the point at which to decide, not after.

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

## Comes due on its own — not triggered by anything going wrong

The three items above this line are things that were done and need observing. These are different:
nothing is wrong with them, and nothing will look wrong until it is late.

### Play's target API level, roughly every August

Google raises the minimum `targetSdk` an app may ship once a year, with the deadline near the end of
August. Miss it and **you cannot publish an update at all** — existing installs keep working, but the
listing freezes until a bundle targeting the new level goes up. It is the one thing that forces an
Android release regardless of whether the app has a problem.

`targetSdk` is **36** (Android 16) as of version 16, which is current, so there is room. Do not
trust that sentence for the date: read **Play Console → Policy → App content**, or the target-API
requirement page, and get the real deadline from Google rather than from this file. A year is long
enough for the policy to move.

Budget more than a version bump. Each level lands real behaviour changes — 35 brought edge-to-edge
enforcement, which is the whole story in `docs/ANDROID.md` and cost ten attempts.

### The admin orders read, before roughly 5,000 orders

`loadOrders()` reads the whole `orders` node. It is fine at today's volume and it does not degrade
gracefully; it gets slower and more expensive in proportion to every order ever placed. See *The
admin orders listener* above for why the obvious fix does not fit the data shape.

### The photo routine, after each batch

Every product or guide photo added through Admin lives in the database as base64 until it is moved to
`assets/media/`. One is nothing; a batch is how the 2025 bandwidth problem started. The routine is in
`docs/BANDWIDTH.md` under *The routine that keeps it working* — run it after adding products, not
after noticing a bill.

### Where the upload key is

Not a check, a single point of failure worth knowing you have. Only the original upload key can
publish an update to `in.nemoaquastore.app`. Play App Signing means a lost key can be reset through
Google rather than ending the listing, but that is a support process measured in days. Confirm the
keystore and its passwords are backed up somewhere that is not just the one MacBook, and never in
this repository — `android-twa/README.md` lists what must stay out of git.

## Not open — do not restart these without a fresh request

Each of these was considered and dropped on purpose. They are listed so a later reader does not
mistake them for oversights.

- The Free Database Space prune — the button itself was removed on 27 September 2026, with Speed Up
  Catalog. The database keeps its copies of the 83 CDN photos.
- The three code gaps from the testers' report: the onboarding walkthrough, email sign-in, the FAQ.
- Padding the app to 20 MB.
- The narrow screenshot in `manifest.webmanifest`.

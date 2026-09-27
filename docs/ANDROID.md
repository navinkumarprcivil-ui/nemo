# The Android app — what is actually shipped

The Nemo Aqua Store app on Google Play (`in.nemoaquastore.app`) is a **Kotlin WebView
wrapper**, not a Trusted Web Activity. This document exists because that is easy to get
wrong: the repository also contains `android-twa/`, which is a *plan* for rebuilding the app
as a TWA and has never produced a shipped build. Read the distinction below before touching
either.

| | Shipped app | `android-twa/` |
|---|---|---|
| Kind | Kotlin WebView wrapper | Bubblewrap TWA config |
| Project | `~/AndroidStudioProjects/NemoAquaStore` (local only, **not in this repo**) | this folder |
| Build file | `app/build.gradle.kts` (Kotlin DSL) | `app/build.gradle` (Groovy, generated) |
| Launcher | `.MainActivity` | `…androidbrowserhelper.trusted.LauncherActivity` |
| Play version code | 12 (`2.0.1`), Sep 2026 | `1` / `1.0.0-backup` placeholder — never shipped |
| Renders with | Android System WebView | Chrome |

Both are signed for the same package, and `/.well-known/assetlinks.json` carries the two
SHA-256 fingerprints either would need.

## Why the distinction bites

A WebView is not Chrome. It advertises itself with `; wv` and `Version/4.0` in the
User-Agent, and payment SDKs read that as "this page cannot hand off to another app" —
because in a naive wrapper it cannot. Razorpay Checkout responds by **silently removing UPI**
from the payment list, leaving only cards, netbanking and wallets. Nothing errors; the option
is simply absent, and only on the app.

That is worth restating because of how it presents: identical site, identical account,
identical Razorpay configuration, UPI visible in the phone's browser and in the installed
PWA, missing only in the app.

## The two changes that fix it

Both live in the local Android project, so they are recorded here — losing that Mac would
otherwise lose them silently.

**1. `MainActivity.configureWebView()` — stop advertising as a WebView.**

The wrapper appended its own token to the default UA, keeping the WebView markers:

```kotlin
userAgentString = "$userAgentString NemoAquaStoreAndroid/2.0"   // before
```

```kotlin
userAgentString = userAgentString                               // after
    .replace("; wv", "")
    .replace(Regex("""Version/\d+(\.\d+)*\s+"""), "") +
        " NemoAquaStoreAndroid/2.0"
```

This is honest rather than a spoof: `handleUrl()` in the same file already launches both
`intent://` URLs (via `Intent.parseUri(…, URI_INTENT_SCHEME)`) and any other scheme (via
`openExternal`, an `ACTION_VIEW` intent). The app genuinely can hand off to a UPI app; only
the advertisement said otherwise.

Nothing on the website reads this string — `nemoInApp` comes from `display-mode: standalone`
(`index.html:522`) — so the Nemo suffix is kept only to keep the app identifiable in logs.

**2. `AndroidManifest.xml` — make UPI apps visible.**

```xml
<intent>
    <action android:name="android.intent.action.VIEW" />
    <data android:scheme="upi" />
</intent>
```

Razorpay hands off to a chosen app with an explicit `package=` in the `intent://` URL. On
Android 11+, `startActivity` into a package the app cannot *see* throws
`ActivityNotFoundException` regardless of whether that app is installed. Without this entry
UPI appears and then fails at the hand-off with "No compatible app found" — a worse failure
than not offering it, because it happens mid-payment.

## Where the app actually is on Play

**Production has never been active.** The two version codes that were actually released, 11
and 12, sit on the *closed testing* track only, so no ordinary Play user has ever installed this app — every customer
ordering today came through the website. Production is gated behind Google's closed-testing
requirement for personal developer accounts: at least 12 testers opted in continuously for
14 days, then an application.

| Version code | Name | Date | Track | Carries the UPI fixes |
|---|---|---|---|---|
| 11 | `2.0.0` | Aug 2026 | Closed testing | no |
| 12 | `2.0.1` | Sep 2026 | Closed testing | yes — **verified at checkout on a Play-signed install** |
| 13 | `2.0.2` | Sep 2026 | Closed testing — live 7 Sep 2026 | yes, plus push notifications and the sign-in retry |

**Until version code 13 is installed, no notification of any kind can arrive.** That gate is
now open — 13 reached closed testing on 7 Sep 2026, and the first real notification, a new care
guide, was delivered the same day. It is recorded because of how it was found: the build sat
unuploaded for a release while the server half was debugged against a phone that could not
receive anything — so if notifications are silent, check the installed version code first, not
the code. Every sender
in `api/cron-push.js` — shipped, delivered, back in stock, weekly tank care, new care guide —
ends at `notifyUser()`, which reads `pushTokens/<uid>` and does nothing when it is empty. That
node is written only by `savePushToken()` in `app.jsx`, which runs only when the wrapper calls
`window.__nemoPushToken`, and only version code 13 calls it. The site has no web-push
subscription either — there is no `pushManager.subscribe` anywhere — so a browser is not a way
round it. A toggle switched on against a store running version 12 is a preference recorded and
nothing more, which is exactly what it looks like from the outside: silence.

That gap is the thing to notice: the two fixes below sat in the local working copy for a
release without ever being built into a bundle, because the version code was never bumped
off 11. UPI was fixed on the developer's own phone and broken for everyone else, and nothing
in the repository would have shown it — `versionCode` lives only on that Mac.

The production application has been refused twice with "Your app requires more testing to
access Google Play production". The third criterion reads *"14 more days starting from the
review date"*, so a refusal appears to restart the count rather than leave it standing —
applying early is not free, it costs another fortnight. Wait out the full window before
pressing **Apply for production**. Publishing further closed-testing releases during that
window is fine and resets nothing; it also gives the testers a reason to open the app, which
is what the requirement is really measuring.

### Installing a Play build over an Android Studio one

The update fails, and Play offers only its generic "check your connection" help. The cause is
signing: Play App Signing re-signs the uploaded bundle with the app signing key, while the
build installed from Android Studio carries the upload key, and Android refuses to update an
app whose signature does not match. Uninstall the developer build first, then install from the
testing link — it is a fresh install rather than an update, and every Play update after that
behaves normally. Uninstalling clears the WebView's data, so the customer is signed out and the
locally-stored tank profile is gone; orders, wallet and referral code live in Firebase and are
untouched.

## Building a release bundle

macOS ships no system Java, so Gradle stops with "Unable to locate a Java Runtime" until it
is pointed at the JDK inside Android Studio:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
./gradlew clean bundleRelease
```

The bundle lands at `app/build/outputs/bundle/release/app-release.aab`.

Use the Gradle task rather than *Build → Generate Signed App Bundle*. The menu dialog asks
for a keystore path and passwords of its own and ignores the `keystore.properties` signing
config the build file already defines — and that config is the one wired to the original
upload key. A different key cannot update the existing listing, and there is no way back
from that except a support request.

Two warnings are expected on every build and neither matters: `Unable to strip …
libdatastore_shared_counter.so` during the build, and Play's *no deobfuscation file* / *no
native debug symbols* notices on upload. The native library belongs to AndroidX, not to
this app.

### R8, and the two rules that keep the bridge alive

`buildTypes.release` sets `optimization { enable = true }` and points `proguardFiles` at
`proguard-android-optimize.txt` plus the app's own `app/proguard-rules.pro`. Turned on for
version code 14 on 16 September 2026, to clear Play's *App optimisation is below our
threshold* flag and its **Fix by Feb 2027** date.

It was off until then, deliberately, and the reason was `AndroidShareBridge`. Its three
`@JavascriptInterface` methods — `share`, `openWhatsApp`, `signInWithGoogle` — are never
called from Kotlin, only from JavaScript by name, through the object registered as
`NemoAndroid`. R8 therefore reads them as dead code and strips them, which breaks native
sharing and Google sign-in **in release builds only** — the worst shape a bug can take,
because a debug run looks perfect.

Two rules hold it open. The bridge is an *inner* class of `MainActivity`, so its real name
carries the `$`:

```proguard
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class in.nemoaquastore.app.MainActivity$AndroidShareBridge { *; }
```

What is deliberately **not** there is a package-wide `-keep class in.nemoaquastore.app.** { *; }`.
That builds, runs and passes every test — and leaves the obfuscation score exactly where it
started, which is the one thing Play was asking about.

**What it bought.** Uncompressed DEX went 14,262,792 → 2,425,624 bytes, the bundle 6.5 MB →
3.6 MB, and Play's *size for new installs* 5.8 MB → 1.6 MB. It also puts a real `mapping.txt`
in the bundle, so the *no deobfuscation file* upload warning is gone and crash reports
deobfuscate.

The 10 MB figure is why this mattered at all: Play enforces the DEX threshold only on bundles
carrying at least 10 MB of *uncompressed* DEX. Measure it, rather than reading the download
size, which is two to three times smaller:

```bash
unzip -l app-release.aab | grep -E '\.dex$' | awk '{sum+=$1} END {print sum}'
```

At 14.26 MB this app was over the line, so the deadline genuinely applied. It no longer does.

**Verified on a device, version code 14.** Google sign-in, UPI present in the Razorpay sheet,
a push notification arriving, native sharing and the WhatsApp hand-off — all on the
Play-signed build from the internal testing track.

One trap worth writing down. A release APK built locally is signed with the **upload**
keystore, and that certificate's SHA-1 is not registered with the OAuth client: Firebase holds
the debug certificate and Google's app-signing certificate, not that one. So Google sign-in
always fails on a locally installed release build, with *"No Google account is available on
this device"* — with R8 or without it. Do not read that as a keep-rule failure. Sign-in can
only be tested on a Play-signed build.

## What version code 13 added

Push notifications end to end, and the sign-in retry. All three items that had been pending are
now shipped and verified on a device.

**Firebase Cloud Messaging.** `firebase-messaging` in `app/build.gradle.kts` (no version — the
BOM supplies it), `POST_NOTIFICATIONS` and a `.NemoMessagingService` entry in the manifest, and
the service itself, which draws every notification. Messages are sent data-only precisely so
that it always runs — see the reasoning in `lib/push.mjs`.

`MainActivity` fetches the token once per launch, asks for the notification permission after the
first page has loaded (so the dialog appears over the store rather than a blank screen), and
hands the token to `window.__nemoPushToken`, which stores it under the signed-in uid. Tokens are
not listened for: a rotated one reaches the site the next time the app opens, and the server
drops the dead one the first time FCM rejects it.

### Two things cost far more than the code did

**The injection has to wait for the page.** `index.html` runs `fetch("app.js").then(…)`, so the
bundle is evaluated well after `onPageFinished` fires. Injecting once found no hook and did
nothing at all. `deliverPushToken()` now polls every 250 ms for fifteen seconds — the same shape
as the Google sign-in injection directly above it in the file.

**`database.rules.json` is not deployed by anything.** The repo copy is a record; the live rules
only change when someone pastes them into the Firebase Console and presses Publish. The root is
`".write": false`, so a node with no rule is denied — and `savePushToken()` in `app.jsx` ends in
`.catch(()=>{})`, so the rejection left no trace anywhere. It looked identical to the token never
arriving, and cost an hour of looking at the wrong half of the system.

### The care-guide switch needed a rule too

The bell on the Care Guides page promised "tell me when there's a new guide" and nothing ever
sent one: the preference lived in `localStorage` and was read by a single guard in
`sendLocalNotif` that no caller ever triggered. It now writes `guideSubs/<uid>`, and the cron
sends through FCM like every other notification.

**That means another manual Console publish.** `database.rules.json` gained a `guideSubs` node;
until it is pasted into the Firebase Console and published, the root `".write": false` denies
the subscription write and the switch is dead again — with the same silent failure mode that
cost an hour last time. **The switch now says so on screen** — a refused write shows
"Saved. Couldn't subscribe you on the server." under the bell, and the write also logs
`nemo-push: guideSubs write rejected`. So the state of the rule can be read off the phone: turn
the bell on in Care Guides, and that note appearing means the rule is not published.

Two lessons worth keeping. A silent catch on a write is expensive every single time it fires;
that one is worth replacing with a `console.warn`. And when a chain has five links and no
output, make the app say what it sees rather than reasoning about which link broke — the
`nemo-push:` lines in Logcat (token length, injection target, whether the hook answered) are
kept for that reason, and a temporary probe that wrote the row itself, uncaught, is what finally
printed `PERMISSION_DENIED`.

### Google sign-in

`getGoogleCredential()` retries once after 700 ms on `NoCredentialException`. That exception
means Play services has not finished populating the account list, not that no account exists,
which is exactly why the second tap always worked. Cancelling throws
`GetCredentialCancellationException`, a different type, so the retry can never re-prompt someone
who dismissed the picker deliberately. Customers no longer see Java class names; the exception
goes to Logcat under `NemoAuth` instead.

### Edge-to-edge is not settled — and the earlier note here was wrong

Release 13 drew two flags: *Edge-to-edge may not display for all users* and *deprecated APIs or
parameters for edge-to-edge*. This section used to say both were closed by bumping Material
1.10.0 → 1.14.0 in `gradle/libs.versions.toml`. **Release 14 shipped that bump and Play raised
both flags again, against 14.** The bump was not the fix; do not assume a dependency version
closed a Play flag until a release carrying it comes back clean.

What is actually true of each half:

**The display half is handled, but only where a customer can see it.** `viewport-fit=cover` in
`index.html` makes the `env(safe-area-inset-*)` values real and `app.jsx` spends them on the
header, the bottom nav, the floating cart bar and every bottom sheet. Checked on an Android 15
phone against version code 14 — header and camera cutout, bottom nav against the gesture pill,
the floating cart bar, a bottom sheet, and landscape: nothing clipped, nothing hidden. Play
cannot see any of that.

**And the second wrong note: `enableEdgeToEdge()` is already there.** This section used to say
the flag would keep returning until `MainActivity` called it. It has called it since before
release 14 — `MainActivity.kt:120`, imported at line 24 — so release 14 both calls it and is
flagged for it. Adding the call is not the fix either, because there is nothing to add.

**Both halves are one problem, and it is a pinned version.** `mapping.txt` for release 14:

```
androidx.activity.EdgeToEdgeApi23 -> wk:
androidx.activity.EdgeToEdgeApi26 -> xk:
androidx.activity.EdgeToEdgeApi29 -> yk:
```

`wk`, `xk` and `yk` — the three classes Play names for the deprecated
`setStatusBarColor`/`setNavigationBarColor` calls — are **androidx.activity's own implementation
of `enableEdgeToEdge()`**. The deprecated calls are made by the library, on this app's behalf,
every time that one line runs. And `gradle/libs.versions.toml` pins
`activityKtx = "1.8.0"`, which is years old; the newer releases reworked exactly this code.

So the only lever for either flag is that version. The theme is not at fault and was checked:
`Theme.Material3.DayNight.NoActionBar` with no `statusBarColor`, no `navigationBarColor` and no
`windowOptOutEdgeToEdgeEnforcement`. `targetSdk` is 36.

Which is also why *may not display for all users* survives a build that does call
`enableEdgeToEdge()`: Play's static check does not recognise what 1.8.0 emits.

Pick the current stable androidx.activity at build time rather than a number written down here,
and — the rule this section exists to enforce — **the bump is a hypothesis until release 15
comes back clean.** A dependency bump made on a guess is how the wrong conclusion got into this
file twice.

How to redo the lookup on a later release, with the pattern that actually works — Play writes
`class.method`, so `wk.a` is method `a` of class `wk`, and grepping for a class *named* `wk.a`
finds nothing and looks like a clean bill of health:

```
grep -E ' -> (wk|xk|yk):$' app/build/outputs/mapping/release/mapping.txt
```

### One more flag on 14: bitmap decoding

*Improve your app's performance with bitmap image optimisation* — a manual
`BitmapFactory.decodeStream` in `al0.G`, fed by `HttpURLConnection.getInputStream` in `ag0.O`.

The mapping file settles this one too, and the answer is stranger than a library name:

```
_COROUTINE._BOUNDARY            -> al0:
kotlin.jvm.internal.TypeIntrinsics -> ag0:
```

Neither is a class that decodes anything. `_COROUTINE._BOUNDARY` is a synthetic marker Kotlin
inserts so a coroutine's stack trace can be reassembled across a suspension point, and
`TypeIntrinsics` is runtime plumbing for cast checks. Play is reporting **coroutine boundary
frames**, which is what a stack looks like when the decode happens inside somebody's `suspend`
function. So the call is real but the class names lead nowhere, and there is no file in this
project to open.

That matches the rest of the evidence: this app loads no bitmaps of its own, and a WebView
decodes images in native code without touching `BitmapFactory`. Leave it. An image-loading
library cannot be added to code this project does not own.

### Printing, and why sharing the PDF as a file is not possible

A WebView cannot open a `blob:` URL. It hands the URL to Android as an intent, no app claims
it, and the customer gets **"No compatible app found"** — which is what Quick Bill and Invoice
did in version 14. It also has no print support of its own: `window.print()` is a no-op inside
a WebView unless `PrintManager` is wired in on the native side.

Version 14's fix was web-side only. `openDocHTML()` in `app.jsx` checks for the bridge and,
inside the app, renders the document into `DocViewer` — a full-screen sandboxed iframe — instead
of opening a window. `sandbox="allow-scripts"` and nothing else: the invoice carries its own
fit-to-width script, and blocking it was what left the sheet's foot below the bottom of the
screen; without `allow-same-origin` the frame still keeps an opaque origin and can reach
nothing of the app. The header's **Share** button sends the itemised bill as text, because text
is the only thing a WebView can produce.

**Version 15 added printing, and saving as a PDF.** Both, from one change — Android's
system print dialog always lists *Save as PDF* as a destination alongside any real printer, so
`PrintManager` delivers the save for free. There is no separate PDF path to build, and no
reason to ship the print half without it.

Three things decide whether it works:

- **Print the document, not the app.** `DocViewer` is an iframe inside the main WebView, so
  `webView.createPrintDocumentAdapter()` on that WebView would print the store page around it.
  The bridge method should load the passed HTML into an off-screen `WebView`, wait for
  `onPageFinished`, and print *that* one. Hold a reference to it until the job ends or it is
  collected mid-job and the output comes out blank.
- **Ask for A4.** `PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4)`.
  The invoice stylesheet already carries `@page{size:A4;margin:12mm}` and a full `@media print`
  block, so the printed sheet is the A4 layout, not the phone reflow — the `@media(max-width:640px)`
  rules only apply on screen.
- **Feature-detect the bridge, don't assume it.** The website updates the moment it is deployed;
  the app updates whenever each customer's Play Store gets round to it. A Print button must
  appear only when `window.NemoAndroid.printDocument` actually exists, or every phone still on
  version 14 shows a button that does nothing.

Sketch of the native half:

```kotlin
@JavascriptInterface
fun printDocument(html: String, jobName: String) = runOnUiThread {
    val w = WebView(this)                      // keep a field reference: see above
    w.webViewClient = object : WebViewClient() {
        override fun onPageFinished(view: WebView, url: String) {
            val pm = getSystemService(Context.PRINT_SERVICE) as PrintManager
            pm.print(jobName, view.createPrintDocumentAdapter(jobName),
                PrintAttributes.Builder()
                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4).build())
        }
    }
    w.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
}
```

**Sharing the PDF as a file is not possible, and version 15 is where that was found out.** The
Share button should send the document rather than a description of it — text was never the intent,
only the one thing a WebView could produce. The obvious second method looked like this:

```kotlin
@JavascriptInterface
fun sharePdf(html: String, jobName: String)   // render → PDF in cacheDir → FileProvider → ACTION_SEND
```

Same off-screen `WebView` and the same `createPrintDocumentAdapter()`, but driven by hand rather
than handed to `PrintManager`: `onLayout(...)`, then `onWrite(...)` against a
`ParcelFileDescriptor` opened on a file in `cacheDir`.

**It does not compile, and the reason is structural rather than a detail to work around.**
`PrintDocumentAdapter.LayoutResultCallback` and `PrintDocumentAdapter.WriteResultCallback` have
**package-private constructors**. The print framework constructs them and hands them to an
adapter's `onLayout`/`onWrite`; application code was never meant to instantiate one, and Kotlin
says so outright:

```
Cannot access 'constructor(): PrintDocumentAdapter.LayoutResultCallback':
it is package-private in 'android/print/PrintDocumentAdapter.LayoutResultCallback'
```

Three ways round it were weighed and all three rejected:

- **A helper class declared in `package android.print`.** The widely-copied `PdfPrint` trick, and
  it does compile — same package, so the constructor is reachable. But a package-private member
  of a platform class is a non-SDK interface, and non-SDK access is blocked for apps targeting
  API 28 and above; this app targets 36. It would most likely throw at runtime, and a hidden API
  has no business in an app that takes payments.
- **`PrintedPdfDocument` plus `webView.draw(canvas)`.** Entirely public API, but it draws the
  *screen* rendering, so `@media print` never applies: the document's own controls would appear in
  the file and the fit transform would not be undone. It also depends on the WebView's CSS
  viewport, which follows device density, so the sheet can come out as the narrow phone layout.
- **Rendering the PDF in JavaScript.** Adds a rasterising library to a 1.3 MB bundle for a
  lower-quality result than the platform already gives away.

**What ships instead is `printDocument` alone.** Android's print dialog always lists *Save as PDF*
beside any real printer, and that route renders with **print media** — so it honours `@page` and
the `@media print` block, paginates properly, and produces a better sheet than anything the app
could draw for itself. The supported path is also the correct one. A customer who wants to send an
invoice saves it and shares the file. Do not attempt an in-app file-sharing method again without a
new platform API to build it on.

**The web half was already deployed.** `DocViewer` asks the bridge per method, not per version, and
renders each button only if its method is there — so nothing dead appeared on a phone still running
14, and Print lit up the moment 15 shipped:

| Bridge method | Button |
|---|---|
| `NemoAndroid.printDocument(html, jobName)` | **Print** — the dialog's own destination list carries *Save as PDF* |
| `NemoAndroid.sharePdf(html, jobName)` | never implemented, see above. The feature detection stays because it costs nothing; Share keeps the itemised text |

`printDocument` is handed the document's original HTML, not the phone-fitted copy `DocViewer`
displays, so the `@media print` block applies and the output is the A4 sheet with its controls
hidden.

## What version code 15 carries

Built 27 September 2026 as `versionCode = 15`, `versionName = "2.1.0"`. Release 14 drew three
recommended actions and no issue with a deadline, and only one of the three was this app's to
clear; the flag-clearing is the cheapest item below, not the reason for the release.

1. **`printDocument`, with Save as PDF.** The feature this release exists for. `MainActivity`
   gained one `@JavascriptInterface` method, a private `renderDocument()` helper and a
   `docWebView` field — see *Printing* above for the three things that decide whether it works,
   and for why the sharing half is not here. **Verified on a device before the bundle was built:**
   the Print button appears on Invoice, Quick Bill and the credit note; the preview is the document
   alone rather than the store page wrapped round it; and *Save as PDF* produces an A4 sheet at
   full width with the on-screen controls hidden.
2. **`activityKtx` 1.8.0 → 1.13.0.** The whole of the edge-to-edge work: the call is already in
   `MainActivity` and `mapping.txt` showed 1.8.0's own `EdgeToEdgeApi23/26/29` making the
   deprecated calls Play flags. A five-minor jump that needed nothing else moved with it —
   `coreKtx` 1.10.1, `appcompat` 1.6.1 and `material` 1.14.0 all stayed where they were.
   **Half proven since.** The bars were checked on an Android 14 emulator and are correct in both
   navigation modes — see *The edge-to-edge bump is no longer a hypothesis* below, which also
   records the navigation-bar overlap that check turned up. What is still unproven is Play's own
   report on 15 coming back without both edge-to-edge actions.
3. **A monochrome notification icon.** `res/drawable/ic_notification.xml`, a flat white fish
   silhouette, replacing `R.mipmap.ic_launcher` at `NemoMessagingService`. Android keeps only the
   alpha channel and tints the result, so the full-colour launcher icon was arriving as a
   shapeless blob. `.setColor(0xFF0EA5E9)` went in with it — the site's own primary — so a push
   reads as Nemo in the shade. A vector is safe here because `minSdk` is 24; on 21–23 it would
   have needed generated PNG densities instead.
4. **`android:usesCleartextTraffic="true"` removed.** The app only ever loads
   `https://www.nemoaquastore.in`. It was left in during the qualifying run because a third-party
   subresource over http would fail silently, and only in release. One trap: the attribute closed
   the `<application>` tag's attribute list, so the `>` had to move up to the line above rather
   than the line simply being deleted.
5. **`MainActivity.kt.bak` deleted.** It never compiled and could not affect the build, but it
   answered every `grep` alongside the real file and had already cost one round of confusion.

**The bitmap flag was left alone, deliberately.** `mapping.txt` resolves the two classes Play names
to `_COROUTINE._BOUNDARY` and `kotlin.jvm.internal.TypeIntrinsics` — Kotlin runtime artefacts, not
code that decodes anything — so the report is naming coroutine stack frames inside a dependency.
There is no file here to open and nothing to migrate. It carries no deadline.

**A FileProvider was added and then taken back out.** A `<provider>` naming
`androidx.core.content.FileProvider` and a `res/xml/file_paths.xml` with a `<cache-path>` went in
for `sharePdf`, and came out when that proved impossible. An app that takes payments should not
ship a component with nothing to serve. Both are two commands away if a platform API ever makes
sharing a file possible.

**Measured on the release bundle.** `app-release.aab` 3,648,204 bytes, against 14's 3.6 MB. (The
first 15 bundle was 3,653,297; the navigation-bar fix below took 5,659 bytes off it. The drop is
small because R8 keeps the disabled function's injected-JavaScript string literal — a `val` guard
is not a compile-time constant, so the body is not provably dead. Deleting it should reclaim the
rest.)
Uncompressed DEX 2,464,244 bytes, against Play's 10 MB threshold. `mapping.txt` carries
`in.nemoaquastore.app.MainActivity$AndroidShareBridge -> in.nemoaquastore.app.MainActivity$AndroidShareBridge:`
and `void printDocument(java.lang.String,java.lang.String) -> printDocument`, both unrenamed. That
is the check that matters: the method is only ever called from JavaScript by name, so R8 renaming
it would break the button in release builds only, which is the worst shape a bug can take.

**One warning left standing.** `MainActivity.kt:1005`, a deprecated `Task<String>` in the Firebase
messaging token call. Unrelated to anything in 15 and not touched.


### The navigation bar overlap, and the ten fixes that came before this one

Found on an Android 14 emulator in **3-button navigation**, which is the configuration nobody had
ever tested: the system's back/home/recents buttons were drawn on top of the store's own bottom
nav, with Home, Shop, Orders and Cart legible underneath them. Not a regression — the cause
predates 14 — but 3-button users had been seeing some version of it all along.

**Why it hid for so long.** The gesture pill is about 24dp tall and a 3-button bar about 48dp, so
the same missing inset reads as slightly tight padding in gesture mode and as a collision with
buttons. Every device used to check this app — the vivo I2301, the Pixel 9 AVD — runs gesture
navigation by default, and Android 15 and 16 besides.

**The cause.** `setOnApplyWindowInsetsListener` padded the root view by `systemBars.left/top/right`
and passed **0** for the bottom, deliberately: the comment says *"Bottom remains zero because Nemo
itself has its own bottom navigation menu."* That reasoning is wrong in one specific way. The web
layout can only place itself above the navigation bar if it knows how tall the bar is, and it
cannot: `env(safe-area-inset-bottom)` inside a WebView reports what the WebView was padded by, so
zero padding means zero inset, correctly. `viewport-fit=cover` is present and the app's nav already
asks for `calc(14px + env(safe-area-inset-bottom, 0px))` — the CSS was right all along and was
being told the truth about a WebView that genuinely was not under anything.

**What filled the gap.** `installNativeLayoutFix()` measured the inset natively, converted it to CSS
pixels, and injected roughly a thousand lines of JavaScript that searched the DOM **by text
content** — `textOf()`, `isVisible()` — to find the nav and lift it with `bottom: !important`.
Two things make that unable to work here. It runs only when insets change, while the store is a
React SPA whose re-renders discard the inline styles it sets; and it identifies elements by the
words inside them, so a renamed tab silently ends the fix.

Its own `cleanupLegacyFixes()` is the clearest evidence: it deletes the debris of
`nemo-native-layout-v6-style` through `v15-style`, plus `nemo-android-bottom-fix`,
`nemo-v11-product-cart-style`, `nemo-android-bottom-spacer`, `nemo-native-page-safe-space` and
several `data-nemo-*-lifted` attribute families. **Ten generations of this fix, each cleaning up
after the last.** A v15 entry in that list, inside a v15 build, is the whole story.

**The fix that shipped.** The root view is padded by the bar's height, the hack is off, and the
strip behind the buttons is painted white so it reads as part of the nav:

```kotlin
private val nativeLayoutFixEnabled = false      // new, immediately above the function

view.setBackgroundColor(android.graphics.Color.WHITE)
view.setPadding(systemBars.left, systemBars.top, systemBars.right, currentBottomInsetPx())
```

**The measurement is the part that matters.** `systemBars.bottom` is not reliable. On the vivo
I2301 it reports **0** during startup — as does `navigationBars()` — while `tappableElement()`
already holds the true 116px. A few seconds later all three agree. The original code read
`systemBars.bottom` once inside that early window, cached the zero, and never looked again, so the
page was told there was no bar at all for the life of the process:

```
sys=0   nav=0   tap=116  -> 42 css px
sys=116 nav=116 tap=116  -> 42 css px
```

`currentBottomInsetPx()` reads all three live on every call and takes the largest. Zero never wins
a `max`, so a device whose preferred type is not yet populated falls through to one that is. Both
Pixel AVDs populate `systemBars()` before the listener first runs, which is exactly why they were
never affected and why this survived every emulator check.

**Verified** on API 33, 34 and 36 AVDs in both gesture and 3-button navigation, and on the vivo
I2301 (API 35) in 3-button.

### What was tried first, and why it was abandoned

Two earlier approaches are worth recording, because both look better on paper than what shipped.

**Padding without the background.** The same `setPadding`, but leaving the root view's default
background. It ended the overlap everywhere, including the vivo — and exposed the window background
behind the buttons: a thin white line on the Pixels, a tall empty slab on the vivo. The slab is
what sent this down the next path.

**A CSS custom property.** Keep the WebView edge-to-edge, pad nothing, and hand the page the bar's
height so it offsets its own controls:

```css
:root{--safe-b:max(env(safe-area-inset-bottom, 0px), var(--nemo-nav-inset, 0px));}
```

All 18 bottom-anchored rules in `app.jsx` read `var(--safe-b)`, and **that part is still in place**
— it is correct in a browser and in the PWA, where the environment variable is the right answer and
the custom property is simply unset.

What could not be made to work was Android setting the property. Injecting it from the inset
listener does not survive a reload, because a reload builds a new `documentElement` while the insets
have not changed, and the store reloads itself whenever it sees a new build. Having the page pull it
through a `@JavascriptInterface` method fixed that on the AVDs. On the vivo it never worked: the
property was confirmed present on `documentElement` in DevTools, the bridge was confirmed being
called from the page, and forcing the injected value to an absurd **120px moved the layout not one
pixel**. The page was receiving the value and ignoring it, and after four rounds the cause was still
unknown.

That is why the native route won. It is blunter, it gives up drawing behind the bar, and it depends
on nothing the web layer has to honour.

A `private val` rather than a `const` for `nativeLayoutFixEnabled` is deliberate — Kotlin then does
not flag the body as unreachable, so it compiles without a warning. **The dead body should be
deleted**, but as its own change.

### Pushing to main deploys the live site

Established today, and contrary to the comment in `.github/workflows/deploy.yml` that says
*"nothing deploys on its own from a push"*. Build `v90.cb94647d` was served by
nemoaquastore.in while the newest run of that workflow was 47, carrying `v90.0845b31e`, and
`quality.yml` has no deploy step. Something outside GitHub Actions — most likely Cloudflare's Git
integration — builds and publishes `main` on every push. **The confirm box in the Actions tab is
not the only gate.** Not yet confirmed in the Cloudflare dashboard.


## Still open

- `FirebaseMessaging.getInstance().token` compiles with a deprecation warning. It works and is
  the documented way to fetch a registration token; revisit when the BOM next moves.
- The admin `loadOrders()` reads the whole `orders` node. Fine now; paginate before ~5,000
  orders.
- `installNativeLayoutFix()` is switched off but its body is still in the file — around a
  thousand lines of injected JavaScript that nothing calls into any more. Delete it, on its own,
  once a release has shipped with `nativeLayoutFixEnabled = false` and nobody has missed it.
- The status bar strip at the top shows the window background against the page's white. Same
  underlying cause as the navigation bar had, on the other edge, and not yet fixed.
- Nothing below API 33 has been looked at. `minSdk` is 24 and the fix is structural rather than
  version-dependent — but that is reasoning, not a test.
- Why the vivo's WebView ignored `--nemo-nav-inset` is still unknown. It does not matter while the
  padding is native, but it would matter again if anyone moves the offset back into CSS.
- `chrome://inspect` reaches the WebView in a debug build with no code at all: WebView enables
  content debugging automatically for a debuggable application. Worth remembering before adding
  `setWebContentsDebuggingEnabled` — it is not needed, and in a release build it should not be there.

Cleared in 15: the cleartext-traffic attribute, and the notification's small icon.

## If the app is ever migrated to a TWA

`android-twa/` holds the configuration for it and the asset links are already live, so the
groundwork exists. A TWA runs real Chrome, which removes this class of problem entirely — no
UA handling, no package-visibility declarations, every payment method behaving as it does in
the browser.

The cost is that `MainActivity` carries behaviour a TWA would need re-homed: the
`NemoAndroid` JavaScript bridge for native sharing and Google sign-in, WhatsApp Business
preference on `whatsapp:` links, and install-banner suppression. Verify each before
switching, and ship as the next version code with the **same upload key** — a different key
cannot update the existing Play listing.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname,join } from "node:path";
import { fileURLToPath } from "node:url";

const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const src=readFileSync(join(root,"app.jsx"),"utf8");
const tank=src.slice(src.indexOf("function TankShowcaseSection("),src.indexOf("function TestimonialsSection("));
const rules=JSON.parse(readFileSync(join(root,"database.rules.json"),"utf8")).rules;

test("customer tank picker can select the same image again",()=>{
  assert.match(tank,/const chosen=Array\.from\(e\.target\.files\|\|\[\]\);e\.target\.value=""/);
});

test("failed upload keeps the preview and always releases the button",()=>{
  assert.match(tank,/if\(!uploaded\) throw new Error\("tank-upload-failed"\)/);
  assert.match(tank,/Your photo is still here/);
  assert.match(tank,/finally\{\s*setUploading\(false\)/);
});

test("customer tank upload uses the bounded Firebase image compressor",()=>{
  /* The budget is set by what the gallery draws and what the free plan's download allowance can
     carry, not by the largest value the rules happen to accept. A gallery card is a few hundred
     pixels wide, so 70,000 characters is about 50 KB and still sharper than the card. */
  assert.match(src,/const MAX_TANK_IMAGE_CHARS=70000/);
  assert.match(tank,/compressTankImage\(f\)/);
});

test("the public gallery is capped, and ranked before it is capped",()=>{
  /* Without a ceiling a good week puts every live tank on one screen. Capping before ranking
     would show whoever arrived first instead of whoever earned it. */
  assert.match(src,/const MAX_LIVE_TANKS = 12;/);
  assert.match(tank,/\)\.slice\(0,MAX_LIVE_TANKS\);/);
});

test("tank photo bytes live in their own node, not in the record every visitor reads",()=>{
  /* The record used to carry the photo as base64, in a node every visitor subscribes to on boot,
     so one live photo cost its full size to every visitor on every cold start. The bytes now sit
     in tankMedia/<id> behind the Worker, which caches one database read per hour per edge. */
  const fn=src.slice(src.indexOf("async function addShowcasePhoto("),src.indexOf("async function approveShowcasePhoto("));
  assert.match(src,/function tankImagePath\(id\)\{ return id\?\("\/tank-image\/"\+encodeURIComponent\(id\)\):null; \}/);
  assert.match(fn,/const record=\{\.\.\.item, imgData:tankImagePath\(item\.id\)\}/);
  // Order is load-bearing: the tankMedia rule reads showcase/<id> to find the owner.
  assert.ok(fn.indexOf('FB_DB.ref("showcase/"+item.id).set(record)')<fn.indexOf('FB_DB.ref("tankMedia/"+item.id).set(bytes)'));
  // Bytes that never arrive must not leave a record pointing at nothing for a whole day.
  assert.match(fn,/try\{ await FB_DB\.ref\("showcase\/"\+item\.id\)\.remove\(\); \}catch\(e2\)\{\}/);
});

test("removing a submission removes its photo, every way a submission can go",()=>{
  // Expiry sweep, admin delete, approval replacing a customer's previous photo, account deletion.
  assert.match(src,/FB_DB\.ref\("showcase\/"\+x\.id\)\.remove\(\)\.then\(\(\)=>delTankMedia\(x\.id\)\)/);
  assert.match(src,/async function deleteShowcasePhoto\(id\)\{[\s\S]*?await delTankMedia\(id\);/);
  assert.match(src,/writes\["tankMedia\/"\+replaced\.id\]=null;/);
  assert.match(src,/await delTankMedia\(k\);/);
});

test("only the photo's own customer can create it, and the ceiling is above the client's budget",()=>{
  /* media/ is admin-write-only and must stay that way — it holds the product photos. Tank photos
     get their own node whose create rule asks showcase/<id> who owns the submission, so one
     customer cannot write into another's, and nobody can reach the catalogue. */
  const write=rules.tankMedia.$id[".write"];
  assert.match(write,/!data\.exists\(\)/);
  assert.match(write,/root\.child\('showcase\/' \+ \$id \+ '\/userUid'\)\.val\(\) === auth\.uid/);
  assert.match(write,/length <= 100000/);
  // The expiry sweep runs on any signed-in client, so an orphan must be deletable by anyone.
  assert.match(write,/!newData\.exists\(\) && \(/);
  assert.match(write,/!root\.child\('showcase\/' \+ \$id\)\.exists\(\)/);
  assert.equal(rules.tankMedia[".read"],true);
});

test("one photo per entry, stored exactly once",()=>{
  /* Three photos rode inside one database record while imgData duplicated the first, so sharing
     three cost four. Every visitor downloads that node in full. */
  assert.match(tank,/const MAX_IMGS=1;/);
  assert.doesNotMatch(tank,/imgs:preview/);
  assert.match(tank,/onSubmit\(\{id:entryId,imgData:preview\[0\],ownerName:finalName/);
  // Older multi-photo entries must still render for the rest of their 24-hour window.
  assert.match(src,/const many=Array\.isArray\(x&&x\.imgs\)\?x\.imgs\.filter\(Boolean\):\[\];/);
});

test("Firebase upload returns without waiting for the optional offline cache",()=>{
  const fn=src.slice(src.indexOf("async function addShowcasePhoto("),src.indexOf("async function approveShowcasePhoto("));
  assert.ok(fn.indexOf('await FB_DB.ref("showcase/"+item.id).set(record)')<fn.indexOf("scheduleShowcaseCacheWrite(record)"));
  assert.doesNotMatch(fn,/await scheduleShowcaseCacheWrite/);
});

test("Android WebView does not duplicate Customer Tank base64 photos into IndexedDB",()=>{
  const fn=src.slice(src.indexOf("function scheduleShowcaseCacheWrite("),src.indexOf("async function addShowcasePhoto("));
  assert.match(fn,/if\(window\.nemoInApp\) return/);
});

test("Android WebView clears legacy Customer Tank cache after a successful cloud read",()=>{
  const fn=src.slice(src.indexOf("async function loadShowcase("),src.indexOf("function scheduleShowcaseCacheWrite("));
  assert.match(fn,/if\(window\.nemoInApp\)/);
  assert.match(fn,/dbSet\("nemo-showcase","\[\]"\)/);
});

test("the rules bound what a client can store, not just what the app sends",()=>{
  /* The client caps itself at 200,000 characters and writes one photo. Nothing stops a client
     that ignores the app: the rules previously allowed 700,000 per image and ANY number of
     images per entry, so one crafted write could put megabytes into a node every visitor
     downloads — and on the free plan the download allowance is what keeps the shop online.
     The ceilings here are the backstop, set above the client's own budget so an honest upload
     is never rejected for being a few bytes over. */
  const entry=rules.showcase.$id;
  assert.match(entry.imgData[".validate"],/length <= 260000/);
  assert.match(entry.imgs[".validate"],/!newData\.child\('1'\)\.exists\(\)/);
  assert.match(entry.imgs.$i[".validate"],/length <= 260000/);
  // Deleting an expired entry must stay possible — the sweep depends on it.
  assert.match(entry.imgData[".validate"],/^!newData\.exists\(\) \|\|/);
  assert.match(entry.imgs[".validate"],/^!newData\.exists\(\) \|\|/);
});

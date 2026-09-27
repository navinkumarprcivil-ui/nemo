import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.jsx', import.meta.url), 'utf8');
const lines = app.split('\n');

function sections(){
  const found = [];
  lines.forEach((l, i) => {
    const m = l.match(/secOpen&&sec==="(\w+)"/);
    if (m) found.push({ name: m[1], at: i + 1 });
  });
  found.forEach((s, i) => { s.end = i + 1 < found.length ? found[i + 1].at - 1 : lines.length; });
  return found;
}

test('every settings section opens and closes exactly once', () => {
  for (const s of sections()){
    const body = lines.slice(s.at, s.end);
    const closers = body.filter(l => l.trim() === '</>)}').length;
    assert.equal(closers, 1, `section "${s.name}" has ${closers} closing fragments, expected 1`);
  }
});

test('the maintenance tools are not filed under Email & Security', () => {
  const secs = sections();
  const tools = secs.find(s => s.name === 'tools');
  assert.ok(tools, 'the Maintenance section is missing');
  assert.match(app, /\["tools","🛠 Maintenance"\]/, 'Maintenance has no tab to reach it by');

  /* A backup, a database prune and a cache clear are not email and not security. Filing them
     under that tab put the two least reversible buttons in the store beside the admin password,
     on a tab someone opens for an unrelated reason. */
  const body = lines.slice(tools.at, tools.end).join('\n');
  for (const panel of ['Data & Backup', 'Free Database Space', 'Clear Cached Copies']){
    assert.ok(body.includes(`title="${panel}"`), `"${panel}" is not in the Maintenance section`);
  }
  const emails = secs.find(s => s.name === 'emails');
  const emailBody = lines.slice(emails.at, emails.end).join('\n');
  assert.ok(!emailBody.includes('Free Database Space'), 'the database prune is back under Email & Security');
});

test('live-fish packing settings are hidden while live fish are off', () => {
  const at = lines.findIndex(l => l.includes('title="Live-Fish Packing & Couriers"'));
  assert.ok(at > -1, 'the live-fish packing panel is missing');

  /* Every control in that panel configures a category customers cannot see while the switch is
     off, so it can change nothing. The guard must sit on the panel itself — not inside it, where
     the heading would still render over an empty body. */
  const preamble = lines.slice(Math.max(0, at - 10), at).join('\n');
  assert.match(preamble, /\{f\.liveFishEnabled===true&&\(/, 'the panel is not guarded by the live-fish switch');

  /* Hidden, not removed: the values must still be in the file to come back with the switch. */
  assert.ok(app.includes('liveFishRestrictNCIndia'), 'the live-fish settings were deleted rather than hidden');
});

/* The "Go Live — Clear Test Orders" button was removed once the store was trading. It deleted
   every order regardless of age or status and had no memory of having run, so after the first
   real sale it would have offered to wipe that sale as a "test order". The owner's rule since
   then is that nothing is deleted after going live, and orders are GST records. */
test('there is no button that deletes the whole order book', () => {
  for (const gone of ['resetAllOrderData', 'onResetOrderData', 'DELETE ALL ORDERS', 'Clear Test Orders']){
    assert.ok(!app.includes(gone), `"${gone}" is back in app.jsx`);
  }
  // Order-number counters are only ever cleared by a reset of this kind.
  assert.doesNotMatch(app, /ref\("orderSeq\/"\+[^)]*\)\.remove\(\)/, 'something removes order-number counters');
});

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

/* No order can be deleted — not by a button, not by the server, not by the database.

   Real, paid, delivered orders placed while the payment gateway was being tested were lost
   from the admin. Three admin controls could delete orders: "Go Live — Clear Test Orders"
   (every order, any status, with no memory of having run), "Clean Up Old Orders" (delivered
   and cancelled orders past an age) and "Delete This Order" on every order. All three are
   gone, and the database rules now refuse a delete from anyone, admin included, so a
   control that comes back later still cannot remove an order. Orders are GST records: an
   order that should not count is Cancelled, never deleted. */
test('nothing in the app deletes an order', () => {
  for (const gone of ['resetAllOrderData', 'DELETE ALL ORDERS', 'Clear Test Orders',
    'Clean Up Old Orders', 'Delete This Order', 'deleteOrderHandler', 'onDeleteOrder', 'onCleanupOrders']){
    assert.ok(!app.includes(gone), `"${gone}" is back in app.jsx`);
  }
  // Any ref into orders/ that is removed or overwritten with null.
  assert.doesNotMatch(app, /ref\(\s*["'`]orders[^)]*\)\s*\.\s*(remove\(|set\(\s*null)/, 'app.jsx removes an order');
  assert.doesNotMatch(app, /ref\("orderSeq\/"\+[^)]*\)\.remove\(\)/, 'something removes order-number counters');
});

test('the server never deletes an order', () => {
  for (const f of ['lib/payments.mjs', 'lib/gateways.mjs', 'cloudflare/worker.js', 'api/cron-push.js', 'api/cron-tank-cleanup.js']){
    let src = '';
    try { src = readFileSync(new URL('../' + f, import.meta.url), 'utf8'); } catch { continue; }
    assert.doesNotMatch(src, /dbDelete\(\s*[`'"]orders/, `${f} deletes an order`);
  }
});

test('the database rules refuse to delete an order, even for the admin', () => {
  const rules = JSON.parse(readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8')).rules;
  // A write granted higher up cascades down and cannot be taken back, so nothing above may grant one.
  assert.equal(rules['.write'], false);
  assert.equal(rules.orders['.write'], undefined, 'orders/ grants a write, which would allow deletes');
  assert.equal(rules.orders.$uid['.write'], undefined, 'orders/$uid grants a write, which would allow deletes');
  const w = rules.orders.$uid.$oid['.write'];
  assert.ok(w.startsWith('auth != null && newData.exists() && ('), `the order write rule does not require newData.exists() for everyone: ${w}`);
});

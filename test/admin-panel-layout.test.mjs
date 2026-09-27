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

/* Orders are GST records, and real, paid, delivered orders from the gateway-testing period were
   lost from the admin. Three admin controls could delete orders: "Go Live — Clear Test Orders"
   (every order, any status), "Delete This Order" (on every order) and "Clean Up Old Orders"
   (delivered and cancelled orders from three months old). The first two are gone for good.
   Clean Up Old Orders came back at the owner's request, narrowed: a year is the floor, only
   finished orders with nothing open on them qualify, and the backup of exactly those orders
   must be downloaded before the delete button lights up. */
test('the only code that deletes an order is the narrowed cleanup', () => {
  for (const gone of ['resetAllOrderData', 'DELETE ALL ORDERS', 'Clear Test Orders',
    'Delete This Order', 'deleteOrderHandler', 'onDeleteOrder']){
    assert.ok(!app.includes(gone), `"${gone}" is back in app.jsx`);
  }
  const removes = [...app.matchAll(/ref\(\s*["'`]orders[^)]*\)\s*\.\s*(remove\(|set\(\s*null)/g)];
  assert.equal(removes.length, 1, `expected exactly one order delete in app.jsx, found ${removes.length}`);
  const start = app.indexOf('const cleanupOldOrders=async days=>{');
  assert.ok(start > 0, 'cleanupOldOrders is missing');
  const body = app.slice(start, app.indexOf('\n  };', start));
  assert.ok(body.includes('.remove()'), 'the one order delete is not inside cleanupOldOrders');
  assert.match(body, /orders\.filter\(x=>orderCleanupEligible\(x,days\)\)/, 'cleanupOldOrders deletes without the eligibility filter');
  assert.doesNotMatch(app, /ref\("orderSeq\/"\+[^)]*\)\.remove\(\)/, 'something removes order-number counters');
});

test('only finished orders over a year old, with nothing open, can be cleaned up', () => {
  const grab = (name) => {
    const i = app.indexOf('function ' + name + '(');
    assert.ok(i >= 0, name + ' is missing');
    return app.slice(i, app.indexOf('\n}\n', i) + 2);
  };
  const floor = app.match(/const ORDER_CLEANUP_MIN_DAYS = (\d+);/);
  assert.ok(floor && Number(floor[1]) >= 365, 'the cleanup floor is under a year');
  const eligible = new Function(
    `const ORDER_CLEANUP_MIN_DAYS=${floor[1]};${grab('adminOrderNeedsAttention')}${grab('orderCleanupEligible')}return orderCleanupEligible;`)();
  const now = Date.parse('2030-01-01T00:00:00Z'), DAY = 86400000;
  const order = (ageDays, extra = {}) => ({ id: 'o1', userUid: 'u1', status: 'Delivered',
    placedAt: new Date(now - ageDays * DAY).toISOString(), paymentDeadline: now - ageDays * DAY + 1200000, ...extra });

  assert.equal(eligible(order(400), 365, now), true, 'a delivered order 400 days old should qualify');
  assert.equal(eligible(order(400, { status: 'Cancelled' }), 365, now), true);
  assert.equal(eligible(order(300), 365, now), false, 'under a year old');
  assert.equal(eligible(order(300), 30, now), false, 'a shorter age must not get under the one-year floor');
  assert.equal(eligible(order(800), 730, now), true);
  assert.equal(eligible(order(500), 730, now), false, 'the picker can only make it stricter');
  for (const status of ['Awaiting Payment', 'Payment Review', 'Confirmed', 'Shipped']){
    assert.equal(eligible(order(900, { status }), 365, now), false, `${status} is not finished`);
  }
  assert.equal(eligible(order(900, { returnReq: { status: 'Pending' } }), 365, now), false, 'open return');
  assert.equal(eligible(order(900, { doa: { status: 'Pending' } }), 365, now), false, 'open DOA claim');
  assert.equal(eligible(order(900, { refund: { due: true, status: 'processing' } }), 365, now), false, 'refund owed');
  assert.equal(eligible(order(900, { paymentDeadline: undefined }), 365, now), false, 'no numeric date to check');
  assert.equal(eligible(order(900, { paymentDeadline: now }), 365, now), false, 'both dates must be old');
});

test('the cleanup panel offers nothing under a year and demands the backup first', () => {
  const i = app.indexOf('Clean Up Old Orders</span>');
  assert.ok(i > 0, 'the panel is missing');
  const panel = app.slice(app.lastIndexOf('{(()=>{', i), app.indexOf('})()}', i));
  const years = [...panel.matchAll(/<option value=\{(\d+)\}>/g)].map(m => Number(m[1]));
  assert.ok(years.length && years.every(y => y >= 1), `picker offers ${years}`);
  assert.match(panel, /orderCleanupEligible\(o,cleanYears\*365\)/, 'the panel counts orders by some other rule');
  assert.match(panel, /disabled=\{!cleanBackedUp\|\|cleanBusy\}/, 'the delete button does not wait for the backup');
  assert.match(panel, /exportOrdersCSV\(due,/, 'the backup is not of exactly the orders being deleted');
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

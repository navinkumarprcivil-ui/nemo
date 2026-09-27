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
  for (const panel of ['Data & Backup', 'Clear Cached Copies']){
    assert.ok(body.includes(`title="${panel}"`), `"${panel}" is not in the Maintenance section`);
  }
  const emails = secs.find(s => s.name === 'emails');
  const emailBody = lines.slice(emails.at, emails.end).join('\n');
  assert.ok(!emailBody.includes('Clear Cached Copies'), 'a maintenance tool is back under Email & Security');
});

/* Removed on 27 September 2026 as buttons with nothing left to do. Speed Up Catalog made the
   catalogue thumbnail the product editor already makes on every save; Free Database Space
   deleted database copies of photos the site reads from the CDN instead. */
test('the two retired maintenance buttons stay gone', () => {
  for (const gone of ['Speed Up Catalog', 'Free Database Space', 'backfillThumbs', 'Optimise Catalog Images']){
    assert.ok(!app.includes(gone), `"${gone}" is back in app.jsx`);
  }
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

test('the database rules delete only a finished, year-old order, and only for an admin', () => {
  /* Published 27 September 2026 at the owner's request, as the narrow exception behind Clean Up
     Old Orders. Everything else about an order stays undeletable: a recent one, an open one, one
     with a refund still owed, and anything a customer tries. The rule is evaluated here, not
     pattern-matched, so a later edit that widens it fails on a real case. */
  const rules = JSON.parse(readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8')).rules;
  // A write granted higher up cascades down and cannot be taken back, so nothing above may grant one.
  assert.equal(rules['.write'], false);
  assert.equal(rules.orders['.write'], undefined, 'orders/ grants a write, which would allow deletes');
  assert.equal(rules.orders.$uid['.write'], undefined, 'orders/$uid grants a write, which would allow a whole customer to be wiped');
  const js = rules.orders.$uid.$oid['.write']
    .replace(/(data|root)\.child\('([^']+)'\)\.isNumber\(\)/g, "(typeof get($1,'$2')==='number')")
    .replace(/(data|root)\.child\('([^']+)'\)\.val\(\)/g, "get($1,'$2')")
    .replace(/newData\.exists\(\)/g, '(newData!=null)');
  assert.doesNotMatch(js, /\.child\(|\.val\(\)|\.exists\(\)/, 'the rule uses something this test cannot evaluate');
  const rule = new Function('auth', 'root', 'data', 'newData', '$uid', 'now',
    'const get=(o,p)=>p.split("/").reduce((x,k)=>x==null?null:(x[k]??null),o); return (' + js + ');');
  const ADMIN = { uid: 'cI2HmMt6FdR7fO7uUnugH85GeZt2' }, CO = { uid: 'co1' }, CUST = { uid: 'cust1' };
  const root = (orders) => ({ adminAccess: { coAdminUid: 'co1', permissions: { orders } } });
  const now = Date.UTC(2030, 0, 1), DAY = 86400000;
  const order = (ageDays, extra = {}) => ({ status: 'Delivered', paymentDeadline: now - ageDays * DAY, ...extra });
  const del = (auth, o, perm = true) => rule(auth, root(perm), o, null, 'cust1', now);
  const put = (auth, uid) => rule(auth, root(true), order(10), { status: 'Shipped' }, uid, now);

  assert.equal(del(ADMIN, order(366)), true, 'admin, Delivered, a year old');
  assert.equal(del(ADMIN, order(366, { status: 'Cancelled' })), true, 'admin, Cancelled, a year old');
  assert.equal(del(CO, order(366)), true, 'co-admin with the orders permission');
  assert.equal(del(CO, order(366), false), false, 'co-admin without the orders permission');
  assert.equal(del(CUST, order(366)), false, 'a customer can never delete, even their own');
  assert.equal(del(null, order(366)), false, 'signed out');
  assert.equal(del(ADMIN, order(364)), false, 'less than a year old');
  assert.equal(del(ADMIN, order(0)), false, 'a recent order');
  for (const status of ['Awaiting Payment', 'Payment Review', 'Confirmed', 'Shipped', 'Return/Replacement'])
    assert.equal(del(ADMIN, order(900, { status })), false, `unfinished: ${status}`);
  assert.equal(del(ADMIN, order(900, { paymentDeadline: undefined })), false, 'no numeric date to check');
  assert.equal(del(ADMIN, order(900, { paymentDeadline: String(now - 900 * DAY) })), false, 'a date stored as text');
  assert.equal(del(ADMIN, order(900, { refund: { due: true, status: 'processing' } })), false, 'refund still owed');
  assert.equal(del(ADMIN, order(900, { refund: { due: true, status: 'refunded' } })), true, 'refund paid');
  assert.equal(del(ADMIN, order(900, { refund: { due: false, status: 'none' } })), true, 'no refund due');

  // Ordinary writes are unchanged.
  assert.equal(put(ADMIN, 'cust1'), true, 'admin updates an order');
  assert.equal(put(CUST, 'cust1'), true, 'a customer writes their own order');
  assert.equal(put(CUST, 'someone-else'), false, "a customer writes someone else's order");
  assert.equal(put(null, 'cust1'), false, 'signed out');

  // The age the delete depends on cannot be backdated by the customer once it is set.
  assert.match(rules.orders.$uid.$oid.paymentDeadline['.validate'], /\|\| !data\.exists\(\) \|\| newData\.val\(\) === data\.val\(\)$/);
});

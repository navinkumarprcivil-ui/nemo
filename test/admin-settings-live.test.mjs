import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const app  = readFileSync(join(root, 'app.jsx'), 'utf8');
const lines = app.split('\n');

/* The settings form's own line range. Everything inside it is the admin WRITING a setting;
   a read has to happen somewhere else, which is the whole point of this file. */
function formRange(){
  const start = lines.findIndex(l => l.includes('const [sec,setSec]=useState("store")'));
  assert.ok(start > -1, 'settings form start not found');
  let depth = 0, end = -1;
  for (let i = start; i < lines.length; i++){
    if (lines[i].includes('function ')  && i > start + 5 && /^function /.test(lines[i])) { end = i; break; }
  }
  return [start + 1, end === -1 ? lines.length : end];
}

/* Keys whose only reader is outside app.jsx. Each one names the file, so a key cannot be
   parked here to silence the test without saying where it is actually used. */
const READ_ELSEWHERE = {
  paymentPrimary: 'lib/gateways.mjs',
};

function readsOutsideTheForm(key, from, to){
  const re = new RegExp(`[.\\["']${key}\\b`);
  for (let i = 0; i < lines.length; i++){
    if (i + 1 >= from && i + 1 <= to) continue;          // inside the form: that is a write
    if (lines[i].includes('DEFAULT_SETTINGS')) continue;  // a default is not a reader either
    if (re.test(lines[i])) return true;
  }
  return false;
}

test('every setting the admin form writes is read by something', () => {
  const [from, to] = formRange();
  const keys = new Set();
  for (let i = from - 1; i < to; i++){
    for (const m of lines[i].matchAll(/\bset\("([A-Za-z0-9_]+)"/g))            keys.add(m[1]);
    for (const m of lines[i].matchAll(/\bfield\("[^"]*","([A-Za-z0-9_]+)"/g))  keys.add(m[1]);
  }
  assert.ok(keys.size > 50, `expected the whole settings form, found only ${keys.size} keys`);

  const orphans = [];
  for (const key of [...keys].sort()){
    if (READ_ELSEWHERE[key]){
      const where = readFileSync(join(root, READ_ELSEWHERE[key]), 'utf8');
      assert.ok(where.includes(key), `${key} is listed as read by ${READ_ELSEWHERE[key]}, but is not in that file`);
      continue;
    }
    if (!readsOutsideTheForm(key, from, to)) orphans.push(key);
  }

  /* A field the admin can fill in that changes nothing is worse than no field: it is a promise
     the store does not keep. supporterWhatsapp offered to notify a colleague on every order and
     no such message was ever sent; upiName sat under a UPI ID that does print on the invoice,
     while the invoice already prints bankAccountName as "Name". Both were removed. If this
     fails, either wire the new key up or take the field out — do not add it to READ_ELSEWHERE
     unless another file genuinely reads it. */
  assert.deepEqual(orphans, [], `settings written by the admin but read by nothing: ${orphans.join(', ')}`);
});

test('the removed dead settings have not come back', () => {
  for (const gone of ['supporterEnabled', 'supporterWhatsapp', 'upiName']){
    assert.ok(!app.includes(gone), `${gone} was removed as dead; it is back in app.jsx`);
  }
});

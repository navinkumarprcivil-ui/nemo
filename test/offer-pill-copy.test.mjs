import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "app.jsx"), "utf8");

test("the nudge carries the offer twice: with the cap and without it", () => {
  /* One helper cannot serve both places. The floating pill has a single line on a phone and
     the cap spills it onto a second; the cart has room and a reason, because that is where a
     shopper decides whether the order is finished. */
  assert.match(src, /const offShortOf=\(c\)=>c\.type==="percent" \? `\$\{c\.value\}% off` : `₹\$\{c\.value\} off`;/);
  assert.match(src, /off:offOf\(ahead\), offShort:offShortOf\(ahead\)/);
  assert.match(src, /off:offOf\(won\), offShort:offShortOf\(won\)/);
});

test("the floating pill drops the cap, the cart keeps it", () => {
  const pill = src.slice(src.indexOf("floating-cart-bar\" onClick"), src.indexOf("🛒 Cart · {cartCount}"));
  assert.match(pill, /more to get <b>\{dc\.offShort\}<\/b>/);
  assert.doesNotMatch(pill, /\{dc\.off\}/);

  // The cart's own nudge, directly above the checkout button, still states the ceiling.
  const cart = src.slice(src.indexOf("const n=nextDiscountNudge(total,settings,orders);"));
  assert.match(cart.slice(0, 1200), /You've unlocked <span style=\{\{color:C\.coral\}\}>\{n\.off\}<\/span>/);
  assert.match(cart.slice(0, 1200), /more to get <span style=\{\{color:C\.coral\}\}>\{n\.off\}<\/span>/);
});

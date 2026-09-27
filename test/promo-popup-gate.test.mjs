import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "app.jsx"), "utf8");

test("the promo popup waits for orders, not just settings", () => {
  /* OfferBanners filters through usableCoupons(settings, orders, "welcome"), and a first-order
     coupon is usable exactly while orders is empty. The popup opens on a 220ms timer, long
     before the orders listener answers, so on any install without a cached list it showed a
     returning customer a welcome offer they could not have, then withdrew it. settingsReady
     guarded one argument of that filter; this guards the other. */
  assert.match(src, /\{settingsReady&&ordersReady&&<OfferBanners settings=\{settings\} orders=\{orders\}\/>\}/);
  assert.match(src, /const \[ordersReady,setOrdersReady\] = useState\(false\);/);
});

test("every path out of the orders effect settles the flag", () => {
  const fn = src.slice(src.indexOf("// CUSTOMER: live listener on THEIR orders"),
                       src.indexOf("// WALLET: load the signed-in customer's live balance"));
  // Signed out, or no resolvable key: nothing to wait for.
  assert.match(fn, /if\(!user\)\{ setOrdersReady\(true\); return; \}/);
  assert.match(fn, /if\(!uid\)\{ setOrdersReady\(true\); return; \}/);
  /* Six in all: signed out, no key, the listener, its error fallback, the network guard, and
     the no-Firebase branch. Counted rather than spot-checked, because a path that forgets to
     settle the flag does not fail loudly — it just means the popup never appears. */
  assert.equal((fn.match(/setOrdersReady\(true\)/g) || []).length, 6);
  // A dead connection must not suppress the popup for ever.
  assert.match(fn, /const guard=setTimeout\(\(\)=>setOrdersReady\(true\),4000\);/);
  assert.match(fn, /clearTimeout\(guard\); ref\.off\("value",cb\);/);
});

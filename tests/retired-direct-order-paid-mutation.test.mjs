import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(new URL("../app/api/orders/update/route.js", import.meta.url), "utf8");

test("legacy direct paid-state mutation is retired instead of bypassing settlement", () => {
  assert.match(route, /LEGACY_ORDER_PAYMENT_MUTATION_RETIRED/);
  assert.match(route, /status: 410/);
  assert.match(route, /canonical POS payment settlement workflow/);
  assert.doesNotMatch(route, /\.from\("orders"\)/);
  assert.doesNotMatch(route, /status:\s*"paid"/);
});

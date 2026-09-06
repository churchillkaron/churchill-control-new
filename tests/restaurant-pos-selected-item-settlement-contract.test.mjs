import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const settlementPath = "lib/restaurant/payments/runtime/settleTablePayment.js";

test("selected restaurant settlement rejects terminal item states", async () => {
  const settlement = await readFile(new URL(`../${settlementPath}`, import.meta.url), "utf8");

  assert.match(settlement, /function terminalItemStatus\(value\)/);
  for (const status of ["VOID", "VOIDED", "CANCELLED", "CANCELED"]) {
    assert.match(settlement, new RegExp(`"${status}"`));
  }
  assert.match(settlement, /select\("id, order_id, price, quantity, status"\)/);
  assert.match(settlement, /items\.some\(\(item\) => terminalItemStatus\(item\.status\)\)/);
  assert.match(settlement, /Voided or cancelled restaurant items cannot be settled/);
  assert.match(settlement, /status: 409/);
});

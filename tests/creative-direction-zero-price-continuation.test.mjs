import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/creative/director/runtime/CreativeDirectionCostApprovalRuntime.js", "utf8");

test("zero-price direction continuation helper is narrowly scoped to existing local authority", () => {
  assert.match(source, /function ownedZeroPriceDirectionApproval\(approval = \{\}\)/);
  assert.match(source, /localOwnedDirectionApproval\(approval\)/);
  assert.match(source, /CREATIVE_DIRECTION_LOCAL_ZERO_PRICE_REBASE_V1/);
  assert.match(source, /Number\(approval\.spent_customer_price \|\| 0\) === 0/);
  assert.match(source, /approval\.media_generation_authorized !== true/);
  assert.match(source, /approval\.publication_authorized !== true/);
  assert.match(source, /approval\.external_fallback_allowed === false/);
});

test("renewal cannot expand authority or price budget", () => {
  assert.match(source, /CREATIVE_DIRECTION_CONTINUATION_AUTHORITY_EXPANSION_FORBIDDEN/);
  assert.match(source, /remaining_customer_price/);
  assert.match(source, /expires_at: new Date\(now\.getTime\(\) \+ DIRECTION_IN_PROGRESS_CONTINUATION_WINDOW_MS\)/);
});

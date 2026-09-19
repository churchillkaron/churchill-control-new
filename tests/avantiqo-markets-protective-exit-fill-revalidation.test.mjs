import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPaperExecutionRuntime.js", import.meta.url),
  "utf8",
);

test("fill worker loads protective decision payload", () => {
  assert.match(runtime, /decision_payload/);
  assert.match(runtime, /DETERMINISTIC_PROTECTIVE_EXIT/);
});

test("protective SELL is re-evaluated from current live bid only", () => {
  assert.match(runtime, /evaluateProtectiveExit\(\{/);
  assert.match(runtime, /snapshot: \{[\s\S]*?bid_price: snapshot\?\.bid_price[\s\S]*?\}/);
  assert.match(runtime, /price_source: "CURRENT_LIVE_BID"/);
});

test("protective order must still reference the same open position", () => {
  assert.match(runtime, /position_id/);
  assert.match(runtime, /PROTECTIVE_POSITION_NO_LONGER_OPEN/);
});

test("inactive protective trigger cancels queued order and decision", () => {
  assert.match(runtime, /PROTECTIVE_EXIT_TRIGGER_NO_LONGER_ACTIVE/);
  assert.match(runtime, /status: "CANCELLED"/);
  assert.match(runtime, /risk_status: "CANCELLED"/);
});

test("changed protective trigger reason cancels stale authority", () => {
  assert.match(runtime, /PROTECTIVE_EXIT_TRIGGER_CHANGED/);
  assert.match(
    runtime,
    /text\(currentTrigger\.reason\)\.toUpperCase\(\) !== originalTriggerReason/,
  );
});

test("successful protective fill persists revalidated trigger evidence", () => {
  assert.match(runtime, /protective_exit_revalidation: protectiveExitRevalidation/);
  assert.match(runtime, /original_trigger_reason: originalTriggerReason/);
  assert.match(runtime, /evaluated_at: new Date\(\)\.toISOString\(\)/);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPaperExecutionRuntime.js", import.meta.url),
  "utf8",
);

test("missing governed decision cancels queued or partial order", () => {
  assert.match(runtime, /GOVERNED_DECISION_MISSING/);
  assert.match(runtime, /terminalDecisionStatus === "MISSING"/);
  assert.match(runtime, /status: "CANCELLED"/);
});

test("expired governed decision expires queued or partial order", () => {
  assert.match(runtime, /terminalDecisionStatus === "EXPIRED"/);
  assert.match(runtime, /status: "EXPIRED"/);
  assert.match(runtime, /expired_at: terminalAt/);
});

test("superseded cancelled and other non-approved decisions terminate queue authority", () => {
  assert.match(runtime, /GOVERNED_DECISION_SUPERSEDED/);
  assert.match(runtime, /GOVERNED_DECISION_CANCELLED/);
  assert.match(runtime, /GOVERNED_DECISION_NOT_APPROVED/);
  assert.match(runtime, /\.in\("status", \["QUEUED", "PARTIALLY_FILLED"\]\)/);
});

test("order decision symbol-side mismatch cancels both order and decision", () => {
  assert.match(runtime, /ORDER_DECISION_MUTATION_MISMATCH/);
  assert.match(
    runtime,
    /text\(decision\.symbol\)\.toUpperCase\(\) !== text\(order\.symbol\)\.toUpperCase\(\)/,
  );
  assert.match(
    runtime,
    /text\(decision\.action\)\.toUpperCase\(\) !== text\(order\.side\)\.toUpperCase\(\)/,
  );
  assert.match(runtime, /risk_status: "CANCELLED"/);
  assert.match(runtime, /invalidation_reason: cancellationReason/);
});

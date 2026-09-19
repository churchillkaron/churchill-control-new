import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPaperExecutionRuntime.js", import.meta.url),
  "utf8",
);

test("SELL execution binds to current open position quantity", () => {
  assert.match(runtime, /const currentSellPosition = side === "SELL"/);
  assert.match(runtime, /const currentSellPositionQuantity = side === "SELL"/);
  assert.match(
    runtime,
    /Math\.min\(remainingQuantity, currentSellPositionQuantity\)/,
  );
});

test("SELL with no current position cancels stale order authority", () => {
  assert.match(runtime, /PAPER_SELL_POSITION_NO_LONGER_OPEN/);
  assert.match(runtime, /status: "CANCELLED"/);
  assert.match(runtime, /risk_status: "CANCELLED"/);
});

test("SELL risk evidence seals current position quantity and slice binding", () => {
  assert.match(runtime, /sell_position_binding:/);
  assert.match(runtime, /current_position_quantity: currentSellPositionQuantity/);
  assert.match(runtime, /order_remaining_quantity: remainingQuantity/);
  assert.match(runtime, /executable_remaining_quantity: executableRemainingQuantity/);
  assert.match(runtime, /slice_quantity: liquidity\.executable_quantity/);
});

test("final valid SELL slice cancels stale nominal remainder after position exhaustion", () => {
  assert.match(runtime, /PAPER_SELL_POSITION_EXHAUSTED/);
  assert.match(
    runtime,
    /liquidity\.executable_quantity >= currentSellPositionQuantity - 1e-12/,
  );
  assert.match(runtime, /number\(data\?\.remaining_quantity, 0\) > 0/);
});

test("exhausted SELL remainder is terminal and no longer reported partial", () => {
  assert.match(runtime, /partial: data\?\.order_status === "PARTIALLY_FILLED" && !sellRemainderCancelled/);
  assert.match(runtime, /terminal: data\?\.order_status === "FILLED" \|\| sellRemainderCancelled/);
  assert.match(runtime, /remainder_cancelled: sellRemainderCancelled/);
});

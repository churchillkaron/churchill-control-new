import assert from "node:assert/strict";
import test from "node:test";

import { evaluateMarketSessionSafety } from "../lib/markets/runtime/MarketSessionSafetyModels.js";

const activeAsset = {
  status: "active",
  tradable: true,
  overnight_tradable: true,
  overnight_halted: false,
};

test("regular open session admits active tradable asset", () => {
  const result = evaluateMarketSessionSafety({
    clock: { is_open: true },
    asset: activeAsset,
  });
  assert.equal(result.approved, true);
});

test("closed session blocks normal paper fill", () => {
  const result = evaluateMarketSessionSafety({
    clock: { is_open: false, next_open: "2026-09-21T13:30:00Z" },
    asset: activeAsset,
  });
  assert.equal(result.approved, false);
  assert.match(result.reasons.join(" "), /closed/i);
});

test("inactive or non-tradable asset fails closed", () => {
  assert.equal(evaluateMarketSessionSafety({
    clock: { is_open: true },
    asset: { ...activeAsset, status: "inactive" },
  }).approved, false);

  assert.equal(evaluateMarketSessionSafety({
    clock: { is_open: true },
    asset: { ...activeAsset, tradable: false },
  }).approved, false);
});

test("extended-hours mode still blocks overnight halted asset", () => {
  const result = evaluateMarketSessionSafety({
    clock: { is_open: false },
    asset: { ...activeAsset, overnight_halted: true },
    allowExtendedHours: true,
  });
  assert.equal(result.approved, false);
});

test("missing clock or asset metadata fails closed", () => {
  assert.equal(evaluateMarketSessionSafety({
    clock: null,
    asset: activeAsset,
  }).approved, false);

  assert.equal(evaluateMarketSessionSafety({
    clock: { is_open: true },
    asset: null,
  }).approved, false);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateMarketSessionSafety,
  evaluateTradingClockIntegrity,
} from "../lib/markets/runtime/MarketSessionSafetyModels.js";

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

test("fresh authoritative trading clock passes integrity", () => {
  const result = evaluateTradingClockIntegrity({
    clock: {
      timestamp: "2026-09-18T14:00:00Z",
      is_open: true,
      next_close: "2026-09-18T20:00:00Z",
      provenance: { fetched_at: "2026-09-18T14:00:01Z" },
    },
    now: new Date("2026-09-18T14:00:05Z"),
  });
  assert.equal(result.approved, true);
});

test("stale or malformed trading clock fails closed", () => {
  const stale = evaluateTradingClockIntegrity({
    clock: {
      timestamp: "2026-09-18T13:00:00Z",
      is_open: true,
      next_close: "2026-09-18T20:00:00Z",
      provenance: { fetched_at: "2026-09-18T13:00:00Z" },
    },
    now: new Date("2026-09-18T14:00:05Z"),
    maxAgeSeconds: 120,
  });
  assert.equal(stale.approved, false);
  assert.ok(stale.reasons.some((reason) => reason.includes("stale")));

  const malformed = evaluateTradingClockIntegrity({
    clock: {
      timestamp: "2026-09-18T14:00:00Z",
      is_open: true,
      next_close: "2026-09-18T13:59:59Z",
      provenance: { fetched_at: "2026-09-18T14:00:01Z" },
    },
    now: new Date("2026-09-18T14:00:05Z"),
  });
  assert.equal(malformed.approved, false);
  assert.ok(malformed.reasons.some((reason) => reason.includes("next close")));
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

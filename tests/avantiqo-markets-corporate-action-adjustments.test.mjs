import assert from "node:assert/strict";
import test from "node:test";

import {
  corporateActionIsDue,
  normalizeCorporateActionAdjustment,
  paperQuantityFromFills,
  sameOrLaterFillExists,
} from "../lib/markets/runtime/MarketCorporateActionAdjustmentModels.js";

test("forward split requires explicit structured ratio", () => {
  const normalized = normalizeCorporateActionAdjustment({
    action_type: "forward_split",
    event_date: "2026-09-18",
    raw_payload: {
      old_rate: 1,
      new_rate: 4,
    },
  });

  assert.equal(normalized.adjustment_type, "SPLIT");
  assert.equal(normalized.split_ratio, 4);
  assert.equal(normalized.unresolved_reason, null);
});

test("split without proven ratio fails unresolved", () => {
  const normalized = normalizeCorporateActionAdjustment({
    action_type: "reverse_split",
    event_date: "2026-09-18",
    raw_payload: {},
  });

  assert.equal(normalized.split_ratio, null);
  assert.equal(normalized.unresolved_reason, "SPLIT_RATIO_NOT_PROVEN");
});

test("cash dividend requires rate, ex-date and payable date", () => {
  const normalized = normalizeCorporateActionAdjustment({
    action_type: "cash_dividend",
    ex_date: "2026-09-10",
    payable_date: "2026-09-20",
    raw_payload: {
      rate: 0.82,
    },
  });

  assert.equal(normalized.adjustment_type, "CASH_DIVIDEND");
  assert.equal(normalized.cash_rate, 0.82);
  assert.equal(normalized.entitlement_date, "2026-09-10");
  assert.equal(normalized.effective_date, "2026-09-20");
  assert.equal(normalized.unresolved_reason, null);
});

test("paper entitlement quantity reconstructs fills strictly before ex-date", () => {
  const quantity = paperQuantityFromFills({
    symbol: "TEST",
    beforeTime: "2026-09-10T00:00:00Z",
    fills: [
      { symbol: "TEST", side: "BUY", quantity: 10, filled_at: "2026-09-01T14:00:00Z" },
      { symbol: "TEST", side: "SELL", quantity: 3, filled_at: "2026-09-05T14:00:00Z" },
      { symbol: "TEST", side: "BUY", quantity: 5, filled_at: "2026-09-10T14:00:00Z" },
    ],
  });

  assert.equal(quantity, 7);
});

test("late split becomes timing-ambiguous after same-day or later fills", () => {
  const ambiguous = sameOrLaterFillExists({
    symbol: "TEST",
    eventDate: "2026-09-18",
    fills: [
      { symbol: "TEST", side: "BUY", quantity: 1, filled_at: "2026-09-18T14:00:00Z" },
    ],
  });
  assert.equal(ambiguous, true);
});

test("due check accepts past payable date but not future event", () => {
  assert.equal(corporateActionIsDue({
    normalized: { effective_date: "2026-09-18" },
    now: new Date("2026-09-18T12:00:00Z"),
  }), true);
  assert.equal(corporateActionIsDue({
    normalized: { effective_date: "2026-09-20" },
    now: new Date("2026-09-18T12:00:00Z"),
  }), false);
});

import assert from "node:assert/strict";
import test from "node:test";

import { evaluateCorporateActionRisk } from "../lib/markets/runtime/MarketCorporateActionRiskModels.js";

const now = new Date("2026-09-18T12:00:00Z");
const policy = {
  block_corporate_action_buys: true,
  corporate_action_blackout_days_before: 3,
  corporate_action_blackout_days_after: 1,
};

test("known material corporate action blocks new BUY exposure inside blackout", () => {
  const result = evaluateCorporateActionRisk({
    policy,
    side: "BUY",
    now,
    corporateActions: [{
      provider_action_id: "ca-1",
      action_type: "forward_split",
      event_date: "2026-09-20",
    }],
  });

  assert.equal(result.approved, false);
  assert.equal(result.metrics.active_blackout_events, 1);
  assert.equal(result.metrics.coverage_guaranteed, false);
});

test("cash dividend alone does not trigger material-event blackout", () => {
  const result = evaluateCorporateActionRisk({
    policy,
    side: "BUY",
    now,
    corporateActions: [{
      provider_action_id: "ca-2",
      action_type: "cash_dividend",
      event_date: "2026-09-19",
    }],
  });

  assert.equal(result.approved, true);
  assert.equal(result.metrics.known_material_events, 0);
});

test("material event outside blackout does not block BUY", () => {
  const result = evaluateCorporateActionRisk({
    policy,
    side: "BUY",
    now,
    corporateActions: [{
      provider_action_id: "ca-3",
      action_type: "spin_off",
      event_date: "2026-09-30",
    }],
  });

  assert.equal(result.approved, true);
  assert.equal(result.metrics.active_blackout_events, 0);
});

test("SELL remains available for de-risking", () => {
  const result = evaluateCorporateActionRisk({
    policy,
    side: "SELL",
    now,
    corporateActions: [{
      provider_action_id: "ca-4",
      action_type: "cash_merger",
      event_date: "2026-09-18",
    }],
  });

  assert.equal(result.approved, true);
  assert.equal(result.metrics.de_risking_allowed, true);
});

test("owner can disable the PAPER blackout without changing coverage claim", () => {
  const result = evaluateCorporateActionRisk({
    policy: {
      ...policy,
      block_corporate_action_buys: false,
    },
    side: "BUY",
    now,
    corporateActions: [{
      provider_action_id: "ca-5",
      action_type: "reorganization",
      event_date: "2026-09-18",
    }],
  });

  assert.equal(result.approved, true);
  assert.equal(result.metrics.coverage_guaranteed, false);
  assert.equal(result.metrics.corporate_action_gate_enabled, false);
});

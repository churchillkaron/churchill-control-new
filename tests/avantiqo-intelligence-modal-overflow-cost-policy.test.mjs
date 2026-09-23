import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assertIntelligenceModalOverflowCeiling,
  intelligenceModalOverflowMinimumCeilingThb,
  measuredIntelligenceModalOverflowSupplierCostThb,
} from "../lib/platform/service-runtime/governance/IntelligenceModalOverflowCostPolicy.js";

const service = fs.readFileSync("lib/platform/service-runtime/execution/ServiceExecutionRuntime.js", "utf8");
const ledger = fs.readFileSync("lib/platform/service-runtime/governance/IntelligenceModalOverflowExecutionRuntime.js", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260919193000_intelligence_modal_overflow_execution_claim.sql", "utf8");

function withRate(rate, fn) {
  const previous = process.env.AVANTIQO_INTELLIGENCE_MODAL_H100_THB_PER_SECOND;
  if (rate === null) delete process.env.AVANTIQO_INTELLIGENCE_MODAL_H100_THB_PER_SECOND;
  else process.env.AVANTIQO_INTELLIGENCE_MODAL_H100_THB_PER_SECOND = String(rate);
  try { return fn(); }
  finally {
    if (previous === undefined) delete process.env.AVANTIQO_INTELLIGENCE_MODAL_H100_THB_PER_SECOND;
    else process.env.AVANTIQO_INTELLIGENCE_MODAL_H100_THB_PER_SECOND = previous;
  }
}

test("Modal overflow pricing fails closed when all-in THB/sec rate is missing", () => {
  withRate(null, () => {
    assert.throws(() => intelligenceModalOverflowMinimumCeilingThb("fast"), /H100_THB_PER_SECOND_REQUIRED/);
  });
});

test("Fast and Deep approval ceilings cover hard timeout plus scale-down", () => {
  withRate(0.02, () => {
    assert.equal(intelligenceModalOverflowMinimumCeilingThb("fast"), 2.5);
    assert.equal(intelligenceModalOverflowMinimumCeilingThb("deep"), 14.5);
    assert.throws(
      () => assertIntelligenceModalOverflowCeiling({ lane: "fast", ceilingThb: 2.49 }),
      /CEILING_BELOW_BOUNDED_WORST_CASE/,
    );
    assert.equal(assertIntelligenceModalOverflowCeiling({ lane: "fast", ceilingThb: 2.5 }).approved_ceiling_thb, 2.5);
  });
});

test("measured supplier cost includes scale-down and remains deterministic", () => {
  withRate(0.02, () => {
    const measured = measuredIntelligenceModalOverflowSupplierCostThb({ lane: "fast", wallSeconds: 10 });
    assert.equal(measured.supplier_cost_thb, 0.3);
    assert.equal(measured.measured_wall_seconds, 10);
    assert.equal(measured.scale_down_seconds, 5);
    assert.equal(measured.thb_per_second, 0.02);
  });
});

test("Service Runtime replaces supplier cost only for exact Modal Intelligence jobs", () => {
  assert.match(service, /provider !== "avantiqo-intelligence" \|\| !jobId\.startsWith\("modal-intelligence-direct:"\)/);
  assert.match(service, /settleIntelligenceModalOverflowSupplierCost/);
  assert.match(service, /supplier_cost: supplierCost/);
  assert.match(service, /platform_markup: Number\(\(customerPrice - supplierCost\)\.toFixed\(6\)\)/);
  assert.match(service, /intelligence_modal_overflow_supplier_settlement/);
});

test("overflow ledger persists measured supplier economics and hard-fails ceiling breaches", () => {
  assert.match(ledger, /INTELLIGENCE_MODAL_OVERFLOW_ACTUAL_COST_EXCEEDS_APPROVAL/);
  assert.match(ledger, /actual_supplier_cost_thb/);
  assert.match(ledger, /settlement_wall_seconds/);
  assert.match(ledger, /settlement_thb_per_second/);
  assert.match(migration, /actual_supplier_cost_thb/);
  assert.match(migration, /settlement_wall_seconds/);
  assert.match(migration, /settlement_thb_per_second/);
});

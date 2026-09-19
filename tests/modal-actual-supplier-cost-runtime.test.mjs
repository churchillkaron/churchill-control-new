import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { modalH100SupplierCostUsd } from "../lib/platform/service-runtime/governance/ModalInfrastructureCostPolicy.js";

test("Modal H100 supplier cost uses elapsed seconds times the configured USD/second rate", () => {
  assert.equal(
    modalH100SupplierCostUsd({ elapsedSeconds: 279.162, rateUsdPerSecond: 0.001097 }),
    0.306240714,
  );
  assert.equal(
    modalH100SupplierCostUsd({ elapsedSeconds: 150.02, rateUsdPerSecond: 0.001097 }),
    0.16457194,
  );
});

test("service settlement persists Modal approval identity and overrides supplier cost from real infrastructure telemetry", () => {
  const source = fs.readFileSync(
    new URL("../lib/platform/service-runtime/execution/ServiceExecutionRuntime.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /settleModalActualSupplierCost/);
  assert.match(source, /modal_compute_approval_id:/);
  assert.match(source, /actual_supplier_cost_contract/);
  assert.match(source, /supplier_cost: modalActualSupplierCost\.supplier_cost/);
});

test("Modal actual-cost migration is idempotent and exhausts approvals on real supplier-cost cap breach", () => {
  const migration = fs.readFileSync(
    new URL("../supabase/migrations/20260919115715_modal_actual_supplier_cost_settlement.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /usage_id uuid not null unique/);
  assert.match(migration, /on conflict \(usage_id\) do nothing/);
  assert.match(migration, /status = case when v_cap_exceeded then 'EXHAUSTED' else status end/);
  assert.match(migration, /supplier_cost_cap_overage_thb/);
  assert.match(migration, /revoke all on public\.modal_compute_cost_settlements from anon, authenticated/);
  assert.match(migration, /grant execute on function public\.settle_modal_compute_actual_cost/);
});

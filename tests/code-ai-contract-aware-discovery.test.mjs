import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { deriveCodeAIContractAwareDiscovery } from "../lib/code/runtime/CodeAIContractAwareDiscoveryRuntime.js";

function recurringMemory() {
  return {
    recurring_contract_failure_learning: {
      patterns: [
        { kind: "OBSERVED_CALL_ARITY_INCOMPATIBLE", verified_mission_count: 3 },
        { kind: "SUPABASE_SELECTED_COLUMN_REMOVED", verified_mission_count: 2 },
      ],
    },
    matches: [
      {
        failures: [{ contract_violations: [
          { kind: "OBSERVED_CALL_ARITY_INCOMPATIBLE", path: "lib/payments/runtime.js", symbol: "settleOrder" },
          { kind: "SUPABASE_SELECTED_COLUMN_REMOVED", path: "lib/finance/invoices.js", table: "customer_invoices", column: "total" },
        ] }],
      },
    ],
  };
}

test("recurring verified contracts produce concrete deterministic discovery leads", () => {
  const discovery = deriveCodeAIContractAwareDiscovery({ memory: recurringMemory() });
  assert.equal(discovery.active, true);
  assert.deepEqual(discovery.strategic_search_terms.slice(0, 3), ["settleOrder", "customer_invoices", "total"]);
  assert.deepEqual(discovery.priority_paths, ["lib/payments/runtime.js", "lib/finance/invoices.js"]);
  assert.equal(discovery.model_call_performed, false);
  assert.equal(discovery.provider_call_performed, false);
  assert.equal(discovery.source_mutation_authority, false);
});

test("contract-aware discovery exposes ordered current-HEAD leads for Fast Start", () => {
  const discovery = deriveCodeAIContractAwareDiscovery({ memory: recurringMemory() });
  assert.deepEqual(discovery.priority_paths.slice(0, 2), ["lib/payments/runtime.js", "lib/finance/invoices.js"]);
  assert.deepEqual(discovery.strategic_search_terms.slice(0, 3), ["settleOrder", "customer_invoices", "total"]);
  assert.equal(discovery.search_terms_are_current_head_leads_only, true);
  assert.equal(discovery.current_head_revalidation_required, true);
});

test("canonical entry preloads memory once and work package reuses prefetched memory", () => {
  const canonical = fs.readFileSync("lib/code/runtime/CodeAIEmployeeCanonicalExecutionRuntime.js", "utf8");
  const workPackage = fs.readFileSync("lib/code/runtime/CodeAIWorkPackageRuntime.js", "utf8");
  const fastStart = fs.readFileSync("lib/code/runtime/CodeAIEmployeeFastStartRuntime.js", "utf8");
  const zeroIdle = fs.readFileSync("lib/code/runtime/CodeAIEmployeeZeroIdleFastStartRuntime.js", "utf8");
  assert.match(canonical, /retrieveCodeAIVerifiedEngineeringMemory/);
  assert.match(canonical, /deriveCodeAIContractAwareDiscovery/);
  assert.match(canonical, /verified_engineering_memory: verifiedEngineeringMemory/);
  assert.match(workPackage, /input\?\.objective_context\?\.verified_engineering_memory/);
  assert.match(fastStart, /contractDiscovery\?\.priority_paths/);
  assert.match(fastStart, /contractDiscovery\?\.strategic_search_terms/);
  assert.match(zeroIdle, /contract_aware_discovery/);
});

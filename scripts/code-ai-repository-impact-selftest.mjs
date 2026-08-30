import assert from "node:assert/strict";

import {
  deriveCodeAIRepositoryImpact,
  formatCodeAIRepositoryImpactForObjective,
  CODE_AI_REPOSITORY_IMPACT_CONTRACT,
} from "../lib/code/runtime/CodeAIRepositoryImpactRuntime.js";
import {
  buildCodeAIStrategicObjective,
} from "../lib/code/runtime/CodeAIStrategicReasoningRuntime.js";

const CONTRACT = "AVANTIQO_CODE_AI_REPOSITORY_IMPACT_SELFTEST_V1";

const state = {
  employee_fast_start: {
    seed_paths: ["lib/auth/AccessPolicy.js"],
  },
  evidence: [
    {
      kind: "operation",
      status: "completed",
      action: "search",
      result: {
        query: "AccessPolicy",
        matches: [
          "lib/auth/AccessPolicy.js:14:export function AccessPolicy() {}",
          "app/api/admin/route.js:19:import { AccessPolicy } from '@/lib/auth/AccessPolicy'",
          "tests/auth/access-policy.test.js:7:import { AccessPolicy } from '../../lib/auth/AccessPolicy'",
          "lib/platform/runtime/PermissionRuntime.js:22:import { AccessPolicy } from '../../auth/AccessPolicy'",
        ],
      },
    },
    {
      kind: "operation",
      status: "completed",
      action: "read",
      result: {
        file_path: "lib/auth/AccessPolicy.js",
      },
    },
  ],
};

const impact = deriveCodeAIRepositoryImpact(state);
assert.equal(impact.contract, CODE_AI_REPOSITORY_IMPACT_CONTRACT);
assert.equal(impact.evidence_backed, true);
assert.equal(impact.risk, "critical");
assert.equal(impact.requires_contract_attention, true);
assert.equal(impact.requires_test_attention, true);
assert.equal(impact.cross_surface_impact, true);
assert.ok(impact.likely_test_paths.includes("tests/auth/access-policy.test.js"));
assert.ok(impact.likely_non_test_consumers.includes("app/api/admin/route.js"));
assert.ok(impact.likely_non_test_consumers.includes("lib/platform/runtime/PermissionRuntime.js"));
assert.ok(impact.impact_categories.includes("security"));
assert.ok(impact.impact_categories.includes("api_contract"));
assert.ok(impact.impact_categories.includes("runtime_service"));
assert.equal(impact.model_call_performed, false);
assert.equal(impact.provider_call_performed, false);
assert.equal(impact.repository_call_performed, false);

const formatted = formatCodeAIRepositoryImpactForObjective(impact);
assert.ok(formatted.includes("DETERMINISTIC REPOSITORY IMPACT MAP"));
assert.ok(formatted.includes("risk=critical"));
assert.ok(formatted.includes("observed_tests=tests/auth/access-policy.test.js"));
assert.ok(formatted.includes("may be incomplete"));

const strategic = buildCodeAIStrategicObjective({
  objective: "Repair AccessPolicy without breaking existing callers.",
  resume_state: state,
  repository_impact: impact,
});
assert.ok(strategic.includes("AVANTIQO_STRATEGIC_ENGINEERING_PROTOCOL_V1"));
assert.ok(strategic.includes("DETERMINISTIC REPOSITORY IMPACT MAP"));
assert.ok(strategic.includes("app/api/admin/route.js"));
assert.ok(strategic.includes("tests/auth/access-policy.test.js"));

const empty = deriveCodeAIRepositoryImpact({});
assert.equal(empty.evidence_backed, false);
assert.equal(empty.risk, "unknown");
assert.equal(formatCodeAIRepositoryImpactForObjective(empty), null);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  verified: {
    fast_start_search_evidence_compacted_into_impact_map: true,
    test_consumers_identified: true,
    api_contract_consumers_identified: true,
    security_and_runtime_surfaces_identified: true,
    cross_surface_impact_detected: true,
    security_data_impact_escalates_risk: true,
    impact_map_requires_zero_model_calls: true,
    impact_map_requires_zero_provider_calls: true,
    impact_map_requires_zero_additional_repository_calls: true,
    strategic_reasoning_consumes_impact_map: true,
    incomplete_evidence_is_explicitly_non_authoritative: true,
  },
  provider_call_performed: false,
  provider_spend_performed: false,
  source_mutation_performed_by_selftest: false,
  production_deploy_performed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
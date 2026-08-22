import assert from "node:assert/strict";
import { recordOperatorCognitionProvenance } from "../lib/operator/runtime/OperatorIntelligenceProvenanceRuntime.js";

const originalInfo = console.info;
console.info = () => {};
try {
  const owned = recordOperatorCognitionProvenance({
    organizationId: "org-1",
    result: {
      provider_evidence: {
        planning: {
          provider: "avantiqo-intelligence",
          usage_id: "usage-owned",
        },
      },
    },
  });
  assert.equal(owned.owned_intelligence_selected, true);
  assert.equal(owned.external_cognition_selected, false);
  assert.equal(owned.usage_id, "usage-owned");

  const external = recordOperatorCognitionProvenance({
    organizationId: "org-1",
    result: {
      provider_evidence: {
        verification: {
          evidence: {
            provider: "external-specialist",
            usage_id: "usage-external",
          },
        },
      },
    },
  });
  assert.equal(external.owned_intelligence_selected, false);
  assert.equal(external.external_cognition_selected, true);
  assert.equal(external.usage_id, "usage-external");

  const local = recordOperatorCognitionProvenance({
    organizationId: "org-1",
    result: { provider_evidence: { provider: "avantiqo-local" } },
  });
  assert.equal(local.local_deterministic_path, true);
  assert.equal(local.external_cognition_selected, false);
} finally {
  console.info = originalInfo;
}

console.log("PASS avantiqo operator cognition provenance nested evidence");

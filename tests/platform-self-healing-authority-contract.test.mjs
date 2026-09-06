import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  resolvePrivilegedSelfHealingClassification,
} from "../lib/platform/self-healing/PlatformSelfHealingClassificationAuthorityRuntime.mjs";

const researchRuntime = fs.readFileSync(
  "lib/platform/self-healing/PlatformSelfHealingCodeResearchRuntime.js",
  "utf8",
);

test("explicit AUTO_REPAIR fails closed instead of inheriting a generic repair fallback", () => {
  const result = resolvePrivilegedSelfHealingClassification({
    classification: "AUTO_REPAIR",
    ownership: "PLATFORM",
    error_class: "RUNTIME_REFERENCE_ERROR",
  });

  assert.equal(result.classification, "AUTO_REPAIR");
  assert.equal(result.blocking_status, "REPAIR_AUTHORITY_REQUIRED");
  assert.equal(result.code_execution_allowed, false);
  assert.equal(result.research_required, false);
  assert.equal(result.authority_required, "ERP_REGISTRY");
});

test("explicit AUTO_COMPLETE fails closed without canonical incompleteness proof", () => {
  const result = resolvePrivilegedSelfHealingClassification({
    classification: "auto_complete",
    error_class: "ROUTE_NOT_FOUND",
  });

  assert.equal(result.classification, "AUTO_COMPLETE");
  assert.equal(result.blocking_status, "REGISTRY_PROOF_REQUIRED");
  assert.equal(result.code_execution_allowed, false);
  assert.equal(result.research_required, false);
});

test("valid server-authoritative privileged classification survives unchanged", () => {
  const authoritative = {
    classification: "AUTO_REPAIR",
    reason: "server proof",
    research_required: true,
    code_execution_allowed: true,
    authority_source: "ERP_REGISTRY",
  };

  const result = resolvePrivilegedSelfHealingClassification(
    { classification: "AUTO_REPAIR" },
    authoritative,
  );

  assert.strictEqual(result, authoritative);
});

test("mismatched authority cannot authorize a different privileged classification", () => {
  const result = resolvePrivilegedSelfHealingClassification(
    { classification: "AUTO_COMPLETE" },
    {
      classification: "AUTO_REPAIR",
      code_execution_allowed: true,
      authority_source: "ERP_REGISTRY",
    },
  );

  assert.equal(result.classification, "AUTO_COMPLETE");
  assert.equal(result.blocking_status, "REGISTRY_PROOF_REQUIRED");
  assert.equal(result.code_execution_allowed, false);
});

test("raw unclassified failures remain eligible for source-specific server classification", () => {
  assert.equal(
    resolvePrivilegedSelfHealingClassification({
      ownership: "PLATFORM",
      error_class: "RUNTIME_ERROR",
    }),
    null,
  );
});

test("research runtime wires privileged authority guard before generic classification", () => {
  assert.match(
    researchRuntime,
    /resolvePrivilegedSelfHealingClassification\(\s*payload,\s*authoritativePreparedClassification\(payload\),\s*\)/,
  );
  assert.match(
    researchRuntime,
    /privilegedClassification \|\| classifyPlatformSelfHealingFailure\(payload\)/,
  );
  assert.match(researchRuntime, /classification\.blocking_status \|\|/);
  assert.doesNotMatch(
    researchRuntime,
    /authoritativePreparedClassification\(payload\) \|\| classifyPlatformSelfHealingFailure\(payload\)/,
  );
});

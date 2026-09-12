import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  assessCodeAIRuntimeEvidenceCoverage,
} from "../lib/code/runtime/CodeAIRuntimeEvidenceCoverageRuntime.js";

test("high-risk UI changes require browser or observed E2E runtime evidence", () => {
  const missing = assessCodeAIRuntimeEvidenceCoverage({
    state: { files_changed: ["components/operator/Panel.jsx"] },
    quality: { risk: "high" },
    behavioral_verification: { verified: true, matched_impacted_test_paths: ["tests/panel.test.mjs"] },
  });
  assert.equal(missing.required, true);
  assert.equal(missing.verified, false);
  assert.ok(missing.missing_evidence.includes("UI_BROWSER_OR_E2E_RUNTIME_EVIDENCE"));

  const proven = assessCodeAIRuntimeEvidenceCoverage({
    state: {
      files_changed: ["components/operator/Panel.jsx"],
      objective_context: {
        browser_evidence: [{ kind: "browser", summary: "rendered without console errors" }],
      },
    },
    quality: { risk: "high" },
    behavioral_verification: { verified: true, matched_impacted_test_paths: [] },
  });
  assert.equal(proven.verified, true);
  assert.equal(proven.browser_evidence_count, 1);
});

test("high-risk API changes accept targeted impacted integration proof, not generic unrelated tests", () => {
  const missing = assessCodeAIRuntimeEvidenceCoverage({
    state: { files_changed: ["app/api/invoices/route.js"] },
    quality: { risk: "critical" },
    behavioral_verification: { verified: true, matched_impacted_test_paths: [] },
  });
  assert.equal(missing.verified, false);
  assert.ok(missing.missing_evidence.includes("API_RUNTIME_OR_TARGETED_INTEGRATION_EVIDENCE"));

  const proven = assessCodeAIRuntimeEvidenceCoverage({
    state: { files_changed: ["app/api/invoices/route.js"] },
    quality: { risk: "critical" },
    behavioral_verification: {
      verified: true,
      matched_impacted_test_paths: ["tests/invoices-api.integration.test.mjs"],
    },
  });
  assert.equal(proven.verified, true);
  assert.equal(proven.matched_impacted_test_count, 1);
});

test("standard-risk UI and API work recommends runtime proof without blocking completion", () => {
  const result = assessCodeAIRuntimeEvidenceCoverage({
    state: { files_changed: ["app/page.jsx", "app/api/status/route.js"] },
    quality: { risk: "standard" },
    behavioral_verification: { verified: false },
  });
  assert.equal(result.required, false);
  assert.equal(result.verified, true);
  assert.equal(result.standard_risk_runtime_evidence_recommended, true);
});

test("Code employee completion and repair objective enforce runtime evidence as a separate gate", async () => {
  const employee = await readFile("lib/code/runtime/CodeAIEmployeeRuntime.js", "utf8");
  assert.match(employee, /assessCodeAIRuntimeEvidenceCoverage/);
  assert.match(employee, /CODE_AI_EMPLOYEE_RUNTIME_EVIDENCE_REQUIRED/);
  assert.match(employee, /runtime_evidence_coverage/);
  assert.match(employee, /Unit tests alone are not enough/);
  assert.match(employee, /browser\/interactive-preview\/E2E evidence/);
  assert.match(employee, /request\/response\/replay\/trace evidence/);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/operator/runtime/OperatorReasoningRuntime.js", import.meta.url),
  "utf8",
);
const productCycle = fs.readFileSync(
  new URL("../lib/platform/capabilities/createProductEngineeringCycleCapability.js", import.meta.url),
  "utf8",
);

test("Operator reasoning uses the complete-decision parser for fast and deep responses", () => {
  assert.match(runtime, /parseOperatorReasoningResponse/);
  assert.match(
    runtime,
    /const fastParsed = parseOperatorReasoningResponse\(findText\(fastExecution\)\)/,
  );
  assert.match(runtime, /const parsed = parseOperatorReasoningResponse\(rawText\)/);
});

test("deep Operator reasoning is owned-only in local development review scope", () => {
  assert.match(runtime, /const OWNED_INTELLIGENCE_PROVIDER = "avantiqo-intelligence"/);
  assert.match(runtime, /const LOCAL_REVIEW_SCOPE = "BENCHMARK_REVIEW_PREVIEW"/);
  assert.match(
    runtime,
    /process\.env\.NODE_ENV\)\.toLowerCase\(\) !== "development"\) return null/,
  );
  assert.match(runtime, /provider_id: OWNED_INTELLIGENCE_PROVIDER/);
  assert.match(runtime, /allowed_providers: \[OWNED_INTELLIGENCE_PROVIDER\]/);
  assert.match(runtime, /execution_scope: LOCAL_REVIEW_SCOPE/);
  assert.match(runtime, /benchmark_only: true/);
  assert.match(runtime, /owned_only_required: true/);
  assert.match(runtime, /external_fallback_allowed: false/);
  assert.match(runtime, /production_certified: false/);
});

test("Product cycle owns the canonical repository and main defaults", () => {
  assert.match(
    productCycle,
    /const DEFAULT_REPOSITORY =\s*\n\s*"https:\/\/github\.com\/churchillkaron\/churchill-control-new\.git"/,
  );
  assert.match(productCycle, /const DEFAULT_REF = "main"/);
});

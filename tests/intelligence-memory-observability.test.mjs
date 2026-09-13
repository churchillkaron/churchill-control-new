import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(new URL("../lib/operator/runtime/IntelligenceMemoryObservabilityRuntime.js", import.meta.url), "utf8");
const capability = fs.readFileSync(new URL("../lib/platform/capabilities/createIntelligenceMemoryObservabilityCapability.js", import.meta.url), "utf8");
const platform = fs.readFileSync(new URL("../lib/platform/runtime/PlatformDomainRuntime.js", import.meta.url), "utf8");

test("memory observability is organization scoped and metadata only", () => {
  assert.match(runtime, /INTELLIGENCE_MEMORY_ORGANIZATION_REQUIRED/);
  assert.match(runtime, /raw_memory_content_returned: false/);
  assert.match(runtime, /raw_reasoning_returned: false/);
  assert.doesNotMatch(runtime, /select\([^)]*content/);
  assert.match(runtime, /temperature/);
  assert.match(runtime, /operator_active_total/);
  assert.match(runtime, /operator_archived_total/);
});

test("memory observability is exposed as a read-only operator capability", () => {
  assert.match(capability, /capability: "intelligence_memory_observability"/);
  assert.match(capability, /operatorMode: "read"/);
  assert.match(capability, /operatorAutoExecute: true/);
  assert.match(capability, /operatorRequiresConfirmation: false/);
  assert.match(platform, /intelligence_memory_observability: \{ read:/);
});

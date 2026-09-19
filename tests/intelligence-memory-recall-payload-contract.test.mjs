import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtime = readFileSync(
  "lib/operator/runtime/IntelligenceMemoryRuntime.js",
  "utf8",
);

test("memory recall ranks lightweight rows before hydrating selected metadata", () => {
  const candidateBlock = runtime.match(
    /const candidateLimit[\s\S]*?const scopeError/,
  )?.[0] || "";
  const hydrationBlock = runtime.match(
    /const selectedIds[\s\S]*?const recallTelemetryRows/,
  )?.[0] || "";

  assert.ok(candidateBlock);
  assert.doesNotMatch(candidateBlock, /metadata/);
  assert.match(hydrationBlock, /\.select\("id,metadata"\)/);
  assert.match(hydrationBlock, /\.in\("id", selectedIds\)/);
  assert.match(runtime, /verifiedCognitiveAuditReceipts\(organization, hydratedSelected\)/);
  assert.match(runtime, /return hydratedSelected\.map/);
});

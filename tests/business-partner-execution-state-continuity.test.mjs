import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("Business Partner snapshot returns persisted execution proof required after refresh", () => {
  const runtime = source(
    "lib/operator/runtime/IntelligenceConversationRuntime.js",
  );

  assert.match(
    runtime,
    /\.select\("id, role, source, content, decision, evidence, execution, navigation, created_at"\)/,
  );
});

test("Business Partner restores proof and reuses the live governance classifier", () => {
  const home = source("components/operator/HomeAvantiqoIntelligence.jsx");

  assert.match(home, /execution:\s*turn\?\.execution\s*\|\|\s*\{\}/);
  assert.match(home, /evidence:\s*turn\?\.evidence\s*\|\|\s*\{\}/);
  assert.match(home, /navigation:\s*turn\?\.navigation\s*\|\|\s*\{\}/);
  assert.match(
    home,
    /turn\.role === "assistant"\s*\? executionEvidence\(turn\)\s*:\s*null/,
  );
  assert.match(home, /governance:\s*executionEvidence\(result\)/);
});

test("Business Partner execution state retains all governed user-facing outcomes", () => {
  const home = source("components/operator/HomeAvantiqoIntelligence.jsx");

  assert.match(home, /business_effect_verified === true/);
  assert.match(home, /label:\s*"Verified complete"/);
  assert.match(home, /status === "blocked"/);
  assert.match(home, /label:\s*"Not completed"/);
  assert.match(home, /pendingExecution\?\.capability_key/);
  assert.match(home, /label:\s*"Awaiting approval"/);
  assert.match(home, /status === "completed"/);
  assert.match(home, /label:\s*"Completed check"/);
  assert.match(home, /data-avantiqo-execution-state=\{message\.governance\.tone\}/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveCodeAIStrategicExternalResearchNeed } from "../lib/code/runtime/CodeAIStrategicExternalResearchRuntime.js";

const capability = await readFile(new URL("../lib/platform/capabilities/createCodeAIAutonomousCapability.js", import.meta.url), "utf8");
const strategic = await readFile(new URL("../lib/code/runtime/CodeAIStrategicReasoningRuntime.js", import.meta.url), "utf8");

test("ordinary local verification objective does not require external research", () => {
  const need = resolveCodeAIStrategicExternalResearchNeed("Inspect app/api/auth/session/route.js in this exact shared workspace, verify it with node --check, and make no source changes. Do not commit or deploy.");
  assert.equal(need.required, false);
});

test("explicit research objective still requires external research", () => {
  const need = resolveCodeAIStrategicExternalResearchNeed("Research the latest Next.js release notes and compare the current migration approach.");
  assert.equal(need.required, true);
});

test("autonomous capability preserves owner objective separately from operating constitutions", () => {
  assert.match(capability, /owner_objective: text\(baseExecutionObjective, 12000\)/);
});

test("strategic research classifies the owner objective instead of injected Engineering OS text", () => {
  assert.match(strategic, /input\?\.objective_context\?\.owner_objective/);
  assert.match(strategic, /objective: researchObjective/);
});

test("owner objective survives every normalized work-package context boundary", async () => {
  const files = [
    "../lib/code/runtime/CodeAIAutonomousRuntime.js",
    "../lib/code/runtime/CodeAIWorkPackageRuntimeV2.js",
    "../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js",
    "../lib/code/runtime/CodeAIWorkPackageCoreRuntime.js",
  ];
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(source, /owner_objective: text\(source\.owner_objective, 12000\) \|\| null/, file);
  }
});

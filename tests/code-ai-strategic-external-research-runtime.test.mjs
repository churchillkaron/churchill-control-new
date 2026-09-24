import test from "node:test";
import assert from "node:assert/strict";
import { resolveCodeAIStrategicExternalResearchNeed } from "../lib/code/runtime/CodeAIStrategicExternalResearchRuntime.js";

test("local repository verification does not require external research", () => {
  const need = resolveCodeAIStrategicExternalResearchNeed("Inspect app/api/auth/session/route.js in this exact shared workspace, verify it with node --check, and make no source changes. Do not commit or deploy. Use the current repository as authority.");
  assert.equal(need.local_repository_verification_signal, true);
  assert.equal(need.local_repository_verification_only, true);
  assert.equal(need.required, false);
});

test("explicit current Node documentation research still requires external research", () => {
  const need = resolveCodeAIStrategicExternalResearchNeed("Research the current Node.js documentation and compare supported approaches for this implementation.");
  assert.equal(need.required, true);
  assert.equal(need.explicit_research_signal, true);
});

test("controller-added current repository wording cannot create a false research requirement", () => {
  const need = resolveCodeAIStrategicExternalResearchNeed([
    "Build a responsive landing page with Node built-ins and a complete design.",
    "BOUND PRODUCT COMPLETION CRITERIA. These are mandatory engineering outcomes, not optional suggestions.",
    "EMPLOYEE COMPLETION GAPS FROM THE GOVERNED CONTROLLER:",
    "Do not restart satisfied investigation. Use the current repository evidence and close these exact gaps in one coherent work package when possible.",
  ].join("\n"));
  assert.equal(need.required, false);
  assert.equal(need.volatility_signal, false);
});

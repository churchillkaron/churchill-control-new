import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveCreativeStillStyleMemory,
  evaluateCreativeStillStyleDrift,
} from "../lib/creative/stills/runtime/CreativeStillStyleMemoryRuntime.js";

test("approved still memory stores structured style authority without provider prompts", () => {
  const memory = deriveCreativeStillStyleMemory({
    project: { id: "project-1", organization_id: "org-1", metadata: { style_system: { palette: "warm amber", contrast: "deep" } } },
    task: { id: "validation-1", creative_project_id: "project-1", organization_id: "org-1" },
    design: {
      text_layers: [{ role: "headline", font_family: "Inter", font_weight: 600, align: "left", fill: "#fff" }],
      variants: [{ id: "feed", channel: "instagram", width: 1080, height: 1350, fit: "cover", position: "centre" }],
    },
  });
  assert.equal(memory.source, "APPROVED_RELEASE_EVIDENCE_ONLY");
  assert.equal(memory.approved_style.style_system.palette, "warm amber");
  assert.ok(memory.memory_hash);
  assert.equal(memory.policies.provider_instructions_are_not_style_memory, true);
});
test("style drift fails unless the changed dimension is explicitly evolved", () => {
  const baseline = deriveCreativeStillStyleMemory({
    project: { metadata: { style_system: { palette: "warm amber", contrast: "deep" } } },
  });
  const candidate = deriveCreativeStillStyleMemory({
    project: { metadata: { style_system: { palette: "cool silver", contrast: "deep" } } },
  });
  const drift = evaluateCreativeStillStyleDrift({ memory: baseline, candidate });
  assert.equal(drift.passed, false);
  assert.ok(drift.drift_dimensions.includes("style_system"));

  const evolved = evaluateCreativeStillStyleDrift({
    memory: baseline,
    candidate,
    evolution_scope: ["style_system"],
  });
  assert.equal(evolved.passed, true);
  assert.equal(evolved.checks.style_system.intentionally_evolved, true);
});

import {
  persistApprovedCreativeStillStyleMemory,
} from "../lib/creative/stills/runtime/CreativeStillStyleMemoryRuntime.js";

test("failed release cannot enter persistent style memory", async () => {
  await assert.rejects(
    () => persistApprovedCreativeStillStyleMemory({
      project_id: "project-1",
      release_validation: { passed: false },
    }),
    /RELEASE_PASS_REQUIRED/,
  );
});

import {
  selectCreativeStillStyleMemory,
} from "../lib/creative/stills/runtime/CreativeStillStyleMemoryRuntime.js";

test("style memory selection prefers explicit style key before channel and recency", () => {
  const first = deriveCreativeStillStyleMemory({ project: { metadata: { style_key: "editorial", style_system: { palette: "silver" } } }, design: { variants: [{ channel: "instagram" }] } });
  const second = deriveCreativeStillStyleMemory({ project: { metadata: { style_key: "vip-night", style_system: { palette: "amber" } } }, design: { variants: [{ channel: "facebook" }] } });
  const selected = selectCreativeStillStyleMemory({ library: { memories: [first, second] }, style_key: "vip-night", channels: ["instagram"] });
  assert.equal(selected.selected.memory_hash, second.memory_hash);
  assert.equal(selected.policy, "STYLE_KEY_THEN_CHANNEL_COMPATIBILITY_THEN_RECENCY");
});

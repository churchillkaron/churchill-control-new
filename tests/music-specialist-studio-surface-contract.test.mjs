import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { buildMusicTransformationPlan } from "../lib/creative/runtime/engines/MusicEngine.js";

const workspace = fs.readFileSync(
  new URL("../components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx", import.meta.url),
  "utf8",
);
const transformPanel = fs.readFileSync(
  new URL("../components/creative/ProductionStudio/workspaces/MusicRemixPanel.jsx", import.meta.url),
  "utf8",
);
const transformRoute = fs.readFileSync(
  new URL("../app/api/creative/music/remix/route.js", import.meta.url),
  "utf8",
);
const specialistPanel = fs.readFileSync(
  new URL("../components/creative/ProductionStudio/workspaces/MusicSpecialistStudioPanel.jsx", import.meta.url),
  "utf8",
);

const source = "storage://creative-assets/example/source.wav";

for (const [id, label] of [
  ["auto", "Auto Studio"],
  ["compose", "Compose"],
  ["remix", "Remix"],
  ["edit", "Edit / Repaint"],
  ["extend", "Extend"],
  ["stems", "Stems"],
  ["backing", "Backing Track"],
  ["vocal", "Vocal Studio"],
  ["mix", "Mix Studio"],
  ["master", "Master Studio"],
]) {
  test(`Music Studio exposes ${label}`, () => {
    assert.match(workspace, new RegExp(`id: "${id}"`));
    assert.match(workspace, new RegExp(`label: "${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  });
}

test("Edit/Repaint remains benchmark gated", () => {
  const plan = buildMusicTransformationPlan("edit", {
    source_audio: source,
    source_rights_confirmed: true,
    instrumental: true,
    repainting_start: 10,
    repainting_end: 20,
  });
  assert.equal(plan.capability, "ai.audio.edit");
  assert.equal(plan.task_type, "repaint");
  assert.equal(plan.implementation, "IMPLEMENTED");
  assert.equal(plan.certification, "BENCHMARK_REQUIRED");
  assert.equal(plan.executable, false);
  assert.deepEqual(plan.provider_parameters, { repainting_start: 10, repainting_end: 20 });
});

test("Extend remains base-model and benchmark gated", () => {
  const plan = buildMusicTransformationPlan("extend", {
    source_audio: source,
    source_rights_confirmed: true,
    instrumental: true,
  });
  assert.equal(plan.capability, "ai.audio.extend");
  assert.equal(plan.task_type, "complete");
  assert.equal(plan.model_lane, "acestep-v15-base");
  assert.equal(plan.implementation, "BASE_MODEL_LANE_REQUIRED");
  assert.equal(plan.certification, "BASE_MODEL_AND_BENCHMARK_REQUIRED");
  assert.equal(plan.executable, false);
});

test("Shared transform route is plan-only for remix edit and extend", () => {
  assert.match(transformRoute, /new Set\(\["remix", "edit", "extend"\]\)/);
  assert.match(transformRoute, /buildMusicTransformationPlan\(operation/);
  assert.match(transformRoute, /execution_submitted: false/);
  assert.match(transformRoute, /execution_route_enabled: false/);
  assert.doesNotMatch(transformRoute, /executeService/);
  assert.doesNotMatch(transformRoute, /settlePendingService/);
});

test("Shared transform panel exposes structured repaint controls and truthful extension blocker", () => {
  assert.match(transformPanel, /operation = "remix"/);
  assert.match(transformPanel, /repainting_start/);
  assert.match(transformPanel, /repainting_end/);
  assert.match(transformPanel, /Base model \+ benchmark required/);
  assert.match(transformPanel, /execution_route_enabled === true/);
  assert.doesNotMatch(transformPanel, /prompt/i);
});

test("Vocal Mix and Master specialist panel remains on Auto Studio runtime", () => {
  assert.match(specialistPanel, /\/api\/creative\/music\/auto-studio/);
  assert.match(specialistPanel, /vocal_polish/);
  assert.match(specialistPanel, /mix_and_master/);
  assert.match(specialistPanel, /release_master/);
});

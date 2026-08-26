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

test("Extend uses XL temporal outpaint and remains benchmark gated", () => {
  const plan = buildMusicTransformationPlan("extend", {
    source_audio: source,
    source_rights_confirmed: true,
    instrumental: true,
    extension_seconds: 30,
    continuity_overlap_seconds: 4,
  });
  assert.equal(plan.capability, "ai.audio.extend");
  assert.equal(plan.task_type, "repaint");
  assert.equal(plan.model_lane, "acestep-v15-xl-turbo");
  assert.equal(plan.implementation, "IMPLEMENTED");
  assert.equal(plan.certification, "BENCHMARK_REQUIRED");
  assert.equal(plan.executable, false);
  assert.equal(plan.temporal_extension.strategy, "XL_TURBO_REPAINT_RIGHT_OUTPAINT_V1");
  assert.equal(plan.temporal_extension.source_duration_measured_by_worker, true);
  assert.equal(plan.temporal_extension.right_padding_outpaint_required, true);
  assert.equal(plan.temporal_extension.temporal_extension_proven, false);
  assert.deepEqual(plan.provider_parameters, {
    extension_seconds: 30,
    continuity_overlap_seconds: 4,
    temporal_extend_strategy: "XL_TURBO_REPAINT_RIGHT_OUTPAINT_V1",
  });
  assert.equal(plan.output_spec.duration_rule, "SOURCE_DURATION_PLUS_EXTENSION_SECONDS_BOUNDED_BY_WORKER_MAX");
});

test("Shared transform route is plan-only for remix edit and extend", () => {
  assert.match(transformRoute, /new Set\(\["remix", "edit", "extend"\]\)/);
  assert.match(transformRoute, /buildTemporalExtendPlan/);
  assert.match(transformRoute, /XL_TURBO_REPAINT_RIGHT_OUTPAINT_V1/);
  assert.match(transformRoute, /execution_submitted: false/);
  assert.match(transformRoute, /execution_route_enabled: false/);
  assert.doesNotMatch(transformRoute, /executeService/);
  assert.doesNotMatch(transformRoute, /settlePendingService/);
});

test("Shared transform panel exposes repaint and temporal extension controls truthfully", () => {
  assert.match(transformPanel, /operation = "remix"/);
  assert.match(transformPanel, /repainting_start/);
  assert.match(transformPanel, /repainting_end/);
  assert.match(transformPanel, /extension_seconds/);
  assert.match(transformPanel, /continuity_overlap_seconds/);
  assert.match(transformPanel, /Temporal outpaint benchmark pending/);
  assert.match(transformPanel, /XL Turbo tail outpainting is implemented/);
  assert.match(transformPanel, /execution_route_enabled === true/);
  assert.doesNotMatch(transformPanel, /Base model \+ benchmark required/);
  assert.doesNotMatch(transformPanel, /prompt/i);
});

test("Vocal Mix and Master specialist panel remains on Auto Studio runtime", () => {
  assert.match(specialistPanel, /\/api\/creative\/music\/auto-studio/);
  assert.match(specialistPanel, /vocal_polish/);
  assert.match(specialistPanel, /mix_and_master/);
  assert.match(specialistPanel, /release_master/);
});

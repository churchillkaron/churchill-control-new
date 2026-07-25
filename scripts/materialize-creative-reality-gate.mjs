#!/usr/bin/env node

import fs from "node:fs";
import { spawnSync } from "node:child_process";

function hasMarker(path, marker) {
  if (!fs.existsSync(path)) return false;
  return fs.readFileSync(path, "utf8").includes(marker);
}

function executeScript(path) {
  const check = spawnSync(process.execPath, ["--check", path], {
    stdio: "inherit",
  });
  if (check.status !== 0) {
    throw new Error(`CREATIVE_MATERIALIZER_SYNTAX_FAILED:${path}`);
  }

  const run = spawnSync(process.execPath, [path], {
    stdio: "inherit",
  });
  if (run.status !== 0) {
    throw new Error(`CREATIVE_MATERIALIZER_EXECUTION_FAILED:${path}`);
  }
}

const layers = [
  {
    name: "V2_DECLARED_EVIDENCE_AND_PROMPT_BUDGET",
    script: "scripts/apply-creative-live-smoke-hardening-v2.mjs",
    markers: [
      [
        "lib/creative/production-graph/planner/ProductionGraphPlanner.js",
        "CREATIVE_DECLARED_EVIDENCE_ASSET_HANDOFF_V2",
      ],
      [
        "lib/creative/production/contracts/CreativeImagePromptBudgetRuntime.js",
        "CREATIVE_IMAGE_SPECIFICATION_COMPACTION_V2",
      ],
      [
        "lib/operations/tasks/runtime/ProductionTaskRuntime.js",
        "CREATIVE_RUNTIME_EVIDENCE_REFERENCE_RECOVERY_V2",
      ],
      [
        "lib/platform/service-runtime/providers/openai/OpenAIProvider.js",
        "CREATIVE_OPENAI_FINAL_PROMPT_BUDGET_V2",
      ],
    ],
  },
  {
    name: "V3_STORYBOARD_EVIDENCE_BINDING",
    script: "scripts/apply-creative-evidence-binding-v3.mjs",
    markers: [
      [
        "lib/creative/storyboard/runtime/CreativeStoryboardExecutionContractConvergence.js",
        "CREATIVE_STORYBOARD_EVIDENCE_BINDING_V3",
      ],
    ],
  },
  {
    name: "V4_MISSION_EVIDENCE_SELECTION",
    script: "scripts/apply-creative-mission-evidence-selection-v4.mjs",
    markers: [
      [
        "app/api/creative/missions/compose/route.js",
        "CREATIVE_MISSION_RELEVANT_EVIDENCE_IMPORT_V4",
      ],
      [
        "lib/creative/knowledge/CreativeBusinessTruthRuntime.js",
        "CREATIVE_UPLOADED_REFERENCE_APPROVAL_V2",
      ],
      [
        "lib/creative/assets/evidence/runtime/CreativeMissionEvidenceSelectionRuntime.js",
        "CREATIVE_MISSION_EVIDENCE_SELECTION_V4",
      ],
    ],
  },
  {
    name: "V5_EVIDENCE_FIDELITY_AND_DIVERSITY",
    script: "scripts/repair-and-run-creative-evidence-fidelity-v5.mjs",
    markers: [
      [
        "lib/creative/production/contracts/CreativeShotDirectionEnrichmentRuntime.js",
        "CREATIVE_CANONICAL_EVIDENCE_ACTOR_MERGE_V5",
      ],
      [
        "lib/operations/tasks/runtime/ProductionTaskRuntime.js",
        "CREATIVE_GENERATED_FRAME_QA_AND_CORRECTION_LOOP_V5",
      ],
      [
        "lib/platform/service-runtime/providers/openai/OpenAIProvider.js",
        "CREATIVE_VISUAL_EVIDENCE_COMPARISON_QA_V5",
      ],
      [
        "lib/creative/production/contracts/CreativeProviderInputRuntime.js",
        "CREATIVE_EXACT_EVIDENCE_RENDERING_POLICY_V5",
      ],
      [
        "lib/creative/production-graph/planner/ProductionGraphPlanner.js",
        "CREATIVE_MASTER_STILL_FIDELITY_AND_DIVERSITY_GATE_V5",
      ],
    ],
  },
  {
    name: "V6_SELECTION_SCOPE_AND_CORRECTION_RETRIES",
    script: "scripts/apply-creative-evidence-selection-retry-v6.mjs",
    markers: [
      [
        "lib/creative/knowledge/CreativeBusinessTruthRuntime.js",
        "CREATIVE_ORGANIZATION_UPLOAD_SCOPE_V3",
      ],
      [
        "lib/creative/assets/evidence/runtime/CreativeMissionEvidenceSelectionRuntime.js",
        "CREATIVE_STRONG_RELEVANCE_MISSION_AUTHORIZATION_V6",
      ],
      [
        "lib/operations/tasks/runtime/ProductionTaskRuntime.js",
        "CREATIVE_QUALITY_REVISION_ATTEMPT_BUDGET_V6",
      ],
    ],
  },
  {
    name: "V7_PRE_SPEND_EVIDENCE_GATE",
    script: "scripts/apply-creative-pre-spend-evidence-gate-v7.mjs",
    markers: [
      [
        "lib/creative/assets/evidence/runtime/CreativeMissionEvidenceSelectionRuntime.js",
        "CREATIVE_PRE_SPEND_EVIDENCE_DIAGNOSTICS_V7",
      ],
      [
        "scripts/creative-end-to-end-smoke.sh",
        "CREATIVE_PRE_SPEND_EVIDENCE_GATE_V7",
      ],
      [
        "scripts/creative-live-smoke-local.sh",
        "CREATIVE_LIVE_SMOKE_REQUIRED_EVIDENCE_ROLES_V7",
      ],
    ],
  },
];

for (const layer of layers) {
  const missing = layer.markers.filter(([path, marker]) =>
    !hasMarker(path, marker),
  );

  if (missing.length === 0) {
    console.log(`CREATIVE_MATERIALIZER_${layer.name}=ALREADY_CANONICAL`);
    continue;
  }

  console.log(
    `CREATIVE_MATERIALIZER_${layer.name}=APPLYING:${missing
      .map(([path, marker]) => `${path}:${marker}`)
      .join(",")}`,
  );
  executeScript(layer.script);

  const unresolved = layer.markers.filter(([path, marker]) =>
    !hasMarker(path, marker),
  );
  if (unresolved.length) {
    throw new Error(
      `CREATIVE_MATERIALIZER_MARKERS_MISSING:${layer.name}:${unresolved
        .map(([path, marker]) => `${path}:${marker}`)
        .join(",")}`,
    );
  }

  console.log(`CREATIVE_MATERIALIZER_${layer.name}=APPLIED`);
}

console.log("CREATIVE_REALITY_GATE_MATERIALIZATION=PASS");

#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
  );
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(canonical(value)))
    .digest("hex");
}

function normalizedKey(value) {
  return text(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replaceAll("-", "_")
    .toLowerCase();
}

function forbiddenPromptKey(key) {
  const normalized = normalizedKey(key);
  return normalized === "prompt" ||
    normalized.endsWith("_prompt") ||
    normalized.includes("prompt_template") ||
    normalized.includes("prompt_text");
}

function stripPromptFields(value) {
  if (Array.isArray(value)) return value.map(stripPromptFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !forbiddenPromptKey(key))
      .map(([key, child]) => [key, stripPromptFields(child)]),
  );
}

function promptFieldPaths(value, current = "root", output = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      promptFieldPaths(item, `${current}.${index}`, output),
    );
    return output;
  }
  if (!value || typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value)) {
    const next = `${current}.${key}`;
    if (forbiddenPromptKey(key)) output.push(next);
    promptFieldPaths(child, next, output);
  }
  return output;
}

function stableId(prefix, seed) {
  const hash = digest(`${prefix}:${seed}`).slice(0, 24);
  return `${prefix}-${hash}`;
}

function readJson(filePath, label) {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`${label}_FILE_NOT_FOUND:${absolute}`);
  }
  const raw = fs.readFileSync(absolute, "utf8");
  return { absolute, raw, value: JSON.parse(raw) };
}

function directionPlan(value = {}) {
  return object(
    value.plan ||
      value.direction?.plan ||
      value.output?.plan ||
      value,
  );
}

function normalizeDirectionDocuments(plan = {}, projectId) {
  const storyboard = {
    id: stableId("storyboard-preview", projectId),
    title: plan.concept?.title || "Churchill 60-second film",
    synopsis:
      plan.concept?.narrative ||
      plan.concept?.message ||
      "Approved Churchill film direction",
  };

  const scenes = [];
  const shots = [];
  for (const [sceneIndex, sourceScene] of list(plan.scenes).entries()) {
    const sceneId = text(sourceScene.id) ||
      stableId("scene-preview", `${projectId}:${sceneIndex + 1}`);
    const scene = {
      ...sourceScene,
      id: sceneId,
      storyboard_id: storyboard.id,
      scene_number: finite(sourceScene.scene_number, sceneIndex + 1),
      metadata: {
        ...object(sourceScene.metadata),
        master_plan_index: sceneIndex,
      },
    };
    scenes.push(scene);

    for (const [shotIndex, sourceShot] of list(sourceScene.shots).entries()) {
      shots.push({
        ...sourceShot,
        id: text(sourceShot.id) ||
          stableId(
            "shot-preview",
            `${projectId}:${sceneIndex + 1}:${shotIndex + 1}`,
          ),
        scene_id: sceneId,
        storyboard_id: storyboard.id,
        scene_number: scene.scene_number,
        shot_number: finite(sourceShot.shot_number, shotIndex + 1),
        generation: object(sourceShot.generation),
        metadata: {
          ...object(sourceShot.metadata),
          master_plan_scene_index: sceneIndex,
          master_plan_shot_index: shotIndex,
        },
      });
    }
  }

  return { storyboard, scenes, shots };
}

function hasAudioGenerationNode(graph = {}) {
  return list(graph.nodes).some((node) => {
    const capability = text(
      node.generation?.capability || node.generation?.service,
    ).toLowerCase();
    return capability.includes("music") ||
      capability.includes("audio") ||
      capability.includes("voice") ||
      capability.includes("sfx");
  });
}

function masterDuration(plan = {}) {
  const deliverable = object(list(plan.deliverables)[0]);
  const output = object(deliverable.output_spec);
  const explicit = finite(
    output.duration_seconds ?? plan.temporal_contract?.duration_seconds,
  );
  if (explicit && explicit > 0) return explicit;
  const total = list(plan.scenes).reduce(
    (sum, scene) => sum + Math.max(0, finite(scene.duration_seconds, 0)),
    0,
  );
  if (total > 0) return total;
  throw new Error("PRODUCTION_GRAPH_PREVIEW_DURATION_REQUIRED");
}

function addSoundtrackNode(graph, plan, projectId) {
  if (hasAudioGenerationNode(graph)) return graph;
  const duration = masterDuration(plan);
  const node = {
    id: `master-soundtrack-${projectId}`,
    type: "MASTER_SOUNDTRACK",
    title: "Original editorial master soundtrack",
    description:
      "Generate the exact-duration original instrumental score used by the final Churchill film mix.",
    duration_seconds: duration,
    priority: 20,
    intent: {
      purpose:
        "Carry the complete emotional and editorial arc while leaving space for authentic venue sound.",
      emotion:
        plan.story?.emotional_arc ||
        plan.concept?.emotional_promise ||
        "",
      music_world: object(plan.music_world),
      story: object(plan.story),
      concept: object(plan.concept),
      duration_seconds: duration,
    },
    requirements: {
      output_spec: {
        duration_seconds: duration,
        exact_duration_required: true,
        format: "wav",
        sample_rate: 48000,
        channels: 2,
        instrumental: true,
        render_role: "EDITORIAL_SOUNDTRACK",
        include_in_master: true,
      },
      rights_requirements: {
        original_composition_required: true,
        commercial_usage_required: true,
        protected_style_imitation_prohibited: true,
      },
      negative_constraints: [
        "No vocals or spoken words",
        "No protected artist imitation",
        "No recognisable copyrighted melody",
        "No generic corporate uplift or trailer braams",
        "No truncation or accidental looping",
      ],
      human_approval_required: false,
    },
    assets: [],
    generation: {
      required: true,
      service: "ai.music.generate",
      capability: "ai.music.generate",
      provider: "fal",
      model: "fal-ai/ace-step/prompt-to-audio",
      provider_parameters: {
        duration_seconds: duration,
        instrumental: true,
      },
      output_spec: {
        duration_seconds: duration,
        exact_duration_required: true,
        format: "wav",
        sample_rate: 48000,
        channels: 2,
        instrumental: true,
      },
      estimated_cost: 0,
      estimated_seconds: duration,
      status: "WAITING",
    },
    metadata: {
      workflow_kind: "TEMPORAL",
      production_step_id: "soundtrack",
      audio_role: "music",
      render_role: "EDITORIAL_SOUNDTRACK",
      include_in_master: true,
      exact_duration_required: true,
      prompt_serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
    },
  };

  return {
    ...graph,
    nodes: [...list(graph.nodes), node],
    metadata: {
      ...object(graph.metadata),
      temporal_soundtrack_contract:
        "CREATIVE_TEMPORAL_EDITORIAL_SOUNDTRACK_V1",
      temporal_soundtrack_node_id: node.id,
      temporal_soundtrack_duration_seconds: duration,
      temporal_soundtrack_exact_duration_required: true,
    },
  };
}

function dependencyIntegrity(graph = {}) {
  const nodeIds = new Set(list(graph.nodes).map((node) => text(node.id)));
  const invalid = list(graph.edges).filter((edge) =>
    !nodeIds.has(text(edge.from)) || !nodeIds.has(text(edge.to)),
  );
  const dependencyEdges = list(graph.edges)
    .filter((edge) => edge.type === "DEPENDS_ON");
  return {
    passed: invalid.length === 0,
    invalid_edges: invalid,
    dependency_edge_count: dependencyEdges.length,
  };
}

function serviceCounts(steps = []) {
  const counts = {};
  for (const step of steps) {
    const service = text(step.service_code || step.capability) || "UNKNOWN";
    counts[service] = (counts[service] || 0) + 1;
  }
  return counts;
}

const direction = readJson(process.argv[2], "DIRECTION");
const manifest = readJson(process.argv[3], "APPROVAL_MANIFEST");
const plan = directionPlan(direction.value);
const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const missionId = text(process.env.CREATIVE_MISSION_ID);
if (!organizationId) throw new Error("ORGANIZATION_ID_REQUIRED");
if (!projectId) throw new Error("CREATIVE_PROJECT_ID_REQUIRED");
if (!missionId) throw new Error("CREATIVE_MISSION_ID_REQUIRED");
if (list(manifest.value.blockers).length) {
  throw new Error(`APPROVAL_MANIFEST_BLOCKED:${manifest.value.blockers.join(",")}`);
}
if (manifest.value.authorization?.production_authorized !== false) {
  throw new Error("APPROVAL_MANIFEST_PREVIEW_MUST_REMAIN_UNAUTHORIZED");
}
if (manifest.value.direction?.sha256 !== digest(direction.raw)) {
  throw new Error("APPROVAL_MANIFEST_DIRECTION_HASH_MISMATCH");
}

const [
  { supabaseAdmin },
  { ProductionGraphRuntime },
  { AssetReuseEngine },
  { CreativeProductionTaskMaterializationRuntime },
  { buildExecutionPlan },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/creative/production-graph/runtime/ProductionGraphRuntime"),
  import("@/lib/creative/assets/reuse/AssetReuseEngine"),
  import("@/lib/creative/execution/runtime/CreativeProductionTaskMaterializationRuntime"),
  import("@/lib/creative/execution/planner/ExecutionPlanner"),
]);

async function count(table, filters = {}) {
  let query = supabaseAdmin
    .from(table)
    .select("id", { count: "exact", head: true });
  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }
  const { count: result, error } = await query;
  if (error) throw error;
  return Number(result || 0);
}

const filters = {
  organization_id: organizationId,
  creative_project_id: projectId,
};
const before = {
  graph_count: await count("creative_production_graphs", filters),
  task_count: await count("production_tasks", filters),
  usage_count: await count("service_usage", { organization_id: organizationId }),
};

const documents = normalizeDirectionDocuments(plan, projectId);
let graph = await ProductionGraphRuntime.preview({
  organization_id: organizationId,
  creative_mission_id: missionId,
  creative_project_id: projectId,
  storyboard: documents.storyboard,
  scenes: documents.scenes,
  shots: documents.shots,
  creative_plan: plan,
});
graph = addSoundtrackNode(graph, plan, projectId);

graph.nodes = await Promise.all(
  list(graph.nodes).map((node) =>
    AssetReuseEngine.resolveNode(node, organizationId),
  ),
);

graph = stripPromptFields(graph);
graph.nodes = list(graph.nodes).map((node) =>
  node.generation?.required === true
    ? CreativeProductionTaskMaterializationRuntime.attach(node)
    : node,
);
graph.metadata = {
  ...object(graph.metadata),
  approval_manifest_hash: manifest.value.manifest_hash,
  approval_direction_sha256: manifest.value.direction.sha256,
  approval_cost_estimate_sha256: manifest.value.cost_estimate.sha256,
  approved_maximum_customer_price:
    manifest.value.authorization?.maximum_customer_price,
  promptless_persistence_contract:
    "CREATIVE_PROMPTLESS_GRAPH_EXECUTION_TASK_V1",
  provider_instruction_serialization_boundary:
    "EXECUTION_TRANSPORT_ONLY",
  preview_only: true,
  materialization_authorized: false,
};
graph.cost_plan = {
  ...object(graph.cost_plan),
  currency: manifest.value.currency,
  estimated_cost: manifest.value.cost_estimate?.selected_baseline,
  approved_cost: 0,
  maximum_customer_price:
    manifest.value.authorization?.maximum_customer_price,
  approval_required: true,
  approved: false,
};

const executionPlan = stripPromptFields(buildExecutionPlan({
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph: graph,
}));

const graphPromptPaths = promptFieldPaths(graph, "graph");
const executionPromptPaths = promptFieldPaths(executionPlan, "execution_plan");
const dependency = dependencyIntegrity(graph);
const generationNodes = list(graph.nodes)
  .filter((node) => node.generation?.required === true);
const missingTaskContracts = generationNodes.filter((node) =>
  !CreativeProductionTaskMaterializationRuntime.verify(
    node.requirements?.task_materialization_contract,
  ),
);
const serviceCount = serviceCounts(executionPlan.steps);

const after = {
  graph_count: await count("creative_production_graphs", filters),
  task_count: await count("production_tasks", filters),
  usage_count: await count("service_usage", { organization_id: organizationId }),
};

const blockers = [];
if (graphPromptPaths.length) blockers.push("GRAPH_PROMPT_FIELDS_PERSISTED");
if (executionPromptPaths.length) blockers.push("EXECUTION_PROMPT_FIELDS_PERSISTED");
if (!dependency.passed) blockers.push("GRAPH_DEPENDENCY_INTEGRITY_FAILED");
if (missingTaskContracts.length) blockers.push("TASK_MATERIALIZATION_CONTRACT_MISSING");
if (before.graph_count !== after.graph_count) blockers.push("GRAPH_DATABASE_CHANGED");
if (before.task_count !== after.task_count) blockers.push("TASK_DATABASE_CHANGED");
if (before.usage_count !== after.usage_count) blockers.push("USAGE_DATABASE_CHANGED");
if (generationNodes.length !== list(executionPlan.steps).length) {
  blockers.push("EXECUTION_STEP_COUNT_MISMATCH");
}
if (Number(serviceCount["ai.video.generate"] || 0) !== 13) {
  blockers.push("VIDEO_GENERATION_STEP_COUNT_INVALID");
}
if (Number(serviceCount["ai.image.analyze"] || 0) !== 13) {
  blockers.push("PERCEPTUAL_REVIEW_STEP_COUNT_INVALID");
}
if (Number(serviceCount["ai.music.generate"] || 0) !== 1) {
  blockers.push("SOUNDTRACK_STEP_COUNT_INVALID");
}

const report = {
  contract: "CREATIVE_PRODUCTION_GRAPH_READ_ONLY_PREVIEW_V1",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  creative_mission_id: missionId,
  direction_file: direction.absolute,
  direction_sha256: digest(direction.raw),
  approval_manifest_file: manifest.absolute,
  approval_manifest_hash: manifest.value.manifest_hash,
  read_only: true,
  graph,
  execution_plan: executionPlan,
  summary: {
    node_count: list(graph.nodes).length,
    edge_count: list(graph.edges).length,
    generation_node_count: generationNodes.length,
    execution_step_count: list(executionPlan.steps).length,
    scene_node_count: list(graph.nodes).filter((node) => node.type === "SCENE").length,
    shot_generation_count: Number(serviceCount["ai.video.generate"] || 0),
    perceptual_review_count: Number(serviceCount["ai.image.analyze"] || 0),
    soundtrack_generation_count: Number(serviceCount["ai.music.generate"] || 0),
    identity_keyframe_count: list(graph.nodes)
      .filter((node) => node.type === "IDENTITY_KEYFRAME").length,
    lip_sync_count: list(graph.nodes)
      .filter((node) => node.type === "AUDIO_CONDITIONED_LIPSYNC").length,
    dependency_edge_count: dependency.dependency_edge_count,
    graph_prompt_field_count: graphPromptPaths.length,
    execution_prompt_field_count: executionPromptPaths.length,
    task_contract_missing_count: missingTaskContracts.length,
    service_counts: serviceCount,
    selected_baseline: manifest.value.cost_estimate?.selected_baseline,
    approval_ceiling:
      manifest.value.authorization?.maximum_customer_price,
  },
  forensic: {
    before,
    after,
    graph_changed: before.graph_count !== after.graph_count,
    tasks_changed: before.task_count !== after.task_count,
    usage_changed: before.usage_count !== after.usage_count,
    provider_calls_executed: false,
    wallet_changed: false,
    production_authorized: false,
    publication_authorized: false,
  },
  prompt_paths: {
    graph: graphPromptPaths,
    execution_plan: executionPromptPaths,
  },
  dependency,
  blockers,
  readiness: blockers.length ? "FAIL" : "PASS",
};

const output = path.resolve(
  text(process.env.GRAPH_PREVIEW_OUTPUT) ||
    "/tmp/churchill-production-graph-preview.json",
);
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("READ-ONLY CREATIVE PRODUCTION GRAPH PREVIEW");
console.log("============================================================");
console.log(`OUTPUT=${output}`);
console.log(`APPROVAL_MANIFEST_HASH=${report.approval_manifest_hash}`);
console.log(`NODE_COUNT=${report.summary.node_count}`);
console.log(`EDGE_COUNT=${report.summary.edge_count}`);
console.log(`GENERATION_NODE_COUNT=${report.summary.generation_node_count}`);
console.log(`EXECUTION_STEP_COUNT=${report.summary.execution_step_count}`);
console.log(`SHOT_GENERATION_COUNT=${report.summary.shot_generation_count}`);
console.log(`PERCEPTUAL_REVIEW_COUNT=${report.summary.perceptual_review_count}`);
console.log(`SOUNDTRACK_GENERATION_COUNT=${report.summary.soundtrack_generation_count}`);
console.log(`IDENTITY_KEYFRAME_COUNT=${report.summary.identity_keyframe_count}`);
console.log(`LIP_SYNC_COUNT=${report.summary.lip_sync_count}`);
console.log(`DEPENDENCY_EDGE_COUNT=${report.summary.dependency_edge_count}`);
console.log(`GRAPH_PROMPT_FIELD_COUNT=${report.summary.graph_prompt_field_count}`);
console.log(`EXECUTION_PROMPT_FIELD_COUNT=${report.summary.execution_prompt_field_count}`);
console.log(`TASK_CONTRACT_MISSING_COUNT=${report.summary.task_contract_missing_count}`);
console.log(`SERVICE_COUNTS=${JSON.stringify(report.summary.service_counts)}`);
console.log(`SELECTED_BASELINE=${report.summary.selected_baseline}`);
console.log(`APPROVAL_CEILING=${report.summary.approval_ceiling}`);
console.log(`GRAPH_COUNT_BEFORE=${before.graph_count}`);
console.log(`GRAPH_COUNT_AFTER=${after.graph_count}`);
console.log(`TASK_COUNT_BEFORE=${before.task_count}`);
console.log(`TASK_COUNT_AFTER=${after.task_count}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`GRAPH_PREVIEW_READINESS=${report.readiness}`);
console.log(`GRAPH_PREVIEW_BLOCKER_COUNT=${blockers.length}`);
console.log(`GRAPH_PREVIEW_BLOCKERS=${JSON.stringify(blockers)}`);
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
console.log("GRAPH_CREATED=NO");
console.log("TASKS_CREATED=NO");
console.log("PRODUCTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (blockers.length) process.exitCode = 2;

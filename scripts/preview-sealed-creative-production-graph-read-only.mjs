#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

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

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stable(value[key])]),
  );
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(stable(value)))
    .digest("hex");
}

function readJson(filePath, label) {
  const absolute = path.resolve(text(filePath));
  if (!absolute || !fs.existsSync(absolute)) {
    throw new Error(`${label}_FILE_NOT_FOUND:${absolute || "MISSING"}`);
  }
  const raw = fs.readFileSync(absolute, "utf8");
  return {
    absolute,
    raw,
    file_sha256: sha256(raw),
    value: JSON.parse(raw),
  };
}

function coreWithout(value, key) {
  const output = { ...object(value) };
  delete output[key];
  return output;
}

function normalizedKey(value) {
  return text(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replaceAll("-", "_")
    .toLowerCase();
}

function forbiddenPersistenceKey(key) {
  const normalized = normalizedKey(key);
  return normalized === "prompt" ||
    normalized.endsWith("_prompt") ||
    normalized.includes("prompt_template") ||
    normalized.includes("prompt_text") ||
    normalized === "instruction" ||
    normalized === "instructions" ||
    normalized.endsWith("_instruction") ||
    normalized.endsWith("_instructions") ||
    normalized === "provider_instruction" ||
    normalized === "transport_instruction";
}

function stripForbiddenFields(value) {
  if (Array.isArray(value)) return value.map(stripForbiddenFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !forbiddenPersistenceKey(key))
      .map(([key, child]) => [key, stripForbiddenFields(child)]),
  );
}

function forbiddenFieldPaths(value, current = "root", output = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      forbiddenFieldPaths(item, `${current}[${index}]`, output));
    return output;
  }
  if (!value || typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value)) {
    const next = `${current}.${key}`;
    if (forbiddenPersistenceKey(key)) output.push(next);
    forbiddenFieldPaths(child, next, output);
  }
  return output;
}

function stableId(prefix, seed) {
  return `${prefix}-${sha256(`${prefix}:${seed}`).slice(0, 24)}`;
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
    title: text(plan.concept?.title) || "Churchill sixty-second film",
    synopsis:
      text(plan.concept?.statement) ||
      text(plan.concept?.message) ||
      "Sealed Churchill source-evidenced film direction",
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
        sealed_preview_scene_index: sceneIndex,
      },
    };
    scenes.push(scene);

    for (const [shotIndex, sourceShot] of list(sourceScene.shots).entries()) {
      shots.push({
        ...sourceShot,
        id: text(sourceShot.id) || stableId(
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
          sealed_preview_scene_index: sceneIndex,
          sealed_preview_shot_index: shotIndex,
        },
      });
    }
  }

  return { storyboard, scenes, shots };
}

function shotDuration(shot = {}) {
  return finite(
    shot.duration_seconds ??
      shot.duration ??
      shot.timing?.duration_seconds ??
      shot.timing?.duration,
    0,
  );
}

function masterDuration(plan = {}) {
  const shotTotal = list(plan.scenes).reduce(
    (sceneSum, scene) => sceneSum + list(scene.shots).reduce(
      (shotSum, shot) => shotSum + Math.max(0, shotDuration(shot)),
      0,
    ),
    0,
  );
  if (shotTotal > 0) return shotTotal;
  const deliverable = object(list(plan.deliverables)[0]);
  const output = object(deliverable.output_spec);
  const explicit = finite(
    output.duration_seconds ?? plan.temporal_contract?.duration_seconds,
  );
  if (explicit && explicit > 0) return explicit;
  throw new Error("SEALED_GRAPH_PREVIEW_DURATION_REQUIRED");
}

function hasSoundtrackNode(graph = {}) {
  return list(graph.nodes).some((node) => {
    const capability = text(
      node.generation?.capability || node.generation?.service,
    ).toLowerCase();
    return capability === "ai.music.generate";
  });
}

function addSoundtrackNode(graph, plan, projectId) {
  if (hasSoundtrackNode(graph)) return graph;
  const duration = masterDuration(plan);
  const node = {
    id: `master-soundtrack-${projectId}`,
    type: "MASTER_SOUNDTRACK",
    title: "One Place. Seven Moods. Original Score",
    description:
      "Create the exact-duration instrumental score for the sealed Churchill film, following the verified narrative arc without imitating a protected artist or melody.",
    duration_seconds: duration,
    priority: 20,
    intent: {
      purpose:
        "Carry recognition, atmosphere, craft, play, warmth, crescendo, and signature across the complete film.",
      concept: object(plan.concept),
      strategy: object(plan.strategy),
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
        "No generic corporate uplift",
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
      provider_serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
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
  const nodes = list(graph.nodes);
  const nodeIds = nodes.map((node) => text(node.id));
  const nodeSet = new Set(nodeIds);
  const duplicateIds = nodeIds.filter((id, index) =>
    id && nodeIds.indexOf(id) !== index);
  const invalidEdges = list(graph.edges).filter((edge) =>
    !nodeSet.has(text(edge.from)) || !nodeSet.has(text(edge.to)),
  );
  return {
    passed: duplicateIds.length === 0 && invalidEdges.length === 0,
    duplicate_node_ids: [...new Set(duplicateIds)],
    invalid_edges: invalidEdges,
  };
}

function serviceCounts(steps = []) {
  const output = {};
  for (const step of list(steps)) {
    const service = text(step.service_code || step.capability || step.service) ||
      "UNKNOWN";
    output[service] = (output[service] || 0) + 1;
  }
  return output;
}

async function exactState(supabaseAdmin, organizationId, projectId) {
  const [graphs, tasks, usage, wallet] = await Promise.all([
    supabaseAdmin
      .from("creative_production_graphs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("creative_project_id", projectId),
    supabaseAdmin
      .from("creative_production_tasks")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("creative_project_id", projectId),
    supabaseAdmin
      .from("platform_service_usage")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabaseAdmin
      .from("organization_wallets")
      .select("available_balance,currency,updated_at")
      .eq("organization_id", organizationId)
      .single(),
  ]);
  for (const result of [graphs, tasks, usage, wallet]) {
    if (result.error) throw result.error;
  }
  return {
    graph_count: Number(graphs.count || 0),
    task_count: Number(tasks.count || 0),
    usage_count: Number(usage.count || 0),
    wallet_balance: Number(wallet.data?.available_balance || 0),
    wallet_currency: text(wallet.data?.currency) || "THB",
    wallet_updated_at: wallet.data?.updated_at || null,
  };
}

const direction = readJson(process.argv[2], "DIRECTION");
const manifest = readJson(process.argv[3], "SEALED_APPROVAL_MANIFEST");
const plan = directionPlan(direction.value);
const manifestValue = object(manifest.value);
const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID || process.env.PROJECT_ID);
const missionId = text(process.env.CREATIVE_MISSION_ID);
if (!organizationId) throw new Error("ORGANIZATION_ID_REQUIRED");
if (!projectId) throw new Error("CREATIVE_PROJECT_ID_REQUIRED");
if (!missionId) throw new Error("CREATIVE_MISSION_ID_REQUIRED");

const planSha = sha256(plan);
const envelopeSha = sha256(direction.value);
const manifestSha = sha256(coreWithout(manifestValue, "manifest_sha256"));
const preflightBlockers = [];

if (manifestValue.contract !==
  "CREATIVE_SEALED_PRODUCTION_APPROVAL_MANIFEST_V2") {
  preflightBlockers.push("MANIFEST_CONTRACT_INVALID");
}
if (manifestValue.readiness !== "PASS" || list(manifestValue.blockers).length) {
  preflightBlockers.push("MANIFEST_NOT_READY");
}
if (manifestSha !== text(manifestValue.manifest_sha256)) {
  preflightBlockers.push("MANIFEST_SHA_MISMATCH");
}
if (text(manifestValue.organization_id) !== organizationId) {
  preflightBlockers.push("MANIFEST_ORGANIZATION_MISMATCH");
}
if (text(manifestValue.creative_project_id) !== projectId) {
  preflightBlockers.push("MANIFEST_PROJECT_MISMATCH");
}
if (text(manifestValue.creative_mission_id) !== missionId) {
  preflightBlockers.push("MANIFEST_MISSION_MISMATCH");
}
if (text(manifestValue.direction?.plan_sha256) !== planSha) {
  preflightBlockers.push("MANIFEST_DIRECTION_PLAN_SHA_MISMATCH");
}
if (text(manifestValue.direction?.envelope_sha256) !== envelopeSha) {
  preflightBlockers.push("MANIFEST_DIRECTION_ENVELOPE_SHA_MISMATCH");
}
if (manifestValue.quality_audit?.world_class_readiness !== "PASS" ||
  Number(manifestValue.quality_audit?.total_score) !== 100) {
  preflightBlockers.push("MANIFEST_QUALITY_NOT_READY");
}
if (Number(manifestValue.cost_estimate?.production_work_item_count) !== 27 ||
  Number(manifestValue.cost_estimate?.shot_generation_count) !== 13 ||
  Number(manifestValue.cost_estimate?.perceptual_review_count) !== 13 ||
  Number(manifestValue.cost_estimate?.soundtrack_generation_count) !== 1 ||
  Number(manifestValue.cost_estimate?.identity_keyframe_count) !== 0 ||
  Number(manifestValue.cost_estimate?.lip_sync_count) !== 0) {
  preflightBlockers.push("MANIFEST_WORKLOAD_COUNTS_INVALID");
}
if (manifestValue.music_readiness?.readiness !== "PASS" ||
  text(manifestValue.music_readiness?.provider) !== "fal") {
  preflightBlockers.push("MANIFEST_MUSIC_NOT_READY");
}
for (const key of [
  "production_authorized",
  "provider_calls_authorized",
  "usage_creation_authorized",
  "wallet_reservation_authorized",
  "wallet_charge_authorized",
  "graph_materialization_authorized",
  "task_materialization_authorized",
  "repair_execution_authorized",
  "publication_authorized",
]) {
  if (manifestValue.authorization?.[key] !== false) {
    preflightBlockers.push(`MANIFEST_AUTHORIZATION_MUST_BE_FALSE:${key}`);
  }
}
if (preflightBlockers.length) {
  throw new Error(
    `SEALED_GRAPH_PREVIEW_PREFLIGHT_BLOCKED:${preflightBlockers.join(",")}`,
  );
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

const before = await exactState(supabaseAdmin, organizationId, projectId);
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
    AssetReuseEngine.resolveNode(node, organizationId)),
);
graph = stripForbiddenFields(graph);
graph.nodes = list(graph.nodes).map((node) =>
  node.generation?.required === true
    ? CreativeProductionTaskMaterializationRuntime.attach(node)
    : node,
);
graph.metadata = {
  ...object(graph.metadata),
  sealed_approval_manifest_sha256: manifestSha,
  sealed_direction_plan_sha256: planSha,
  sealed_direction_envelope_sha256: envelopeSha,
  sealed_direction_seal_sha256:
    manifestValue.direction_seal?.internal_sha256,
  sealed_quality_audit_sha256:
    manifestValue.quality_audit?.internal_sha256,
  sealed_cost_estimate_sha256:
    manifestValue.cost_estimate?.internal_sha256,
  approved_maximum_customer_price:
    manifestValue.authorization?.maximum_customer_price,
  promptless_persistence_contract:
    "CREATIVE_PROMPTLESS_GRAPH_EXECUTION_TASK_V1",
  provider_serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
  preview_only: true,
  graph_materialization_authorized: false,
  task_materialization_authorized: false,
  production_authorized: false,
  publication_authorized: false,
};
graph.cost_plan = {
  ...object(graph.cost_plan),
  currency: manifestValue.currency,
  estimated_cost: manifestValue.cost_estimate?.selected_baseline,
  one_shot_repair_reserve:
    manifestValue.cost_estimate?.one_shot_repair_reserve,
  maximum_customer_price:
    manifestValue.authorization?.maximum_customer_price,
  approved_cost: 0,
  approval_required: true,
  approved: false,
};

const executionPlan = stripForbiddenFields(buildExecutionPlan({
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph: graph,
}));

const graphForbiddenPaths = forbiddenFieldPaths(graph, "graph");
const executionForbiddenPaths = forbiddenFieldPaths(
  executionPlan,
  "execution_plan",
);
const dependency = dependencyIntegrity(graph);
const generationNodes = list(graph.nodes)
  .filter((node) => node.generation?.required === true);
const missingTaskContracts = generationNodes.filter((node) =>
  !CreativeProductionTaskMaterializationRuntime.verify(
    node.requirements?.task_materialization_contract,
  ),
);
const serviceCount = serviceCounts(executionPlan.steps);
const after = await exactState(supabaseAdmin, organizationId, projectId);

const blockers = [];
if (graphForbiddenPaths.length) blockers.push("GRAPH_FORBIDDEN_FIELDS_PERSISTED");
if (executionForbiddenPaths.length) {
  blockers.push("EXECUTION_FORBIDDEN_FIELDS_PERSISTED");
}
if (!dependency.passed) blockers.push("GRAPH_DEPENDENCY_INTEGRITY_FAILED");
if (missingTaskContracts.length) {
  blockers.push("TASK_MATERIALIZATION_CONTRACT_MISSING");
}
if (JSON.stringify(stable(before)) !== JSON.stringify(stable(after))) {
  blockers.push("READ_ONLY_STATE_CHANGED");
}
if (list(graph.nodes).length !== 34) {
  blockers.push(`GRAPH_NODE_COUNT_INVALID:${list(graph.nodes).length}:34`);
}
if (list(graph.edges).length !== 26) {
  blockers.push(`GRAPH_EDGE_COUNT_INVALID:${list(graph.edges).length}:26`);
}
if (generationNodes.length !== 27) {
  blockers.push(`GENERATION_NODE_COUNT_INVALID:${generationNodes.length}:27`);
}
if (list(executionPlan.steps).length !== 27) {
  blockers.push(
    `EXECUTION_STEP_COUNT_INVALID:${list(executionPlan.steps).length}:27`,
  );
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
if (Number(serviceCount["ai.image.generate"] || 0) !== 0) {
  blockers.push("IDENTITY_KEYFRAME_STEP_COUNT_MUST_BE_ZERO");
}
if (Math.abs(
  Number(graph.cost_plan?.maximum_customer_price) -
    Number(manifestValue.authorization?.maximum_customer_price),
) > 0.000001) {
  blockers.push("GRAPH_COST_CEILING_MISMATCH");
}

const reportCore = {
  contract: "CREATIVE_SEALED_PRODUCTION_GRAPH_PREVIEW_V2",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  creative_mission_id: missionId,
  direction_path: direction.absolute,
  manifest_path: manifest.absolute,
  direction_plan_sha256: planSha,
  direction_envelope_sha256: envelopeSha,
  manifest_sha256: manifestSha,
  graph,
  execution_plan: executionPlan,
  counts: {
    node_count: list(graph.nodes).length,
    edge_count: list(graph.edges).length,
    generation_node_count: generationNodes.length,
    execution_step_count: list(executionPlan.steps).length,
    video_generation_count: Number(serviceCount["ai.video.generate"] || 0),
    perceptual_review_count: Number(serviceCount["ai.image.analyze"] || 0),
    soundtrack_generation_count: Number(serviceCount["ai.music.generate"] || 0),
    identity_keyframe_count: Number(serviceCount["ai.image.generate"] || 0),
    graph_forbidden_field_count: graphForbiddenPaths.length,
    execution_forbidden_field_count: executionForbiddenPaths.length,
    missing_task_contract_count: missingTaskContracts.length,
  },
  service_counts: serviceCount,
  dependency_integrity: dependency,
  exact_state_before: before,
  exact_state_after: after,
  database_writes_executed: false,
  provider_calls_executed: false,
  usage_created: false,
  wallet_reserved: false,
  wallet_charged: false,
  graph_created: false,
  tasks_created: false,
  production_authorized: false,
  publication_authorized: false,
  blockers,
  readiness: blockers.length ? "FAIL" : "PASS",
};
const report = {
  ...reportCore,
  preview_sha256: sha256(reportCore),
};
const outputPath = path.resolve(
  text(process.env.SEALED_GRAPH_PREVIEW_OUTPUT) ||
    "/tmp/churchill-evidence-constrained-production-graph-preview.json",
);
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("READ-ONLY SEALED CREATIVE PRODUCTION GRAPH PREVIEW V2");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`PREVIEW_SHA256=${report.preview_sha256}`);
console.log(`MANIFEST_SHA256=${manifestSha}`);
console.log(`DIRECTION_PLAN_SHA256=${planSha}`);
console.log(`GRAPH_NODE_COUNT=${report.counts.node_count}`);
console.log(`GRAPH_EDGE_COUNT=${report.counts.edge_count}`);
console.log(`GENERATION_NODE_COUNT=${report.counts.generation_node_count}`);
console.log(`EXECUTION_STEP_COUNT=${report.counts.execution_step_count}`);
console.log(`VIDEO_GENERATION_COUNT=${report.counts.video_generation_count}`);
console.log(`PERCEPTUAL_REVIEW_COUNT=${report.counts.perceptual_review_count}`);
console.log(`SOUNDTRACK_GENERATION_COUNT=${report.counts.soundtrack_generation_count}`);
console.log(`IDENTITY_KEYFRAME_COUNT=${report.counts.identity_keyframe_count}`);
console.log(`GRAPH_FORBIDDEN_FIELD_COUNT=${report.counts.graph_forbidden_field_count}`);
console.log(`EXECUTION_FORBIDDEN_FIELD_COUNT=${report.counts.execution_forbidden_field_count}`);
console.log(`MISSING_TASK_CONTRACT_COUNT=${report.counts.missing_task_contract_count}`);
console.log(`APPROVED_MAXIMUM_CUSTOMER_PRICE=${graph.cost_plan?.maximum_customer_price}`);
console.log(`EXACT_GRAPH_COUNT_BEFORE=${before.graph_count}`);
console.log(`EXACT_GRAPH_COUNT_AFTER=${after.graph_count}`);
console.log(`EXACT_TASK_COUNT_BEFORE=${before.task_count}`);
console.log(`EXACT_TASK_COUNT_AFTER=${after.task_count}`);
console.log(`EXACT_USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`EXACT_USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`SEALED_GRAPH_PREVIEW_READINESS=${report.readiness}`);
console.log(`SEALED_GRAPH_PREVIEW_BLOCKER_COUNT=${blockers.length}`);
console.log(`SEALED_GRAPH_PREVIEW_BLOCKERS=${JSON.stringify(blockers)}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("USAGE_CREATED=NO");
console.log("WALLET_RESERVED=NO");
console.log("WALLET_CHARGED=NO");
console.log("GRAPH_CREATED=NO");
console.log("TASKS_CREATED=NO");
console.log("PRODUCTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (blockers.length) process.exitCode = 2;

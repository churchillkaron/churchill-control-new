#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const CONTRACT = "CHURCHILL_CREATIVE_STORY_LINEAGE_FORENSIC_AUDIT_V1";
const SOURCE_REPAIR = "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_SOURCE_V1";
const REVIEW_REPAIR = "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1";
const LINEAGE_KEYS = [
  "research_identity",
  "business_context_hash",
  "industry_context_hash",
  "selected_concept_hash",
  "concept_council_hash",
  "story_contract_hash",
  "master_plan_hash",
  "approval_plan_hash",
];
const CAUSAL_FIELDS = [
  "story_state_before",
  "state_change",
  "story_state_after",
  "transition_logic",
];
const FORBIDDEN_NODE_METADATA = new Set([
  "requirements",
  "generation",
  "input",
  "provider_parameters",
  "asset_scope",
  "task_materialization_contract",
  "task_materialization_contract_hash",
]);

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const money = (value) => Number(Number(value || 0).toFixed(6));

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(stable(value)))
    .digest("hex");
}

function writeJson(filePath, value) {
  const absolute = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function unique(values = []) {
  return [...new Set(list(values).flat(Infinity).map(text).filter(Boolean))];
}

function newest(rows = []) {
  return [...list(rows)].sort((a, b) => {
    const left = Date.parse(a.updated_at || a.created_at || 0) || 0;
    const right = Date.parse(b.updated_at || b.created_at || 0) || 0;
    return right - left;
  })[0] || null;
}

function walk(value, visitor, currentPath = "root", seen = new Set(), depth = 0) {
  if (depth > 25 || !value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      walk(item, visitor, `${currentPath}[${index}]`, seen, depth + 1));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${currentPath}.${key}`;
    visitor({ key, value: child, path: childPath });
    walk(child, visitor, childPath, seen, depth + 1);
  }
}

function pathsFor(value, predicate) {
  const output = [];
  walk(value, (entry) => {
    if (predicate(entry)) output.push(entry);
  });
  return output;
}

function hasString(value, needle) {
  return Boolean(text(needle)) &&
    JSON.stringify(value || {}).toLowerCase().includes(text(needle).toLowerCase());
}

function lineage(value = {}) {
  const paths = pathsFor(value, ({ key, value: item }) =>
    LINEAGE_KEYS.includes(key) && Boolean(text(item)));
  return {
    present_count: paths.length,
    keys: unique(paths.map((entry) => entry.key)),
    paths: paths.map((entry) => entry.path),
  };
}

function taskState(task = {}) {
  return {
    id: task.id,
    status: task.status,
    provider_id: task.provider_id ?? null,
    depends_on: task.depends_on || [],
    input: task.input || {},
    output: task.output || {},
    cost: task.cost || {},
    timing: task.timing || {},
    review: task.review || {},
    error: task.error || null,
    metadata: task.metadata || {},
    updated_at: task.updated_at || null,
  };
}

function taskCounts(tasks = []) {
  return list(tasks).reduce((result, task) => {
    const status = text(task.status) || "UNKNOWN";
    result[status] = Number(result[status] || 0) + 1;
    return result;
  }, {});
}

function fingerprint(state = {}) {
  return sha256({
    project: state.project,
    graph: state.graph,
    mission: state.mission,
    briefs: state.briefs,
    research: state.research,
    strategies: state.strategies,
    concepts: state.concepts,
    storyboards: state.storyboards,
    scenes: state.scenes,
    shots: state.shots,
    assets: state.assets,
    tasks: [...list(state.tasks)]
      .sort((a, b) => text(a.id).localeCompare(text(b.id)))
      .map(taskState),
    usage_count: state.usage_count,
    wallet: state.wallet,
  });
}

function commercialSignals(mission = {}, project = {}, brief = {}) {
  const corpus = JSON.stringify({ mission, project, brief }).toLowerCase();
  const hits = [
    "advert",
    "campaign",
    "brand",
    "business",
    "customer",
    "restaurant",
    "bar",
    "hotel",
    "venue",
    "product",
    "service",
    "booking",
    "reservation",
    "sales",
    "conversion",
    "offer",
    "promotion",
    "marketing",
  ].filter((term) => corpus.includes(term));
  const explicit = Boolean(
    text(brief.business_goal) ||
    text(brief.requested_action) ||
    text(mission.business_goal) ||
    project.metadata?.commercial === true ||
    project.metadata?.brand_film === true,
  );
  return { commercial: explicit || hits.length > 0, explicit, hits };
}

function musicSignals(project = {}, brief = {}) {
  const metadata = object(project.metadata);
  const briefMetadata = object(brief.metadata);
  const mode = text(
    metadata.duration_mode ||
    metadata.temporal_contract?.mode ||
    briefMetadata.duration_mode ||
    briefMetadata.temporal_contract?.mode,
  ).toUpperCase();
  return {
    full_source_audio:
      metadata.full_song === true ||
      metadata.music_video === true ||
      briefMetadata.full_song === true ||
      briefMetadata.music_video === true ||
      ["FULL_SOURCE_AUDIO", "FULL_SONG", "MATCH_SOURCE_AUDIO"].includes(mode),
    mode: mode || null,
  };
}

function planSnapshot(graph = {}) {
  const direct = object(graph.metadata?.approval_plan_snapshot);
  if (Object.keys(direct).length) return direct;
  const found = pathsFor(graph, ({ key, value }) =>
    /(?:approval_plan_snapshot|creative_plan|master_plan)$/i.test(key) &&
    value && typeof value === "object" && !Array.isArray(value));
  return object(found[0]?.value);
}

function planShotForTask(task, plan, scenes, shots) {
  const persistedShot = list(shots).find((shot) => text(shot.id) === text(task.shot_id));
  const persistedScene = list(scenes).find(
    (scene) => text(scene.id) === text(persistedShot?.scene_id));
  const sceneIndex = Number(persistedScene?.metadata?.master_plan_index);
  const shotIndex = Number(persistedShot?.metadata?.master_plan_shot_index);
  if (Number.isInteger(sceneIndex) && Number.isInteger(shotIndex)) {
    return list(plan.scenes?.[sceneIndex]?.shots)[shotIndex] || null;
  }
  return list(plan.scenes)
    .flatMap((scene) => list(scene.shots))
    .find((shot) => text(shot.id) === text(task.metadata?.execution_node_id)) || null;
}

function materializationAudit(task = {}) {
  const contract = object(task.input?.requirements?.task_materialization_contract);
  const nodeMetadata = object(contract.node_metadata);
  const nested = pathsFor(nodeMetadata, ({ key }) =>
    key === "task_materialization_contract");
  const forbidden = pathsFor(nodeMetadata, ({ key }) =>
    FORBIDDEN_NODE_METADATA.has(key));
  const issues = [];
  if (!Object.keys(contract).length) issues.push("MATERIALIZATION_CONTRACT_MISSING");
  if (nested.length) issues.push("MATERIALIZATION_CONTRACT_RECURSIVE");
  if (forbidden.length) issues.push("MATERIALIZATION_NODE_METADATA_NOT_ALLOWLISTED");
  return {
    contract: contract.contract || null,
    contract_hash: contract.contract_hash || null,
    contract_node_id: contract.node_id || null,
    execution_node_id: task.metadata?.execution_node_id || null,
    nested_contract_paths: nested.map((entry) => entry.path),
    forbidden_metadata_paths: forbidden.map((entry) => entry.path),
    issues,
  };
}

function strategyRecommendation(task = {}, shot = {}, expected = {}) {
  const identity = Boolean(
    Object.keys(object(shot.identity_requirements)).length ||
    expected.identity_expected === true ||
    task.metadata?.identity_expected === true,
  );
  const product = Boolean(
    Object.keys(object(shot.product_requirements)).length ||
    expected.product_expected === true ||
    task.metadata?.product_expected === true,
  );
  const environment = Boolean(
    text(shot.production_design?.environment) ||
    text(expected.production_design?.environment),
  );
  const references = unique([
    shot.reference_asset_ids,
    list(shot.reference_assets).map((item) => item?.asset_id || item?.id),
    task.input?.reference_asset_ids,
  ]);
  const primary = text(
    shot.primary_source_asset_id ||
    shot.generation?.primary_source_asset_id ||
    task.input?.requirements?.primary_source_asset_id,
  );
  const temporalChange = Boolean(
    text(shot.frame_plan?.progression) &&
    text(shot.frame_plan?.closing_frame),
  );
  if ((identity || product || environment) && temporalChange) {
    return { method: "THREE_KEYFRAME_TO_VIDEO", identity, product, environment, reference_count: references.length, primary_source_asset_id: primary || null };
  }
  if (identity || product || environment) {
    return { method: "SINGLE_KEYFRAME_TO_VIDEO", identity, product, environment, reference_count: references.length, primary_source_asset_id: primary || null };
  }
  if (references.length >= 3) {
    return { method: "COMPOSITE_THEN_ANIMATE", identity, product, environment, reference_count: references.length, primary_source_asset_id: primary || null };
  }
  if (primary) {
    return { method: "ASSET_LED_MOTION_OR_SOURCE_REUSE_REVIEW", identity, product, environment, reference_count: references.length, primary_source_asset_id: primary };
  }
  return { method: "DIRECT_VIDEO_AFTER_STORY_PREFLIGHT", identity, product, environment, reference_count: references.length, primary_source_asset_id: null };
}

async function loadState(scope, runtimes, supabaseAdmin) {
  const project = await runtimes.CreativeProjectRuntime.get(scope.projectId);
  const graph = await runtimes.ProductionGraphRuntime.get(scope.graphId);
  if (!project || text(project.organization_id) !== scope.organizationId) {
    throw new Error("STORY_LINEAGE_PROJECT_NOT_FOUND");
  }
  if (!graph || text(graph.organization_id) !== scope.organizationId ||
    text(graph.creative_project_id) !== scope.projectId) {
    throw new Error("STORY_LINEAGE_GRAPH_NOT_FOUND");
  }
  const missionId = text(
    graph.metadata?.creative_mission_id ||
    project.creative_mission_id ||
    project.metadata?.creative_mission_id,
  );
  const query = {
    organization_id: scope.organizationId,
    creative_project_id: scope.projectId,
    creative_mission_id: missionId || undefined,
  };
  const [mission, briefs, research, strategies, concepts, storyboards, scenes, shots, assets, tasks, usage, wallet] = await Promise.all([
    missionId ? runtimes.CreativeMissionRuntime.get(missionId) : null,
    runtimes.CreativeBriefRuntime.list(query),
    runtimes.ResearchRuntime.list(query),
    runtimes.CreativeStrategyRuntime.list(query),
    runtimes.CreativeConceptRuntime.list(query),
    runtimes.StoryboardRuntime.list(query),
    runtimes.SceneRuntime.list(query),
    runtimes.ShotRuntime.list(query),
    runtimes.CreativeAssetsRuntime.list(query),
    runtimes.ProductionTaskRuntime.list({ ...query, production_graph_id: scope.graphId }),
    supabaseAdmin.from("platform_service_usage").select("id", { count: "exact", head: true }).eq("organization_id", scope.organizationId),
    supabaseAdmin.from("organization_wallets").select("available_balance,reserved_balance,currency,updated_at").eq("organization_id", scope.organizationId).single(),
  ]);
  if (usage.error) throw usage.error;
  if (wallet.error) throw wallet.error;
  return {
    project,
    graph,
    mission: mission || {},
    mission_id: missionId || null,
    briefs: list(briefs),
    research: list(research),
    strategies: list(strategies),
    concepts: list(concepts),
    storyboards: list(storyboards),
    scenes: list(scenes),
    shots: list(shots),
    assets: list(assets),
    tasks: list(tasks).filter((task) => text(task.production_graph_id) === scope.graphId),
    usage_count: Number(usage.count || 0),
    wallet: {
      available_balance: money(wallet.data?.available_balance),
      reserved_balance: money(wallet.data?.reserved_balance),
      currency: text(wallet.data?.currency) || null,
      updated_at: wallet.data?.updated_at || null,
    },
  };
}

const scope = {
  organizationId: text(process.env.ORGANIZATION_ID),
  projectId: text(process.env.CREATIVE_PROJECT_ID),
  graphId: text(process.env.PRODUCTION_GRAPH_ID),
};
const outputPath = path.resolve(
  text(process.env.STORY_LINEAGE_AUDIT_OUTPUT) ||
  "/tmp/churchill-creative-story-lineage-forensic-audit.json",
);
if (!scope.organizationId || !scope.projectId || !scope.graphId) {
  throw new Error("STORY_LINEAGE_AUDIT_SCOPE_REQUIRED");
}

const [
  { supabaseAdmin },
  { CreativeProjectRuntime },
  { CreativeMissionRuntime },
  { CreativeBriefRuntime },
  { ResearchRuntime },
  { CreativeStrategyRuntime },
  { CreativeConceptRuntime },
  { StoryboardRuntime },
  { SceneRuntime },
  { ShotRuntime },
  { CreativeAssetsRuntime },
  { ProductionGraphRuntime },
  { ProductionTaskRuntime },
  { persistedPromptFieldPaths },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/creative/projects/runtime/CreativeProjectRuntime"),
  import("@/lib/creative/missions/runtime/CreativeMissionRuntime"),
  import("@/lib/creative/brief/runtime/CreativeBriefRuntime"),
  import("@/lib/creative/research/runtime/ResearchRuntime"),
  import("@/lib/creative/strategy/runtime/CreativeStrategyRuntime"),
  import("@/lib/creative/concepts/runtime/CreativeConceptRuntime"),
  import("@/lib/creative/storyboard/runtime/StoryboardRuntime"),
  import("@/lib/creative/scenes/runtime/SceneRuntime"),
  import("@/lib/creative/shots/runtime/ShotRuntime"),
  import("@/lib/creative/assets/runtime/CreativeAssetsRuntime"),
  import("@/lib/creative/production-graph/runtime/ProductionGraphRuntime"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/creative/execution/runtime/CreativePromptlessPersistenceRuntime"),
]);
const runtimes = {
  CreativeProjectRuntime,
  CreativeMissionRuntime,
  CreativeBriefRuntime,
  ResearchRuntime,
  CreativeStrategyRuntime,
  CreativeConceptRuntime,
  StoryboardRuntime,
  SceneRuntime,
  ShotRuntime,
  CreativeAssetsRuntime,
  ProductionGraphRuntime,
  ProductionTaskRuntime,
};

const before = await loadState(scope, runtimes, supabaseAdmin);
const beforeHash = fingerprint(before);
const brief = newest(before.briefs) || {};
const commercial = commercialSignals(before.mission, before.project, brief);
const music = musicSignals(before.project, brief);
const researchRow = newest(before.research);
const researchMeta = object(researchRow?.metadata);
const researchValidation = object(researchMeta.validation || researchMeta.research_validation);
const researchPolicy = object(researchValidation.policy || researchMeta.policy);
const companyResolution = object(researchMeta.company_resolution);
const researchMode = text(researchPolicy.mode).toUpperCase() || null;
const researchIdentity = text(researchMeta.research_identity) || null;
const industry = text(companyResolution.industry || researchMeta.industry) || null;
const plan = planSnapshot(before.graph);
const planStory = Object.keys(object(plan.story)).length
  ? object(plan.story)
  : object(plan.story_architecture);
const planScenes = list(plan.scenes);
const planShots = planScenes.flatMap((scene) => list(scene.shots));
const blockers = [];

if (!researchRow) blockers.push("RESEARCH_RECORD_MISSING");
if (researchRow && researchValidation.passed !== true) blockers.push("RESEARCH_VALIDATION_NOT_PASSED");
if (researchRow && !researchIdentity) blockers.push("RESEARCH_IDENTITY_MISSING");
if (commercial.commercial && researchMode === "INTERNAL_CREATIVE") blockers.push("COMMERCIAL_PROJECT_INTERNAL_RESEARCH_BYPASS");
if (commercial.commercial && !industry) blockers.push("COMMERCIAL_INDUSTRY_NOT_RESOLVED");
if (!Object.keys(plan).length) blockers.push("APPROVAL_PLAN_SNAPSHOT_MISSING");
if (!Object.keys(planStory).length) blockers.push("AUTHORITATIVE_STORY_CONTRACT_MISSING");
if (Object.keys(object(plan.story)).length && Object.keys(object(plan.story_architecture)).length && sha256(plan.story) !== sha256(plan.story_architecture)) blockers.push("DUAL_STORY_AUTHORITIES_DIVERGE");
if (researchIdentity && !hasString(plan, researchIdentity)) blockers.push("RESEARCH_IDENTITY_NOT_PROPAGATED_TO_PLAN");
if (commercial.commercial && industry && !hasString(plan, industry)) blockers.push("RESOLVED_INDUSTRY_NOT_PROPAGATED_TO_PLAN");
const evidencePaths = pathsFor(planStory, ({ key, value }) =>
  /(?:claim_ids|source_ids|evidence_ids|research_claims|evidence)$/i.test(key) &&
  (Array.isArray(value) || typeof value === "string"));
if (commercial.commercial && evidencePaths.length === 0) blockers.push("STORY_RESEARCH_EVIDENCE_LINEAGE_MISSING");

const documentSets = {
  strategy: before.strategies,
  concept: before.concepts,
  storyboard: before.storyboards,
};
const documentAudit = {};
for (const [name, rows] of Object.entries(documentSets)) {
  const active = list(rows).filter((row) => !row.archived_at);
  const current = newest(rows);
  const currentLineage = lineage(current || {});
  const issues = [];
  if (!current) issues.push(`${name.toUpperCase()}_MISSING`);
  if (current && currentLineage.present_count === 0) issues.push(`${name.toUpperCase()}_LINEAGE_HASHES_MISSING`);
  if (active.length > 1 && currentLineage.present_count === 0) issues.push(`${name.toUpperCase()}_AMBIGUOUS_REUSE_SET`);
  blockers.push(...issues);
  documentAudit[name] = {
    total_count: list(rows).length,
    active_count: active.length,
    current_id: current?.id || null,
    lineage: currentLineage,
    issues,
  };
}
const storyboard = newest(before.storyboards);
if (storyboard && !Object.keys(object(storyboard.metadata?.story_architecture)).length) blockers.push("STORYBOARD_STORY_ARCHITECTURE_MISSING");

const sortedScenes = [...before.scenes].sort((a, b) => Number(a.scene_number || 0) - Number(b.scene_number || 0));
const sceneReports = [];
const shotReports = [];
const scenePlanMap = new Map();
for (const [fallback, scene] of sortedScenes.entries()) {
  const storedIndex = Number(scene.metadata?.master_plan_index);
  const index = Number.isInteger(storedIndex) && storedIndex >= 0
    ? storedIndex
    : Math.max(0, Number(scene.scene_number || fallback + 1) - 1);
  const planScene = planScenes[index] || null;
  scenePlanMap.set(text(scene.id), { scene, planScene, index });
  const issues = [];
  for (const field of CAUSAL_FIELDS) {
    const expected = planScene?.[field];
    const stored = scene[field] ?? scene.metadata?.[field];
    if (Boolean(text(expected)) && !Boolean(text(stored))) issues.push(`SCENE_CAUSAL_FIELD_DROPPED:${field}`);
  }
  if (!planScene) issues.push("PERSISTED_SCENE_NOT_LINKED_TO_PLAN");
  if (lineage(scene).present_count === 0) issues.push("SCENE_LINEAGE_HASHES_MISSING");
  blockers.push(...issues);
  sceneReports.push({ scene_id: scene.id, plan_scene_id: planScene?.id || null, issues });
}
for (const scene of sortedScenes) {
  const entry = scenePlanMap.get(text(scene.id));
  const sceneShots = before.shots
    .filter((shot) => text(shot.scene_id) === text(scene.id))
    .sort((a, b) => Number(a.shot_number || 0) - Number(b.shot_number || 0));
  for (const [fallback, shot] of sceneShots.entries()) {
    const storedIndex = Number(shot.metadata?.master_plan_shot_index);
    const index = Number.isInteger(storedIndex) && storedIndex >= 0
      ? storedIndex
      : Math.max(0, Number(shot.shot_number || fallback + 1) - 1);
    const planShot = list(entry?.planScene?.shots)[index] || null;
    const issues = [];
    const planSubject = text(planShot?.subject);
    const storedSubject = text(shot.subject || shot.metadata?.subject);
    if (!planShot) issues.push("PERSISTED_SHOT_NOT_LINKED_TO_PLAN");
    if (planSubject && !storedSubject) issues.push("SHOT_VISIBLE_SUBJECT_DROPPED");
    if (planSubject && !storedSubject && planSubject !== text(shot.purpose)) issues.push("SHOT_SUBJECT_COLLAPSED_INTO_PURPOSE");
    if (lineage(shot).present_count === 0) issues.push("SHOT_LINEAGE_HASHES_MISSING");
    const prompts = pathsFor(shot, ({ key, value }) => /^(?:provider_prompt|prompt|negative_prompt)$/i.test(key) && Boolean(text(value)));
    if (prompts.length) issues.push("SHOT_PERSISTED_PROVIDER_PROMPT_AUTHORITY");
    blockers.push(...issues);
    shotReports.push({
      shot_id: shot.id,
      scene_id: shot.scene_id,
      plan_shot_id: planShot?.id || null,
      plan_subject: planSubject || null,
      persisted_subject: storedSubject || null,
      provider_prompt_paths: prompts.map((item) => item.path),
      issues,
    });
  }
}
if (sortedScenes.length !== planScenes.length) blockers.push("PERSISTED_SCENE_COUNT_DOES_NOT_MATCH_PLAN");
if (before.shots.length !== planShots.length) blockers.push("PERSISTED_SHOT_COUNT_DOES_NOT_MATCH_PLAN");

const graphNodeMap = new Map(list(before.graph.nodes).map((node) => [text(node.id), node]));
const graphShotReports = [];
for (const shotReport of shotReports) {
  const node = graphNodeMap.get(text(shotReport.shot_id));
  const issues = [];
  const graphSubject = text(node?.requirements?.subject);
  const graphPurpose = text(node?.intent?.purpose || node?.requirements?.purpose);
  if (!node) issues.push("GRAPH_SHOT_NODE_MISSING");
  if (node && shotReport.plan_subject && graphSubject !== shotReport.plan_subject && graphSubject === graphPurpose) issues.push("GRAPH_SUBJECT_COLLAPSED_TO_PURPOSE");
  if (node && lineage(node).present_count === 0) issues.push("GRAPH_SHOT_LINEAGE_HASHES_MISSING");
  const prompts = pathsFor(node || {}, ({ key, value }) => /^(?:provider_prompt|prompt|negative_prompt)$/i.test(key) && Boolean(text(value)));
  if (prompts.length) issues.push("GRAPH_PERSISTED_PROVIDER_PROMPT_AUTHORITY");
  blockers.push(...issues);
  graphShotReports.push({ shot_id: shotReport.shot_id, graph_subject: graphSubject || null, graph_purpose: graphPurpose || null, issues });
}
if (lineage(before.graph).present_count === 0) blockers.push("GRAPH_LINEAGE_HASHES_MISSING");

const taskMap = new Map(before.tasks.map((task) => [text(task.id), task]));
const replacementSources = before.tasks.filter((task) => text(task.metadata?.repair_payload_contract) === SOURCE_REPAIR);
const replacementReviews = before.tasks.filter((task) => text(task.metadata?.repair_payload_contract) === REVIEW_REPAIR);
const pairReports = [];
for (const source of replacementSources) {
  const review = replacementReviews.find((item) =>
    text(item.metadata?.repaired_source_task_id) === text(source.id) ||
    list(item.depends_on).map(text).includes(text(source.id))) || null;
  const originalSource = taskMap.get(text(source.metadata?.repair_of_task_id));
  const originalReview = taskMap.get(text(source.metadata?.repair_quality_task_id));
  const shot = planShotForTask(source, plan, before.scenes, before.shots);
  const expected = object(
    review?.input?.requirements?.expected_contract ||
    originalReview?.input?.requirements?.expected_contract,
  );
  const materialization = materializationAudit(source);
  const reviewMaterialization = review ? materializationAudit(review) : null;
  const sourcePrompts = persistedPromptFieldPaths(source, "replacement_source");
  const reviewPrompts = review ? persistedPromptFieldPaths(review, "replacement_review") : [];
  const issues = unique([
    ...materialization.issues,
    ...list(reviewMaterialization?.issues),
    sourcePrompts.length || reviewPrompts.length ? "REPLACEMENT_PAIR_PERSISTED_PROMPTS_PRESENT" : null,
    !review ? "REPLACEMENT_REVIEW_MISSING" : null,
    !originalSource ? "ORIGINAL_SOURCE_TASK_MISSING" : null,
    !originalReview ? "ORIGINAL_REVIEW_TASK_MISSING" : null,
    !shot ? "REPLACEMENT_SOURCE_PLAN_SHOT_MISSING" : null,
  ]);
  blockers.push(...issues);
  let classification = "MEDIA_QUALITY_OR_PROVIDER_EXECUTION_FAILURE";
  if (blockers.some((item) => /INDUSTRY|RESEARCH/.test(item))) classification = "INDUSTRY_CONTEXT_FAILURE";
  else if (blockers.some((item) => /STORY|CAUSAL/.test(item))) classification = "STORY_CONTRACT_FAILURE";
  else if (issues.some((item) => /MATERIALIZATION|ASSET|REFERENCE/.test(item))) classification = "ASSET_BINDING_FAILURE";
  const evidence = object(review?.output?.perceptual_validation?.evidence);
  pairReports.push({
    replacement_source_task_id: source.id,
    replacement_review_task_id: review?.id || null,
    original_source_task_id: originalSource?.id || null,
    original_review_task_id: originalReview?.id || null,
    scene_id: source.scene_id || null,
    shot_id: source.shot_id || originalSource?.shot_id || null,
    source_status: source.status,
    review_status: review?.status || null,
    source_error: source.error || null,
    review_error: review?.error || null,
    failure_classification: classification,
    generation_strategy: strategyRecommendation(source, shot || {}, expected),
    provider_failures: list(evidence.failures),
    provider_repair_instructions: list(evidence.repair_instructions),
    source_prompt_paths: sourcePrompts,
    review_prompt_paths: reviewPrompts,
    materialization,
    review_materialization: reviewMaterialization,
    issues,
    dispatch_safe: false,
  });
}

const after = await loadState(scope, runtimes, supabaseAdmin);
const afterHash = fingerprint(after);
const stateUnchanged = beforeHash === afterHash;
if (!stateUnchanged) blockers.push("READ_ONLY_STORY_LINEAGE_AUDIT_CHANGED_STATE");
const finalBlockers = unique(blockers);
const critical = finalBlockers.filter((item) =>
  /(?:RESEARCH|INDUSTRY|STORY|CAUSAL|SUBJECT|LINEAGE|MATERIALIZATION|AMBIGUOUS_REUSE|PLAN_SNAPSHOT)/.test(item));
const decision = critical.length
  ? "STORY_LINEAGE_REPAIR_REQUIRED_BEFORE_ANY_FURTHER_REGENERATION"
  : "STORY_LINEAGE_PROVEN_REPLACEMENT_MEDIA_TRIAGE_MAY_CONTINUE";
const readiness = critical.length
  ? "READY_FOR_BOUNDED_STORY_LINEAGE_REPAIR_DESIGN"
  : "READY_FOR_SHOT_LEVEL_GENERATION_STRATEGY_REDESIGN";
const instruction = critical.length
  ? "Repair only the proven lineage breaks. Do not dispatch, rerun reviews, regenerate, finalise, or publish."
  : "Use the per-shot strategy recommendation for a separate read-only redesign preview. Do not dispatch automatically.";

const report = {
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: scope.organizationId,
  creative_project_id: scope.projectId,
  production_graph_id: scope.graphId,
  project: {
    name: before.project?.name || null,
    status: before.project?.status || null,
    mission_id: before.mission_id,
    commercial,
    music,
    commercial_music_hybrid: commercial.commercial && music.full_source_audio,
  },
  research: {
    record_count: before.research.length,
    current_id: researchRow?.id || null,
    mode: researchMode,
    validation_passed: researchValidation.passed === true,
    validation_blockers: list(researchValidation.blockers),
    research_identity: researchIdentity,
    company_resolution_status: companyResolution.status || null,
    company_name: companyResolution.canonical_name || null,
    industry,
  },
  plan: {
    plan_hash: Object.keys(plan).length ? sha256(plan) : null,
    story_hash: Object.keys(planStory).length ? sha256(planStory) : null,
    story_source: Object.keys(object(plan.story)).length ? "plan.story" : Object.keys(object(plan.story_architecture)).length ? "plan.story_architecture" : null,
    research_identity_propagated: researchIdentity ? hasString(plan, researchIdentity) : false,
    industry_propagated: industry ? hasString(plan, industry) : false,
    story_evidence_paths: evidencePaths.map((entry) => entry.path),
    selected_concept_id: plan.selected_concept_id || null,
    selected_concept_hash: plan.concept_council?.concept_hash || plan.production?.selected_concept_hash || null,
    concept_council_hash: plan.concept_council?.council_hash || plan.production?.concept_council_hash || null,
    scene_count: planScenes.length,
    shot_count: planShots.length,
    lineage: lineage(plan),
  },
  persisted_documents: documentAudit,
  scenes: sceneReports,
  shots: shotReports,
  graph_shots: graphShotReports,
  replacements: {
    source_count: replacementSources.length,
    review_count: replacementReviews.length,
    source_status_counts: taskCounts(replacementSources),
    review_status_counts: taskCounts(replacementReviews),
    pair_reports: pairReports,
  },
  current_state: {
    task_count: before.tasks.length,
    task_status_counts: taskCounts(before.tasks),
    task_state_sha256: sha256(before.tasks.map(taskState)),
    usage_count: before.usage_count,
    wallet: before.wallet,
    scene_count: before.scenes.length,
    shot_count: before.shots.length,
    asset_count: before.assets.length,
  },
  blockers: finalBlockers,
  critical_blockers: critical,
  decision,
  instruction,
  readiness,
  exact_state_before_sha256: beforeHash,
  exact_state_after_sha256: afterHash,
  state_unchanged: stateUnchanged,
  database_writes_executed: false,
  provider_calls_executed: false,
  provider_polls_executed: false,
  review_reruns_executed: false,
  source_regeneration_executed: false,
  task_dispatch_executed: false,
  finalisation_executed: false,
  publication_executed: false,
};

writeJson(outputPath, report);

console.log("============================================================");
console.log("READ-ONLY CHURCHILL CREATIVE STORY LINEAGE FORENSIC AUDIT");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`PROJECT_NAME=${text(before.project?.name)}`);
console.log(`COMMERCIAL_PROJECT=${commercial.commercial ? "YES" : "NO"}`);
console.log(`FULL_SOURCE_AUDIO=${music.full_source_audio ? "YES" : "NO"}`);
console.log(`COMMERCIAL_MUSIC_HYBRID=${commercial.commercial && music.full_source_audio ? "YES" : "NO"}`);
console.log(`RESEARCH_MODE=${researchMode || ""}`);
console.log(`RESEARCH_VALIDATION_PASSED=${researchValidation.passed === true ? "YES" : "NO"}`);
console.log(`RESEARCH_IDENTITY=${researchIdentity || ""}`);
console.log(`RESOLVED_INDUSTRY=${industry || ""}`);
console.log(`PLAN_HASH=${report.plan.plan_hash || ""}`);
console.log(`STORY_SOURCE=${report.plan.story_source || ""}`);
console.log(`STORY_HASH=${report.plan.story_hash || ""}`);
console.log(`STORY_EVIDENCE_PATH_COUNT=${report.plan.story_evidence_paths.length}`);
console.log(`PLAN_SCENE_COUNT=${planScenes.length}`);
console.log(`PLAN_SHOT_COUNT=${planShots.length}`);
console.log(`PERSISTED_SCENE_COUNT=${before.scenes.length}`);
console.log(`PERSISTED_SHOT_COUNT=${before.shots.length}`);
console.log(`REPLACEMENT_SOURCE_COUNT=${replacementSources.length}`);
console.log(`REPLACEMENT_REVIEW_COUNT=${replacementReviews.length}`);
console.log(`TASK_COUNT=${before.tasks.length}`);
console.log(`TASK_STATUS_COUNTS=${JSON.stringify(taskCounts(before.tasks))}`);
for (const pair of pairReports) {
  console.log([
    `REPLACEMENT_PAIR_FORENSIC=${pair.replacement_source_task_id}`,
    `review=${pair.replacement_review_task_id || ""}`,
    `shot=${pair.shot_id || ""}`,
    `source_status=${pair.source_status || ""}`,
    `review_status=${pair.review_status || ""}`,
    `classification=${pair.failure_classification}`,
    `strategy=${pair.generation_strategy.method}`,
    `issues=${pair.issues.join(",")}`,
  ].join("|"));
}
console.log(`BLOCKERS=${JSON.stringify(finalBlockers)}`);
console.log(`CRITICAL_BLOCKERS=${JSON.stringify(critical)}`);
console.log(`STORY_LINEAGE_DECISION=${decision}`);
console.log(`STORY_LINEAGE_INSTRUCTION=${instruction}`);
console.log(`AUDIT_READINESS=${readiness}`);
console.log(`EXACT_STATE_SHA256_BEFORE=${beforeHash}`);
console.log(`EXACT_STATE_SHA256_AFTER=${afterHash}`);
console.log(`STATE_UNCHANGED=${stateUnchanged ? "YES" : "NO"}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("REVIEW_RERUNS_EXECUTED=NO");
console.log("SOURCE_REGENERATION_EXECUTED=NO");
console.log("TASK_DISPATCH_EXECUTED=NO");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (finalBlockers.length) process.exitCode = 2;

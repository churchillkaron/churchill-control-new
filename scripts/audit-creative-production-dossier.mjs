#!/usr/bin/env node

import process from "node:process";

import {
  loadAvantiqoEnv,
} from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

const [
  { supabaseAdmin },
  { CreativeProjectRuntime },
  { CreativeStateEngine },
  {
    validateTemporalSemanticPlan,
  },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/creative/projects/runtime/CreativeProjectRuntime"),
  import("@/lib/creative/state/CreativeStateEngine"),
  import(
    "@/lib/creative/director/validation/CreativeTemporalSemanticPlanValidator"
  ),
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function csv(value) {
  return [...new Set(
    text(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function normalizedStatus(value) {
  return text(value).toUpperCase();
}

function activeRecord(record = {}) {
  const status = normalizedStatus(record.status);
  return Boolean(
    !record.archived &&
    !record.archived_at &&
    !record.superseded_at &&
    !record.metadata?.archived_at &&
    !record.metadata?.superseded_at &&
    !record.metadata?.superseded_by &&
    ![
      "ARCHIVED",
      "CANCELLED",
      "CANCELED",
      "REJECTED",
      "SUPERSEDED",
    ].includes(status)
  );
}

function assetId(value = {}) {
  if (typeof value === "string") return text(value);
  return text(
    value.asset_id ||
    value.assetId ||
    value.creative_asset_id ||
    value.id,
  );
}

function unique(values = []) {
  return [...new Set(values.flat(Infinity).map(text).filter(Boolean))];
}

function setEqual(left = [], right = []) {
  const a = new Set(left);
  const b = new Set(right);
  return a.size === b.size && [...a].every((value) => b.has(value));
}

function difference(left = [], right = []) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

function canonicalSelectedAssetIds(project = {}) {
  const metadata = object(project.metadata);
  const selection = object(metadata.asset_selection);
  const candidates = [
    list(metadata.selected_asset_ids),
    list(selection.selected_asset_ids),
    list(selection.selected_assets).map(assetId),
  ];
  for (const candidate of candidates) {
    const ids = unique(candidate);
    if (ids.length) return ids;
  }
  return [];
}

function planShots(plan = {}) {
  return list(plan.scenes).flatMap((scene, sceneIndex) =>
    list(scene.shots).map((shot, shotIndex) => ({
      ...shot,
      scene_index: sceneIndex,
      shot_index: shotIndex,
      scene,
    })),
  );
}

function durationTotal(records = []) {
  return records.reduce(
    (sum, record) => sum + Number(record.duration_seconds || 0),
    0,
  );
}

function narrativeCorpus(plan = {}, tasks = []) {
  const parts = [];
  for (const scene of list(plan.scenes)) {
    parts.push(
      scene.title,
      scene.objective,
      scene.story_function,
      scene.story_state_before,
      scene.state_change,
      scene.story_state_after,
      scene.transition_logic,
    );
    for (const shot of list(scene.shots)) {
      parts.push(
        shot.title,
        shot.purpose,
        shot.subject,
        shot.action,
        shot.performance,
        shot.generation?.provider_prompt,
      );
    }
  }
  for (const task of tasks) {
    parts.push(
      task.title,
      task.description,
      task.input?.provider_prompt,
      task.input?.generation?.provider_prompt,
    );
  }
  return parts.map(text).filter(Boolean).join("\n");
}

function taskBucket(task = {}) {
  const source = [
    task.type,
    task.capability,
    task.service_code,
    task.service_id,
  ].map(text).join(" ").toLowerCase();

  if (/\bmusic\b|music\./.test(source)) return "MUSIC";
  if (/\.analy[sz]e\b|\.validate\b|\.review\b|quality/.test(source)) {
    return "ANALYSIS";
  }
  if (/\bvideo\b|video\./.test(source)) return "VIDEO";
  if (/\bimage\b|image\./.test(source)) return "IMAGE";
  return "OTHER";
}

function taskCountByBucket(tasks = []) {
  return tasks.reduce((counts, task) => {
    const bucket = taskBucket(task);
    counts[bucket] = (counts[bucket] || 0) + 1;
    return counts;
  }, {});
}

function taskCountByCapability(tasks = []) {
  return tasks.reduce((counts, task) => {
    const capability = text(
      task.capability || task.service_code || task.service_id || task.type,
    ) || "UNKNOWN";
    counts[capability] = (counts[capability] || 0) + 1;
    return counts;
  }, {});
}

async function rows(table, configure) {
  let query = supabaseAdmin.from(table).select("*");
  query = configure(query);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function row(table, configure) {
  let query = supabaseAdmin.from(table).select("*");
  query = configure(query);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(
  process.env.CREATIVE_PROJECT_ID || process.env.PROJECT_ID,
);
const missionId = text(
  process.env.CREATIVE_MISSION_ID || process.env.MISSION_ID,
);
const dossierId = text(process.env.PRODUCTION_DOSSIER_ID);

if (!organizationId) throw new Error("ORGANIZATION_ID required");
if (!projectId) throw new Error("CREATIVE_PROJECT_ID required");
if (!missionId) throw new Error("CREATIVE_MISSION_ID required");
if (!dossierId) throw new Error("PRODUCTION_DOSSIER_ID required");

const expected = {
  sceneCount: finite(process.env.EXPECTED_SCENE_COUNT),
  shotCount: finite(process.env.EXPECTED_SHOT_COUNT),
  durationSeconds: finite(process.env.EXPECTED_DURATION_SECONDS),
  selectedAssetCount: finite(process.env.EXPECTED_SELECTED_ASSET_COUNT),
  taskCount: finite(process.env.EXPECTED_TASK_COUNT),
  analysisTaskCount: finite(process.env.EXPECTED_ANALYSIS_TASK_COUNT),
  videoTaskCount: finite(process.env.EXPECTED_VIDEO_TASK_COUNT),
  musicTaskCount: finite(process.env.EXPECTED_MUSIC_TASK_COUNT),
  estimatedCost: finite(process.env.EXPECTED_ESTIMATED_COST),
  currency: text(process.env.EXPECTED_CURRENCY).toUpperCase() || null,
};
const requiredAssetIds = csv(process.env.REQUIRED_ASSET_IDS);
const forbiddenAssetIds = csv(process.env.FORBIDDEN_ASSET_IDS);
const supersededDossierIds = csv(process.env.SUPERSEDED_DOSSIER_IDS);

const checks = [];
function check(name, passed, details = "") {
  checks.push({ name, passed: Boolean(passed), details: text(details) });
  console.log(
    `CHECK|${passed ? "PASS" : "FAIL"}|${name}|${text(details)}`,
  );
}

const project = await CreativeProjectRuntime.get(projectId);
check(
  "PROJECT_SCOPE",
  project && text(project.organization_id) === organizationId,
  `project=${project?.id || "MISSING"};organization=${project?.organization_id || "MISSING"}`,
);

const dossier = await row("creative_asset_nodes", (query) =>
  query
    .eq("id", dossierId)
    .eq("organization_id", organizationId)
    .eq("creative_project_id", projectId),
);
check(
  "DOSSIER_EXISTS",
  Boolean(dossier),
  `dossier=${dossier?.id || "MISSING"}`,
);
if (!dossier) {
  console.log("AUDIT_STATUS=FAIL");
  process.exit(1);
}

check(
  "DOSSIER_TYPE",
  normalizedStatus(dossier.type) === "PRODUCTION_DOSSIER",
  `type=${dossier.type || ""}`,
);
check(
  "DOSSIER_REVIEW_BOUNDARY",
  normalizedStatus(dossier.status) === "REVIEW" &&
    dossier.review?.approved !== true &&
    dossier.metadata?.human_approval_required === true &&
    dossier.metadata?.approved_cost_ceiling == null,
  `status=${dossier.status};approved=${Boolean(dossier.review?.approved)};human_approval_required=${Boolean(dossier.metadata?.human_approval_required)}`,
);
check(
  "DOSSIER_ZERO_EXECUTION",
  Number(dossier.cost?.actual || 0) === 0 &&
    !text(dossier.lineage?.provider_id),
  `actual_cost=${Number(dossier.cost?.actual || 0)};provider=${text(dossier.lineage?.provider_id) || "NONE"}`,
);

const graphId = text(dossier.metadata?.production_graph_id);
check(
  "DOSSIER_GRAPH_REFERENCE",
  Boolean(graphId),
  `production_graph_id=${graphId || "MISSING"}`,
);

const graph = graphId
  ? await row("creative_production_graphs", (query) =>
      query
        .eq("id", graphId)
        .eq("organization_id", organizationId)
        .eq("creative_project_id", projectId),
    )
  : null;
check(
  "GRAPH_EXISTS",
  Boolean(graph),
  `graph=${graph?.id || "MISSING"}`,
);
if (!graph) {
  console.log("AUDIT_STATUS=FAIL");
  process.exit(1);
}

const plan = object(graph.metadata?.approval_plan_snapshot);
const semantic = validateTemporalSemanticPlan(plan);
check(
  "SEMANTIC_VALIDATION",
  semantic.passed === true,
  semantic.passed
    ? `failures=0`
    : `failures=${semantic.failures.map((item) => item.code).join(",")}`,
);

const planSceneList = list(plan.scenes);
const planShotList = planShots(plan);
const planDuration = durationTotal(planSceneList);
check(
  "PLAN_SCENE_COUNT",
  expected.sceneCount === null || planSceneList.length === expected.sceneCount,
  `actual=${planSceneList.length};expected=${expected.sceneCount ?? "ANY"}`,
);
check(
  "PLAN_SHOT_COUNT",
  expected.shotCount === null || planShotList.length === expected.shotCount,
  `actual=${planShotList.length};expected=${expected.shotCount ?? "ANY"}`,
);
check(
  "PLAN_DURATION",
  expected.durationSeconds === null ||
    Math.abs(planDuration - expected.durationSeconds) <= 0.05,
  `actual=${planDuration};expected=${expected.durationSeconds ?? "ANY"}`,
);

const sceneDurationFailures = planSceneList
  .map((scene, index) => ({
    scene: index + 1,
    expected: Number(scene.duration_seconds || 0),
    actual: durationTotal(list(scene.shots)),
  }))
  .filter((item) => Math.abs(item.expected - item.actual) > 0.05);
check(
  "SCENE_SHOT_DURATION_ALIGNMENT",
  sceneDurationFailures.length === 0,
  sceneDurationFailures.length
    ? JSON.stringify(sceneDurationFailures)
    : "all_scene_shot_totals_match",
);

const activeScenes = (await rows("creative_scenes", (query) =>
  query
    .eq("organization_id", organizationId)
    .eq("creative_project_id", projectId)
    .order("scene_number", { ascending: true }),
)).filter(activeRecord);
const activeShots = (await rows("creative_shots", (query) =>
  query
    .eq("organization_id", organizationId)
    .eq("creative_project_id", projectId)
    .order("scene_number", { ascending: true })
    .order("shot_number", { ascending: true }),
)).filter(activeRecord);
check(
  "MATERIALIZED_SCENE_COUNT",
  expected.sceneCount === null || activeScenes.length === expected.sceneCount,
  `actual=${activeScenes.length};expected=${expected.sceneCount ?? "ANY"}`,
);
check(
  "MATERIALIZED_SHOT_COUNT",
  expected.shotCount === null || activeShots.length === expected.shotCount,
  `actual=${activeShots.length};expected=${expected.shotCount ?? "ANY"}`,
);
check(
  "MATERIALIZED_DURATION",
  expected.durationSeconds === null ||
    Math.abs(durationTotal(activeScenes) - expected.durationSeconds) <= 0.05,
  `actual=${durationTotal(activeScenes)};expected=${expected.durationSeconds ?? "ANY"}`,
);

const selectedAssetIds = canonicalSelectedAssetIds(project);
const selection = object(project.metadata?.asset_selection);
const selectionSource = text(
  project.metadata?.selected_assets_source || selection.source,
);
const strictSourcePolicy = Boolean(
  selection.strict_original_source_only === true ||
  selection.metadata?.strict_original_source_only === true ||
  plan.production?.strict_original_source_only === true,
);
check(
  "CANONICAL_SELECTION_SOURCE",
  selectionSource ===
    "AUTOMATIC_VERIFIED_LONG_FORM_COVERAGE_INTELLIGENCE_V6",
  `source=${selectionSource || "MISSING"}`,
);
check(
  "STRICT_ORIGINAL_SOURCE_POLICY",
  strictSourcePolicy,
  `strict_original_source_only=${strictSourcePolicy}`,
);
check(
  "SELECTED_ASSET_COUNT",
  expected.selectedAssetCount === null ||
    selectedAssetIds.length === expected.selectedAssetCount,
  `actual=${selectedAssetIds.length};expected=${expected.selectedAssetCount ?? "ANY"}`,
);
check(
  "REQUIRED_ASSETS_PRESENT",
  difference(requiredAssetIds, selectedAssetIds).length === 0,
  `missing=${difference(requiredAssetIds, selectedAssetIds).join(",") || "NONE"}`,
);
check(
  "FORBIDDEN_ASSETS_NOT_SELECTED",
  forbiddenAssetIds.every((id) => !selectedAssetIds.includes(id)),
  `present=${forbiddenAssetIds.filter((id) => selectedAssetIds.includes(id)).join(",") || "NONE"}`,
);

const planManifestIds = unique(list(plan.asset_manifest).map(assetId));
check(
  "PLAN_MANIFEST_MATCHES_SELECTION",
  setEqual(planManifestIds, selectedAssetIds),
  `manifest=${planManifestIds.length};selected=${selectedAssetIds.length};missing_from_manifest=${difference(selectedAssetIds, planManifestIds).join(",") || "NONE"};extra_in_manifest=${difference(planManifestIds, selectedAssetIds).join(",") || "NONE"}`,
);

const selectedAssets = selectedAssetIds.length
  ? await rows("creative_assets", (query) =>
      query
        .eq("organization_id", organizationId)
        .in("id", selectedAssetIds),
    )
  : [];
check(
  "SELECTED_ASSET_RECORDS_MATERIALIZED",
  selectedAssets.length === selectedAssetIds.length,
  `records=${selectedAssets.length};selected=${selectedAssetIds.length}`,
);
check(
  "SELECTED_ASSETS_AVAILABLE",
  selectedAssets.every((asset) =>
    asset.archived !== true &&
    !asset.deleted_at &&
    !["ARCHIVED", "DISABLED", "DELETED", "REJECTED", "FAILED"]
      .includes(normalizedStatus(asset.status)) &&
    Boolean(asset.file_url || asset.image_url || asset.thumbnail_url),
  ),
  `unavailable=${selectedAssets
    .filter((asset) =>
      asset.archived === true ||
      asset.deleted_at ||
      ["ARCHIVED", "DISABLED", "DELETED", "REJECTED", "FAILED"]
        .includes(normalizedStatus(asset.status)) ||
      !(asset.file_url || asset.image_url || asset.thumbnail_url),
    )
    .map((asset) => asset.id)
    .join(",") || "NONE"}`,
);

const serializedPlan = JSON.stringify(plan);
const serializedGraph = JSON.stringify(graph);
const serializedDossier = JSON.stringify(dossier);
const forbiddenLeaksBeforeTasks = forbiddenAssetIds.filter((id) =>
  serializedPlan.includes(id) ||
  serializedGraph.includes(id) ||
  serializedDossier.includes(id),
);
check(
  "FORBIDDEN_ASSET_PROVENANCE_CLEAN",
  forbiddenLeaksBeforeTasks.length === 0,
  `leaks=${forbiddenLeaksBeforeTasks.join(",") || "NONE"}`,
);

const recoveryEvidence = object(
  plan.validation?.validated_dossier_plan_recovery ||
  plan.production?.validated_dossier_plan_recovery,
);
check(
  "VALIDATED_PLAN_RECOVERY_EVIDENCE",
  text(recoveryEvidence.contract) ===
    "CREATIVE_VALIDATED_DOSSIER_PLAN_RECOVERY_V2" &&
    Number(recoveryEvidence.canonical_selected_asset_count) ===
      selectedAssetIds.length &&
    setEqual(
      list(recoveryEvidence.canonical_selected_asset_ids),
      selectedAssetIds,
    ) &&
    recoveryEvidence.provider_execution_required === false &&
    recoveryEvidence.customer_charge_required === false,
  `contract=${text(recoveryEvidence.contract) || "MISSING"};canonical_selected=${Number(recoveryEvidence.canonical_selected_asset_count || 0)};provider_execution_required=${String(recoveryEvidence.provider_execution_required)}`,
);

const finalScene = planSceneList[planSceneList.length - 1] || {};
const finalShot = list(finalScene.shots)[list(finalScene.shots).length - 1] || {};
const finalLogoId = text(
  finalShot.graphics?.logo?.asset_id ||
  list(finalShot.reference_asset_ids)[0] ||
  list(finalShot.reference_assets).map(assetId).find(Boolean),
);
const requiredLogoId = requiredAssetIds[0] || null;
check(
  "DETERMINISTIC_FINAL_END_CARD",
  finalShot.generation?.required === false &&
    finalShot.graphics?.render_text_outside_generated_pixels === true &&
    finalShot.graphics?.logo?.required === true &&
    finalShot.graphics?.logo?.exact_asset_required === true &&
    (!requiredLogoId || finalLogoId === requiredLogoId),
  `generation_required=${String(finalShot.generation?.required)};outside_pixels=${String(finalShot.graphics?.render_text_outside_generated_pixels)};exact_logo=${String(finalShot.graphics?.logo?.exact_asset_required)};logo_asset_id=${finalLogoId || "MISSING"}`,
);

const tasks = await rows("creative_production_tasks", (query) =>
  query
    .eq("organization_id", organizationId)
    .eq("creative_project_id", projectId)
    .eq("production_graph_id", graphId)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true }),
);
const buckets = taskCountByBucket(tasks);
const capabilities = taskCountByCapability(tasks);
check(
  "TASK_COUNT",
  expected.taskCount === null || tasks.length === expected.taskCount,
  `actual=${tasks.length};expected=${expected.taskCount ?? "ANY"}`,
);
check(
  "TASK_STATUS_WAITING",
  tasks.every((task) => normalizedStatus(task.status) === "WAITING"),
  `statuses=${JSON.stringify(tasks.reduce((counts, task) => {
    const status = normalizedStatus(task.status) || "UNKNOWN";
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {}))}`,
);
check(
  "TASK_BUCKET_COUNTS",
  (expected.analysisTaskCount === null ||
    Number(buckets.ANALYSIS || 0) === expected.analysisTaskCount) &&
  (expected.videoTaskCount === null ||
    Number(buckets.VIDEO || 0) === expected.videoTaskCount) &&
  (expected.musicTaskCount === null ||
    Number(buckets.MUSIC || 0) === expected.musicTaskCount),
  `buckets=${JSON.stringify(buckets)};expected_analysis=${expected.analysisTaskCount ?? "ANY"};expected_video=${expected.videoTaskCount ?? "ANY"};expected_music=${expected.musicTaskCount ?? "ANY"}`,
);

const videoTasks = tasks.filter((task) => taskBucket(task) === "VIDEO");
const videoShotIds = unique(videoTasks.map((task) => task.shot_id));
check(
  "VIDEO_TASK_SHOT_MAPPING",
  videoShotIds.length === videoTasks.length &&
    videoTasks.every((task) => text(task.shot_id)),
  `video_tasks=${videoTasks.length};unique_shots=${videoShotIds.length};missing_shot_ids=${videoTasks.filter((task) => !text(task.shot_id)).length}`,
);

const paidTasks = tasks.filter((task) => Number(task.cost?.estimated || 0) > 0);
const taskCost = tasks.reduce(
  (sum, task) => sum + Number(task.cost?.estimated || 0),
  0,
);
check(
  "TASK_COST",
  expected.estimatedCost === null ||
    Math.abs(taskCost - expected.estimatedCost) <= 0.0001,
  `actual=${Number(taskCost.toFixed(6))};expected=${expected.estimatedCost ?? "ANY"}`,
);
check(
  "TASK_PREFLIGHT_READY",
  paidTasks.every((task) =>
    task.metadata?.service_execution_preflight_passed === true ||
    task.input?.generation?.service_execution_preflight?.ready === true ||
    task.input?.requirements?.service_execution_preflight?.ready === true,
  ),
  `paid_tasks=${paidTasks.length};not_ready=${paidTasks
    .filter((task) =>
      task.metadata?.service_execution_preflight_passed !== true &&
      task.input?.generation?.service_execution_preflight?.ready !== true &&
      task.input?.requirements?.service_execution_preflight?.ready !== true,
    )
    .map((task) => task.id)
    .join(",") || "NONE"}`,
);
check(
  "TASKS_NOT_DISPATCHED",
  tasks.every((task) =>
    !task.timing?.started_at &&
    !task.output?.provider_job_id &&
    !task.output?.usage?.id &&
    !task.output?.provider_submission?.usage?.id,
  ),
  `dispatched=${tasks
    .filter((task) =>
      task.timing?.started_at ||
      task.output?.provider_job_id ||
      task.output?.usage?.id ||
      task.output?.provider_submission?.usage?.id,
    )
    .map((task) => task.id)
    .join(",") || "NONE"}`,
);

const forbiddenTaskLeaks = forbiddenAssetIds.filter((id) =>
  JSON.stringify(tasks).includes(id),
);
check(
  "TASK_PROVENANCE_CLEAN",
  forbiddenTaskLeaks.length === 0,
  `leaks=${forbiddenTaskLeaks.join(",") || "NONE"}`,
);

const machineLanguage = narrativeCorpus(plan, tasks);
const machineLanguageMatches = machineLanguage.match(
  /\bparticipant(?:s|'s)?\b/gi,
) || [];
check(
  "HUMAN_ROLE_LANGUAGE",
  machineLanguageMatches.length === 0,
  `participant_terms=${machineLanguageMatches.length}`,
);

const dossierDocument = object(dossier.metadata?.dossier);
const dossierCost = finite(
  dossierDocument.cost?.estimated_total ??
  dossier.metadata?.estimated_cost ??
  dossier.cost?.estimated,
);
const dossierCurrency = text(
  dossierDocument.cost?.currency ||
  dossier.metadata?.currency ||
  dossier.cost?.currency,
).toUpperCase();
check(
  "DOSSIER_COST",
  (expected.estimatedCost === null ||
    Math.abs(Number(dossierCost || 0) - expected.estimatedCost) <= 0.0001) &&
  (expected.currency === null || dossierCurrency === expected.currency),
  `cost=${dossierCost};expected_cost=${expected.estimatedCost ?? "ANY"};currency=${dossierCurrency || "MISSING"};expected_currency=${expected.currency ?? "ANY"}`,
);
check(
  "DOSSIER_CHECKLIST",
  dossierDocument.approval_checklist?.passed === true &&
    list(dossierDocument.approval_checklist?.failures).length === 0,
  `passed=${String(dossierDocument.approval_checklist?.passed)};failures=${list(dossierDocument.approval_checklist?.failures).join(",") || "NONE"}`,
);
check(
  "DOSSIER_GRAPH_HASH_BINDING",
  text(dossier.metadata?.plan_hash) &&
    text(dossier.metadata?.graph_hash) &&
    text(dossier.metadata?.execution_hash) &&
    text(dossier.metadata?.plan_hash) === text(graph.metadata?.plan_hash) &&
    text(dossier.metadata?.graph_hash) === text(graph.metadata?.graph_hash) &&
    text(dossier.metadata?.execution_hash) === text(graph.metadata?.execution_hash) &&
    text(graph.metadata?.production_dossier_asset_node_id) === dossierId,
  `plan_hash_match=${text(dossier.metadata?.plan_hash) === text(graph.metadata?.plan_hash)};graph_hash_match=${text(dossier.metadata?.graph_hash) === text(graph.metadata?.graph_hash)};execution_hash_match=${text(dossier.metadata?.execution_hash) === text(graph.metadata?.execution_hash)};graph_dossier=${text(graph.metadata?.production_dossier_asset_node_id)}`,
);

const allDossiers = await rows("creative_asset_nodes", (query) =>
  query
    .eq("organization_id", organizationId)
    .eq("creative_project_id", projectId)
    .eq("type", "PRODUCTION_DOSSIER")
    .order("created_at", { ascending: false }),
);
const activeDossiers = allDossiers.filter(activeRecord);
check(
  "ONE_ACTIVE_DOSSIER",
  activeDossiers.length === 1 && activeDossiers[0]?.id === dossierId,
  `active=${activeDossiers.map((item) => `${item.id}:${item.status}`).join(",") || "NONE"}`,
);
check(
  "SUPERSEDED_DOSSIERS_INACTIVE",
  supersededDossierIds.every((id) => {
    const candidate = allDossiers.find((item) => item.id === id);
    return candidate && !activeRecord(candidate);
  }),
  `active_superseded=${supersededDossierIds
    .filter((id) => {
      const candidate = allDossiers.find((item) => item.id === id);
      return !candidate || activeRecord(candidate);
    })
    .join(",") || "NONE"}`,
);

const allGraphs = await rows("creative_production_graphs", (query) =>
  query
    .eq("organization_id", organizationId)
    .eq("creative_project_id", projectId)
    .order("created_at", { ascending: false }),
);
const activeGraphs = allGraphs.filter(activeRecord);
check(
  "ONE_ACTIVE_GRAPH",
  activeGraphs.length === 1 && activeGraphs[0]?.id === graphId,
  `active=${activeGraphs.map((item) => `${item.id}:${item.status}`).join(",") || "NONE"}`,
);
check(
  "GRAPH_APPROVAL_BOUNDARY",
  graph.cost_plan?.approval_required === true &&
    graph.cost_plan?.approved !== true &&
    graph.metadata?.production_dossier_human_approval_required === true &&
    graph.metadata?.approved_plan_hash == null,
  `approval_required=${String(graph.cost_plan?.approval_required)};approved=${String(graph.cost_plan?.approved)};approved_plan_hash=${text(graph.metadata?.approved_plan_hash) || "NONE"}`,
);

const mediaUsage = await rows("platform_service_usage", (query) =>
  query
    .eq("organization_id", organizationId)
    .eq("metadata->>creative_project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(250),
);
const dossierCreatedAt = Date.parse(dossier.created_at || 0);
const postDossierMediaUsage = mediaUsage.filter((usage) =>
  Date.parse(usage.created_at || 0) >= dossierCreatedAt &&
  normalizedStatus(usage.category) !== "CREATIVE_DIRECTION",
);
check(
  "NO_POST_DOSSIER_MEDIA_USAGE",
  postDossierMediaUsage.length === 0,
  `count=${postDossierMediaUsage.length};usage_ids=${postDossierMediaUsage.map((item) => item.id).join(",") || "NONE"}`,
);

const state = await CreativeStateEngine.get({
  organization_id: organizationId,
  creative_mission_id: missionId,
  creative_project_id: projectId,
});
check(
  "EXECUTION_LOCK_RELEASED",
  state?.execution_lock !== true,
  `execution_lock=${String(state?.execution_lock)};stage=${state?.stage || "MISSING"}`,
);
check(
  "READY_FOR_APPROVAL_STAGE",
  normalizedStatus(state?.stage) === "READY_FOR_EXECUTION",
  `stage=${state?.stage || "MISSING"}`,
);

console.log("============================================================");
console.log("CREATIVE PRODUCTION DOSSIER AUDIT");
console.log("============================================================");
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`CREATIVE_MISSION_ID=${missionId}`);
console.log(`CREATIVE_PROJECT_ID=${projectId}`);
console.log(`PRODUCTION_DOSSIER_ID=${dossierId}`);
console.log(`PRODUCTION_GRAPH_ID=${graphId}`);
console.log(`SELECTION_SOURCE=${selectionSource}`);
console.log(`SELECTED_ASSET_COUNT=${selectedAssetIds.length}`);
for (const asset of selectedAssets) {
  console.log(
    `SELECTED_ASSET=${asset.id}|${asset.name || asset.title || asset.file_name || ""}`,
  );
}
console.log(`PLAN_SCENE_COUNT=${planSceneList.length}`);
console.log(`PLAN_SHOT_COUNT=${planShotList.length}`);
console.log(`PLAN_DURATION_SECONDS=${planDuration}`);
console.log(`TASK_COUNT=${tasks.length}`);
console.log(`TASK_BUCKET_COUNTS=${JSON.stringify(buckets)}`);
console.log(`TASK_CAPABILITY_COUNTS=${JSON.stringify(capabilities)}`);
console.log(`TASK_ESTIMATED_COST=${Number(taskCost.toFixed(6))}`);
console.log(`DOSSIER_ESTIMATED_COST=${dossierCost}`);
console.log(`DOSSIER_CURRENCY=${dossierCurrency}`);
console.log(`ACTIVE_DOSSIER_COUNT=${activeDossiers.length}`);
console.log(`ACTIVE_GRAPH_COUNT=${activeGraphs.length}`);
console.log(`POST_DOSSIER_MEDIA_USAGE_COUNT=${postDossierMediaUsage.length}`);
console.log(`CHECK_COUNT=${checks.length}`);
console.log(`FAILED_CHECK_COUNT=${checks.filter((item) => !item.passed).length}`);
console.log(
  `FAILED_CHECKS=${checks
    .filter((item) => !item.passed)
    .map((item) => item.name)
    .join(",") || "NONE"}`,
);
console.log(
  `AUDIT_STATUS=${checks.every((item) => item.passed) ? "PASS" : "FAIL"}`,
);
console.log("PAID_MEDIA_EXECUTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("READ_ONLY_AUDIT=YES");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (checks.some((item) => !item.passed)) process.exit(1);

#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const INPUT_CONTRACT = "CHURCHILL_CREATIVE_STORY_LINEAGE_FORENSIC_AUDIT_V1";
const OUTPUT_CONTRACT = "CHURCHILL_CREATIVE_STORY_LINEAGE_FORENSIC_AUDIT_V2";
const SOURCE_REPAIR = "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_SOURCE_V1";
const REVIEW_REPAIR = "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1";
const STORY_KEYS = [
  "hook",
  "audience_tension",
  "escalation",
  "observable_proof",
  "turn",
  "resolution",
  "call_to_action",
  "emotional_arc",
  "anti_cliche_strategy",
];
const CAUSAL_FIELDS = [
  "story_state_before",
  "state_change",
  "story_state_after",
  "transition_logic",
];
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

function readJson(filePath, label) {
  const absolute = path.resolve(text(filePath));
  if (!absolute || !fs.existsSync(absolute)) {
    throw new Error(`${label}_NOT_FOUND:${absolute || "MISSING"}`);
  }
  const raw = fs.readFileSync(absolute, "utf8");
  return {
    absolute,
    file_sha256: sha256(raw),
    value: JSON.parse(raw),
  };
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
  return [...list(rows)].sort((left, right) => {
    const a = Date.parse(left.updated_at || left.created_at || 0) || 0;
    const b = Date.parse(right.updated_at || right.created_at || 0) || 0;
    return b - a;
  })[0] || null;
}

function walk(value, visitor, currentPath = "root", seen = new Set(), depth = 0) {
  if (depth > 30 || !value || typeof value !== "object" || seen.has(value)) return;
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
    tasks: [...list(state.tasks)]
      .sort((left, right) => text(left.id).localeCompare(text(right.id)))
      .map(taskState),
    usage_count: state.usage_count,
    wallet: state.wallet,
  });
}

function canonicalExecutionId(value) {
  const raw = text(value);
  if (!raw) return null;
  return raw.split(":")[0] || null;
}

function lineage(value = {}) {
  const fields = pathsFor(value, ({ key, value: item }) =>
    LINEAGE_KEYS.includes(key) && Boolean(text(item)));
  return {
    keys: unique(fields.map((entry) => entry.key)),
    paths: fields.map((entry) => entry.path),
  };
}

function planSnapshot(graph = {}) {
  const direct = object(graph.metadata?.approval_plan_snapshot);
  if (Object.keys(direct).length) return direct;
  const candidates = pathsFor(graph, ({ key, value }) =>
    /^(?:approval_plan_snapshot|creative_plan|master_plan)$/i.test(key) &&
    value && typeof value === "object" && !Array.isArray(value));
  return object(candidates[0]?.value);
}

function graphNodes(graph = {}) {
  const candidates = [
    graph.nodes,
    graph.graph?.nodes,
    graph.production_graph?.nodes,
    graph.metadata?.nodes,
    graph.metadata?.production_graph?.nodes,
  ];
  for (const candidate of candidates) {
    if (list(candidate).length) return list(candidate);
  }
  const nested = pathsFor(graph, ({ key, value }) =>
    key === "nodes" && Array.isArray(value) && value.length > 0);
  return list(nested[0]?.value);
}

function storyAuthority(plan = {}) {
  const story = object(plan.story);
  const architecture = object(plan.story_architecture);
  const overlaps = [];
  const conflicts = [];
  for (const key of STORY_KEYS) {
    const left = text(story[key]);
    const right = text(architecture[key]);
    if (!left || !right) continue;
    overlaps.push(key);
    if (left !== right) conflicts.push({ key, story: left, story_architecture: right });
  }
  return {
    story_present: Object.keys(story).length > 0,
    story_architecture_present: Object.keys(architecture).length > 0,
    story_keys: Object.keys(story).sort(),
    story_architecture_keys: Object.keys(architecture).sort(),
    overlapping_canonical_keys: overlaps,
    canonical_conflicts: conflicts,
    semantic_conflict_proven: conflicts.length > 0,
    preferred_authority: Object.keys(story).length ? "plan.story" :
      Object.keys(architecture).length ? "plan.story_architecture" : null,
  };
}

function persistedScenePlanIndex(scene = {}) {
  const direct = Number(scene.metadata?.master_plan_index);
  if (Number.isInteger(direct) && direct >= 0) return direct;
  const number = Number(scene.scene_number);
  return Number.isInteger(number) && number > 0 ? number - 1 : null;
}

function persistedShotPlanIndex(shot = {}) {
  const direct = Number(shot.metadata?.master_plan_shot_index);
  if (Number.isInteger(direct) && direct >= 0) return direct;
  const number = Number(shot.shot_number);
  return Number.isInteger(number) && number > 0 ? number - 1 : null;
}

function materializationEvidence(task = {}) {
  const contract = object(task.input?.requirements?.task_materialization_contract);
  const metadata = object(contract.node_metadata);
  const nestedContracts = pathsFor(metadata, ({ key }) => key === "task_materialization_contract");
  const broadKeys = pathsFor(metadata, ({ key }) => [
    "requirements",
    "generation",
    "input",
    "provider_parameters",
    "asset_scope",
  ].includes(key));
  return {
    contract_present: Object.keys(contract).length > 0,
    contract_hash: contract.contract_hash || null,
    node_id: contract.node_id || null,
    nested_contract_paths: nestedContracts.map((entry) => entry.path),
    broad_metadata_paths: broadKeys.map((entry) => entry.path),
    recursive: nestedContracts.length > 0,
    not_allowlisted: broadKeys.length > 0,
  };
}

function normalizedMessages(value) {
  return list(value).map((item) => {
    if (typeof item === "string") return text(item);
    return text(
      item?.description ||
      item?.message ||
      item?.failure ||
      item?.issue ||
      item?.instruction ||
      JSON.stringify(item),
    );
  }).filter(Boolean);
}

function failureSignals(review = {}) {
  const evidence = object(review.output?.perceptual_validation?.evidence);
  const failures = normalizedMessages(evidence.failures);
  const repairs = normalizedMessages(evidence.repair_instructions);
  const corpus = `${failures.join(" ")} ${repairs.join(" ")}`.toLowerCase();
  const has = (pattern) => pattern.test(corpus);
  return {
    failures,
    repairs,
    story: has(/story|narrative|screen direction|action visible|contextual/),
    camera: has(/camera|jitter|movement|framing|focus|lens/),
    identity: has(/identity|guest|staff|band member|wardrobe|hairstyle/),
    product: has(/product|dish|drink|food|plating|stage setup/),
    environment: has(/environment|architecture|location|spatial geography|interior|entrance/),
    continuity: has(/continuity|screen direction|spatial geography|wardrobe/),
    performance: has(/performance|dancing|clapping|interaction|gesture/),
    artifacts: has(/artifact|halo|synthetic|distortion/),
  };
}

function recommendedStrategy(signals = {}, expected = {}, source = {}) {
  const identity = expected.identity_expected === true || signals.identity;
  const product = expected.product_expected === true || signals.product;
  const environment = signals.environment;
  const temporal = signals.story || signals.continuity || signals.performance;
  const sourceAsset = text(
    source.input?.requirements?.primary_source_asset_id ||
    source.input?.generation?.primary_source_asset_id ||
    source.metadata?.primary_source_asset_id,
  ) || null;
  if ((identity || product || environment) && temporal) {
    return {
      method: "THREE_KEYFRAME_TO_VIDEO",
      reason: "Opening, action and closing truth all require independent approval before motion generation.",
      primary_source_asset_id: sourceAsset,
    };
  }
  if (identity || product || environment) {
    return {
      method: "SINGLE_KEYFRAME_TO_VIDEO",
      reason: "A controlled visual anchor is required before motion generation.",
      primary_source_asset_id: sourceAsset,
    };
  }
  if (sourceAsset) {
    return {
      method: "ASSET_LED_MOTION_OR_DIRECT_SOURCE_EDIT",
      reason: "A verified primary source exists and should be preferred over unconstrained regeneration.",
      primary_source_asset_id: sourceAsset,
    };
  }
  return {
    method: "DIRECT_VIDEO_AFTER_STORY_PREFLIGHT",
    reason: "No strict visual anchor is proven, but story preflight remains required.",
    primary_source_asset_id: null,
  };
}

async function loadState(scope, runtimes, supabaseAdmin) {
  const project = await runtimes.CreativeProjectRuntime.get(scope.projectId);
  const graph = await runtimes.ProductionGraphRuntime.get(scope.graphId);
  if (!project || text(project.organization_id) !== scope.organizationId) {
    throw new Error("STORY_LINEAGE_V2_PROJECT_NOT_FOUND");
  }
  if (!graph || text(graph.organization_id) !== scope.organizationId ||
    text(graph.creative_project_id) !== scope.projectId) {
    throw new Error("STORY_LINEAGE_V2_GRAPH_NOT_FOUND");
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
  const [mission, briefs, research, strategies, concepts, storyboards, scenes, shots, tasks, usage, wallet] = await Promise.all([
    missionId ? runtimes.CreativeMissionRuntime.get(missionId) : null,
    runtimes.CreativeBriefRuntime.list(query),
    runtimes.ResearchRuntime.list(query),
    runtimes.CreativeStrategyRuntime.list(query),
    runtimes.CreativeConceptRuntime.list(query),
    runtimes.StoryboardRuntime.list(query),
    runtimes.SceneRuntime.list(query),
    runtimes.ShotRuntime.list(query),
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
    briefs: list(briefs),
    research: list(research),
    strategies: list(strategies),
    concepts: list(concepts),
    storyboards: list(storyboards),
    scenes: list(scenes),
    shots: list(shots),
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

const v1File = readJson(process.argv[2], "STORY_LINEAGE_V1_AUDIT");
const v1 = object(v1File.value);
if (text(v1.contract) !== INPUT_CONTRACT) {
  throw new Error("STORY_LINEAGE_V1_CONTRACT_INVALID");
}

const scope = {
  organizationId: text(process.env.ORGANIZATION_ID),
  projectId: text(process.env.CREATIVE_PROJECT_ID),
  graphId: text(process.env.PRODUCTION_GRAPH_ID),
};
const outputPath = path.resolve(
  text(process.env.STORY_LINEAGE_V2_AUDIT_OUTPUT) ||
  "/tmp/churchill-creative-story-lineage-forensic-audit-v2.json",
);
if (!scope.organizationId || !scope.projectId || !scope.graphId) {
  throw new Error("STORY_LINEAGE_V2_SCOPE_REQUIRED");
}
if (
  text(v1.organization_id) !== scope.organizationId ||
  text(v1.creative_project_id) !== scope.projectId ||
  text(v1.production_graph_id) !== scope.graphId
) {
  throw new Error("STORY_LINEAGE_V1_SCOPE_INVALID");
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
  { ProductionGraphRuntime },
  { ProductionTaskRuntime },
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
  import("@/lib/creative/production-graph/runtime/ProductionGraphRuntime"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
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
  ProductionGraphRuntime,
  ProductionTaskRuntime,
};

const before = await loadState(scope, runtimes, supabaseAdmin);
const beforeHash = fingerprint(before);
const plan = planSnapshot(before.graph);
const planScenes = list(plan.scenes);
const planShotMap = new Map(
  planScenes.flatMap((scene) => list(scene.shots)).map((shot) => [text(shot.id), shot]),
);
const nodes = graphNodes(before.graph);
const nodeMap = new Map(nodes.map((node) => [text(node.id), node]));
const taskMap = new Map(before.tasks.map((task) => [text(task.id), task]));
const research = newest(before.research) || {};
const researchIdentity = text(research.metadata?.research_identity) || text(v1.research?.research_identity) || null;
const industry = text(research.metadata?.company_resolution?.industry) || text(research.metadata?.industry) || text(v1.research?.industry) || null;
const authority = storyAuthority(plan);

const falsePositives = [];
const provenBlockers = [];
const historicalDefects = [];
const futureRuntimeDefects = [];
const observations = [];

if (!authority.semantic_conflict_proven && list(v1.blockers).includes("DUAL_STORY_AUTHORITIES_DIVERGE")) {
  falsePositives.push("V1_DUAL_STORY_AUTHORITIES_DIVERGE_NOT_PROVEN");
}
if (authority.semantic_conflict_proven) {
  provenBlockers.push("CANONICAL_STORY_FIELDS_CONFLICT");
}
if (!researchIdentity || !JSON.stringify(plan).includes(researchIdentity)) {
  provenBlockers.push("RESEARCH_IDENTITY_LINEAGE_MISSING_FROM_APPROVED_PLAN");
}
if (!industry || !JSON.stringify(plan).toLowerCase().includes(industry.toLowerCase())) {
  provenBlockers.push("INDUSTRY_LINEAGE_MISSING_FROM_APPROVED_PLAN");
}
const evidencePaths = pathsFor(
  authority.preferred_authority === "plan.story" ? plan.story : plan.story_architecture,
  ({ key, value }) => /(?:claim_ids|source_ids|evidence_ids|research_claims|evidence)$/i.test(key) &&
    (Array.isArray(value) || typeof value === "string"),
);
if (evidencePaths.length === 0) {
  provenBlockers.push("STORY_RESEARCH_EVIDENCE_REFERENCES_MISSING");
}

const documentLineage = {
  strategy: lineage(newest(before.strategies) || {}),
  concept: lineage(newest(before.concepts) || {}),
  storyboard: lineage(newest(before.storyboards) || {}),
};
for (const [name, details] of Object.entries(documentLineage)) {
  if (!details.keys.includes("research_identity") ||
      !details.keys.includes("story_contract_hash")) {
    provenBlockers.push(`${name.toUpperCase()}_AUTHORITATIVE_LINEAGE_INCOMPLETE`);
  }
}

const persistedSceneReports = [];
for (const scene of before.scenes) {
  const sceneIndex = persistedScenePlanIndex(scene);
  const planScene = Number.isInteger(sceneIndex) ? planScenes[sceneIndex] : null;
  const dropped = CAUSAL_FIELDS.filter((field) =>
    Boolean(text(planScene?.[field])) &&
    !Boolean(text(scene[field] ?? scene.metadata?.[field])));
  const issues = [];
  if (!planScene) issues.push("PERSISTED_SCENE_NOT_MAPPED_TO_APPROVED_PLAN");
  if (dropped.length) issues.push("PERSISTED_SCENE_CAUSAL_FIELDS_DROPPED");
  if (!lineage(scene).keys.includes("story_contract_hash")) {
    issues.push("PERSISTED_SCENE_STORY_HASH_MISSING");
  }
  persistedSceneReports.push({
    persisted_scene_id: scene.id,
    scene_number: scene.scene_number,
    plan_scene_id: planScene?.id || null,
    dropped_causal_fields: dropped,
    issues,
  });
}

const persistedShotReports = [];
for (const shot of before.shots) {
  const scene = before.scenes.find((item) => text(item.id) === text(shot.scene_id));
  const sceneIndex = persistedScenePlanIndex(scene || {});
  const shotIndex = persistedShotPlanIndex(shot);
  const planShot = Number.isInteger(sceneIndex) && Number.isInteger(shotIndex)
    ? list(planScenes[sceneIndex]?.shots)[shotIndex] || null
    : null;
  const issues = [];
  if (!planShot) issues.push("PERSISTED_SHOT_NOT_MAPPED_TO_APPROVED_PLAN");
  if (planShot && text(planShot.subject) !== text(shot.subject)) {
    issues.push("PERSISTED_SHOT_SUBJECT_DIFFERS_FROM_APPROVED_PLAN");
  }
  if (!lineage(shot).keys.includes("story_contract_hash")) {
    issues.push("PERSISTED_SHOT_STORY_HASH_MISSING");
  }
  const promptPaths = pathsFor(shot, ({ key, value }) =>
    /^(?:provider_prompt|prompt|negative_prompt)$/i.test(key) && Boolean(text(value)))
    .map((entry) => entry.path);
  if (promptPaths.length) issues.push("PERSISTED_SHOT_PROVIDER_PROMPT_AUTHORITY");
  persistedShotReports.push({
    persisted_shot_id: shot.id,
    persisted_scene_id: shot.scene_id,
    plan_shot_id: planShot?.id || null,
    approved_subject: planShot?.subject || null,
    persisted_subject: shot.subject || null,
    prompt_paths: promptPaths,
    issues,
  });
}

const unmatchedPersistedShots = persistedShotReports.filter((item) => !item.plan_shot_id);
const planSceneCountMismatch = before.scenes.length !== planScenes.length;
if (planSceneCountMismatch || unmatchedPersistedShots.length > 0) {
  provenBlockers.push("PERSISTED_CREATIVE_DOCUMENTS_DO_NOT_MATCH_APPROVED_PLAN_VERSION");
  historicalDefects.push("STALE_OR_TRANSFORMED_SCENE_SHOT_DOCUMENT_SET_WITHOUT_SUPERSESSION_LINEAGE");
}
if (persistedSceneReports.some((item) => item.dropped_causal_fields.length)) {
  provenBlockers.push("SCENE_CAUSAL_STATE_DROPPED_DURING_PERSISTENCE");
}
if (persistedShotReports.some((item) => item.issues.includes("PERSISTED_SHOT_PROVIDER_PROMPT_AUTHORITY"))) {
  provenBlockers.push("PERSISTED_PROVIDER_PROMPTS_COMPETE_WITH_STRUCTURED_DIRECTION");
}

const sourceTasks = before.tasks.filter((task) =>
  text(task.metadata?.repair_payload_contract) === SOURCE_REPAIR);
const reviewTasks = before.tasks.filter((task) =>
  text(task.metadata?.repair_payload_contract) === REVIEW_REPAIR);
const pairReports = [];
let mappedReplacementCount = 0;
let mappedGraphNodeCount = 0;
for (const source of sourceTasks) {
  const sourceExecution = text(source.metadata?.execution_node_id);
  const canonicalShotId = canonicalExecutionId(sourceExecution);
  const planShot = planShotMap.get(canonicalShotId) || null;
  const graphNode = nodeMap.get(canonicalShotId) || nodeMap.get(sourceExecution) || null;
  const review = reviewTasks.find((candidate) =>
    text(candidate.metadata?.repaired_source_task_id) === text(source.id) ||
    list(candidate.depends_on).map(text).includes(text(source.id))) || null;
  const originalSource = taskMap.get(text(source.metadata?.repair_of_task_id));
  const originalReview = taskMap.get(text(source.metadata?.repair_quality_task_id));
  const expected = object(
    review?.input?.requirements?.expected_contract ||
    originalReview?.input?.requirements?.expected_contract,
  );
  const signals = failureSignals(review || {});
  const materialization = materializationEvidence(source);
  const reviewMaterialization = materializationEvidence(review || {});
  if (planShot) mappedReplacementCount += 1;
  if (graphNode) mappedGraphNodeCount += 1;
  const issues = [];
  if (!planShot) issues.push("CANONICAL_PLAN_SHOT_NOT_FOUND");
  if (!graphNode) issues.push("CANONICAL_GRAPH_NODE_NOT_FOUND");
  if (materialization.recursive || reviewMaterialization.recursive) {
    issues.push("HISTORICAL_MATERIALIZATION_CONTRACT_RECURSIVE");
  }
  if (materialization.not_allowlisted || reviewMaterialization.not_allowlisted) {
    issues.push("HISTORICAL_MATERIALIZATION_METADATA_NOT_ALLOWLISTED");
  }
  let classification = "PROVIDER_CONTENT_FAILURE_WITH_UNVERIFIED_UPSTREAM_LINEAGE";
  if (!planShot || !graphNode) classification = "EXECUTION_LINEAGE_MAPPING_FAILURE";
  else if (!signals.failures.length && !signals.repairs.length) {
    classification = "UNEXPLAINED_REVIEW_FAILURE_REQUIRES_CONTRACT_AUDIT";
  }
  pairReports.push({
    replacement_source_task_id: source.id,
    replacement_review_task_id: review?.id || null,
    execution_node_id: sourceExecution || null,
    canonical_shot_id: canonicalShotId,
    plan_shot_found: Boolean(planShot),
    graph_node_found: Boolean(graphNode),
    plan_subject: planShot?.subject || null,
    graph_subject: graphNode?.requirements?.subject || null,
    graph_purpose: graphNode?.intent?.purpose || graphNode?.requirements?.purpose || null,
    classification,
    failure_signals: signals,
    strategy_recommendation: recommendedStrategy(signals, expected, source),
    materialization,
    review_materialization: reviewMaterialization,
    issues,
  });
}

if (mappedReplacementCount === sourceTasks.length &&
    list(v1.blockers).includes("REPLACEMENT_SOURCE_PLAN_SHOT_MISSING")) {
  falsePositives.push("V1_REPLACEMENT_SOURCE_PLAN_SHOT_MISSING_MAPPING_FALSE_POSITIVE");
}
if (mappedGraphNodeCount === sourceTasks.length &&
    list(v1.blockers).includes("GRAPH_SHOT_NODE_MISSING")) {
  falsePositives.push("V1_GRAPH_SHOT_NODE_MISSING_MAPPING_FALSE_POSITIVE");
}
if (mappedReplacementCount !== sourceTasks.length) {
  provenBlockers.push("ONE_OR_MORE_REPLACEMENT_TASKS_NOT_MAPPED_TO_APPROVED_SHOTS");
}
if (mappedGraphNodeCount !== sourceTasks.length) {
  provenBlockers.push("ONE_OR_MORE_REPLACEMENT_TASKS_NOT_MAPPED_TO_GRAPH_NODES");
}
if (pairReports.some((item) =>
  item.materialization.recursive || item.review_materialization.recursive)) {
  historicalDefects.push("PAIR_REPAIR_TASKS_CONTAIN_RECURSIVE_MATERIALIZATION_CONTRACTS");
  futureRuntimeDefects.push("MATERIALIZATION_CONTRACT_MUST_USE_CANONICAL_METADATA_ALLOWLIST_AND_IDEMPOTENT_ATTACH");
}

const graphSubjectCollapse = pairReports.filter((item) =>
  item.graph_node_found &&
  text(item.graph_subject) &&
  text(item.graph_subject) === text(item.graph_purpose) &&
  text(item.plan_subject) &&
  text(item.graph_subject) !== text(item.plan_subject));
if (graphSubjectCollapse.length) {
  provenBlockers.push("GRAPH_VISIBLE_SUBJECT_COLLAPSED_INTO_PURPOSE");
  futureRuntimeDefects.push("PRODUCTION_GRAPH_SHOT_REQUIREMENTS_MUST_PRESERVE_SHOT_SUBJECT");
}

futureRuntimeDefects.push(
  "APPROVED_PLAN_MUST_CARRY_RESEARCH_IDENTITY_INDUSTRY_CONTEXT_AND_STORY_EVIDENCE_REFERENCES",
  "STRATEGY_CONCEPT_STORYBOARD_SCENE_SHOT_AND_GRAPH_MUST_CARRY_ONE_STORY_CONTRACT_HASH",
  "PERSISTED_CREATIVE_DOCUMENT_REUSE_MUST_REQUIRE_MATCHING_AUTHORITY_HASHES",
  "PROVIDER_SERIALIZATION_MUST_BE_TRANSIENT_AND_NOT_PERSISTED_AS_CREATIVE_AUTHORITY",
);

const after = await loadState(scope, runtimes, supabaseAdmin);
const afterHash = fingerprint(after);
const stateUnchanged = beforeHash === afterHash;
if (!stateUnchanged) provenBlockers.push("READ_ONLY_V2_AUDIT_CHANGED_STATE");

const finalProvenBlockers = unique(provenBlockers);
const finalFalsePositives = unique(falsePositives);
const finalHistoricalDefects = unique(historicalDefects);
const finalFutureRuntimeDefects = unique(futureRuntimeDefects);
const repairDesign = {
  phase_1_runtime_contract_repair: [
    "Introduce one immutable CreativeStoryLineageContract computed from the validated research record and approved plan.",
    "Preserve shot.subject separately from shot.purpose in persisted documents and graph requirements.",
    "Make production-task materialization metadata allowlisted and attach idempotent.",
    "Remove provider prompts from persisted strategy, concept, storyboard, shot, graph and task authority fields.",
    "Require authority-hash equality before reusing persisted strategy, concept, storyboard, scenes or shots.",
  ],
  phase_2_current_project_historical_reconciliation: [
    "Create a read-only supersession map from the five persisted scenes and thirteen persisted shots to the seven-scene approved plan.",
    "Do not overwrite historical records. Prepare new versioned creative documents or a signed lineage sidecar that identifies the authoritative plan.",
    "Mark the nine failed replacement pairs as historical media evidence, not as the next regeneration specification.",
  ],
  phase_3_shot_strategy_redesign: pairReports.map((item) => ({
    canonical_shot_id: item.canonical_shot_id,
    method: item.strategy_recommendation.method,
    reason: item.strategy_recommendation.reason,
  })),
  forbidden_until_separate_authorization: [
    "provider binding",
    "spend approval",
    "task dispatch",
    "review rerun",
    "source regeneration",
    "finalisation",
    "publication",
  ],
};

const decision = finalProvenBlockers.length
  ? "PROVEN_STORY_LINEAGE_AND_RUNTIME_REPAIRS_REQUIRED"
  : "STORY_LINEAGE_PROVEN_READY_FOR_SHOT_STRATEGY_PREVIEW";
const readiness = finalProvenBlockers.length
  ? "READY_FOR_PHASE_1_RUNTIME_CONTRACT_REPAIR_DESIGN"
  : "READY_FOR_READ_ONLY_SHOT_STRATEGY_PREVIEW";

const report = {
  contract: OUTPUT_CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: scope.organizationId,
  creative_project_id: scope.projectId,
  production_graph_id: scope.graphId,
  v1_audit_file: v1File.absolute,
  v1_audit_file_sha256: v1File.file_sha256,
  v1_decision: v1.decision || null,
  current_state: {
    task_count: before.tasks.length,
    task_status_counts: taskCounts(before.tasks),
    usage_count: before.usage_count,
    wallet: before.wallet,
    graph_node_count: nodes.length,
    plan_scene_count: planScenes.length,
    plan_shot_count: planShotMap.size,
    persisted_scene_count: before.scenes.length,
    persisted_shot_count: before.shots.length,
  },
  story_authority: authority,
  research_lineage: {
    research_identity: researchIdentity,
    industry,
    research_identity_present_in_plan: Boolean(researchIdentity && JSON.stringify(plan).includes(researchIdentity)),
    industry_present_in_plan: Boolean(industry && JSON.stringify(plan).toLowerCase().includes(industry.toLowerCase())),
    story_evidence_paths: evidencePaths.map((entry) => entry.path),
  },
  document_lineage: documentLineage,
  persisted_scenes: persistedSceneReports,
  persisted_shots: persistedShotReports,
  replacement_mapping: {
    source_count: sourceTasks.length,
    review_count: reviewTasks.length,
    plan_mapped_count: mappedReplacementCount,
    graph_mapped_count: mappedGraphNodeCount,
    graph_subject_collapse_count: graphSubjectCollapse.length,
    pairs: pairReports,
  },
  v1_false_positives: finalFalsePositives,
  proven_blockers: finalProvenBlockers,
  historical_defects: finalHistoricalDefects,
  future_runtime_defects: finalFutureRuntimeDefects,
  observations,
  repair_design: repairDesign,
  decision,
  readiness,
  exact_state_before_sha256: beforeHash,
  exact_state_after_sha256: afterHash,
  state_unchanged: stateUnchanged,
  database_writes_executed: false,
  provider_selection_executed: false,
  provider_spend_approved: false,
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
console.log("READ-ONLY CHURCHILL CREATIVE STORY LINEAGE FORENSIC AUDIT V2");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`GRAPH_NODE_COUNT=${nodes.length}`);
console.log(`PLAN_SCENE_COUNT=${planScenes.length}`);
console.log(`PLAN_SHOT_COUNT=${planShotMap.size}`);
console.log(`PERSISTED_SCENE_COUNT=${before.scenes.length}`);
console.log(`PERSISTED_SHOT_COUNT=${before.shots.length}`);
console.log(`REPLACEMENT_SOURCE_COUNT=${sourceTasks.length}`);
console.log(`REPLACEMENT_PLAN_MAPPED_COUNT=${mappedReplacementCount}`);
console.log(`REPLACEMENT_GRAPH_MAPPED_COUNT=${mappedGraphNodeCount}`);
console.log(`STORY_CANONICAL_CONFLICT_PROVEN=${authority.semantic_conflict_proven ? "YES" : "NO"}`);
console.log(`RESEARCH_IDENTITY_IN_PLAN=${report.research_lineage.research_identity_present_in_plan ? "YES" : "NO"}`);
console.log(`INDUSTRY_IN_PLAN=${report.research_lineage.industry_present_in_plan ? "YES" : "NO"}`);
console.log(`STORY_EVIDENCE_PATH_COUNT=${evidencePaths.length}`);
for (const pair of pairReports) {
  console.log([
    `PAIR_V2=${pair.replacement_source_task_id}`,
    `canonical_shot=${pair.canonical_shot_id || ""}`,
    `plan_mapped=${pair.plan_shot_found ? "YES" : "NO"}`,
    `graph_mapped=${pair.graph_node_found ? "YES" : "NO"}`,
    `classification=${pair.classification}`,
    `strategy=${pair.strategy_recommendation.method}`,
    `recursive_materialization=${pair.materialization.recursive || pair.review_materialization.recursive ? "YES" : "NO"}`,
    `issues=${pair.issues.join(",")}`,
  ].join("|"));
}
console.log(`V1_FALSE_POSITIVES=${JSON.stringify(finalFalsePositives)}`);
console.log(`PROVEN_BLOCKERS=${JSON.stringify(finalProvenBlockers)}`);
console.log(`HISTORICAL_DEFECTS=${JSON.stringify(finalHistoricalDefects)}`);
console.log(`FUTURE_RUNTIME_DEFECTS=${JSON.stringify(finalFutureRuntimeDefects)}`);
console.log(`STORY_LINEAGE_V2_DECISION=${decision}`);
console.log(`AUDIT_READINESS=${readiness}`);
console.log(`EXACT_STATE_SHA256_BEFORE=${beforeHash}`);
console.log(`EXACT_STATE_SHA256_AFTER=${afterHash}`);
console.log(`STATE_UNCHANGED=${stateUnchanged ? "YES" : "NO"}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_SELECTION_EXECUTED=NO");
console.log("PROVIDER_SPEND_APPROVED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("REVIEW_RERUNS_EXECUTED=NO");
console.log("SOURCE_REGENERATION_EXECUTED=NO");
console.log("TASK_DISPATCH_EXECUTED=NO");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (finalProvenBlockers.length) process.exitCode = 2;

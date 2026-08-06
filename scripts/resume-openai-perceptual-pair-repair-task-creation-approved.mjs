#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const PLAN_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REJECTED_MEDIA_REPAIR_PLAN_V1";
const PREVIEW_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_PAIR_REPAIR_RUNTIME_PREVIEW_V1";
const CHECKPOINT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_PAIR_REPAIR_TASK_CREATION_CHECKPOINT_V1";
const REPORT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_PAIR_REPAIR_TASK_CREATION_RECOVERY_V1";
const SOURCE_COST = 208.187686;
const CURRENCY = "THB";

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

function money(value) {
  return Number(Number(value || 0).toFixed(6));
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
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
    raw,
    file_sha256: sha256(raw),
    value: JSON.parse(raw),
  };
}

function writeJson(filePath, value) {
  const absolute = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function taskState(task = {}) {
  return {
    id: task.id,
    status: task.status,
    error: task.error || null,
    depends_on: task.depends_on || [],
    review: task.review || {},
    metadata: task.metadata || {},
    output: task.output || {},
    timing: task.timing || {},
    updated_at: task.updated_at || null,
  };
}

function taskFingerprint(tasks = []) {
  return sha256(
    [...tasks]
      .sort((left, right) => text(left.id).localeCompare(text(right.id)))
      .map(taskState),
  );
}

function taskCore(task = {}) {
  return {
    id: task.id,
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id ?? null,
    production_graph_id: task.production_graph_id ?? null,
    scene_id: task.scene_id ?? null,
    shot_id: task.shot_id ?? null,
    type: task.type,
    status: task.status,
    title: task.title ?? "",
    description: task.description ?? "",
    service_id: task.service_id ?? null,
    provider_id: task.provider_id ?? null,
    service_code: task.service_code ?? task.service_id ?? null,
    capability: task.capability ?? null,
    priority: Number(task.priority ?? 100),
    depends_on: task.depends_on ?? [],
    input: task.input ?? {},
    output: task.output ?? {},
    cost: {
      currency: task.cost?.currency ?? null,
      estimated: Number(task.cost?.estimated ?? 0),
      actual: Number(task.cost?.actual ?? 0),
      approved: task.cost?.approved ?? false,
    },
    timing: {
      estimated_seconds: Number(task.timing?.estimated_seconds ?? 0),
      started_at: task.timing?.started_at ?? null,
      completed_at: task.timing?.completed_at ?? null,
    },
    review: {
      required: task.review?.required ?? true,
      approved: task.review?.approved ?? false,
      approved_by: task.review?.approved_by ?? null,
      notes: task.review?.notes ?? "",
    },
    error: task.error ?? null,
    metadata: task.metadata ?? {},
    created_by: task.created_by ?? null,
  };
}

function beforeBookkeeping(task = {}) {
  const metadata = { ...object(task.metadata) };
  for (const key of [
    "superseded_by_repair_task_id",
    "superseded_by_repair_review_task_id",
    "repair_identity",
    "repair_attempt",
    "repair_attempted",
    "pair_aware_repair",
    "pair_repair_creation_id",
    "pair_repair_preview_file_sha256",
  ]) {
    delete metadata[key];
  }
  return { ...task, metadata };
}

function taskCounts(tasks = []) {
  return tasks.reduce((result, task) => {
    result[task.status] = Number(result[task.status] || 0) + 1;
    return result;
  }, {});
}

async function exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
}) {
  const [tasks, usage, wallet] = await Promise.all([
    ProductionTaskRuntime.list({
      organization_id: organizationId,
      creative_project_id: projectId,
      production_graph_id: graphId,
    }),
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

  if (usage.error) throw usage.error;
  if (wallet.error) throw wallet.error;

  const scopedTasks = tasks.filter(
    (task) => text(task.production_graph_id) === graphId,
  );

  return {
    tasks: scopedTasks,
    task_count: scopedTasks.length,
    task_status_counts: taskCounts(scopedTasks),
    task_state_sha256: taskFingerprint(scopedTasks),
    usage_count: Number(usage.count || 0),
    wallet_balance: money(wallet.data?.available_balance),
    wallet_currency: text(wallet.data?.currency) || CURRENCY,
    wallet_updated_at: wallet.data?.updated_at || null,
  };
}

const planFile = readJson(process.argv[2], "PAIR_REPAIR_PLAN");
const previewFile = readJson(process.argv[3], "PAIR_REPAIR_PREVIEW");
const checkpointFile = readJson(
  process.argv[4],
  "PAIR_REPAIR_CREATION_CHECKPOINT",
);
const plan = object(planFile.value);
const preview = object(previewFile.value);
const checkpoint = object(checkpointFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_PAIR_REPAIR_RECOVERY_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-pair-repair-task-creation-recovery.json",
);
const checkpointPath = checkpointFile.absolute;

if (!organizationId || !projectId || !graphId) {
  throw new Error("PAIR_REPAIR_RECOVERY_SCOPE_REQUIRED");
}

const [
  { supabaseAdmin },
  { ProductionTaskRuntime },
  { createProductionTask },
  { preparePromptlessPersistence, persistedPromptFieldPaths },
  { CreativeProductionTaskMaterializationRuntime: MaterializationRuntime },
  { CreativeGeneratedMediaPerceptualPairRepairRuntime: PairRuntime },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/operations/tasks/documents/ProductionTask"),
  import("@/lib/creative/execution/runtime/CreativePromptlessPersistenceRuntime"),
  import("@/lib/creative/execution/runtime/CreativeProductionTaskMaterializationRuntime"),
  import("@/lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualPairRepairRuntime"),
]);

function persistedVariant(payload, materialized) {
  const contract = object(
    payload.input?.requirements?.task_materialization_contract,
  );
  const normalized = materialized
    ? MaterializationRuntime.normalize(payload, contract)
    : payload;
  return preparePromptlessPersistence(
    createProductionTask(normalized),
    "PAIR_REPAIR_RECOVERY_EXPECTED_TASK",
  );
}

function taskEquivalence(live, payload) {
  if (!live || !payload) {
    return {
      equivalent: false,
      variant: "MISSING",
      prompt_paths: live
        ? persistedPromptFieldPaths(live, "live_task")
        : [],
    };
  }

  const promptPaths = persistedPromptFieldPaths(live, "live_task");
  const liveHash = sha256(taskCore(live));
  const direct = persistedVariant(payload, false);
  const materialized = persistedVariant(payload, true);
  const directHash = sha256(taskCore(direct));
  const materializedHash = sha256(taskCore(materialized));

  if (promptPaths.length) {
    return {
      equivalent: false,
      variant: "PERSISTED_PROMPT_FIELDS",
      prompt_paths: promptPaths,
      live_core_sha256: liveHash,
      direct_core_sha256: directHash,
      materialized_core_sha256: materializedHash,
    };
  }
  if (liveHash === directHash) {
    return {
      equivalent: true,
      variant: "DIRECT",
      prompt_paths: [],
      live_core_sha256: liveHash,
      direct_core_sha256: directHash,
      materialized_core_sha256: materializedHash,
    };
  }
  if (liveHash === materializedHash) {
    return {
      equivalent: true,
      variant: "MATERIALIZED",
      prompt_paths: [],
      live_core_sha256: liveHash,
      direct_core_sha256: directHash,
      materialized_core_sha256: materializedHash,
    };
  }
  return {
    equivalent: false,
    variant: "MISMATCH",
    prompt_paths: [],
    live_core_sha256: liveHash,
    direct_core_sha256: directHash,
    materialized_core_sha256: materializedHash,
  };
}

function pairState({
  source,
  review,
  replacementSource,
  replacementReview,
  expectedSource,
  expectedReview,
  creationId,
}) {
  if (!source || !review) {
    return {
      state: "INVALID",
      source_equivalence: { equivalent: false, variant: "ORIGINAL_MISSING" },
      review_equivalence: { equivalent: false, variant: "ORIGINAL_MISSING" },
    };
  }

  const sourceEquivalence = replacementSource
    ? taskEquivalence(replacementSource, expectedSource)
    : { equivalent: false, variant: "ABSENT", prompt_paths: [] };
  const reviewEquivalence = replacementReview
    ? taskEquivalence(replacementReview, expectedReview)
    : { equivalent: false, variant: "ABSENT", prompt_paths: [] };
  const sourceSupersededBy = text(
    source.metadata?.superseded_by_repair_task_id,
  );
  const reviewSupersededBy = text(
    review.metadata?.superseded_by_repair_review_task_id,
  );
  const sourceCreationId = text(source.metadata?.pair_repair_creation_id);
  const reviewCreationId = text(review.metadata?.pair_repair_creation_id);

  let state = "INVALID";
  if (
    !replacementSource &&
    !replacementReview &&
    !sourceSupersededBy &&
    !reviewSupersededBy
  ) {
    state = "BEFORE";
  } else if (
    sourceEquivalence.equivalent &&
    !replacementReview &&
    !sourceSupersededBy &&
    !reviewSupersededBy
  ) {
    state = "SOURCE_CREATED";
  } else if (
    sourceEquivalence.equivalent &&
    reviewEquivalence.equivalent &&
    !sourceSupersededBy &&
    !reviewSupersededBy
  ) {
    state = "PAIR_CREATED";
  } else if (
    sourceEquivalence.equivalent &&
    reviewEquivalence.equivalent &&
    sourceSupersededBy === expectedSource.id &&
    sourceCreationId === creationId &&
    !reviewSupersededBy
  ) {
    state = "SOURCE_SUPERSEDED";
  } else if (
    sourceEquivalence.equivalent &&
    reviewEquivalence.equivalent &&
    sourceSupersededBy === expectedSource.id &&
    sourceCreationId === creationId &&
    reviewSupersededBy === expectedReview.id &&
    reviewCreationId === creationId
  ) {
    state = "APPLIED";
  }

  return {
    state,
    source_equivalence: sourceEquivalence,
    review_equivalence: reviewEquivalence,
  };
}

const blockers = [];
const requireValue = (condition, label) => {
  if (!condition) blockers.push(label);
};

requireValue(text(plan.contract) === PLAN_CONTRACT, "PLAN_CONTRACT_INVALID");
requireValue(
  text(preview.contract) === PREVIEW_CONTRACT,
  "PREVIEW_CONTRACT_INVALID",
);
requireValue(
  text(checkpoint.contract) === CHECKPOINT_CONTRACT,
  "CHECKPOINT_CONTRACT_INVALID",
);
requireValue(
  text(plan.organization_id) === organizationId &&
    text(plan.creative_project_id) === projectId &&
    text(plan.production_graph_id) === graphId,
  "PLAN_SCOPE_INVALID",
);
requireValue(
  text(preview.organization_id) === organizationId &&
    text(preview.creative_project_id) === projectId &&
    text(preview.production_graph_id) === graphId,
  "PREVIEW_SCOPE_INVALID",
);
requireValue(
  text(checkpoint.organization_id) === organizationId &&
    text(checkpoint.creative_project_id) === projectId &&
    text(checkpoint.production_graph_id) === graphId,
  "CHECKPOINT_SCOPE_INVALID",
);
requireValue(
  text(plan.decision) === "PAIR_AWARE_REPAIR_PLAN_9_PAIRS_CONFIRMED" &&
    text(plan.readiness) === "READY_FOR_PAIR_AWARE_REPAIR_RUNTIME_DESIGN" &&
    list(plan.blockers).length === 0 &&
    plan.state_unchanged === true,
  "PLAN_NOT_READY",
);
requireValue(
  text(preview.decision) ===
    "PAIR_REPAIR_RUNTIME_9_PAIR_PAYLOADS_CONFIRMED" &&
    text(preview.readiness) ===
      "READY_FOR_GUARDED_REPAIR_TASK_CREATION_DESIGN" &&
    list(preview.blockers).length === 0 &&
    preview.state_unchanged === true,
  "PREVIEW_NOT_READY",
);
requireValue(
  text(checkpoint.status) === "IN_PROGRESS",
  "CHECKPOINT_NOT_IN_PROGRESS",
);
requireValue(
  text(checkpoint.plan_file_sha256) === planFile.file_sha256 &&
    text(checkpoint.preview_file_sha256) === previewFile.file_sha256,
  "CHECKPOINT_FILE_LINKAGE_INVALID",
);
requireValue(
  text(checkpoint.initial_task_state_sha256) ===
    text(plan.exact_state_before?.task_state_sha256),
  "CHECKPOINT_INITIAL_STATE_INVALID",
);
requireValue(
  Number(checkpoint.expected_source_cost) === SOURCE_COST &&
    text(checkpoint.expected_currency) === CURRENCY,
  "CHECKPOINT_COST_CONTRACT_INVALID",
);
requireValue(
  Number(plan.recovered_pair_count) === 4 &&
    Number(plan.rejected_pair_count) === 9 &&
    Number(plan.recovered_source_regeneration_scope) === 0,
  "PLAN_PAIR_COUNTS_INVALID",
);
requireValue(
  Number(preview.preview_pair_count) === 9 &&
    Number(preview.preview_total_task_count) === 18,
  "PREVIEW_PAIR_COUNTS_INVALID",
);
requireValue(
  money(plan.estimated_repair_cost) === SOURCE_COST &&
    money(preview.estimated_repair_cost) === SOURCE_COST,
  "SOURCE_COST_INVALID",
);

const before = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const beforeMap = new Map(before.tasks.map((task) => [task.id, task]));
const protectedIds = new Set(list(checkpoint.protected_task_ids).map(text));
const protectedBefore = taskFingerprint(
  before.tasks.filter((task) => protectedIds.has(task.id)),
);
requireValue(protectedIds.size === 9, "PROTECTED_ID_COUNT_INVALID");
requireValue(
  protectedBefore === text(checkpoint.protected_task_state_sha256),
  "PROTECTED_TASK_STATE_CHANGED",
);
requireValue(
  before.usage_count === Number(plan.exact_state_before?.usage_count) &&
    before.wallet_balance === money(plan.exact_state_before?.wallet_balance) &&
    before.wallet_updated_at === plan.exact_state_before?.wallet_updated_at,
  "ACCOUNTING_STATE_CHANGED",
);
requireValue(
  before.task_count >= 27 && before.task_count <= 45,
  "LIVE_TASK_COUNT_INVALID",
);

const previewMap = new Map(
  list(preview.pairs).map((pair) => [text(pair.execution_node_id), pair]),
);
const pairRecords = [];
const replacementIds = new Set();

for (const pairPlan of list(plan.repair_plans)) {
  const source = beforeMap.get(text(pairPlan.source_task_id));
  const review = beforeMap.get(text(pairPlan.review_task_id));
  const previewRecord = previewMap.get(text(pairPlan.execution_node_id));
  const issues = [];
  let generated = null;

  if (!source) issues.push("ORIGINAL_SOURCE_MISSING");
  if (!review) issues.push("ORIGINAL_REVIEW_MISSING");
  if (!previewRecord) issues.push("PREVIEW_RECORD_MISSING");

  if (source && review) {
    try {
      generated = PairRuntime.previewPair({
        source: beforeBookkeeping(source),
        review: beforeBookkeeping(review),
        plan: pairPlan,
      });
    } catch (error) {
      issues.push(`PAIR_RUNTIME_FAILED:${error.message}`);
    }
  }

  if (generated && previewRecord) {
    if (
      text(generated.replacement_source_task.id) !==
      text(previewRecord.replacement_source_task_id)
    ) {
      issues.push("REPLACEMENT_SOURCE_ID_MISMATCH");
    }
    if (
      text(generated.replacement_review_task.id) !==
      text(previewRecord.replacement_review_task_id)
    ) {
      issues.push("REPLACEMENT_REVIEW_ID_MISMATCH");
    }
    if (
      text(generated.pair_payload_sha256) !==
      text(previewRecord.pair_payload_sha256)
    ) {
      issues.push("PAIR_PAYLOAD_SHA_MISMATCH");
    }
  }

  const expectedSource = generated?.replacement_source_task || null;
  const expectedReview = generated?.replacement_review_task || null;
  if (expectedSource) replacementIds.add(expectedSource.id);
  if (expectedReview) replacementIds.add(expectedReview.id);

  const livePairState = expectedSource && expectedReview
    ? pairState({
        source,
        review,
        replacementSource: beforeMap.get(expectedSource.id),
        replacementReview: beforeMap.get(expectedReview.id),
        expectedSource,
        expectedReview,
        creationId: text(checkpoint.creation_id),
      })
    : {
        state: "INVALID",
        source_equivalence: { equivalent: false, variant: "MISSING" },
        review_equivalence: { equivalent: false, variant: "MISSING" },
      };

  if (livePairState.state === "INVALID") {
    issues.push("LIVE_PAIR_STATE_INVALID");
  }

  pairRecords.push({
    execution_node_id: text(pairPlan.execution_node_id),
    plan: pairPlan,
    generated,
    state_before: livePairState.state,
    source_equivalence: livePairState.source_equivalence,
    review_equivalence: livePairState.review_equivalence,
    issues,
    ready: issues.length === 0,
  });
}

requireValue(pairRecords.length === 9, "PAIR_RECORD_COUNT_INVALID");
requireValue(
  pairRecords.every((record) => record.ready),
  "ONE_OR_MORE_PAIR_STATES_INVALID",
);
requireValue(replacementIds.size === 18, "REPLACEMENT_ID_SET_INVALID");
requireValue(
  list(checkpoint.expected_task_ids).length === 18 &&
    list(checkpoint.expected_task_ids).every((id) => replacementIds.has(text(id))),
  "CHECKPOINT_EXPECTED_TASK_IDS_INVALID",
);

const plannedSourceCost = money(
  pairRecords.reduce(
    (sum, record) =>
      sum + Number(record.generated?.replacement_source_task?.cost?.estimated || 0),
    0,
  ),
);
const plannedReviewCost = money(
  pairRecords.reduce(
    (sum, record) =>
      sum + Number(record.generated?.replacement_review_task?.cost?.estimated || 0),
    0,
  ),
);
const plannedTotalCost = money(plannedSourceCost + plannedReviewCost);
requireValue(plannedSourceCost === SOURCE_COST, "PLANNED_SOURCE_COST_INVALID");

const recoveryToken =
  `RESUME:${graphId}:${before.task_state_sha256}:` +
  `${checkpointFile.file_sha256}:${previewFile.file_sha256}`;
const costAuthorization =
  `AUTHORIZE PAIR REPAIR TASK CREATION MAX ${SOURCE_COST.toFixed(6)} ${CURRENCY}`;
const suppliedToken = text(process.env.PAIR_REPAIR_TASK_RECOVERY_TOKEN);
const suppliedCost = text(
  process.env.PAIR_REPAIR_TASK_CREATION_COST_AUTHORIZATION,
);
const anyAuthorization = Boolean(suppliedToken || suppliedCost);
const apply = suppliedToken === recoveryToken && suppliedCost === costAuthorization;
if (anyAuthorization && !apply) {
  throw new Error("PAIR_REPAIR_RECOVERY_AUTHORIZATION_INVALID");
}

const preflight = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
requireValue(
  preflight.task_state_sha256 === before.task_state_sha256 &&
    preflight.usage_count === before.usage_count &&
    preflight.wallet_balance === before.wallet_balance &&
    preflight.wallet_updated_at === before.wallet_updated_at,
  "PREFLIGHT_STATE_CHANGED",
);

let databaseWrites = 0;

function saveCheckpointStep(pairPlan, stateName) {
  const now = new Date().toISOString();
  checkpoint.completed_pairs = [
    ...list(checkpoint.completed_pairs).filter(
      (item) => text(item.review_task_id) !== text(pairPlan.review_task_id),
    ),
    {
      source_task_id: pairPlan.source_task_id,
      review_task_id: pairPlan.review_task_id,
      repair_identity: pairPlan.repair_identity,
      state: stateName,
      updated_at: now,
    },
  ];
  checkpoint.updated_at = now;
  writeJson(checkpointPath, checkpoint);
}

async function liveState() {
  const state = await exactState({
    supabaseAdmin,
    ProductionTaskRuntime,
    organizationId,
    projectId,
    graphId,
  });
  return {
    state,
    taskMap: new Map(state.tasks.map((task) => [task.id, task])),
  };
}

async function currentPairState(record, taskMap) {
  const pairPlan = record.plan;
  const expectedSource = record.generated.replacement_source_task;
  const expectedReview = record.generated.replacement_review_task;
  return pairState({
    source: taskMap.get(text(pairPlan.source_task_id)),
    review: taskMap.get(text(pairPlan.review_task_id)),
    replacementSource: taskMap.get(expectedSource.id),
    replacementReview: taskMap.get(expectedReview.id),
    expectedSource,
    expectedReview,
    creationId: text(checkpoint.creation_id),
  });
}

if (apply && blockers.length === 0) {
  for (const record of pairRecords) {
    const pairPlan = record.plan;
    const expectedSource = record.generated.replacement_source_task;
    const expectedReview = record.generated.replacement_review_task;
    let live = await liveState();
    const liveProtectedHash = taskFingerprint(
      live.state.tasks.filter((task) => protectedIds.has(task.id)),
    );
    if (liveProtectedHash !== text(checkpoint.protected_task_state_sha256)) {
      throw new Error("PROTECTED_TASK_STATE_CHANGED_DURING_RECOVERY");
    }

    let current = await currentPairState(record, live.taskMap);

    if (current.state === "BEFORE") {
      await ProductionTaskRuntime.create(expectedSource);
      databaseWrites += 1;
      const createdSource = await ProductionTaskRuntime.get(expectedSource.id);
      const sourceEquivalence = taskEquivalence(createdSource, expectedSource);
      if (!sourceEquivalence.equivalent) {
        throw new Error(
          `RECOVERY_SOURCE_VERIFY_FAILED:${expectedSource.id}:${sourceEquivalence.variant}`,
        );
      }
      saveCheckpointStep(pairPlan, "SOURCE_CREATED");
      live = await liveState();
      current = await currentPairState(record, live.taskMap);
    }

    if (current.state === "SOURCE_CREATED") {
      await ProductionTaskRuntime.create(expectedReview);
      databaseWrites += 1;
      const createdReview = await ProductionTaskRuntime.get(expectedReview.id);
      const reviewEquivalence = taskEquivalence(createdReview, expectedReview);
      if (!reviewEquivalence.equivalent) {
        throw new Error(
          `RECOVERY_REVIEW_VERIFY_FAILED:${expectedReview.id}:${reviewEquivalence.variant}`,
        );
      }
      saveCheckpointStep(pairPlan, "PAIR_CREATED");
      live = await liveState();
      current = await currentPairState(record, live.taskMap);
    }

    if (current.state === "PAIR_CREATED") {
      const originalSource = live.taskMap.get(text(pairPlan.source_task_id));
      await ProductionTaskRuntime.update(originalSource.id, {
        metadata: {
          ...object(originalSource.metadata),
          superseded_by_repair_task_id: expectedSource.id,
          repair_identity: pairPlan.repair_identity,
          repair_attempt: pairPlan.repair_attempt,
          repair_attempted: true,
          pair_aware_repair: true,
          pair_repair_creation_id: checkpoint.creation_id,
          pair_repair_preview_file_sha256: previewFile.file_sha256,
        },
      });
      databaseWrites += 1;
      saveCheckpointStep(pairPlan, "SOURCE_SUPERSEDED");
      live = await liveState();
      current = await currentPairState(record, live.taskMap);
    }

    if (current.state === "SOURCE_SUPERSEDED") {
      const originalReview = live.taskMap.get(text(pairPlan.review_task_id));
      await ProductionTaskRuntime.update(originalReview.id, {
        metadata: {
          ...object(originalReview.metadata),
          superseded_by_repair_review_task_id: expectedReview.id,
          repair_identity: pairPlan.repair_identity,
          repair_attempt: pairPlan.repair_attempt,
          repair_attempted: true,
          pair_aware_repair: true,
          pair_repair_creation_id: checkpoint.creation_id,
          pair_repair_preview_file_sha256: previewFile.file_sha256,
        },
      });
      databaseWrites += 1;
      saveCheckpointStep(pairPlan, "APPLIED");
      live = await liveState();
      current = await currentPairState(record, live.taskMap);
    }

    if (current.state !== "APPLIED") {
      throw new Error(
        `PAIR_REPAIR_RECOVERY_NOT_APPLIED:${pairPlan.review_task_id}:${current.state}`,
      );
    }
  }
}

const after = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const afterMap = new Map(after.tasks.map((task) => [task.id, task]));
const finalPairs = pairRecords.map((record) => {
  const pairPlan = record.plan;
  const expectedSource = record.generated.replacement_source_task;
  const expectedReview = record.generated.replacement_review_task;
  const finalState = pairState({
    source: afterMap.get(text(pairPlan.source_task_id)),
    review: afterMap.get(text(pairPlan.review_task_id)),
    replacementSource: afterMap.get(expectedSource.id),
    replacementReview: afterMap.get(expectedReview.id),
    expectedSource,
    expectedReview,
    creationId: text(checkpoint.creation_id),
  });
  return {
    execution_node_id: record.execution_node_id,
    source_task_id: pairPlan.source_task_id,
    review_task_id: pairPlan.review_task_id,
    replacement_source_task_id: expectedSource.id,
    replacement_review_task_id: expectedReview.id,
    state_before: record.state_before,
    state_after: finalState.state,
    source_equivalence: finalState.source_equivalence,
    review_equivalence: finalState.review_equivalence,
    issues: record.issues,
  };
});

const protectedAfter = taskFingerprint(
  after.tasks.filter((task) => protectedIds.has(task.id)),
);
const replacements = after.tasks.filter((task) => replacementIds.has(task.id));
const waitingCount = replacements.filter(
  (task) => text(task.status) === "WAITING",
).length;
const providerBoundCount = replacements.filter(
  (task) => task.provider_id !== null,
).length;
const costApprovedCount = replacements.filter(
  (task) => task.cost?.approved === true,
).length;
const persistedPromptPathCount = replacements.reduce(
  (count, task) =>
    count + persistedPromptFieldPaths(task, `replacement_${task.id}`).length,
  0,
);

if (apply && blockers.length === 0) {
  if (after.task_count !== 45) {
    throw new Error(`FINAL_TASK_COUNT_INVALID:${after.task_count}`);
  }
  if (replacements.length !== 18 || waitingCount !== 18) {
    throw new Error("FINAL_REPLACEMENT_TASK_SET_INVALID");
  }
  if (providerBoundCount !== 0 || costApprovedCount !== 0) {
    throw new Error("FINAL_REPLACEMENT_AUTHORIZATION_INVALID");
  }
  if (persistedPromptPathCount !== 0) {
    throw new Error("FINAL_REPLACEMENT_PROMPTLESS_CONTRACT_INVALID");
  }
  if (finalPairs.some((pair) => pair.state_after !== "APPLIED")) {
    throw new Error("FINAL_PAIR_STATE_INVALID");
  }
  if (protectedAfter !== protectedBefore) {
    throw new Error("FINAL_PROTECTED_STATE_CHANGED");
  }
  if (
    after.usage_count !== before.usage_count ||
    after.wallet_balance !== before.wallet_balance ||
    after.wallet_updated_at !== before.wallet_updated_at
  ) {
    throw new Error("FINAL_ACCOUNTING_STATE_CHANGED");
  }

  checkpoint.status = "COMPLETED";
  checkpoint.updated_at = new Date().toISOString();
  checkpoint.completed_at = checkpoint.updated_at;
  checkpoint.final_task_count = after.task_count;
  checkpoint.final_task_state_sha256 = after.task_state_sha256;
  checkpoint.final_protected_task_state_sha256 = protectedAfter;
  checkpoint.recovery_report_contract = REPORT_CONTRACT;
  checkpoint.recovery_completed_from_task_state_sha256 =
    before.task_state_sha256;
  writeJson(checkpointPath, checkpoint);
}

const stateUnchanged =
  before.task_count === after.task_count &&
  before.task_state_sha256 === after.task_state_sha256 &&
  before.usage_count === after.usage_count &&
  before.wallet_balance === after.wallet_balance &&
  before.wallet_updated_at === after.wallet_updated_at;

const decision = blockers.length
  ? "PAIR_REPAIR_TASK_CREATION_RECOVERY_BLOCKED"
  : apply
    ? "PAIR_REPAIR_18_WAITING_TASKS_RECOVERED"
    : "PAIR_REPAIR_TASK_CREATION_RECOVERY_DRY_RUN_READY";
const readiness = blockers.length
  ? "PAIR_REPAIR_TASK_CREATION_RECOVERY_BLOCKED"
  : apply
    ? "READY_FOR_POST_CREATION_AUDIT"
    : "READY_FOR_EXPLICIT_RECOVERY_AUTHORIZATION";

const report = {
  contract: REPORT_CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  plan_file: planFile.absolute,
  plan_file_sha256: planFile.file_sha256,
  preview_file: previewFile.absolute,
  preview_file_sha256: previewFile.file_sha256,
  checkpoint_file: checkpointPath,
  checkpoint_file_sha256_before: checkpointFile.file_sha256,
  creation_id: checkpoint.creation_id,
  apply_mode: apply,
  expected_cost_authorization: costAuthorization,
  expected_recovery_token: recoveryToken,
  planned_source_repair_cost: plannedSourceCost,
  planned_review_cost: plannedReviewCost,
  planned_total_estimated_cost: plannedTotalCost,
  pair_count: pairRecords.length,
  replacement_task_count: replacements.length,
  replacement_waiting_count: waitingCount,
  replacement_provider_bound_count: providerBoundCount,
  replacement_cost_approved_count: costApprovedCount,
  persisted_prompt_path_count: persistedPromptPathCount,
  pair_states_before: pairRecords.map((record) => ({
    execution_node_id: record.execution_node_id,
    state: record.state_before,
    source_variant: record.source_equivalence.variant,
    review_variant: record.review_equivalence.variant,
    issues: record.issues,
  })),
  final_pairs: finalPairs,
  protected_state_sha256_before: protectedBefore,
  protected_state_sha256_after: protectedAfter,
  blockers,
  database_write_count: databaseWrites,
  before,
  after,
  state_unchanged: stateUnchanged,
  provider_selection_authorized: false,
  provider_spend_authorized: false,
  dispatch_authorized: false,
  provider_calls_executed: false,
  provider_polls_executed: false,
  retries_executed: false,
  source_regeneration_executed: false,
  downstream_tasks_updated: 0,
  finalisation_eligible: false,
  finalisation_executed: false,
  publication_executed: false,
  decision,
  readiness,
};

writeJson(outputPath, report);

console.log("============================================================");
console.log("OPENAI PERCEPTUAL PAIR-REPAIR TASK CREATION RECOVERY");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`APPLY_MODE=${apply ? "YES" : "NO"}`);
console.log(`EXPECTED_COST_AUTHORIZATION=${costAuthorization}`);
console.log(`EXPECTED_RECOVERY_TOKEN=${recoveryToken}`);
console.log(`CHECKPOINT_PATH=${checkpointPath}`);
console.log(`CHECKPOINT_STATUS_BEFORE=${checkpointFile.value.status || ""}`);
console.log(
  `CHECKPOINT_COMPLETED_PAIR_RECORDS_BEFORE=${list(checkpointFile.value.completed_pairs).length}`,
);
console.log(`TASK_COUNT_BEFORE=${before.task_count}`);
console.log(`TASK_STATUS_COUNTS_BEFORE=${JSON.stringify(before.task_status_counts)}`);
console.log(`PAIR_COUNT=${pairRecords.length}`);
console.log(`PLANNED_SOURCE_REPAIR_COST=${plannedSourceCost}`);
console.log(`PLANNED_REVIEW_COST=${plannedReviewCost}`);
console.log(`PLANNED_TOTAL_ESTIMATED_COST=${plannedTotalCost}`);

for (const pair of finalPairs) {
  console.log([
    `PAIR_RECOVERY=${pair.execution_node_id}`,
    `source=${pair.source_task_id}`,
    `review=${pair.review_task_id}`,
    `replacement_source=${pair.replacement_source_task_id}`,
    `replacement_review=${pair.replacement_review_task_id}`,
    `state_before=${pair.state_before}`,
    `state_after=${pair.state_after}`,
    `source_variant=${pair.source_equivalence.variant}`,
    `review_variant=${pair.review_equivalence.variant}`,
    `issues=${pair.issues.join(",")}`,
    `ready=${pair.issues.length ? "NO" : "YES"}`,
  ].join("|"));
}

console.log(`REPLACEMENT_TASK_COUNT=${replacements.length}`);
console.log(`REPLACEMENT_WAITING_COUNT=${waitingCount}`);
console.log(`REPLACEMENT_PROVIDER_BOUND_COUNT=${providerBoundCount}`);
console.log(`REPLACEMENT_COST_APPROVED_COUNT=${costApprovedCount}`);
console.log(`PERSISTED_PROMPT_PATH_COUNT=${persistedPromptPathCount}`);
console.log(`RECOVERY_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`DATABASE_WRITE_COUNT=${databaseWrites}`);
console.log(`TASK_COUNT_AFTER=${after.task_count}`);
console.log(`TASK_STATUS_COUNTS_AFTER=${JSON.stringify(after.task_status_counts)}`);
console.log(`TASK_STATE_SHA256_BEFORE=${before.task_state_sha256}`);
console.log(`TASK_STATE_SHA256_AFTER=${after.task_state_sha256}`);
console.log(`PROTECTED_STATE_SHA256_BEFORE=${protectedBefore}`);
console.log(`PROTECTED_STATE_SHA256_AFTER=${protectedAfter}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`STATE_UNCHANGED=${stateUnchanged ? "YES" : "NO"}`);
console.log(`RECOVERY_DECISION=${decision}`);
console.log(`AUDIT_READINESS=${readiness}`);
console.log(`DATABASE_WRITES_EXECUTED=${databaseWrites ? "YES" : "NO"}`);
console.log("PROVIDER_SELECTION_AUTHORIZED=NO");
console.log("PROVIDER_SPEND_AUTHORIZED=NO");
console.log("DISPATCH_AUTHORIZED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("RETRIES_EXECUTED=NO");
console.log("SOURCE_REGENERATION_EXECUTED=NO");
console.log("DOWNSTREAM_TASKS_UPDATED=0");
console.log("FINALISATION_ELIGIBLE=NO");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (blockers.length) {
  process.exitCode = 2;
}

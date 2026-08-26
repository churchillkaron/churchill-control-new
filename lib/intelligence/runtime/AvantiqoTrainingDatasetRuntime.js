import { createHash, randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  listAvantiqoTrainingCandidates,
} from "./AvantiqoTrainingCandidateRuntime";

export const AVANTIQO_TRAINING_DATASET_CONTRACT =
  "AVANTIQO_TRAINING_DATASET_V1";

const MEMORY_TABLE = "intelligence_memories";
const DATASET_SCOPE = "platform_training_datasets";
const MIN_READY_CANDIDATES = 8;
const MAX_CANDIDATES = 500;
const DEFAULT_HOLDOUT_RATIO = 0.2;
const MIN_HOLDOUT_RATIO = 0.1;
const MAX_HOLDOUT_RATIO = 0.35;
const FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";

function text(value, limit = 1600) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function holdoutRatio(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_HOLDOUT_RATIO;
  return Math.max(MIN_HOLDOUT_RATIO, Math.min(MAX_HOLDOUT_RATIO, parsed));
}

function stableHash(value) {
  return createHash("sha256").update(text(value, 10000)).digest("hex");
}

function candidateFingerprint(candidate = {}) {
  return stableHash([
    candidate.candidate_kind,
    candidate.candidate_contract,
    candidate.capability_key,
    candidate.outcome,
    candidate.verification_mode,
    candidate.source_fingerprint,
    candidate?.benchmark?.benchmark_id,
    candidate?.benchmark?.benchmark_suite,
    ...list(candidate.failure_family).slice().sort(),
  ].join("|"));
}

function datasetFingerprint(candidates) {
  return stableHash(
    candidates
      .map(candidateFingerprint)
      .sort()
      .join("|"),
  );
}

function privacySafe(candidate = {}) {
  const privacy = object(candidate.privacy);
  return (
    privacy.customer_private_content_included === false &&
    privacy.raw_payload_persisted === false &&
    privacy.raw_output_persisted === false &&
    privacy.raw_reasoning_persisted === false &&
    privacy.identifiers_persisted === false
  );
}

function behaviorInstruction(candidate = {}) {
  if (candidate.candidate_kind === "CANONICAL_PRODUCT_GROUNDING") {
    return (
      "Ground Avantiqo product claims in the current canonical Product Constitution and ERP_REGISTRY contract. " +
      "Separate product state from general external guidance and mutable customer business state; require current governed reads " +
      "for mutable customer facts and never treat memory as authorization."
    );
  }
  return (
    "Do not repeat a previously failing approach unchanged. Re-establish current evidence and prerequisites, " +
    "choose a materially different safe approach when supported, and require observed verification before claiming completion."
  );
}

function curriculumUnit(candidate = {}) {
  const fingerprint = candidateFingerprint(candidate);
  return {
    unit_id: `unit-${fingerprint.slice(0, 20)}`,
    behavior_class: text(candidate.candidate_kind, 120),
    capability_key: text(candidate.capability_key, 300),
    prior_failure_family: list(candidate.failure_family)
      .map((item) => text(item, 120))
      .filter(Boolean)
      .sort(),
    prior_failure_occurrence_count: Math.max(
      0,
      Number(candidate.prior_failure_occurrence_count || 0),
    ),
    desired_outcome: text(candidate.outcome, 80),
    verification_requirement: text(candidate.verification_mode, 120),
    behavior_instruction: behaviorInstruction(candidate),
    source_candidate_id: candidate.id,
    source_candidate_fingerprint: text(candidate.source_fingerprint, 128) || null,
    source_candidate_contract: text(candidate.candidate_contract, 160) || null,
    source_benchmark_id: text(candidate?.benchmark?.benchmark_id, 240) || null,
    source_benchmark_suite: text(candidate?.benchmark?.benchmark_suite, 240) || null,
    source_benchmark_pass_rate: Number(candidate?.benchmark?.pass_rate || 0),
    source_benchmark_evaluated_at: text(candidate?.benchmark?.evaluated_at, 120) || null,
    curriculum_fingerprint: fingerprint,
    customer_private_content_included: false,
    raw_payload_included: false,
    raw_output_included: false,
    raw_reasoning_included: false,
    identifiers_included: false,
  };
}

function splitUnits(units, ratio) {
  const ordered = units.slice().sort((left, right) =>
    stableHash(left.unit_id).localeCompare(stableHash(right.unit_id)),
  );
  const holdoutCount = Math.max(1, Math.floor(ordered.length * ratio));
  return {
    holdout: ordered.slice(0, holdoutCount),
    train: ordered.slice(holdoutCount),
  };
}

function trainingRecipe({ trainCount, holdoutCount }) {
  return {
    foundation_model: FOUNDATION_MODEL,
    strategy: "PEFT_ADAPTER_CANDIDATE",
    preferred_method: "QLORA_OR_LORA",
    base_weights_immutable: true,
    full_pretraining_from_scratch: false,
    train_unit_count: trainCount,
    holdout_unit_count: holdoutCount,
    synthetic_example_compilation_required: true,
    synthetic_compiler_provider: "avantiqo-intelligence",
    synthetic_compiler_may_use_customer_private_content: false,
    raw_reasoning_training_allowed: false,
    tool_authorization_training_effect: "NONE",
    production_model_promotion_effect: "NONE",
    automatic_training_started: false,
  };
}

async function persistDatasetManifest({
  organizationId,
  datasetId,
  fingerprint,
  units,
  split,
  ratio,
}) {
  const now = new Date().toISOString();
  const content = `Controlled Avantiqo Intelligence training dataset ${datasetId} contains ${units.length} benchmark-approved, de-identified behavior curriculum unit(s).`;
  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: DATASET_SCOPE,
    memory_key: `dataset:${fingerprint.slice(0, 40)}`,
    memory_type: "lesson",
    subject: datasetId,
    content,
    importance: 0.9,
    confidence: 1,
    source: "controlled_training_dataset_assembly",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_TRAINING_DATASET_CONTRACT,
      dataset_id: datasetId,
      dataset_fingerprint: fingerprint,
      foundation_model: FOUNDATION_MODEL,
      candidate_count: units.length,
      train_count: split.train.length,
      holdout_count: split.holdout.length,
      holdout_ratio: ratio,
      candidate_ids: units.map((item) => item.source_candidate_id),
      candidate_bindings: units.map((item) => ({
        candidate_id: item.source_candidate_id,
        unit_id: item.unit_id,
        curriculum_fingerprint: item.curriculum_fingerprint,
        source_candidate_fingerprint: item.source_candidate_fingerprint,
        source_benchmark_id: item.source_benchmark_id,
        source_benchmark_suite: item.source_benchmark_suite,
      })),
      train_unit_ids: split.train.map((item) => item.unit_id),
      holdout_unit_ids: split.holdout.map((item) => item.unit_id),
      training_recipe: trainingRecipe({
        trainCount: split.train.length,
        holdoutCount: split.holdout.length,
      }),
      privacy: {
        customer_private_content_included: false,
        raw_payload_included: false,
        raw_output_included: false,
        raw_reasoning_included: false,
        identifiers_included: false,
      },
      status: "DATASET_ASSEMBLED",
      training_ready: split.train.length > 0 && split.holdout.length > 0,
      source_version_bound: true,
      benchmark_version_bound: true,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      production_model_promotion_effect: "NONE",
      created_at: now,
    },
    updated_at: now,
  };

  const written = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(row, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id,memory_key,subject,content,metadata,updated_at")
    .single();
  if (written.error) throw written.error;
  return written.data;
}

export async function assembleAvantiqoTrainingDataset({
  holdout_ratio = DEFAULT_HOLDOUT_RATIO,
  limit = MAX_CANDIDATES,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      contract: AVANTIQO_TRAINING_DATASET_CONTRACT,
      status: "BLOCKED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      dataset: null,
    };
  }

  const ready = await listAvantiqoTrainingCandidates({
    status: "ready",
    limit: Math.max(MIN_READY_CANDIDATES, Math.min(MAX_CANDIDATES, Number(limit) || MAX_CANDIDATES)),
  });
  const candidates = list(ready.candidates)
    .filter((candidate) => candidate.training_ready === true)
    .filter(privacySafe)
    .filter((candidate) => text(candidate.benchmark_status, 80) === "APPROVED")
    .filter((candidate) => text(candidate?.benchmark?.benchmark_id, 240))
    .filter((candidate) => text(candidate?.benchmark?.benchmark_suite, 240));

  if (candidates.length < MIN_READY_CANDIDATES) {
    return {
      contract: AVANTIQO_TRAINING_DATASET_CONTRACT,
      status: "INSUFFICIENT_APPROVED_CANDIDATES",
      minimum_required: MIN_READY_CANDIDATES,
      approved_candidate_count: candidates.length,
      dataset: null,
    };
  }

  const units = candidates.map(curriculumUnit);
  const ratio = holdoutRatio(holdout_ratio);
  const split = splitUnits(units, ratio);
  if (!split.train.length || !split.holdout.length) {
    throw new Error("AVANTIQO_TRAINING_DATASET_SPLIT_INVALID");
  }

  const fingerprint = datasetFingerprint(candidates);
  const datasetId = `avantiqo-intelligence-dataset-${fingerprint.slice(0, 16)}`;
  const manifest = await persistDatasetManifest({
    organizationId,
    datasetId,
    fingerprint,
    units,
    split,
    ratio,
  });

  return {
    contract: AVANTIQO_TRAINING_DATASET_CONTRACT,
    status: "DATASET_ASSEMBLED",
    dataset: {
      id: datasetId,
      fingerprint,
      foundation_model: FOUNDATION_MODEL,
      candidate_count: units.length,
      train_count: split.train.length,
      holdout_count: split.holdout.length,
      holdout_ratio: ratio,
      train: split.train,
      holdout: split.holdout,
      training_recipe: trainingRecipe({
        trainCount: split.train.length,
        holdoutCount: split.holdout.length,
      }),
      manifest_id: manifest?.id || null,
    },
    governance: {
      benchmark_approved_candidates_only: true,
      source_version_bound: true,
      benchmark_version_bound: true,
      deterministic_holdout_split: true,
      customer_private_content_allowed: false,
      raw_reasoning_training_allowed: false,
      base_weights_immutable: true,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      production_model_promotion_effect: "NONE",
    },
  };
}

export const AvantiqoTrainingDatasetRuntime = Object.freeze({
  contract: AVANTIQO_TRAINING_DATASET_CONTRACT,
  assemble: assembleAvantiqoTrainingDataset,
});

import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_CANONICAL_TRAINING_EXAMPLE_CONTRACT =
  "AVANTIQO_CANONICAL_TRAINING_EXAMPLE_V1";

const DOWNSTREAM_EXAMPLE_CONTRACT = "AVANTIQO_TRAINING_EXAMPLE_COMPILER_V1";
const DATASET_CONTRACT = "AVANTIQO_TRAINING_DATASET_V1";
const CANDIDATE_CONTRACT = "AVANTIQO_CANONICAL_CURRICULUM_CANDIDATE_V1";
const CANDIDATE_KIND = "CANONICAL_PRODUCT_GROUNDING";
const MEMORY_TABLE = "intelligence_memories";
const DATASET_SCOPE = "platform_training_datasets";
const CANDIDATE_SCOPE = "platform_training_candidates";
const EXAMPLE_SCOPE = "platform_training_examples";
const EXAMPLES_PER_UNIT = 2;

function text(value, limit = 4000) {
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

function stableHash(value) {
  return createHash("sha256").update(text(value, 30000)).digest("hex");
}

function leakageDetected(value) {
  const source = text(value, 30000);
  return Boolean(
    /https?:\/\//i.test(source) ||
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(source) ||
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(source) ||
      /\b(?:api[_ -]?key|access[_ -]?token|secret|password)\s*[:=]/i.test(source)
  );
}

function candidateFingerprint(candidate = {}) {
  const metadata = object(candidate.metadata);
  return stableHash([
    metadata.candidate_kind,
    metadata.contract,
    metadata.capability_key || candidate.subject,
    metadata.outcome,
    metadata.verification_mode,
    metadata.source_fingerprint,
    metadata?.benchmark?.benchmark_id,
    metadata?.benchmark?.benchmark_suite,
    ...list(metadata.failure_family).slice().sort(),
  ].join("|"));
}

function safeCandidate(candidate = {}) {
  const metadata = object(candidate.metadata);
  return Boolean(
    metadata.contract === CANDIDATE_CONTRACT &&
      metadata.candidate_kind === CANDIDATE_KIND &&
      metadata.training_ready === true &&
      text(metadata.benchmark_status, 80) === "APPROVED" &&
      text(metadata.source_fingerprint, 128) &&
      text(metadata?.benchmark?.benchmark_id, 240) &&
      text(metadata?.benchmark?.benchmark_suite, 240) &&
      Number(metadata?.benchmark?.pass_rate || 0) >= 0.95 &&
      Number(metadata?.benchmark?.regression_count || 0) === 0 &&
      metadata?.benchmark?.privacy_passed === true &&
      metadata?.benchmark?.governance_passed === true &&
      metadata?.benchmark?.leakage_detected === false &&
      metadata.customer_private_content_included === false &&
      metadata.raw_payload_persisted === false &&
      metadata.raw_output_persisted === false &&
      metadata.raw_reasoning_persisted === false &&
      metadata.identifiers_persisted === false
  );
}

async function loadDataset(organizationId, datasetManifestId) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,subject,metadata,active")
    .eq("organization_id", organizationId)
    .eq("memory_scope", DATASET_SCOPE)
    .eq("id", datasetManifestId)
    .eq("active", true)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function loadCandidates(organizationId, ids) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,subject,metadata,active")
    .eq("organization_id", organizationId)
    .eq("memory_scope", CANDIDATE_SCOPE)
    .eq("active", true)
    .in("id", ids);
  if (result.error) throw result.error;
  return list(result.data);
}

function verifyDataset(dataset = {}) {
  const metadata = object(dataset.metadata);
  if (
    metadata.contract !== DATASET_CONTRACT ||
    metadata.status !== "DATASET_ASSEMBLED" ||
    metadata.training_ready !== true
  ) {
    throw new Error("AVANTIQO_CANONICAL_TRAINING_EXAMPLE_DATASET_NOT_READY");
  }
  if (
    metadata.source_version_bound !== true ||
    metadata.benchmark_version_bound !== true
  ) {
    throw new Error("AVANTIQO_CANONICAL_TRAINING_EXAMPLE_DATASET_VERSION_BINDING_REQUIRED");
  }
  if (
    !text(metadata.dataset_fingerprint, 128) ||
    !list(metadata.candidate_ids).length ||
    !list(metadata.candidate_bindings).length ||
    !list(metadata.train_unit_ids).length ||
    !list(metadata.holdout_unit_ids).length
  ) {
    throw new Error("AVANTIQO_CANONICAL_TRAINING_EXAMPLE_DATASET_MANIFEST_INCOMPLETE");
  }
  return metadata;
}

function buildCurriculumItems(datasetMetadata, candidates) {
  const trainIds = new Set(list(datasetMetadata.train_unit_ids).map((item) => text(item, 160)));
  const holdoutIds = new Set(list(datasetMetadata.holdout_unit_ids).map((item) => text(item, 160)));
  const bindings = new Map(
    list(datasetMetadata.candidate_bindings).map((binding) => [
      text(binding?.candidate_id, 160),
      object(binding),
    ]),
  );

  return candidates.map((candidate) => {
    const metadata = object(candidate.metadata);
    const fingerprint = candidateFingerprint(candidate);
    const unitId = `unit-${fingerprint.slice(0, 20)}`;
    const binding = bindings.get(text(candidate.id, 160));
    if (
      !binding ||
      text(binding.unit_id, 160) !== unitId ||
      text(binding.curriculum_fingerprint, 128) !== fingerprint ||
      text(binding.source_candidate_fingerprint, 128) !== text(metadata.source_fingerprint, 128) ||
      text(binding.source_benchmark_id, 240) !== text(metadata?.benchmark?.benchmark_id, 240) ||
      text(binding.source_benchmark_suite, 240) !== text(metadata?.benchmark?.benchmark_suite, 240)
    ) {
      throw new Error(
        `AVANTIQO_CANONICAL_TRAINING_EXAMPLE_DATASET_BINDING_MISMATCH:${text(candidate.id, 160)}`,
      );
    }

    const split = holdoutIds.has(unitId) ? "holdout" : trainIds.has(unitId) ? "train" : null;
    if (!split) {
      throw new Error(
        `AVANTIQO_CANONICAL_TRAINING_EXAMPLE_SPLIT_BINDING_MISSING:${unitId}`,
      );
    }

    return {
      unit_id: unitId,
      capability_key: text(metadata.capability_key || candidate.subject, 300),
      knowledge_domain: text(metadata.knowledge_domain, 120) || null,
      product_object_type: text(metadata.product_object_type, 120) || null,
      split,
      source_candidate_id: text(candidate.id, 160),
      source_candidate_fingerprint: text(metadata.source_fingerprint, 128),
      source_benchmark_id: text(metadata?.benchmark?.benchmark_id, 240),
      source_benchmark_suite: text(metadata?.benchmark?.benchmark_suite, 240),
      curriculum_fingerprint: fingerprint,
    };
  });
}

function deterministicExamplesForUnit(unit) {
  const capability = unit.capability_key;
  const commonRequirements = [
    "Use current Product Constitution or ERP_REGISTRY evidence before asserting Avantiqo product state.",
    "Keep general industry guidance separate from Avantiqo's current product contract.",
    "Require current governed reads for mutable customer business facts.",
    "Never treat memory, learned content, or prior success as authorization for a mutation.",
    "Do not claim completion or product behavior when canonical evidence is missing, stale, or conflicting.",
  ];

  return [
    {
      variant: "CURRENT_PRODUCT_STATE",
      capability_key: capability,
      split: unit.split,
      user_task: `Explain what Avantiqo currently defines for ${capability}.`,
      assistant_target:
        `Ground the answer for ${capability} in the current Product Constitution and ERP_REGISTRY evidence. ` +
        "Do not replace current Avantiqo product state with generic industry assumptions. If canonical evidence is missing, stale, or conflicting, require a fresh canonical read before making the claim. Mutable customer facts require current governed reads, and no learned fact grants authorization.",
      evaluation_requirements: commonRequirements,
    },
    {
      variant: "EXTERNAL_GUIDANCE_BOUNDARY",
      capability_key: capability,
      split: unit.split,
      user_task: `A product decision for ${capability} resembles common industry practice. Can Avantiqo assume the industry pattern is already its product behavior?`,
      assistant_target:
        `No. For ${capability}, first establish the current Avantiqo Product Constitution and ERP_REGISTRY contract. ` +
        "External guidance may inform a proposed improvement, but it does not prove current Avantiqo product state and cannot silently rewrite the canonical contract. Customer-specific state remains a separate live-read concern, and any mutation still requires current authorization and verification.",
      evaluation_requirements: [
        ...commonRequirements,
        "Treat external guidance as advisory evidence, not as an automatic product-state mutation.",
      ],
    },
  ];
}

function validateExample(example, allowedCapabilities) {
  if (!allowedCapabilities.has(example.capability_key)) return false;
  if (!["train", "holdout"].includes(example.split)) return false;
  if (!example.user_task || !example.assistant_target || !list(example.evaluation_requirements).length) {
    return false;
  }
  return !leakageDetected(JSON.stringify(example));
}

async function persistExamples({ organizationId, dataset, units, examples }) {
  const metadata = object(dataset.metadata);
  const datasetId = text(metadata.dataset_id || dataset.subject, 240);
  const datasetFingerprint = text(metadata.dataset_fingerprint, 128);
  const unitByCapability = new Map(units.map((unit) => [unit.capability_key, unit]));
  const now = new Date().toISOString();

  const rows = examples.map((example) => {
    const unit = unitByCapability.get(example.capability_key);
    if (!unit) throw new Error("AVANTIQO_CANONICAL_TRAINING_EXAMPLE_UNIT_REQUIRED");
    const fingerprint = stableHash([
      dataset.id,
      datasetFingerprint,
      unit.unit_id,
      unit.curriculum_fingerprint,
      example.variant,
      example.user_task,
      example.assistant_target,
    ].join("|"));
    return {
      organization_id: organizationId,
      party_id: null,
      entity_id: null,
      conversation_id: null,
      source_turn_id: null,
      memory_scope: EXAMPLE_SCOPE,
      memory_key: `training-example:${fingerprint.slice(0, 40)}`,
      memory_type: "lesson",
      subject: example.capability_key,
      content: JSON.stringify({
        user_task: example.user_task,
        assistant_target: example.assistant_target,
        evaluation_requirements: example.evaluation_requirements,
      }),
      importance: example.split === "holdout" ? 0.92 : 0.86,
      confidence: 1,
      source: "avantiqo_deterministic_canonical_training_example_compiler",
      active: true,
      valid_until: null,
      superseded_by: null,
      superseded_at: null,
      forgotten_at: null,
      metadata: {
        contract: DOWNSTREAM_EXAMPLE_CONTRACT,
        compiler_variant_contract: AVANTIQO_CANONICAL_TRAINING_EXAMPLE_CONTRACT,
        dataset_manifest_id: dataset.id,
        dataset_id: datasetId,
        dataset_fingerprint: datasetFingerprint,
        curriculum_unit_id: unit.unit_id,
        curriculum_fingerprint: unit.curriculum_fingerprint,
        source_candidate_id: unit.source_candidate_id,
        source_candidate_fingerprint: unit.source_candidate_fingerprint,
        source_benchmark_id: unit.source_benchmark_id,
        source_benchmark_suite: unit.source_benchmark_suite,
        capability_key: example.capability_key,
        variant: example.variant,
        split: example.split,
        synthetic: true,
        generated_by: "avantiqo-deterministic-canonical-training-example-compiler",
        provider_execution_used: false,
        runpod_used: false,
        shared_trainer_mutated: false,
        customer_private_content_included: false,
        raw_customer_turn_included: false,
        raw_payload_included: false,
        raw_output_included: false,
        raw_reasoning_included: false,
        identifiers_included: false,
        authorization_value: "none",
        training_example_validated: true,
        source_version_bound: true,
        benchmark_version_bound: true,
        automatic_training_started: false,
        automatic_model_weight_mutation: false,
        production_model_promotion_effect: "NONE",
        compiled_at: now,
      },
      updated_at: now,
    };
  });

  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(rows, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id,memory_key,subject,content,metadata");
  if (result.error) throw result.error;
  return list(result.data);
}

function validateWrittenExamples({ dataset, units, written }) {
  const expectedCount = units.length * EXAMPLES_PER_UNIT;
  const expectedTrainCount = units.filter((unit) => unit.split === "train").length * EXAMPLES_PER_UNIT;
  const expectedHoldoutCount = units.filter((unit) => unit.split === "holdout").length * EXAMPLES_PER_UNIT;
  const byCandidate = new Map();
  let trainCount = 0;
  let holdoutCount = 0;
  let leakageCount = 0;
  let invalidSafetyCount = 0;

  for (const row of written) {
    const metadata = object(row.metadata);
    const candidateId = text(metadata.source_candidate_id, 160);
    byCandidate.set(candidateId, Number(byCandidate.get(candidateId) || 0) + 1);
    if (metadata.split === "train") trainCount += 1;
    if (metadata.split === "holdout") holdoutCount += 1;
    if (leakageDetected(row.content)) leakageCount += 1;
    if (
      metadata.contract !== DOWNSTREAM_EXAMPLE_CONTRACT ||
      metadata.compiler_variant_contract !== AVANTIQO_CANONICAL_TRAINING_EXAMPLE_CONTRACT ||
      metadata.dataset_manifest_id !== dataset.id ||
      metadata.training_example_validated !== true ||
      metadata.synthetic !== true ||
      metadata.provider_execution_used !== false ||
      metadata.runpod_used !== false ||
      metadata.shared_trainer_mutated !== false ||
      metadata.customer_private_content_included !== false ||
      metadata.raw_customer_turn_included !== false ||
      metadata.raw_payload_included !== false ||
      metadata.raw_output_included !== false ||
      metadata.raw_reasoning_included !== false ||
      metadata.identifiers_included !== false ||
      metadata.source_version_bound !== true ||
      metadata.benchmark_version_bound !== true
    ) {
      invalidSafetyCount += 1;
    }
  }

  const uncoveredUnits = units.filter(
    (unit) => Number(byCandidate.get(unit.source_candidate_id) || 0) !== EXAMPLES_PER_UNIT,
  );
  const passed =
    written.length === expectedCount &&
    trainCount === expectedTrainCount &&
    holdoutCount === expectedHoldoutCount &&
    leakageCount === 0 &&
    invalidSafetyCount === 0 &&
    uncoveredUnits.length === 0;

  return {
    passed,
    expected_example_count: expectedCount,
    example_count: written.length,
    expected_train_example_count: expectedTrainCount,
    train_example_count: trainCount,
    expected_holdout_example_count: expectedHoldoutCount,
    holdout_example_count: holdoutCount,
    candidate_coverage_count: byCandidate.size,
    expected_candidate_coverage_count: units.length,
    uncovered_candidate_count: uncoveredUnits.length,
    leakage_count: leakageCount,
    invalid_safety_row_count: invalidSafetyCount,
  };
}

export async function compileAvantiqoCanonicalTrainingExamples({
  datasetManifestId,
} = {}) {
  const organizationId = learningOrganizationId();
  const manifestId = text(datasetManifestId, 160);
  if (!organizationId) {
    throw new Error("AVANTIQO_CANONICAL_TRAINING_EXAMPLE_LEARNING_ORGANIZATION_REQUIRED");
  }
  if (!manifestId) {
    throw new Error("AVANTIQO_CANONICAL_TRAINING_EXAMPLE_DATASET_REQUIRED");
  }

  const dataset = await loadDataset(organizationId, manifestId);
  if (!dataset) throw new Error("AVANTIQO_CANONICAL_TRAINING_EXAMPLE_DATASET_NOT_FOUND");
  const datasetMetadata = verifyDataset(dataset);
  const candidateIds = list(datasetMetadata.candidate_ids)
    .map((item) => text(item, 160))
    .filter(Boolean);
  const loadedCandidates = await loadCandidates(organizationId, candidateIds);
  const candidates = loadedCandidates.filter(safeCandidate);
  if (candidates.length !== candidateIds.length) {
    throw new Error(
      `AVANTIQO_CANONICAL_TRAINING_EXAMPLE_CANDIDATE_ELIGIBILITY_MISMATCH:${candidates.length}:${candidateIds.length}`,
    );
  }

  const units = buildCurriculumItems(datasetMetadata, candidates);
  const examples = units.flatMap(deterministicExamplesForUnit);
  const allowedCapabilities = new Set(units.map((unit) => unit.capability_key));
  const invalidExamples = examples.filter(
    (example) => !validateExample(example, allowedCapabilities),
  );
  if (invalidExamples.length) {
    throw new Error(
      `AVANTIQO_CANONICAL_TRAINING_EXAMPLE_VALIDATION_FAILED:${invalidExamples.length}`,
    );
  }

  const written = await persistExamples({
    organizationId,
    dataset,
    units,
    examples,
  });
  const validation = validateWrittenExamples({ dataset, units, written });
  if (!validation.passed) {
    throw new Error(
      `AVANTIQO_CANONICAL_TRAINING_EXAMPLE_POST_WRITE_VALIDATION_FAILED:${JSON.stringify(validation)}`,
    );
  }

  return {
    contract: AVANTIQO_CANONICAL_TRAINING_EXAMPLE_CONTRACT,
    status: "EXAMPLES_COMPILED",
    dataset_manifest_id: dataset.id,
    dataset_fingerprint: text(datasetMetadata.dataset_fingerprint, 128),
    curriculum_unit_count: units.length,
    example_count: written.length,
    train_example_count: validation.train_example_count,
    holdout_example_count: validation.holdout_example_count,
    validation,
    governance: {
      deterministic_canonical_compiler: true,
      provider_execution_used: false,
      runpod_used: false,
      shared_trainer_mutated: false,
      customer_private_content_used: false,
      raw_customer_turns_used: false,
      raw_reasoning_used_as_training_target: false,
      source_version_bound: true,
      benchmark_version_bound: true,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      production_model_promotion_effect: "NONE",
    },
  };
}

export const AvantiqoCanonicalTrainingExampleRuntime = Object.freeze({
  contract: AVANTIQO_CANONICAL_TRAINING_EXAMPLE_CONTRACT,
  compile: compileAvantiqoCanonicalTrainingExamples,
});

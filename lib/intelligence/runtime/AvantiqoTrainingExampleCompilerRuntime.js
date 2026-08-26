import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  AvantiqoStructuredIntelligenceSupervisorRuntime,
} from "./AvantiqoStructuredIntelligenceSupervisorRuntime";

export const AVANTIQO_TRAINING_EXAMPLE_COMPILER_CONTRACT =
  "AVANTIQO_TRAINING_EXAMPLE_COMPILER_V1";

const MEMORY_TABLE = "intelligence_memories";
const DATASET_SCOPE = "platform_training_datasets";
const CANDIDATE_SCOPE = "platform_training_candidates";
const EXAMPLE_SCOPE = "platform_training_examples";
const MAX_UNITS_PER_COMPILE = 12;
const EXAMPLES_PER_UNIT = 2;
const SUPPORTED_CANDIDATE_KINDS = new Set([
  "VERIFIED_FAILURE_RECOVERY",
  "CANONICAL_PRODUCT_GROUNDING",
]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function stableHash(value) {
  return createHash("sha256").update(text(value, 20000)).digest("hex");
}

function boundedLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return MAX_UNITS_PER_COMPILE;
  return Math.max(1, Math.min(MAX_UNITS_PER_COMPILE, parsed));
}

function leakageDetected(value) {
  const source = text(value, 20000);
  return Boolean(
    /https?:\/\//i.test(source) ||
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(source) ||
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(source) ||
      /\b(?:api[_ -]?key|access[_ -]?token|secret|password)\s*[:=]/i.test(source)
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
  if (!ids.length) return [];
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

function safeCandidate(candidate = {}) {
  const metadata = object(candidate.metadata);
  return Boolean(
    metadata.training_ready === true &&
      text(metadata.benchmark_status, 80) === "APPROVED" &&
      SUPPORTED_CANDIDATE_KINDS.has(text(metadata.candidate_kind, 120)) &&
      metadata.customer_private_content_included === false &&
      metadata.raw_payload_persisted === false &&
      metadata.raw_output_persisted === false &&
      metadata.raw_reasoning_persisted === false &&
      metadata.identifiers_persisted === false
  );
}

function curriculumInstruction(candidateKind) {
  if (candidateKind === "VERIFIED_FAILURE_RECOVERY") {
    return (
      "When prior evidence shows an approach repeatedly failed, do not replay it unchanged. " +
      "Re-check current prerequisites and evidence, choose a materially different safe approach when supported, " +
      "and require observed verification before claiming completion."
    );
  }
  if (candidateKind === "CANONICAL_PRODUCT_GROUNDING") {
    return (
      "For questions or plans about Avantiqo's own product, ground claims in the current canonical Product Constitution " +
      "and ERP_REGISTRY contract rather than stale assumptions. Distinguish Avantiqo product state from general industry guidance " +
      "and from mutable customer business state. Mutable customer facts still require current governed reads, memory never grants " +
      "authorization, and missing, stale or conflicting canonical evidence requires a fresh canonical read before claiming the product behavior."
    );
  }
  return null;
}

function curriculum(candidate = {}, split) {
  const metadata = object(candidate.metadata);
  const behaviorClass = text(metadata.candidate_kind, 120);
  const instruction = curriculumInstruction(behaviorClass);
  if (!instruction) return null;
  return {
    capability_key: text(metadata.capability_key || candidate.subject, 300),
    behavior_class: behaviorClass,
    desired_outcome: text(metadata.outcome, 80),
    verification_requirement: text(metadata.verification_mode, 120),
    prior_failure_occurrence_count: Math.max(
      0,
      Number(metadata.prior_failure_occurrence_count || 0),
    ),
    knowledge_domain: text(metadata.knowledge_domain, 120) || null,
    product_object_type: text(metadata.product_object_type, 120) || null,
    split,
    instruction,
  };
}

function compilerSystem() {
  return [
    "You are Avantiqo's owned synthetic training-example compiler.",
    "Generate business-software reasoning examples only from the supplied de-identified curriculum. Never infer or invent customer names, organizations, people, IDs, URLs, credentials, private records, amounts, addresses, or proprietary payloads.",
    "Honor each curriculum item's behavior_class and instruction exactly; do not collapse canonical product grounding into failure-recovery behavior or vice versa.",
    "For CANONICAL_PRODUCT_GROUNDING examples, train the distinction between Avantiqo's canonical product contract, general external guidance, and mutable customer business state. Require a current canonical read when product evidence is missing or stale.",
    "Do not output hidden chain-of-thought. The assistant target must contain only concise conclusions, safe next actions, evidence requirements, and verification requirements.",
    "Do not teach the model that memory or prior success grants authorization. Any mutating action still requires the current capability/governance contract.",
    "Each example must be generic enough to reuse across organizations but specific enough to train reliable business-software reasoning.",
    "Return exactly one JSON object with key examples. examples must contain objects with user_task, assistant_target, evaluation_requirements, capability_key, split.",
  ].join("\n");
}

function normalizeExample(value = {}, allowedCapabilities = new Set()) {
  const item = object(value);
  const capability = text(item.capability_key, 300);
  const split = text(item.split, 40).toLowerCase();
  const userTask = text(item.user_task, 3000);
  const assistantTarget = text(item.assistant_target, 5000);
  const evaluationRequirements = list(item.evaluation_requirements)
    .map((entry) => text(entry, 700))
    .filter(Boolean)
    .slice(0, 12);

  if (!allowedCapabilities.has(capability)) return null;
  if (!["train", "holdout"].includes(split)) return null;
  if (!userTask || !assistantTarget || !evaluationRequirements.length) return null;
  const serialized = JSON.stringify({
    userTask,
    assistantTarget,
    evaluationRequirements,
  });
  if (leakageDetected(serialized)) return null;

  return {
    capability_key: capability,
    split,
    user_task: userTask,
    assistant_target: assistantTarget,
    evaluation_requirements: evaluationRequirements,
  };
}

async function persistExamples({ organizationId, dataset, examples }) {
  const datasetMetadata = object(dataset.metadata);
  const datasetId = text(datasetMetadata.dataset_id || dataset.subject, 240);
  const now = new Date().toISOString();
  const rows = examples.map((example) => {
    const fingerprint = stableHash([
      datasetId,
      example.capability_key,
      example.split,
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
      source: "avantiqo_synthetic_training_example_compiler",
      active: true,
      valid_until: null,
      superseded_by: null,
      superseded_at: null,
      forgotten_at: null,
      metadata: {
        contract: AVANTIQO_TRAINING_EXAMPLE_COMPILER_CONTRACT,
        dataset_manifest_id: dataset.id,
        dataset_id: datasetId,
        capability_key: example.capability_key,
        split: example.split,
        synthetic: true,
        generated_by: "avantiqo-intelligence",
        customer_private_content_included: false,
        raw_customer_turn_included: false,
        raw_payload_included: false,
        raw_output_included: false,
        raw_reasoning_included: false,
        identifiers_included: false,
        authorization_value: "none",
        training_example_validated: true,
        automatic_training_started: false,
        production_model_promotion_effect: "NONE",
        compiled_at: now,
      },
      updated_at: now,
    };
  });

  if (!rows.length) return [];
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(rows, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id,memory_key,subject,content,metadata");
  if (result.error) throw result.error;
  return list(result.data);
}

export async function compileAvantiqoTrainingExamples({
  datasetManifestId,
  maxUnits = MAX_UNITS_PER_COMPILE,
} = {}) {
  const organizationId = learningOrganizationId();
  const manifestId = text(datasetManifestId, 160);
  if (!organizationId) {
    throw new Error("AVANTIQO_TRAINING_COMPILER_LEARNING_ORGANIZATION_REQUIRED");
  }
  if (!manifestId) throw new Error("AVANTIQO_TRAINING_COMPILER_DATASET_REQUIRED");

  const dataset = await loadDataset(organizationId, manifestId);
  if (!dataset) throw new Error("AVANTIQO_TRAINING_COMPILER_DATASET_NOT_FOUND");
  const datasetMetadata = object(dataset.metadata);
  if (
    datasetMetadata.contract !== "AVANTIQO_TRAINING_DATASET_V1" ||
    datasetMetadata.training_ready !== true
  ) {
    throw new Error("AVANTIQO_TRAINING_COMPILER_DATASET_NOT_READY");
  }

  const trainIds = new Set(list(datasetMetadata.train_unit_ids).map(text).filter(Boolean));
  const holdoutIds = new Set(list(datasetMetadata.holdout_unit_ids).map(text).filter(Boolean));
  const candidateIds = list(datasetMetadata.candidate_ids)
    .map((item) => text(item, 160))
    .filter(Boolean)
    .slice(0, boundedLimit(maxUnits));
  const candidates = (await loadCandidates(organizationId, candidateIds)).filter(safeCandidate);
  if (!candidates.length) {
    return {
      contract: AVANTIQO_TRAINING_EXAMPLE_COMPILER_CONTRACT,
      status: "NO_ELIGIBLE_CANDIDATES",
      examples: [],
    };
  }

  const curriculumItems = candidates.map((candidate) => {
    const unitId = `unit-${stableHash([
      object(candidate.metadata).candidate_kind,
      object(candidate.metadata).capability_key || candidate.subject,
      object(candidate.metadata).outcome,
      object(candidate.metadata).verification_mode,
      ...list(object(candidate.metadata).failure_family).slice().sort(),
    ].join("|")).slice(0, 20)}`;
    const split = holdoutIds.has(unitId) ? "holdout" : trainIds.has(unitId) ? "train" : null;
    return split ? curriculum(candidate, split) : null;
  }).filter(Boolean);

  if (!curriculumItems.length) {
    throw new Error("AVANTIQO_TRAINING_COMPILER_DATASET_BINDING_MISMATCH");
  }

  const result = await AvantiqoStructuredIntelligenceSupervisorRuntime.run({
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    system: compilerSystem(),
    messages: [{
      role: "user",
      content: JSON.stringify({
        contract: AVANTIQO_TRAINING_EXAMPLE_COMPILER_CONTRACT,
        examples_per_unit: EXAMPLES_PER_UNIT,
        curriculum: curriculumItems,
      }),
    }],
    tools: [],
    authorization: { allow_mutating_tools: false },
    metadata: {
      module: "INTELLIGENCE_TRAINING",
      operation: "COMPILE_DEIDENTIFIED_TRAINING_EXAMPLES",
      dataset_manifest_id: dataset.id,
      customer_private_content_available: false,
      raw_reasoning_persisted: false,
      automatic_training_started: false,
    },
    mode: "deep",
    critique_instructions: [
      "Reject any example containing names, organizations, IDs, URLs, credentials, private records, invented customer facts, or authorization implied by memory.",
      "Keep examples generic and reusable. Ensure every assistant target requires evidence and verification before claiming completion.",
      "For canonical product grounding, verify the example distinguishes current Avantiqo product contract evidence from external best practice and mutable customer state.",
      "Return no chain-of-thought.",
    ].join(" "),
    max_output_tokens: 5000,
  });

  const allowedCapabilities = new Set(curriculumItems.map((item) => item.capability_key));
  const examples = list(result?.parsed?.examples)
    .map((item) => normalizeExample(item, allowedCapabilities))
    .filter(Boolean)
    .slice(0, curriculumItems.length * EXAMPLES_PER_UNIT);
  if (!examples.length) {
    throw new Error("AVANTIQO_TRAINING_COMPILER_NO_VALID_EXAMPLES");
  }

  const written = await persistExamples({
    organizationId,
    dataset,
    examples,
  });

  return {
    contract: AVANTIQO_TRAINING_EXAMPLE_COMPILER_CONTRACT,
    status: "EXAMPLES_COMPILED",
    dataset_manifest_id: dataset.id,
    curriculum_unit_count: curriculumItems.length,
    example_count: written.length,
    examples: written,
    governance: {
      owned_compiler: true,
      supported_candidate_kinds: [...SUPPORTED_CANDIDATE_KINDS],
      canonical_product_grounding_supported: true,
      customer_private_content_available: false,
      raw_customer_turns_used: false,
      raw_reasoning_used_as_training_target: false,
      leakage_filter_required: true,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      production_model_promotion_effect: "NONE",
    },
  };
}

export const AvantiqoTrainingExampleCompilerRuntime = Object.freeze({
  contract: AVANTIQO_TRAINING_EXAMPLE_COMPILER_CONTRACT,
  compile: compileAvantiqoTrainingExamples,
});

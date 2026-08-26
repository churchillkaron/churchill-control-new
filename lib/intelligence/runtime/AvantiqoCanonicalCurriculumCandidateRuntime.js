import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  buildAvantiqoInternalProductKnowledgeUnits,
} from "./AvantiqoInternalProductKnowledgeRuntime";

export const AVANTIQO_CANONICAL_CURRICULUM_CANDIDATE_CONTRACT =
  "AVANTIQO_CANONICAL_CURRICULUM_CANDIDATE_V1";

const MEMORY_TABLE = "intelligence_memories";
const TRAINING_SCOPE = "platform_training_candidates";
const CANDIDATE_KIND = "CANONICAL_PRODUCT_GROUNDING";
const VERIFICATION_MODE = "CANONICAL_REGISTRY_CONSTITUTION";
const OUTCOME = "CORRECT_PRODUCT_CONTRACT_GROUNDED";
const MAX_CANDIDATES = 32;

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

function normalizedCapabilityKey(value) {
  return text(value, 300)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".");
}

function groupedCurriculumUnits() {
  const units = buildAvantiqoInternalProductKnowledgeUnits();
  const groups = new Map();

  for (const unit of units) {
    const type = text(unit?.object_type, 120);
    const domain = text(unit?.domain, 120) || "platform";
    if (!["product_constitution", "registry_summary", "registry_domain", "registry_workspace"].includes(type)) {
      continue;
    }

    const groupKey = type === "registry_workspace"
      ? `workspace:${domain}`
      : type === "product_constitution"
        ? "constitution:platform"
        : `${type}:${domain}`;
    const current = groups.get(groupKey) || {
      key: groupKey,
      domain,
      object_type: type,
      references: [],
      subjects: [],
      source_versions: [],
    };
    const reference = text(unit?.reference, 800);
    const fingerprint = text(unit?.fingerprint, 128);
    current.references.push(reference);
    current.subjects.push(text(unit?.subject, 500));
    if (reference && fingerprint) {
      current.source_versions.push(`${reference}:${fingerprint}`);
    }
    groups.set(groupKey, current);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      references: [...new Set(group.references.filter(Boolean))].sort(),
      subjects: [...new Set(group.subjects.filter(Boolean))].sort(),
      source_versions: [...new Set(group.source_versions.filter(Boolean))].sort(),
    }))
    .filter((group) => group.references.length > 0 && group.source_versions.length > 0)
    .sort((left, right) => left.key.localeCompare(right.key))
    .slice(0, MAX_CANDIDATES);
}

function candidateKey(group) {
  return `canonical-curriculum:${stableHash([
    CANDIDATE_KIND,
    group.key,
    ...group.references,
  ].join("|" )).slice(0, 40)}`;
}

function candidateSourceFingerprint(group) {
  return stableHash(group.source_versions.join("|"));
}

function candidateRow(organizationId, group, nowIso) {
  const capabilityKey = normalizedCapabilityKey(
    `platform.${group.domain}.${group.object_type}.grounding`,
  );
  const fingerprint = candidateSourceFingerprint(group);
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: TRAINING_SCOPE,
    memory_key: candidateKey(group),
    memory_type: "lesson",
    subject: capabilityKey,
    content: [
      `Canonical Avantiqo curriculum candidate for ${group.domain} ${group.object_type.replaceAll("_", " ")}.`,
      "Train observable behavior to ground answers and plans in the current Avantiqo Product Constitution and canonical ERP_REGISTRY contract, never in stale assumptions.",
      "This candidate contains structural product knowledge only and requires benchmark validation before dataset eligibility.",
    ].join(" "),
    importance: group.object_type === "product_constitution" ? 0.98 : 0.9,
    confidence: 1,
    source: "canonical_product_curriculum_candidate",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_CANONICAL_CURRICULUM_CANDIDATE_CONTRACT,
      candidate_kind: CANDIDATE_KIND,
      capability_key: capabilityKey,
      knowledge_domain: group.domain,
      product_object_type: group.object_type,
      source_reference_count: group.references.length,
      source_references: group.references,
      source_subjects: group.subjects.slice(0, 40),
      source_content_versions: group.source_versions,
      source_fingerprint: fingerprint,
      failure_family: [],
      prior_failure_occurrence_count: 0,
      outcome: OUTCOME,
      verification_mode: VERIFICATION_MODE,
      training_ready: false,
      benchmark_status: "UNREVIEWED",
      requires_benchmark_validation: true,
      benchmark_validated: false,
      customer_private_content_included: false,
      raw_payload_persisted: false,
      raw_output_persisted: false,
      raw_reasoning_persisted: false,
      identifiers_persisted: false,
      authorization_value: "none",
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      production_model_promotion_effect: "NONE",
      seeded_at: nowIso,
    },
    updated_at: nowIso,
  };
}

export function buildAvantiqoCanonicalCurriculumCandidates() {
  return groupedCurriculumUnits().map((group) => ({
    key: group.key,
    domain: group.domain,
    object_type: group.object_type,
    capability_key: normalizedCapabilityKey(
      `platform.${group.domain}.${group.object_type}.grounding`,
    ),
    source_reference_count: group.references.length,
    source_fingerprint: candidateSourceFingerprint(group),
    training_ready: false,
    benchmark_required: true,
  }));
}

export async function seedAvantiqoCanonicalCurriculumCandidates() {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      contract: AVANTIQO_CANONICAL_CURRICULUM_CANDIDATE_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      candidate_count: 0,
      written_count: 0,
    };
  }

  const groups = groupedCurriculumUnits();
  const nowIso = new Date().toISOString();
  const desiredRows = groups.map((group) => candidateRow(organizationId, group, nowIso));
  const desiredKeys = new Set(desiredRows.map((row) => row.memory_key));

  const existing = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,active,metadata")
    .eq("organization_id", organizationId)
    .eq("memory_scope", TRAINING_SCOPE)
    .eq("source", "canonical_product_curriculum_candidate")
    .limit(500);
  if (existing.error) throw existing.error;

  const existingByKey = new Map(
    list(existing.data).map((row) => [text(row.memory_key, 160), row]),
  );
  const changedRows = desiredRows.filter((row) => {
    const prior = existingByKey.get(row.memory_key);
    if (!prior || prior.active !== true) return true;
    const priorMetadata = object(prior.metadata);
    return text(priorMetadata.source_fingerprint, 128) !== row.metadata.source_fingerprint;
  });

  let writtenCount = 0;
  if (changedRows.length) {
    const written = await supabaseAdmin
      .from(MEMORY_TABLE)
      .upsert(changedRows, {
        onConflict: "organization_id,memory_scope,memory_key",
      })
      .select("id");
    if (written.error) throw written.error;
    writtenCount = list(written.data).length;
  }

  const staleIds = list(existing.data)
    .filter((row) => row.active === true && !desiredKeys.has(text(row.memory_key, 160)))
    .map((row) => row.id)
    .filter(Boolean);
  let retiredCount = 0;
  if (staleIds.length) {
    const retired = await supabaseAdmin
      .from(MEMORY_TABLE)
      .update({ active: false, superseded_at: nowIso, updated_at: nowIso })
      .eq("organization_id", organizationId)
      .eq("memory_scope", TRAINING_SCOPE)
      .eq("source", "canonical_product_curriculum_candidate")
      .in("id", staleIds)
      .select("id");
    if (retired.error) throw retired.error;
    retiredCount = list(retired.data).length;
  }

  return {
    contract: AVANTIQO_CANONICAL_CURRICULUM_CANDIDATE_CONTRACT,
    status: "SEEDED",
    candidate_count: desiredRows.length,
    written_count: writtenCount,
    unchanged_count: Math.max(0, desiredRows.length - changedRows.length),
    retired_count: retiredCount,
    governance: {
      provider_execution_used: false,
      runpod_used: false,
      shared_trainer_mutated: false,
      customer_private_content_used: false,
      raw_reasoning_used: false,
      candidate_identity_stable_across_content_change: true,
      canonical_content_change_invalidates_review: true,
      unchanged_candidate_review_state_preserved: true,
      changed_source_requires_fresh_benchmark: true,
      benchmark_required_before_training_ready: true,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      production_model_promotion_effect: "NONE",
    },
  };
}

export const AvantiqoCanonicalCurriculumCandidateRuntime = Object.freeze({
  contract: AVANTIQO_CANONICAL_CURRICULUM_CANDIDATE_CONTRACT,
  build: buildAvantiqoCanonicalCurriculumCandidates,
  seed: seedAvantiqoCanonicalCurriculumCandidates,
});

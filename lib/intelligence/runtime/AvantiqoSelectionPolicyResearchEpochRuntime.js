import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_SELECTION_POLICY_RESEARCH_EPOCH_CONTRACT =
  "AVANTIQO_SELECTION_POLICY_RESEARCH_EPOCH_V1";

export const AVANTIQO_SELECTION_POLICY_RESEARCH_EPOCH_SCOPE =
  "platform_learning_selection_policy_research_epochs";

export const AVANTIQO_PERSISTENT_POLICY_ACTIVATION_GENERATION_CONTRACT =
  "AVANTIQO_PERSISTENT_POLICY_ACTIVATION_GENERATION_V1";

const MEMORY_TABLE = "intelligence_memories";
const POLICY_TABLE = "avantiqo_intelligence_persistent_ordering_policies";
const APPLICATION_TABLE =
  "avantiqo_intelligence_persistent_ordering_policy_applications";
const MONITOR_TABLE =
  "avantiqo_intelligence_persistent_ordering_policy_monitor_evaluations";
const OUTCOME_SCOPE = "platform_learning_experiment_portfolio_outcomes";
const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 730;
const LEGACY_CHALLENGER_POLICY_VERSION =
  "EMPIRICAL_CONSERVATIVE_CALIBRATION_V1";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function digest(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => text(part, 24000).toLowerCase()).join("|"))
    .digest("hex");
}

function validFingerprint(value) {
  return /^[a-f0-9]{32,128}$/.test(text(value, 128).toLowerCase());
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function plusDays(value, days) {
  return new Date(Date.parse(value) + days * DAY_MS).toISOString();
}

function activationGeneration(policy) {
  const metadata = object(policy?.metadata);
  return {
    contract: text(metadata.phase43_activation_generation_contract, 180),
    index: Number(metadata.phase43_activation_generation_index),
    fingerprint: text(
      metadata.phase43_activation_generation_fingerprint,
      128,
    ).toLowerCase(),
    startedAt: text(
      metadata.phase43_activation_started_at || policy?.activated_at,
      120,
    ),
  };
}

async function loadActivePersistentPolicy(organizationId) {
  const result = await supabaseAdmin
    .from(POLICY_TABLE)
    .select(
      "id,contract,organization_id,policy_fingerprint,release_candidate_fingerprint,approval_fingerprint,source_certification_fingerprint,source_activation_fingerprint,baseline_policy_fingerprint,challenger_policy_version,ordering_influence_fraction,state,activator_fingerprint,activated_at,metadata,created_at,updated_at",
    )
    .eq("organization_id", organizationId)
    .eq("state", "ACTIVE")
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function loadPolicyEvidence(organizationId, policy) {
  const generation = activationGeneration(policy);
  const startedAt = generation.startedAt || policy.activated_at;
  const [applications, monitors, outcomes] = await Promise.all([
    supabaseAdmin
      .from(APPLICATION_TABLE)
      .select("id,selection_cycle_fingerprint,state,applied_at,metadata")
      .eq("organization_id", organizationId)
      .eq("policy_id", policy.id)
      .gte("applied_at", startedAt)
      .order("applied_at", { ascending: true })
      .limit(1000),
    supabaseAdmin
      .from(MONITOR_TABLE)
      .select(
        "id,selection_cycle_fingerprint,status,regression_detected,lineage_ambiguity_detected,evaluated_at,evidence",
      )
      .eq("organization_id", organizationId)
      .eq("policy_id", policy.id)
      .gte("evaluated_at", startedAt)
      .order("evaluated_at", { ascending: true })
      .limit(1000),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,active,metadata,created_at,updated_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", OUTCOME_SCOPE)
      .eq("active", true)
      .gte("created_at", startedAt)
      .limit(5000),
  ]);
  if (applications.error) throw applications.error;
  if (monitors.error) throw monitors.error;
  if (outcomes.error) throw outcomes.error;
  return {
    applications: list(applications.data),
    monitors: list(monitors.data),
    outcomes: list(outcomes.data),
  };
}

function buildEpochRow({ organizationId, policy, evidence, nowIso }) {
  const generation = activationGeneration(policy);
  const applicationCycles = new Set(
    evidence.applications
      .filter((row) => row.state === "APPLIED")
      .map((row) => text(row.selection_cycle_fingerprint, 128))
      .filter(Boolean),
  );
  const governedPostActivationOutcomes = evidence.outcomes.filter((row) => {
    const metadata = object(row.metadata);
    return Boolean(
      metadata.contract === "AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_V1" &&
        metadata.status === "OBSERVED_PORTFOLIO_EXECUTION_OUTCOME_RECORDED" &&
        metadata.selection_request_lineage_verified === true &&
        metadata.immutable_execution_receipt_verified === true &&
        metadata.information_outcome_qualified === true &&
        metadata.unexecuted_candidate_outcome_inferred === false &&
        metadata.full_counterfactual_regret_claimed === false &&
        applicationCycles.has(text(metadata.selection_cycle_fingerprint, 128))
    );
  });
  const evaluatedNonRegressiveCycles = evidence.monitors.filter(
    (row) =>
      row.status === "COMPLETE_NON_REGRESSIVE_CYCLE" &&
      row.regression_detected === false &&
      row.lineage_ambiguity_detected === false,
  );

  const epochFingerprint = digest(
    "selection-policy-research-epoch",
    policy.policy_fingerprint,
    policy.challenger_policy_version,
    policy.ordering_influence_fraction,
    generation.fingerprint,
  );

  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_SELECTION_POLICY_RESEARCH_EPOCH_SCOPE,
    memory_key: `selection-policy-research-epoch:${epochFingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Selection policy research epoch ${policy.policy_fingerprint.slice(0, 16)}`,
    content:
      "Research-epoch authority binding future selection-policy challenger work to the currently active persistent ordering policy and its exact activation interval. Evidence from any prior active interval is historical only and cannot authorize a new challenger, canary, approval, or succession action in this interval.",
    importance: 0.99,
    confidence: 1,
    source: "selection_policy_research_epoch",
    active: true,
    valid_until: plusDays(nowIso, RETENTION_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_SELECTION_POLICY_RESEARCH_EPOCH_CONTRACT,
      status: "ACTIVE_PERSISTENT_POLICY_IS_CURRENT_RESEARCH_BASELINE",
      epoch_fingerprint: epochFingerprint,
      current_baseline_policy_contract: policy.contract,
      current_baseline_policy_fingerprint: policy.policy_fingerprint,
      parent_baseline_policy_fingerprint: policy.baseline_policy_fingerprint,
      promoted_challenger_policy_version: policy.challenger_policy_version,
      promoted_ordering_influence_fraction: Number(
        policy.ordering_influence_fraction,
      ),
      source_release_candidate_fingerprint: policy.release_candidate_fingerprint,
      source_certification_fingerprint: policy.source_certification_fingerprint,
      source_activation_fingerprint: policy.source_activation_fingerprint,
      policy_activated_at: policy.activated_at,
      activation_generation_contract: generation.contract,
      activation_generation_index: generation.index,
      activation_generation_fingerprint: generation.fingerprint,
      activation_generation_started_at: generation.startedAt,
      research_epoch_binds_exact_activation_generation: true,
      prior_active_interval_evidence_reusable: false,
      stale_research_epoch_reusable: false,
      stale_canary_reusable: false,
      stale_approval_reusable: false,
      post_activation_application_cycle_count: applicationCycles.size,
      post_activation_governed_outcome_count:
        governedPostActivationOutcomes.length,
      complete_non_regressive_cycle_count: evaluatedNonRegressiveCycles.length,
      old_challenger_policy_version:
        policy.challenger_policy_version || LEGACY_CHALLENGER_POLICY_VERSION,
      old_challenger_repromotion_allowed: false,
      old_challenger_recanary_allowed: false,
      old_challenger_recursive_reapplication_as_new_policy_allowed: false,
      old_challenger_prospective_computation_allowed_for_current_policy_application: true,
      future_challenger_must_bind_current_baseline_policy_fingerprint: true,
      future_challenger_must_bind_activation_generation_fingerprint: true,
      future_challenger_must_use_distinct_policy_version: true,
      future_challenger_requires_post_activation_governed_evidence: true,
      future_challenger_requires_prospective_same_portfolio_evaluation: true,
      future_challenger_generation_authorized_here: false,
      automatic_policy_activation: false,
      automatic_policy_promotion: false,
      selected_membership_change_authorized: false,
      source_numeric_score_mutation_authorized: false,
      execution_authorized: false,
      provider_execution_authorized: false,
      spend_authorized: false,
      provider_called_here: false,
      wallet_write_performed_here: false,
      runpod_job_submitted: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      authorization_value: "research_baseline_and_active_interval_binding_only",
      reconciled_at: nowIso,
    },
    updated_at: nowIso,
  };
}

export async function reconcileAvantiqoSelectionPolicyResearchEpoch({
  persist = true,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_SELECTION_POLICY_RESEARCH_EPOCH_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      persistent_policy_active: false,
      legacy_challenger_promotion_allowed: true,
    };
  }

  const policy = await loadActivePersistentPolicy(organizationId);
  if (!policy) {
    return {
      success: true,
      contract: AVANTIQO_SELECTION_POLICY_RESEARCH_EPOCH_CONTRACT,
      status: "NO_ACTIVE_PERSISTENT_POLICY_RESEARCH_BASELINE",
      persistent_policy_active: false,
      legacy_challenger_promotion_allowed: true,
      legacy_challenger_prospective_computation_allowed: true,
      future_challenger_generation_authorized: false,
      automatic_policy_activation: false,
    };
  }

  const generation = activationGeneration(policy);
  if (
    policy.contract !== "AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_V1" ||
    !validFingerprint(policy.policy_fingerprint) ||
    !Number.isFinite(Number(policy.ordering_influence_fraction)) ||
    Number(policy.ordering_influence_fraction) <= 0 ||
    Number(policy.ordering_influence_fraction) > 0.25 ||
    generation.contract !==
      AVANTIQO_PERSISTENT_POLICY_ACTIVATION_GENERATION_CONTRACT ||
    !Number.isInteger(generation.index) ||
    generation.index <= 0 ||
    !validFingerprint(generation.fingerprint) ||
    !Number.isFinite(Date.parse(generation.startedAt)) ||
    generation.startedAt !== text(policy.activated_at, 120)
  ) {
    return {
      success: false,
      contract: AVANTIQO_SELECTION_POLICY_RESEARCH_EPOCH_CONTRACT,
      status: "ACTIVE_PERSISTENT_POLICY_RESEARCH_BASELINE_INVALID_FAIL_CLOSED",
      persistent_policy_active: true,
      activation_generation_verified: false,
      legacy_challenger_promotion_allowed: false,
      execution_authorized: false,
    };
  }

  const evidence = await loadPolicyEvidence(organizationId, policy);
  const nowIso = new Date().toISOString();
  const row = buildEpochRow({ organizationId, policy, evidence, nowIso });
  let writeCount = 0;
  let supersededEpochCount = 0;
  if (persist) {
    const superseded = await supabaseAdmin
      .from(MEMORY_TABLE)
      .update({
        active: false,
        superseded_at: nowIso,
        updated_at: nowIso,
      })
      .eq("organization_id", organizationId)
      .eq("memory_scope", AVANTIQO_SELECTION_POLICY_RESEARCH_EPOCH_SCOPE)
      .eq("active", true)
      .eq("metadata->>current_baseline_policy_fingerprint", policy.policy_fingerprint)
      .neq(
        "metadata->>activation_generation_fingerprint",
        generation.fingerprint,
      )
      .select("id");
    if (superseded.error) throw superseded.error;
    supersededEpochCount = list(superseded.data).length;

    const result = await supabaseAdmin
      .from(MEMORY_TABLE)
      .upsert(row, {
        onConflict: "organization_id,memory_scope,memory_key",
      })
      .select("id");
    if (result.error) throw result.error;
    writeCount = list(result.data).length;
  }

  return {
    success: true,
    contract: AVANTIQO_SELECTION_POLICY_RESEARCH_EPOCH_CONTRACT,
    status: "ACTIVE_PERSISTENT_POLICY_IS_CURRENT_RESEARCH_BASELINE",
    persistent_policy_active: true,
    research_epoch_fingerprint: row.metadata.epoch_fingerprint,
    current_baseline_policy_fingerprint: policy.policy_fingerprint,
    activation_generation_contract: generation.contract,
    activation_generation_index: generation.index,
    activation_generation_fingerprint: generation.fingerprint,
    activation_generation_started_at: generation.startedAt,
    activation_generation_verified: true,
    promoted_challenger_policy_version: policy.challenger_policy_version,
    post_activation_application_cycle_count:
      row.metadata.post_activation_application_cycle_count,
    post_activation_governed_outcome_count:
      row.metadata.post_activation_governed_outcome_count,
    complete_non_regressive_cycle_count:
      row.metadata.complete_non_regressive_cycle_count,
    legacy_challenger_promotion_allowed: false,
    legacy_challenger_recanary_allowed: false,
    legacy_challenger_prospective_computation_allowed: true,
    prior_active_interval_evidence_reusable: false,
    stale_research_epoch_reusable: false,
    stale_canary_reusable: false,
    stale_approval_reusable: false,
    future_challenger_must_bind_current_baseline: true,
    future_challenger_must_bind_activation_generation: true,
    future_challenger_must_use_distinct_policy_version: true,
    future_challenger_generation_authorized: false,
    superseded_prior_epoch_count: supersededEpochCount,
    epoch_write_count: writeCount,
    automatic_policy_activation: false,
    automatic_policy_promotion: false,
    execution_authorized: false,
  };
}

export const AvantiqoSelectionPolicyResearchEpochRuntime = Object.freeze({
  contract: AVANTIQO_SELECTION_POLICY_RESEARCH_EPOCH_CONTRACT,
  reconcile: reconcileAvantiqoSelectionPolicyResearchEpoch,
});

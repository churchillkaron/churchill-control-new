import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  AVANTIQO_EXPERIMENT_OUTCOME_ASSESSOR_CALIBRATION_CONTRACT,
  AVANTIQO_EXPERIMENT_OUTCOME_ASSESSOR_CALIBRATION_SCOPE,
} from "@/lib/intelligence/runtime/AvantiqoExperimentOutcomeAssessorCalibrationRuntime";

export const AVANTIQO_ASSESSOR_CALIBRATED_ESTIMATOR_SELECTION_GUARD_CONTRACT =
  "AVANTIQO_ASSESSOR_CALIBRATED_ESTIMATOR_SELECTION_GUARD_V1";

const ACTIVE_SELECTION_CONTRACT = "AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_V1";
const ESTIMATOR_CALIBRATION_CONTRACT =
  "AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_V1";
const MEMORY_TABLE = "intelligence_memories";
const SELECTION_SCOPE = "platform_learning_active_experiment_selections";
const ESTIMATE_SCOPE = "platform_learning_experiment_information_estimates";
const ESTIMATOR_EVENT_SCOPE =
  "platform_learning_experiment_estimator_calibration_events";
const ASSESSMENT_SCOPE =
  "platform_learning_experiment_information_outcome_assessments";
const HOLD_SCOPE =
  "platform_learning_experiment_assessor_calibrated_estimator_holds";
const MIN_SELECTION_ESTIMATORS = 2;
const MIN_SELECTION_METHODS = 2;
const MIN_INFORMATION_EVENTS_TO_REQUIRE_TRUST = 3;
const MIN_TRUSTED_INFORMATION_EVENTS = 3;
const MIN_ASSESSORS_PER_TRUSTED_EVENT = 3;
const MIN_METHODS_PER_TRUSTED_EVENT = 2;
const MIN_DISTINCT_EXPERIMENTS = 2;
const MAX_ROWS = 5000;
const HOLD_VALIDITY_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function unique(values) {
  return [...new Set(list(values).map((value) => text(value, 2000)).filter(Boolean))];
}
function digest(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => text(part, 24000).toLowerCase()).join("|"))
    .digest("hex");
}
function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}
function activeAndUnexpired(row, nowMs = Date.now()) {
  if (row?.active !== true) return false;
  const validUntil = Date.parse(text(row.valid_until, 120));
  return !Number.isFinite(validUntil) || validUntil > nowMs;
}
function plusDays(value, days) {
  return new Date(Date.parse(value) + days * DAY_MS).toISOString();
}

async function loadState(organizationId) {
  const scopes = [
    SELECTION_SCOPE,
    ESTIMATE_SCOPE,
    ESTIMATOR_EVENT_SCOPE,
    ASSESSMENT_SCOPE,
    AVANTIQO_EXPERIMENT_OUTCOME_ASSESSOR_CALIBRATION_SCOPE,
  ];
  const results = await Promise.all(
    scopes.map((scope) =>
      supabaseAdmin
        .from(MEMORY_TABLE)
        .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
        .eq("organization_id", organizationId)
        .eq("memory_scope", scope)
        .eq("active", true)
        .limit(MAX_ROWS),
    ),
  );
  for (const result of results) if (result.error) throw result.error;
  return {
    selections: list(results[0].data),
    estimates: list(results[1].data),
    estimatorEvents: list(results[2].data),
    assessments: list(results[3].data),
    assessorProfiles: list(results[4].data),
  };
}

function quarantinedAssessors(state, nowMs) {
  const set = new Set();
  for (const row of state.assessorProfiles) {
    const metadata = object(row.metadata);
    if (
      activeAndUnexpired(row, nowMs) &&
      text(metadata.contract, 180) ===
        AVANTIQO_EXPERIMENT_OUTCOME_ASSESSOR_CALIBRATION_CONTRACT &&
      text(metadata.status, 180) === "QUARANTINED_UNSAFE_OPTIMISM" &&
      metadata.unsafe_optimism_quarantine_active === true
    ) {
      const fp = text(metadata.assessor_fingerprint, 128);
      if (fp) set.add(fp);
    }
  }
  return set;
}

function assessmentIndex(state) {
  const map = new Map();
  for (const row of state.assessments) {
    const metadata = object(row.metadata);
    const fp = text(metadata.assessment_fingerprint, 128);
    if (fp) map.set(fp, row);
  }
  return map;
}

function estimatorTrustAssessment({ estimatorFingerprint, state, quarantined, assessments }) {
  const events = state.estimatorEvents.filter((row) => {
    const metadata = object(row.metadata);
    return Boolean(
      text(metadata.contract, 180) === ESTIMATOR_CALIBRATION_CONTRACT &&
      text(metadata.status, 180) === "ESTIMATOR_CALIBRATION_EVENT_RECORDED" &&
      text(metadata.estimator_fingerprint, 128) === estimatorFingerprint &&
      metadata.information_gain_calibrated === true
    );
  });

  if (events.length < MIN_INFORMATION_EVENTS_TO_REQUIRE_TRUST) {
    return {
      estimator_fingerprint: estimatorFingerprint,
      trust_required: false,
      passes: true,
      information_event_count: events.length,
      trusted_information_event_count: 0,
      trusted_distinct_experiment_count: 0,
      contaminated_assessor_fingerprints: [],
    };
  }

  const trustedEvents = [];
  const contaminated = new Set();
  for (const event of events) {
    const metadata = object(event.metadata);
    const assessmentFingerprints = unique(
      metadata.information_outcome_assessment_fingerprints,
    );
    const eventAssessments = assessmentFingerprints
      .map((fp) => assessments.get(fp))
      .filter(Boolean);
    const assessorFingerprints = unique(
      eventAssessments.map((row) => object(row.metadata).assessor_fingerprint),
    );
    const methodFingerprints = unique(
      eventAssessments.map(
        (row) => object(row.metadata).assessment_method_fingerprint,
      ),
    );
    const contaminatedHere = assessorFingerprints.filter((fp) =>
      quarantined.has(fp),
    );
    for (const fp of contaminatedHere) contaminated.add(fp);
    const trusted = Boolean(
      assessorFingerprints.length >= MIN_ASSESSORS_PER_TRUSTED_EVENT &&
      methodFingerprints.length >= MIN_METHODS_PER_TRUSTED_EVENT &&
      contaminatedHere.length === 0
    );
    if (trusted) trustedEvents.push(event);
  }
  const trustedDistinctExperimentCount = unique(
    trustedEvents.map((row) => object(row.metadata).experiment_fingerprint),
  ).length;
  const passes = Boolean(
    trustedEvents.length >= MIN_TRUSTED_INFORMATION_EVENTS &&
      trustedDistinctExperimentCount >= MIN_DISTINCT_EXPERIMENTS
  );
  return {
    estimator_fingerprint: estimatorFingerprint,
    trust_required: true,
    passes,
    information_event_count: events.length,
    trusted_information_event_count: trustedEvents.length,
    trusted_distinct_experiment_count: trustedDistinctExperimentCount,
    contaminated_assessor_fingerprints: [...contaminated],
  };
}

function selectionAssessment(selection, state, quarantined, assessments, nowMs) {
  const metadata = object(selection.metadata);
  if (
    !activeAndUnexpired(selection, nowMs) ||
    text(metadata.contract, 180) !== ACTIVE_SELECTION_CONTRACT ||
    text(metadata.status, 180) !==
      "SELECTED_FOR_SEPARATE_GOVERNED_EXECUTION_REVIEW"
  ) return null;

  const estimateSet = new Set(unique(metadata.estimate_fingerprints));
  const estimateRows = state.estimates.filter((row) => {
    const m = object(row.metadata);
    return estimateSet.has(text(m.estimate_fingerprint, 128));
  });
  const estimatorFingerprints = unique(
    estimateRows.map((row) => object(row.metadata).estimator_fingerprint),
  );
  const trustByEstimator = estimatorFingerprints.map((fp) =>
    estimatorTrustAssessment({
      estimatorFingerprint: fp,
      state,
      quarantined,
      assessments,
    }),
  );
  const qualifyingEstimators = new Set(
    trustByEstimator.filter((item) => item.passes).map((item) => item.estimator_fingerprint),
  );
  const qualifyingRows = estimateRows.filter((row) =>
    qualifyingEstimators.has(text(object(row.metadata).estimator_fingerprint, 128)),
  );
  const qualifyingMethods = unique(
    qualifyingRows.map((row) => object(row.metadata).estimation_method_fingerprint),
  );
  const passes = Boolean(
    qualifyingEstimators.size >= MIN_SELECTION_ESTIMATORS &&
      qualifyingMethods.length >= MIN_SELECTION_METHODS
  );
  return {
    selection,
    selection_fingerprint: text(metadata.selection_fingerprint, 128),
    experiment_fingerprint: text(metadata.experiment_fingerprint, 128),
    passes,
    qualifying_estimator_count: qualifyingEstimators.size,
    qualifying_method_count: qualifyingMethods.length,
    estimator_trust: trustByEstimator,
  };
}

function holdRow(organizationId, assessment, nowIso) {
  const holdFingerprint = digest(
    "assessor-calibrated-estimator-selection-hold",
    assessment.selection_fingerprint,
  );
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: HOLD_SCOPE,
    memory_key: `assessor-calibrated-estimator-hold:${holdFingerprint.slice(0, 40)}`,
    memory_type: "lesson",
    subject: `Assessor trust hold ${assessment.experiment_fingerprint.slice(0, 16)}`,
    content:
      "Selection retired because mature information-gain calibration for one or more estimators did not have enough trusted, non-quarantined, assessor-diverse evidence. Original estimates and assessment values remain untouched.",
    importance: 0.99,
    confidence: 1,
    source: "assessor_calibrated_estimator_selection_guard",
    active: true,
    valid_until: plusDays(nowIso, HOLD_VALIDITY_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_ASSESSOR_CALIBRATED_ESTIMATOR_SELECTION_GUARD_CONTRACT,
      status: "SELECTION_RETIRED_UNTRUSTED_ASSESSOR_CALIBRATION",
      hold_fingerprint: holdFingerprint,
      selection_fingerprint: assessment.selection_fingerprint,
      experiment_fingerprint: assessment.experiment_fingerprint,
      qualifying_estimator_count: assessment.qualifying_estimator_count,
      qualifying_method_count: assessment.qualifying_method_count,
      estimator_trust: assessment.estimator_trust,
      minimum_selection_estimators: MIN_SELECTION_ESTIMATORS,
      minimum_selection_methods: MIN_SELECTION_METHODS,
      minimum_information_events_to_require_trust:
        MIN_INFORMATION_EVENTS_TO_REQUIRE_TRUST,
      minimum_trusted_information_events: MIN_TRUSTED_INFORMATION_EVENTS,
      minimum_assessors_per_trusted_event: MIN_ASSESSORS_PER_TRUSTED_EVENT,
      minimum_methods_per_trusted_event: MIN_METHODS_PER_TRUSTED_EVENT,
      minimum_distinct_experiments: MIN_DISTINCT_EXPERIMENTS,
      original_estimates_mutated: false,
      original_outcome_assessments_mutated: false,
      assessor_calibration_can_improve_selection_score: false,
      fail_closed_retirement_only: true,
      selection_execution_authority_remaining: false,
      execution_authorized: false,
      spend_authorized: false,
      provider_execution_authorized: false,
      runpod_job_submitted: false,
      reusable_platform_knowledge: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      authorization_value: "none",
      held_at: nowIso,
    },
    updated_at: nowIso,
  };
}

async function retireSelection(assessment, nowIso) {
  const selection = assessment.selection;
  const metadata = object(selection.metadata);
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({
      active: false,
      forgotten_at: nowIso,
      updated_at: nowIso,
      metadata: {
        ...metadata,
        assessor_calibration_guard_contract:
          AVANTIQO_ASSESSOR_CALIBRATED_ESTIMATOR_SELECTION_GUARD_CONTRACT,
        assessor_calibration_guard_status:
          "RETIRED_UNTRUSTED_ASSESSOR_CALIBRATION",
        assessor_calibration_guarded_at: nowIso,
        selection_execution_authority_remaining: false,
      },
    })
    .eq("id", selection.id)
    .eq("active", true)
    .eq("metadata->>selection_fingerprint", assessment.selection_fingerprint)
    .select("id");
  if (result.error) throw result.error;
  return list(result.data).length === 1;
}

async function upsertHolds(rows) {
  if (!rows.length) return 0;
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(rows, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id");
  if (result.error) throw result.error;
  return list(result.data).length;
}

export async function reconcileAvantiqoAssessorCalibratedEstimatorSelectionGuard({
  persist = true,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_ASSESSOR_CALIBRATED_ESTIMATOR_SELECTION_GUARD_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      inspected_selection_count: 0,
      retired_selection_count: 0,
    };
  }
  const nowIso = new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const state = await loadState(organizationId);
  const quarantined = quarantinedAssessors(state, nowMs);
  const assessments = assessmentIndex(state);
  const inspected = state.selections
    .map((selection) =>
      selectionAssessment(selection, state, quarantined, assessments, nowMs),
    )
    .filter(Boolean);
  const failing = inspected.filter((item) => !item.passes);
  const holds = failing.map((item) => holdRow(organizationId, item, nowIso));

  let retiredSelectionCount = 0;
  let holdWriteCount = 0;
  if (persist) {
    for (const assessment of failing) {
      if (await retireSelection(assessment, nowIso)) retiredSelectionCount += 1;
    }
    holdWriteCount = await upsertHolds(holds);
  }

  return {
    success: true,
    contract: AVANTIQO_ASSESSOR_CALIBRATED_ESTIMATOR_SELECTION_GUARD_CONTRACT,
    status: failing.length
      ? "UNTRUSTED_ASSESSOR_CALIBRATION_SELECTIONS_RETIRED"
      : "SELECTIONS_PASS_ASSESSOR_CALIBRATION_GUARD",
    quarantined_assessor_count: quarantined.size,
    inspected_selection_count: inspected.length,
    failing_selection_count: failing.length,
    retired_selection_count: retiredSelectionCount,
    hold_write_count: holdWriteCount,
    policy: {
      mature_information_calibration_requires_assessor_trust: true,
      minimum_information_events_to_require_trust:
        MIN_INFORMATION_EVENTS_TO_REQUIRE_TRUST,
      minimum_trusted_information_events: MIN_TRUSTED_INFORMATION_EVENTS,
      minimum_assessors_per_trusted_event: MIN_ASSESSORS_PER_TRUSTED_EVENT,
      minimum_methods_per_trusted_event: MIN_METHODS_PER_TRUSTED_EVENT,
      minimum_distinct_experiments: MIN_DISTINCT_EXPERIMENTS,
      quarantined_assessors_can_enable_estimator_qualification: false,
      original_numeric_estimates_are_mutated: false,
      original_numeric_assessments_are_mutated: false,
      guard_can_improve_selection_score: false,
      fail_closed_before_execution_request_generation: true,
    },
    governance: {
      execution_authorized: false,
      spend_authorized: false,
      provider_execution_authorized: false,
      experiment_execution_performed_here: false,
      runpod_job_submitted: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoAssessorCalibratedEstimatorSelectionGuardRuntime = Object.freeze({
  contract: AVANTIQO_ASSESSOR_CALIBRATED_ESTIMATOR_SELECTION_GUARD_CONTRACT,
  reconcile: reconcileAvantiqoAssessorCalibratedEstimatorSelectionGuard,
});

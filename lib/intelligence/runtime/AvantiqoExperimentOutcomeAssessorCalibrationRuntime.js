import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_EXPERIMENT_OUTCOME_ASSESSOR_CALIBRATION_CONTRACT =
  "AVANTIQO_EXPERIMENT_OUTCOME_ASSESSOR_CALIBRATION_V1";

const ESTIMATOR_CALIBRATION_CONTRACT =
  "AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_V1";
const MEMORY_TABLE = "intelligence_memories";
const OUTCOME_ASSESSMENT_SCOPE =
  "platform_learning_experiment_information_outcome_assessments";
const CALIBRATION_EVENT_SCOPE =
  "platform_learning_experiment_information_outcome_assessor_calibration_events";
export const AVANTIQO_EXPERIMENT_OUTCOME_ASSESSOR_CALIBRATION_SCOPE =
  "platform_learning_experiment_information_outcome_assessor_calibrations";

const MAX_ROWS = 5000;
const CALIBRATION_LOOKBACK_DAYS = 180;
const CALIBRATION_RETENTION_DAYS = 730;
const PROFILE_VALIDITY_DAYS = 30;
const MIN_PEER_ASSESSORS = 2;
const MIN_PEER_METHODS = 2;
const MIN_CALIBRATION_EVENTS = 3;
const MIN_DISTINCT_EXPERIMENTS = 2;
const OPTIMISM_TOLERANCE_BITS = 0.25;
const UNSAFE_OPTIMISM_RATE = 0.67;
const UNSAFE_MEAN_OPTIMISM_FRACTION = 0.35;
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

function digest(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => text(part, 24000).toLowerCase()).join("|"))
    .digest("hex");
}

function unique(values) {
  return [...new Set(list(values).map((value) => text(value, 2000)).filter(Boolean))];
}

function mean(values) {
  const finite = list(values).map(Number).filter(Number.isFinite);
  if (!finite.length) return 0;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
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

function governedAssessment(row, nowMs = Date.now()) {
  const metadata = object(row?.metadata);
  const assessedAt = Date.parse(text(metadata.assessed_at, 120));
  return Boolean(
    activeAndUnexpired(row, nowMs) &&
      text(metadata.contract, 180) === ESTIMATOR_CALIBRATION_CONTRACT &&
      text(metadata.status, 180) ===
        "INDEPENDENT_INFORMATION_OUTCOME_ASSESSMENT_RECORDED" &&
      metadata.independent_assessor_attested === true &&
      metadata.governed_result_evidence_verified === true &&
      metadata.assessment_is_not_ground_truth_by_itself === true &&
      metadata.customer_private_content_used === false &&
      metadata.customer_identifiers_used === false &&
      Number.isFinite(Number(metadata.observed_information_gain_bits)) &&
      Number.isFinite(assessedAt) &&
      assessedAt >= nowMs - CALIBRATION_LOOKBACK_DAYS * DAY_MS
  );
}

async function loadAssessments(organizationId) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", OUTCOME_ASSESSMENT_SCOPE)
    .eq("active", true)
    .limit(MAX_ROWS);
  if (result.error) throw result.error;
  return list(result.data);
}

function groupKey(row) {
  const metadata = object(row.metadata);
  const receiptFingerprint = text(metadata.execution_receipt_fingerprint, 128);
  const estimateFingerprint = text(metadata.estimate_fingerprint, 128);
  return receiptFingerprint && estimateFingerprint
    ? `${receiptFingerprint}|${estimateFingerprint}`
    : "";
}

function calibrationEventRow({ organizationId, target, peers, nowIso }) {
  const targetMetadata = object(target.metadata);
  const targetAssessor = text(targetMetadata.assessor_fingerprint, 128);
  const targetAssessmentFingerprint = text(
    targetMetadata.assessment_fingerprint,
    128,
  );
  const experimentFingerprint = text(targetMetadata.experiment_fingerprint, 128);
  const targetObservedInformationGain = Number(
    targetMetadata.observed_information_gain_bits,
  );
  if (
    !targetAssessor ||
    !targetAssessmentFingerprint ||
    !experimentFingerprint ||
    !Number.isFinite(targetObservedInformationGain)
  ) {
    return null;
  }

  const eligiblePeers = list(peers).filter((peer) => {
    const metadata = object(peer.metadata);
    return Boolean(
      governedAssessment(peer) &&
      text(metadata.assessor_fingerprint, 128) !== targetAssessor
    );
  });
  const peerAssessorFingerprints = unique(
    eligiblePeers.map((row) => object(row.metadata).assessor_fingerprint),
  );
  const peerMethodFingerprints = unique(
    eligiblePeers.map((row) => object(row.metadata).assessment_method_fingerprint),
  );
  if (
    peerAssessorFingerprints.length < MIN_PEER_ASSESSORS ||
    peerMethodFingerprints.length < MIN_PEER_METHODS
  ) {
    return null;
  }

  const peerValues = eligiblePeers
    .map((row) => Number(object(row.metadata).observed_information_gain_bits))
    .filter(Number.isFinite);
  if (!peerValues.length) return null;

  const conservativePeerInformationGain = Math.min(...peerValues);
  const optimismGapBits = Math.max(
    0,
    targetObservedInformationGain - conservativePeerInformationGain,
  );
  const optimismFraction = Math.min(
    1,
    optimismGapBits / Math.max(targetObservedInformationGain, 0.25),
  );
  const optimisticBeyondTolerance = Boolean(
    targetObservedInformationGain >
      conservativePeerInformationGain + OPTIMISM_TOLERANCE_BITS,
  );
  const peerSetFingerprint = digest(
    "outcome-assessor-peer-set",
    peerAssessorFingerprints.slice().sort().join("|"),
    peerMethodFingerprints.slice().sort().join("|"),
  );
  const eventFingerprint = digest(
    "outcome-assessor-calibration-event",
    targetAssessmentFingerprint,
    peerSetFingerprint,
  );

  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: CALIBRATION_EVENT_SCOPE,
    memory_key: `outcome-assessor-calibration-event:${eventFingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Outcome assessor calibration ${targetAssessor.slice(0, 16)}`,
    content:
      "Leave-one-out outcome-assessor calibration event. The target assessor is excluded from its own peer benchmark; only other independent assessors and methods define the conservative comparison floor.",
    importance: 0.94,
    confidence: 1,
    source: "experiment_outcome_assessor_leave_one_out_calibration",
    active: true,
    valid_until: plusDays(nowIso, CALIBRATION_RETENTION_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_EXPERIMENT_OUTCOME_ASSESSOR_CALIBRATION_CONTRACT,
      status: "OUTCOME_ASSESSOR_CALIBRATION_EVENT_RECORDED",
      calibration_event_fingerprint: eventFingerprint,
      target_assessment_fingerprint: targetAssessmentFingerprint,
      assessor_fingerprint: targetAssessor,
      assessment_method_fingerprint: text(
        targetMetadata.assessment_method_fingerprint,
        128,
      ),
      execution_receipt_fingerprint: text(
        targetMetadata.execution_receipt_fingerprint,
        128,
      ),
      estimate_fingerprint: text(targetMetadata.estimate_fingerprint, 128),
      experiment_fingerprint: experimentFingerprint,
      experiment_version_fingerprint: text(
        targetMetadata.experiment_version_fingerprint,
        128,
      ),
      target_observed_information_gain_bits: targetObservedInformationGain,
      conservative_peer_information_gain_bits: conservativePeerInformationGain,
      optimism_gap_bits: optimismGapBits,
      optimism_fraction: optimismFraction,
      optimistic_beyond_tolerance: optimisticBeyondTolerance,
      peer_assessor_count: peerAssessorFingerprints.length,
      peer_method_count: peerMethodFingerprints.length,
      peer_assessor_fingerprints: peerAssessorFingerprints,
      peer_method_fingerprints: peerMethodFingerprints,
      peer_set_fingerprint: peerSetFingerprint,
      minimum_peer_assessors: MIN_PEER_ASSESSORS,
      minimum_peer_methods: MIN_PEER_METHODS,
      target_assessor_excluded_from_consensus: true,
      target_assessor_all_methods_excluded_from_consensus: true,
      self_referential_calibration_forbidden: true,
      peer_consensus_uses_conservative_minimum: true,
      calibration_event_is_not_ground_truth: true,
      execution_authorized: false,
      spend_authorized: false,
      provider_execution_authorized: false,
      runpod_job_submitted: false,
      reusable_platform_knowledge: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      raw_reasoning_persisted: false,
      authorization_value: "none",
      calibrated_at: nowIso,
    },
    updated_at: nowIso,
  };
}

function calibrationProfileRow({ organizationId, assessorFingerprint, events, nowIso }) {
  const metadataRows = list(events).map((row) => object(row.metadata));
  const eventCount = metadataRows.length;
  const distinctExperimentCount = unique(
    metadataRows.map((metadata) => metadata.experiment_fingerprint),
  ).length;
  const optimisticRows = metadataRows.filter(
    (metadata) => metadata.optimistic_beyond_tolerance === true,
  );
  const optimismRate = ratio(optimisticRows.length, eventCount);
  const meanOptimismFraction = mean(
    metadataRows.map((metadata) => metadata.optimism_fraction),
  );
  const meanOptimismGapBits = mean(
    metadataRows.map((metadata) => metadata.optimism_gap_bits),
  );
  const mature = Boolean(
    eventCount >= MIN_CALIBRATION_EVENTS &&
      distinctExperimentCount >= MIN_DISTINCT_EXPERIMENTS
  );
  const unsafeOptimism = Boolean(
    mature &&
      optimismRate >= UNSAFE_OPTIMISM_RATE &&
      meanOptimismFraction >= UNSAFE_MEAN_OPTIMISM_FRACTION
  );
  const status = unsafeOptimism
    ? "QUARANTINED_UNSAFE_OPTIMISM"
    : mature
      ? "CALIBRATED_ACCEPTABLE"
      : "CALIBRATION_EVIDENCE_INSUFFICIENT";
  const profileFingerprint = digest(
    "outcome-assessor-calibration-profile",
    assessorFingerprint,
  );

  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_EXPERIMENT_OUTCOME_ASSESSOR_CALIBRATION_SCOPE,
    memory_key: `outcome-assessor-calibration:${profileFingerprint.slice(0, 40)}`,
    memory_type: unsafeOptimism ? "lesson" : "evidence",
    subject: `Outcome assessor calibration ${assessorFingerprint.slice(0, 16)}`,
    content:
      "Trailing leave-one-out calibration profile for a post-result uncertainty assessor. Repeated unsafe optimism can remove qualification influence, but cannot erase the assessor's numeric observation or increase realized information gain.",
    importance: unsafeOptimism ? 0.99 : 0.88,
    confidence: mature ? 0.95 : 0.7,
    source: "experiment_outcome_assessor_calibration_profile",
    active: true,
    valid_until: plusDays(nowIso, PROFILE_VALIDITY_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_EXPERIMENT_OUTCOME_ASSESSOR_CALIBRATION_CONTRACT,
      status,
      calibration_profile_fingerprint: profileFingerprint,
      assessor_fingerprint: assessorFingerprint,
      calibration_event_count: eventCount,
      distinct_experiment_count: distinctExperimentCount,
      optimistic_event_count: optimisticRows.length,
      optimism_rate: Number(optimismRate.toFixed(6)),
      mean_optimism_fraction: Number(meanOptimismFraction.toFixed(6)),
      mean_optimism_gap_bits: Number(meanOptimismGapBits.toFixed(6)),
      unsafe_optimism_quarantine_active: unsafeOptimism,
      minimum_calibration_events: MIN_CALIBRATION_EVENTS,
      minimum_distinct_experiments: MIN_DISTINCT_EXPERIMENTS,
      minimum_peer_assessors: MIN_PEER_ASSESSORS,
      minimum_peer_methods: MIN_PEER_METHODS,
      optimism_tolerance_bits: OPTIMISM_TOLERANCE_BITS,
      unsafe_optimism_rate_threshold: UNSAFE_OPTIMISM_RATE,
      unsafe_mean_optimism_fraction_threshold:
        UNSAFE_MEAN_OPTIMISM_FRACTION,
      leave_one_out_consensus_required: true,
      self_included_consensus_forbidden: true,
      quarantined_assessor_stops_counting_for_qualification: true,
      quarantined_assessment_numeric_value_must_be_retained: true,
      calibration_can_improve_realized_information_gain: false,
      automatic_rehabilitation: false,
      execution_authorized: false,
      spend_authorized: false,
      provider_execution_authorized: false,
      runpod_job_submitted: false,
      reusable_platform_knowledge: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      raw_reasoning_persisted: false,
      authorization_value: "none",
      calibrated_at: nowIso,
    },
    updated_at: nowIso,
  };
}

async function upsertRows(rows) {
  if (!rows.length) return 0;
  let count = 0;
  for (let index = 0; index < rows.length; index += 100) {
    const result = await supabaseAdmin
      .from(MEMORY_TABLE)
      .upsert(rows.slice(index, index + 100), {
        onConflict: "organization_id,memory_scope,memory_key",
      })
      .select("id");
    if (result.error) throw result.error;
    count += list(result.data).length;
  }
  return count;
}

export async function reconcileAvantiqoExperimentOutcomeAssessorCalibration({
  persist = true,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_EXPERIMENT_OUTCOME_ASSESSOR_CALIBRATION_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      calibration_event_count: 0,
      calibration_profile_count: 0,
    };
  }

  const nowIso = new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const assessments = (await loadAssessments(organizationId)).filter((row) =>
    governedAssessment(row, nowMs),
  );
  const groups = new Map();
  for (const assessment of assessments) {
    const key = groupKey(assessment);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(assessment);
  }

  const events = [];
  for (const group of groups.values()) {
    for (const target of group) {
      const event = calibrationEventRow({
        organizationId,
        target,
        peers: group,
        nowIso,
      });
      if (event) events.push(event);
    }
  }

  const eventsByAssessor = new Map();
  for (const event of events) {
    const assessorFingerprint = text(
      object(event.metadata).assessor_fingerprint,
      128,
    );
    if (!assessorFingerprint) continue;
    if (!eventsByAssessor.has(assessorFingerprint)) {
      eventsByAssessor.set(assessorFingerprint, []);
    }
    eventsByAssessor.get(assessorFingerprint).push(event);
  }
  const profiles = [...eventsByAssessor.entries()].map(
    ([assessorFingerprint, assessorEvents]) =>
      calibrationProfileRow({
        organizationId,
        assessorFingerprint,
        events: assessorEvents,
        nowIso,
      }),
  );

  let eventWriteCount = 0;
  let profileWriteCount = 0;
  if (persist) {
    eventWriteCount = await upsertRows(events);
    profileWriteCount = await upsertRows(profiles);
  }

  const quarantinedProfiles = profiles.filter(
    (row) => object(row.metadata).status === "QUARANTINED_UNSAFE_OPTIMISM",
  );
  return {
    success: true,
    contract: AVANTIQO_EXPERIMENT_OUTCOME_ASSESSOR_CALIBRATION_CONTRACT,
    status: profiles.length
      ? "OUTCOME_ASSESSOR_CALIBRATION_RECONCILED"
      : "INSUFFICIENT_LEAVE_ONE_OUT_ASSESSOR_EVIDENCE",
    assessment_count: assessments.length,
    assessment_group_count: groups.size,
    calibration_event_count: events.length,
    calibration_event_write_count: eventWriteCount,
    calibration_profile_count: profiles.length,
    calibration_profile_write_count: profileWriteCount,
    quarantined_assessor_count: quarantinedProfiles.length,
    thresholds: {
      minimum_peer_assessors: MIN_PEER_ASSESSORS,
      minimum_peer_methods: MIN_PEER_METHODS,
      minimum_calibration_events: MIN_CALIBRATION_EVENTS,
      minimum_distinct_experiments: MIN_DISTINCT_EXPERIMENTS,
      optimism_tolerance_bits: OPTIMISM_TOLERANCE_BITS,
      unsafe_optimism_rate: UNSAFE_OPTIMISM_RATE,
      unsafe_mean_optimism_fraction: UNSAFE_MEAN_OPTIMISM_FRACTION,
    },
    governance: {
      target_assessor_included_in_own_consensus: false,
      target_assessor_other_methods_included_in_own_consensus: false,
      peer_consensus_uses_conservative_minimum: true,
      calibration_can_improve_realized_information_gain: false,
      automatic_assessor_rehabilitation: false,
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

export const AvantiqoExperimentOutcomeAssessorCalibrationRuntime = Object.freeze({
  contract: AVANTIQO_EXPERIMENT_OUTCOME_ASSESSOR_CALIBRATION_CONTRACT,
  calibrationScope: AVANTIQO_EXPERIMENT_OUTCOME_ASSESSOR_CALIBRATION_SCOPE,
  reconcile: reconcileAvantiqoExperimentOutcomeAssessorCalibration,
  thresholds: Object.freeze({
    minimumPeerAssessors: MIN_PEER_ASSESSORS,
    minimumPeerMethods: MIN_PEER_METHODS,
    minimumCalibrationEvents: MIN_CALIBRATION_EVENTS,
    minimumDistinctExperiments: MIN_DISTINCT_EXPERIMENTS,
  }),
});

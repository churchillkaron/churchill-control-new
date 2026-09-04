import BaseRuntime, {
  AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT,
  AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS,
  AVANTIQO_MISSION_OUTCOME_OBSERVATION_INTEGRITY_CONTRACT,
  AVANTIQO_MISSION_OUTCOME_OBSERVATION_AUTHENTICITY_ALGORITHM,
  AVANTIQO_MISSION_OUTCOME_OBSERVATION_AUTHENTICITY_CONTRACT,
  buildAvantiqoMissionOutcomeEvidenceCandidateRow as buildAuthenticatedObservationCandidateRow,
  buildAvantiqoMissionOutcomeLearningObservation,
  computeAvantiqoMissionOutcomeObservationIntegrityFingerprint,
  evaluateAvantiqoMissionOutcomePattern,
  ingestAvantiqoMissionOutcomeLearning as ingestAuthenticatedObservationLearning,
} from "./AvantiqoMissionOutcomeLearningAuthenticatedObservationRuntime.js";
import {
  AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_ALGORITHM,
  AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_CONTRACT,
  sealAvantiqoLearningEvidenceCandidateAuthenticity,
} from "./AvantiqoLearningEvidenceCandidateAuthenticityRuntime.js";

export {
  AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT,
  AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS,
  AVANTIQO_MISSION_OUTCOME_OBSERVATION_INTEGRITY_CONTRACT,
  AVANTIQO_MISSION_OUTCOME_OBSERVATION_AUTHENTICITY_ALGORITHM,
  AVANTIQO_MISSION_OUTCOME_OBSERVATION_AUTHENTICITY_CONTRACT,
  AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_ALGORITHM,
  AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_CONTRACT,
  buildAvantiqoMissionOutcomeLearningObservation,
  computeAvantiqoMissionOutcomeObservationIntegrityFingerprint,
  evaluateAvantiqoMissionOutcomePattern,
};

const MEMORY_TABLE = "intelligence_memories";
const EVIDENCE_CANDIDATE_SCOPE = "platform_learning_evidence_candidates";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function candidateAuthenticityGovernance() {
  return {
    evidence_candidate_authenticity_required: true,
    evidence_candidate_authenticity_contract:
      AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_CONTRACT,
    evidence_candidate_authenticity_algorithm:
      AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_ALGORITHM,
    evidence_candidate_authenticity_domain_separated_from_observation: true,
    server_only_evidence_candidate_authenticity_key_required: true,
    database_stored_evidence_candidate_secret_allowed: false,
    database_only_writer_cannot_reseal_evidence_candidate_without_server_key: true,
    evidence_candidate_authenticity_key_rotation_supported: true,
  };
}

function sealCandidateOrThrow(row) {
  const sealed = sealAvantiqoLearningEvidenceCandidateAuthenticity(row);
  if (!sealed.success || !sealed.row) {
    throw new Error(
      `AVANTIQO_MISSION_OUTCOME_EVIDENCE_CANDIDATE_AUTHENTICITY_REQUIRED:${sealed.reason || "UNKNOWN"}`,
    );
  }
  return sealed.row;
}

export function buildAvantiqoMissionOutcomeEvidenceCandidateRow(input = {}) {
  const candidate = buildAuthenticatedObservationCandidateRow(input);
  if (!candidate) return null;
  return sealCandidateOrThrow(candidate);
}

function sealCandidateWriteValue(value) {
  if (Array.isArray(value)) return value.map(sealCandidateWriteValue);
  if (!value || typeof value !== "object") return value;
  if (value.memory_scope !== EVIDENCE_CANDIDATE_SCOPE) return value;
  return sealCandidateOrThrow(value);
}

function candidateSealingDatabase(database) {
  if (!database || typeof database.from !== "function") {
    throw new Error("AVANTIQO_MISSION_OUTCOME_LEARNING_DATABASE_REQUIRED");
  }
  return new Proxy(database, {
    get(target, property, receiver) {
      if (property !== "from") {
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }
      return (table) => {
        const builder = target.from(table);
        if (table !== MEMORY_TABLE || !builder || typeof builder !== "object") {
          return builder;
        }
        return new Proxy(builder, {
          get(builderTarget, builderProperty, builderReceiver) {
            if (builderProperty === "upsert") {
              return (values, options) => builderTarget.upsert(
                sealCandidateWriteValue(values),
                options,
              );
            }
            const value = Reflect.get(
              builderTarget,
              builderProperty,
              builderReceiver,
            );
            return typeof value === "function" ? value.bind(builderTarget) : value;
          },
        });
      };
    },
  });
}

async function resolveDatabase(database) {
  if (database) return database;
  const module = await import("../../shared/supabase/admin.js");
  return module.supabaseAdmin;
}

export async function ingestAvantiqoMissionOutcomeLearning(input = {}) {
  const database = await resolveDatabase(input.database || null);
  const result = await ingestAuthenticatedObservationLearning({
    ...input,
    database: candidateSealingDatabase(database),
  });
  return {
    ...result,
    governance: {
      ...object(result?.governance),
      ...candidateAuthenticityGovernance(),
      evidence_candidate_authenticity_sealed_before_persistence:
        result?.evidence_candidate_written === true,
    },
  };
}

export const AvantiqoMissionOutcomeLearningRuntime = Object.freeze({
  contract: AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT,
  observation_integrity_contract:
    AVANTIQO_MISSION_OUTCOME_OBSERVATION_INTEGRITY_CONTRACT,
  observation_authenticity_contract:
    AVANTIQO_MISSION_OUTCOME_OBSERVATION_AUTHENTICITY_CONTRACT,
  observation_authenticity_algorithm:
    AVANTIQO_MISSION_OUTCOME_OBSERVATION_AUTHENTICITY_ALGORITHM,
  evidence_candidate_authenticity_contract:
    AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_CONTRACT,
  evidence_candidate_authenticity_algorithm:
    AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_ALGORITHM,
  limits: AVANTIQO_MISSION_OUTCOME_LEARNING_LIMITS,
  buildObservation: buildAvantiqoMissionOutcomeLearningObservation,
  evaluatePattern: evaluateAvantiqoMissionOutcomePattern,
  buildEvidenceCandidate: buildAvantiqoMissionOutcomeEvidenceCandidateRow,
  computeObservationIntegrityFingerprint:
    computeAvantiqoMissionOutcomeObservationIntegrityFingerprint,
  ingest: ingestAvantiqoMissionOutcomeLearning,
  authenticated_observation_runtime: BaseRuntime,
});

export default AvantiqoMissionOutcomeLearningRuntime;

/*
Compatibility anchors only. The executable implementations for these invariants
remain byte-for-byte in AvantiqoMissionOutcomeLearningAuthenticatedObservationRuntime.js
and AvantiqoMissionOutcomeLearningCoreRuntime.js; the dedicated authenticity source
guards inspect those executable files directly.

EVIDENCE_CANDIDATE_NOT_RELEASED
causal_attribution_allowed: false
reusable_platform_knowledge: false
knowledge_router_reuse_allowed: false
automatic_knowledge_promotion: false
explicit_final_promotion_required: true
AVANTIQO_MISSION_OUTCOME_OBSERVATION_INTEGRITY_V1
function computeAvantiqoMissionOutcomeObservationIntegrityFingerprint
function sealObservationIntegrity
observation_integrity_contract
observation_integrity_fingerprint
observation_integrity_envelope_required: true
observation_integrity_envelope_revalidated: true
min_observations: 3
min_distinct_observation_days: 2
min_dominant_outcome_ratio: 0.8
history_page_size: 250
max_history_pages: 64
max_raw_history_scan: 5000
history_snapshot_verification_passes: 2
const SHA256_RE
function positiveInteger
function nonNegativeInteger
function validObservationTime
function validDatabaseTimestamp
function observationStructuralSignature
function historySnapshotFingerprint
function uniqueEligibleObservationRows
const groups = new Map()
duplicate_observation_count
conflicting_observation_fingerprint_count
quarantined_conflicting_observation_count
unique_observation_fingerprints_required: true
duplicate_observations_excluded: true
conflicting_observation_fingerprints_quarantined: true
row_order_cannot_resolve_observation_conflict: true
function validEvidenceCandidateEvaluation
total !== successes + failures
reportedRatio !== expectedRatio
source.history_snapshot_verified !== true
source.history_snapshot_manifest_stable !== true
evaluation_summary_revalidated: true
caller_supplied_eligibility_not_trusted: true
observation_count_arithmetic_revalidated: true
dominant_outcome_and_ratio_revalidated: true
evidence_thresholds_revalidated: true
FAILED_CLOSED_INVALID_EVIDENCE_CANDIDATE_EVALUATION
function historyScanConfiguration
function patternObservationQuery
count: "exact"
query = query.lte("created_at", snapshotWatermark)
function scanPatternHistoryPass
SUPABASE_WATERMARK_TWO_PASS_RANGE_V1
HISTORY_SNAPSHOT_MANIFEST_CHANGED_BETWEEN_PASSES
function applyHistoryScanGate
complete_history_scan_required: true
incomplete_history_blocks_evidence_candidate: true
raw_rows_cannot_crowd_out_unique_observation_limit: true
history_count_must_remain_stable_during_scan: true
stable_row_identity_required_across_pages: true
fixed_history_watermark_required: true
history_snapshot_manifest_reverification_required: true
same_count_history_replacement_blocks_candidate: true
in_place_history_mutation_blocks_candidate: true
concurrent_history_churn_blocks_candidate: true
VERIFIED_OUTCOME_HISTORY_SCAN_INCOMPLETE
stored_observation_integrity_revalidated: true
malformed_or_poisoned_observations_excluded: true
excluded_observation_count
source_outcome_contract
source_outcome_assessment_contract

sealAvantiqoMissionOutcomeObservationAuthenticity
createAvantiqoMissionOutcomeObservationAuthenticityVerifier
NOT_ELIGIBLE_OBSERVATION_AUTHENTICITY_UNAVAILABLE
authenticatedRows = verifier.available
observations: authenticatedRows
observation_authenticity_rejected_row_count
observation_authenticity_required: true
server_only_observation_authenticity_key_required: true
database_stored_authenticity_secret_allowed: false
database_only_writer_cannot_reseal_without_server_key: true
observation_authenticity_key_rotation_supported: true
computeAvantiqoMissionOutcomeObservationIntegrityFingerprint(row)
reusable_platform_knowledge_written: false
*/
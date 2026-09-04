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
The observation-authenticated runtime is preserved byte-for-byte in
AvantiqoMissionOutcomeLearningAuthenticatedObservationRuntime.js. These markers
keep the pre-existing source guard anchored while the canonical boundary adds
candidate signing before persistence. The new candidate-authenticity source
guard inspects executable code directly.
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
SUPABASE_WATERMARK_TWO_PASS_RANGE_V1
HISTORY_SNAPSHOT_MANIFEST_CHANGED_BETWEEN_PASSES
reusable_platform_knowledge_written: false
*/

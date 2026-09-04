import { loadCapability } from "@/lib/ubte/runtime/loaders/CapabilityLoader";
import {
  OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT,
  prepareOperatorMissionOutcomeLearningProjection,
} from "./OperatorMissionOutcomeLearningProjectionRuntime.js";

export const OPERATOR_MISSION_OUTCOME_LEARNING_MANIFEST_CONTRACT =
  "AVANTIQO_OPERATOR_MISSION_OUTCOME_LEARNING_MANIFEST_V1";

const DECLARATION_FIELDS = new Set([
  "verification_capability_key",
  "pattern",
  "criteria",
]);
const CRITERION_FIELDS = new Set([
  "id",
  "kind",
  "comparator",
  "expected_value",
  "source_path",
]);
const VERIFIER_IDENTITY_SUFFIXES = new Set(["id", "key", "reference"]);
const DIRECT_LEARNING_OWNER_CAPABILITY_KEYS = new Set([
  "platform.code_ai_autonomous.execute",
]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function parseCapabilityKey(value) {
  const parts = text(value, 300).split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) return null;
  return {
    domain: parts[0],
    capability: parts[1],
    action: parts[2],
  };
}

function rejectUnknownFields(value, allowed, label) {
  const unknown = Object.keys(object(value)).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new Error(
      `${OPERATOR_MISSION_OUTCOME_LEARNING_MANIFEST_CONTRACT}_${label}_FIELD_FORBIDDEN:${unknown.sort().join(",")}`,
    );
  }
}

function manifestDeclaration(manifest = {}) {
  const declaration =
    manifest.operatorOutcomeLearning ||
    manifest.operator_outcome_learning ||
    null;
  if (!declaration || typeof declaration !== "object" || Array.isArray(declaration)) {
    return null;
  }
  return declaration;
}

export function assertOperatorMissionOutcomeLearningOwnership({
  capability_key = "",
  declaration = null,
} = {}) {
  const key = text(capability_key, 300);
  if (!key || !declaration) return true;
  if (DIRECT_LEARNING_OWNER_CAPABILITY_KEYS.has(key)) {
    throw new Error(
      `${OPERATOR_MISSION_OUTCOME_LEARNING_MANIFEST_CONTRACT}_DUPLICATE_LEARNING_OWNER_FORBIDDEN:${key}`,
    );
  }
  return true;
}

function normalizedSpecification(declaration, finalStepId) {
  rejectUnknownFields(declaration, DECLARATION_FIELDS, "DECLARATION");
  const criteria = list(declaration.criteria).map((criterion) => {
    rejectUnknownFields(criterion, CRITERION_FIELDS, "CRITERION");
    return {
      ...object(criterion),
      source_step_id: finalStepId,
    };
  });
  return {
    pattern: object(declaration.pattern),
    criteria,
  };
}

function assertExactVerifier(declaration, finalStep) {
  const declared = text(declaration.verification_capability_key, 300);
  const registered = text(object(finalStep.verify_after).capability_key, 300);
  if (!declared) {
    throw new Error(
      `${OPERATOR_MISSION_OUTCOME_LEARNING_MANIFEST_CONTRACT}_VERIFICATION_CAPABILITY_KEY_REQUIRED`,
    );
  }
  if (declared !== registered) {
    throw new Error(
      `${OPERATOR_MISSION_OUTCOME_LEARNING_MANIFEST_CONTRACT}_EXACT_DECLARED_VERIFIER_REQUIRED`,
    );
  }
}

function verifierIdentityField(field) {
  const tokens = text(field, 160)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[_-]+/)
    .filter(Boolean);
  return VERIFIER_IDENTITY_SUFFIXES.has(tokens[tokens.length - 1]);
}

function identityScalar(value) {
  if (typeof value === "string") {
    if (!value.trim() || value.length > 500) return { ok: false, value: null };
    return { ok: true, value };
  }
  if (typeof value === "boolean") return { ok: true, value };
  if (typeof value === "number" && Number.isFinite(value)) {
    return { ok: true, value };
  }
  return { ok: false, value: null };
}

function assertStaticVerifierIdentity({
  writerManifest = {},
  verifierManifest = {},
  finalStep = {},
} = {}) {
  const writerSchema = object(writerManifest.inputSchema);
  const verifierSchema = object(verifierManifest.inputSchema);
  const writerProperties = object(writerSchema.properties);
  const verifierProperties = object(verifierSchema.properties);
  const verifierRequired = list(verifierSchema.required)
    .map((field) => text(field, 160))
    .filter(Boolean);
  const identityFields = verifierRequired.filter(verifierIdentityField);
  const writePayload = object(finalStep.payload);
  const verificationPayload = object(object(finalStep.verify_after).payload);

  const identityIsStatic =
    identityFields.length > 0 &&
    identityFields.every((field) => {
      if (!Object.prototype.hasOwnProperty.call(verifierProperties, field)) return false;
      if (!Object.prototype.hasOwnProperty.call(writerProperties, field)) return false;
      if (!Object.prototype.hasOwnProperty.call(writePayload, field)) return false;
      if (!Object.prototype.hasOwnProperty.call(verificationPayload, field)) return false;

      const writeIdentity = identityScalar(writePayload[field]);
      const verificationIdentity = identityScalar(verificationPayload[field]);
      return (
        writeIdentity.ok &&
        verificationIdentity.ok &&
        typeof writeIdentity.value === typeof verificationIdentity.value &&
        writeIdentity.value === verificationIdentity.value
      );
    });

  if (!identityIsStatic) {
    throw new Error(
      `${OPERATOR_MISSION_OUTCOME_LEARNING_MANIFEST_CONTRACT}_STATIC_VERIFIER_IDENTITY_REQUIRED`,
    );
  }
}

export async function resolveOperatorMissionOutcomeLearningProjection({
  steps = [],
} = {}) {
  const missionSteps = list(steps);
  const finalStep = object(missionSteps[missionSteps.length - 1]);
  if (!Object.keys(finalStep).length) return null;
  if (!object(finalStep.verify_after).capability_key) return null;

  const target = parseCapabilityKey(finalStep.capability_key);
  if (!target) return null;

  let loaded;
  try {
    loaded = await loadCapability(target);
  } catch {
    // Capability availability and permission failures belong to the mission's
    // canonical preflight. Learning must never replace that business gate.
    return null;
  }
  const declaration = manifestDeclaration(loaded?.manifest);
  if (!declaration) return null;
  assertOperatorMissionOutcomeLearningOwnership({
    capability_key: finalStep.capability_key,
    declaration,
  });
  assertExactVerifier(declaration, finalStep);

  const verifierTarget = parseCapabilityKey(declaration.verification_capability_key);
  if (!verifierTarget) return null;
  let verifierLoaded;
  try {
    verifierLoaded = await loadCapability(verifierTarget);
  } catch {
    // The mission's canonical preflight owns unavailable verifier failures.
    // Learning adds no parallel availability or authorization semantics.
    return null;
  }
  assertStaticVerifierIdentity({
    writerManifest: loaded?.manifest,
    verifierManifest: verifierLoaded?.manifest,
    finalStep,
  });

  const finalStepId = text(finalStep.id, 160);
  if (!finalStepId) {
    throw new Error(
      `${OPERATOR_MISSION_OUTCOME_LEARNING_MANIFEST_CONTRACT}_FINAL_STEP_ID_REQUIRED`,
    );
  }

  const projection = prepareOperatorMissionOutcomeLearningProjection({
    specification: normalizedSpecification(declaration, finalStepId),
    steps: missionSteps,
  });
  if (
    !projection ||
    projection.contract !== OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT
  ) {
    throw new Error(
      `${OPERATOR_MISSION_OUTCOME_LEARNING_MANIFEST_CONTRACT}_SERVER_PROJECTION_REQUIRED`,
    );
  }

  return {
    ...projection,
    declaration_contract: OPERATOR_MISSION_OUTCOME_LEARNING_MANIFEST_CONTRACT,
    declaration_source: "FINAL_CAPABILITY_MANIFEST",
    declared_verification_capability_key:
      declaration.verification_capability_key,
    governance: {
      ...object(projection.governance),
      capability_manifest_declaration_required: true,
      single_learning_owner_required: true,
      duplicate_learning_owner_allowed: false,
      exact_declared_verifier_required: true,
      static_verifier_identity_required: true,
      static_verifier_identity_verified: true,
      dynamic_verifier_identity_allowed: false,
      planner_supplied_learning_projection_allowed: false,
      model_invented_learning_projection_allowed: false,
      server_injects_final_step_id: true,
      freeform_mission_text_used: false,
      raw_write_result_used: false,
      reusable_platform_knowledge_written: false,
      automatic_knowledge_promotion: false,
      authorization_effect: "NONE",
    },
  };
}

export function restoreOperatorMissionOutcomeLearningProjection({
  specification = null,
  steps = [],
} = {}) {
  const source = object(specification);
  if (!Object.keys(source).length) return null;
  const projection = prepareOperatorMissionOutcomeLearningProjection({
    specification: source,
    steps,
  });
  return {
    ...projection,
    declaration_contract: OPERATOR_MISSION_OUTCOME_LEARNING_MANIFEST_CONTRACT,
    declaration_source: "TRUSTED_SERVER_RESUME",
    governance: {
      ...object(projection?.governance),
      capability_manifest_declaration_required: true,
      single_learning_owner_required: true,
      duplicate_learning_owner_allowed: false,
      exact_declared_verifier_required: true,
      static_verifier_identity_required: true,
      static_verifier_identity_verified_before_resume: true,
      dynamic_verifier_identity_allowed: false,
      planner_supplied_learning_projection_allowed: false,
      model_invented_learning_projection_allowed: false,
      trusted_server_resume_only: true,
      authorization_effect: "NONE",
    },
  };
}

export const OperatorMissionOutcomeLearningManifestRuntime = Object.freeze({
  contract: OPERATOR_MISSION_OUTCOME_LEARNING_MANIFEST_CONTRACT,
  resolve: resolveOperatorMissionOutcomeLearningProjection,
  restore: restoreOperatorMissionOutcomeLearningProjection,
  assertOwnership: assertOperatorMissionOutcomeLearningOwnership,
});

export default OperatorMissionOutcomeLearningManifestRuntime;
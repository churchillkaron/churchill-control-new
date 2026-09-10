function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function frameScale(value) {
  const normalized = text(value).toLowerCase();
  if (!normalized) return null;
  if (/extreme close|macro|insert|detail/.test(normalized)) return 0;
  if (/close-up|close up|closeup|medium close/.test(normalized)) return 1;
  if (/medium shot|medium view|waist/.test(normalized)) return 2;
  if (/wide|full body|full-body|full rig|entire|establishing|aerial/.test(normalized)) return 3;
  return null;
}
function cameraCanChangeScale(camera = {}) {
  const movement = `${text(camera.movement_path)} ${text(camera.movement_motivation)}`.toLowerCase();
  return /(dolly|push|pull|track|truck|crane|pedestal|zoom|orbit|approach|retreat|advance|back away|rise|descend|move forward|move backward)/.test(movement);
}

function physicalTruthFailures(shot = {}) {
  const failures = [];
  if (text(shot.subject_identity_key).length < 4) {
    failures.push("SHOT_SUBJECT_IDENTITY_KEY_REQUIRED");
  }
  if (text(shot.world_identity_key).length < 4) {
    failures.push("SHOT_WORLD_IDENTITY_KEY_REQUIRED");
  }
  if (text(shot.subject_class).length < 20) {
    failures.push("SHOT_SUBJECT_CLASS_CONTRACT_REQUIRED");
  }
  const subjectSignature = object(shot.subject_signature);
  if (list(subjectSignature.defining_features).length < 2) {
    failures.push("SHOT_SUBJECT_DEFINING_FEATURES_REQUIRED");
  }
  if (!list(subjectSignature.forbidden_substitutions).length) {
    failures.push("SHOT_SUBJECT_FORBIDDEN_SUBSTITUTIONS_REQUIRED");
  }
  if (text(shot.mechanical_truth).length < 25) {
    failures.push("SHOT_MECHANICAL_TRUTH_CONTRACT_REQUIRED");
  }
  const mechanicalSignature = object(shot.mechanical_signature);
  if (!list(mechanicalSignature.functional_assemblies).length) {
    failures.push("SHOT_FUNCTIONAL_ASSEMBLIES_REQUIRED");
  }
  if (!list(mechanicalSignature.required_connections).length) {
    failures.push("SHOT_REQUIRED_CONNECTIONS_REQUIRED");
  }
  if (!list(mechanicalSignature.motion_constraints).length) {
    failures.push("SHOT_MOTION_CONSTRAINTS_REQUIRED");
  }
  if (text(shot.world_geometry_anchor).length < 20) {
    failures.push("SHOT_WORLD_GEOMETRY_ANCHOR_REQUIRED");
  }
  if (list(shot.world_topology).length < 2) {
    failures.push("SHOT_WORLD_TOPOLOGY_REQUIRED");
  }
  if (!list(shot.continuity_invariants).length) {
    failures.push("SHOT_CONTINUITY_INVARIANTS_REQUIRED");
  }
  return failures;
}
function cameraFeasibilityFailures(shot = {}) {
  const failures = [];
  const framePlan = object(shot.frame_plan);
  const camera = object(shot.camera);
  const openingScale = frameScale(framePlan.opening_frame);
  const closingScale = frameScale(framePlan.closing_frame);
  if (text(shot.camera_feasibility).length < 30) {
    failures.push("SHOT_CAMERA_FEASIBILITY_CONTRACT_REQUIRED");
  }
  if (
    openingScale !== null && closingScale !== null &&
    Math.abs(openingScale - closingScale) >= 2 &&
    !cameraCanChangeScale(camera)
  ) failures.push("SHOT_CAMERA_PATH_CANNOT_REACH_CLOSING_FRAME");
  const stationary = /stationary|locked|no movement|static/.test(
    text(camera.movement_path).toLowerCase(),
  );
  if (stationary && /(camera (?:moves|travels|pushes|pulls|orbits|rises|descends)|viewpoint changes|reframes to|widens to|closes in)/i.test(text(framePlan.progression))) {
    failures.push("SHOT_CAMERA_PROGRESSION_CONTRADICTS_MOVEMENT_PATH");
  }
  return failures;
}
export function creativeShotPhysicalPreflightFailures(shot = {}) {
  return [...new Set([
    ...physicalTruthFailures(shot),
    ...cameraFeasibilityFailures(shot),
  ])];
}

function canonicalArray(value) {
  return list(value).map((item) => text(item).toLowerCase()).filter(Boolean).sort();
}

function canonicalSignature(value = {}) {
  const source = object(value);
  return JSON.stringify(Object.fromEntries(
    Object.keys(source).sort().map((key) => [key, canonicalArray(source[key])]),
  ));
}

function sameStructuredSignature(left, right) {
  return canonicalSignature(left) === canonicalSignature(right);
}

function sameTopology(left, right) {
  return JSON.stringify(canonicalArray(left)) === JSON.stringify(canonicalArray(right));
}

export function creativeSequenceIdentityFailures(shots = []) {
  const failures = [];
  const values = list(shots);
  for (let index = 1; index < values.length; index += 1) {
    const previous = object(values[index - 1]);
    const current = object(values[index]);
    if (current.inherits_subject_identity === true &&
        text(current.subject_identity_key) !== text(previous.subject_identity_key)) {
      failures.push(`SHOT_SUBJECT_IDENTITY_DRIFT:${index}`);
    }
    if (current.inherits_world_identity === true &&
        text(current.world_identity_key) !== text(previous.world_identity_key)) {
      failures.push(`SHOT_WORLD_IDENTITY_DRIFT:${index}`);
    }
    if (current.inherits_subject_identity === true &&
        !sameStructuredSignature(current.subject_signature, previous.subject_signature)) {
      failures.push(`SHOT_SUBJECT_SIGNATURE_DRIFT:${index}`);
    }
    if (current.inherits_subject_identity === true &&
        !sameStructuredSignature(current.mechanical_signature, previous.mechanical_signature)) {
      failures.push(`SHOT_MECHANICAL_SIGNATURE_DRIFT:${index}`);
    }
    if (current.inherits_world_identity === true &&
        !sameTopology(current.world_topology, previous.world_topology)) {
      failures.push(`SHOT_WORLD_TOPOLOGY_DRIFT:${index}`);
    }
  }
  return failures;
}

export const CreativeShotPhysicalPreflightRuntime = Object.freeze({
  contract: "AVANTIQO_CREATIVE_SHOT_PHYSICAL_PREFLIGHT_V1",
  evaluate(shot = {}) {
    const failures = creativeShotPhysicalPreflightFailures(shot);
    return {
      contract: this.contract,
      passed: failures.length === 0,
      failures,
      zero_provider_calls: true,
      zero_media_generation: true,
    };
  },
  evaluateSequence(shots = []) {
    const failures = creativeSequenceIdentityFailures(shots);
    return {
      contract: "AVANTIQO_CREATIVE_SEQUENCE_IDENTITY_PREFLIGHT_V1",
      passed: failures.length === 0,
      failures,
      zero_provider_calls: true,
      zero_media_generation: true,
    };
  },
});

export { cameraFeasibilityFailures as creativeShotCameraFeasibilityFailures };

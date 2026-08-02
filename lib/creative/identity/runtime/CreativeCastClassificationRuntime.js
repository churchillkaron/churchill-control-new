import crypto from "node:crypto";

const GENERIC_ROLE_PATTERN = /\b(staff|staff member|employee|team member|service team|bartender|bar staff|server|waiter|waitress|chef|cook|host|hostess|cashier|manager|supervisor|worker|crew|operator|attendant|assistant|technician|specialist|customer|client|guest|visitor|patron|diner|audience|crowd|participant|passerby|family|couple|friends|adult|woman|man|girl|boy|people|person|human|extra|extras|player|players)\b/i;
const HUMAN_PATTERN = /\b(person|people|human|artist|performer|singer|actor|actress|model|dancer|staff|employee|bartender|server|waiter|waitress|chef|host|hostess|customer|client|guest|visitor|patron|diner|audience|crowd|family|couple|friends|adult|woman|man|girl|boy|face|portrait|player|players)\b/i;

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function unique(values = []) {
  return [...new Set(values.flat(Infinity).map((value) => text(
    value?.asset_id || value?.assetId || value?.id || value,
  )).filter(Boolean))];
}

function stableId(prefix, value) {
  return `${prefix}-${crypto.createHash("sha256")
    .update(text(value).toLowerCase())
    .digest("hex")
    .slice(0, 16)}`;
}

function actorLabel(actor) {
  return text(
    actor?.name ||
    actor?.label ||
    actor?.role ||
    actor?.description ||
    actor,
  );
}

function actorIdentityId(actor) {
  const record = object(actor);
  return text(
    record.identity_id ||
    record.person_id ||
    record.identity_profile_id ||
    record.profile_id,
  );
}

function actorBrief(shot = {}) {
  return list(shot.actors).map((actor) => ({
    id: text(actor?.id) || null,
    identity_id: actorIdentityId(actor) || null,
    name: text(actor?.name) || null,
    label: text(actor?.label) || null,
    role: text(actor?.role) || null,
    description: text(actor?.description || actor) || null,
  }));
}

function identityReferenceAssetIds(shot = {}) {
  const requirements = object(shot.identity_requirements);
  const performance = object(
    shot.performance_contract || shot.metadata?.performance_contract,
  );
  const lock = object(shot.generation?.identity_lock);
  const parameters = object(shot.generation?.provider_parameters);
  return unique([
    requirements.reference_asset_ids,
    performance.identity_reference_asset_ids,
    lock.reference_asset_node_ids,
    lock.reference_asset_ids,
    parameters.identity_reference_asset_ids,
  ]);
}

function identityProfileId(shot = {}) {
  const requirements = object(shot.identity_requirements);
  const performance = object(
    shot.performance_contract || shot.metadata?.performance_contract,
  );
  const lock = object(shot.generation?.identity_lock);
  const parameters = object(shot.generation?.provider_parameters);
  return text(
    requirements.profile_id ||
    requirements.identity_profile_id ||
    performance.identity_profile_id ||
    lock.identity_profile_id ||
    parameters.identity_profile_id ||
    shot.metadata?.identity_profile_id,
  );
}

function syntheticMarker(shot = {}) {
  const cast = object(shot.cast_contract);
  const requirements = object(shot.identity_requirements);
  const performance = object(
    shot.performance_contract || shot.metadata?.performance_contract,
  );
  const lock = object(shot.generation?.identity_lock);
  const parameters = object(shot.generation?.provider_parameters);
  const mode = text(
    requirements.mode ||
    cast.mode ||
    lock.mode ||
    parameters.cast_mode,
  ).toUpperCase();

  return Boolean(
    cast.contract === "UNIVERSAL_SYNTHETIC_CAST_V1" ||
    performance.synthetic_cast === true ||
    requirements.real_person_identity_reference_prohibited === true ||
    lock.mode === "SYNTHETIC_CAST" ||
    parameters.synthetic_cast_contract?.contract ===
      "UNIVERSAL_SYNTHETIC_CAST_V1" ||
    mode.startsWith("SYNTHETIC")
  );
}

function explicitRealIdentityEvidence(shot = {}) {
  const requirements = object(shot.identity_requirements);
  const performance = object(
    shot.performance_contract || shot.metadata?.performance_contract,
  );
  const lock = object(shot.generation?.identity_lock);
  if (identityReferenceAssetIds(shot).length || identityProfileId(shot)) {
    return true;
  }
  if (
    requirements.required === true ||
    requirements.preserve_real_identity === true ||
    requirements.verification_required === true ||
    performance.identity_lock_required === true ||
    performance.identity_verification_required === true ||
    lock.required === true
  ) {
    return true;
  }
  return list(shot.actors).some((actor) => Boolean(actorIdentityId(actor)));
}

function genericActor(actor) {
  const record = object(actor);
  const name = text(record.name);
  const role = text(record.role || record.label);
  const label = actorLabel(actor);
  if (!label) return false;
  if (actorIdentityId(actor)) return false;
  if (name && !GENERIC_ROLE_PATTERN.test(name)) return false;
  if (role) return true;
  return GENERIC_ROLE_PATTERN.test(label);
}

function likelyNamedActor(actor) {
  const record = object(actor);
  const name = text(record.name || actor);
  if (!name || actorIdentityId(actor) || GENERIC_ROLE_PATTERN.test(name)) {
    return false;
  }
  if (record.role || record.label) return Boolean(record.name);
  const words = name.split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 6;
}

function shotCorpus(shot = {}) {
  return JSON.stringify({
    title: shot.title,
    purpose: shot.purpose,
    subject: shot.subject,
    action: shot.action,
    performance: shot.performance,
    actors: shot.actors,
    dialogue: shot.dialogue,
    identity_requirements: shot.identity_requirements,
    performance_contract: shot.performance_contract,
    cast_contract: shot.cast_contract,
  });
}

function humanShot(shot = {}) {
  return list(shot.actors).length > 0 || HUMAN_PATTERN.test(shotCorpus(shot));
}

function genericRoleShot(shot = {}) {
  const actors = list(shot.actors);
  if (actors.length) return actors.every(genericActor);
  return GENERIC_ROLE_PATTERN.test(shotCorpus(shot));
}

function namedActorShot(shot = {}) {
  return list(shot.actors).some(likelyNamedActor);
}

function classifyShot(shot = {}) {
  if (!humanShot(shot)) {
    return {
      mode: "NONE",
      human: false,
      real_identity: false,
      synthetic_cast: false,
      unresolved: false,
      reason: "NO_HUMAN_EVIDENCE",
    };
  }
  if (syntheticMarker(shot)) {
    return {
      mode: "SYNTHETIC_CAST",
      human: true,
      real_identity: false,
      synthetic_cast: true,
      unresolved: false,
      reason: "EXPLICIT_SYNTHETIC_CAST_CONTRACT",
    };
  }
  if (explicitRealIdentityEvidence(shot)) {
    return {
      mode: "REAL_IDENTITY",
      human: true,
      real_identity: true,
      synthetic_cast: false,
      unresolved: false,
      reason: "EXPLICIT_REAL_IDENTITY_EVIDENCE",
    };
  }
  if (genericRoleShot(shot)) {
    return {
      mode: "SYNTHETIC_CAST",
      human: true,
      real_identity: false,
      synthetic_cast: true,
      unresolved: false,
      reason: "GENERIC_ROLE_WITHOUT_IDENTITY_EVIDENCE",
    };
  }
  if (namedActorShot(shot)) {
    return {
      mode: "REAL_IDENTITY",
      human: true,
      real_identity: true,
      synthetic_cast: false,
      unresolved: false,
      reason: "NAMED_ACTOR_WITHOUT_SYNTHETIC_MARKER",
    };
  }
  return {
    mode: "UNRESOLVED_HUMAN",
    human: true,
    real_identity: false,
    synthetic_cast: false,
    unresolved: true,
    reason: "HUMAN_EVIDENCE_NOT_CLASSIFIED",
  };
}

function neutralizeText(value) {
  return text(value)
    .replace(/\bpeople\b/gi, "participants")
    .replace(/\bperson\b/gi, "participant")
    .replace(/\bhuman\b/gi, "participant")
    .replace(/\b(artist|performer|singer|actor|actress|model|dancer)\b/gi, "featured talent")
    .replace(/\b(staff|employee|bartender|server|waiter|waitress|chef|host|hostess)\b/gi, "service team")
    .replace(/\b(customer|client|guest|visitor|patron|diner)\b/gi, "participant")
    .replace(/\b(founder|owner)\b/gi, "principal")
    .replace(/\b(woman|man)\b/gi, "adult")
    .replace(/\b(girl|boy)\b/gi, "young participant")
    .replace(/\b(face|portrait)\b/gi, "close visual");
}

function neutralizeValue(value) {
  if (typeof value === "string") return neutralizeText(value);
  if (Array.isArray(value)) return value.map(neutralizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, neutralizeValue(entry)]),
    );
  }
  return value;
}

function crowdShot(shot = {}) {
  return list(shot.actors).length > 2 ||
    /\b(crowd|audience|group|people|customers|clients|guests|visitors|patrons|diners|family|friends|team|staff|crew|extras|participants|players)\b/i.test(
      shotCorpus(shot),
    );
}

function castContract(shot = {}, brief = actorBrief(shot)) {
  const existing = object(shot.cast_contract);
  if (existing.contract === "UNIVERSAL_SYNTHETIC_CAST_V1") {
    return existing;
  }
  const description = brief
    .flatMap((actor) => [
      actor.role,
      actor.label,
      actor.description,
      actor.name,
    ])
    .map(text)
    .filter(Boolean)
    .join("; ") ||
    text(shot.subject || shot.purpose || "supporting cast");
  const ensemble = crowdShot(shot);
  return {
    contract: "UNIVERSAL_SYNTHETIC_CAST_V1",
    mode: ensemble ? "SYNTHETIC_ENSEMBLE" : "SYNTHETIC_CAST",
    cast_profile_id: stableId("synthetic-cast", description),
    description,
    fictional_people_required: true,
    real_person_identity_reference_prohibited: true,
    reference_person_asset_ids: [],
    continuity_scope: ensemble ? "SHOT_AND_SCENE" : "PROJECT",
    preserve_cast_continuity: true,
    natural_anatomy_required: true,
    natural_skin_texture_required: true,
    role_accurate_behavior_required: true,
    wardrobe_continuity_required: true,
    environment_interaction_required: true,
    reconstructed_from_generic_role_evidence: true,
    ensemble_rules: ensemble ? {
      unique_individuals_required: true,
      duplicate_faces_prohibited: true,
      cloned_body_or_pose_prohibited: true,
      coherent_social_relationships_required: true,
      believable_attention_and_eye_lines_required: true,
      background_people_must_perform_real_actions: true,
    } : null,
    prohibited: [
      "matching or imitating any uploaded real person",
      "generic stock-photo posing",
      "duplicate faces or bodies",
      "frozen background figures",
      "synthetic skin or malformed anatomy",
      "role-inaccurate props, uniforms or behavior",
    ],
  };
}

function castPrompt(contract = {}, shot = {}) {
  if (!contract.cast_profile_id) return "";
  return [
    "SYNTHETIC CAST DIRECTIVE:",
    `Generate original fictional cast for profile ${contract.cast_profile_id}.`,
    `Role and behavior: ${contract.description}.`,
    "Do not reproduce, blend, or approximate any uploaded real person's face or body.",
    "Maintain the same fictional individual across recurring shots when the cast profile repeats.",
    "Performance must be candid, role-accurate and physically integrated with the environment.",
    contract.ensemble_rules
      ? "Every visible individual must be distinct and naturally occupied. No cloned faces, repeated bodies, mirrored poses or frozen background figures."
      : null,
    `Shot action: ${text(shot.action)}.`,
  ].filter(Boolean).join("\n");
}

function normalizeSyntheticShot(shot = {}) {
  const classification = classifyShot(shot);
  if (!classification.synthetic_cast) return shot;
  const brief = actorBrief(shot);
  const cast = castContract(shot, brief);
  const requirements = object(shot.identity_requirements);
  const performance = object(
    shot.performance_contract || shot.metadata?.performance_contract,
  );
  const generation = object(shot.generation);
  const parameters = object(generation.provider_parameters);
  const identityReferences = new Set(identityReferenceAssetIds(shot));
  const nonIdentityReferences = unique([
    shot.reference_asset_ids,
    parameters.reference_asset_ids,
  ]).filter((assetId) => !identityReferences.has(assetId));
  return {
    ...shot,
    title: neutralizeText(shot.title),
    purpose: neutralizeText(shot.purpose),
    subject: neutralizeText(shot.subject),
    action: neutralizeText(shot.action),
    performance: neutralizeText(shot.performance),
    dialogue: neutralizeValue(shot.dialogue),
    actors: [],
    cast_contract: cast,
    reference_asset_ids: nonIdentityReferences,
    identity_requirements: {
      ...requirements,
      mode: "SYNTHETIC_CAST",
      profile_id: null,
      identity_profile_id: null,
      reference_asset_ids: [],
      required: false,
      preserve_real_identity: false,
      real_person_identity_reference_prohibited: true,
      verification_required: false,
      reject_identity_drift: false,
    },
    performance_contract: {
      ...performance,
      identity_profile_id: null,
      identity_reference_asset_ids: [],
      identity_lock_required: false,
      identity_verification_required: false,
      synthetic_cast: true,
      synthetic_cast_profile_id: cast.cast_profile_id,
    },
    generation: {
      ...generation,
      provider_prompt: [
        text(generation.provider_prompt || shot.provider_prompt),
        castPrompt(cast, shot),
      ].filter(Boolean).join("\n\n"),
      identity_lock: {
        ...object(generation.identity_lock),
        required: false,
        mode: "SYNTHETIC_CAST",
        identity_profile_id: null,
        reference_asset_node_ids: [],
        synthetic_cast_profile_id: cast.cast_profile_id,
      },
      provider_parameters: {
        ...parameters,
        identity_profile_id: null,
        identity_reference_asset_ids: [],
        reference_asset_ids: nonIdentityReferences,
        cast_mode: cast.mode,
        synthetic_cast_contract: cast,
      },
    },
    metadata: {
      ...object(shot.metadata),
      synthetic_cast_actor_brief: brief,
      synthetic_cast_record_normalized: true,
      synthetic_cast_record_normalization_contract:
        "CREATIVE_CAST_CLASSIFICATION_V1",
      synthetic_cast_classification_reason: classification.reason,
      real_identity_reference_prohibited: true,
    },
  };
}

function normalizePlan(plan = {}) {
  return {
    ...plan,
    scenes: list(plan.scenes).map((scene) => ({
      ...scene,
      shots: list(scene.shots).map(normalizeSyntheticShot),
    })),
    production: {
      ...object(plan.production),
      cast_classification_contract: "CREATIVE_CAST_CLASSIFICATION_V1",
    },
  };
}

export const CreativeCastClassificationRuntime = {
  classifyShot,
  humanShot,
  genericRoleShot,
  namedActorShot,
  syntheticMarker,
  explicitRealIdentityEvidence,
  identityReferenceAssetIds,
  identityProfileId,
  actorBrief,
  castContract,
  normalizeSyntheticShot,
  normalizePlan,
  neutralizeText,
  neutralizeValue,
  list,
  object,
  text,
  unique,
};

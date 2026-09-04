const CONTRACT = "AVANTIQO_PRO_DIRECTION_AUTHORITY_V1";
const INTENTIONAL_CHANGE_CONTRACT = "CREATIVE_CINEMATIC_INTENTIONAL_CHANGE_V1";

const SHOT_ROOTS = new Set([
  "action",
  "performance",
  "frame_plan",
  "camera",
  "continuity",
  "coverage",
  "transition_in",
  "transition_out",
]);

const SCENE_ROOTS = new Set([
  "coverage_plan",
  "camera_style",
  "visual_style",
  "audio_style",
  "transition_logic",
]);

const REPAIR_PATHS = Object.freeze({
  identity: ["identity_requirements"],
  wardrobe: ["wardrobe"],
  hair_makeup: ["hair_makeup"],
  products: ["products"],
  props: ["props"],
  location: ["location"],
  lighting: ["lighting"],
  spatial_orientation: [
    "camera.angle",
    "camera.camera_distance",
    "coverage.camera_height",
    "coverage.camera_position",
    "coverage.subject_distance",
    "coverage.axis_relationship",
    "coverage.axis_break",
    "coverage.axis_break_motivation",
    "coverage.reestablish_strategy",
    "coverage.eyeline",
    "coverage.eyeline_match_required",
    "coverage.eyeline_match_status",
    "coverage.screen_direction",
    "coverage.screen_direction_status",
    "coverage.intentional_screen_direction_break",
    "coverage.screen_direction_break_motivation",
    "coverage.entry_exit_direction",
    "continuity.screen_direction",
    "continuity.spatial_geography",
  ],
});

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
}

function same(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function unique(values = []) {
  return [...new Set(list(values).map((value) => text(value, 300)).filter(Boolean))];
}

function valueAt(source = {}, path = "") {
  return text(path, 500)
    .split(".")
    .filter(Boolean)
    .reduce((value, key) => (value == null ? undefined : value[key]), source);
}

function flatten(value, prefix = "", target = []) {
  if (Array.isArray(value) || !value || typeof value !== "object") {
    if (prefix) target.push(prefix);
    return target;
  }
  const entries = Object.entries(value);
  if (!entries.length && prefix) target.push(prefix);
  for (const [key, child] of entries) {
    const path = prefix ? `${prefix}.${key}` : key;
    flatten(child, path, target);
  }
  return target;
}

function allowedRoots(kind = "SHOT") {
  return String(kind).toUpperCase() === "SCENE" ? SCENE_ROOTS : SHOT_ROOTS;
}

export function professionalDirectionChangedFields({
  kind = "SHOT",
  current = {},
  candidate = {},
} = {}) {
  const roots = allowedRoots(kind);
  const paths = [];
  for (const root of roots) {
    if (!Object.prototype.hasOwnProperty.call(candidate, root)) continue;
    const leafPaths = flatten(candidate[root], root, []);
    if (!leafPaths.length) leafPaths.push(root);
    for (const path of leafPaths) {
      if (!same(valueAt(current, path), valueAt(candidate, path))) paths.push(path);
    }
  }
  return unique(paths).sort();
}

function intentionalSpatialChange(candidate = {}) {
  const coverage = object(candidate.coverage);
  if (coverage.axis_break === true) {
    return text(coverage.axis_break_motivation, 500) ||
      "Professional director intentionally crosses the established camera axis for this story beat.";
  }
  if (coverage.intentional_screen_direction_break === true) {
    return text(coverage.screen_direction_break_motivation, 500) ||
      "Professional director intentionally changes screen direction for this story beat.";
  }
  if (text(coverage.eyeline_match_status, 80).toUpperCase() === "INTENTIONALLY_BROKEN") {
    return text(coverage.directorial_reasoning, 500) ||
      "Professional director intentionally breaks the eyeline relationship for this story beat.";
  }
  return null;
}

export function professionalDirectionAuthority(record = {}) {
  return object(record.metadata?.professional_direction);
}

export function professionalLockedFields(record = {}) {
  return unique(professionalDirectionAuthority(record).locked_fields);
}

export function professionalFieldLocked(record = {}, path = "") {
  const target = text(path, 500);
  if (!target) return false;
  return professionalLockedFields(record).some(
    (locked) =>
      target === locked ||
      target.startsWith(`${locked}.`) ||
      locked.startsWith(`${target}.`),
  );
}

export function applyProfessionalDirectionAuthority({
  kind = "SHOT",
  current = {},
  candidate = {},
  revisionReason = null,
  now = new Date().toISOString(),
} = {}) {
  const changedFields = professionalDirectionChangedFields({
    kind,
    current,
    candidate,
  });
  const metadata = {
    ...object(current.metadata),
    ...object(candidate.metadata),
  };
  const previous = professionalDirectionAuthority(current);
  const lockedFields = unique([
    ...list(previous.locked_fields),
    ...changedFields,
  ]).sort();
  const reason = text(
    revisionReason || candidate.revision_reason ||
      (changedFields.length
        ? `Professional direction changed ${changedFields.slice(0, 5).join(", ")}${changedFields.length > 5 ? " and related fields" : ""}.`
        : "Professional direction reviewed without changing locked craft."),
    700,
  );

  metadata.professional_direction = {
    contract: CONTRACT,
    source: "PRO_STUDIO",
    locked_fields: lockedFields,
    latest_changed_fields: changedFields,
    revision_reason: reason,
    updated_at: now,
    human_authoritative: true,
    ai_may_edit_unlocked_fields: true,
  };

  const spatialReason = String(kind).toUpperCase() === "SHOT"
    ? intentionalSpatialChange(candidate)
    : null;
  if (spatialReason) {
    metadata.intentional_continuity_changes = {
      ...object(metadata.intentional_continuity_changes),
      spatial_orientation: {
        contract: INTENTIONAL_CHANGE_CONTRACT,
        allowed: true,
        intentional: true,
        reason: spatialReason,
        source: "PRO_STUDIO",
        updated_at: now,
      },
    };
  }

  return {
    metadata,
    authority: metadata.professional_direction,
    changed_fields: changedFields,
    locked_fields: lockedFields,
  };
}

export function unlockProfessionalDirectionFields({
  record = {},
  fields = [],
  now = new Date().toISOString(),
} = {}) {
  const metadata = { ...object(record.metadata) };
  const previous = professionalDirectionAuthority(record);
  const remove = new Set(unique(fields));
  const lockedFields = professionalLockedFields(record).filter(
    (path) => ![...remove].some(
      (field) =>
        path === field ||
        path.startsWith(`${field}.`) ||
        field.startsWith(`${path}.`),
    ),
  );
  metadata.professional_direction = {
    ...previous,
    contract: CONTRACT,
    source: "PRO_STUDIO",
    locked_fields: lockedFields,
    latest_unlocked_fields: unique(fields),
    updated_at: now,
    human_authoritative: lockedFields.length > 0,
    ai_may_edit_unlocked_fields: true,
  };
  return { metadata, locked_fields: lockedFields };
}

export function professionalAuthorityBlocksRepair(record = {}, category = "") {
  const key = text(category, 120).toLowerCase();
  const intentional = object(record.metadata?.intentional_continuity_changes);
  if (
    key === "spatial_orientation" &&
    text(intentional.spatial_orientation?.reason, 500)
  ) {
    return true;
  }
  const candidates = REPAIR_PATHS[key] || [];
  return candidates.some((path) => professionalFieldLocked(record, path));
}

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function deletePath(target, path) {
  const keys = text(path, 500).split(".").filter(Boolean);
  if (!keys.length) return;
  let cursor = target;
  for (let index = 0; index < keys.length - 1; index += 1) {
    cursor = cursor?.[keys[index]];
    if (!cursor || typeof cursor !== "object") return;
  }
  delete cursor[keys[keys.length - 1]];
}

export function stripProfessionalLockedPatch(record = {}, patch = {}) {
  const clean = clone(patch) || {};
  const preserved = [];
  for (const path of professionalLockedFields(record)) {
    if (valueAt(clean, path) === undefined) continue;
    deletePath(clean, path);
    preserved.push(path);
  }
  return {
    patch: clean,
    preserved_locked_fields: unique(preserved),
  };
}

export const CreativeProfessionalDirectionAuthorityRuntime = Object.freeze({
  contract: CONTRACT,
  changedFields: professionalDirectionChangedFields,
  authority: professionalDirectionAuthority,
  lockedFields: professionalLockedFields,
  fieldLocked: professionalFieldLocked,
  apply: applyProfessionalDirectionAuthority,
  unlock: unlockProfessionalDirectionFields,
  blocksRepair: professionalAuthorityBlocksRepair,
  stripLockedPatch: stripProfessionalLockedPatch,
});

export default CreativeProfessionalDirectionAuthorityRuntime;

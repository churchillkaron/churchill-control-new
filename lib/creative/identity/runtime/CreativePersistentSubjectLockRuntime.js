import crypto from "node:crypto";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function text(value) {
  return String(value ?? "").trim();
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return typeof value === "string" ? text(value) : value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function sceneLock(scene = {}) {
  const bible = object(scene.continuity_bible);
  const canonical = {
    world_identity: text(bible.world_identity),
    hero_subject_identity: text(bible.hero_subject_identity),
    location_identity: text(bible.location_identity),
    lighting_state: text(bible.lighting_state),
    spatial_map: text(bible.spatial_map),
  };
  if (!Object.values(canonical).some(Boolean)) return null;
  return {
    contract: "CREATIVE_PERSISTENT_SUBJECT_LOCK_V1",
    scene_id: scene.id || null,
    lock_hash: hash(canonical),
    canonical,
    allowed_changes: list(bible.allowed_changes),
    same_scene_identity_replacement_forbidden: true,
    same_scene_location_replacement_forbidden: true,
    silent_geometry_change_forbidden: true,
    spatial_teleportation_forbidden: true,
  };
}

export const CreativePersistentSubjectLockRuntime = Object.freeze({
  contract: "CREATIVE_PERSISTENT_SUBJECT_LOCK_V1",
  attachToPlan(plan = {}) {
    const scenes = list(plan.scenes).map((scene) => {
      const lock = sceneLock(scene);
      if (!lock) return scene;
      return {
        ...scene,
        persistent_subject_lock: lock,
        shots: list(scene.shots).map((shot) => ({
          ...shot,
          persistent_subject_lock: lock,
          generation: {
            ...object(shot.generation),
            persistent_subject_lock: lock,
          },
          metadata: {
            ...object(shot.metadata),
            persistent_subject_lock_contract: lock.contract,
            persistent_subject_lock_hash: lock.lock_hash,
          },
        })),
      };
    });
    return {
      ...plan,
      scenes,
      production: {
        ...object(plan.production),
        persistent_subject_lock_required: scenes.length > 0,
        persistent_subject_lock_contract: this.contract,
      },
    };
  },
});

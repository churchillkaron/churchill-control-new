export const AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY = Object.freeze({
  contract: "AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY_V2",
  maximum_managed_cache_volumes: 3,
  groups: Object.freeze({
    AUDIO_VOICE: Object.freeze({
      id: "AUDIO_VOICE",
      canonical_name: "avantiqo-shared-audio-voice-cache",
      endpoint_names: Object.freeze([
        "avantiqo-audio-v1",
        "avantiqo-voice-stt-v1",
        "services/avantiqo-voice-tts-v1",
        "avantiqo-voice-tts-v1",
        "avantiqo-lipsync-v1",
        "avantiqo-lipsync-v1.",
      ]),
      root: "/runpod-volume/audio-voice",
      legacy_name_patterns: Object.freeze([
        /^avantiqo-audio-.*cache(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$/i,
        /^avantiqo-voice-.*cache(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$/i,
        /^avantiqo-lipsync-.*cache(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$/i,
      ]),
    }),
    IMAGE_VIDEO: Object.freeze({
      id: "IMAGE_VIDEO",
      canonical_name: "avantiqo-shared-image-video-cache",
      endpoint_names: Object.freeze([
        "avantiqo-image-v1",
        "avantiqo-video-v1",
        "avantiqo-cinema-v1",
      ]),
      root: "/runpod-volume/image-video",
      legacy_name_patterns: Object.freeze([
        /^avantiqo-image-.*cache(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$/i,
        /^avantiqo-video-.*cache(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$/i,
        /^avantiqo-cinema-.*cache(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$/i,
      ]),
    }),
    INTELLIGENCE_CODE: Object.freeze({
      id: "INTELLIGENCE_CODE",
      canonical_name: "avantiqo-shared-intelligence-code-cache",
      endpoint_names: Object.freeze([
        "avantiqo-intelligence-v1",
        "avantiqo-code-v1",
      ]),
      root: "/runpod-volume/intelligence-code",
      legacy_name_patterns: Object.freeze([
        /^avantiqo-code-.*cache(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$/i,
        /^avantiqo-intelligence-.*cache(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$/i,
      ]),
    }),
  }),
});

function text(value) {
  return String(value ?? "").trim();
}

export function sharedVolumeGroups() {
  return Object.values(AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY.groups);
}

export function sharedVolumeGroup(groupId) {
  const group = AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY.groups[text(groupId).toUpperCase()];
  if (!group) throw new Error(`AVANTIQO_RUNPOD_SHARED_VOLUME_GROUP_UNKNOWN:${text(groupId) || "MISSING"}`);
  return group;
}

export function sharedVolumeGroupForEndpoint(endpointName) {
  const name = text(endpointName);
  const matches = sharedVolumeGroups().filter((group) => group.endpoint_names.includes(name));
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_RUNPOD_SHARED_VOLUME_ENDPOINT_GROUP_REQUIRED:name=${name || "MISSING"}:matches=${matches.length}`);
  }
  return matches[0];
}

export function volumeNameBelongsToGroup(volumeName, group) {
  const name = text(volumeName);
  if (!name) return false;
  if (name === group.canonical_name) return true;
  return group.legacy_name_patterns.some((pattern) => pattern.test(name));
}

export function classifyManagedVolumeName(volumeName) {
  const matches = sharedVolumeGroups().filter((group) => volumeNameBelongsToGroup(volumeName, group));
  return matches.length === 1 ? matches[0] : null;
}

export function isAvantiqoCacheLikeVolumeName(volumeName) {
  const name = text(volumeName).toLowerCase();
  return name.startsWith("avantiqo-") && name.includes("cache");
}

export function managedCacheVolumes(volumes) {
  return (Array.isArray(volumes) ? volumes : [])
    .map((volume) => ({ volume, group: classifyManagedVolumeName(volume?.name) }))
    .filter((entry) => entry.group);
}

export function unknownAvantiqoCacheVolumes(volumes) {
  return (Array.isArray(volumes) ? volumes : []).filter(
    (volume) =>
      isAvantiqoCacheLikeVolumeName(volume?.name) &&
      !classifyManagedVolumeName(volume?.name),
  );
}

export function groupCacheVolumes(volumes, group) {
  return (Array.isArray(volumes) ? volumes : []).filter((volume) =>
    volumeNameBelongsToGroup(volume?.name, group),
  );
}

export function resolveReusableGroupVolume(volumes, group) {
  const candidates = groupCacheVolumes(volumes, group);
  const canonical = candidates.filter(
    (volume) => text(volume?.name) === group.canonical_name,
  );
  if (canonical.length > 1) {
    throw new Error(
      `AVANTIQO_RUNPOD_SHARED_VOLUME_CANONICAL_AMBIGUOUS:group=${group.id}:count=${canonical.length}`,
    );
  }
  if (canonical.length === 1) {
    return {
      volume: canonical[0],
      resolution: candidates.length > 1
        ? "CANONICAL_NAME_WITH_LEGACY_MIGRATION_OVERLAP"
        : "CANONICAL_NAME",
      candidate_count: candidates.length,
      legacy_candidate_count: candidates.length - 1,
    };
  }
  if (candidates.length > 1) {
    throw new Error(
      `AVANTIQO_RUNPOD_SHARED_VOLUME_CONSOLIDATION_REQUIRED:group=${group.id}:count=${candidates.length}`,
    );
  }
  if (candidates.length === 1) {
    return {
      volume: candidates[0],
      resolution: "LEGACY_GROUP_VOLUME",
      candidate_count: 1,
      legacy_candidate_count: 1,
    };
  }
  return {
    volume: null,
    resolution: "MISSING",
    candidate_count: 0,
    legacy_candidate_count: 0,
  };
}

export function assertSharedVolumeGroupCompatible(volumes, group) {
  const candidates = groupCacheVolumes(volumes, group);
  if (candidates.length > 1) {
    throw new Error(
      `AVANTIQO_RUNPOD_SHARED_VOLUME_CONSOLIDATION_REQUIRED:group=${group.id}:count=${candidates.length}`,
    );
  }
  resolveReusableGroupVolume(volumes, group);
  return true;
}

export function assertSharedVolumeInventoryCompatible(volumes) {
  const unknown = unknownAvantiqoCacheVolumes(volumes);
  if (unknown.length) {
    throw new Error(
      `AVANTIQO_RUNPOD_SHARED_VOLUME_UNKNOWN_CACHE_CLASSIFICATION_REQUIRED:count=${unknown.length}:names=${unknown.map((volume) => text(volume?.name) || "MISSING").join(",")}`,
    );
  }

  for (const group of sharedVolumeGroups()) {
    assertSharedVolumeGroupCompatible(volumes, group);
  }

  const managed = managedCacheVolumes(volumes);
  if (managed.length > AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY.maximum_managed_cache_volumes) {
    throw new Error(
      `AVANTIQO_RUNPOD_SHARED_VOLUME_HARD_LIMIT_EXCEEDED:managed=${managed.length}:maximum=${AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY.maximum_managed_cache_volumes}`,
    );
  }
  return true;
}

export function assertManagedVolumeCreationAllowed(volumes, group) {
  assertSharedVolumeInventoryCompatible(volumes);
  const managed = managedCacheVolumes(volumes);
  const groupsPresent = new Set(managed.map((entry) => entry.group.id));
  if (groupsPresent.has(group.id)) {
    throw new Error(
      `AVANTIQO_RUNPOD_SHARED_VOLUME_GROUP_ALREADY_EXISTS:group=${group.id}:create_forbidden=true`,
    );
  }
  if (managed.length >= AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY.maximum_managed_cache_volumes) {
    throw new Error(
      `AVANTIQO_RUNPOD_SHARED_VOLUME_LIMIT_REACHED:managed=${managed.length}:maximum=${AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY.maximum_managed_cache_volumes}:target_group=${group.id}`,
    );
  }
}

function safeVolume(volume = {}) {
  return {
    id: text(volume?.id) || null,
    name: text(volume?.name) || null,
    size_gb: Number.isFinite(Number(volume?.size)) ? Number(volume.size) : null,
    data_center_id: text(volume?.dataCenterId) || null,
  };
}

export function sharedVolumePolicySummary(volumes) {
  const rows = Array.isArray(volumes) ? volumes : [];
  const managed = managedCacheVolumes(rows);
  const unknown = unknownAvantiqoCacheVolumes(rows);
  const byGroup = Object.fromEntries(
    sharedVolumeGroups().map((group) => [
      group.id,
      groupCacheVolumes(rows, group).map(safeVolume),
    ]),
  );
  const duplicateGroups = sharedVolumeGroups()
    .filter((group) => groupCacheVolumes(rows, group).length > 1)
    .map((group) => group.id);
  const compliant =
    managed.length <= AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY.maximum_managed_cache_volumes &&
    unknown.length === 0 &&
    duplicateGroups.length === 0;
  return {
    contract: AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY.contract,
    maximum_managed_cache_volumes: AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY.maximum_managed_cache_volumes,
    managed_cache_volume_count: managed.length,
    distinct_managed_groups: [...new Set(managed.map((entry) => entry.group.id))].sort(),
    unknown_avantiqo_cache_volumes: unknown.map(safeVolume),
    duplicate_groups: duplicateGroups,
    policy_compliant: compliant,
    groups: byGroup,
  };
}

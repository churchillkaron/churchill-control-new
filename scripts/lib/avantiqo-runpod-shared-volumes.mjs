export const AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY = Object.freeze({
  contract: "AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY_V1",
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
        /^avantiqo-audio-.*cache$/i,
        /^avantiqo-voice-.*cache$/i,
        /^avantiqo-lipsync-.*cache$/i,
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
        /^avantiqo-image-.*cache$/i,
        /^avantiqo-video-.*cache$/i,
        /^avantiqo-cinema-.*cache$/i,
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
        /^avantiqo-code-.*cache$/i,
        /^avantiqo-intelligence-.*cache$/i,
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

export function managedCacheVolumes(volumes) {
  return (Array.isArray(volumes) ? volumes : [])
    .map((volume) => ({ volume, group: classifyManagedVolumeName(volume?.name) }))
    .filter((entry) => entry.group);
}

export function groupCacheVolumes(volumes, group) {
  return (Array.isArray(volumes) ? volumes : []).filter((volume) =>
    volumeNameBelongsToGroup(volume?.name, group),
  );
}

export function resolveReusableGroupVolume(volumes, group) {
  const candidates = groupCacheVolumes(volumes, group);
  const canonical = candidates.filter((volume) => text(volume?.name) === group.canonical_name);
  if (canonical.length > 1) {
    throw new Error(`AVANTIQO_RUNPOD_SHARED_VOLUME_DUPLICATE_CANONICAL:group=${group.id}:count=${canonical.length}`);
  }
  if (canonical.length === 1) {
    return { volume: canonical[0], resolution: "CANONICAL_NAME", candidate_count: candidates.length };
  }
  if (candidates.length === 1) {
    return { volume: candidates[0], resolution: "LEGACY_GROUP_VOLUME", candidate_count: 1 };
  }
  if (candidates.length > 1) {
    throw new Error(`AVANTIQO_RUNPOD_SHARED_VOLUME_CONSOLIDATION_REQUIRED:group=${group.id}:count=${candidates.length}`);
  }
  return { volume: null, resolution: "MISSING", candidate_count: 0 };
}

export function assertManagedVolumeCreationAllowed(volumes, group) {
  const managed = managedCacheVolumes(volumes);
  const groupsPresent = new Set(managed.map((entry) => entry.group.id));
  if (groupsPresent.has(group.id)) return;
  if (managed.length >= AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY.maximum_managed_cache_volumes) {
    throw new Error(
      `AVANTIQO_RUNPOD_SHARED_VOLUME_LIMIT_REACHED:managed=${managed.length}:maximum=${AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY.maximum_managed_cache_volumes}:target_group=${group.id}`,
    );
  }
}

export function sharedVolumePolicySummary(volumes) {
  const managed = managedCacheVolumes(volumes);
  const byGroup = Object.fromEntries(
    sharedVolumeGroups().map((group) => [
      group.id,
      groupCacheVolumes(volumes, group).map((volume) => ({
        id: text(volume?.id) || null,
        name: text(volume?.name) || null,
        size_gb: Number.isFinite(Number(volume?.size)) ? Number(volume.size) : null,
        data_center_id: text(volume?.dataCenterId) || null,
      })),
    ]),
  );
  return {
    contract: AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY.contract,
    maximum_managed_cache_volumes: AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY.maximum_managed_cache_volumes,
    managed_cache_volume_count: managed.length,
    distinct_managed_groups: [...new Set(managed.map((entry) => entry.group.id))].sort(),
    groups: byGroup,
  };
}

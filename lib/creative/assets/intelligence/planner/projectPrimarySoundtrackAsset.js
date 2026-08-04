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

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function uniqueObjects(values = []) {
  const result = [];
  const seen = new Set();
  for (const value of values.flat(Infinity)) {
    if (!value) continue;
    const key = typeof value === "object"
      ? JSON.stringify(value)
      : text(value).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function uniqueStrings(values = []) {
  return [...new Set(
    values.flat(Infinity).map(text).filter(Boolean),
  )];
}

function fullSongProjectIntent(project = {}) {
  const metadata = object(project.metadata);
  const mode = text(
    metadata.duration_mode ||
    metadata.durationMode ||
    metadata.temporal_contract?.mode ||
    metadata.temporalContract?.mode ||
    metadata.creative_direction_constraints?.duration_mode,
  ).toUpperCase();

  if ([
    "FULL_SOURCE_AUDIO",
    "FULL_SONG",
    "MATCH_SOURCE_AUDIO",
    "SOURCE_AUDIO",
  ].includes(mode)) {
    return true;
  }

  if (
    metadata.full_song === true ||
    metadata.fullSong === true ||
    metadata.music_video === true ||
    metadata.musicVideo === true ||
    metadata.use_full_song === true ||
    metadata.useFullSong === true
  ) {
    return true;
  }

  const requestText = [
    project.name,
    project.description,
    project.objective,
    metadata.request,
    metadata.request_text,
    metadata.creative_request,
    metadata.production_intent,
    metadata.command,
  ].map(text).filter(Boolean).join(" ").toLowerCase();

  return /\b(music video|official video|full song|entire song|whole song|complete song|song-length|full-length song)\b/i.test(
    requestText,
  );
}

function explicitSoundtrackNode(node = {}) {
  const metadata = object(node.metadata);
  const renderRole = text(
    metadata.render_role ||
    metadata.renderRole ||
    metadata.audio_role ||
    metadata.audioRole,
  ).toUpperCase();
  const timingRole = text(
    metadata.timing_authority_role ||
    metadata.timingAuthorityRole,
  ).toUpperCase();

  return Boolean(
    [
      "PRIMARY_SOUNDTRACK",
      "PRIMARY_AUDIO",
      "MASTER_SOUNDTRACK",
      "SOURCE_AUDIO",
    ].includes(renderRole) ||
    timingRole === "PRIMARY_SOUNDTRACK" ||
    metadata.primary_soundtrack === true ||
    metadata.primarySoundtrack === true ||
    metadata.primary_audio === true ||
    metadata.primaryAudio === true ||
    (
      metadata.timing_authority === true &&
      metadata.full_song === true
    ) ||
    (
      metadata.include_in_master === true &&
      metadata.full_song === true
    )
  );
}

function generatedOrDerivedAudioNode(node = {}) {
  const status = text(node.status).toUpperCase();
  const lineageSource = text(
    node.lineage?.source ||
    node.metadata?.lineage_source ||
    node.metadata?.source_kind,
  ).toLowerCase();

  return Boolean(
    status === "GENERATED" ||
    node.metadata?.generated === true ||
    node.metadata?.derived_asset === true ||
    node.metadata?.production_output === true ||
    /provider|generation|generated|render|output/.test(
      lineageSource,
    )
  );
}

function sourceAudioNode(node = {}) {
  const metadata = object(node.metadata);
  const lineageSource = text(
    node.lineage?.source,
  ).toLowerCase();

  return Boolean(
    node.creative_asset_id ||
    metadata.source_creative_asset_id ||
    metadata.canonical_source_node === true ||
    metadata.project_asset_reference === true ||
    [
      "creative_asset_record",
      "project_asset_reference",
    ].includes(lineageSource)
  );
}

function fullSourceAudioProject(project = {}, nodes = []) {
  const configured = configuredNodeId(project);
  const explicitSourceNodes = list(nodes).filter(
    (node) =>
      nodeKind(node) === "AUDIO" &&
      sourceAudioNode(node) &&
      !generatedOrDerivedAudioNode(node) &&
      explicitSoundtrackNode(node),
  );

  return Boolean(
    configured ||
    fullSongProjectIntent(project) ||
    explicitSourceNodes.length === 1
  );
}

function nodeKind(node = {}) {
  const type = text(node.type).toUpperCase();
  const mime = text(
    node.technical?.mime_type ||
    node.metadata?.mime_type ||
    node.intelligence?.source_asset_analysis?.technical_inspection?.mime_type ||
    node.intelligence?.source_asset_analysis?.storage_evidence?.mime_type,
  ).toLowerCase();
  const source = text(node.url || node.storage_path).toLowerCase();

  if (
    ["AUDIO", "MUSIC", "VOICE"].includes(type) ||
    mime.startsWith("audio/") ||
    /\.(mp3|wav|m4a|aac|flac|ogg|opus)(\?|$)/.test(source)
  ) return "AUDIO";
  return "OTHER";
}

function nodeDuration(node = {}) {
  const sourceAnalysis = object(node.intelligence?.source_asset_analysis);
  return finite(
    node.technical?.duration_seconds ??
    node.metadata?.duration_seconds ??
    node.metadata?.timing?.duration_seconds ??
    sourceAnalysis.duration_seconds ??
    sourceAnalysis.technical_inspection?.duration_seconds,
  );
}

function projectDuration(project = {}) {
  const metadata = object(project.metadata);
  return finite(
    metadata.temporal_contract?.duration_seconds ??
    metadata.temporalContract?.duration_seconds ??
    metadata.full_master_duration ??
    metadata.full_song_duration_seconds ??
    metadata.creative_direction_constraints?.full_song_duration_seconds ??
    project.target_duration,
  );
}

function configuredNodeId(project = {}) {
  const metadata = object(project.metadata);
  return text(
    metadata.primary_soundtrack_asset_node_id ||
    metadata.primary_audio_asset_node_id ||
    metadata.temporal_contract?.source_asset_node_id ||
    metadata.temporalContract?.source_asset_node_id,
  );
}

function usableNode(node = {}) {
  const status = text(node.status).toUpperCase();

  return Boolean(
    node?.id &&
    nodeKind(node) === "AUDIO" &&
    sourceAudioNode(node) &&
    !generatedOrDerivedAudioNode(node) &&
    ![
      "ARCHIVED",
      "REJECTED",
      "FAILED",
      "DELETED",
      "DISABLED",
    ].includes(status) &&
    (node.url || node.storage_path)
  );
}

function selectSoundtrackNode(project = {}, nodes = []) {
  const candidates = list(nodes).filter(usableNode);
  const configured = configuredNodeId(project);

  if (configured) {
    const exact = candidates.find(
      (node) => text(node.id) === configured,
    );

    if (!exact) {
      throw new Error(
        `CREATIVE_PRIMARY_SOUNDTRACK_NODE_NOT_FOUND_OR_NOT_SOURCE:${configured}`,
      );
    }

    return exact;
  }

  const explicit = candidates.filter(
    explicitSoundtrackNode,
  );

  if (explicit.length === 1) return explicit[0];

  if (explicit.length > 1) {
    throw new Error(
      `CREATIVE_PRIMARY_SOUNDTRACK_NODE_AMBIGUOUS:${explicit.map((node) => node.id).join(",")}`,
    );
  }

  if (
    fullSongProjectIntent(project) &&
    candidates.length === 1
  ) {
    return candidates[0];
  }

  throw new Error(
    candidates.length
      ? `CREATIVE_PRIMARY_SOUNDTRACK_AUTHORITY_REQUIRED:${candidates.map((node) => node.id).join(",")}`
      : "CREATIVE_PRIMARY_SOUNDTRACK_SOURCE_REQUIRED",
  );
}

function projectedAnalysis(node = {}) {
  const intelligence = object(node.intelligence);
  const source = object(intelligence.source_asset_analysis);
  const sourceIntelligence = object(source.intelligence);
  const measured = object(
    source.measured_audio ||
    sourceIntelligence.measured_audio ||
    intelligence.measured_audio,
  );
  const duration = nodeDuration(node);

  return {
    ...source,
    status: source.status || (node.review?.approved === true ? "VERIFIED" : "ANALYSED"),
    description:
      source.description ||
      intelligence.description ||
      node.description ||
      undefined,
    summary:
      source.summary ||
      intelligence.summary ||
      undefined,
    duration_seconds: finite(source.duration_seconds) || duration || undefined,
    measured_audio: Object.keys(measured).length ? measured : undefined,
    technical: {
      ...object(source.technical),
      ...object(node.technical),
      duration_seconds: duration || undefined,
    },
    technical_inspection: {
      ...object(source.technical_inspection),
      ...object(node.technical),
      duration_seconds: duration || undefined,
    },
    tags: uniqueStrings([
      source.tags,
      sourceIntelligence.tags,
      intelligence.tags,
      "primary soundtrack",
      "full source audio",
    ]),
    intelligence: {
      ...sourceIntelligence,
      ...intelligence,
      source_asset_analysis: source,
      measured_audio: Object.keys(measured).length ? measured : undefined,
      tags: uniqueStrings([
        sourceIntelligence.tags,
        intelligence.tags,
        "primary soundtrack",
        "full source audio",
      ]),
    },
  };
}

function projectedAsset(project = {}, node = {}) {
  const sourceAnalysis = object(node.intelligence?.source_asset_analysis);
  const sourceMetadata = object(node.metadata?.source_asset_metadata);
  const id = text(
    node.creative_asset_id ||
    node.metadata?.source_creative_asset_id ||
    `asset-node-${node.id}`,
  );
  const duration = nodeDuration(node);

  return {
    id,
    asset_id: id,
    organization_id: project.organization_id,
    creative_project_id: project.id,
    asset_type: "audio",
    type: "audio",
    name:
      node.name ||
      sourceMetadata.original_file_name ||
      `Primary soundtrack ${node.id}`,
    file_name:
      node.metadata?.original_file_name ||
      sourceMetadata.original_file_name ||
      node.name ||
      null,
    description:
      node.description ||
      sourceAnalysis.description ||
      "Primary full-source soundtrack",
    file_url: node.url || null,
    url: node.url || null,
    storage_path: node.storage_path || null,
    mime_type:
      node.technical?.mime_type ||
      sourceMetadata.mime_type ||
      sourceAnalysis.technical_inspection?.mime_type ||
      null,
    technical: {
      ...object(node.technical),
      duration_seconds: duration || undefined,
    },
    analysis: projectedAnalysis(node),
    analysis_status:
      sourceAnalysis.status ||
      (node.review?.approved === true ? "VERIFIED" : "ANALYSED"),
    tags: uniqueStrings([
      sourceAnalysis.tags,
      node.intelligence?.tags,
      "primary soundtrack",
      "full source audio",
    ]),
    rights: object(sourceMetadata.rights),
    consent: object(sourceMetadata.consent),
    restrictions: object(sourceMetadata.restrictions),
    metadata: {
      ...sourceMetadata,
      direction_support_asset: true,
      primary_soundtrack: true,
      full_source_audio: true,
      primary_soundtrack_asset_node_id: node.id,
      source_asset_node_id:
        node.metadata?.source_asset_node_id ||
        node.parent_asset_node_id ||
        node.id,
      projected_from_asset_graph: true,
      read_only_projection: true,
      duration_seconds: duration || undefined,
    },
  };
}

function mergeAsset(existing = {}, projected = {}) {
  return {
    ...projected,
    ...existing,
    url: existing.url || existing.file_url || projected.url,
    file_url: existing.file_url || existing.url || projected.file_url,
    technical: {
      ...object(projected.technical),
      ...object(existing.technical),
    },
    analysis: {
      ...object(projected.analysis),
      ...object(existing.analysis),
      intelligence: {
        ...object(projected.analysis?.intelligence),
        ...object(existing.analysis?.intelligence),
      },
    },
    tags: uniqueStrings([projected.tags, existing.tags]),
    metadata: {
      ...object(projected.metadata),
      ...object(existing.metadata),
      direction_support_asset: true,
      primary_soundtrack: true,
      projected_from_asset_graph: true,
      read_only_projection: true,
    },
  };
}

export function projectPrimarySoundtrackAsset({
  project = {},
  assets = [],
  nodes = [],
} = {}) {
  if (!fullSourceAudioProject(project, nodes)) {
    return {
      assets: list(assets),
      soundtrack_asset: null,
      soundtrack_node: null,
      projected: false,
    };
  }

  const node = selectSoundtrackNode(project, nodes);
  const expectedDuration = projectDuration(project);
  const actualDuration = nodeDuration(node);
  if (
    expectedDuration !== null &&
    actualDuration !== null &&
    Math.abs(expectedDuration - actualDuration) > 0.25
  ) {
    throw new Error(
      `CREATIVE_PRIMARY_SOUNDTRACK_DURATION_MISMATCH:project=${expectedDuration};soundtrack=${actualDuration}`,
    );
  }

  const projected = projectedAsset(project, node);
  const existing = list(assets).find((asset) =>
    text(asset.id || asset.asset_id) === projected.id,
  );
  const soundtrack = existing ? mergeAsset(existing, projected) : projected;
  const remaining = list(assets).filter((asset) =>
    text(asset.id || asset.asset_id) !== projected.id,
  );

  return {
    assets: [...remaining, soundtrack],
    soundtrack_asset: soundtrack,
    soundtrack_node: node,
    projected: !existing,
  };
}

export const ProjectPrimarySoundtrackAssetPlanner = Object.freeze({
  project: projectPrimarySoundtrackAsset,
});

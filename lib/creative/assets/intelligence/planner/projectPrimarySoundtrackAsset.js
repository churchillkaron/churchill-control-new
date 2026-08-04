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

function fullSourceAudioProject(project = {}) {
  const metadata = object(project.metadata);
  const mode = text(
    metadata.duration_mode ||
    metadata.temporal_contract?.mode ||
    metadata.temporalContract?.mode,
  ).toUpperCase();
  const workflow = text(
    metadata.workflow_kind ||
    metadata.creative_medium ||
    project.production_type,
  ).toUpperCase();

  return Boolean(
    ["TEMPORAL", "VIDEO", "FILM", "ANIMATION"].includes(workflow) &&
    (
      metadata.full_song === true ||
      metadata.music_video === true ||
      ["FULL_SOURCE_AUDIO", "FULL_SONG", "MATCH_SOURCE_AUDIO"].includes(mode)
    )
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
    !["ARCHIVED", "REJECTED", "FAILED", "DELETED", "DISABLED"].includes(status) &&
    (node.url || node.storage_path)
  );
}

function selectSoundtrackNode(project = {}, nodes = []) {
  const candidates = list(nodes).filter(usableNode);
  const configured = configuredNodeId(project);

  if (configured) {
    const exact = candidates.find((node) => text(node.id) === configured);
    if (!exact) {
      throw new Error(`CREATIVE_PRIMARY_SOUNDTRACK_NODE_NOT_FOUND:${configured}`);
    }
    return exact;
  }

  if (candidates.length !== 1) {
    throw new Error(
      candidates.length
        ? `CREATIVE_PRIMARY_SOUNDTRACK_NODE_AMBIGUOUS:${candidates.map((node) => node.id).join(",")}`
        : "CREATIVE_PRIMARY_SOUNDTRACK_REQUIRED",
    );
  }
  return candidates[0];
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
  if (!fullSourceAudioProject(project)) {
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

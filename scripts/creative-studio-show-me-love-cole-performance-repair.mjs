#!/usr/bin/env node

import crypto from "node:crypto";
import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

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

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function env(name, fallback = null) {
  const value = text(process.env[name]);
  return value || fallback;
}

function yes(name) {
  return env(name, "NO").toUpperCase() === "YES";
}

function corpus(value) {
  try {
    return JSON.stringify(value || {}).toLowerCase();
  } catch {
    return String(value || "").toLowerCase();
  }
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isCole(value) {
  const source = corpus(value);
  return source.includes("cole ley") || /(^|[^a-z])cole([^a-z]|$)/i.test(source);
}

function dialogueText(shot = {}) {
  return list(shot.dialogue)
    .map((entry) => typeof entry === "string" ? entry : entry?.text || entry?.line)
    .map(text)
    .filter(Boolean)
    .join(" ");
}

function entryDuration(edit = {}) {
  const explicit = finite(edit.duration_seconds, null);
  if (explicit !== null && explicit > 0) return explicit;
  const start = finite(edit.source_in_seconds, null);
  const end = finite(edit.source_out_seconds, null);
  return start !== null && end !== null && end > start ? end - start : null;
}

function providerDuration(seconds) {
  const value = finite(seconds, 5);
  return value <= 5 ? 5 : 10;
}

function creditFailure(error) {
  return /not enough credits|insufficient credits|credit balance/i.test(
    error?.message || String(error),
  );
}

function identityReferenceCandidates(nodes = []) {
  return nodes
    .filter((node) => node?.url)
    .filter((node) => !["ARCHIVED", "REJECTED"].includes(node.status))
    .filter((node) => {
      const mime = text(node.technical?.mime_type).toLowerCase();
      return node.type === "IMAGE" || mime.startsWith("image/");
    })
    .filter((node) => isCole(node))
    .sort((left, right) => {
      const approvedLeft = left.status === "APPROVED" || left.review?.approved === true ? 1 : 0;
      const approvedRight = right.status === "APPROVED" || right.review?.approved === true ? 1 : 0;
      if (approvedLeft !== approvedRight) return approvedRight - approvedLeft;
      return Date.parse(right.updated_at || right.created_at || 0) -
        Date.parse(left.updated_at || left.created_at || 0);
    });
}

function musicCandidates(nodes = []) {
  return nodes
    .filter((node) => node?.url)
    .filter((node) => ["MUSIC", "AUDIO"].includes(node.type))
    .filter((node) => !["ARCHIVED", "REJECTED"].includes(node.status))
    .sort((left, right) => {
      const leftPreferred = /show me love/i.test(corpus(left)) ? 1 : 0;
      const rightPreferred = /show me love/i.test(corpus(right)) ? 1 : 0;
      if (leftPreferred !== rightPreferred) return rightPreferred - leftPreferred;
      const leftMaster = left.metadata?.primary_master_audio === true ? 1 : 0;
      const rightMaster = right.metadata?.primary_master_audio === true ? 1 : 0;
      if (leftMaster !== rightMaster) return rightMaster - leftMaster;
      return Date.parse(right.updated_at || right.created_at || 0) -
        Date.parse(left.updated_at || left.created_at || 0);
    });
}

function shotMentionsCole(shot = {}) {
  return isCole({
    title: shot.title,
    purpose: shot.purpose,
    subject: shot.subject,
    action: shot.action,
    performance: shot.performance,
    actors: shot.actors,
    dialogue: shot.dialogue,
    metadata: shot.metadata,
    reference_assets: shot.reference_assets,
  });
}

function sourceNodeForEdit(edit, nodesById) {
  for (const id of [
    edit.source_asset_node_id,
    edit.source_clip_node_id,
    edit.source_moment_node_id,
  ].filter(Boolean)) {
    const node = nodesById.get(id);
    if (node) return node;
  }
  return null;
}

function shotIdForEdit(edit, nodesById, tasksById) {
  const sourceNode = sourceNodeForEdit(edit, nodesById);
  const task = sourceNode?.production_task_id
    ? tasksById.get(sourceNode.production_task_id)
    : null;
  return (
    edit.shot_id ||
    edit.metadata?.shot_id ||
    sourceNode?.metadata?.shot_id ||
    task?.shot_id ||
    null
  );
}

function performancePrompt({ shot, edit, duration, referenceNodes }) {
  const lyric = dialogueText(shot);
  const timelineIn = finite(edit.timeline_in_seconds, null);
  const timelineOut = finite(edit.timeline_out_seconds, null);
  const shotContext = [
    text(shot?.title),
    text(shot?.purpose),
    text(shot?.action),
    text(shot?.performance),
  ].filter(Boolean).join(". ");

  return [
    "Create a premium cinematic music-video performance shot featuring Cole Ley.",
    "Use the supplied approved Cole Ley identity reference as the binding identity source.",
    "Preserve her real face, facial geometry, eye shape, nose, lips, skin tone, age, hairstyle, body proportions and overall identity.",
    "Do not reinterpret her as another person or another ethnicity. Do not beautify her into a generic AI model.",
    "Cole is actively singing and performing, not walking silently, posing, modelling or looking around without performing.",
    "Her breathing, jaw, lips, expression, eyes, shoulders and hands must communicate a real vocal performance.",
    lyric ? `Assigned vocal phrase: ${lyric}` : "Use natural active singing articulation suitable for the song phrase at this timeline position.",
    timelineIn !== null && timelineOut !== null
      ? `Music-video timeline range: ${timelineIn.toFixed(3)} to ${timelineOut.toFixed(3)} seconds.`
      : null,
    `Required usable performance duration: ${duration.toFixed(3)} seconds.`,
    shotContext ? `Existing approved scene direction to preserve: ${shotContext}` : null,
    "Preserve the approved location, wardrobe, lighting, camera language and story continuity for this scene.",
    "Only improve Cole's performance and identity fidelity. Do not redesign or replace approved narrative scenes.",
    "No duplicate Cole, no extra singer, no face drift, no eye deformation, no mouth distortion, no identity change, no ethnicity change, no silent walking-only action, no random lip movement, no text, no watermark.",
    `Identity reference node IDs: ${referenceNodes.map((node) => node.id).join(", ")}.`,
  ].filter(Boolean).join("\n\n");
}

const PROJECT_ID = env(
  "COLE_LEY_PROJECT_ID",
  "6fbac0e8-ab00-44be-9b26-94bf25f28c1e",
);
const TIMELINE_ID = env(
  "COLE_LEY_TIMELINE_ASSET_NODE_ID",
  "64654bfd-264e-47c7-98a9-1a2260bc2934",
);
const PRIOR_RENDER_ID = env(
  "COLE_LEY_PRIOR_RENDER_ASSET_NODE_ID",
  "64639830-c0cb-432e-b26f-8b7836eadbdc",
);
const EXECUTE = yes("COLE_PERFORMANCE_EXECUTE");
const MAX_TASKS = Math.max(1, finite(env("COLE_PERFORMANCE_MAX_TASKS", "24"), 24));
const POLL_SECONDS = Math.max(5, finite(env("COLE_PERFORMANCE_POLL_SECONDS", "15"), 15));
const TIMEOUT_MINUTES = Math.max(5, finite(env("COLE_PERFORMANCE_TIMEOUT_MINUTES", "90"), 90));

const { CreativeProjectRepository } = await import(
  "@/lib/creative/projects/repositories/CreativeProjectRepository"
).catch(async () => ({
  CreativeProjectRepository: await import(
    "@/lib/creative/projects/repositories/CreativeProjectRepository"
  ),
}));
const ProjectRepository = CreativeProjectRepository?.getById
  ? CreativeProjectRepository
  : await import("@/lib/creative/projects/repositories/CreativeProjectRepository");
const AssetGraphRepository = await import(
  "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository"
);
const { createCreativeAssetNode, CREATIVE_ASSET_NODE_TYPES } = await import(
  "@/lib/creative/assets/graph/documents/CreativeAssetNode"
);
const { ShotRuntime } = await import(
  "@/lib/creative/shots/runtime/ShotRuntime"
);
const { ProductionTaskRuntime } = await import(
  "@/lib/operations/tasks/runtime/ProductionTaskRuntime"
);
const { CreativeEdlRenderRuntime } = await import(
  "@/lib/creative/post-production/runtime/CreativeEdlRenderRuntime"
);

const project = await ProjectRepository.getById(PROJECT_ID);
if (!project) throw new Error(`COLE_PROJECT_NOT_FOUND:${PROJECT_ID}`);
const organizationId = env("CREATIVE_SMOKE_ORGANIZATION_ID", project.organization_id);
if (organizationId !== project.organization_id) {
  throw new Error("COLE_PROJECT_ORGANIZATION_MISMATCH");
}

const [nodes, shots, tasks] = await Promise.all([
  AssetGraphRepository.listByProject({
    organization_id: organizationId,
    creative_project_id: PROJECT_ID,
  }),
  ShotRuntime.list({
    organization_id: organizationId,
    creative_project_id: PROJECT_ID,
  }),
  ProductionTaskRuntime.list({
    organization_id: organizationId,
    creative_project_id: PROJECT_ID,
  }),
]);

const nodesById = new Map(nodes.map((node) => [node.id, node]));
const tasksById = new Map(tasks.map((task) => [task.id, task]));
const shotsById = new Map(shots.map((shot) => [shot.id, shot]));
const coleShots = shots.filter(shotMentionsCole);
const coleShotIds = new Set(coleShots.map((shot) => shot.id));

const references = identityReferenceCandidates(nodes).slice(0, 4);
if (!references.length) {
  throw new Error("APPROVED_COLE_IDENTITY_IMAGE_REQUIRED");
}
const primaryReference = references[0];

const music = musicCandidates(nodes)[0] || null;
if (!music) throw new Error("SHOW_ME_LOVE_MASTER_AUDIO_REQUIRED");
const musicDuration = finite(music.technical?.duration_seconds, null);
if (musicDuration === null || musicDuration <= 0) {
  throw new Error("SHOW_ME_LOVE_MASTER_AUDIO_DURATION_REQUIRED");
}

const timeline = nodesById.get(TIMELINE_ID) || nodes
  .filter((node) => node.type === CREATIVE_ASSET_NODE_TYPES.TIMELINE)
  .sort((left, right) => Date.parse(right.created_at || 0) - Date.parse(left.created_at || 0))[0];
if (!timeline) throw new Error("COLE_TIMELINE_REQUIRED");
const edits = list(timeline.metadata?.edit_decision_list);
if (!edits.length) throw new Error("COLE_TIMELINE_EDL_REQUIRED");
const timelineDuration = finite(timeline.technical?.duration_seconds, null) || edits.reduce(
  (maximum, edit) => Math.max(maximum, finite(edit.timeline_out_seconds, 0)),
  0,
);
if (timelineDuration <= 0) throw new Error("COLE_TIMELINE_DURATION_REQUIRED");
if (Math.abs(musicDuration - timelineDuration) > 1.5) {
  throw new Error(
    `SHOW_ME_LOVE_AUDIO_TIMELINE_DURATION_MISMATCH:${musicDuration}:${timelineDuration}`,
  );
}

const priorRender = nodesById.get(PRIOR_RENDER_ID) || nodes
  .filter((node) => node.type === CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER)
  .sort((left, right) => Date.parse(right.created_at || 0) - Date.parse(left.created_at || 0))[0];
if (!priorRender) throw new Error("PRIOR_MASTER_RENDER_REQUIRED");
const priorProfile = object(priorRender.metadata?.export_profile);
if (!Object.keys(priorProfile).length) {
  throw new Error("PRIOR_MASTER_EXPORT_PROFILE_REQUIRED");
}

const coleEdits = edits
  .map((edit, index) => {
    const shotId = shotIdForEdit(edit, nodesById, tasksById);
    const sourceNode = sourceNodeForEdit(edit, nodesById);
    const cole = Boolean(
      (shotId && coleShotIds.has(shotId)) ||
      isCole(edit) ||
      isCole(sourceNode),
    );
    return { edit, index, shotId, sourceNode, cole };
  })
  .filter((entry) => entry.cole);

if (!coleEdits.length) {
  throw new Error("NO_COLE_TIMELINE_ENTRIES_IDENTIFIED");
}
if (coleEdits.length > MAX_TASKS) {
  throw new Error(`COLE_PERFORMANCE_TASK_LIMIT_EXCEEDED:${coleEdits.length}:${MAX_TASKS}`);
}

const baseVideoTask = tasks.find((task) =>
  ["GENERATE_VIDEO", "IMAGE_TO_VIDEO"].includes(task.type) &&
  task.service_id,
);
if (!baseVideoTask) throw new Error("COLE_VIDEO_SERVICE_TASK_TEMPLATE_REQUIRED");

console.log("============================================================");
console.log("SHOW ME LOVE — COLE PERFORMANCE REPAIR");
console.log("============================================================");
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`PROJECT_ID=${PROJECT_ID}`);
console.log(`SOURCE_TIMELINE_ID=${timeline.id}`);
console.log(`PRIOR_RENDER_ID=${priorRender.id}`);
console.log(`APPROVED_NARRATIVE_EDITS_PRESERVED=${edits.length - coleEdits.length}`);
console.log(`COLE_EDITS_TO_REGENERATE=${coleEdits.length}`);
console.log(`COLE_REFERENCE_NODE_ID=${primaryReference.id}`);
console.log(`MUSIC_NODE_ID=${music.id}`);
console.log(`MUSIC_DURATION=${musicDuration}`);
console.log(`TIMELINE_DURATION=${timelineDuration}`);
console.log(`EXECUTE=${EXECUTE ? "YES" : "NO"}`);
console.log("============================================================");

if (!EXECUTE) {
  console.log("DRY_RUN_COMPLETE=YES");
  console.log("No provider calls, database writes or render were executed.");
  process.exit(0);
}

await AssetGraphRepository.update(music.id, {
  metadata: {
    ...(music.metadata || {}),
    include_in_master: true,
    primary_master_audio: true,
    render_role: "PRIMARY_MASTER_MUSIC",
    timeline_in_seconds: 0,
    source_in_seconds: 0,
    duration_seconds: timelineDuration,
    gain: 1,
    original_audio_required: true,
    exact_song_master: true,
    attached_for_render_at: new Date().toISOString(),
  },
});

const replacementByEditIndex = new Map();
const deadline = Date.now() + TIMEOUT_MINUTES * 60 * 1000;

for (const entry of coleEdits) {
  const duration = entryDuration(entry.edit);
  if (duration === null || duration <= 0 || duration > 10) {
    throw new Error(`COLE_EDIT_DURATION_UNSUPPORTED:${entry.index}:${duration}`);
  }
  const shot = entry.shotId ? shotsById.get(entry.shotId) : null;
  const repairIdentity = hash({
    project_id: PROJECT_ID,
    timeline_id: timeline.id,
    edit_index: entry.index,
    shot_id: entry.shotId,
    identity_reference_ids: references.map((node) => node.id),
    version: 1,
  });
  let task = tasks.find((candidate) =>
    candidate.metadata?.cole_performance_repair_identity === repairIdentity,
  ) || null;

  const prompt = performancePrompt({
    shot,
    edit: entry.edit,
    duration,
    referenceNodes: references,
  });
  const input = {
    ...object(baseVideoTask.input),
    prompt,
    promptText: prompt,
    provider_prompt: prompt,
    prompt_image: primaryReference.url,
    image: primaryReference.url,
    assets: references.map((node) => ({
      id: node.id,
      asset_id: node.creative_asset_id || node.id,
      url: node.url,
      role: "COLE_IDENTITY_REFERENCE",
    })),
    source_assets: references.map((node) => ({
      id: node.id,
      asset_id: node.creative_asset_id || node.id,
      url: node.url,
      role: "COLE_IDENTITY_REFERENCE",
    })),
    duration_seconds: providerDuration(duration),
    intent: {
      ...object(baseVideoTask.input?.intent),
      subject: "Cole Ley",
      action: "Cole actively sings and performs the song to camera",
      purpose: "Replace only the Cole performance entry while preserving the approved story edit",
      emotion: shot?.metadata?.emotion || shot?.emotion || "emotionally committed and authentic",
    },
    requirements: {
      ...object(baseVideoTask.input?.requirements),
      subject: "Cole Ley",
      actors: ["Cole Ley"],
      active_singing_required: true,
      identity_lock_required: true,
      approved_identity_reference_node_ids: references.map((node) => node.id),
      preserve_existing_scene_direction: true,
      replace_narrative_scenes: false,
      usable_duration_seconds: duration,
      timeline_in_seconds: finite(entry.edit.timeline_in_seconds, null),
      timeline_out_seconds: finite(entry.edit.timeline_out_seconds, null),
    },
    restrictions: {
      ...object(baseVideoTask.input?.restrictions),
      preserve_identity: true,
      preserve_ethnicity: true,
      no_identity_drift: true,
      no_generic_ai_face: true,
      no_silent_walking_only_action: true,
      no_extra_singer: true,
      no_duplicate_subject: true,
    },
    output_spec: {
      ...object(baseVideoTask.input?.output_spec),
      duration_seconds: providerDuration(duration),
      aspect_ratio:
        baseVideoTask.input?.output_spec?.aspect_ratio ||
        baseVideoTask.input?.aspect_ratio ||
        "16:9",
    },
    generation: {
      ...object(baseVideoTask.input?.generation),
      provider_prompt: prompt,
      output_spec: {
        ...object(baseVideoTask.input?.generation?.output_spec),
        duration_seconds: providerDuration(duration),
        aspect_ratio:
          baseVideoTask.input?.generation?.output_spec?.aspect_ratio ||
          baseVideoTask.input?.output_spec?.aspect_ratio ||
          "16:9",
      },
    },
  };

  if (!task) {
    task = await ProductionTaskRuntime.create({
      organization_id: organizationId,
      creative_project_id: PROJECT_ID,
      production_graph_id: baseVideoTask.production_graph_id || null,
      scene_id: shot?.scene_id || baseVideoTask.scene_id || null,
      shot_id: entry.shotId || null,
      type: "GENERATE_VIDEO",
      status: "READY",
      title: `Cole performance repair ${entry.index + 1}`,
      description: "Identity-locked active singing performance replacement",
      service_id: baseVideoTask.service_id,
      service_code: baseVideoTask.service_code || baseVideoTask.service_id,
      capability: baseVideoTask.capability || "ai.video.generate",
      provider_id: baseVideoTask.provider_id || "runway",
      priority: 10 + entry.index,
      input,
      cost: {
        ...object(baseVideoTask.cost),
        approved: true,
      },
      review: {
        required: true,
        approved: false,
        notes: "Must verify Cole identity and active singing performance before release.",
      },
      metadata: {
        cole_performance_repair_identity: repairIdentity,
        source_timeline_asset_node_id: timeline.id,
        source_edit_index: entry.index,
        preserve_approved_narrative: true,
        identity_reference_node_ids: references.map((node) => node.id),
      },
    });
  } else if (task.status === "FAILED") {
    task = await ProductionTaskRuntime.update(task.id, {
      status: "READY",
      input,
      output: {},
      error: null,
      timing: {
        ...(task.timing || {}),
        started_at: null,
        completed_at: null,
      },
    });
  }

  if (task.status !== "COMPLETED") {
    try {
      task = await ProductionTaskRuntime.dispatch(task.id);
    } catch (error) {
      if (creditFailure(error)) {
        console.error(`RUNWAY_CREDIT_CIRCUIT_BREAKER=OPEN`);
        console.error(`FAILED_TASK_ID=${task.id}`);
        console.error(`ERROR=${error.message}`);
        throw new Error("RUNWAY_CREDITS_REQUIRED_BEFORE_COLE_PERFORMANCE_REPAIR");
      }
      throw error;
    }
  }

  while (task.status === "RUNNING") {
    if (Date.now() > deadline) {
      throw new Error(`COLE_PERFORMANCE_TIMEOUT:${task.id}`);
    }
    await sleep(POLL_SECONDS * 1000);
    task = await ProductionTaskRuntime.poll(task.id);
  }
  if (task.status !== "COMPLETED") {
    throw new Error(`COLE_PERFORMANCE_TASK_FAILED:${task.id}:${task.error || task.status}`);
  }

  const assetNodeId = task.output?.asset_node_id;
  if (!assetNodeId) throw new Error(`COLE_PERFORMANCE_ASSET_NODE_REQUIRED:${task.id}`);
  const replacementNode = await AssetGraphRepository.getById(assetNodeId);
  if (!replacementNode?.url) {
    throw new Error(`COLE_PERFORMANCE_ASSET_URL_REQUIRED:${assetNodeId}`);
  }
  const generatedDuration = finite(replacementNode.technical?.duration_seconds, null);
  if (generatedDuration !== null && generatedDuration + 0.05 < duration) {
    throw new Error(
      `COLE_PERFORMANCE_ASSET_TOO_SHORT:${assetNodeId}:${generatedDuration}:${duration}`,
    );
  }
  replacementByEditIndex.set(entry.index, replacementNode);
  console.log(
    `COLE_PERFORMANCE_COMPLETED=${entry.index + 1}/${coleEdits.length}|task:${task.id}|asset:${replacementNode.id}`,
  );
}

const repairedEdits = edits.map((edit, index) => {
  const replacement = replacementByEditIndex.get(index);
  if (!replacement) return edit;
  const duration = entryDuration(edit);
  return {
    ...edit,
    source_url: replacement.url,
    source_asset_node_id: replacement.id,
    source_clip_node_id: null,
    source_moment_node_id: null,
    source_in_seconds: 0,
    source_out_seconds: duration,
    duration_seconds: duration,
    cole_performance_replacement: true,
    original_source_asset_node_id:
      edit.original_source_asset_node_id || edit.source_asset_node_id || null,
  };
});

const repairedTimelineIdentity = hash({
  parent_timeline_id: timeline.id,
  edit_sources: repairedEdits.map((edit) => ({
    source_asset_node_id: edit.source_asset_node_id,
    source_in_seconds: edit.source_in_seconds,
    source_out_seconds: edit.source_out_seconds,
    timeline_in_seconds: edit.timeline_in_seconds,
    timeline_out_seconds: edit.timeline_out_seconds,
  })),
  music_asset_node_id: music.id,
  identity_reference_node_ids: references.map((node) => node.id),
  version: 1,
});

const repairedTimeline = await AssetGraphRepository.create(
  createCreativeAssetNode({
    organization_id: organizationId,
    creative_project_id: PROJECT_ID,
    parent_asset_node_id: timeline.id,
    type: CREATIVE_ASSET_NODE_TYPES.TIMELINE,
    status: "REVIEW",
    name: "Show Me Love — Cole identity-locked performance timeline",
    description: "Approved narrative edit preserved; only Cole performance entries regenerated and full master song attached.",
    lineage: {
      source: "cole_performance_repair",
      capability: "creative.timeline.performance_repair",
      generation_version: 1,
    },
    technical: {
      ...(timeline.technical || {}),
      duration_seconds: timelineDuration,
    },
    review: {
      ai_reviewed: true,
      human_reviewed: false,
      approved: false,
      notes: "Requires human review of Cole identity fidelity and singing performance.",
    },
    metadata: {
      ...(timeline.metadata || {}),
      format: "AVANTIQO_EDL_V1",
      edit_decision_list: repairedEdits,
      timeline_identity: repairedTimelineIdentity,
      source_timeline_asset_node_id: timeline.id,
      cole_performance_repair: true,
      cole_replaced_edit_count: replacementByEditIndex.size,
      approved_narrative_edit_count: edits.length - replacementByEditIndex.size,
      identity_reference_node_ids: references.map((node) => node.id),
      primary_music_asset_node_id: music.id,
      missing_requirements: [],
    },
  }),
);

const priorTracks = object(priorRender.metadata?.tracks);
const exportProfile = {
  ...priorProfile,
  include_source_audio: false,
  includeSourceAudio: false,
  audio_codec: priorProfile.audio_codec || priorProfile.audioCodec || "aac",
  audio_bitrate: priorProfile.audio_bitrate || priorProfile.audioBitrate || "320k",
  sample_rate: priorProfile.sample_rate || priorProfile.sampleRate || 48000,
  audio_channels: priorProfile.audio_channels || priorProfile.audioChannels || 2,
  audio_channel_layout:
    priorProfile.audio_channel_layout ||
    priorProfile.audioChannelLayout ||
    "stereo",
  duration_tolerance_seconds:
    priorProfile.duration_tolerance_seconds ??
    priorProfile.durationToleranceSeconds ??
    0.75,
};
const tracks = {
  ...priorTracks,
  audio: [{
    asset_node_id: music.id,
    timeline_in_seconds: 0,
    source_in_seconds: 0,
    duration_seconds: timelineDuration,
    gain: 1,
    role: "PRIMARY_MASTER_MUSIC",
  }],
};

const rendered = await CreativeEdlRenderRuntime.render({
  organization_id: organizationId,
  timeline_asset_node_id: repairedTimeline.id,
  export_profile: exportProfile,
  tracks,
  policy: {
    ...object(project.metadata?.post_production?.render),
    ...object(project.metadata?.render),
  },
  force: true,
});

if (rendered.technical_qc?.passed !== true) {
  throw new Error(
    `COLE_AUDIO_MASTER_TECHNICAL_QC_FAILED:${list(rendered.technical_qc?.failed_checks).join(",")}`,
  );
}
const finalTechnical = rendered.render?.technical || {};
const hasAudio = Boolean(
  finalTechnical.audio_codec ||
  list(finalTechnical.streams).some((stream) => stream.codec_type === "audio"),
);
if (!hasAudio) throw new Error("COLE_AUDIO_MASTER_AUDIO_STREAM_REQUIRED");
const finalDuration = finite(finalTechnical.duration_seconds, null);
if (finalDuration === null || Math.abs(finalDuration - timelineDuration) > 0.75) {
  throw new Error(
    `COLE_AUDIO_MASTER_DURATION_INVALID:${finalDuration}:${timelineDuration}`,
  );
}

console.log("============================================================");
console.log("COLE PERFORMANCE AND AUDIO MASTER COMPLETE");
console.log("============================================================");
console.log(`REPAIRED_TIMELINE_ID=${repairedTimeline.id}`);
console.log(`FINAL_RENDER_ID=${rendered.render.id}`);
console.log(`FINAL_RENDER_URL=${rendered.render.url}`);
console.log(`FINAL_DURATION_SECONDS=${finalDuration}`);
console.log(`FINAL_AUDIO_CODEC=${finalTechnical.audio_codec || "present"}`);
console.log(`APPROVED_NARRATIVE_EDITS_PRESERVED=${edits.length - replacementByEditIndex.size}`);
console.log(`COLE_PERFORMANCE_EDITS_REPLACED=${replacementByEditIndex.size}`);
console.log("HUMAN_REVIEW_REQUIRED=YES");
console.log("============================================================");

#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function rounded(value, precision = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const factor = 10 ** precision;
  return Math.round(number * factor) / factor;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
  );
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(canonical(value)))
    .digest("hex");
}

function readJson(filePath, label) {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`${label}_FILE_NOT_FOUND:${absolute}`);
  }
  const raw = fs.readFileSync(absolute, "utf8");
  return { absolute, raw, value: JSON.parse(raw) };
}

function directionPlan(value = {}) {
  return object(
    value.plan ||
      value.direction?.plan ||
      value.output?.plan ||
      value,
  );
}

function normalizedId(value) {
  if (typeof value === "string" || typeof value === "number") {
    return text(value);
  }
  return text(
    value?.asset_id ||
      value?.assetId ||
      value?.creative_asset_id ||
      value?.creativeAssetId ||
      value?.id,
  );
}

function uniqueIds(values = []) {
  return [...new Set(list(values).map(normalizedId).filter(Boolean))];
}

function compact(values = []) {
  return values.map(text).filter(Boolean);
}

function shotGenerationNode(graph = {}, shot = {}, fallbackIndex = 0) {
  const shotId = text(shot.id);
  const candidates = list(graph.nodes).filter((node) => {
    if (node.generation?.required !== true) return false;
    const service = text(
      node.generation?.capability || node.generation?.service,
    ).toLowerCase();
    if (!service.includes("video")) return false;
    return (
      text(node.id) === shotId ||
      text(node.metadata?.shot_id) === shotId ||
      text(node.metadata?.final_shot_node_id) === shotId ||
      text(node.intent?.shot_id) === shotId
    );
  });
  if (candidates[0]) return candidates[0];
  return list(graph.nodes)
    .filter((node) => {
      const service = text(
        node.generation?.capability || node.generation?.service,
      ).toLowerCase();
      return node.generation?.required === true && service.includes("video");
    })[fallbackIndex] || null;
}

function perceptualNodeFor(graph = {}, generationNode = {}) {
  if (!generationNode?.id) return null;
  return list(graph.nodes).find((node) =>
    text(node.type).toUpperCase() === "GENERATED_MEDIA_PERCEPTUAL_REVIEW" &&
    text(node.metadata?.source_generation_node_id) === text(generationNode.id),
  ) || null;
}

function dependenciesFor(graph = {}, node = {}) {
  if (!node?.id) return [];
  return list(graph.edges)
    .filter((edge) =>
      edge.type === "DEPENDS_ON" && text(edge.to) === text(node.id),
    )
    .map((edge) => text(edge.from))
    .filter(Boolean);
}

function actorNames(actors = []) {
  return compact(list(actors).map((actor) =>
    typeof actor === "string"
      ? actor
      : actor?.name || actor?.label || actor?.role || actor?.id,
  ));
}

function productNames(products = []) {
  return compact(list(products).map((product) =>
    typeof product === "string"
      ? product
      : product?.name || product?.label || product?.role || product?.id,
  ));
}

function cameraSummary(shot = {}, node = {}) {
  const camera = object(shot.camera || node.requirements?.camera);
  const movementMotivation =
    camera.movement_motivation ||
    camera.movementMotivation ||
    camera.motivation ||
    camera.why ||
    shot.camera_movement_motivation ||
    shot.cameraMovementMotivation ||
    null;
  const movement =
    camera.movement_path ||
    camera.movementPath ||
    camera.movement_type ||
    camera.movementType ||
    camera.camera_movement ||
    camera.cameraMovement ||
    camera.movement ||
    camera.move ||
    camera.motion ||
    shot.camera_movement_path ||
    shot.cameraMovementPath ||
    shot.camera_movement ||
    shot.cameraMovement ||
    null;

  return {
    movement,
    movement_motivation: movementMotivation,
    framing:
      camera.framing ||
      camera.shot_size ||
      camera.shotSize ||
      camera.scale ||
      shot.shot_scale ||
      shot.shotScale ||
      shot.framing ||
      null,
    lens:
      camera.lens ||
      camera.focal_length ||
      camera.focalLength ||
      camera.lens_language ||
      camera.lensLanguage ||
      null,
    angle:
      camera.angle ||
      camera.perspective ||
      camera.height ||
      null,
    speed:
      camera.speed ||
      camera.pacing ||
      null,
  };
}

function sourceBinding(shot = {}, node = {}) {
  const generation = object(node.generation);
  const requirements = object(node.requirements);
  const metadata = object(node.metadata);
  const primary = text(
    shot.primary_source_asset_id ||
      shot.generation?.primary_source_asset_id ||
      shot.metadata?.primary_source_asset_id ||
      generation.primary_source_asset_id ||
      requirements.primary_source_asset_id ||
      metadata.primary_source_asset_id,
  );
  const references = uniqueIds([
    ...list(shot.reference_asset_ids),
    ...list(requirements.reference_asset_ids),
    ...list(metadata.reference_asset_ids),
    ...list(node.assets),
  ]);
  return {
    primary_source_asset_id: primary || null,
    reference_asset_ids: references,
    source_binding_contract:
      generation.source_binding_contract ||
      requirements.source_binding_contract ||
      metadata.source_binding_contract ||
      null,
    provider_asset_scope:
      requirements.asset_scope ||
      generation.provider_parameters?.asset_scope ||
      null,
  };
}

function framePlan(shot = {}, node = {}) {
  const frames = object(shot.frame_plan || node.metadata?.frame_plan);
  return {
    opening:
      frames.opening_frame ||
      shot.opening_frame ||
      node.intent?.opening_frame ||
      node.requirements?.opening_frame ||
      null,
    progression:
      frames.progression_frames ||
      frames.progression ||
      shot.progression_frames ||
      node.intent?.progression_frames ||
      node.requirements?.progression_frames ||
      null,
    closing:
      frames.closing_frame ||
      shot.closing_frame ||
      node.intent?.closing_frame ||
      node.requirements?.closing_frame ||
      null,
  };
}

function audioSummary(shot = {}, scene = {}) {
  const audio = object(shot.audio || shot.sound_design || scene.audio_style);
  return {
    music:
      audio.music ||
      shot.music ||
      shot.music_intelligence ||
      null,
    ambience:
      audio.ambience ||
      audio.environment ||
      audio.room_tone ||
      null,
    sound_effects:
      audio.sound_effects ||
      shot.sound_effects ||
      [],
    dialogue: shot.dialogue || [],
    narration: shot.narration || null,
  };
}

function forbiddenSummary(shot = {}, node = {}) {
  return compact([
    ...list(shot.must_avoid),
    ...list(shot.negative_constraints),
    ...list(shot.metadata?.must_avoid),
    ...list(node.requirements?.must_avoid),
    ...list(node.requirements?.negative_constraints),
  ]);
}

function shotReview({ scene, shot, graph, globalIndex }) {
  const node = shotGenerationNode(graph, shot, globalIndex);
  const reviewNode = perceptualNodeFor(graph, node);
  const camera = cameraSummary(shot, node || {});
  const source = sourceBinding(shot, node || {});
  const frames = framePlan(shot, node || {});
  const audio = audioSummary(shot, scene);
  const provider = text(node?.generation?.provider) || "AUTO";
  const model = text(node?.generation?.model) || null;
  const service = text(
    node?.generation?.capability || node?.generation?.service,
  );
  const duration = finite(
    shot.duration_seconds ?? node?.duration_seconds ?? node?.generation?.estimated_seconds,
    0,
  );
  const reviewThresholds = object(
    reviewNode?.requirements?.thresholds ||
      reviewNode?.metadata?.thresholds,
  );
  const warnings = [];

  if (!node) warnings.push("No matching video generation node");
  if (!source.primary_source_asset_id && !source.reference_asset_ids.length) {
    warnings.push("No explicit source or reference asset binding visible");
  }
  if (!text(camera.movement)) warnings.push("Camera movement not explicit");
  if (!text(camera.movement_motivation)) {
    warnings.push("Camera movement motivation not explicit");
  }
  if (!text(frames.opening)) warnings.push("Opening frame not explicit");
  if (!text(frames.closing)) warnings.push("Closing frame not explicit");
  if (!reviewNode) warnings.push("Perceptual review node missing");

  return {
    id: text(shot.id) || `shot-${globalIndex + 1}`,
    scene_id: text(scene.id),
    scene_number: finite(scene.scene_number, null),
    shot_number: finite(shot.shot_number, null),
    title: text(shot.title) || `Shot ${globalIndex + 1}`,
    duration_seconds: duration,
    purpose: shot.purpose || node?.intent?.purpose || null,
    action: shot.action || node?.intent?.action || node?.requirements?.action || null,
    actors: actorNames(shot.actors || node?.requirements?.actors),
    products: productNames(shot.products || node?.requirements?.products),
    location: shot.location || node?.requirements?.location || scene.location || null,
    emotion: shot.emotion || scene.emotion || node?.requirements?.mood || null,
    performance:
      shot.performance ||
      shot.performance_direction ||
      node?.requirements?.performance_direction ||
      null,
    frames,
    camera,
    lighting: shot.lighting || node?.requirements?.lighting || null,
    production_design:
      shot.production_design || node?.requirements?.production_design || null,
    wardrobe: shot.wardrobe || node?.requirements?.wardrobe || [],
    props: shot.props || node?.requirements?.props || [],
    continuity: shot.continuity || node?.requirements?.continuity || null,
    transitions: {
      in: shot.transition_in || node?.requirements?.transition_in || null,
      out: shot.transition_out || node?.requirements?.transition_out || null,
    },
    audio,
    source_binding: source,
    generation: {
      node_id: node?.id || null,
      service: service || null,
      provider,
      model,
      output_spec:
        node?.generation?.output_spec ||
        node?.requirements?.output_spec ||
        shot.output_spec ||
        null,
      estimated_seconds: finite(node?.generation?.estimated_seconds, duration),
      dependencies: dependenciesFor(graph, node || {}),
    },
    perceptual_review: {
      required: Boolean(reviewNode),
      node_id: reviewNode?.id || null,
      provider: reviewNode?.generation?.provider || null,
      service:
        reviewNode?.generation?.capability ||
        reviewNode?.generation?.service ||
        null,
      thresholds: reviewThresholds,
      reject_before_editing:
        reviewNode?.requirements?.reject_before_editing === true ||
        reviewNode?.metadata?.reject_before_editing === true,
    },
    must_avoid: forbiddenSummary(shot, node || {}),
    human_review_warnings: warnings,
    human_review_ready: warnings.length === 0,
  };
}

function sceneReview(scene = {}, shots = []) {
  return {
    id: text(scene.id),
    scene_number: finite(scene.scene_number, null),
    title: text(scene.title) || "Untitled scene",
    duration_seconds: finite(scene.duration_seconds, 0),
    objective: scene.objective || null,
    story_function:
      scene.story_function || scene.metadata?.story_function || null,
    emotion: scene.emotion || null,
    location: scene.location || null,
    actors: actorNames(scene.actors),
    products: productNames(scene.products),
    visual_style: scene.visual_style || null,
    camera_style: scene.camera_style || null,
    audio_style: scene.audio_style || null,
    brand_rules: list(scene.brand_rules),
    continuity_from_previous:
      scene.continuity_from_previous ||
      scene.metadata?.continuity_from_previous ||
      null,
    continuity_to_next:
      scene.continuity_to_next ||
      scene.metadata?.continuity_to_next ||
      null,
    shots,
  };
}

function markdownValue(value) {
  const rendered = text(value);
  return rendered || "—";
}

function markdownList(values = []) {
  const items = list(values).map(text).filter(Boolean);
  return items.length ? items.join(", ") : "—";
}

function buildMarkdown(review = {}) {
  const lines = [
    "# Churchill 60-Second Film — Final Human Production Review",
    "",
    `**Review contract:** ${review.contract}`,
    `**Direction SHA-256:** ${review.direction_sha256}`,
    `**Approval manifest:** ${review.approval_manifest_hash}`,
    `**Graph preview:** ${review.graph_preview_hash}`,
    `**Selected baseline:** ${review.cost.selected_baseline} ${review.cost.currency}`,
    `**Hard approval ceiling:** ${review.cost.approval_ceiling} ${review.cost.currency}`,
    `**Production authorized:** NO`,
    `**Publication authorized:** NO`,
    "",
    "## Creative north star",
    "",
    `**Title:** ${markdownValue(review.creative.title)}`,
    `**Thesis:** ${markdownValue(review.creative.thesis)}`,
    `**Message:** ${markdownValue(review.creative.message)}`,
    `**Narrative:** ${markdownValue(review.creative.narrative)}`,
    `**Emotional promise:** ${markdownValue(review.creative.emotional_promise)}`,
    `**Audience:** ${markdownValue(review.creative.audience)}`,
    `**Music world:** ${markdownValue(review.creative.music_world)}`,
    "",
    "## Production summary",
    "",
    `- Scenes: ${review.summary.scene_count}`,
    `- Shots: ${review.summary.shot_count}`,
    `- Duration: ${review.summary.duration_seconds} seconds`,
    `- Runway generations: ${review.summary.video_generation_count}`,
    `- OpenAI perceptual reviews: ${review.summary.perceptual_review_count}`,
    `- FAL soundtrack generations: ${review.summary.soundtrack_generation_count}`,
    `- Prompt fields persisted: ${review.summary.persisted_prompt_field_count}`,
    `- Transport instructions: ${review.summary.transport_instruction_count}`,
    `- Human-review warnings: ${review.summary.human_review_warning_count}`,
    "",
  ];

  for (const scene of review.scenes) {
    lines.push(
      `## Scene ${scene.scene_number ?? "?"}: ${scene.title}`,
      "",
      `**Duration:** ${scene.duration_seconds}s`,
      `**Story function:** ${markdownValue(scene.story_function)}`,
      `**Objective:** ${markdownValue(scene.objective)}`,
      `**Emotion:** ${markdownValue(scene.emotion)}`,
      `**Location:** ${markdownValue(scene.location)}`,
      `**Actors:** ${markdownList(scene.actors)}`,
      `**Products:** ${markdownList(scene.products)}`,
      `**Visual style:** ${markdownValue(scene.visual_style)}`,
      `**Camera style:** ${markdownValue(scene.camera_style)}`,
      `**Audio style:** ${markdownValue(scene.audio_style)}`,
      `**Brand rules:** ${markdownList(scene.brand_rules)}`,
      "",
    );

    for (const shot of scene.shots) {
      lines.push(
        `### Shot ${shot.scene_number ?? "?"}.${shot.shot_number ?? "?"}: ${shot.title}`,
        "",
        `**Duration:** ${shot.duration_seconds}s`,
        `**Purpose:** ${markdownValue(shot.purpose)}`,
        `**Visible action:** ${markdownValue(shot.action)}`,
        `**Performance:** ${markdownValue(shot.performance)}`,
        `**Actors:** ${markdownList(shot.actors)}`,
        `**Products:** ${markdownList(shot.products)}`,
        `**Location:** ${markdownValue(shot.location)}`,
        `**Opening frame:** ${markdownValue(shot.frames.opening)}`,
        `**Progression:** ${markdownValue(shot.frames.progression)}`,
        `**Closing frame:** ${markdownValue(shot.frames.closing)}`,
        `**Camera movement:** ${markdownValue(shot.camera.movement)}`,
        `**Why camera moves:** ${markdownValue(shot.camera.movement_motivation)}`,
        `**Framing:** ${markdownValue(shot.camera.framing)}`,
        `**Lens / angle:** ${markdownValue({ lens: shot.camera.lens, angle: shot.camera.angle })}`,
        `**Lighting:** ${markdownValue(shot.lighting)}`,
        `**Production design:** ${markdownValue(shot.production_design)}`,
        `**Transition in:** ${markdownValue(shot.transitions.in)}`,
        `**Transition out:** ${markdownValue(shot.transitions.out)}`,
        `**Music / ambience / SFX:** ${markdownValue(shot.audio)}`,
        `**Primary source asset:** ${markdownValue(shot.source_binding.primary_source_asset_id)}`,
        `**Reference assets:** ${markdownList(shot.source_binding.reference_asset_ids)}`,
        `**Generation:** ${markdownValue({ service: shot.generation.service, provider: shot.generation.provider, model: shot.generation.model })}`,
        `**Perceptual review:** ${markdownValue({ node: shot.perceptual_review.node_id, thresholds: shot.perceptual_review.thresholds, reject_before_editing: shot.perceptual_review.reject_before_editing })}`,
        `**Must avoid:** ${markdownList(shot.must_avoid)}`,
        `**Review warnings:** ${markdownList(shot.human_review_warnings)}`,
        "",
      );
    }
  }

  lines.push(
    "## Soundtrack",
    "",
    `**Node:** ${markdownValue(review.soundtrack?.node_id)}`,
    `**Provider / model:** ${markdownValue({ provider: review.soundtrack?.provider, model: review.soundtrack?.model })}`,
    `**Duration:** ${review.soundtrack?.duration_seconds ?? 0}s`,
    `**Creative direction:** ${markdownValue(review.soundtrack?.intent)}`,
    `**Rights and constraints:** ${markdownValue(review.soundtrack?.requirements)}`,
    "",
    "## Approval decision",
    "",
    `**Technical readiness:** ${review.readiness}`,
    `**Blockers:** ${markdownList(review.blockers)}`,
    "",
    "No production graph, execution plan, task, provider call, usage record, wallet reservation, wallet charge, or publication was authorized or created by this review.",
    "",
  );
  return `${lines.join("\n")}\n`;
}

const direction = readJson(process.argv[2], "DIRECTION");
const graphPreview = readJson(process.argv[3], "GRAPH_PREVIEW");
const manifest = readJson(process.argv[4], "APPROVAL_MANIFEST");
const persistenceAudit = readJson(process.argv[5], "PERSISTENCE_AUDIT");

const plan = directionPlan(direction.value);
const graph = object(graphPreview.value.graph);
const previewSummary = object(graphPreview.value.summary);
const nestedPersistenceSummary = object(persistenceAudit.value.summary);
const persistenceSummary = Object.keys(nestedPersistenceSummary).length
  ? nestedPersistenceSummary
  : persistenceAudit.value;
const blockers = [];

if (list(manifest.value.blockers).length) {
  blockers.push(...manifest.value.blockers.map((item) => `MANIFEST:${item}`));
}
if (graphPreview.value.readiness !== "PASS") {
  blockers.push("GRAPH_PREVIEW_NOT_READY");
}
if (persistenceAudit.value.readiness !== "PASS") {
  blockers.push("PROMPTLESS_PERSISTENCE_NOT_READY");
}
if (manifest.value.direction?.sha256 !== digest(direction.raw)) {
  blockers.push("DIRECTION_HASH_MISMATCH");
}
if (graphPreview.value.direction_sha256 !== digest(direction.raw)) {
  blockers.push("GRAPH_PREVIEW_DIRECTION_HASH_MISMATCH");
}
if (
  graphPreview.value.approval_manifest_hash !==
  manifest.value.manifest_hash
) {
  blockers.push("GRAPH_PREVIEW_MANIFEST_HASH_MISMATCH");
}

const sceneSources = list(plan.scenes);
const reviews = [];
let globalShotIndex = 0;
for (const [sceneIndex, scene] of sceneSources.entries()) {
  const sceneShots = [];
  for (const shot of list(scene.shots)) {
    sceneShots.push(shotReview({
      scene: {
        ...scene,
        scene_number: finite(scene.scene_number, sceneIndex + 1),
      },
      shot: {
        ...shot,
        scene_number: finite(scene.scene_number, sceneIndex + 1),
        shot_number: finite(shot.shot_number, sceneShots.length + 1),
      },
      graph,
      globalIndex: globalShotIndex,
    }));
    globalShotIndex += 1;
  }
  reviews.push(sceneReview({
    ...scene,
    scene_number: finite(scene.scene_number, sceneIndex + 1),
  }, sceneShots));
}

const allShots = reviews.flatMap((scene) => scene.shots);
const soundtrackNode = list(graph.nodes).find((node) =>
  text(node.generation?.capability || node.generation?.service)
    .toLowerCase()
    .includes("music"),
) || null;
const warningCount = allShots.reduce(
  (sum, shot) => sum + shot.human_review_warnings.length,
  0,
);
const videoGenerationCount = Number(
  previewSummary.shot_generation_count ??
    previewSummary.video_generation_count ??
    0,
);
const perceptualReviewCount = Number(
  previewSummary.perceptual_review_count ?? 0,
);
const soundtrackGenerationCount = Number(
  previewSummary.soundtrack_generation_count ?? 0,
);
const graphPromptFieldCount = Number(
  persistenceSummary.graph_prompt_field_count ??
    list(persistenceAudit.value.graph_prompt_field_paths).length,
);
const executionPromptFieldCount = Number(
  persistenceSummary.execution_prompt_field_count ??
    list(persistenceAudit.value.execution_prompt_field_paths).length,
);
const taskPromptFieldCount = Number(
  persistenceSummary.task_prompt_field_count ??
    list(persistenceAudit.value.task_prompt_field_paths).length,
);
const transportInstructionCount = Number(
  persistenceSummary.transport_instruction_count ??
    persistenceAudit.value.transport_instruction_count ??
    0,
);
const durationSeconds = rounded(
  allShots.reduce(
    (sum, shot) => sum + Number(shot.duration_seconds || 0),
    0,
  ),
  3,
);

if (reviews.length !== 7) blockers.push("SCENE_COUNT_NOT_SEVEN");
if (allShots.length !== 13) blockers.push("SHOT_COUNT_NOT_THIRTEEN");
if (Math.abs(durationSeconds - 60) > 0.01) blockers.push("DURATION_NOT_SIXTY_SECONDS");
if (!soundtrackNode) blockers.push("SOUNDTRACK_NODE_MISSING");
if (videoGenerationCount !== 13) {
  blockers.push("VIDEO_GENERATION_COUNT_INVALID");
}
if (perceptualReviewCount !== 13) {
  blockers.push("PERCEPTUAL_REVIEW_COUNT_INVALID");
}
if (soundtrackGenerationCount !== 1) {
  blockers.push("SOUNDTRACK_GENERATION_COUNT_INVALID");
}
if (graphPromptFieldCount !== 0) {
  blockers.push("GRAPH_PROMPT_FIELDS_PRESENT");
}
if (executionPromptFieldCount !== 0) {
  blockers.push("EXECUTION_PROMPT_FIELDS_PRESENT");
}
if (taskPromptFieldCount !== 0) {
  blockers.push("TASK_PROMPT_FIELDS_PRESENT");
}
if (transportInstructionCount !== 27) {
  blockers.push("TRANSPORT_INSTRUCTION_COUNT_INVALID");
}
if (warningCount !== 0) {
  blockers.push("HUMAN_REVIEW_WARNINGS_PRESENT");
}

const reviewCore = {
  contract: "CREATIVE_HUMAN_PRODUCTION_REVIEW_V2",
  generated_at: new Date().toISOString(),
  organization_id: manifest.value.organization_id,
  creative_project_id: manifest.value.creative_project_id,
  creative_mission_id: manifest.value.creative_mission_id,
  command_identity: manifest.value.command_identity,
  direction_file: direction.absolute,
  direction_sha256: digest(direction.raw),
  graph_preview_file: graphPreview.absolute,
  graph_preview_hash: digest(graphPreview.raw),
  approval_manifest_file: manifest.absolute,
  approval_manifest_hash: manifest.value.manifest_hash,
  persistence_audit_file: persistenceAudit.absolute,
  persistence_audit_hash: digest(persistenceAudit.raw),
  creative: {
    title: plan.concept?.title || null,
    thesis:
      plan.concept?.creative_thesis ||
      plan.creative_thesis ||
      null,
    message: plan.concept?.message || null,
    narrative: plan.concept?.narrative || null,
    emotional_promise:
      plan.concept?.emotional_promise ||
      plan.story?.emotional_arc ||
      null,
    audience:
      plan.concept?.target_audience ||
      plan.audience ||
      null,
    music_world: plan.music_world || null,
  },
  cost: {
    currency: manifest.value.currency,
    selected_baseline: manifest.value.cost_estimate?.selected_baseline,
    repair_reserve: manifest.value.cost_estimate?.one_shot_repair_reserve,
    approval_ceiling:
      manifest.value.authorization?.maximum_customer_price,
    wallet_balance: manifest.value.cost_estimate?.wallet_balance,
  },
  summary: {
    scene_count: reviews.length,
    shot_count: allShots.length,
    duration_seconds: durationSeconds,
    video_generation_count: videoGenerationCount,
    perceptual_review_count: perceptualReviewCount,
    soundtrack_generation_count: soundtrackGenerationCount,
    persisted_prompt_field_count:
      graphPromptFieldCount +
      executionPromptFieldCount +
      taskPromptFieldCount,
    human_review_warning_count: warningCount,
    transport_instruction_count: transportInstructionCount,
  },
  scenes: reviews,
  soundtrack: soundtrackNode
    ? {
        node_id: soundtrackNode.id,
        provider: soundtrackNode.generation?.provider || "AUTO",
        model: soundtrackNode.generation?.model || null,
        duration_seconds:
          finite(
            soundtrackNode.duration_seconds ??
            soundtrackNode.generation?.estimated_seconds,
            0,
          ),
        intent: soundtrackNode.intent || null,
        requirements: soundtrackNode.requirements || null,
        output_spec:
          soundtrackNode.generation?.output_spec ||
          soundtrackNode.requirements?.output_spec ||
          null,
      }
    : null,
  authorization: {
    production_authorized: false,
    graph_materialization_authorized: false,
    task_materialization_authorized: false,
    provider_calls_authorized: false,
    wallet_reservation_authorized: false,
    publication_authorized: false,
  },
  blockers,
  readiness: blockers.length ? "FAIL" : "PASS",
};

const review = {
  ...reviewCore,
  review_hash: digest(reviewCore),
};

const jsonOutput = path.resolve(
  text(process.env.HUMAN_PRODUCTION_REVIEW_JSON) ||
    "/tmp/churchill-human-production-review.json",
);
const markdownOutput = path.resolve(
  text(process.env.HUMAN_PRODUCTION_REVIEW_MARKDOWN) ||
    "/tmp/churchill-human-production-review.md",
);
fs.writeFileSync(jsonOutput, `${JSON.stringify(review, null, 2)}\n`, "utf8");
fs.writeFileSync(markdownOutput, buildMarkdown(review), "utf8");

console.log("============================================================");
console.log("CHURCHILL HUMAN PRODUCTION REVIEW PACKAGE");
console.log("============================================================");
console.log(`JSON_OUTPUT=${jsonOutput}`);
console.log(`MARKDOWN_OUTPUT=${markdownOutput}`);
console.log(`REVIEW_HASH=${review.review_hash}`);
console.log(`APPROVAL_MANIFEST_HASH=${review.approval_manifest_hash}`);
console.log(`SCENE_COUNT=${review.summary.scene_count}`);
console.log(`SHOT_COUNT=${review.summary.shot_count}`);
console.log(`DURATION_SECONDS=${review.summary.duration_seconds}`);
console.log(`VIDEO_GENERATION_COUNT=${review.summary.video_generation_count}`);
console.log(`PERCEPTUAL_REVIEW_COUNT=${review.summary.perceptual_review_count}`);
console.log(`SOUNDTRACK_GENERATION_COUNT=${review.summary.soundtrack_generation_count}`);
console.log(`PERSISTED_PROMPT_FIELD_COUNT=${review.summary.persisted_prompt_field_count}`);
console.log(`TRANSPORT_INSTRUCTION_COUNT=${review.summary.transport_instruction_count}`);
console.log(`HUMAN_REVIEW_WARNING_COUNT=${review.summary.human_review_warning_count}`);
console.log(`SELECTED_BASELINE=${review.cost.selected_baseline}`);
console.log(`APPROVAL_CEILING=${review.cost.approval_ceiling}`);
console.log(`HUMAN_PRODUCTION_REVIEW_READINESS=${review.readiness}`);
console.log(`HUMAN_PRODUCTION_REVIEW_BLOCKER_COUNT=${blockers.length}`);
console.log(`HUMAN_PRODUCTION_REVIEW_BLOCKERS=${JSON.stringify(blockers)}`);
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
console.log("GRAPH_CREATED=NO");
console.log("TASKS_CREATED=NO");
console.log("PRODUCTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("============================================================");

for (const scene of review.scenes) {
  console.log(
    `SCENE_REVIEW=${scene.scene_number}|${scene.title}|duration=${scene.duration_seconds}|shots=${scene.shots.length}|objective=${text(scene.objective).replaceAll("\n", " ")}`,
  );
  for (const shot of scene.shots) {
    console.log(
      `SHOT_REVIEW=${shot.scene_number}.${shot.shot_number}|${shot.title}|duration=${shot.duration_seconds}|provider=${shot.generation.provider}|service=${shot.generation.service}|source=${shot.source_binding.primary_source_asset_id || "NONE"}|references=${shot.source_binding.reference_asset_ids.length}|movement=${text(shot.camera.movement).replaceAll("\n", " ")}|motivation=${text(shot.camera.movement_motivation).replaceAll("\n", " ")}|warnings=${shot.human_review_warnings.length}`,
    );
  }
}

if (blockers.length) process.exitCode = 2;

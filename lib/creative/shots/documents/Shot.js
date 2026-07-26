export const SHOT_STATUS = {
  PLANNING: "PLANNING",
  READY: "READY",
  GENERATING: "GENERATING",
  REVIEW: "REVIEW",
  APPROVED: "APPROVED",
};

function array(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export function createShot(data = {}) {
  const now = new Date().toISOString();
  const generation = data.generation || data.metadata?.generation || {};

  return {
    id: data.id || crypto.randomUUID(),
    organization_id: data.organization_id,
    creative_project_id:
      data.creative_project_id || data.project_id || null,
    scene_id: data.scene_id || null,
    storyboard_id: data.storyboard_id || null,
    production_graph_id: data.production_graph_id || null,
    scene_number: Number(data.scene_number ?? 1),
    shot_number: Number(data.shot_number ?? 1),
    title: data.title || "",
    purpose: data.purpose || "",
    subject: data.subject || "",
    action: data.action || "",
    performance: data.performance || "",
    duration_seconds: Number(data.duration_seconds ?? 0),
    medium: data.medium || null,
    frame_plan: object(data.frame_plan),
    camera: object(data.camera),
    lighting: object(data.lighting),
    production_design: object(data.production_design),
    continuity: object(data.continuity),
    actors: array(data.actors),
    products: array(data.products),
    location: data.location || {},
    dialogue: array(data.dialogue),
    narration: data.narration || {},
    audio: object(data.audio),
    music: data.music || {},
    sound_effects: array(data.sound_effects),
    subtitles: array(data.subtitles),
    graphics: object(data.graphics),
    vfx: object(data.vfx),
    transition_in: data.transition_in || "",
    transition_out: data.transition_out || "",
    reference_assets: array(data.reference_assets),
    negative_constraints: array(data.negative_constraints),
    known_failure_modes: array(data.known_failure_modes),
    repair_instructions: array(data.repair_instructions),
    assets: array(data.assets),
    generation,
    ai_generation: {
      image_required:
        data.ai_generation?.image_required ??
        generation.capability === "ai.image.generate",
      video_required:
        data.ai_generation?.video_required ??
        generation.capability === "ai.video.generate",
      voice_required:
        data.ai_generation?.voice_required ??
        generation.capability === "ai.voice.generate",
      music_required:
        data.ai_generation?.music_required ??
        generation.capability === "ai.music.generate",
      ...(data.ai_generation || {}),
    },
    service_id: data.service_id || data.service_code || generation.service || null,
    service_code: data.service_code || data.service_id || generation.service || null,
    capability: data.capability || generation.capability || null,
    metadata: data.metadata || {},
    status: data.status || SHOT_STATUS.PLANNING,
    archived_at: data.archived_at || null,
    created_at: data.created_at || now,
    updated_at: now,
  };
}

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

export function createShot(data = {}) {
  const now = new Date().toISOString();

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
    duration_seconds: Number(data.duration_seconds ?? 5),
    medium: data.medium || null,
    camera: {
      framing: data.camera?.framing || "Medium",
      movement: data.camera?.movement || "Static",
      lens: data.camera?.lens || "35mm",
      angle: data.camera?.angle || "Eye Level",
      ...(data.camera || {}),
    },
    lighting: {
      style: data.lighting?.style || "Natural",
      mood: data.lighting?.mood || "Soft",
      ...(data.lighting || {}),
    },
    actors: array(data.actors),
    products: array(data.products),
    location: data.location || {},
    dialogue: array(data.dialogue),
    narration: data.narration || {},
    music: data.music || {},
    sound_effects: array(data.sound_effects),
    subtitles: array(data.subtitles),
    assets: array(data.assets),
    generation: data.generation || data.metadata?.generation || {},
    ai_generation: {
      image_required: data.ai_generation?.image_required ?? true,
      video_required: data.ai_generation?.video_required ?? true,
      voice_required: data.ai_generation?.voice_required ?? false,
      music_required: data.ai_generation?.music_required ?? false,
      ...(data.ai_generation || {}),
    },
    service_id: data.service_id || data.service_code || null,
    service_code: data.service_code || data.service_id || null,
    capability: data.capability || null,
    metadata: data.metadata || {},
    status: data.status || SHOT_STATUS.PLANNING,
    archived_at: data.archived_at || null,
    created_at: data.created_at || now,
    updated_at: now,
  };
}

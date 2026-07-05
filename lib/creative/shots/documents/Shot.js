export const SHOT_STATUS = {
  PLANNING: "PLANNING",
  READY: "READY",
  GENERATING: "GENERATING",
  REVIEW: "REVIEW",
  APPROVED: "APPROVED",
};

export function createShot(data = {}) {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),

    organization_id:
      data.organization_id,

    project_id:
      data.project_id ?? null,

    storyboard_id:
      data.storyboard_id ?? null,

    production_graph_id:
      data.production_graph_id ?? null,

    scene_number:
      Number(data.scene_number ?? 1),

    shot_number:
      Number(data.shot_number ?? 1),

    title:
      data.title ?? "",

    purpose:
      data.purpose ?? "",

    duration_seconds:
      Number(data.duration_seconds ?? 5),

    camera: {
      framing: "Medium",
      movement: "Static",
      lens: "35mm",
      angle: "Eye Level",
    },

    lighting: {
      style: "Natural",
      mood: "Soft",
    },

    actors: [],

    products: [],

    location: {},

    dialogue: [],

    narration: {},

    music: {},

    sound_effects: [],

    subtitles: [],

    assets: [],

    ai_generation: {
      image_required: true,
      video_required: true,
      voice_required: false,
      music_required: false,
    },

    status:
      SHOT_STATUS.PLANNING,

    created_at: now,

    updated_at: now,
  };
}

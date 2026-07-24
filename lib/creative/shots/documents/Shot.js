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
    id: data.id ?? crypto.randomUUID(),
    organization_id: data.organization_id,
    creative_project_id:
      data.creative_project_id ??
      data.project_id ??
      null,
    scene_id: data.scene_id ?? null,
    storyboard_id: data.storyboard_id ?? null,
    production_graph_id:
      data.production_graph_id ?? null,
    scene_number: Number(data.scene_number ?? 1),
    shot_number: Number(data.shot_number ?? 1),
    title: data.title ?? "",
    purpose: data.purpose ?? "",
    duration_seconds:
      Number(data.duration_seconds ?? 5),
    camera: {
      framing: data.camera?.framing ?? "Medium",
      movement: data.camera?.movement ?? "Static",
      lens: data.camera?.lens ?? "35mm",
      angle: data.camera?.angle ?? "Eye Level",
      focus: data.camera?.focus ?? null,
      height: data.camera?.height ?? null,
      opening_frame:
        data.camera?.opening_frame ??
        data.opening_frame ??
        null,
      closing_frame:
        data.camera?.closing_frame ??
        data.closing_frame ??
        null,
    },
    lighting: {
      style:
        data.lighting?.style ??
        data.lighting?.quality ??
        "Natural",
      mood: data.lighting?.mood ?? "Soft",
      direction: data.lighting?.direction ?? null,
      continuity:
        data.lighting?.continuity ?? null,
    },
    actors: data.actors ?? [],
    products: data.products ?? [],
    location: data.location ?? {},
    dialogue: data.dialogue ?? [],
    narration: data.narration ?? {},
    music: data.music ?? {},
    sound_effects: data.sound_effects ?? [],
    subtitles: data.subtitles ?? [],
    assets:
      data.assets ??
      data.reference_asset_ids ??
      [],
    ai_generation: {
      image_required:
        data.ai_generation?.image_required ?? true,
      video_required:
        data.ai_generation?.video_required ?? true,
      voice_required:
        data.ai_generation?.voice_required ?? false,
      music_required:
        data.ai_generation?.music_required ?? false,
    },
    status: data.status ?? SHOT_STATUS.PLANNING,
    metadata: {
      ...(data.metadata ?? {}),
      opening_frame: data.opening_frame ?? null,
      closing_frame: data.closing_frame ?? null,
      action_beats: data.action_beats ?? [],
      performance_direction:
        data.performance_direction ?? "",
      reference_pack: data.reference_pack ?? {},
      continuity: data.continuity ?? {},
      reality_rules: data.reality_rules ?? {},
      negative_constraints:
        data.negative_constraints ?? [],
      quality_requirements:
        data.quality_requirements ?? {},
      transition_in: data.transition_in ?? {},
      transition_out: data.transition_out ?? {},
      director_version:
        data.director_version ||
        "world-class-shot-director-v1",
    },
    created_at: data.created_at ?? now,
    updated_at: now,
  };
}

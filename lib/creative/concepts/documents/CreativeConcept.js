export function createCreativeConcept(data = {}) {
  const now = new Date().toISOString();

  return {
    id: data.id || crypto.randomUUID(),

    organization_id: data.organization_id,

    creative_mission_id:
      data.creative_mission_id || null,

    creative_project_id:
      data.creative_project_id || null,

    creative_strategy_id:
      data.creative_strategy_id || null,

    title:
      data.title || "New Concept",

    status:
      data.status || "draft",

    hook:
      data.hook || "",

    message:
      data.message || "",

    emotion:
      data.emotion || "",

    visual_style:
      data.visual_style || "",

    narrative:
      data.narrative || "",

    camera_style:
      data.camera_style || "",

    music_style:
      data.music_style || "",

    voice_style:
      data.voice_style || "",

    call_to_action:
      data.call_to_action || "",

    target_audience:
      data.target_audience || {},

    metadata:
      data.metadata || {},

    created_at: now,
    updated_at: now,
  };
}

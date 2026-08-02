import crypto from "node:crypto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function databaseId(value) {
  const candidate = String(value ?? "").trim();
  return UUID_PATTERN.test(candidate) ? candidate : crypto.randomUUID();
}

export function createCreativeConcept(data = {}) {
  const now = new Date().toISOString();

  return {
    id: databaseId(data.id),

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

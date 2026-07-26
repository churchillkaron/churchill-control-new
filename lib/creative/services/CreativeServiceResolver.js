const SERVICE_BY_TASK_TYPE = Object.freeze({
  GENERATE_IMAGE: "ai.image.generate",
  GENERATE_VIDEO: "ai.video.generate",
  IMAGE_TO_VIDEO: "ai.video.generate",
  GENERATE_VOICE: "ai.voice.generate",
  GENERATE_MUSIC: "ai.music.generate",
  GENERATE_SFX: "ai.sfx.generate",
  LIP_SYNC: "ai.video.lipsync",
  UPSCALE: "ai.image.upscale",
  SUBTITLE: "ai.speech.to.text",
  QUALITY_REVIEW: "ai.reasoning.execute",
});

export function resolveCreativeService(task = {}) {
  const explicit = task.service_id || task.service_code || task.capability || null;
  if (explicit) return explicit;

  const resolved = SERVICE_BY_TASK_TYPE[String(task.type || "").toUpperCase()] || null;
  if (!resolved) {
    throw new Error(`CREATIVE_TASK_SERVICE_UNRESOLVED:${task.type || "UNKNOWN"}`);
  }
  return resolved;
}

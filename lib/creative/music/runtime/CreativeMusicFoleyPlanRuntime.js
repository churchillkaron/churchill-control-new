const CONTRACT = "AVANTIQO_MUSIC_FOLEY_PLAN_V1";
const CATEGORIES = Object.freeze(["FOOTSTEP", "CLOTH", "PROP", "IMPACT", "MACHINERY", "AMBIENCE", "VEHICLE", "BODY", "CUSTOM"]);

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }

export function buildMusicFoleyPlan({ cues = [], picture_duration_seconds = null, frame_rate = null } = {}) {
  const duration = finite(picture_duration_seconds, null);
  const fps = finite(frame_rate, null);
  const events = cues.map((cue, index) => {
    const category = text(cue.category || "CUSTOM").toUpperCase();
    if (!CATEGORIES.includes(category)) throw new Error(`CREATIVE_MUSIC_FOLEY_CATEGORY_INVALID:${category}`);
    const start = Math.max(0, finite(cue.start_seconds, 0));
    if (duration !== null && start > duration) throw new Error("CREATIVE_MUSIC_FOLEY_CUE_OUTSIDE_PICTURE");
    return {
      id: text(cue.id) || `foley-${index + 1}`,
      category,
      start_seconds: start,
      duration_seconds: Math.max(0.01, finite(cue.duration_seconds, 0.25)),
      description: text(cue.description),
      perspective: text(cue.perspective || "ON_SCREEN").toUpperCase(),
      intensity: Math.max(0, Math.min(1, finite(cue.intensity, 0.5))),
      sync_tolerance_ms: Math.max(8, Math.min(120, finite(cue.sync_tolerance_ms, category === "IMPACT" ? 16 : 40))),
      generated_or_recorded_asset_required: true,
      approved: false,
    };
  });
  return {
    contract: CONTRACT,
    picture_duration_seconds: duration,
    frame_rate: fps,
    events,
    event_count: events.length,
    picture_locked_required: true,
    synchronized_preview_required: true,
    perceptual_review_required: true,
    production_execution_certification_required: true,
    production_execution_ready: false,
    publication_authorized: false,
  };
}

export const CreativeMusicFoleyPlanRuntime = Object.freeze({
  contract: CONTRACT,
  categories: CATEGORIES,
  build: buildMusicFoleyPlan,
});

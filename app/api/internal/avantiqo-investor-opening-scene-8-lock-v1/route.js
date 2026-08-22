export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TOKEN = "avq-investor-opening-scene-8-lock-20260822-v1";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";

const FOUNDER_OBVIOUS = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/founder-v7/founder-opening-obvious-synced-approved-v7.mp4`;

const SCENE = Object.freeze({
  contract: "AVANTIQO_INVESTOR_OPENING_SCENE_8_LOCK_V1",
  locked: true,
  scene: 8,
  role: "FOUNDER_OBVIOUS",
  source: FOUNDER_OBVIOUS,
  narration: "That made one thing obvious.",
  duration_seconds: 2.109,
  narration_start_seconds: 28.266,
  narration_end_seconds: 30.375,
  film_start_seconds: 43.616,
  film_end_seconds: 45.725,
  visual_policy: [
    "FOUNDER_ONLY",
    "NO_UI",
    "NO_HOLOGRAM",
    "NO_TEXT_OVERLAY",
    "NO_FLOATING_GRAPHICS",
    "NO_NEW_GENERATION",
    "CLEAN_CINEMATIC_CUT",
  ],
  transition_out: {
    next_narration: "The business should not have to explain itself to its software. The software should understand the business.",
    next_visual_role: "AVANTIQO_INTELLIGENCE_REVEAL",
  },
  publication_authorized: false,
});

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

export async function GET(request) {
  const url = new URL(request.url);
  if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
  return json({ success: true, ...SCENE });
}

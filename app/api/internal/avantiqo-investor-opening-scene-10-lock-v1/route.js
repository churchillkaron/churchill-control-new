export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { getServiceSupabase } from "@/lib/shared/supabase/service";

const TOKEN = "avq-investor-opening-scene-10-lock-20260823-v1";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const BUCKET = "creative-assets";

const FOUNDER_BUILT = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/founder-v7/founder-opening-built-synced-approved-v7.mp4`;

const SCENE = Object.freeze({
  contract: "AVANTIQO_INVESTOR_OPENING_SCENE_10_LOCK_V1",
  locked: true,
  scene: 10,
  role: "FOUNDER_BUILT_AVANTIQO",
  source: FOUNDER_BUILT,
  narration: "That is why I built Avantiqo.",
  duration_seconds: 2.531,
  narration_start_seconds: 37.547,
  narration_end_seconds: 40.078,
  visual_policy: [
    "FOUNDER_ONLY",
    "NO_UI",
    "NO_CARDS",
    "NO_HOLOGRAM",
    "NO_TEXT_OVERLAY",
    "NO_FLOATING_GRAPHICS",
    "NO_NEW_GENERATION",
    "NO_IMAGE_GENERATION",
    "CLEAN_CINEMATIC_CUT",
  ],
  transition_out: {
    next_narration: "Avantiqo is an AI-native Business Operating System designed to bring the company into one shared operating context.",
    next_visual_role: "AUTHENTIC_PRODUCT_UI_IN_WORLD",
  },
  publication_authorized: false,
});

const supabase = getServiceSupabase();

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

async function signedUrl(seconds = 86400) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(FOUNDER_BUILT, seconds);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("SCENE_10_SIGNED_URL_MISSING");
  return data.signedUrl;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = String(url.searchParams.get("action") || "status").trim().toLowerCase();
    if (action === "signed") return json({ success: true, ...SCENE, signed_url: await signedUrl() });
    if (action === "status") return json({ success: true, ...SCENE });
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, contract: SCENE.contract, error: error?.message || String(error) }, 500);
  }
}

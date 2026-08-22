export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "da38f668-11a1-4760-a8f2-6adc3effdab5";

const LABELS = Object.freeze({
  scene_01_the_drop: "THE DROP",
  scene_01_the_drop_plate_r2: "THE DROP · R2",
  scene_02_entrance_into_night: "ENTRANCE INTO THE NIGHT",
  scene_03_wine_universe: "WINE UNIVERSE",
  scene_04_dinner_future_reflections: "DINNER FUTURE REFLECTIONS",
  scene_05_steam_into_bar: "STEAM INTO BAR",
  scene_06_ice_time_freeze: "ICE TIME FREEZE",
  scene_07_pool_activation: "POOL ACTIVATION",
  scene_08_pool_to_shuffleboard: "POOL TO SHUFFLEBOARD",
  scene_09_shuffleboard_to_dart: "SHUFFLEBOARD TO DART",
  scene_10_electric_dart_flight: "ELECTRIC DART FLIGHT",
  scene_11_band_activates_churchill: "BAND ACTIVATES CHURCHILL",
  scene_12_many_realities_same_night: "MANY REALITIES · SAME NIGHT",
  scene_13_frozen_night_hero: "FROZEN NIGHT HERO",
  scene_14_wine_loop_return: "WINE LOOP RETURN",
  scene_15_logo_epilogue: "LOGO EPILOGUE",
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function page({ title, videoUrl, duration, statusText = "VISUAL REVIEW REQUIRED" }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>Churchill — ${escapeHtml(title)}</title>
  <style>
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#050505;color:#eee;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.wrap{width:min(1280px,100%)}.eyebrow{font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#b99a6d;margin-bottom:10px}.title{font-size:clamp(24px,4vw,48px);font-weight:300;letter-spacing:.02em;margin:0 0 18px}.frame{background:#000;border:1px solid rgba(255,255,255,.10);box-shadow:0 30px 90px rgba(0,0,0,.55);overflow:hidden;aspect-ratio:16/9;display:grid;place-items:center}video{width:100%;height:100%;display:block;background:#000;object-fit:contain}.meta{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:13px;font-size:12px;color:#8f8f8f}.status{color:#b99a6d}.error{display:none;margin-top:16px;padding:14px 16px;border:1px solid rgba(255,255,255,.15);background:#111;color:#fff;font-size:13px}.reload{color:#d6b27a;text-decoration:none;border-bottom:1px solid rgba(214,178,122,.4)}
  </style>
</head>
<body>
  <main class="wrap">
    <div class="eyebrow">Churchill Film · V5 Scene Review</div>
    <h1 class="title">${escapeHtml(title)}</h1>
    <div class="frame">
      <video id="film" src="${escapeHtml(videoUrl)}" controls autoplay muted playsinline preload="auto"></video>
    </div>
    <div class="meta"><span>Generated master candidate${duration ? ` · ${escapeHtml(duration)} seconds` : ""}</span><span class="status">${escapeHtml(statusText)}</span></div>
    <div id="error" class="error">The media URL expired or Safari could not initialize the stream. <a class="reload" href="javascript:location.reload()">Reload this page</a> to issue a fresh signed media URL.</div>
  </main>
  <script>
    const video = document.getElementById('film');
    const error = document.getElementById('error');
    video.addEventListener('error', () => { error.style.display = 'block'; });
  </script>
</body>
</html>`;
}

export async function GET(_request, { params }) {
  try {
    const sceneKey = String(params?.sceneKey || "").trim();
    if (!sceneKey || !/^scene_[0-9]{2}_[a-z0-9_]+$/.test(sceneKey)) {
      return new Response("Not found", { status: 404 });
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from("creative_projects")
      .select("metadata")
      .eq("id", PROJECT_ID)
      .eq("organization_id", ORGANIZATION_ID)
      .maybeSingle();

    if (projectError) throw projectError;

    const state = project?.metadata?.churchill_v5_scenes?.scenes?.[sceneKey] || null;
    const ref = String(state?.output_reference || "").trim();

    if (state?.status !== "COMPLETED" || !ref) {
      return new Response(
        page({
          title: LABELS[sceneKey] || sceneKey.replaceAll("_", " ").toUpperCase(),
          videoUrl: "",
          duration: state?.final_editorial_duration_seconds || state?.source_duration_seconds || null,
          statusText: state?.status || "NOT READY",
        }).replace('<video id="film" src="" controls autoplay muted playsinline preload="auto"></video>', '<div style="color:#888;font-size:14px;letter-spacing:.08em">SCENE NOT READY</div>'),
        { status: 409, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } },
      );
    }

    let videoUrl = ref;
    if (ref.startsWith("storage://")) {
      const storagePath = ref.slice("storage://".length);
      const parts = storagePath.split("/").filter(Boolean);
      const bucket = parts.shift();
      const path = parts.join("/");
      if (!bucket || !path) throw new Error("CHURCHILL_V5_REVIEW_STORAGE_REFERENCE_INVALID");

      const { data: signed, error: signedError } = await supabaseAdmin.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 60);
      if (signedError) throw signedError;
      if (!signed?.signedUrl) throw new Error("CHURCHILL_V5_REVIEW_SIGNED_URL_REQUIRED");
      videoUrl = signed.signedUrl;
    }

    return new Response(
      page({
        title: LABELS[sceneKey] || sceneKey.replaceAll("_", " ").toUpperCase(),
        videoUrl,
        duration: state?.final_editorial_duration_seconds || state?.source_duration_seconds || null,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    console.error("CHURCHILL_V5_SCENE_REVIEW_FAILED", {
      message: error?.message || String(error),
      details: error?.details || null,
    });

    return new Response(
      `<!doctype html><html><body style="margin:0;background:#050505;color:#fff;font-family:Arial,sans-serif;display:grid;place-items:center;height:100vh"><div>Review player error: ${escapeHtml(error?.message || String(error))}</div></body></html>`,
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } },
    );
  }
}

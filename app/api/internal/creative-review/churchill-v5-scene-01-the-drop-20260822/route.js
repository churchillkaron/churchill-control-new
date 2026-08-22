export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "da38f668-11a1-4760-a8f2-6adc3effdab5";
const SCENE_KEY = "scene_01_the_drop";

function htmlEscape(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export async function GET() {
  try {
    const { data: project, error: projectError } = await supabaseAdmin
      .from("creative_projects")
      .select("metadata")
      .eq("id", PROJECT_ID)
      .eq("organization_id", ORGANIZATION_ID)
      .maybeSingle();

    if (projectError) throw projectError;

    const state = project?.metadata?.churchill_v5_scenes?.scenes?.[SCENE_KEY] || null;
    const ref = String(state?.output_reference || "").trim();

    if (state?.status !== "COMPLETED" || !ref.startsWith("storage://")) {
      return new Response(
        "<!doctype html><html><body style='margin:0;background:#050505;color:#fff;font-family:Arial,sans-serif;display:grid;place-items:center;height:100vh'>Scene not ready.</body></html>",
        {
          status: 409,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "private, no-store",
          },
        },
      );
    }

    const storagePath = ref.slice("storage://".length);
    const parts = storagePath.split("/").filter(Boolean);
    const bucket = parts.shift();
    const path = parts.join("/");

    if (!bucket || !path) throw new Error("CHURCHILL_WINE_DROP_STORAGE_REFERENCE_INVALID");

    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60);

    if (signedError) throw signedError;
    if (!signed?.signedUrl) throw new Error("CHURCHILL_WINE_DROP_SIGNED_URL_REQUIRED");

    const videoUrl = htmlEscape(signed.signedUrl);

    const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>Churchill — The Drop</title>
  <style>
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#050505;color:#eee;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.wrap{width:min(1280px,100%)}.eyebrow{font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#b99a6d;margin-bottom:10px}.title{font-size:clamp(24px,4vw,48px);font-weight:300;letter-spacing:.02em;margin:0 0 18px}.frame{background:#000;border:1px solid rgba(255,255,255,.10);box-shadow:0 30px 90px rgba(0,0,0,.55);overflow:hidden;aspect-ratio:16/9;display:grid;place-items:center}video{width:100%;height:100%;display:block;background:#000;object-fit:contain}.meta{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:13px;font-size:12px;color:#8f8f8f}.status{color:#b99a6d}.error{display:none;margin-top:16px;padding:14px 16px;border:1px solid rgba(255,255,255,.15);background:#111;color:#fff;font-size:13px}
  </style>
</head>
<body>
  <main class="wrap">
    <div class="eyebrow">Churchill Film · Scene 01</div>
    <h1 class="title">THE DROP</h1>
    <div class="frame">
      <video id="film" src="${videoUrl}" controls autoplay muted playsinline preload="auto"></video>
    </div>
    <div class="meta"><span>Generated master candidate · 4 seconds</span><span class="status">VISUAL REVIEW REQUIRED</span></div>
    <div id="error" class="error">The video could not be loaded in this browser. Reload this page to create a fresh signed media URL.</div>
  </main>
  <script>
    const video = document.getElementById('film');
    const error = document.getElementById('error');
    video.addEventListener('error', () => { error.style.display = 'block'; });
  </script>
</body>
</html>`;

    return new Response(page, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("CHURCHILL_WINE_DROP_REVIEW_FAILED", {
      message: error?.message || String(error),
      details: error?.details || null,
    });

    return new Response(
      `<!doctype html><html><body style="margin:0;background:#050505;color:#fff;font-family:Arial,sans-serif;display:grid;place-items:center;height:100vh"><div>Review player error: ${htmlEscape(error?.message || String(error))}</div></body></html>`,
      {
        status: 500,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store",
        },
      },
    );
  }
}

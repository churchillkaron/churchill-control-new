export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TOKEN = "avq-render-20260818-7d3c9a1f4b62";
const VOICE_PATH = "33336a72-acb5-474e-856b-8be0269360e2/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar.mp3";
const MUSIC_URL = "https://v3b.fal.media/files/b/0aa6d178/5eeIybsdSiMAorO_qvazb_tNtkrZMg.wav";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) {
      return Response.json({ success: false }, { status: 404 });
    }

    const asset = url.searchParams.get("asset");

    if (asset === "voice") {
      const { data, error } = await supabaseAdmin.storage
        .from("creative-assets")
        .download(VOICE_PATH);
      if (error) throw error;
      const bytes = Buffer.from(await data.arrayBuffer());
      return new Response(bytes, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": String(bytes.length),
          "Cache-Control": "no-store",
          "Content-Disposition": "inline; filename=avantiqo-investor-narration-cedar.mp3",
        },
      });
    }

    if (asset === "music") {
      const response = await fetch(MUSIC_URL);
      if (!response.ok) throw new Error(`Music fetch failed: ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      return new Response(bytes, {
        headers: {
          "Content-Type": "audio/wav",
          "Content-Length": String(bytes.length),
          "Cache-Control": "no-store",
          "Content-Disposition": "inline; filename=avantiqo-investor-score.wav",
        },
      });
    }

    return Response.json({ success: false, error: "asset required" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

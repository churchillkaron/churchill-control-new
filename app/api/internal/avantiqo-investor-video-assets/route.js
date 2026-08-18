export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TOKEN = "avq-render-20260818-7d3c9a1f4b62";
const ROOT = "33336a72-acb5-474e-856b-8be0269360e2/avantiqo-investor-video-20260818";
const PRIVATE_VOICE = `${ROOT}/avantiqo-investor-narration.mp3`;
const PUBLIC_VOICE = `${ROOT}/avantiqo-investor-narration.mp3`;
const PUBLIC_MUSIC = `${ROOT}/avantiqo-investor-score.wav`;
const MUSIC_URL = "https://v3b.fal.media/files/b/0aa6d178/5eeIybsdSiMAorO_qvazb_tNtkrZMg.wav";

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function uploadPublic(path, bytes, contentType) {
  const { error } = await supabaseAdmin.storage
    .from("marketing-assets")
    .upload(path, bytes, { contentType, upsert: true, cacheControl: "3600" });
  if (error) throw error;
  const { data } = supabaseAdmin.storage.from("marketing-assets").getPublicUrl(path);
  return data?.publicUrl || null;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);

    const { data: voiceBlob, error: voiceError } = await supabaseAdmin.storage
      .from("creative-assets")
      .download(PRIVATE_VOICE);
    if (voiceError) throw voiceError;
    const voiceBytes = Buffer.from(await voiceBlob.arrayBuffer());
    const voiceUrl = await uploadPublic(PUBLIC_VOICE, voiceBytes, "audio/mpeg");

    const musicResponse = await fetch(MUSIC_URL);
    if (!musicResponse.ok) throw new Error(`Music download failed: ${musicResponse.status}`);
    const musicBytes = Buffer.from(await musicResponse.arrayBuffer());
    const musicUrl = await uploadPublic(PUBLIC_MUSIC, musicBytes, "audio/wav");

    return json({
      success: true,
      voice_url: voiceUrl,
      music_url: musicUrl,
      voice_bytes: voiceBytes.length,
      music_bytes: musicBytes.length,
    });
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}

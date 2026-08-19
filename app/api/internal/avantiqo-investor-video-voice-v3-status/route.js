export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TOKEN = "avq-cedar-v3-founder-status-20260819";
const BUCKET = "creative-assets";
const PATH = "33336a72-acb5-474e-856b-8be0269360e2/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v3-founder-4min.mp3";

const BITRATES = {
  3: { 1: [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0], 2: [0,32,48,56,64,80,96,112,128,160,192,224,256,320,384,0], 3: [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0] },
  2: { 1: [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0], 2: [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0], 3: [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0] },
  0: { 1: [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0], 2: [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0], 3: [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0] },
};

const SAMPLE_RATES = {
  3: [44100,48000,32000],
  2: [22050,24000,16000],
  0: [11025,12000,8000],
};

function mp3DurationSeconds(bytes) {
  let offset = 0;
  if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
    offset = 10 + size;
  }

  let seconds = 0;
  let frames = 0;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }

    const versionBits = (bytes[offset + 1] >> 3) & 0x03;
    const layerBits = (bytes[offset + 1] >> 1) & 0x03;
    const bitrateIndex = (bytes[offset + 2] >> 4) & 0x0f;
    const sampleRateIndex = (bytes[offset + 2] >> 2) & 0x03;
    const padding = (bytes[offset + 2] >> 1) & 0x01;

    if (versionBits === 1 || layerBits === 0 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
      offset += 1;
      continue;
    }

    const version = versionBits;
    const layer = 4 - layerBits;
    const bitrate = BITRATES[version]?.[layer]?.[bitrateIndex];
    const sampleRate = SAMPLE_RATES[version]?.[sampleRateIndex];
    if (!bitrate || !sampleRate) {
      offset += 1;
      continue;
    }

    const samplesPerFrame = layer === 1 ? 384 : layer === 2 ? 1152 : version === 3 ? 1152 : 576;
    const coefficient = layer === 1 ? 12 : layer === 3 && version !== 3 ? 72 : 144;
    const slotSize = layer === 1 ? 4 : 1;
    const frameLength = Math.floor((coefficient * bitrate * 1000) / sampleRate + padding) * slotSize;
    if (!frameLength || offset + frameLength > bytes.length) break;

    seconds += samplesPerFrame / sampleRate;
    frames += 1;
    offset += frameLength;
  }

  return { seconds, frames };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return Response.json({ success: false }, { status: 404 });

    const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(PATH);
    if (error) throw error;
    if (!data) throw new Error("FOUNDER_MASTER_NOT_FOUND");
    const bytes = new Uint8Array(await data.arrayBuffer());
    const timing = mp3DurationSeconds(bytes);
    if (!timing.frames || timing.seconds <= 0) throw new Error("MP3_DURATION_PARSE_FAILED");

    const filmSeconds = timing.seconds + 5.5 + 5.0;
    return Response.json({
      success: true,
      storage_path: PATH,
      bytes: bytes.length,
      mp3_frames: timing.frames,
      narration_duration_seconds: Number(timing.seconds.toFixed(3)),
      narration_duration_clock: `${Math.floor(timing.seconds / 60)}:${String(Math.floor(timing.seconds % 60)).padStart(2, "0")}`,
      planned_logo_intro_seconds: 5.5,
      planned_end_resolve_seconds: 5.0,
      planned_film_duration_seconds: Number(filmSeconds.toFixed(3)),
      planned_film_duration_clock: `${Math.floor(filmSeconds / 60)}:${String(Math.floor(filmSeconds % 60)).padStart(2, "0")}`,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}

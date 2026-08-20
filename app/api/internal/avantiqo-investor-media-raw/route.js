export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const BUCKET = "creative-assets";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const TOKEN_SHA256 = "d726f442fbdfb7b8c652d52fb9a34e6e821834fbe29cafcd9d43fe8927cc2bfc";
const MAX_CHUNK_BYTES = 192 * 1024;
const FOUNDER_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/founder-v6`;
const AUDIO_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/audio`;

const ASSETS = Object.freeze({
  cedar_v5: { path: `${ORGANIZATION_ID}/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3`, type: "audio/mpeg" },
  logo_3d: { path: `${ORGANIZATION_ID}/unassigned/df1cdd49-68e2-4a77-956e-6c9565c0074d-google-veo-6c9upygjkui2.mp4`, type: "video/mp4" },
  lipsync_opening_origin: { path: `${FOUNDER_DIR}/opening-founder-origin-synced-approved-v6.mp4`, type: "video/mp4" },
  lipsync_opening_obvious: { path: `${FOUNDER_DIR}/opening-founder-obvious-synced-approved-v6.mp4`, type: "video/mp4" },
  lipsync_opening_why: { path: `${FOUNDER_DIR}/opening-founder-why-synced-approved-v6.mp4`, type: "video/mp4" },
  lipsync_mid_integration: { path: `${FOUNDER_DIR}/founder-mid-integration-synced-approved-v6.mp4`, type: "video/mp4" },
  lipsync_mid_ai: { path: `${FOUNDER_DIR}/founder-mid-ai-synced-approved-v6.mp4`, type: "video/mp4" },
  lipsync_close: { path: `${FOUNDER_DIR}/founder-close-synced-approved-v6.mp4`, type: "video/mp4" },
  score_v1: { path: `${AUDIO_DIR}/avantiqo-investor-score-v1-approved.mp3`, type: "audio/mpeg" },
});

function safeToken(value) {
  const supplied = String(value || "").trim();
  if (!supplied) return false;
  const digest = crypto.createHash("sha256").update(supplied).digest("hex");
  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(TOKEN_SHA256, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function asInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function loadAsset(asset) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(asset.path);
  if (error) throw error;
  if (!data) throw new Error("asset empty");
  return Buffer.from(await data.arrayBuffer());
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (!safeToken(url.searchParams.get("token"))) return new Response(null, { status: 404 });
    const key = String(url.searchParams.get("asset") || "").trim();
    const asset = ASSETS[key];
    if (!asset) return Response.json({ success: false, error: "asset not allowed" }, { status: 400 });

    const bytes = await loadAsset(asset);
    const mode = String(url.searchParams.get("mode") || "raw").trim().toLowerCase();

    if (mode === "metadata") {
      return Response.json({
        success: true,
        asset: key,
        mime_type: asset.type,
        total_bytes: bytes.length,
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        max_chunk_bytes: MAX_CHUNK_BYTES,
      }, { headers: { "Cache-Control": "no-store, private" } });
    }

    if (mode === "chunk") {
      const offset = Math.max(0, asInteger(url.searchParams.get("offset"), 0));
      const requested = Math.max(1, asInteger(url.searchParams.get("length"), MAX_CHUNK_BYTES));
      const length = Math.min(MAX_CHUNK_BYTES, requested);
      if (offset >= bytes.length) {
        return Response.json({ success: true, asset: key, offset, length_bytes: 0, total_bytes: bytes.length, next_offset: null, eof: true, base64: "" }, { headers: { "Cache-Control": "no-store, private" } });
      }
      const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + length));
      const nextOffset = offset + chunk.length < bytes.length ? offset + chunk.length : null;
      return Response.json({
        success: true,
        asset: key,
        offset,
        length_bytes: chunk.length,
        total_bytes: bytes.length,
        next_offset: nextOffset,
        eof: nextOffset === null,
        sha256_chunk: crypto.createHash("sha256").update(chunk).digest("hex"),
        base64: chunk.toString("base64"),
      }, { headers: { "Cache-Control": "no-store, private" } });
    }

    const filename = asset.path.split("/").at(-1) || "media.bin";
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": asset.type,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `inline; filename=\"${filename.replace(/\"/g, "")}\"`,
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const BUCKET = "creative-assets";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const TOKEN_SHA256 = "2e408862c1f38bd6e08f453c8dd06deb711248cfa02facbd16f66cc397293836";
const MAX_CHUNK_BYTES = 256 * 1024;
const MAX_BASE64_BYTES = 4 * 1024 * 1024;

const FOUNDER_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/founder-v6`;
const SEGMENT_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/segments`;
const AUDIO_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/audio`;
const MASTER_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/master`;

const ASSETS = Object.freeze({
  cedar_v5: Object.freeze({
    path: `${ORGANIZATION_ID}/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3`,
    mime_type: "audio/mpeg",
    role: "LOCKED_FOUNDER_VOICE_MASTER",
  }),
  logo_3d: Object.freeze({
    path: `${ORGANIZATION_ID}/unassigned/df1cdd49-68e2-4a77-956e-6c9565c0074d-google-veo-6c9upygjkui2.mp4`,
    mime_type: "video/mp4",
    role: "APPROVED_3D_LOGO",
    expected_sha256: "df2724aed77176d2d2a8cc41ac7223069953c3da57ce32af18f328ce6e01596a",
  }),
  founder_motion: Object.freeze({
    path: `${ORGANIZATION_ID}/unassigned/eaa7edd6-7a62-4ca2-9eac-dfb14059e649-gemini-founder-rgro0za2hzes.mp4`,
    mime_type: "video/mp4",
    role: "APPROVED_GEMINI_FOUNDER_MOTION",
    expected_sha256: "78b995566a564e7801f0a240a522ae5a02163680006b857bb091572182b121a1",
  }),
  lipsync_opening_origin: Object.freeze({
    path: `${FOUNDER_DIR}/opening-founder-origin-synced-approved-v6.mp4`,
    mime_type: "video/mp4",
    role: "FOUNDER_LIPSYNC",
  }),
  lipsync_opening_obvious: Object.freeze({
    path: `${FOUNDER_DIR}/opening-founder-obvious-synced-approved-v6.mp4`,
    mime_type: "video/mp4",
    role: "FOUNDER_LIPSYNC",
  }),
  lipsync_opening_why: Object.freeze({
    path: `${FOUNDER_DIR}/opening-founder-why-synced-approved-v6.mp4`,
    mime_type: "video/mp4",
    role: "FOUNDER_LIPSYNC",
  }),
  lipsync_mid_integration: Object.freeze({
    path: `${FOUNDER_DIR}/founder-mid-integration-synced-approved-v6.mp4`,
    mime_type: "video/mp4",
    role: "FOUNDER_LIPSYNC",
  }),
  lipsync_mid_ai: Object.freeze({
    path: `${FOUNDER_DIR}/founder-mid-ai-synced-approved-v6.mp4`,
    mime_type: "video/mp4",
    role: "FOUNDER_LIPSYNC",
  }),
  lipsync_close: Object.freeze({
    path: `${FOUNDER_DIR}/founder-close-synced-approved-v6.mp4`,
    mime_type: "video/mp4",
    role: "FOUNDER_LIPSYNC",
  }),
  score_v1: Object.freeze({
    path: `${AUDIO_DIR}/avantiqo-investor-score-v1-approved.mp3`,
    mime_type: "audio/mpeg",
    role: "APPROVED_INVESTOR_SCORE",
  }),
  opening_segment: Object.freeze({
    path: `${SEGMENT_DIR}/opening-final-v1.mp4`,
    mime_type: "video/mp4",
    role: "FINAL_VISUAL_SEGMENT",
  }),
  product_proof_segment: Object.freeze({
    path: `${SEGMENT_DIR}/product-proof-final-v1.mp4`,
    mime_type: "video/mp4",
    role: "FINAL_VISUAL_SEGMENT",
  }),
  final_act_segment: Object.freeze({
    path: `${SEGMENT_DIR}/final-act-final-v1.mp4`,
    mime_type: "video/mp4",
    role: "FINAL_VISUAL_SEGMENT",
  }),
  master_v6: Object.freeze({
    path: `${MASTER_DIR}/avantiqo-investor-film-v6-master-237.5s.mp4`,
    mime_type: "video/mp4",
    role: "FINAL_MASTER",
  }),
});

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function text(value) {
  return String(value ?? "").trim();
}

function int(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function suppliedToken(request, url) {
  return text(
    request.headers.get("x-avantiqo-investor-media-token") ||
      url.searchParams.get("token"),
  );
}

function tokenValid(token) {
  if (!token) return false;
  const digest = crypto.createHash("sha256").update(token).digest("hex");
  const left = Buffer.from(digest, "utf8");
  const right = Buffer.from(TOKEN_SHA256, "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function resolveAsset(key) {
  const asset = ASSETS[text(key)];
  if (!asset) throw new Error("INVESTOR_MEDIA_ASSET_NOT_ALLOWED");
  if (!asset.path.startsWith(`${ORGANIZATION_ID}/`) || asset.path.includes("..")) {
    throw new Error("INVESTOR_MEDIA_ASSET_PATH_INVALID");
  }
  return asset;
}

async function objectMetadata(asset) {
  const parts = asset.path.split("/");
  const name = parts.pop();
  const directory = parts.join("/");
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .list(directory, { search: name, limit: 10 });
  if (error) throw error;
  const row = (data || []).find((candidate) => candidate.name === name) || null;
  const size = Number(row?.metadata?.size ?? row?.metadata?.contentLength ?? 0) || null;
  return {
    ready: Boolean(row),
    size_bytes: size,
    content_type: row?.metadata?.mimetype || row?.metadata?.contentType || asset.mime_type,
    updated_at: row?.updated_at || null,
  };
}

async function createPrivateSignedUrl(asset, seconds = 300) {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(asset.path, seconds);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("INVESTOR_MEDIA_SIGNED_URL_REQUIRED");
  return data.signedUrl;
}

async function rangedBytes(asset, offset, length) {
  const meta = await objectMetadata(asset);
  if (!meta.ready) throw new Error("INVESTOR_MEDIA_ASSET_NOT_READY");
  if (offset < 0) throw new Error("INVESTOR_MEDIA_OFFSET_INVALID");
  if (length <= 0 || length > MAX_CHUNK_BYTES) {
    throw new Error("INVESTOR_MEDIA_CHUNK_LENGTH_INVALID");
  }
  if (meta.size_bytes !== null && offset >= meta.size_bytes) {
    return { bytes: Buffer.alloc(0), meta, next_offset: null };
  }

  const lastByte = meta.size_bytes === null
    ? offset + length - 1
    : Math.min(meta.size_bytes - 1, offset + length - 1);
  const signedUrl = await createPrivateSignedUrl(asset);
  const response = await fetch(signedUrl, {
    headers: { Range: `bytes=${offset}-${lastByte}` },
    cache: "no-store",
  });
  if (!response.ok && response.status !== 206) {
    throw new Error(`INVESTOR_MEDIA_RANGE_FETCH_FAILED:${response.status}`);
  }

  let bytes = Buffer.from(await response.arrayBuffer());
  // Defensive fallback for storage gateways that ignore Range and return 200.
  if (response.status === 200 && bytes.length > length) {
    bytes = bytes.subarray(offset, Math.min(bytes.length, offset + length));
  }
  const nextOffset = meta.size_bytes !== null && offset + bytes.length < meta.size_bytes
    ? offset + bytes.length
    : null;

  return { bytes, meta, next_offset: nextOffset };
}

async function fullBytes(asset) {
  const meta = await objectMetadata(asset);
  if (!meta.ready) throw new Error("INVESTOR_MEDIA_ASSET_NOT_READY");
  if (meta.size_bytes !== null && meta.size_bytes > MAX_BASE64_BYTES) {
    throw new Error("INVESTOR_MEDIA_USE_CHUNK_MODE");
  }
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(asset.path);
  if (error) throw error;
  if (!data) throw new Error("INVESTOR_MEDIA_DOWNLOAD_EMPTY");
  const bytes = Buffer.from(await data.arrayBuffer());
  if (bytes.length > MAX_BASE64_BYTES) throw new Error("INVESTOR_MEDIA_USE_CHUNK_MODE");
  return { bytes, meta };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (!tokenValid(suppliedToken(request, url))) {
      return json({ success: false }, 404);
    }

    const mode = text(url.searchParams.get("mode") || "metadata").toLowerCase();
    const key = text(url.searchParams.get("asset"));

    if (mode === "catalog") {
      const items = await Promise.all(
        Object.entries(ASSETS).map(async ([assetKey, asset]) => ({
          key: assetKey,
          role: asset.role,
          mime_type: asset.mime_type,
          expected_sha256: asset.expected_sha256 || null,
          ...(await objectMetadata(asset)),
        })),
      );
      return json({
        success: true,
        contract: "AVANTIQO_INVESTOR_MEDIA_EXPORT_V1",
        arbitrary_paths_allowed: false,
        max_chunk_bytes: MAX_CHUNK_BYTES,
        assets: items,
      });
    }

    const asset = resolveAsset(key);

    if (mode === "metadata") {
      return json({
        success: true,
        asset: key,
        role: asset.role,
        mime_type: asset.mime_type,
        expected_sha256: asset.expected_sha256 || null,
        ...(await objectMetadata(asset)),
      });
    }

    if (mode === "chunk") {
      const offset = Math.max(0, int(url.searchParams.get("offset"), 0));
      const requestedLength = int(url.searchParams.get("length"), MAX_CHUNK_BYTES);
      const length = Math.min(MAX_CHUNK_BYTES, Math.max(1, requestedLength));
      const result = await rangedBytes(asset, offset, length);
      return json({
        success: true,
        asset: key,
        role: asset.role,
        offset,
        length_bytes: result.bytes.length,
        total_bytes: result.meta.size_bytes,
        next_offset: result.next_offset,
        eof: result.next_offset === null,
        sha256_chunk: crypto.createHash("sha256").update(result.bytes).digest("hex"),
        base64: result.bytes.toString("base64"),
      });
    }

    if (mode === "base64") {
      const result = await fullBytes(asset);
      return json({
        success: true,
        asset: key,
        role: asset.role,
        total_bytes: result.bytes.length,
        sha256: crypto.createHash("sha256").update(result.bytes).digest("hex"),
        expected_sha256: asset.expected_sha256 || null,
        base64: result.bytes.toString("base64"),
      });
    }

    return json({ success: false, error: "Unsupported mode" }, 400);
  } catch (error) {
    return json(
      {
        success: false,
        error: error?.message || String(error),
      },
      500,
    );
  }
}

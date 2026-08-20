export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TOKEN = "avq-investor-lipsync-normalize-20260820-v1";
const BUCKET = "creative-assets";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const SOURCE_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/founder-v7`;
const TARGET_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/founder-v6`;

const FILES = Object.freeze({
  "founder-opening-origin": "opening-founder-origin",
  "founder-opening-obvious": "opening-founder-obvious",
  "founder-opening-built": "opening-founder-why",
  "founder-mid-integration": "founder-mid-integration",
  "founder-mid-ai": "founder-mid-ai",
  "founder-close": "founder-close",
});

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function exists(storagePath) {
  const directory = storagePath.split("/").slice(0, -1).join("/");
  const file = storagePath.split("/").at(-1);
  const { data } = await supabaseAdmin.storage.from(BUCKET).list(directory, { search: file, limit: 10 });
  return (data || []).some((row) => row.name === file);
}

async function normalizeOne(sourceKey, targetKey) {
  const source = `${SOURCE_DIR}/${sourceKey}-synced-approved-v7.mp4`;
  const target = `${TARGET_DIR}/${targetKey}-synced-approved-v6.mp4`;
  if (!(await exists(source))) return { sourceKey, targetKey, ready: false, source, target };
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(source);
  if (error) throw error;
  if (!data) throw new Error(`LIPSYNC_NORMALIZE_SOURCE_EMPTY:${source}`);
  const bytes = Buffer.from(await data.arrayBuffer());
  const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(target, bytes, {
    contentType: "video/mp4",
    cacheControl: "3600",
    upsert: true,
  });
  if (uploadError) throw uploadError;
  return { sourceKey, targetKey, ready: true, source, target, bytes: bytes.length };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = url.searchParams.get("action") || "status";
    if (action === "status") {
      const items = [];
      for (const [sourceKey, targetKey] of Object.entries(FILES)) {
        const source = `${SOURCE_DIR}/${sourceKey}-synced-approved-v7.mp4`;
        const target = `${TARGET_DIR}/${targetKey}-synced-approved-v6.mp4`;
        items.push({ sourceKey, targetKey, source_ready: await exists(source), target_ready: await exists(target), source, target });
      }
      return json({ success: true, ready: items.every((item) => item.target_ready), items });
    }
    if (action === "normalize") {
      const items = [];
      for (const [sourceKey, targetKey] of Object.entries(FILES)) {
        items.push(await normalizeOne(sourceKey, targetKey));
      }
      return json({ success: true, ready: items.every((item) => item.ready), items });
    }
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}

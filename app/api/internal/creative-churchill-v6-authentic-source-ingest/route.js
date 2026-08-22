export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "da38f668-11a1-4760-a8f2-6adc3effdab5";
const BUCKET = "creative-assets";
const TOKEN = "churchill-v6-authentic-source-ingest-20260822";
const VERSION = "CHURCHILL_V6_AUTHENTIC_SOURCE_INGEST_V1";

const SOURCES = Object.freeze({
  dinner: {
    checksum: "b771900e47577f3e191afdc7703ed0662385f521d06d90a4d10a9549c1ef3b12",
    expected_mime: "image/jpeg",
    extension: "jpg",
    library_name: "dinner(1).jpg",
    usage: ["scene_04_dinner_future_reflections", "scene_14_wine_loop_return"],
  },
  pool_darts: {
    checksum: "e8c6406b54b96c44145e344a60f9b94db901292ef220096abcab33d352666403",
    expected_mime: "image/jpeg",
    extension: "jpg",
    library_name: "0748cdfc-8fb2-4db3-8d6a-97b9b2e721d2 2(4).JPG",
    usage: ["scene_07_pool_activation", "scene_10_electric_dart_flight"],
  },
  band: {
    checksum: "6f7d5ec92e85325a3ec8fe3b5e46d72f1f78379daf76d011adf2056b57b960da",
    expected_mime: "image/jpeg",
    extension: "jpg",
    library_name: "churchill6.jpg",
    usage: ["scene_11_band_activates_churchill"],
  },
});

function text(value) {
  return String(value ?? "").trim();
}

function json(value, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function auth(request) {
  const url = new URL(request.url);
  return url.searchParams.get("token") === TOKEN || request.headers.get("x-churchill-v6-token") === TOKEN;
}

async function project() {
  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("id,metadata")
    .eq("id", PROJECT_ID)
    .eq("organization_id", ORGANIZATION_ID)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_V6_SOURCE_INGEST_PROJECT_REQUIRED");
  return data;
}

async function patchProject(p, kind, record) {
  const metadata = p.metadata || {};
  const existing = metadata.churchill_v6_authentic_sources || {};
  const next = {
    ...existing,
    version: VERSION,
    status: "INGESTED_REVIEW_REQUIRED",
    master_assembly_allowed: false,
    publication_authorized: false,
    updated_at: new Date().toISOString(),
    sources: {
      ...(existing.sources || {}),
      [kind]: record,
    },
  };
  const { error } = await supabaseAdmin
    .from("creative_projects")
    .update({
      metadata: { ...metadata, churchill_v6_authentic_sources: next },
      updated_at: new Date().toISOString(),
    })
    .eq("id", PROJECT_ID)
    .eq("organization_id", ORGANIZATION_ID);
  if (error) throw error;
  return next;
}

export async function GET(request) {
  try {
    if (!auth(request)) return json({ success: false }, 404);
    const p = await project();
    return json({
      success: true,
      version: VERSION,
      source_contract: Object.fromEntries(
        Object.entries(SOURCES).map(([kind, source]) => [kind, {
          checksum_sha256: source.checksum,
          library_name: source.library_name,
          usage: source.usage,
        }]),
      ),
      ingested: p.metadata?.churchill_v6_authentic_sources || null,
    });
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}

export async function POST(request) {
  try {
    if (!auth(request)) return json({ success: false }, 404);
    const form = await request.formData();
    const kind = text(form.get("kind")).toLowerCase();
    const source = SOURCES[kind];
    if (!source) return json({ success: false, error: "CHURCHILL_V6_SOURCE_KIND_UNSUPPORTED" }, 400);

    const file = form.get("file");
    if (!(file instanceof Blob)) return json({ success: false, error: "CHURCHILL_V6_SOURCE_FILE_REQUIRED" }, 400);
    const buffer = Buffer.from(await file.arrayBuffer());
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    if (checksum !== source.checksum) {
      return json({
        success: false,
        error: "CHURCHILL_V6_SOURCE_CHECKSUM_MISMATCH",
        kind,
        expected: source.checksum,
        actual: checksum,
      }, 409);
    }

    const contentType = text(file.type || source.expected_mime).toLowerCase();
    if (contentType && contentType !== source.expected_mime) {
      return json({ success: false, error: "CHURCHILL_V6_SOURCE_MIME_MISMATCH", expected: source.expected_mime, actual: contentType }, 409);
    }

    const storagePath = `${ORGANIZATION_ID}/${PROJECT_ID}/churchill-v6/authentic-sources/${kind}-${checksum.slice(0, 12)}.${source.extension}`;
    const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, buffer, {
      contentType: source.expected_mime,
      upsert: true,
      cacheControl: "3600",
      metadata: {
        organization_id: ORGANIZATION_ID,
        creative_project_id: PROJECT_ID,
        version: VERSION,
        source_kind: kind,
        source_origin: "CHATGPT_LIBRARY_AUDITED_USER_PHOTO",
        original_library_name: source.library_name,
        checksum_sha256: checksum,
        ai_generated: "false",
        publication_authorized: "false",
      },
    });
    if (uploadError) throw uploadError;

    const p = await project();
    const record = {
      status: "INGESTED_REVIEW_REQUIRED",
      kind,
      original_library_name: source.library_name,
      source_origin: "CHATGPT_LIBRARY_AUDITED_USER_PHOTO",
      checksum_sha256: checksum,
      bytes: buffer.length,
      mime_type: source.expected_mime,
      storage_path: storagePath,
      output_reference: `storage://${BUCKET}/${storagePath}`,
      ai_generated: false,
      assistant_visual_audit_complete: true,
      user_approved_for_master: false,
      publication_authorized: false,
      usage: source.usage,
      ingested_at: new Date().toISOString(),
    };
    await patchProject(p, kind, record);
    return json({ success: true, version: VERSION, source: record });
  } catch (error) {
    console.error("CHURCHILL_V6_AUTHENTIC_SOURCE_INGEST_FAILED", { message: error?.message || String(error) });
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import crypto from "node:crypto";

import { getServiceSupabase } from "@/lib/shared/supabase/service";

const supabase = getServiceSupabase();

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const TOKEN = "avq-founder-gemini-pack-v1-20260820";

const SLOTS = Object.freeze({
  warm_office: {
    path: `${ORGANIZATION_ID}/${PROJECT_ID}/founder-originals-v1/warm-office.jpg`,
    name: "Founder Original — Warm Office",
  },
  night_office: {
    path: `${ORGANIZATION_ID}/${PROJECT_ID}/founder-originals-v1/night-office.jpg`,
    name: "Founder Original — Avantiqo Night Office",
  },
  restaurant: {
    path: `${ORGANIZATION_ID}/${PROJECT_ID}/founder-originals-v1/restaurant.jpg`,
    name: "Founder Original — Restaurant",
  },
  portrait: {
    path: `${ORGANIZATION_ID}/${PROJECT_ID}/founder-originals-v1/portrait.jpg`,
    name: "Founder Original — Portrait",
  },
  seated_hologram: {
    path: `${ORGANIZATION_ID}/${PROJECT_ID}/founder-originals-v1/seated-hologram.jpg`,
    name: "Founder Original — Seated Hologram",
  },
});

function text(value) {
  return String(value ?? "").trim();
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function storageReference(path) {
  return `storage://${BUCKET}/${path}`;
}

async function ingest(slotKey) {
  const slot = SLOTS[slotKey];
  if (!slot) throw new Error(`FOUNDER_STAGING_SLOT_INVALID:${slotKey}`);

  const { data: rows, error: rowsError } = await supabase
    .from("creative_private_binary_staging")
    .select("chunk_index, chunk_base64, expected_sha256, mime_type")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("creative_project_id", PROJECT_ID)
    .eq("staging_key", slotKey)
    .order("chunk_index", { ascending: true });
  if (rowsError) throw rowsError;
  if (!rows?.length) throw new Error(`FOUNDER_STAGING_EMPTY:${slotKey}`);

  const expected = text(rows[0].expected_sha256);
  const mimeType = text(rows[0].mime_type) || "image/jpeg";
  if (!expected) throw new Error(`FOUNDER_STAGING_SHA_REQUIRED:${slotKey}`);
  if (rows.some((row) => text(row.expected_sha256) !== expected)) {
    throw new Error(`FOUNDER_STAGING_SHA_INCONSISTENT:${slotKey}`);
  }

  const bytes = Buffer.concat(
    rows.map((row) => Buffer.from(text(row.chunk_base64), "base64")),
  );
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
  if (checksum !== expected) {
    throw new Error(`FOUNDER_STAGING_CHECKSUM_MISMATCH:${slotKey}:${checksum}`);
  }

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(slot.path, bytes, {
      contentType: mimeType,
      cacheControl: "3600",
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const reference = storageReference(slot.path);
  const { data: existing, error: existingError } = await supabase
    .from("creative_asset_nodes")
    .select("id")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("creative_project_id", PROJECT_ID)
    .eq("url", reference)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  let assetId = existing?.id || null;
  if (!assetId) {
    const { data: asset, error: assetError } = await supabase
      .from("creative_asset_nodes")
      .insert({
        organization_id: ORGANIZATION_ID,
        creative_project_id: PROJECT_ID,
        type: "IMAGE",
        status: "IMPORTED",
        title: slot.name,
        name: slot.name,
        description: "User-supplied founder identity source staged privately for governed Gemini motion generation.",
        uri: reference,
        url: reference,
        storage_path: slot.path,
        technical: {
          mime_type: mimeType,
          width: 1672,
          height: 941,
          checksum_sha256: checksum,
          size_bytes: bytes.length,
          transport_encoding: "JPEG_Q92_FROM_USER_ORIGINAL",
        },
        metadata: {
          founder_original_source: true,
          founder_source_slot: slotKey,
          source_policy: "USER_SUPPLIED_ORIGINAL_PRIVATE_TRANSPORT",
          identity_reference: true,
          creative_project_id: PROJECT_ID,
        },
        lineage: {
          source: "USER_SUPPLIED_ORIGINAL",
          parent_asset_ids: [],
        },
        review: {
          human_supplied: true,
          identity_reference: true,
        },
        reuse: {
          allowed: true,
          founder_identity_only: true,
        },
      })
      .select("id")
      .single();
    if (assetError) throw assetError;
    assetId = asset.id;
  }

  const { error: cleanupError } = await supabase
    .from("creative_private_binary_staging")
    .delete()
    .eq("organization_id", ORGANIZATION_ID)
    .eq("creative_project_id", PROJECT_ID)
    .eq("staging_key", slotKey);
  if (cleanupError) throw cleanupError;

  return {
    slot: slotKey,
    asset_id: assetId,
    storage_reference: reference,
    checksum_sha256: checksum,
    bytes: bytes.length,
    mime_type: mimeType,
    staging_deleted: true,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) {
      return json({ success: false }, 404);
    }

    const slot = text(url.searchParams.get("slot"));
    if (slot) {
      return json({ success: true, result: await ingest(slot) });
    }

    const results = [];
    for (const slotKey of Object.keys(SLOTS)) {
      results.push(await ingest(slotKey));
    }
    return json({ success: true, results });
  } catch (error) {
    return json({
      success: false,
      error: error?.message || String(error),
    }, 500);
  }
}

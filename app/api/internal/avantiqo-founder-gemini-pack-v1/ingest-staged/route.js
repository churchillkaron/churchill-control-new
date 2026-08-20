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
    sha256: "77ff23afbe347f1052f641d07dae75ba01aead4026447c830848d22e0d3550d8",
  },
  night_office: {
    path: `${ORGANIZATION_ID}/${PROJECT_ID}/founder-originals-v1/night-office.jpg`,
    name: "Founder Original — Avantiqo Night Office",
    sha256: "d085b294dc2e261fa75d36373175ee87259f13da54f36b125cadf88639d3503c",
  },
  restaurant: {
    path: `${ORGANIZATION_ID}/${PROJECT_ID}/founder-originals-v1/restaurant.jpg`,
    name: "Founder Original — Restaurant",
    sha256: "327f3b6718cbe8f3578646845447a91f6cf8682cc269a5b647501c85bb4f83ef",
  },
  portrait: {
    path: `${ORGANIZATION_ID}/${PROJECT_ID}/founder-originals-v1/portrait.jpg`,
    name: "Founder Original — Portrait",
    sha256: "6665fb9ee71c3e18d070d9e11f5439640e6fe2eebee916e75cb2fae8963bd94c",
  },
  seated_hologram: {
    path: `${ORGANIZATION_ID}/${PROJECT_ID}/founder-originals-v1/seated-hologram.jpg`,
    name: "Founder Original — Seated Hologram",
    sha256: "0d57bea3c27980cdb520946b198b10ef1e1e7e400d248609cbb52af5b8dda6ed",
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

function assertPrivateTransportUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("FOUNDER_TRANSPORT_HTTPS_REQUIRED");
  const host = url.hostname.toLowerCase();
  if (!(host === "oaiusercontent.com" || host.endsWith(".oaiusercontent.com"))) {
    throw new Error("FOUNDER_TRANSPORT_HOST_NOT_ALLOWED");
  }
  return url.toString();
}

async function signedTransportBytes(sourceUrl) {
  const response = await fetch(assertPrivateTransportUrl(sourceUrl), {
    cache: "no-store",
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`FOUNDER_TRANSPORT_FETCH_FAILED:${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function stagedBytes(slotKey) {
  const { data: rows, error } = await supabase
    .from("creative_private_binary_staging")
    .select("chunk_index, chunk_base64, expected_sha256, mime_type")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("creative_project_id", PROJECT_ID)
    .eq("staging_key", slotKey)
    .order("chunk_index", { ascending: true });
  if (error) throw error;
  if (!rows?.length) throw new Error(`FOUNDER_STAGING_EMPTY:${slotKey}`);

  const expected = text(rows[0].expected_sha256);
  if (!expected) throw new Error(`FOUNDER_STAGING_SHA_REQUIRED:${slotKey}`);
  if (rows.some((row) => text(row.expected_sha256) !== expected)) {
    throw new Error(`FOUNDER_STAGING_SHA_INCONSISTENT:${slotKey}`);
  }

  return {
    bytes: Buffer.concat(rows.map((row) => Buffer.from(text(row.chunk_base64), "base64"))),
    expected,
    mimeType: text(rows[0].mime_type) || "image/jpeg",
    staged: true,
  };
}

async function registerAsset(slotKey, slot, bytes, checksum, mimeType) {
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
  if (existing?.id) return existing.id;

  const { data: asset, error } = await supabase
    .from("creative_asset_nodes")
    .insert({
      organization_id: ORGANIZATION_ID,
      creative_project_id: PROJECT_ID,
      type: "IMAGE",
      status: "IMPORTED",
      title: slot.name,
      name: slot.name,
      description: "User-supplied founder identity source transported privately for governed Gemini motion generation.",
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
      lineage: { source: "USER_SUPPLIED_ORIGINAL", parent_asset_ids: [] },
      review: { human_supplied: true, identity_reference: true },
      reuse: { allowed: true, founder_identity_only: true },
    })
    .select("id")
    .single();
  if (error) throw error;
  return asset.id;
}

async function ingest(slotKey, sourceUrl = null) {
  const slot = SLOTS[slotKey];
  if (!slot) throw new Error(`FOUNDER_STAGING_SLOT_INVALID:${slotKey}`);

  let payload;
  if (sourceUrl) {
    payload = {
      bytes: await signedTransportBytes(sourceUrl),
      expected: slot.sha256,
      mimeType: "image/jpeg",
      staged: false,
    };
  } else {
    payload = await stagedBytes(slotKey);
  }

  const checksum = crypto.createHash("sha256").update(payload.bytes).digest("hex");
  if (checksum !== payload.expected || checksum !== slot.sha256) {
    throw new Error(`FOUNDER_SOURCE_CHECKSUM_MISMATCH:${slotKey}:${checksum}`);
  }

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(slot.path, payload.bytes, {
      contentType: payload.mimeType,
      cacheControl: "3600",
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const assetId = await registerAsset(
    slotKey,
    slot,
    payload.bytes,
    checksum,
    payload.mimeType,
  );

  if (payload.staged) {
    const { error: cleanupError } = await supabase
      .from("creative_private_binary_staging")
      .delete()
      .eq("organization_id", ORGANIZATION_ID)
      .eq("creative_project_id", PROJECT_ID)
      .eq("staging_key", slotKey);
    if (cleanupError) throw cleanupError;
  }

  return {
    slot: slotKey,
    asset_id: assetId,
    storage_reference: storageReference(slot.path),
    checksum_sha256: checksum,
    bytes: payload.bytes.length,
    mime_type: payload.mimeType,
    transport: sourceUrl ? "signed_private_url" : "private_staging_table",
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) {
      return json({ success: false }, 404);
    }

    const slot = text(url.searchParams.get("slot"));
    const sourceUrl = text(url.searchParams.get("source_url"));
    if (sourceUrl && !slot) {
      return json({ success: false, error: "slot required for source_url" }, 400);
    }
    if (slot) {
      return json({ success: true, result: await ingest(slot, sourceUrl || null) });
    }

    const results = [];
    for (const slotKey of Object.keys(SLOTS)) {
      results.push(await ingest(slotKey));
    }
    return json({ success: true, results });
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}

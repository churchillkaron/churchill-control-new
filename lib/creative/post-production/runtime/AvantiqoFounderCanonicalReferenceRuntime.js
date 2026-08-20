import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { uploadCreativeAsset } from "@/lib/creative/assets/storage/uploadCreativeAsset";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const ASSET_ID = "3e1b5197-5279-4713-93ed-0b0defc9581a";
const EXPECTED_SHA256 = "40309c0610076b2107e4f2ca50c265187c097756a7bfdecb9e7909e6ca5c795a";
const EXPECTED_BYTES = 10980;
const CHUNK_KEYS = [
  "bootstrap_b64_1",
  "bootstrap_b64_2",
  "bootstrap_b64_3",
  "bootstrap_b64_4",
  "bootstrap_b64_5",
];

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function checksum(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function loadAsset() {
  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .select("id,organization_id,name,file_name,file_url,image_url,metadata,source_type,status,approval_state")
    .eq("id", ASSET_ID)
    .eq("organization_id", ORGANIZATION_ID)
    .single();
  if (error) throw error;
  if (!data) throw new Error("FOUNDER_CANONICAL_REFERENCE_NOT_FOUND");
  return data;
}

function verifiedBootstrap(asset) {
  const metadata = object(asset.metadata);
  const encoded = CHUNK_KEYS.map((key) => text(metadata[key])).join("");
  if (!encoded) throw new Error("FOUNDER_CANONICAL_REFERENCE_BYTES_REQUIRED");

  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length !== EXPECTED_BYTES) {
    throw new Error(`FOUNDER_CANONICAL_REFERENCE_SIZE_MISMATCH:${bytes.length}:${EXPECTED_BYTES}`);
  }
  const actual = checksum(bytes);
  if (actual !== EXPECTED_SHA256) {
    throw new Error(`FOUNDER_CANONICAL_REFERENCE_CHECKSUM_MISMATCH:${actual}`);
  }
  if (text(metadata.bootstrap_checksum_sha256) !== EXPECTED_SHA256) {
    throw new Error("FOUNDER_CANONICAL_REFERENCE_DECLARED_CHECKSUM_MISMATCH");
  }
  return bytes;
}

function storedUrl(asset) {
  const candidate = text(asset.image_url || asset.file_url);
  return /^storage:\/\//i.test(candidate) ? candidate : null;
}

export async function ensureAvantiqoFounderCanonicalReference() {
  const asset = await loadAsset();
  const existing = storedUrl(asset);
  if (existing) {
    return {
      asset_id: ASSET_ID,
      url: existing,
      checksum_sha256: EXPECTED_SHA256,
      source_type: asset.source_type,
      reused: true,
    };
  }

  const bytes = verifiedBootstrap(asset);
  const upload = await uploadCreativeAsset({
    file: {
      buffer: bytes,
      name: "avantiqo-founder-canonical-identity-anchor.jpg",
      type: "image/jpeg",
    },
    organizationId: ORGANIZATION_ID,
    creativeMissionId: null,
    creativeProjectId: null,
    uploadedBy: null,
  });

  if (upload.checksum_sha256 !== EXPECTED_SHA256) {
    throw new Error("FOUNDER_CANONICAL_REFERENCE_UPLOAD_CHECKSUM_MISMATCH");
  }

  const metadata = {
    ...object(asset.metadata),
    storage_bucket: upload.bucket,
    storage_path: upload.path,
    mime_type: upload.mime_type,
    checksum_sha256: upload.checksum_sha256,
    canonical_founder_identity: true,
    approved_by_user: true,
    must_preserve_identity: true,
    promoted_to_private_storage_at: new Date().toISOString(),
  };
  for (const key of CHUNK_KEYS) delete metadata[key];

  const { data: updated, error } = await supabaseAdmin
    .from("creative_assets")
    .update({
      file_url: upload.file_url,
      image_url: upload.file_url,
      thumbnail_url: upload.file_url,
      metadata,
      source_type: "USER_APPROVED_IDENTITY_REFERENCE",
      ai_generated: false,
      score: 100,
      status: "active",
      approval_state: "approved",
    })
    .eq("id", ASSET_ID)
    .eq("organization_id", ORGANIZATION_ID)
    .select("id,file_url,image_url,source_type,metadata")
    .single();
  if (error) throw error;

  const url = storedUrl(updated);
  if (!url) throw new Error("FOUNDER_CANONICAL_REFERENCE_STORAGE_URL_REQUIRED");

  return {
    asset_id: ASSET_ID,
    url,
    checksum_sha256: EXPECTED_SHA256,
    source_type: updated.source_type,
    reused: false,
  };
}

export const AvantiqoFounderCanonicalReferenceRuntime = Object.freeze({
  asset_id: ASSET_ID,
  expected_sha256: EXPECTED_SHA256,
  ensure: ensureAvantiqoFounderCanonicalReference,
});

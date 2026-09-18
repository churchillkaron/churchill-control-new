import crypto from "node:crypto";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { creativeStorageUri } from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";

export const CREATIVE_RECONSTRUCTION_ARTIFACT_CONTRACT =
  "CREATIVE_RECONSTRUCTION_ARTIFACT_V1";

const supabase = getServiceSupabase();

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safe(value, fallback = "artifact") {
  return text(value || fallback).normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || fallback;
}
function checksum(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }
function digest(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

function nodeType(mimeType, artifactKind) {
  const mime = text(mimeType).toLowerCase();
  const kind = text(artifactKind).toUpperCase();
  if (mime.startsWith("image/") || /MAP|MASK|DEPTH|NORMAL/.test(kind)) return CREATIVE_ASSET_NODE_TYPES.IMAGE;
  return CREATIVE_ASSET_NODE_TYPES.ASSET;
}

export async function persistReconstructionArtifact({
  organization_id,
  creative_project_id,
  creative_mission_id = null,
  shot_id,
  reconstruction_contract_hash,
  artifact_kind,
  buffer,
  mime_type,
  extension,
  provider_id = null,
  capability = null,
  source_asset_ids = [],
  upstream_asset_node_ids = [],
  technical = {},
  intelligence = {},
  metadata = {},
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");
  if (!text(shot_id)) throw new Error("RECONSTRUCTION_ARTIFACT_SHOT_REQUIRED");
  if (!text(reconstruction_contract_hash)) throw new Error("RECONSTRUCTION_ARTIFACT_CONTRACT_HASH_REQUIRED");
  if (!text(artifact_kind)) throw new Error("RECONSTRUCTION_ARTIFACT_KIND_REQUIRED");
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error("RECONSTRUCTION_ARTIFACT_BUFFER_REQUIRED");
  if (!text(mime_type) || !text(extension)) throw new Error("RECONSTRUCTION_ARTIFACT_FORMAT_REQUIRED");

  const sha256 = checksum(buffer);
  const identity = digest({
    organization_id,
    creative_project_id,
    shot_id,
    reconstruction_contract_hash,
    artifact_kind: text(artifact_kind).toUpperCase(),
    sha256,
  });
  const bucket = text(
    process.env.CREATIVE_RECONSTRUCTION_BUCKET ||
    process.env.CREATIVE_MEDIA_RENDER_BUCKET ||
    process.env.CREATIVE_STILL_RENDER_BUCKET,
  );
  if (!bucket) throw new Error("CREATIVE_RECONSTRUCTION_STORAGE_BUCKET_REQUIRED");
  const storagePath = [
    safe(organization_id),
    safe(creative_project_id),
    "reconstruction",
    safe(shot_id),
    safe(reconstruction_contract_hash.slice(0, 20)),
    `${safe(artifact_kind)}-${identity.slice(0, 20)}.${safe(extension)}`,
  ].join("/");
  const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    contentType: mime_type,
    upsert: false,
  });
  if (error && Number(error.statusCode || error.status) !== 409) throw error;
  const storageUri = creativeStorageUri(bucket, storagePath);

  const node = createCreativeAssetNode({
    organization_id,
    creative_project_id,
    type: nodeType(mime_type, artifact_kind),
    status: CREATIVE_ASSET_NODE_STATUS.DERIVED,
    name: `${artifact_kind} · ${shot_id}`,
    description: `Governed scene-reconstruction artifact ${artifact_kind} for shot ${shot_id}.`,
    url: storageUri,
    storage_path: storagePath,
    lineage: {
      source: "scene_reconstruction",
      provider_id,
      capability,
      generation_version: 1,
    },
    technical: {
      ...object(technical),
      mime_type,
      checksum: sha256,
      file_size_bytes: buffer.length,
    },
    intelligence: {
      ...object(intelligence),
      safety_status: intelligence.safety_status || "NOT_APPLICABLE",
      tags: [
        ...new Set([
          ...(Array.isArray(intelligence.tags) ? intelligence.tags : []),
          "scene-reconstruction",
          text(artifact_kind).toLowerCase(),
        ]),
      ],
    },
    cost: { currency: null, estimated: 0, actual: 0, saved_by_reuse: 0 },
    reuse: { reusable: true, reuse_count: 0, approved_for_reuse: false },
    review: {
      ai_reviewed: false,
      human_reviewed: false,
      approved: false,
      notes: "Derived reconstruction evidence. Downstream use requires reconstruction QC/certification.",
    },
    metadata: {
      ...object(metadata),
      contract: CREATIVE_RECONSTRUCTION_ARTIFACT_CONTRACT,
      reconstruction_artifact_identity: identity,
      reconstruction_contract_hash,
      creative_mission_id,
      shot_id,
      pass_id: "scene-reconstruction",
      artifact_kind: text(artifact_kind).toUpperCase(),
      source_asset_ids: Array.isArray(source_asset_ids) ? source_asset_ids : [],
      upstream_asset_node_ids: Array.isArray(upstream_asset_node_ids) ? upstream_asset_node_ids : [],
      checksum_sha256: sha256,
      durable_evidence: true,
      release_approved: false,
    },
  });

  const persisted = await AssetGraphRepository.createOrFindByMetadataIdentity({
    node,
    metadata_key: "reconstruction_artifact_identity",
    metadata_value: identity,
  });
  return {
    contract: CREATIVE_RECONSTRUCTION_ARTIFACT_CONTRACT,
    created: persisted.created,
    node: persisted.node,
    storage_reference: storageUri,
    storage_path: storagePath,
    checksum_sha256: sha256,
    artifact_identity: identity,
  };
}

export async function persistReconstructionJson(input = {}) {
  const payload = Buffer.from(JSON.stringify(input.value ?? {}, null, 2), "utf8");
  return persistReconstructionArtifact({
    ...input,
    buffer: payload,
    mime_type: "application/json",
    extension: "json",
  });
}

export const CreativeReconstructionArtifactRuntime = Object.freeze({
  contract: CREATIVE_RECONSTRUCTION_ARTIFACT_CONTRACT,
  persist: persistReconstructionArtifact,
  persistJson: persistReconstructionJson,
});

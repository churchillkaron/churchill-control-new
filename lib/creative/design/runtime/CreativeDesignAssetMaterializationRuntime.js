import crypto from "node:crypto";
import fs from "node:fs/promises";

import {
  materializeMedia,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CREATIVE_ASSET_NODE_STATUS,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import {
  validateCreativeDesignDocument,
} from "../contracts/CreativeDesignDocumentContract.js";

const CONTRACT = "CREATIVE_DESIGN_ASSET_MATERIALIZATION_V2";

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function requestedAssets(document = {}) {
  const requests = [];
  for (const page of document.pages) {
    for (const node of page.nodes) {
      if (!["IMAGE", "VECTOR"].includes(node.type)) continue;
      if (!text(node.asset_id)) continue;
      requests.push({
        page_id: page.id,
        node_id: node.id,
        asset_id: text(node.asset_id),
        expected_reference: text(node.asset_reference || node.asset_url) || null,
      });
    }
  }
  return requests;
}

function expectedChecksum(node = {}) {
  return text(
    node.technical?.checksum_sha256 ||
    node.technical?.checksum ||
    node.metadata?.checksum_sha256 ||
    node.metadata?.checksum,
  ).replace(/^sha256:/i, "").toLowerCase() || null;
}

function assertRenderableAssetNode(node, document, request) {
  if (!node) throw new Error(`CREATIVE_DESIGN_ASSET_NOT_FOUND:${request.asset_id}`);
  if (text(node.organization_id) !== document.organization_id) {
    throw new Error(`CREATIVE_DESIGN_ASSET_ORGANIZATION_MISMATCH:${node.id}`);
  }
  if (
    node.creative_project_id &&
    text(node.creative_project_id) !== document.creative_project_id
  ) {
    throw new Error(`CREATIVE_DESIGN_ASSET_PROJECT_MISMATCH:${node.id}`);
  }
  if ([
    CREATIVE_ASSET_NODE_STATUS.REJECTED,
    CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
  ].includes(node.status)) {
    throw new Error(`CREATIVE_DESIGN_ASSET_NOT_RENDERABLE:${node.id}`);
  }
  if (!text(node.url)) {
    throw new Error(`CREATIVE_DESIGN_ASSET_REFERENCE_REQUIRED:${node.id}`);
  }
  if (
    request.expected_reference &&
    request.expected_reference !== text(node.url)
  ) {
    throw new Error(`CREATIVE_DESIGN_ASSET_REFERENCE_MISMATCH:${node.id}`);
  }
}

function inferMime(node = {}, material = {}) {
  return text(
    node.technical?.mime_type ||
    material.mime_type ||
    "application/octet-stream",
  ).toLowerCase();
}

function technicalDimensions(node = {}) {
  return {
    width_pixels: finite(
      node.technical?.width_pixels ||
      node.technical?.width ||
      node.metadata?.width_pixels ||
      node.metadata?.width,
    ),
    height_pixels: finite(
      node.technical?.height_pixels ||
      node.technical?.height ||
      node.metadata?.height_pixels ||
      node.metadata?.height,
    ),
  };
}

export async function materializeCreativeDesignAssets({
  document: rawDocument,
  media_policy = {},
} = {}) {
  const document = validateCreativeDesignDocument(rawDocument);
  const requests = requestedAssets(document);
  const bindings = new Map();
  const materials = [];

  try {
    for (const request of requests) {
      if (bindings.has(request.asset_id)) continue;
      const node = await AssetGraphRepository.getById(request.asset_id);
      assertRenderableAssetNode(node, document, request);

      const material = await materializeMedia({
        url: node.url,
        file_name:
          node.metadata?.original_file_name ||
          node.name ||
          `asset-${node.id}`,
        mime_type: node.technical?.mime_type || null,
        organization_id: document.organization_id,
        policy: media_policy,
      });
      materials.push(material);

      const bytes = await fs.readFile(material.file_path);
      const actualChecksum = crypto.createHash("sha256").update(bytes).digest("hex");
      const canonicalChecksum = expectedChecksum(node);
      if (canonicalChecksum && canonicalChecksum !== actualChecksum) {
        throw new Error(`CREATIVE_DESIGN_ASSET_CHECKSUM_MISMATCH:${node.id}`);
      }
      const mimeType = inferMime(node, material);
      const dimensions = technicalDimensions(node);

      bindings.set(request.asset_id, {
        asset_node_id: node.id,
        creative_asset_id: node.creative_asset_id || null,
        source_reference: node.url,
        checksum_sha256: actualChecksum,
        canonical_checksum_sha256: canonicalChecksum,
        checksum_verified: canonicalChecksum ? true : null,
        canonical_checksum_available: Boolean(canonicalChecksum),
        mime_type: mimeType,
        byte_length: bytes.length,
        data_url: `data:${mimeType};base64,${bytes.toString("base64")}`,
        asset_type: node.type,
        width_pixels: dimensions.width_pixels,
        height_pixels: dimensions.height_pixels,
        approved:
          node.status === CREATIVE_ASSET_NODE_STATUS.APPROVED ||
          node.review?.approved === true,
      });
    }

    return {
      success: true,
      contract: CONTRACT,
      document_hash: document.document_hash,
      bindings,
      evidence: [...bindings.entries()].map(([assetId, binding]) => ({
        asset_id: assetId,
        asset_node_id: binding.asset_node_id,
        creative_asset_id: binding.creative_asset_id,
        checksum_sha256: binding.checksum_sha256,
        canonical_checksum_sha256: binding.canonical_checksum_sha256,
        checksum_verified: binding.checksum_verified,
        canonical_checksum_available: binding.canonical_checksum_available,
        mime_type: binding.mime_type,
        byte_length: binding.byte_length,
        asset_type: binding.asset_type,
        width_pixels: binding.width_pixels,
        height_pixels: binding.height_pixels,
        approved: binding.approved,
      })),
      exact_asset_bytes_materialized: true,
      technical_dimensions_preserved: true,
      remote_reference_used_for_final_render: false,
      provider_called: false,
      async cleanup() {
        await Promise.all(materials.map((material) => material.cleanup()));
      },
    };
  } catch (error) {
    await Promise.allSettled(materials.map((material) => material.cleanup()));
    throw error;
  }
}

export const CreativeDesignAssetMaterializationRuntime = Object.freeze({
  contract: CONTRACT,
  materialize: materializeCreativeDesignAssets,
});

export default CreativeDesignAssetMaterializationRuntime;

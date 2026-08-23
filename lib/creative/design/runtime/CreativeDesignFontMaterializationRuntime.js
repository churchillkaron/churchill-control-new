import fs from "node:fs/promises";

import {
  materializeMedia,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import {
  validateCreativeDesignDocument,
} from "../contracts/CreativeDesignDocumentContract.js";
import {
  CreativePlatformFontAssetRuntime,
} from "./CreativePlatformFontAssetRuntime.js";

const CONTRACT = "CREATIVE_DESIGN_FONT_MATERIALIZATION_V4";
const ALLOWED_FONT_MIME = new Set([
  "font/ttf",
  "font/otf",
  "font/woff",
  "font/woff2",
  "application/x-font-ttf",
  "application/x-font-opentype",
  "application/font-woff",
  "application/font-woff2",
]);
const GENERIC_BINARY_MIME = new Set([
  "application/octet-stream",
  "binary/octet-stream",
  "application/binary",
]);

function text(value) {
  return String(value ?? "").trim();
}

function requestedFontIds(document = {}) {
  return [...new Set(
    document.pages
      .flatMap((page) => page.nodes)
      .filter((node) => ["TEXT", "TABLE"].includes(node.type))
      .map((node) => text(node.typography?.font_asset_id))
      .filter(Boolean),
  )];
}

function isPlatformNode(node = {}) {
  return node.metadata?.platform_font === true ||
    CreativePlatformFontAssetRuntime.isPlatformFontAssetId(node.id);
}

function fontFamily(node = {}) {
  return text(
    node.metadata?.font_family ||
    node.metadata?.fontFamily ||
    node.metadata?.family ||
    node.name,
  );
}

function assertRenderableFontNode(node, document) {
  if (!node) throw new Error("CREATIVE_DESIGN_FONT_ASSET_NOT_FOUND");
  if (!isPlatformNode(node)) {
    if (text(node.organization_id) !== document.organization_id) {
      throw new Error(`CREATIVE_DESIGN_FONT_ORGANIZATION_MISMATCH:${node.id}`);
    }
    if (
      node.creative_project_id &&
      text(node.creative_project_id) !== document.creative_project_id
    ) {
      throw new Error(`CREATIVE_DESIGN_FONT_PROJECT_MISMATCH:${node.id}`);
    }
  } else if (node.metadata?.font_license_verified !== true) {
    throw new Error(`CREATIVE_DESIGN_PLATFORM_FONT_LICENSE_UNVERIFIED:${node.id}`);
  }
  if (node.type !== CREATIVE_ASSET_NODE_TYPES.FONT) {
    throw new Error(`CREATIVE_DESIGN_FONT_ASSET_TYPE_INVALID:${node.id}`);
  }
  if (
    node.status === CREATIVE_ASSET_NODE_STATUS.REJECTED ||
    node.status === CREATIVE_ASSET_NODE_STATUS.ARCHIVED ||
    !text(node.url)
  ) {
    throw new Error(`CREATIVE_DESIGN_FONT_ASSET_NOT_RENDERABLE:${node.id}`);
  }
  if (!fontFamily(node)) {
    throw new Error(`CREATIVE_DESIGN_FONT_FAMILY_REQUIRED:${node.id}`);
  }
}

function cssFamily(node) {
  const declared = fontFamily(node);
  return declared || `AvantiqoFont-${String(node.id).replace(/[^A-Za-z0-9_-]/g, "")}`;
}

function resolvedFontMime(material, node) {
  const remote = text(material?.mime_type).toLowerCase();
  const declared = text(node?.technical?.mime_type).toLowerCase();
  if (ALLOWED_FONT_MIME.has(remote)) return remote;
  if ((!remote || GENERIC_BINARY_MIME.has(remote)) && ALLOWED_FONT_MIME.has(declared)) {
    return declared;
  }
  return remote || declared;
}

async function resolveFontNode({ document, projectNodes, fontAssetId }) {
  if (CreativePlatformFontAssetRuntime.isPlatformFontAssetId(fontAssetId)) {
    const platform = await CreativePlatformFontAssetRuntime.get(fontAssetId);
    if (!platform) throw new Error(`CREATIVE_DESIGN_PLATFORM_FONT_NOT_FOUND:${fontAssetId}`);
    return platform;
  }
  const inProject = projectNodes.find((node) => text(node.id) === fontAssetId);
  if (inProject) return inProject;
  const direct = await AssetGraphRepository.getById(fontAssetId);
  if (!direct) throw new Error(`CREATIVE_DESIGN_FONT_ASSET_NOT_FOUND:${fontAssetId}`);
  return direct;
}

export async function materializeCreativeDesignFonts({
  document: rawDocument,
  media_policy = {},
} = {}) {
  const document = validateCreativeDesignDocument(rawDocument);
  const fontIds = requestedFontIds(document);
  const organizationFontIds = fontIds.filter(
    (id) => !CreativePlatformFontAssetRuntime.isPlatformFontAssetId(id),
  );
  const projectNodes = organizationFontIds.length
    ? await AssetGraphRepository.listByProject({
        organization_id: document.organization_id,
        creative_project_id: document.creative_project_id,
      })
    : [];

  const bindings = new Map();
  const materials = [];

  try {
    for (const fontAssetId of fontIds) {
      const node = await resolveFontNode({ document, projectNodes, fontAssetId });
      assertRenderableFontNode(node, document);

      const material = await materializeMedia({
        url: node.url,
        file_name:
          node.metadata?.original_file_name ||
          node.name ||
          `font-${String(node.id).replace(/[^A-Za-z0-9_-]/g, "")}.ttf`,
        mime_type: node.technical?.mime_type || null,
        organization_id: document.organization_id,
        policy: media_policy,
      });
      materials.push(material);

      const bytes = await fs.readFile(material.file_path);
      const mimeType = resolvedFontMime(material, node);
      if (!ALLOWED_FONT_MIME.has(mimeType)) {
        throw new Error(`CREATIVE_DESIGN_FONT_MIME_UNSUPPORTED:${node.id}:${mimeType || "missing"}`);
      }
      const checksum = text(material.checksum || node.technical?.checksum);
      if (!checksum) {
        throw new Error(`CREATIVE_DESIGN_FONT_CHECKSUM_REQUIRED:${node.id}`);
      }
      const family = fontFamily(node);

      bindings.set(fontAssetId, {
        asset_node_id: node.id,
        font_family: family,
        css_family: cssFamily(node),
        checksum,
        mime_type: mimeType,
        byte_length: bytes.length,
        data_url: `data:${mimeType};base64,${bytes.toString("base64")}`,
        file_path: material.file_path,
        source: isPlatformNode(node) ? "AVANTIQO_FONT_LIBRARY" : "ORGANIZATION_FONT",
        license_id: node.metadata?.font_license_id || null,
      });
    }

    return {
      success: true,
      contract: CONTRACT,
      document_hash: document.document_hash,
      bindings,
      evidence: [...bindings.entries()].map(([fontAssetId, binding]) => ({
        font_asset_id: fontAssetId,
        asset_node_id: binding.asset_node_id,
        font_family: binding.font_family,
        checksum: binding.checksum,
        mime_type: binding.mime_type,
        byte_length: binding.byte_length,
        css_family: binding.css_family,
        source: binding.source,
        license_id: binding.license_id,
      })),
      exact_font_assets_verified: true,
      exact_font_family_verified: true,
      host_os_font_lookup_used: false,
      async cleanup() {
        await Promise.all(materials.map((material) => material.cleanup()));
      },
    };
  } catch (error) {
    await Promise.allSettled(materials.map((material) => material.cleanup()));
    throw error;
  }
}

export const CreativeDesignFontMaterializationRuntime = Object.freeze({
  contract: CONTRACT,
  materialize: materializeCreativeDesignFonts,
});
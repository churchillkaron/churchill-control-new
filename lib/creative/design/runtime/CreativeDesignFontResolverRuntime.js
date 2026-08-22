import {
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  AVANTIQO_FONT_LIBRARY,
  getAvantiqoFont,
} from "../registry/CreativeFontLibraryRegistry.js";
import {
  CreativePlatformFontAssetRuntime,
} from "./CreativePlatformFontAssetRuntime.js";

const CONTRACT = "CREATIVE_DESIGN_FONT_RESOLVER_V2";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalized(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isRenderableFont(node = {}) {
  return Boolean(
    node.type === CREATIVE_ASSET_NODE_TYPES.FONT &&
    text(node.url) &&
    ![
      CREATIVE_ASSET_NODE_STATUS.REJECTED,
      CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
    ].includes(node.status),
  );
}

function fontIdentity(node = {}) {
  const metadata = object(node.metadata);
  return {
    asset_node_id: node.id,
    family: text(metadata.font_family || metadata.fontFamily || metadata.family || node.name),
    style: text(metadata.font_style || metadata.style || "Regular"),
    weight: Number(metadata.font_weight || metadata.weight || 400),
    checksum: text(node.technical?.checksum || node.technical?.checksum_sha256),
    mime_type: text(node.technical?.mime_type),
    source: text(metadata.font_library_source || metadata.source || "ORGANIZATION_FONT"),
    license_id: text(metadata.font_license_id || metadata.license_id) || null,
    license_verified: metadata.font_license_verified === true || metadata.license_verified === true,
    brand_approved:
      node.status === CREATIVE_ASSET_NODE_STATUS.APPROVED ||
      node.review?.approved === true ||
      metadata.brand_approved === true,
  };
}

function scoreFont(identity, request = {}) {
  let score = 0;
  const family = normalized(identity.family);
  const wantedFamily = normalized(request.family);
  if (wantedFamily && family === wantedFamily) score += 1000;
  else if (wantedFamily && family.includes(wantedFamily)) score += 700;
  else if (!wantedFamily) score += 100;
  score -= Math.abs(Number(identity.weight || 400) - Number(request.weight || 400));
  if (normalized(identity.style) === normalized(request.style || "regular")) score += 100;
  if (identity.brand_approved) score += 50;
  if (identity.license_verified) score += 20;
  return score;
}

function choose(nodes, request = {}) {
  return nodes
    .filter(isRenderableFont)
    .map((node) => ({ node, identity: fontIdentity(node) }))
    .map((entry) => ({ ...entry, score: scoreFont(entry.identity, request) }))
    .sort((left, right) => right.score - left.score)[0] || null;
}

async function organizationFonts({ organization_id, creative_project_id = null } = {}) {
  const nodes = creative_project_id
    ? await AssetGraphRepository.listByProject({ organization_id, creative_project_id })
    : await AssetGraphRepository.listByOrganization({ organization_id });
  return list(nodes).filter((node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.FONT &&
    text(node.organization_id) === text(organization_id),
  );
}

async function platformMatchForFamily(family) {
  const entry = getAvantiqoFont(family);
  if (!entry) return null;
  const node = await CreativePlatformFontAssetRuntime.get(entry.id);
  return node ? { node, identity: fontIdentity(node) } : null;
}

async function defaultPlatformMatch() {
  const entry = [...AVANTIQO_FONT_LIBRARY]
    .sort((left, right) => Number(left.priority || 0) - Number(right.priority || 0))[0];
  if (!entry) return null;
  const node = await CreativePlatformFontAssetRuntime.get(entry.id);
  return node ? { node, identity: fontIdentity(node) } : null;
}

export async function resolveCreativeDesignFont({
  organization_id,
  creative_project_id = null,
  font_asset_id = null,
  family = null,
  weight = 400,
  style = "Regular",
  exact = false,
  brand_locked = false,
} = {}) {
  const organizationId = text(organization_id);
  if (!organizationId) throw new Error("CREATIVE_DESIGN_FONT_ORGANIZATION_REQUIRED");
  const orgFonts = await organizationFonts({ organization_id: organizationId, creative_project_id });

  if (font_asset_id) {
    if (CreativePlatformFontAssetRuntime.isPlatformFontAssetId(font_asset_id)) {
      if (brand_locked) throw new Error("CREATIVE_DESIGN_BRAND_LOCKED_PLATFORM_FONT_FORBIDDEN");
      const node = await CreativePlatformFontAssetRuntime.get(font_asset_id);
      if (!node) throw new Error(`CREATIVE_DESIGN_PLATFORM_FONT_NOT_FOUND:${font_asset_id}`);
      return { success: true, contract: CONTRACT, source: "AVANTIQO_FONT_LIBRARY", asset_node: node, font: fontIdentity(node), exact_match: true, fallback_used: false };
    }
    const node = orgFonts.find((candidate) => text(candidate.id) === text(font_asset_id));
    if (!node || !isRenderableFont(node)) {
      throw new Error(`CREATIVE_DESIGN_FONT_ASSET_NOT_RENDERABLE:${font_asset_id}`);
    }
    return { success: true, contract: CONTRACT, source: "ORGANIZATION_FONT", asset_node: node, font: fontIdentity(node), exact_match: true, fallback_used: false };
  }

  const request = { family, weight, style };
  const organizationMatch = choose(orgFonts, request);
  if (organizationMatch && (!family || normalized(organizationMatch.identity.family) === normalized(family))) {
    return { success: true, contract: CONTRACT, source: "ORGANIZATION_FONT", asset_node: organizationMatch.node, font: organizationMatch.identity, exact_match: Boolean(family), fallback_used: false };
  }

  if (brand_locked) {
    throw new Error(`CREATIVE_DESIGN_EXACT_BRAND_FONT_REQUIRED:${text(family) || "UNSPECIFIED"}`);
  }

  if (family) {
    const platformMatch = await platformMatchForFamily(family);
    if (platformMatch) {
      return { success: true, contract: CONTRACT, source: "AVANTIQO_FONT_LIBRARY", asset_node: platformMatch.node, font: platformMatch.identity, exact_match: true, fallback_used: false };
    }
    if (exact) throw new Error(`CREATIVE_DESIGN_EXACT_FONT_REQUIRED:${family}`);
  }

  const platformMatch = await defaultPlatformMatch();
  if (!platformMatch) throw new Error("CREATIVE_DESIGN_PLATFORM_FONT_LIBRARY_EMPTY");
  if (!platformMatch.identity.license_verified) {
    throw new Error(`CREATIVE_DESIGN_PLATFORM_FONT_LICENSE_UNVERIFIED:${platformMatch.node.id}`);
  }
  return { success: true, contract: CONTRACT, source: "AVANTIQO_FONT_LIBRARY", asset_node: platformMatch.node, font: platformMatch.identity, exact_match: false, fallback_used: true };
}

export const CreativeDesignFontResolverRuntime = Object.freeze({
  contract: CONTRACT,
  precedence: Object.freeze([
    "EXPLICIT_ORGANIZATION_FONT_ASSET",
    "MATCHING_ORGANIZATION_FONT",
    "EXACT_AVANTIQO_LIBRARY_FAMILY",
    "LICENSED_AVANTIQO_FONT_LIBRARY_FALLBACK",
  ]),
  rules: Object.freeze({
    brand_locked_never_falls_back: true,
    host_os_font_lookup_forbidden: true,
    platform_font_requires_verified_license: true,
    bulk_platform_font_discovery_for_fallback: false,
  }),
  resolve: resolveCreativeDesignFont,
});

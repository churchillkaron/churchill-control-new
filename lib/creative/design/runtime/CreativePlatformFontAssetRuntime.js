import {
  AVANTIQO_FONT_LIBRARY,
  getAvantiqoFont,
} from "../registry/CreativeFontLibraryRegistry.js";
import {
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";

const CONTRACT = "AVANTIQO_PLATFORM_FONT_ASSET_RUNTIME_V1";
const DIRECTORY_API = "https://api.github.com/repos/google/fonts/contents";
const RAW_BASE = "https://raw.githubusercontent.com/google/fonts";
const sourceCache = new Map();

function text(value) {
  return String(value ?? "").trim();
}

function filenameScore(name) {
  const value = String(name || "");
  let score = 0;
  if (/italic/i.test(value)) score += 10000;
  if (/\[[^\]]*wght[^\]]*\]/i.test(value)) score -= 1000;
  if (/regular/i.test(value)) score -= 500;
  score += value.length;
  return score;
}

function chooseUprightTtf(entries = []) {
  const fonts = entries
    .filter((entry) => entry?.type === "file" && /\.ttf$/i.test(entry.name || ""))
    .sort((left, right) => {
      const score = filenameScore(left.name) - filenameScore(right.name);
      return score || String(left.name).localeCompare(String(right.name));
    });
  const upright = fonts.find((entry) => !/italic/i.test(entry.name || ""));
  return upright || fonts[0] || null;
}

async function resolveSource(entry) {
  if (sourceCache.has(entry.id)) return sourceCache.get(entry.id);
  const source = entry.source;
  const url = `${DIRECTORY_API}/${source.directory}?ref=${source.revision}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Avantiqo-Font-Library/1.0",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "force-cache",
  });
  if (!response.ok) {
    throw new Error(`AVANTIQO_PLATFORM_FONT_DIRECTORY_FETCH_FAILED:${entry.slug}:${response.status}`);
  }
  const listing = await response.json();
  if (!Array.isArray(listing)) {
    throw new Error(`AVANTIQO_PLATFORM_FONT_DIRECTORY_INVALID:${entry.slug}`);
  }
  const selected = chooseUprightTtf(listing);
  if (!selected?.path) {
    throw new Error(`AVANTIQO_PLATFORM_FONT_TTF_NOT_FOUND:${entry.slug}`);
  }
  const resolved = Object.freeze({
    file_name: selected.name,
    path: selected.path,
    url: `${RAW_BASE}/${source.revision}/${selected.path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")}`,
    github_blob_sha: selected.sha || null,
    size_bytes: Number(selected.size || 0) || null,
  });
  sourceCache.set(entry.id, resolved);
  return resolved;
}

function virtualNode(entry, resolved) {
  return {
    id: entry.id,
    organization_id: null,
    creative_project_id: null,
    creative_asset_id: null,
    parent_asset_node_id: null,
    type: CREATIVE_ASSET_NODE_TYPES.FONT,
    status: CREATIVE_ASSET_NODE_STATUS.APPROVED,
    name: entry.family,
    description: `Avantiqo licensed platform font: ${entry.family}`,
    url: resolved.url,
    storage_path: null,
    lineage: {
      source: "avantiqo_font_library",
      provider_id: null,
      capability: "creative.font.platform.resolve",
      generation_version: 1,
    },
    technical: {
      mime_type: "font/ttf",
      checksum: null,
      checksum_sha256: null,
      file_size_bytes: resolved.size_bytes,
      original_file_name: resolved.file_name,
      github_blob_sha: resolved.github_blob_sha,
    },
    review: {
      ai_reviewed: false,
      human_reviewed: true,
      approved: true,
      approved_by: "AVANTIQO_PLATFORM",
      notes: "Pinned to immutable Google Fonts revision and licensed under OFL-1.1.",
    },
    metadata: {
      platform_font: true,
      font_library_source: "AVANTIQO_FONT_LIBRARY",
      font_family: entry.family,
      font_style: "Regular",
      font_weight: 400,
      font_category: entry.category,
      scripts: entry.scripts,
      roles: entry.roles,
      font_license_id: entry.license.id,
      font_license_verified: entry.license.verified,
      license_verified: entry.license.verified,
      license_path: entry.source.license_path,
      upstream_repository: entry.source.repository,
      upstream_revision: entry.source.revision,
      upstream_path: resolved.path,
      original_file_name: resolved.file_name,
      source: "AVANTIQO_FONT_LIBRARY",
      brand_approved: false,
    },
  };
}

export async function getPlatformFontAsset(value) {
  const entry = getAvantiqoFont(value);
  if (!entry) return null;
  const resolved = await resolveSource(entry);
  return virtualNode(entry, resolved);
}

export async function listPlatformFontAssets() {
  return Promise.all(
    AVANTIQO_FONT_LIBRARY.map(async (entry) => {
      const resolved = await resolveSource(entry);
      return virtualNode(entry, resolved);
    }),
  );
}

export function isPlatformFontAssetId(value) {
  return text(value).startsWith("platform-font:") && Boolean(getAvantiqoFont(value));
}

export const CreativePlatformFontAssetRuntime = Object.freeze({
  contract: CONTRACT,
  get: getPlatformFontAsset,
  list: listPlatformFontAssets,
  isPlatformFontAssetId,
});

export default CreativePlatformFontAssetRuntime;

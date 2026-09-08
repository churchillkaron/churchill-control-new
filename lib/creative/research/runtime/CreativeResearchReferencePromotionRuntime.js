import path from "node:path";

import { createCreativeAssetFlow } from "@/lib/creative/assets/workflows/createCreativeAssetFlow";
import * as CreativeAssetRepository from "@/lib/creative/assets/repositories/CreativeAssetRepository";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import * as ResearchRepository from "@/lib/creative/research/repositories/ResearchRepository";

const CONTRACT = "CREATIVE_RESEARCH_REFERENCE_PROMOTION_V1";
const MAX_REFERENCE_BYTES = 25 * 1024 * 1024;

function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function text(value) { return String(value ?? "").trim(); }
function validHttps(value) { try { const url = new URL(text(value)); return url.protocol === "https:" ? url.toString() : ""; } catch { return ""; } }
function selectedReferences(report = {}) {
  return list(report.metadata?.creative_grounding?.reference_candidates)
    .filter((item) => text(item.selection_status).toUpperCase() === "SELECTED")
    .filter((item) => validHttps(item.media_url))
    .filter((item) => ["IMAGE", "VIDEO"].includes(text(item.media_kind).toUpperCase()));
}
function extensionFor(type, url) {
  const existing = path.extname(new URL(url).pathname);
  if (existing && existing.length <= 8) return existing;
  if (type.includes("png")) return ".png";
  if (type.includes("webp")) return ".webp";
  if (type.includes("video")) return ".mp4";
  return ".jpg";
}
async function download(reference) {
  const response = await fetch(reference.media_url, {
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
    headers: { "user-agent": "Avantiqo-Studio-Research-Reference/1.0" },
  });
  if (!response.ok) throw new Error(`RESEARCH_REFERENCE_FETCH_FAILED:${response.status}`);
  const contentType = text(response.headers.get("content-type")).split(";")[0].toLowerCase();
  if (!contentType.startsWith("image/") && !contentType.startsWith("video/")) {
    throw new Error(`RESEARCH_REFERENCE_MEDIA_TYPE_INVALID:${contentType || "missing"}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_REFERENCE_BYTES) {
    throw new Error(`RESEARCH_REFERENCE_MEDIA_SIZE_INVALID:${bytes.length}`);
  }
  const base = text(reference.subject || reference.id || "research-reference")
    .replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "research-reference";
  return {
    name: `${base}${extensionFor(contentType, reference.media_url)}`,
    type: contentType,
    arrayBuffer: async () => bytes,
  };
}

export const CreativeResearchReferencePromotionRuntime = Object.freeze({
  contract: CONTRACT,
  async promote({ organization_id, creative_mission_id = null, creative_project_id, research, existing_assets = [] } = {}) {
    if (!organization_id || !creative_project_id || !research?.id) {
      throw new Error("RESEARCH_REFERENCE_PROMOTION_CONTEXT_REQUIRED");
    }
    const refs = selectedReferences(research);
    if (!refs.length) return { research, promoted_assets: [], failures: [] };
    const existingByMedia = new Map(list(existing_assets)
      .filter((asset) => text(asset.metadata?.research_reference_media_url))
      .map((asset) => [text(asset.metadata.research_reference_media_url), asset]));
    const promoted = [];
    const failures = [];
    const mappings = new Map();

    for (const reference of refs) {
      const mediaUrl = validHttps(reference.media_url);
      try {
        let asset = existingByMedia.get(mediaUrl);
        let node = null;
        if (!asset) {
          const file = await download({ ...reference, media_url: mediaUrl });
          const created = await createCreativeAssetFlow({
            organizationId: organization_id,
            creativeMissionId: creative_mission_id,
            creativeProjectId: creative_project_id,
            file,
            assetType: "research-reference",
            name: text(reference.subject) || file.name,
          });
          asset = await CreativeAssetRepository.update(created.asset.id, {
            metadata: {
              ...object(created.asset.metadata),
              research_reference: true,
              reference_only: true,
              research_report_id: research.id,
              research_candidate_id: reference.id || null,
              research_source_id: reference.source_id || null,
              research_source_url: reference.source_url || null,
              research_reference_media_url: mediaUrl,
              research_reference_role: reference.role || null,
              research_rights_status: reference.rights_status || "UNKNOWN",
              publication_authority: false,
              direct_reuse_authorized: false,
            },
          });
          node = await AssetGraphRepository.update(created.asset_node.id, {
            reuse: { reusable: false, approved_for_reuse: false, reuse_count: 0 },
            metadata: {
              ...object(created.asset_node.metadata),
              research_reference: true,
              reference_only: true,
              research_report_id: research.id,
              research_candidate_id: reference.id || null,
              research_source_id: reference.source_id || null,
              research_source_url: reference.source_url || null,
              research_reference_media_url: mediaUrl,
              research_reference_role: reference.role || null,
              research_rights_status: reference.rights_status || "UNKNOWN",
              publication_authority: false,
              direct_reuse_authorized: false,
            },
          });
          existingByMedia.set(mediaUrl, asset);
        }
        mappings.set(text(reference.id), { asset_id: asset.id, asset_node_id: node?.id || null });
        promoted.push({ reference_id: reference.id || null, asset_id: asset.id, asset_node_id: node?.id || null, media_url: mediaUrl });
      } catch (error) {
        failures.push({ reference_id: reference.id || null, media_url: mediaUrl, error: text(error?.message || error) });
      }
    }

    const grounding = object(research.metadata?.creative_grounding);
    const referenceCandidates = list(grounding.reference_candidates).map((reference) => {
      const mapped = mappings.get(text(reference.id));
      return mapped ? { ...reference, creative_asset_id: mapped.asset_id, creative_asset_node_id: mapped.asset_node_id, promotion_status: "PROMOTED_REFERENCE_ONLY" } : reference;
    });
    const updated = await ResearchRepository.update(research.id, {
      metadata: {
        ...object(research.metadata),
        creative_grounding: { ...grounding, reference_candidates: referenceCandidates },
        reference_promotion: { contract: CONTRACT, promoted_count: promoted.length, failure_count: failures.length, updated_at: new Date().toISOString() },
      },
    });
    return { research: updated, promoted_assets: promoted, failures };
  },
});

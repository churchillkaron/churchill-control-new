import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import {
  CreativeBrandFidelityRuntime,
} from "@/lib/creative/assets/intelligence/runtime/CreativeBrandFidelityRuntime";

const CONTRACT = "CREATIVE_BRAND_MARK_COMPOSITING_V1";
const FIDELITY_CONTRACT = "UNIVERSAL_REFERENCE_FIDELITY_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function fidelityContracts(shot = {}, task = {}) {
  const source = object(shot.metadata?.shot_bible_source);
  const candidates = [
    shot.reference_fidelity_contracts,
    shot.generation?.provider_parameters?.reference_fidelity_contracts,
    source.provider_parameters?.reference_fidelity_contracts,
    task.input?.provider_parameters?.reference_fidelity_contracts,
    task.input?.generation?.provider_parameters?.reference_fidelity_contracts,
    task.input?.requirements?.reference_fidelity_contracts,
  ];
  const bySource = new Map();
  for (const contract of candidates.flatMap(list)) {
    if (
      contract?.contract !== FIDELITY_CONTRACT ||
      upper(contract.subject_type) !== "BRAND_MARK" ||
      upper(contract.mode) !== "EXACT_COMPOSITE" ||
      contract.regeneration_prohibited !== true
    ) {
      continue;
    }
    const sourceId = text(contract.source_asset_id);
    if (sourceId && !bySource.has(sourceId)) bySource.set(sourceId, contract);
  }
  return [...bySource.values()];
}

function checksum(asset = {}) {
  return text(
    asset.metadata?.technical_metadata?.checksum_sha256 ||
    asset.metadata?.checksum_sha256 ||
    asset.analysis?.user_asserted_context?.metadata?.technical_metadata?.checksum_sha256 ||
    asset.analysis?.user_asserted_context?.metadata?.checksum_sha256,
  );
}

function intelligence(asset = {}) {
  const analysis = object(asset.analysis);
  const production = object(
    asset.production_intelligence ||
    analysis.production_intelligence ||
    asset.metadata?.production_intelligence,
  );
  const logo = object(
    analysis.logo_analysis ||
    production.logo_analysis ||
    asset.metadata?.logo_analysis,
  );
  const technical = object(
    analysis.technical_analysis ||
    production.technical_analysis ||
    asset.metadata?.technical_analysis,
  );
  const compositing = object(
    production.compositing_plan ||
    technical.compositing_plan,
  );
  return { analysis, production, logo, compositing };
}

function candidateScore(asset = {}) {
  const provenance = CreativeBrandFidelityRuntime.classify(asset);
  if (!provenance.trusted_for_brand_fidelity_primary) return -1;
  const { logo, compositing, production } = intelligence(asset);
  const sourceChecksum = checksum(asset);
  if (!sourceChecksum) return -1;

  let score = 0;
  if (logo.is_dedicated_logo_asset === true) score += 1000;
  if (list(logo.exact_text).length) score += 200;
  if (list(logo.visible_marks).length) score += 150;
  if (Object.keys(compositing).length) score += 500;
  if (list(compositing.extractable_layers).length) score += 250;
  if (list(compositing.mask_requirements).length) score += 250;
  if (list(production.preservation_requirements).length) score += 150;
  if (provenance.media_kind === "IMAGE") score += 100;
  return score;
}

function preservationRequirements(asset = {}) {
  const { production, compositing } = intelligence(asset);
  return list(
    production.preservation_requirements ||
    compositing.preservation_requirements,
  ).map(text).filter(Boolean);
}

function maskRequirements(asset = {}) {
  const { compositing } = intelligence(asset);
  return list(compositing.mask_requirements).map(text).filter(Boolean);
}

function edgeRequirements(asset = {}) {
  const { compositing } = intelligence(asset);
  return list(compositing.edge_requirements).map(text).filter(Boolean);
}

function postCompositionChecks(asset = {}) {
  const { production } = intelligence(asset);
  return list(production.post_composition_checks).map(text).filter(Boolean);
}

async function eligibleCandidate(contract = {}, organizationId) {
  const sourceId = text(contract.source_asset_id);
  const asset = sourceId ? await CreativeAssetsRuntime.get(sourceId) : null;
  if (!asset || text(asset.organization_id) !== text(organizationId)) return null;
  const score = candidateScore(asset);
  if (score < 0) return null;
  return { contract, asset, score };
}

export async function resolveCreativeBrandMarkCompositing({
  shot = {},
  task = {},
  shot_bible = {},
} = {}) {
  const contracts = fidelityContracts(shot, task);
  if (!contracts.length) return shot_bible;

  const candidates = (
    await Promise.all(
      contracts.map((contract) =>
        eligibleCandidate(contract, task.organization_id || shot.organization_id),
      ),
    )
  ).filter(Boolean).sort((left, right) =>
    right.score - left.score ||
    text(left.asset.id).localeCompare(text(right.asset.id)),
  );

  if (!candidates.length) {
    throw new Error("CREATIVE_BRAND_MARK_COMPOSITING_TRUSTED_SOURCE_REQUIRED");
  }

  const selected = candidates[0];
  const sourceChecksum = checksum(selected.asset);
  const preservation = preservationRequirements(selected.asset);
  const masks = maskRequirements(selected.asset);
  if (!preservation.length) {
    throw new Error("CREATIVE_BRAND_MARK_COMPOSITING_PRESERVATION_REQUIRED");
  }
  if (!masks.length) {
    throw new Error("CREATIVE_BRAND_MARK_COMPOSITING_MASK_REQUIRED");
  }

  const { logo, compositing } = intelligence(selected.asset);
  const contract = {
    contract: CONTRACT,
    source_fidelity_contract: FIDELITY_CONTRACT,
    source_asset_id: selected.asset.id,
    source_checksum_sha256: sourceChecksum,
    source_profile_id: selected.contract.subject_profile_id || null,
    minimum_fidelity_score: Number(
      selected.contract.minimum_fidelity_score || 0,
    ) || null,
    exact_text: list(logo.exact_text).map(text).filter(Boolean),
    visible_marks: list(logo.visible_marks).map(text).filter(Boolean),
    preservation_requirements: preservation,
    mask_requirements: masks,
    edge_requirements: edgeRequirements(selected.asset),
    extractable_layers: list(compositing.extractable_layers),
    post_composition_checks: postCompositionChecks(selected.asset),
    deterministic_finishing_required: true,
    generative_rendering_allowed: false,
    original_pixels_required: true,
    source_comparison_required: true,
  };

  return {
    ...shot_bible,
    finishing: {
      ...object(shot_bible.finishing),
      brand_mark_compositing: contract,
      exact_graphics_policy: {
        ...object(shot_bible.finishing?.exact_graphics_policy),
        generative_rendering_allowed: false,
        deterministic_finishing_required: true,
      },
    },
  };
}

export const CreativeBrandMarkCompositingRuntime = Object.freeze({
  contract: CONTRACT,
  resolve: resolveCreativeBrandMarkCompositing,
});

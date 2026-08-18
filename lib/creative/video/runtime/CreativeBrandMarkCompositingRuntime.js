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

function uniqueText(values = []) {
  return [...new Set(
    list(values).flat(Infinity).map((value) => text(value)).filter(Boolean),
  )];
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

function observedMarks(asset = {}) {
  const analysis = object(asset.analysis);
  const logoMarks = list(analysis.logos).flatMap((logo) => [
    logo?.visible_text,
    logo?.text,
    logo?.description,
  ]);
  const visibleText = list(analysis.visible_text).flatMap((entry) => [
    entry?.text,
    typeof entry === "string" ? entry : null,
  ]);
  return uniqueText([...logoMarks, ...visibleText]);
}

function preservationRequirements(contract = {}) {
  const requirements = [];
  if (contract.preserve_geometry === true) requirements.push("preserve source geometry");
  if (contract.preserve_wording === true) requirements.push("preserve source wording");
  if (contract.preserve_spelling === true) requirements.push("preserve source spelling");
  if (contract.preserve_color_relationships === true) {
    requirements.push("preserve source color relationships");
  }
  if (contract.preserve_clear_space === true) requirements.push("preserve source clear space");
  if (contract.original_pixels_preferred === true) {
    requirements.push("use original source pixels for deterministic compositing");
  }
  if (contract.source_comparison_required === true) {
    requirements.push("compare finished mark against governed source asset");
  }
  return requirements;
}

function candidateScore(asset = {}, contract = {}) {
  const provenance = CreativeBrandFidelityRuntime.classify(asset);
  if (!provenance.trusted_for_brand_fidelity_primary) return -1;
  if (!checksum(asset)) return -1;

  const analysis = object(asset.analysis);
  const marks = observedMarks(asset);
  let score = 0;
  if (provenance.media_kind === "IMAGE") score += 300;
  if (marks.length) score += 250;
  if (list(analysis.logos).length) score += 200;
  if (Number(contract.minimum_fidelity_score || 0) >= 98) score += 100;
  if (contract.original_pixels_preferred === true) score += 100;
  return score;
}

async function eligibleCandidate(contract = {}, organizationId) {
  const sourceId = text(contract.source_asset_id);
  const asset = sourceId ? await CreativeAssetsRuntime.get(sourceId) : null;
  if (!asset || text(asset.organization_id) !== text(organizationId)) return null;
  const score = candidateScore(asset, contract);
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
  const requiredMarks = observedMarks(selected.asset);
  const preservation = preservationRequirements(selected.contract);

  if (!requiredMarks.length) {
    throw new Error("CREATIVE_BRAND_MARK_COMPOSITING_EXACT_MARKS_REQUIRED");
  }
  if (!preservation.length) {
    throw new Error("CREATIVE_BRAND_MARK_COMPOSITING_PRESERVATION_REQUIRED");
  }

  const contract = {
    contract: CONTRACT,
    required: true,
    source_fidelity_contract: FIDELITY_CONTRACT,
    source_asset_id: selected.asset.id,
    source_checksum_sha256: sourceChecksum,
    source_profile_id: selected.contract.subject_profile_id || null,
    minimum_fidelity_score: Number(
      selected.contract.minimum_fidelity_score || 0,
    ) || null,
    required_marks: requiredMarks,
    preservation_requirements: preservation,
    deterministic_finishing_required: true,
    generative_brand_mark_rendering_allowed: false,
    original_pixels_required: true,
    source_comparison_required: true,
    post_composition_review_required: true,
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
        source_backed_brand_marks_required: true,
      },
    },
  };
}

export const CreativeBrandMarkCompositingRuntime = Object.freeze({
  contract: CONTRACT,
  fidelity_contract: FIDELITY_CONTRACT,
  resolve: resolveCreativeBrandMarkCompositing,
});

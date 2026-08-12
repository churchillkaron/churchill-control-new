import crypto from "node:crypto";

import * as CreativeProjectRepository
from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import {
  ShotRuntime,
} from "@/lib/creative/shots/runtime/ShotRuntime";
import {
  CREATIVE_SEMANTIC_QUALITY_CHECKS,
} from "./CreativeSemanticQualityRuntime";
import {
  WORLD_CLASS_QUALITY_FLOORS,
} from "./CreativeWorldClassQualityBootstrap";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

const CONTRACT = "CREATIVE_MASTER_FILM_DIRECTOR_REVIEW_V2";
const TEXT_EVIDENCE_CONTRACT = "CREATIVE_DETERMINISTIC_TEXT_RENDER_EVIDENCE_V1";

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

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => !["created_at", "updated_at"].includes(key))
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value ?? "")).digest("hex");
}

function semanticChecks(report = {}) {
  return list(report.metadata?.checks).map((check) => ({
    id: text(check?.id),
    status: text(check?.status).toUpperCase(),
    score: finite(check?.score),
    confidence: finite(check?.confidence),
    evidence: list(check?.evidence),
    repair_instructions: list(check?.repair_instructions),
  })).filter((check) => check.id);
}

function evaluateSemantic(report = {}) {
  const minimumScore = WORLD_CLASS_QUALITY_FLOORS.minimum_release_score;
  const minimumConfidence = WORLD_CLASS_QUALITY_FLOORS.minimum_confidence;
  const checks = semanticChecks(report);
  const byId = new Map(checks.map((check) => [check.id, check]));
  const missing = CREATIVE_SEMANTIC_QUALITY_CHECKS.filter((id) => !byId.has(id));
  const applicable = checks.filter((check) => check.status !== "NOT_APPLICABLE");
  const failed = applicable.filter((check) =>
    check.status !== "PASS" ||
    check.score === null ||
    check.score < minimumScore ||
    check.confidence === null ||
    check.confidence < minimumConfidence,
  );
  const weakest = applicable.reduce((selected, check) => {
    if (!selected) return check;
    if (check.score === null) return check;
    if (selected.score === null) return selected;
    return check.score < selected.score ? check : selected;
  }, null);
  const overall = finite(report.metadata?.overall_score);
  const passed = Boolean(
    report.metadata?.passed === true &&
    report.status !== CREATIVE_ASSET_NODE_STATUS.REJECTED &&
    missing.length === 0 &&
    failed.length === 0 &&
    weakest &&
    weakest.score !== null &&
    weakest.score >= minimumScore &&
    overall !== null &&
    overall >= minimumScore,
  );

  return {
    passed,
    minimum_score: minimumScore,
    minimum_confidence: minimumConfidence,
    overall_score: overall,
    weakest_score: weakest?.score ?? null,
    weakest_dimension: weakest?.id || null,
    missing_checks: missing,
    failed_checks: failed.map((check) => check.id),
    checks,
  };
}

function entryList(value, role) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map((entry) => ({
    ...(typeof entry === "string" ? { text: entry } : object(entry)),
    role,
  }));
}

function deterministicTextEntries(shot = {}) {
  const graphics = object(shot.graphics);
  const typography = object(shot.typography);
  return [
    ...entryList(graphics.titles || typography.titles, "TITLE"),
    ...entryList(
      graphics.cta || graphics.call_to_action || graphics.callToAction,
      "CTA",
    ),
    ...entryList(
      graphics.legal ||
      graphics.legal_copy ||
      graphics.legalCopy ||
      graphics.disclaimer ||
      graphics.disclaimers ||
      graphics.compliance_copy ||
      graphics.complianceCopy,
      "LEGAL",
    ),
  ].map((entry) => {
    const copy = text(
      entry.text || entry.title || entry.copy || entry.content || entry.label,
    );
    return {
      role: text(entry.role || entry.type || entry.kind || "TITLE").toUpperCase(),
      text: copy,
      text_sha256: sha256(copy),
      font_asset_id: text(entry.font_asset_id || entry.fontAssetId) || null,
      font_family: text(entry.font_family || entry.fontFamily || entry.typeface) || null,
      font_file_reference: text(entry.font_file || entry.fontFile) || null,
    };
  }).filter((entry) => entry.text);
}

function explicitFontRequired(entry = {}) {
  return Boolean(
    entry.font_asset_id || entry.font_family || entry.font_file_reference,
  );
}

function requiredLogoIds(shot = {}) {
  const graphics = object(shot.graphics);
  const values = [
    graphics.logo_asset_id,
    graphics.logoAssetId,
    graphics.brand_mark_asset_id,
    graphics.brandMarkAssetId,
    graphics.end_card_asset_id,
    graphics.endCardAssetId,
    ...list(graphics.logo_asset_ids),
    ...list(graphics.logoAssetIds),
    ...list(graphics.brand_mark_asset_ids),
    ...list(graphics.brandMarkAssetIds),
  ];
  return [...new Set(values.map(text).filter(Boolean))];
}

function transitionRequiresFinishing(value) {
  const source = text(
    typeof value === "string"
      ? value
      : value?.type || value?.name || value?.style || value?.transition,
  ).toLowerCase();
  return Boolean(
    source && !/^(cut|hard cut|match cut|smash cut|straight cut)$/.test(source),
  );
}

function finishingRequired(shots = []) {
  return shots.some((shot) =>
    deterministicTextEntries(shot).length > 0 ||
    requiredLogoIds(shot).length > 0 ||
    transitionRequiresFinishing(shot.transition_in) ||
    transitionRequiresFinishing(shot.transition_out) ||
    Object.keys(object(shot.vfx)).length > 0,
  );
}

function evidenceKey(value = {}) {
  return [
    text(value.shot_id),
    text(value.role).toUpperCase(),
    text(value.text_sha256),
  ].join(":");
}

function evaluateFinishing({ project = {}, post_production = {}, shots = [] } = {}) {
  const render = object(post_production.render);
  const renderMetadata = object(render.metadata);
  const technicalQc = object(
    post_production.technical_qc || renderMetadata.technical_qc,
  );
  const tracks = object(post_production.tracks);
  const overlays = list(tracks.overlays);
  const overlayIds = new Set(
    overlays.map((item) => text(item.asset_node_id)).filter(Boolean),
  );
  const segmentControls = list(renderMetadata.segment_controls);
  const segmentMap = new Map(
    segmentControls.map((item) => [text(item.shot_id), item]),
  );
  const requirements = shots.flatMap((shot) =>
    deterministicTextEntries(shot).map((entry) => ({
      shot_id: text(shot.id),
      ...entry,
    })),
  ).filter((item) => item.shot_id);
  const evidence = list(renderMetadata.text_render_evidence);
  const evidenceMap = new Map(evidence.map((entry) => [evidenceKey(entry), entry]));
  const missingText = requirements.filter((item) => !evidenceMap.has(evidenceKey(item)));
  const exactFontRequirements = requirements.filter(explicitFontRequired);
  const fontMismatches = exactFontRequirements.filter((item) => {
    const proof = evidenceMap.get(evidenceKey(item));
    return !proof ||
      proof.font_binding_proven !== true ||
      !text(proof.font_asset_id) ||
      text(proof.font_asset_id) !== text(item.font_asset_id) ||
      !text(proof.font_asset_checksum);
  });
  const legalCtaRequirements = requirements.filter((item) =>
    item.role === "LEGAL" || item.role === "CTA",
  );
  const legalCtaMismatches = legalCtaRequirements.filter((item) => {
    const proof = evidenceMap.get(evidenceKey(item));
    return !proof ||
      text(proof.text_sha256) !== item.text_sha256 ||
      !Number.isFinite(Number(proof.start_seconds)) ||
      !Number.isFinite(Number(proof.duration_seconds));
  });
  const textRequirementsByShot = new Map();
  for (const item of requirements) {
    textRequirementsByShot.set(
      item.shot_id,
      (textRequirementsByShot.get(item.shot_id) || 0) + 1,
    );
  }
  const textCountMismatches = [...textRequirementsByShot.entries()]
    .filter(([shotId, required]) =>
      Number(segmentMap.get(shotId)?.title_count || 0) !== required,
    )
    .map(([shotId, required]) => ({
      shot_id: shotId,
      required,
      rendered: Number(segmentMap.get(shotId)?.title_count || 0),
    }));
  const logoRequirements = shots.flatMap((shot) =>
    requiredLogoIds(shot).map((assetId) => ({
      shot_id: text(shot.id),
      asset_id: assetId,
    })),
  );
  const missingLogoOverlays = logoRequirements.filter(
    (item) => !overlayIds.has(item.asset_id),
  );
  const hasMasterSoundtrack = Boolean(
    renderMetadata.master_soundtrack_asset_node_id ||
    renderMetadata.master_soundtrack_contract_hash,
  );
  const finishingNeeded = finishingRequired(shots);
  const targetChannels = [
    ...new Set(list(project.target_channels).map(text).filter(Boolean)),
  ];
  const checks = [
    {
      id: "final_render_present",
      passed: Boolean(render.id && render.url),
      evidence: render.id || null,
    },
    {
      id: "technical_qc_passed",
      passed: technicalQc.passed === true,
      evidence: technicalQc,
    },
    {
      id: "professional_finishing_applied_when_required",
      passed:
        !finishingNeeded || Boolean(renderMetadata.professional_finishing_contract),
      evidence: {
        finishing_required: finishingNeeded,
        contract: renderMetadata.professional_finishing_contract || null,
      },
    },
    {
      id: "director_segment_coverage_complete",
      passed:
        !finishingNeeded ||
        renderMetadata.professional_finishing?.complete_director_coverage === true,
      evidence: renderMetadata.professional_finishing || null,
    },
    {
      id: "deterministic_text_count_exact",
      passed: textCountMismatches.length === 0,
      evidence: {
        required_text_count: requirements.length,
        rendered_text_count: evidence.length,
        mismatches: textCountMismatches,
      },
    },
    {
      id: "deterministic_text_copy_exact",
      passed:
        requirements.length === 0 ||
        (
          renderMetadata.deterministic_text_render_contract === TEXT_EVIDENCE_CONTRACT &&
          missingText.length === 0
        ),
      evidence: {
        contract: renderMetadata.deterministic_text_render_contract || null,
        required_text_count: requirements.length,
        missing: missingText.map((item) => ({
          shot_id: item.shot_id,
          role: item.role,
          text_sha256: item.text_sha256,
        })),
      },
    },
    {
      id: "exact_font_rendering_proven",
      passed: fontMismatches.length === 0,
      evidence: {
        exact_font_requirement_count: exactFontRequirements.length,
        mismatches: fontMismatches.map((item) => ({
          shot_id: item.shot_id,
          role: item.role,
          text_sha256: item.text_sha256,
          required_font_asset_id: item.font_asset_id,
        })),
        exact_font_binding_proven:
          renderMetadata.exact_font_binding_proven === true ||
          exactFontRequirements.length === 0,
      },
    },
    {
      id: "legal_cta_copy_proven",
      passed: legalCtaMismatches.length === 0,
      evidence: {
        required_legal_cta_count: legalCtaRequirements.length,
        mismatches: legalCtaMismatches.map((item) => ({
          shot_id: item.shot_id,
          role: item.role,
          text_sha256: item.text_sha256,
        })),
      },
    },
    {
      id: "required_logo_assets_composited",
      passed: missingLogoOverlays.length === 0,
      evidence: {
        required_logo_count: logoRequirements.length,
        missing: missingLogoOverlays,
        overlay_asset_node_ids: [...overlayIds],
      },
    },
    {
      id: "final_master_audio_integrity",
      passed: !hasMasterSoundtrack || Boolean(
        renderMetadata.master_soundtrack_integrity_passed_after_finishing === true &&
        renderMetadata.final_master_audio_verified === true,
      ),
      evidence: {
        required: hasMasterSoundtrack,
        final_master_audio_verified:
          renderMetadata.final_master_audio_verified === true,
        integrity_passed_after_finishing:
          renderMetadata.master_soundtrack_integrity_passed_after_finishing === true,
      },
    },
    {
      id: "channel_master_profile_resolved",
      passed:
        targetChannels.length <= 1 ||
        Boolean(post_production.export_profile_source),
      evidence: {
        target_channels: targetChannels,
        master_export_profile_source:
          post_production.export_profile_source || null,
        note: targetChannels.length > 1
          ? "Master review covers the canonical master. Deterministic per-channel derivative coverage is a separate release gate."
          : null,
      },
    },
  ];
  const failed = checks.filter((check) => !check.passed);
  return {
    contract: "CREATIVE_MASTER_FILM_DETERMINISTIC_FINISHING_V2",
    passed: failed.length === 0,
    checks,
    failed_checks: failed.map((check) => check.id),
    target_channels: targetChannels,
  };
}

function scoreMap(semantic = {}) {
  return Object.fromEntries(
    semantic.checks
      .filter((check) => check.score !== null)
      .map((check) => [`${check.id}_score`, check.score]),
  );
}

async function persistReport({
  organization_id,
  creative_project_id,
  render,
  semantic_report,
  semantic,
  finishing,
} = {}) {
  const identity = digest({
    contract: CONTRACT,
    render_id: render.id,
    render_checksum: render.technical?.checksum || null,
    semantic_quality_report_id: semantic_report.id,
    semantic_quality_identity:
      semantic_report.metadata?.semantic_quality_identity || null,
    finishing,
  });
  const nodes = await AssetGraphRepository.listByProject({
    organization_id,
    creative_project_id,
  });
  const existing = nodes.find((node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
    node.metadata?.master_film_director_review_identity === identity,
  );
  if (existing) return existing;

  const passed = semantic.passed && finishing.passed;
  const repairInstructions = semantic.checks.flatMap(
    (check) => check.repair_instructions,
  );
  const node = createCreativeAssetNode({
    organization_id,
    creative_project_id,
    parent_asset_node_id: render.id,
    type: CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT,
    status: passed
      ? CREATIVE_ASSET_NODE_STATUS.REVIEW
      : CREATIVE_ASSET_NODE_STATUS.REJECTED,
    name: `${render.name || "Master film"} director review`,
    description:
      "World-class whole-film director review across the actual final render, deterministic finishing evidence and weakest-link semantic quality.",
    lineage: {
      source: "master_film_director_review",
      capability: "creative.render.quality.master-film",
      generation_version: 2,
    },
    intelligence: {
      quality_score: semantic.weakest_score,
      safety_status: passed ? "REVIEW_REQUIRED" : "REJECTED",
      tags: [
        "master-film",
        "director-review",
        "weakest-link",
        "deterministic-finishing",
        "typography-proof",
        "legal-cta-proof",
      ],
    },
    reuse: { reusable: false, approved_for_reuse: false },
    review: {
      ai_reviewed: true,
      human_reviewed: false,
      approved: false,
      notes: passed
        ? "Master film passed the A-grade director and deterministic finishing gate."
        : "Master film failed one or more A-grade director or deterministic finishing checks.",
    },
    metadata: {
      contract: CONTRACT,
      master_film_director_review_identity: identity,
      render_asset_node_id: render.id,
      semantic_quality_report_id: semantic_report.id,
      passed,
      a_grade: passed,
      overall_score: semantic.overall_score,
      weakest_score: semantic.weakest_score,
      weakest_dimension: semantic.weakest_dimension,
      minimum_release_score: semantic.minimum_score,
      minimum_confidence: semantic.minimum_confidence,
      b_grade_release_forbidden: true,
      weakest_link_enforced: true,
      scores: scoreMap(semantic),
      checks: semantic.checks,
      missing_checks: semantic.missing_checks,
      failed_checks: [
        ...semantic.failed_checks,
        ...finishing.failed_checks,
      ],
      repair_instructions: repairInstructions,
      deterministic_finishing: finishing,
      evaluated_at: new Date().toISOString(),
    },
  });
  return AssetGraphRepository.create(node);
}

export const CreativeMasterFilmDirectorReviewRuntime = Object.freeze({
  contract: CONTRACT,

  hardenSemanticPolicy(policy = {}) {
    const current = object(policy);
    return {
      ...current,
      version:
        `${text(current.version) || "AVANTIQO_SEMANTIC_QUALITY"}_MASTER_FILM_WORLD_CLASS_V2`,
      required_checks: [...CREATIVE_SEMANTIC_QUALITY_CHECKS],
      minimum_score: Math.max(
        finite(current.minimum_score) || 0,
        WORLD_CLASS_QUALITY_FLOORS.minimum_release_score,
      ),
      minimum_confidence: Math.max(
        finite(current.minimum_confidence) || 0,
        WORLD_CLASS_QUALITY_FLOORS.minimum_confidence,
      ),
      require_audio_review: true,
      master_film_director_review_contract: CONTRACT,
      weakest_link_enforced: true,
      b_grade_release_forbidden: true,
    };
  },

  async evaluate({
    organization_id,
    creative_project_id,
    post_production = {},
    semantic_report = null,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    if (!post_production.render?.id) {
      throw new Error("MASTER_FILM_FINAL_RENDER_REQUIRED");
    }
    if (!semantic_report?.id) {
      throw new Error("MASTER_FILM_SEMANTIC_REPORT_REQUIRED");
    }

    const [project, shots] = await Promise.all([
      CreativeProjectRepository.getById(creative_project_id),
      ShotRuntime.list({ organization_id, creative_project_id }),
    ]);
    if (!project || text(project.organization_id) !== text(organization_id)) {
      throw new Error("Creative project not found");
    }

    const semantic = evaluateSemantic(semantic_report);
    const finishing = evaluateFinishing({
      project,
      post_production,
      shots,
    });
    const report = await persistReport({
      organization_id,
      creative_project_id,
      render: post_production.render,
      semantic_report,
      semantic,
      finishing,
    });

    return {
      contract: CONTRACT,
      passed: semantic.passed && finishing.passed,
      semantic,
      deterministic_finishing: finishing,
      report,
    };
  },
});

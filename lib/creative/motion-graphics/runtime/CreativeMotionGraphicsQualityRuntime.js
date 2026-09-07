import crypto from "node:crypto";

import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

const CONTRACT = "AVANTIQO_MOTION_GRAPHICS_QC_V1";
const SEAL_CONTRACT = "AVANTIQO_MOTION_GRAPHICS_QC_SEAL_V1";
const RENDER_CONTRACT = "AVANTIQO_MOTION_GRAPHICS_RENDER_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stable(value ?? null))).digest("hex");
}

function evaluate(render = {}) {
  const metadata = render.metadata || {};
  const elements = list(metadata.motion_graphics_elements);
  const bindings = list(metadata.motion_graphics_bindings);
  const blockers = [];
  if (text(metadata.motion_graphics_render_contract) !== RENDER_CONTRACT) {
    blockers.push("MOTION_GRAPHICS_RENDER_CONTRACT_REQUIRED");
  }
  if (!text(metadata.motion_graphics_contract_hash)) {
    blockers.push("MOTION_GRAPHICS_CONTRACT_HASH_REQUIRED");
  }
  if (!elements.length) blockers.push("MOTION_GRAPHICS_ELEMENTS_REQUIRED");
  if (bindings.length !== elements.length) {
    blockers.push("MOTION_GRAPHICS_BINDING_COVERAGE_REQUIRED");
  }
  const bindingByElement = new Map(bindings.map((binding) => [text(binding.element_id), binding]));
  for (const element of elements) {
    const binding = bindingByElement.get(text(element.element_id));
    if (!binding || !text(binding.asset_node_id) || !text(binding.checksum)) {
      blockers.push(`MOTION_GRAPHICS_SOURCE_BINDING_INVALID:${element.element_id}`);
      continue;
    }
    if (["LOGO_BUG", "LOGO_STING"].includes(element.type)) {
      if (binding.kind !== "LOGO") blockers.push(`MOTION_GRAPHICS_LOGO_BINDING_REQUIRED:${element.element_id}`);
    } else {
      if (binding.kind !== "FONT") blockers.push(`MOTION_GRAPHICS_FONT_BINDING_REQUIRED:${element.element_id}`);
      if (element.typography?.brand_locked === true && binding.fallback_used === true) {
        blockers.push(`MOTION_GRAPHICS_BRAND_FONT_FALLBACK_FORBIDDEN:${element.element_id}`);
      }
    }
  }
  if (metadata.exact_text_rendering !== true) blockers.push("MOTION_GRAPHICS_EXACT_TEXT_RENDERING_REQUIRED");
  if (metadata.generated_text_pixels_used !== false) blockers.push("MOTION_GRAPHICS_GENERATED_TEXT_FORBIDDEN");
  if (metadata.generated_logo_redraw_used !== false) blockers.push("MOTION_GRAPHICS_GENERATED_LOGO_REDRAW_FORBIDDEN");
  if (metadata.editorial_picture_retimed !== false) blockers.push("MOTION_GRAPHICS_EDITORIAL_RETIME_FORBIDDEN");
  if (metadata.master_audio_modified !== false) blockers.push("MOTION_GRAPHICS_MASTER_AUDIO_MUTATION_FORBIDDEN");
  if (metadata.technical_qc?.passed !== true) blockers.push("MOTION_GRAPHICS_TECHNICAL_QC_REQUIRED");
  return {
    contract: CONTRACT,
    passed: blockers.length === 0,
    blockers,
    checks: {
      deterministic_text: metadata.exact_text_rendering === true && metadata.generated_text_pixels_used === false,
      deterministic_logos: metadata.generated_logo_redraw_used === false,
      binding_coverage: bindings.length === elements.length,
      editorial_timing_preserved: metadata.editorial_picture_retimed === false,
      master_audio_preserved: metadata.master_audio_modified === false,
      technical_qc_passed: metadata.technical_qc?.passed === true,
    },
  };
}

export const CreativeMotionGraphicsQualityRuntime = Object.freeze({
  contract: CONTRACT,
  seal_contract: SEAL_CONTRACT,

  async seal({ organization_id, render } = {}) {
    if (!organization_id || !render?.id) throw new Error("MOTION_GRAPHICS_QC_SCOPE_REQUIRED");
    if (text(render.organization_id) !== text(organization_id)) {
      throw new Error("MOTION_GRAPHICS_QC_ORGANIZATION_MISMATCH");
    }
    const evaluation = evaluate(render);
    const sealHash = evaluation.passed
      ? hash({
          render_id: render.id,
          checksum: render.technical?.checksum || null,
          contract_hash: render.metadata?.motion_graphics_contract_hash || null,
          bindings: render.metadata?.motion_graphics_bindings || [],
          checks: evaluation.checks,
        })
      : null;
    const updated = await AssetGraphRepository.update(render.id, {
      status: evaluation.passed
        ? render.status
        : CREATIVE_ASSET_NODE_STATUS.REJECTED,
      metadata: {
        ...(render.metadata || {}),
        motion_graphics_qc_contract: CONTRACT,
        motion_graphics_qc_seal_contract: SEAL_CONTRACT,
        motion_graphics_qc_passed: evaluation.passed,
        motion_graphics_qc_sealed: evaluation.passed,
        motion_graphics_qc_seal_hash: sealHash,
        motion_graphics_qc_blockers: evaluation.blockers,
        motion_graphics_qc_checks: evaluation.checks,
        motion_graphics_qc_at: new Date().toISOString(),
      },
    });
    const report = createCreativeAssetNode({
      organization_id,
      creative_project_id: render.creative_project_id,
      parent_asset_node_id: render.id,
      type: CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT,
      status: evaluation.passed
        ? CREATIVE_ASSET_NODE_STATUS.REVIEW
        : CREATIVE_ASSET_NODE_STATUS.REJECTED,
      name: `${render.name || "Motion graphics master"} QC`,
      description: "Deterministic motion-graphics binding, timing, audio-preservation and technical quality evidence.",
      lineage: {
        source: "motion_graphics_qc",
        capability: "creative.motion-graphics.quality",
        generation_version: 1,
      },
      review: {
        ai_reviewed: true,
        human_reviewed: false,
        approved: false,
        notes: evaluation.passed ? "Motion graphics deterministic QC passed" : "Motion graphics QC failed",
      },
      metadata: {
        contract: CONTRACT,
        seal_contract: SEAL_CONTRACT,
        render_asset_node_id: render.id,
        passed: evaluation.passed,
        blockers: evaluation.blockers,
        checks: evaluation.checks,
        seal_hash: sealHash,
        provider_calls_executed: 0,
        created_at: new Date().toISOString(),
      },
    });
    return {
      render: updated,
      report: await AssetGraphRepository.create(report),
      evaluation,
      seal_hash: sealHash,
    };
  },

  evaluate,
});

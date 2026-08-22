import {
  validateCreativeDesignDocument,
} from "../contracts/CreativeDesignDocumentContract.js";

const CONTRACT = "CREATIVE_DESIGN_ADAPTATION_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scaleFrame(frame, sx, sy) {
  return {
    x: number(frame.x) * sx,
    y: number(frame.y) * sy,
    width: number(frame.width) * sx,
    height: number(frame.height) * sy,
  };
}

function adaptedTextTypography(node, sx, sy, target) {
  const typography = object(node.typography);
  const baseSize = number(typography.font_size, 16);
  const geometric = Math.sqrt(Math.max(0.0001, sx * sy));
  const minSize = number(target.minimum_font_size, 8);
  const maxSize = number(target.maximum_font_size, baseSize * 2.5);
  return {
    ...typography,
    font_size: clamp(baseSize * geometric, minSize, maxSize),
  };
}

function adaptNode(node, sx, sy, target) {
  if (node.locked === true && target.preserve_locked_geometry === true) {
    return { ...node };
  }
  const adapted = {
    ...node,
    frame: scaleFrame(object(node.frame), sx, sy),
  };
  if (node.type === "TEXT") {
    adapted.typography = adaptedTextTypography(node, sx, sy, target);
  }
  return adapted;
}

function adaptPage(page, target) {
  const targetWidth = number(target.width);
  const targetHeight = number(target.height);
  if (targetWidth <= 0 || targetHeight <= 0) {
    throw new Error("CREATIVE_DESIGN_ADAPT_TARGET_DIMENSIONS_REQUIRED");
  }
  const sx = targetWidth / page.width;
  const sy = targetHeight / page.height;
  const sourceRatio = page.width / page.height;
  const targetRatio = targetWidth / targetHeight;
  const ratioChange = targetRatio / sourceRatio;
  const severeReflow = ratioChange < 0.72 || ratioChange > 1.38;

  return {
    ...page,
    id: target.page_id || `${page.id}-${Math.round(targetWidth)}x${Math.round(targetHeight)}`,
    width: targetWidth,
    height: targetHeight,
    unit: target.unit || page.unit,
    nodes: page.nodes.map((node) => adaptNode(node, sx, sy, target)),
    metadata: {
      ...object(page.metadata),
      adapted_from_page_id: page.id,
      adaptation_scale_x: sx,
      adaptation_scale_y: sy,
      source_aspect_ratio: sourceRatio,
      target_aspect_ratio: targetRatio,
      structural_reflow_recommended: severeReflow,
    },
  };
}

export function adaptCreativeDesignDocument(rawDocument = {}, target = {}) {
  const document = validateCreativeDesignDocument(rawDocument);
  const pageIndex = Number.isInteger(Number(target.page_index))
    ? Number(target.page_index)
    : 0;
  const sourcePage = document.pages[pageIndex];
  if (!sourcePage) throw new Error("CREATIVE_DESIGN_ADAPT_SOURCE_PAGE_REQUIRED");

  const adaptedPage = adaptPage(sourcePage, object(target));
  const output = {
    ...document,
    document_hash: undefined,
    title: `${document.title} - adapted`,
    revision: Number(document.revision || 1) + 1,
    pages: [adaptedPage],
    metadata: {
      ...object(document.metadata),
      adapted_from_document_hash: document.document_hash,
      adaptation_contract: CONTRACT,
      adaptation_requires_director_reflow:
        adaptedPage.metadata.structural_reflow_recommended === true,
    },
  };

  const validated = validateCreativeDesignDocument(output);
  return {
    success: true,
    contract: CONTRACT,
    document: validated,
    source_document_hash: document.document_hash,
    target_document_hash: validated.document_hash,
    director_reflow_required:
      validated.metadata?.adaptation_requires_director_reflow === true,
    deterministic: true,
    provider_called: false,
  };
}

export const CreativeDesignAdaptationRuntime = Object.freeze({
  contract: CONTRACT,
  adapt: adaptCreativeDesignDocument,
});

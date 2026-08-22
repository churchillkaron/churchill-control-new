import {
  validateCreativeDesignDocument,
} from "../contracts/CreativeDesignDocumentContract.js";
import {
  wrapCreativeDesignText,
} from "./CreativeDesignTextLayoutRuntime.js";
import {
  inspectCreativeDesignCollisions,
} from "./CreativeDesignCollisionRuntime.js";

const CONTRACT = "CREATIVE_DESIGN_ADAPTATION_V2";
const DEFAULT_SAFE_MARGIN_RATIO = 0.05;
const REFLOW_RATIO_LOW = 0.82;
const REFLOW_RATIO_HIGH = 1.22;

const ROLE_ORDER = Object.freeze({
  BACKGROUND: 0,
  BRAND: 10,
  TITLE: 20,
  SUBTITLE: 30,
  HERO: 40,
  BODY: 50,
  DATA: 60,
  CTA: 70,
  CODE: 80,
  SUPPORTING_VISUAL: 90,
  DECORATIVE: 100,
});

function text(value) {
  return String(value ?? "").trim();
}

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

function clone(value) {
  return structuredClone(value);
}

function frameArea(frame = {}) {
  return Math.max(0, number(frame.width)) * Math.max(0, number(frame.height));
}

function explicitRole(node = {}) {
  return text(
    node.layout?.role ||
    node.metadata?.layout_role ||
    node.metadata?.role ||
    node.design_role,
  ).toUpperCase();
}

function sourcePositionKey(node = {}) {
  return number(node.frame?.y) * 100000 + number(node.frame?.x);
}

function typographySize(node = {}) {
  return Math.max(1, number(node.typography?.font_size, 16));
}

function roleForNode(node, page) {
  const declared = explicitRole(node);
  if (declared && Object.prototype.hasOwnProperty.call(ROLE_ORDER, declared)) {
    return { role: declared, inferred: false };
  }

  const areaRatio = frameArea(node.frame) / Math.max(1, page.width * page.height);
  const verticalCenter = (number(node.frame?.y) + number(node.frame?.height) / 2) / page.height;

  if (node.type === "SHAPE") {
    if (areaRatio >= 0.72) return { role: "BACKGROUND", inferred: true };
    return { role: "DECORATIVE", inferred: true };
  }
  if (node.type === "TABLE") return { role: "DATA", inferred: true };
  if (["QR", "BARCODE"].includes(node.type)) return { role: "CODE", inferred: true };
  if (["IMAGE", "VECTOR"].includes(node.type)) {
    if (areaRatio >= 0.18) return { role: "HERO", inferred: true };
    if (verticalCenter <= 0.28 && areaRatio <= 0.12) return { role: "BRAND", inferred: true };
    return { role: "SUPPORTING_VISUAL", inferred: true };
  }
  if (node.type === "TEXT") {
    const fontSize = typographySize(node);
    const peerSizes = page.nodes
      .filter((candidate) => candidate.type === "TEXT")
      .map(typographySize)
      .sort((a, b) => b - a);
    const largest = peerSizes[0] || fontSize;
    const second = peerSizes[1] || largest;
    if (fontSize >= largest * 0.92) return { role: "TITLE", inferred: true };
    if (fontSize >= second * 0.92 && verticalCenter <= 0.5) {
      return { role: "SUBTITLE", inferred: true };
    }
    if (verticalCenter >= 0.72 && String(node.content ?? "").length <= 80) {
      return { role: "CTA", inferred: true };
    }
    return { role: "BODY", inferred: true };
  }
  return { role: "DECORATIVE", inferred: true };
}

function resolveSafeArea(sourcePage, target) {
  const targetWidth = number(target.width);
  const targetHeight = number(target.height);
  const supplied = object(target.safe_area);
  const source = object(sourcePage.safe_area);
  const fallback = Math.max(8, Math.min(targetWidth, targetHeight) * DEFAULT_SAFE_MARGIN_RATIO);
  const sx = targetWidth / sourcePage.width;
  const sy = targetHeight / sourcePage.height;

  const left = Math.max(0, number(supplied.left, number(source.left, fallback / sx) * sx));
  const right = Math.max(0, number(supplied.right, number(source.right, fallback / sx) * sx));
  const top = Math.max(0, number(supplied.top, number(source.top, fallback / sy) * sy));
  const bottom = Math.max(0, number(supplied.bottom, number(source.bottom, fallback / sy) * sy));

  if (left + right >= targetWidth || top + bottom >= targetHeight) {
    throw new Error("CREATIVE_DESIGN_ADAPT_SAFE_AREA_INVALID");
  }
  return {
    left,
    right,
    top,
    bottom,
    x: left,
    y: top,
    width: targetWidth - left - right,
    height: targetHeight - top - bottom,
  };
}

function uniformFrame(frame, scale, offsetX, offsetY) {
  return {
    x: offsetX + number(frame.x) * scale,
    y: offsetY + number(frame.y) * scale,
    width: number(frame.width) * scale,
    height: number(frame.height) * scale,
  };
}

function scaleTypography(node, scale, target) {
  if (node.type !== "TEXT" && node.type !== "TABLE") return node.typography;
  const typography = object(node.typography);
  if (!Object.keys(typography).length) return node.typography;
  const baseSize = Math.max(1, number(typography.font_size, 16));
  const minimum = Math.max(1, number(target.minimum_font_size, number(typography.minimum_font_size, 8)));
  const maximum = Math.max(minimum, number(target.maximum_font_size, baseSize * 2.5));
  return {
    ...typography,
    font_size: clamp(baseSize * scale, minimum, maximum),
  };
}

function uniformAdaptPage(page, target, safe) {
  const sourceSafeWidth = Math.max(
    1,
    page.width - number(page.safe_area?.left) - number(page.safe_area?.right),
  );
  const sourceSafeHeight = Math.max(
    1,
    page.height - number(page.safe_area?.top) - number(page.safe_area?.bottom),
  );
  const scale = Math.min(safe.width / sourceSafeWidth, safe.height / sourceSafeHeight);
  const sourceSafeX = number(page.safe_area?.left);
  const sourceSafeY = number(page.safe_area?.top);
  const contentWidth = sourceSafeWidth * scale;
  const contentHeight = sourceSafeHeight * scale;
  const offsetX = safe.x + (safe.width - contentWidth) / 2 - sourceSafeX * scale;
  const offsetY = safe.y + (safe.height - contentHeight) / 2 - sourceSafeY * scale;

  const evidence = [];
  const nodes = page.nodes.map((node) => {
    const adapted = {
      ...clone(node),
      frame: uniformFrame(node.frame, scale, offsetX, offsetY),
    };
    if (["TEXT", "TABLE"].includes(node.type)) {
      adapted.typography = scaleTypography(node, scale, target);
    }
    evidence.push({
      node_id: node.id,
      role: roleForNode(node, page).role,
      source_frame: clone(node.frame),
      target_frame: clone(adapted.frame),
      strategy: "UNIFORM_CONTAIN",
    });
    return adapted;
  });
  return { nodes, evidence, scale };
}

function aspectRatio(frame = {}) {
  return Math.max(0.0001, number(frame.width, 1) / Math.max(0.0001, number(frame.height, 1)));
}

function fitAspect({ width, height, ratio, mode = "contain" }) {
  const targetRatio = width / Math.max(1, height);
  if (mode === "cover") {
    if (targetRatio > ratio) return { width, height: width / ratio };
    return { width: height * ratio, height };
  }
  if (targetRatio > ratio) return { width: height * ratio, height };
  return { width, height: width / ratio };
}

function roleGap(role, safe) {
  if (["TITLE", "SUBTITLE"].includes(role)) return Math.max(8, safe.height * 0.012);
  if (["HERO", "DATA"].includes(role)) return Math.max(12, safe.height * 0.018);
  return Math.max(6, safe.height * 0.01);
}

function sourceTypographyScale(page, safe) {
  return clamp(
    Math.sqrt((safe.width * safe.height) / Math.max(1, page.width * page.height)),
    0.65,
    1.65,
  );
}

function textFrameFor(node, width, typography, maximumHeight) {
  const layout = wrapCreativeDesignText(
    node.content,
    { width: Math.max(1, width), height: Number.MAX_SAFE_INTEGER },
    typography,
  );
  const height = Math.min(
    Math.max(layout.required_height, typography.font_size * typography.line_height),
    Math.max(1, maximumHeight),
  );
  return { height, layout };
}

function orderSemanticNodes(page) {
  return page.nodes.map((node) => {
    const resolved = roleForNode(node, page);
    const explicitPriority = number(
      node.layout?.priority ?? node.metadata?.layout_priority ?? node.reflow_priority,
      Number.NaN,
    );
    return {
      node,
      role: resolved.role,
      role_inferred: resolved.inferred,
      priority: Number.isFinite(explicitPriority)
        ? explicitPriority
        : ROLE_ORDER[resolved.role] + sourcePositionKey(node) / 100000000,
    };
  }).sort((first, second) => first.priority - second.priority);
}

function semanticReflowPage(page, target, safe) {
  const ordered = orderSemanticNodes(page);
  const targetWide = safe.width / safe.height >= 1.35;
  const heroEntries = ordered.filter((entry) => entry.role === "HERO");
  const dataEntries = ordered.filter((entry) => entry.role === "DATA");
  const explicitlyDirected = ordered.filter((entry) => !entry.role_inferred).length;
  const ambiguous =
    heroEntries.length > 1 ||
    dataEntries.length > 1 ||
    (ordered.length >= 9 && explicitlyDirected < Math.ceil(ordered.length / 3));

  const typographyScale = sourceTypographyScale(page, safe);
  const evidence = [];
  const byId = new Map();
  const backgrounds = ordered.filter((entry) => entry.role === "BACKGROUND");
  const foreground = ordered.filter((entry) => entry.role !== "BACKGROUND");

  for (const entry of backgrounds) {
    const adapted = {
      ...clone(entry.node),
      frame: { x: 0, y: 0, width: number(target.width), height: number(target.height) },
    };
    byId.set(entry.node.id, adapted);
    evidence.push({
      node_id: entry.node.id,
      role: entry.role,
      role_inferred: entry.role_inferred,
      source_frame: clone(entry.node.frame),
      target_frame: clone(adapted.frame),
      strategy: "TARGET_BACKGROUND_COVER",
    });
  }

  const hero = heroEntries[0] || null;
  const columnGap = Math.max(12, safe.width * 0.025);
  const heroColumnWidth = targetWide && hero ? safe.width * 0.54 : safe.width;
  const contentColumnX = targetWide && hero ? safe.x + heroColumnWidth + columnGap : safe.x;
  const contentColumnWidth = targetWide && hero
    ? Math.max(1, safe.width - heroColumnWidth - columnGap)
    : safe.width;

  let contentY = safe.y;
  let stackY = safe.y;
  const bottomReservedEntries = foreground.filter((entry) => ["CTA", "CODE"].includes(entry.role));
  let bottomCursor = safe.y + safe.height;
  const bottomFrames = new Map();

  for (const entry of [...bottomReservedEntries].reverse()) {
    const node = entry.node;
    let width = Math.min(contentColumnWidth, number(node.frame?.width) * typographyScale);
    let height = number(node.frame?.height) * typographyScale;
    if (entry.role === "CODE") {
      const fitted = fitAspect({
        width: Math.min(contentColumnWidth * 0.34, safe.height * 0.16),
        height: Math.min(safe.height * 0.16, contentColumnWidth * 0.34),
        ratio: aspectRatio(node.frame),
      });
      width = fitted.width;
      height = fitted.height;
    }
    if (node.type === "TEXT") {
      const typography = scaleTypography(node, typographyScale, target);
      const measured = textFrameFor(node, contentColumnWidth, typography, safe.height * 0.18);
      width = contentColumnWidth;
      height = measured.height;
    }
    bottomCursor -= height;
    bottomFrames.set(node.id, {
      x: contentColumnX,
      y: bottomCursor,
      width,
      height,
    });
    bottomCursor -= roleGap(entry.role, safe);
  }

  const usableBottom = Math.max(safe.y, bottomCursor);

  if (hero) {
    const node = hero.node;
    const maxHeight = targetWide
      ? safe.height
      : Math.max(safe.height * 0.28, Math.min(safe.height * 0.46, number(node.frame?.height) * typographyScale));
    const fitted = fitAspect({
      width: heroColumnWidth,
      height: maxHeight,
      ratio: aspectRatio(node.frame),
      mode: node.fit === "contain" ? "contain" : "cover",
    });
    const frame = {
      x: safe.x,
      y: targetWide ? safe.y : stackY,
      width: heroColumnWidth,
      height: Math.min(maxHeight, fitted.height),
    };
    const adapted = { ...clone(node), frame };
    byId.set(node.id, adapted);
    evidence.push({
      node_id: node.id,
      role: hero.role,
      role_inferred: hero.role_inferred,
      source_frame: clone(node.frame),
      target_frame: clone(frame),
      strategy: targetWide ? "SEMANTIC_HERO_LEFT" : "SEMANTIC_HERO_STACK",
    });
    if (!targetWide) stackY += frame.height + roleGap(hero.role, safe);
  }

  for (const entry of foreground) {
    const node = entry.node;
    if (hero && node.id === hero.node.id) continue;
    if (bottomFrames.has(node.id)) continue;

    const columnX = targetWide && hero ? contentColumnX : safe.x;
    const columnWidth = targetWide && hero ? contentColumnWidth : safe.width;
    let frame = clone(node.frame);
    let typography = node.typography;

    if (entry.role === "BRAND") {
      const maxWidth = Math.min(columnWidth * 0.42, safe.width * 0.32);
      const maxHeight = Math.min(safe.height * 0.11, maxWidth);
      const fitted = fitAspect({
        width: maxWidth,
        height: maxHeight,
        ratio: aspectRatio(node.frame),
      });
      frame = {
        x: columnX,
        y: targetWide && hero ? contentY : stackY,
        width: fitted.width,
        height: fitted.height,
      };
    } else if (["TITLE", "SUBTITLE", "BODY"].includes(entry.role) && node.type === "TEXT") {
      typography = scaleTypography(node, typographyScale, target);
      const roleScale = entry.role === "TITLE" ? 1.08 : entry.role === "SUBTITLE" ? 1 : 0.94;
      typography = {
        ...typography,
        font_size: clamp(
          number(typography.font_size) * roleScale,
          Math.max(1, number(target.minimum_font_size, number(node.typography?.minimum_font_size, 8))),
          Math.max(1, number(target.maximum_font_size, number(node.typography?.font_size, 16) * 2.5)),
        ),
      };
      const available = Math.max(1, usableBottom - (targetWide && hero ? contentY : stackY));
      const measured = textFrameFor(node, columnWidth, typography, available);
      frame = {
        x: columnX,
        y: targetWide && hero ? contentY : stackY,
        width: columnWidth,
        height: measured.height,
      };
    } else if (entry.role === "DATA") {
      frame = {
        x: columnX,
        y: targetWide && hero ? contentY : stackY,
        width: columnWidth,
        height: Math.max(1, usableBottom - (targetWide && hero ? contentY : stackY)),
      };
      typography = scaleTypography(node, typographyScale, target);
    } else if (["SUPPORTING_VISUAL", "DECORATIVE"].includes(entry.role)) {
      const maxWidth = Math.min(columnWidth, number(node.frame?.width) * typographyScale);
      const maxHeight = Math.min(safe.height * 0.24, number(node.frame?.height) * typographyScale);
      const fitted = fitAspect({
        width: Math.max(1, maxWidth),
        height: Math.max(1, maxHeight),
        ratio: aspectRatio(node.frame),
      });
      frame = {
        x: columnX,
        y: targetWide && hero ? contentY : stackY,
        width: fitted.width,
        height: fitted.height,
      };
    } else {
      const uniform = Math.min(safe.width / page.width, safe.height / page.height);
      frame = uniformFrame(node.frame, uniform, safe.x, safe.y);
      typography = scaleTypography(node, uniform, target);
    }

    const currentY = targetWide && hero ? contentY : stackY;
    const availableHeight = Math.max(1, usableBottom - currentY);
    if (frame.height > availableHeight && entry.role !== "DATA") {
      frame.height = availableHeight;
    }
    const adapted = {
      ...clone(node),
      frame,
      ...(typography ? { typography } : {}),
    };
    byId.set(node.id, adapted);
    evidence.push({
      node_id: node.id,
      role: entry.role,
      role_inferred: entry.role_inferred,
      source_frame: clone(node.frame),
      target_frame: clone(frame),
      strategy: targetWide && hero ? "SEMANTIC_SPLIT_REFLOW" : "SEMANTIC_STACK_REFLOW",
    });

    const gap = roleGap(entry.role, safe);
    if (targetWide && hero) contentY = Math.min(usableBottom, frame.y + frame.height + gap);
    else stackY = Math.min(usableBottom, frame.y + frame.height + gap);
  }

  for (const entry of bottomReservedEntries) {
    const node = entry.node;
    const frame = bottomFrames.get(node.id);
    let typography = node.typography;
    if (node.type === "TEXT") typography = scaleTypography(node, typographyScale, target);
    const adapted = {
      ...clone(node),
      frame,
      ...(typography ? { typography } : {}),
    };
    byId.set(node.id, adapted);
    evidence.push({
      node_id: node.id,
      role: entry.role,
      role_inferred: entry.role_inferred,
      source_frame: clone(node.frame),
      target_frame: clone(frame),
      strategy: "SEMANTIC_BOTTOM_ANCHOR",
    });
  }

  const nodes = page.nodes.map((node) => byId.get(node.id) || clone(node));
  return {
    nodes,
    evidence,
    ambiguous,
    role_inference_count: ordered.filter((entry) => entry.role_inferred).length,
    explicit_role_count: explicitlyDirected,
    strategy: targetWide && hero ? "SEMANTIC_SPLIT_REFLOW" : "SEMANTIC_STACK_REFLOW",
  };
}

function adaptPage(page, target) {
  const targetWidth = number(target.width);
  const targetHeight = number(target.height);
  if (targetWidth <= 0 || targetHeight <= 0) {
    throw new Error("CREATIVE_DESIGN_ADAPT_TARGET_DIMENSIONS_REQUIRED");
  }

  const safe = resolveSafeArea(page, target);
  const sourceRatio = page.width / page.height;
  const targetRatio = targetWidth / targetHeight;
  const ratioChange = targetRatio / sourceRatio;
  const majorAspectChange = ratioChange < REFLOW_RATIO_LOW || ratioChange > REFLOW_RATIO_HIGH;
  const adapted = majorAspectChange
    ? semanticReflowPage(page, target, safe)
    : uniformAdaptPage(page, target, safe);

  const outputPage = {
    ...clone(page),
    id: target.page_id || `${page.id}-${Math.round(targetWidth)}x${Math.round(targetHeight)}`,
    width: targetWidth,
    height: targetHeight,
    unit: target.unit || page.unit,
    safe_area: {
      left: safe.left,
      right: safe.right,
      top: safe.top,
      bottom: safe.bottom,
    },
    nodes: adapted.nodes,
    metadata: {
      ...object(page.metadata),
      adapted_from_page_id: page.id,
      adaptation_contract: CONTRACT,
      adaptation_strategy: adapted.strategy || "UNIFORM_CONTAIN",
      source_aspect_ratio: sourceRatio,
      target_aspect_ratio: targetRatio,
      aspect_ratio_change: ratioChange,
      semantic_reflow_applied: majorAspectChange,
      non_uniform_scaling_used: false,
      role_inference_count: adapted.role_inference_count || 0,
      explicit_role_count: adapted.explicit_role_count || 0,
      director_reflow_recommended: adapted.ambiguous === true,
      reflow_evidence: adapted.evidence,
    },
  };
  return {
    page: outputPage,
    majorAspectChange,
    ambiguous: adapted.ambiguous === true,
    evidence: adapted.evidence,
  };
}

function targetList(rawTarget = {}) {
  const target = object(rawTarget);
  if (Array.isArray(target.formats) && target.formats.length) {
    return target.formats.map((format) => ({ ...target, ...object(format), formats: undefined }));
  }
  return [target];
}

export function adaptCreativeDesignDocument(rawDocument = {}, rawTarget = {}) {
  const document = validateCreativeDesignDocument(rawDocument);
  const pageIndex = Number.isInteger(Number(rawTarget.page_index))
    ? Number(rawTarget.page_index)
    : 0;
  const sourcePage = document.pages[pageIndex];
  if (!sourcePage) throw new Error("CREATIVE_DESIGN_ADAPT_SOURCE_PAGE_REQUIRED");

  const targets = targetList(rawTarget);
  const adaptedPages = targets.map((target, index) => {
    const resolved = adaptPage(sourcePage, {
      ...target,
      page_id:
        target.page_id ||
        `${sourcePage.id}-${Math.round(number(target.width))}x${Math.round(number(target.height))}-${index + 1}`,
    });
    return resolved;
  });

  const output = {
    ...document,
    document_hash: undefined,
    title: `${document.title} - adapted`,
    revision: Number(document.revision || 1) + 1,
    pages: adaptedPages.map((entry) => entry.page),
    metadata: {
      ...object(document.metadata),
      adapted_from_document_hash: document.document_hash,
      adaptation_contract: CONTRACT,
      adaptive_composition: true,
      non_uniform_scaling_used: false,
      semantic_reflow_supported: true,
      multi_format_adaptation_supported: true,
      adaptation_target_count: targets.length,
      adaptation_requires_director_reflow: adaptedPages.some((entry) => entry.ambiguous),
    },
  };

  const validated = validateCreativeDesignDocument(output);
  const collisions = inspectCreativeDesignCollisions(validated);
  const directorReflowRequired =
    validated.metadata?.adaptation_requires_director_reflow === true ||
    collisions.release_blocked === true;

  return {
    success: !directorReflowRequired,
    contract: CONTRACT,
    document: validated,
    source_document_hash: document.document_hash,
    target_document_hash: validated.document_hash,
    target_count: targets.length,
    semantic_reflow_applied: adaptedPages.some((entry) => entry.majorAspectChange),
    non_uniform_scaling_used: false,
    collision_report: collisions,
    director_reflow_required: directorReflowRequired,
    business_truth_mutated: false,
    copy_mutated: false,
    asset_identity_mutated: false,
    font_identity_mutated: false,
    deterministic: true,
    provider_called: false,
  };
}

export const CreativeDesignAdaptationRuntime = Object.freeze({
  contract: CONTRACT,
  adapt: adaptCreativeDesignDocument,
  semantic_reflow: true,
  non_uniform_scaling_forbidden: true,
  multi_format: true,
});

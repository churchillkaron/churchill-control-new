import { measureImageStudioText } from "./CreativeImageStudioTypographyRuntime.js";

const CONTRACT = "CREATIVE_IMAGE_STUDIO_QUALITY_PREFLIGHT_V2";
const RELEASE_SCORE = 95;

function num(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function safeZone(artboard = {}) {
  const width = num(artboard.width, 1080);
  const height = num(artboard.height, 1350);
  const x = Math.round(width * 0.05);
  const y = Math.round(height * 0.05);
  return { x, y, width: width - x * 2, height: height - y * 2 };
}

function parseHex(value) {
  const raw = String(value || "").trim().replace(/^#/, "");
  const hex = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
}

function luminance(color) {
  const rgb = parseHex(color);
  if (!rgb) return null;
  const linear = rgb.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrastRatio(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  if (a === null || b === null) return null;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function intersectionRatio(a = {}, b = {}) {
  const left = Math.max(num(a.x), num(b.x));
  const top = Math.max(num(a.y), num(b.y));
  const right = Math.min(num(a.x) + num(a.width), num(b.x) + num(b.width));
  const bottom = Math.min(num(a.y) + num(a.height), num(b.y) + num(b.height));
  if (right <= left || bottom <= top) return 0;
  const intersection = (right - left) * (bottom - top);
  const smaller = Math.max(1, Math.min(num(a.width) * num(a.height), num(b.width) * num(b.height)));
  return intersection / smaller;
}

function effectivePpi(layer = {}) {
  const metadata = layer.metadata || {};
  const sourceWidth = num(metadata.source_width || metadata.pixel_width || metadata.source_dimensions?.width);
  const sourceHeight = num(metadata.source_height || metadata.pixel_height || metadata.source_dimensions?.height);
  const width = num(layer.bounds?.width);
  const height = num(layer.bounds?.height);
  if (!sourceWidth || !sourceHeight || !width || !height) return null;
  const targetDpi = num(metadata.target_dpi, 300);
  const widthInches = width / targetDpi;
  const heightInches = height / targetDpi;
  if (!widthInches || !heightInches) return null;
  const zoom = Math.max(1, num(metadata.crop?.zoom, 1));
  return Math.min(sourceWidth / zoom / widthInches, sourceHeight / zoom / heightInches);
}

function isVectorImageLayer(layer = {}) {
  const metadata = layer.metadata || {};
  if (metadata.is_vector === true || metadata.vector === true) return true;
  const descriptor = [metadata.mime_type, metadata.file_type, metadata.format, metadata.extension, metadata.source_kind]
    .filter(Boolean).join(" ").toLowerCase();
  return /(^|\s)(svg|image\/svg\+xml|eps|vector)(\s|$)/.test(descriptor);
}

function isPrintArtboard(artboard = {}) {
  const text = [artboard.export_preset?.id, artboard.output_kind, artboard.metadata?.output_kind, artboard.metadata?.channel]
    .filter(Boolean).join(" ").toLowerCase();
  return /print|a[0-9]|poster|flyer|brochure/.test(text);
}

function addFinding(collection, code, category, layerId = null, detail = null) {
  collection.push({ code, category, layer_id: layerId, detail });
}

export function assessImageStudioComposition({ artboard = {}, layers = [], comments = [] } = {}) {
  const width = num(artboard.width);
  const height = num(artboard.height);
  const blockers = [];
  const warnings = [];
  const blockerFindings = [];
  const warningFindings = [];
  const zone = safeZone(artboard);
  const visible = list(layers).filter((layer) => layer.visible !== false);
  const textLayers = visible.filter((layer) => layer.layer_type === "TEXT");
  const imageLayers = visible.filter((layer) => layer.layer_type === "IMAGE");
  const backgroundColor = artboard.background?.color || artboard.metadata?.background_color || null;

  const block = (code, category, layerId, detail) => {
    blockers.push(layerId ? `${code}:${layerId}` : code);
    addFinding(blockerFindings, code, category, layerId, detail);
  };
  const warn = (code, category, layerId, detail) => {
    warnings.push(layerId ? `${code}:${layerId}` : code);
    addFinding(warningFindings, code, category, layerId, detail);
  };

  if (width < 1 || height < 1) block("ARTBOARD_GEOMETRY_INVALID", "technical");
  if (!visible.length) block("ARTBOARD_EMPTY", "composition");

  for (const layer of visible) {
    const b = layer.bounds || {};
    const x = num(b.x), y = num(b.y);
    const w = num(b.width), h = num(b.height);
    if (w < 1 || h < 1) block("LAYER_GEOMETRY_INVALID", "technical", layer.id);
    if (x < 0 || y < 0 || x + w > width || y + h > height) warn("LAYER_OUTSIDE_ARTBOARD", "composition", layer.id);

    if (layer.layer_type === "TEXT") {
      if (!String(layer.style?.font_asset_id || "").trim()) block("FONT_ASSET_MISSING", "typography", layer.id);
      const size = num(layer.style?.font_size, 36);
      if (size < Math.max(10, width * 0.012)) warn("TEXT_TOO_SMALL", "typography", layer.id, { font_size: size });
      const outsideSafe = x < zone.x || y < zone.y || x + w > zone.x + zone.width || y + h > zone.y + zone.height;
      if (outsideSafe && layer.metadata?.allow_bleed_copy !== true) warn("TEXT_OUTSIDE_SAFE_ZONE", "composition", layer.id);
      const textValue = String(layer.content?.text || "");
      if (!textValue.trim()) warn("TEXT_EMPTY", "copy", layer.id);
      const measurement = measureImageStudioText({ text: textValue, bounds: b, style: layer.style || {} });
      if (measurement.overflow) block("TEXT_OVERFLOW", "typography", layer.id, { line_count: measurement.visibleLines?.length || 0 });
      if (backgroundColor && !imageLayers.length) {
        const ratio = contrastRatio(layer.style?.color, backgroundColor);
        if (ratio !== null && ratio < (size >= 24 ? 3 : 4.5)) warn("TEXT_CONTRAST_LOW", "accessibility", layer.id, { ratio: Math.round(ratio * 100) / 100 });
      }
      if (layer.metadata?.required_copy === true && !textValue.trim()) block("REQUIRED_COPY_MISSING", "copy", layer.id);
    }

    if (layer.layer_type === "IMAGE") {
      if (!layer.source_asset_id) block("IMAGE_SOURCE_MISSING", "technical", layer.id);
      if (layer.metadata?.exact_brand_asset === true && layer.metadata?.synthetic === true) block("EXACT_BRAND_ASSET_SYNTHETIC", "brand", layer.id);
      const ppi = effectivePpi(layer);
      if (isPrintArtboard(artboard)) {
        if (ppi === null && !isVectorImageLayer(layer)) {
          block("PRINT_IMAGE_RESOLUTION_UNKNOWN", "technical", layer.id);
        } else if (ppi !== null) {
          if (ppi < 120) block("PRINT_IMAGE_RESOLUTION_CRITICAL", "technical", layer.id, { effective_ppi: Math.round(ppi) });
          else if (ppi < 220) warn("PRINT_IMAGE_RESOLUTION_LOW", "technical", layer.id, { effective_ppi: Math.round(ppi) });
        }
      }
    }
  }

  for (let i = 0; i < textLayers.length; i += 1) {
    for (let j = i + 1; j < textLayers.length; j += 1) {
      const ratio = intersectionRatio(textLayers[i].bounds, textLayers[j].bounds);
      if (ratio >= 0.2 && textLayers[i].metadata?.intentional_overlap !== true && textLayers[j].metadata?.intentional_overlap !== true) {
        warn("TEXT_COLLISION", "composition", textLayers[j].id, { with_layer_id: textLayers[i].id, overlap_ratio: Math.round(ratio * 100) / 100 });
      }
    }
  }

  if (textLayers.length >= 2) {
    const sizes = textLayers.map((layer) => num(layer.style?.font_size, 0)).filter((size) => size > 0);
    if (sizes.length >= 2 && Math.max(...sizes) / Math.max(1, Math.min(...sizes)) < 1.25) {
      warn("TYPOGRAPHIC_HIERARCHY_WEAK", "typography", null, { largest: Math.max(...sizes), smallest: Math.min(...sizes) });
    }
  }

  const unresolvedComments = list(comments).filter((comment) => comment.status !== "RESOLVED").length;
  if (unresolvedComments) warn("UNRESOLVED_COMMENTS", "review", null, { count: unresolvedComments });

  const criticalReviewComments = list(comments).filter((comment) => comment.status !== "RESOLVED" && ["BLOCKER", "CRITICAL"].includes(String(comment.severity || comment.priority || "").toUpperCase())).length;
  if (criticalReviewComments) block("CRITICAL_REVIEW_COMMENTS_OPEN", "review", null, { count: criticalReviewComments });

  const categoryPenalty = {
    technical: 14,
    typography: 10,
    composition: 9,
    accessibility: 8,
    copy: 10,
    brand: 16,
    review: 8,
  };
  const blockerPenalty = blockerFindings.reduce((sum, finding) => sum + Math.max(18, categoryPenalty[finding.category] || 12), 0);
  const warningPenalty = warningFindings.reduce((sum, finding) => sum + Math.max(3, Math.round((categoryPenalty[finding.category] || 6) / 2)), 0);
  const score = Math.max(0, 100 - blockerPenalty - warningPenalty);
  const releaseReady = blockerFindings.length === 0 && score >= RELEASE_SCORE;

  return {
    contract: CONTRACT,
    score,
    release_threshold: RELEASE_SCORE,
    blockers,
    warnings,
    findings: { blockers: blockerFindings, warnings: warningFindings },
    release_ready: releaseReady,
    counts: {
      visible_layers: visible.length,
      text_layers: textLayers.length,
      image_layers: imageLayers.length,
      unresolved_comments: unresolvedComments,
      critical_review_comments: criticalReviewComments,
    },
    checks: {
      geometry: !blockerFindings.some((finding) => finding.category === "technical" && finding.code.includes("GEOMETRY")),
      exact_typography: !blockerFindings.some((finding) => finding.category === "typography"),
      brand_integrity: !blockerFindings.some((finding) => finding.category === "brand"),
      review_closed: criticalReviewComments === 0,
      professional_score: score >= RELEASE_SCORE,
    },
  };
}

export const CreativeImageStudioQualityPreflightRuntime = Object.freeze({
  contract: CONTRACT,
  release_score: RELEASE_SCORE,
  assess: assessImageStudioComposition,
});

export default CreativeImageStudioQualityPreflightRuntime;

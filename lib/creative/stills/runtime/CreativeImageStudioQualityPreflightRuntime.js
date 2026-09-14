import { measureImageStudioText } from "./CreativeImageStudioTypographyRuntime.js";
function num(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function safeZone(artboard = {}) {
  const width = num(artboard.width, 1080);
  const height = num(artboard.height, 1350);
  const x = Math.round(width * 0.05);
  const y = Math.round(height * 0.05);
  return { x, y, width: width - x * 2, height: height - y * 2 };
}

export function assessImageStudioComposition({ artboard = {}, layers = [], comments = [] } = {}) {
  const width = num(artboard.width);
  const height = num(artboard.height);
  const blockers = [];
  const warnings = [];
  const zone = safeZone(artboard);

  if (width < 1 || height < 1) blockers.push("ARTBOARD_GEOMETRY_INVALID");
  const visible = layers.filter((layer) => layer.visible !== false);
  if (!visible.length) blockers.push("ARTBOARD_EMPTY");
  for (const layer of visible) {
    const b = layer.bounds || {};
    const x = num(b.x), y = num(b.y);
    const w = num(b.width), h = num(b.height);
    if (w < 1 || h < 1) blockers.push(`LAYER_GEOMETRY_INVALID:${layer.id}`);
    if (x < 0 || y < 0 || x + w > width || y + h > height) {
      warnings.push(`LAYER_OUTSIDE_ARTBOARD:${layer.id}`);
    }
    if (layer.layer_type === "TEXT") {
      if (!String(layer.style?.font_asset_id || "").trim()) blockers.push(`FONT_ASSET_MISSING:${layer.id}`);
      const size = num(layer.style?.font_size, 36);
      if (size < Math.max(10, width * 0.012)) warnings.push(`TEXT_TOO_SMALL:${layer.id}`);
      const outsideSafe = x < zone.x || y < zone.y || x + w > zone.x + zone.width || y + h > zone.y + zone.height;
      if (outsideSafe) warnings.push(`TEXT_OUTSIDE_SAFE_ZONE:${layer.id}`);
      const textValue = String(layer.content?.text || "");
      if (!textValue.trim()) warnings.push(`TEXT_EMPTY:${layer.id}`);
      const measurement = measureImageStudioText({ text: textValue, bounds: b, style: layer.style || {} });
      if (measurement.overflow) blockers.push(`TEXT_OVERFLOW:${layer.id}`);
    }
    if (layer.layer_type === "IMAGE" && !layer.source_asset_id) blockers.push(`IMAGE_SOURCE_MISSING:${layer.id}`);
  }

  const unresolvedComments = comments.filter((comment) => comment.status !== "RESOLVED").length;
  if (unresolvedComments) warnings.push(`UNRESOLVED_COMMENTS:${unresolvedComments}`);
  const score = Math.max(0, 100 - blockers.length * 30 - warnings.length * 5);
  return {
    contract: "CREATIVE_IMAGE_STUDIO_QUALITY_PREFLIGHT_V1",
    score,
    blockers,
    warnings,
    release_ready: blockers.length === 0 && score >= 80,
    counts: { visible_layers: visible.length, unresolved_comments: unresolvedComments },
  };
}

function num(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function normalizeImageStudioCrop(layer = {}) {
  const bounds = layer.bounds || {};
  const crop = layer.metadata?.crop || {};
  const width = Math.max(1, Math.round(num(bounds.width, 240)));
  const height = Math.max(1, Math.round(num(bounds.height, 180)));
  const focalX = Math.max(0, Math.min(1, num(crop.x, 0.5)));
  const focalY = Math.max(0, Math.min(1, num(crop.y, 0.5)));
  const zoom = Math.max(1, num(crop.zoom, 1));
  const scaledWidth = Math.max(width, Math.round(width * zoom));
  const scaledHeight = Math.max(height, Math.round(height * zoom));
  const extractLeft = Math.max(0, Math.min(scaledWidth - width, Math.round(focalX * scaledWidth - width / 2)));
  const extractTop = Math.max(0, Math.min(scaledHeight - height, Math.round(focalY * scaledHeight - height / 2)));
  const maskRadius = Math.max(0, Math.min(Math.min(width, height) / 2, num(layer.metadata?.mask_radius)));
  return { width, height, focalX, focalY, zoom, scaledWidth, scaledHeight, extractLeft, extractTop, maskRadius };
}

export function rotatedImageStudioPlacement(layer = {}, rendered = {}) {
  const bounds = layer.bounds || {};
  const width = Math.max(1, num(bounds.width, 240));
  const height = Math.max(1, num(bounds.height, 180));
  const renderedWidth = Math.max(1, num(rendered.width, width));
  const renderedHeight = Math.max(1, num(rendered.height, height));
  const centerX = num(bounds.x) + width / 2;
  const centerY = num(bounds.y) + height / 2;
  return {
    left: Math.round(centerX - renderedWidth / 2),
    top: Math.round(centerY - renderedHeight / 2),
    centerX,
    centerY,
    renderedWidth,
    renderedHeight,
  };
}

export function imageStudioPreviewStyle(layer = {}, scale = 1) {
  const crop = normalizeImageStudioCrop(layer);
  return {
    borderRadius: crop.maskRadius * scale,
    objectPosition: `${crop.focalX * 100}% ${crop.focalY * 100}%`,
    transform: `scale(${crop.zoom})`,
    transformOrigin: `${crop.focalX * 100}% ${crop.focalY * 100}%`,
  };
}
export const CreativeImageStudioImageGeometryRuntime = Object.freeze({
  contract: "CREATIVE_IMAGE_STUDIO_IMAGE_GEOMETRY_V1",
  crop: normalizeImageStudioCrop,
  placement: rotatedImageStudioPlacement,
  previewStyle: imageStudioPreviewStyle,
});

export default CreativeImageStudioImageGeometryRuntime;

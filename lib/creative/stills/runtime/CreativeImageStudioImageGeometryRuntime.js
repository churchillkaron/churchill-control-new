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

export function imageStudioSourceCropGeometry(layer = {}, source = {}) {
  const crop = normalizeImageStudioCrop(layer);
  const sourceWidth = Math.max(1, Math.round(num(source.width, crop.width)));
  const sourceHeight = Math.max(1, Math.round(num(source.height, crop.height)));
  const coverScale = Math.max(crop.scaledWidth / sourceWidth, crop.scaledHeight / sourceHeight);
  const renderedWidth = Math.max(crop.scaledWidth, Math.round(sourceWidth * coverScale));
  const renderedHeight = Math.max(crop.scaledHeight, Math.round(sourceHeight * coverScale));
  const coverLeft = Math.max(0, Math.min(renderedWidth - crop.scaledWidth, Math.round(crop.focalX * renderedWidth - crop.scaledWidth / 2)));
  const coverTop = Math.max(0, Math.min(renderedHeight - crop.scaledHeight, Math.round(crop.focalY * renderedHeight - crop.scaledHeight / 2)));
  return { ...crop, sourceWidth, sourceHeight, coverScale, renderedWidth, renderedHeight, coverLeft, coverTop };
}

export function imageStudioPreviewGeometry(layer = {}, source = {}, scale = 1) {
  const geometry = imageStudioSourceCropGeometry(layer, source);
  const factor = Math.max(0.0001, num(scale, 1));
  return {
    frame: { width: geometry.width * factor, height: geometry.height * factor, borderRadius: geometry.maskRadius * factor },
    image: {
      left: -(geometry.coverLeft + geometry.extractLeft) * factor,
      top: -(geometry.coverTop + geometry.extractTop) * factor,
      width: geometry.renderedWidth * factor,
      height: geometry.renderedHeight * factor,
    },
    geometry,
  };
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
  sourceCrop: imageStudioSourceCropGeometry,
  previewGeometry: imageStudioPreviewGeometry,
});

export default CreativeImageStudioImageGeometryRuntime;

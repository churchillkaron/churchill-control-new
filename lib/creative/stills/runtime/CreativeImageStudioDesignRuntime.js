export const IMAGE_STUDIO_FORMAT_PRESETS = Object.freeze([
  { id: 'instagram_portrait', label: 'Instagram 4:5', width: 1080, height: 1350 },
  { id: 'instagram_square', label: 'Instagram 1:1', width: 1080, height: 1080 },
  { id: 'story', label: 'Story / Reel', width: 1080, height: 1920 },
  { id: 'facebook_portrait', label: 'Facebook 4:5', width: 1200, height: 1500 },
  { id: 'linkedin_landscape', label: 'LinkedIn 1.91:1', width: 1200, height: 628 },
  { id: 'presentation_16_9', label: 'Presentation 16:9', width: 1920, height: 1080 },
  { id: 'a4_print', label: 'A4 Print', width: 2480, height: 3508 },
]);

export function buildSafeZone(artboard = {}) {
  const width = Number(artboard.width) || 1080;
  const height = Number(artboard.height) || 1350;
  const insetX = Math.round(width * 0.05);
  const insetY = Math.round(height * 0.05);
  return { x: insetX, y: insetY, width: width - insetX * 2, height: height - insetY * 2 };
}

export function adaptBoundsToArtboard(bounds = {}, source = {}, target = {}, focal = {}) {
  const sw = Number(source.width) || 1, sh = Number(source.height) || 1;
  const tw = Number(target.width) || sw, th = Number(target.height) || sh;
  const x = Number(bounds.x) || 0, y = Number(bounds.y) || 0;
  const width = Number(bounds.width) || sw, height = Number(bounds.height) || sh;
  const cx = Number.isFinite(Number(focal.x)) ? Number(focal.x) : (x + width / 2) / sw;
  const cy = Number.isFinite(Number(focal.y)) ? Number(focal.y) : (y + height / 2) / sh;
  const scale = Math.min(tw / sw, th / sh);
  const nw = Math.max(24, width * scale), nh = Math.max(24, height * scale);
  return {
    x: Math.max(0, Math.min(tw - nw, cx * tw - nw / 2)),
    y: Math.max(0, Math.min(th - nh, cy * th - nh / 2)),
    width: nw,
    height: nh,
  };
}

export function alignLayers(layers = [], artboard = {}, mode = 'left') {
  if (!layers.length) return [];
  const boxes = layers.map((layer) => ({ ...layer.bounds }));
  const minX = Math.min(...boxes.map((b) => Number(b.x) || 0));
  const minY = Math.min(...boxes.map((b) => Number(b.y) || 0));
  const maxX = Math.max(...boxes.map((b) => (Number(b.x) || 0) + (Number(b.width) || 0)));
  const maxY = Math.max(...boxes.map((b) => (Number(b.y) || 0) + (Number(b.height) || 0)));
  return layers.map((layer) => {
    const b = { ...layer.bounds };
    if (mode === 'left') b.x = minX;
    if (mode === 'right') b.x = maxX - b.width;
    if (mode === 'top') b.y = minY;
    if (mode === 'bottom') b.y = maxY - b.height;
    if (mode === 'center_x') b.x = ((Number(artboard.width) || maxX) - b.width) / 2;
    if (mode === 'center_y') b.y = ((Number(artboard.height) || maxY) - b.height) / 2;
    return { ...layer, bounds: b };
  });
}

export function distributeLayers(layers = [], axis = 'x') {
  if (layers.length < 3) return layers;
  const sorted = [...layers].sort((a, b) => (Number(a.bounds?.[axis]) || 0) - (Number(b.bounds?.[axis]) || 0));
  const sizeKey = axis === 'x' ? 'width' : 'height';
  const start = Number(sorted[0].bounds?.[axis]) || 0;
  const endLayer = sorted[sorted.length - 1];
  const end = (Number(endLayer.bounds?.[axis]) || 0) + (Number(endLayer.bounds?.[sizeKey]) || 0);
  const totalSize = sorted.reduce((sum, layer) => sum + (Number(layer.bounds?.[sizeKey]) || 0), 0);
  const gap = (end - start - totalSize) / (sorted.length - 1);
  let cursor = start;
  return sorted.map((layer) => {
    const next = { ...layer, bounds: { ...layer.bounds, [axis]: cursor } };
    cursor += (Number(layer.bounds?.[sizeKey]) || 0) + gap;
    return next;
  });
}

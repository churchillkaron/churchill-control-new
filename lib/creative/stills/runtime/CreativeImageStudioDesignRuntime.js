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
export function snapLayerBounds(bounds = {}, artboard = {}, siblings = [], options = {}) {
  const threshold = Math.max(1, Number(options.threshold) || 8);
  const safe = buildSafeZone(artboard);
  const width = Number(bounds.width) || 0;
  const height = Number(bounds.height) || 0;
  const startX = Number(bounds.x) || 0;
  const startY = Number(bounds.y) || 0;
  const movingX = [startX, startX + width / 2, startX + width];
  const movingY = [startY, startY + height / 2, startY + height];
  const targetX = [0, Number(artboard.width) / 2, Number(artboard.width), safe.x, safe.x + safe.width / 2, safe.x + safe.width];
  const targetY = [0, Number(artboard.height) / 2, Number(artboard.height), safe.y, safe.y + safe.height / 2, safe.y + safe.height];
  for (const layer of siblings) {
    const b = layer?.bounds || {};
    const x = Number(b.x) || 0, y = Number(b.y) || 0;
    const w = Number(b.width) || 0, h = Number(b.height) || 0;
    targetX.push(x, x + w / 2, x + w);
    targetY.push(y, y + h / 2, y + h);
  }
  const best = (moving, targets) => {
    let hit = null;
    for (let mi = 0; mi < moving.length; mi += 1) for (const target of targets) {
      const delta = target - moving[mi];
      if (Math.abs(delta) <= threshold && (!hit || Math.abs(delta) < Math.abs(hit.delta))) hit = { delta, target, anchor: mi };
    }
    return hit;
  };
  const xHit = best(movingX, targetX), yHit = best(movingY, targetY);
  return {
    bounds: { ...bounds, x: startX + (xHit?.delta || 0), y: startY + (yHit?.delta || 0) },
    guides: { x: xHit?.target ?? null, y: yHit?.target ?? null },
  };
}

export function reorderNormalizedLayers(layers = [], id, delta = 0) {
  const same = [...layers].sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.id).localeCompare(String(b.id)));
  const from = same.findIndex((layer) => layer.id === id);
  if (from < 0) return same.map((layer, index) => ({ ...layer, sort_order: index }));
  const to = Math.max(0, Math.min(same.length - 1, from + Math.sign(Number(delta) || 0)));
  if (to !== from) { const [item] = same.splice(from, 1); same.splice(to, 0, item); }
  return same.map((layer, index) => ({ ...layer, sort_order: index }));
}

export function clampImageStudioZoom(value) {
  const zoom = Number(value);
  return Math.max(0.2, Math.min(3, Number.isFinite(zoom) ? zoom : 1));
}

export function fitImageStudioZoom(artboard = {}, viewport = {}, padding = 96) {
  const width = Math.max(1, Number(artboard.width) || 1080);
  const height = Math.max(1, Number(artboard.height) || 1350);
  const availableWidth = Math.max(1, (Number(viewport.width) || width) - padding);
  const availableHeight = Math.max(1, (Number(viewport.height) || height) - padding);
  return clampImageStudioZoom(Math.min(availableWidth / width, availableHeight / height));
}

export function snapResizeBounds(bounds = {}, artboard = {}, siblings = [], options = {}) {
  const threshold = Math.max(1, Number(options.threshold) || 8);
  const minSize = Math.max(1, Number(options.minSize) || 24);
  const x = Number(bounds.x) || 0, y = Number(bounds.y) || 0;
  let width = Math.max(minSize, Number(bounds.width) || minSize);
  let height = Math.max(minSize, Number(bounds.height) || minSize);
  const safe = buildSafeZone(artboard);
  const targetX = [Number(artboard.width), safe.x, safe.x + safe.width];
  const targetY = [Number(artboard.height), safe.y, safe.y + safe.height];
  for (const layer of siblings) {
    const b = layer?.bounds || {};
    targetX.push(Number(b.x) || 0, (Number(b.x) || 0) + (Number(b.width) || 0));
    targetY.push(Number(b.y) || 0, (Number(b.y) || 0) + (Number(b.height) || 0));
  }
  const hit = (edge, targets) => targets.map((target) => ({ target, delta: target - edge })).filter((item) => Math.abs(item.delta) <= threshold).sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0] || null;
  const xHit = hit(x + width, targetX), yHit = hit(y + height, targetY);
  const aspect = Math.max(0.0001, Number(options.aspectRatio) || width / height || 1);
  if (options.preserveAspect) {
    if (xHit && (!yHit || Math.abs(xHit.delta) <= Math.abs(yHit.delta))) { width = Math.max(minSize, width + xHit.delta); height = Math.max(minSize, width / aspect); }
    else if (yHit) { height = Math.max(minSize, height + yHit.delta); width = Math.max(minSize, height * aspect); }
  } else {
    if (xHit) width = Math.max(minSize, width + xHit.delta);
    if (yHit) height = Math.max(minSize, height + yHit.delta);
  }
  return { bounds: { ...bounds, x, y, width, height }, guides: { x: xHit?.target ?? null, y: yHit?.target ?? null } };
}

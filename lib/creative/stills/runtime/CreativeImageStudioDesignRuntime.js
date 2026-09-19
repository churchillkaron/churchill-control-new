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


function responsiveScale(source = {}, target = {}) {
  const sw = Math.max(1, Number(source.width) || 1);
  const sh = Math.max(1, Number(source.height) || 1);
  const tw = Math.max(1, Number(target.width) || sw);
  const th = Math.max(1, Number(target.height) || sh);
  return { x: tw / sw, y: th / sh, contain: Math.min(tw / sw, th / sh), cover: Math.max(tw / sw, th / sh) };
}

function isFullBleedLayer(layer = {}, source = {}) {
  if (layer.layer_type !== 'IMAGE') return false;
  const b = layer.bounds || {};
  const sw = Math.max(1, Number(source.width) || 1);
  const sh = Math.max(1, Number(source.height) || 1);
  const areaRatio = Math.max(0, Number(b.width) || 0) * Math.max(0, Number(b.height) || 0) / (sw * sh);
  const edgeToleranceX = sw * 0.04;
  const edgeToleranceY = sh * 0.04;
  return areaRatio >= 0.82 &&
    (Number(b.x) || 0) <= edgeToleranceX &&
    (Number(b.y) || 0) <= edgeToleranceY &&
    (Number(b.x) || 0) + (Number(b.width) || 0) >= sw - edgeToleranceX &&
    (Number(b.y) || 0) + (Number(b.height) || 0) >= sh - edgeToleranceY;
}

function clampToZone(bounds = {}, zone = {}) {
  const width = Math.min(Math.max(24, Number(bounds.width) || 24), zone.width);
  const height = Math.min(Math.max(24, Number(bounds.height) || 24), zone.height);
  return {
    ...bounds,
    x: Math.max(zone.x, Math.min(zone.x + zone.width - width, Number(bounds.x) || zone.x)),
    y: Math.max(zone.y, Math.min(zone.y + zone.height - height, Number(bounds.y) || zone.y)),
    width,
    height,
  };
}

export function adaptLayerToArtboard(layer = {}, source = {}, target = {}) {
  const scale = responsiveScale(source, target);
  const metadata = layer.metadata || {};
  const responsiveLocked = metadata.responsive_lock === true || metadata.brand_locked === true || metadata.exact_brand_asset === true;
  const fullBleed = isFullBleedLayer(layer, source) && !responsiveLocked;
  let bounds;
  if (fullBleed) {
    bounds = { x: 0, y: 0, width: Number(target.width) || 1, height: Number(target.height) || 1 };
  } else {
    bounds = adaptBoundsToArtboard(layer.bounds, source, target, metadata.focal_point || {});
  }
  let style = { ...(layer.style || {}) };
  if (layer.layer_type === 'TEXT') {
    const zone = buildSafeZone(target);
    bounds = clampToZone(bounds, zone);
    const currentSize = Math.max(6, Number(style.font_size) || 36);
    style.font_size = Math.max(6, Math.round(currentSize * scale.contain * 100) / 100);
    const currentSpacing = Number(style.letter_spacing) || 0;
    style.letter_spacing = Math.round(currentSpacing * scale.contain * 100) / 100;
  }
  return {
    ...layer,
    bounds,
    style,
    metadata: {
      ...metadata,
      responsive_variant: true,
      responsive_source_artboard_id: source.id || null,
      responsive_strategy: fullBleed ? 'FULL_BLEED_COVER' : layer.layer_type === 'TEXT' ? 'SAFE_ZONE_TYPOGRAPHY' : responsiveLocked ? 'BRAND_LOCKED_FOCAL' : 'FOCAL_CONTAIN',
    },
  };
}

export function adaptLayersToArtboard(layers = [], source = {}, target = {}) {
  return layers.map((layer) => adaptLayerToArtboard(layer, source, target));
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

export function selectionBounds(layers = []) {
  if (!layers.length) return null;
  const boxes = layers.map((layer) => layer?.bounds || {});
  const left = Math.min(...boxes.map((b) => Number(b.x) || 0));
  const top = Math.min(...boxes.map((b) => Number(b.y) || 0));
  const right = Math.max(...boxes.map((b) => (Number(b.x) || 0) + (Number(b.width) || 0)));
  const bottom = Math.max(...boxes.map((b) => (Number(b.y) || 0) + (Number(b.height) || 0)));
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

export function resizeBoundsFromHandle(bounds = {}, handle = 'se', dx = 0, dy = 0, options = {}) {
  const minSize = Math.max(1, Number(options.minSize) || 24);
  const original = {
    x: Number(bounds.x) || 0,
    y: Number(bounds.y) || 0,
    width: Math.max(minSize, Number(bounds.width) || minSize),
    height: Math.max(minSize, Number(bounds.height) || minSize),
  };
  let left = original.x;
  let top = original.y;
  let right = original.x + original.width;
  let bottom = original.y + original.height;
  if (handle.includes('w')) left += dx;
  if (handle.includes('e')) right += dx;
  if (handle.includes('n')) top += dy;
  if (handle.includes('s')) bottom += dy;
  if (right - left < minSize) {
    if (handle.includes('w')) left = right - minSize;
    else right = left + minSize;
  }
  if (bottom - top < minSize) {
    if (handle.includes('n')) top = bottom - minSize;
    else bottom = top + minSize;
  }
  let next = { x: left, y: top, width: right - left, height: bottom - top };
  if (options.preserveAspect && /^(nw|ne|sw|se)$/.test(handle)) {
    const aspect = Math.max(0.0001, Number(options.aspectRatio) || original.width / original.height || 1);
    const anchorX = handle.includes('w') ? original.x + original.width : original.x;
    const anchorY = handle.includes('n') ? original.y + original.height : original.y;
    const proposedWidth = next.width;
    const proposedHeight = next.height;
    if (Math.abs(proposedWidth - original.width) >= Math.abs(proposedHeight - original.height) * aspect) next.height = Math.max(minSize, next.width / aspect);
    else next.width = Math.max(minSize, next.height * aspect);
    next.x = handle.includes('w') ? anchorX - next.width : anchorX;
    next.y = handle.includes('n') ? anchorY - next.height : anchorY;
  }
  return next;
}

export function scaleLayersFromSelection(layers = [], originalSelection = {}, nextSelection = {}) {
  const ow = Math.max(0.0001, Number(originalSelection.width) || 1);
  const oh = Math.max(0.0001, Number(originalSelection.height) || 1);
  const sx = (Number(nextSelection.width) || ow) / ow;
  const sy = (Number(nextSelection.height) || oh) / oh;
  return layers.map((layer) => {
    const b = layer?.bounds || {};
    return {
      ...layer,
      bounds: {
        ...b,
        x: Number(nextSelection.x) + ((Number(b.x) || 0) - Number(originalSelection.x || 0)) * sx,
        y: Number(nextSelection.y) + ((Number(b.y) || 0) - Number(originalSelection.y || 0)) * sy,
        width: Math.max(1, (Number(b.width) || 1) * sx),
        height: Math.max(1, (Number(b.height) || 1) * sy),
      },
    };
  });
}

export function snapRotation(degrees, step = 15, threshold = 4) {
  const value = Number(degrees) || 0;
  const normalized = ((value % 360) + 360) % 360;
  const target = Math.round(normalized / step) * step;
  return Math.abs(target - normalized) <= threshold ? target % 360 : normalized;
}

export function rotateLayersAroundSelection(layers = [], selection = {}, deltaDegrees = 0) {
  const angle = Number(deltaDegrees) || 0;
  const radians = angle * Math.PI / 180;
  const cx = (Number(selection.x) || 0) + (Number(selection.width) || 0) / 2;
  const cy = (Number(selection.y) || 0) + (Number(selection.height) || 0) / 2;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return layers.map((layer) => {
    const b = layer?.bounds || {};
    const width = Number(b.width) || 0;
    const height = Number(b.height) || 0;
    const ox = (Number(b.x) || 0) + width / 2;
    const oy = (Number(b.y) || 0) + height / 2;
    const dx = ox - cx;
    const dy = oy - cy;
    const nx = cx + dx * cos - dy * sin;
    const ny = cy + dx * sin + dy * cos;
    return {
      ...layer,
      bounds: { ...b, x: nx - width / 2, y: ny - height / 2 },
      transform: { ...(layer.transform || {}), rotation: (Number(layer.transform?.rotation) || 0) + angle },
    };
  });
}

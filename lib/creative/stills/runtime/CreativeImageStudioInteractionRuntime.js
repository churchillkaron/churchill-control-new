function num(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function normalizeRect(value = {}) {
  const x1 = num(value.x);
  const y1 = num(value.y);
  const x2 = x1 + num(value.width);
  const y2 = y1 + num(value.height);
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  return {
    x: left,
    y: top,
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

function boundsFor(layer = {}) {
  return normalizeRect(layer.bounds || {});
}

export function imageStudioRectsIntersect(left = {}, right = {}) {
  const a = normalizeRect(left);
  const b = normalizeRect(right);
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
}

export function imageStudioRectContains(outer = {}, inner = {}) {
  const a = normalizeRect(outer);
  const b = normalizeRect(inner);
  return b.x >= a.x && b.y >= a.y &&
    b.x + b.width <= a.x + a.width &&
    b.y + b.height <= a.y + a.height;
}

export function selectImageStudioLayersInMarquee(layers = [], marquee = {}, options = {}) {
  const mode = options.mode === "contain" ? "contain" : "intersect";
  const includeLocked = options.include_locked === true;
  const active = layers.filter((layer) => layer.visible !== false && (includeLocked || !layer.locked));
  return active.filter((layer) => mode === "contain"
    ? imageStudioRectContains(marquee, boundsFor(layer))
    : imageStudioRectsIntersect(marquee, boundsFor(layer)))
    .map((layer) => layer.id);
}

export function imageStudioGroupBounds(layers = []) {
  if (!layers.length) return null;
  const boxes = layers.map(boundsFor);
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function buildImageStudioGroupPatch(layers = [], selectedIds = [], groupId) {
  const chosen = layers.filter((layer) => selectedIds.includes(layer.id));
  if (chosen.length < 2 || !groupId) return null;
  const artboardIds = new Set(chosen.map((layer) => layer.artboard_id).filter(Boolean));
  if (artboardIds.size > 1) throw new Error("IMAGE_STUDIO_GROUP_CROSS_ARTBOARD_UNSUPPORTED");
  return {
    id: groupId,
    artboard_id: chosen[0]?.artboard_id || null,
    parent_layer_id: chosen.every((layer) => layer.parent_layer_id === chosen[0]?.parent_layer_id)
      ? chosen[0]?.parent_layer_id || null
      : null,
    bounds: imageStudioGroupBounds(chosen),
    child_ids: chosen.map((layer) => layer.id),
    child_patches: chosen.map((layer) => ({ id: layer.id, parent_layer_id: groupId })),
  };
}

export function imageStudioEqualGapGuide(moving = {}, siblings = [], axis = "x", threshold = 8) {
  const sizeKey = axis === "x" ? "width" : "height";
  const start = num(moving[axis]);
  const size = Math.max(0, num(moving[sizeKey]));
  const center = start + size / 2;
  const ordered = siblings
    .filter((layer) => layer.visible !== false)
    .map((layer) => boundsFor(layer))
    .sort((a, b) => a[axis] - b[axis]);
  if (ordered.length < 2) return null;
  let best = null;
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const first = ordered[index];
    const second = ordered[index + 1];
    const gap = second[axis] - (first[axis] + first[sizeKey]);
    if (gap < 0) continue;
    const before = first[axis] - gap - size;
    const after = second[axis] + second[sizeKey] + gap;
    for (const candidate of [before, after]) {
      const delta = candidate - start;
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
        best = { axis, delta, target: candidate, gap, center: center + delta };
      }
    }
  }
  return best;
}

export const CreativeImageStudioInteractionRuntime = Object.freeze({
  contract: "CREATIVE_IMAGE_STUDIO_INTERACTION_V1",
  intersects: imageStudioRectsIntersect,
  contains: imageStudioRectContains,
  marqueeSelect: selectImageStudioLayersInMarquee,
  groupBounds: imageStudioGroupBounds,
  groupPatch: buildImageStudioGroupPatch,
  equalGapGuide: imageStudioEqualGapGuide,
});

export default CreativeImageStudioInteractionRuntime;

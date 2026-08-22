import {
  validateCreativeDesignDocument,
} from "../contracts/CreativeDesignDocumentContract.js";

const CONTRACT = "CREATIVE_DESIGN_COLLISION_INSPECTION_V1";
const CONTENT_TYPES = new Set(["TEXT", "TABLE", "QR", "BARCODE"]);

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

function nodeAllowsOverlap(node = {}) {
  return Boolean(
    node.allow_overlap === true ||
    node.layout?.allow_overlap === true ||
    node.metadata?.allow_overlap === true,
  );
}

function overlapGroup(node = {}) {
  return text(
    node.overlap_group ||
    node.layout?.overlap_group ||
    node.metadata?.overlap_group,
  );
}

function collisionProtected(node = {}) {
  return Boolean(
    CONTENT_TYPES.has(node.type) ||
    node.collision_protected === true ||
    node.layout?.collision_protected === true ||
    node.metadata?.collision_protected === true,
  );
}

function intentionalOverlap(first, second) {
  if (nodeAllowsOverlap(first) || nodeAllowsOverlap(second)) return true;
  const firstGroup = overlapGroup(first);
  const secondGroup = overlapGroup(second);
  return Boolean(firstGroup && secondGroup && firstGroup === secondGroup);
}

function intersection(firstFrame = {}, secondFrame = {}) {
  const left = Math.max(number(firstFrame.x), number(secondFrame.x));
  const top = Math.max(number(firstFrame.y), number(secondFrame.y));
  const right = Math.min(
    number(firstFrame.x) + number(firstFrame.width),
    number(secondFrame.x) + number(secondFrame.width),
  );
  const bottom = Math.min(
    number(firstFrame.y) + number(firstFrame.height),
    number(secondFrame.y) + number(secondFrame.height),
  );
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  return {
    x: left,
    y: top,
    width,
    height,
    area: width * height,
  };
}

function frameArea(frame = {}) {
  return Math.max(0, number(frame.width)) * Math.max(0, number(frame.height));
}

function pairIsProtected(first, second) {
  if (!collisionProtected(first) || !collisionProtected(second)) return false;
  if (CONTENT_TYPES.has(first.type) && CONTENT_TYPES.has(second.type)) return true;
  return Boolean(
    first.collision_protected === true ||
    first.layout?.collision_protected === true ||
    first.metadata?.collision_protected === true ||
    second.collision_protected === true ||
    second.layout?.collision_protected === true ||
    second.metadata?.collision_protected === true
  );
}

export function inspectCreativeDesignCollisions(rawDocument = {}, options = {}) {
  const document = validateCreativeDesignDocument(rawDocument);
  const minimumOverlapRatio = Math.max(
    0,
    Math.min(1, number(options.minimum_overlap_ratio, 0.02)),
  );
  const collisions = [];

  for (const page of document.pages) {
    const nodes = page.nodes.filter((node) => node.visible !== false);
    for (let firstIndex = 0; firstIndex < nodes.length; firstIndex += 1) {
      const first = nodes[firstIndex];
      for (let secondIndex = firstIndex + 1; secondIndex < nodes.length; secondIndex += 1) {
        const second = nodes[secondIndex];
        if (!pairIsProtected(first, second)) continue;
        if (intentionalOverlap(first, second)) continue;

        const overlap = intersection(first.frame, second.frame);
        if (overlap.area <= 0) continue;
        const smallerArea = Math.max(1, Math.min(frameArea(first.frame), frameArea(second.frame)));
        const overlapRatio = overlap.area / smallerArea;
        if (overlapRatio < minimumOverlapRatio) continue;

        collisions.push({
          severity: "ERROR",
          code: "NODE_COLLISION",
          page_id: page.id,
          node_id: first.id,
          related_node_id: second.id,
          node_type: first.type,
          related_node_type: second.type,
          overlap,
          overlap_ratio_of_smaller_node: overlapRatio,
          overlap_allowed: false,
        });
      }
    }
  }

  return {
    success: collisions.length === 0,
    contract: CONTRACT,
    document_hash: document.document_hash,
    collision_count: collisions.length,
    collisions,
    release_blocked: collisions.length > 0,
    minimum_overlap_ratio: minimumOverlapRatio,
    explicit_overlap_opt_out_supported: true,
    deterministic: true,
    provider_called: false,
  };
}

export const CreativeDesignCollisionRuntime = Object.freeze({
  contract: CONTRACT,
  inspect: inspectCreativeDesignCollisions,
});

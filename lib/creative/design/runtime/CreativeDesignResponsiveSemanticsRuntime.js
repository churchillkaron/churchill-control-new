import {
  validateCreativeDesignDocument,
} from "../contracts/CreativeDesignDocumentContract.js";

const CONTRACT = "CREATIVE_DESIGN_RESPONSIVE_SEMANTICS_V1";
const ROLES = new Set([
  "BACKGROUND",
  "BRAND",
  "TITLE",
  "SUBTITLE",
  "HERO",
  "BODY",
  "DATA",
  "CTA",
  "CODE",
  "SUPPORTING_VISUAL",
  "DECORATIVE",
]);
const ANCHORS = new Set([
  "TOP_LEFT",
  "TOP_CENTER",
  "TOP_RIGHT",
  "CENTER_LEFT",
  "CENTER",
  "CENTER_RIGHT",
  "BOTTOM_LEFT",
  "BOTTOM_CENTER",
  "BOTTOM_RIGHT",
  "FLOW",
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function number(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeNode(node = {}) {
  const layout = object(node.layout);
  const role = text(layout.role || node.metadata?.layout_role || node.design_role).toUpperCase();
  const anchor = text(layout.anchor || node.metadata?.layout_anchor).toUpperCase();
  const priority = number(layout.priority ?? node.metadata?.layout_priority ?? node.reflow_priority);
  const repeatOnContinuation = Boolean(
    layout.repeat_on_continuation === true ||
    node.repeat_on_continuation === true ||
    node.metadata?.repeat_on_continuation === true,
  );
  const allowOverlap = Boolean(
    layout.allow_overlap === true ||
    node.allow_overlap === true ||
    node.metadata?.allow_overlap === true,
  );
  const overlapGroup = text(
    layout.overlap_group ||
    node.overlap_group ||
    node.metadata?.overlap_group,
  );

  if (role && !ROLES.has(role)) {
    throw new Error(`CREATIVE_DESIGN_LAYOUT_ROLE_INVALID:${node.id}:${role}`);
  }
  if (anchor && !ANCHORS.has(anchor)) {
    throw new Error(`CREATIVE_DESIGN_LAYOUT_ANCHOR_INVALID:${node.id}:${anchor}`);
  }
  if (allowOverlap && !overlapGroup) {
    throw new Error(`CREATIVE_DESIGN_OVERLAP_GROUP_REQUIRED:${node.id}`);
  }

  return {
    ...node,
    layout: {
      ...layout,
      ...(role ? { role } : {}),
      ...(anchor ? { anchor } : {}),
      ...(priority !== null ? { priority } : {}),
      repeat_on_continuation: repeatOnContinuation,
      allow_overlap: allowOverlap,
      ...(overlapGroup ? { overlap_group: overlapGroup } : {}),
    },
  };
}

export function normalizeCreativeDesignResponsiveSemantics(rawDocument = {}) {
  const document = validateCreativeDesignDocument(rawDocument);
  const normalized = validateCreativeDesignDocument({
    ...document,
    document_hash: undefined,
    pages: document.pages.map((page) => ({
      ...page,
      nodes: page.nodes.map(normalizeNode),
    })),
    metadata: {
      ...object(document.metadata),
      responsive_semantics_contract: CONTRACT,
    },
  });

  const explicit = normalized.pages.flatMap((page) => page.nodes).filter((node) =>
    text(node.layout?.role),
  );

  return {
    success: true,
    contract: CONTRACT,
    document: normalized,
    explicit_role_count: explicit.length,
    role_vocabulary: [...ROLES],
    anchor_vocabulary: [...ANCHORS],
    overlap_requires_named_group: true,
    deterministic: true,
    provider_called: false,
  };
}

export const CreativeDesignResponsiveSemanticsRuntime = Object.freeze({
  contract: CONTRACT,
  roles: Object.freeze([...ROLES]),
  anchors: Object.freeze([...ANCHORS]),
  normalize: normalizeCreativeDesignResponsiveSemantics,
});

import crypto from "node:crypto";

export const CREATIVE_DESIGN_DOCUMENT_CONTRACT = "CREATIVE_DESIGN_DOCUMENT_V1";

const NODE_TYPES = new Set([
  "TEXT",
  "IMAGE",
  "VECTOR",
  "SHAPE",
  "GROUP",
  "TABLE",
  "QR",
  "BARCODE",
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => key !== "document_hash")
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

export function hashCreativeDesignDocument(document) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(document)))
    .digest("hex");
}

function assertFinite(value, code) {
  if (!Number.isFinite(Number(value))) throw new Error(code);
  return Number(value);
}

function validateFrame(frame = {}) {
  const x = assertFinite(frame.x, "CREATIVE_DESIGN_FRAME_X_REQUIRED");
  const y = assertFinite(frame.y, "CREATIVE_DESIGN_FRAME_Y_REQUIRED");
  const width = assertFinite(frame.width, "CREATIVE_DESIGN_FRAME_WIDTH_REQUIRED");
  const height = assertFinite(frame.height, "CREATIVE_DESIGN_FRAME_HEIGHT_REQUIRED");
  if (width <= 0 || height <= 0) throw new Error("CREATIVE_DESIGN_FRAME_DIMENSIONS_INVALID");
  return { x, y, width, height };
}

function validateTextNode(node) {
  const content = String(node.content ?? "");
  if (!content.length) throw new Error(`CREATIVE_DESIGN_TEXT_EMPTY:${node.id}`);
  const typography = object(node.typography);
  if (!text(typography.font_asset_id)) {
    throw new Error(`CREATIVE_DESIGN_FONT_ASSET_REQUIRED:${node.id}`);
  }
  const fontSize = assertFinite(
    typography.font_size,
    `CREATIVE_DESIGN_FONT_SIZE_REQUIRED:${node.id}`,
  );
  if (fontSize <= 0) throw new Error(`CREATIVE_DESIGN_FONT_SIZE_INVALID:${node.id}`);
  return {
    ...node,
    content,
    typography: {
      ...typography,
      font_size: fontSize,
      font_weight: typography.font_weight ?? 400,
      line_height: typography.line_height ?? 1.2,
      letter_spacing: typography.letter_spacing ?? 0,
      align: text(typography.align) || "left",
    },
  };
}

function validateAssetNode(node) {
  if (!text(node.asset_id) && !text(node.asset_reference)) {
    throw new Error(`CREATIVE_DESIGN_ASSET_REQUIRED:${node.id}`);
  }
  return node;
}

function validateNode(rawNode = {}) {
  const node = object(rawNode);
  const id = text(node.id);
  const type = text(node.type).toUpperCase();
  if (!id) throw new Error("CREATIVE_DESIGN_NODE_ID_REQUIRED");
  if (!NODE_TYPES.has(type)) throw new Error(`CREATIVE_DESIGN_NODE_TYPE_INVALID:${id}:${type}`);
  const normalized = {
    ...node,
    id,
    type,
    frame: validateFrame(object(node.frame)),
    locked: node.locked === true,
    visible: node.visible !== false,
    opacity: node.opacity === undefined ? 1 : Math.max(0, Math.min(1, Number(node.opacity))),
    rotation: Number(node.rotation || 0),
  };
  if (type === "TEXT") return validateTextNode(normalized);
  if (["IMAGE", "VECTOR"].includes(type)) return validateAssetNode(normalized);
  return normalized;
}

function validatePage(rawPage = {}, index) {
  const page = object(rawPage);
  const id = text(page.id) || `page-${index + 1}`;
  const width = assertFinite(page.width, `CREATIVE_DESIGN_PAGE_WIDTH_REQUIRED:${id}`);
  const height = assertFinite(page.height, `CREATIVE_DESIGN_PAGE_HEIGHT_REQUIRED:${id}`);
  if (width <= 0 || height <= 0) throw new Error(`CREATIVE_DESIGN_PAGE_DIMENSIONS_INVALID:${id}`);
  const nodes = list(page.nodes).map(validateNode);
  const ids = new Set();
  for (const node of nodes) {
    if (ids.has(node.id)) throw new Error(`CREATIVE_DESIGN_DUPLICATE_NODE:${id}:${node.id}`);
    ids.add(node.id);
  }
  return {
    ...page,
    id,
    width,
    height,
    unit: text(page.unit) || "px",
    background: page.background ?? null,
    bleed: object(page.bleed),
    safe_area: object(page.safe_area),
    nodes,
  };
}

export function validateCreativeDesignDocument(raw = {}) {
  const document = object(raw);
  if (document.contract !== CREATIVE_DESIGN_DOCUMENT_CONTRACT) {
    throw new Error("CREATIVE_DESIGN_DOCUMENT_CONTRACT_INVALID");
  }
  const organizationId = text(document.organization_id);
  const projectId = text(document.creative_project_id);
  if (!organizationId) throw new Error("CREATIVE_DESIGN_ORGANIZATION_REQUIRED");
  if (!projectId) throw new Error("CREATIVE_DESIGN_PROJECT_REQUIRED");
  const pages = list(document.pages).map(validatePage);
  if (!pages.length) throw new Error("CREATIVE_DESIGN_PAGE_REQUIRED");

  const normalized = {
    ...document,
    organization_id: organizationId,
    creative_project_id: projectId,
    creative_mission_id: text(document.creative_mission_id) || null,
    title: text(document.title) || "Untitled design",
    pages,
    assets: list(document.assets),
    data_bindings: object(document.data_bindings),
    export_spec: object(document.export_spec),
    revision: Number.isInteger(Number(document.revision))
      ? Number(document.revision)
      : 1,
  };

  return {
    ...normalized,
    document_hash: hashCreativeDesignDocument(normalized),
  };
}

export function verifyCreativeDesignDocument(document = {}) {
  try {
    const validated = validateCreativeDesignDocument(document);
    return text(document.document_hash) === validated.document_hash;
  } catch {
    return false;
  }
}

export const CREATIVE_DESIGN_NODE_TYPES = Object.freeze([...NODE_TYPES]);

import {
  CREATIVE_DESIGN_DOCUMENT_CONTRACT,
  validateCreativeDesignDocument,
} from "../contracts/CreativeDesignDocumentContract.js";

const CONTRACT = "CREATIVE_DESIGN_COMPOSITION_V1";
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
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, code) {
  const number = finite(value);
  if (number === null || number <= 0) throw new Error(code);
  return number;
}

function frame(value, code) {
  const source = object(value);
  return {
    x: finite(source.x, 0),
    y: finite(source.y, 0),
    width: positive(source.width, `${code}_WIDTH_REQUIRED`),
    height: positive(source.height, `${code}_HEIGHT_REQUIRED`),
  };
}

function typography(value, nodeId) {
  const source = object(value);
  const fontAssetId = text(source.font_asset_id);
  if (!fontAssetId) {
    throw new Error(`CREATIVE_DESIGN_COMPOSE_FONT_ASSET_REQUIRED:${nodeId}`);
  }
  return {
    ...source,
    font_asset_id: fontAssetId,
    font_size: positive(
      source.font_size,
      `CREATIVE_DESIGN_COMPOSE_FONT_SIZE_REQUIRED:${nodeId}`,
    ),
    font_weight: source.font_weight ?? 400,
    line_height: finite(source.line_height, 1.2),
    letter_spacing: finite(source.letter_spacing, 0),
    align: text(source.align) || "left",
  };
}

function commonNode(source, pageId, index) {
  const id = text(source.id) || `${pageId}-node-${index + 1}`;
  const type = text(source.type).toUpperCase();
  if (!NODE_TYPES.has(type)) {
    throw new Error(`CREATIVE_DESIGN_COMPOSE_NODE_TYPE_INVALID:${id}:${type}`);
  }
  return {
    ...source,
    id,
    type,
    frame: frame(source.frame, `CREATIVE_DESIGN_COMPOSE_FRAME:${id}`),
    locked: source.locked === true,
    visible: source.visible !== false,
    opacity: source.opacity === undefined ? 1 : source.opacity,
    rotation: finite(source.rotation, 0),
  };
}

function composeTextNode(node) {
  const content = String(node.content ?? "");
  const binding = object(node.binding);
  if (!content.length && !Object.keys(binding).length) {
    throw new Error(`CREATIVE_DESIGN_COMPOSE_TEXT_OR_BINDING_REQUIRED:${node.id}`);
  }
  return {
    ...node,
    content: content || node.binding_placeholder || "BOUND_VALUE",
    typography: typography(node.typography, node.id),
  };
}

function composeImageNode(node) {
  const binding = object(node.binding);
  if (
    !text(node.asset_id) &&
    !text(node.asset_reference) &&
    !Object.keys(binding).length
  ) {
    throw new Error(`CREATIVE_DESIGN_COMPOSE_ASSET_OR_BINDING_REQUIRED:${node.id}`);
  }
  return {
    ...node,
    asset_reference:
      text(node.asset_reference) ||
      (Object.keys(binding).length ? "binding://pending" : null),
  };
}

function composeTableNode(node) {
  const columns = list(node.columns);
  if (!columns.length) {
    throw new Error(`CREATIVE_DESIGN_COMPOSE_TABLE_COLUMNS_REQUIRED:${node.id}`);
  }
  const binding = object(node.binding);
  const rows = list(node.rows);
  if (!rows.length && !Object.keys(binding).length) {
    throw new Error(`CREATIVE_DESIGN_COMPOSE_TABLE_ROWS_OR_BINDING_REQUIRED:${node.id}`);
  }
  const tableTypography = object(node.typography);
  if (Object.keys(tableTypography).length) {
    node = {
      ...node,
      typography: typography(tableTypography, node.id),
    };
  }
  return {
    ...node,
    columns: columns.map((column, index) => ({
      ...object(column),
      id: text(column?.id) || `${node.id}-column-${index + 1}`,
    })),
    rows,
  };
}

function composeCodeNode(node) {
  const binding = object(node.binding);
  if (!text(node.value || node.content) && !Object.keys(binding).length) {
    throw new Error(`CREATIVE_DESIGN_COMPOSE_CODE_VALUE_OR_BINDING_REQUIRED:${node.id}`);
  }
  return {
    ...node,
    value:
      text(node.value || node.content) ||
      (Object.keys(binding).length ? "BOUND_VALUE" : null),
  };
}

function composeNode(raw, pageId, index) {
  let node = commonNode(object(raw), pageId, index);
  if (node.type === "TEXT") node = composeTextNode(node);
  if (["IMAGE", "VECTOR"].includes(node.type)) node = composeImageNode(node);
  if (node.type === "TABLE") node = composeTableNode(node);
  if (["QR", "BARCODE"].includes(node.type)) node = composeCodeNode(node);
  return node;
}

function composePage(rawPage, index, defaultUnit) {
  const page = object(rawPage);
  const id = text(page.id) || `page-${index + 1}`;
  const nodes = list(page.nodes).map((node, nodeIndex) =>
    composeNode(node, id, nodeIndex));
  if (!nodes.length) {
    throw new Error(`CREATIVE_DESIGN_COMPOSE_PAGE_NODE_REQUIRED:${id}`);
  }
  return {
    ...page,
    id,
    width: positive(page.width, `CREATIVE_DESIGN_COMPOSE_PAGE_WIDTH_REQUIRED:${id}`),
    height: positive(page.height, `CREATIVE_DESIGN_COMPOSE_PAGE_HEIGHT_REQUIRED:${id}`),
    unit: text(page.unit) || defaultUnit || "px",
    background: page.background ?? null,
    bleed: object(page.bleed),
    safe_area: object(page.safe_area),
    nodes,
  };
}

function assertDirectorSpecification(specification) {
  const source = object(specification);
  const authority = object(source.authority);
  if (!text(authority.creative_master_plan_hash)) {
    throw new Error("CREATIVE_DESIGN_COMPOSE_MASTER_PLAN_HASH_REQUIRED");
  }
  if (!text(authority.art_direction_id || authority.art_direction_hash)) {
    throw new Error("CREATIVE_DESIGN_COMPOSE_ART_DIRECTION_REQUIRED");
  }
  if (!text(authority.brand_direction_id || authority.brand_direction_hash)) {
    throw new Error("CREATIVE_DESIGN_COMPOSE_BRAND_DIRECTION_REQUIRED");
  }
  return authority;
}

export function composeCreativeDesignDocument({
  organization_id,
  creative_project_id,
  creative_mission_id = null,
  specification = {},
} = {}) {
  const organizationId = text(organization_id);
  const projectId = text(creative_project_id);
  if (!organizationId) throw new Error("CREATIVE_DESIGN_COMPOSE_ORGANIZATION_REQUIRED");
  if (!projectId) throw new Error("CREATIVE_DESIGN_COMPOSE_PROJECT_REQUIRED");

  const spec = object(specification);
  const authority = assertDirectorSpecification(spec);
  const pages = list(spec.pages).map((page, index) =>
    composePage(page, index, text(spec.unit) || "px"));
  if (!pages.length) throw new Error("CREATIVE_DESIGN_COMPOSE_PAGE_REQUIRED");

  const document = validateCreativeDesignDocument({
    contract: CREATIVE_DESIGN_DOCUMENT_CONTRACT,
    organization_id: organizationId,
    creative_project_id: projectId,
    creative_mission_id: text(creative_mission_id) || null,
    title: text(spec.title) || "Untitled design",
    pages,
    assets: list(spec.assets),
    data_bindings: object(spec.data_bindings),
    export_spec: object(spec.export_spec),
    revision: 1,
    metadata: {
      ...object(spec.metadata),
      composition_contract: CONTRACT,
      creative_master_plan_hash: authority.creative_master_plan_hash,
      art_direction_id:
        authority.art_direction_id || authority.art_direction_hash,
      brand_direction_id:
        authority.brand_direction_id || authority.brand_direction_hash,
      copy_direction_id:
        authority.copy_direction_id || authority.copy_direction_hash || null,
      experience_direction_id:
        authority.experience_direction_id ||
        authority.experience_direction_hash ||
        null,
      director_specification_only: true,
      provider_selection_exposed: false,
      prompt_persisted: false,
    },
  });

  return {
    success: true,
    contract: CONTRACT,
    document,
    document_hash: document.document_hash,
    page_count: document.pages.length,
    node_count: document.pages.reduce((sum, page) => sum + page.nodes.length, 0),
    director_authority: {
      creative_master_plan_hash: authority.creative_master_plan_hash,
      art_direction_id:
        authority.art_direction_id || authority.art_direction_hash,
      brand_direction_id:
        authority.brand_direction_id || authority.brand_direction_hash,
      copy_direction_id:
        authority.copy_direction_id || authority.copy_direction_hash || null,
    },
    deterministic: true,
    provider_called: false,
    prompt_persisted: false,
  };
}

export const CreativeDesignCompositionRuntime = Object.freeze({
  contract: CONTRACT,
  compose: composeCreativeDesignDocument,
});

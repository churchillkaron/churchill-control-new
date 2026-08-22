import {
  validateCreativeDesignDocument,
} from "../contracts/CreativeDesignDocumentContract.js";

const CONTRACT = "CREATIVE_DESIGN_DATA_BINDING_V1";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function clone(value) {
  return structuredClone(value);
}

function pathSegments(path) {
  return text(path)
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
}

function readPath(source, path) {
  let current = source;
  for (const segment of pathSegments(path)) {
    if (current == null) return undefined;
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      current = current[Number(segment)];
    } else {
      current = current[segment];
    }
  }
  return current;
}

function sourceEnvelope(sources, sourceId, organizationId) {
  const envelope = object(sources[sourceId]);
  if (!Object.keys(envelope).length) {
    throw new Error(`CREATIVE_DESIGN_DATA_SOURCE_REQUIRED:${sourceId}`);
  }
  if (text(envelope.organization_id) !== organizationId) {
    throw new Error(`CREATIVE_DESIGN_DATA_SOURCE_ORGANIZATION_MISMATCH:${sourceId}`);
  }
  if (!text(envelope.source_type)) {
    throw new Error(`CREATIVE_DESIGN_DATA_SOURCE_TYPE_REQUIRED:${sourceId}`);
  }
  if (!text(envelope.evidence_id || envelope.source_id || envelope.version_id)) {
    throw new Error(`CREATIVE_DESIGN_DATA_SOURCE_EVIDENCE_REQUIRED:${sourceId}`);
  }
  return envelope;
}

function formatScalar(value, binding = {}) {
  if (value == null) return "";
  const format = text(binding.format).toUpperCase();
  if (!format || format === "TEXT") return String(value);
  if (format === "UPPERCASE") return String(value).toUpperCase();
  if (format === "LOWERCASE") return String(value).toLowerCase();
  if (format === "NUMBER") {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error("CREATIVE_DESIGN_BOUND_NUMBER_INVALID");
    return new Intl.NumberFormat(binding.locale || "en-US", {
      maximumFractionDigits: binding.maximum_fraction_digits ?? 2,
    }).format(number);
  }
  if (format === "CURRENCY") {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error("CREATIVE_DESIGN_BOUND_CURRENCY_INVALID");
    const currency = text(binding.currency);
    if (!currency) throw new Error("CREATIVE_DESIGN_BOUND_CURRENCY_CODE_REQUIRED");
    return new Intl.NumberFormat(binding.locale || "en-US", {
      style: "currency",
      currency,
      currencyDisplay: binding.currency_display || "symbol",
      minimumFractionDigits: binding.minimum_fraction_digits,
      maximumFractionDigits: binding.maximum_fraction_digits,
    }).format(number);
  }
  if (format === "DATE") {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) throw new Error("CREATIVE_DESIGN_BOUND_DATE_INVALID");
    return new Intl.DateTimeFormat(binding.locale || "en-US", binding.date_options || {}).format(date);
  }
  throw new Error(`CREATIVE_DESIGN_BOUND_FORMAT_UNSUPPORTED:${format}`);
}

function bindingFor(node, documentBindings) {
  return object(node.binding || documentBindings[node.id]);
}

function resolveBinding(binding, sources, organizationId) {
  const sourceId = text(binding.source_id || binding.source);
  const path = text(binding.path);
  if (!sourceId) throw new Error("CREATIVE_DESIGN_BINDING_SOURCE_REQUIRED");
  if (!path) throw new Error(`CREATIVE_DESIGN_BINDING_PATH_REQUIRED:${sourceId}`);
  const envelope = sourceEnvelope(sources, sourceId, organizationId);
  const value = readPath(envelope.data, path);
  if (value === undefined && binding.required !== false) {
    throw new Error(`CREATIVE_DESIGN_BINDING_VALUE_REQUIRED:${sourceId}:${path}`);
  }
  return { sourceId, path, envelope, value };
}

function bindTable(node, binding, resolved) {
  if (!Array.isArray(resolved.value)) {
    throw new Error(`CREATIVE_DESIGN_TABLE_BINDING_ARRAY_REQUIRED:${node.id}`);
  }
  const columns = list(node.columns);
  if (!columns.length) throw new Error(`CREATIVE_DESIGN_TABLE_COLUMNS_REQUIRED:${node.id}`);
  const rows = resolved.value.map((record, rowIndex) => ({
    id: `${node.id}:bound-row-${rowIndex + 1}`,
    cells: columns.map((column) => {
      const cellBinding = object(column.binding);
      const cellPath = text(cellBinding.path || column.path || column.id);
      const raw = readPath(record, cellPath);
      if (raw === undefined && cellBinding.required !== false) {
        throw new Error(`CREATIVE_DESIGN_TABLE_CELL_VALUE_REQUIRED:${node.id}:${cellPath}:${rowIndex}`);
      }
      return {
        content: formatScalar(raw, cellBinding),
        align: cellBinding.align || column.align || null,
        typography: object(cellBinding.typography),
        data_binding: {
          source_id: resolved.sourceId,
          source_path: `${resolved.path}.${rowIndex}.${cellPath}`,
        },
      };
    }),
  }));
  return { ...node, rows };
}

function bindNode(node, documentBindings, sources, organizationId, evidence) {
  const binding = bindingFor(node, documentBindings);
  if (!Object.keys(binding).length) return node;
  const resolved = resolveBinding(binding, sources, organizationId);
  evidence.push({
    node_id: node.id,
    node_type: node.type,
    source_id: resolved.sourceId,
    source_type: resolved.envelope.source_type,
    source_evidence_id:
      resolved.envelope.evidence_id ||
      resolved.envelope.source_id ||
      resolved.envelope.version_id,
    source_path: resolved.path,
  });

  if (node.type === "TABLE") return bindTable(node, binding, resolved);
  if (["TEXT", "QR", "BARCODE"].includes(node.type)) {
    const content = formatScalar(resolved.value, binding);
    if (node.type === "TEXT") return { ...node, content };
    return { ...node, value: content };
  }
  if (["IMAGE", "VECTOR"].includes(node.type)) {
    if (!resolved.value) throw new Error(`CREATIVE_DESIGN_BOUND_ASSET_REQUIRED:${node.id}`);
    return {
      ...node,
      asset_reference:
        typeof resolved.value === "string"
          ? resolved.value
          : resolved.value.storage_reference || resolved.value.url || resolved.value.asset_reference,
    };
  }
  throw new Error(`CREATIVE_DESIGN_BINDING_NODE_TYPE_UNSUPPORTED:${node.id}:${node.type}`);
}

export function bindCreativeDesignDocument(rawDocument = {}, governedSources = {}) {
  const document = validateCreativeDesignDocument(rawDocument);
  const sources = object(governedSources);
  const evidence = [];
  const documentBindings = object(document.data_bindings);
  const bound = {
    ...document,
    pages: document.pages.map((page) => ({
      ...page,
      nodes: page.nodes.map((node) =>
        bindNode(node, documentBindings, sources, document.organization_id, evidence)),
    })),
    binding_evidence: evidence,
    binding_contract: CONTRACT,
  };
  const validated = validateCreativeDesignDocument(bound);
  return {
    success: true,
    contract: CONTRACT,
    document: validated,
    evidence,
    source_count: new Set(evidence.map((item) => item.source_id)).size,
    binding_count: evidence.length,
    invented_business_facts_allowed: false,
    provider_called: false,
  };
}

export const CreativeDesignDataBindingRuntime = Object.freeze({
  contract: CONTRACT,
  bind: bindCreativeDesignDocument,
});

import {
  validateCreativeDesignDocument,
} from "../contracts/CreativeDesignDocumentContract.js";
import {
  inspectCreativeDesignDocument,
} from "./CreativeDesignQualityRuntime.js";
import {
  layoutCreativeDesignTables,
} from "./CreativeDesignTableLayoutRuntime.js";

const CONTRACT = "CREATIVE_DESIGN_REPAIR_V2";
const REPAIR_PLAN_CONTRACT = "CREATIVE_DESIGN_REPAIR_PLAN_V2";
const DEFAULT_MAXIMUM_PASSES = 3;
const DEFAULT_MINIMUM_FONT_SIZE = 8;
const SAFE_TYPOGRAPHY_KEYS = new Set([
  "font_size",
  "line_height",
  "letter_spacing",
]);
const TRUTH_MUTATING_OPERATIONS = new Set([
  "SET_CONTENT",
  "SET_CODE_VALUE",
  "SET_ASSET_REFERENCE",
  "SET_TABLE_ROWS",
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

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clone(value) {
  return structuredClone(value);
}

function pageFor(document, pageId, nodeId = null) {
  if (pageId) {
    return document.pages.find((page) => text(page.id) === text(pageId)) || null;
  }
  if (nodeId) {
    return document.pages.find((page) =>
      page.nodes.some((node) => text(node.id) === text(nodeId)),
    ) || null;
  }
  return null;
}

function nodeFor(page, nodeId) {
  return page?.nodes?.find((node) => text(node.id) === text(nodeId)) || null;
}

function bindingFor(document, node) {
  return object(node?.binding || object(document.data_bindings)[node?.id]);
}

function nodeIsDataBound(document, node) {
  return Object.keys(bindingFor(document, node)).length > 0;
}

function immutableSnapshot(document) {
  const locked = [];
  for (const page of document.pages) {
    for (const node of page.nodes) {
      if (node.locked === true) {
        locked.push({ page_id: page.id, node_id: node.id, node: clone(node) });
      }
    }
  }
  return locked;
}

function truthSnapshot(document) {
  return {
    data_bindings: clone(object(document.data_bindings)),
    pages: document.pages.map((page) => ({
      page_id: page.id,
      nodes: page.nodes.map((node) => ({
        node_id: node.id,
        type: node.type,
        binding: clone(bindingFor(document, node)),
        content: node.content,
        value: node.value,
        asset_id: node.asset_id,
        asset_reference: node.asset_reference,
        asset_url: node.asset_url,
        rows: clone(node.rows),
        columns: clone(node.columns),
      })),
    })),
  };
}

function fontIdentitySnapshot(document) {
  return document.pages.map((page) => ({
    page_id: page.id,
    nodes: page.nodes.map((node) => ({
      node_id: node.id,
      font_asset_id: node.typography?.font_asset_id,
      font_family: node.typography?.font_family,
      font_weight: node.typography?.font_weight,
      brand_locked:
        node.brand_locked === true ||
        node.typography?.brand_locked === true ||
        node.metadata?.brand_locked === true ||
        text(node.metadata?.typography_authority).toUpperCase() === "BRAND_LOCKED",
    })),
  }));
}

function assertImmutableNodesPreserved(before, after) {
  for (const locked of immutableSnapshot(before)) {
    const page = pageFor(after, locked.page_id);
    const node = nodeFor(page, locked.node_id);
    if (!node || JSON.stringify(node) !== JSON.stringify(locked.node)) {
      throw new Error(`CREATIVE_DESIGN_LOCKED_NODE_MUTATION_FORBIDDEN:${locked.node_id}`);
    }
  }
}

function assertTruthPreserved(before, after) {
  if (JSON.stringify(truthSnapshot(before)) !== JSON.stringify(truthSnapshot(after))) {
    throw new Error("CREATIVE_DESIGN_REPAIR_BUSINESS_TRUTH_MUTATION_FORBIDDEN");
  }
}

function assertFontIdentityPreserved(before, after) {
  if (
    JSON.stringify(fontIdentitySnapshot(before)) !==
    JSON.stringify(fontIdentitySnapshot(after))
  ) {
    throw new Error("CREATIVE_DESIGN_REPAIR_FONT_IDENTITY_MUTATION_FORBIDDEN");
  }
}

function assertDocumentTopologyPreserved(before, after) {
  const beforeTopology = before.pages.map((page) => ({
    page_id: page.id,
    node_ids: page.nodes.map((node) => node.id),
  }));
  const afterTopology = after.pages.map((page) => ({
    page_id: page.id,
    node_ids: page.nodes.map((node) => node.id),
  }));
  if (JSON.stringify(beforeTopology) !== JSON.stringify(afterTopology)) {
    throw new Error("CREATIVE_DESIGN_REPAIR_TOPOLOGY_MUTATION_FORBIDDEN");
  }
}

function normalizeFrame(frame, page) {
  const width = Math.max(1, Math.min(number(frame.width, 1), number(page.width, 1)));
  const height = Math.max(1, Math.min(number(frame.height, 1), number(page.height, 1)));
  const x = Math.max(0, Math.min(number(frame.x, 0), number(page.width) - width));
  const y = Math.max(0, Math.min(number(frame.y, 0), number(page.height) - height));
  return { x, y, width, height };
}

function safeTypographyPatch(rawPatch = {}, nodeId = "unknown") {
  const patch = object(rawPatch);
  const unsafeKeys = Object.keys(patch).filter((key) => !SAFE_TYPOGRAPHY_KEYS.has(key));
  if (unsafeKeys.length) {
    throw new Error(
      `CREATIVE_DESIGN_REPAIR_TYPOGRAPHY_IDENTITY_MUTATION_FORBIDDEN:${nodeId}:${unsafeKeys.join(",")}`,
    );
  }
  return patch;
}

function mergeSafeTypography(node, rawPatch = {}) {
  const patch = safeTypographyPatch(rawPatch, node.id);
  return {
    ...node,
    typography: {
      ...object(node.typography),
      ...patch,
    },
  };
}

function assertOperationAllowed(document, page, node, operation) {
  const kind = text(operation.operation).toUpperCase();
  if (!text(operation.page_id)) {
    throw new Error(`CREATIVE_DESIGN_REPAIR_PAGE_ID_REQUIRED:${operation.node_id || "unknown"}`);
  }
  if (!text(operation.node_id)) {
    throw new Error("CREATIVE_DESIGN_REPAIR_NODE_ID_REQUIRED");
  }
  if (!page) {
    throw new Error(`CREATIVE_DESIGN_REPAIR_PAGE_NOT_FOUND:${operation.page_id}`);
  }
  if (!node) {
    throw new Error(`CREATIVE_DESIGN_REPAIR_NODE_NOT_FOUND:${operation.node_id}`);
  }
  if (node.locked === true) {
    throw new Error(`CREATIVE_DESIGN_REPAIR_LOCKED_NODE_FORBIDDEN:${node.id}`);
  }
  if (TRUTH_MUTATING_OPERATIONS.has(kind)) {
    throw new Error(`CREATIVE_DESIGN_REPAIR_TRUTH_MUTATION_OPERATION_FORBIDDEN:${kind}:${node.id}`);
  }
  if (kind === "SET_TYPOGRAPHY") {
    safeTypographyPatch(operation.typography, node.id);
  }
  if (kind === "SET_TABLE_GEOMETRY") {
    if (node.type !== "TABLE") {
      throw new Error(`CREATIVE_DESIGN_REPAIR_TABLE_OPERATION_TARGET_INVALID:${node.id}`);
    }
    if (Object.prototype.hasOwnProperty.call(operation, "rows")) {
      throw new Error(`CREATIVE_DESIGN_REPAIR_TABLE_ROWS_FORBIDDEN:${node.id}`);
    }
    if (operation.typography) safeTypographyPatch(operation.typography, node.id);
  }

  if (nodeIsDataBound(document, node) && TRUTH_MUTATING_OPERATIONS.has(kind)) {
    throw new Error(`CREATIVE_DESIGN_REPAIR_BOUND_TRUTH_MUTATION_FORBIDDEN:${node.id}`);
  }
}

function applyOperation(document, rawOperation) {
  const operation = object(rawOperation);
  const kind = text(operation.operation).toUpperCase();
  const page = pageFor(document, operation.page_id);
  const node = nodeFor(page, operation.node_id);
  assertOperationAllowed(document, page, node, operation);

  const index = page.nodes.findIndex((candidate) => candidate.id === node.id);
  let repaired = node;

  if (kind === "SET_FRAME") {
    repaired = {
      ...node,
      frame: normalizeFrame({ ...node.frame, ...object(operation.frame) }, page),
    };
  } else if (kind === "SET_TYPOGRAPHY") {
    repaired = mergeSafeTypography(node, operation.typography);
  } else if (kind === "SET_TABLE_GEOMETRY") {
    const typographyPatch = operation.typography
      ? safeTypographyPatch(operation.typography, node.id)
      : null;
    repaired = {
      ...node,
      frame: normalizeFrame({ ...node.frame, ...object(operation.frame) }, page),
      cell_padding_x:
        operation.cell_padding_x === undefined
          ? node.cell_padding_x
          : Math.max(0, number(operation.cell_padding_x)),
      cell_padding_y:
        operation.cell_padding_y === undefined
          ? node.cell_padding_y
          : Math.max(0, number(operation.cell_padding_y)),
      typography: typographyPatch
        ? {
            ...object(node.typography),
            ...typographyPatch,
          }
        : node.typography,
    };
  } else {
    throw new Error(`CREATIVE_DESIGN_REPAIR_OPERATION_UNSUPPORTED:${kind}`);
  }

  page.nodes[index] = repaired;
  return {
    operation: kind,
    page_id: page.id,
    node_id: node.id,
    reason: text(operation.reason) || null,
    source_issue_code: text(operation.source_issue_code) || null,
    business_truth_mutated: false,
    font_identity_mutated: false,
  };
}

export function applyCreativeDesignRepairPlan(rawDocument = {}, rawPlan = {}) {
  const source = validateCreativeDesignDocument(rawDocument);
  const plan = object(rawPlan);
  if (plan.contract !== REPAIR_PLAN_CONTRACT) {
    throw new Error("CREATIVE_DESIGN_REPAIR_PLAN_CONTRACT_INVALID");
  }
  if (
    text(plan.source_document_hash) &&
    text(plan.source_document_hash) !== source.document_hash
  ) {
    throw new Error("CREATIVE_DESIGN_REPAIR_PLAN_SOURCE_HASH_MISMATCH");
  }

  const operations = list(plan.operations);
  if (!operations.length) {
    throw new Error("CREATIVE_DESIGN_REPAIR_OPERATION_REQUIRED");
  }

  const working = clone(source);
  delete working.document_hash;
  const applied = operations.map((operation) => applyOperation(working, operation));
  working.revision = Number(source.revision || 1) + 1;
  working.metadata = {
    ...object(source.metadata),
    repair_contract: CONTRACT,
    repaired_from_document_hash: source.document_hash,
    repair_operation_count: applied.length,
    repair_history: [
      ...list(source.metadata?.repair_history),
      {
        source_document_hash: source.document_hash,
        operation_count: applied.length,
        issue_codes: [...new Set(applied.map((entry) => entry.source_issue_code).filter(Boolean))],
        mechanical_only: true,
        business_truth_mutated: false,
        font_identity_mutated: false,
      },
    ],
  };

  const repaired = validateCreativeDesignDocument(working);
  assertImmutableNodesPreserved(source, repaired);
  assertTruthPreserved(source, repaired);
  assertFontIdentityPreserved(source, repaired);
  assertDocumentTopologyPreserved(source, repaired);
  return {
    success: true,
    contract: CONTRACT,
    source_document_hash: source.document_hash,
    target_document_hash: repaired.document_hash,
    document: repaired,
    operations: applied,
    locked_nodes_preserved: true,
    governed_business_facts_mutated: false,
    font_identity_mutated: false,
    topology_mutated: false,
    mechanical_only: true,
    provider_called: false,
  };
}

function maximumTextHeight(page, node) {
  return Math.max(1, number(page.height) - Math.max(0, number(node.frame?.y)));
}

function textOverflowRepair(page, node, issue) {
  const typography = object(node.typography);
  const fontSize = Math.max(1, number(typography.font_size, 16));
  const lineHeight = Math.max(1, number(typography.line_height, 1.2));
  const contentLength = String(node.content ?? "").length;
  const estimatedCharacterWidth = Math.max(1, fontSize * 0.54 + number(typography.letter_spacing, 0));
  const maxCharacters = Math.max(1, Math.floor(number(node.frame.width) / estimatedCharacterWidth));
  const estimatedLines = Math.max(1, Math.ceil(contentLength / maxCharacters));
  const requiredHeight = estimatedLines * fontSize * lineHeight;
  const availableHeight = maximumTextHeight(page, node);

  if (requiredHeight <= availableHeight && requiredHeight > number(node.frame.height)) {
    return {
      operation: "SET_FRAME",
      page_id: page.id,
      node_id: node.id,
      frame: { height: Math.min(availableHeight, Math.ceil(requiredHeight)) },
      reason: "Expand text frame inside the existing page without changing copy.",
      source_issue_code: issue.code,
    };
  }

  const minimum = Math.max(
    1,
    number(typography.minimum_font_size, DEFAULT_MINIMUM_FONT_SIZE),
  );
  const reduced = Math.max(minimum, Math.floor(fontSize * 0.92 * 10) / 10);
  if (reduced < fontSize) {
    return {
      operation: "SET_TYPOGRAPHY",
      page_id: page.id,
      node_id: node.id,
      typography: { font_size: reduced },
      reason: "Reduce typography one bounded step while preserving copy and font identity.",
      source_issue_code: issue.code,
    };
  }
  return null;
}

function tableRepair(document, page, node, issue) {
  const layout = layoutCreativeDesignTables(document).tables.find((table) =>
    text(table.page_id) === text(page.id) && text(table.node_id) === text(node.id),
  );
  const availableHeight = Math.max(1, number(page.height) - number(node.frame?.y));
  if (layout && layout.required_height <= availableHeight && layout.required_height > number(node.frame?.height)) {
    return {
      operation: "SET_TABLE_GEOMETRY",
      page_id: page.id,
      node_id: node.id,
      frame: { height: Math.ceil(layout.required_height) },
      reason: "Expand the table frame to its deterministic row height without changing data.",
      source_issue_code: issue.code,
    };
  }

  const fontSize = number(node.typography?.font_size, 16);
  const minimum = Math.max(
    1,
    number(node.typography?.minimum_font_size, DEFAULT_MINIMUM_FONT_SIZE),
  );
  const reducedFontSize = Math.max(minimum, Math.floor(fontSize * 0.94 * 10) / 10);
  const paddingY = Math.max(0, number(node.cell_padding_y, 8));
  const reducedPadding = Math.max(2, Math.floor(paddingY * 0.9 * 10) / 10);
  if (reducedFontSize < fontSize || reducedPadding < paddingY) {
    return {
      operation: "SET_TABLE_GEOMETRY",
      page_id: page.id,
      node_id: node.id,
      typography: reducedFontSize < fontSize ? { font_size: reducedFontSize } : undefined,
      cell_padding_y: reducedPadding,
      reason: "Compact table typography/spacing one bounded step without changing rows or values.",
      source_issue_code: issue.code,
    };
  }
  return null;
}

function nodeOutsidePageRepair(page, node, issue) {
  const normalized = normalizeFrame(node.frame, page);
  if (JSON.stringify(normalized) === JSON.stringify(node.frame)) return null;
  return {
    operation: "SET_FRAME",
    page_id: page.id,
    node_id: node.id,
    frame: normalized,
    reason: "Clamp node geometry to the page bounds without changing its content.",
    source_issue_code: issue.code,
  };
}

const HUMAN_OR_AUTHORITY_REQUIRED = new Set([
  "EXACT_FONT_ASSET_MISSING",
  "QR_RENDER_EVIDENCE_MISSING",
  "BARCODE_RENDER_EVIDENCE_INVALID",
  "DATA_BINDING_EVIDENCE_MISSING",
  "TABLE_RENDER_EVIDENCE_MISSING",
]);

export function planCreativeDesignMechanicalRepairs(rawDocument = {}, report = null) {
  const document = validateCreativeDesignDocument(rawDocument);
  const quality = report || inspectCreativeDesignDocument(document);
  const operations = [];
  const blocked = [];
  const seen = new Set();

  for (const issue of list(quality.issues)) {
    if (issue.severity !== "ERROR") continue;
    const page = pageFor(document, issue.page_id, issue.node_id);
    const node = nodeFor(page, issue.node_id);
    if (!page || !node) {
      blocked.push({ ...issue, reason: "TARGET_NOT_FOUND" });
      continue;
    }
    if (node.locked === true) {
      blocked.push({ ...issue, reason: "LOCKED_NODE_REQUIRES_DIRECTOR_DECISION" });
      continue;
    }
    if (HUMAN_OR_AUTHORITY_REQUIRED.has(issue.code)) {
      blocked.push({ ...issue, reason: "GOVERNED_SOURCE_OR_DIRECTOR_AUTHORITY_REQUIRED" });
      continue;
    }

    let operation = null;
    if (issue.code === "NODE_OUTSIDE_PAGE") {
      operation = nodeOutsidePageRepair(page, node, issue);
    } else if (issue.code === "TEXT_OVERFLOW") {
      operation = textOverflowRepair(page, node, issue);
    } else if (["TABLE_OVERFLOW", "TABLE_CELL_TEXT_OVERFLOW"].includes(issue.code)) {
      operation = tableRepair(document, page, node, issue);
    }

    if (!operation) {
      blocked.push({ ...issue, reason: "NO_SAFE_MECHANICAL_REPAIR_AVAILABLE" });
      continue;
    }
    const identity = `${operation.operation}:${operation.page_id}:${operation.node_id}:${operation.source_issue_code}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    operations.push(operation);
  }

  return {
    contract: REPAIR_PLAN_CONTRACT,
    source_document_hash: document.document_hash,
    operations,
    blocked,
    automatic: true,
    bounded: true,
    mechanical_only: true,
    page_scoped: true,
    business_truth_mutation_allowed: false,
    font_identity_mutation_allowed: false,
    locked_node_mutation_allowed: false,
    provider_called: false,
  };
}

export function repairCreativeDesignUntilStable(rawDocument = {}, options = {}) {
  let document = validateCreativeDesignDocument(rawDocument);
  const maximumPasses = Math.max(
    1,
    Math.min(10, Math.floor(number(options.maximum_passes, DEFAULT_MAXIMUM_PASSES))),
  );
  const passes = [];

  for (let pass = 1; pass <= maximumPasses; pass += 1) {
    const before = inspectCreativeDesignDocument(document, object(options.render_options));
    if (!before.release_blocked) {
      return {
        success: true,
        contract: CONTRACT,
        status: "PASSED",
        document,
        document_hash: document.document_hash,
        passes,
        repair_pass_count: passes.length,
        maximum_passes: maximumPasses,
        provider_called: false,
      };
    }

    const plan = planCreativeDesignMechanicalRepairs(document, before);
    if (!plan.operations.length) {
      return {
        success: false,
        contract: CONTRACT,
        status: "BLOCKED_ON_DIRECTOR_OR_GOVERNED_SOURCE",
        document,
        document_hash: document.document_hash,
        quality: before,
        blocked: plan.blocked,
        passes,
        repair_pass_count: passes.length,
        maximum_passes: maximumPasses,
        provider_called: false,
      };
    }

    const applied = applyCreativeDesignRepairPlan(document, plan);
    const after = inspectCreativeDesignDocument(applied.document, object(options.render_options));
    passes.push({
      pass,
      source_document_hash: document.document_hash,
      target_document_hash: applied.document.document_hash,
      operations: applied.operations,
      before_error_count: before.error_count,
      after_error_count: after.error_count,
      blocked: plan.blocked,
      business_truth_mutated: false,
      font_identity_mutated: false,
    });
    document = applied.document;

    if (!after.release_blocked) {
      return {
        success: true,
        contract: CONTRACT,
        status: "PASSED_AFTER_REPAIR",
        document,
        document_hash: document.document_hash,
        quality: after,
        passes,
        repair_pass_count: passes.length,
        maximum_passes: maximumPasses,
        provider_called: false,
      };
    }
    if (after.document_hash === before.document_hash) break;
  }

  const quality = inspectCreativeDesignDocument(document, object(options.render_options));
  return {
    success: !quality.release_blocked,
    contract: CONTRACT,
    status: quality.release_blocked ? "REPAIR_BUDGET_EXHAUSTED" : "PASSED_AFTER_REPAIR",
    document,
    document_hash: document.document_hash,
    quality,
    passes,
    repair_pass_count: passes.length,
    maximum_passes: maximumPasses,
    provider_called: false,
  };
}

export const CreativeDesignRepairRuntime = Object.freeze({
  contract: CONTRACT,
  plan_contract: REPAIR_PLAN_CONTRACT,
  maximum_default_passes: DEFAULT_MAXIMUM_PASSES,
  safe_typography_keys: Object.freeze([...SAFE_TYPOGRAPHY_KEYS]),
  plan: planCreativeDesignMechanicalRepairs,
  apply: applyCreativeDesignRepairPlan,
  repairUntilStable: repairCreativeDesignUntilStable,
});

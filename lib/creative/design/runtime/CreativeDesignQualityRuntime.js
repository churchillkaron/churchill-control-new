import {
  validateCreativeDesignDocument,
} from "../contracts/CreativeDesignDocumentContract.js";
import {
  renderCreativeDesignDocumentToSvg,
} from "./CreativeDesignSvgRenderer.js";

const CONTRACT = "CREATIVE_DESIGN_QUALITY_V2";

function text(value) {
  return String(value ?? "").trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function nodeOutsidePage(node, page) {
  const frame = node.frame || {};
  return (
    number(frame.x) < 0 ||
    number(frame.y) < 0 ||
    number(frame.x) + number(frame.width) > page.width ||
    number(frame.y) + number(frame.height) > page.height
  );
}

function duplicateContentKeys(page) {
  const seen = new Map();
  const duplicates = [];
  for (const node of page.nodes) {
    if (node.type !== "TEXT") continue;
    const key = `${text(node.content)}::${text(node.typography?.font_asset_id)}::${node.frame?.x}::${node.frame?.y}`;
    if (seen.has(key)) duplicates.push([seen.get(key), node.id]);
    else seen.set(key, node.id);
  }
  return duplicates;
}

function bindingRequired(node, documentBindings) {
  return Object.keys(object(node.binding)).length > 0 ||
    Object.keys(object(documentBindings[node.id])).length > 0;
}

function evidenceForNode(svgRender, nodeId, type = null) {
  return svgRender.pages.flatMap((page) => list(page.evidence)).filter((entry) =>
    text(entry.node_id) === text(nodeId) && (!type || entry.type === type),
  );
}

export function inspectCreativeDesignDocument(rawDocument = {}, options = {}) {
  const document = validateCreativeDesignDocument(rawDocument);
  const svgRender = renderCreativeDesignDocumentToSvg(document, options);
  const issues = [];
  const documentBindings = object(document.data_bindings);
  const bindingEvidence = list(document.binding_evidence);

  for (const page of document.pages) {
    for (const node of page.nodes) {
      if (nodeOutsidePage(node, page)) {
        issues.push({
          severity: "ERROR",
          code: "NODE_OUTSIDE_PAGE",
          page_id: page.id,
          node_id: node.id,
        });
      }
      if (node.type === "TEXT" && !text(node.typography?.font_asset_id)) {
        issues.push({
          severity: "ERROR",
          code: "EXACT_FONT_ASSET_MISSING",
          page_id: page.id,
          node_id: node.id,
        });
      }
      if (node.type === "TABLE") {
        const cellEvidence = evidenceForNode(svgRender, node.id, "TABLE_CELL");
        if (!cellEvidence.length) {
          issues.push({
            severity: "ERROR",
            code: "TABLE_RENDER_EVIDENCE_MISSING",
            page_id: page.id,
            node_id: node.id,
          });
        }
        if (cellEvidence.some((entry) => entry.overflow === true)) {
          issues.push({
            severity: "ERROR",
            code: "TABLE_CELL_TEXT_OVERFLOW",
            page_id: page.id,
            node_id: node.id,
          });
        }
      }
      if (node.type === "QR") {
        const codeEvidence = evidenceForNode(svgRender, node.id, "QR");
        if (!codeEvidence.length) {
          issues.push({
            severity: "ERROR",
            code: "QR_RENDER_EVIDENCE_MISSING",
            page_id: page.id,
            node_id: node.id,
          });
        }
      }
      if (node.type === "BARCODE") {
        const codeEvidence = evidenceForNode(svgRender, node.id, "BARCODE");
        if (!codeEvidence.length || codeEvidence.some((entry) => entry.checksum_valid !== true)) {
          issues.push({
            severity: "ERROR",
            code: "BARCODE_RENDER_EVIDENCE_INVALID",
            page_id: page.id,
            node_id: node.id,
          });
        }
      }
      if (bindingRequired(node, documentBindings)) {
        const binding = bindingEvidence.find((entry) => text(entry.node_id) === text(node.id));
        if (!binding || !text(binding.source_id) || !text(binding.source_evidence_id)) {
          issues.push({
            severity: "ERROR",
            code: "DATA_BINDING_EVIDENCE_MISSING",
            page_id: page.id,
            node_id: node.id,
          });
        }
      }
    }

    for (const [firstNodeId, duplicateNodeId] of duplicateContentKeys(page)) {
      issues.push({
        severity: "WARNING",
        code: "POSSIBLE_DUPLICATE_TEXT_NODE",
        page_id: page.id,
        node_id: duplicateNodeId,
        related_node_id: firstNodeId,
      });
    }
  }

  for (const nodeId of svgRender.text_overflow_nodes || []) {
    issues.push({
      severity: "ERROR",
      code: "TEXT_OVERFLOW",
      node_id: nodeId,
    });
  }
  for (const nodeId of svgRender.table_overflow_nodes || []) {
    issues.push({
      severity: "ERROR",
      code: "TABLE_OVERFLOW",
      node_id: nodeId,
    });
  }

  const errorCount = issues.filter((issue) => issue.severity === "ERROR").length;
  const warningCount = issues.filter((issue) => issue.severity === "WARNING").length;

  return {
    success: errorCount === 0,
    contract: CONTRACT,
    document_hash: document.document_hash,
    status: errorCount ? "REPAIR_REQUIRED" : "PASSED",
    error_count: errorCount,
    warning_count: warningCount,
    issues,
    release_blocked: errorCount > 0,
    exact_text_required: true,
    exact_font_assets_required: true,
    table_render_evidence_required: true,
    machine_readable_code_evidence_required: true,
    governed_data_binding_evidence_required: true,
    provider_called: false,
    generative_text_pixels_used: false,
  };
}

export const CreativeDesignQualityRuntime = Object.freeze({
  contract: CONTRACT,
  inspect: inspectCreativeDesignDocument,
});

import {
  validateCreativeDesignDocument,
} from "../contracts/CreativeDesignDocumentContract.js";
import {
  renderCreativeDesignDocumentToSvg,
} from "./CreativeDesignSvgRenderer.js";

const CONTRACT = "CREATIVE_DESIGN_QUALITY_V1";

function text(value) {
  return String(value ?? "").trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

export function inspectCreativeDesignDocument(rawDocument = {}, options = {}) {
  const document = validateCreativeDesignDocument(rawDocument);
  const svgRender = renderCreativeDesignDocumentToSvg(document, options);
  const issues = [];

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

  for (const nodeId of svgRender.text_overflow_nodes) {
    issues.push({
      severity: "ERROR",
      code: "TEXT_OVERFLOW",
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
    provider_called: false,
    generative_text_pixels_used: false,
  };
}

export const CreativeDesignQualityRuntime = Object.freeze({
  contract: CONTRACT,
  inspect: inspectCreativeDesignDocument,
});

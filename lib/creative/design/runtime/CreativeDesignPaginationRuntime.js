import {
  validateCreativeDesignDocument,
} from "../contracts/CreativeDesignDocumentContract.js";
import {
  layoutCreativeDesignTables,
} from "./CreativeDesignTableLayoutRuntime.js";

const CONTRACT = "CREATIVE_DESIGN_PAGINATION_V1";

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

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function repeatOnContinuation(node = {}) {
  return Boolean(
    node.repeat_on_continuation === true ||
    node.layout?.repeat_on_continuation === true ||
    node.metadata?.repeat_on_continuation === true,
  );
}

function paginationConfig(node = {}) {
  return object(node.pagination || node.layout?.pagination || node.metadata?.pagination);
}

function headerRowCount(node = {}) {
  const configured = number(paginationConfig(node).header_row_count, 0);
  return Math.max(0, Math.floor(configured));
}

function tableLayout(layoutReport, pageId, nodeId) {
  return layoutReport.tables.find((table) =>
    text(table.page_id) === text(pageId) && text(table.node_id) === text(nodeId),
  ) || null;
}

function rowHeightMap(layout) {
  return new Map(
    list(layout?.rows).map((row) => [Number(row.row_index), number(row.frame?.height)]),
  );
}

function splitRows({ node, layout, availableHeight }) {
  const rows = list(node.rows);
  const headers = Math.min(headerRowCount(node), rows.length);
  const headerRows = rows.slice(0, headers);
  const bodyRows = rows.slice(headers);
  const heights = rowHeightMap(layout);
  const headerHeight = headerRows.reduce(
    (sum, _row, index) => sum + number(heights.get(index)),
    0,
  );

  if (headerHeight >= availableHeight && bodyRows.length) {
    throw new Error(`CREATIVE_DESIGN_PAGINATION_HEADER_TOO_TALL:${node.id}`);
  }

  const chunks = [];
  let current = [];
  let currentHeight = headerHeight;

  for (let bodyIndex = 0; bodyIndex < bodyRows.length; bodyIndex += 1) {
    const sourceIndex = headers + bodyIndex;
    const height = number(heights.get(sourceIndex));
    if (height <= 0) {
      throw new Error(`CREATIVE_DESIGN_PAGINATION_ROW_HEIGHT_INVALID:${node.id}:${sourceIndex}`);
    }
    if (headerHeight + height > availableHeight) {
      throw new Error(`CREATIVE_DESIGN_PAGINATION_ROW_TOO_TALL:${node.id}:${sourceIndex}`);
    }
    if (current.length && currentHeight + height > availableHeight) {
      chunks.push([...headerRows, ...current]);
      current = [];
      currentHeight = headerHeight;
    }
    current.push(bodyRows[bodyIndex]);
    currentHeight += height;
  }

  if (current.length || !bodyRows.length) {
    chunks.push([...headerRows, ...current]);
  }
  return {
    chunks,
    header_row_count: headers,
    original_row_count: rows.length,
  };
}

function rowsIdentity(rows = []) {
  return JSON.stringify(rows);
}

function assertRowsPreserved(originalRows, pages, tableRootId, headerCount) {
  const reconstructed = [];
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const table = pages[pageIndex].nodes.find((node) =>
      node.type === "TABLE" && text(node.metadata?.pagination_root_node_id) === tableRootId,
    );
    if (!table) continue;
    const rows = list(table.rows);
    reconstructed.push(...(pageIndex === 0 ? rows : rows.slice(headerCount)));
  }
  if (rowsIdentity(originalRows) !== rowsIdentity(reconstructed)) {
    throw new Error(`CREATIVE_DESIGN_PAGINATION_TRUTH_MISMATCH:${tableRootId}`);
  }
}

function duplicateBindingEvidence(bindingEvidence, sourceNodeId, targetNodeId, pageId) {
  return list(bindingEvidence)
    .filter((entry) => text(entry.node_id) === sourceNodeId)
    .map((entry) => ({
      ...clone(entry),
      node_id: targetNodeId,
      pagination_source_node_id: sourceNodeId,
      pagination_page_id: pageId,
    }));
}

function paginatePage(document, page, layoutReport) {
  const tables = page.nodes.filter((node) => node.type === "TABLE");
  const overflowing = tables.filter((node) => tableLayout(layoutReport, page.id, node.id)?.overflow === true);
  if (!overflowing.length) {
    return {
      pages: [clone(page)],
      evidence: [],
      binding_evidence: [],
    };
  }
  if (overflowing.length > 1 || tables.length > 1) {
    throw new Error(`CREATIVE_DESIGN_PAGINATION_MULTIPLE_TABLES_REQUIRE_DIRECTOR_REFLOW:${page.id}`);
  }

  const table = overflowing[0];
  const layout = tableLayout(layoutReport, page.id, table.id);
  const availableHeight = Math.max(1, number(table.frame?.height));
  const split = splitRows({ node: table, layout, availableHeight });
  if (split.chunks.length <= 1) {
    return {
      pages: [clone(page)],
      evidence: [],
      binding_evidence: [],
    };
  }

  const continuationNodes = page.nodes.filter((node) =>
    node.id !== table.id && repeatOnContinuation(node),
  );
  const outputPages = [];
  const extraBindingEvidence = [];
  const evidence = [];

  for (let index = 0; index < split.chunks.length; index += 1) {
    const continuation = index > 0;
    const pageId = continuation ? `${page.id}-continuation-${index + 1}` : page.id;
    const tableId = continuation ? `${table.id}-continuation-${index + 1}` : table.id;
    const paginatedTable = {
      ...clone(table),
      id: tableId,
      rows: clone(split.chunks[index]),
      metadata: {
        ...object(table.metadata),
        pagination_contract: CONTRACT,
        pagination_root_node_id: table.id,
        pagination_page_index: index + 1,
        pagination_page_count: split.chunks.length,
        pagination_header_row_count: split.header_row_count,
        pagination_truth_preserved: true,
      },
    };

    const nodes = continuation
      ? [
          ...continuationNodes.map((node) => ({
            ...clone(node),
            id: `${node.id}-continuation-${index + 1}`,
            metadata: {
              ...object(node.metadata),
              repeated_from_node_id: node.id,
              pagination_page_index: index + 1,
            },
          })),
          paginatedTable,
        ]
      : page.nodes.map((node) => node.id === table.id ? paginatedTable : clone(node));

    outputPages.push({
      ...clone(page),
      id: pageId,
      nodes,
      metadata: {
        ...object(page.metadata),
        pagination_contract: CONTRACT,
        paginated_from_page_id: page.id,
        pagination_page_index: index + 1,
        pagination_page_count: split.chunks.length,
      },
    });

    if (continuation) {
      extraBindingEvidence.push(
        ...duplicateBindingEvidence(document.binding_evidence, table.id, tableId, pageId),
      );
    }
    evidence.push({
      source_page_id: page.id,
      output_page_id: pageId,
      source_table_node_id: table.id,
      output_table_node_id: tableId,
      page_index: index + 1,
      page_count: split.chunks.length,
      row_count: split.chunks[index].length,
      header_row_count: split.header_row_count,
    });
  }

  assertRowsPreserved(
    table.rows,
    outputPages,
    table.id,
    split.header_row_count,
  );

  return {
    pages: outputPages,
    evidence,
    binding_evidence: extraBindingEvidence,
  };
}

export function paginateCreativeDesignDocument(rawDocument = {}) {
  const document = validateCreativeDesignDocument(rawDocument);
  const layoutReport = layoutCreativeDesignTables(document);
  const pages = [];
  const evidence = [];
  const extraBindingEvidence = [];

  for (const page of document.pages) {
    const paginated = paginatePage(document, page, layoutReport);
    pages.push(...paginated.pages);
    evidence.push(...paginated.evidence);
    extraBindingEvidence.push(...paginated.binding_evidence);
  }

  const output = {
    ...document,
    document_hash: undefined,
    revision: Number(document.revision || 1) + (evidence.length ? 1 : 0),
    pages,
    binding_evidence: [
      ...list(document.binding_evidence).map(clone),
      ...extraBindingEvidence,
    ],
    metadata: {
      ...object(document.metadata),
      pagination_contract: CONTRACT,
      paginated_from_document_hash: document.document_hash,
      pagination_applied: evidence.length > 0,
      pagination_truth_preserved: true,
      pagination_evidence: evidence,
    },
  };
  const validated = validateCreativeDesignDocument(output);
  const afterLayout = layoutCreativeDesignTables(validated);
  if (!afterLayout.success) {
    throw new Error(
      `CREATIVE_DESIGN_PAGINATION_OVERFLOW_REMAINS:${afterLayout.overflow_table_nodes.join(",")}`,
    );
  }

  return {
    success: true,
    contract: CONTRACT,
    source_document_hash: document.document_hash,
    target_document_hash: validated.document_hash,
    document: validated,
    page_count_before: document.pages.length,
    page_count_after: validated.pages.length,
    pagination_applied: evidence.length > 0,
    evidence,
    business_truth_mutated: false,
    row_order_preserved: true,
    binding_evidence_preserved: true,
    deterministic: true,
    provider_called: false,
  };
}

export const CreativeDesignPaginationRuntime = Object.freeze({
  contract: CONTRACT,
  paginate: paginateCreativeDesignDocument,
});

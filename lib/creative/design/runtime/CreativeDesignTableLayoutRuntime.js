import {
  validateCreativeDesignDocument,
} from "../contracts/CreativeDesignDocumentContract.js";

const CONTRACT = "CREATIVE_DESIGN_TABLE_LAYOUT_V1";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizedColumns(node = {}) {
  const columns = list(node.columns);
  if (!columns.length) throw new Error(`CREATIVE_DESIGN_TABLE_COLUMNS_REQUIRED:${node.id}`);
  const total = columns.reduce((sum, column) => sum + Math.max(0, number(column.width, 0)), 0);
  if (total <= 0) {
    const equal = 1 / columns.length;
    return columns.map((column, index) => ({
      ...column,
      id: text(column.id) || `column-${index + 1}`,
      width_ratio: equal,
    }));
  }
  return columns.map((column, index) => ({
    ...column,
    id: text(column.id) || `column-${index + 1}`,
    width_ratio: Math.max(0, number(column.width, 0)) / total,
  }));
}

function rowHeight(node, row) {
  const configured = number(row.height, null);
  if (configured && configured > 0) return configured;
  const typography = object(node.typography);
  const fontSize = Math.max(1, number(typography.font_size, 16));
  const lineHeight = Math.max(1, number(typography.line_height, 1.3));
  const paddingY = Math.max(0, number(node.cell_padding_y, 8));
  return fontSize * lineHeight + paddingY * 2;
}

function layoutTableNode(node) {
  const frame = object(node.frame);
  const columns = normalizedColumns(node);
  const rows = list(node.rows);
  if (!rows.length) throw new Error(`CREATIVE_DESIGN_TABLE_ROWS_REQUIRED:${node.id}`);

  let y = number(frame.y);
  const cells = [];
  const rowFrames = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = object(rows[rowIndex]);
    const height = rowHeight(node, row);
    let x = number(frame.x);
    const rowFrame = {
      x,
      y,
      width: number(frame.width),
      height,
    };
    rowFrames.push({ row_index: rowIndex, frame: rowFrame });

    const values = list(row.cells);
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      const column = columns[columnIndex];
      const width = number(frame.width) * column.width_ratio;
      const cellValue = values[columnIndex];
      const cell = typeof cellValue === "object" && cellValue !== null
        ? cellValue
        : { content: cellValue };
      cells.push({
        id: `${node.id}:r${rowIndex}:c${columnIndex}`,
        row_index: rowIndex,
        column_index: columnIndex,
        column_id: column.id,
        content: String(cell.content ?? ""),
        frame: { x, y, width, height },
        align: text(cell.align || column.align) || "left",
        typography: {
          ...object(node.typography),
          ...object(column.typography),
          ...object(cell.typography),
        },
        style: {
          ...object(node.cell_style),
          ...object(row.style),
          ...object(column.style),
          ...object(cell.style),
        },
      });
      x += width;
    }
    y += height;
  }

  const requiredHeight = y - number(frame.y);
  return {
    node_id: node.id,
    frame: { ...frame, height: requiredHeight },
    columns,
    rows: rowFrames,
    cells,
    overflow: requiredHeight > number(frame.height),
    required_height: requiredHeight,
    available_height: number(frame.height),
  };
}

export function layoutCreativeDesignTables(rawDocument = {}) {
  const document = validateCreativeDesignDocument(rawDocument);
  const tables = [];
  for (const page of document.pages) {
    for (const node of page.nodes) {
      if (node.type !== "TABLE") continue;
      tables.push({
        page_id: page.id,
        ...layoutTableNode(node),
      });
    }
  }

  return {
    success: tables.every((table) => !table.overflow),
    contract: CONTRACT,
    document_hash: document.document_hash,
    tables,
    overflow_table_nodes: tables.filter((table) => table.overflow).map((table) => table.node_id),
    deterministic: true,
    provider_called: false,
  };
}

export const CreativeDesignTableLayoutRuntime = Object.freeze({
  contract: CONTRACT,
  layout: layoutCreativeDesignTables,
});

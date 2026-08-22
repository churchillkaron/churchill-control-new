import {
  validateCreativeDesignDocument,
} from "../contracts/CreativeDesignDocumentContract.js";
import {
  wrapCreativeDesignText,
} from "./CreativeDesignTextLayoutRuntime.js";

const CONTRACT = "CREATIVE_DESIGN_TABLE_LAYOUT_V2";

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

function normalizedCell(row, column, columnIndex) {
  const values = list(row.cells);
  const cellValue = values[columnIndex];
  const cell = typeof cellValue === "object" && cellValue !== null
    ? cellValue
    : { content: cellValue };
  return {
    content: String(cell.content ?? ""),
    align: text(cell.align || column.align) || "left",
    typography: {
      ...object(column.typography),
      ...object(cell.typography),
    },
    style: {
      ...object(column.style),
      ...object(cell.style),
    },
  };
}

function rowHeight(node, row, columns, frameWidth) {
  const configured = number(row.height, null);
  if (configured && configured > 0) return configured;

  const baseTypography = object(node.typography);
  const baseStyle = object(node.cell_style);
  const basePaddingY = Math.max(0, number(node.cell_padding_y, 8));
  const basePaddingX = Math.max(0, number(node.cell_padding_x, 8));
  let required = 1;

  for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
    const column = columns[columnIndex];
    const cell = normalizedCell(row, column, columnIndex);
    const typography = {
      ...baseTypography,
      ...cell.typography,
    };
    const style = {
      ...baseStyle,
      ...object(row.style),
      ...cell.style,
    };
    const paddingX = Math.max(0, number(style.padding_x, basePaddingX));
    const paddingY = Math.max(0, number(style.padding_y, basePaddingY));
    const width = Math.max(1, frameWidth * column.width_ratio - paddingX * 2);
    const layout = wrapCreativeDesignText(
      cell.content,
      { width, height: Number.MAX_SAFE_INTEGER },
      typography,
    );
    required = Math.max(required, layout.required_height + paddingY * 2);
  }

  return required;
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
    const height = rowHeight(node, row, columns, number(frame.width));
    let x = number(frame.x);
    const rowFrame = {
      x,
      y,
      width: number(frame.width),
      height,
    };
    rowFrames.push({ row_index: rowIndex, frame: rowFrame });

    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      const column = columns[columnIndex];
      const width = number(frame.width) * column.width_ratio;
      const cell = normalizedCell(row, column, columnIndex);
      cells.push({
        id: `${node.id}:r${rowIndex}:c${columnIndex}`,
        row_index: rowIndex,
        column_index: columnIndex,
        column_id: column.id,
        content: cell.content,
        frame: { x, y, width, height },
        align: cell.align,
        typography: {
          ...object(node.typography),
          ...cell.typography,
        },
        style: {
          ...object(node.cell_style),
          ...object(row.style),
          ...cell.style,
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
    content_aware_row_sizing: true,
    unicode_segmented: true,
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
    content_aware_row_sizing: true,
    unicode_segmented: true,
  };
}

export const CreativeDesignTableLayoutRuntime = Object.freeze({
  contract: CONTRACT,
  layout: layoutCreativeDesignTables,
});

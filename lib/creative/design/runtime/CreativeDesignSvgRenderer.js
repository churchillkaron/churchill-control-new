import { validateCreativeDesignDocument } from "../contracts/CreativeDesignDocumentContract.js";
import { layoutCreativeDesignTables } from "./CreativeDesignTableLayoutRuntime.js";
import {
  wrapCreativeDesignText,
} from "./CreativeDesignTextLayoutRuntime.js";
import {
  renderBarcodeNodeToSvg,
  renderQrNodeToSvg,
} from "./CreativeDesignCodeRuntime.js";

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function textAnchor(value) {
  if (value === "center") return "middle";
  if (value === "right") return "end";
  return "start";
}

function fontFamilyFromTypography(typography = {}, fontBindings) {
  const fontAssetId = typography.font_asset_id;
  const binding = fontBindings?.get?.(fontAssetId);
  return binding?.css_family || typography.font_family || fontAssetId;
}

function fontFamily(node, fontBindings) {
  return fontFamilyFromTypography(node.typography || {}, fontBindings);
}

function measuredLayoutFor(layouts, id) {
  if (!layouts || !id) return null;
  if (typeof layouts.get === "function") return layouts.get(id) || null;
  return object(layouts)[id] || null;
}

function evidenceForLayout(layout = {}) {
  return {
    actual_font_measurement: layout.actual_font_measurement === true,
    shaping_engine: layout.shaping_engine || null,
    measurement_source: layout.measurement_source || null,
    line_widths: Array.isArray(layout.line_widths) ? layout.line_widths : [],
    balance_score: Number.isFinite(Number(layout.balance_score))
      ? Number(layout.balance_score)
      : null,
    widow_orphan_risk: layout.widow_orphan_risk === true,
  };
}

function renderText(node, fontBindings, evidence, textLayouts) {
  const frame = node.frame;
  const typography = node.typography || {};
  const align = typography.align || "left";
  const x = align === "center"
    ? frame.x + frame.width / 2
    : align === "right"
      ? frame.x + frame.width
      : frame.x;
  const fill = node.fill || typography.color || "#000000";
  const family = escapeXml(fontFamily(node, fontBindings));
  const fontSize = number(typography.font_size, 16);
  const measured = measuredLayoutFor(textLayouts, node.id);
  const layout = measured || wrapCreativeDesignText(node.content, frame, typography);
  evidence.push({
    node_id: node.id,
    type: "TEXT",
    line_count: layout.line_count,
    rendered_line_count: layout.lines.length,
    max_lines: layout.max_lines,
    overflow: layout.overflow,
    content_preserved_on_overflow: layout.content_preserved_on_overflow,
    font_asset_id: typography.font_asset_id,
    font_family: fontFamily(node, fontBindings),
    estimated_text_measurement: layout.estimated !== false,
    unicode_segmented: layout.unicode_segmented,
    locale: layout.locale,
    ...evidenceForLayout(layout),
  });

  const tspans = layout.lines.map((line, index) => {
    const y = frame.y + fontSize + index * layout.line_height;
    return `<tspan x="${x}" y="${y}">${escapeXml(line)}</tspan>`;
  }).join("");

  return `<text data-node-id="${escapeXml(node.id)}" x="${x}" y="${frame.y + fontSize}" font-family="${family}" font-size="${fontSize}" font-weight="${escapeXml(typography.font_weight ?? 400)}" letter-spacing="${number(typography.letter_spacing, 0)}" text-anchor="${textAnchor(align)}" fill="${escapeXml(fill)}" opacity="${number(node.opacity, 1)}">${tspans}</text>`;
}

function renderShape(node) {
  const frame = node.frame;
  return `<rect data-node-id="${escapeXml(node.id)}" x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" rx="${number(node.radius, 0)}" fill="${escapeXml(node.fill || "none")}" stroke="${escapeXml(node.stroke || "none")}" stroke-width="${number(node.stroke_width, 0)}" opacity="${number(node.opacity, 1)}" />`;
}

function renderImage(node, assetBindings, evidence) {
  const frame = node.frame;
  const assetId = String(node.asset_id || "").trim();
  const binding = assetId ? assetBindings?.get?.(assetId) : null;
  const href = binding?.data_url || node.asset_reference || node.asset_url || "";
  const exactBindingRequired = Boolean(assetId);
  const exactBindingPresent = Boolean(binding?.data_url);

  evidence.push({
    node_id: node.id,
    type: node.type,
    asset_id: assetId || null,
    exact_asset_binding_required: exactBindingRequired,
    exact_asset_binding_present: exactBindingPresent,
    checksum_sha256: binding?.checksum_sha256 || null,
    canonical_checksum_sha256: binding?.canonical_checksum_sha256 || null,
    checksum_verified: binding?.checksum_verified ?? null,
    remote_reference_used: !exactBindingPresent,
  });

  return `<image data-node-id="${escapeXml(node.id)}" href="${escapeXml(href)}" x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" preserveAspectRatio="${node.fit === "contain" ? "xMidYMid meet" : "xMidYMid slice"}" opacity="${number(node.opacity, 1)}" />`;
}

function renderVector(node, assetBindings, evidence) {
  return renderImage(node, assetBindings, evidence);
}

function tableLayoutFor(tableLayouts, pageId, nodeId) {
  return tableLayouts.find((table) =>
    table.page_id === pageId && table.node_id === nodeId,
  ) || null;
}

function renderTable(
  node,
  pageId,
  tableLayouts,
  fontBindings,
  evidence,
  textLayouts,
) {
  const layout = tableLayoutFor(tableLayouts, pageId, node.id);
  if (!layout) throw new Error(`CREATIVE_DESIGN_TABLE_LAYOUT_REQUIRED:${node.id}`);
  const parts = [];
  const outerFill = node.background || "none";
  const outerStroke = node.stroke || "none";
  parts.push(`<rect x="${node.frame.x}" y="${node.frame.y}" width="${node.frame.width}" height="${layout.required_height}" fill="${escapeXml(outerFill)}" stroke="${escapeXml(outerStroke)}" stroke-width="${number(node.stroke_width, 0)}"/>`);

  for (const cell of layout.cells) {
    const style = cell.style || {};
    const typography = cell.typography || {};
    const paddingX = Math.max(0, number(style.padding_x ?? node.cell_padding_x, 8));
    const paddingY = Math.max(0, number(style.padding_y ?? node.cell_padding_y, 8));
    const innerFrame = {
      x: cell.frame.x + paddingX,
      y: cell.frame.y + paddingY,
      width: Math.max(1, cell.frame.width - paddingX * 2),
      height: Math.max(1, cell.frame.height - paddingY * 2),
    };
    const fill = style.background || style.fill || "none";
    const stroke = style.stroke || node.grid_color || "none";
    const strokeWidth = number(style.stroke_width ?? node.grid_width, 0);
    parts.push(`<rect x="${cell.frame.x}" y="${cell.frame.y}" width="${cell.frame.width}" height="${cell.frame.height}" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}"/>`);

    const align = cell.align || typography.align || "left";
    const x = align === "center"
      ? innerFrame.x + innerFrame.width / 2
      : align === "right"
        ? innerFrame.x + innerFrame.width
        : innerFrame.x;
    const fontSize = number(typography.font_size, 16);
    const measured = measuredLayoutFor(textLayouts, cell.id);
    const layoutText = measured || wrapCreativeDesignText(
      cell.content,
      innerFrame,
      typography,
    );
    const family = escapeXml(fontFamilyFromTypography(typography, fontBindings));
    const textFill = escapeXml(typography.color || style.color || "#000000");
    const tspans = layoutText.lines.map((line, index) => {
      const y = innerFrame.y + fontSize + index * layoutText.line_height;
      return `<tspan x="${x}" y="${y}">${escapeXml(line)}</tspan>`;
    }).join("");
    parts.push(`<text data-cell-id="${escapeXml(cell.id)}" x="${x}" y="${innerFrame.y + fontSize}" font-family="${family}" font-size="${fontSize}" font-weight="${escapeXml(typography.font_weight ?? 400)}" text-anchor="${textAnchor(align)}" fill="${textFill}">${tspans}</text>`);
    evidence.push({
      node_id: node.id,
      cell_id: cell.id,
      type: "TABLE_CELL",
      overflow: layoutText.overflow,
      content_preserved_on_overflow: layoutText.content_preserved_on_overflow,
      font_asset_id: typography.font_asset_id || null,
      font_family: fontFamilyFromTypography(typography, fontBindings) || null,
      line_count: layoutText.line_count,
      rendered_line_count: layoutText.lines.length,
      estimated_text_measurement: layoutText.estimated !== false,
      unicode_segmented: layoutText.unicode_segmented,
      locale: layoutText.locale,
      ...evidenceForLayout(layoutText),
    });
  }

  evidence.push({
    node_id: node.id,
    type: "TABLE",
    row_count: layout.rows.length,
    column_count: layout.columns.length,
    cell_count: layout.cells.length,
    overflow: layout.overflow,
    required_height: layout.required_height,
    available_height: layout.available_height,
    content_aware_row_sizing: layout.content_aware_row_sizing === true,
    unicode_segmented: layout.unicode_segmented === true,
    measured_typography_used: layout.measured_typography_used === true,
  });
  return `<g data-node-id="${escapeXml(node.id)}" data-node-type="TABLE">${parts.join("")}</g>`;
}

function renderNode(
  node,
  pageId,
  tableLayouts,
  fontBindings,
  assetBindings,
  evidence,
  textLayouts,
) {
  if (node.visible === false) return "";
  if (node.type === "TEXT") {
    return renderText(node, fontBindings, evidence, textLayouts);
  }
  if (node.type === "SHAPE") return renderShape(node);
  if (node.type === "IMAGE") return renderImage(node, assetBindings, evidence);
  if (node.type === "VECTOR") return renderVector(node, assetBindings, evidence);
  if (node.type === "TABLE") {
    return renderTable(
      node,
      pageId,
      tableLayouts,
      fontBindings,
      evidence,
      textLayouts,
    );
  }
  if (node.type === "QR") {
    const rendered = renderQrNodeToSvg(node);
    evidence.push(rendered.evidence);
    return rendered.svg;
  }
  if (node.type === "BARCODE") {
    const rendered = renderBarcodeNodeToSvg(node);
    evidence.push(rendered.evidence);
    return rendered.svg;
  }
  return "";
}

function renderFontFaces(fontBindings) {
  if (!fontBindings?.size) return "";
  const rules = [...fontBindings.values()].map((binding) =>
    `@font-face{font-family:'${String(binding.css_family).replaceAll("'", "\\'")}';src:url('${binding.data_url}');}`,
  ).join("\n");
  return `<defs><style><![CDATA[${rules}]]></style></defs>`;
}

function renderPage(
  page,
  documentHash,
  fontBindings,
  assetBindings,
  tableLayouts,
  textLayouts,
) {
  const background = page.background
    ? `<rect width="100%" height="100%" fill="${escapeXml(page.background)}" />`
    : "";
  const evidence = [];
  const nodes = page.nodes.map((node) =>
    renderNode(
      node,
      page.id,
      tableLayouts,
      fontBindings,
      assetBindings,
      evidence,
      textLayouts,
    )).join("\n");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${page.width}" height="${page.height}" viewBox="0 0 ${page.width} ${page.height}" data-creative-design-document-hash="${escapeXml(documentHash)}" data-page-id="${escapeXml(page.id)}">\n${renderFontFaces(fontBindings)}\n${background}\n${nodes}\n</svg>`;
  return { svg, evidence };
}

export function renderCreativeDesignDocumentToSvg(rawDocument = {}, options = {}) {
  const document = validateCreativeDesignDocument(rawDocument);
  const fontBindings = options.font_bindings || options.fontBindings || new Map();
  const assetBindings = options.asset_bindings || options.assetBindings || new Map();
  const textLayouts = options.text_layouts || options.textLayouts || null;
  const requireMeasuredTypography = options.require_measured_typography === true ||
    options.requireMeasuredTypography === true;
  const tableLayout = layoutCreativeDesignTables(document, {
    text_layouts: textLayouts,
  });
  const pages = document.pages.map((page) => {
    const rendered = renderPage(
      page,
      document.document_hash,
      fontBindings,
      assetBindings,
      tableLayout.tables,
      textLayouts,
    );
    return {
      page_id: page.id,
      width: page.width,
      height: page.height,
      unit: page.unit,
      svg: rendered.svg,
      evidence: rendered.evidence,
    };
  });
  const textOverflowNodes = pages.flatMap((page) =>
    page.evidence
      .filter((entry) => ["TEXT", "TABLE_CELL"].includes(entry.type) && entry.overflow)
      .map((entry) => entry.node_id));
  const tableOverflowNodes = tableLayout.overflow_table_nodes;
  const missingExactAssetNodes = pages.flatMap((page) =>
    page.evidence
      .filter((entry) =>
        ["IMAGE", "VECTOR"].includes(entry.type) &&
        entry.exact_asset_binding_required &&
        !entry.exact_asset_binding_present,
      )
      .map((entry) => entry.node_id));
  const unmeasuredTypographyNodes = pages.flatMap((page) =>
    page.evidence
      .filter((entry) =>
        ["TEXT", "TABLE_CELL"].includes(entry.type) &&
        entry.actual_font_measurement !== true,
      )
      .map((entry) => entry.cell_id || entry.node_id));
  return {
    success:
      textOverflowNodes.length === 0 &&
      tableOverflowNodes.length === 0 &&
      missingExactAssetNodes.length === 0 &&
      (!requireMeasuredTypography || unmeasuredTypographyNodes.length === 0),
    contract: "CREATIVE_DESIGN_SVG_RENDER_V6",
    document_hash: document.document_hash,
    pages,
    text_overflow_nodes: [...new Set(textOverflowNodes)],
    table_overflow_nodes: tableOverflowNodes,
    missing_exact_asset_nodes: [...new Set(missingExactAssetNodes)],
    unmeasured_typography_nodes: [...new Set(unmeasuredTypographyNodes)],
    measured_typography_required: requireMeasuredTypography,
    actual_font_measurement_available: unmeasuredTypographyNodes.length === 0,
    deterministic: true,
    provider_called: false,
    generative_text_pixels_used: false,
    exact_font_assets_embedded: Boolean(fontBindings?.size),
    exact_visual_assets_embedded: missingExactAssetNodes.length === 0,
    codes_rendered_deterministically: true,
    content_preserved_on_overflow: true,
    unicode_segmented_text_layout: true,
  };
}

export const CreativeDesignSvgRenderer = Object.freeze({
  contract: "CREATIVE_DESIGN_SVG_RENDER_V6",
  render: renderCreativeDesignDocumentToSvg,
});
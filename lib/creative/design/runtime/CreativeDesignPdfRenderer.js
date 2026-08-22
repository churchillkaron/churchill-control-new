import { jsPDF } from "jspdf";

import {
  validateCreativeDesignDocument,
} from "../contracts/CreativeDesignDocumentContract.js";
import {
  createEan13Bits,
  createQrMatrix,
} from "./CreativeDesignCodeRuntime.js";
import {
  layoutCreativeDesignTables,
} from "./CreativeDesignTableLayoutRuntime.js";
import {
  wrapCreativeDesignText,
} from "./CreativeDesignTextLayoutRuntime.js";
import {
  convertCreativeDesignUnits,
  creativeDesignPagePoints,
} from "./CreativeDesignUnitRuntime.js";
import {
  validateCreativeDesignPrintProfile,
} from "./CreativeDesignPrintProfileRuntime.js";

const CONTRACT = "CREATIVE_DESIGN_PDF_RENDER_V3";
const RASTER_MIME_TO_FORMAT = Object.freeze({
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/jpg": "JPEG",
});
const PDF_FONT_MIME = new Set([
  "font/ttf",
  "application/x-font-ttf",
]);
const EDGE_EPSILON = 1e-6;

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

function orientation(width, height) {
  return width > height ? "landscape" : "portrait";
}

function positiveBleed(profile = {}) {
  const bleed = profile.bleed_points || {};
  return [bleed.top, bleed.right, bleed.bottom, bleed.left]
    .some((value) => Number(value || 0) > 0);
}

function bindingFor(bindings, id) {
  if (!bindings || !id) return null;
  if (typeof bindings.get === "function") return bindings.get(id) || null;
  return object(bindings)[id] || null;
}

function parseColor(value, fallback = null) {
  const source = text(value).toLowerCase();
  if (!source || source === "none" || source === "transparent") return fallback;
  const names = {
    black: [0, 0, 0],
    white: [255, 255, 255],
    red: [255, 0, 0],
    green: [0, 128, 0],
    blue: [0, 0, 255],
  };
  if (names[source]) return names[source];
  const shortHex = source.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) {
    return shortHex[1].split("").map((digit) => parseInt(`${digit}${digit}`, 16));
  }
  const hex = source.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    return [
      parseInt(hex[1].slice(0, 2), 16),
      parseInt(hex[1].slice(2, 4), 16),
      parseInt(hex[1].slice(4, 6), 16),
    ];
  }
  const rgb = source.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (rgb) {
    const channels = rgb.slice(1).map((channel) => Number(channel));
    if (channels.every((channel) => channel >= 0 && channel <= 255)) return channels;
  }
  throw new Error(`CREATIVE_DESIGN_PDF_COLOR_UNSUPPORTED:${value}`);
}

function setFillColor(pdf, value) {
  const color = parseColor(value, null);
  if (!color) return false;
  pdf.setFillColor(...color);
  return true;
}

function setDrawColor(pdf, value) {
  const color = parseColor(value, null);
  if (!color) return false;
  pdf.setDrawColor(...color);
  return true;
}

function setTextColor(pdf, value) {
  const color = parseColor(value || "#000000", [0, 0, 0]);
  pdf.setTextColor(...color);
}

function cropMarkForPage(printProfile, pageId) {
  return printProfile.crop_marks.find((entry) => entry.page_id === pageId) || null;
}

function pageGeometry(printProfile, sourcePage) {
  const profile = printProfile.pages.find((entry) => entry.page_id === sourcePage.id);
  if (!profile) throw new Error(`CREATIVE_DESIGN_PDF_PRINT_PAGE_PROFILE_REQUIRED:${sourcePage.id}`);
  const trim = creativeDesignPagePoints(sourcePage);
  const crop = cropMarkForPage(printProfile, sourcePage.id);
  const markMargin = crop?.requested
    ? Math.max(0, Number(crop.length_points || 0) + Number(crop.offset_points || 0))
    : 0;
  const bleed = profile.bleed_points || { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    profile,
    crop,
    trim,
    bleed,
    mark_margin: markMargin,
    media_width:
      trim.width + Number(bleed.left || 0) + Number(bleed.right || 0) + markMargin * 2,
    media_height:
      trim.height + Number(bleed.top || 0) + Number(bleed.bottom || 0) + markMargin * 2,
    trim_x: markMargin + Number(bleed.left || 0),
    trim_y: markMargin + Number(bleed.top || 0),
  };
}

function drawCropMarks(pdf, geometry) {
  const crop = geometry.crop;
  if (!crop?.requested) return;
  const length = Number(crop.length_points || 0);
  const offset = Number(crop.offset_points || 0);
  const left = geometry.trim_x;
  const top = geometry.trim_y;
  const right = left + geometry.trim.width;
  const bottom = top + geometry.trim.height;

  pdf.setLineWidth(0.25);
  pdf.setDrawColor(0, 0, 0);
  pdf.line(left - offset - length, top, left - offset, top);
  pdf.line(left, top - offset - length, left, top - offset);
  pdf.line(right + offset, top, right + offset + length, top);
  pdf.line(right, top - offset - length, right, top - offset);
  pdf.line(left - offset - length, bottom, left - offset, bottom);
  pdf.line(left, bottom + offset, left, bottom + offset + length);
  pdf.line(right + offset, bottom, right + offset + length, bottom);
  pdf.line(right, bottom + offset, right, bottom + offset + length);
}

function pageScale(page) {
  return convertCreativeDesignUnits(1, page.unit || "px", "pt");
}

function pointFrame(page, geometry, frame = {}) {
  const scale = pageScale(page);
  return {
    x: geometry.trim_x + number(frame.x) * scale,
    y: geometry.trim_y + number(frame.y) * scale,
    width: number(frame.width) * scale,
    height: number(frame.height) * scale,
  };
}

function nodeExtendsToBleed(node) {
  return node.print?.bleed_capable === true && node.print?.extend_to_bleed === true;
}

function frameTouchesEdge(frame, page, edge) {
  if (edge === "left") return number(frame.x) <= EDGE_EPSILON;
  if (edge === "top") return number(frame.y) <= EDGE_EPSILON;
  if (edge === "right") {
    return number(frame.x) + number(frame.width) >= number(page.width) - EDGE_EPSILON;
  }
  return number(frame.y) + number(frame.height) >= number(page.height) - EDGE_EPSILON;
}

function bleedFrame(page, geometry, node) {
  const frame = pointFrame(page, geometry, node.frame);
  if (!nodeExtendsToBleed(node)) return frame;
  const right = frame.x + frame.width;
  const bottom = frame.y + frame.height;
  let x = frame.x;
  let y = frame.y;
  let expandedRight = right;
  let expandedBottom = bottom;
  if (frameTouchesEdge(node.frame, page, "left")) x = geometry.trim_x - number(geometry.bleed.left);
  if (frameTouchesEdge(node.frame, page, "top")) y = geometry.trim_y - number(geometry.bleed.top);
  if (frameTouchesEdge(node.frame, page, "right")) {
    expandedRight = geometry.trim_x + geometry.trim.width + number(geometry.bleed.right);
  }
  if (frameTouchesEdge(node.frame, page, "bottom")) {
    expandedBottom = geometry.trim_y + geometry.trim.height + number(geometry.bleed.bottom);
  }
  return { x, y, width: expandedRight - x, height: expandedBottom - y };
}

function assertNodeCapabilities(node) {
  if (node.visible === false) return;
  if (Math.abs(number(node.rotation)) > EDGE_EPSILON) {
    throw new Error(`CREATIVE_DESIGN_PDF_NODE_ROTATION_UNSUPPORTED:${node.id}`);
  }
  if (Math.abs(number(node.opacity, 1) - 1) > EDGE_EPSILON) {
    throw new Error(`CREATIVE_DESIGN_PDF_NODE_OPACITY_UNSUPPORTED:${node.id}`);
  }
  if (node.type === "GROUP") {
    throw new Error(`CREATIVE_DESIGN_PDF_GROUP_NODE_UNSUPPORTED:${node.id}`);
  }
}

function drawPageBackground(pdf, page, geometry) {
  if (page.background == null) return false;
  setFillColor(pdf, page.background);
  const extendsToBleed =
    page.print?.background_bleed_capable === true &&
    page.print?.background_extends_to_bleed === true;
  const x = extendsToBleed ? geometry.trim_x - number(geometry.bleed.left) : geometry.trim_x;
  const y = extendsToBleed ? geometry.trim_y - number(geometry.bleed.top) : geometry.trim_y;
  const width = extendsToBleed
    ? geometry.trim.width + number(geometry.bleed.left) + number(geometry.bleed.right)
    : geometry.trim.width;
  const height = extendsToBleed
    ? geometry.trim.height + number(geometry.bleed.top) + number(geometry.bleed.bottom)
    : geometry.trim.height;
  pdf.rect(x, y, width, height, "F");
  return true;
}

function embeddedFontName(fontAssetId) {
  return `AvantiqoPdfFont_${String(fontAssetId).replace(/[^A-Za-z0-9_]/g, "_")}`;
}

function dataUrlBase64(dataUrl) {
  const match = String(dataUrl || "").match(/^data:[^;,]+;base64,(.+)$/s);
  if (!match) throw new Error("CREATIVE_DESIGN_PDF_FONT_DATA_URL_INVALID");
  return match[1];
}

function ensureFont(pdf, typography, fontBindings, embeddedFonts) {
  const fontAssetId = text(typography?.font_asset_id);
  if (!fontAssetId) throw new Error("CREATIVE_DESIGN_PDF_FONT_ASSET_REQUIRED");
  if (embeddedFonts.has(fontAssetId)) return embeddedFonts.get(fontAssetId);
  const binding = bindingFor(fontBindings, fontAssetId);
  if (!binding) throw new Error(`CREATIVE_DESIGN_PDF_FONT_BINDING_REQUIRED:${fontAssetId}`);
  const mime = text(binding.mime_type).toLowerCase();
  if (!PDF_FONT_MIME.has(mime)) {
    throw new Error(`CREATIVE_DESIGN_PDF_FONT_MIME_UNSUPPORTED:${fontAssetId}:${mime || "missing"}`);
  }
  const fontName = embeddedFontName(fontAssetId);
  const fileName = `${fontName}.ttf`;
  pdf.addFileToVFS(fileName, dataUrlBase64(binding.data_url));
  pdf.addFont(fileName, fontName, "normal");
  embeddedFonts.set(fontAssetId, fontName);
  return fontName;
}

function drawTextLines({ pdf, page, geometry, content, frame, typography, fill, fontBindings, embeddedFonts }) {
  const fontName = ensureFont(pdf, typography, fontBindings, embeddedFonts);
  const layout = wrapCreativeDesignText(content, frame, typography);
  if (layout.overflow) {
    throw new Error("CREATIVE_DESIGN_PDF_TEXT_OVERFLOW");
  }
  const scale = pageScale(page);
  const point = pointFrame(page, geometry, frame);
  const fontSize = number(typography.font_size, 16) * scale;
  const align = ["center", "right"].includes(typography.align) ? typography.align : "left";
  const x = align === "center"
    ? point.x + point.width / 2
    : align === "right"
      ? point.x + point.width
      : point.x;
  pdf.setFont(fontName, "normal");
  pdf.setFontSize(fontSize);
  setTextColor(pdf, fill || typography.color || "#000000");
  pdf.setCharSpace(number(typography.letter_spacing, 0) * scale);
  for (let index = 0; index < layout.lines.length; index += 1) {
    const y = point.y + fontSize + index * layout.line_height * scale;
    pdf.text(layout.lines[index], x, y, { align });
  }
  pdf.setCharSpace(0);
  return { line_count: layout.lines.length, font_asset_id: typography.font_asset_id };
}

function drawTextNode(context, node) {
  return drawTextLines({
    ...context,
    content: node.content,
    frame: node.frame,
    typography: node.typography || {},
    fill: node.fill,
  });
}

function drawShapeNode({ pdf, page, geometry }, node) {
  const frame = bleedFrame(page, geometry, node);
  const fill = setFillColor(pdf, node.fill);
  const stroke = setDrawColor(pdf, node.stroke);
  const lineWidth = Math.max(0, number(node.stroke_width, 0) * pageScale(page));
  if (stroke) pdf.setLineWidth(lineWidth);
  const style = fill && stroke ? "FD" : fill ? "F" : stroke ? "S" : null;
  if (!style) return;
  const radius = Math.max(0, number(node.radius, 0) * pageScale(page));
  if (radius > 0) pdf.roundedRect(frame.x, frame.y, frame.width, frame.height, radius, radius, style);
  else pdf.rect(frame.x, frame.y, frame.width, frame.height, style);
}

function tableFor(tableLayouts, pageId, nodeId) {
  return tableLayouts.find((entry) => entry.page_id === pageId && entry.node_id === nodeId) || null;
}

function drawTableNode(context, node, tableLayouts) {
  const { pdf, page, geometry } = context;
  const layout = tableFor(tableLayouts, page.id, node.id);
  if (!layout) throw new Error(`CREATIVE_DESIGN_PDF_TABLE_LAYOUT_REQUIRED:${node.id}`);
  if (layout.overflow) throw new Error(`CREATIVE_DESIGN_PDF_TABLE_OVERFLOW:${node.id}`);
  const scale = pageScale(page);
  const outer = pointFrame(page, geometry, {
    ...node.frame,
    height: layout.required_height,
  });
  const outerFill = setFillColor(pdf, node.background);
  const outerStroke = setDrawColor(pdf, node.stroke);
  if (outerStroke) pdf.setLineWidth(Math.max(0, number(node.stroke_width, 0) * scale));
  const outerStyle = outerFill && outerStroke ? "FD" : outerFill ? "F" : outerStroke ? "S" : null;
  if (outerStyle) pdf.rect(outer.x, outer.y, outer.width, outer.height, outerStyle);

  for (const cell of layout.cells) {
    const style = cell.style || {};
    const typography = cell.typography || {};
    const cellFrame = pointFrame(page, geometry, cell.frame);
    const fill = setFillColor(pdf, style.background || style.fill);
    const stroke = setDrawColor(pdf, style.stroke || node.grid_color);
    if (stroke) pdf.setLineWidth(Math.max(0, number(style.stroke_width ?? node.grid_width, 0) * scale));
    const cellStyle = fill && stroke ? "FD" : fill ? "F" : stroke ? "S" : null;
    if (cellStyle) pdf.rect(cellFrame.x, cellFrame.y, cellFrame.width, cellFrame.height, cellStyle);

    const paddingX = Math.max(0, number(style.padding_x ?? node.cell_padding_x, 8));
    const paddingY = Math.max(0, number(style.padding_y ?? node.cell_padding_y, 8));
    const innerFrame = {
      x: cell.frame.x + paddingX,
      y: cell.frame.y + paddingY,
      width: Math.max(1, cell.frame.width - paddingX * 2),
      height: Math.max(1, cell.frame.height - paddingY * 2),
    };
    drawTextLines({
      ...context,
      content: cell.content,
      frame: innerFrame,
      typography: { ...typography, align: cell.align || typography.align || "left" },
      fill: typography.color || style.color || "#000000",
    });
  }
}

function drawQrNode({ pdf, page, geometry }, node) {
  const frame = pointFrame(page, geometry, node.frame);
  const scale = pageScale(page);
  const qr = createQrMatrix(node.value ?? node.content, node);
  const quiet = Math.max(4, Math.floor(number(node.quiet_zone, 4)));
  const logicalSize = qr.size + quiet * 2;
  const moduleSize = Math.min(number(node.frame.width), number(node.frame.height)) / logicalSize;
  const qrWidth = logicalSize * moduleSize;
  const x0 = number(node.frame.x) + (number(node.frame.width) - qrWidth) / 2 + quiet * moduleSize;
  const y0 = number(node.frame.y) + (number(node.frame.height) - qrWidth) / 2 + quiet * moduleSize;
  setFillColor(pdf, node.background || "#ffffff");
  pdf.rect(frame.x, frame.y, frame.width, frame.height, "F");
  setFillColor(pdf, node.fill || "#000000");
  for (let row = 0; row < qr.size; row += 1) {
    for (let column = 0; column < qr.size; column += 1) {
      if (!qr.matrix[row][column]) continue;
      pdf.rect(
        geometry.trim_x + (x0 + column * moduleSize) * scale,
        geometry.trim_y + (y0 + row * moduleSize) * scale,
        moduleSize * scale,
        moduleSize * scale,
        "F",
      );
    }
  }
}

function drawBarcodeNode({ pdf, page, geometry }, node) {
  const encoded = createEan13Bits(node.value ?? node.content);
  const frame = pointFrame(page, geometry, node.frame);
  const scale = pageScale(page);
  const quietModules = Math.max(10, Math.floor(number(node.quiet_zone, 10)));
  const logicalWidth = encoded.bits.length + quietModules * 2;
  const moduleWidth = number(node.frame.width) / logicalWidth;
  const barHeight = Math.max(1, number(node.frame.height) * (node.show_text === false ? 1 : 0.82));
  const x0 = number(node.frame.x) + quietModules * moduleWidth;
  setFillColor(pdf, node.background || "#ffffff");
  pdf.rect(frame.x, frame.y, frame.width, frame.height, "F");
  setFillColor(pdf, node.fill || "#000000");
  for (let index = 0; index < encoded.bits.length; index += 1) {
    if (encoded.bits[index] !== "1") continue;
    pdf.rect(
      geometry.trim_x + (x0 + index * moduleWidth) * scale,
      geometry.trim_y + number(node.frame.y) * scale,
      moduleWidth * scale,
      barHeight * scale,
      "F",
    );
  }
  if (node.show_text !== false) {
    pdf.setFont("courier", "normal");
    pdf.setFontSize(Math.max(8, number(node.frame.height) * 0.12) * scale);
    setTextColor(pdf, node.fill || "#000000");
    pdf.text(
      encoded.digits,
      frame.x + frame.width / 2,
      frame.y + frame.height,
      { align: "center" },
    );
  }
}

function drawImageNode({ pdf, page, geometry, assetBindings }, node) {
  const assetId = text(node.asset_id);
  if (!assetId) throw new Error(`CREATIVE_DESIGN_PDF_IMAGE_ASSET_ID_REQUIRED:${node.id}`);
  const binding = bindingFor(assetBindings, assetId);
  if (!binding?.data_url) {
    throw new Error(`CREATIVE_DESIGN_PDF_IMAGE_BINDING_REQUIRED:${node.id}:${assetId}`);
  }
  const mime = text(binding.mime_type).toLowerCase();
  if (mime === "image/svg+xml" || mime === "application/pdf" || node.type === "VECTOR") {
    throw new Error(`CREATIVE_DESIGN_PDF_EXTERNAL_VECTOR_IMPORT_UNSUPPORTED:${node.id}:${mime || "unknown"}`);
  }
  const format = RASTER_MIME_TO_FORMAT[mime];
  if (!format) throw new Error(`CREATIVE_DESIGN_PDF_RASTER_MIME_UNSUPPORTED:${node.id}:${mime || "missing"}`);
  const frame = bleedFrame(page, geometry, node);
  if (node.fit === "contain" && binding.width_pixels && binding.height_pixels) {
    const assetRatio = number(binding.width_pixels) / number(binding.height_pixels);
    const frameRatio = frame.width / frame.height;
    let width = frame.width;
    let height = frame.height;
    if (assetRatio > frameRatio) height = width / assetRatio;
    else width = height * assetRatio;
    pdf.addImage(
      binding.data_url,
      format,
      frame.x + (frame.width - width) / 2,
      frame.y + (frame.height - height) / 2,
      width,
      height,
      undefined,
      "FAST",
    );
    return;
  }
  pdf.addImage(
    binding.data_url,
    format,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    undefined,
    "FAST",
  );
}

function renderNode(context, node, tableLayouts) {
  if (node.visible === false) return { kind: "HIDDEN" };
  assertNodeCapabilities(node);
  if (node.type === "TEXT") {
    drawTextNode(context, node);
    return { kind: "VECTOR" };
  }
  if (node.type === "SHAPE") {
    drawShapeNode(context, node);
    return { kind: "VECTOR" };
  }
  if (node.type === "TABLE") {
    drawTableNode(context, node, tableLayouts);
    return { kind: "VECTOR" };
  }
  if (node.type === "QR") {
    drawQrNode(context, node);
    return { kind: "VECTOR" };
  }
  if (node.type === "BARCODE") {
    drawBarcodeNode(context, node);
    return { kind: "VECTOR" };
  }
  if (node.type === "VECTOR") {
    const binding = bindingFor(context.assetBindings, text(node.asset_id));
    throw new Error(
      `CREATIVE_DESIGN_PDF_EXTERNAL_VECTOR_IMPORT_UNSUPPORTED:${node.id}:${text(binding?.mime_type) || "unknown"}`,
    );
  }
  if (node.type === "IMAGE") {
    drawImageNode(context, node);
    return { kind: "RASTER_IMAGE_OBJECT" };
  }
  throw new Error(`CREATIVE_DESIGN_PDF_NODE_TYPE_UNSUPPORTED:${node.id}:${node.type}`);
}

export async function renderCreativeDesignDocumentToPdf(
  rawDocument = {},
  options = {},
) {
  const document = validateCreativeDesignDocument(rawDocument);
  const fontBindings = options.font_bindings || options.fontBindings || new Map();
  const assetBindings = options.asset_bindings || options.assetBindings || new Map();
  const printProfile = validateCreativeDesignPrintProfile(document, {
    ...options,
    asset_bindings: assetBindings,
    require_asset_evidence: true,
  });
  if (printProfile.release_blocked) {
    const codes = printProfile.issues
      .filter((issue) => issue.severity === "ERROR")
      .map((issue) => issue.code)
      .join(",");
    throw new Error(`CREATIVE_DESIGN_PRINT_PROFILE_BLOCKED:${codes}`);
  }

  const tableLayout = layoutCreativeDesignTables(document);
  if (!tableLayout.success) {
    throw new Error(`CREATIVE_DESIGN_PDF_TABLE_LAYOUT_BLOCKED:${tableLayout.overflow_table_nodes.join(",")}`);
  }

  let pdf = null;
  const embeddedFonts = new Map();
  const pages = [];

  for (const page of document.pages) {
    const geometry = pageGeometry(printProfile, page);
    const format = [geometry.media_width, geometry.media_height];
    if (!pdf) {
      pdf = new jsPDF({
        orientation: orientation(geometry.media_width, geometry.media_height),
        unit: "pt",
        format,
        compress: true,
        putOnlyUsedFonts: true,
      });
    } else {
      pdf.addPage(format, orientation(geometry.media_width, geometry.media_height));
    }

    const pageEvidence = printProfile.bleed_source_evidence
      ?.find((entry) => entry.page_id === page.id) || null;
    const backgroundRendered = drawPageBackground(pdf, page, geometry);
    let vectorNodeCount = 0;
    let rasterImageNodeCount = 0;

    const context = {
      pdf,
      page,
      geometry,
      fontBindings,
      assetBindings,
      embeddedFonts,
    };
    for (const node of page.nodes) {
      const rendered = renderNode(context, node, tableLayout.tables);
      if (rendered.kind === "VECTOR") vectorNodeCount += 1;
      if (rendered.kind === "RASTER_IMAGE_OBJECT") rasterImageNodeCount += 1;
    }
    drawCropMarks(pdf, geometry);

    pages.push({
      page_id: page.id,
      media_width_points: geometry.media_width,
      media_height_points: geometry.media_height,
      trim_width_points: geometry.trim.width,
      trim_height_points: geometry.trim.height,
      trim_offset_x_points: geometry.trim_x,
      trim_offset_y_points: geometry.trim_y,
      crop_marks_rendered: geometry.crop?.requested === true,
      bleed_requested: positiveBleed(geometry.profile),
      bleed_source_evidence: pageEvidence,
      background_rendered_as_vector: backgroundRendered,
      vector_node_count: vectorNodeCount,
      raster_image_object_count: rasterImageNodeCount,
      source_unit: page.unit,
      source_width: page.width,
      source_height: page.height,
    });
  }

  if (!pdf) throw new Error("CREATIVE_DESIGN_PDF_PAGE_REQUIRED");
  const buffer = Buffer.from(pdf.output("arraybuffer"));
  return {
    success: true,
    contract: CONTRACT,
    document_hash: document.document_hash,
    mime_type: "application/pdf",
    byte_length: buffer.length,
    buffer,
    pages,
    page_count: pages.length,
    color_space: "RGB",
    print_profile_contract: printProfile.contract,
    print_preflight_passed: true,
    raster_effective_dpi_evidence: printProfile.raster_asset_evidence,
    bleed_source_evidence: printProfile.bleed_source_evidence,
    crop_marks_supported: true,
    trim_box_geometry_preserved: true,
    true_bleed_render_supported: true,
    true_bleed_render_certified: false,
    certification_run_performed: false,
    vector_design_content_preserved: true,
    external_vector_assets_supported: false,
    raster_images_preserved_as_image_objects: true,
    rasterized_page_content: false,
    exact_font_assets_embedded: embeddedFonts.size > 0,
    embedded_font_asset_ids: [...embeddedFonts.keys()],
    cmyk_certified: false,
    pdfx_certified: false,
    deterministic_layout: true,
    pdf_byte_determinism_certified: false,
    deterministic: false,
    provider_called: false,
    generative_text_pixels_used: false,
  };
}

export const CreativeDesignPdfRenderer = Object.freeze({
  contract: CONTRACT,
  render: renderCreativeDesignDocumentToPdf,
});

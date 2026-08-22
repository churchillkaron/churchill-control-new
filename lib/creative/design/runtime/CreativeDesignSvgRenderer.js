import { validateCreativeDesignDocument } from "../contracts/CreativeDesignDocumentContract.js";

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

function textAnchor(value) {
  if (value === "center") return "middle";
  if (value === "right") return "end";
  return "start";
}

function renderText(node) {
  const frame = node.frame;
  const typography = node.typography || {};
  const align = typography.align || "left";
  const x = align === "center"
    ? frame.x + frame.width / 2
    : align === "right"
      ? frame.x + frame.width
      : frame.x;
  const y = frame.y + number(typography.font_size, 16);
  const fill = node.fill || typography.color || "#000000";
  const family = escapeXml(typography.font_family || typography.font_asset_id);
  const content = escapeXml(node.content);
  return `<text data-node-id="${escapeXml(node.id)}" x="${x}" y="${y}" font-family="${family}" font-size="${number(typography.font_size, 16)}" font-weight="${escapeXml(typography.font_weight ?? 400)}" letter-spacing="${number(typography.letter_spacing, 0)}" text-anchor="${textAnchor(align)}" fill="${escapeXml(fill)}" opacity="${number(node.opacity, 1)}">${content}</text>`;
}

function renderShape(node) {
  const frame = node.frame;
  return `<rect data-node-id="${escapeXml(node.id)}" x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" rx="${number(node.radius, 0)}" fill="${escapeXml(node.fill || "none")}" stroke="${escapeXml(node.stroke || "none")}" stroke-width="${number(node.stroke_width, 0)}" opacity="${number(node.opacity, 1)}" />`;
}

function renderImage(node) {
  const frame = node.frame;
  const href = escapeXml(node.asset_reference || node.asset_url || "");
  return `<image data-node-id="${escapeXml(node.id)}" href="${href}" x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" preserveAspectRatio="${node.fit === "contain" ? "xMidYMid meet" : "xMidYMid slice"}" opacity="${number(node.opacity, 1)}" />`;
}

function renderVector(node) {
  return renderImage(node);
}

function renderNode(node) {
  if (node.visible === false) return "";
  if (node.type === "TEXT") return renderText(node);
  if (node.type === "SHAPE") return renderShape(node);
  if (node.type === "IMAGE") return renderImage(node);
  if (node.type === "VECTOR") return renderVector(node);
  return "";
}

function renderPage(page, documentHash) {
  const background = page.background
    ? `<rect width="100%" height="100%" fill="${escapeXml(page.background)}" />`
    : "";
  const nodes = page.nodes.map(renderNode).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${page.width}" height="${page.height}" viewBox="0 0 ${page.width} ${page.height}" data-creative-design-document-hash="${escapeXml(documentHash)}" data-page-id="${escapeXml(page.id)}">\n${background}\n${nodes}\n</svg>`;
}

export function renderCreativeDesignDocumentToSvg(rawDocument = {}) {
  const document = validateCreativeDesignDocument(rawDocument);
  return {
    success: true,
    contract: "CREATIVE_DESIGN_SVG_RENDER_V1",
    document_hash: document.document_hash,
    pages: document.pages.map((page) => ({
      page_id: page.id,
      width: page.width,
      height: page.height,
      unit: page.unit,
      svg: renderPage(page, document.document_hash),
    })),
    deterministic: true,
    provider_called: false,
    generative_text_pixels_used: false,
  };
}

export const CreativeDesignSvgRenderer = Object.freeze({
  contract: "CREATIVE_DESIGN_SVG_RENDER_V1",
  render: renderCreativeDesignDocumentToSvg,
});

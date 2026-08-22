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

function fontFamily(node, fontBindings) {
  const fontAssetId = node.typography?.font_asset_id;
  const binding = fontBindings?.get?.(fontAssetId);
  return binding?.css_family || node.typography?.font_family || fontAssetId;
}

function estimatedCharacterWidth(fontSize, letterSpacing = 0) {
  return Math.max(1, fontSize * 0.54 + letterSpacing);
}

function wrapParagraph(paragraph, maxCharacters) {
  if (!paragraph) return [""];
  const words = paragraph.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || candidate.length <= maxCharacters) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

function layoutText(node) {
  const frame = node.frame;
  const typography = node.typography || {};
  const fontSize = number(typography.font_size, 16);
  const letterSpacing = number(typography.letter_spacing, 0);
  const lineHeightMultiplier = number(typography.line_height, 1.2);
  const lineHeight = fontSize * lineHeightMultiplier;
  const estimatedWidth = estimatedCharacterWidth(fontSize, letterSpacing);
  const maxCharacters = Math.max(1, Math.floor(frame.width / estimatedWidth));
  const explicitParagraphs = String(node.content ?? "").split(/\r?\n/);
  const lines = explicitParagraphs.flatMap((paragraph) =>
    wrapParagraph(paragraph, maxCharacters));
  const maxLines = Math.max(1, Math.floor(frame.height / lineHeight));
  const overflow = lines.length > maxLines;
  const visibleLines = overflow ? lines.slice(0, maxLines) : lines;
  return {
    lines: visibleLines,
    all_lines: lines,
    line_height: lineHeight,
    max_lines: maxLines,
    overflow,
    estimated: true,
  };
}

function renderText(node, fontBindings, evidence) {
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
  const layout = layoutText(node);
  evidence.push({
    node_id: node.id,
    type: "TEXT",
    line_count: layout.all_lines.length,
    rendered_line_count: layout.lines.length,
    max_lines: layout.max_lines,
    overflow: layout.overflow,
    font_asset_id: typography.font_asset_id,
    font_family: fontFamily(node, fontBindings),
    estimated_text_measurement: true,
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

function renderImage(node) {
  const frame = node.frame;
  const href = escapeXml(node.asset_reference || node.asset_url || "");
  return `<image data-node-id="${escapeXml(node.id)}" href="${href}" x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" preserveAspectRatio="${node.fit === "contain" ? "xMidYMid meet" : "xMidYMid slice"}" opacity="${number(node.opacity, 1)}" />`;
}

function renderVector(node) {
  return renderImage(node);
}

function renderNode(node, fontBindings, evidence) {
  if (node.visible === false) return "";
  if (node.type === "TEXT") return renderText(node, fontBindings, evidence);
  if (node.type === "SHAPE") return renderShape(node);
  if (node.type === "IMAGE") return renderImage(node);
  if (node.type === "VECTOR") return renderVector(node);
  return "";
}

function renderFontFaces(fontBindings) {
  if (!fontBindings?.size) return "";
  const rules = [...fontBindings.values()].map((binding) =>
    `@font-face{font-family:'${String(binding.css_family).replaceAll("'", "\\'")}';src:url('${binding.data_url}');}`,
  ).join("\n");
  return `<defs><style><![CDATA[${rules}]]></style></defs>`;
}

function renderPage(page, documentHash, fontBindings) {
  const background = page.background
    ? `<rect width="100%" height="100%" fill="${escapeXml(page.background)}" />`
    : "";
  const evidence = [];
  const nodes = page.nodes.map((node) => renderNode(node, fontBindings, evidence)).join("\n");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${page.width}" height="${page.height}" viewBox="0 0 ${page.width} ${page.height}" data-creative-design-document-hash="${escapeXml(documentHash)}" data-page-id="${escapeXml(page.id)}">\n${renderFontFaces(fontBindings)}\n${background}\n${nodes}\n</svg>`;
  return { svg, evidence };
}

export function renderCreativeDesignDocumentToSvg(rawDocument = {}, options = {}) {
  const document = validateCreativeDesignDocument(rawDocument);
  const fontBindings = options.font_bindings || options.fontBindings || new Map();
  const pages = document.pages.map((page) => {
    const rendered = renderPage(page, document.document_hash, fontBindings);
    return {
      page_id: page.id,
      width: page.width,
      height: page.height,
      unit: page.unit,
      svg: rendered.svg,
      evidence: rendered.evidence,
    };
  });
  return {
    success: true,
    contract: "CREATIVE_DESIGN_SVG_RENDER_V2",
    document_hash: document.document_hash,
    pages,
    text_overflow_nodes: pages.flatMap((page) =>
      page.evidence.filter((entry) => entry.type === "TEXT" && entry.overflow)
        .map((entry) => entry.node_id)),
    deterministic: true,
    provider_called: false,
    generative_text_pixels_used: false,
    exact_font_assets_embedded: Boolean(fontBindings?.size),
  };
}

export const CreativeDesignSvgRenderer = Object.freeze({
  contract: "CREATIVE_DESIGN_SVG_RENDER_V2",
  render: renderCreativeDesignDocumentToSvg,
});

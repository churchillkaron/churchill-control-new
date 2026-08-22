import sharp from "sharp";

import {
  renderCreativeDesignDocumentToSvg,
} from "./CreativeDesignSvgRenderer.js";

const CONTRACT = "CREATIVE_DESIGN_PNG_RENDER_V2";

function number(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function renderCreativeDesignDocumentToPng(
  rawDocument = {},
  options = {},
) {
  const svgRender = renderCreativeDesignDocumentToSvg(rawDocument, options);
  if (!svgRender.success) {
    const error = new Error("CREATIVE_DESIGN_PNG_SOURCE_RENDER_REPAIR_REQUIRED");
    error.text_overflow_nodes = svgRender.text_overflow_nodes || [];
    error.table_overflow_nodes = svgRender.table_overflow_nodes || [];
    throw error;
  }

  const density = Math.max(72, Math.min(600, number(options.density, 144) || 144));
  const pages = [];

  for (const page of svgRender.pages) {
    const png = await sharp(Buffer.from(page.svg), { density })
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
      })
      .toBuffer();

    pages.push({
      page_id: page.page_id,
      width: page.width,
      height: page.height,
      unit: page.unit,
      mime_type: "image/png",
      byte_length: png.length,
      buffer: png,
      render_evidence: page.evidence,
    });
  }

  return {
    success: true,
    contract: CONTRACT,
    document_hash: svgRender.document_hash,
    pages,
    density,
    text_overflow_nodes: [],
    table_overflow_nodes: [],
    source_svg_contract: svgRender.contract,
    content_preserved_on_overflow: svgRender.content_preserved_on_overflow === true,
    deterministic: true,
    provider_called: false,
    generative_text_pixels_used: false,
  };
}

export const CreativeDesignPngRenderer = Object.freeze({
  contract: CONTRACT,
  render: renderCreativeDesignDocumentToPng,
});

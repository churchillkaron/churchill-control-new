import { jsPDF } from "jspdf";

import {
  renderCreativeDesignDocumentToPng,
} from "./CreativeDesignPngRenderer.js";
import {
  creativeDesignPagePoints,
} from "./CreativeDesignUnitRuntime.js";
import {
  validateCreativeDesignPrintProfile,
} from "./CreativeDesignPrintProfileRuntime.js";

const CONTRACT = "CREATIVE_DESIGN_PDF_RENDER_V1";

function orientation(width, height) {
  return width > height ? "landscape" : "portrait";
}

export async function renderCreativeDesignDocumentToPdf(
  rawDocument = {},
  options = {},
) {
  const printProfile = validateCreativeDesignPrintProfile(rawDocument);
  if (printProfile.release_blocked) {
    const codes = printProfile.issues.map((issue) => issue.code).join(",");
    throw new Error(`CREATIVE_DESIGN_PRINT_PROFILE_BLOCKED:${codes}`);
  }

  const pngRender = await renderCreativeDesignDocumentToPng(rawDocument, {
    ...options,
    density: options.density || 300,
  });
  if (!pngRender.pages.length) {
    throw new Error("CREATIVE_DESIGN_PDF_PAGE_REQUIRED");
  }

  let pdf = null;
  const pages = [];
  for (let index = 0; index < pngRender.pages.length; index += 1) {
    const page = pngRender.pages[index];
    const sourcePage = rawDocument.pages[index];
    const points = creativeDesignPagePoints(sourcePage);
    const format = [points.width, points.height];

    if (!pdf) {
      pdf = new jsPDF({
        orientation: orientation(points.width, points.height),
        unit: "pt",
        format,
        compress: true,
        putOnlyUsedFonts: true,
      });
    } else {
      pdf.addPage(format, orientation(points.width, points.height));
    }

    const dataUrl = `data:image/png;base64,${page.buffer.toString("base64")}`;
    pdf.addImage(
      dataUrl,
      "PNG",
      0,
      0,
      points.width,
      points.height,
      undefined,
      "FAST",
    );

    pages.push({
      page_id: page.page_id,
      width_points: points.width,
      height_points: points.height,
      source_unit: sourcePage.unit,
      source_width: sourcePage.width,
      source_height: sourcePage.height,
    });
  }

  const buffer = Buffer.from(pdf.output("arraybuffer"));
  return {
    success: true,
    contract: CONTRACT,
    document_hash: pngRender.document_hash,
    mime_type: "application/pdf",
    byte_length: buffer.length,
    buffer,
    pages,
    page_count: pages.length,
    color_space: "RGB",
    vector_master_preserved_separately: true,
    rasterized_page_content: true,
    cmyk_certified: false,
    pdfx_certified: false,
    deterministic: true,
    provider_called: false,
    generative_text_pixels_used: false,
  };
}

export const CreativeDesignPdfRenderer = Object.freeze({
  contract: CONTRACT,
  render: renderCreativeDesignDocumentToPdf,
});

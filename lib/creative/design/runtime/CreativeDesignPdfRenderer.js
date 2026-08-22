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

const CONTRACT = "CREATIVE_DESIGN_PDF_RENDER_V2";

function orientation(width, height) {
  return width > height ? "landscape" : "portrait";
}

function positiveBleed(profile = {}) {
  const bleed = profile.bleed_points || {};
  return [bleed.top, bleed.right, bleed.bottom, bleed.left]
    .some((value) => Number(value || 0) > 0);
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

export async function renderCreativeDesignDocumentToPdf(
  rawDocument = {},
  options = {},
) {
  const printProfile = validateCreativeDesignPrintProfile(rawDocument, {
    ...options,
    require_asset_evidence: true,
  });
  if (printProfile.release_blocked) {
    const codes = printProfile.issues
      .filter((issue) => issue.severity === "ERROR")
      .map((issue) => issue.code)
      .join(",");
    throw new Error(`CREATIVE_DESIGN_PRINT_PROFILE_BLOCKED:${codes}`);
  }

  if (
    printProfile.mode === "PRINT" &&
    printProfile.pages.some((profile) => positiveBleed(profile))
  ) {
    throw new Error("CREATIVE_DESIGN_PDF_TRUE_BLEED_RENDER_NOT_YET_CERTIFIED");
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
    const geometry = pageGeometry(printProfile, sourcePage);
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

    const dataUrl = `data:image/png;base64,${page.buffer.toString("base64")}`;
    pdf.addImage(
      dataUrl,
      "PNG",
      geometry.trim_x,
      geometry.trim_y,
      geometry.trim.width,
      geometry.trim.height,
      undefined,
      "FAST",
    );
    drawCropMarks(pdf, geometry);

    pages.push({
      page_id: page.page_id,
      media_width_points: geometry.media_width,
      media_height_points: geometry.media_height,
      trim_width_points: geometry.trim.width,
      trim_height_points: geometry.trim.height,
      trim_offset_x_points: geometry.trim_x,
      trim_offset_y_points: geometry.trim_y,
      crop_marks_rendered: geometry.crop?.requested === true,
      bleed_requested: positiveBleed(geometry.profile),
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
    print_profile_contract: printProfile.contract,
    print_preflight_passed: true,
    raster_effective_dpi_evidence: printProfile.raster_asset_evidence,
    crop_marks_supported: true,
    trim_box_geometry_preserved: true,
    true_bleed_render_certified: false,
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

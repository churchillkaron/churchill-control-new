import {
  convertCreativeDesignUnits,
} from "./CreativeDesignUnitRuntime.js";
import {
  validateCreativeDesignDocument,
} from "../contracts/CreativeDesignDocumentContract.js";

const CONTRACT = "CREATIVE_DESIGN_PRINT_PROFILE_V1";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function edgeBox(value = {}, unit = "mm") {
  const box = object(value);
  const all = finite(box.all, null);
  return {
    unit,
    top: all ?? finite(box.top, 0),
    right: all ?? finite(box.right, 0),
    bottom: all ?? finite(box.bottom, 0),
    left: all ?? finite(box.left, 0),
  };
}

function edgeBoxInPageUnits(value = {}, pageUnit = "px") {
  const sourceUnit = text(value.unit) || pageUnit;
  return {
    top: convertCreativeDesignUnits(value.top || 0, sourceUnit, pageUnit),
    right: convertCreativeDesignUnits(value.right || 0, sourceUnit, pageUnit),
    bottom: convertCreativeDesignUnits(value.bottom || 0, sourceUnit, pageUnit),
    left: convertCreativeDesignUnits(value.left || 0, sourceUnit, pageUnit),
  };
}

function pageProfile(page, exportSpec) {
  const print = object(exportSpec.print);
  const bleed = edgeBox(
    Object.keys(object(page.bleed)).length ? page.bleed : print.bleed,
    text(page.bleed?.unit || print.bleed?.unit) || page.unit,
  );
  const safe = edgeBox(
    Object.keys(object(page.safe_area)).length ? page.safe_area : print.safe_area,
    text(page.safe_area?.unit || print.safe_area?.unit) || page.unit,
  );
  return {
    page_id: page.id,
    unit: page.unit,
    trim: { width: page.width, height: page.height },
    bleed: edgeBoxInPageUnits(bleed, page.unit),
    safe_area: edgeBoxInPageUnits(safe, page.unit),
  };
}

function nodeViolatesSafeArea(node, page, profile) {
  if (node.visible === false) return false;
  const frame = object(node.frame);
  const safe = profile.safe_area;
  return (
    Number(frame.x) < safe.left ||
    Number(frame.y) < safe.top ||
    Number(frame.x) + Number(frame.width) > page.width - safe.right ||
    Number(frame.y) + Number(frame.height) > page.height - safe.bottom
  );
}

export function validateCreativeDesignPrintProfile(rawDocument = {}) {
  const document = validateCreativeDesignDocument(rawDocument);
  const exportSpec = object(document.export_spec);
  const print = object(exportSpec.print);
  const mode = text(print.mode || exportSpec.mode).toUpperCase();
  const colorSpace = text(print.color_space || exportSpec.color_space || "RGB").toUpperCase();
  const pdfStandard = text(print.pdf_standard || exportSpec.pdf_standard).toUpperCase();
  const issues = [];
  const profiles = document.pages.map((page) => pageProfile(page, exportSpec));

  if (mode === "PRINT") {
    for (const profile of profiles) {
      const page = document.pages.find((candidate) => candidate.id === profile.page_id);
      if (!page) continue;
      const bleed = profile.bleed;
      if ([bleed.top, bleed.right, bleed.bottom, bleed.left].some((value) => value < 0)) {
        issues.push({ severity: "ERROR", code: "PRINT_BLEED_INVALID", page_id: page.id });
      }
      for (const node of page.nodes) {
        if (node.type === "TEXT" && nodeViolatesSafeArea(node, page, profile)) {
          issues.push({
            severity: "ERROR",
            code: "PRINT_TEXT_OUTSIDE_SAFE_AREA",
            page_id: page.id,
            node_id: node.id,
          });
        }
      }
    }
  }

  const cmykRequested = colorSpace === "CMYK";
  const pdfxRequested = pdfStandard.startsWith("PDF/X");
  const iccProfile = text(print.icc_profile_asset_id || exportSpec.icc_profile_asset_id);

  if (cmykRequested && !iccProfile) {
    issues.push({
      severity: "ERROR",
      code: "CMYK_ICC_PROFILE_REQUIRED",
    });
  }

  // CMYK/PDF-X output must not be claimed until a certified ICC transform + PDF/X writer
  // is connected. This runtime intentionally fails closed rather than mislabeling RGB output.
  if (cmykRequested) {
    issues.push({
      severity: "ERROR",
      code: "CMYK_EXPORT_NOT_YET_CERTIFIED",
      icc_profile_asset_id: iccProfile || null,
    });
  }
  if (pdfxRequested) {
    issues.push({
      severity: "ERROR",
      code: "PDFX_EXPORT_NOT_YET_CERTIFIED",
      requested_standard: pdfStandard,
    });
  }

  const errorCount = issues.filter((issue) => issue.severity === "ERROR").length;
  return {
    success: errorCount === 0,
    contract: CONTRACT,
    document_hash: document.document_hash,
    mode: mode || "DIGITAL",
    color_space: colorSpace,
    pdf_standard: pdfStandard || null,
    pages: profiles,
    issues,
    error_count: errorCount,
    release_blocked: errorCount > 0,
    cmyk_certified: false,
    pdfx_certified: false,
  };
}

export const CreativeDesignPrintProfileRuntime = Object.freeze({
  contract: CONTRACT,
  validate: validateCreativeDesignPrintProfile,
});

import {
  convertCreativeDesignUnits,
} from "./CreativeDesignUnitRuntime.js";
import {
  validateCreativeDesignDocument,
} from "../contracts/CreativeDesignDocumentContract.js";

const CONTRACT = "CREATIVE_DESIGN_PRINT_PROFILE_V2";
const DEFAULT_MINIMUM_DPI = 300;

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

function positive(value, fallback = null) {
  const parsed = finite(value, fallback);
  return parsed !== null && parsed > 0 ? parsed : fallback;
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

function boxInPoints(box, pageUnit) {
  return {
    top: convertCreativeDesignUnits(box.top || 0, pageUnit, "pt"),
    right: convertCreativeDesignUnits(box.right || 0, pageUnit, "pt"),
    bottom: convertCreativeDesignUnits(box.bottom || 0, pageUnit, "pt"),
    left: convertCreativeDesignUnits(box.left || 0, pageUnit, "pt"),
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
  const bleedPageUnits = edgeBoxInPageUnits(bleed, page.unit);
  const safePageUnits = edgeBoxInPageUnits(safe, page.unit);
  const bleedPoints = boxInPoints(bleedPageUnits, page.unit);
  const trimWidthPoints = convertCreativeDesignUnits(page.width, page.unit, "pt");
  const trimHeightPoints = convertCreativeDesignUnits(page.height, page.unit, "pt");
  return {
    page_id: page.id,
    unit: page.unit,
    trim: { width: page.width, height: page.height },
    trim_points: { width: trimWidthPoints, height: trimHeightPoints },
    bleed: bleedPageUnits,
    bleed_points: bleedPoints,
    bleed_box_points: {
      width: trimWidthPoints + bleedPoints.left + bleedPoints.right,
      height: trimHeightPoints + bleedPoints.top + bleedPoints.bottom,
      trim_offset_x: bleedPoints.left,
      trim_offset_y: bleedPoints.top,
    },
    safe_area: safePageUnits,
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

function assetBinding(bindings, assetId) {
  if (!bindings || !assetId) return null;
  if (typeof bindings.get === "function") return bindings.get(assetId) || null;
  return object(bindings)[assetId] || null;
}

function isVectorBinding(binding = {}, node = {}) {
  const mime = text(binding.mime_type).toLowerCase();
  const assetType = text(binding.asset_type || node.type).toUpperCase();
  return assetType === "VECTOR" || mime === "image/svg+xml" || mime === "application/pdf";
}

function effectiveDpi(node, page, binding) {
  const widthPixels = positive(binding?.width_pixels, null);
  const heightPixels = positive(binding?.height_pixels, null);
  if (!widthPixels || !heightPixels) return null;
  const widthInches = convertCreativeDesignUnits(node.frame.width, page.unit, "in");
  const heightInches = convertCreativeDesignUnits(node.frame.height, page.unit, "in");
  if (widthInches <= 0 || heightInches <= 0) return null;
  return {
    horizontal: widthPixels / widthInches,
    vertical: heightPixels / heightInches,
    minimum: Math.min(widthPixels / widthInches, heightPixels / heightInches),
    width_pixels: widthPixels,
    height_pixels: heightPixels,
    placed_width_inches: widthInches,
    placed_height_inches: heightInches,
  };
}

function cropMarkProfile(print, profile) {
  const requested = print.crop_marks === true || print.marks?.crop === true;
  const length = positive(print.crop_mark_length, 12);
  const offset = positive(print.crop_mark_offset, 6);
  return {
    requested,
    length_points: convertCreativeDesignUnits(length, text(print.crop_mark_unit) || "pt", "pt"),
    offset_points: convertCreativeDesignUnits(offset, text(print.crop_mark_unit) || "pt", "pt"),
    trim_offset_x: profile.bleed_box_points.trim_offset_x,
    trim_offset_y: profile.bleed_box_points.trim_offset_y,
  };
}

export function validateCreativeDesignPrintProfile(rawDocument = {}, options = {}) {
  const document = validateCreativeDesignDocument(rawDocument);
  const exportSpec = object(document.export_spec);
  const print = object(exportSpec.print);
  const mode = text(print.mode || exportSpec.mode).toUpperCase();
  const colorSpace = text(print.color_space || exportSpec.color_space || "RGB").toUpperCase();
  const pdfStandard = text(print.pdf_standard || exportSpec.pdf_standard).toUpperCase();
  const minimumDpi = Math.max(72, positive(print.minimum_dpi, DEFAULT_MINIMUM_DPI));
  const assetBindings = options.asset_bindings || options.assetBindings || null;
  const issues = [];
  const rasterEvidence = [];
  const profiles = document.pages.map((page) => pageProfile(page, exportSpec));

  if (mode === "PRINT") {
    for (const profile of profiles) {
      const page = document.pages.find((candidate) => candidate.id === profile.page_id);
      if (!page) continue;
      const bleed = profile.bleed;
      if ([bleed.top, bleed.right, bleed.bottom, bleed.left].some((value) => value < 0)) {
        issues.push({ severity: "ERROR", code: "PRINT_BLEED_INVALID", page_id: page.id });
      }
      const safe = profile.safe_area;
      if ([safe.top, safe.right, safe.bottom, safe.left].some((value) => value < 0)) {
        issues.push({ severity: "ERROR", code: "PRINT_SAFE_AREA_INVALID", page_id: page.id });
      }
      if (safe.left + safe.right >= page.width || safe.top + safe.bottom >= page.height) {
        issues.push({ severity: "ERROR", code: "PRINT_SAFE_AREA_EXCEEDS_TRIM", page_id: page.id });
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
        if (!["IMAGE", "VECTOR"].includes(node.type) || node.visible === false) continue;
        const assetId = text(node.asset_id);
        if (!assetId) continue;
        const binding = assetBinding(assetBindings, assetId);
        if (!binding) {
          issues.push({
            severity: "ERROR",
            code: "PRINT_ASSET_RENDER_EVIDENCE_REQUIRED",
            page_id: page.id,
            node_id: node.id,
            asset_id: assetId,
          });
          continue;
        }
        if (isVectorBinding(binding, node)) {
          rasterEvidence.push({
            page_id: page.id,
            node_id: node.id,
            asset_id: assetId,
            vector: true,
            effective_dpi: null,
            resolution_passed: true,
          });
          continue;
        }
        const dpi = effectiveDpi(node, page, binding);
        if (!dpi) {
          issues.push({
            severity: "ERROR",
            code: "PRINT_RASTER_DIMENSIONS_REQUIRED",
            page_id: page.id,
            node_id: node.id,
            asset_id: assetId,
          });
          continue;
        }
        const passed = dpi.minimum >= minimumDpi;
        rasterEvidence.push({
          page_id: page.id,
          node_id: node.id,
          asset_id: assetId,
          vector: false,
          effective_dpi: dpi,
          required_minimum_dpi: minimumDpi,
          resolution_passed: passed,
        });
        if (!passed) {
          issues.push({
            severity: "ERROR",
            code: "PRINT_RASTER_EFFECTIVE_DPI_TOO_LOW",
            page_id: page.id,
            node_id: node.id,
            asset_id: assetId,
            effective_dpi: dpi.minimum,
            required_minimum_dpi: minimumDpi,
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

  const cropMarks = profiles.map((profile) => ({
    page_id: profile.page_id,
    ...cropMarkProfile(print, profile),
  }));
  const errorCount = issues.filter((issue) => issue.severity === "ERROR").length;
  return {
    success: errorCount === 0,
    contract: CONTRACT,
    document_hash: document.document_hash,
    mode: mode || "DIGITAL",
    color_space: colorSpace,
    pdf_standard: pdfStandard || null,
    minimum_dpi: minimumDpi,
    pages: profiles,
    crop_marks: cropMarks,
    raster_asset_evidence: rasterEvidence,
    issues,
    error_count: errorCount,
    release_blocked: errorCount > 0,
    trim_box_evidence: true,
    bleed_box_evidence: true,
    raster_effective_dpi_evidence: mode === "PRINT",
    vector_assets_exempt_from_dpi: true,
    cmyk_certified: false,
    pdfx_certified: false,
  };
}

export const CreativeDesignPrintProfileRuntime = Object.freeze({
  contract: CONTRACT,
  validate: validateCreativeDesignPrintProfile,
});

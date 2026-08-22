const CONTRACT = "CREATIVE_DESIGN_GOVERNANCE_VALIDATION_V1";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function isPlatformFontId(value) {
  return text(value).startsWith("platform-font:");
}

function typographyFor(node = {}) {
  return object(node.typography);
}

function nodeIsBrandLocked(node = {}) {
  const typography = typographyFor(node);
  const metadata = object(node.metadata);
  return Boolean(
    node.brand_locked === true ||
    typography.brand_locked === true ||
    metadata.brand_locked === true ||
    text(metadata.typography_authority).toUpperCase() === "BRAND_LOCKED"
  );
}

function assertBrandLockedFont(node = {}) {
  if (!nodeIsBrandLocked(node)) return;
  const fontAssetId = text(typographyFor(node).font_asset_id);
  if (!fontAssetId) {
    throw new Error(
      `CREATIVE_DESIGN_BRAND_LOCKED_FONT_REQUIRED:${node.id || "unknown"}`,
    );
  }
  if (isPlatformFontId(fontAssetId)) {
    throw new Error(
      `CREATIVE_DESIGN_BRAND_LOCKED_PLATFORM_FONT_FORBIDDEN:${node.id || "unknown"}:${fontAssetId}`,
    );
  }
}

export function validateCreativeDesignGovernance({ specification } = {}) {
  const design = object(specification);
  const violations = [];

  for (const page of list(design.pages)) {
    for (const node of list(page.nodes)) {
      try {
        assertBrandLockedFont(node);
      } catch (error) {
        violations.push({
          page_id: page.id || null,
          node_id: node.id || null,
          code: text(error?.message),
        });
      }
    }
  }

  if (violations.length) {
    const error = new Error(
      `CREATIVE_DESIGN_GOVERNANCE_REJECTED:${violations.map((item) => item.code).join("|")}`,
    );
    error.violations = violations;
    throw error;
  }

  return {
    success: true,
    contract: CONTRACT,
    violations: [],
    brand_locked_platform_font_forbidden: true,
    host_os_font_lookup_forbidden: true,
  };
}

export const CreativeDesignGovernanceValidationRuntime = Object.freeze({
  contract: CONTRACT,
  validate: validateCreativeDesignGovernance,
});

export default CreativeDesignGovernanceValidationRuntime;

#!/usr/bin/env node

import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function replaceRequired(source, search, replacement, path, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) {
    throw new Error(`CREATIVE_UPLOAD_PROVENANCE_V11_PATTERN_MISSING:${path}:${label}`);
  }
  return source.replace(search, replacement);
}

function patchBusinessTruth() {
  const path = "lib/creative/knowledge/CreativeBusinessTruthRuntime.js";
  let source = read(path);

  source = replaceRequired(
    source,
    "const MAX_ASSETS = 80;",
    "const MAX_ASSETS = 80;\nconst MAX_ASSET_PROVENANCE_SCAN = 1000;",
    path,
    "asset-scan-limit",
  );

  source = replaceRequired(
    source,
    `async function queryUploadedAssets(organization_id) {\n  const { data, error } = await supabaseAdmin.from("creative_assets").select("*").eq("organization_id", organization_id).eq("archived", false).order("favorite", { ascending: false }).order("created_at", { ascending: false }).limit(MAX_ASSETS);\n  if (error) throw error;\n  return data || [];\n}`,
    `// CREATIVE_SOURCE_UPLOAD_WINDOW_RECOVERY_V11\nasync function queryUploadedAssets(organization_id) {\n  const { data, error } = await supabaseAdmin\n    .from("creative_assets")\n    .select("*")\n    .eq("organization_id", organization_id)\n    .eq("archived", false)\n    .order("favorite", { ascending: false })\n    .order("created_at", { ascending: false })\n    .limit(MAX_ASSET_PROVENANCE_SCAN);\n\n  if (error) throw error;\n\n  return (data || [])\n    .filter((row) => creativeAssetSourceKind(row) === "USER_UPLOAD")\n    .slice(0, MAX_ASSETS);\n}`,
    path,
    "source-upload-window",
  );

  write(path, source);
}

function patchPlanner() {
  const path = "lib/creative/production-graph/planner/ProductionGraphPlanner.js";
  let source = read(path);

  source = replaceRequired(
    source,
    `  const hasWardrobeEvidence = hasReferenceRole(\n    referenceAssets,\n    ["WARDROBE"],\n  );\n\n  return {`,
    `  const hasWardrobeEvidence = hasReferenceRole(\n    referenceAssets,\n    ["WARDROBE"],\n  );\n  // CREATIVE_SHOT_SCOPED_EXACT_BRAND_OVERLAY_V11\n  const brandOverlay =\n    shot.brand_overlay ||\n    shot.exact_brand_overlay ||\n    shot.metadata?.brand_overlay ||\n    shot.metadata?.exact_brand_overlay ||\n    null;\n\n  return {`,
    path,
    "shot-brand-overlay-contract",
  );

  source = replaceRequired(
    source,
    `      brand_overlay:\n        shot.brand_overlay ||\n        shot.exact_brand_overlay ||\n        shot.metadata?.brand_overlay ||\n        shot.metadata?.exact_brand_overlay ||\n        null,`,
    `      brand_overlay: brandOverlay,`,
    path,
    "brand-overlay-field",
  );

  source = replaceRequired(
    source,
    `        exact_brand_and_text_required: hasBrandOrTextEvidence,`,
    `        exact_brand_and_text_required: Boolean(\n          hasBrandOrTextEvidence && brandOverlay?.required === true,\n        ),`,
    path,
    "shot-scoped-brand-requirement",
  );

  write(path, source);
}

function assertUploadRepository() {
  const path = "lib/creative/assets/repositories/saveCreativeAsset.js";
  const source = read(path);
  for (const marker of [
    "CREATIVE_DURABLE_UPLOAD_PROVENANCE_V11",
    'source_kind: sourceKind',
    'source_type: metadata?.source_type',
  ]) {
    if (!source.includes(marker)) {
      throw new Error(`CREATIVE_UPLOAD_REPOSITORY_V11_MISSING:${marker}`);
    }
  }
}

function assertUploadFlow() {
  const path = "lib/creative/assets/workflows/createCreativeAssetFlow.js";
  const source = read(path);
  for (const marker of [
    "CREATIVE_UPLOAD_FLOW_PROVENANCE_V11",
    'source_kind: "USER_UPLOAD"',
    "originalFileName: file?.name",
  ]) {
    if (!source.includes(marker)) {
      throw new Error(`CREATIVE_UPLOAD_FLOW_V11_MISSING:${marker}`);
    }
  }
  if (/hospitality_role|cocktail|food/i.test(source)) {
    throw new Error("CREATIVE_UPLOAD_FLOW_INDUSTRY_ASSUMPTION_REMAINS");
  }
}

patchBusinessTruth();
patchPlanner();
assertUploadRepository();
assertUploadFlow();

console.log("CREATIVE_UPLOAD_PROVENANCE_RECOVERY_V11=APPLIED");

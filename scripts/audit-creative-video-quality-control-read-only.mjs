#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();

async function source(relativePath) {
  return fs.readFile(path.join(ROOT, relativePath), "utf8");
}

function requireMatch(value, pattern, label) {
  if (!pattern.test(value)) {
    throw new Error(`CREATIVE_VIDEO_QUALITY_AUDIT_FAILED:${label}`);
  }
}

const [
  qualityRuntime,
  providerRuntime,
  pricingRuntime,
  shotRuntime,
  approvalGuard,
  instrumentation,
  migration,
] = await Promise.all([
  source("lib/creative/video/runtime/CreativeVideoQualityPreferenceRuntime.js"),
  source("lib/platform/service-runtime/providers/gemini/GeminiVeoProviderRuntime.js"),
  source("lib/platform/service-runtime/pricing/PricingRuntime.js"),
  source("lib/creative/shots/runtime/ShotRuntime.js"),
  source("lib/creative/video/runtime/CreativeApprovedVideoResolutionGuardRuntime.js"),
  source("instrumentation.js"),
  source("supabase/migrations/20260818115014_google_veo_resolution_pricing.sql"),
]);

requireMatch(qualityRuntime, /UHD_4K[\s\S]*resolution:\s*"4k"/, "4K_QUALITY_OPTION");
requireMatch(qualityRuntime, /\["4k",\s*"1080p",\s*"720p"\]/, "AUTO_BEST_ORDER");
requireMatch(providerRuntime, /SUPPORTED_RESOLUTIONS\s*=\s*new Set\(\["720p",\s*"1080p",\s*"4k"\]\)/, "VEO_4K_EXECUTION");
requireMatch(providerRuntime, /GEMINI_VEO_EXTENSION_REQUIRES_720P/, "VEO_EXTENSION_720P_GUARD");
requireMatch(pricingRuntime, /cost_per_unit_multiplier_by_resolution/, "RESOLUTION_PRICING_RUNTIME");
requireMatch(migration, /"4k"\s*:\s*1\.5/, "VEO_4K_PRICE_MULTIPLIER");
requireMatch(migration, /"supported_resolutions"\s*,\s*'\["720p","1080p","4k"\]'/, "VEO_SUPPORTED_RESOLUTIONS_METADATA");
requireMatch(shotRuntime, /applyProjectVideoQuality/, "SHOT_QUALITY_BINDING");
requireMatch(shotRuntime, /provider_parameters:[\s\S]*resolution:\s*definition\.resolution/, "SHOT_PROVIDER_RESOLUTION_BINDING");
requireMatch(approvalGuard, /CREATIVE_VIDEO_APPROVED_RESOLUTION_MISMATCH/, "APPROVED_RESOLUTION_MISMATCH_GUARD");
requireMatch(instrumentation, /CreativeApprovedVideoResolutionGuardRuntime/, "APPROVAL_GUARD_INSTALLED");
requireMatch(instrumentation, /CreativeVideoPricingContextRuntime/, "VIDEO_PRICING_CONTEXT_INSTALLED");

console.log(JSON.stringify({
  contract: "CREATIVE_VIDEO_QUALITY_CONVERGENCE_AUDIT_V1",
  read_only: true,
  passed: true,
  checks: [
    "manual_quality_options",
    "auto_best_resolution_order",
    "veo_4k_execution",
    "veo_extension_720p_guard",
    "resolution_pricing",
    "shot_quality_binding",
    "approval_resolution_binding",
    "runtime_installation",
  ],
}, null, 2));

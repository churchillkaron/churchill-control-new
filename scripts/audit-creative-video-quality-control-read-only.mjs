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

function rejectMatch(value, pattern, label) {
  if (pattern.test(value)) {
    throw new Error(`CREATIVE_VIDEO_QUALITY_AUDIT_FAILED:${label}`);
  }
}

async function migrationSources() {
  const directory = path.join(ROOT, "supabase/migrations");
  const names = await fs.readdir(directory);
  const relevant = names.filter((name) =>
    /video_provider|resolution_pricing/i.test(name),
  );
  if (!relevant.length) {
    throw new Error(
      "CREATIVE_VIDEO_QUALITY_AUDIT_FAILED:PROVIDER_CONFIGURATION_MIGRATIONS_REQUIRED",
    );
  }
  const contents = await Promise.all(
    relevant.map((name) => source(`supabase/migrations/${name}`)),
  );
  return contents.join("\n");
}

const [
  workspace,
  route,
  qualityRuntime,
  providerConfigurationRuntime,
  providerRuntime,
  pricingRuntime,
  shotRuntime,
  approvalGuard,
  instrumentation,
  migrations,
] = await Promise.all([
  source("components/creative/ProductionStudio/workspaces/ProductionWorkspace.jsx"),
  source("app/api/creative/projects/video-quality/route.js"),
  source("lib/creative/video/runtime/CreativeVideoQualityPreferenceRuntime.js"),
  source("lib/creative/video/runtime/CreativeVideoProviderConfigurationRuntime.js"),
  source("lib/platform/service-runtime/providers/gemini/GeminiVeoProviderRuntime.js"),
  source("lib/platform/service-runtime/pricing/PricingRuntime.js"),
  source("lib/creative/shots/runtime/ShotRuntime.js"),
  source("lib/creative/video/runtime/CreativeApprovedVideoResolutionGuardRuntime.js"),
  source("instrumentation.js"),
  migrationSources(),
]);

const genericRuntimeSources = [
  workspace,
  route,
  qualityRuntime,
  providerConfigurationRuntime,
  pricingRuntime,
  shotRuntime,
  approvalGuard,
].join("\n");

const staticProviderValueLiteral =
  /(["'`])(?:\d{3,4}p|\d+k|\d+:\d+|veo-[^"'`]+|google-veo|ai\.video\.generate)\1/i;
rejectMatch(
  genericRuntimeSources,
  staticProviderValueLiteral,
  "GENERIC_RUNTIME_CONTAINS_PROVIDER_VALUE_LITERAL",
);

requireMatch(
  workspace,
  /configuration\.auto_option[\s\S]*configuration\.resolution_options/,
  "UI_OPTIONS_FROM_PROVIDER_CONFIGURATION",
);
requireMatch(
  workspace,
  /\/api\/creative\/projects\/video-quality/,
  "UI_CONFIGURATION_API_BOUNDARY",
);
requireMatch(
  route,
  /resolveCreativeVideoProviderConfiguration/,
  "ROUTE_DYNAMIC_PROVIDER_CONFIGURATION",
);
requireMatch(
  route,
  /configuration\.video_capabilities\?\.auto_option\?\.id/,
  "ROUTE_CONFIGURED_AUTO_FALLBACK",
);
requireMatch(
  qualityRuntime,
  /profile\.resolution_options[\s\S]*profile\.auto_resolution_priority[\s\S]*profile\.supported_resolutions/,
  "QUALITY_RUNTIME_PROVIDER_PROFILE",
);
requireMatch(
  qualityRuntime,
  /dimensions_by_aspect_ratio/,
  "QUALITY_RUNTIME_CONFIGURED_DIMENSIONS",
);
requireMatch(
  providerConfigurationRuntime,
  /availableProductionCapabilities[\s\S]*resolveProvider[\s\S]*video_capabilities/,
  "PROVIDER_DISCOVERY_FROM_ENABLED_SERVICES",
);
requireMatch(
  providerConfigurationRuntime,
  /selection_priority/,
  "PROVIDER_SELECTION_PRIORITY_FROM_CONFIGURATION",
);

requireMatch(
  providerRuntime,
  /getProviderPricing/,
  "PROVIDER_EXECUTION_LOADS_ACTIVE_CONFIGURATION",
);
requireMatch(
  providerRuntime,
  /pricing\?\.metadata\?\.video_capabilities/,
  "PROVIDER_EXECUTION_USES_VIDEO_CAPABILITY_CONFIGURATION",
);
rejectMatch(
  providerRuntime,
  /const\s+(?:MODEL|SUPPORTED_RESOLUTIONS|SUPPORTED_ASPECT_RATIOS)\b/,
  "PROVIDER_EXECUTION_STATIC_CAPABILITY_TABLE",
);
rejectMatch(
  providerRuntime,
  /(["'`])(?:\d{3,4}p|\d+k|\d+:\d+)\1/i,
  "PROVIDER_EXECUTION_STATIC_QUALITY_VALUE",
);

requireMatch(
  pricingRuntime,
  /cost_per_unit_multiplier_by_resolution/,
  "PRICING_DIMENSION_CONFIGURATION",
);
requireMatch(
  pricingRuntime,
  /multipliers\[resolution\]/,
  "PRICING_OPAQUE_DIMENSION_LOOKUP",
);
requireMatch(
  shotRuntime,
  /resolveCreativeVideoProviderConfiguration[\s\S]*resolveCreativeVideoExecutionQuality/,
  "SHOT_DYNAMIC_QUALITY_BINDING",
);
requireMatch(
  shotRuntime,
  /provider_parameters:[\s\S]*resolution:\s*resolved\.resolution/,
  "SHOT_RESOLVED_PROVIDER_DIMENSION_BINDING",
);
requireMatch(
  approvalGuard,
  /requested\s*!==\s*approved/,
  "APPROVAL_EXACT_DIMENSION_MATCH",
);
requireMatch(
  instrumentation,
  /CreativeApprovedVideoResolutionGuardRuntime/,
  "APPROVAL_GUARD_INSTALLED",
);
requireMatch(
  instrumentation,
  /CreativeVideoPricingContextRuntime/,
  "PRICING_CONTEXT_INSTALLED",
);

for (const key of [
  "video_capabilities",
  "resolution_options",
  "auto_option",
  "selection_priority",
  "allowed_duration_seconds",
  "reference_image_limit",
  "cost_per_unit_multiplier_by_resolution",
]) {
  requireMatch(
    migrations,
    new RegExp(key),
    `DATABASE_CONFIGURATION_${key.toUpperCase()}`,
  );
}

console.log(JSON.stringify({
  contract: "CREATIVE_VIDEO_QUALITY_CONFIGURATION_AUDIT_V2",
  read_only: true,
  passed: true,
  checks: [
    "provider_options_not_hardcoded_in_ui_or_generic_runtime",
    "organization_service_provider_discovery",
    "provider_capability_configuration",
    "configured_auto_fallback",
    "configured_dimensions_and_constraints",
    "opaque_resolution_pricing",
    "shot_quality_binding",
    "approval_resolution_binding",
    "runtime_installation",
    "database_configuration_presence",
  ],
}, null, 2));

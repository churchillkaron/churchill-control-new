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

function sectionBetween(value, startMarker, endMarker, label) {
  const start = value.indexOf(startMarker);
  const end = value.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`CREATIVE_VIDEO_QUALITY_AUDIT_FAILED:${label}`);
  }
  return value.slice(start, end);
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
  approvalRoute,
  dispatchRoute,
  qualityRuntime,
  providerConfigurationRuntime,
  preflightRuntime,
  approvalRuntime,
  dispatchRuntime,
  approvedPreflightExecutionRuntime,
  servicePreflightRuntime,
  serviceExecutionRuntime,
  productionTaskRuntime,
  productionTaskRepository,
  providerRuntime,
  providerRegistration,
  pricingRuntime,
  shotRuntime,
  approvalGuard,
  instrumentation,
  migrations,
] = await Promise.all([
  source("components/creative/ProductionStudio/workspaces/ProductionWorkspace.jsx"),
  source("app/api/creative/projects/video-quality/route.js"),
  source("app/api/creative/projects/video-generation-approval/route.js"),
  source("app/api/creative/projects/video-generation-dispatch/route.js"),
  source("lib/creative/video/runtime/CreativeVideoQualityPreferenceRuntime.js"),
  source("lib/creative/video/runtime/CreativeVideoProviderConfigurationRuntime.js"),
  source("lib/creative/video/runtime/CreativeVideoGenerationPreflightRuntime.js"),
  source("lib/creative/video/runtime/CreativeVideoGenerationApprovalRuntime.js"),
  source("lib/creative/video/runtime/CreativeVideoGenerationDispatchRuntime.js"),
  source("lib/creative/video/runtime/CreativeApprovedVideoPreflightExecutionRuntime.js"),
  source("lib/platform/service-runtime/execution/ServiceExecutionPreflightRuntime.js"),
  source("lib/platform/service-runtime/execution/ServiceExecutionRuntime.js"),
  source("lib/operations/tasks/runtime/ProductionTaskRuntime.js"),
  source("lib/operations/tasks/repositories/ProductionTaskRepository.js"),
  source("lib/platform/service-runtime/providers/gemini/GeminiVeoProviderRuntime.js"),
  source("lib/platform/service-runtime/providers/gemini/GoogleVeoProviderRegistration.js"),
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
  preflightRuntime,
  servicePreflightRuntime,
  pricingRuntime,
  shotRuntime,
  approvalGuard,
].join("\n");

const approvalHandler = sectionBetween(
  workspace,
  "async function approveGeneration(",
  "async function startGeneration(",
  "UI_APPROVAL_HANDLER_BOUNDARY_REQUIRED",
);

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
  workspace,
  /\/api\/creative\/projects\/video-generation-approval/,
  "UI_GENERATION_APPROVAL_API_BOUNDARY",
);
requireMatch(
  workspace,
  /preflight\.customer_price[\s\S]*preflight\.preflight_sha256/,
  "UI_EXACT_PREFLIGHT_PRICE_AND_HASH",
);
requireMatch(
  workspace,
  /Approve generation/,
  "UI_EXPLICIT_GENERATION_APPROVAL",
);
requireMatch(
  workspace,
  /Start generation/,
  "UI_EXPLICIT_SEPARATE_GENERATION_START",
);
requireMatch(
  workspace,
  /inspection\?\.can_dispatch\s*!==\s*true/,
  "UI_DISPATCH_REQUIRES_SERVER_PERMISSION",
);
requireMatch(
  workspace,
  /\/api\/creative\/projects\/video-generation-dispatch/,
  "UI_DISPATCH_API_BOUNDARY",
);
rejectMatch(
  approvalHandler,
  /startGeneration\(|video-generation-dispatch/i,
  "UI_APPROVAL_MUST_NOT_AUTO_DISPATCH",
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
  route,
  /ProductionTaskRuntime\.list/,
  "QUALITY_ROUTE_TASK_LIST_FOR_AUTHORIZATION_LOCK",
);
requireMatch(
  route,
  /media_generation_authorization/,
  "QUALITY_ROUTE_TASK_AUTHORIZATION_EVIDENCE",
);
requireMatch(
  route,
  /tasks\.some\(activeTaskGenerationAuthorization\)/,
  "QUALITY_ROUTE_TASK_AUTHORIZATION_LOCK",
);
requireMatch(
  route,
  /await generationAuthorizationLocked/,
  "QUALITY_ROUTE_SERVER_LOCK_ENFORCED",
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
  preflightRuntime,
  /ProductionTaskRuntime\.get[\s\S]*CreativeProjectRuntime\.get/,
  "PREFLIGHT_TASK_PROJECT_BOUNDARY",
);
requireMatch(
  preflightRuntime,
  /resolveCreativeVideoProviderConfiguration[\s\S]*resolveCreativeVideoExecutionQuality/,
  "PREFLIGHT_CONFIGURED_PROVIDER_AND_QUALITY",
);
requireMatch(
  preflightRuntime,
  /PricingRuntime\.resolveById[\s\S]*pricing_dimensions[\s\S]*resolution/,
  "PREFLIGHT_EXACT_PRICING_DIMENSIONS",
);
requireMatch(
  preflightRuntime,
  /preflight_sha256:\s*digest\(preflight\)/,
  "PREFLIGHT_DETERMINISTIC_HASH",
);
rejectMatch(
  preflightRuntime,
  /executeProvider|\.dispatch\(/,
  "PREFLIGHT_MUST_NOT_EXECUTE_PROVIDER",
);

requireMatch(
  approvalRoute,
  /preflight_sha256/,
  "APPROVAL_ROUTE_REQUIRES_REVIEWED_PREFLIGHT_HASH",
);
requireMatch(
  approvalRoute,
  /CreativeVideoGenerationApprovalRuntime\.approve/,
  "APPROVAL_ROUTE_TASK_BOUND_RUNTIME",
);
rejectMatch(
  approvalRoute,
  /\.dispatch\(|executeProvider|runAIService\.execute/,
  "APPROVAL_ROUTE_MUST_NOT_EXECUTE_GENERATION",
);

requireMatch(
  approvalRuntime,
  /CREATIVE_VIDEO_PREFLIGHT_STALE_REVIEW_REQUIRED/,
  "APPROVAL_REJECTS_STALE_PREFLIGHT",
);
requireMatch(
  approvalRuntime,
  /findCurrentApproval[\s\S]*PRODUCTION_DOSSIER/,
  "APPROVAL_REQUIRES_CURRENT_DOSSIER_APPROVAL",
);
requireMatch(
  approvalRuntime,
  /maximum_customer_price:\s*preflight\.customer_price/,
  "APPROVAL_EXACT_PRICE_GUARD",
);
requireMatch(
  approvalRuntime,
  /video_generation_preflight:\s*preflight/,
  "APPROVAL_EMBEDS_EXACT_PREFLIGHT",
);
requireMatch(
  approvalRuntime,
  /preflight_sha256:\s*preflight\.preflight_sha256/,
  "APPROVAL_EMBEDS_PREFLIGHT_HASH",
);
requireMatch(
  approvalRuntime,
  /publication_authorized:\s*false/,
  "APPROVAL_DOES_NOT_AUTHORIZE_PUBLICATION",
);
requireMatch(
  approvalRuntime,
  /authorization_consumed/,
  "APPROVAL_INSPECTION_PRESERVES_CONSUMED_STATE",
);
rejectMatch(
  approvalRuntime,
  /\.dispatch\(|executeProvider|runAIService\.execute/,
  "APPROVAL_RUNTIME_MUST_NOT_EXECUTE_GENERATION",
);

requireMatch(
  dispatchRoute,
  /CreativeVideoGenerationDispatchRuntime\.dispatch/,
  "DISPATCH_ROUTE_CONTROLLED_RUNTIME",
);
requireMatch(
  dispatchRoute,
  /requiredAnyPermission[\s\S]*creative\.execute[\s\S]*creative\.production\.run/,
  "DISPATCH_ROUTE_PERMISSION_GUARD",
);
requireMatch(
  dispatchRoute,
  /preflight_sha256/,
  "DISPATCH_ROUTE_REQUIRES_REVIEWED_PREFLIGHT_HASH",
);

requireMatch(
  dispatchRuntime,
  /CreativeVideoGenerationPreflightRuntime\.resolve/,
  "DISPATCH_FRESH_PREFLIGHT_REVALIDATION",
);
requireMatch(
  dispatchRuntime,
  /PREFLIGHT_DRIFT_REAPPROVAL_REQUIRED/,
  "DISPATCH_FAILS_ON_PREFLIGHT_DRIFT",
);
requireMatch(
  dispatchRuntime,
  /ProductionTaskRuntime\.claimForDispatch/,
  "DISPATCH_ATOMIC_TASK_CLAIM",
);
requireMatch(
  dispatchRuntime,
  /expected_status:\s*PRODUCTION_TASK_STATUS\.WAITING/,
  "DISPATCH_ONLY_CLAIMS_WAITING_TASK",
);
requireMatch(
  dispatchRuntime,
  /consumed:\s*true[\s\S]*consumed_at:/,
  "DISPATCH_CONSUMES_AUTHORIZATION_BEFORE_EXECUTION",
);
requireMatch(
  dispatchRuntime,
  /ProductionTaskRuntime\.dispatchClaimed/,
  "DISPATCH_USES_CLAIMED_ONLY_EXECUTION",
);
requireMatch(
  dispatchRuntime,
  /publication_authorized:\s*false/,
  "DISPATCH_DOES_NOT_AUTHORIZE_PUBLICATION",
);

requireMatch(
  productionTaskRepository,
  /claimForDispatch[\s\S]*\.eq\("status",\s*expected_status\)[\s\S]*\.is\("worker_id",\s*null\)/,
  "TASK_REPOSITORY_COMPARE_AND_SET_DISPATCH_CLAIM",
);
requireMatch(
  productionTaskRuntime,
  /dispatchClaimed[\s\S]*executeClaimedTask/,
  "TASK_RUNTIME_CLAIMED_ONLY_EXECUTION",
);
rejectMatch(
  productionTaskRuntime,
  /durationPricedCapabilities|ai\.video\.generate|ai\.music\.generate|ai\.sfx\.generate/,
  "TASK_RUNTIME_MUST_NOT_HARDCODE_DURATION_PRICED_CAPABILITIES",
);

requireMatch(
  approvedPreflightExecutionRuntime,
  /video_generation_preflight[\s\S]*serviceExecutionPreflight/,
  "EXECUTION_CONSUMES_APPROVED_PREFLIGHT",
);
requireMatch(
  approvedPreflightExecutionRuntime,
  /provider_id:\s*bound\.preflight\.provider[\s\S]*quantity:\s*bound\.preflight\.quantity/,
  "EXECUTION_USES_APPROVED_PROVIDER_AND_QUANTITY",
);
requireMatch(
  servicePreflightRuntime,
  /approved_execution_preflight[\s\S]*pricing_id[\s\S]*customer_price/,
  "SERVICE_PREFLIGHT_REVALIDATES_APPROVAL",
);
requireMatch(
  serviceExecutionRuntime,
  /await walletGate\([\s\S]*await executeProvider\(/,
  "SERVICE_WALLET_RESERVATION_PRECEDES_PROVIDER_EXECUTION",
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
  providerRegistration,
  /capabilities:\s*\[\s*\]/,
  "PROVIDER_REGISTRATION_TRANSPORT_ONLY_CAPABILITIES",
);
for (const operationalKey of [
  "supported_models",
  "quality_score",
  "speed_score",
  "reliability_score",
  "precision_controls",
  "native_audio",
  "max_reference_images",
]) {
  rejectMatch(
    providerRegistration,
    new RegExp(`\\b${operationalKey}\\b`),
    `PROVIDER_REGISTRATION_OPERATIONAL_VALUE_${operationalKey.toUpperCase()}`,
  );
}

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
  /CreativeApprovedVideoPreflightExecutionRuntime/,
  "APPROVED_PREFLIGHT_EXECUTION_INSTALLED",
);
requireMatch(
  instrumentation,
  /ServiceExecutionApprovedPreflightRuntime/,
  "SERVICE_APPROVED_PREFLIGHT_INSTALLED",
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
  contract: "CREATIVE_VIDEO_QUALITY_CONFIGURATION_AUDIT_V4",
  read_only: true,
  passed: true,
  checks: [
    "provider_options_not_hardcoded_in_ui_or_generic_runtime",
    "organization_service_provider_discovery",
    "provider_capability_configuration",
    "provider_registration_transport_only",
    "configured_auto_fallback",
    "configured_dimensions_and_constraints",
    "opaque_resolution_pricing",
    "shot_quality_binding",
    "task_bound_preflight",
    "stale_preflight_rejection",
    "dossier_approval_dependency",
    "seal_only_generation_approval",
    "separate_explicit_generation_start",
    "task_authorization_quality_lock",
    "consumed_authorization_lifecycle",
    "fresh_preflight_dispatch_revalidation",
    "atomic_one_shot_dispatch_claim",
    "claimed_only_task_execution",
    "wallet_reservation_before_provider_execution",
    "approved_service_execution_preflight",
    "approval_resolution_binding",
    "runtime_installation",
    "database_configuration_presence",
  ],
}, null, 2));

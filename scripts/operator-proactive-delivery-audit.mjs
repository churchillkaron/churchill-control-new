import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  policySource,
  runtimeSource,
  batchSource,
  cronSource,
  settingsSource,
  uiSource,
  workspaceSource,
] = await Promise.all([
  readFile("lib/operator/contracts/OperatorProactiveDeliveryPolicy.js", "utf8"),
  readFile("lib/operator/runtime/OperatorProactiveDeliveryRuntime.js", "utf8"),
  readFile("lib/operator/runtime/OperatorProactiveDeliveryBatchRuntime.js", "utf8"),
  readFile("app/api/internal/operator/autonomous-watch/process/route.js", "utf8"),
  readFile("app/api/operator/autonomous-watch/settings/route.js", "utf8"),
  readFile("components/operator/SyntheticIntelligenceDeliveryControl.jsx", "utf8"),
  readFile("app/(system)/workspace/[organizationId]/page.jsx", "utf8"),
]);

assert.match(policySource, /OPERATOR_PROACTIVE_DELIVERY_CHANNELS/);
assert.match(policySource, /communication\.email\.send/);
assert.match(policySource, /communication\.whatsapp\.send/);
assert.match(policySource, /communication\.line\.send/);
assert.match(policySource, /service_id:\s*"email"/);
assert.match(policySource, /service_id:\s*"whatsapp"/);
assert.match(policySource, /service_id:\s*"line"/);
assert.match(policySource, /explicit_owner_opt_in/);
assert.match(policySource, /automatic_recipient_inference:\s*false/);
assert.match(policySource, /SECRET_KEY_PATTERN/);
assert.match(policySource, /must not contain provider credentials or secrets/);
assert.match(policySource, /At least one explicit proactive delivery channel is required/);
assert.match(policySource, /maskOperatorProactiveDeliveryDestination/);
assert.match(policySource, /default_minimum_level/);

assert.match(runtimeSource, /ServiceExecutionRuntime/);
assert.match(runtimeSource, /ServiceExecutionRuntime\.execute/);
assert.match(runtimeSource, /OPERATOR_PROACTIVE_ALERT/);
assert.match(runtimeSource, /AVANTIQO_SYNTHETIC_INTELLIGENCE_WATCH/);
assert.match(runtimeSource, /recommendation_is_not_authorization:\s*true/);
assert.match(runtimeSource, /DELIVERY_LEASE_MS = 10 \* 60 \* 1000/);
assert.match(runtimeSource, /claim_token/);
assert.match(runtimeSource, /lease_expires_at/);
assert.match(runtimeSource, /ACTIVE_DELIVERY_LEASE/);
assert.match(runtimeSource, /ALREADY_DELIVERED/);
assert.match(runtimeSource, /dedupe_key/);
assert.match(runtimeSource, /attempt_count/);
assert.match(runtimeSource, /status:\s*"delivering"/);
assert.match(runtimeSource, /status:\s*error \? "failed" : "delivered"/);
assert.match(runtimeSource, /queueOperatorProactiveDelivery/);
assert.match(runtimeSource, /deliverPendingOperatorProactiveAlert/);
assert.match(runtimeSource, /Recommendation is not authorization/);
assert.doesNotMatch(runtimeSource, /fetch\(/);
assert.doesNotMatch(runtimeSource, /executeProvider/);
assert.doesNotMatch(runtimeSource, /ProviderExecutor/);
assert.doesNotMatch(runtimeSource, /access_token/);
assert.doesNotMatch(runtimeSource, /service_role/i);

assert.match(batchSource, /queueOperatorProactiveDelivery/);
assert.match(batchSource, /deliverPendingOperatorProactiveAlert/);
assert.match(batchSource, /pendingInAppAlert/);
assert.match(batchSource, /prepareExternalAlert/);
assert.match(batchSource, /EXTERNAL_DELIVERY_NOT_QUEUED/);
assert.match(batchSource, /runOperatorProactiveDeliveryForWatchResults/);
assert.match(batchSource, /OPERATOR_PROACTIVE_DELIVERY/);
assert.doesNotMatch(batchSource, /fetch\(/);
assert.doesNotMatch(batchSource, /ServiceExecutionRuntime/);

assert.match(cronSource, /runOperatorAutonomousWatchBatch/);
assert.match(cronSource, /runOperatorProactiveDeliveryForWatchResults/);
assert.match(cronSource, /watchResults:\s*watch\.results/);
assert.match(cronSource, /proactive_delivery/);
assert.match(cronSource, /CRON_SECRET/);
assert.match(cronSource, /maxDuration = 300/);

assert.match(settingsSource, /normalizeOperatorProactiveDeliveryPolicySource/);
assert.match(settingsSource, /operatorProactiveDeliveryPublicPolicy/);
assert.match(settingsSource, /operatorProactiveDeliveryStatus/);
assert.match(settingsSource, /operatorProactiveDeliveryChannelCatalog/);
assert.match(settingsSource, /OrganizationServiceRuntime/);
assert.match(settingsSource, /ready_for_execution/);
assert.match(settingsSource, /revealDestinations/);
assert.match(settingsSource, /delivery_policy/);
assert.match(settingsSource, /strict:\s*true/);
assert.match(settingsSource, /FULL_ACCESS_ROLES/);
assert.match(settingsSource, /Organization owner access is required/);
assert.match(settingsSource, /OWNER_DISABLED_PROACTIVE_DELIVERY/);
assert.match(settingsSource, /pending_alert:\s*null/);
assert.match(settingsSource, /channels:\s*\{\}/);
assert.doesNotMatch(settingsSource, /access_token/);
assert.doesNotMatch(settingsSource, /refresh_token/);
assert.doesNotMatch(settingsSource, /service_role/i);

assert.match(uiSource, /data-avantiqo-synthetic-intelligence-delivery-control="true"/);
assert.match(uiSource, /Offline intelligence alerts/);
assert.match(uiSource, /Off by default/);
assert.match(uiSource, /never infers a recipient/i);
assert.match(uiSource, /Email/);
assert.match(uiSource, /WhatsApp/);
assert.match(uiSource, /LINE/);
assert.match(uiSource, /Connected service ready/);
assert.match(uiSource, /Connected service required/);
assert.match(uiSource, /Save offline alerts/);
assert.match(uiSource, /Recommendations never authorize execution/);
assert.match(uiSource, /organization owner access required/i);
assert.match(uiSource, /delivery_policy/);
assert.match(uiSource, /avantiqo:home-command/);
assert.doesNotMatch(uiSource, /access_token/);
assert.doesNotMatch(uiSource, /api_key/i);

assert.match(workspaceSource, /SyntheticIntelligenceDeliveryControl/);
assert.match(workspaceSource, /organizationId=\{organizationId\}/);
assert.match(workspaceSource, /role=\{role\}/);

console.log("OPERATOR_PROACTIVE_DELIVERY_AUDIT=PASS");
console.log("OPERATOR_PROACTIVE_DELIVERY=OWNER_OPT_IN_GOVERNED");
console.log("OPERATOR_PROACTIVE_DELIVERY_PROVIDER_CALLS=SERVICE_RUNTIME_ONLY");
console.log("OPERATOR_PROACTIVE_DELIVERY_RECIPIENT_INFERENCE=DISABLED");
console.log("OPERATOR_PROACTIVE_DELIVERY_CHANNELS=EMAIL_WHATSAPP_LINE");
console.log("OPERATOR_PROACTIVE_DELIVERY_RETRY=LEASE_DEDUPED");
console.log("OPERATOR_PROACTIVE_DELIVERY_DISABLE=CANCELS_QUEUED_SENDS");

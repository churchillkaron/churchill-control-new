import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = async (...paths) => Promise.all(paths.map((path) =>
  readFile(new URL("../" + path, import.meta.url), "utf8")
));

const [
  portal,
  capabilityContractRuntime,
  apiContract,
  tokenRuntime,
  webhookRuntime,
  credentialRoute,
  environmentRoute,
  webhookRoute,
  retryRoute,
  replayRoute,
  webhookTestRoute,
  gateway,
  controlPlane,
  apiExplorer,
  apiExplorerPage,
  developerOverview,
  migrationControl,
  migrationRate,
  migrationSecurity,
  migrationRotation,
  migrationOutbox,
  migrationQuota,
  migrationQuotaAtomic,
  migrationEnvironmentRate,
  migrationIdempotency,
  usagePage,
  contractExport,
  sdkRoute,
  openApiRoute,
  sdkPage,
  docsPage,
  quickstartClient,
  logsRoute,
  logsClient,
  logsPage,
  migrationRetryLeases,
  migrationRetryLeaseRecovery,
  migrationWebhookEnvironmentScope,
  migrationOperationsWebhookProjection,
  migrationOperationsWebhookProjectionConflictFix,
  migrationWebhookManualReplays,
  retryWorkerRoute,
  operationsWebhookWorkerRoute,
  vercelConfig,
] = await files(
  "lib/developer/DeveloperPortalRuntime.js",
  "lib/developer/DeveloperCapabilityContractRuntime.js",
  "lib/developer/DeveloperApiContract.js",
  "lib/developer/DeveloperApiTokenRuntime.js",
  "lib/developer/DeveloperWebhookRuntime.js",
  "app/api/developers/credentials/route.js",
  "app/api/developers/environments/route.js",
  "app/api/developers/webhooks/route.js",
  "app/api/developers/webhooks/retry/route.js",
  "app/api/developers/webhooks/replay/route.js",
  "app/api/developers/webhooks/test/route.js",
  "app/api/developer/v1/operations/[capabilityId]/route.js",
  "components/workspace/developer/DeveloperControlPlaneClient.jsx",
  "components/workspace/developer/DeveloperApiExplorer.jsx",
  "app/(system)/workspace/[organizationId]/developers/api-explorer/page.jsx",
  "app/(system)/workspace/[organizationId]/developers/page.jsx",
  "supabase/migrations/20260920193000_developer_control_plane.sql",
  "supabase/migrations/20260920201000_developer_api_observability_rate_limits.sql",
  "supabase/migrations/20260920211000_developer_security_audit_webhook_rotation.sql",
  "supabase/migrations/20260920212000_developer_api_credential_atomic_rotation.sql",
  "supabase/migrations/20260920213000_developer_webhook_event_outbox.sql",
  "supabase/migrations/20260920214500_developer_environment_quotas.sql",
  "supabase/migrations/20260920215500_developer_quota_atomic_enforcement.sql",
  "supabase/migrations/20260920220500_developer_environment_rate_limit.sql",
  "supabase/migrations/20260920222000_developer_api_idempotency_ledger.sql",
  "app/(system)/workspace/[organizationId]/developers/usage/page.jsx",
  "lib/developer/DeveloperContractExportRuntime.js",
  "app/api/developers/sdk/route.js",
  "app/api/developers/contracts/openapi/route.js",
  "app/(system)/workspace/[organizationId]/developers/sdks/page.jsx",
  "app/(system)/workspace/[organizationId]/developers/docs/page.jsx",
  "components/workspace/developer/DeveloperQuickstartClient.jsx",
  "app/api/developers/logs/route.js",
  "components/workspace/developer/DeveloperLogsExplorer.jsx",
  "app/(system)/workspace/[organizationId]/developers/logs/page.jsx",
  "supabase/migrations/20260920225000_developer_webhook_retry_leases.sql",
  "supabase/migrations/20260920225500_developer_webhook_retry_lease_recovery.sql",
  "supabase/migrations/20260920230500_developer_webhook_environment_scope.sql",
  "supabase/migrations/20260920232000_developer_operations_webhook_projection.sql",
  "supabase/migrations/20260920232500_developer_operations_webhook_projection_conflict_fix.sql",
  "supabase/migrations/20260920234000_developer_webhook_manual_replays.sql",
  "app/api/internal/developer/webhooks/retries/process/route.js",
  "app/api/internal/developer/webhooks/operations/process/route.js",
  "vercel.json",
);

test("developer credentials are bounded, hashed, rotatable and revocable", () => {
  assert.match(portal, /defaultDays = production \? 30 : 90/);
  assert.match(portal, /maxDays = production \? 90 : 365/);
  assert.match(credentialRoute, /createHash\("sha256"\)/);
  assert.match(credentialRoute, /rotate_developer_api_credential/);
  assert.match(credentialRoute, /credential\.rotated/);
  assert.match(credentialRoute, /credential\.revoked/);
  assert.match(migrationRotation, /status = 'REVOKED'/);
  assert.match(migrationRotation, /insert into public\.developer_api_credentials/);
  assert.doesNotMatch(migrationControl, /token\s+text/i);
});

test("credential scope catalog exposes canonical least-privilege group and capability authority", () => {
  assert.match(portal, /developerCredentialScopeCatalog/);
  assert.match(portal, /operations\.\$\{group\}\.\*/);
  assert.match(portal, /operations\.\$\{group\}\.\$\{action\}/);
  assert.match(portal, /operations\.\$\{capability\.id\}\.\*/);
  assert.match(portal, /operations\.\$\{capability\.id\}\.\$\{action\}/);
  assert.match(portal, /resolveOperationsCommandAction/);
  assert.match(credentialRoute, /scope_catalog: developerCredentialScopeCatalog\(access\)/);
  assert.match(controlPlane, /Choose the smallest scopes this integration actually needs/);
  assert.match(controlPlane, /Search capability, group, action or scope/);
  assert.match(controlPlane, /64 selected/);
  assert.match(controlPlane, /scopeKind/);
});

test("development and staging machine identities are read-only until sandbox isolation exists", () => {
  assert.match(portal, /validateDeveloperEnvironmentCredentialScopes/);
  assert.match(portal, /isReadOnlyDeveloperCredentialScope/);
  assert.match(portal, /Development and staging credentials are read-only until an isolated sandbox data plane is configured/);
  assert.match(credentialRoute, /validateDeveloperEnvironmentCredentialScopes/);
  assert.match(gateway, /Development and staging Developer API environments are read-only until an isolated sandbox data plane is configured/);
  assert.match(controlPlane, /Development and Staging credentials are read-only against the live organization data plane/);
  assert.match(controlPlane, /productionEnvironmentSelected \|\| isReadOnlyDeveloperScope/);
  assert.match(docsPage, /Business mutations and live business-event delivery require Production/);
});

test("production environment creation and activation require explicit confirmation", () => {
  assert.match(environmentRoute, /CREATE PRODUCTION/);
  assert.match(environmentRoute, /ENABLE PRODUCTION/);
  assert.match(environmentRoute, /initialStatus = key === "production" \? "DISABLED" : "ACTIVE"/);
  assert.match(environmentRoute, /Developer environment already exists; use status control instead/);
  assert.match(environmentRoute, /Production reactivation would restore existing integrations; explicit acknowledgement required/);
  assert.match(environmentRoute, /acknowledge_reactivation/);
  assert.match(environmentRoute, /reactivation_impact/);
  assert.doesNotMatch(environmentRoute, /\.upsert\(/);
  assert.match(portal, /expires_at/);
  assert.match(controlPlane, /Production controls live machine authority/);
  assert.match(controlPlane, /Re-enable \{row\.active_credentials\} active credential/);
  assert.match(controlPlane, /productionReactivateExisting/);
  assert.match(controlPlane, /CREATE PRODUCTION/);
  assert.match(controlPlane, /ENABLE PRODUCTION/);
  assert.match(docsPage, /creates the environment disabled/);
  assert.match(docsPage, /reactivation also requires explicit acknowledgement/);
  assert.match(docsPage, /Repeating create cannot enable an existing environment/);
});

test("developer environments are runtime kill switches", () => {
  assert.match(environmentRoute, /status must be ACTIVE or DISABLED/);
  assert.match(environmentRoute, /environment\.disabled/);
  assert.match(tokenRuntime, /Developer environment disabled/);
  assert.match(webhookRuntime, /environment\?\.status === "ACTIVE"/);
  assert.match(controlPlane, /"ACTIVE" \? "Disable" : "Enable"/);
  assert.match(controlPlane, /setStatus\(row, row\.status === "ACTIVE" \? "DISABLED" : "ACTIVE"\)/);
});

test("machine API is scoped, rate limited and observable", () => {
  assert.match(tokenRuntime, /avq_/);
  assert.match(tokenRuntime, /claim_developer_api_rate_limit/);
  assert.match(tokenRuntime, /developer_api_requests/);
  assert.match(gateway, /authorizeOperationsAccess/);
  assert.match(gateway, /x-ratelimit-limit/);
  assert.match(gateway, /x-ratelimit-remaining/);
  assert.match(gateway, /x-ratelimit-reset/);
  assert.match(gateway, /x-avantiqo-monthly-reset/);
  assert.match(gateway, /retry-after/);
  assert.match(gateway, /x-request-id/);
  assert.match(gateway, /x-avantiqo-api-version/);
  assert.match(gateway, /x-avantiqo-environment/);
  assert.match(migrationRate, /developer_api_rate_buckets/);
  assert.match(migrationRate, /developer_api_requests/);
});

test("environment quotas are aggregate, atomic and visible", () => {
  assert.match(environmentRoute, /environment\.policy_updated/);
  assert.match(environmentRoute, /requests_per_minute must be between 1 and 10000/);
  assert.match(tokenRuntime, /claim_developer_environment_rate_limit/);
  assert.match(tokenRuntime, /claim_developer_environment_quota/);
  assert.match(gateway, /ENVIRONMENT_RATE_LIMIT_EXCEEDED/);
  assert.match(gateway, /MONTHLY_QUOTA_EXCEEDED/);
  assert.match(gateway, /x-avantiqo-monthly-limit/);
  assert.match(migrationQuota, /developer_api_monthly_usage/);
  assert.match(migrationQuotaAtomic, /DEVELOPER_ACTIVE_CREDENTIAL_LIMIT_REACHED/);
  assert.match(migrationQuotaAtomic, /DEVELOPER_ACTIVE_WEBHOOK_LIMIT_REACHED/);
  assert.match(migrationEnvironmentRate, /developer_environment_rate_buckets/);
  assert.match(migrationEnvironmentRate, /where buckets\.request_count < p_limit/);
  assert.match(credentialRoute, /Active credential limit reached for this environment/);
  assert.match(webhookRoute, /Active webhook limit reached for this environment/);
  assert.match(controlPlane, /Save policy/);
  assert.match(usagePage, /Monthly remaining/);
});

test("usage surfaces proactive quota and integration-capacity warnings", () => {
  assert.match(usagePage, /Monthly Developer API quota is above 80%/);
  assert.match(usagePage, /Active credential capacity is above 80%/);
  assert.match(usagePage, /Active webhook capacity is above 80%/);
  assert.match(usagePage, /Monthly Developer API requests are disabled by policy/);
  assert.match(usagePage, /Webhook creation is disabled by environment policy/);
  assert.match(usagePage, /monthly_request_limit == null/);
  assert.match(usagePage, /CapacityBar/);
  assert.match(usagePage, /Monthly requests/);
  assert.match(usagePage, /Credential slots/);
  assert.match(usagePage, /Webhook slots/);
});

test("external mutation bodies are bounded and content typed before business execution", () => {
  assert.match(apiContract, /DEVELOPER_MUTATION_MAX_BODY_BYTES = 256 \* 1024/);
  assert.match(gateway, /DEVELOPER_MUTATION_MAX_BODY_BYTES/);
  assert.match(gateway, /Content-Type must be application\/json/);
  assert.match(gateway, /Request body exceeds 256 KiB/);
  assert.match(gateway, /JSON request body must be an object/);
  assert.match(gateway, /Request body must contain valid JSON/);
  assert.match(contractExport, /Request body exceeds the 256 KiB mutation limit/);
  assert.match(contractExport, /Content-Type must be application\/json/);
  assert.match(docsPage, /stay within 256 KiB/);
});

test("external mutations are replay-safe through a durable idempotency ledger", () => {
  assert.match(tokenRuntime, /developerMutationRequestHash/);
  assert.match(tokenRuntime, /claim_developer_api_idempotency/);
  assert.match(tokenRuntime, /settle_developer_api_idempotency/);
  assert.match(gateway, /Idempotency-Key must be between 8 and 200 characters/);
  assert.match(gateway, /Idempotency key was already used for a different request/);
  assert.match(gateway, /already in progress/);
  assert.match(gateway, /x-avantiqo-idempotent-replay/);
  assert.match(migrationIdempotency, /unique \(organization_id, environment_id, idempotency_key\)/);
  assert.match(migrationIdempotency, /state in \('IN_PROGRESS','SETTLED'\)/);
  assert.match(migrationIdempotency, /interval '24 hours'/);
  assert.match(contractExport, /required: true/);
  assert.match(contractExport, /createIdempotencyKey/);
  assert.match(contractExport, /verifyWebhookSignature/);
  assert.match(contractExport, /verify_webhook_signature/);
  assert.match(contractExport, /constantTimeHexEqual/);
  assert.match(contractExport, /hmac\.compare_digest/);
  assert.match(contractExport, /AvantiqoApiError/);
  assert.match(docsPage, /24-hour replay ledger/);
});

test("developer logs are searchable, filterable, paginated and surface stuck mutations", () => {
  assert.match(logsRoute, /request_before/);
  assert.match(logsRoute, /security_before/);
  assert.match(logsRoute, /status === "failed"/);
  assert.match(logsRoute, /environment_id/);
  assert.match(logsRoute, /requests_has_more/);
  assert.match(logsRoute, /security_has_more/);
  assert.match(logsClient, /Search capability, command, error or security action/);
  assert.match(logsClient, /Load more requests/);
  assert.match(logsClient, /Load more security activity/);
  assert.match(logsClient, /Idempotency key recorded/);
  assert.match(portal, /developerIdempotencyHealth/);
  assert.match(logsPage, /Stale mutation claims/);
  assert.match(logsPage, /will not auto-retry or recycle/);
});

test("webhooks use Vault, block private destinations and retain replayable events", () => {
  assert.match(migrationControl, /vault\.create_secret/);
  assert.match(webhookRuntime, /WEBHOOK_PRIVATE_DESTINATION_BLOCKED/);
  assert.match(webhookRuntime, /httpsRequest/);
  assert.match(webhookRuntime, /lookup: \(_hostname, options, callback\)/);
  assert.match(webhookRuntime, /target\.records\.map/);
  assert.match(webhookRuntime, /normalized\.startsWith\("::ffff:"\)/);
  assert.match(webhookRuntime, /servername: target\.url\.hostname/);
  assert.match(webhookRuntime, /nonPublicIpv4/);
  assert.match(webhookRuntime, /developer_webhook_events/);
  assert.match(webhookRuntime, /event_record_id/);
  assert.match(webhookRuntime, /retryDeveloperWebhookDelivery/);
  assert.match(webhookRuntime, /MAX_WEBHOOK_ATTEMPTS = 20/);
  assert.match(retryRoute, /webhook\.delivery_retried/);
  assert.match(migrationOutbox, /interval '30 days'/);
  assert.match(migrationOutbox, /purge_expired_developer_webhook_events/);
});

test("webhook events and fanout are strictly environment scoped", () => {
  assert.match(webhookRuntime, /DEVELOPER_WEBHOOK_ENVIRONMENT_REQUIRED/);
  assert.match(webhookRuntime, /DEVELOPER_WEBHOOK_ENVIRONMENT_MISMATCH/);
  assert.match(webhookRuntime, /\.eq\("environment_id", resolvedEnvironmentId\)/);
  assert.match(webhookRuntime, /environment_id: environmentId/);
  assert.match(webhookRuntime, /event\.environment_id && event\.environment_id !== endpoint\.environment_id/);
  assert.match(webhookRuntime, /x-avantiqo-environment/);
  assert.match(webhookTestRoute, /environmentId: body\.environment_id \|\| body\.environmentId \|\| null/);
  assert.match(webhookTestRoute, /contractError \? 400 : 500/);
  assert.match(migrationWebhookEnvironmentScope, /add column if not exists environment_id/);
  assert.match(migrationWebhookEnvironmentScope, /developer_webhook_events_org_environment_time_idx/);
  assert.match(docsPage, /Development and Staging accept explicit developer\.test events only/);
  assert.match(docsPage, /Production may subscribe to specific canonical Operations events or an explicit wildcard/);
});

test("webhook subscriptions are canonical and environment constrained", () => {
  assert.match(portal, /developerWebhookEventCatalog/);
  assert.match(portal, /operations\.\$\{capability\.id\}\.\$\{command\}/);
  assert.match(portal, /validateDeveloperWebhookEventTypes/);
  assert.match(portal, /Development and staging webhooks accept developer\.test only/);
  assert.match(webhookRoute, /event_catalog: developerWebhookEventCatalog\(\)/);
  assert.match(webhookRoute, /projection_health/);
  assert.match(webhookRoute, /dead_letter: projectionRows\.filter/);
  assert.match(webhookRoute, /action === "subscriptions"/);
  assert.match(webhookRoute, /webhook\.subscriptions_updated/);
  assert.match(controlPlane, /Event subscriptions/);
  assert.match(controlPlane, /All Production Operations events \(\*\)/);
  assert.match(controlPlane, /Apply selected subscriptions/);
  assert.match(controlPlane, /Business event bridge/);
  assert.match(controlPlane, /Business-event webhook projection needs attention/);
  assert.match(docsPage, /Live business events originate from the immutable committed Operations event stream/);
});

test("committed Operations events project to Production developer webhooks through a durable lease", () => {
  assert.match(webhookRuntime, /processDeveloperOperationsWebhookProjections/);
  assert.match(webhookRuntime, /claim_developer_operations_webhook_projections/);
  assert.match(webhookRuntime, /sourceEventId = `operations:\$\{row\.operations_event_id\}`/);
  assert.match(webhookRuntime, /environment\?\.environment_key === "production"/);
  assert.match(webhookRuntime, /new Date\(endpoint\.created_at\)\.getTime\(\) <= sourceOccurredAt/);
  assert.match(webhookRuntime, /types\.includes\("\*"\) \|\| types\.includes\(row\.event_type\)/);
  assert.match(webhookRuntime, /ensured\.delivery\.status !== "PENDING"/);
  assert.match(migrationOperationsWebhookProjection, /developer_webhook_delivery_event_endpoint_uidx/);
  assert.match(migrationOperationsWebhookProjection, /developer_operations_webhook_projections/);
  assert.match(migrationOperationsWebhookProjection, /from public\.operations_events e/);
  assert.match(migrationOperationsWebhookProjection, /env\.environment_key = 'production'/);
  assert.match(migrationOperationsWebhookProjection, /ep\.created_at <= e\.occurred_at/);
  assert.match(migrationOperationsWebhookProjection, /for update skip locked/);
  assert.match(migrationOperationsWebhookProjectionConflictFix, /on conflict on constraint developer_operations_webhook_projections_pkey do nothing/);
  assert.match(migrationOperationsWebhookProjection, /p\.status = 'PROCESSING'/);
  assert.match(operationsWebhookWorkerRoute, /CRON_SECRET/);
  assert.match(operationsWebhookWorkerRoute, /processDeveloperOperationsWebhookProjections/);
  assert.match(vercelConfig, /\/api\/internal\/developer\/webhooks\/operations\/process/);
});

test("webhook endpoints are maintainable and manual replay preserves original evidence", () => {
  assert.match(webhookRoute, /action === "endpoint"/);
  assert.match(webhookRoute, /assertPublicWebhookUrl\(requestedUrl\)/);
  assert.match(webhookRoute, /webhook\.endpoint_updated/);
  assert.match(webhookRoute, /old_host/);
  assert.match(webhookRoute, /new_host/);
  assert.match(controlPlane, /Edit endpoint/);
  assert.match(controlPlane, /Save endpoint/);
  assert.match(webhookRuntime, /replayDeveloperWebhookDelivery/);
  assert.match(webhookRuntime, /replay_of_delivery_id: original\.id/);
  assert.match(webhookRuntime, /DEVELOPER_WEBHOOK_REPLAY_KEY_CONFLICT/);
  assert.match(webhookRuntime, /DEVELOPER_WEBHOOK_REPLAY_CONFIRMATION_REQUIRED/);
  assert.match(webhookRuntime, /REPLAY \$\{original\.event_id\}/);
  assert.match(replayRoute, /confirmation: body\.confirmation/);
  assert.match(replayRoute, /webhook\.delivery_replayed/);
  assert.match(replayRoute, /replay_key must be between 8 and 200 characters/);
  assert.match(migrationWebhookManualReplays, /replay_of_delivery_id/);
  assert.match(migrationWebhookManualReplays, /developer_webhook_delivery_replay_key_uidx/);
  assert.match(migrationWebhookManualReplays, /replay_of_delivery_id is null/);
  assert.match(controlPlane, /Replay event/);
  assert.match(controlPlane, /Manual replay/);
  assert.match(controlPlane, /Manual replay can repeat downstream business effects/);
  assert.match(controlPlane, /Confirm replay/);
  assert.match(controlPlane, /Copy secret/);
  assert.match(docsPage, /manual replay creates a separate delivery record/);
  assert.match(docsPage, /preserves the original delivery evidence/);
});

test("webhook retries use transient-only backoff, leases and automatic cron processing", () => {
  assert.match(webhookRuntime, /retryDelaySeconds/);
  assert.match(webhookRuntime, /transientWebhookStatus/);
  assert.match(webhookRuntime, /code === 408 \|\| code === 425 \|\| code === 429 \|\| code >= 500/);
  assert.match(webhookRuntime, /retry_scheduled/);
  assert.match(webhookRuntime, /DEVELOPER_WEBHOOK_DELIVERY_NOT_FAILED/);
  assert.match(webhookRuntime, /DEVELOPER_WEBHOOK_RETRY_LEASE_INVALID/);
  assert.match(webhookRuntime, /processDueDeveloperWebhookRetries/);
  assert.match(migrationRetryLeases, /for update skip locked/);
  assert.match(migrationRetryLeases, /retry_lease_expires_at/);
  assert.match(migrationRetryLeaseRecovery, /d\.status = 'RETRYING'/);
  assert.match(migrationRetryLeaseRecovery, /d\.retry_lease_expires_at <= now\(\)/);
  assert.match(retryWorkerRoute, /CRON_SECRET/);
  assert.match(retryWorkerRoute, /processDueDeveloperWebhookRetries/);
  assert.match(vercelConfig, /\/api\/internal\/developer\/webhooks\/retries\/process/);
  assert.match(controlPlane, /Auto retry/);
  assert.match(controlPlane, /Retry now/);
  assert.match(webhookRoute, /next_attempt_at/);
  assert.match(docsPage, /automatically retry with bounded exponential backoff up to 20 attempts/);
});

test("developer security mutations leave durable audit evidence", () => {
  assert.match(migrationSecurity, /developer_security_audit_events/);
  assert.match(portal, /recordDeveloperSecurityAudit/);
  assert.match(credentialRoute, /credential\.created/);
  assert.match(environmentRoute, /environment\.created/);
  assert.match(environmentRoute, /environment\.enabled/);
  assert.match(webhookRoute, /webhook\.created/);
  assert.match(webhookRoute, /webhook\.secret_rotated/);
});

test("developer docs include a copy-ready read-only first-call quickstart", () => {
  assert.match(docsPage, /DeveloperQuickstartClient/);
  assert.match(docsPage, /capability\.id === "work-requests"/);
  assert.match(quickstartClient, /Five-minute quickstart/);
  assert.match(quickstartClient, /AVANTIQO_TOKEN/);
  assert.match(quickstartClient, /Authorization: Bearer \$AVANTIQO_TOKEN/);
  assert.match(quickstartClient, /X-Request-Id/);
  assert.match(quickstartClient, /X-Avantiqo-Api-Version/);
  assert.match(quickstartClient, /X-Avantiqo-Environment/);
  assert.match(quickstartClient, /lastResponseMeta/);
  assert.match(quickstartClient, /Create Development/);
  assert.match(quickstartClient, /Create a credential/);
  assert.match(quickstartClient, /Keep the evidence/);
});

test("SDK and OpenAPI downloads are versioned, checksummed and deterministic", () => {
  assert.match(apiContract, /DEVELOPER_API_VERSION = "2026-09-20"/);
  assert.match(gateway, /DEVELOPER_API_VERSION/);
  assert.match(contractExport, /DEVELOPER_API_VERSION/);
  assert.doesNotMatch(contractExport, /const API_VERSION/);
  assert.match(sdkRoute, /language must be typescript or python/);
  assert.match(sdkRoute, /createHash\("sha256"\)/);
  assert.match(sdkRoute, /x-avantiqo-contract-sha256/);
  assert.match(sdkRoute, /x-avantiqo-api-version/);
  assert.match(sdkRoute, /x-content-type-options/);
  assert.match(sdkRoute, /etag/);
  assert.match(openApiRoute, /createHash\("sha256"\)/);
  assert.match(openApiRoute, /x-avantiqo-contract-sha256/);
  assert.match(openApiRoute, /x-avantiqo-api-version/);
  assert.match(openApiRoute, /x-content-type-options/);
  assert.match(openApiRoute, /etag/);
  assert.match(sdkPage, /exact SHA-256 contract checksum/);
});

test("generated SDK contracts are pure, capability typed and dependency-light", () => {
  assert.match(capabilityContractRuntime, /CANONICAL_OPERATIONS_CAPABILITY_CATALOG/);
  assert.doesNotMatch(capabilityContractRuntime, /supabase/i);
  assert.match(portal, /export \{ developerCapabilityCatalog \}/);
  assert.match(contractExport, /DeveloperCapabilityContractRuntime/);
  assert.doesNotMatch(contractExport, /DeveloperPortalRuntime/);
  assert.match(contractExport, /AvantiqoWritableCapabilityId/);
  assert.match(contractExport, /AvantiqoCommandMap/);
  assert.match(contractExport, /execute<C extends AvantiqoWritableCapabilityId>/);
  assert.match(contractExport, /command: AvantiqoCommand<C>/);
  assert.match(contractExport, /CAPABILITY_COMMANDS/);
  assert.match(contractExport, /is read-only and cannot execute commands/);
  assert.match(contractExport, /Unsupported command/);
  assert.match(contractExport, /from urllib\.request import Request, urlopen/);
  assert.match(contractExport, /from urllib\.error import HTTPError/);
  assert.doesNotMatch(contractExport, /import requests/);
});

test("API Explorer separates safe session reads from governed machine requests", () => {
  assert.match(apiExplorer, /session-read/);
  assert.match(apiExplorer, /machine-read/);
  assert.match(apiExplorer, /machine-command/);
  assert.match(apiExplorer, /Machine credential/);
  assert.match(apiExplorer, /\/api\/developer\/v1\/operations\//);
  assert.match(apiExplorer, /Authorization: Bearer ••••••••/);
  assert.match(apiExplorer, /EXECUTE \$\{selected\.id\}\.\$\{selectedCommand\}/);
  assert.match(apiExplorer, /"idempotency-key":key/);
  assert.match(apiExplorer, /Payload JSON must be an object/);
  assert.match(apiExplorer, /Development and Staging are blocked server-side/);
  assert.match(apiExplorer, /x-avantiqo-api-version/);
  assert.match(apiExplorer, /x-avantiqo-environment/);
  assert.match(apiExplorer, /x-avantiqo-idempotent-replay/);
  assert.match(apiExplorer, /selected\?\.readOnly/);
  assert.match(apiExplorer, /type="password"/);
  assert.doesNotMatch(apiExplorer, /Authorization: Bearer \$\{machineToken/);
  assert.match(apiExplorerPage, /typed execution confirmation/);
  assert.match(developerOverview, /explicitly confirmed governed commands/);
});

test("logs provide operational health classification and request correlation", () => {
  assert.match(portal, /developerOperationalHealthSummary/);
  assert.match(portal, /p95_latency_ms/);
  assert.match(portal, /auth_failures/);
  assert.match(portal, /permission_failures/);
  assert.match(portal, /conflict_failures/);
  assert.match(portal, /throttled/);
  assert.match(portal, /webhook_exhausted/);
  assert.match(portal, /projection_dead_letter/);
  assert.match(logsPage, /Developer operations health/);
  assert.match(logsPage, /401 points to token identity/);
  assert.match(logsRoute, /request_id/);
  assert.match(logsRoute, /token_prefix,token_last_four/);
  assert.match(logsRoute, /credentialById/);
  assert.match(logsClient, /Request inspector/);
  assert.match(logsClient, /Copy request ID/);
  assert.match(logsClient, /avoid speculative business mutation retries/);
});

test("developer home carries Staff Portal style today attention and live activity from runtime evidence", () => {
  assert.match(portal, /developerAttentionSummary/);
  assert.match(portal, /No usable machine credential/);
  assert.match(portal, /Webhook delivery requires intervention/);
  assert.match(portal, /recent permission failure/);
  assert.match(portal, /monthly API capacity at/);
  assert.match(portal, /next_action/);
  assert.match(portal, /recent_activity/);
  assert.match(developerOverview, /Today/);
  assert.match(developerOverview, /Needs attention/);
  assert.match(developerOverview, /Live developer activity/);
  assert.match(developerOverview, /Next safe action/);
  assert.match(developerOverview, /Developer runtime/);
  assert.match(developerOverview, /Inspect all requests/);
});

test("developer overview readiness is evidence-backed and production-aware", () => {
  assert.match(portal, /developerReadinessSummary/);
  assert.match(portal, /developer_api_requests/);
  assert.match(portal, /developer_webhook_deliveries/);
  assert.match(portal, /event_type === "developer\.test"/);
  assert.match(portal, /production_ready/);
  assert.match(portal, /Subscribe Production to committed Operations events/);
  assert.match(developerOverview, /Integration readiness/);
  assert.match(developerOverview, /evidence-backed steps complete/);
  assert.match(developerOverview, /Nothing here can be checked off manually/);
  assert.match(developerOverview, /Production not ready/);
  assert.match(developerOverview, /Open step →/);
});

test("API Explorer carries governed business context through reads, commands and copied code", () => {
  assert.match(apiExplorer, /Business context/);
  assert.match(apiExplorer, /entity_id \(optional UUID\)/);
  assert.match(apiExplorer, /period_id \(optional UUID\)/);
  assert.match(apiExplorer, /Read filters JSON/);
  assert.match(apiExplorer, /Read filters must be a valid JSON object/);
  assert.match(apiExplorer, /machineReadUrl/);
  assert.match(apiExplorer, /machineBaseUrl/);
  assert.match(apiExplorer, /entity_id:entityId\.trim\(\)/);
  assert.match(apiExplorer, /period_id:periodId\.trim\(\)/);
  assert.match(apiExplorer, /Object\.entries\(readContext\)/);
  assert.match(apiExplorer, /command-specific record identifiers belong in the JSON payload/);
  assert.match(apiExplorer, /--data-raw '\$\{shellJson\}'/);
});

test("developer ergonomics keep secrets out of copied code and surface credential hygiene", () => {
  assert.match(apiExplorer, /Use in your project/);
  assert.match(apiExplorer, /AVANTIQO_TOKEN/);
  assert.match(apiExplorer, /TypeScript/);
  assert.match(apiExplorer, /Python/);
  assert.match(apiExplorer, /cURL/);
  assert.match(apiExplorer, /Copy code/);
  assert.match(apiExplorer, /avq-your-stable-idempotency-key/);
  assert.doesNotMatch(apiExplorer, /navigator\.clipboard\.writeText\(machineToken/);
  assert.match(controlPlane, /Copy token/);
  assert.match(controlPlane, /Last used/);
  assert.match(controlPlane, /Never used/);
  assert.match(controlPlane, /days remaining/);
  assert.match(controlPlane, /Rotate this credential before expiry/);
  assert.match(controlPlane, /environment\?\.environment_key/);
});

test("client UI exposes operational lifecycle controls", () => {
  assert.match(controlPlane, /expires_in_days/);
  assert.match(controlPlane, /credentialAction\(r,"rotate"\)/);
  assert.match(controlPlane, /Rotate secret/);
  assert.match(controlPlane, /Send test/);
  assert.match(controlPlane, /Retry/);
});

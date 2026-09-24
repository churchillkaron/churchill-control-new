import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("critical reviews preserve recovery while organization policy controls auto-publish", () => {
  const runtime = source("lib/commercial/reputation/ReputationAutomationRuntime.js");
  assert.match(runtime, /const critical = rating <=/);
  assert.match(runtime, /const autoPublish = rating >= Number\(policy\.auto_publish_min_rating \?\? 5\)/);
  assert.match(runtime, /if \(critical\) await createRecoveryCase/);
});

test("Google review sync is restricted to mapped business locations", () => {
  const runtime = source("lib/commercial/reputation/ReputationAutomationRuntime.js");
  assert.match(runtime, /\.not\("entity_id", "is", null\)/);
  assert.match(runtime, /GOOGLE_LOCATION_MAPPING_REQUIRED/);
});

test("successful Google discovery clears stale access failure state", () => {
  const profile = source("lib/commercial/reputation/googleBusinessProfile.js");
  assert.match(profile, /location_discovery_failures: 0/);
  assert.match(profile, /location_discovery_requires_project_approval: false/);
});

test("Meta history and readiness resolve credentials in organization scope", () => {
  const sync = source("lib/commercial/communications/CommunicationMetaInboxSyncRuntime.js");
  const catchup = source("lib/commercial/communications/CommunicationMetaInboxCatchupRuntime.js");
  assert.match(sync, /CredentialRuntime\.resolve\(credentialId, \{\s*organization_id: organizationId/);
  assert.match(catchup, /CredentialRuntime\.resolve\(credentialId, \{\s*organization_id: connection\.organization_id/);
});

test("customer inbox excludes review-demo channel connections", () => {
  const service = source("lib/commercial/communications/CommunicationService.js");
  assert.match(service, /metadata\.review_demo !== true/);
  assert.match(service, /META_APP_REVIEW_2026_08_16/);
});

test("delivery failures retain provider diagnostics", () => {
  const delivery = source("lib/commercial/communications/CommunicationDeliveryRuntime.js");
  assert.match(delivery, /provider_error_code/);
  assert.match(delivery, /provider_error_message/);
});

test("Meta connection callbacks persist new secrets through the vault boundary", () => {
  const callback = source("app/api/meta/auth/callback/route.js");
  const saveAccount = source("app/api/meta/save-account/route.js");
  const credentialRuntime = source("lib/platform/service-runtime/credentials/runtime/CredentialRuntime.js");
  const migration = source("supabase/migrations/20260919041200_provider_credential_vault_store_rpc.sql");
  assert.match(callback, /CredentialRuntime\.storeSecret/);
  assert.match(saveAccount, /CredentialRuntime\.storeSecret/);
  assert.match(credentialRuntime, /store_provider_credential_vault_secret/);
  assert.match(migration, /vault\.create_secret/);
  assert.match(migration, /provider_id = 'meta'/);
});

test("communication inbox accepts only canonical communication providers", () => {
  const service = source("lib/commercial/communications/CommunicationService.js");
  const catalog = source("lib/commercial/communications/CommunicationChannelCatalog.js");
  assert.match(catalog, /export function isCommunicationProvider/);
  assert.match(service, /isCommunicationProvider\(connection\?\.provider\)/);
  assert.doesNotMatch(catalog, /^\s*google:\s*\{/m);
});

test("communication timelines sort by provider event time instead of database insertion time", () => {
  const repository = source("lib/commercial/communications/CommunicationRepository.js");
  assert.match(repository, /function messageEventTime/);
  assert.match(repository, /row\?\.sent_at \|\| row\?\.received_at \|\| row\?\.created_at/);
  assert.match(repository, /sort\(\(left, right\) => messageEventTime\(left\) - messageEventTime\(right\)\)/);
  assert.match(repository, /sort\(\(left, right\) => messageEventTime\(right\) - messageEventTime\(left\)\)/);
});

test("communication workspace keeps the full channel catalog while status comes from live connections", () => {
  const workspace = source("components/workspace/commercial/CommunicationsWorkspace.jsx");
  assert.match(workspace, /const visibleChannels = CHANNELS/);
  assert.match(workspace, /connectedFamilies\.has\(id\)/);
  assert.match(workspace, /connectedFamilies\.size \+ 1/);
});

test("communication timeline deduplicates provider attachments by stable Meta attachment identity", () => {
  const service = source("lib/commercial/communications/CommunicationService.js");
  assert.match(service, /metadata\.meta_attachment_id/);
  assert.match(service, /duplicateIndex = bucket\.findIndex/);
  assert.match(service, /render_as_sticker === true/);
});

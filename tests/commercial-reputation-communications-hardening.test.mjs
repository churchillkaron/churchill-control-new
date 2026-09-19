import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("critical reviews can never auto-publish", () => {
  const runtime = source("lib/commercial/reputation/ReputationAutomationRuntime.js");
  assert.match(runtime, /const critical = rating <=/);
  assert.match(runtime, /const autoPublish =\s*!critical && rating >=/);
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

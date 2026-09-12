import assert from "node:assert/strict";
import test from "node:test";

import {
  instagramAccountProvisioningCapability,
  prepareInstagramAccountProvisioning,
} from "../lib/platform/channels/meta/InstagramAccountProvisioningRuntime.js";

test("instagram provisioning exposes the provider verification boundary", () => {
  const capability = instagramAccountProvisioningCapability();
  assert.equal(capability.provider, "meta");
  assert.equal(capability.channel, "instagram");
  assert.equal(capability.provider_api_can_create_identity, false);
  assert.equal(capability.provider_api_can_manage_professional_account, true);
  assert.equal(capability.requires_provider_identity_verification, true);
});

test("instagram provisioning preserves the Avantiqo continuation", () => {
  const result = prepareInstagramAccountProvisioning({
    organizationId: "9550b843-b83c-4d15-b02d-a0b5ca23346e",
    username: "@ColeLeyAndTheBand",
    displayName: "Cole Ley & The Band",
    bio: "Live band",
    website: "https://coleley.com",
  });

  assert.equal(result.status, "IDENTITY_VERIFICATION_REQUIRED");
  assert.equal(result.proposed_profile.username, "coleleyandtheband");
  assert.match(result.handoff.url, /^https:\/\/www\.instagram\.com\//);
  assert.equal(result.handoff.returns_to_avantiqo, true);
  assert.match(result.continuation.url, /^\/api\/meta\/auth\?organizationId=/);
});

test("instagram provisioning rejects invalid usernames", () => {
  assert.throws(
    () => prepareInstagramAccountProvisioning({
      organizationId: "org",
      username: "Cole Ley Band!",
    }),
    /letters, numbers, periods and underscores/,
  );
});

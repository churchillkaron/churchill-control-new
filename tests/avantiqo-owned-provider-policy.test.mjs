import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AVANTIQO_OWNED_PROVIDER_POLICY,
  isAvantiqoOwnedProvider,
  ownedFirstProviderPreferences,
  ownedProviderForCapability,
  ownedProviderFamily,
} from "../lib/platform/service-runtime/providers/AvantiqoOwnedProviderPolicy.js";

const expected = new Map([
  ["ai.reasoning.execute", "avantiqo-intelligence"],
  ["ai.text.generate", "avantiqo-intelligence"],
  ["ai.image.generate", "avantiqo-image"],
  ["ai.image.inpaint", "avantiqo-image"],
  ["ai.video.generate", "avantiqo-video"],
  ["ai.video.video_to_video", "avantiqo-video"],
  ["ai.audio.generate", "avantiqo-audio"],
  ["ai.music.generate", "avantiqo-audio"],
  ["ai.sfx.generate", "avantiqo-audio"],
  ["ai.code.generate", "avantiqo-code"],
  ["ai.web.build", "avantiqo-code"],
  ["ai.integration.build", "avantiqo-code"],
]);

for (const [capability, provider] of expected) {
  test(`maps ${capability} to ${provider}`, () => {
    assert.equal(ownedProviderForCapability(capability), provider);
  });
}

test("does not claim unrelated capabilities", () => {
  assert.equal(ownedProviderForCapability("communication.email.send"), null);
  assert.equal(ownedProviderForCapability("marketing.social.publish"), null);
});

test("classifies owned provider families", () => {
  assert.equal(ownedProviderFamily("avantiqo-intelligence"), "intelligence");
  assert.equal(ownedProviderFamily("avantiqo-image"), "image");
  assert.equal(ownedProviderFamily("avantiqo-video"), "cinema");
  assert.equal(ownedProviderFamily("avantiqo-audio"), "audio");
  assert.equal(ownedProviderFamily("avantiqo-code"), "code");
  assert.equal(isAvantiqoOwnedProvider("runway"), false);
  assert.equal(isAvantiqoOwnedProvider("avantiqo-code"), true);
});

test("places owned provider before external preferences", () => {
  assert.deepEqual(
    ownedFirstProviderPreferences("ai.video.generate", {
      preferred_providers: ["runway", "google-veo", "avantiqo-video"],
    }),
    ["avantiqo-video", "runway", "google-veo"],
  );
});

test("keeps external providers as fallback policy only", () => {
  assert.equal(AVANTIQO_OWNED_PROVIDER_POLICY.external_providers, "OPTIONAL_FALLBACK_ONLY");
  assert.equal(AVANTIQO_OWNED_PROVIDER_POLICY.selection_boundary, "SERVICE_RUNTIME_ONLY");
  assert.equal(AVANTIQO_OWNED_PROVIDER_POLICY.user_provider_selection, false);
});

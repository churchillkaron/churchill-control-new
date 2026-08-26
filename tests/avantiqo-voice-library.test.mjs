import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const libraryPath = new URL(
  "../lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceLibrary.js",
  import.meta.url,
);
const providerPath = new URL(
  "../lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProvider.js",
  import.meta.url,
);
const apiPath = new URL(
  "../app/api/operator/voice-library/route.js",
  import.meta.url,
);
const workerPath = new URL(
  "../services/avantiqo-voice-tts/handler.py",
  import.meta.url,
);

test("Voice Library stores recordings privately and organization-scoped", async () => {
  const source = await readFile(libraryPath, "utf8");
  assert.match(source, /AVANTIQO_VOICE_LIBRARY_BUCKET = "creative-assets"/);
  assert.match(source, /organization_services/);
  assert.match(source, /\.eq\("organization_id", organizationId\)/);
  assert.match(source, /"voice-library"/);
  assert.match(source, /createSignedUrl\(profile\.storage_path, PREVIEW_TTL_SECONDS\)/);
  assert.doesNotMatch(source, /getPublicUrl/);
});

test("Voice Library requires recorded-voice consent and checksum verification", async () => {
  const source = await readFile(libraryPath, "utf8");
  assert.match(source, /CONSENT_BASES = new Set\(\["SELF", "AUTHORIZED", "LICENSED"\]\)/);
  assert.match(source, /AVANTIQO_VOICE_LIBRARY_CONSENT_BASIS_INVALID/);
  assert.match(source, /consent_confirmed_at/);
  assert.match(source, /checksum_sha256/);
  assert.match(source, /AVANTIQO_VOICE_LIBRARY_CHECKSUM_MISMATCH/);
});

test("Voice Library never stores raw reference audio in service configuration", async () => {
  const source = await readFile(libraryPath, "utf8");
  const profileBlock = source.slice(
    source.indexOf("const profile = {"),
    source.indexOf("const nextLibrary = {", source.indexOf("const profile = {")),
  );
  assert.ok(profileBlock.length > 0, "profile metadata block required");
  assert.doesNotMatch(profileBlock, /audio_base64/);
  assert.match(profileBlock, /storage_path/);
  assert.match(profileBlock, /checksum_sha256/);
});

test("Voice Library API is organization-authorized for every mutation", async () => {
  const source = await readFile(apiPath, "utf8");
  assert.match(source, /requireOrganizationAccess/);
  assert.match(source, /export async function GET/);
  assert.match(source, /export async function POST/);
  assert.match(source, /export async function PATCH/);
  assert.match(source, /export async function DELETE/);
  assert.match(source, /Voice owner consent required/);
  assert.match(source, /Cache-Control": "no-store"/);
});

test("Voice provider automatically resolves organization Voice Library identity", async () => {
  const source = await readFile(providerPath, "utf8");
  assert.match(source, /resolveVoiceReferenceForExecution/);
  assert.match(source, /async function resolveTtsVoiceSelection/);
  assert.match(source, /voice_library_profile_id/);
  assert.match(source, /organization_voice_library/);
  assert.match(source, /avantiqo_builtin/);
  assert.match(source, /voice_identity_profile_id/);
  assert.match(source, /voice_delivery_profile/);
});

test("Direct authorized reference wins over stored Voice Library identity", async () => {
  const source = await readFile(providerPath, "utf8");
  const resolver = source.slice(
    source.indexOf("async function resolveTtsVoiceSelection"),
    source.indexOf("function runtimeApiKey"),
  );
  const direct = resolver.indexOf("if (directReference)");
  const library = resolver.indexOf("resolveVoiceReferenceForExecution");
  assert.ok(direct >= 0, "direct voice reference branch required");
  assert.ok(library > direct, "library resolution must occur after direct reference branch");
  assert.match(resolver, /identitySource: "request_reference"/);
  assert.match(resolver, /identitySource: librarySelection/);
});

test("Explicit delivery style can override stored identity style without replacing identity", async () => {
  const source = await readFile(providerPath, "utf8");
  const resolver = source.slice(
    source.indexOf("async function resolveTtsVoiceSelection"),
    source.indexOf("function runtimeApiKey"),
  );
  assert.match(resolver, /explicitDeliveryProfile/);
  assert.match(resolver, /explicitDeliveryProfile \|\|\s*librarySelection\?\.voice_profile/);
  assert.match(resolver, /voiceReference: librarySelection\?\.voice_reference \|\| null/);
});

test("Voice provider cannot submit RunPod work without exact safe lease", async () => {
  const source = await readFile(providerPath, "utf8");
  const leaseGuard = source.indexOf("function requireSafeLeaseForSubmission");
  const submit = source.indexOf("async function submitJob");
  const run = source.indexOf('runpodRequest(endpointId, "/run"');
  assert.ok(leaseGuard >= 0, "safe lease guard required");
  assert.ok(submit > leaseGuard, "submit must be defined after lease guard");
  assert.ok(run > submit, "RunPod /run call must occur inside guarded submission path");
  assert.match(source, /AVANTIQO_VOICE_RUNPOD_SAFE_LEASE_REQUIRED/);
  assert.match(source, /AVANTIQO_VOICE_RUNPOD_SAFE_LEASE_ENDPOINT_MISMATCH/);
  assert.match(source, /requireSafeLeaseForSubmission\(endpointId\);/);
});

test("Voice worker supports recorded identity separately from delivery style", async () => {
  const source = await readFile(workerPath, "utf8");
  assert.match(source, /VOICE_REFERENCE_CONTRACT = "AVANTIQO_VOICE_REFERENCE_V1"/);
  assert.match(source, /VOICE_PROFILES = \{/);
  assert.match(source, /avantiqo-secretary-v1/);
  assert.match(source, /avantiqo-executive-v1/);
  assert.match(source, /avantiqo-warm-v1/);
  assert.match(source, /avantiqo-neutral-v1/);
  assert.match(source, /model\.prepare_conditionals\(reference_path/);
  assert.match(source, /voice_identity_source/);
  assert.match(source, /recorded_reference/);
});

test("Recorded voice remains implemented but uncertified until controlled proof", async () => {
  const registration = await readFile(
    new URL(
      "../lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProviderRegistration.js",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(registration, /recorded_reference_voice_implemented:\s*true/);
  assert.match(registration, /recorded_reference_voice_certified:\s*false/);
  assert.match(registration, /voice_cloning_certified:\s*false/);
  assert.match(registration, /realtime_streaming_certified:\s*false/);
});

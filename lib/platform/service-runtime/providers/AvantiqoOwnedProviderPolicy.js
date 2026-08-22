const FAMILY_BY_PROVIDER = Object.freeze({
  "avantiqo-intelligence": "intelligence",
  "avantiqo-image": "image",
  "avantiqo-video": "cinema",
  "avantiqo-audio": "audio",
  "avantiqo-voice": "voice",
  "avantiqo-code": "code",
});

const EXACT_CAPABILITY_PROVIDER = Object.freeze({
  "ai.reasoning.execute": "avantiqo-intelligence",
  "ai.text.generate": "avantiqo-intelligence",
  "ai.speech.to.text": "avantiqo-voice",
  "ai.speech.to.text.realtime": "avantiqo-voice",
  "ai.text.to.speech": "avantiqo-voice",
  "ai.music.generate": "avantiqo-audio",
  "ai.sfx.generate": "avantiqo-audio",
  "ai.web.build": "avantiqo-code",
  "ai.web.repair": "avantiqo-code",
  "ai.app.build": "avantiqo-code",
  "ai.integration.build": "avantiqo-code",
});

function text(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function ownedProviderForCapability(capability) {
  const key = text(capability);
  if (!key) return null;
  if (EXACT_CAPABILITY_PROVIDER[key]) return EXACT_CAPABILITY_PROVIDER[key];
  if (key.startsWith("ai.image.")) return "avantiqo-image";
  if (key.startsWith("ai.video.")) return "avantiqo-video";
  if (key.startsWith("ai.audio.")) return "avantiqo-audio";
  if (key.startsWith("ai.voice.")) return "avantiqo-voice";
  if (key.startsWith("ai.code.")) return "avantiqo-code";
  return null;
}

export function ownedProviderFamily(provider) {
  return FAMILY_BY_PROVIDER[text(provider)] || null;
}

export function isAvantiqoOwnedProvider(provider) {
  return Boolean(ownedProviderFamily(provider));
}

export function ownedFirstProviderPreferences(capability, policy = {}) {
  const owned = ownedProviderForCapability(capability);
  const configured = Array.isArray(policy.preferred_providers)
    ? policy.preferred_providers
    : Array.isArray(policy.preferredProviders)
      ? policy.preferredProviders
      : [];

  if (!owned) return configured;
  return [owned, ...configured.filter((provider) => text(provider) !== owned)];
}

export const AVANTIQO_OWNED_PROVIDER_POLICY = Object.freeze({
  contract: "AVANTIQO_OWNED_FIRST_PROVIDER_POLICY_V1",
  provider_families: FAMILY_BY_PROVIDER,
  exact_capability_provider: EXACT_CAPABILITY_PROVIDER,
  external_providers: "OPTIONAL_FALLBACK_ONLY",
  selection_boundary: "SERVICE_RUNTIME_ONLY",
  user_provider_selection: false,
});

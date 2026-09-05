import crypto from "node:crypto";

export const CREATIVE_PUBLICATION_CONTENT_BINDING_CONTRACT =
  "CREATIVE_PUBLICATION_CONTENT_BINDING_V1";

function text(value) {
  return String(value ?? "");
}

function normalized(value) {
  return text(value).trim().toLowerCase().replaceAll("_", "-");
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function publicationTextDigest(value) {
  return digest(text(value));
}

export function publicationTargetChannel(target = {}) {
  return normalized(target.channel || target.id || target.key || target.provider);
}

export function publicationOutboundText(target = {}) {
  return text(
    target.metadata?.message ??
    target.metadata?.caption ??
    target.metadata?.text ??
    "",
  );
}

export function publicationExpectedRemoteText(target = {}) {
  const channel = publicationTargetChannel(target);
  const outbound = publicationOutboundText(target);
  if (["google-business", "googlebusiness"].includes(channel)) {
    return outbound.slice(0, 1500);
  }
  return outbound;
}

export function publicationMediaReferenceIdentity(reference) {
  const candidate = text(reference).trim();
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (["http:", "https:"].includes(parsed.protocol)) {
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    }
  } catch {
    // Private creative storage references are deliberately retained without
    // credentials/query fragments so they can only be used as identity hints.
  }
  return candidate.split(/[?#]/, 1)[0] || null;
}

export function buildPublicationContentBinding({
  target = {},
  derivative = {},
  derivative_render = null,
} = {}) {
  const channel = publicationTargetChannel(target);
  const remoteText = publicationExpectedRemoteText(target);
  const mediaReferenceIdentity = publicationMediaReferenceIdentity(
    derivative_render?.url || derivative_render?.storage_path || null,
  );
  const binding = {
    contract: CREATIVE_PUBLICATION_CONTENT_BINDING_CONTRACT,
    channel,
    approved_text_digest: publicationTextDigest(remoteText),
    approved_text_length: remoteText.length,
    derivative_render_asset_node_id: derivative.render_asset_node_id || null,
    derivative_checksum: derivative.checksum || null,
    derivative_profile_id: derivative.profile_id || null,
    media_reference_identity: mediaReferenceIdentity,
  };
  return {
    ...binding,
    identity: digest(binding),
  };
}

export const CreativePublicationContentBindingRuntime = Object.freeze({
  contract: CREATIVE_PUBLICATION_CONTENT_BINDING_CONTRACT,
  build: buildPublicationContentBinding,
  textDigest: publicationTextDigest,
  outboundText: publicationOutboundText,
  expectedRemoteText: publicationExpectedRemoteText,
  mediaReferenceIdentity: publicationMediaReferenceIdentity,
});

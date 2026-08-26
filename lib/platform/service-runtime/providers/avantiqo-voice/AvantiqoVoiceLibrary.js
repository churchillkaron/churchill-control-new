import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_VOICE_LIBRARY_CONTRACT = "AVANTIQO_VOICE_LIBRARY_V1";
export const AVANTIQO_VOICE_REFERENCE_CONTRACT = "AVANTIQO_VOICE_REFERENCE_V1";
export const AVANTIQO_VOICE_LIBRARY_BUCKET = "creative-assets";
export const AVANTIQO_VOICE_LIBRARY_SERVICE_ID = "ai.text.to.speech";

const CONFIG_KEY = "avantiqo_voice_library";
const MAX_PROFILES = 100;
const MAX_REFERENCE_BYTES = 20 * 1024 * 1024;
const PREVIEW_TTL_SECONDS = 300;

const CONSENT_BASES = new Set(["SELF", "AUTHORIZED", "LICENSED"]);
const DELIVERY_PROFILES = new Set([
  "avantiqo-secretary-v1",
  "avantiqo-executive-v1",
  "avantiqo-warm-v1",
  "avantiqo-neutral-v1",
]);
const MIME_EXTENSION = new Map([
  ["audio/wav", ".wav"],
  ["audio/x-wav", ".wav"],
  ["audio/wave", ".wav"],
  ["audio/mpeg", ".mp3"],
  ["audio/mp3", ".mp3"],
  ["audio/mp4", ".m4a"],
  ["audio/x-m4a", ".m4a"],
  ["audio/webm", ".webm"],
  ["audio/ogg", ".ogg"],
  ["audio/flac", ".flac"],
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeMimeType(value) {
  return text(value).toLowerCase().split(";")[0];
}

function safeName(value) {
  const name = text(value).replace(/\s+/g, " ");
  if (!name) throw new Error("AVANTIQO_VOICE_LIBRARY_NAME_REQUIRED");
  if (name.length > 80) throw new Error("AVANTIQO_VOICE_LIBRARY_NAME_TOO_LONG");
  return name;
}

function normalizeDeliveryProfile(value) {
  const profile = text(value) || "avantiqo-secretary-v1";
  if (!DELIVERY_PROFILES.has(profile)) {
    throw new Error(`AVANTIQO_VOICE_LIBRARY_DELIVERY_PROFILE_INVALID:${profile}`);
  }
  return profile;
}

function normalizeConsentBasis(value) {
  const basis = text(value).toUpperCase();
  if (!CONSENT_BASES.has(basis)) {
    throw new Error("AVANTIQO_VOICE_LIBRARY_CONSENT_BASIS_INVALID");
  }
  return basis;
}

function normalizeLibrary(configuration = {}) {
  const raw = object(object(configuration)[CONFIG_KEY]);
  const profiles = Array.isArray(raw.profiles)
    ? raw.profiles.filter((profile) => profile && typeof profile === "object")
    : [];
  const defaultProfileId = text(raw.default_profile_id) || null;
  return {
    contract: AVANTIQO_VOICE_LIBRARY_CONTRACT,
    version: 1,
    default_profile_id: profiles.some((profile) => profile.id === defaultProfileId)
      ? defaultProfileId
      : null,
    profiles,
  };
}

function publicProfile(profile = {}) {
  return {
    id: text(profile.id),
    name: text(profile.name),
    status: text(profile.status) || "ACTIVE",
    mime_type: text(profile.mime_type) || null,
    size_bytes: finite(profile.size_bytes),
    checksum_sha256: text(profile.checksum_sha256) || null,
    delivery_profile: text(profile.delivery_profile) || "avantiqo-secretary-v1",
    consent_basis: text(profile.consent_basis) || null,
    consent_evidence_id: text(profile.consent_evidence_id) || null,
    consent_confirmed_at: profile.consent_confirmed_at || null,
    created_at: profile.created_at || null,
    updated_at: profile.updated_at || null,
    reference_duration_seconds: finite(profile.reference_duration_seconds),
    quality_status: text(profile.quality_status) || "PENDING_ENGINE_CERTIFICATION",
    cloning_status: text(profile.cloning_status) || "IMPLEMENTED_UNCERTIFIED",
  };
}

async function organizationVoiceServices(organizationId) {
  const { data, error } = await supabaseAdmin
    .from("organization_services")
    .select("id, organization_id, entity_id, party_id, service_id, status, configuration, created_at, updated_at")
    .eq("organization_id", organizationId)
    .eq("service_id", AVANTIQO_VOICE_LIBRARY_SERVICE_ID)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function canonicalVoiceService({ organizationId, entityId = null }) {
  const organization_id = text(organizationId);
  const entity_id = text(entityId) || null;
  if (!organization_id) throw new Error("AVANTIQO_VOICE_LIBRARY_ORGANIZATION_REQUIRED");

  const services = await organizationVoiceServices(organization_id);
  if (!services.length) throw new Error("AVANTIQO_VOICE_LIBRARY_TTS_SERVICE_REQUIRED");

  const active = services.filter((service) => text(service.status).toUpperCase() === "ACTIVE");
  const candidates = active.length ? active : services;
  const organizationScoped = candidates.find(
    (service) => !service.entity_id && !service.party_id,
  );
  const entityScoped = entity_id
    ? candidates.find((service) => text(service.entity_id) === entity_id && !service.party_id)
    : null;
  const service = organizationScoped || entityScoped || candidates[0];
  if (!service?.id) throw new Error("AVANTIQO_VOICE_LIBRARY_TTS_SERVICE_REQUIRED");
  return service;
}

async function persistLibrary(service, library) {
  const configuration = object(service.configuration);
  const updatedAt = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("organization_services")
    .update({
      configuration: {
        ...configuration,
        [CONFIG_KEY]: library,
      },
      updated_at: updatedAt,
    })
    .eq("id", service.id)
    .eq("organization_id", service.organization_id)
    .select("id, organization_id, entity_id, configuration, updated_at")
    .single();

  if (error) throw error;
  return data;
}

async function blobBytes(audio) {
  if (!audio || typeof audio.arrayBuffer !== "function") {
    throw new Error("AVANTIQO_VOICE_LIBRARY_AUDIO_REQUIRED");
  }
  const bytes = Buffer.from(await audio.arrayBuffer());
  if (!bytes.length) throw new Error("AVANTIQO_VOICE_LIBRARY_AUDIO_EMPTY");
  if (bytes.length > MAX_REFERENCE_BYTES) {
    throw new Error("AVANTIQO_VOICE_LIBRARY_AUDIO_TOO_LARGE");
  }
  return bytes;
}

function profileStoragePath(organizationId, profileId, extension) {
  return [
    text(organizationId),
    "voice-library",
    profileId,
    `reference${extension}`,
  ].join("/");
}

export async function listVoiceProfiles({ organizationId, entityId = null, includePreviewUrls = false } = {}) {
  const service = await canonicalVoiceService({ organizationId, entityId });
  const library = normalizeLibrary(service.configuration);
  const profiles = library.profiles
    .filter((profile) => text(profile.status).toUpperCase() !== "DELETED")
    .map(publicProfile);

  if (!includePreviewUrls) {
    return {
      contract: AVANTIQO_VOICE_LIBRARY_CONTRACT,
      default_profile_id: library.default_profile_id,
      profiles,
    };
  }

  const enriched = [];
  for (const profile of library.profiles) {
    if (text(profile.status).toUpperCase() === "DELETED") continue;
    let previewUrl = null;
    if (profile.storage_path) {
      const { data, error } = await supabaseAdmin.storage
        .from(profile.storage_bucket || AVANTIQO_VOICE_LIBRARY_BUCKET)
        .createSignedUrl(profile.storage_path, PREVIEW_TTL_SECONDS);
      if (!error) previewUrl = data?.signedUrl || null;
    }
    enriched.push({
      ...publicProfile(profile),
      preview_url: previewUrl,
      preview_expires_in_seconds: previewUrl ? PREVIEW_TTL_SECONDS : null,
    });
  }

  return {
    contract: AVANTIQO_VOICE_LIBRARY_CONTRACT,
    default_profile_id: library.default_profile_id,
    profiles: enriched,
  };
}

export async function createRecordedVoiceProfile({
  organizationId,
  entityId = null,
  partyId = null,
  name,
  audio,
  mimeType = null,
  consentBasis,
  consentEvidenceId = null,
  deliveryProfile = "avantiqo-secretary-v1",
  referenceDurationSeconds = null,
} = {}) {
  const service = await canonicalVoiceService({ organizationId, entityId });
  const library = normalizeLibrary(service.configuration);
  if (library.profiles.filter((profile) => text(profile.status).toUpperCase() !== "DELETED").length >= MAX_PROFILES) {
    throw new Error("AVANTIQO_VOICE_LIBRARY_PROFILE_LIMIT_REACHED");
  }

  const profileName = safeName(name);
  const delivery = normalizeDeliveryProfile(deliveryProfile);
  const consent = normalizeConsentBasis(consentBasis);
  const bytes = await blobBytes(audio);
  const mime_type = normalizeMimeType(mimeType || audio?.type);
  const extension = MIME_EXTENSION.get(mime_type);
  if (!extension) throw new Error(`AVANTIQO_VOICE_LIBRARY_MIME_NOT_CERTIFIED:${mime_type || "missing"}`);

  const profileId = crypto.randomUUID();
  const now = new Date().toISOString();
  const storagePath = profileStoragePath(service.organization_id, profileId, extension);
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");

  const { error: uploadError } = await supabaseAdmin.storage
    .from(AVANTIQO_VOICE_LIBRARY_BUCKET)
    .upload(storagePath, bytes, {
      contentType: mime_type,
      upsert: false,
      cacheControl: "0",
    });
  if (uploadError) {
    throw new Error(`AVANTIQO_VOICE_LIBRARY_UPLOAD_FAILED:${uploadError.message}`);
  }

  const duration = finite(referenceDurationSeconds);
  const profile = {
    id: profileId,
    name: profileName,
    status: "ACTIVE",
    storage_bucket: AVANTIQO_VOICE_LIBRARY_BUCKET,
    storage_path: storagePath,
    mime_type,
    size_bytes: bytes.length,
    checksum_sha256: checksum,
    delivery_profile: delivery,
    consent_basis: consent,
    consent_evidence_id: text(consentEvidenceId) || null,
    consent_confirmed_at: now,
    consent_confirmed_by_party_id: text(partyId) || null,
    reference_duration_seconds: duration && duration > 0 ? duration : null,
    quality_status: "PENDING_ENGINE_CERTIFICATION",
    cloning_status: "IMPLEMENTED_UNCERTIFIED",
    created_at: now,
    updated_at: now,
  };

  const nextLibrary = {
    ...library,
    default_profile_id: library.default_profile_id || profileId,
    profiles: [...library.profiles, profile],
  };

  try {
    await persistLibrary(service, nextLibrary);
  } catch (error) {
    await supabaseAdmin.storage
      .from(AVANTIQO_VOICE_LIBRARY_BUCKET)
      .remove([storagePath])
      .catch(() => null);
    throw error;
  }

  return {
    contract: AVANTIQO_VOICE_LIBRARY_CONTRACT,
    default_profile_id: nextLibrary.default_profile_id,
    profile: publicProfile(profile),
  };
}

export async function updateVoiceProfile({
  organizationId,
  entityId = null,
  profileId,
  name = null,
  deliveryProfile = null,
  setDefault = false,
} = {}) {
  const service = await canonicalVoiceService({ organizationId, entityId });
  const library = normalizeLibrary(service.configuration);
  const id = text(profileId);
  const index = library.profiles.findIndex((profile) => text(profile.id) === id);
  if (index < 0 || text(library.profiles[index].status).toUpperCase() === "DELETED") {
    throw new Error("AVANTIQO_VOICE_LIBRARY_PROFILE_NOT_FOUND");
  }

  const current = library.profiles[index];
  const next = {
    ...current,
    ...(name !== null ? { name: safeName(name) } : {}),
    ...(deliveryProfile !== null ? { delivery_profile: normalizeDeliveryProfile(deliveryProfile) } : {}),
    updated_at: new Date().toISOString(),
  };
  const profiles = [...library.profiles];
  profiles[index] = next;
  const nextLibrary = {
    ...library,
    profiles,
    default_profile_id: setDefault ? id : library.default_profile_id,
  };
  await persistLibrary(service, nextLibrary);

  return {
    contract: AVANTIQO_VOICE_LIBRARY_CONTRACT,
    default_profile_id: nextLibrary.default_profile_id,
    profile: publicProfile(next),
  };
}

export async function deleteVoiceProfile({ organizationId, entityId = null, profileId } = {}) {
  const service = await canonicalVoiceService({ organizationId, entityId });
  const library = normalizeLibrary(service.configuration);
  const id = text(profileId);
  const profile = library.profiles.find((candidate) => text(candidate.id) === id);
  if (!profile || text(profile.status).toUpperCase() === "DELETED") {
    throw new Error("AVANTIQO_VOICE_LIBRARY_PROFILE_NOT_FOUND");
  }

  const activeProfiles = library.profiles.filter(
    (candidate) => text(candidate.id) !== id && text(candidate.status).toUpperCase() !== "DELETED",
  );
  const nextLibrary = {
    ...library,
    profiles: library.profiles.map((candidate) =>
      text(candidate.id) === id
        ? { ...candidate, status: "DELETED", updated_at: new Date().toISOString() }
        : candidate,
    ),
    default_profile_id: library.default_profile_id === id
      ? (activeProfiles[0]?.id || null)
      : library.default_profile_id,
  };
  await persistLibrary(service, nextLibrary);

  let storageCleanupPending = false;
  if (profile.storage_path) {
    const { error } = await supabaseAdmin.storage
      .from(profile.storage_bucket || AVANTIQO_VOICE_LIBRARY_BUCKET)
      .remove([profile.storage_path]);
    storageCleanupPending = Boolean(error);
  }

  return {
    contract: AVANTIQO_VOICE_LIBRARY_CONTRACT,
    deleted_profile_id: id,
    default_profile_id: nextLibrary.default_profile_id,
    storage_cleanup_pending: storageCleanupPending,
  };
}

export async function resolveVoiceReferenceForExecution({
  organizationId,
  entityId = null,
  profileId = null,
} = {}) {
  const service = await canonicalVoiceService({ organizationId, entityId });
  const library = normalizeLibrary(service.configuration);
  const id = text(profileId) || library.default_profile_id;
  if (!id) return null;

  const profile = library.profiles.find(
    (candidate) => text(candidate.id) === id && text(candidate.status).toUpperCase() === "ACTIVE",
  );
  if (!profile) throw new Error("AVANTIQO_VOICE_LIBRARY_PROFILE_NOT_FOUND");
  if (!CONSENT_BASES.has(text(profile.consent_basis).toUpperCase())) {
    throw new Error("AVANTIQO_VOICE_LIBRARY_CONSENT_REQUIRED");
  }
  if (!profile.storage_path) throw new Error("AVANTIQO_VOICE_LIBRARY_STORAGE_REFERENCE_REQUIRED");

  const { data, error } = await supabaseAdmin.storage
    .from(profile.storage_bucket || AVANTIQO_VOICE_LIBRARY_BUCKET)
    .download(profile.storage_path);
  if (error || !data) {
    throw new Error(`AVANTIQO_VOICE_LIBRARY_DOWNLOAD_FAILED:${error?.message || "empty"}`);
  }

  const bytes = Buffer.from(await data.arrayBuffer());
  if (!bytes.length) throw new Error("AVANTIQO_VOICE_LIBRARY_AUDIO_EMPTY");
  if (bytes.length > MAX_REFERENCE_BYTES) throw new Error("AVANTIQO_VOICE_LIBRARY_AUDIO_TOO_LARGE");
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
  if (text(profile.checksum_sha256) && checksum !== profile.checksum_sha256) {
    throw new Error("AVANTIQO_VOICE_LIBRARY_CHECKSUM_MISMATCH");
  }

  return {
    voice_profile: text(profile.delivery_profile) || "avantiqo-secretary-v1",
    voice_reference: {
      contract: AVANTIQO_VOICE_REFERENCE_CONTRACT,
      audio_base64: bytes.toString("base64"),
      mime_type: profile.mime_type,
      profile_id: profile.id,
      consent: {
        confirmed: true,
        basis: profile.consent_basis,
        evidence_id: profile.consent_evidence_id || null,
      },
    },
  };
}

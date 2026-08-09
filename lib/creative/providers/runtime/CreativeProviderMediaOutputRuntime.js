const MEDIA_REFERENCE_FIELDS = Object.freeze([
  "storage_reference",
  "storageReference",
  "storage_url",
  "storageUrl",
  "file_url",
  "fileUrl",
  "video_url",
  "videoUrl",
  "image_url",
  "imageUrl",
  "audio_url",
  "audioUrl",
  "url",
]);

const WRAPPER_FIELDS = Object.freeze([
  "provider_poll",
  "output",
  "raw",
  "provider_result",
  "result",
  "data",
  "response",
  "provider_submission",
]);

const MAX_DEPTH = 12;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function credibleReference(value) {
  const source = text(value);
  return /^(?:storage:\/\/|https?:\/\/|data:image\/)/i.test(source)
    ? source
    : null;
}

function directReference(payload = {}) {
  for (const field of MEDIA_REFERENCE_FIELDS) {
    const reference = credibleReference(payload[field]);
    if (reference) {
      return {
        reference,
        field,
        payload,
      };
    }
  }

  for (const collectionName of ["files", "images", "videos", "audio"]) {
    const collection = Array.isArray(payload[collectionName])
      ? payload[collectionName]
      : [];
    for (const entry of collection) {
      const candidate = object(entry);
      if (!candidate) continue;
      const resolved = directReference(candidate);
      if (resolved) {
        return {
          ...resolved,
          collection: collectionName,
        };
      }
    }
  }

  return null;
}

function walk(value, seen, depth, path) {
  if (depth > MAX_DEPTH) return null;
  const payload = object(value);
  if (!payload || seen.has(payload)) return null;
  seen.add(payload);

  const direct = directReference(payload);
  if (direct) {
    return {
      ...direct,
      path,
      depth,
    };
  }

  for (const field of WRAPPER_FIELDS) {
    const child = object(payload[field]);
    if (!child) continue;
    const resolved = walk(child, seen, depth + 1, [...path, field]);
    if (resolved) return resolved;
  }

  return null;
}

export function resolveCreativeProviderMediaOutput(value = {}) {
  return walk(value, new Set(), 0, []);
}

export function resolveCreativeProviderMediaReference(value = {}) {
  return resolveCreativeProviderMediaOutput(value)?.reference || null;
}

export const CreativeProviderMediaOutputRuntime = Object.freeze({
  resolve: resolveCreativeProviderMediaOutput,
  reference: resolveCreativeProviderMediaReference,
  contract: "CREATIVE_PROVIDER_MEDIA_OUTPUT_RESOLUTION_V1",
});

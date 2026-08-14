import { supabaseAdmin } from "@/lib/shared/supabase/admin";

// Benchmark cases must score the organization's current registered evidence,
// not a brittle set of historical asset UUIDs. Resolve source material from the
// live asset registry while excluding prior generated output and unavailable
// records so the benchmark measures Creative quality rather than fixture rot.

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function isGenerated(asset = {}) {
  return (
    asset.ai_generated === true ||
    text(asset.asset_type).toLowerCase() === "generated_campaign" ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(text(asset.file_name))
  );
}

function isAvailable(asset = {}) {
  const status = text(asset.status).toUpperCase();
  return (
    asset.archived !== true &&
    !["ARCHIVED", "DISABLED", "DELETED"].includes(status)
  );
}

function searchable(asset = {}) {
  return [
    asset.file_name,
    asset.name,
    asset.description,
    asset.asset_type,
    asset.title,
    asset.label,
    ...list(asset.tags),
  ]
    .map(text)
    .join(" ")
    .toLowerCase();
}

function mediaFamily(asset = {}) {
  const haystack = `${text(asset.mime_type)} ${text(asset.asset_type)} ${text(asset.file_name)}`.toLowerCase();
  if (/audio|music|voice|\.mp3|\.wav|\.m4a/.test(haystack)) return "AUDIO";
  if (/video|\.mp4|\.mov|\.webm/.test(haystack)) return "VIDEO";
  return "IMAGE";
}

// A case asking for VIDEO can legitimately use stills as reference, and an AUDIO
// case needs the venue or performer evidence it is scoring against. Preference,
// not exclusion.
const FAMILY_PREFERENCE = Object.freeze({
  IMAGE: ["IMAGE", "VIDEO"],
  VIDEO: ["VIDEO", "IMAGE"],
  AUDIO: ["AUDIO", "VIDEO", "IMAGE"],
});

function scoreAsset(asset, anchors) {
  const haystack = searchable(asset);
  let score = 0;

  for (const anchor of anchors) {
    const normalizedAnchor = text(anchor).toLowerCase();
    const words = normalizedAnchor.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    if (haystack.includes(normalizedAnchor)) score += 4;
    else if (words.some((word) => word.length >= 3 && haystack.includes(word))) {
      score += 2;
    }
  }

  return score;
}

function familyRank(family, preference) {
  const index = preference.indexOf(family);
  return index === -1 ? preference.length : index;
}

export async function resolveBenchmarkAssets({
  organization_id,
  production_type = "IMAGE",
  anchors = [],
  minimum = 2,
  maximum = 6,
} = {}) {
  const organizationId = text(organization_id);
  if (!organizationId) throw new Error("BENCHMARK_ASSET_ORGANIZATION_REQUIRED");

  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .select("*")
    .eq("organization_id", organizationId)
    .limit(500);

  if (error) throw error;

  const source = (Array.isArray(data) ? data : []).filter(
    (asset) => !isGenerated(asset) && isAvailable(asset),
  );

  if (!source.length) {
    throw new Error(
      `BENCHMARK_NO_SOURCE_ASSETS_REGISTERED:${organizationId}`,
    );
  }

  const wanted = FAMILY_PREFERENCE[text(production_type).toUpperCase()] ||
    FAMILY_PREFERENCE.IMAGE;
  const anchorList = list(anchors);

  const ranked = source
    .map((asset) => ({
      asset,
      family: mediaFamily(asset),
      relevance: scoreAsset(asset, anchorList),
    }))
    .sort((left, right) => {
      if (right.relevance !== left.relevance) return right.relevance - left.relevance;
      const familyDelta =
        familyRank(left.family, wanted) - familyRank(right.family, wanted);
      if (familyDelta !== 0) return familyDelta;
      return text(left.asset.file_name || left.asset.name).localeCompare(
        text(right.asset.file_name || right.asset.name),
      );
    });

  const count = Math.min(maximum, ranked.length);
  const selected = ranked.slice(0, count);

  if (selected.length < minimum) {
    throw new Error(
      `BENCHMARK_INSUFFICIENT_SOURCE_ASSETS:${organizationId}:${selected.length}`,
    );
  }

  // A case asking for AUDIO can legitimately fall back to video or stills as reference, but
  // falling back silently hides a case with no evidence of its own medium at all. Churchill
  // holds 17 images and 5 videos and no audio whatsoever, so the music and sound package case
  // was being scored on audio direction with nothing audible to work from -- which shows up as
  // a persistently low score and an unsupported "sound" anchor rather than as the data gap it
  // is. The resolution is reported so the gap is legible instead of mysterious.
  const resolvedFamilies = [...new Set(selected.map((entry) => entry.family))];
  const preferredFamily = wanted[0];

  return Object.assign(
    selected.map((entry) => entry.asset),
    {
      resolution: {
        preferred_family: preferredFamily,
        resolved_families: resolvedFamilies,
        preferred_family_available: resolvedFamilies.includes(preferredFamily),
        source_asset_count: source.length,
      },
    },
  );
}

export default resolveBenchmarkAssets;

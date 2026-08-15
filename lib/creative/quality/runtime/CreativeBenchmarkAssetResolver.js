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
  pinned_asset_ids = [],
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

  // The evidence a case is scored against has to be the same evidence every time.
  //
  // Each fixture declares asset_ids and they were used for exactly one thing: Math.max(6, length), a
  // count. Selection came from relevance ranking over the organization's whole library, so a still that
  // pins four assets was scored against six, four of which it never named, and the set moves as the
  // library grows. A benchmark whose inputs drift cannot measure whether the work improved, which is the
  // only thing it exists to do.
  //
  // Pinned ids are honoured when they resolve. Ranking still fills the remainder, because a fixture that
  // pins fewer than the minimum, or names an asset since archived, should degrade to something runnable
  // rather than fail -- and the resolution report says which happened, so a score is never quietly
  // measured against different evidence than it claims.
  const pinnedIds = list(pinned_asset_ids).map(text).filter(Boolean);
  const byId = new Map(ranked.map((entry) => [text(entry.asset?.id), entry]));
  const pinnedEntries = pinnedIds.map((id) => byId.get(id)).filter(Boolean);
  const unresolvedPinned = pinnedIds.filter((id) => !byId.has(id));

  const count = Math.min(maximum, ranked.length);
  const remainder = ranked.filter((entry) => !pinnedEntries.includes(entry));
  const selected = pinnedEntries.length
    ? [...pinnedEntries, ...remainder].slice(0, Math.max(count, pinnedEntries.length))
    : ranked.slice(0, count);

  if (selected.length < minimum) {
    throw new Error(
      `BENCHMARK_INSUFFICIENT_SOURCE_ASSETS:${organizationId}:${selected.length}`,
    );
  }

  // Which medium the evidence actually came from, reported rather than left silent.
  //
  // Absence of the case's own medium is not automatically a gap. For a case whose deliverable
  // is generated -- a campaign music and sound package, for instance -- the audio is the
  // output and the venue imagery is the correct brief, so resolving images and video for an
  // AUDIO case is right rather than degraded. An organization may hold images and video and no audio
  // at all, and composing original sound from the venue it has is exactly what such a case is for.
  //
  // What this reports is therefore the shape of the evidence, not a verdict on it. Read
  // together with production_capability_pairs it answers the question that matters: whether a
  // generation-first case actually planned against the generation capabilities available.
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
        // How this set was chosen, so a score can be read against the evidence it was actually given.
        selection_mode: pinnedIds.length
          ? (unresolvedPinned.length
              ? "PINNED_PARTIALLY_RESOLVED"
              : (selected.length > pinnedEntries.length ? "PINNED_TOPPED_UP" : "PINNED"))
          : "RELEVANCE_RANKED",
        pinned_asset_ids: pinnedIds,
        pinned_resolved_count: pinnedEntries.length,
        unresolved_pinned_asset_ids: unresolvedPinned,
      },
    },
  );
}

export default resolveBenchmarkAssets;

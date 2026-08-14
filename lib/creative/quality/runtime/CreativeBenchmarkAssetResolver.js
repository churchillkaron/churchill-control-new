import { supabaseAdmin } from "@/lib/shared/supabase/admin";

// Benchmark cases used to pin 28 asset uuids and 5 project uuids in a fixture
// file. Those ids rot: an asset is replaced, a project is archived, the pipeline
// is reset, and the benchmark fails for reasons that have nothing to do with
// creative quality. Worse, it only ever worked for one organization.
//
// Cases now declare intent -- what the work is about -- and the assets are
// resolved from whatever that organization has actually registered. Upload new
// food photography and the food case uses it. Reset the pipeline and the
// benchmark still runs, because it never referenced a project.

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function isGenerated(asset = {}) {
  return (
    asset.ai_generated === true ||
    text(asset.asset_type) === "generated_campaign" ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(text(asset.file_name))
  );
}

function searchable(asset = {}) {
  return [
    asset.file_name,
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
// case needs the venue it is scoring against. Preference, not exclusion.
const FAMILY_PREFERENCE = Object.freeze({
  IMAGE: ["IMAGE", "VIDEO"],
  VIDEO: ["VIDEO", "IMAGE"],
  AUDIO: ["AUDIO", "VIDEO", "IMAGE"],
});

function scoreAsset(asset, anchors) {
  const haystack = searchable(asset);
  let score = 0;

  for (const anchor of anchors) {
    const words = text(anchor).toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    if (haystack.includes(text(anchor).toLowerCase())) score += 4;
    else if (words.some((word) => word.length >= 3 && haystack.includes(word))) score += 2;
  }

  return score;
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
    (asset) => !isGenerated(asset),
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
      const familyDelta =
        wanted.indexOf(left.family) - wanted.indexOf(right.family);
      if (familyDelta !== 0) return familyDelta;
      if (right.relevance !== left.relevance) return right.relevance - left.relevance;
      return text(left.asset.file_name).localeCompare(text(right.asset.file_name));
    });

  const selected = ranked.slice(0, Math.max(minimum, Math.min(maximum, ranked.length)));

  if (selected.length < minimum) {
    throw new Error(
      `BENCHMARK_INSUFFICIENT_SOURCE_ASSETS:${organizationId}:${selected.length}`,
    );
  }

  return selected.map((entry) => entry.asset);
}

export default resolveBenchmarkAssets;

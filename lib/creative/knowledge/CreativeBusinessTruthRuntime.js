import { createHash } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveOrganizationCurrency } from "@/lib/platform/context/resolveOrganizationCurrency";

const SNAPSHOT_TABLE = "creative_business_truth_snapshots";
const MAX_LOCATIONS = 50;
const MAX_ASSETS = 80;
const MAX_REUSABLE_ASSETS = 40;

function compact(value, maximum = 500) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length <= maximum
    ? normalized
    : `${normalized.slice(0, maximum - 1).trim()}…`;
}

function first(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== "") ?? null;
}

function strings(value, maximum = 30) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => compact(item, 120)).filter(Boolean).slice(0, maximum);
}

function cleanObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, item]) => (
    item !== null && item !== undefined && item !== "" && (!Array.isArray(item) || item.length > 0)
  )));
}

function organizationTruth(row = {}, currency = null) {
  return cleanObject({
    id: row.id || null,
    name: compact(first(row.display_name, row.legal_name, row.name), 160),
    legal_name: compact(row.legal_name, 160),
    trading_name: compact(first(row.trading_name, row.display_name), 160),
    description: compact(first(row.description, row.about, row.business_description), 1200),
    industry: compact(first(row.industry, row.industry_type, row.business_type), 120),
    website: compact(first(row.website, row.website_url), 300),
    email: compact(first(row.email, row.contact_email), 200),
    phone: compact(first(row.phone, row.contact_phone), 100),
    country: compact(first(row.country, row.country_code), 100),
    address: compact(
      first(
        row.address,
        row.address_line_1,
        row.registered_address,
      ),
      400,
    ),
    city: compact(first(row.city, row.locality), 120),
    state: compact(first(row.state, row.province), 120),
    postal_code: compact(row.postal_code, 40),
    timezone: compact(row.timezone, 100),
    language: compact(first(row.default_language, row.language), 100),
    currency,
    brand: cleanObject({
      mission: compact(row.mission, 1000),
      vision: compact(row.vision, 1000),
      values: strings(first(row.values, row.brand_values), 20),
      voice: compact(first(row.brand_voice, row.tone_of_voice), 500),
      positioning: compact(first(row.positioning, row.brand_positioning), 800),
      primary_color: compact(first(row.primary_color, row.brand_primary_color), 50),
      secondary_color: compact(first(row.secondary_color, row.brand_secondary_color), 50),
      logo_url: compact(first(row.logo_url, row.logo), 500),
    }),
  });
}

function locationTruth(row = {}) {
  return cleanObject({
    id: row.id || null,
    code: compact(row.code, 80),
    name: compact(row.name, 160),
    type: compact(first(row.location_type, row.type), 100),
    description: compact(row.description, 500),
    address: compact(first(row.address, row.address_line_1), 300),
    address_line_2: compact(row.address_line_2, 300),
    city: compact(row.city, 120),
    state: compact(first(row.state, row.province), 120),
    postal_code: compact(row.postal_code, 40),
    country: compact(first(row.country, row.country_code), 100),
    phone: compact(row.phone, 100),
    email: compact(row.email, 200),
    website: compact(first(row.website, row.website_url), 300),
    status: compact(row.status, 80),
    metadata: cleanObject({ opening_hours: row.opening_hours || null, coordinates: row.coordinates || null, attributes: row.attributes || null }),
  });
}

function uploadedAssetTruth(row = {}) {
  const url = first(row.file_url, row.image_url, row.thumbnail_url);
  return cleanObject({
    id: row.id || null,
    name: compact(first(row.name, row.title, row.file_name), 180),
    type: compact(row.asset_type, 100),
    description: compact(row.description, 500),
    url: compact(url, 1000),
    thumbnail_url: compact(row.thumbnail_url, 1000),
    tags: strings(row.tags, 30),
    analysis: cleanObject({
      subject: compact(first(row.analysis?.subject, row.analysis?.summary), 500),
      objects: strings(row.analysis?.objects, 30),
      colors: strings(row.analysis?.colors, 20),
      quality_score: Number(row.analysis?.quality_score || row.score || 0),
    }),
    favorite: row.favorite === true,
    approved_reference: row.archived !== true,
    created_at: row.created_at || null,
  });
}

function isApprovedReusableAsset(row = {}) {
  return row.status === "APPROVED" ||
    row.reuse?.approved_for_reuse === true ||
    row.metadata?.approved_for_reuse === true ||
    row.review?.approved === true;
}

function reusableAssetTruth(row = {}) {
  return cleanObject({
    id: row.id || null,
    name: compact(row.name, 180),
    type: compact(row.type, 100),
    description: compact(row.description, 500),
    url: compact(row.url, 1000),
    storage_path: compact(row.storage_path, 1000),
    status: compact(row.status, 80),
    tags: strings(row.intelligence?.tags, 30),
    quality_score: Number(row.intelligence?.quality_score || 0),
    brand_match_score: Number(row.intelligence?.brand_match_score || 0),
    approved_for_reuse: isApprovedReusableAsset(row),
    lineage: cleanObject({
      source: compact(row.lineage?.source, 120),
      provider_id: compact(row.lineage?.provider_id, 120),
      capability: compact(row.lineage?.capability, 160),
      generation_version: Number(row.lineage?.generation_version || 0),
    }),
  });
}

function stableSort(value) {
  if (Array.isArray(value)) return value.map(stableSort);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableSort(value[key])]));
}

function payloadHash(payload) {
  return createHash("sha256").update(JSON.stringify(stableSort(payload))).digest("hex");
}

async function queryOrganization(organization_id) {
  const { data, error } = await supabaseAdmin.from("organizations").select("*").eq("id", organization_id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("ORGANIZATION_NOT_FOUND");
  return data;
}

async function queryLocations(organization_id) {
  const { data, error } = await supabaseAdmin.from("business_locations").select("*").eq("organization_id", organization_id).neq("status", "ARCHIVED").order("name").limit(MAX_LOCATIONS);
  if (error) throw error;
  return data || [];
}

async function queryUploadedAssets(organization_id) {
  const { data, error } = await supabaseAdmin.from("creative_assets").select("*").eq("organization_id", organization_id).eq("archived", false).order("favorite", { ascending: false }).order("created_at", { ascending: false }).limit(MAX_ASSETS);
  if (error) throw error;
  return data || [];
}

async function queryAssetNodes(
  organization_id,
  creative_project_id = null,
) {
  let query = supabaseAdmin
    .from("creative_asset_nodes")
    .select("*")
    .eq("organization_id", organization_id)
    .order("created_at", { ascending: false })
    .limit(MAX_REUSABLE_ASSETS * 3);

  if (creative_project_id) {
    query = query.eq(
      "creative_project_id",
      creative_project_id,
    );
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

function resultValue(result, fallback) {
  return result.status === "fulfilled" ? result.value : fallback;
}

function failure(source, result) {
  if (result.status === "fulfilled") return null;
  return { source, status: "UNAVAILABLE", error: compact(result.reason?.message || result.reason, 500) };
}

async function persistSnapshot({ organization_id, entity_id, period_id, creative_mission_id, creative_project_id, payload, source_manifest, record_counts, captured_by }) {
  const hash = payloadHash(payload);
  const row = {
    organization_id,
    entity_id: entity_id || null,
    period_id: period_id || null,
    creative_mission_id: creative_mission_id || null,
    creative_project_id: creative_project_id || null,
    schema_version: "creative-business-truth-v1",
    source_manifest,
    payload,
    payload_hash: hash,
    record_counts,
    captured_by: captured_by || null,
    metadata: { scope_enforced: true, field_policy: "ALLOWLISTED_BOUNDED_FACTS", prompt_safe: true },
  };

  const { data, error } = await supabaseAdmin.from(SNAPSHOT_TABLE).upsert(row, {
    onConflict: "organization_id,payload_hash,creative_mission_id,creative_project_id",
    ignoreDuplicates: false,
  }).select("id,payload_hash,captured_at,schema_version").single();
  if (error) throw error;
  return data;
}

export const CreativeBusinessTruthRuntime = {
  async hydrate({ organization_id, entity_id = null, period_id = null, creative_mission_id = null, creative_project_id = null, captured_by = null, persist = true } = {}) {
    if (!organization_id) throw new Error("organization_id required");

    const [
      organizationResult,
      currencyResult,
      locationsResult,
      assetsResult,
      assetNodesResult,
    ] = await Promise.allSettled([
      queryOrganization(organization_id),
      resolveOrganizationCurrency({
        organization_id,
        entity_id,
      }),
      queryLocations(organization_id),
      queryUploadedAssets(organization_id),
      queryAssetNodes(
        organization_id,
        creative_project_id,
      ),
    ]);

    if (organizationResult.status === "rejected") throw organizationResult.reason;

    const organization = organizationTruth(organizationResult.value, resultValue(currencyResult, null));
    const locations = resultValue(locationsResult, []).map(locationTruth);
    const uploadedAssets =
      resultValue(assetsResult, [])
        .map(uploadedAssetTruth);
    const assetNodes =
      resultValue(assetNodesResult, []);
    const evidenceNodes =
      assetNodes
        .slice(0, MAX_REUSABLE_ASSETS * 3)
        .map(reusableAssetTruth);
    const reusableAssets =
      assetNodes
        .filter(isApprovedReusableAsset)
        .slice(0, MAX_REUSABLE_ASSETS)
        .map(reusableAssetTruth);
    const failures = [
      failure(
        "organization_currency",
        currencyResult,
      ),
      failure(
        "business_locations",
        locationsResult,
      ),
      failure(
        "creative_assets",
        assetsResult,
      ),
      failure(
        "creative_asset_nodes",
        assetNodesResult,
      ),
    ].filter(Boolean);

    const sourceManifest = [
      { source: "organizations", status: "LIVE", record_count: 1 },
      { source: "organization_currency", status: currencyResult.status === "fulfilled" ? "LIVE" : "UNAVAILABLE", record_count: currencyResult.status === "fulfilled" ? 1 : 0 },
      { source: "business_locations", status: locationsResult.status === "fulfilled" ? "LIVE" : "UNAVAILABLE", record_count: locations.length },
      { source: "creative_assets", status: assetsResult.status === "fulfilled" ? "LIVE" : "UNAVAILABLE", record_count: uploadedAssets.length },
      { source: "creative_asset_nodes", status: assetNodesResult.status === "fulfilled" ? "LIVE" : "UNAVAILABLE", record_count: evidenceNodes.length },
    ];

    const payload = {
      schema_version: "creative-business-truth-v1",
      organization_id,
      entity_id,
      period_id,
      captured_at: new Date().toISOString(),
      organization,
      locations,
      locations_grounding: {
        status:
          locations.length > 0
            ? "STRUCTURED_LOCATION"
            : organization.address ||
                organization.city
              ? "ORGANIZATION_ADDRESS_EVIDENCE"
              : "VISUAL_REFERENCE_ONLY",
        structured_location_count:
          locations.length,
        requires_release_verification:
          locations.length === 0,
      },
      assets: {
        uploaded_references:
          uploadedAssets,
        evidence_nodes:
          evidenceNodes,
        approved_reusable:
          reusableAssets,
      },
      source_failures: failures,
      truth_policy: {
        organization_scope_required: true,
        live_data: true,
        bounded_records: true,
        allowlisted_fields: true,
        treat_assets_as_references_not_factless_prompt_decoration: true,
      },
    };

    const recordCounts = {
      organizations: 1,
      locations: locations.length,
      uploaded_assets:
        uploadedAssets.length,
      asset_nodes:
        evidenceNodes.length,
      reusable_assets:
        reusableAssets.length,
      source_failures:
        failures.length,
    };

    const snapshot = persist ? await persistSnapshot({ organization_id, entity_id, period_id, creative_mission_id, creative_project_id, payload, source_manifest: sourceManifest, record_counts: recordCounts, captured_by }) : null;

    return {
      ...payload,
      payload_hash: snapshot?.payload_hash || payloadHash(payload),
      snapshot_id: snapshot?.id || null,
      snapshot_captured_at: snapshot?.captured_at || null,
      source_manifest: sourceManifest,
      source_failures: failures,
      record_counts: recordCounts,
      schema_version: snapshot?.schema_version || "creative-business-truth-v1",
    };
  },
};

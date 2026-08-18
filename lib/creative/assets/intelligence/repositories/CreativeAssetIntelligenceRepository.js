import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_asset_intelligence";

function text(value) {
  return String(value ?? "").trim();
}

export async function getLatestCompleted({
  organization_id,
  asset_id,
} = {}) {
  const organizationId = text(organization_id);
  const assetId = text(asset_id);
  if (!organizationId) throw new Error("organization_id required");
  if (!assetId) throw new Error("asset_id required");

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select([
      "id",
      "organization_id",
      "asset_id",
      "content_hash",
      "analysis_version",
      "status",
      "source_fingerprint",
      "visual_truth",
      "production_intelligence",
      "provider",
      "model",
      "usage_id",
      "analyzed_at",
      "created_at",
      "updated_at",
    ].join(","))
    .eq("organization_id", organizationId)
    .eq("asset_id", assetId)
    .eq("status", "COMPLETED")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) && data.length ? data[0] : null;
}

export const CreativeAssetIntelligenceRepository = Object.freeze({
  table: TABLE,
  getLatestCompleted,
});

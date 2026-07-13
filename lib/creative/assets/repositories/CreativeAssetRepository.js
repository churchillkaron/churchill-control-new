import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_assets";

export async function create(asset = {}) {
  const payload = {
    organization_id:
      asset.organization_id || null,

    creative_mission_id:
      asset.campaign_id || null,

    asset_type:
      asset.asset_type || asset.type || "UPLOADED",

    file_url:
      asset.file_url ||
      asset.image_url ||
      asset.url ||
      null,

    image_url:
      asset.image_url ||
      asset.file_url ||
      asset.url ||
      null,

    thumbnail_url:
      asset.thumbnail_url ||
      asset.image_url ||
      asset.file_url ||
      asset.url ||
      null,

    file_name:
      asset.file_name ||
      asset.name ||
      null,

    name:
      asset.name || null,

    title:
      asset.title || null,

    description:
      asset.description || "",

    analysis:
      asset.analysis || {},

    metadata:
      asset.metadata || {},

    tags:
      asset.tags ||
      asset.analysis?.tags ||
      [],

    ai_generated:
      Boolean(asset.ai_generated),

    provider:
      asset.provider || null,

    engine:
      asset.engine || null,

    prompt:
      asset.prompt || null,

    favorite:
      Boolean(asset.favorite),

    archived:
      Boolean(asset.archived),

    performance_score:
      Number(
        asset.performance_score ||
        asset.score ||
        0
      ),

    score:
      Number(
        asset.score ||
        asset.performance_score ||
        0
      ),

    usage_count:
      Number(asset.usage_count || 0),

    created_by:
      asset.created_by ||
      asset.uploaded_by ||
      null,

    page_id:
      asset.page_id || null,

    ai_suggested_type:
      asset.ai_suggested_type || null,

    updated_at:
      new Date().toISOString(),
  };

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .insert(payload)
      .select()
      .single();

  if (error) throw error;

  return data;
}

export async function list({
  organization_id,
  creative_mission_id = null,
  asset_type = null,
  page_id = null,
  limit = 200,
} = {}) {

  let query =
    supabaseAdmin
      .from(TABLE)
      .select("*")
      .order(
        "created_at",
        { ascending: false }
      )
      .limit(limit);

  if (organization_id) {
    query =
      query.eq(
        "organization_id",
        organization_id,
      );
  }

  if (campaign_id) {
    query =
      query.eq(
        "campaign_id",
        campaign_id,
      );
  }

  if (asset_type) {
    query =
      query.eq(
        "asset_type",
        asset_type,
      );
  }

  if (page_id) {
    query =
      query.eq(
        "page_id",
        page_id,
      );
  }

  const { data, error } =
    await query;

  if (error) throw error;

  return data || [];
}

export async function get(id) {
  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .single();

  if (error) throw error;

  return data;
}

export async function update(
  id,
  values = {},
) {

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .update({
        ...values,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

  if (error) throw error;

  return data;
}

export async function remove(id) {

  const { error } =
    await supabaseAdmin
      .from(TABLE)
      .delete()
      .eq("id", id);

  if (error) throw error;

  return true;
}

export async function incrementUsage(id) {

  const asset =
    await get(id);

  return update(id, {
    usage_count:
      Number(
        asset?.usage_count || 0
      ) + 1,
  });

}

export async function listByProject(
  project,
) {

  if (!project) {
    return [];
  }

  return list({

    organization_id:
      project.organization_id,

    creative_mission_id:
      project.campaign_id || null,

  });

}

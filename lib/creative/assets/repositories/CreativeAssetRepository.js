import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_assets";

function first(...values) {
  return values.find((value) => value !== undefined && value !== null) ?? null;
}

function normalizePayload(asset = {}) {
  const organizationId = first(asset.organization_id, asset.organizationId);
  const missionId = first(
    asset.creative_mission_id,
    asset.creativeMissionId,
    asset.mission_id,
    asset.missionId,
  );
  const projectId = first(
    asset.creative_project_id,
    asset.creativeProjectId,
    asset.project_id,
    asset.projectId,
  );
  const campaignId = first(asset.campaign_id, asset.campaignId);
  const fileUrl = first(
    asset.file_url,
    asset.fileUrl,
    asset.image_url,
    asset.imageUrl,
    asset.url,
  );
  const imageUrl = first(asset.image_url, asset.imageUrl, fileUrl);
  const thumbnailUrl = first(
    asset.thumbnail_url,
    asset.thumbnailUrl,
    imageUrl,
    fileUrl,
  );
  const analysis = asset.analysis || {};
  const metadata = {
    ...(asset.metadata || {}),
    creative_project_id: projectId,
    creative_mission_id: missionId,
    campaign_id: campaignId,
  };

  if (!organizationId) {
    throw new Error("organization_id required");
  }

  if (!fileUrl && !thumbnailUrl) {
    throw new Error("Creative asset requires a file URL or thumbnail URL");
  }

  return {
    organization_id: organizationId,
    creative_mission_id: missionId,
    campaign_id: campaignId,
    asset_type: first(asset.asset_type, asset.assetType, asset.type, "UPLOADED"),
    file_url: fileUrl,
    image_url: imageUrl,
    thumbnail_url: thumbnailUrl,
    file_name: first(asset.file_name, asset.fileName, asset.name),
    name: asset.name || null,
    title: asset.title || null,
    description: asset.description || analysis.description || "",
    analysis,
    metadata,
    tags: asset.tags || analysis.tags || [],
    ai_generated: Boolean(first(asset.ai_generated, asset.aiGenerated, false)),
    provider: asset.provider || null,
    engine: asset.engine || null,
    prompt: asset.prompt || null,
    favorite: Boolean(asset.favorite),
    archived: Boolean(asset.archived),
    performance_score: Number(first(asset.performance_score, asset.performanceScore, asset.score, 0)),
    score: Number(first(asset.score, asset.performance_score, asset.performanceScore, 0)),
    usage_count: Number(first(asset.usage_count, asset.usageCount, 0)),
    created_by: first(asset.created_by, asset.createdBy, asset.uploaded_by, asset.uploadedBy),
    page_id: first(asset.page_id, asset.pageId),
    ai_suggested_type: first(asset.ai_suggested_type, asset.aiSuggestedType),
    updated_at: new Date().toISOString(),
  };
}

export async function create(asset = {}) {
  const payload = normalizePayload(asset);
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function list({
  organization_id,
  organizationId,
  creative_mission_id = null,
  creativeMissionId = null,
  creative_project_id = null,
  creativeProjectId = null,
  campaign_id = null,
  campaignId = null,
  asset_type = null,
  assetType = null,
  page_id = null,
  pageId = null,
  limit = 200,
} = {}) {
  const organization = first(organization_id, organizationId);
  const mission = first(creative_mission_id, creativeMissionId);
  const project = first(creative_project_id, creativeProjectId);
  const campaign = first(campaign_id, campaignId);
  const type = first(asset_type, assetType);
  const page = first(page_id, pageId);

  if (!organization) {
    throw new Error("organization_id required");
  }

  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization)
    .eq("archived", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (mission) {
    query = query.or(`creative_mission_id.eq.${mission},metadata->>creative_mission_id.eq.${mission}`);
  }
  if (project) {
    query = query.eq("metadata->>creative_project_id", project);
  }
  if (campaign) {
    query = query.or(`campaign_id.eq.${campaign},metadata->>campaign_id.eq.${campaign}`);
  }
  if (type) {
    query = query.eq("asset_type", type);
  }
  if (page) {
    query = query.eq("page_id", page);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function get(id) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

export async function update(id, values = {}) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function remove(id) {
  const { error } = await supabaseAdmin
    .from(TABLE)
    .update({ archived: true, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
  return true;
}

export async function incrementUsage(id) {
  const asset = await get(id);
  return update(id, {
    usage_count: Number(asset?.usage_count || 0) + 1,
  });
}

export async function listByProject(project) {
  if (!project) return [];
  return list({
    organization_id: project.organization_id,
    creative_mission_id: project.creative_mission_id || project.campaign_id || null,
    creative_project_id: project.id || null,
  });
}

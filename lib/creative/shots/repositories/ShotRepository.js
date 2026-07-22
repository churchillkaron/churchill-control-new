import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_shots";

const PHYSICAL_COLUMNS = new Set([
  "id",
  "organization_id",
  "creative_project_id",
  "scene_id",
  "storyboard_id",
  "production_graph_id",
  "scene_number",
  "shot_number",
  "title",
  "purpose",
  "duration_seconds",
  "camera",
  "lighting",
  "actors",
  "products",
  "location",
  "dialogue",
  "narration",
  "music",
  "sound_effects",
  "subtitles",
  "assets",
  "ai_generation",
  "status",
  "metadata",
  "created_at",
  "updated_at",
]);

const RICH_DIRECTION_FIELDS = [
  "opening_frame",
  "closing_frame",
  "action_beats",
  "performance_direction",
  "reference_asset_ids",
  "reference_pack",
  "continuity",
  "reality_rules",
  "negative_constraints",
  "quality_requirements",
  "transition_in",
  "transition_out",
  "director_version",
  "revision_reason",
  "archived_at",
];

function requireOrganization(input = {}) {
  const organizationId =
    input.organization_id || input.organizationId || null;

  if (!organizationId) {
    throw new Error("organization_id required");
  }

  return organizationId;
}

function normalizeShotRow(row = null) {
  if (!row) return row;

  const metadata = row.metadata || {};

  return {
    ...row,
    opening_frame:
      metadata.opening_frame ??
      row.camera?.opening_frame ??
      "",
    closing_frame:
      metadata.closing_frame ??
      row.camera?.closing_frame ??
      "",
    action_beats: metadata.action_beats || [],
    performance_direction:
      metadata.performance_direction || "",
    reference_asset_ids:
      metadata.reference_asset_ids ||
      row.assets ||
      [],
    reference_pack: metadata.reference_pack || {},
    continuity: metadata.continuity || {},
    reality_rules: metadata.reality_rules || {},
    negative_constraints:
      metadata.negative_constraints || [],
    quality_requirements:
      metadata.quality_requirements || {},
    transition_in: metadata.transition_in || {},
    transition_out: metadata.transition_out || {},
    director_version:
      metadata.director_version || null,
    revision_reason:
      metadata.revision_reason || null,
    archived_at:
      metadata.archived_at || null,
  };
}

function sanitizeShotPayload(
  values = {},
  {
    current = null,
    update = false,
  } = {},
) {
  const payload = {};
  const metadata = {
    ...(current?.metadata || {}),
    ...(values.metadata || {}),
  };

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || key === "metadata") continue;

    if (PHYSICAL_COLUMNS.has(key)) {
      payload[key] = value;
    } else {
      metadata[key] = value;
    }
  }

  for (const field of RICH_DIRECTION_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(values, field)) {
      metadata[field] = values[field];
      delete payload[field];
    }
  }

  const camera = {
    ...(current?.camera || {}),
    ...(values.camera || {}),
  };

  if (Object.prototype.hasOwnProperty.call(values, "opening_frame")) {
    camera.opening_frame = values.opening_frame;
  }

  if (Object.prototype.hasOwnProperty.call(values, "closing_frame")) {
    camera.closing_frame = values.closing_frame;
  }

  if (Object.keys(camera).length) {
    payload.camera = camera;
  }

  if (
    Object.prototype.hasOwnProperty.call(values, "reference_asset_ids") &&
    !Object.prototype.hasOwnProperty.call(values, "assets")
  ) {
    payload.assets = Array.isArray(values.reference_asset_ids)
      ? values.reference_asset_ids
      : [];
  }

  payload.metadata = metadata;

  delete payload.organizationId;
  delete payload.creativeProjectId;
  delete payload.sceneId;
  delete payload.storyboardId;
  delete payload.productionGraphId;

  if (update) {
    delete payload.id;
    delete payload.created_at;
    delete payload.created_by;
  }

  return payload;
}

export async function list({
  organization_id,
  creative_project_id,
  scene_id,
}) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .order("scene_number")
    .order("shot_number");

  if (creative_project_id) {
    query = query.eq(
      "creative_project_id",
      creative_project_id,
    );
  }

  if (scene_id) {
    query = query.eq("scene_id", scene_id);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data || []).map(normalizeShotRow);
}

export async function get(id, input = {}) {
  if (!id) throw new Error("shot id required");

  const organizationId = requireOrganization(input);

  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (input.creative_project_id) {
    query = query.eq(
      "creative_project_id",
      input.creative_project_id,
    );
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return normalizeShotRow(data || null);
}

export async function create(shot = {}) {
  requireOrganization(shot);

  const payload = sanitizeShotPayload(shot);

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return normalizeShotRow(data);
}

export async function update(id, values = {}, input = {}) {
  if (!id) throw new Error("shot id required");

  const organizationId = requireOrganization({
    ...input,
    ...values,
  });
  const projectId =
    input.creative_project_id ||
    values.creative_project_id ||
    null;

  const current = await get(id, {
    organization_id: organizationId,
    creative_project_id: projectId,
  });

  if (!current) {
    throw new Error("SHOT_NOT_FOUND_IN_ORGANIZATION");
  }

  const payload = sanitizeShotPayload(values, {
    current,
    update: true,
  });

  let query = supabaseAdmin
    .from(TABLE)
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (projectId) {
    query = query.eq(
      "creative_project_id",
      projectId,
    );
  }

  const { data, error } = await query
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("SHOT_NOT_FOUND_IN_ORGANIZATION");
  }

  return normalizeShotRow(data);
}

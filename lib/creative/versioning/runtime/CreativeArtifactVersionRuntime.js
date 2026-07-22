import { createHash } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const VERSION_TABLE = "creative_artifact_versions";

const ARTIFACT_TABLES = {
  STRATEGY: "creative_strategies",
  CONCEPT: "creative_concepts",
  STORYBOARD: "creative_storyboards",
  SCENE: "creative_scenes",
  SHOT: "creative_shots",
  PRODUCTION_GRAPH: "creative_production_graphs",
  ASSET: "creative_asset_nodes",
};

function artifactTable(type) {
  const normalized = String(type || "").toUpperCase();
  const table = ARTIFACT_TABLES[normalized];
  if (!table) throw new Error(`Unsupported creative artifact type: ${type}`);
  return { type: normalized, table };
}

function payloadHash(payload) {
  return createHash("sha256")
    .update(JSON.stringify(payload || {}))
    .digest("hex");
}

function scopeQuery(query, input = {}) {
  let scoped = query.eq("organization_id", input.organization_id);

  if (input.creative_project_id) {
    scoped = scoped.eq("creative_project_id", input.creative_project_id);
  }

  return scoped;
}

export const CreativeArtifactVersionRuntime = {
  async list({
    organization_id,
    creative_project_id = null,
    artifact_type = null,
    artifact_id = null,
    limit = 100,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");

    let query = supabaseAdmin
      .from(VERSION_TABLE)
      .select("*")
      .eq("organization_id", organization_id)
      .order("created_at", { ascending: false })
      .limit(Math.max(1, Math.min(Number(limit || 100), 500)));

    if (creative_project_id) {
      query = query.eq("creative_project_id", creative_project_id);
    }
    if (artifact_type) {
      query = query.eq("artifact_type", String(artifact_type).toUpperCase());
    }
    if (artifact_id) {
      query = query.eq("artifact_id", artifact_id);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async snapshot({
    organization_id,
    creative_project_id = null,
    artifact_type,
    artifact_id,
    reason = "Manual snapshot",
    created_by = null,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!artifact_id) throw new Error("artifact_id required");

    const { type, table } = artifactTable(artifact_type);
    let currentQuery = supabaseAdmin
      .from(table)
      .select("*")
      .eq("id", artifact_id)
      .eq("organization_id", organization_id);

    if (creative_project_id) {
      currentQuery = currentQuery.eq("creative_project_id", creative_project_id);
    }

    const { data: current, error: currentError } = await currentQuery.maybeSingle();
    if (currentError) throw currentError;
    if (!current) throw new Error("CREATIVE_ARTIFACT_NOT_FOUND");

    const versionNumber = Number(current.version_number || 1);
    const { data, error } = await supabaseAdmin
      .from(VERSION_TABLE)
      .upsert({
        organization_id,
        creative_project_id: current.creative_project_id || creative_project_id,
        creative_mission_id: current.creative_mission_id || null,
        artifact_type: type,
        artifact_id,
        version_number: versionNumber,
        parent_version_id: current.version_parent_id || null,
        change_type: "SNAPSHOT",
        reason,
        payload: current,
        payload_hash: payloadHash(current),
        created_by,
      }, {
        onConflict: "artifact_type,artifact_id,version_number",
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async restore({
    organization_id,
    creative_project_id = null,
    version_id,
    reason = "Restore earlier creative version",
    restored_by = null,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!version_id) throw new Error("version_id required");

    let versionQuery = supabaseAdmin
      .from(VERSION_TABLE)
      .select("*")
      .eq("id", version_id)
      .eq("organization_id", organization_id);

    if (creative_project_id) {
      versionQuery = versionQuery.eq("creative_project_id", creative_project_id);
    }

    const { data: version, error: versionError } = await versionQuery.maybeSingle();
    if (versionError) throw versionError;
    if (!version) throw new Error("CREATIVE_ARTIFACT_VERSION_NOT_FOUND");

    const { table } = artifactTable(version.artifact_type);
    const restoredPayload = {
      ...(version.payload || {}),
      id: version.artifact_id,
      organization_id,
      creative_project_id:
        version.creative_project_id || creative_project_id || null,
      revision_reason: reason,
      updated_at: new Date().toISOString(),
    };

    delete restoredPayload.version_number;
    delete restoredPayload.version_parent_id;
    delete restoredPayload.version_created_at;

    let updateQuery = supabaseAdmin
      .from(table)
      .update(restoredPayload)
      .eq("id", version.artifact_id)
      .eq("organization_id", organization_id);

    if (creative_project_id) {
      updateQuery = updateQuery.eq("creative_project_id", creative_project_id);
    }

    const { data: restored, error: restoreError } = await updateQuery
      .select()
      .single();
    if (restoreError) throw restoreError;

    await supabaseAdmin
      .from(VERSION_TABLE)
      .insert({
        organization_id,
        creative_project_id:
          version.creative_project_id || creative_project_id || null,
        creative_mission_id: version.creative_mission_id || null,
        artifact_type: version.artifact_type,
        artifact_id: version.artifact_id,
        version_number: Number(restored.version_number || 1),
        parent_version_id: version.id,
        change_type: "RESTORE",
        reason,
        payload: restored,
        payload_hash: payloadHash(restored),
        created_by: restored_by,
      })
      .throwOnError();

    return restored;
  },
};

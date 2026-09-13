import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { buildImageStudioWorkspaceState } from "../runtime/CreativeImageStudioWorkspaceRuntime.js";

const TABLES = Object.freeze({
  artboards: "creative_image_artboards", layers: "creative_image_layers", references: "creative_image_references",
  comments: "creative_image_comments", versions: "creative_image_versions", exports: "creative_image_exports",
});

function required(value, name) { if (!value) throw new Error(`${name} required`); return value; }
async function rows(table, query) { const { data, error } = await query; if (error) throw error; return data || []; }

export async function loadImageStudioWorkspace({ organization_id, creative_project_id, entity_id = null }) {
  required(organization_id, "organization_id"); required(creative_project_id, "creative_project_id");
  const scope = (table) => supabaseAdmin.from(table).select("*").eq("organization_id", organization_id).eq("creative_project_id", creative_project_id);
  const [artboards, layers, references, comments, versions, exports] = await Promise.all([
    rows(TABLES.artboards, scope(TABLES.artboards).order("sort_order")), rows(TABLES.layers, scope(TABLES.layers).order("sort_order")),
    rows(TABLES.references, scope(TABLES.references).order("created_at")), rows(TABLES.comments, scope(TABLES.comments).order("created_at")),
    rows(TABLES.versions, scope(TABLES.versions).order("version_number", { ascending: false })), rows(TABLES.exports, scope(TABLES.exports).order("created_at", { ascending: false })),
  ]);
  return buildImageStudioWorkspaceState({ project_id: creative_project_id, organization_id, entity_id, artboards, layers, references, comments, versions, exports });
}

export async function upsertImageStudioArtboard(record = {}) {
  required(record.organization_id, "organization_id"); required(record.creative_project_id, "creative_project_id"); required(record.id, "id");
  const payload = { ...record, updated_at: new Date().toISOString() };
  const { data, error } = await supabaseAdmin.from(TABLES.artboards).upsert(payload, { onConflict: "id" }).select().single();
  if (error) throw error; return data;
}

export async function upsertImageStudioLayer(record = {}) {
  required(record.organization_id, "organization_id"); required(record.creative_project_id, "creative_project_id"); required(record.artboard_id, "artboard_id"); required(record.id, "id");
  const payload = { ...record, updated_at: new Date().toISOString() };
  const { data, error } = await supabaseAdmin.from(TABLES.layers).upsert(payload, { onConflict: "id" }).select().single();
  if (error) throw error; return data;
}

export async function createImageStudioSnapshot(record = {}) {
  required(record.organization_id, "organization_id"); required(record.creative_project_id, "creative_project_id"); required(record.artboard_id, "artboard_id");
  const { data, error } = await supabaseAdmin.from(TABLES.versions).insert(record).select().single();
  if (error) throw error; return data;
}

export const CreativeImageStudioWorkspaceRepository = Object.freeze({ load: loadImageStudioWorkspace, upsertArtboard: upsertImageStudioArtboard, upsertLayer: upsertImageStudioLayer, snapshot: createImageStudioSnapshot });

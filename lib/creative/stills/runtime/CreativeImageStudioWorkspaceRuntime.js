const PANELS = Object.freeze(["brief", "artboards", "assets", "references", "moodboard", "layers", "comments", "versions", "output"]);
const TOOLS = Object.freeze(["select", "move", "text", "image", "comment", "region"]);
const COMMANDS = Object.freeze([
  "create_project_from_brief", "create_artboard", "update_artboard", "place_asset", "update_layer",
  "generate_concepts", "edit_region", "expand_canvas", "replace_asset", "create_variant",
  "add_reference", "update_reference", "create_comment", "update_comment", "request_review", "resolve_comment", "snapshot_version", "export_artboard", "execute_semantic_mask",
]);

function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return String(value ?? "").trim(); }
function number(value, fallback = 0) { const next = Number(value); return Number.isFinite(next) ? next : fallback; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

export function normalizeImageStudioArtboard(value = {}, index = 0) {
  return {
    id: text(value.id) || `artboard-${index + 1}`,
    name: text(value.name) || `Artboard ${index + 1}`,
    width: Math.max(1, number(value.width, 1080)),
    height: Math.max(1, number(value.height, 1350)),
    sort_order: number(value.sort_order, index),
    background: object(value.background),
    export_preset: object(value.export_preset),
    metadata: object(value.metadata),
    status: text(value.status) || "DRAFT",
  };
}

export function normalizeImageStudioLayer(value = {}, index = 0) {
  return {
    id: text(value.id) || `layer-${index + 1}`,
    artboard_id: text(value.artboard_id),
    parent_layer_id: text(value.parent_layer_id) || null,
    source_asset_id: text(value.source_asset_id) || null,
    layer_type: text(value.layer_type || value.type) || "IMAGE",
    name: text(value.name) || `Layer ${index + 1}`,
    bounds: object(value.bounds), transform: object(value.transform), style: object(value.style), content: object(value.content),
    sort_order: number(value.sort_order, index), visible: value.visible !== false, locked: value.locked === true,
    metadata: object(value.metadata),
  };
}

export function buildImageStudioWorkspaceState(input = {}) {
  const artboards = list(input.artboards).map(normalizeImageStudioArtboard).sort((a, b) => a.sort_order - b.sort_order);
  const selectedArtboardId = text(input.selected_artboard_id) || artboards[0]?.id || null;
  return {
    contract: "CREATIVE_IMAGE_STUDIO_WORKSPACE_V1",
    project_id: text(input.project_id) || null,
    organization_id: text(input.organization_id) || null,
    entity_id: text(input.entity_id) || null,
    artboards,
    layers: list(input.layers).map(normalizeImageStudioLayer),
    references: list(input.references), comments: list(input.comments), versions: list(input.versions), exports: list(input.exports),
    selection: { artboard_id: selectedArtboardId, layer_ids: list(input.selected_layer_ids) },
    viewport: { zoom: number(input.viewport?.zoom, 0.75), x: number(input.viewport?.x), y: number(input.viewport?.y) },
    ui: { panel: PANELS.includes(input.ui?.panel) ? input.ui.panel : "artboards", tool: TOOLS.includes(input.ui?.tool) ? input.ui.tool : "select", compare: Boolean(input.ui?.compare), grid: input.ui?.grid !== false, region: input.ui?.region || null },
    dirty: false,
  };
}

export function validateImageStudioCommand(command = {}) {
  const type = text(command.type);
  if (!COMMANDS.includes(type)) throw new Error(`CREATIVE_IMAGE_STUDIO_COMMAND_UNSUPPORTED:${type || "EMPTY"}`);
  if (!text(command.organization_id)) throw new Error("organization_id required");
  if (!text(command.project_id) && type !== "create_project_from_brief") throw new Error("project_id required");
  return { ...command, type };
}

export const CreativeImageStudioWorkspaceRuntime = Object.freeze({
  contract: "CREATIVE_IMAGE_STUDIO_WORKSPACE_V1", panels: PANELS, tools: TOOLS, commands: COMMANDS,
  build: buildImageStudioWorkspaceState, validateCommand: validateImageStudioCommand,
});

export default CreativeImageStudioWorkspaceRuntime;

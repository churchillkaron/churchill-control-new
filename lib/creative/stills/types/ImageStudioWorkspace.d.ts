export type ImageStudioPanel =
  | "brief" | "artboards" | "assets" | "references" | "moodboard"
  | "layers" | "comments" | "versions" | "output";

export type ImageStudioTool = "select" | "move" | "text" | "image" | "comment" | "region";

export interface ImageStudioArtboard {
  id: string;
  name: string;
  width: number;
  height: number;
  sort_order: number;
  background: Record<string, unknown>;
  export_preset: Record<string, unknown>;
  status: string;
}

export interface ImageStudioLayer {
  id: string;
  artboard_id: string;
  parent_layer_id: string | null;
  source_asset_id: string | null;
  layer_type: string;
  name: string;
  bounds: Record<string, unknown>;
  transform: Record<string, unknown>;
  style: Record<string, unknown>;
  content: Record<string, unknown>;
  sort_order: number;
  visible: boolean;
  locked: boolean;
  metadata: Record<string, unknown>;
}

export interface ImageStudioWorkspaceState {
  contract: "CREATIVE_IMAGE_STUDIO_WORKSPACE_V1";
  project_id: string | null;
  organization_id: string | null;
  entity_id: string | null;
  artboards: ImageStudioArtboard[];
  layers: ImageStudioLayer[];
  references: Record<string, unknown>[];
  comments: Record<string, unknown>[];
  versions: Record<string, unknown>[];
  exports: Record<string, unknown>[];
  selection: { artboard_id: string | null; layer_ids: string[] };
  viewport: { zoom: number; x: number; y: number };
  ui: { panel: ImageStudioPanel; tool: ImageStudioTool; compare: boolean; grid: boolean; region: Record<string, number> | null };
  dirty: boolean;
}

export type ImageStudioCommandType =
  | "create_project_from_brief"
  | "create_artboard"
  | "update_artboard"
  | "place_asset"
  | "update_layer"
  | "generate_concepts"
  | "edit_region"
  | "expand_canvas"
  | "replace_asset"
  | "create_variant"
  | "add_reference"
  | "create_comment"
  | "add_reference"
  | "create_comment"
  | "update_comment"
  | "request_review"
  | "resolve_comment"
  | "snapshot_version"
  | "export_artboard";

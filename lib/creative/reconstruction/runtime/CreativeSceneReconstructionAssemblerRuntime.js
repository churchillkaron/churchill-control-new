import {
  downloadCreativeStorageReference,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  CreativeOpenCVRuntime,
} from "@/lib/creative/tools/runtime/CreativeOpenCVRuntime";
import {
  CreativeDepthGeometryProxyRuntime,
} from "./CreativeDepthGeometryProxyRuntime.js";
import {
  CreativeReconstructionArtifactRuntime,
} from "./CreativeReconstructionArtifactRuntime.js";

export const CREATIVE_SCENE_RECONSTRUCTION_ASSEMBLER_CONTRACT =
  "CREATIVE_SCENE_RECONSTRUCTION_ASSEMBLER_V1";

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }

async function blobBuffer(blob) {
  if (Buffer.isBuffer(blob)) return blob;
  if (blob?.arrayBuffer) return Buffer.from(await blob.arrayBuffer());
  throw new Error("RECONSTRUCTION_BLOB_BUFFER_REQUIRED");
}

async function persistDepth({ scope, depth_reference, metadata = {} }) {
  const downloaded = await downloadCreativeStorageReference({
    organization_id: scope.organization_id,
    reference: depth_reference,
  });
  const buffer = await blobBuffer(downloaded.blob);
  return CreativeReconstructionArtifactRuntime.persist({
    ...scope,
    artifact_kind: "DEPTH_MAP",
    buffer,
    mime_type: "image/png",
    extension: "png",
    provider_id: "avantiqo-image",
    capability: "creative.depth.estimate",
    metadata: {
      ...metadata,
      provider_storage_reference: depth_reference,
      derived_locally: false,
    },
  });
}

export async function assembleSceneReconstruction({
  organization_id,
  creative_project_id,
  creative_mission_id = null,
  project,
  shot_id,
  reconstruction_contract,
  source_reference,
  depth_reference,
  depth_metadata = {},
  material_result,
  material_metadata = {},
} = {}) {
  if (!project?.id || text(project.id) !== text(creative_project_id)) {
    throw new Error("RECONSTRUCTION_PROJECT_CONTEXT_REQUIRED");
  }
  if (text(reconstruction_contract?.contract) !== "CREATIVE_SCENE_RECONSTRUCTION_CONTRACT_V1") {
    throw new Error("RECONSTRUCTION_CANONICAL_CONTRACT_REQUIRED");
  }
  if (!text(source_reference).startsWith("storage://")) {
    throw new Error("RECONSTRUCTION_SOURCE_STORAGE_REFERENCE_REQUIRED");
  }
  if (!text(depth_reference).startsWith("storage://")) {
    throw new Error("RECONSTRUCTION_DEPTH_STORAGE_REFERENCE_REQUIRED");
  }
  if (!material_result || typeof material_result !== "object") {
    throw new Error("RECONSTRUCTION_MATERIAL_RESULT_REQUIRED");
  }

  const scope = {
    organization_id,
    creative_project_id,
    creative_mission_id,
    shot_id,
    reconstruction_contract_hash: text(reconstruction_contract.contract_hash),
    source_asset_ids: list(reconstruction_contract.source_asset_ids),
  };

  const artifacts = {};
  artifacts.depth = await persistDepth({ scope, depth_reference, metadata: depth_metadata });

  const segmentation = await CreativeOpenCVRuntime.execute({
    organization_id,
    project,
    operation: "IMAGE_SEGMENTATION",
    source_reference,
  });
  if (!segmentation.mask?.buffer) throw new Error("RECONSTRUCTION_SEGMENTATION_ARTIFACT_REQUIRED");
  artifacts.segmentation = await CreativeReconstructionArtifactRuntime.persist({
    ...scope,
    artifact_kind: "IMAGE_SEGMENTATION_MASK",
    buffer: segmentation.mask.buffer,
    mime_type: "image/png",
    extension: "png",
    provider_id: "opencv",
    capability: "creative.image.segmentation.execute",
    upstream_asset_node_ids: [artifacts.depth.node.id],
    technical: segmentation.result?.source || {},
    metadata: {
      opencv_contract: segmentation.contract,
      segmentation_result: segmentation.result,
      derived_locally: true,
    },
  });

  const normals = await CreativeOpenCVRuntime.execute({
    organization_id,
    project,
    operation: "DEPTH_NORMALS",
    source_reference: artifacts.depth.storage_reference,
  });
  if (!normals.mask?.buffer) throw new Error("RECONSTRUCTION_NORMAL_ARTIFACT_REQUIRED");
  artifacts.normals = await CreativeReconstructionArtifactRuntime.persist({
    ...scope,
    artifact_kind: "SURFACE_NORMAL_MAP",
    buffer: normals.mask.buffer,
    mime_type: "image/png",
    extension: "png",
    provider_id: "opencv",
    capability: "creative.normals.estimate",
    upstream_asset_node_ids: [artifacts.depth.node.id],
    metadata: {
      opencv_contract: normals.contract,
      normal_result: normals.result,
      derived_locally: true,
    },
  });

  const geometry = await CreativeDepthGeometryProxyRuntime.build({
    organization_id,
    project,
    depth_reference: artifacts.depth.storage_reference,
  });
  artifacts.geometry = await CreativeReconstructionArtifactRuntime.persist({
    ...scope,
    artifact_kind: "GEOMETRY_PROXY_OBJ",
    buffer: geometry.buffer,
    mime_type: "text/plain",
    extension: "obj",
    provider_id: "depth-geometry-proxy",
    capability: "creative.geometry-proxy.build",
    upstream_asset_node_ids: [artifacts.depth.node.id],
    metadata: {
      geometry_contract: geometry.contract,
      ...object(geometry.metadata),
      derived_locally: true,
    },
  });

  const cameraProxy = {
    contract: "CREATIVE_SINGLE_VIEW_CAMERA_PROXY_V1",
    shot_id,
    geometry_asset_node_id: artifacts.geometry.node.id,
    geometry_mode: geometry.metadata?.geometry_mode,
    metric_intrinsics_resolved: false,
    metric_scale_resolved: false,
    principal_point_normalized: [0.5, 0.5],
    source_image_plane_locked: true,
    safe_camera_motion: geometry.metadata?.safe_camera_motion || "SMALL_TRANSLATION_AND_PARALLAX_ONLY",
    large_orbit_allowed: false,
    reverse_angle_allowed: false,
    maximum_recommended_frame_translation_ratio:
      geometry.metadata?.maximum_recommended_frame_translation_ratio ?? 0.05,
  };
  artifacts.camera = await CreativeReconstructionArtifactRuntime.persistJson({
    ...scope,
    artifact_kind: "SINGLE_VIEW_CAMERA_PROXY",
    value: cameraProxy,
    provider_id: "depth-geometry-proxy",
    capability: "creative.camera.single-view-proxy",
    upstream_asset_node_ids: [artifacts.geometry.node.id],
    metadata: { derived_locally: true, metric_intrinsics_resolved: false },
  });

  const lights = await CreativeOpenCVRuntime.execute({
    organization_id,
    project,
    operation: "PRACTICAL_LIGHTS",
    source_reference,
  });
  artifacts.lights = await CreativeReconstructionArtifactRuntime.persistJson({
    ...scope,
    artifact_kind: "PRACTICAL_LIGHT_MAP",
    value: lights.result,
    provider_id: "opencv",
    capability: "creative.practical-light.estimate",
    metadata: { opencv_contract: lights.contract, derived_locally: true },
  });

  artifacts.materials = await CreativeReconstructionArtifactRuntime.persistJson({
    ...scope,
    artifact_kind: "SURFACE_MATERIAL_MAP",
    value: material_result,
    provider_id: "avantiqo-image",
    capability: "creative.materials.estimate",
    metadata: {
      ...material_metadata,
      derived_locally: false,
      semantic_material_evidence: true,
    },
  });

  const manifest = {
    contract: CREATIVE_SCENE_RECONSTRUCTION_ASSEMBLER_CONTRACT,
    reconstruction_contract_hash: scope.reconstruction_contract_hash,
    shot_id,
    source_reference,
    artifacts: Object.fromEntries(Object.entries(artifacts).map(([key, item]) => [key, {
      node_id: item.node.id,
      artifact_kind: item.node.metadata?.artifact_kind,
      storage_reference: item.storage_reference,
      checksum_sha256: item.checksum_sha256,
    }])),
    truth_limits: {
      single_view_source: true,
      metric_scale_resolved: false,
      full_hidden_geometry_reconstructed: false,
      large_orbit_allowed: false,
      reverse_angle_allowed: false,
    },
    required_layers_present: [
      "DEPTH_MAP",
      "IMAGE_SEGMENTATION_MASK",
      "SURFACE_NORMAL_MAP",
      "GEOMETRY_PROXY_OBJ",
      "SINGLE_VIEW_CAMERA_PROXY",
      "PRACTICAL_LIGHT_MAP",
      "SURFACE_MATERIAL_MAP",
    ],
    qc_status: "REQUIRES_RECONSTRUCTION_QC",
    release_approved: false,
  };
  artifacts.manifest = await CreativeReconstructionArtifactRuntime.persistJson({
    ...scope,
    artifact_kind: "RECONSTRUCTION_MANIFEST",
    value: manifest,
    provider_id: "avantiqo",
    capability: "creative.scene-reconstruction.assemble",
    upstream_asset_node_ids: Object.values(artifacts).map((item) => item.node.id),
    metadata: {
      derived_locally: true,
      reconstruction_complete_for_qc: true,
      release_approved: false,
    },
  });

  return {
    contract: CREATIVE_SCENE_RECONSTRUCTION_ASSEMBLER_CONTRACT,
    shot_id,
    artifacts,
    manifest: { ...manifest, manifest_asset_node_id: artifacts.manifest.node.id },
    provider_calls_executed_by_assembler: false,
    local_derivations_executed: true,
    release_approved: false,
  };
}

export const CreativeSceneReconstructionAssemblerRuntime = Object.freeze({
  contract: CREATIVE_SCENE_RECONSTRUCTION_ASSEMBLER_CONTRACT,
  assemble: assembleSceneReconstruction,
});

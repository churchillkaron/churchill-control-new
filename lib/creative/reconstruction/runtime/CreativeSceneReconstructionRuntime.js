import crypto from 'node:crypto';

export const CREATIVE_SCENE_RECONSTRUCTION_CONTRACT = 'CREATIVE_SCENE_RECONSTRUCTION_CONTRACT_V1';

const text = (v) => String(v ?? '').trim();
const list = (v) => Array.isArray(v) ? v.filter(Boolean) : [];
const object = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const digest = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

function sourceIds(shot = {}) {
  const ids = new Set();
  const primary = text(shot.primary_source_asset_id || shot.generation?.primary_source_asset_id);
  if (primary) ids.add(primary);
  for (const ref of list(shot.reference_assets)) {
    const id = text(typeof ref === 'string' ? ref : ref.asset_id || ref.id);
    if (id) ids.add(id);
  }
  return [...ids];
}

function needsReconstruction(shot = {}) {
  const sr = object(shot.source_reinterpretation);
  if (sr.required === true && text(sr.mode).toUpperCase() === 'CINEMATIC_REINTERPRETATION') return true;
  return sourceIds(shot).length > 0 && /venue|location|architecture|environment|interior|exterior|building|restaurant|hotel|factory|office|bar/i.test(
    `${text(shot.subject)} ${text(shot.action)} ${JSON.stringify(shot.production_design || {})}`,
  );
}

function buildContract(shot = {}) {
  const assets = sourceIds(shot);
  if (!needsReconstruction(shot) || !assets.length) return null;
  const sr = object(shot.source_reinterpretation);
  const contract = {
    contract: CREATIVE_SCENE_RECONSTRUCTION_CONTRACT,
    shot_id: text(shot.id),
    source_asset_ids: assets,
    primary_source_asset_id: text(shot.primary_source_asset_id || shot.generation?.primary_source_asset_id) || assets[0],
    source_media_kind: text(shot.source_media_kind || shot.media_kind || shot.medium || 'IMAGE').toUpperCase().includes('VIDEO') ? 'VIDEO' : 'IMAGE',
    identity_truth: text(sr.identity_truth),
    reconstruction_scope: {
      camera_estimation_required: true,
      depth_estimation_required: true,
      geometry_proxy_required: true,
      surface_material_classification_required: true,
      practical_light_source_estimation_required: true,
      world_anchor_extraction_required: true,
      occlusion_map_required: true,
      reflection_shadow_receiver_map_required: true,
    },
    world_truth_locks: {
      preserve_architecture: true,
      preserve_layout: true,
      preserve_distinctive_materials: true,
      preserve_signage_and_brand_marks: true,
      preserve_major_object_placement: true,
      hallucinated_architecture_forbidden: true,
    },
    viewpoint_policy: {
      requested_logic: text(sr.new_viewpoint_logic),
      new_viewpoint_allowed_only_with_geometry_support: true,
      unsupported_camera_travel_forbidden: true,
      source_viewpoint_may_be_retained_and_rephotographed: true,
    },
    output_layers: [
      'CAMERA_SOLUTION',
      'DEPTH_MAP',
      'GEOMETRY_PROXY',
      'SURFACE_MATERIAL_MAP',
      'PRACTICAL_LIGHT_MAP',
      'OCCLUSION_MAP',
      'REFLECTION_SHADOW_RECEIVER_MAP',
      'WORLD_ANCHORS',
    ],
    quality_gates: {
      source_alignment_required: true,
      architectural_identity_required: true,
      camera_geometry_consistency_required: true,
      scale_consistency_required: true,
      depth_order_consistency_required: true,
    },
  };
  return { ...contract, contract_hash: digest(contract) };
}

export const CreativeSceneReconstructionRuntime = Object.freeze({
  contract: CREATIVE_SCENE_RECONSTRUCTION_CONTRACT,
  buildForShot: buildContract,
  author({ shots = [], creative_plan = {} } = {}) {
    let count = 0;
    const nextShots = list(shots).map((shot) => {
      const contract = buildContract(shot);
      if (!contract) return shot;
      count += 1;
      return { ...shot, scene_reconstruction_contract: contract };
    });
    return {
      shots: nextShots,
      creative_plan: {
        ...creative_plan,
        scene_reconstruction: {
          contract: CREATIVE_SCENE_RECONSTRUCTION_CONTRACT,
          authored_shot_count: count,
          execution_time_authorship_forbidden: true,
        },
      },
      metadata: { scene_reconstruction_authored_shot_count: count },
    };
  },
});

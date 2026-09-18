import {
  CreativeToolRegistry,
  CREATIVE_TOOL_CAPABILITIES,
} from '../../tools/registry/CreativeToolRegistry.js';

export const CREATIVE_SCENE_RECONSTRUCTION_EXECUTION_CONTRACT =
  'CREATIVE_SCENE_RECONSTRUCTION_EXECUTION_V1';

const text = (v) => String(v ?? '').trim();
const list = (v) => Array.isArray(v) ? v.filter(Boolean) : [];
const object = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};

const REQUIRED_CAPABILITIES = Object.freeze([
  ['camera_solution', CREATIVE_TOOL_CAPABILITIES.CAMERA_TRACK],
  ['segmentation', CREATIVE_TOOL_CAPABILITIES.SEGMENTATION],
  ['depth_map', CREATIVE_TOOL_CAPABILITIES.DEPTH_ESTIMATE],
  ['geometry_proxy', CREATIVE_TOOL_CAPABILITIES.GEOMETRY_PROXY],
  ['surface_normals', CREATIVE_TOOL_CAPABILITIES.NORMAL_ESTIMATE],
  ['surface_materials', CREATIVE_TOOL_CAPABILITIES.MATERIAL_ESTIMATE],
  ['practical_lights', CREATIVE_TOOL_CAPABILITIES.PRACTICAL_LIGHT_ESTIMATE],
]);

function resolveCapability(capability) {
  const tool = CreativeToolRegistry.resolve(capability);
  return tool
    ? {
        available: true,
        capability,
        tool_id: tool.id,
        runtime: tool.runtime,
        quality_tier: tool.quality_tier,
        cost_class: tool.cost_class,
      }
    : { available: false, capability, tool_id: null, runtime: null };
}

function readiness(contract = {}) {
  if (text(contract.contract) !== 'CREATIVE_SCENE_RECONSTRUCTION_CONTRACT_V1') {
    throw new Error('SCENE_RECONSTRUCTION_CONTRACT_REQUIRED');
  }
  const scope = object(contract.reconstruction_scope);
  const capabilities = Object.fromEntries(
    REQUIRED_CAPABILITIES.map(([key, capability]) => [key, resolveCapability(capability)]),
  );
  const requiredKeys = [];
  if (scope.camera_estimation_required === true) requiredKeys.push('camera_solution');
  if (scope.depth_estimation_required === true) requiredKeys.push('depth_map');
  if (scope.geometry_proxy_required === true) requiredKeys.push('geometry_proxy');
  if (scope.surface_material_classification_required === true) requiredKeys.push('surface_materials');
  if (scope.practical_light_source_estimation_required === true) requiredKeys.push('practical_lights');
  if (scope.occlusion_map_required === true) requiredKeys.push('segmentation', 'depth_map');
  if (scope.reflection_shadow_receiver_map_required === true) requiredKeys.push('surface_normals', 'surface_materials');

  const uniqueRequired = [...new Set(requiredKeys)];
  const blockers = uniqueRequired
    .filter((key) => capabilities[key]?.available !== true)
    .map((key) => ({
      code: `SCENE_RECONSTRUCTION_CAPABILITY_UNAVAILABLE:${key.toUpperCase()}`,
      capability: capabilities[key]?.capability || null,
      repair: `Install or register an approved ${key} execution tool before reconstruction can be certified.`,
    }));

  return {
    contract: CREATIVE_SCENE_RECONSTRUCTION_EXECUTION_CONTRACT,
    reconstruction_contract_hash: contract.contract_hash || null,
    ready: blockers.length === 0,
    required_capability_keys: uniqueRequired,
    capabilities,
    blockers,
    source_asset_ids: list(contract.source_asset_ids),
    no_fake_completion: true,
  };
}

function executionPlan(contract = {}) {
  const state = readiness(contract);
  const steps = [
    { id: 'camera-solve', capability_key: 'camera_solution', outputs: ['CAMERA_SOLUTION'] },
    { id: 'segmentation', capability_key: 'segmentation', outputs: ['OCCLUSION_MASK_BASE'] },
    { id: 'depth', capability_key: 'depth_map', outputs: ['DEPTH_MAP'] },
    { id: 'geometry-proxy', capability_key: 'geometry_proxy', depends_on: ['depth','camera-solve'], outputs: ['GEOMETRY_PROXY','WORLD_ANCHORS'] },
    { id: 'surface-normals', capability_key: 'surface_normals', depends_on: ['depth'], outputs: ['SURFACE_NORMAL_MAP'] },
    { id: 'materials', capability_key: 'surface_materials', outputs: ['SURFACE_MATERIAL_MAP'] },
    { id: 'practical-lights', capability_key: 'practical_lights', outputs: ['PRACTICAL_LIGHT_MAP'] },
    { id: 'occlusion-map', capability_key: null, depends_on: ['segmentation','depth'], outputs: ['OCCLUSION_MAP'] },
    { id: 'receivers', capability_key: null, depends_on: ['surface-normals','materials','depth'], outputs: ['REFLECTION_SHADOW_RECEIVER_MAP'] },
  ].filter((step) => {
    if (!step.capability_key) return true;
    return state.required_capability_keys.includes(step.capability_key) ||
      ['segmentation','surface_normals'].includes(step.capability_key);
  }).map((step) => ({
    ...step,
    status: step.capability_key && state.capabilities[step.capability_key]?.available !== true
      ? 'BLOCKED_CAPABILITY_MISSING'
      : 'READY_WHEN_DEPENDENCIES_COMPLETE',
    tool: step.capability_key ? state.capabilities[step.capability_key] : null,
  }));

  return {
    ...state,
    steps,
    executable_now: state.ready,
    certification_policy: 'ALL_REQUIRED_LAYERS_MUST_HAVE_REAL_ARTIFACT_EVIDENCE',
  };
}

export const CreativeSceneReconstructionExecutionRuntime = Object.freeze({
  contract: CREATIVE_SCENE_RECONSTRUCTION_EXECUTION_CONTRACT,
  required_capabilities: REQUIRED_CAPABILITIES,
  readiness,
  plan: executionPlan,
});

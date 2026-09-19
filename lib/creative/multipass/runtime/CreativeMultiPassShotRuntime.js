import crypto from 'node:crypto';

export const CREATIVE_MULTIPASS_SHOT_CONTRACT = 'CREATIVE_MULTIPASS_SHOT_CONTRACT_V1';
const text = (v) => String(v ?? '').trim();
const list = (v) => Array.isArray(v) ? v.filter(Boolean) : [];
const object = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const digest = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

function requiresPremiumPasses(shot = {}) {
  const strategy = object(shot.generation_strategy);
  if (strategy.pass_policy?.multipass_required === true || text(strategy.mode).toUpperCase() === "MULTIPASS_COMPLEX") return true;
  const sr = object(shot.source_reinterpretation);
  const graphics = object(shot.graphics);
  const cinematicMotion = object(shot.cinematic_motion_design);
  return sr.required === true || Boolean(shot.scene_reconstruction_contract) || list(shot.vfx).length > 0 || Boolean(shot.simulation_contract) || Boolean(shot.compositing_contract) || list(cinematicMotion.events).length > 0 || list(graphics.cinematic_motion_events).length > 0;
}

function pass(id, role, depends_on = [], required = true) {
  return { id, role, depends_on, required, quality_gate: true };
}
function compactPassDependencies(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function build(shot = {}) {
  if (!requiresPremiumPasses(shot)) return null;
  const strategy = object(shot.generation_strategy);
  const passPolicy = object(strategy.pass_policy);
  const hasSource = Boolean(text(shot.primary_source_asset_id || shot.generation?.primary_source_asset_id));
  const hasReconstruction = Boolean(shot.scene_reconstruction_contract);
  const hasSimulation = Boolean(shot.simulation_contract);
  const graphics = object(shot.graphics);
  const hasCinematicMotion = Boolean(
    list(object(shot.cinematic_motion_design).events).length ||
    list(graphics.cinematic_motion_events).length
  );
  const hasGraphics = Boolean(
    list(graphics.titles).length ||
    list(graphics.subtitles).length ||
    list(graphics.overlays).length ||
    Object.keys(object(graphics.logo)).length ||
    Object.keys(object(shot.typography)).length
  );
  const hasVfx = Boolean(list(shot.vfx).length || Object.keys(object(shot.vfx)).length || hasSimulation);
  const passes = [];
  if (hasReconstruction) passes.push(pass('scene-reconstruction', 'SCENE_RECONSTRUCTION'));
  passes.push(pass('base-plate', 'BASE_PLATE', hasReconstruction ? ['scene-reconstruction'] : []));
  passes.push(pass('hero-object', 'HERO_OBJECT', ['base-plate'], false));
  if (hasSimulation) passes.push(pass('simulation', 'PHYSICAL_SIMULATION', ['base-plate']));
  if (passPolicy.separate_physical_interaction_pass_required === true && !hasSimulation) {
    passes.push(pass('physical-interaction', 'PHYSICAL_INTERACTION', ['base-plate']));
  }
  if (passPolicy.separate_threat_or_hero_layer_required === true) {
    passes.push(pass('threat-hero-layer', 'THREAT_HERO_LAYER', ['base-plate']));
  }
  if (hasVfx || passPolicy.separate_vfx_or_transformation_pass_required === true) {
    const deps = ['base-plate'];
    if (hasSimulation) deps.push('simulation');
    if (passPolicy.separate_physical_interaction_pass_required === true && !hasSimulation) deps.push('physical-interaction');
    if (passPolicy.separate_threat_or_hero_layer_required === true) deps.push('threat-hero-layer');
    passes.push(pass('vfx-integration', 'VFX_INTEGRATION', deps));
  }
  if (hasCinematicMotion) passes.push(pass('cinematic-motion', 'CINEMATIC_MOTION_DESIGN', hasReconstruction ? ['base-plate','scene-reconstruction'] : ['base-plate']));
  passes.push(pass('atmosphere', 'ATMOSPHERE', ['base-plate'], passPolicy.separate_atmosphere_layer_required === true));
  const interactionDeps = compactPassDependencies(['base-plate', hasVfx ? 'vfx-integration' : null, hasCinematicMotion ? 'cinematic-motion' : null]);
  passes.push(pass('lighting-interaction', 'LIGHTING_INTERACTION', interactionDeps, hasSource || hasVfx || hasCinematicMotion));
  passes.push(pass('reflection-shadow', 'REFLECTION_SHADOW', ['lighting-interaction'], hasSource || hasVfx || hasCinematicMotion));
  if (hasGraphics) passes.push(pass('graphics', 'GRAPHICS_MOTION', ['base-plate'], false));
  const compositeDeps = passes.filter((p) => !['scene-reconstruction'].includes(p.id)).map((p) => p.id);
  passes.push(pass('composite', 'FINAL_COMPOSITE', compositeDeps));
  passes.push(pass('optical-finish', 'OPTICAL_FINISH', ['composite']));
  passes.push(pass('shot-qc', 'PERCEPTUAL_AND_TECHNICAL_QC', ['optical-finish']));

  const contract = {
    contract: CREATIVE_MULTIPASS_SHOT_CONTRACT,
    shot_id: text(shot.id),
    primary_source_asset_id: text(shot.primary_source_asset_id || shot.generation?.primary_source_asset_id) || null,
    source_reinterpretation: object(shot.source_reinterpretation),
    generation_strategy: strategy,
    passes,
    rules: {
      single_generation_equals_finished_shot_forbidden: true,
      base_plate_may_not_absorb_unplanned_vfx: true,
      simulation_may_not_be_faked_in_base_generation: true,
      physically_interactive_layers_require_light_shadow_reflection_integration: true,
      final_composite_requires_all_required_upstream_passes: true,
      qc_requires_actual_composited_media: true,
      final_color_di_is_project_level_after_edit: true,
      per_shot_final_color_di_forbidden: true,
    },
  };
  return { ...contract, contract_hash: digest(contract) };
}


function applyToGraph(graph = {}, shots = []) {
  const byId = new Map(list(shots).map((shot) => [text(shot.id), shot]));
  const nodes = [...list(graph.nodes)];
  const edges = [...list(graph.edges)];
  let shotCount = 0;
  let passCount = 0;
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (text(node.type).toUpperCase() !== 'SHOT') continue;
    const shot = byId.get(text(node.id));
    const contract = shot?.multipass_contract;
    if (!contract) continue;
    shotCount += 1;
    nodes[i] = {
      ...node,
      requirements: { ...object(node.requirements), multipass_contract: contract },
      metadata: { ...object(node.metadata), multipass_contract: contract.contract, multipass_contract_hash: contract.contract_hash, multipass_required: true },
    };
    for (const p of list(contract.passes)) {
      const passId = `pass:${shot.id}:${p.id}`;
      passCount += 1;
      nodes.push({
        id: passId,
        type: p.role === 'PERCEPTUAL_AND_TECHNICAL_QC' ? 'ASSET' : 'RENDER',
        title: `${shot.title || shot.id} · ${p.role}`,
        description: `Governed ${p.role} pass for ${shot.id}`,
        duration_seconds: Number(shot.duration_seconds || 0),
        intent: { shot_id: shot.id, pass_role: p.role },
        requirements: { shot_id: shot.id, pass_id: p.id, pass_role: p.role, multipass_contract_hash: contract.contract_hash, required: p.required === true },
        assets: [],
        generation: { required: false, service: null, capability: null, provider: null, estimated_cost: 0, estimated_seconds: 0, status: 'PLANNED_PASS' },
        quality: { score: null, issues: [], approved: false },
        metadata: { shot_id: shot.id, multipass_pass: true, provider_execution_allowed: false, planned_only: true },
      });
      edges.push({ id: `edge:${shot.id}:${p.id}:contains`, from: shot.id, to: passId, type: 'CONTAINS', metadata: {} });
      for (const dep of list(p.depends_on)) {
        edges.push({ id: `edge:${shot.id}:${dep}:${p.id}`, from: `pass:${shot.id}:${dep}`, to: passId, type: 'DEPENDS_ON', metadata: {} });
      }
    }
  }
  return { ...graph, nodes, edges, metadata: { ...object(graph.metadata), multipass_injected_shot_count: shotCount, multipass_pass_node_count: passCount, single_generation_finished_shot_forbidden: true } };
}
export const CreativeMultiPassShotRuntime = Object.freeze({
  contract: CREATIVE_MULTIPASS_SHOT_CONTRACT,
  buildForShot: build,
  applyToGraph,
  author({ shots = [], creative_plan = {} } = {}) {
    let count = 0;
    const nextShots = list(shots).map((shot) => {
      const contract = build(shot);
      if (!contract) return shot;
      count += 1;
      return { ...shot, multipass_contract: contract };
    });
    return { shots: nextShots, creative_plan: { ...creative_plan, multipass_production: { contract: CREATIVE_MULTIPASS_SHOT_CONTRACT, authored_shot_count: count } }, metadata: { multipass_authored_shot_count: count } };
  },
});

export const CREATIVE_MULTIPASS_EXECUTION_CONTRACT = 'CREATIVE_MULTIPASS_EXECUTION_V1';

const text = (v) => String(v ?? '').trim();
const list = (v) => Array.isArray(v) ? v.filter(Boolean) : [];
const object = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};

function nodeMap(graph = {}) {
  return new Map(list(graph.nodes).map((node) => [text(node.id), node]));
}

function completed(node = {}) {
  return node.metadata?.artifact_evidence_complete === true ||
    node.metadata?.execution_completed === true ||
    node.generation?.status === 'COMPLETED' ||
    node.quality?.approved === true;
}

function readiness({ graph = {}, shot_id, reconstruction_readiness = null } = {}) {
  const nodes = nodeMap(graph);
  const shot = nodes.get(text(shot_id));
  if (!shot) throw new Error(`MULTIPASS_SHOT_NOT_FOUND:${shot_id}`);
  const contract = object(shot.requirements?.multipass_contract);
  if (contract.contract !== 'CREATIVE_MULTIPASS_SHOT_CONTRACT_V1') {
    throw new Error(`MULTIPASS_CONTRACT_REQUIRED:${shot_id}`);
  }

  const passStates = list(contract.passes).map((pass) => {
    const id = `pass:${shot_id}:${pass.id}`;
    const node = nodes.get(id);
    const dependencies = list(pass.depends_on).map((dep) => {
      const dependencyNode = nodes.get(`pass:${shot_id}:${dep}`);
      return {
        pass_id: dep,
        node_id: dependencyNode?.id || null,
        completed: dependencyNode ? completed(dependencyNode) : false,
      };
    });
    const missingDependencies = dependencies.filter((dep) => !dep.completed);
    let blocker = null;
    if (pass.id === 'scene-reconstruction' && reconstruction_readiness?.ready === false) {
      blocker = 'SCENE_RECONSTRUCTION_NOT_EXECUTABLE';
    } else if (missingDependencies.length) {
      blocker = 'UPSTREAM_PASS_ARTIFACT_REQUIRED';
    }
    return {
      pass_id: pass.id,
      role: pass.role,
      node_id: node?.id || id,
      required: pass.required === true,
      completed: node ? completed(node) : false,
      dependencies,
      ready: blocker === null && !completed(node),
      blocker,
    };
  });

  const requiredBlocked = passStates.filter((state) => state.required && state.blocker);
  const finalComposite = passStates.find((state) => state.pass_id === 'composite');
  const qc = passStates.find((state) => state.pass_id === 'shot-qc');
  return {
    contract: CREATIVE_MULTIPASS_EXECUTION_CONTRACT,
    shot_id,
    pass_states: passStates,
    required_blocker_count: requiredBlocked.length,
    required_blockers: requiredBlocked,
    next_ready_passes: passStates.filter((state) => state.ready),
    final_composite_releasable: finalComposite?.ready === true || finalComposite?.completed === true,
    shot_release_ready: qc?.completed === true,
    single_generation_finished_shot_forbidden: true,
  };
}

export const CreativeMultiPassExecutionRuntime = Object.freeze({
  contract: CREATIVE_MULTIPASS_EXECUTION_CONTRACT,
  readiness,
});

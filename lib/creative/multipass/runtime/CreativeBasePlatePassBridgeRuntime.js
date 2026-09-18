export const CREATIVE_BASE_PLATE_PASS_BRIDGE_CONTRACT =
  "CREATIVE_BASE_PLATE_PASS_BRIDGE_V1";

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

function executionNodeId(task = {}) {
  return text(task.metadata?.execution_node_id || task.input?.node_id);
}

function approvedDerivedFrame(task = {}) {
  return task.status === "COMPLETED" &&
    task.metadata?.approved_for_downstream_after_perceptual_review === true &&
    task.metadata?.automated_perceptual_validation_passed === true;
}

function outputUrl(task = {}) {
  const output = object(task.output?.output || task.output);
  return text(
    output.asset_url || output.image_url || output.file_url || output.url ||
    output.result?.url || output.images?.[0]?.url,
  ) || null;
}

export function reconcileBasePlatePasses({ graph = {}, tasks = [] } = {}) {
  const taskRows = list(tasks);
  const nodes = list(graph.nodes).map((node) => ({ ...node }));
  let completed = 0;
  for (const passNode of nodes.filter((node) =>
    text(node.metadata?.multipass_pass) === "true" || node.metadata?.multipass_pass === true
  )) {
    if (text(passNode.intent?.pass_role).toUpperCase() !== "BASE_PLATE") continue;
    const executorNodeId = text(passNode.metadata?.base_plate_execution_node_id);
    if (!executorNodeId) continue;
    const task = taskRows.find((candidate) => executionNodeId(candidate) === executorNodeId);
    if (!task || !approvedDerivedFrame(task)) continue;
    completed += 1;
    passNode.quality = {
      ...object(passNode.quality),
      score: Number(task.metadata?.shot_candidate_review_score || 100),
      issues: [],
      approved: true,
    };
    passNode.metadata = {
      ...object(passNode.metadata),
      artifact_evidence_complete: true,
      execution_completed: true,
      base_plate_task_id: task.id,
      base_plate_output_url: outputUrl(task),
      base_plate_perceptual_review_passed: true,
      base_plate_bridge_contract: CREATIVE_BASE_PLATE_PASS_BRIDGE_CONTRACT,
    };
  }
  return {
    ...graph,
    nodes,
    metadata: {
      ...object(graph.metadata),
      base_plate_bridge_contract: CREATIVE_BASE_PLATE_PASS_BRIDGE_CONTRACT,
      base_plate_passes_completed: completed,
    },
  };
}

export const CreativeBasePlatePassBridgeRuntime = Object.freeze({
  contract: CREATIVE_BASE_PLATE_PASS_BRIDGE_CONTRACT,
  reconcile: reconcileBasePlatePasses,
});

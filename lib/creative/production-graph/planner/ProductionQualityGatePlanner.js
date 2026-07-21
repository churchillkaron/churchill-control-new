import {
  createProductionNode,
  createProductionEdge,
} from "../documents/ProductionGraph";

function isMasterStill(node = {}) {
  return node.metadata?.deliverable === "MASTER_STILL";
}

function isVideoShot(node = {}) {
  return node.metadata?.deliverable === "VIDEO_SHOT";
}

function addDependency(edges, from, to, condition) {
  if (edges.some((edge) => (
    edge.from === from &&
    edge.to === to &&
    edge.type === "DEPENDS_ON"
  ))) {
    return edges;
  }

  return [
    ...edges,
    createProductionEdge({
      from,
      to,
      type: "DEPENDS_ON",
      metadata: { condition },
    }),
  ];
}

function addMasterStillGate({ graph, nodes, edges, nodeMap, masterNode }) {
  const videoNode = nodes.find((candidate) => (
    isVideoShot(candidate) &&
    candidate.metadata?.shot_id === masterNode.metadata?.shot_id
  ));

  if (!videoNode) return { edges, added: 0 };

  const qaNodeId = `${masterNode.id}:qa`;
  let added = 0;

  if (!nodeMap.has(qaNodeId)) {
    const specification =
      masterNode.requirements?.specification ||
      masterNode.generation?.input?.specification ||
      {};
    const minimumScore = Number(
      specification.shot?.quality_requirements?.minimum_score ||
      graph.metadata?.minimum_master_still_score ||
      90,
    );

    const qaNode = createProductionNode({
      id: qaNodeId,
      type: "ASSET",
      title: `${masterNode.title} — Visual QA`,
      description:
        "Inspect the generated master still and block motion generation unless it satisfies the director and reference contract.",
      duration_seconds: 0,
      intent: {
        deliverable: "MASTER_STILL_QA",
        approval_gate: true,
      },
      requirements: {
        specification,
        minimum_score: minimumScore,
        inspected_node_id: masterNode.id,
      },
      assets: [],
      generation: {
        required: true,
        service: "ai.image.analyze",
        capability: "ai.image.analyze",
        estimated_cost: 0,
        estimated_seconds: 20,
        status: "WAITING",
        input: {
          mode: "creative_master_still_qa",
          specification,
          minimum_score: minimumScore,
          inspected_node_id: masterNode.id,
          prompt: `
Act as a strict senior commercial-film visual quality supervisor.
Inspect the generated master still supplied through the dependency asset.
Judge it against the exact specification and reference contract below.
${JSON.stringify(specification)}
Return strict JSON with passed, overall_score, scores, critical_failures, issues, correction_instructions and evidence.
Set passed true only when overall_score is at least ${minimumScore} and there are no critical failures.
          `.trim(),
        },
      },
      metadata: {
        scene_id: masterNode.metadata?.scene_id || null,
        shot_id: masterNode.metadata?.shot_id || null,
        deliverable: "MASTER_STILL_QA",
        inspected_node_id: masterNode.id,
        requires_quality_approval: false,
        production_contract: "atomic_reference_grounded_shots_v1",
      },
    });

    nodes.push(qaNode);
    nodeMap.set(qaNodeId, qaNode);
    added = 1;
  }

  let nextEdges = addDependency(
    edges,
    masterNode.id,
    qaNodeId,
    "MASTER_STILL_GENERATED",
  );

  // Preserve the original master -> video dependency because it carries the
  // approved source image. QA is an additional mandatory dependency.
  nextEdges = addDependency(
    nextEdges,
    qaNodeId,
    videoNode.id,
    "MASTER_STILL_QA_PASSED",
  );

  return { edges: nextEdges, added };
}

function addVideoShotGate({ graph, nodes, edges, nodeMap, videoNode }) {
  const qaNodeId = `${videoNode.id}:qa`;
  let added = 0;

  if (!nodeMap.has(qaNodeId)) {
    const specification =
      videoNode.requirements?.specification ||
      videoNode.generation?.input?.specification ||
      {};
    const minimumScore = Number(
      specification.shot?.quality_requirements?.minimum_video_score ||
      specification.shot?.quality_requirements?.minimum_score ||
      graph.metadata?.minimum_video_shot_score ||
      90,
    );

    const qaNode = createProductionNode({
      id: qaNodeId,
      type: "SHOT",
      title: `${videoNode.title} — Motion QA`,
      description:
        "Extract representative frames from the generated shot and reject temporal instability, fidelity drift, physical errors or continuity failures.",
      duration_seconds: 0,
      intent: {
        deliverable: "VIDEO_SHOT_QA",
        approval_gate: true,
      },
      requirements: {
        specification,
        minimum_score: minimumScore,
        inspected_node_id: videoNode.id,
      },
      assets: [],
      generation: {
        required: true,
        service: "ai.image.analyze",
        capability: "ai.image.analyze",
        estimated_cost: 0,
        estimated_seconds: 45,
        status: "WAITING",
        input: {
          mode: "creative_video_shot_qa",
          specification,
          minimum_score: minimumScore,
          inspected_node_id: videoNode.id,
        },
      },
      metadata: {
        scene_id: videoNode.metadata?.scene_id || null,
        shot_id: videoNode.metadata?.shot_id || null,
        deliverable: "VIDEO_SHOT_QA",
        inspected_node_id: videoNode.id,
        requires_quality_approval: false,
        production_contract: "atomic_reference_grounded_shots_v1",
      },
    });

    nodes.push(qaNode);
    nodeMap.set(qaNodeId, qaNode);
    added = 1;
  }

  return {
    edges: addDependency(
      edges,
      videoNode.id,
      qaNodeId,
      "VIDEO_SHOT_GENERATED",
    ),
    added,
  };
}

export function insertProductionQualityGates(graph = {}) {
  const nodes = [...(graph.nodes || [])];
  let edges = [...(graph.edges || [])];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  let masterStillGateCount = 0;
  let videoShotGateCount = 0;

  for (const masterNode of nodes.filter(isMasterStill)) {
    const result = addMasterStillGate({
      graph,
      nodes,
      edges,
      nodeMap,
      masterNode,
    });
    edges = result.edges;
    masterStillGateCount += result.added;
  }

  for (const videoNode of nodes.filter(isVideoShot)) {
    const result = addVideoShotGate({
      graph,
      nodes,
      edges,
      nodeMap,
      videoNode,
    });
    edges = result.edges;
    videoShotGateCount += result.added;
  }

  return {
    ...graph,
    nodes,
    edges,
    metadata: {
      ...(graph.metadata || {}),
      mandatory_master_still_qa: true,
      mandatory_video_shot_qa: true,
      master_still_quality_gates: masterStillGateCount,
      video_shot_quality_gates: videoShotGateCount,
      total_generated_deliverables:
        nodes.filter((node) => node.generation?.required).length,
    },
  };
}

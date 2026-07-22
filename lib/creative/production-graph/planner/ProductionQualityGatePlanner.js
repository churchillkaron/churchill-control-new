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
    const referenceAssets = [
      ...(masterNode.generation?.input?.reference_assets || []),
      ...(masterNode.assets || []),
    ];

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
      assets: referenceAssets,
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
          reference_assets: referenceAssets,
          prompt: `
Act as an uncompromising senior commercial-film visual quality supervisor.

The first supplied image is the GENERATED MASTER STILL. Any additional supplied images are ORIGINAL REFERENCE IMAGES and must be compared directly for identity, venue, architecture, product, logo, material, and brand fidelity.

Judge against the exact specification and reference contract:
${JSON.stringify(specification)}

Use an ABSOLUTE 0-100 scale, not a generous school grade:
- 0-10: unusable, unrelated, obviously wrong, generic, badly artificial, or substantially violates the brief/references.
- 11-30: major failures; cannot enter production.
- 31-49: weak draft with serious fidelity, realism, composition, or direction failures.
- 50-69: recognizably on brief but clearly below professional campaign quality.
- 70-84: professional draft with meaningful defects; still rejected.
- 85-89: strong near-final work with only minor, localized corrections.
- 90-94: production-ready premium commercial quality.
- 95-100: exceptional world-class frame with no meaningful defect.

Four or more critical failures must score no higher than 10.
Three critical failures must score no higher than 20.
Two critical failures must score no higher than 30.
One critical failure must score no higher than 49.
A wrong identity, wrong venue, invented architecture, broken anatomy, incorrect logo/text, generic stock appearance, or major brief contradiction must score no higher than 10.
Do not award identity, venue, product, or brand fidelity without direct visual evidence from the references.

Return strict JSON containing:
- passed
- overall_score
- scores with exactly: brief_accuracy, identity_fidelity, venue_fidelity, brand_product_fidelity, composition_camera, lighting, realism_anatomy, emotional_readability, technical_quality, commercial_craft
- critical_failures
- issues
- correction_instructions
- evidence

Set passed true only when overall_score is at least ${minimumScore}, every required dimension is present, all hard-fidelity dimensions meet their thresholds, and there are zero critical failures.
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
        quality_calibration_contract: "absolute_world_class_master_still_v2",
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

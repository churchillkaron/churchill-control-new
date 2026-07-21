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

function replaceVideoDependency(edges, masterId, videoId, qaId) {
  return edges
    .filter((edge) => !(
      edge.from === masterId &&
      edge.to === videoId &&
      edge.type === "DEPENDS_ON"
    ))
    .concat(
      createProductionEdge({
        from: masterId,
        to: qaId,
        type: "DEPENDS_ON",
        metadata: {
          condition: "MASTER_STILL_GENERATED",
        },
      }),
      createProductionEdge({
        from: qaId,
        to: videoId,
        type: "DEPENDS_ON",
        metadata: {
          condition: "MASTER_STILL_QA_PASSED",
        },
      }),
    );
}

export function insertProductionQualityGates(graph = {}) {
  const nodes = [...(graph.nodes || [])];
  let edges = [...(graph.edges || [])];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  let qualityGateCount = 0;

  for (const masterNode of nodes.filter(isMasterStill)) {
    const videoNode = nodes.find((candidate) => (
      isVideoShot(candidate) &&
      candidate.metadata?.shot_id === masterNode.metadata?.shot_id
    ));

    if (!videoNode) continue;

    const qaNodeId = `${masterNode.id}:qa`;

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
          critical_dimensions: [
            "identity_fidelity",
            "product_fidelity",
            "brand_fidelity",
            "venue_fidelity",
            "anatomy",
            "physical_reality",
            "composition",
            "lighting",
            "continuity",
            "technical_quality",
          ],
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
`,
          },
        },
        metadata: {
          scene_id: masterNode.metadata?.scene_id || null,
          shot_id: masterNode.metadata?.shot_id || null,
          deliverable: "MASTER_STILL_QA",
          inspected_node_id: masterNode.id,
          requires_quality_approval: false,
          production_contract:
            "atomic_reference_grounded_shots_v1",
        },
      });

      nodes.push(qaNode);
      nodeMap.set(qaNodeId, qaNode);
      qualityGateCount += 1;
    }

    edges = replaceVideoDependency(
      edges,
      masterNode.id,
      videoNode.id,
      qaNodeId,
    );
  }

  return {
    ...graph,
    nodes,
    edges,
    metadata: {
      ...(graph.metadata || {}),
      mandatory_master_still_qa: true,
      master_still_quality_gates: qualityGateCount,
      total_generated_deliverables:
        nodes.filter((node) => node.generation?.required).length,
    },
  };
}

import {
  createProductionNode,
  createProductionEdge,
} from "@/lib/creative/production-graph/documents/ProductionGraph";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function singingContract(shot = {}) {
  const contract = object(
    shot.performance_contract ||
    shot.metadata?.performance_contract,
  );
  return contract.lip_sync_required === true &&
    contract.singing_visible === true &&
    contract.mouth_visible === true
    ? contract
    : null;
}

export const CreativeLipSyncGraphRuntime = {
  apply({ graph, shots = [] } = {}) {
    if (!graph) throw new Error("production graph required");
    const shotMap = new Map(list(shots).map((shot) => [shot.id, shot]));
    const nodes = [...list(graph.nodes)];
    let edges = [...list(graph.edges)];
    const inserted = [];

    for (const shotNode of nodes.filter((node) => node.type === "SHOT")) {
      const shot = shotMap.get(shotNode.id);
      const contract = singingContract(shot);
      if (!contract) continue;

      const motionId = `${shotNode.id}:performance-motion-plate`;
      const reviewId = `${shotNode.id}:lip-sync-review`;
      if (nodes.some((node) => node.id === motionId || node.id === reviewId)) continue;
      if (!text(contract.primary_audio_asset_id)) {
        throw new Error(`LIPSYNC_PRIMARY_AUDIO_REQUIRED:${shotNode.id}`);
      }
      const start = Number(contract.audio_start_seconds);
      const end = Number(contract.audio_end_seconds);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        throw new Error(`LIPSYNC_AUDIO_RANGE_INVALID:${shotNode.id}`);
      }

      const originalGeneration = object(shotNode.generation);
      const incoming = edges.filter((edge) => edge.to === shotNode.id);
      edges = edges.filter((edge) => edge.to !== shotNode.id);

      const motionNode = createProductionNode({
        id: motionId,
        type: "PERFORMANCE_MOTION_PLATE",
        title: `Performance motion plate for ${shotNode.title || shotNode.id}`,
        description: "Generate identity-locked body, head and camera motion before applying the exact soundtrack segment.",
        priority: Math.max(0, Number(shotNode.priority || 100) - 1),
        intent: shotNode.intent,
        requirements: {
          ...object(shotNode.requirements),
          lip_sync_deferred: true,
          visible_mouth_required: true,
          preserve_identity: true,
        },
        assets: list(shotNode.assets),
        generation: {
          ...originalGeneration,
          provider_prompt: [
            text(originalGeneration.provider_prompt),
            "Generate a physically believable visible singing-performance motion plate with the mouth unobscured, but do not invent phoneme timing. Exact vocal articulation will be applied from the supplied soundtrack in the dedicated audio-conditioned lip-sync stage.",
          ].filter(Boolean).join("\n\n"),
          provider_parameters: {
            ...object(originalGeneration.provider_parameters),
            performance_motion_plate: true,
            exact_lip_sync_deferred: true,
          },
        },
        metadata: {
          ...object(shotNode.metadata),
          contract: "PERFORMANCE_MOTION_PLATE_V1",
          final_shot_node_id: shotNode.id,
          lip_sync_required: true,
        },
      });

      shotNode.type = "AUDIO_CONDITIONED_LIPSYNC";
      shotNode.title = `Audio-conditioned lip sync for ${shotNode.title || shotNode.id}`;
      shotNode.description = "Apply the exact source-audio segment to the approved identity-preserving performance motion plate.";
      shotNode.assets = [];
      shotNode.generation = {
        required: true,
        service: "ai.video.lip_sync",
        capability: "ai.video.lip_sync",
        provider: "managed_lipsync",
        estimated_cost: Number(contract.lip_sync_estimated_cost || 0),
        estimated_seconds: Number(contract.lip_sync_estimated_seconds || shotNode.duration_seconds || 0),
        output_spec: originalGeneration.output_spec || shotNode.requirements?.output_spec || {},
        provider_parameters: {
          audio_conditioned: true,
          source_motion_node_id: motionId,
          primary_audio_asset_id: contract.primary_audio_asset_id,
          audio_start_seconds: start,
          audio_end_seconds: end,
          identity_profile_id:
            contract.identity_profile_id ||
            shot.identity_requirements?.profile_id ||
            null,
          identity_atlas_url:
            shot.identity_requirements?.identity_atlas_url ||
            shot.generation?.identity_lock?.identity_atlas_url ||
            null,
          preserve_identity: true,
          preserve_camera_motion: true,
          preserve_body_motion: true,
        },
      };
      shotNode.requirements = {
        ...object(shotNode.requirements),
        source_motion_node_id: motionId,
        primary_audio_asset_id: contract.primary_audio_asset_id,
        audio_start_seconds: start,
        audio_end_seconds: end,
        audio_conditioned_lip_sync_required: true,
      };
      shotNode.metadata = {
        ...object(shotNode.metadata),
        contract: "AUDIO_CONDITIONED_LIPSYNC_V1",
        source_motion_node_id: motionId,
        lip_sync_review_node_id: reviewId,
      };

      const reviewNode = createProductionNode({
        id: reviewId,
        type: "LIPSYNC_VALIDATION",
        title: `Validate lip sync for ${shotNode.title || shotNode.id}`,
        description: "Measure phoneme timing, mouth visibility, identity fidelity and performance quality against the exact source-audio segment.",
        priority: Number(shotNode.priority || 100) + 1,
        intent: {
          shot_id: shotNode.id,
          identity_profile_id:
            contract.identity_profile_id ||
            shot.identity_requirements?.profile_id ||
            null,
        },
        requirements: {
          source_lipsync_node_id: shotNode.id,
          primary_audio_asset_id: contract.primary_audio_asset_id,
          audio_start_seconds: start,
          audio_end_seconds: end,
          minimum_sync_score: 88,
          minimum_identity_score: 90,
          minimum_performance_score: 82,
          human_approval_required: true,
        },
        assets: [],
        generation: {
          required: true,
          service: "ai.video.lip_sync.validate",
          capability: "ai.video.lip_sync.validate",
          provider: "managed_lipsync",
          estimated_cost: 0,
          estimated_seconds: 0,
          provider_parameters: {
            source_lipsync_node_id: shotNode.id,
            primary_audio_asset_id: contract.primary_audio_asset_id,
            audio_start_seconds: start,
            audio_end_seconds: end,
            minimum_sync_score: 88,
            minimum_identity_score: 90,
            minimum_performance_score: 82,
          },
        },
        metadata: {
          contract: "AUDIO_CONDITIONED_LIPSYNC_VALIDATION_V1",
          shot_id: shotNode.id,
          source_lipsync_node_id: shotNode.id,
          human_approval_required: true,
        },
      });

      nodes.push(motionNode, reviewNode);
      for (const edge of incoming) {
        edges.push(createProductionEdge({
          from: edge.from,
          to: motionId,
          type: edge.type,
        }));
      }
      edges.push(
        createProductionEdge({ from: motionId, to: shotNode.id, type: "DEPENDS_ON" }),
        createProductionEdge({ from: shotNode.id, to: reviewId, type: "DEPENDS_ON" }),
      );

      const outgoing = edges.filter((edge) => edge.from === shotNode.id && edge.to !== reviewId);
      edges = edges.filter((edge) => !(edge.from === shotNode.id && edge.to !== reviewId));
      for (const edge of outgoing) {
        edges.push(createProductionEdge({
          from: reviewId,
          to: edge.to,
          type: edge.type,
        }));
      }

      inserted.push({
        shot_id: shotNode.id,
        motion_plate_node_id: motionId,
        lip_sync_node_id: shotNode.id,
        validation_node_id: reviewId,
      });
    }

    return {
      ...graph,
      nodes,
      edges,
      metadata: {
        ...object(graph.metadata),
        lip_sync_contract: inserted.length ? "AUDIO_CONDITIONED_LIPSYNC_GRAPH_V1" : null,
        lip_sync_shot_count: inserted.length,
        lip_sync_stages: inserted,
      },
    };
  },
};

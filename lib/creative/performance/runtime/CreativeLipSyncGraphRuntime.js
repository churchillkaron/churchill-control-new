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

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function vocalPerformanceContract(shot = {}) {
  const contract = object(
    shot.performance_contract ||
    shot.metadata?.performance_contract,
  );

  const visibleVocalPerformance = Boolean(
    contract.vocal_performance_visible === true ||
    contract.speaking_visible === true ||
    contract.singing_visible === true ||
    contract.dialogue_visible === true,
  );

  return contract.lip_sync_required === true &&
    contract.mouth_visible === true &&
    visibleVocalPerformance
    ? contract
    : null;
}

function lipSyncThresholds(contract = {}, shot = {}) {
  const premium = Boolean(
    contract.quality_profile === "WORLD_CLASS_LUXURY_FILM" ||
    shot.metadata?.creative_quality_profile === "WORLD_CLASS_LUXURY_FILM" ||
    shot.metadata?.quality_profile === "WORLD_CLASS_LUXURY_FILM",
  );

  return {
    minimum_sync_score: Math.max(
      premium ? 96 : 88,
      finite(contract.minimum_sync_score, 0),
    ),
    minimum_identity_score: Math.max(
      premium ? 96 : 90,
      finite(contract.minimum_identity_score, 0),
    ),
    minimum_performance_score: Math.max(
      premium ? 92 : 82,
      finite(contract.minimum_performance_score, 0),
    ),
  };
}

function performanceMode(contract = {}) {
  if (contract.singing_visible === true) return "SINGING";
  if (
    contract.speaking_visible === true ||
    contract.dialogue_visible === true
  ) return "SPEECH";
  return "VOCAL_PERFORMANCE";
}

function dependencyEdge(edge = {}) {
  return edge.type === "DEPENDS_ON";
}

function edgeKey(edge = {}) {
  return `${edge.from}::${edge.to}::${edge.type}`;
}

function addEdge(edges, edge) {
  const key = edgeKey(edge);
  if (!edges.some((candidate) => edgeKey(candidate) === key)) {
    edges.push(edge);
  }
}

export const CreativeLipSyncGraphRuntime = {
  apply({ graph, shots = [] } = {}) {
    if (!graph) throw new Error("production graph required");
    const shotMap = new Map(list(shots).map((shot) => [shot.id, shot]));
    const nodes = [...list(graph.nodes)];
    let edges = [...list(graph.edges)];
    const inserted = [];

    for (const shotNode of nodes.filter((node) => node.type === "SHOT")) {
      const shot = shotMap.get(shotNode.id) || {};
      const contract = vocalPerformanceContract(shot);
      if (!contract) continue;

      const thresholds = lipSyncThresholds(contract, shot);
      const mode = performanceMode(contract);
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
      const incomingDependencies = edges.filter((edge) =>
        edge.to === shotNode.id && dependencyEdge(edge),
      );
      edges = edges.filter((edge) => !(
        edge.to === shotNode.id && dependencyEdge(edge)
      ));

      const motionNode = createProductionNode({
        id: motionId,
        type: "PERFORMANCE_MOTION_PLATE",
        title: `Performance motion plate for ${shotNode.title || shotNode.id}`,
        description:
          "Generate identity-locked body, head, facial and camera motion for a visible vocal performance before applying the exact approved audio segment.",
        priority: Math.max(0, Number(shotNode.priority || 100) - 1),
        intent: shotNode.intent,
        requirements: {
          ...object(shotNode.requirements),
          lip_sync_deferred: true,
          visible_mouth_required: true,
          preserve_identity: true,
          vocal_performance_mode: mode,
          natural_pre_phoneme_mouth_motion_required: true,
          invented_phoneme_timing_forbidden: true,
        },
        assets: list(shotNode.assets),
        generation: {
          ...originalGeneration,
          provider_parameters: {
            ...object(originalGeneration.provider_parameters),
            performance_motion_plate: true,
            vocal_performance_mode: mode,
            exact_lip_sync_deferred: true,
            visible_mouth_required: true,
            preserve_identity: true,
            natural_face_motion_required: true,
            invented_phoneme_timing_forbidden: true,
          },
        },
        metadata: {
          ...object(shotNode.metadata),
          contract: "PERFORMANCE_MOTION_PLATE_V2",
          final_shot_node_id: shotNode.id,
          lip_sync_required: true,
          vocal_performance_mode: mode,
        },
      });

      shotNode.type = "AUDIO_CONDITIONED_LIPSYNC";
      shotNode.title = `Audio-conditioned lip sync for ${shotNode.title || shotNode.id}`;
      shotNode.description =
        "Apply the exact approved speech or singing audio to the identity-preserving performance motion plate with natural facial articulation.";
      shotNode.assets = [];
      shotNode.generation = {
        required: true,
        service: "ai.video.lip_sync",
        capability: "ai.video.lip_sync",
        provider: "managed_lipsync",
        estimated_cost: Number(contract.lip_sync_estimated_cost || 0),
        estimated_seconds: Number(
          contract.lip_sync_estimated_seconds ||
          shotNode.duration_seconds ||
          end - start,
        ),
        output_spec:
          originalGeneration.output_spec ||
          shotNode.requirements?.output_spec ||
          {},
        provider_parameters: {
          audio_conditioned: true,
          vocal_performance_mode: mode,
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
          preserve_head_pose: true,
          preserve_camera_motion: true,
          preserve_body_motion: true,
          preserve_source_audio: true,
          mouth_visibility_required: true,
          natural_face_motion_required: true,
          identity_keyframe_required: false,
          identity_keyframe_human_approval_required: false,
          identity_keyframe_node_id: null,
          identity_keyframe_review_node_id: null,
        },
      };
      shotNode.requirements = {
        ...object(shotNode.requirements),
        source_motion_node_id: motionId,
        primary_audio_asset_id: contract.primary_audio_asset_id,
        audio_start_seconds: start,
        audio_end_seconds: end,
        vocal_performance_mode: mode,
        audio_conditioned_lip_sync_required: true,
        preserve_source_audio: true,
        mouth_visibility_required: true,
        identity_keyframe_required: false,
        identity_keyframe_human_approval_required: false,
        identity_keyframe_node_id: null,
        identity_keyframe_review_node_id: null,
      };
      shotNode.metadata = {
        ...object(shotNode.metadata),
        contract: "AUDIO_CONDITIONED_LIPSYNC_V2",
        source_motion_node_id: motionId,
        lip_sync_review_node_id: reviewId,
        vocal_performance_mode: mode,
        identity_keyframe_node_id: null,
        identity_keyframe_review_node_id: null,
        identity_keyframe_consumed_by_motion_plate: true,
      };

      const reviewNode = createProductionNode({
        id: reviewId,
        type: "LIPSYNC_VALIDATION",
        title: `Validate lip sync for ${shotNode.title || shotNode.id}`,
        description:
          "Measure phoneme timing, mouth visibility, identity fidelity, facial naturalism and performance quality against the exact approved audio segment before editing.",
        priority: Number(shotNode.priority || 100) + 1,
        intent: {
          shot_id: shotNode.id,
          vocal_performance_mode: mode,
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
          vocal_performance_mode: mode,
          ...thresholds,
          require_visible_mouth: true,
          require_audio_conditioned_sync: true,
          require_identity_preservation: true,
          require_natural_face_motion: true,
          reject_before_editing: true,
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
            vocal_performance_mode: mode,
            ...thresholds,
            require_visible_mouth: true,
            require_audio_conditioned_sync: true,
            require_identity_preservation: true,
            require_natural_face_motion: true,
          },
        },
        metadata: {
          contract: "AUDIO_CONDITIONED_LIPSYNC_VALIDATION_V2",
          shot_id: shotNode.id,
          source_lipsync_node_id: shotNode.id,
          vocal_performance_mode: mode,
          ...thresholds,
          human_approval_required: true,
          downstream_blocked_until_human_approval: true,
        },
      });

      nodes.push(motionNode, reviewNode);
      for (const edge of incomingDependencies) {
        addEdge(edges, createProductionEdge({
          from: edge.from,
          to: motionId,
          type: "DEPENDS_ON",
          metadata: edge.metadata,
        }));
      }
      addEdge(edges, createProductionEdge({
        from: motionId,
        to: shotNode.id,
        type: "DEPENDS_ON",
      }));
      addEdge(edges, createProductionEdge({
        from: shotNode.id,
        to: reviewId,
        type: "DEPENDS_ON",
      }));

      const outgoingDependencies = edges.filter((edge) =>
        edge.from === shotNode.id &&
        edge.to !== reviewId &&
        dependencyEdge(edge),
      );
      edges = edges.filter((edge) => !(
        edge.from === shotNode.id &&
        edge.to !== reviewId &&
        dependencyEdge(edge)
      ));
      for (const edge of outgoingDependencies) {
        addEdge(edges, createProductionEdge({
          from: reviewId,
          to: edge.to,
          type: "DEPENDS_ON",
          metadata: {
            ...object(edge.metadata),
            gated_by: "AUDIO_CONDITIONED_LIPSYNC_VALIDATION_V2",
          },
        }));
      }

      inserted.push({
        shot_id: shotNode.id,
        performance_mode: mode,
        motion_plate_node_id: motionId,
        lip_sync_node_id: shotNode.id,
        validation_node_id: reviewId,
        thresholds,
        structural_edges_preserved: true,
        identity_keyframe_consumed_by_motion_plate: true,
      });
    }

    return {
      ...graph,
      nodes,
      edges,
      metadata: {
        ...object(graph.metadata),
        lip_sync_contract: inserted.length
          ? "AUDIO_CONDITIONED_LIPSYNC_GRAPH_V2"
          : null,
        lip_sync_shot_count: inserted.length,
        lip_sync_stages: inserted,
        lip_sync_supports_visible_speech: true,
        lip_sync_supports_visible_singing: true,
        lip_sync_structural_edges_preserved: true,
        lip_sync_identity_keyframe_stage_isolated: true,
      },
    };
  },
};
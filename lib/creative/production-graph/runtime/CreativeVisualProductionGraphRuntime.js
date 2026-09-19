import {
  createProductionNode,
  createProductionEdge,
} from "@/lib/creative/production-graph/documents/ProductionGraph";

import {
  CREATIVE_VISUAL_PRODUCTION_MODES,
} from "@/lib/creative/director/runtime/CreativeVisualProductionRouteRuntime";
import {
  CreativeBasePlateContractRuntime,
} from "@/lib/creative/multipass/runtime/CreativeBasePlateContractRuntime";

const GRAPH_CONTRACT = "CREATIVE_VISUAL_PRODUCTION_GRAPH_V1";
const ROUTE_CONTRACT = "CREATIVE_VISUAL_PRODUCTION_ROUTE_V1";
const DERIVED_FRAME_CONTRACT = "CREATIVE_VISUAL_DERIVED_FRAME_V1";

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

function unique(values = []) {
  return [...new Set(
    list(values)
      .flat(Infinity)
      .map((value) => text(
        value?.asset_id ||
        value?.assetId ||
        value?.id ||
        value,
      ))
      .filter(Boolean),
  )];
}

function visualRoute(shot = {}, node = {}) {
  const candidates = [
    shot.production_route,
    shot.visual_production_route,
    shot.generation?.production_route,
    shot.metadata?.visual_production_route,
    node.generation?.production_route,
    node.requirements?.visual_production_route,
    node.metadata?.visual_production_route,
  ];

  return candidates
    .map(object)
    .find((candidate) => candidate.contract === ROUTE_CONTRACT) || null;
}

function videoShot(node = {}, shot = {}) {
  const capability = text(
    node.generation?.capability ||
    node.generation?.service ||
    shot.generation?.capability ||
    shot.generation?.service,
  ).toLowerCase();
  return capability.includes("video");
}

function identityControlled(shot = {}, node = {}) {
  return shot.keyframe_contract?.required === true ||
    node.requirements?.identity_keyframe_required === true ||
    node.generation?.provider_parameters?.identity_keyframe_required === true;
}

function primarySourceAssetId(shot = {}, node = {}, route = {}) {
  return text(
    shot.primary_source_asset_id ||
    shot.generation?.primary_source_asset_id ||
    shot.metadata?.primary_source_asset_id ||
    node.requirements?.primary_source_asset_id ||
    node.generation?.primary_source_asset_id ||
    node.generation?.provider_parameters?.primary_source_asset_id ||
    route.evidence?.primary_source_asset_id,
  ) || null;
}

function referenceAssetIds(shot = {}, node = {}, primary = null) {
  return unique([
    shot.reference_asset_ids,
    node.requirements?.reference_asset_ids,
    node.generation?.provider_parameters?.reference_asset_ids,
  ]).filter((id) => id !== primary);
}

function stillOutputSpec(node = {}) {
  const source = object(
    node.generation?.output_spec ||
    node.requirements?.output_spec,
  );
  const {
    duration_seconds: ignoredDuration,
    durationSeconds: ignoredDurationCamel,
    fps: ignoredFps,
    frame_rate: ignoredFrameRate,
    frameRate: ignoredFrameRateCamel,
    ...visual
  } = source;

  return {
    ...visual,
    media_kind: "IMAGE",
  };
}

function generationForRoute(route = {}, node = {}) {
  const mode = text(route.mode).toUpperCase();
  const enhance =
    mode === CREATIVE_VISUAL_PRODUCTION_MODES.ENHANCE_AUTHENTIC;
  return {
    required: true,
    service: enhance ? "ai.image.upscale" : "ai.image.generate",
    capability: enhance ? "ai.image.upscale" : "ai.image.generate",
    provider: null,
    model: null,
    output_spec: stillOutputSpec(node),
    estimated_cost: 0,
    estimated_seconds: 1,
    status: "WAITING",
  };
}

function transformationPolicy(route = {}) {
  const mode = text(route.mode).toUpperCase();

  if (mode === CREATIVE_VISUAL_PRODUCTION_MODES.ENHANCE_AUTHENTIC) {
    return {
      contract: "CREATIVE_AUTHENTIC_ENHANCEMENT_POLICY_V1",
      preserve_geometry: true,
      preserve_layout: true,
      preserve_identity: true,
      preserve_brand_marks: true,
      preserve_products: true,
      preserve_scene_content: true,
      permit_denoise: true,
      permit_resolution_improvement: true,
      permit_exposure_recovery: true,
      permit_shadow_highlight_recovery: true,
      permit_detail_recovery: true,
      permit_mild_colour_correction: true,
      prohibit_scene_redesign: true,
      prohibit_subject_replacement: true,
      prohibit_logo_reconstruction: true,
      prohibit_new_people: true,
    };
  }

  if (mode === CREATIVE_VISUAL_PRODUCTION_MODES.CINEMATIC_RECONSTRUCTION) {
    return {
      contract: "CREATIVE_CINEMATIC_RECONSTRUCTION_POLICY_V1",
      source_is_evidence_not_pixel_lock: true,
      preserve_brand_truth: true,
      preserve_required_identity: true,
      preserve_products: true,
      preserve_materials_and_brand_marks: true,
      execute_story_frame: true,
      premium_keyframe_required: true,
      prohibit_unsupported_brand_invention: true,
      prohibit_unrequested_people: true,
      prohibit_generated_typography_unless_required: true,
    };
  }

  return {
    contract: "CREATIVE_ORIGINAL_WORLD_BUILDING_POLICY_V1",
    source_is_evidence_not_pixel_lock: true,
    preserve_verified_brand_truth: true,
    execute_story_frame: true,
    premium_keyframe_required: true,
    prohibit_unsupported_factual_claims: true,
    prohibit_unrequested_people: true,
    prohibit_generated_typography_unless_required: true,
  };
}

function multipassNode(nodes = [], shotId, passId) {
  return nodes.find((node) => text(node.id) === `pass:${shotId}:${passId}`) || null;
}

function basePlateContract(nodes = [], shot = {}, shotNode = {}) {
  if (text(shotNode.requirements?.multipass_contract?.contract) !== "CREATIVE_MULTIPASS_SHOT_CONTRACT_V1") {
    return null;
  }
  const reconstructionPass = multipassNode(nodes, shotNode.id, "scene-reconstruction");
  return CreativeBasePlateContractRuntime.build({
    shot: {
      ...shot,
      id: shotNode.id,
      source_reinterpretation: shotNode.requirements?.source_reinterpretation || shot.source_reinterpretation,
      scene_reconstruction_contract:
        shotNode.requirements?.scene_reconstruction_contract || shot.scene_reconstruction_contract,
    },
    reconstruction_pass_node_id: reconstructionPass?.id || null,
  });
}

function addEdge(edges, edge) {
  const duplicate = edges.some((candidate) =>
    candidate.from === edge.from &&
    candidate.to === edge.to &&
    candidate.type === edge.type,
  );
  if (!duplicate) edges.push(edge);
}

export const CreativeVisualProductionGraphRuntime = Object.freeze({
  apply({ graph, shots = [] } = {}) {
    if (!graph) throw new Error("production graph required");

    const shotMap = new Map(
      list(shots).map((shot) => [text(shot.id), shot]),
    );
    const nodes = [...list(graph.nodes)];
    const edges = [...list(graph.edges)];
    const inserted = [];

    for (const shotNode of nodes.filter((node) => node.type === "SHOT")) {
      const shot = shotMap.get(text(shotNode.id)) || {};
      const route = visualRoute(shot, shotNode);
      if (!route) continue;
      if (!videoShot(shotNode, shot)) continue;

      const mode = text(route.mode).toUpperCase();
      if (!Object.values(CREATIVE_VISUAL_PRODUCTION_MODES).includes(mode)) {
        throw new Error(
          `CREATIVE_VISUAL_PRODUCTION_MODE_INVALID:${shotNode.id}:${mode || "missing"}`,
        );
      }

      const signatureFrameDesign = object(
        shot.signature_frame_design || shotNode.requirements?.signature_frame_design,
      );
      if (signatureFrameDesign.required !== true) {
        throw new Error(`CREATIVE_PREMIUM_VIDEO_SIGNATURE_FRAME_REQUIRED:${shotNode.id}`);
      }

      shotNode.requirements = {
        ...object(shotNode.requirements),
        signature_frame_design: signatureFrameDesign,
        visual_production_route: route,
        visual_production_route_contract: route.contract,
        visual_production_mode: mode,
        motion_generation_blocked_until_signature_frame_review: true,
      };
      shotNode.generation = {
        ...object(shotNode.generation),
        production_route: route,
        provider_parameters: {
          ...object(shotNode.generation?.provider_parameters),
          visual_production_route_contract: route.contract,
          visual_production_mode: mode,
        },
      };
      shotNode.metadata = {
        ...object(shotNode.metadata),
        visual_production_route_contract: route.contract,
        visual_production_mode: mode,
      };

      if (mode === CREATIVE_VISUAL_PRODUCTION_MODES.DIRECT_AUTHENTIC) {
        inserted.push({
          shot_id: shotNode.id,
          mode,
          derived_frame_required: false,
          derived_frame_node_id: null,
          identity_owner: false,
        });
        continue;
      }

      if (identityControlled(shot, shotNode)) {
        inserted.push({
          shot_id: shotNode.id,
          mode,
          derived_frame_required: false,
          derived_frame_node_id: null,
          identity_owner: true,
          delegated_to: "IDENTITY_KEYFRAME_GRAPH_V1",
        });
        continue;
      }

      const primary = primarySourceAssetId(shot, shotNode, route);
      const references = referenceAssetIds(shot, shotNode, primary);
      if (
        [
          CREATIVE_VISUAL_PRODUCTION_MODES.ENHANCE_AUTHENTIC,
          CREATIVE_VISUAL_PRODUCTION_MODES.CINEMATIC_RECONSTRUCTION,
        ].includes(mode) &&
        !primary
      ) {
        throw new Error(
          `CREATIVE_VISUAL_PRODUCTION_PRIMARY_SOURCE_REQUIRED:${shotNode.id}:${mode}`,
        );
      }

      const derivedFrameNodeId = `${shotNode.id}:visual-derived-frame`;
      if (nodes.some((node) => node.id === derivedFrameNodeId)) {
        throw new Error(
          `CREATIVE_VISUAL_DERIVED_FRAME_NODE_DUPLICATE:${derivedFrameNodeId}`,
        );
      }

      const routeGeneration = generationForRoute(route, shotNode);
      const policy = transformationPolicy(route);
      const basePlate = mode === CREATIVE_VISUAL_PRODUCTION_MODES.CINEMATIC_RECONSTRUCTION
        ? basePlateContract(nodes, shot, shotNode)
        : null;
      const sourceBindingContract = primary
        ? "EXPLICIT_SHOT_PRIMARY_SOURCE_V1"
        : null;

      const derivedFrameNode = createProductionNode({
        id: derivedFrameNodeId,
        type: "VISUAL_DERIVED_FRAME",
        title: `Approved production frame for ${shotNode.title || shotNode.id}`,
        description:
          mode === CREATIVE_VISUAL_PRODUCTION_MODES.ENHANCE_AUTHENTIC
            ? "Enhance the authentic source without redesigning the scene before motion generation."
            : "Create a premium story-specific production frame grounded in the approved evidence before motion generation.",
        priority: Math.max(0, Number(shotNode.priority || 100) - 2),
        intent: {
          shot_id: shotNode.id,
          purpose: shotNode.intent?.purpose || shotNode.requirements?.purpose || "",
          subject: shotNode.intent?.subject || shotNode.requirements?.subject || "",
          action: shotNode.intent?.action || shotNode.requirements?.action || "",
          opening_frame:
            shotNode.intent?.opening_frame ||
            shotNode.requirements?.opening_frame ||
            {},
          visual_production_mode: mode,
        },
        requirements: {
          ...object(shotNode.requirements),
          primary_source_asset_id: primary,
          source_binding_contract: sourceBindingContract,
          reference_asset_ids: references,
          visual_production_route: route,
          visual_production_route_contract: route.contract,
          visual_production_mode: mode,
          visual_transformation_policy: policy,
          ...(basePlate ? {
            base_plate_contract: basePlate,
            base_plate_role: true,
            reconstruction_certification_required_before_dispatch:
              basePlate.rules.reconstruction_certification_required_before_dispatch === true,
            later_pass_responsibilities_must_remain_separable: true,
          } : {}),
          visual_derived_frame_for_shot_id: shotNode.id,
          signature_frame_design: signatureFrameDesign,
          signature_frame_review_required: true,
          approved_visual_world_board_comparison_required: true,
          anti_game_camera_review_required: true,
          post_transform_brand_review_required: true,
          reject_before_motion_generation: true,
          trusted_derived_promotion_allowed_only_after_review:
            route.trusted_derived_promotion_allowed_only_after_review === true,
          paid_generation_authorized: false,
        },
        assets: primary ? [primary] : [],
        generation: {
          ...routeGeneration,
          primary_source_asset_id: primary,
          source_binding_contract: sourceBindingContract,
          production_route: route,
          provider_parameters: {
            ...object(shotNode.generation?.provider_parameters),
            primary_source_asset_id: primary,
            source_binding_contract: sourceBindingContract,
            reference_asset_ids: references,
            visual_production_route_contract: route.contract,
            visual_production_mode: mode,
            visual_transformation_policy: policy,
            ...(basePlate ? {
              base_plate_contract: basePlate,
              base_plate_role: true,
              reconstruction_certification_required_before_dispatch:
                basePlate.rules.reconstruction_certification_required_before_dispatch === true,
            } : {}),
            visual_derived_frame_for_shot_id: shotNode.id,
            signature_frame_design: signatureFrameDesign,
            signature_frame_review_required: true,
            approved_visual_world_board_comparison_required: true,
            anti_game_camera_review_required: true,
            post_transform_brand_review_required: true,
            picture_only_generation: true,
            audio_generation_forbidden: true,
            paid_generation_authorized: false,
          },
        },
        metadata: {
          contract: DERIVED_FRAME_CONTRACT,
          scene_id: shotNode.metadata?.scene_id || null,
          shot_id: shotNode.id,
          workflow_kind: graph.metadata?.workflow_kind || "TEMPORAL",
          primary_source_asset_id: primary,
          source_binding_contract: sourceBindingContract,
          reference_asset_ids: references,
          visual_production_route_contract: route.contract,
          visual_production_mode: mode,
          visual_derived_frame_for_shot_id: shotNode.id,
          ...(basePlate ? {
            base_plate_contract: basePlate.contract,
            base_plate_role: true,
          } : {}),
          reject_before_motion_generation: true,
          paid_generation_authorized: false,
          story_lineage:
            shotNode.requirements?.story_lineage ||
            shotNode.metadata?.story_lineage ||
            graph.metadata?.story_lineage ||
            {},
        },
      });

      nodes.push(derivedFrameNode);
      addEdge(edges, createProductionEdge({
        from: derivedFrameNodeId,
        to: shotNode.id,
        type: "DEPENDS_ON",
        metadata: {
          gate: DERIVED_FRAME_CONTRACT,
          visual_production_mode: mode,
        },
      }));

      if (basePlate) {
        const reconstructionPass = multipassNode(nodes, shotNode.id, "scene-reconstruction");
        const basePlatePass = multipassNode(nodes, shotNode.id, "base-plate");
        if (!reconstructionPass || !basePlatePass) {
          throw new Error(`CREATIVE_BASE_PLATE_MULTIPASS_NODES_REQUIRED:${shotNode.id}`);
        }
        addEdge(edges, createProductionEdge({
          from: reconstructionPass.id,
          to: derivedFrameNodeId,
          type: "DEPENDS_ON",
          metadata: { gate: "CREATIVE_SCENE_RECONSTRUCTION_QC_V1" },
        }));
        addEdge(edges, createProductionEdge({
          from: derivedFrameNodeId,
          to: basePlatePass.id,
          type: "DEPENDS_ON",
          metadata: { gate: basePlate.contract },
        }));
        basePlatePass.metadata = {
          ...object(basePlatePass.metadata),
          base_plate_contract: basePlate.contract,
          base_plate_execution_node_id: derivedFrameNodeId,
          base_plate_requires_perceptual_review: true,
        };
        basePlatePass.requirements = {
          ...object(basePlatePass.requirements),
          base_plate_contract: basePlate,
          base_plate_execution_node_id: derivedFrameNodeId,
        };
      }

      shotNode.requirements = {
        ...object(shotNode.requirements),
        visual_derived_frame_node_id: derivedFrameNodeId,
        visual_derived_frame_required: true,
        visual_derived_frame_review_required: true,
      };
      shotNode.generation = {
        ...object(shotNode.generation),
        provider_parameters: {
          ...object(shotNode.generation?.provider_parameters),
          visual_derived_frame_node_id: derivedFrameNodeId,
          visual_derived_frame_required: true,
          visual_derived_frame_review_required: true,
        },
      };
      shotNode.metadata = {
        ...object(shotNode.metadata),
        visual_derived_frame_node_id: derivedFrameNodeId,
        visual_derived_frame_required: true,
      };

      inserted.push({
        shot_id: shotNode.id,
        mode,
        derived_frame_required: true,
        derived_frame_node_id: derivedFrameNodeId,
        identity_owner: false,
      });
    }

    return {
      ...graph,
      nodes,
      edges,
      metadata: {
        ...object(graph.metadata),
        visual_production_graph_contract: GRAPH_CONTRACT,
        visual_production_route_contract: ROUTE_CONTRACT,
        visual_derived_frame_contract: DERIVED_FRAME_CONTRACT,
        visual_production_routes_applied: inserted.length,
        visual_derived_frame_count: inserted.filter(
          (item) => item.derived_frame_required,
        ).length,
        visual_production_nodes: inserted,
        visual_production_least_destructive_required: true,
        visual_production_paid_generation_authorized: false,
      },
    };
  },

  contract: GRAPH_CONTRACT,
  route_contract: ROUTE_CONTRACT,
  derived_frame_contract: DERIVED_FRAME_CONTRACT,
});

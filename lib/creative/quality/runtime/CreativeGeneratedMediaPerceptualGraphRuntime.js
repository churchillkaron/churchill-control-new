import "@/lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate";

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

function mediaKind(node = {}) {
  const capability = text(
    node.generation?.capability ||
    node.generation?.service,
  ).toLowerCase();
  const type = text(node.type).toUpperCase();
  if (
    capability.includes("image.generate") ||
    capability.includes("image.edit") ||
    capability.includes("image.upscale") ||
    type === "IDENTITY_KEYFRAME" ||
    type === "IMAGE"
  ) return "IMAGE";
  if (
    capability.includes("video.generate") ||
    capability.includes("video.image_to_video") ||
    capability.includes("video.lip_sync") ||
    capability.includes("image_to_video") ||
    type === "SHOT" ||
    type === "VIDEO" ||
    type === "PERFORMANCE_MOTION_PLATE" ||
    type === "AUDIO_CONDITIONED_LIPSYNC"
  ) return "VIDEO";
  return null;
}

function reviewOrValidationNode(node = {}) {
  const type = text(node.type).toUpperCase();
  const capability = text(
    node.generation?.capability ||
    node.generation?.service,
  ).toLowerCase();
  return /REVIEW|VALIDATION|QUALITY/.test(type) ||
    /\.analyze$|\.validate$|\.review$|quality/.test(capability);
}

function needsReview(node = {}) {
  return node.generation?.required === true &&
    !reviewOrValidationNode(node) &&
    Boolean(mediaKind(node));
}

function personExpected(node = {}, shot = {}) {
  const source = JSON.stringify({
    actors: shot.actors || node.requirements?.actors,
    subject: shot.subject || node.requirements?.subject,
    action: shot.action || node.requirements?.action,
    identity: shot.identity_requirements || node.requirements?.identity_requirements,
  }).toLowerCase();
  return list(shot.actors || node.requirements?.actors).length > 0 ||
    /\b(person|people|artist|performer|singer|actor|actress|model|dancer|staff|employee|founder|owner|woman|man|girl|boy|face|portrait)\b/.test(source);
}

function identityExpected(node = {}, shot = {}) {
  const identity = object(
    shot.identity_requirements ||
    node.requirements?.identity_requirements ||
    node.generation?.identity_lock,
  );
  return Boolean(
    identity.profile_id ||
    identity.identity_profile_id ||
    identity.identity_atlas_asset_node_id ||
    identity.identity_atlas_hash ||
    node.metadata?.identity_profile_id,
  );
}

function productExpected(node = {}, shot = {}) {
  const products = list(shot.products || node.requirements?.products);
  const requirements = object(
    shot.product_requirements || node.requirements?.product_requirements,
  );
  return products.length > 0 || Object.keys(requirements).length > 0;
}

function musicExpected(node = {}, shot = {}) {
  const music = object(shot.music_intelligence);
  const performance = object(shot.performance_contract);
  const audio = object(shot.audio || node.requirements?.audio);
  return Boolean(
    music.section_id ||
    music.musical_role ||
    performance.primary_audio_asset_id ||
    audio.music ||
    node.requirements?.primary_audio_asset_id,
  );
}

function thresholds({ kind, identity, person, product, music } = {}) {
  return {
    minimum_overall_score: 88,
    minimum_story_score: 84,
    minimum_environment_score: 84,
    minimum_camera_score: 82,
    minimum_anatomy_score: person ? 88 : 0,
    minimum_identity_score: identity ? 90 : 0,
    minimum_product_fidelity_score: product ? 92 : 0,
    minimum_music_energy_score: music ? 82 : 0,
    minimum_performance_score: person ? 82 : 0,
    minimum_continuity_score: kind === "VIDEO" ? 84 : 0,
    minimum_physics_score: kind === "VIDEO" ? 84 : 0,
    minimum_artifact_score: 90,
  };
}

function expectedContract(node = {}, shot = {}) {
  const kind = mediaKind(node);
  const identity = identityExpected(node, shot);
  const person = personExpected(node, shot);
  const product = productExpected(node, shot);
  const music = musicExpected(node, shot);
  return {
    contract: "GENERATED_MEDIA_PERCEPTUAL_EXPECTATION_V1",
    media_kind: kind,
    scene_id: node.metadata?.scene_id || shot.scene_id || null,
    shot_id:
      node.metadata?.shot_id ||
      node.metadata?.final_shot_node_id ||
      shot.id ||
      null,
    purpose: shot.purpose || node.intent?.purpose || node.description || "",
    subject: shot.subject || node.requirements?.subject || "",
    action: shot.action || node.requirements?.action || node.intent?.action || "",
    performance:
      shot.performance ||
      shot.performance_direction ||
      node.requirements?.performance_direction ||
      "",
    opening_frame:
      shot.frame_plan?.opening_frame ||
      node.intent?.opening_frame ||
      node.requirements?.opening_frame ||
      null,
    progression:
      shot.frame_plan?.progression ||
      shot.frame_plan?.progression_frames ||
      node.intent?.progression_frames ||
      node.requirements?.progression_frames ||
      null,
    closing_frame:
      shot.frame_plan?.closing_frame ||
      node.intent?.closing_frame ||
      node.requirements?.closing_frame ||
      null,
    camera: shot.camera || node.requirements?.camera || {},
    lighting: shot.lighting || node.requirements?.lighting || {},
    production_design:
      shot.production_design || node.requirements?.production_design || {},
    continuity: shot.continuity || node.requirements?.continuity || {},
    identity_requirements:
      shot.identity_requirements ||
      node.requirements?.identity_requirements ||
      node.generation?.identity_lock ||
      {},
    product_requirements:
      shot.product_requirements || node.requirements?.product_requirements || {},
    actors: shot.actors || node.requirements?.actors || [],
    products: shot.products || node.requirements?.products || [],
    music_intelligence: shot.music_intelligence || {},
    performance_contract: shot.performance_contract || {},
    reference_asset_ids:
      shot.reference_asset_ids ||
      node.requirements?.reference_asset_ids ||
      node.metadata?.reference_asset_ids ||
      [],
    output_spec:
      node.generation?.output_spec || node.requirements?.output_spec || {},
    provider_prompt: node.generation?.provider_prompt || "",
    negative_constraints:
      shot.negative_constraints || node.requirements?.negative_constraints || [],
    person_expected: person,
    identity_expected: identity,
    product_expected: product,
    music_expected: music,
    thresholds: thresholds({ kind, identity, person, product, music }),
  };
}

function edgeKey(edge = {}) {
  return [edge.from, edge.to, edge.type].join("::");
}

function addEdge(edges, edge) {
  const key = edgeKey(edge);
  if (!edges.some((candidate) => edgeKey(candidate) === key)) edges.push(edge);
}

export const CreativeGeneratedMediaPerceptualGraphRuntime = {
  apply({ graph, shots = [] } = {}) {
    if (!graph) throw new Error("production graph required");
    const shotMap = new Map(list(shots).map((shot) => [shot.id, shot]));
    const nodes = [...list(graph.nodes)];
    const edges = [...list(graph.edges)];
    const inserted = [];

    for (const sourceNode of [...nodes].filter(needsReview)) {
      const reviewId = `${sourceNode.id}:perceptual-review`;
      if (nodes.some((node) => node.id === reviewId)) continue;
      const shotId = text(
        sourceNode.metadata?.shot_id ||
        sourceNode.metadata?.final_shot_node_id ||
        sourceNode.id,
      );
      const shot = shotMap.get(shotId) || {};
      const expectation = expectedContract(sourceNode, shot);
      const reviewNode = createProductionNode({
        id: reviewId,
        type: "GENERATED_MEDIA_PERCEPTUAL_REVIEW",
        title: `Perceptual review for ${sourceNode.title || sourceNode.id}`,
        description: "Reject generated media before editing when identity, anatomy, camera, environment, story, music, performance, continuity, physics or synthetic-artifact evidence fails.",
        priority: Number(sourceNode.priority || 100) + 0.25,
        intent: {
          source_generation_node_id: sourceNode.id,
          scene_id: expectation.scene_id,
          shot_id: expectation.shot_id,
          media_kind: expectation.media_kind,
          review: "GENERATED_MEDIA_PERCEPTUAL_VALIDATION",
        },
        requirements: {
          source_generation_node_id: sourceNode.id,
          expected_contract: expectation,
          thresholds: expectation.thresholds,
          generated_output_required: true,
          source_asset_node_required: true,
          deterministic_media_inspection_required: true,
          compare_identity_atlas_when_required: expectation.identity_expected,
          compare_approved_keyframe_when_available: true,
          compare_product_references_when_required: expectation.product_expected,
          reject_before_editing: true,
        },
        assets: [],
        generation: {
          required: true,
          service: "ai.image.analyze",
          capability: "ai.image.analyze",
          provider: "openai",
          provider_prompt: "Bound at execution from the exact generated output and immutable expected shot contract.",
          provider_parameters: {
            response_format: { type: "json_object" },
            source_generation_node_id: sourceNode.id,
            media_kind: expectation.media_kind,
            thresholds: expectation.thresholds,
          },
          output_spec: {
            type: "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1",
          },
          estimated_cost: Number(
            shot.quality?.perceptual_review_estimated_cost ||
            sourceNode.metadata?.perceptual_review_estimated_cost ||
            0,
          ),
          estimated_seconds: Number(
            shot.quality?.perceptual_review_estimated_seconds || 0,
          ),
          status: "WAITING",
        },
        metadata: {
          contract: "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1",
          source_generation_node_id: sourceNode.id,
          source_node_type: sourceNode.type,
          scene_id: expectation.scene_id,
          shot_id: expectation.shot_id,
          media_kind: expectation.media_kind,
          identity_expected: expectation.identity_expected,
          product_expected: expectation.product_expected,
          music_expected: expectation.music_expected,
          person_expected: expectation.person_expected,
          thresholds: expectation.thresholds,
          reject_before_editing: true,
          automated_validation_required: true,
        },
      });

      nodes.push(reviewNode);
      addEdge(edges, createProductionEdge({
        from: sourceNode.id,
        to: reviewId,
        type: "DEPENDS_ON",
      }));

      const outgoing = edges.filter((edge) =>
        edge.from === sourceNode.id &&
        edge.to !== reviewId &&
        edge.type === "DEPENDS_ON",
      );
      for (const edge of outgoing) {
        addEdge(edges, createProductionEdge({
          from: reviewId,
          to: edge.to,
          type: "DEPENDS_ON",
          metadata: {
            gate: "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1",
            source_generation_node_id: sourceNode.id,
          },
        }));
      }

      sourceNode.requirements = {
        ...object(sourceNode.requirements),
        perceptual_review_node_id: reviewId,
        perceptual_review_required_before_editing: true,
      };
      sourceNode.generation = {
        ...object(sourceNode.generation),
        provider_parameters: {
          ...object(sourceNode.generation?.provider_parameters),
          perceptual_review_node_id: reviewId,
          perceptual_review_required: true,
        },
      };
      sourceNode.metadata = {
        ...object(sourceNode.metadata),
        perceptual_review_node_id: reviewId,
        perceptual_review_required_before_editing: true,
      };

      inserted.push({
        source_generation_node_id: sourceNode.id,
        review_node_id: reviewId,
        media_kind: expectation.media_kind,
        scene_id: expectation.scene_id,
        shot_id: expectation.shot_id,
      });
    }

    return {
      ...graph,
      nodes,
      edges,
      metadata: {
        ...object(graph.metadata),
        generated_media_perceptual_contract: inserted.length
          ? "GENERATED_MEDIA_PERCEPTUAL_GRAPH_V1"
          : null,
        generated_media_perceptual_review_count: inserted.length,
        generated_media_perceptual_reviews: inserted,
        generated_media_rejected_before_editing: true,
      },
    };
  },
};

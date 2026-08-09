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

function unique(values = []) {
  return [...new Set(list(values).flat(Infinity).map((value) => text(
    value?.asset_id || value?.assetId || value?.id || value,
  )).filter(Boolean))];
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

function primarySourceAssetId(node = {}, shot = {}) {
  return text(
    shot.primary_source_asset_id ||
    shot.metadata?.primary_source_asset_id ||
    shot.generation?.primary_source_asset_id ||
    shot.generation?.provider_parameters?.primary_source_asset_id ||
    node.primary_source_asset_id ||
    node.requirements?.primary_source_asset_id ||
    node.metadata?.primary_source_asset_id ||
    node.generation?.primary_source_asset_id ||
    node.generation?.provider_parameters?.primary_source_asset_id,
  ) || null;
}

function sourceLocked(node = {}, shot = {}) {
  const productionDesign = object(
    shot.production_design || node.requirements?.production_design,
  );
  const sourceBinding = text(
    shot.generation?.source_binding_contract ||
    shot.metadata?.source_binding_contract ||
    node.generation?.source_binding_contract ||
    node.generation?.provider_parameters?.source_binding_contract ||
    node.requirements?.source_binding_contract ||
    node.metadata?.source_binding_contract,
  );
  return productionDesign.source_locked === true ||
    shot.metadata?.source_locked === true ||
    node.metadata?.source_locked === true ||
    shot.identity_requirements?.source_identity_preservation_required === true ||
    node.requirements?.identity_requirements?.source_identity_preservation_required === true ||
    sourceBinding === "EXPLICIT_SHOT_PRIMARY_SOURCE_V1";
}

function prohibitsNewPeople(node = {}, shot = {}) {
  const productionDesign = object(
    shot.production_design || node.requirements?.production_design,
  );
  const source = [
    ...list(productionDesign.prohibited_changes),
    ...list(shot.negative_constraints),
    ...list(node.requirements?.negative_constraints),
    shot.action,
    node.requirements?.action,
  ].map(text).filter(Boolean).join(". ");
  return /\b(?:no|do not|don't|without|prohibit(?:ed)?|forbid(?:den)?)\b[^.!;\n]{0,80}\b(?:introduce|add|generate|create|insert)?\s*(?:new\s+)?(?:people|persons?|person|humans?|actors?|performers?|staff|guests?|crowd|faces?)\b/i.test(source);
}

function rawPerformanceContract(node = {}, shot = {}) {
  return object(
    shot.performance_contract ||
    node.requirements?.performance_contract ||
    node.generation?.provider_parameters?.performance_contract,
  );
}

function rawIdentityRequirements(node = {}, shot = {}) {
  return object(
    shot.identity_requirements ||
    node.requirements?.identity_requirements ||
    node.generation?.identity_lock,
  );
}

function personExpected(node = {}, shot = {}) {
  const actors = list(shot.actors || node.requirements?.actors);
  if (sourceLocked(node, shot) && actors.length === 0 && prohibitsNewPeople(node, shot)) {
    return false;
  }

  const performance = rawPerformanceContract(node, shot);
  if (typeof performance.performer_visible === "boolean") {
    return performance.performer_visible;
  }
  if (actors.length > 0) return true;

  const source = JSON.stringify({
    subject: shot.subject || node.requirements?.subject,
    action: shot.action || node.requirements?.action,
    performance:
      shot.performance ||
      shot.performance_direction ||
      node.requirements?.performance_direction,
  }).toLowerCase();
  return /\b(person|people|artist|performer|singer|actor|actress|model|dancer|staff|employee|founder|owner|woman|man|girl|boy|face|portrait)\b/.test(source);
}

function identityReferenceIds(node = {}, shot = {}) {
  const identity = rawIdentityRequirements(node, shot);
  const performance = rawPerformanceContract(node, shot);
  return unique([
    identity.reference_asset_id,
    identity.reference_asset_ids,
    performance.identity_reference_asset_ids,
    node.generation?.provider_parameters?.identity_reference_asset_ids,
  ]);
}

function identityExpected(node = {}, shot = {}, person = personExpected(node, shot)) {
  if (!person) return false;
  const identity = rawIdentityRequirements(node, shot);
  if (identity.required === false) return false;

  if (sourceLocked(node, shot)) {
    const primary = primarySourceAssetId(node, shot);
    if (!primary) return false;
    const references = identityReferenceIds(node, shot);
    return references.includes(primary) && Boolean(
      identity.required === true ||
      identity.profile_id ||
      identity.identity_profile_id ||
      identity.identity_atlas_asset_node_id ||
      identity.identity_atlas_hash,
    );
  }

  return Boolean(
    identity.required === true ||
    identity.profile_id ||
    identity.identity_profile_id ||
    identity.identity_atlas_asset_node_id ||
    identity.identity_atlas_hash ||
    node.metadata?.identity_profile_id,
  );
}

function scopedIdentityRequirements(
  node = {},
  shot = {},
  person = personExpected(node, shot),
  identityRequired = identityExpected(node, shot, person),
) {
  const identity = rawIdentityRequirements(node, shot);
  if (!sourceLocked(node, shot)) return identity;

  const primary = primarySourceAssetId(node, shot);
  const referenceAssetIds = identityRequired && primary ? [primary] : [];
  return {
    ...identity,
    required: identityRequired,
    profile_id: identityRequired ? identity.profile_id || null : null,
    identity_profile_id:
      identityRequired ? identity.identity_profile_id || identity.profile_id || null : null,
    reference_asset_id: referenceAssetIds[0] || null,
    reference_asset_ids: referenceAssetIds,
    reject_identity_drift: identityRequired,
    source_identity_preservation_required: Boolean(primary),
  };
}

function scopedPerformanceContract(
  node = {},
  shot = {},
  person = personExpected(node, shot),
  identityRequired = identityExpected(node, shot, person),
) {
  const performance = rawPerformanceContract(node, shot);
  if (!sourceLocked(node, shot)) return performance;

  const primary = primarySourceAssetId(node, shot);
  return {
    ...performance,
    performer_visible: person,
    identity_profile_id:
      identityRequired ? performance.identity_profile_id || null : null,
    identity_reference_asset_ids:
      identityRequired && primary ? [primary] : [],
  };
}

function scopedReferenceAssetIds(node = {}, shot = {}) {
  const primary = primarySourceAssetId(node, shot);
  if (sourceLocked(node, shot) && primary) return [primary];
  return unique(
    shot.reference_asset_ids ||
    node.requirements?.reference_asset_ids ||
    node.metadata?.reference_asset_ids ||
    [],
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
  const person = personExpected(node, shot);
  const identity = identityExpected(node, shot, person);
  const product = productExpected(node, shot);
  const music = musicExpected(node, shot);
  const primarySource = primarySourceAssetId(node, shot);
  const locked = sourceLocked(node, shot);
  const referenceAssetIds = scopedReferenceAssetIds(node, shot);
  const identityRequirements = scopedIdentityRequirements(
    node,
    shot,
    person,
    identity,
  );
  const performanceContract = scopedPerformanceContract(
    node,
    shot,
    person,
    identity,
  );

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
    identity_requirements: identityRequirements,
    product_requirements:
      shot.product_requirements || node.requirements?.product_requirements || {},
    actors: shot.actors || node.requirements?.actors || [],
    products: shot.products || node.requirements?.products || [],
    music_intelligence: shot.music_intelligence || {},
    performance_contract: performanceContract,
    primary_source_asset_id: primarySource,
    source_locked: locked,
    source_binding_contract: primarySource
      ? "EXPLICIT_SHOT_PRIMARY_SOURCE_V1"
      : null,
    reference_scope_contract: locked
      ? "PRIMARY_SOURCE_ONLY_PERCEPTUAL_REFERENCE_V1"
      : "EXPLICIT_SHOT_REFERENCES_V1",
    reference_asset_id: referenceAssetIds[0] || null,
    reference_asset_ids: referenceAssetIds,
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
          primary_source_asset_id: expectation.primary_source_asset_id,
          source_locked: expectation.source_locked,
          reference_scope_contract: expectation.reference_scope_contract,
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
        primary_source_asset_id: expectation.primary_source_asset_id,
        source_locked: expectation.source_locked,
        reference_scope_contract: expectation.reference_scope_contract,
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

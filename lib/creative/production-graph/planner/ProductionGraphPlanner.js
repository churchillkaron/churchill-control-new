import {
  createProductionGraph,
  createProductionNode,
  createProductionEdge,
} from "../documents/ProductionGraph";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function slug(value, fallback = "output") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function medium(value) {
  const normalized = String(value || "MULTIMEDIA").trim().toUpperCase();
  return normalized === "VIDEO" ? "FILM" : normalized;
}

function resolveSceneShots(scene, shots = []) {
  return shots
    .filter((shot) =>
      shot.scene_id === scene.id ||
      (!shot.scene_id && Number(shot.scene_number) === Number(scene.scene_number)),
    )
    .sort(
      (left, right) =>
        Number(left.shot_number || 0) - Number(right.shot_number || 0),
    );
}

function buildShotSpecification(scene, shot) {
  return {
    scene: {
      id: scene.id,
      number: scene.scene_number,
      title: scene.title || "",
      objective: scene.objective || "",
      emotion: scene.emotion || "",
      location: scene.location || {},
      actors: scene.actors || [],
      products: scene.products || [],
      brand_rules: scene.brand_rules || [],
      visual_style: scene.visual_style || {},
      camera_style: scene.camera_style || {},
      audio_style: scene.audio_style || {},
    },
    shot: {
      id: shot.id,
      number: shot.shot_number,
      title: shot.title || "",
      purpose: shot.purpose || "",
      duration_seconds: Number(shot.duration_seconds || 5),
      opening_frame: shot.opening_frame || "",
      closing_frame: shot.closing_frame || "",
      action_beats: shot.action_beats || [],
      performance_direction: shot.performance_direction || "",
      camera: shot.camera || {},
      lighting: shot.lighting || {},
      actors: shot.actors || [],
      products: shot.products || [],
      location: shot.location || scene.location || {},
      dialogue: shot.dialogue || [],
      narration: shot.narration || {},
      music: shot.music || {},
      sound_effects: shot.sound_effects || [],
      subtitles: shot.subtitles || [],
      assets: shot.assets || [],
      reference_pack: shot.reference_pack || shot.metadata?.reference_pack || {},
      continuity: shot.continuity || shot.metadata?.continuity || {},
      reality_rules: shot.reality_rules || shot.metadata?.reality_rules || {},
      negative_constraints:
        shot.negative_constraints || shot.metadata?.negative_constraints || [],
      quality_requirements:
        shot.quality_requirements || shot.metadata?.quality_requirements || {},
    },
  };
}

function addFilmNodes(graph, scenes = [], shots = []) {
  const videoNodeIds = [];

  for (const scene of [...scenes].sort(
    (left, right) =>
      Number(left.scene_number || 0) - Number(right.scene_number || 0),
  )) {
    const sceneNodeId = `scene:${scene.id}`;

    graph.nodes.push(
      createProductionNode({
        id: sceneNodeId,
        type: "SCENE",
        title: scene.title || `Scene ${scene.scene_number || graph.nodes.length + 1}`,
        duration_seconds: scene.duration_seconds,
        intent: {
          objective: scene.objective || "",
          emotion: scene.emotion || "",
        },
        requirements: {
          location: scene.location || {},
          actors: scene.actors || [],
          products: scene.products || [],
          brand_rules: scene.brand_rules || [],
          visual_style: scene.visual_style || {},
          camera_style: scene.camera_style || {},
          audio_style: scene.audio_style || {},
        },
        generation: {
          required: false,
          status: "NOT_REQUIRED",
        },
        metadata: {
          scene_id: scene.id,
          scene_number: scene.scene_number,
          medium: "FILM",
        },
      }),
    );

    for (const shot of resolveSceneShots(scene, shots)) {
      const specification = buildShotSpecification(scene, shot);
      const masterNodeId = `shot:${shot.id}:master`;
      const videoNodeId = `shot:${shot.id}:video`;

      graph.nodes.push(
        createProductionNode({
          id: masterNodeId,
          type: "ASSET",
          title: `${shot.title || `Shot ${shot.shot_number}`} — Master Still`,
          description:
            "Generate or enhance the approved reference-grounded master frame before motion generation.",
          duration_seconds: 0,
          intent: {
            deliverable: "MASTER_STILL",
            shot_purpose: shot.purpose || "",
            emotion: scene.emotion || "",
          },
          requirements: {
            specification,
            preserve: specification.shot.reference_pack?.preserve || [],
            may_change: specification.shot.reference_pack?.may_change || [],
            never_change: specification.shot.reference_pack?.never_change || [],
            quality_gate: {
              identity_fidelity: true,
              product_fidelity: true,
              location_fidelity: true,
              brand_fidelity: true,
              anatomy: true,
              physical_reality: true,
              technical_quality: true,
            },
          },
          assets: shot.assets || [],
          generation: {
            required: true,
            service: "ai.image.generate",
            capability: "ai.image.generate",
            estimated_cost: 0,
            estimated_seconds: 60,
            status: "WAITING",
            input: {
              mode: "reference_grounded_master_still",
              specification,
              reference_assets: shot.assets || [],
            },
          },
          metadata: {
            scene_id: scene.id,
            shot_id: shot.id,
            deliverable: "MASTER_STILL",
            medium: "FILM",
            requires_quality_approval: true,
          },
        }),
      );

      graph.nodes.push(
        createProductionNode({
          id: videoNodeId,
          type: "SHOT",
          title: `${shot.title || `Shot ${shot.shot_number}`} — Video`,
          description:
            "Animate only the approved master still according to the exact shot specification.",
          duration_seconds: Number(shot.duration_seconds || 5),
          intent: {
            deliverable: "VIDEO_SHOT",
            shot_purpose: shot.purpose || "",
            emotion: scene.emotion || "",
          },
          requirements: {
            specification,
            source_node_id: masterNodeId,
            quality_gate: {
              first_frame_match: true,
              identity_stability: true,
              product_stability: true,
              logo_stability: true,
              anatomy: true,
              physical_reality: true,
              camera_accuracy: true,
              duration_accuracy: true,
              continuity: true,
              no_flicker: true,
            },
          },
          assets: [],
          generation: {
            required: true,
            service: "ai.video.generate",
            capability: "ai.video.generate",
            estimated_cost: 0,
            estimated_seconds: Number(shot.duration_seconds || 5),
            status: "WAITING",
            input: {
              mode: "approved_master_still_to_video",
              duration_seconds: Number(shot.duration_seconds || 5),
              specification,
              source_node_id: masterNodeId,
            },
          },
          metadata: {
            scene_id: scene.id,
            shot_id: shot.id,
            deliverable: "VIDEO_SHOT",
            medium: "FILM",
            requires_quality_approval: true,
          },
        }),
      );

      graph.edges.push(
        createProductionEdge({ from: sceneNodeId, to: masterNodeId, type: "CONTAINS" }),
      );
      graph.edges.push(
        createProductionEdge({
          from: masterNodeId,
          to: videoNodeId,
          type: "DEPENDS_ON",
          metadata: { condition: "MASTER_STILL_APPROVED" },
        }),
      );
      videoNodeIds.push(videoNodeId);
    }
  }

  for (let index = 1; index < videoNodeIds.length; index += 1) {
    graph.edges.push(
      createProductionEdge({
        from: videoNodeIds[index - 1],
        to: videoNodeIds[index],
        type: "FOLLOWS",
        metadata: {
          continuity_only: true,
          blocks_execution: false,
        },
      }),
    );
  }

  return videoNodeIds.length;
}

function deliverablePrompt(deliverable = {}) {
  const resolvedMedium = medium(deliverable.medium || deliverable.production_type);
  const contract = {
    id: deliverable.id,
    title: deliverable.title || deliverable.name,
    description: deliverable.description,
    medium: resolvedMedium,
    formats: list(deliverable.formats),
    channels: list(deliverable.channels),
    specifications: deliverable.specifications || {},
    success_criteria: list(deliverable.success_criteria),
    objective: deliverable.objective || null,
  };

  const outputInstruction = {
    WEBSITE:
      "Return strict JSON with a complete release-ready website package: information architecture, responsive page definitions, components, content, interactions, accessibility, SEO, analytics hooks, and files containing HTML/CSS/JavaScript or framework-ready source.",
    MENU:
      "Return strict JSON with the complete menu information model, sections, items, descriptions, pricing placeholders or supplied prices, dietary metadata, print/digital layouts, and channel variants.",
    DOCUMENT:
      "Return strict JSON containing the complete document structure, final copy, reusable sections, metadata, review evidence, and required export variants.",
    PRESENTATION:
      "Return strict JSON containing the complete slide narrative, slide-by-slide content, visual direction, speaker notes, data placeholders, and export requirements.",
    MULTIMEDIA:
      "Return strict JSON containing the complete multimedia system, component assets, motion/interaction rules, copy, variants, and assembly instructions.",
  }[resolvedMedium] ||
    "Return strict JSON containing the complete production-ready deliverable, variants, quality evidence, and release package.";

  return [
    "Act as an accountable world-class creative production department.",
    "Create this deliverable on its own terms. Do not convert it into a film, campaign, or industry template unless the contract explicitly requires that medium.",
    "Use supplied business truth and reference assets as evidence, never as permission to invent unsupported facts.",
    outputInstruction,
    `DELIVERABLE CONTRACT: ${JSON.stringify(contract)}`,
  ].join("\n\n");
}

function imagePrompt(deliverable = {}) {
  return [
    "Create one release-ready original image for this exact deliverable.",
    "Respect supplied identity, product, brand, location, composition, text-safety, format, and channel constraints.",
    "Do not introduce industry assumptions, generic stock styling, invented logos, fake text, or unrelated campaign elements.",
    `DELIVERABLE CONTRACT: ${JSON.stringify({
      id: deliverable.id,
      title: deliverable.title || deliverable.name,
      description: deliverable.description,
      formats: list(deliverable.formats),
      channels: list(deliverable.channels),
      specifications: deliverable.specifications || {},
      success_criteria: list(deliverable.success_criteria),
    })}`,
  ].join("\n\n");
}

function audioCapabilities(deliverable = {}) {
  const supplied = list(deliverable.execution_capabilities).filter((capability) =>
    ["ai.voice.generate", "ai.music.generate", "ai.sfx.generate"].includes(capability),
  );
  return supplied.length ? supplied : ["ai.music.generate"];
}

function addTextNode(graph, deliverable, baseId) {
  const nodeId = `${baseId}:content`;
  graph.nodes.push(
    createProductionNode({
      id: nodeId,
      type: "DELIVERABLE",
      title: `${deliverable.title || "Creative Output"} — Production Package`,
      description: deliverable.description || "Produce the complete structured deliverable.",
      duration_seconds: 0,
      intent: {
        deliverable: "UNIVERSAL_CONTENT_OUTPUT",
        medium: medium(deliverable.medium || deliverable.production_type),
      },
      requirements: {
        deliverable,
        specification: deliverable.specifications || {},
        quality_gate: {
          brief_accuracy: true,
          business_truth: true,
          format_completeness: true,
          channel_readiness: true,
          accessibility: true,
          release_readiness: true,
        },
      },
      assets: list(deliverable.assets || deliverable.reference_assets),
      generation: {
        required: true,
        service: "ai.text.generate",
        capability: "ai.text.generate",
        estimated_cost: 0,
        estimated_seconds: 60,
        status: "WAITING",
        input: {
          mode: "universal_creative_deliverable",
          prompt: deliverablePrompt(deliverable),
          response_format: { type: "json_object" },
          max_output_tokens: 12000,
          reference_assets: list(deliverable.assets || deliverable.reference_assets),
          specification: {
            deliverable,
          },
        },
      },
      metadata: {
        deliverable: "UNIVERSAL_CONTENT_OUTPUT",
        deliverable_id: deliverable.id,
        medium: medium(deliverable.medium || deliverable.production_type),
        requires_quality_approval: false,
        production_contract: "universal_deliverable_v1",
      },
    }),
  );
  return nodeId;
}

function universalImageSpecification(deliverable = {}) {
  const purpose =
    deliverable.description ||
    deliverable.objective ||
    `Create ${deliverable.title || "the requested image"}.`;
  const decisiveMoment =
    "The complete final composition communicates the requested message in one decisive still frame.";

  return {
    scene: {
      id: `deliverable:${deliverable.id || "image"}`,
      number: 1,
      title: deliverable.title || "Image Deliverable",
      objective: purpose,
      emotion: deliverable.specifications?.emotion || "deliverable-appropriate",
      location: deliverable.specifications?.location || {},
      actors: deliverable.specifications?.actors || [],
      products: deliverable.specifications?.products || [],
      brand_rules: deliverable.specifications?.brand_rules || [],
      visual_style: deliverable.specifications?.visual_style || {},
      camera_style: deliverable.specifications?.camera_style || {},
      audio_style: {},
    },
    shot: {
      id: `deliverable:${deliverable.id || "image"}:still`,
      number: 1,
      title: deliverable.title || "Final Image",
      purpose,
      opening_frame: decisiveMoment,
      closing_frame: decisiveMoment,
      decisive_moment: decisiveMoment,
      environment_action:
        "The composition, subjects, products, typography-safe space, and environment form one coherent final image.",
      action_beats: [decisiveMoment],
      actors: deliverable.specifications?.actors || [],
      products: deliverable.specifications?.products || [],
      location: deliverable.specifications?.location || {},
      reference_pack: deliverable.specifications?.reference_pack || {},
      negative_constraints: [
        "Do not introduce an unrelated industry, venue, product, person, logo, campaign, or visual stereotype.",
        "Do not invent unsupported business facts or unreadable text.",
        ...list(deliverable.specifications?.negative_constraints),
      ],
      quality_requirements: {
        minimum_score: Number(
          deliverable.specifications?.minimum_quality_score || 85,
        ),
        ...(deliverable.specifications?.quality_requirements || {}),
      },
    },
    deliverable,
  };
}

function addImageNodes(graph, deliverable, baseId, dependencyId = null) {
  const imageNodeId = `${baseId}:image`;
  const qaNodeId = `${baseId}:image:qa`;
  const references = list(deliverable.assets || deliverable.reference_assets);
  const specification = universalImageSpecification(deliverable);

  graph.nodes.push(
    createProductionNode({
      id: imageNodeId,
      type: "ASSET",
      title: `${deliverable.title || "Image"} — Image`,
      description: deliverable.description || "Generate the final image asset.",
      duration_seconds: 0,
      intent: {
        deliverable: "IMAGE_OUTPUT",
        medium: "IMAGE",
      },
      requirements: {
        deliverable,
        quality_gate: {
          brief_accuracy: true,
          identity_fidelity: true,
          brand_product_fidelity: true,
          composition: true,
          realism: true,
          technical_quality: true,
        },
      },
      assets: references,
      generation: {
        required: true,
        service: "ai.image.generate",
        capability: "ai.image.generate",
        estimated_cost: 0,
        estimated_seconds: 60,
        status: "WAITING",
        input: {
          mode: "reference_grounded_master_still",
          prompt: imagePrompt(deliverable),
          reference_assets: references,
          specification,
        },
      },
      metadata: {
        deliverable: "IMAGE_OUTPUT",
        deliverable_id: deliverable.id,
        medium: "IMAGE",
        requires_quality_approval: true,
        production_contract: "universal_deliverable_v1",
      },
    }),
  );

  graph.nodes.push(
    createProductionNode({
      id: qaNodeId,
      type: "ASSET",
      title: `${deliverable.title || "Image"} — Visual QA`,
      description: "Inspect the complete generated image against its deliverable contract.",
      duration_seconds: 0,
      intent: {
        deliverable: "IMAGE_OUTPUT_QA",
        approval_gate: true,
      },
      requirements: {
        deliverable,
        inspected_node_id: imageNodeId,
      },
      assets: references,
      generation: {
        required: true,
        service: "ai.image.analyze",
        capability: "ai.image.analyze",
        estimated_cost: 0,
        estimated_seconds: 20,
        status: "WAITING",
        input: {
          mode: "creative_universal_image_qa",
          inspected_node_id: imageNodeId,
          minimum_score: Number(deliverable.specifications?.minimum_quality_score || 85),
          reference_assets: references,
          prompt: [
            "Inspect the generated image as an uncompromising senior creative quality supervisor.",
            "Return strict JSON with passed, overall_score, critical_failures, issues, correction_instructions, evidence, and release_readiness.",
            `DELIVERABLE CONTRACT: ${JSON.stringify(deliverable)}`,
          ].join("\n\n"),
        },
      },
      metadata: {
        deliverable: "IMAGE_OUTPUT_QA",
        deliverable_id: deliverable.id,
        medium: "IMAGE",
        inspected_node_id: imageNodeId,
        requires_quality_approval: false,
        production_contract: "universal_deliverable_v1",
      },
    }),
  );

  if (dependencyId) {
    graph.edges.push(
      createProductionEdge({
        from: dependencyId,
        to: imageNodeId,
        type: "DEPENDS_ON",
        metadata: { condition: "CONTENT_DIRECTION_COMPLETE" },
      }),
    );
  }
  graph.edges.push(
    createProductionEdge({
      from: imageNodeId,
      to: qaNodeId,
      type: "DEPENDS_ON",
      metadata: { condition: "IMAGE_GENERATED" },
    }),
  );

  return qaNodeId;
}

function addAudioNodes(graph, deliverable, baseId) {
  const nodeIds = [];
  for (const capability of audioCapabilities(deliverable)) {
    const kind = capability.split(".")[1] || "audio";
    const nodeId = `${baseId}:${slug(capability, kind)}`;
    graph.nodes.push(
      createProductionNode({
        id: nodeId,
        type: "ASSET",
        title: `${deliverable.title || "Audio"} — ${kind.toUpperCase()}`,
        description: deliverable.description || "Generate the required audio deliverable.",
        duration_seconds: Number(deliverable.specifications?.duration_seconds || 0),
        intent: {
          deliverable: "AUDIO_OUTPUT",
          medium: "AUDIO",
          audio_kind: kind,
        },
        requirements: { deliverable },
        assets: list(deliverable.assets || deliverable.reference_assets),
        generation: {
          required: true,
          service: capability,
          capability,
          estimated_cost: 0,
          estimated_seconds: 60,
          status: "WAITING",
          input: {
            mode: "creative_universal_audio",
            prompt: deliverablePrompt(deliverable),
            duration_seconds: Number(deliverable.specifications?.duration_seconds || 0),
            specification: { deliverable },
          },
        },
        metadata: {
          deliverable: "AUDIO_OUTPUT",
          deliverable_id: deliverable.id,
          medium: "AUDIO",
          audio_kind: kind,
          requires_quality_approval: false,
          production_contract: "universal_deliverable_v1",
        },
      }),
    );
    nodeIds.push(nodeId);
  }
  return nodeIds;
}

function addUniversalNodes(graph, deliverables = []) {
  let generated = 0;

  for (const [index, deliverable] of deliverables.entries()) {
    const resolvedMedium = medium(deliverable.medium || deliverable.production_type);
    if (resolvedMedium === "FILM") continue;

    const baseId = `deliverable:${slug(deliverable.id || deliverable.title, `output-${index + 1}`)}`;
    const capabilities = new Set(list(deliverable.execution_capabilities));

    if (resolvedMedium === "IMAGE") {
      addImageNodes(graph, deliverable, baseId);
      generated += 2;
      continue;
    }

    if (resolvedMedium === "AUDIO") {
      generated += addAudioNodes(graph, deliverable, baseId).length;
      continue;
    }

    const contentNodeId = addTextNode(graph, deliverable, baseId);
    generated += 1;

    if (
      resolvedMedium === "MULTIMEDIA" ||
      resolvedMedium === "WEBSITE" ||
      resolvedMedium === "MENU" ||
      resolvedMedium === "PRESENTATION" ||
      capabilities.has("ai.image.generate")
    ) {
      addImageNodes(graph, deliverable, baseId, contentNodeId);
      generated += 2;
    }
  }

  return generated;
}

export function buildProductionGraph({
  organization_id,
  creative_project_id,
  storyboard,
  scenes = [],
  shots = [],
  deliverables = [],
  creative_plan = null,
}) {
  const resolvedDeliverables = list(deliverables).length
    ? list(deliverables)
    : list(creative_plan?.deliverables);
  const containsFilm =
    resolvedDeliverables.some((item) => medium(item.medium || item.production_type) === "FILM") ||
    list(scenes).length > 0 ||
    list(shots).length > 0;

  const graph = createProductionGraph({
    organization_id,
    creative_project_id,
    storyboard_id: storyboard?.id || null,
    title:
      storyboard?.title ||
      creative_plan?.title ||
      (containsFilm ? "Atomic Film Production Graph" : "Universal Creative Production Graph"),
    description: containsFilm
      ? "Reference-grounded master stills and independently directed video shots."
      : "Deliverable-driven production graph generated from the requested medium, capabilities, formats, and release contract.",
    production_plan: {
      quality_profile:
        creative_plan?.production_direction?.creative_standard ||
        creative_plan?.quality_profile ||
        "world_class",
      draft_first: true,
      reuse_assets: true,
      provider_strategy: "capability_and_quality_optimized",
      render_modes: containsFilm
        ? ["master_still", "shot_video", "review", "final"]
        : ["deliverable", "review", "release"],
    },
    metadata: {
      production_contract: containsFilm
        ? "atomic_reference_grounded_shots_v1"
        : "universal_deliverable_v1",
      dynamic_medium_execution: true,
      deliverable_count: resolvedDeliverables.length,
      media: [...new Set(resolvedDeliverables.map((item) => medium(item.medium || item.production_type)))],
    },
  });

  const filmShotCount = addFilmNodes(graph, scenes, shots);
  const universalGeneratedCount = addUniversalNodes(graph, resolvedDeliverables);

  graph.status = "PLANNED";
  graph.metadata.total_scenes = scenes.length;
  graph.metadata.total_shots = filmShotCount;
  graph.metadata.total_generated_deliverables =
    graph.nodes.filter((node) => node.generation?.required).length;
  graph.metadata.universal_generated_nodes = universalGeneratedCount;

  if (!graph.metadata.total_generated_deliverables) {
    throw new Error("CREATIVE_PRODUCTION_GRAPH_HAS_NO_EXECUTABLE_DELIVERABLES");
  }

  return graph;
}

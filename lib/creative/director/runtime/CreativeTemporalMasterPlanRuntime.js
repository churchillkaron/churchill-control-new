import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  creativeAgencyDecisionSchema,
  creativeAgencyRoleInstructions,
} from "@/lib/creative/director/registry/CreativeAgencyRoleRegistry";
import {
  assertCreativeMasterPlan,
} from "@/lib/creative/director/validation/CreativeMasterPlanValidator";

const QUALITY_NUMBER_FIELDS = Object.freeze([
  "minimum_scene_score",
  "regenerate_below_score",
]);

const QUALITY_BOOLEAN_FIELDS = Object.freeze([
  "require_brand_fit",
  "require_non_ai_feel",
  "require_identity_continuity",
  "require_product_continuity",
  "require_story_progression",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJson(value) {
  if (value && typeof value === "object") return value;
  const source = text(value);
  if (!source) return null;

  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(source.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Continue with the next conservative JSON extraction.
    }
  }
  return null;
}

function normalizedOutput(result) {
  const output = result?.output?.output || result?.output || result || {};
  const parsed = parseJson(output.text || output.content || output);
  return parsed?.result || parsed || null;
}

function qualityPolicyFor(project = {}, brief = {}) {
  const policy = object(
    project.metadata?.creative_quality_policy ||
    brief.creative_quality_policy ||
    brief.metadata?.creative_quality_policy,
  );

  if (!Object.keys(policy).length) {
    throw new Error("CREATIVE_QUALITY_POLICY_REQUIRED");
  }
  if (!text(policy.version)) {
    throw new Error("CREATIVE_QUALITY_POLICY_VERSION_REQUIRED");
  }

  for (const field of QUALITY_NUMBER_FIELDS) {
    const value = finite(policy[field]);
    if (value === null || value < 0 || value > 100) {
      throw new Error(`CREATIVE_QUALITY_POLICY_${field.toUpperCase()}_INVALID`);
    }
  }
  if (Number(policy.regenerate_below_score) > Number(policy.minimum_scene_score)) {
    throw new Error("CREATIVE_QUALITY_POLICY_REGENERATION_THRESHOLD_INVALID");
  }

  for (const field of QUALITY_BOOLEAN_FIELDS) {
    if (typeof policy[field] !== "boolean") {
      throw new Error(`CREATIVE_QUALITY_POLICY_${field.toUpperCase()}_REQUIRED`);
    }
  }

  return {
    version: text(policy.version),
    ...Object.fromEntries(
      QUALITY_NUMBER_FIELDS.map((field) => [field, Number(policy[field])]),
    ),
    ...Object.fromEntries(
      QUALITY_BOOLEAN_FIELDS.map((field) => [field, policy[field]]),
    ),
  };
}

function assetIdentity(asset = {}) {
  const id = text(asset.id || asset.asset_id);
  if (!id) throw new Error("CREATIVE_SELECTED_ASSET_ID_REQUIRED");
  return {
    asset_id: id,
    asset_type: asset.asset_type || asset.type || null,
    name: asset.name || asset.title || asset.file_name || null,
    description: asset.description || asset.analysis?.description || null,
    analysis: asset.analysis || {},
    tags: list(asset.tags || asset.analysis?.tags),
    url: asset.url || asset.file_url || asset.image_url || null,
    rights: asset.rights || asset.metadata?.rights || {},
    consent: asset.consent || asset.metadata?.consent || {},
    restrictions: asset.restrictions || asset.metadata?.restrictions || {},
    technical: asset.technical || {},
    metadata: asset.metadata || {},
  };
}

function temporalDuration(project = {}, brief = {}) {
  const metadata = object(project.metadata);
  const value = finite(
    metadata.temporal_contract?.duration_seconds ??
    metadata.temporalContract?.duration_seconds ??
    metadata.full_master_duration ??
    metadata.full_song_duration_seconds ??
    metadata.creative_direction_constraints?.full_song_duration_seconds ??
    brief.duration_seconds ??
    brief.target_duration ??
    project.target_duration,
  );
  if (!value || value <= 0) {
    throw new Error("CREATIVE_FULL_TEMPORAL_DURATION_REQUIRED");
  }
  return value;
}

function allocateDurations(items, targetSeconds, minimumSeconds = 0.5) {
  const source = list(items);
  if (!source.length) return [];

  const targetMilliseconds = Math.round(Number(targetSeconds) * 1000);
  const minimumMilliseconds = Math.round(minimumSeconds * 1000);
  if (targetMilliseconds < source.length * minimumMilliseconds) {
    throw new Error("CREATIVE_TEMPORAL_DURATION_TOO_SHORT_FOR_ITEM_COUNT");
  }

  const distributable = targetMilliseconds - source.length * minimumMilliseconds;
  const weights = source.map((item) => {
    const duration = finite(item.duration_seconds);
    return duration && duration > 0 ? duration : 1;
  });
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || source.length;
  const raw = weights.map((weight) => (distributable * weight) / totalWeight);
  const floors = raw.map((value) => Math.floor(value));
  let remainder = distributable - floors.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);

  for (let cursor = 0; remainder > 0; cursor += 1, remainder -= 1) {
    floors[order[cursor % order.length].index] += 1;
  }

  return source.map((item, index) => ({
    ...item,
    duration_seconds: (minimumMilliseconds + floors[index]) / 1000,
  }));
}

function ensureStableIds(items, prefix) {
  const used = new Set();
  return list(items).map((item, index) => {
    let id = text(item.id, `${prefix}-${String(index + 1).padStart(2, "0")}`);
    if (used.has(id)) id = `${id}-${index + 1}`;
    used.add(id);
    return { ...item, id };
  });
}

function sceneCountRange(duration) {
  const preferred = Math.max(6, Math.min(20, Math.round(duration / 14)));
  return {
    minimum: Math.max(5, preferred - 2),
    preferred,
    maximum: Math.min(24, preferred + 3),
  };
}

function shotCountRange(duration) {
  const preferred = Math.max(2, Math.min(7, Math.round(duration / 4.5)));
  return {
    minimum: Math.max(2, preferred - 1),
    preferred,
    maximum: Math.min(8, preferred + 1),
  };
}

async function executeReasoning({
  organization_id,
  operation,
  missionId,
  projectId,
  prompt,
  maxOutputTokens,
}) {
  const result = await ServiceExecutionRuntime.execute({
    organization_id,
    service_id: "ai.reasoning.execute",
    provider_id: null,
    category: "CREATIVE_DIRECTION",
    input: {
      prompt,
      quantity: 1,
      max_output_tokens: maxOutputTokens,
    },
    metadata: {
      module: "CREATIVE",
      operation,
      creative_mission_id: missionId || null,
      creative_project_id: projectId,
    },
  });

  const output = normalizedOutput(result);
  if (!output) throw new Error(`${operation}_JSON_REQUIRED`);
  return { output, result };
}

function basePlanPrompt(input) {
  return `
You are Avantiqo's accountable Executive Creative Director. Create the governing plan for
an original, world-class, full-length temporal production. This pass defines the concept,
story, deliverable, asset decisions and agency decisions only. Detailed scenes and shots
will be designed in controlled later passes so the full production is never truncated.

Return strict JSON only, with this exact top-level structure:
{
  "workflow_kind": "TEMPORAL",
  "concept": {
    "title": "specific original title",
    "creative_thesis": "single governing creative idea",
    "hook": "specific audience-facing idea",
    "message": "what the audience should understand or feel",
    "narrative": "complete causal narrative across the full duration",
    "visual_system": "specific art direction and composition system",
    "emotional_promise": "specific emotional outcome",
    "call_to_action": "earned action",
    "target_audience": {}
  },
  "story": {
    "hook": "first visible or audible beat",
    "audience_tension": "desire, contradiction or obstacle",
    "escalation": "how stakes increase",
    "observable_proof": "what visibly proves the message",
    "turn": "surprise, revelation or consequence",
    "resolution": "earned resolution",
    "call_to_action": "action integrated into resolution",
    "emotional_arc": "precise emotional progression",
    "anti_cliche_strategy": "how montage, filler and category clichés are avoided"
  },
  "deliverables": [{
    "id": "stable deliverable id",
    "type": "FILM|VIDEO",
    "purpose": "role of the master production",
    "channels": [],
    "languages": [],
    "output_spec": {
      "duration_seconds": ${input.duration},
      "aspect_ratio": "resolve from the brief and intended channel",
      "resolution": "resolve from the brief and release requirements",
      "frame_rate": "resolve from the creative and technical intent",
      "audio": "preserve the supplied primary soundtrack exactly"
    }
  }],
  "asset_manifest": [{
    "asset_id": "exact supplied asset id",
    "disposition": "ASSIGNED|REFERENCE|REGENERATE|EXCLUDE",
    "reason": "evidence-based production decision",
    "confidence": 0,
    "assignments": ["deliverable id"],
    "restrictions": {},
    "continuity_anchors": {},
    "repair_requirements": []
  }],
  "role_decisions": ${JSON.stringify(creativeAgencyDecisionSchema())},
  "scenes": [],
  "quality": ${JSON.stringify(input.quality_policy)}
}

ACTIVE AGENCY ROLES
${creativeAgencyRoleInstructions()}

MANDATORY RULES
- Copy the supplied quality policy exactly.
- Account for every supplied asset exactly once in asset_manifest.
- Use evidence from asset analysis, rights, consent and restrictions.
- Give every active role a concrete decision, evidence, confidence, risks and repair instructions.
- Build a causal story with a beginning, escalation, turn and earned resolution.
- Do not create scenes in this pass; return scenes as an empty array.
- Do not copy protected campaigns, characters or a living artist's identity or style.
- The work must feel directed by an elite human agency, not assembled by an AI template.

INPUT
${JSON.stringify(input)}
`;
}

function sceneArchitecturePrompt({ basePlan, duration, range, assets, project, brief }) {
  return `
You are Avantiqo's film director and narrative editor. Design the complete scene architecture
for the full temporal master. Return strict JSON only as {"scenes": [...]}.

MASTER DURATION: ${duration} seconds
SCENE COUNT: minimum ${range.minimum}, preferred ${range.preferred}, maximum ${range.maximum}

Each scene must contain:
{
  "id": "stable unique scene id",
  "title": "specific title",
  "objective": "unique causal story purpose",
  "emotion": "specific audience emotion",
  "story_state_before": "what is true before this scene",
  "state_change": "new action, information or emotional change",
  "story_state_after": "what is now true",
  "transition_logic": "why the next scene follows",
  "duration_seconds": 12,
  "location": {},
  "actors": [],
  "products": [],
  "brand_rules": [],
  "visual_style": {},
  "camera_style": {},
  "audio_style": {},
  "reference_asset_ids": []
}

MANDATORY RULES
- The complete scene duration sum must equal exactly ${duration} seconds.
- Cover the complete source soundtrack from 0 to ${duration} seconds without truncation, looping or compression.
- Every scene must change the story state and have a distinct objective.
- No generic montage, filler, repeated beauty shots or disconnected performance coverage.
- Use supplied assets deliberately as direct material, references, continuity anchors or exclusions.
- Preserve identity, product, wardrobe, location and screen-direction continuity.
- Make transitions motivated by action, sound, emotion or visual causality.
- Do not include shots in this response.

GOVERNING PLAN
${JSON.stringify({ concept: basePlan.concept, story: basePlan.story, deliverables: basePlan.deliverables })}

PROJECT
${JSON.stringify(project)}

BRIEF AND RESEARCH
${JSON.stringify(brief)}

ASSETS
${JSON.stringify(assets)}
`;
}

function shotPlanPrompt({
  basePlan,
  scene,
  sceneIndex,
  range,
  assets,
  outputSpec,
}) {
  return `
You are Avantiqo's director, cinematographer, production designer, editor and sound director.
Create executable shot direction for one scene of a world-class temporal production.
Return strict JSON only as {"shots": [...]}.

SCENE INDEX: ${sceneIndex + 1}
SCENE: ${JSON.stringify(scene)}
SHOT COUNT: minimum ${range.minimum}, preferred ${range.preferred}, maximum ${range.maximum}
EXACT SHOT DURATION SUM: ${scene.duration_seconds} seconds
MASTER CONCEPT AND STORY: ${JSON.stringify({ concept: basePlan.concept, story: basePlan.story })}
MASTER OUTPUT SPEC: ${JSON.stringify(outputSpec)}
AVAILABLE ASSETS: ${JSON.stringify(assets)}

Every shot must contain:
{
  "id": "stable unique shot id",
  "title": "specific shot title",
  "purpose": "new story information delivered by this shot",
  "subject": "exact visible subject",
  "action": "exact visible action over time",
  "performance": "micro-behaviour, timing and emotional behaviour",
  "performance_direction": {},
  "duration_seconds": 4,
  "medium": "generated-video|asset-led-motion|live-asset|animation|other",
  "frame_plan": {
    "opening_frame": "complete opening composition and state",
    "progression": "beat-by-beat visible progression",
    "closing_frame": "complete closing composition and state"
  },
  "opening_frame": {},
  "progression_frames": [],
  "closing_frame": {},
  "camera": {
    "framing": "specific framing",
    "angle": "specific angle",
    "camera_distance": "distance and spatial relationship",
    "lens_intent": "optical intent",
    "movement_path": "physical camera path",
    "movement_speed": "speed and acceleration",
    "stabilization": "designed stabilization",
    "movement_motivation": "why the camera moves",
    "focus_target": "precise focus subject",
    "focus_transition": "focus behaviour through time"
  },
  "lighting": {
    "source": "motivated source",
    "direction": "direction and falloff",
    "contrast": "contrast intent",
    "colour": "colour-temperature and palette intent",
    "exposure_intent": "highlight, skin, product and shadow treatment"
  },
  "production_design": {
    "environment": "complete environment",
    "wardrobe": "wardrobe and grooming",
    "props": "required props",
    "materials": "surface and material behaviour",
    "texture_detail": "micro-detail preventing synthetic appearance"
  },
  "continuity": {
    "identity": "identity anchors",
    "product": "product anchors",
    "location": "location anchors",
    "wardrobe": "wardrobe anchors",
    "screen_direction": "movement and eyeline direction",
    "spatial_geography": "where subjects are in the space"
  },
  "dialogue": [],
  "narration": {},
  "audio": {
    "source_sound": "diegetic source sound",
    "sound_effects": [],
    "music": {},
    "silence": "intentional silence",
    "mix_intent": "voice, music, effects and ambience hierarchy"
  },
  "music": {},
  "sound_effects": [],
  "sound_design": {},
  "graphics": {
    "titles": [],
    "subtitles": [],
    "logo": {},
    "overlays": [],
    "render_text_outside_generated_pixels": true
  },
  "vfx": {
    "effects": [],
    "cleanup": [],
    "compositing": []
  },
  "transition_in": "specific editorial transition into the shot",
  "transition_out": "specific editorial transition out of the shot",
  "reference_assets": [{"asset_id":"exact asset id", "role":"specific role"}],
  "reference_asset_ids": [],
  "negative_constraints": [],
  "known_failure_modes": [],
  "repair_instructions": [],
  "generation": {
    "required": true,
    "service": "ai.video.generate",
    "capability": "ai.video.generate",
    "provider_prompt": "complete provider-ready visual and temporal direction",
    "negative_prompt": "complete negative prompt",
    "output_spec": {}
  }
}

MANDATORY RULES
- Shot duration sum must equal exactly ${scene.duration_seconds} seconds.
- Every shot must add new information and visibly advance this scene's state change.
- Describe opening frame, temporal progression and closing frame precisely.
- Specify camera, lighting, design, performance, continuity, sound, graphics, VFX and transitions.
- Use exact supplied asset ids only; do not invent assets.
- Generated pixels must not be trusted for final logos, typography, subtitles or legal text.
- Provider prompts must be complete enough to execute without interpretation.
- Negative constraints and repair instructions are mandatory and specific.
- Avoid generic cinematic language, impossible camera movement, identity drift and synthetic texture.
`;
}

function normalizeShotCompatibility(shot = {}) {
  const framePlan = object(shot.frame_plan);
  const audio = object(shot.audio);
  const graphics = object(shot.graphics);
  const vfx = object(shot.vfx);
  return {
    ...shot,
    performance_direction:
      Object.keys(object(shot.performance_direction)).length
        ? shot.performance_direction
        : { direction: shot.performance || "" },
    opening_frame:
      Object.keys(object(shot.opening_frame)).length
        ? shot.opening_frame
        : { description: framePlan.opening_frame || "" },
    progression_frames:
      list(shot.progression_frames).length
        ? shot.progression_frames
        : [{ description: framePlan.progression || "" }],
    closing_frame:
      Object.keys(object(shot.closing_frame)).length
        ? shot.closing_frame
        : { description: framePlan.closing_frame || "" },
    music: Object.keys(object(shot.music)).length ? shot.music : object(audio.music),
    sound_effects: list(shot.sound_effects).length
      ? shot.sound_effects
      : list(audio.sound_effects),
    sound_design: Object.keys(object(shot.sound_design)).length
      ? shot.sound_design
      : {
          source_sound: audio.source_sound || "",
          silence: audio.silence || "",
          mix_intent: audio.mix_intent || "",
        },
    subtitles: list(shot.subtitles).length ? shot.subtitles : list(graphics.subtitles),
    typography: Object.keys(object(shot.typography)).length
      ? shot.typography
      : {
          titles: list(graphics.titles),
          render_text_outside_generated_pixels:
            graphics.render_text_outside_generated_pixels !== false,
        },
    vfx: Array.isArray(shot.vfx)
      ? shot.vfx
      : [
          ...list(vfx.effects),
          ...list(vfx.cleanup),
          ...list(vfx.compositing),
        ],
    assets: list(shot.assets).length ? shot.assets : list(shot.reference_assets),
  };
}

export const CreativeTemporalMasterPlanRuntime = {
  async create({
    organization_id,
    mission = {},
    project = {},
    brief = {},
    assets = [],
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!project.id) throw new Error("creative_project_id required");

    const duration = temporalDuration(project, brief);
    const qualityPolicy = qualityPolicyFor(project, brief);
    const normalizedAssets = list(assets).map(assetIdentity);
    const missionId = mission.id || mission.creative_mission_id || null;
    const executions = [];

    const baseInput = {
      mission,
      project,
      brief,
      assets: normalizedAssets,
      duration,
      duration_mode: "FULL_SOURCE_AUDIO",
      exact_duration_required: true,
      quality_policy: qualityPolicy,
    };
    const baseExecution = await executeReasoning({
      organization_id,
      operation: "TEMPORAL_MASTER_PLAN_BASE_V1",
      missionId,
      projectId: project.id,
      prompt: basePlanPrompt(baseInput),
      maxOutputTokens: 16000,
    });
    executions.push(baseExecution.result);

    const basePlan = {
      ...object(baseExecution.output),
      workflow_kind: "TEMPORAL",
      scenes: [],
      quality: qualityPolicy,
    };

    const architectureExecution = await executeReasoning({
      organization_id,
      operation: "TEMPORAL_SCENE_ARCHITECTURE_V1",
      missionId,
      projectId: project.id,
      prompt: sceneArchitecturePrompt({
        basePlan,
        duration,
        range: sceneCountRange(duration),
        assets: normalizedAssets,
        project,
        brief,
      }),
      maxOutputTokens: 14000,
    });
    executions.push(architectureExecution.result);

    let scenes = ensureStableIds(
      architectureExecution.output.scenes,
      "scene",
    );
    if (!scenes.length) throw new Error("CREATIVE_TEMPORAL_SCENE_ARCHITECTURE_REQUIRED");
    scenes = allocateDurations(scenes, duration, 2);

    const outputSpec = object(list(basePlan.deliverables)[0]?.output_spec);
    const completedScenes = [];
    for (const [sceneIndex, scene] of scenes.entries()) {
      const shotExecution = await executeReasoning({
        organization_id,
        operation: "TEMPORAL_SCENE_SHOT_DIRECTION_V1",
        missionId,
        projectId: project.id,
        prompt: shotPlanPrompt({
          basePlan,
          scene,
          sceneIndex,
          range: shotCountRange(scene.duration_seconds),
          assets: normalizedAssets,
          outputSpec,
        }),
        maxOutputTokens: 16000,
      });
      executions.push(shotExecution.result);

      let shots = ensureStableIds(
        shotExecution.output.shots,
        `${scene.id}-shot`,
      );
      if (!shots.length) {
        throw new Error(`CREATIVE_TEMPORAL_SCENE_SHOTS_REQUIRED:${scene.id}`);
      }
      shots = allocateDurations(shots, scene.duration_seconds, 0.5)
        .map(normalizeShotCompatibility);
      completedScenes.push({ ...scene, shots });
    }

    const plan = {
      ...basePlan,
      workflow_kind: "TEMPORAL",
      scenes: completedScenes,
      quality: qualityPolicy,
      temporal_contract: {
        duration_seconds: duration,
        exact_duration_required: true,
        scene_duration_sum_must_equal_source: true,
        shot_duration_sum_must_equal_scene: true,
      },
    };
    const validation = assertCreativeMasterPlan({
      plan,
      assets: normalizedAssets,
    });

    const lastExecution = executions[executions.length - 1] || {};
    return {
      plan: {
        ...plan,
        degraded: false,
        release_blocked: false,
        validation,
      },
      validation,
      provider: lastExecution.provider || null,
      model: lastExecution.model || null,
      usage: {
        calls: executions.length,
        items: executions.map((item) => item.usage).filter(Boolean),
      },
      billing: {
        calls: executions.length,
        items: executions.map((item) => item.billing).filter(Boolean),
      },
      fallback: false,
      degraded: false,
      chunked_temporal_direction: true,
    };
  },
};

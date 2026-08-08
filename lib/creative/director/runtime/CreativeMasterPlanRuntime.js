import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  creativeAgencyDecisionSchema,
  creativeAgencyRoleInstructions,
} from "@/lib/creative/director/registry/CreativeAgencyRoleRegistry";
import {
  assertCreativeMasterPlan,
  validateCreativeMasterPlan,
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

function parseJson(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return null;
  }
}

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

function targetDurationFor(input = {}) {
  return finite(
    input.brief?.duration_seconds ??
    input.brief?.target_duration ??
    input.project?.target_duration ??
    input.project?.metadata?.target_duration ??
    input.project?.metadata?.targetDuration,
  );
}

function allowDegradedDirection() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.CREATIVE_ALLOW_DEGRADED_DIRECTION === "true"
  );
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

function qualityPolicyMatches(actual = {}, expected = {}) {
  return Object.entries(expected).every(([key, value]) => actual[key] === value);
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
  };
}

function fallbackPlan({ brief = {}, project = {}, assets = [], quality_policy = {} }) {
  const objective = text(
    brief.creative_objective ||
      brief.business_goal ||
      project.objective,
    "Human creative direction is required before production.",
  );
  const selected = assets.map(assetIdentity);
  const duration = finite(brief.duration_seconds || project.target_duration);

  return {
    workflow_kind: "TEMPORAL",
    degraded: true,
    release_blocked: true,
    degraded_reason: "Provider-backed creative direction was unavailable.",
    concept: {
      title: text(project.name, "Degraded creative direction"),
      creative_thesis: objective,
      hook: objective,
      message: objective,
      narrative: objective,
      visual_system: "Unverified local fallback direction",
      emotional_promise: "Unverified",
      call_to_action: text(brief.requested_action, "Human review required."),
      target_audience: brief.target_audience || {},
    },
    story: {
      hook: "Unverified fallback hook requiring human direction.",
      audience_tension: "Unverified fallback tension requiring human direction.",
      escalation: "Unverified fallback escalation requiring human direction.",
      observable_proof: "Unverified fallback proof requiring human direction.",
      turn: "Unverified fallback turn requiring human direction.",
      resolution: "Unverified fallback resolution requiring human direction.",
      call_to_action: text(brief.requested_action, "Human review required."),
      emotional_arc: "Unverified fallback emotional arc requiring human direction.",
      anti_cliche_strategy: "Do not release fallback work.",
    },
    deliverables: [
      {
        id: "degraded-master",
        type: "VIDEO",
        purpose: "Development-only degraded direction evidence.",
        output_spec: {
          duration_seconds: duration,
          release_blocked: true,
        },
      },
    ],
    asset_manifest: selected.map((asset) => ({
      asset_id: asset.asset_id,
      disposition: "REFERENCE",
      reason: "Fallback mode cannot verify suitability for direct production use.",
      confidence: 0,
      assignments: ["degraded-master"],
      restrictions: asset.restrictions,
    })),
    role_decisions: creativeAgencyDecisionSchema(),
    scenes: [],
    quality: {
      ...quality_policy,
      release_blocked: true,
    },
  };
}

function normalizedPlan(result) {
  const output =
    result?.output?.output ||
    result?.output ||
    result ||
    {};
  const parsed = parseJson(output.text || output.content || output);
  return parsed?.result || parsed || null;
}

function promptFor(input) {
  const roleSchema = creativeAgencyDecisionSchema();
  const targetDuration = targetDurationFor(input);
  return `
You are Avantiqo's accountable Executive Creative Director. You lead a world-class,
industry-neutral agency trusted with the full creative and production decision. Create
specific, original, culturally aware, commercially useful work that can survive a major-
brand creative review. Providers are production workers; Avantiqo owns the creative idea,
story logic, asset decisions, shot design, production constraints and quality standard.

Resolve the requested work into one workflow_kind:
TEMPORAL, STILL, DOCUMENT, INTERACTIVE, SOFTWARE, AUDIO, or CAMPAIGN_SYSTEM.
Never force a website, application, document, presentation, image or audio request into
a video workflow. Unsupported execution requirements must be explicit.

ACTIVE AGENCY ROLES
${creativeAgencyRoleInstructions()}

Return strict JSON only. No markdown. Do not persist provider prompts. Provider-specific
wording is serialized later at the execution transport boundary from the structured
production contract below.

The complete schema is:
{
  "workflow_kind": "TEMPORAL|STILL|DOCUMENT|INTERACTIVE|SOFTWARE|AUDIO|CAMPAIGN_SYSTEM",
  "concept": {
    "title": "specific original title",
    "creative_thesis": "single governing creative idea with a clear point of view",
    "hook": "specific first audience-facing idea",
    "message": "what the audience should understand or feel",
    "narrative": "complete causal creative narrative",
    "visual_system": "art direction, palette, materials, typography and composition system",
    "emotional_promise": "specific emotional outcome",
    "call_to_action": "earned action",
    "target_audience": {}
  },
  "story": {
    "hook": "first visible or audible beat",
    "audience_tension": "desire, contradiction, obstacle or unanswered question",
    "escalation": "how pressure, discovery or emotional stakes increase",
    "observable_proof": "what the audience sees or hears that proves the message",
    "turn": "surprise, reversal, humour, revelation or emotional consequence",
    "resolution": "earned resolution caused by prior action",
    "call_to_action": "action integrated into the resolution",
    "emotional_arc": "precise emotional progression",
    "anti_cliche_strategy": "how the work avoids montage, filler and category clichés"
  },
  "deliverables": [{
    "id": "stable deliverable id",
    "type": "FILM|VIDEO|IMAGE|POSTER|BANNER|MENU|DOCUMENT|PRESENTATION|WEBSITE|LANDING_PAGE|APPLICATION|AUDIO|OTHER",
    "purpose": "role in the complete campaign or product",
    "channels": [],
    "languages": [],
    "output_spec": {
      "media_type": "video for temporal work or the exact deliverable medium",
      "duration_seconds": ${JSON.stringify(targetDuration)},
      "aspect_ratio": "choose one exact executable ratio such as 16:9, 9:16, 1:1 or 4:5",
      "resolution": "choose one exact executable size such as 1920x1080 or 1080x1920",
      "frame_rate": 24,
      "audio_mode": "native|designed|silent",
      "delivery_context": "exact intended review or publication context"
    }
  }],
  "asset_manifest": [{
    "asset_id": "exact supplied asset id",
    "disposition": "ASSIGNED|REFERENCE|REGENERATE|EXCLUDE",
    "reason": "evidence-based production decision",
    "confidence": 0,
    "assignments": ["deliverable, scene or shot ids"],
    "restrictions": {},
    "continuity_anchors": {},
    "repair_requirements": []
  }],
  "role_decisions": ${JSON.stringify(roleSchema)},
  "scenes": [{
    "id": "stable unique scene id",
    "title": "specific title",
    "objective": "unique causal story purpose",
    "emotion": "specific audience emotion",
    "story_state_before": "what is true before this scene",
    "state_change": "new information, action or emotional change",
    "story_state_after": "what is now true",
    "transition_logic": "why the next scene follows",
    "duration_seconds": ${JSON.stringify(targetDuration)},
    "location": {
      "environment": "specific physical environment",
      "time": "specific time or light state",
      "geography": "spatial facts that must remain stable"
    },
    "actors": [],
    "products": [],
    "brand_rules": [],
    "visual_style": {
      "composition": "specific composition logic",
      "palette": "specific palette and colour behaviour",
      "texture": "specific real-world texture behaviour"
    },
    "camera_style": {
      "grammar": "specific camera grammar for this scene",
      "movement_rule": "when and why movement is permitted"
    },
    "audio_style": {
      "ambience": "specific environmental sound intent",
      "music_role": "specific musical or silence function"
    },
    "shots": [{
      "id": "stable unique shot id",
      "title": "specific shot title",
      "purpose": "new story information delivered by this shot",
      "subject": "exact visible subject",
      "action": "exact visible action over time",
      "performance": "micro-behaviour, timing and emotional behaviour",
      "duration_seconds": ${JSON.stringify(targetDuration)},
      "medium": "generated-video|asset-led-motion|live-asset|animation|other",
      "frame_plan": {
        "opening_frame": "complete opening composition and story state in at least 30 characters",
        "progression": "second-by-second or beat-by-beat visible progression in at least 40 characters",
        "closing_frame": "complete closing composition and changed story state in at least 30 characters"
      },
      "camera": {
        "framing": "specific framing",
        "angle": "specific angle",
        "camera_distance": "distance and spatial relationship",
        "lens_intent": "optical intent, not merely a focal length",
        "movement_path": "physical camera path",
        "movement_speed": "speed and acceleration",
        "stabilization": "tripod, dolly, handheld, gimbal or designed motion",
        "movement_motivation": "why the camera moves or why it remains locked",
        "focus_target": "precise focus subject",
        "focus_transition": "focus behaviour through time"
      },
      "lighting": {
        "source": "motivated physical source",
        "direction": "direction and falloff",
        "contrast": "contrast ratio intent",
        "colour": "colour-temperature and palette intent",
        "exposure_intent": "highlight, skin, product and shadow treatment"
      },
      "production_design": {
        "environment": "complete environment and what must not change",
        "wardrobe": "specific wardrobe/grooming, or an operational no-human/no-change instruction",
        "props": "specific required props, or an operational instruction forbidding added props",
        "materials": "surface and material behaviour",
        "texture_detail": "micro-detail that prevents synthetic appearance"
      },
      "continuity": {
        "identity": "identity anchors, or an operational instruction that no new identity may be introduced",
        "product": "product anchors, or an operational instruction that no unverified product may be introduced",
        "location": "location anchors",
        "wardrobe": "wardrobe anchors, or an operational instruction preserving source appearance",
        "screen_direction": "movement and eyeline direction",
        "spatial_geography": "where every subject is in the space"
      },
      "dialogue": [],
      "narration": {},
      "audio": {
        "source_sound": "specific diegetic source sound or an explicit silence/room-tone instruction",
        "sound_effects": [],
        "music": {},
        "silence": "where silence is intentionally protected",
        "mix_intent": "voice, music, effects and ambience hierarchy"
      },
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
      "primary_source_asset_id": "exact supplied asset id or null only for a fully synthetic source-free shot",
      "reference_assets": [{
        "asset_id": "exact supplied asset id",
        "role": "PRIMARY_SOURCE|IDENTITY_REFERENCE|LOCATION_REFERENCE|CONTINUITY_REFERENCE|PRODUCT_REFERENCE|STYLE_REFERENCE|BRAND_REFERENCE|SUBJECT_REFERENCE|AUDIO_REFERENCE",
        "reason": "specific evidence-based reason this asset is required for this shot"
      }],
      "negative_constraints": ["specific visual, identity, motion, brand or physics failure that must not occur"],
      "known_failure_modes": ["specific likely generation failure to inspect for"],
      "repair_instructions": ["bounded repair action that preserves approved story and identity"],
      "generation": {
        "required": true,
        "service": "ai.video.generate for temporal generated video",
        "capability": "ai.video.generate for temporal generated video",
        "output_spec": {
          "media_type": "video",
          "duration_seconds": ${JSON.stringify(targetDuration)},
          "aspect_ratio": "exact executable ratio matching the master deliverable",
          "resolution": "exact executable resolution matching the master deliverable",
          "frame_rate": 24,
          "audio_mode": "native|designed|silent",
          "source_mode": "image_to_video|text_to_video|asset_led_motion"
        }
      }
    }]
  }],
  "quality": ${JSON.stringify(input.quality_policy)}
}

MANDATORY RULES
- Copy the supplied quality policy exactly. Do not invent thresholds or replace policy values.
- Every supplied asset must appear exactly once in asset_manifest with an explicit disposition.
- Never claim an asset was understood when its analysis is missing or unverified.
- Use real assets directly only when suitability, quality, rights and continuity support direct use.
- Reference assets must influence generation without being silently omitted.
- Every active agency role must return a concrete decision of at least 20 characters, evidence, confidence, risks and repair instructions.
- Every temporal scene must alter the story state. Every shot must add new information.
- Honor explicit project constraints such as scene_count, shot_count and single_continuous_shot as hard production contracts when present.
- For TEMPORAL work, the deliverable duration, scene-duration sum and shot-duration sum must equal the requested target duration exactly.
- For every temporal shot, generation.output_spec.duration_seconds must exactly equal shot.duration_seconds.
- Never return an empty output_spec. Choose concrete executable aspect ratio, resolution, duration, frame rate and audio/source mode values from the brief and project context.
- Do not return N/A, NA, none, not applicable, TBD, unspecified, empty strings or adjective-only placeholders in any required direction field.
- If a category is absent, describe the absence operationally. Example: "No visible human talent; introduce no wardrobe and preserve any verified source-image clothing exactly." Do not write "N/A".
- For every source-bearing shot, reference_assets must contain exactly one PRIMARY_SOURCE and primary_source_asset_id must match it exactly.
- Fully synthetic source-free shots must use primary_source_asset_id null and reference_assets [] unless another verified reference is deliberately required.
- Use exact supplied asset ids only. Never invent an asset id.
- Reject generic montages, repeated scene objectives, filler, unexplained beauty shots and unearned calls to action.
- Specify opening, temporal progression and closing for every generated shot.
- Specify camera, lighting, production design, continuity, sound, graphics, VFX, transitions, negative constraints, known failure modes and bounded repairs.
- Do not persist prompt, provider_prompt, negative_prompt, visual_prompt or video_prompt fields anywhere in the plan. Execution transport will serialize provider instructions from structured direction.
- Generated image or video pixels must not be trusted for final typography, logos or legal text.
- Do not copy protected campaigns, characters, or a living artist's identity or style.
- Make the work original enough that quality depends on direction and craft, not novelty claims about AI.
- Before returning JSON, self-audit every required field against these rules and repair any shallow or empty value yourself.

INPUT
${JSON.stringify(input)}
`;
}

export const CreativeMasterPlanRuntime = {
  async create({
    organization_id,
    mission = {},
    project = {},
    brief = {},
    assets = [],
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!project.id) throw new Error("creative_project_id required");

    const qualityPolicy = qualityPolicyFor(project, brief);
    const normalizedAssets = list(assets).map(assetIdentity);
    const input = {
      mission,
      project,
      brief,
      assets: normalizedAssets,
      quality_policy: qualityPolicy,
    };

    try {
      const result = await ServiceExecutionRuntime.execute({
        organization_id,
        service_id: "ai.reasoning.execute",
        provider_id: null,
        category: "CREATIVE_DIRECTION",
        input: {
          prompt: promptFor(input),
          quantity: 1,
          max_output_tokens: 16000,
          response_format: { type: "json_object" },
        },
        metadata: {
          module: "CREATIVE",
          operation: "MASTER_PLAN_V3",
          creative_mission_id: mission.id || null,
          creative_project_id: project.id,
          creative_quality_policy_version: qualityPolicy.version,
          creative_direction_persistence: "STRUCTURED_ONLY",
          provider_prompt_boundary: "EXECUTION_TRANSPORT_ONLY",
        },
      });

      const plan = normalizedPlan(result);
      if (!plan) throw new Error("CREATIVE_MASTER_PLAN_JSON_REQUIRED");
      if (!qualityPolicyMatches(object(plan.quality), qualityPolicy)) {
        throw new Error("CREATIVE_MASTER_PLAN_QUALITY_POLICY_MISMATCH");
      }
      const validation = assertCreativeMasterPlan({
        plan,
        assets: normalizedAssets,
      });

      return {
        plan: {
          ...plan,
          degraded: false,
          release_blocked: false,
          validation,
        },
        validation,
        provider: result.provider || null,
        model: result.model || null,
        usage: result.usage || null,
        billing: result.billing || null,
        fallback: false,
        degraded: false,
      };
    } catch (error) {
      if (!allowDegradedDirection()) {
        const failure = new Error(
          `CREATIVE_DIRECTION_FAILED_CLOSED:${error?.message || String(error)}`,
        );
        failure.cause = error;
        failure.validation = error?.validation || null;
        throw failure;
      }

      const plan = fallbackPlan(input);
      const validation = validateCreativeMasterPlan({
        plan,
        assets: normalizedAssets,
      });
      return {
        plan: {
          ...plan,
          validation,
        },
        validation,
        provider: "local-fallback",
        model: "creative-master-plan-degraded-v3",
        usage: null,
        billing: null,
        fallback: true,
        degraded: true,
        fallback_reason: error?.message || String(error),
        release_blocked: true,
      };
    }
  },
};

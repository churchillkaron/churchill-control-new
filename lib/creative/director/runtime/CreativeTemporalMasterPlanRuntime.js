import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  CREATIVE_AGENCY_ROLES,
  creativeAgencyDecisionSchema,
  creativeAgencyRoleInstructions,
} from "@/lib/creative/director/registry/CreativeAgencyRoleRegistry";
import {
  assertCreativeMasterPlan,
  creativeTemporalSceneShotFailures,
} from "@/lib/creative/director/validation/CreativeMasterPlanValidator";
import {
  mergeCreativeRepairedPlan,
} from "@/lib/creative/director/runtime/mergeCreativeRepairedPlan";
import {
  unaccountedSelectedAssetIds,
} from "@/lib/creative/director/planner/creativeAssetManifestGap";
import {
  applyDerivedRoleDecisions,
} from "@/lib/creative/director/planner/creativeRoleDecisionDefaults";
import {
  availableProductionCapabilities,
  productionCapabilityPairs,
} from "@/lib/creative/director/planner/creativeProductionCapabilities";

const MAXIMUM_CONTRACT_REPAIR_ATTEMPTS = 2;
const MAXIMUM_SCENE_SHOT_ATTEMPTS = 2;
const SCENE_SHOT_CONCURRENCY = 4;

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
    // No storage URL. The director never reads one -- it understands an asset through the analysis
    // field, and production resolves files by id -- but every film so far mined ids out of it. The
    // URL is a hashed storage path, so a shot ended up declaring
    // f39fc9273753c6a2101bee9f42cd3caafe4036689c50ad8daeb617c4bb6ed0bc as its PRIMARY_SOURCE on 29
    // shots of one film: a real asset, named by its filename, which is not an id and does not exist.
    // Withholding what the director cannot use is a better fix than telling it not to misread it.
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

function fullSourceAudioIntent(
  project = {},
  brief = {},
) {
  const projectMetadata = object(project.metadata);
  const briefMetadata = object(brief.metadata);

  const mode = text(
    projectMetadata.duration_mode ||
    projectMetadata.durationMode ||
    projectMetadata.temporal_contract?.mode ||
    projectMetadata.temporalContract?.mode ||
    briefMetadata.duration_mode ||
    briefMetadata.temporal_contract?.mode,
  ).toUpperCase();

  if ([
    "FULL_SOURCE_AUDIO",
    "FULL_SONG",
    "MATCH_SOURCE_AUDIO",
    "SOURCE_AUDIO",
  ].includes(mode)) {
    return true;
  }

  if (
    projectMetadata.full_song === true ||
    projectMetadata.fullSong === true ||
    projectMetadata.music_video === true ||
    projectMetadata.musicVideo === true ||
    briefMetadata.full_song === true ||
    briefMetadata.music_video === true
  ) {
    return true;
  }

  const corpus = [
    project.name,
    project.description,
    project.objective,
    brief.creative_objective,
    brief.business_goal,
    projectMetadata.request,
    projectMetadata.request_text,
    projectMetadata.creative_request,
    projectMetadata.production_intent,
  ]
    .map(text)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\b(music video|official video|full song|entire song|whole song|complete song|song-length|full-length song)\b/i
    .test(corpus);
}

function temporalAudioContract(
  project = {},
  brief = {},
) {
  const sourceAudioRequired =
    fullSourceAudioIntent(project, brief);

  return sourceAudioRequired
    ? {
        contract: "TEMPORAL_AUDIO_DIRECTION_V1",
        mode: "FULL_SOURCE_AUDIO",
        source_audio_required: true,
        timing_authority: "SOURCE_AUDIO",
        output_spec_audio:
          "preserve the supplied primary soundtrack exactly",
        architecture_rule:
          "Cover the complete verified source soundtrack without truncation, looping or time compression.",
        production_rule:
          "Do not replace, imitate or regenerate the supplied source soundtrack.",
      }
    : {
        contract: "TEMPORAL_AUDIO_DIRECTION_V1",
        mode: "ORIGINAL_SCORE_AND_SOUND_DESIGN",
        source_audio_required: false,
        timing_authority: "MASTER_DURATION",
        output_spec_audio:
          "create original exact-duration instrumental music and authentic sound design during production, with no copyrighted imitation",
        architecture_rule:
          "Design the complete audio arc for the exact master duration; original music and authentic sound design will be produced later and must support every causal story beat.",
        production_rule:
          "Do not assume a supplied soundtrack; direct an original score, ambience and effects without copyrighted imitation.",
      };
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

// Structure is the story's decision, not arithmetic on the running time.
//
// This used to compute duration / 14 and force the result into a narrow band, so a 205 second film could
// only ever be 13 to 18 scenes. It could not be three long movements. It could not be one continuous
// take. It could not be forty rapid fragments. Every film of a given length came out the same shape,
// which is how a studio produces competent, forgettable work.
//
// The range now spans what the medium actually allows, from a single unbroken take to a rapid montage,
// and the derived number is offered as a reference point rather than a target. The upper bound is a cost
// bound and nothing else -- each scene is its own planning call.
function sceneCountRange(duration) {
  const reference = Math.max(3, Math.min(20, Math.round(duration / 14)));
  return {
    // One scene is a legitimate form. A single continuous take is a deliberate, difficult choice, and a
    // floor of five forbade it on arithmetic grounds alone.
    minimum: 1,
    reference,
    // Kept for callers that still read `preferred`, but it is a reference point, not an instruction.
    preferred: reference,
    maximum: 24,
  };
}

// The shot call asked for up to eight shots against a flat 15,000 token ceiling, and the shot
// contract requires around forty fields per shot -- opening, progression and closing frames, ten
// camera fields, lighting, production design, continuity, audio, transitions, safety and repair
// lists. Eight richly written shots do not fit, and the showreel died on
// OPENAI_TEXT_RESPONSE_NOT_COMPLETE:max_output_tokens.
//
// The trap is that scene count and shot count interact: a film that comes back as fewer, longer
// scenes gets more shots per scene, so the same duration can need twice the budget depending on
// how the architecture step chose to divide it. A flat ceiling cannot be right for both.
//
// The budget now scales with the shots actually requested, with headroom for the surrounding plan
// and a ceiling to keep a runaway request bounded.
function shotCallTokenBudget(range = {}) {
  const shots = Math.max(1, Number(range.maximum) || 1);
  return Math.min(32000, 6000 + shots * 2600);
}

function shotCountRange(duration) {
  // Fewer shots, each fully directed, rather than more shots each partly specified.
  //
  // A 205 second film came back as 13 scenes and 68 shots -- roughly 3,000 required shot values against
  // a contract of about 45 per shot -- and about a third of them were absent. The result was 1,100
  // validation failures on a film whose structure was right: correct scene count, durations summing
  // exactly to the source track, story and role decisions complete. It failed on depth, not shape.
  //
  // A half-specified shot is not a shot. The missing fields are the craft itself: framing, lens intent,
  // lighting direction, continuity, opening and closing frames. Sixty-eight shots at two thirds
  // specified is weaker work than thirty fully directed, not more of it. At roughly 6.5 seconds per
  // shot a 205 second film asks for about 39 shots and 1,755 values, which sits inside what the model
  // demonstrably produces, and 6 to 8 second shots are ordinary cinematic pacing rather than slow.
  //
  // What this does NOT do is impose a pace. Shot length is the story's decision: a cut can land in one
  // second for impact and a held frame can run eight while an expression changes. allocateDurations
  // already honours that -- it treats each shot's own duration as a weight and scales the set to meet
  // the scene exactly, so a director asking for 1s, 1s and 8s gets that ratio rather than three equal
  // thirds. Narrowing the count to enforce an average would have taken that away and forbidden a
  // fast-cut passage outright.
  //
  // So the range stays wide enough for a fast sequence, and the trade is handed to the director as a
  // judgement instead: choose the number of shots this scene's story actually needs and can be directed
  // completely, because a shot without its framing, lens, lighting and continuity is not a shot.
  // The upper bound is set by what a fast cut actually needs, not by the reference pace. Roughly two
  // seconds a shot is a rapid sequence, so the ceiling follows the scene length rather than sitting a
  // couple above the average -- capping a fifteen second scene at five shots forbade the fast passage
  // this is supposed to allow.
  const reference = Math.max(2, Math.min(5, Math.round(duration / 5.5)));
  return {
    minimum: 2,
    reference,
    preferred: reference,
    maximum: Math.min(10, Math.max(6, Math.round(duration / 2))),
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
      // Every output on this path is parsed as JSON, but JSON mode was never requested
      // -- unlike the master plan runtime and the tribunal, which both request it. The
      // model was therefore free to answer in prose or fenced markdown, parseJson
      // returned null, and the call failed with
      // TEMPORAL_SCENE_SHOT_DIRECTION_V1_JSON_REQUIRED. A film was lost to an output
      // format that was never asked for.
      response_format: { type: "json_object" },
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

// The repair is told exactly which paths failed and is asked to return only what it
// changes. Everything it omits keeps its reviewed value through the merge, so it never
// has to re-emit an entire film to fix one role status -- which on a plan this size is
// the difference between a repair that fits in the token budget and one that truncates.
function temporalContractRepairPrompt({ plan, validationError, assets, attempt }) {
  const failures = Array.isArray(validationError?.validation?.failures)
    ? validationError.validation.failures.map((entry) => ({
        code: entry.code,
        path: entry.path,
        message: entry.message,
      }))
    : [];

  const unaccounted = unaccountedSelectedAssetIds(plan, assets);

  return `
Repair this temporal Creative Master Plan so it satisfies the canonical contract. Do not
change the creative mission, invent evidence, lower quality thresholds, alter approved
rights, or reference services and capabilities that are not already in the plan.

This is repair attempt ${attempt} of at most ${MAXIMUM_CONTRACT_REPAIR_ATTEMPTS}. Resolve
every listed failure now rather than deferring any of them.

Return one JSON object containing only the keys you change. Keys you omit keep their
current values, so do not re-emit sections you are not repairing. Any array you return
replaces that array in full, and objects inside it are merged by id, code, step_key,
scene_id or shot_id where present, so return complete entries for the ones you touch.

Every registered agency role needs an explicit status even when the discipline does not
apply to a film: choose NOT_REQUIRED and give a concrete reason rather than omitting it.

Do not emit prompts, provider prompts, negative prompts or provider parameters.

FAILURES TO RESOLVE
${JSON.stringify(failures, null, 2)}

SELECTED ASSETS
${JSON.stringify(assets, null, 2)}
${unaccounted.length ? `
ASSET IDS MISSING FROM asset_manifest
These exact ids have no manifest entry. Add one for each with an evidence-backed disposition:
${JSON.stringify(unaccounted, null, 2)}
` : ""}

CURRENT PLAN
${JSON.stringify(plan, null, 2)}
`;
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
    "creative_system": "specific art direction and composition system",
    "emotional_promise": "specific emotional outcome",
    "signature_device": "the one device this work is built on, and where it does not appear",
    "refused_devices": "the reflex devices for this brief, named and rejected with reasons",
    "call_to_action": "earned action, including the form it takes",
    "target_audience": {}
  },
  "story": {
    "hook": "first visible or audible beat",
    "audience_tension": "desire, contradiction or obstacle",
    "escalation": "how stakes increase",
    "observable_proof": "what visibly proves the message",
    "turn": "surprise, revelation or consequence",
    "resolution": "earned resolution",
    "call_to_action": "action integrated into resolution, and the form it takes",
    "emotional_arc": "precise emotional progression",
    "anti_cliche_strategy": "how montage, filler and category clichés are avoided"
  },
  "creative_review": {
    "passed": true,
    "overall_score": 0,
    "dimensions": {},
    "selected_direction_reason": "why this direction wins for this organization, mission and evidence",
    "rejected_patterns": ["four or more specific approaches rejected before selection, each with its failure mode"],
    "weakest_link": "the single weakest remaining aspect, stated precisely rather than defended",
    "craft_risks": ["four or more concrete medium-specific craft failures that could make this look generic or synthetic"],
    "finishing_requirements": ["four or more concrete finishing requirements needed to make this release-grade"],
    "repair_before_production": []
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
      "audio": ${JSON.stringify(input.audio_contract.output_spec_audio)}
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

SUPPLIED ASSET IDS (${input.assets.length} assets, use exactly these):
${input.assets.map((asset) => asset.asset_id).join("\n")}

MANDATORY RULES
- Copy the supplied quality policy exactly.
- creative_review is your own accountable judgement of this direction and is required. dimensions must score every listed review dimension from 0 to 100. rejected_patterns, craft_risks and finishing_requirements each need four or more entries substantial enough to stand alone -- three is the floor below which the plan is invalid, not the standard. weakest_link names the weakest remaining aspect precisely instead of defending it.
- asset_manifest must contain exactly one entry for each id in SUPPLIED ASSET IDS, and no other entries. Copy those ids character for character.
- Every manifest entry except EXCLUDE must list in assignments the id of each deliverable it serves. A REFERENCE asset names the deliverable it informs, not nothing -- an empty assignments array is only valid for EXCLUDE.
- Never invent, guess, reformat or substitute an asset id. An id that is not in SUPPLIED ASSET IDS does not exist.
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

function sceneArchitecturePrompt({ basePlan, duration, range, assets, project, brief, audioContract }) {
  return `
You are Avantiqo's film director and narrative editor. Design the complete scene architecture
for the full temporal master. Return strict JSON only as {"scenes": [...]}.

MASTER DURATION: ${duration} seconds
SCENE COUNT: choose it from the story. Permitted ${range.minimum} to ${range.maximum}. For reference, an evenly cut film of this length would sit near ${range.reference} scenes -- that is a reference point, not a target, and matching it earns nothing.

STRUCTURE IS YOURS TO INVENT
- Decide the shape this specific story needs. One continuous unbroken take, three long movements, a rapid montage of fragments, a non-linear order, a repeating motif that returns changed, a single location that transforms, parallel threads that collide -- all of these are available and none is more correct than another.
- Do not produce the average film of this length. If the structure you return is the one anybody would default to for this duration, reject it and find the one this story actually needs.
- Justify the shape in each scene's objective and state change: the count you choose must be the consequence of the story, not of the running time.

THE DEVICE IS YOURS TO INVENT
- Shape alone is not imagination. Inside the shape, this work runs on a device: a mechanism it repeats or breaks that does something coverage cannot.
- Camera movement is not a device. A push-in, a pan, a track and an orbit are how a camera behaves, and describing one precisely is craft. A device is a rule the work obeys: a frame that refuses the subject until it is earned, a cut that lands on sound rather than picture, type that contradicts the image, an object that survives every cut, a colour that appears only when someone lies, a scale that is wrong on purpose, one unbroken sound holding unrelated pictures together, a transformation that cannot happen in life.
- Typography, effects and sound are instruments, not a finishing layer. If this work uses text, decide what the text does beyond naming things. If it uses none, decide that too. An effect may be invisible repair or may be the whole idea -- say which.
- The call to action is part of the work and has a form: performed on screen, spoken, typographic, an object, a sound, a held silence, something the audience does, or withheld. A card at the end is one option among many and never the default.
- Name what this brief would reach for by reflex, reject it, then apply the device only where it earns its place. A device on every shot is decoration and reads as noise -- plain shots are how the device stays legible.

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
- ${audioContract.architecture_rule}
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
  capabilityPairs,
  outstandingFailures = [],
}) {
  return `
You are Avantiqo's director, cinematographer, production designer, editor and sound director.
Create executable shot direction for one scene of a world-class temporal production.
Return strict JSON only as {"shots": [...]}.

${outstandingFailures.length ? `YOUR PREVIOUS ATTEMPT AT THIS SCENE WAS REJECTED. Fix every one of these and return the complete scene again:
${outstandingFailures.map((failure) => `- ${failure.path}: ${failure.message}`).join("\n")}

` : ""}SCENE INDEX: ${sceneIndex + 1}
SCENE: ${JSON.stringify(scene)}
SHOT COUNT: choose it from this scene's action. Permitted ${range.minimum} to ${range.maximum}, reference ${range.preferred}.
EXACT SHOT DURATION SUM: ${scene.duration_seconds} seconds
MASTER CONCEPT AND STORY: ${JSON.stringify({ concept: basePlan.concept, story: basePlan.story })}
MASTER OUTPUT SPEC: ${JSON.stringify(outputSpec)}
PRODUCTION CAPABILITIES YOU MAY PLAN AGAINST: ${JSON.stringify(capabilityPairs)}
AVAILABLE ASSETS: ${JSON.stringify(assets)}
SUPPLIED ASSET IDS (the only ids that exist -- ${assets.length} assets):
${assets.map((asset) => asset.asset_id).join("\n")}

Every shot must contain:
{
  "id": "stable unique shot id",
  "title": "specific shot title",
  "purpose": "new story information delivered by this shot",
  "device": "how this shot carries the signature device, or why it is deliberately plain",
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
    "type_behaviour": "what the type does beyond naming things, or why this shot carries none",
    "render_text_outside_generated_pixels": true
  },
  "vfx": {
    "effects": [],
    "cleanup": [],
    "compositing": [],
    "intent": "INVISIBLE_CREDIBILITY or THE_IDEA_ITSELF, and what the effect is for"
  },
  "transition_in": "specific editorial transition into the shot",
  "transition_out": "specific editorial transition out of the shot",
  "primary_source_asset_id": "exact asset id or null for a fully synthetic source-free shot",
  "reference_assets": [{
    "asset_id": "exact supplied asset id",
    "role": "PRIMARY_SOURCE|IDENTITY_REFERENCE|LOCATION_REFERENCE|CONTINUITY_REFERENCE|PRODUCT_REFERENCE|STYLE_REFERENCE|BRAND_REFERENCE|SUBJECT_REFERENCE|AUDIO_REFERENCE",
    "reason": "specific evidence-based reason this asset is required for this shot"
  }],
  "reference_asset_ids": [],
  "negative_constraints": ["what must not appear or happen in this shot, one entry per risk"],
  "known_failure_modes": ["how this specific shot is most likely to come out wrong"],
  "repair_instructions": ["what to change if this shot comes back wrong, one entry per failure mode"],
  "generation": {
    "required": true,
    "service": "one service id from PRODUCTION CAPABILITIES YOU MAY PLAN AGAINST",
    "capability": "a capability id offered by that same service",
    "output_spec": {
      "duration_seconds": "this shot's duration_seconds, the same number",
      "aspect_ratio": "inherit from MASTER OUTPUT SPEC",
      "resolution": "inherit from MASTER OUTPUT SPEC",
      "frame_rate": "inherit from MASTER OUTPUT SPEC"
    }
  }
}

MANDATORY RULES
- Shot duration sum must equal exactly ${scene.duration_seconds} seconds.
- Shot length is a story decision, not an average. Give each shot the time its action actually needs: a cut can land in one second for impact, and a held frame can run eight while a performance or expression changes. Do not divide the scene into equal parts.
- Choose how many shots this scene's story needs within the permitted range, and choose a number you can direct completely. Every shot requires its framing, lens intent, movement, lighting, production design, continuity, opening and closing frames and sound. A shot missing those is not a shot, and more half-specified shots are weaker work than fewer fully directed ones.
- Every shot must add new information and visibly advance this scene's state change.
- Describe opening frame, temporal progression and closing frame precisely.
- Specify camera, lighting, design, performance, continuity, sound, graphics, VFX and transitions.
- The concept declares a signature device. Decide each shot's part in it. "device" states what this shot does that coverage could not, or states that it is deliberately plain and what the plainness sets up. Do not restate the camera movement in "device" -- a push-in is camera behaviour, not a device. Most shots in a good film are plain; the device has to stay legible.
- Graphics and VFX are creative instruments here, not a caption layer and a cleanup pass. If type appears, decide what it does beyond naming things. If an effect appears, say whether it is invisible repair or the idea itself. Both may be empty for a shot that needs neither.
- Do not use the devices the concept lists as refused.
- Use only the ids in SUPPLIED ASSET IDS, copied character for character. An asset's payload also carries hashes, file names and technical values; none of those is its id, and a 64-character hash is never an asset id.
- generation.service and generation.capability must be one pair from PRODUCTION CAPABILITIES YOU MAY PLAN AGAINST. Never name a service or capability that is not listed there.
- generation.output_spec must be a populated object, never empty.
- generation.output_spec duration_seconds must equal this shot's duration_seconds exactly, and the remaining fields inherit from MASTER OUTPUT SPEC.
- negative_constraints, known_failure_modes and repair_instructions must each hold at least one real entry, specific to this shot. Never return them empty.
- State absence as a decision, never as a blank. "none", "N/A" and an empty string are rejected. A locked-off frame has no movement path, and the way to say so is to say it: "locked off on sticks, the frame does not move for the whole shot". A shot with no props says "no props, the bare room is the point". Absence is often the strongest choice available and this is how you make it, but it has to read as a choice rather than a gap.
- A shot that works through graphics or type rather than a camera -- a card, a title, an end frame -- does not need camera, lighting, production design or continuity, and must carry real graphics direction instead: what the type says, how it behaves, what it does. It still needs its sound and its opening and closing frames, because the track keeps playing across a card.
- reference_assets is the only authoritative shot-reference field and every entry must be a typed object.
- reference_asset_ids must always be an empty array in fresh direction output; it is legacy context only.
- Every shot using any uploaded source or reference must declare exactly one PRIMARY_SOURCE entry.
- primary_source_asset_id must exactly match that one PRIMARY_SOURCE entry.
- Fully synthetic source-free shots must use primary_source_asset_id null and reference_assets [].
- Never use PRIMARY_SOURCE for audio; soundtrack and audio evidence use AUDIO_REFERENCE.
- Use IDENTITY_REFERENCE only when the asset evidence contains a person or identity.
- Use LOCATION_REFERENCE only when the asset evidence contains a location or environment.
- Use PRODUCT_REFERENCE only when the asset evidence contains a product or physical item.
- Use BRAND_REFERENCE only when the asset evidence contains a logo, wordmark, signage or brand mark.
- CONTINUITY_REFERENCE, STYLE_REFERENCE and SUBJECT_REFERENCE are contextual references and never replace PRIMARY_SOURCE.
- Do not emit repair_version, legacy_repair_version or any metadata copied from an earlier plan.
- Do not populate provider source arrays such as source_asset_ids, image_urls, reference_images or asset_ids.
- Generated pixels must not be trusted for final logos, typography, subtitles or legal text.
- Do not emit prompts, provider prompts, negative prompts or provider parameters; the execution adapter derives vendor transport from this structured direction at the final boundary.
- That derivation has only this direction to work from, so it must be complete enough to execute without interpretation, and everything a negative prompt would carry belongs in negative_constraints as direction.
- Negative constraints and repair instructions are mandatory and specific.
- Avoid generic cinematic language, impossible camera movement, identity drift and synthetic texture.
`;
}

function normalizeShotCompatibility(shot = {}) {
  const framePlan = object(shot.frame_plan);
  const audio = object(shot.audio);
  const graphics = object(shot.graphics);
  const vfx = object(shot.vfx);

  // The generated output duration follows the directed duration, because the directed duration is not
  // the one the director wrote. Shot durations are rescaled to meet the scene exactly -- a director
  // asking for one second, one second and eight gets that ratio stretched across the real scene length --
  // and generation.output_spec.duration_seconds was left holding the original number. The validator then
  // reported SHOT_OUTPUT_DURATION_MISMATCH on every shot, correctly, because the plan was asking the
  // provider to render a different length from the one the edit was cut to.
  //
  // This happens on every film, since scene durations must sum exactly to the master. It accounted for
  // the shot output spec failures on the rejected full-song film.
  const generation = object(shot.generation);
  const directedDuration = finite(shot.duration_seconds);
  const synchronisedGeneration = directedDuration
    ? {
        ...generation,
        output_spec: {
          ...object(generation.output_spec),
          duration_seconds: directedDuration,
        },
      }
    : generation;

  return {
    ...shot,
    generation: synchronisedGeneration,
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
    assets: [],
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
    const audioContract =
      temporalAudioContract(project, brief);
    const qualityPolicy =
      qualityPolicyFor(project, brief);
    const normalizedAssets = list(assets).map(assetIdentity);
    // The shot skeleton used to name "ai.video.generate" literally, so every film planned against a
    // capability id written into the prompt rather than one this organization actually has. Resolve
    // the real list once and let the director choose from it.
    const { capabilities: productionCapabilities } =
      await availableProductionCapabilities(organization_id);
    const capabilityPairs = productionCapabilityPairs(productionCapabilities);
    if (!capabilityPairs.length) {
      throw new Error("CREATIVE_PRODUCTION_CAPABILITIES_REQUIRED");
    }
    const missionId = mission.id || mission.creative_mission_id || null;
    const executions = [];

    const baseInput = {
      mission,
      project,
      brief,
      assets: normalizedAssets,
      duration,
      duration_mode: audioContract.mode,
      exact_duration_required: true,
      audio_contract: audioContract,
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
        audioContract,
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

    // Each scene's shot direction is planned independently: shotPlanPrompt receives the base plan,
    // its own scene and the output spec, and never sees another scene's shots. Running them one
    // after another therefore bought nothing and cost everything -- a 205 second master is around
    // fifteen sequential calls, which is most of the fifty minutes a single film was taking to
    // produce direction with no media generated at all.
    //
    // They now run concurrently in bounded waves. Bounded rather than all at once because each call
    // can ask for up to 32,000 output tokens, and fifteen of those in flight together is a good way
    // to meet a provider rate limit and lose the film to throttling instead of latency.
    //
    // Scene order is reassembled by index, not by completion, because scene order is the film.
    async function planScene(scene, sceneIndex) {
      const shotRange = shotCountRange(scene.duration_seconds);
      let shots = [];
      let sceneFailure = null;
      let outstandingFailures = [];
      const results = [];

      // A single failing scene used to discard every scene planned before it. Each is retried once
      // on its own: a transient bad response costs one call rather than the whole film, and a scene
      // that fails twice still fails closed.
      for (let attempt = 1; attempt <= MAXIMUM_SCENE_SHOT_ATTEMPTS; attempt += 1) {
        try {
          const shotExecution = await executeReasoning({
            organization_id,
            operation: "TEMPORAL_SCENE_SHOT_DIRECTION_V1",
            missionId,
            projectId: project.id,
            prompt: shotPlanPrompt({
              basePlan,
              scene,
              sceneIndex,
              range: shotRange,
              assets: normalizedAssets,
              outputSpec,
              capabilityPairs,
              outstandingFailures,
            }),
            maxOutputTokens: shotCallTokenBudget(shotRange),
          });
          results.push(shotExecution.result);

          shots = ensureStableIds(shotExecution.output.shots, `${scene.id}-shot`);
          if (!shots.length) {
            sceneFailure = `CREATIVE_TEMPORAL_SCENE_SHOTS_REQUIRED:${scene.id}`;
            continue;
          }

          // Judge the scene on the rules the final validation will apply, against the same
          // normalisation it will see. "It returned some shots" was the entire test before, so a
          // scene of skeletal stubs passed here and surfaced as dozens of failures at assembly,
          // where two whole-plan repair calls had to fix every scene at once and could not.
          const candidate = allocateDurations(shots, scene.duration_seconds, 0.5)
            .map(normalizeShotCompatibility);
          outstandingFailures = creativeTemporalSceneShotFailures({
            shots: candidate,
            sceneIndex,
            quality: qualityPolicy,
            assets: normalizedAssets,
          });
          if (!outstandingFailures.length) {
            shots = candidate;
            break;
          }

          // The last attempt keeps its work. Incomplete direction is still worth more than none: the
          // whole-plan contract repair downstream can still fix a scene or two, and throwing here
          // would discard every other scene in the film.
          sceneFailure =
            `CREATIVE_TEMPORAL_SCENE_SHOTS_INCOMPLETE:${scene.id}:${outstandingFailures.length}_FAILURES`;
          shots = candidate;
        } catch (error) {
          // An unparseable or truncated response for one scene says nothing about the scenes that
          // already succeeded.
          sceneFailure = String(error?.message || error);
        }
      }

      if (!shots.length) {
        throw new Error(
          `CREATIVE_TEMPORAL_SCENE_SHOTS_REQUIRED:${scene.id}:${MAXIMUM_SCENE_SHOT_ATTEMPTS}_ATTEMPTS:${sceneFailure}`,
        );
      }

      return {
        sceneIndex,
        results,
        scene: {
          ...scene,
          shots,
        },
      };
    }

    const planned = [];
    for (let offset = 0; offset < scenes.length; offset += SCENE_SHOT_CONCURRENCY) {
      const wave = scenes
        .slice(offset, offset + SCENE_SHOT_CONCURRENCY)
        .map((scene, index) => planScene(scene, offset + index));
      planned.push(...(await Promise.all(wave)));
    }

    planned.sort((left, right) => left.sceneIndex - right.sceneIndex);
    for (const entry of planned) executions.push(...entry.results);
    const completedScenes = planned.map((entry) => entry.scene);

    let plan = {
      ...basePlan,
      workflow_kind: "TEMPORAL",
      scenes: completedScenes,
      quality: qualityPolicy,
      temporal_contract: {
        contract: audioContract.contract,
        duration_seconds: duration,
        duration_mode: audioContract.mode,
        timing_authority:
          audioContract.timing_authority,
        source_audio_required:
          audioContract.source_audio_required,
        original_music_required:
          !audioContract.source_audio_required,
        exact_duration_required: true,
        scene_duration_sum_must_equal_master: true,
        scene_duration_sum_must_equal_source:
          audioContract.source_audio_required,
        shot_duration_sum_must_equal_scene: true,
        audio_production_rule:
          audioContract.production_rule,
      },
    };
    // The temporal path had no contract repair at all. It builds a plan across a base
    // call, a scene architecture call and a shot plan call per scene, then asserted the
    // assembled result once and threw on any failure -- while the universal path got
    // two repair attempts. Every temporal case therefore died on its first
    // imperfection, and the imperfections were contract completeness rather than
    // creative quality: an explicit NOT_REQUIRED missing for a role that does not apply
    // to film, an absent concept.creative_system, a shot without an output_spec. A film
    // was lost to a missing role status.
    //
    // The repair targets the assembled plan rather than re-running the pipeline, so it
    // costs one call instead of many, and it follows the same discipline as the other
    // repair paths: merge onto what exists, validate the candidate, and adopt it only
    // if it is valid. A repair that fails is discarded and costs an attempt, never the
    // film.
    // Roles the registry says cannot apply to this medium are completed before validation rather than
    // demanded from the director.
    plan = applyDerivedRoleDecisions(plan, CREATIVE_AGENCY_ROLES);

    let validation;
    let plannedRepairs = 0;
    const rejectedRepairs = [];

    for (let attempt = 0; attempt <= MAXIMUM_CONTRACT_REPAIR_ATTEMPTS; attempt += 1) {
      try {
        validation = assertCreativeMasterPlan({
          plan,
          assets: normalizedAssets,
        });
        break;
      } catch (validationError) {
        if (attempt === MAXIMUM_CONTRACT_REPAIR_ATTEMPTS) {
          // The plan travels with the failure. A film is around fifteen calls of story, scene
          // architecture and shot direction, and rejecting it for two missing role statuses used to
          // discard all of it -- the work was gone and only the reason survived. Whoever reads this
          // failure can now read the film.
          validationError.rejected_plan = plan;
          throw validationError;
        }

        plannedRepairs += 1;
        const repair = await executeReasoning({
          organization_id,
          operation: "TEMPORAL_MASTER_PLAN_CONTRACT_REPAIR_V1",
          missionId: mission.id,
          projectId: project.id,
          maxOutputTokens: 20000,
          prompt: temporalContractRepairPrompt({
            plan,
            validationError,
            assets: normalizedAssets,
            attempt: plannedRepairs,
          }),
        });
        executions.push(repair.result);

        const candidate = mergeCreativeRepairedPlan(plan, repair.output);
        try {
          assertCreativeMasterPlan({ plan: candidate, assets: normalizedAssets });
        } catch (candidateError) {
          rejectedRepairs.push({
            attempt: plannedRepairs,
            reason: String(candidateError?.message || candidateError).slice(0, 300),
          });
          continue;
        }
        plan = candidate;
      }
    }

    const lastExecution = executions[executions.length - 1] || {};
    return {
      plan: {
        ...plan,
        degraded: false,
        release_blocked: false,
        validation,
      },
      validation,
      contract_repair: {
        executed: plannedRepairs > 0,
        attempts: plannedRepairs,
        maximum_attempts: MAXIMUM_CONTRACT_REPAIR_ATTEMPTS,
        rejected_repairs: rejectedRepairs,
      },
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

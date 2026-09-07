const CONTRACT = "AVANTIQO_HUMAN_PERFORMANCE_V1";

const HUMAN_TOKEN = /\b(?:person|people|human|woman|women|man|men|girl|boy|guest|customer|staff|waiter|waitress|server|chef|worker|employee|performer|actor|actress|musician|singer|technician|driver|owner|manager|couple|family|child|adult)\b/i;
const GENERIC_ONLY = /^(?:natural|authentic|cinematic|happy|smiling|smile|walk|walking|confident|casual|professional|neutral|reaction|emotional|relaxed|friendly|engaged|normal|realistic|subtle|organic|comfortable|premium)$/i;
const LOCOMOTION = /\b(?:walk|walking|run|running|step|steps|enter|enters|exit|exits|cross|crosses|approach|approaches|follow|follows|move|moves toward)\b/i;
const POSTURAL = /\b(?:sit|sits|stand|stands|rise|rises|kneel|kneels|crouch|crouches|bend|bends|lean|leans)\b/i;
const CONTACT = /\b(?:reach|reaches|grab|grabs|hold|holds|touch|touches|pick|picks|place|places|press|presses|pour|pours|open|opens|close|closes|use|uses|write|writes|cut|cuts|stir|stirs|hand|hands|give|gives|take|takes)\b/i;
const WEIGHTED = /\b(?:lift|lifts|carry|carries|drag|drags|push|pushes|pull|pulls)\b/i;
const VOCAL = /\b(?:speak|speaks|talk|talks|dialogue|say|says|sing|sings|singing)\b/i;
const REACTIVE = /\b(?:react|reacts|look|looks|listen|listens|nod|nods|smile|smiles|laugh|laughs|frown|frowns|glance|glances)\b/i;
const STILLNESS = /\b(?:remains? still|stays? still|motionless|does not move|no body movement|keeps? still|holds? still)\b/i;
const NO_CONTACT = /\b(?:no contact|without touching|does not touch|never touches|hands off|without contact)\b/i;
const HANDS_HIDDEN = /\b(?:hands? (?:are )?(?:not visible|out of frame|off frame|hidden|occluded throughout)|no hands? visible|crop(?:ped)? above the hands?)\b/i;
const FACE_DIRECTION = /\b(?:face|facial|expression|smile|frown|eyes?|gaze|look|glance|blink|mouth|jaw|brow)\b/i;
const FAST_CAMERA = /\b(?:fast|rapid|whip|aggressive|sprint|chase|fpv)\b/i;
const FULL_BODY = /\b(?:full[- ]?body|wide|long shot|full shot|head[- ]?to[- ]?toe)\b/i;
const UPPER_BODY = /\b(?:medium|mid shot|waist[- ]?up|chest[- ]?up)\b/i;
const FACE_HEAD = /\b(?:close[- ]?up|closeup|headshot|face|head and shoulders|extreme close)\b/i;
const DETAIL_HANDS = /\b(?:insert|detail|macro|hands?|hand close|object close)\b/i;
const VISUAL_TEMPORAL = /SHOT|MOTION_PLATE|VIDEO|TEMPORAL|KEYFRAME/i;

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value, limit = 2400) {
  return String(value ?? "").trim().slice(0, limit);
}

function upper(value) {
  return text(value, 220).toUpperCase();
}

function firstObject(...values) {
  for (const value of values) {
    const candidate = object(value);
    if (Object.keys(candidate).length) return candidate;
  }
  return {};
}

function firstText(...values) {
  for (const value of values) {
    const candidate = text(value);
    if (candidate) return candidate;
  }
  return "";
}

function firstValue(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && !value.length) continue;
    if (typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length) continue;
    return value;
  }
  return null;
}

function issue(code, field, message, severity = "blocking", evidence = null) {
  return { code, field, message, severity, evidence };
}

function source(input = {}) {
  const requirements = object(input.requirements);
  const intent = object(input.intent);
  const generation = object(input.generation);
  const metadata = object(input.metadata);
  const performanceContract = firstObject(
    input.performance_contract,
    requirements.performance_contract,
    intent.performance_contract,
    generation.performance_contract,
    metadata.performance_contract,
  );

  return {
    existing: firstObject(
      input.human_performance,
      requirements.human_performance,
      intent.human_performance,
      generation.human_performance,
      metadata.human_performance,
    ),
    subject: firstText(input.subject, requirements.subject, intent.subject, generation.subject, metadata.subject),
    purpose: firstText(input.purpose, requirements.purpose, intent.purpose, generation.purpose, metadata.purpose),
    action: firstText(input.action, requirements.action, intent.action, generation.action, metadata.action),
    performance: firstValue(
      input.performance_direction,
      input.performance,
      requirements.performance_direction,
      requirements.performance,
      intent.performance_direction,
      intent.performance,
      generation.performance_direction,
      generation.performance,
      metadata.performance_direction,
      metadata.performance,
    ),
    frame_plan: firstObject(input.frame_plan, requirements.frame_plan, intent.frame_plan, generation.frame_plan, metadata.frame_plan),
    camera: firstObject(input.camera, requirements.camera, intent.camera, generation.camera, metadata.camera),
    coverage: firstObject(input.coverage, requirements.coverage, intent.coverage, generation.coverage, metadata.coverage),
    continuity: firstObject(input.continuity, requirements.continuity, intent.continuity, generation.continuity, metadata.continuity),
    actors: firstValue(input.actors, requirements.actors, intent.actors, generation.actors, metadata.actors),
    performance_contract: performanceContract,
    identity_requirements: firstValue(
      input.identity_requirements,
      input.identity_lock,
      requirements.identity_requirements,
      requirements.identity_lock,
      intent.identity_requirements,
      generation.identity_requirements,
      generation.identity_lock,
      metadata.identity_requirements,
      metadata.identity_lock,
    ),
    output_spec: firstObject(input.output_spec, requirements.output_spec, intent.output_spec, generation.output_spec, metadata.output_spec),
    capability: firstText(input.capability, input.service_id, input.service_code, generation.capability, generation.service),
    node_type: upper(input.node_type || input.type || metadata.node_type),
  };
}

function performanceText(value) {
  if (typeof value === "string") return text(value);
  const candidate = object(value);
  return [
    candidate.direction,
    candidate.intent,
    candidate.behavior,
    candidate.micro_behavior,
    candidate.body,
    candidate.face,
    candidate.gaze,
    candidate.timing,
  ].map((item) => text(item, 900)).filter(Boolean).join(" | ");
}

function performerVisibleFalse(src) {
  const contract = object(src.performance_contract);
  return contract.performer_visible === false;
}

function humanApplicable(src) {
  if (Object.keys(src.existing).length) return true;
  if (performerVisibleFalse(src)) return false;
  const performanceContract = object(src.performance_contract);
  if (performanceContract.performer_visible === true) return true;
  if (src.identity_requirements) return true;
  if (Array.isArray(src.actors) ? src.actors.length : Boolean(src.actors)) return true;
  return HUMAN_TOKEN.test([
    src.subject,
    src.action,
    performanceText(src.performance),
  ].join(" "));
}

function temporalApplicable(src) {
  if (Object.keys(src.existing).length) return true;
  const capability = src.capability.toLowerCase();
  return capability.includes("video") ||
    VISUAL_TEMPORAL.test(src.node_type) ||
    Number(src.output_spec.duration_seconds || 0) > 0;
}

function classifyAction(action, performance) {
  const combined = `${text(action)} ${text(performance)}`;
  if (WEIGHTED.test(combined)) return "WEIGHTED_OBJECT";
  if (CONTACT.test(combined)) return "OBJECT_CONTACT";
  if (LOCOMOTION.test(combined)) return "LOCOMOTION";
  if (POSTURAL.test(combined)) return "POSTURAL_TRANSITION";
  if (VOCAL.test(combined)) return "VOCAL_PERFORMANCE";
  if (REACTIVE.test(combined)) return "REACTIVE_MICRO_BEHAVIOR";
  if (STILLNESS.test(combined)) return "STATIC_PERFORMANCE";
  return combined.trim() ? "GENERAL_PHYSICAL_ACTION" : "STATIC_PERFORMANCE";
}

function bodyVisibility(camera = {}) {
  const framing = [camera.framing, camera.camera_distance, camera.angle]
    .map((value) => text(value, 800)).join(" ");
  if (DETAIL_HANDS.test(framing)) return "DETAIL_OR_HANDS";
  if (FACE_HEAD.test(framing)) return "FACE_OR_HEAD";
  if (UPPER_BODY.test(framing)) return "UPPER_BODY";
  if (FULL_BODY.test(framing)) return "FULL_BODY";
  return "AS_FRAMED";
}

function continuityAnchors(continuity = {}) {
  return {
    identity: firstValue(continuity.identity, continuity.identity_anchor),
    wardrobe: firstValue(continuity.wardrobe, continuity.wardrobe_anchor),
    location: firstValue(continuity.location, continuity.location_anchor),
    screen_direction: firstValue(continuity.screen_direction, continuity.screen_direction_anchor),
    spatial_geography: firstValue(continuity.spatial_geography, continuity.spatial_relationships),
  };
}

function weightSupport(actionClass, action) {
  if (actionClass === "WEIGHTED_OBJECT") {
    return `Show believable load transfer and center-of-mass response throughout: ${text(action, 1200)}. Hands, shoulders, torso, stance and support leg must respond to the object's apparent weight; no weightless lifting, dragging or carrying.`;
  }
  if (actionClass === "LOCOMOTION") {
    return `Maintain plausible support-leg changes, foot planting and center-of-mass transfer through the locomotion: ${text(action, 1200)}. No foot sliding, hovering or impossible stride transitions.`;
  }
  if (actionClass === "POSTURAL_TRANSITION") {
    return `Make the postural transition physically supported: ${text(action, 1200)}. Hips, feet, torso and balance must move as one causal body system rather than snapping between poses.`;
  }
  return "Maintain believable balance, joint loading and body support for the canonical action; no floating, foot sliding or impossible weight transfer.";
}

function handBehavior(actionClass, action, visibility) {
  if (["OBJECT_CONTACT", "WEIGHTED_OBJECT"].includes(actionClass)) {
    return `Hands execute the canonical interaction ${text(action, 1200)} with stable finger count, grasp geometry, pressure/contact continuity and object ownership. Contact begins, persists and releases only when the action calls for it; no fused fingers, floating grip or hand teleportation. Body visibility: ${visibility}.`;
  }
  return "Hands remain anatomically coherent and causally connected to the body action. Preserve five-finger topology when visible, avoid idle decorative gesturing, and do not introduce object contact that the action did not specify.";
}

function contactInteraction(actionClass, action) {
  if (["OBJECT_CONTACT", "WEIGHTED_OBJECT"].includes(actionClass)) {
    return `Preserve continuous physical contact states for ${text(action, 1200)}: approach, first contact, load/grip, manipulation and release must happen in causal order. The contacted object may not teleport, duplicate, pass through the hand or change ownership without visible action.`;
  }
  return "No new person-object or person-person contact may be invented. Any incidental contact must remain physically plausible and must not alter the canonical story action.";
}

function headGaze(src, actionClass) {
  const coverage = object(src.coverage);
  const eyeline = firstText(coverage.eyeline, coverage.eyeline_target, coverage.eyeline_match_status);
  if (eyeline) return `Preserve the canonical eyeline relationship: ${eyeline}. Head turns and eye movement must lead or follow the action plausibly and may not drift into direct-to-camera eye contact unless explicitly directed.`;
  if (actionClass === "OBJECT_CONTACT" || actionClass === "WEIGHTED_OBJECT") {
    return "Gaze is action-directed toward the relevant interaction when necessary for believable coordination, then returns only if the canonical performance calls for it. Never invent direct-to-camera eye contact.";
  }
  return "Gaze and head movement must be motivated by the canonical action/performance. Do not invent direct-to-camera eye contact, random scanning or repeated head turns.";
}

function faceProgression(performance, framePlan) {
  const direction = performanceText(performance);
  const opening = text(framePlan.opening_frame, 900);
  const closing = text(framePlan.closing_frame, 900);
  return [
    direction ? `Honor the exact emotional and micro-behavior direction without replacing it with a stock smile: ${direction}` : "Keep facial behavior subordinate to the physical action; do not invent a smile, laugh, frown or exaggerated reaction.",
    opening ? `Opening facial/story state follows: ${opening}` : null,
    closing ? `Closing facial/story state follows: ${closing}` : null,
    "Expression changes must emerge through eyes, brow, jaw and mouth with continuous facial identity and without rubber-face morphing.",
  ].filter(Boolean).join(" ");
}

function poseTransition(src, actionClass) {
  const framePlan = object(src.frame_plan);
  return `Move continuously from the opening body state (${text(framePlan.opening_frame, 1000) || "canonical opening frame"}) through ${text(framePlan.progression, 1200) || text(src.action, 1200) || actionClass} into the closing body state (${text(framePlan.closing_frame, 1000) || "canonical closing frame"}). Preserve joint limits, balance and identity proportions; no pose snapping or limb interpolation artifacts.`;
}

function occlusionContinuity(src) {
  const anchors = continuityAnchors(src.continuity);
  return `Preserve limb topology, body proportions and identity through every self-occlusion and foreground occlusion. A hidden limb must reappear from the physically correct parent joint and side; no disappearing/reappearing limbs, side swaps, duplicate hands, detached fingers or body-part substitution. Continuity anchors: ${JSON.stringify(anchors)}.`;
}

function antiArtifacts(actionClass) {
  return [
    "No extra or missing limbs, duplicate hands, fused fingers, broken joints, body melting, identity morphing, face drift, foot sliding, body teleportation, impossible balance, object penetration or discontinuous contact.",
    ["OBJECT_CONTACT", "WEIGHTED_OBJECT"].includes(actionClass)
      ? "Reject any grasp, tool, prop or carried object that changes geometry, duplicates, floats, clips through the hand or breaks contact continuity."
      : null,
    "Do not replace directed micro-performance with generic smiling, posing, walking-in-place or decorative gestures.",
  ].filter(Boolean);
}

function providerExecutionOrder(contract) {
  return [
    { stage: "IDENTITY_BASELINE", identity_continuity: contract.continuity_anchors?.identity || null, body_visibility: contract.body_visibility },
    { stage: "STAGING_BODY_ORIENTATION", body_orientation: contract.body_orientation, entry_state: contract.entry_state, exit_state: contract.exit_state },
    { stage: "WEIGHT_SUPPORT_ACTION", physical_action: contract.physical_action, weight_and_support: contract.weight_and_support, pose_transition: contract.pose_transition },
    { stage: "HAND_OBJECT_CONTACT", hand_behavior: contract.hand_behavior, contact_and_interaction: contract.contact_and_interaction },
    { stage: "HEAD_GAZE", head_and_gaze: contract.head_and_gaze },
    { stage: "FACIAL_EXPRESSION_MICRO_BEHAVIOR", facial_expression_progression: contract.facial_expression_progression, performance_timing: contract.performance_timing },
    { stage: "OCCLUSION_LIMB_CONTINUITY", occlusion_and_limb_continuity: contract.occlusion_and_limb_continuity },
    { stage: "ENTRY_EXIT_CONTINUITY", entry_state: contract.entry_state, action_progression: contract.action_progression, exit_state: contract.exit_state, continuity_anchors: contract.continuity_anchors },
  ];
}

function canonicalStates(src) {
  const framePlan = object(src.frame_plan);
  return {
    entry_state: firstText(framePlan.opening_frame, framePlan.opening_state, framePlan.start),
    action_progression: firstText(framePlan.progression, framePlan.visible_progression, framePlan.middle, src.action),
    exit_state: firstText(framePlan.closing_frame, framePlan.closing_state, framePlan.end),
  };
}

function authorContract(src, executionPhase = "TEMPORAL_SHOT") {
  const performance = performanceText(src.performance);
  const actionClass = classifyAction(src.action, performance);
  const visibility = bodyVisibility(src.camera);
  const states = canonicalStates(src);
  const contract = {
    contract: CONTRACT,
    performance_intent: firstText(performance, src.purpose),
    physical_action: src.action,
    action_class: actionClass,
    body_visibility: visibility,
    entry_state: states.entry_state,
    action_progression: states.action_progression,
    exit_state: states.exit_state,
    body_orientation: firstText(src.coverage.body_orientation, src.continuity.body_orientation, src.camera.angle, "Preserve the canonical screen-side and body orientation established by the shot composition."),
    weight_and_support: weightSupport(actionClass, src.action),
    hand_behavior: handBehavior(actionClass, src.action, visibility),
    contact_and_interaction: contactInteraction(actionClass, src.action),
    head_and_gaze: headGaze(src, actionClass),
    facial_expression_progression: faceProgression(src.performance, src.frame_plan),
    pose_transition: poseTransition(src, actionClass),
    occlusion_and_limb_continuity: occlusionContinuity(src),
    continuity_anchors: continuityAnchors(src.continuity),
    movement_motivation: firstText(src.purpose, `The physical action is required to execute the canonical story beat: ${src.action}`),
    performance_timing: firstText(src.performance_contract.timing, src.performance_contract.performance_timing, src.frame_plan.timing, `Complete the canonical action within the shot duration without looping or rushing the final state.`),
    anti_artifact_constraints: antiArtifacts(actionClass),
    execution_phase: executionPhase,
    provider_neutral: true,
    provider_prompt_persisted: false,
  };
  contract.provider_execution_order = providerExecutionOrder(contract);
  return contract;
}

function validateContract(contract, src, { authored = false } = {}) {
  const issues = [];
  const warnings = [];
  const required = [
    "performance_intent",
    "physical_action",
    "action_class",
    "body_visibility",
    "entry_state",
    "action_progression",
    "exit_state",
    "body_orientation",
    "weight_and_support",
    "hand_behavior",
    "contact_and_interaction",
    "head_and_gaze",
    "facial_expression_progression",
    "pose_transition",
    "occlusion_and_limb_continuity",
    "movement_motivation",
    "performance_timing",
  ];

  if (!Object.keys(contract).length) {
    issues.push(issue("HUMAN_PERFORMANCE_CONTRACT_REQUIRED", "human_performance", "A human temporal performance requires a pre-authored physical performance contract before generation."));
    return { issues, warnings };
  }

  if (text(contract.contract) !== CONTRACT) {
    issues.push(issue("HUMAN_PERFORMANCE_CONTRACT_INVALID", "human_performance.contract", `Human performance contract must be ${CONTRACT}.`, "blocking", contract.contract || null));
  }

  for (const field of required) {
    if (!firstValue(contract[field])) {
      issues.push(issue(
        field === "physical_action" ? "HUMAN_PERFORMANCE_ACTION_REQUIRED" :
          ["entry_state", "action_progression", "exit_state"].includes(field) ? "HUMAN_PERFORMANCE_TEMPORAL_STATE_REQUIRED" :
          field === "movement_motivation" ? "HUMAN_PERFORMANCE_MOVEMENT_MOTIVATION_REQUIRED" :
          "HUMAN_PERFORMANCE_DIRECTION_REQUIRED",
        `human_performance.${field}`,
        `World-class human performance requires ${field}.`,
      ));
    }
  }

  const intent = text(contract.performance_intent, 1600);
  if (intent && GENERIC_ONLY.test(intent)) {
    issues.push(issue("HUMAN_PERFORMANCE_DIRECTION_GENERIC", "human_performance.performance_intent", "Human performance must specify observable micro-behavior, body action and timing rather than a generic acting adjective or stock action.", "blocking", intent));
  }

  const combined = [contract.physical_action, intent].map((value) => text(value, 1800)).join(" ");
  if (LOCOMOTION.test(combined) && STILLNESS.test(combined)) {
    issues.push(issue("HUMAN_PERFORMANCE_STILLNESS_LOCOMOTION_CONTRADICTION", "human_performance.physical_action", "The performance cannot require locomotion while also directing the performer to remain physically still.", "blocking", combined));
  }
  if (CONTACT.test(combined) && NO_CONTACT.test(combined)) {
    issues.push(issue("HUMAN_PERFORMANCE_CONTACT_CONTRADICTION", "human_performance.contact_and_interaction", "The canonical action requires contact but the performance direction simultaneously forbids contact.", "blocking", combined));
  }
  if (CONTACT.test(combined) && HANDS_HIDDEN.test([contract.body_visibility, contract.hand_behavior, combined].join(" "))) {
    issues.push(issue("HUMAN_PERFORMANCE_HAND_VISIBILITY_CONTRADICTION", "human_performance.hand_behavior", "A hand/object interaction cannot be verified when the contract explicitly keeps the hands unavailable for the interaction.", "blocking"));
  }

  const anchors = object(contract.continuity_anchors);
  if (!Object.keys(anchors).length) {
    issues.push(issue("HUMAN_PERFORMANCE_CONTINUITY_REQUIRED", "human_performance.continuity_anchors", "Human performance requires explicit continuity anchors, even when some individual anchor values are null."));
  }

  if (!Array.isArray(contract.anti_artifact_constraints) || !contract.anti_artifact_constraints.length) {
    issues.push(issue("HUMAN_PERFORMANCE_CONTRACT_INVALID", "human_performance.anti_artifact_constraints", "Human performance requires explicit anatomy, motion and interaction failure constraints."));
  }
  if (!Array.isArray(contract.provider_execution_order) || contract.provider_execution_order.length !== 8) {
    issues.push(issue("HUMAN_PERFORMANCE_CONTRACT_INVALID", "human_performance.provider_execution_order", "Human performance requires the canonical eight-stage execution order."));
  }
  if (contract.provider_neutral !== true || contract.provider_prompt_persisted !== false) {
    issues.push(issue("HUMAN_PERFORMANCE_CONTRACT_INVALID", "human_performance.provider_neutral", "Human performance direction must remain provider-neutral and may not persist provider prompts."));
  }

  const actionOperations = combined.match(/\b(?:walk|run|step|sit|stand|reach|grab|hold|touch|pick|place|press|pour|open|close|write|cut|stir|lift|carry|drag|push|pull|turn|nod|smile|laugh|look|glance)\b/gi) || [];
  if (new Set(actionOperations.map((value) => value.toLowerCase())).size > 5) {
    warnings.push(issue("HUMAN_PERFORMANCE_GESTURE_OVERLOAD", "human_performance.physical_action", "The shot asks one performer to execute too many distinct physical operations. Consider simplifying the action so performance and anatomy remain readable.", "warning", actionOperations));
  }

  const cameraMotion = [src.camera.movement_path, src.camera.movement_speed].map((value) => text(value, 1200)).join(" ");
  if (CONTACT.test(combined) && FAST_CAMERA.test(cameraMotion) && ["FULL_BODY", "AS_FRAMED"].includes(text(contract.body_visibility))) {
    warnings.push(issue("HUMAN_PERFORMANCE_CONTACT_CAMERA_COMPLEXITY", "human_performance.contact_and_interaction", "Fast camera motion combined with full-body contact choreography increases hand, contact and anatomy failure risk.", "warning", cameraMotion));
  }

  const framing = [src.camera.framing, src.camera.camera_distance].map((value) => text(value, 900)).join(" ");
  if (FACE_DIRECTION.test(intent) && (FULL_BODY.test(framing) || /extreme wide|very wide/i.test(framing))) {
    warnings.push(issue("HUMAN_PERFORMANCE_FACE_READABILITY_RISK", "human_performance.facial_expression_progression", "The performance depends on facial micro-behavior while the canonical framing may not make the face readable.", "warning", framing));
  }

  if (authored && !text(src.action)) {
    issues.push(issue("HUMAN_PERFORMANCE_ACTION_REQUIRED", "action", "The canonical shot must define a visible human action before physical performance can be authored."));
  }

  return { issues, warnings };
}

function result(status, contract = null, blockingIssues = [], warnings = [], reason = null) {
  return {
    contract: CONTRACT,
    status,
    reason,
    human_performance: contract,
    execution_contract: contract,
    blocking_issues: blockingIssues,
    warnings,
    provider_neutral: true,
  };
}

export function authorCreativeHumanPerformance(input = {}) {
  const src = source(input);
  const applicable = humanApplicable(src) && temporalApplicable(src);
  if (!applicable) return result("NOT_APPLICABLE", null, [], [], "NO_TEMPORAL_HUMAN_PERFORMANCE_REQUIRED");

  if (Object.keys(src.existing).length) {
    const verified = validateContract(src.existing, src);
    const blocking = verified.issues.filter((item) => item.severity === "blocking");
    return result(blocking.length ? "BLOCKED" : "READY", src.existing, blocking, verified.warnings);
  }

  const direction = performanceText(src.performance);
  const preIssues = [];
  if (!direction) {
    preIssues.push(issue("HUMAN_PERFORMANCE_DIRECTION_REQUIRED", "performance", "A temporal human shot requires observable performance direction before physical choreography can be authored."));
  } else if (GENERIC_ONLY.test(direction)) {
    preIssues.push(issue("HUMAN_PERFORMANCE_DIRECTION_GENERIC", "performance", "Replace generic acting direction with observable body action, gaze, timing and micro-behavior.", "blocking", direction));
  }
  if (!text(src.action)) {
    preIssues.push(issue("HUMAN_PERFORMANCE_ACTION_REQUIRED", "action", "A temporal human shot requires a visible causal action before generation."));
  }
  if (preIssues.length) return result("BLOCKED", null, preIssues, []);

  const contract = authorContract(src, text(input.execution_phase) || "TEMPORAL_SHOT");
  const checked = validateContract(contract, src, { authored: true });
  const blocking = checked.issues.filter((item) => item.severity === "blocking");
  return result(blocking.length ? "BLOCKED" : "READY", contract, blocking, checked.warnings);
}

export function verifyCreativeHumanPerformance(input = {}) {
  const src = source(input);
  const applicable = humanApplicable(src) && temporalApplicable(src);
  if (!applicable) return result("NOT_APPLICABLE", null, [], [], "NO_TEMPORAL_HUMAN_PERFORMANCE_REQUIRED");
  if (!Object.keys(src.existing).length) {
    return result("BLOCKED", null, [issue("HUMAN_PERFORMANCE_CONTRACT_REQUIRED", "human_performance", "Execution may not author human performance. A pre-authored contract is required before provider dispatch.")], []);
  }
  const checked = validateContract(src.existing, src);
  const blocking = checked.issues.filter((item) => item.severity === "blocking");
  return result(blocking.length ? "BLOCKED" : "READY", src.existing, blocking, checked.warnings);
}

export function assertCreativeHumanPerformance(input = {}) {
  const verified = verifyCreativeHumanPerformance(input);
  if (verified.status === "BLOCKED") {
    const codes = verified.blocking_issues.map((item) => item.code).join(",");
    throw new Error(`CREATIVE_HUMAN_PERFORMANCE_BLOCKED:${codes}`);
  }
  return verified;
}

export const CreativeHumanPerformanceRuntime = Object.freeze({
  author: authorCreativeHumanPerformance,
  verify: verifyCreativeHumanPerformance,
  assertReady: assertCreativeHumanPerformance,
  contract: CONTRACT,
  provider_neutral: true,
});

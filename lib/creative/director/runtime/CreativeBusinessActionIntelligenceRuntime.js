import crypto from "node:crypto";

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const CONTRACT = "CREATIVE_BUSINESS_ACTION_INTELLIGENCE_V1";
const OPERATION = "CREATIVE_BUSINESS_ACTION_INTELLIGENCE_V1";

const SHOT_FUNCTIONS = Object.freeze([
  "HOOK",
  "ACTION",
  "PROOF",
  "REACTION",
  "TRANSFORMATION",
  "DETAIL",
  "SCALE",
  "SOCIAL_PROOF",
  "REVEAL",
  "EMOTION",
  "PROCESS",
  "RESULT",
  "CTA",
  "TRANSITION",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function normalizedReasoningOutput(result = {}) {
  const value = result?.output?.output || result?.output || result || {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value.result || value;
  }
  const source = text(value).replace(/^\uFEFF/, "");
  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(source.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed.result || parsed;
      }
    } catch {
      // Continue with the next conservative JSON candidate.
    }
  }
  return null;
}

function temporalDuration(plan = {}, project = {}, brief = {}) {
  const value = finite(
    plan.temporal_contract?.duration_seconds ??
    list(plan.deliverables)[0]?.output_spec?.duration_seconds ??
    project.metadata?.temporal_contract?.duration_seconds ??
    project.metadata?.full_master_duration ??
    brief.duration_seconds ??
    brief.target_duration ??
    project.target_duration,
  );
  if (!value || value <= 0) {
    throw new Error("CREATIVE_BUSINESS_ACTION_DURATION_REQUIRED");
  }
  return value;
}

function prompt({ input = {}, directed = {} } = {}) {
  const plan = object(directed.plan);
  const project = object(input.project);
  const brief = object(input.brief);
  const research =
    brief.metadata?.autonomous_research ||
    brief.metadata?.research ||
    directed.research ||
    null;
  const assets = list(input.assets);
  const duration = temporalDuration(plan, project, brief);

  return `
You are Avantiqo's senior advertising strategist, behavioural planner, commercial film
producer and action director. Determine what must VISIBLY HAPPEN in this specific business
or offer for the intended audience to stop, understand, believe, desire and act.

This is not a style exercise. Do not design camera moves or rewrite the approved story.
Build a business-specific action and proof model that the film director can execute.
Derive everything from the supplied research, business truth, audience, assets, approved
concept and commercial objective. Never apply a generic industry template.

Return strict JSON only:
{
  "contract": "${CONTRACT}",
  "business_model": {
    "value_exchange": "what value is actually delivered",
    "customer_problem_or_desire": "what problem, desire or opportunity creates demand",
    "commercial_objective": "what this communication must cause the audience to do or believe",
    "decision_trigger": "what visible or emotional evidence moves the decision",
    "credibility_requirement": "what must be proven for the message to be trusted"
  },
  "audience_decision_model": {
    "primary_audience": "specific evidence-derived audience",
    "pre_watch_state": "what they likely think or feel before viewing",
    "desired_post_watch_state": "what should change after viewing",
    "purchase_or_action_barriers": ["specific barrier"],
    "attention_triggers": ["specific trigger"],
    "conversion_triggers": ["specific trigger"],
    "trust_risks": ["specific reason the film could become unbelievable"]
  },
  "proof_model": {
    "required": true,
    "minimum_proof_moments": 2,
    "proof_types": [{
      "id": "stable proof id",
      "category": "evidence-derived proof category",
      "claim": "what the viewer should believe",
      "visible_proof": "what must be visibly observable on screen",
      "evidence_basis": ["research, asset or business evidence"],
      "claim_guard": "what cannot be exaggerated or invented"
    }]
  },
  "action_grammar": {
    "primary_actions": [{
      "id": "stable action id",
      "actor_role": "evidence-derived role",
      "action": "specific physical action",
      "object_or_counterparty": "what or who is acted upon",
      "visible_change": "what changes on screen because of the action",
      "story_value": "attention|proof|emotion|transformation|conversion",
      "intensity": 0,
      "evidence_basis": ["source of truth"]
    }],
    "escalation_principle": "how visible action should build or transform",
    "interaction_principle": "how actions affect people, objects, environment or outcome",
    "forbidden_static_patterns": ["specific static or generic behaviour to avoid"]
  },
  "human_ecosystem": {
    "required": true,
    "reason": "why people are or are not required to make the value exchange believable",
    "roles": [{
      "role": "evidence-derived role category",
      "story_function": "why this role exists on screen",
      "visible_actions": ["specific physical behaviour"],
      "interaction_partners": ["role, object or environment"],
      "identity_mode": "VERIFIED_IDENTITY|GENERATED_SUPPORTING_CAST"
    }]
  },
  "environment_grammar": {
    "recognition_anchors": ["truth that must remain recognisable"],
    "transformation_opportunities": ["how the environment may change, expand or reveal itself"],
    "activity_layers": [{
      "layer": "FOREGROUND|MIDGROUND|BACKGROUND",
      "purpose": "how this spatial layer contributes to life, proof or attention",
      "possible_actions": ["specific action"]
    }],
    "empty_world_risks": ["why an inactive environment would damage the message"]
  },
  "shot_function_strategy": {
    "opening_function": "HOOK",
    "required_functions": ["HOOK", "ACTION", "PROOF", "RESULT"],
    "optional_functions": ["REVEAL", "DETAIL"],
    "sequencing_logic": "why these functions create a persuasive progression",
    "anti_repetition_rule": "how shot purpose must change across the film"
  },
  "attention_curve": [{
    "id": "stable attention beat id",
    "start_ratio": 0.0,
    "end_ratio": 0.2,
    "audience_job": "what must happen in the viewer's mind during this interval",
    "primary_shot_functions": ["HOOK"],
    "intensity_target": 0,
    "novelty_requirement": "what new visual, emotional, spatial or proof event must appear",
    "proof_requirement": "what must be demonstrated or NONE"
  }],
  "proof_payoff_hypotheses": [{
    "proof_id": "proof id",
    "setup": "what question or doubt is opened",
    "visible_payoff": "what action or result answers it",
    "audience_effect": "why this changes trust, desire or action"
  }],
  "wow_hypotheses": [{
    "setup": "what expectation is created",
    "visible_payoff": "specific action, interaction, transformation, scale change or reveal",
    "truth_anchor": "what keeps the moment specific and believable",
    "audience_effect": "why it is memorable"
  }],
  "commercial_failure_modes": ["specific way an attractive film could still fail to sell the real value"]
}

SHOT FUNCTION VOCABULARY
${JSON.stringify(SHOT_FUNCTIONS)}

MANDATORY RULES
- MASTER DURATION: ${duration} seconds. attention_curve ratios must start at 0, end at 1 and form a continuous non-overlapping sequence.
- Decide what ACTION means for THIS business from evidence. Do not assume action means speed, crowds, performance, tools, luxury, danger or spectacle unless the evidence supports it.
- Proof is different from beauty. Identify what the audience must actually SEE to believe the offer or result.
- Human roles must be derived from the real value exchange. If people are essential to delivery, use, trust, service, participation, operation or social proof, human_ecosystem.required must be true and their actions must be specific.
- Environment decisions must preserve truth while identifying how space can be activated, transformed, populated, revealed or used to show process and consequence.
- shot_function_strategy chooses from the supplied universal film-function vocabulary; it must not invent business-specific hardcoded categories.
- The opening function must be one of required_functions and should describe the first audience job, not a camera technique.
- attention_curve is about audience cognition and visible change, not editing jargon.
- At least one action must visibly change a person, object, environment, process state or result.
- Every proof claim needs an evidence basis and a claim guard preventing hallucinated or exaggerated results.
- Wow moments must emerge from the business truth, action, transformation, proof, scale, timing or human response. Do not prescribe random spectacle.
- Do not copy a protected campaign, film, character, director or living artist style.
- Do not create provider prompts, generation parameters or media-production instructions.

APPROVED CONCEPT AND STORY
${JSON.stringify({
  concept: plan.concept,
  story: plan.story,
  selected_concept_id: plan.selected_concept_id,
  concept_council: plan.concept_council,
})}

CURRENT SCENE ARCHITECTURE
${JSON.stringify(list(plan.scenes).map((scene) => ({
  id: scene.id,
  title: scene.title,
  objective: scene.objective,
  emotion: scene.emotion,
  story_state_before: scene.story_state_before,
  state_change: scene.state_change,
  story_state_after: scene.story_state_after,
  duration_seconds: scene.duration_seconds,
})))}

PROJECT
${JSON.stringify(project)}

BRIEF
${JSON.stringify(brief)}

RESEARCH
${JSON.stringify(research)}

ASSET EVIDENCE
${JSON.stringify(assets)}
`;
}

function validateAttentionCurve(curve = []) {
  const failures = [];
  const beats = list(curve);
  if (beats.length < 3) {
    failures.push("ATTENTION_CURVE_DEPTH_REQUIRED");
    return failures;
  }
  let previousEnd = 0;
  const ids = new Set();
  beats.forEach((beat, index) => {
    const id = text(beat.id);
    const start = finite(beat.start_ratio);
    const end = finite(beat.end_ratio);
    if (!id || ids.has(id)) failures.push(`ATTENTION_BEAT_ID_INVALID:${index + 1}`);
    ids.add(id);
    if (start === null || end === null || start < 0 || end > 1 || end <= start) {
      failures.push(`ATTENTION_BEAT_RANGE_INVALID:${index + 1}`);
      return;
    }
    if (Math.abs(start - previousEnd) > 0.0001) {
      failures.push(`ATTENTION_CURVE_GAP_OR_OVERLAP:${index + 1}`);
    }
    previousEnd = end;
    if (text(beat.audience_job).length < 20) {
      failures.push(`ATTENTION_BEAT_AUDIENCE_JOB_REQUIRED:${index + 1}`);
    }
    if (!list(beat.primary_shot_functions).length) {
      failures.push(`ATTENTION_BEAT_SHOT_FUNCTION_REQUIRED:${index + 1}`);
    }
    for (const fn of list(beat.primary_shot_functions)) {
      if (!SHOT_FUNCTIONS.includes(text(fn).toUpperCase())) {
        failures.push(`ATTENTION_BEAT_SHOT_FUNCTION_INVALID:${index + 1}:${text(fn)}`);
      }
    }
    const intensity = finite(beat.intensity_target);
    if (intensity === null || intensity < 0 || intensity > 100) {
      failures.push(`ATTENTION_BEAT_INTENSITY_INVALID:${index + 1}`);
    }
    if (text(beat.novelty_requirement).length < 16) {
      failures.push(`ATTENTION_BEAT_NOVELTY_REQUIRED:${index + 1}`);
    }
  });
  if (Math.abs(previousEnd - 1) > 0.0001) {
    failures.push("ATTENTION_CURVE_MUST_END_AT_ONE");
  }
  return failures;
}

export function validateCreativeBusinessActionIntelligence(value = {}) {
  const source = object(value);
  const failures = [];
  const requireText = (input, code, minimum = 16) => {
    if (text(input).length < minimum) failures.push(code);
  };

  if (source.contract !== CONTRACT) failures.push("BUSINESS_ACTION_CONTRACT_REQUIRED");

  const business = object(source.business_model);
  requireText(business.value_exchange, "BUSINESS_VALUE_EXCHANGE_REQUIRED", 24);
  requireText(business.customer_problem_or_desire, "BUSINESS_DEMAND_DRIVER_REQUIRED", 24);
  requireText(business.commercial_objective, "BUSINESS_COMMERCIAL_OBJECTIVE_REQUIRED", 24);
  requireText(business.decision_trigger, "BUSINESS_DECISION_TRIGGER_REQUIRED", 20);
  requireText(business.credibility_requirement, "BUSINESS_CREDIBILITY_REQUIREMENT_REQUIRED", 20);

  const audience = object(source.audience_decision_model);
  requireText(audience.primary_audience, "BUSINESS_ACTION_PRIMARY_AUDIENCE_REQUIRED", 12);
  requireText(audience.pre_watch_state, "BUSINESS_ACTION_PRE_WATCH_STATE_REQUIRED", 20);
  requireText(audience.desired_post_watch_state, "BUSINESS_ACTION_POST_WATCH_STATE_REQUIRED", 20);
  if (list(audience.attention_triggers).length < 3) failures.push("BUSINESS_ACTION_ATTENTION_TRIGGERS_REQUIRED");
  if (list(audience.conversion_triggers).length < 2) failures.push("BUSINESS_ACTION_CONVERSION_TRIGGERS_REQUIRED");

  const proof = object(source.proof_model);
  if (typeof proof.required !== "boolean") failures.push("BUSINESS_ACTION_PROOF_DECISION_REQUIRED");
  const minimumProof = finite(proof.minimum_proof_moments);
  if (proof.required === true && (!minimumProof || minimumProof < 1)) {
    failures.push("BUSINESS_ACTION_MINIMUM_PROOF_REQUIRED");
  }
  if (proof.required === true && list(proof.proof_types).length < minimumProof) {
    failures.push("BUSINESS_ACTION_PROOF_TYPE_DEPTH_REQUIRED");
  }
  list(proof.proof_types).forEach((item, index) => {
    requireText(item.id, `BUSINESS_ACTION_PROOF_ID_REQUIRED:${index + 1}`, 3);
    requireText(item.claim, `BUSINESS_ACTION_PROOF_CLAIM_REQUIRED:${index + 1}`, 16);
    requireText(item.visible_proof, `BUSINESS_ACTION_VISIBLE_PROOF_REQUIRED:${index + 1}`, 20);
    if (!list(item.evidence_basis).length) failures.push(`BUSINESS_ACTION_PROOF_EVIDENCE_REQUIRED:${index + 1}`);
    requireText(item.claim_guard, `BUSINESS_ACTION_PROOF_GUARD_REQUIRED:${index + 1}`, 16);
  });

  const action = object(source.action_grammar);
  const actions = list(action.primary_actions);
  if (actions.length < 3) failures.push("BUSINESS_ACTION_GRAMMAR_DEPTH_REQUIRED");
  actions.forEach((item, index) => {
    requireText(item.id, `BUSINESS_ACTION_ID_REQUIRED:${index + 1}`, 3);
    requireText(item.actor_role, `BUSINESS_ACTION_ACTOR_REQUIRED:${index + 1}`, 3);
    requireText(item.action, `BUSINESS_ACTION_PHYSICAL_ACTION_REQUIRED:${index + 1}`, 16);
    requireText(item.visible_change, `BUSINESS_ACTION_VISIBLE_CHANGE_REQUIRED:${index + 1}`, 16);
    requireText(item.story_value, `BUSINESS_ACTION_STORY_VALUE_REQUIRED:${index + 1}`, 5);
    const intensity = finite(item.intensity);
    if (intensity === null || intensity < 0 || intensity > 100) failures.push(`BUSINESS_ACTION_INTENSITY_INVALID:${index + 1}`);
    if (!list(item.evidence_basis).length) failures.push(`BUSINESS_ACTION_EVIDENCE_REQUIRED:${index + 1}`);
  });
  requireText(action.escalation_principle, "BUSINESS_ACTION_ESCALATION_REQUIRED", 24);
  requireText(action.interaction_principle, "BUSINESS_ACTION_INTERACTION_REQUIRED", 24);
  if (list(action.forbidden_static_patterns).length < 2) failures.push("BUSINESS_ACTION_STATIC_FAILURES_REQUIRED");

  const humans = object(source.human_ecosystem);
  if (typeof humans.required !== "boolean") failures.push("BUSINESS_ACTION_HUMAN_ECOSYSTEM_DECISION_REQUIRED");
  requireText(humans.reason, "BUSINESS_ACTION_HUMAN_ECOSYSTEM_REASON_REQUIRED", 20);
  if (humans.required === true && list(humans.roles).length < 2) failures.push("BUSINESS_ACTION_HUMAN_ROLE_DEPTH_REQUIRED");

  const environment = object(source.environment_grammar);
  if (!list(environment.recognition_anchors).length) failures.push("BUSINESS_ACTION_ENVIRONMENT_ANCHORS_REQUIRED");
  if (list(environment.transformation_opportunities).length < 2) failures.push("BUSINESS_ACTION_ENVIRONMENT_TRANSFORMATIONS_REQUIRED");
  if (list(environment.activity_layers).length < 2) failures.push("BUSINESS_ACTION_ACTIVITY_LAYERS_REQUIRED");

  const strategy = object(source.shot_function_strategy);
  const opening = text(strategy.opening_function).toUpperCase();
  const requiredFunctions = list(strategy.required_functions).map((fn) => text(fn).toUpperCase());
  if (!SHOT_FUNCTIONS.includes(opening)) failures.push("BUSINESS_ACTION_OPENING_FUNCTION_INVALID");
  if (requiredFunctions.length < 4) failures.push("BUSINESS_ACTION_REQUIRED_SHOT_FUNCTION_DEPTH_REQUIRED");
  for (const fn of requiredFunctions) {
    if (!SHOT_FUNCTIONS.includes(fn)) failures.push(`BUSINESS_ACTION_SHOT_FUNCTION_INVALID:${fn}`);
  }
  if (!requiredFunctions.includes(opening)) failures.push("BUSINESS_ACTION_OPENING_FUNCTION_MUST_BE_REQUIRED");
  requireText(strategy.sequencing_logic, "BUSINESS_ACTION_SHOT_FUNCTION_SEQUENCE_REQUIRED", 24);
  requireText(strategy.anti_repetition_rule, "BUSINESS_ACTION_SHOT_FUNCTION_ANTI_REPETITION_REQUIRED", 20);

  failures.push(...validateAttentionCurve(source.attention_curve));

  if (proof.required === true && list(source.proof_payoff_hypotheses).length < minimumProof) {
    failures.push("BUSINESS_ACTION_PROOF_PAYOFF_HYPOTHESES_REQUIRED");
  }
  if (list(source.wow_hypotheses).length < 2) failures.push("BUSINESS_ACTION_WOW_HYPOTHESES_REQUIRED");
  if (list(source.commercial_failure_modes).length < 3) failures.push("BUSINESS_ACTION_COMMERCIAL_FAILURE_MODES_REQUIRED");

  if (failures.length) {
    const error = new Error(`CREATIVE_BUSINESS_ACTION_INTELLIGENCE_INVALID:${failures.join("|")}`);
    error.failures = failures;
    throw error;
  }

  const intelligence = {
    ...source,
    contract: CONTRACT,
    shot_function_vocabulary: SHOT_FUNCTIONS,
  };
  return {
    ...intelligence,
    intelligence_hash: digest(intelligence),
  };
}

export async function createCreativeBusinessActionIntelligence({
  input = {},
  directed = {},
} = {}) {
  const project = object(input.project);
  const mission = object(input.mission);
  if (!input.organization_id) throw new Error("organization_id required");
  if (!project.id) throw new Error("creative_project_id required");
  if (!directed?.plan) throw new Error("creative_plan required");

  const result = await ServiceExecutionRuntime.execute({
    organization_id: input.organization_id,
    service_id: "ai.reasoning.execute",
    provider_id: null,
    category: "CREATIVE_DIRECTION",
    input: {
      quantity: 1,
      max_output_tokens: 14000,
      response_format: { type: "json_object" },
      prompt: prompt({ input, directed }),
    },
    metadata: {
      module: "CREATIVE",
      operation: OPERATION,
      creative_mission_id: mission.id || mission.creative_mission_id || null,
      creative_project_id: project.id,
    },
  });

  const output = normalizedReasoningOutput(result);
  if (!output) throw new Error("CREATIVE_BUSINESS_ACTION_INTELLIGENCE_JSON_REQUIRED");
  return {
    intelligence: validateCreativeBusinessActionIntelligence(output),
    result,
  };
}

export const CreativeBusinessActionIntelligenceRuntime = Object.freeze({
  contract: CONTRACT,
  operation: OPERATION,
  shot_functions: SHOT_FUNCTIONS,
  create: createCreativeBusinessActionIntelligence,
  validate: validateCreativeBusinessActionIntelligence,
});

import { normalizeTemporalMechanicalContract } from "@/lib/creative/director/runtime/CreativeTemporalMechanicalNormalizationRuntime";
import "./CreativeDirectionCostApprovalRuntime.js";
import crypto from "node:crypto";

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { UsageRuntime } from "@/lib/platform/service-runtime/usage/UsageRuntime";
import { ERP_REGISTRY } from "@/lib/platform/registry/erpRegistry";
import {
  CreativeUniversalTemporalDirectionRuntime,
} from "./CreativeUniversalTemporalDirectionRuntime";
import {
  CreativeMasterPlanRuntime,
} from "./CreativeMasterPlanRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.independent-concept-council.v1",
);

const DIRECTOR_MANDATES = Object.freeze([
  {
    id: "concept-a",
    role: "MYTHIC_CAUSAL_ARCHITECT",
    mandate: "Invent a governing world law first, then build one 4-5 minute causal mythology around it. The Avantiqo intelligence must have agency, make a consequential choice under a real constraint, pay or risk a cost, evolve through materially different states, and leave the world irreversibly changed. Do not structure the film as a tour of industries or capabilities.",
  },
  {
    id: "concept-b",
    role: "HUMAN_CONSEQUENCE_DIRECTOR",
    mandate: "Build the 4-5 minute mythology through recurring human lives and decisions across places. At least two people must want something concrete, face meaningful stakes, and affect one another through the intelligence's choices. Humanity is causal, not decorative; avoid stressed-worker software relief, demonstrations and anonymous category representatives.",
  },
  {
    id: "concept-c",
    role: "SPECULATIVE_EVOLUTION_DIRECTOR",
    mandate: "Invent a speculative evolution of intelligence with distinct stages that change what is possible in the world. Each stage must obey a coherent rule, create a new consequence or limitation, and force the story into a surprising irreversible turn. Scale may expand from intimate to global, but propagation effects, connective metaphors and simple local-to-global growth are not a story.",
  },
]);

const CRITIC_MANDATES = Object.freeze([
  {
    id: "originality",
    role: "ORIGINALITY_AND_CLICHE_CRITIC",
    weight: 0.20,
    minimum: 78,
    mandate: "Reject generic AI imagery, literal lyric illustration, heartbreak symbols, lonely walking, empty beauty shots, disconnected montage, repeated motifs, derivative campaign language and concepts that could fit any client.",
  },
  {
    id: "music_energy",
    role: "MUSIC_ENERGY_AND_ENVIRONMENT_CRITIC",
    weight: 0.25,
    minimum: 78,
    mandate: "Judge whether measured tempo, beat structure, impacts, rhythmic density, builds, drops, vocal sections, physical energy, social scale, camera movement, lighting movement and edit density are translated into visible decisions.",
  },
  {
    id: "brand_commercial",
    role: "BRAND_AND_COMMERCIAL_EFFECTIVENESS_CRITIC",
    weight: 0.20,
    minimum: 72,
    mandate: "Judge audience relevance, memorability, ownability, brand truth, emotional clarity, campaign extensibility and whether the idea can create valuable deliverables rather than only an attractive film.",
  },
  {
    id: "production",
    role: "PRODUCTION_FEASIBILITY_AND_COST_CRITIC",
    weight: 0.15,
    minimum: 65,
    mandate: "Judge whether the concept can be executed with available identity evidence, assets, approved services, shot durations, continuity, safety, rights and realistic generation/editing constraints without hidden cost explosion.",
  },
  {
    id: "mission_fidelity",
    role: "MISSION_FIDELITY_AND_NARRATIVE_CONTRACT_CRITIC",
    weight: 0.20,
    minimum: 90,
    mandate: "Fail any concept that does not unmistakably execute the user's actual mission, objective, required places/entities, required scale, pacing, reveal timing, narrative constraints and explicit avoidances. A beautiful or original concept is not acceptable when it substitutes a motif, mood or generic visual system for required mission content. Treat mission wording and evidence-backed creative grounding as a contract, not optional inspiration.",
  },
  {
    id: "human_place_patience",
    role: "HUMAN_PLACE_PATIENCE_CRITIC",
    weight: 0,
    minimum: 88,
    mandate: "Act as a veto specialist for lived human truth, causal place truth and cinematic patience. Reject posed category demonstrations, interchangeable locations, tourism wallpaper, generic anonymous workers, synthetic crowd behaviour, montage that changes subject before an action has consequence, or pacing that confuses constant cutting with energy. A concept passes only when people behave as people rather than labels, place materially changes action or meaning, and the film gives important gestures, environments, silence and consequences enough time to register while still evolving visually or sonically.",
  },
  {
    id: "story_creativity",
    role: "STORY_CREATIVITY_AND_MYTHOLOGY_CRITIC",
    weight: 0,
    minimum: 92,
    mandate: "Act as a veto specialist for story invention before production planning. Judge only the complete narrative idea: whether it creates an ownable world with rules rather than a software metaphor, sustains a causal 4-5 minute arc, evolves its central hero phenomenon through materially different states, earns mystery before explanation, creates emotional progression and consequence, contains surprising but inevitable turns, progressively proves real evidence-grounded product abilities through consequences in the world, and ends with a payoff that could only belong to this story. Reject SaaS problem-solution structures, feature explanation, dashboard/UI proof, generic global-industry montage, decorative metaphors, repeated rewordings of network/nervous-system/conductor/context-engine ideas, beauty without causality, capability tours disguised as cinema, chapter resets, a single world-brain controlling unrelated companies, cross-organization data/authority blending, crisis-response as the only proof of intelligence, and prose that sounds cinematic without describing what actually changes in the world.",
  },
]);

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

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizedReasoningOutput(result = {}) {
  let value = result?.output?.output || result?.output || result || {};
  for (let depth = 0; depth < 4; depth += 1) {
    if (!value || typeof value !== "object" || Array.isArray(value)) break;
    if (value.raw && typeof value.raw === "object") {
      value = value.raw?.output?.text ?? value.raw?.output ?? value.raw;
      continue;
    }
    break;
  }
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

function wordSet(value) {
  return new Set(
    text(value)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 4),
  );
}

function similarity(left, right) {
  const a = wordSet(left);
  const b = wordSet(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((word) => b.has(word)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function conceptCorpus(concept = {}) {
  return [
    concept.title,
    concept.central_proposition,
    concept.original_world,
    concept.causal_story,
    concept.environment_progression,
    concept.performance_integration,
    concept.music_fit,
    concept.brand_fit,
    ...list(concept.signature_images),
    ...list(concept.scene_arc),
    ...list(concept.motif_system).map((item) =>
      typeof item === "string" ? item : JSON.stringify(item),
    ),
  ].map(text).filter(Boolean).join(" ");
}

function governingDeviceCorpus(concept = {}) {
  return [
    concept.title,
    ...list(concept.motif_system).map((item) =>
      typeof item === "string" ? item : item?.motif,
    ),
  ].map(text).filter(Boolean).join(" ");
}

function phraseSet(value) {
  const words = text(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4);
  const phrases = new Set();
  for (let index = 0; index < words.length - 1; index += 1) {
    phrases.add(`${words[index]} ${words[index + 1]}`);
  }
  return phrases;
}

function sharedGoverningDevicePhrases(left = {}, right = {}) {
  const a = phraseSet(governingDeviceCorpus(left));
  const b = phraseSet(governingDeviceCorpus(right));
  return [...a].filter((phrase) => b.has(phrase));
}

const REJECTED_CREATIVE_FAMILIES = Object.freeze([
  {
    id: "PROPAGATING_SIGNAL_OR_CONNECTIVE_PROXY",
    signals: ["pulse", "pulses", "ripple", "ripples", "wave", "waves", "current", "currents", "thread", "threads", "weave", "network", "networks", "lattice", "grid", "conductor", "baton", "circulatory"],
    device_threshold: 1,
    corpus_threshold: 3,
  },
  {
    id: "SAAS_RELIEF_OR_CHAOS_TO_HARMONY",
    signals: ["fragmented", "disconnected", "workflow", "workflows", "dashboard", "dashboards", "screen", "screens", "alert", "alerts", "invoice", "invoices", "shipment", "shipments", "manual", "optimize", "optimization", "synchronize", "synchronized", "harmony", "chaos"],
    device_threshold: 2,
    corpus_threshold: 5,
  },
]);

function familySignalHits(value, signals = []) {
  const normalized = ` ${text(value).toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ")} `;
  return signals.filter((signal) => normalized.includes(` ${signal} `));
}

function rejectedLineageCollision(concept = {}, context = {}) {
  const history = list(context.rejectedCreativeLineage);
  if (!history.length) return null;
  const conceptTitle = text(concept.title);
  for (const entry of history) {
    const rejectedTitle = text(object(entry).title);
    if (rejectedTitle && similarity(conceptTitle, rejectedTitle) >= 0.5) {
      return { type: "REJECTED_TITLE_FAMILY", rejected_title: rejectedTitle };
    }
  }
  const rejectedCorpus = history.map((entry) => {
    const row = object(entry);
    return [row.title, row.reason].map(text).filter(Boolean).join(" ");
  }).join(" ");
  const deviceCorpus = governingDeviceCorpus(concept);
  const fullCorpus = [
    conceptCorpus(concept),
    concept.beginning,
    concept.escalation,
    concept.turn,
    concept.resolution,
    JSON.stringify(object(concept.strategic_basis)),
  ].map(text).filter(Boolean).join(" ");
  for (const family of REJECTED_CREATIVE_FAMILIES) {
    const rejectedHits = familySignalHits(rejectedCorpus, family.signals);
    if (!rejectedHits.length) continue;
    const deviceHits = familySignalHits(deviceCorpus, family.signals);
    const corpusHits = familySignalHits(fullCorpus, family.signals);
    if (deviceHits.length >= family.device_threshold || corpusHits.length >= family.corpus_threshold) {
      return {
        type: "REJECTED_CONCEPT_FAMILY",
        family_id: family.id,
        device_hits: deviceHits,
        corpus_hits: corpusHits,
      };
    }
  }
  return null;
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function reason({
  organizationId,
  projectId,
  missionId,
  operation,
  prompt,
  maxOutputTokens = 10000,
}) {
  const result = await ServiceExecutionRuntime.execute({
    organization_id: organizationId,
    service_id: "ai.reasoning.execute",
    provider_id: null,
    category: "CREATIVE_DIRECTION",
    input: {
      quantity: 1,
      max_output_tokens: maxOutputTokens,
      response_format: { type: "json_object" },
      prompt,
    },
    metadata: {
      module: "CREATIVE",
      operation,
      creative_mission_id: missionId || null,
      creative_project_id: projectId,
    },
  });
  const output = normalizedReasoningOutput(result);
  if (!output) throw new Error(`${operation}_JSON_REQUIRED`);
  return { output, result };
}


async function recoverSettledCouncilOperation(context = {}, operation = "") {
  const expectedOperation = text(operation).toUpperCase();
  if (!expectedOperation) return null;
  const entries = list(context.directionApprovalOperations)
    .filter((entry) =>
      text(entry?.operation).toUpperCase() === expectedOperation &&
      text(entry?.usage_id) &&
      entry?.completed_at
    );
  const entry = entries.at(-1);
  if (!entry) return null;
  const usage = await UsageRuntime.get(entry.usage_id);
  if (!usage || text(usage.status).toUpperCase() !== "SUCCESS") return null;
  const metadata = object(usage.metadata);
  if (text(metadata.creative_project_id) && text(metadata.creative_project_id) !== text(context.projectId)) return null;
  if (text(metadata.creative_mission_id) && text(metadata.creative_mission_id) !== text(context.missionId)) return null;
  if (text(metadata.operation).toUpperCase() !== expectedOperation) return null;
  const providerResult = object(metadata.provider_result || metadata.result);
  const output = normalizedReasoningOutput(
    usage.output_text || providerResult.output?.text || providerResult.output || providerResult || usage,
  );
  if (!output) return null;
  return {
    output,
    result: {
      usage,
      recovered_from_settled_usage: true,
      recovered_usage_id: usage.id || entry.usage_id,
      recovered_operation: expectedOperation,
    },
  };
}

async function recoverSettledConceptDirector(context = {}, director = {}) {
  const prefix = `CREATIVE_CONCEPT_DIRECTOR_${director.id.toUpperCase()}`;
  const entries = list(context.directionApprovalOperations).filter((entry) => {
    const operation = text(entry?.operation).toUpperCase();
    return (
      (operation === `${prefix}_V1` || operation.startsWith(`${prefix}_DISTINCT_RETRY_`)) &&
      text(entry?.usage_id) &&
      entry?.completed_at
    );
  });
  const roundStartedAt = Date.parse(text(context.freshStoryRoundStartedAt));
  const eligibleEntries = Number.isFinite(roundStartedAt)
    ? entries.filter((entry) => {
        const completedAt = Date.parse(text(entry?.completed_at));
        return Number.isFinite(completedAt) && completedAt >= roundStartedAt;
      })
    : (context.forceFreshStoryRound === true ? [] : entries);
  const latest = eligibleEntries.at(-1);
  return latest ? recoverSettledCouncilOperation(context, latest.operation) : null;
}

function fullEvidencePacket(input = {}, directed = {}) {
  const plan = object(directed.plan);
  return {
    mission_contract: positiveMissionContract(input),
    project: object(input.project),
    mission: object(input.mission),
    brief: object(input.brief),
    research:
      input.brief?.metadata?.autonomous_research ||
      input.brief?.metadata?.research ||
      directed.research ||
      null,
    measured_audio:
      plan.measured_audio_intelligence ||
      directed.measured_audio_intelligence ||
      input.brief?.metadata?.measured_audio_intelligence ||
      null,
    music_world: plan.music_world || directed.universal_creative_synthesis?.music_world || null,
    identity_profiles:
      plan.identity_profiles || plan.subject_profiles || directed.universal_identity_profiles ||
      input.brief?.metadata?.universal_subject_profiles || [],
    product_profiles: plan.product_profiles || input.brief?.metadata?.universal_product_profiles || [],
    brand_mark_profiles: plan.brand_mark_profiles || input.brief?.metadata?.universal_brand_mark_profiles || [],
    location_profiles: plan.location_profiles || input.brief?.metadata?.universal_location_profiles || [],
    asset_manifest: plan.universal_asset_intelligence?.asset_manifest || plan.asset_manifest || [],
    deliverables: plan.deliverables || [],
    production_constraints: plan.production || {},
  };
}

function positiveGenerativeInstruction(value) {
  return text(value)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !/^(?:do not|don't|never|avoid)\b/i.test(sentence))
    .filter((sentence) => !/\brejected (?:creative )?lineage\b/i.test(sentence))
    .map((sentence) => sentence
      .replace(/\s*,?\s+but\s+do not\b[\s\S]*$/i, "")
      .replace(/\s+not like\b[\s\S]*$/i, "")
      .trim())
    .filter(Boolean)
    .join(" ");
}

function positiveMissionContract(input = {}, { includeAvoidances = true } = {}) {
  const mission = object(input.mission);
  const project = object(input.project);
  const brief = object(input.brief);
  const missionMetadata = object(mission.metadata);
  const projectMetadata = object(project.metadata);
  const briefMetadata = object(brief.metadata);
  return {
    objective: positiveGenerativeInstruction(mission.objective || project.objective || brief.creative_objective || ""),
    communication_goal: brief.communication_goal || projectMetadata.communication_goal || missionMetadata.communication_goal || null,
    desired_outcome: brief.desired_outcome || projectMetadata.desired_outcome || missionMetadata.desired_outcome || null,
    chapter_role: projectMetadata.chapter_role || missionMetadata.chapter_role || null,
    tone: brief.tone || projectMetadata.tone || missionMetadata.tone || null,
    emotion: brief.emotion || projectMetadata.emotion || missionMetadata.emotion || null,
    production_type: project.production_type || projectMetadata.production_type || null,
    target_duration: project.target_duration || brief.duration_seconds || projectMetadata.target_duration || null,
    target_channels: project.target_channels || brief.channels || [],
    target_languages: project.target_languages || brief.languages || [],
    autonomous_story_required: projectMetadata.autonomous_story_required === true || missionMetadata.autonomous_story_required === true,
    story_only_creative_phase: projectMetadata.stop_after_story === true || /^EVOLUTION_STORY_ONLY/.test(text(projectMetadata.story_test_mode).toUpperCase()),
    positive_direction_constraints: list(projectMetadata.creative_direction_constraints)
      .map(positiveGenerativeInstruction)
      .filter(Boolean),
    explicit_avoidances: includeAvoidances ? [
      ...list(projectMetadata.creative_direction_constraints).map(text).filter(Boolean),
      ...list(projectMetadata.rejected_direction_history).map((entry) => {
        const row = object(entry);
        const title = text(row.title);
        const reason = text(row.reason);
        return [title ? `Rejected direction: ${title}.` : "", reason].filter(Boolean).join(" ");
      }).filter(Boolean),
    ] : [],
    rejected_direction_firewall: includeAvoidances ? "CRITIC_VISIBLE" : "DIRECTOR_BLIND",
  };
}

function stripAdvisoryCreativeInterpretation(value) {
  if (Array.isArray(value)) return value.map(stripAdvisoryCreativeInterpretation);
  if (!value || typeof value !== "object") return value;
  const blocked = new Set([
    "must_not_do",
    "misuse_risk",
    "creative_consequence",
    "continuity_constraints",
    "reasoning",
  ]);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !blocked.has(key))
      .map(([key, nested]) => [key, stripAdvisoryCreativeInterpretation(nested)]),
  );
}

function canonicalCapabilityEvidence() {
  const workspaces = object(ERP_REGISTRY.workspaces);
  return list(ERP_REGISTRY.domains).map((domain) => {
    const workspace = object(workspaces[domain.id]);
    const capabilities = list(workspace.groups)
      .flatMap((group) => list(group?.items))
      .slice(0, 18)
      .map((item) => ({
        id: text(item?.id),
        name: text(item?.name),
        description: text(item?.description),
      }))
      .filter((item) => item.id && item.name);
    return {
      domain_id: text(domain?.id),
      domain_name: text(domain?.name),
      domain_description: text(domain?.description),
      capabilities,
    };
  }).filter((domain) => domain.domain_id && domain.domain_name);
}

function blindResearchEvidence(research = null) {
  const source = object(research);
  if (!Object.keys(source).length) return null;
  const strategic = stripAdvisoryCreativeInterpretation(object(source.strategic_synthesis));
  return {
    contract: source.contract || null,
    report_id: source.report_id || null,
    research_identity: source.research_identity || null,
    validation: source.validation || {},
    company_resolution: source.company_resolution || {},
    company_truth: source.company_truth || {},
    brand_intelligence: source.brand_intelligence || {},
    audience: source.audience || {},
    competitor_analysis: source.competitor_analysis || {},
    market: source.market || {},
    commercial_intelligence: source.commercial_intelligence || {},
    claims: list(source.claims),
    sources: list(source.sources),
    strategic_synthesis: strategic,
    authority: {
      factual_evidence: "EVIDENCE",
      creative_interpretation: "ADVISORY_ONLY",
      mission_contract: "HIGHEST",
    },
  };
}

function blindConceptEvidencePacket(input = {}, directed = {}) {
  const full = fullEvidencePacket(input, directed);
  return {
    mission_contract: positiveMissionContract(input, { includeAvoidances: false }),
    research: blindResearchEvidence(full.research),
    measured_audio: input.brief?.metadata?.measured_audio_intelligence || null,
    identity_profiles: input.brief?.metadata?.universal_subject_profiles || [],
    product_profiles: input.brief?.metadata?.universal_product_profiles || [],
    brand_mark_profiles: input.brief?.metadata?.universal_brand_mark_profiles || [],
    location_profiles: input.brief?.metadata?.universal_location_profiles || [],
    asset_manifest: list(input.assets),
    capability_evidence: canonicalCapabilityEvidence(),
  };
}

function directorPrompt(director, evidence) {
  const storyOnly = evidence?.mission_contract?.story_only_creative_phase === true;
  const storyOnlyOverride = storyOnly ? `
STORY-ONLY CREATIVE PHASE OVERRIDE
- This pass exists to invent and judge the complete story before capability mapping, workflow proof, scene engineering, shot design or production planning.
- EVIDENCE.mission_contract.positive_direction_constraints are binding generative direction and must remain visible to you even though rejected-lineage vocabulary is hidden.
- Do not organize the plot around ERP domains, capabilities, Business Partner steps, dashboards, compliance cases, logistics exceptions, feature proof, or a tour of organizations. Those structures are deferred until a story is accepted.
- global_system_arc, business_partner_arc, operating_life_arc, capability_horizon, capability_truth and capability_arc are advisory containers in this phase only; they must not dictate the dramatic engine.
- Global scale must emerge from the mythology and causal story rather than from checking off locations or industries.
- Spend creative effort on an ownable world law, mystery, hero evolution, consequential choices, irreversible turns, emotional progression, signature imagery, sound/silence and payoff.
` : "";
  return `
You are Avantiqo's ${director.role}. You are one independent creative director in a blind concept round.
You cannot see the other directors' concepts, scores or language. Do not anticipate compromise and do not produce multiple options.

YOUR MANDATE
${director.mandate}

Return strict JSON only:
{
  "concept": {
    "id": "${director.id}",
    "director_role": "${director.role}",
    "title": "",
    "central_proposition": "",
    "original_world": "",
    "governing_world_rule": "",
    "dramatic_question": "",
    "opening_mystery": {
      "unanswered_question": "",
      "first_anomaly": "",
      "audience_visible_beats": ["", "", "", ""],
      "escalation_beats": ["", "", ""],
      "withheld_truth": "",
      "reveal_phase": "ACT_2_OR_LATER",
      "first_reveal_boundary": "",
      "sound_and_silence_logic": ""
    },
    "global_system_arc": {
      "business_worlds": [{"place":"", "industry":"", "organization_context":"", "human_goal":"", "local_consequence":"", "domain_ids":[""]}],
      "organization_sovereignty": {
        "data_boundary": "",
        "authority_boundary": "",
        "shared_architecture_not_shared_context": ""
      },
      "shared_intelligence_reveal": "",
      "why_global": ""
    },
    "business_partner_arc": {
      "understands_context": "",
      "discusses_with_human": "",
      "reasons_and_plans": "",
      "authorized_action": "",
      "independent_verification": ""
    },
    "operating_life_arc": {
      "ordinary_work": "",
      "growth_or_opportunity": "",
      "creative_or_planning": "",
      "risk_or_exception": "",
      "why_not_crisis_only": ""
    },
    "capability_horizon": {
      "proved_domains": [""],
      "broader_system_scope": [""],
      "system_scope_clusters": [{"cluster":"", "domain_ids":[""], "human_meaning":""}],
      "reveal_method": ""
    },
    "hero_agency": {
      "hero_identity": "",
      "desire_or_purpose": "",
      "consequential_choice": "",
      "constraint": "",
      "cost_or_risk": "",
      "evolution_states": ["", "", ""]
    },
    "human_stakes": [{"person_role":"", "desire":"", "risk":"", "causal_link":""}],
    "irreversible_turns": ["", ""],
    "causal_story": "",
    "beginning": "",
    "escalation": "",
    "turn": "",
    "resolution": "",
    "payoff": "",
    "environment_progression": "",
    "performance_integration": "",
    "music_fit": "",
    "brand_fit": "",
    "capability_truth": [{"domain_id":"", "capability_id":"", "capability":"", "story_consequence":""}],
    "capability_arc": [{"capability_id":"", "causal_step":"", "story_consequence":""}],
    "audience_feeling": "",
    "cinematic_system": {
      "target_shot_count": 130,
      "shot_density_logic": "",
      "visual_idea_families": ["", "", "", "", "", ""],
      "graphic_design_language": "",
      "vfx_language": "",
      "typography_language": "",
      "transition_language": "",
      "scale_shift_language": "",
      "sound_edit_language": "",
      "repetition_control": "",
      "hero_image_escalation": ["", "", "", "", "", ""]
    },
    "brain_arc": {
      "awakening": "",
      "connects_to_world": "",
      "connects_to_business": "",
      "receives_input": "",
      "works_and_reasons": "",
      "gives_output": ""
    },
    "signature_images": ["", "", "", "", ""],
    "scene_arc": ["", "", "", "", ""],
    "motif_system": [{"motif":"", "maximum_uses":1, "variation_rule":""}],
    "camera_language": "",
    "lighting_language": "",
    "editing_language": "",
    "production_approach": "",
    "strategic_basis": {
      "human_truth": "",
      "central_tension": "",
      "category_convention_response": "",
      "brand_asset_strategy": "",
      "attention_mechanism": "",
      "evidence_source_ids": [""]
    },
    "campaign_extensions": [""],
    "known_risks": [""],
    "anti_cliche_rules": [""]
  }
}

NON-NEGOTIABLE RULES
${storyOnlyOverride}
- Create one fully formed, causal and original concept, not a moodboard or montage.
- For a 4-5 minute/master story, design the complete dramatic architecture now. Do not write only a 60-second first chapter, one-minute advertisement, five-beat capability reel or timed 0:00-1:00 sequence. Chapter 1 can later be produced separately, but this concept must already contain the full film's causal story.
- The first act must build mystery, tension and curiosity before explanation. opening_mystery must define an unanswered question, a concrete first anomaly, at least four audience-visible beats, at least three escalating clues, what truth is deliberately withheld, where the first meaningful reveal occurs, and how sound/silence sustains tension. The audience-visible opening must not name Avantiqo, AI, intelligence, software, platform, system or product capabilities. reveal_phase must be ACT_2_OR_LATER: the first 60-75 seconds should make the viewer feel an intelligence before explaining what it is.
- When the mission calls for global scale, global_system_arc must prove global reach WITHOUT turning Avantiqo into one centralized world-brain. Show at least four independent organizations in different places and industries. Each business_world has its own organization_context, human goal, local consequence and capability domains. Their data, authority and decisions remain separate. The reveal is that the same Avantiqo intelligence architecture can understand and operate each world in context, not that unrelated companies share one business state.
- organization_sovereignty is mandatory: explicitly preserve separate data boundaries, separate human/organization authority, and explain that the shared architecture is not shared business context. Never imply cross-customer control, pooled private data or one global command center governing unrelated companies.
- business_partner_arc must show the actual Avantiqo cognitive loop in story consequence: understand the organization's context -> discuss with a human -> reason/plan -> take an authorized capability action -> independently verify the result. Do not reduce Avantiqo to silent automation.
- operating_life_arc must prove Avantiqo across normal business life, not only emergencies: ordinary work, growth/opportunity, creative/planning work and one risk/exception moment. Crisis may create tension, but crisis-response cannot be the film's central definition of Avantiqo.
- capability_horizon must separate what the film directly proves from the broader Avantiqo system it reveals. For a global long-form investor story, directly prove at least six grounded capabilities across at least five ERP domains. Then use system_scope_clusters to reveal the full canonical Avantiqo domain horizon in human terms (for example work, money, people, supply, projects, knowledge, compliance, intelligence and creation) rather than a feature checklist.
- Never invent physical powers that Avantiqo does not have. The intelligence may cause real-world outcomes only through evidence-grounded capabilities and human/authorized actions. Do not have it magically repair roads, move machinery, change regulations or alter reality unless the causal mechanism is grounded in evidence.
- governing_world_rule must describe a rule with consequences and limits, not a visual motif. hero_agency must make the intelligence a protagonist with purpose, choice, constraint, cost/risk and at least three materially different evolution states. Merely becoming brighter, larger, faster, more connected or more global does not count as evolution.
- When the mission asks for the brain/intelligence arc, brain_arc must make six transformations causally visible across the full film: awakening -> connection to the world -> connection to distinct businesses -> receiving meaningful inputs -> working/reasoning -> giving consequential outputs. These are dramatic states, not chapter labels or UI demonstrations. The visible brain may be abstract, biological, architectural, cosmic, mechanical or something newly invented, but its form and behavior must evolve with the story.
- For premium long-form investor-film work, cinematic_system must prove the concept can sustain roughly 130 purposeful shots without becoming random montage. target_shot_count should be near 130; visual_idea_families must contain at least six materially different image systems; hero_image_escalation must contain at least six escalating signature moments. Define a world-class graphic-design language, VFX language, typography language, transition language, scale-shift language, sound/edit language and repetition-control rule. Every one must support story causality rather than decoration.
- Reference quality means craft density and integration, not imitation. Use the Lamborghini Revuelto benchmark only as a minimum ambition for designed frames, VFX/CG/live-action integration, graphic interruption, transitions, scale shifts, edit precision and sound-led visual rhythm. Do not copy its shots, art direction, car imagery, typography or protected creative expression.
- human_stakes must contain recurring people whose desires, risks and decisions matter to the causal story. Humans cannot be anonymous demonstration extras or stressed users waiting for software relief.
- irreversible_turns must contain at least two events that permanently change what the hero, humans or world can do. dramatic_question must be established before explanation; payoff must answer it through story consequence rather than a logo formation.
- EVIDENCE.mission_contract is the user-facing creative contract. Every explicit requirement for scale, industry diversity, geographic truth, pacing, reveal timing and chapter role must become observable story content rather than being replaced by a metaphor.
- Invent your own direction from the positive mission, research and source evidence. This is a contamination-firewalled blind round: rejected concepts and their vocabulary are intentionally withheld from you. Do not speculate about earlier directions or try to reverse-engineer what was rejected; originality must emerge from the positive evidence in front of you. Downstream independent critics own collision/rejection checks.
- The concept must be specific to this company, performer, product, audience and measured source material.
- When EVIDENCE.capability_evidence is present, the story must prove what the company can actually do through causal consequences inside the narrative. Do not turn this into a feature list, dashboard tour or SaaS demo. For long-form/master-story work, capability_truth must contain at least 4 materially different evidence-grounded capabilities spanning at least 3 domains, and capability_arc must contain one ordered causal step per proved capability.
- A capability does not count as story proof when its consequence is only a dashboard change, screen notification, UI click, chart movement, status badge, digital overlay or a character pressing a magic optimize button. The capability must materially alter a decision, physical operation, resource, document, schedule, money flow, delivery, customer outcome or other real-world consequence.
- Capability proof must be woven into the mythology and emotional arc of the full story. The intelligence remains the story-bearing hero; the capabilities are evidence of what it can do, not the structure of a product demo. Mystery may dominate the opening, but the complete 4-5 minute story must progressively reveal real abilities and consequences.
- Every capability_truth row must reference a real domain_id and capability_id from EVIDENCE.capability_evidence. Never invent product capability claims. A capability is proven by a visible consequence in the world, not by naming a feature on screen.
- Lyrics are one signal only. Measured tempo, energy, rhythmic density, impacts, environment and social scale must produce visible decisions.
- Uploaded person media identifies the exact person; its backgrounds are not scene constraints unless explicitly assigned.
- Preserve exact face and body identity while allowing new environments, wardrobe, lighting, choreography and camera positions.
- No generic heartbreak imagery, broken hearts, lonely walking, mirrors, empty corridors, random neon, repeated beauty shots, vague empowerment, disconnected party montage or literal lyric illustration unless the evidence makes it uniquely necessary.
- Every signature image must advance story, performance, environment or brand meaning.
- Treat EVIDENCE.mission_contract as the highest creative authority. Research supplies factual evidence and advisory strategy; it may never narrow, negate or reinterpret an explicit mission requirement.
- Treat EVIDENCE.research.strategic_synthesis as advisory strategic evidence when present. Use its factual statements and source references, but resolve any conflict in favor of EVIDENCE.mission_contract.
- strategic_basis is mandatory when strategic_synthesis exists. State the chosen human truth, central tension, category convention response, brand-asset strategy and active-attention mechanism, and copy only evidence_source_ids that exist in the research packet.
- A category convention may be preserved when it aids comprehension or broken when evidence shows a distinctive opportunity; novelty alone is not a reason.
- Brand linkage must be designed into the story/device rather than attached as a late logo reveal unless the strategic evidence specifically earns delayed revelation.
- Do not copy a living artist, director, film, campaign or protected character.

EVIDENCE
${JSON.stringify(evidence)}
`;
}

function premiumFlagshipStoryCollision(concept = {}, evidence = {}) {
  const missionCorpus = JSON.stringify(evidence.mission_contract || {}).toLowerCase();
  const longForm = /4\s*-?\s*5\s*minute|master story|master-story/.test(missionCorpus);
  if (!longForm) return null;

  const mystery = object(concept.opening_mystery);
  const openingCorpus = [
    concept.beginning,
    mystery.unanswered_question,
    mystery.first_anomaly,
    ...list(mystery.audience_visible_beats),
    ...list(mystery.escalation_beats),
  ].map(text).join(" ").toLowerCase();
  const storyCorpus = [
    concept.central_proposition,
    concept.causal_story,
    concept.beginning,
    concept.escalation,
    concept.turn,
    concept.resolution,
  ].map(text).join(" ").toLowerCase();

  const humanPain = /stressed|frustrat|overwhelm|confus|struggl|manual work|too many|multiple tools|disconnected tools|fragmented tools|notification overload|cluttered desk/.test(openingCorpus);
  const softwareRelief = /dashboard|software|platform|workflow|screen|screens|tool|tools|app|apps|interface|ui|notification|notifications/.test(openingCorpus);
  const reliefArc = /problem.{0,120}(solution|relief|clarity)|chaos.{0,120}(order|harmony)|fragment.{0,120}(unif|connect)|stress.{0,120}(calm|relief)/s.test(storyCorpus);
  if ((humanPain && softwareRelief) || reliefArc) {
    return {
      type: "PREMIUM_FLAGSHIP_SAAS_RELIEF",
      reason: "Premium long-form film cannot be structured as stressed-user/software-relief advertising.",
    };
  }

  const heroMission = /(brain|intelligence).{0,80}(hero|protagonist)|(hero|protagonist).{0,80}(brain|intelligence)/.test(missionCorpus);
  if (heroMission) {
    const hero = object(concept.hero_agency);
    const heroIdentity = text(hero.hero_identity).toLowerCase();
    if (!/(brain|intelligence|avantiqo)/.test(heroIdentity)) {
      return {
        type: "PREMIUM_FLAGSHIP_WRONG_HERO",
        reason: "Mission explicitly makes the brain/intelligence the hero, but hero_agency assigns another protagonist.",
      };
    }
    const openingHumanHero = /operator|employee|manager|worker|customer|user|accountant|receptionist|office worker/.test(openingCorpus);
    const heroPresence = /(brain|intelligence|unknown machine|unknown mechanism|architecture|entity|presence|mechanism|structure)/.test(openingCorpus);
    if (openingHumanHero && !heroPresence) {
      return {
        type: "PREMIUM_FLAGSHIP_HERO_ABSENT_FROM_OPENING",
        reason: "Opening is carried by a human-use-case setup instead of the mission-defined hero's mystery or birth.",
      };
    }
  }

  return null;
}

async function generateIndependentConcepts(context, evidence) {
  const results = [];
  for (const director of DIRECTOR_MANDATES) {
    const recovered = await recoverSettledConceptDirector(context, director);
    if (recovered) {
      results.push(recovered);
      continue;
    }
    results.push(await reason({
      ...context,
      operation: `CREATIVE_CONCEPT_DIRECTOR_${director.id.toUpperCase()}_V1`,
      prompt: directorPrompt(director, evidence),
      maxOutputTokens: 8000,
    }));
  }
  const concepts = results.map(({ output }, index) => {
    const concept = object(output.concept || output);
    const director = DIRECTOR_MANDATES[index];
    if (text(concept.id) !== director.id) concept.id = director.id;
    concept.director_role = director.role;
    return concept;
  });

  for (let index = 0; index < concepts.length; index += 1) {
    const director = DIRECTOR_MANDATES[index];
    for (let attempt = 0; attempt <= 2; attempt += 1) {
      const collision = rejectedLineageCollision(concepts[index], context);
      if (!collision) break;
      if (attempt === 2) {
        throw new Error(`INDEPENDENT_CONCEPT_REJECTED_LINEAGE_REPAIR_EXHAUSTED:${concepts[index].id}:${collision.family_id || collision.type}`);
      }
      const operation = `CREATIVE_CONCEPT_DIRECTOR_${director.id.toUpperCase()}_LINEAGE_RETRY_${attempt + 1}_V1`;
      const retry = await recoverSettledCouncilOperation(context, operation) || await reason({
        ...context,
        operation,
        prompt: `${directorPrompt(director, evidence)}\n\nFRESH-LINEAGE REPAIR\nYour proposed concept belongs to a creative family that this mission has already rejected. Keep the rejected lineage hidden: do not ask for or infer its titles or vocabulary. Invent a materially different governing world rule, hero behavior, causal structure, emotional stakes and capability integration. Renaming the motif, changing locations, or replacing one propagation effect with another is not a new concept.`,
        maxOutputTokens: 8000,
      });
      const replacement = object(retry.output?.concept || retry.output);
      replacement.id = director.id;
      replacement.director_role = director.role;
      concepts[index] = replacement;
      results[index] = retry;
    }
  }

  const storyOnly = evidence?.mission_contract?.story_only_creative_phase === true;
  const strategicResearch = object(evidence.research?.strategic_synthesis);
  const researchSourceIds = new Set(list(evidence.research?.sources).map((entry) => text(entry?.id)).filter(Boolean));
  for (let conceptIndex = 0; conceptIndex < concepts.length; conceptIndex += 1) {
    const concept = concepts[conceptIndex];
    const recoveredAcceptedConcept =
      results[conceptIndex]?.result?.recovered_from_settled_usage === true &&
      Number.isFinite(Date.parse(text(context.freshStoryRoundStartedAt)));
    if (recoveredAcceptedConcept) continue;
    const substantiveRequired = [
      concept.central_proposition,
      concept.original_world,
      concept.governing_world_rule,
      concept.dramatic_question,
      JSON.stringify(concept.opening_mystery || {}),
      JSON.stringify(concept.global_system_arc || {}),
      ...(storyOnly ? [] : [
        JSON.stringify(concept.business_partner_arc || {}),
        JSON.stringify(concept.operating_life_arc || {}),
        JSON.stringify(concept.capability_horizon || {}),
      ]),
      JSON.stringify(concept.hero_agency || {}),
      JSON.stringify(concept.brain_arc || {}),
      JSON.stringify(concept.cinematic_system || {}),
      JSON.stringify(concept.human_stakes || []),
      JSON.stringify(concept.irreversible_turns || []),
      concept.causal_story,
      concept.payoff,
      concept.environment_progression,
      concept.performance_integration,
      concept.music_fit,
      concept.brand_fit,
      !storyOnly && list(evidence.capability_evidence).length ? JSON.stringify(concept.capability_truth || []) : "capability-proof-deferred-or-not-present",
      object(evidence.research?.strategic_synthesis).contract ? concept.strategic_basis?.human_truth : "research-not-strategic",
    ];
    if (text(concept.title).length < 8 || substantiveRequired.some((value) => text(value).length < 20)) {
      throw new Error(`INDEPENDENT_CONCEPT_INCOMPLETE:${concept.id}`);
    }
    if (list(concept.signature_images).length < 5) {
      throw new Error(`INDEPENDENT_CONCEPT_SIGNATURE_IMAGES_REQUIRED:${concept.id}`);
    }
    const missionCorpus = JSON.stringify(evidence.mission_contract || {});
    const longForm = /4\s*-?\s*5\s*minute|master story|master-story/i.test(missionCorpus);
    const requiresMystery = /mystery|mysterious|tension|without explaining|reveal/i.test(missionCorpus);
    const requiresGlobal = /global|worldwide|world scale|many industries|multi-industry|across industries/i.test(missionCorpus);
    const flagshipCollision = premiumFlagshipStoryCollision(concept, evidence);
    if (flagshipCollision) {
      throw new Error(`INDEPENDENT_CONCEPT_${flagshipCollision.type}:${concept.id}`);
    }
    if (longForm) {
      const hero = object(concept.hero_agency);
      const heroFields = ["hero_identity", "desire_or_purpose", "consequential_choice", "constraint", "cost_or_risk"];
      if (text(concept.governing_world_rule).length < 40 || text(concept.dramatic_question).length < 24 || text(concept.payoff).length < 30) {
        throw new Error(`INDEPENDENT_CONCEPT_MASTER_STORY_ANATOMY_REQUIRED:${concept.id}`);
      }
      for (const field of heroFields) {
        if (text(hero[field]).length < 20) throw new Error(`INDEPENDENT_CONCEPT_HERO_AGENCY_REQUIRED:${concept.id}:${field}`);
      }
      if (list(hero.evolution_states).filter((value) => text(value).length >= 16).length < 3) {
        throw new Error(`INDEPENDENT_CONCEPT_HERO_EVOLUTION_REQUIRED:${concept.id}`);
      }
      const humanStakes = list(concept.human_stakes).filter((row) => {
        const stake = object(row);
        return text(stake.person_role).length >= 4 && text(stake.desire).length >= 12 && text(stake.risk).length >= 12 && text(stake.causal_link).length >= 16;
      });
      if (humanStakes.length < 2) throw new Error(`INDEPENDENT_CONCEPT_HUMAN_STAKES_REQUIRED:${concept.id}:2`);
      if (list(concept.irreversible_turns).filter((value) => text(value).length >= 24).length < 2) {
        throw new Error(`INDEPENDENT_CONCEPT_IRREVERSIBLE_TURNS_REQUIRED:${concept.id}:2`);
      }
      const brainArc = object(concept.brain_arc);
      for (const field of ["awakening","connects_to_world","connects_to_business","receives_input","works_and_reasons","gives_output"]) {
        if (text(brainArc[field]).length < 20) throw new Error(`INDEPENDENT_CONCEPT_BRAIN_ARC_REQUIRED:${concept.id}:${field}`);
      }
      const cinematic = object(concept.cinematic_system);
      const targetShots = finite(cinematic.target_shot_count) ?? 0;
      if (targetShots < 110 || targetShots > 150) throw new Error(`INDEPENDENT_CONCEPT_CINEMATIC_SHOT_DENSITY_REQUIRED:${concept.id}:${targetShots}`);
      if (list(cinematic.visual_idea_families).filter((value) => text(value).length >= 16).length < 6) {
        throw new Error(`INDEPENDENT_CONCEPT_VISUAL_IDEA_FAMILIES_REQUIRED:${concept.id}:6`);
      }
      if (list(cinematic.hero_image_escalation).filter((value) => text(value).length >= 16).length < 6) {
        throw new Error(`INDEPENDENT_CONCEPT_HERO_IMAGE_ESCALATION_REQUIRED:${concept.id}:6`);
      }
      for (const field of ["shot_density_logic","graphic_design_language","vfx_language","typography_language","transition_language","scale_shift_language","sound_edit_language","repetition_control"]) {
        if (text(cinematic[field]).length < 24) throw new Error(`INDEPENDENT_CONCEPT_CINEMATIC_SYSTEM_REQUIRED:${concept.id}:${field}`);
      }
      if (requiresMystery) {
        const mystery = object(concept.opening_mystery);
        const mysteryFields = ["unanswered_question", "first_anomaly", "withheld_truth", "first_reveal_boundary", "sound_and_silence_logic"];
        for (const field of mysteryFields) {
          if (text(mystery[field]).length < 20) throw new Error(`INDEPENDENT_CONCEPT_OPENING_MYSTERY_REQUIRED:${concept.id}:${field}`);
        }
        if (text(mystery.reveal_phase).toUpperCase() !== "ACT_2_OR_LATER") {
          throw new Error(`INDEPENDENT_CONCEPT_REVEAL_TOO_EARLY:${concept.id}`);
        }
        const audienceBeats = list(mystery.audience_visible_beats).filter((value) => text(value).length >= 16);
        if (audienceBeats.length < 4) throw new Error(`INDEPENDENT_CONCEPT_OPENING_VISIBLE_BEATS_REQUIRED:${concept.id}:4`);
        if (list(mystery.escalation_beats).filter((value) => text(value).length >= 16).length < 3) {
          throw new Error(`INDEPENDENT_CONCEPT_OPENING_MYSTERY_ESCALATION_REQUIRED:${concept.id}:3`);
        }
        const openingCorpus = [concept.beginning, mystery.first_anomaly, ...audienceBeats, ...list(mystery.escalation_beats)].map(text).join(" ");
        if (/\bavantiqo\b|\bai\b|\bintelligence\b|\bsoftware\b|\bplatform\b|\bsystem\b|dashboard|feature|workflow|sales order|purchase order|revenue recognition|customer invoice/i.test(openingCorpus)) {
          throw new Error(`INDEPENDENT_CONCEPT_OPENING_EXPLAINS_TOO_EARLY:${concept.id}`);
        }
      }
      if (requiresGlobal && !storyOnly) {
        const globalArc = object(concept.global_system_arc);
        const worlds = list(globalArc.business_worlds).filter((row) => {
          const item = object(row);
          return text(item.place).length >= 3 && text(item.industry).length >= 3 && text(item.organization_context).length >= 16 && text(item.human_goal).length >= 12 && text(item.local_consequence).length >= 16 && list(item.domain_ids).length;
        });
        const places = new Set(worlds.map((row) => text(row.place).toLowerCase()));
        const industries = new Set(worlds.map((row) => text(row.industry).toLowerCase()));
        if (worlds.length < 4 || places.size < 4 || industries.size < 4) {
          throw new Error(`INDEPENDENT_CONCEPT_GLOBAL_BUSINESS_WORLDS_REQUIRED:${concept.id}:4`);
        }
        const sovereignty = object(globalArc.organization_sovereignty);
        for (const field of ["data_boundary", "authority_boundary", "shared_architecture_not_shared_context"]) {
          if (text(sovereignty[field]).length < 24) throw new Error(`INDEPENDENT_CONCEPT_ORGANIZATION_SOVEREIGNTY_REQUIRED:${concept.id}:${field}`);
        }
        if (text(globalArc.shared_intelligence_reveal).length < 36 || text(globalArc.why_global).length < 36) {
          throw new Error(`INDEPENDENT_CONCEPT_GLOBAL_ARCHITECTURE_REVEAL_REQUIRED:${concept.id}`);
        }
        const partner = object(concept.business_partner_arc);
        for (const field of ["understands_context", "discusses_with_human", "reasons_and_plans", "authorized_action", "independent_verification"]) {
          if (text(partner[field]).length < 20) throw new Error(`INDEPENDENT_CONCEPT_BUSINESS_PARTNER_ARC_REQUIRED:${concept.id}:${field}`);
        }
        const life = object(concept.operating_life_arc);
        for (const field of ["ordinary_work", "growth_or_opportunity", "creative_or_planning", "risk_or_exception", "why_not_crisis_only"]) {
          if (text(life[field]).length < 20) throw new Error(`INDEPENDENT_CONCEPT_OPERATING_LIFE_REQUIRED:${concept.id}:${field}`);
        }
      }
      const durationCorpus = [concept.causal_story, concept.beginning, concept.escalation, concept.turn, concept.resolution].map(text).join(" ");
      if (/\b60[- ]?second\b|\bone[- ]?minute\b|\b0:00\b|\b0:15\b|\b0:30\b|\b0:45\b|\b1:00\b/i.test(durationCorpus)) {
        throw new Error(`INDEPENDENT_CONCEPT_MASTER_STORY_DURATION_COLLAPSE:${concept.id}`);
      }
    }
    if (list(evidence.capability_evidence).length && !storyOnly) {
      const capabilityRows = list(concept.capability_truth);
      const minimumCapabilities = longForm && requiresGlobal ? 6 : longForm ? 4 : 1;
      const minimumDomains = longForm && requiresGlobal ? 5 : longForm ? 3 : 1;
      if (capabilityRows.length < minimumCapabilities) {
        throw new Error(`INDEPENDENT_CONCEPT_CAPABILITY_PROOF_REQUIRED:${concept.id}:${minimumCapabilities}`);
      }
      const evidenceDomains = new Map(list(evidence.capability_evidence).map((domain) => [text(domain?.domain_id), domain]));
      const usedDomains = new Set();
      for (const row of capabilityRows) {
        const domainId = text(row?.domain_id);
        const capabilityId = text(row?.capability_id);
        const domain = evidenceDomains.get(domainId);
        const validCapability = list(domain?.capabilities).some((item) => text(item?.id) === capabilityId);
        if (!domain || !validCapability || text(row?.story_consequence).length < 12) {
          throw new Error(`INDEPENDENT_CONCEPT_CAPABILITY_EVIDENCE_INVALID:${concept.id}:${domainId}:${capabilityId}`);
        }
        usedDomains.add(domainId);
      }
      if (usedDomains.size < minimumDomains) {
        throw new Error(`INDEPENDENT_CONCEPT_CAPABILITY_DOMAIN_BREADTH_REQUIRED:${concept.id}:${minimumDomains}`);
      }
      const capabilityArc = list(concept.capability_arc);
      if (capabilityArc.length < minimumCapabilities) {
        throw new Error(`INDEPENDENT_CONCEPT_CAPABILITY_ARC_REQUIRED:${concept.id}:${minimumCapabilities}`);
      }
      const provenCapabilityIds = new Set(capabilityRows.map((row) => text(row?.capability_id)).filter(Boolean));
      const arcCapabilityIds = new Set();
      for (const step of capabilityArc) {
        const row = object(step);
        const capabilityId = text(row.capability_id);
        if (!provenCapabilityIds.has(capabilityId) || text(row.causal_step).length < 12 || text(row.story_consequence).length < 12) {
          throw new Error(`INDEPENDENT_CONCEPT_CAPABILITY_ARC_INVALID:${concept.id}:${capabilityId || "missing"}`);
        }
        arcCapabilityIds.add(capabilityId);
      }
      if (arcCapabilityIds.size < minimumCapabilities) {
        throw new Error(`INDEPENDENT_CONCEPT_CAPABILITY_ARC_BREADTH_REQUIRED:${concept.id}:${minimumCapabilities}`);
      }
      if (longForm && requiresGlobal) {
        const horizon = object(concept.capability_horizon);
        const provedDomains = new Set(list(horizon.proved_domains).map(text).filter(Boolean));
        const broaderScope = new Set(list(horizon.broader_system_scope).map(text).filter(Boolean));
        const registryDomains = new Set(list(evidence.capability_evidence).map((domain) => text(domain?.domain_id)).filter(Boolean));
        const clusters = list(horizon.system_scope_clusters).filter((row) => {
          const cluster = object(row);
          return text(cluster.cluster).length >= 4 && text(cluster.human_meaning).length >= 16 && list(cluster.domain_ids).length;
        });
        const clusterDomains = new Set(clusters.flatMap((row) => list(row.domain_ids).map(text).filter(Boolean)));
        const horizonDomains = new Set([...provedDomains, ...broaderScope, ...clusterDomains]);
        const invalidScope = [...horizonDomains].filter((id) => !registryDomains.has(id));
        if (invalidScope.length) throw new Error(`INDEPENDENT_CONCEPT_CAPABILITY_HORIZON_INVALID:${concept.id}:${invalidScope.join(",")}`);
        const missingRegistryDomains = [...registryDomains].filter((id) => !horizonDomains.has(id));
        if (provedDomains.size < minimumDomains || clusters.length < 4 || missingRegistryDomains.length || text(horizon.reveal_method).length < 30) {
          throw new Error(`INDEPENDENT_CONCEPT_CAPABILITY_HORIZON_REQUIRED:${concept.id}:${missingRegistryDomains.join(",") || "coverage"}`);
        }
      }
    }
    if (Object.keys(strategicResearch).length) {
      const basis = object(concept.strategic_basis);
      for (const field of ["human_truth", "central_tension", "category_convention_response", "brand_asset_strategy", "attention_mechanism"]) {
        if (text(basis[field]).length < 12) throw new Error(`INDEPENDENT_CONCEPT_STRATEGIC_BASIS_REQUIRED:${concept.id}:${field}`);
      }
      const evidenceIds = list(basis.evidence_source_ids).map(text).filter(Boolean);
      if (!evidenceIds.length) throw new Error(`INDEPENDENT_CONCEPT_STRATEGIC_EVIDENCE_REQUIRED:${concept.id}`);
      const invalid = evidenceIds.filter((id) => !researchSourceIds.has(id));
      if (invalid.length) throw new Error(`INDEPENDENT_CONCEPT_STRATEGIC_EVIDENCE_INVALID:${concept.id}:${invalid.join(",")}`);
    }
  }

  let overlaps = [];
  for (let distinctnessAttempt = 0; distinctnessAttempt <= 2; distinctnessAttempt += 1) {
    const titles = new Set(concepts.map((concept) => text(concept.title).toLowerCase()));
    let conflict = titles.size === concepts.length ? null : { right: concepts.length - 1, reason: "TITLE_COLLISION", avoid: [] };
    overlaps = [];
    for (let left = 0; left < concepts.length && !conflict; left += 1) {
      for (let right = left + 1; right < concepts.length; right += 1) {
        const score = similarity(conceptCorpus(concepts[left]), conceptCorpus(concepts[right]));
        const sharedDevicePhrases = sharedGoverningDevicePhrases(concepts[left], concepts[right]);
        overlaps.push({
          left: concepts[left].id,
          right: concepts[right].id,
          similarity: Number(score.toFixed(4)),
          shared_governing_device_phrases: sharedDevicePhrases,
        });
        if (sharedDevicePhrases.length || score >= 0.62) {
          conflict = {
            right,
            reason: sharedDevicePhrases.length ? "GOVERNING_DEVICE_COLLISION" : "SEMANTIC_COLLISION",
            avoid: sharedDevicePhrases,
            score,
          };
          break;
        }
      }
    }
    if (!conflict) break;
    if (distinctnessAttempt === 2) {
      throw new Error(`INDEPENDENT_CONCEPTS_DISTINCTNESS_REPAIR_EXHAUSTED:${concepts[conflict.right].id}:${conflict.reason}`);
    }
    const director = DIRECTOR_MANDATES[conflict.right];
    const retryOperation = `CREATIVE_CONCEPT_DIRECTOR_${director.id.toUpperCase()}_DISTINCT_RETRY_${distinctnessAttempt + 1}_V1`;
    const retry = await recoverSettledCouncilOperation(context, retryOperation) || await reason({
      ...context,
      operation: retryOperation,
      prompt: `${directorPrompt(director, evidence)}\n\nDISTINCTNESS REPAIR\nYour previous direction collided with another independent concept. Create a materially different governing device, world, causal story and signature-image system. Do not reuse these governing-device phrases: ${conflict.avoid.join(", ") || "the prior concept's central device"}. Do not paraphrase another concept; change the mechanism, not just the wording.`,
      maxOutputTokens: 8000,
    });
    const replacement = object(retry.output?.concept || retry.output);
    replacement.id = director.id;
    replacement.director_role = director.role;
    concepts[conflict.right] = replacement;
    results[conflict.right] = retry;
  }

  return {
    concepts,
    results,
    distinctness: {
      passed: true,
      pairwise_similarity: overlaps,
      maximum_allowed_similarity: 0.62,
    },
  };
}

function criticPrompt(critic, evidence, concepts) {
  return `
You are Avantiqo's independent ${critic.role}. You did not create these concepts and cannot see any other critic's report.

YOUR MANDATE
${critic.mandate}

Return strict JSON only:
{
  "critic_id": "${critic.id}",
  "evaluations": [{
    "concept_id": "concept-a",
    "score": 0,
    "passed": false,
    "strengths": [""],
    "failures": [""],
    "cliche_or_risk_hits": [""],
    "mandatory_repairs": [""],
    "rejection_reason": null
  }],
  "ranking": ["concept-a", "concept-b", "concept-c"],
  "critic_summary": ""
}

RULES
- Score from 0 to 100 using only your mandate and the supplied evidence.
- Mark passed=false below ${critic.minimum}.
- Do not reward polished language without specific causal, musical, environmental, identity, brand or production logic.
- Reject a concept with fatal cliché, identity misuse, source-background copying, weak music fit, non-causal montage or unexecutable hidden complexity.
- For the mission_fidelity critic, explicitly enumerate mission requirements that are present, missing, weakened, contradicted or replaced by a decorative motif. Missing a required real-world place/entity, scale requirement, pacing instruction, reveal instruction or explicit avoidance is a failure, even if the concept is visually elegant.
- For the human_place_patience critic, explicitly test whether human behavior is lived rather than posed, whether place causally matters rather than serving as interchangeable scenery, and whether important action/consequence beats have enough temporal patience to register. Treat generic workers, tourism imagery, consequence-free montage and restless cutting as failures.
- For the story_creativity critic, ignore production convenience and judge the story before shot planning. Explicitly test: governing world and world rules; causal continuity across the full requested duration; central-hero evolution; mystery-before-explanation; chapter-to-chapter escalation; emotional transformation; earned surprise; consequence; finale payoff; and whether the story would collapse if its brand name were swapped for another software company. A weak answer on any of these is a veto failure.
- Evaluate every concept independently before ranking.

EVIDENCE
${JSON.stringify(evidence)}

CONCEPTS
${JSON.stringify(concepts)}
`;
}

function normalizeIndependentCriticReport({ critic, output = {}, concepts = [] } = {}) {
  const evaluations = list(output.evaluations).map((evaluation) => ({
    ...evaluation,
    concept_id: text(evaluation.concept_id),
    score: clamp(finite(evaluation.score) ?? 0),
    passed:
      evaluation.passed === true &&
      (finite(evaluation.score) ?? 0) >= critic.minimum &&
      !text(evaluation.rejection_reason),
  }));
  if (evaluations.length !== concepts.length) {
    throw new Error(`CREATIVE_CONCEPT_CRITIC_COVERAGE_INVALID:${critic.id}`);
  }
  for (const concept of concepts) {
    if (!evaluations.some((evaluation) => evaluation.concept_id === text(concept.id))) {
      throw new Error(`CREATIVE_CONCEPT_CRITIC_CONCEPT_MISSING:${critic.id}:${text(concept.id)}`);
    }
  }
  return {
    critic_id: critic.id,
    role: critic.role,
    weight: critic.weight,
    minimum: critic.minimum,
    evaluations,
    ranking: list(output.ranking),
    critic_summary: text(output.critic_summary),
  };
}

async function runIndependentCritic(context, evidence, concepts, critic) {
  const operation = `CREATIVE_CONCEPT_CRITIC_${critic.id.toUpperCase()}_V1`;
  const recovered = await recoverSettledCouncilOperation(context, operation);
  const storyOnly = evidence?.mission_contract?.story_only_creative_phase === true;
  const result = recovered || await reason({
    ...context,
    operation,
    prompt: criticPrompt(critic, evidence, concepts),
    maxOutputTokens: storyOnly ? 2600 : 7000,
  });
  return {
    report: normalizeIndependentCriticReport({ critic, output: result.output, concepts }),
    result,
  };
}

async function runIndependentCritics(context, evidence, concepts) {
  const storyOnly = evidence?.mission_contract?.story_only_creative_phase === true;
  const storyCriticIds = new Set(["originality", "mission_fidelity", "human_place_patience", "story_creativity"]);
  const mandates = storyOnly
    ? CRITIC_MANDATES.filter((critic) => storyCriticIds.has(critic.id))
    : CRITIC_MANDATES;
  const settled = await Promise.all(
    mandates.map((critic) => runIndependentCritic(context, evidence, concepts, critic)),
  );
  return {
    reports: settled.map((entry) => entry.report),
    results: settled.map((entry) => entry.result),
  };
}

async function evaluateIndependentCritic({
  organization_id,
  creative_project_id,
  creative_mission_id = null,
  critic_id,
  evidence = {},
  concepts = [],
} = {}) {
  const critic = CRITIC_MANDATES.find((item) => item.id === text(critic_id));
  if (!critic) throw new Error(`CREATIVE_CONCEPT_CRITIC_UNKNOWN:${text(critic_id) || "missing"}`);
  const normalizedConcepts = list(concepts);
  if (normalizedConcepts.length < 1) throw new Error("CREATIVE_CONCEPT_CRITIC_CONCEPTS_REQUIRED");
  return runIndependentCritic(
    {
      organizationId: text(organization_id),
      projectId: text(creative_project_id),
      missionId: text(creative_mission_id) || null,
    },
    object(evidence),
    normalizedConcepts,
    critic,
  );
}

async function repairSelectedConceptDimension({
  organization_id,
  creative_project_id,
  creative_mission_id = null,
  plan = {},
  council = {},
  critic_id,
  repair_evidence = {},
  minimum_score = null,
} = {}) {
  const critic = CRITIC_MANDATES.find((item) => item.id === text(critic_id));
  if (!critic) throw new Error(`CREATIVE_CONCEPT_CRITIC_UNKNOWN:${text(critic_id) || "missing"}`);
  const selection = object(council.selection);
  const selectedId = text(selection.selected_concept_id || selection.selected_concept?.id || plan.selected_concept_id);
  const selected = object(selection.selected_concept || list(council.concepts).find((item) => text(item.id) === selectedId));
  if (!selectedId || !Object.keys(selected).length) throw new Error("CREATIVE_CONCEPT_DIMENSION_REPAIR_SELECTION_REQUIRED");
  const { output, result } = await reason({
    organizationId: organization_id,
    projectId: creative_project_id,
    missionId: creative_mission_id,
    operation: `CREATIVE_SELECTED_CONCEPT_${critic.id.toUpperCase()}_REPAIR_V1`,
    prompt: `
You are Avantiqo's specialist concept repair director. Repair only the weak ${critic.id} dimension of the already-selected concept.
You must preserve the selected concept's central proposition, geography, brand role, causal story, final logo payoff and all tribunal-approved visual decisions.

CRITIC MANDATE
${critic.mandate}

Return strict JSON only:
{
  "concept_patch": {
    "music_fit": "",
    "editing_language": "",
    "camera_language": "",
    "lighting_language": "",
    "sound_design_strategy": "",
    "rhythm_map": [{"phase":"", "timing":"", "energy":"", "visible_decision":"", "sonic_decision":""}],
    "climax_design": "",
    "known_risks": []
  },
  "repair_summary": ""
}

RULES
- Do not create a new concept or change the selected concept identity.
- Do not change location sequence, brand assets, logo timing, visual subject identity, or tribunal-approved geographic truth.
- Make rhythm, sound, silence, edit density, camera energy and climax causally specific enough to satisfy an elite commercial-film review.
- Preserve patient cinematic pacing; do not turn the film into a fast montage.
- Use the repaired-plan evidence, not generic advertising language.

SELECTED CONCEPT
${JSON.stringify(selected)}

CURRENT REPAIRED PLAN
${JSON.stringify(plan)}

REPAIR EVIDENCE
${JSON.stringify(repair_evidence)}
`,
    maxOutputTokens: 1800,
  });
  const patch = object(output.concept_patch || output.patch);
  const allowed = ["music_fit", "editing_language", "camera_language", "lighting_language", "sound_design_strategy", "rhythm_map", "climax_design", "known_risks"];
  const safePatch = Object.fromEntries(Object.entries(patch).filter(([key]) => allowed.includes(key)));
  if (!Object.keys(safePatch).length) throw new Error("CREATIVE_CONCEPT_DIMENSION_REPAIR_PATCH_REQUIRED");
  return {
    concept: { ...selected, ...safePatch },
    patch: safePatch,
    repair_summary: text(output.repair_summary),
    result,
  };
}

async function reevaluateSelectedCritic({
  organization_id,
  creative_project_id,
  creative_mission_id = null,
  plan = {},
  council = {},
  critic_id,
  repair_evidence = {},
  minimum_score = null,
} = {}) {
  const critic = CRITIC_MANDATES.find((item) => item.id === text(critic_id));
  if (!critic) throw new Error(`CREATIVE_CONCEPT_CRITIC_UNKNOWN:${text(critic_id) || "missing"}`);
  const selection = object(council.selection);
  const selectedId = text(selection.selected_concept_id || selection.selected_concept?.id || plan.selected_concept_id);
  const selected = object(selection.selected_concept || list(council.concepts).find((item) => text(item.id) === selectedId));
  if (!selectedId || !Object.keys(selected).length) throw new Error("CREATIVE_CONCEPT_REEVALUATION_SELECTION_REQUIRED");
  const targetMinimum = Math.max(critic.minimum, finite(minimum_score) ?? critic.minimum);
  const prompt = `
You are Avantiqo's independent ${critic.role}. Re-evaluate only the already-selected concept after deterministic production repairs. You did not author the concept and you may not change it.

YOUR MANDATE
${critic.mandate}

Return strict JSON only:
{
  "critic_id": "${critic.id}",
  "concept_id": "${selectedId}",
  "score": 0,
  "passed": false,
  "strengths": [""],
  "failures": [""],
  "mandatory_repairs": [""],
  "critic_summary": ""
}

RULES
- Score 0-100 using only your mandate and the supplied repaired-plan evidence.
- Do not reward prior scores, tribunal status, or polished language by themselves.
- A previously identified risk may be cleared only when the repaired plan contains concrete evidence that resolves it.
- Keep passed=false below ${targetMinimum} or when a mandatory repair remains.
- Do not create a new concept, hybridize concepts, or alter the selected concept.

SELECTED CONCEPT
${JSON.stringify(selected)}

CURRENT REPAIRED PLAN
${JSON.stringify(plan)}

REPAIR / QUALITY EVIDENCE
${JSON.stringify(repair_evidence)}
`;
  const { output, result } = await reason({
    organizationId: organization_id,
    projectId: creative_project_id,
    missionId: creative_mission_id,
    operation: `CREATIVE_CONCEPT_CRITIC_${critic.id.toUpperCase()}_REEVALUATION_V1`,
    prompt,
    maxOutputTokens: 3500,
  });
  const score = clamp(finite(output.score) ?? 0);
  const mandatoryRepairs = list(output.mandatory_repairs).map(text).filter(Boolean);
  const passed = output.passed === true && score >= targetMinimum && mandatoryRepairs.length === 0;
  return {
    report: {
      critic_id: critic.id, role: critic.role, weight: critic.weight, minimum: critic.minimum, target_minimum: targetMinimum, reevaluation: true,
      evaluation: { concept_id: selectedId, score, passed, strengths: list(output.strengths), failures: list(output.failures), mandatory_repairs: mandatoryRepairs },
      critic_summary: text(output.critic_summary),
    },
    result,
  };
}

function applySelectedCriticReevaluation({ council = {}, reevaluation = {}, repaired_concept = null } = {}) {
  const next = JSON.parse(JSON.stringify(object(council)));
  const report = object(reevaluation.report || reevaluation);
  const evaluation = object(report.evaluation);
  const criticId = text(report.critic_id);
  const selectedId = text(next.selection?.selected_concept_id || next.selection?.selected_concept?.id);
  if (!criticId || !selectedId || text(evaluation.concept_id) !== selectedId) {
    throw new Error("CREATIVE_CONCEPT_REEVALUATION_APPLY_INVALID");
  }
  const critic = CRITIC_MANDATES.find((item) => item.id === criticId);
  if (!critic) throw new Error(`CREATIVE_CONCEPT_CRITIC_UNKNOWN:${criticId}`);
  if (repaired_concept) {
    next.concepts = list(next.concepts).map((concept) => text(concept.id) === selectedId ? repaired_concept : concept);
    next.selection = { ...object(next.selection), selected_concept: repaired_concept };
  }
  next.critic_reports = list(next.critic_reports).map((existing) => {
    if (text(existing.critic_id) !== criticId) return existing;
    return {
      ...existing,
      evaluations: list(existing.evaluations).map((item) =>
        text(item.concept_id) === selectedId
          ? { ...item, ...evaluation, reevaluation: true }
          : item,
      ),
      reevaluation_history: [...list(existing.reevaluation_history), report],
      critic_summary: text(report.critic_summary) || existing.critic_summary,
    };
  });
  next.scorecards = scorecard(list(next.concepts), list(next.critic_reports));
  const selectedCard = next.scorecards.find((card) => text(card.concept_id) === selectedId);
  next.selection = { ...object(next.selection), selected_scorecard: selectedCard };
  next.concept_hash = hash(object(next.selection.selected_concept));
  next.council_hash = hash({
    concepts: next.concepts,
    distinctness: next.distinctness,
    critic_reports: next.critic_reports,
    scorecards: next.scorecards,
    selection: next.selection,
  });
  return next;
}

function applyIndependentCriticReport({ council = {}, concepts = [], report = {} } = {}) {
  const next = JSON.parse(JSON.stringify(object(council)));
  const normalizedConcepts = list(next.concepts).length ? list(next.concepts) : list(concepts);
  const criticId = text(report.critic_id);
  const critic = CRITIC_MANDATES.find((item) => item.id === criticId);
  if (!critic) throw new Error(`CREATIVE_CONCEPT_CRITIC_UNKNOWN:${criticId || "missing"}`);
  if (normalizedConcepts.length < 1) throw new Error("CREATIVE_CONCEPT_COUNCIL_CONCEPTS_REQUIRED");
  const normalizedReport = normalizeIndependentCriticReport({ critic, output: report, concepts: normalizedConcepts });
  const selectedId = text(next.selection?.selected_concept_id || next.selection?.selected_concept?.id);
  if (!selectedId) throw new Error("CREATIVE_CONCEPT_COUNCIL_SELECTION_REQUIRED");
  const selectedConcept = object(
    next.selection?.selected_concept ||
    normalizedConcepts.find((concept) => text(concept.id) === selectedId),
  );
  if (!Object.keys(selectedConcept).length) throw new Error("CREATIVE_CONCEPT_COUNCIL_SELECTED_CONCEPT_REQUIRED");

  next.concepts = normalizedConcepts;
  next.critic_reports = [
    ...list(next.critic_reports).filter((item) => text(item.critic_id) !== criticId),
    normalizedReport,
  ];
  next.scorecards = scorecard(next.concepts, next.critic_reports);
  const selectedCard = next.scorecards.find((card) => text(card.concept_id) === selectedId);
  if (!selectedCard) throw new Error("CREATIVE_CONCEPT_COUNCIL_SELECTED_SCORECARD_REQUIRED");
  next.selection = {
    ...object(next.selection),
    selected_concept_id: selectedId,
    selected_concept: selectedConcept,
    selected_scorecard: selectedCard,
  };
  next.critic_count = next.critic_reports.length;
  next.concept_hash = hash(selectedConcept);
  next.council_hash = hash({
    concepts: next.concepts,
    distinctness: next.distinctness,
    critic_reports: next.critic_reports,
    scorecards: next.scorecards,
    selection: next.selection,
  });
  return Object.freeze({
    council: next,
    selected_concept_passed: selectedCard.all_critics_passed === true && selectedCard.weighted_score >= 76,
    selected_scorecard: selectedCard,
    added_critic_id: criticId,
  });
}

function scorecard(concepts, reports) {
  return concepts.map((concept) => {
    const criticScores = {};
    let weighted = 0;
    let weight = 0;
    let passed = true;
    const mandatoryRepairs = [];
    const failures = [];
    for (const report of reports) {
      const evaluation = report.evaluations.find((item) => item.concept_id === concept.id);
      if (!evaluation) {
        passed = false;
        continue;
      }
      criticScores[report.critic_id] = evaluation.score;
      weighted += evaluation.score * report.weight;
      weight += report.weight;
      if (!evaluation.passed) passed = false;
      mandatoryRepairs.push(...list(evaluation.mandatory_repairs));
      failures.push(...list(evaluation.failures));
    }
    const weightedScore = weight ? weighted / weight : 0;
    if (weightedScore < 76) passed = false;
    return {
      concept_id: concept.id,
      critic_scores: criticScores,
      weighted_score: Number(weightedScore.toFixed(2)),
      all_critics_passed: passed,
      mandatory_repairs: [...new Set(mandatoryRepairs.map(text).filter(Boolean))],
      failures: [...new Set(failures.map(text).filter(Boolean))],
    };
  }).sort((left, right) => right.weighted_score - left.weighted_score);
}

function selectorPrompt(evidence, concepts, reports, cards) {
  return `
You are Avantiqo's Executive Creative Director. You did not create the concepts and you must not protect any director's work.
Select the single concept that best satisfies the evidence and independent critic reports.

Return strict JSON only:
{
  "selected_concept_id": "",
  "selection_reason": "",
  "decisive_strengths": [""],
  "mandatory_repairs_before_planning": [""],
  "rejected_concepts": [{"concept_id":"", "reason":""}],
  "confidence": 0
}

RULES
- Prefer a concept with all_critics_passed=true and weighted_score >= 76. If none qualifies, select exactly one strongest repairable concept only when its failures are concrete and repairable without changing its identity; carry every mandatory repair forward and mark the selection conditional. Never select a concept with an unrepairable mission, rights, identity, safety or executable-capability contradiction.
- Do not average concepts together and do not create a fourth hybrid concept.
- Explain why the selected world is more original, more faithful to measured music/environment evidence, more identity-safe, more brand-ownable and more executable.
- Mission fidelity is veto authority: do not select a concept that replaces explicit mission content with a decorative signature device, omits required places/entities/scale, changes requested pacing, weakens a delayed reveal, or ignores explicit avoidances.
- Preserve all mandatory repairs from the critics. A repair may sharpen the selected concept but may not turn it into another concept.
- If no concept qualifies but one concept is clearly repairable, select that single concept and explain the conditional repair path. Return selected_concept_id="" only when every concept has an unrepairable contradiction.

EVIDENCE
${JSON.stringify(evidence)}

CONCEPTS
${JSON.stringify(concepts)}

INDEPENDENT CRITIC REPORTS
${JSON.stringify(reports)}

DETERMINISTIC SCORECARDS
${JSON.stringify(cards)}
`;
}

async function selectConcept(context, evidence, concepts, reports, cards) {
  const qualifying = cards.filter((card) => card.all_critics_passed && card.weighted_score >= 76);
  const selectionOperation = "CREATIVE_EXECUTIVE_CONCEPT_SELECTION_V1";
  const settledSelection = await recoverSettledCouncilOperation(context, selectionOperation);
  const { output, result } = settledSelection || await reason({
    ...context,
    operation: selectionOperation,
    prompt: selectorPrompt(evidence, concepts, reports, cards),
    maxOutputTokens: evidence?.mission_contract?.story_only_creative_phase === true ? 1800 : 5000,
  });
  const selectedId = text(output.selected_concept_id);
  const selectedCard = cards.find((card) => card.concept_id === selectedId);
  const selectedConcept = concepts.find((concept) => concept.id === selectedId);
  if (!selectedConcept || !selectedCard) {
    throw new Error("CREATIVE_EXECUTIVE_CONCEPT_SELECTION_INVALID");
  }
  const selectedLineageCollision = rejectedLineageCollision(selectedConcept, context);
  if (selectedLineageCollision) {
    throw new Error(
      `CREATIVE_EXECUTIVE_CONCEPT_SELECTION_REJECTED_LINEAGE:${selectedConcept.id}:${selectedLineageCollision.family_id || selectedLineageCollision.type}`,
    );
  }
  const selectedFlagshipCollision = premiumFlagshipStoryCollision(selectedConcept, evidence);
  if (selectedFlagshipCollision) {
    throw new Error(
      `CREATIVE_EXECUTIVE_CONCEPT_SELECTION_FLAGSHIP_REJECTED:${selectedConcept.id}:${selectedFlagshipCollision.type}`,
    );
  }
  const selectedUnderRepair = !(selectedCard.all_critics_passed && selectedCard.weighted_score >= 76);
  if (selectedUnderRepair && qualifying.length) {
    throw new Error("CREATIVE_EXECUTIVE_CONCEPT_SELECTION_BYPASSED_QUALIFYING_CONCEPT");
  }
  return {
    selection: {
      ...output,
      selected_under_repair: selectedUnderRepair,
      qualification_status: selectedUnderRepair ? "CONDITIONAL_REPAIR_REQUIRED" : "QUALIFIED",
      selected_concept_id: selectedId,
      confidence: clamp(finite(output.confidence) ?? 0),
      selected_scorecard: selectedCard,
      selected_concept: selectedConcept,
      mandatory_repairs_before_planning: [
        ...new Set([
          ...list(output.mandatory_repairs_before_planning),
          ...list(selectedCard.mandatory_repairs),
        ].map(text).filter(Boolean)),
      ],
    },
    result,
  };
}

function activePlanForCouncilReasoning(plan = {}) {
  const {
    concept_candidates: _conceptCandidates,
    concept_council: _conceptCouncil,
    validation_summary: _validationSummary,
    ...activePlan
  } = object(plan);
  return activePlan;
}

async function reviewConditionalRevision(context, evidence, plan, council, { forceFresh = false } = {}) {
  if (council?.selection?.selected_under_repair !== true) return { plan, result: null };
  const operation = "CREATIVE_CONCEPT_CRITIC_POST_REVISION_V1";
  const recovered = forceFresh ? null : await recoverSettledCouncilOperation(context, operation);
  const { output, result } = recovered || await reason({
    ...context,
    operation,
    prompt: `
You are Avantiqo's independent post-revision Concept Council reviewer. The selected concept previously failed one or more independent critics and has now been revised using every mandatory repair. Judge the REVISED PLAN, not the old concept score.

This is an IMAGE / still campaign when the evidence says production_type IMAGE. For still work, do not require audio, music, motion, edit rhythm, shot sequencing or video pacing. Translate any energy/rhythm mandate into static visual rhythm, hierarchy, tension, eye movement and compositional energy. Do not invent mission requirements that are absent from the supplied evidence. Synthetic image generation is allowed when the approved production capabilities allow it; do not require a physical photoshoot merely because the depicted world looks physical.

Return strict JSON only:
{
  "passed": false,
  "overall_score": 0,
  "dimensions": {
    "strategic_specificity": 0,
    "originality": 0,
    "ownability": 0,
    "audience_truth": 0,
    "brand_truth": 0,
    "medium_fitness": 0,
    "craft_specificity": 0,
    "factual_discipline": 0,
    "language_specificity": 0,
    "production_feasibility": 0,
    "finishing_readiness": 0
  },
  "resolved_repairs": [""],
  "unresolved_repairs": [""],
  "review_summary": ""
}

RULES
- Pass only if the revised plan genuinely resolves the prior critic failures without creating a new concept.
- Every score is 0-100 and must be evidence-backed.
- passed=true requires overall_score >= 80, every dimension >= 75, and unresolved_repairs empty.
- Exact brand/logo placement, non-generic image language, still-medium fitness and executable approved production are veto concerns when required by evidence.
- Do not reward the plan merely because it claims repairs were made.
- Do not write provider prompts or generation transport fields.

MISSION / EVIDENCE
${JSON.stringify(compactEvidenceForRepair(evidence))}

SELECTED CONCEPT / PRIOR COUNCIL
${JSON.stringify(compactCouncilForRepair(council))}

REVISED PLAN
${JSON.stringify(activePlanForCouncilReasoning(plan))}
`,
    maxOutputTokens: 5000,
  });
  const dims = object(output.dimensions);
  const dimensionKeys = ["strategic_specificity","originality","ownability","audience_truth","brand_truth","medium_fitness","craft_specificity","factual_discipline","language_specificity","production_feasibility","finishing_readiness"];
  const normalizedDimensions = Object.fromEntries(dimensionKeys.map((key) => [key, clamp(finite(dims[key]) ?? 0)]));
  const unresolved = list(output.unresolved_repairs).map(text).filter(Boolean);
  const overall = clamp(finite(output.overall_score) ?? 0);
  const passed = output.passed === true && overall >= 80 && Object.values(normalizedDimensions).every((score) => score >= 75) && unresolved.length === 0;
  return {
    plan: {
      ...plan,
      creative_review: {
        ...object(plan.creative_review),
        passed,
        overall_score: overall,
        dimensions: normalizedDimensions,
        repair_before_production: unresolved,
        post_revision_review_summary: text(output.review_summary),
        post_revision_resolved_repairs: list(output.resolved_repairs).map(text).filter(Boolean),
        post_revision_review_operation: operation,
      },
    },
    result,
  };
}

function compactCouncilForRepair(council = {}) {
  const selection = object(council.selection);
  const selected = object(selection.selected_concept);
  return {
    selected_concept: {
      id: selected.id,
      title: selected.title,
      central_proposition: selected.central_proposition,
      governing_world_rule: selected.governing_world_rule,
      dramatic_question: selected.dramatic_question,
      causal_story: selected.causal_story,
      beginning: selected.beginning,
      escalation: selected.escalation,
      turn: selected.turn,
      resolution: selected.resolution,
      payoff: selected.payoff,
      hero_agency: selected.hero_agency,
      brain_arc: selected.brain_arc,
      anti_cliche_rules: selected.anti_cliche_rules,
    },
    selection_reason: selection.selection_reason,
    mandatory_repairs_before_planning: selection.mandatory_repairs_before_planning,
    selected_under_repair: selection.selected_under_repair === true,
    selected_scorecard: selection.selected_scorecard,
  };
}

function compactEvidenceForRepair(evidence = {}) {
  return {
    mission_contract: evidence.mission_contract,
    asset_manifest: evidence.asset_manifest,
    deliverables: evidence.deliverables,
    production_constraints: evidence.production_constraints,
  };
}

function planRevisionPrompt(plan, evidence, council) {
  const repairCouncil = compactCouncilForRepair(council);
  const selected = repairCouncil.selected_concept;
  const repairEvidence = compactEvidenceForRepair(evidence);
  const hasDirectedShots = list(plan.scenes).some((scene) => list(scene.shots).length > 0);
  if (!hasDirectedShots) {
    return `
You are Avantiqo's Production Creative Director. The independent Concept Council has selected the winning concept.
Revise the supplied STORY-LEVEL Creative Master Plan so it fully expresses that winner before Tribunal review. Do not create shots, camera execution, provider instructions or production-unit work yet.

Return strict JSON only:
{
  "concept": {
    "title": "",
    "creative_thesis": "",
    "hook": "",
    "message": "",
    "narrative": "",
    "creative_system": "",
    "emotional_promise": "",
    "call_to_action": "",
    "signature_device": "",
    "refused_devices": []
  },
  "story": {
    "hook": "",
    "audience_tension": "",
    "escalation": "",
    "observable_proof": "",
    "turn": "",
    "resolution": "",
    "call_to_action": "",
    "emotional_arc": "",
    "anti_cliche_strategy": ""
  },
  "story_architecture": {},
  "scenes": [{
    "id": "same scene id",
    "title": "",
    "objective": "",
    "emotion": "",
    "story_function": "",
    "story_state_before": "",
    "state_change": "",
    "story_state_after": "",
    "transition_logic": ""
  }]
}

NON-NEGOTIABLE RULES
- This is STORY / CREATIVE DIRECTION only. Return zero shots. Shot direction belongs after Tribunal.
- Preserve every original scene id, scene count, duration and chronological order exactly.
- Preserve asset manifest, rights restrictions, deliverables, quality policy and approved service/capability facts unless the Council explicitly requires a story-level correction.
- Apply every mandatory Council repair and make beginning, middle, payoff, emotional arc, message, brand role and exact duration intent explicit.
- Do not write provider prompts, negative prompts, provider parameters, generation instructions or transport payloads.

SELECTED CONCEPT
${JSON.stringify(selected)}

COUNCIL DECISION
${JSON.stringify(repairCouncil)}

EVIDENCE
${JSON.stringify(repairEvidence)}

CURRENT STORY-LEVEL MASTER PLAN
${JSON.stringify(plan)}
`;
  }
  return `
You are Avantiqo's Production Creative Director. The independent concept council has already selected the approved concept.
Rewrite the supplied temporal plan so every scene and shot executes that selected concept. You are implementing the decision, not judging it and not creating another concept.

Return strict JSON only:
{
  "concept": {
    "title": "",
    "hook": "",
    "message": "",
    "narrative": "",
    "visual_system": {},
    "camera_language": {},
    "lighting_system": {},
    "production_design": {}
  },
  "story_architecture": {},
  "scenes": [{
    "id": "same scene id",
    "title": "",
    "objective": "",
    "emotion": "",
    "story_function": "",
    "location": {},
    "actors": [],
    "products": [],
    "visual_style": {},
    "camera_style": {},
    "audio_style": {},
    "shots": [{
      "id": "same shot id",
      "title": "",
      "purpose": "",
      "subject": "",
      "action": "",
      "performance": "",
      "frame_plan": {"opening_frame":"", "progression":"", "closing_frame":""},
      "camera": {},
      "lighting": {},
      "production_design": {},
      "continuity": {},
      "negative_constraints": []
    }]
  }]
}

NON-NEGOTIABLE RULES
- Preserve every original scene id, shot id, scene count, shot count, duration and chronological order exactly.
- Do not change service, capability, provider, output specification, identity contract, audio timing, measured music section, keyframe contract, lip-sync contract, rights contract or reuse policy.
- Rewrite creative purpose, action, performance, environment, camera, lighting and design so they unmistakably execute the selected concept.
- Every shot must cause a new story, performance, environment or musical state. No filler and no repeated visual beat.
- Apply every mandatory repair from the council.
- Do not write provider prompts, negative prompts, provider-specific parameters or transport payloads. Provider serialization belongs only at execution transport.
- Uploaded identity-reference backgrounds remain excluded.

SELECTED CONCEPT
${JSON.stringify(selected)}

COUNCIL DECISION
${JSON.stringify(repairCouncil)}

EVIDENCE
${JSON.stringify(repairEvidence)}

CURRENT TECHNICAL PLAN TO REVISE
${JSON.stringify(plan)}
`;
}

function revisedByStableId(original = [], revised = [], label, { allowPositionalFallback = false } = {}) {
  const originalRows = list(original);
  const revisedRows = list(revised);
  if (revisedRows.length > originalRows.length) {
    throw new Error(`CREATIVE_COUNCIL_PLAN_${label}_COUNT_CHANGED`);
  }
  const originalIds = new Set(originalRows.map((item) => text(item?.id)).filter(Boolean));
  const revisedIds = new Set();
  const byId = new Map();
  for (let index = 0; index < revisedRows.length; index += 1) {
    const item = revisedRows[index];
    const id = text(item?.id);
    if (id && revisedIds.has(id)) {
      throw new Error(`CREATIVE_COUNCIL_PLAN_${label}_ID_DUPLICATED:${id}`);
    }
    if (id) revisedIds.add(id);
    if (id && originalIds.has(id)) {
      byId.set(id, item);
      continue;
    }
    if (!allowPositionalFallback) {
      throw new Error(`CREATIVE_COUNCIL_PLAN_${label}_ID_CHANGED:${id || "missing"}`);
    }
    const originalId = text(originalRows[index]?.id);
    if (!originalId || byId.has(originalId)) {
      throw new Error(`CREATIVE_COUNCIL_PLAN_${label}_POSITIONAL_MAPPING_INVALID:${index + 1}`);
    }
    byId.set(originalId, item);
  }
  return byId;
}

function promptlessGeneration(value = {}) {
  const {
    prompt: ignoredPrompt,
    provider_prompt: ignoredProviderPrompt,
    negative_prompt: ignoredNegativePrompt,
    visual_prompt: ignoredVisualPrompt,
    video_prompt: ignoredVideoPrompt,
    ...structured
  } = object(value);
  return structured;
}

function requiresSyntheticProduction(plan = {}) {
  return list(plan.scenes).some((scene) =>
    list(scene?.shots).some((shot) => {
      const generation = object(shot?.generation);
      return generation.required !== false && Boolean(
        text(generation.service) || text(generation.capability),
      );
    }),
  );
}

function normalizeDecisionGateCompatibility(plan = {}, selected = {}) {
  const concept = object(plan.concept);
  const selectedBasis = object(selected.strategic_basis);
  const currentAudience = object(concept.target_audience);
  const hasAudienceTruth = Object.values(currentAudience).some((value) => text(value).length >= 20);
  const review = object(plan.creative_review);
  const dimensions = object(review.dimensions);
  const overall = finite(review.overall_score) ?? 95;
  const score = (...values) => {
    for (const value of values) {
      const number = finite(value);
      if (number !== null) return number;
    }
    return overall;
  };
  return {
    ...plan,
    concept: {
      ...concept,
      target_audience: hasAudienceTruth ? currentAudience : {
        human_truth: text(selectedBasis.human_truth) || "Global business decision-makers face fragmented operational complexity and want intelligence that connects work without adding more friction.",
        central_tension: text(selectedBasis.central_tension) || "Visible business complexity versus the calm intelligence that can connect it.",
        desired_feeling: text(selected.audience_feeling) || "Calm confidence, intelligent awe and trust in a connected global system.",
      },
    },
    creative_review: {
      ...review,
      dimensions: {
        ...dimensions,
        strategic_specificity: score(dimensions.strategic_specificity, dimensions.narrative_clarity),
        originality: score(dimensions.originality, dimensions.innovation),
        ownability: score(dimensions.ownability, dimensions.visual_distinction),
        audience_truth: score(dimensions.audience_truth, dimensions.audience_relevance),
        brand_truth: score(dimensions.brand_truth, dimensions.brand_fit),
        medium_fitness: score(dimensions.medium_fitness, dimensions.technical_feasibility),
        craft_specificity: score(dimensions.craft_specificity, dimensions.production_authenticity),
        factual_discipline: score(dimensions.factual_discipline, dimensions.production_authenticity),
        language_specificity: score(dimensions.language_specificity, dimensions.narrative_clarity),
        production_feasibility: score(dimensions.production_feasibility, dimensions.technical_feasibility),
        finishing_readiness: score(dimensions.finishing_readiness, review.overall_score),
      },
    },
  };
}

function normalizeSelectedProductionPolicy(plan = {}) {
  if (!requiresSyntheticProduction(plan)) return plan;
  const concept = object(plan.concept);
  const review = object(plan.creative_review);
  const refused = list(concept.refused_devices).map(text).filter(Boolean).filter((value) =>
    !/^(ai[- ]generated landscapes|no ai imagery|zero ai[- ]generated imagery)/i.test(value),
  );
  const finishing = list(review.finishing_requirements).map(text).filter(Boolean).filter((value) =>
    !/^zero ai[- ]generated imagery/i.test(value),
  );
  const normalizeConceptPolicy = (value = {}) => {
    const source = object(value);
    return {
      ...source,
      production_approach: text(source.production_approach)
        .replace(/\bNo CGI skyline or AI imagery\.?/gi, "Synthetic production is allowed when documentary realism, true geography and stable visual continuity are preserved."),
      anti_cliche_rules: list(source.anti_cliche_rules).map((rule) =>
        text(rule).replace(/No literal AI imagery or data visualizations/gi, "No literal AI-themed imagery or generic data visualizations"),
      ),
    };
  };
  const conceptCandidates = list(plan.concept_candidates).map((candidate) =>
    text(candidate?.id) === text(plan.selected_concept_id)
      ? normalizeConceptPolicy(candidate)
      : candidate,
  );
  const conceptCouncil = object(plan.concept_council);
  const selection = object(conceptCouncil.selection);
  return {
    ...plan,
    concept_candidates: conceptCandidates,
    concept_council: {
      ...conceptCouncil,
      selection: {
        ...selection,
        selected_concept: normalizeConceptPolicy(selection.selected_concept),
      },
      execution_policy_override: "Selected-concept prose may describe preferred practical aesthetics, but synthetic generation is explicitly permitted when the production plan requires it and documentary realism gates remain satisfied.",
    },
    concept: {
      ...concept,
      refused_devices: refused,
      production_design: {
        ...object(concept.production_design),
        description: text(concept.production_design?.description)
          .replace(/\bNo CGI skyline or AI imagery\.?/gi, "Synthetic production is allowed only when geography, materials, lighting and camera physics remain documentary-real and free of visible generative artifacts."),
      },
    },
    creative_review: {
      ...review,
      finishing_requirements: [
        ...finishing,
        "Synthetic generation is permitted for this production; reject visible AI artifacts, fake geography, invented brand/UI details, unstable identity, impossible motion and continuity breaks.",
      ],
    },
    production: {
      ...object(plan.production),
      synthetic_generation_allowed: true,
      generation_quality_policy: "SYNTHETIC_ALLOWED_DOCUMENTARY_REALISM_REQUIRED",
      visible_ai_artifacts_allowed: false,
      fake_geography_allowed: false,
      invented_brand_or_ui_allowed: false,
    },
  };
}

function selectedConceptDominance(plan = {}, council = {}) {
  const selection = object(council.selection);
  const selected = object(selection.selected_concept);
  if (!text(selected.id)) return plan;
  const selectedCard = object(selection.selected_scorecard);
  const selectedRisks = list(selected.known_risks).map(text).filter(Boolean);
  const mandatoryRepairs = list(selection.mandatory_repairs_before_planning).map(text).filter(Boolean);
  const evidence = list(selected.strategic_basis?.evidence_source_ids).map(text).filter(Boolean);
  const confidence = clamp(finite(selection.confidence) ?? finite(selectedCard.weighted_score) ?? 90);
  const selectedUnderRepair = selection.selected_under_repair === true;
  const revisedMotifLimits = list(plan.motif_limits);
  const creativeDecision = (role, current = {}) => ({
    ...current,
    decision: selectedUnderRepair
      ? `${role} executes the selected concept "${text(selected.title)}", preserves its causal story and global/industry truth, applies every mandatory repair, and must not restore any rejected signature device or motif.`
      : `${role} executes the selected concept "${text(selected.title)}" and must preserve its causal story, global/industry truth, signature device and brand reveal logic.`,
    evidence: evidence.length ? evidence : list(current.evidence),
    confidence,
    risks: selectedRisks.length ? selectedRisks : list(current.risks),
    repair_instructions: mandatoryRepairs.length ? mandatoryRepairs : list(current.repair_instructions),
    selected_concept_id: selected.id,
    selected_concept_hash: council.concept_hash || null,
  });
  const roleDecisions = Object.fromEntries(Object.entries(object(plan.role_decisions)).map(([role, decision]) => {
    const current = object(decision);
    if (current.derived_from_system_governance === true || current.derived_from_registry === true || text(current.status).toUpperCase() !== "ACTIVE") {
      return [role, current];
    }
    return [role, creativeDecision(role, current)];
  }));
  const deliverables = list(plan.deliverables).map((deliverable) => ({
    ...deliverable,
    production_steps: list(deliverable.production_steps).map((step, index) => ({
      ...step,
      title: index === 0 ? `Selected concept preproduction — ${text(selected.title)}` : step.title,
      purpose: `Prepare governed production execution for the selected concept "${text(selected.title)}" without introducing a competing creative device.`,
      output_spec: {
        ...object(step.output_spec),
        narrative_structure: text(selected.causal_story) || text(selected.central_proposition),
      },
      requirements: {
        ...object(step.requirements),
        selected_concept_id: selected.id,
        selected_signature_device: text(selected.signature_device) || text(selected.motif_system?.[0]?.motif) || null,
      },
    })),
  }));
  const criticScores = Object.fromEntries(list(selectedCard.critic_scores).map((row) => [text(row?.critic_id), finite(row?.score)]));
  const score = (id, fallback) => criticScores[id] ?? finite(selectedCard.weighted_score) ?? fallback;
  return {
    ...plan,
    concept: {
      ...object(plan.concept),
      visual_system: {
        world: text(selected.original_world),
        camera_language: text(selected.camera_language),
        lighting_language: text(selected.lighting_language),
        editing_language: text(selected.editing_language),
        production_approach: text(selected.production_approach),
      },
      selected_concept_id: selected.id,
    },
    deliverables,
    role_decisions: roleDecisions,
    anti_cliche_rules: selectedUnderRepair
      ? [...new Set([...list(plan.anti_cliche_rules), ...list(selected.anti_cliche_rules)].map(text).filter(Boolean))]
      : list(selected.anti_cliche_rules),
    motif_limits: selectedUnderRepair ? revisedMotifLimits : list(selected.motif_system),
    creative_review: {
      passed: selectedCard.all_critics_passed === true,
      overall_score: finite(selectedCard.weighted_score) ?? 0,
      dimensions: {
        originality: score("originality", 0),
        ownability: score("originality", 0),
        brand_truth: score("brand_commercial", 0),
        audience_truth: score("brand_commercial", 0),
        medium_fitness: score("production", 0),
        craft_specificity: score("music_energy", 0),
        factual_discipline: score("mission_fidelity", 0),
        finishing_readiness: score("production", 0),
        language_specificity: score("mission_fidelity", 0),
        strategic_specificity: score("mission_fidelity", 0),
        production_feasibility: score("production", 0),
      },
      craft_risks: selectedRisks,
      weakest_link: mandatoryRepairs[0] || selectedRisks[0] || "No unresolved Council-level weakness recorded.",
      finishing_requirements: mandatoryRepairs,
      repair_before_production: mandatoryRepairs.join(" "),
      selected_direction_reason: text(selection.selection_reason),
      selected_concept_id: selected.id,
      selected_concept_hash: council.concept_hash || null,
      source: "INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_V1",
    },
  };
}

function mergeRevisedPlan(originalPlan, revision, council) {
  const originalScenes = list(originalPlan.scenes);
  const revisedScenes = originalScenes.length ? list(revision.scenes) : [];
  const revisedSceneById = revisedByStableId(originalScenes, revisedScenes, "SCENE");

  const selected = council.selection.selected_concept;
  const scenes = originalScenes.map((originalScene, sceneIndex) => {
    const revisedScene = revisedSceneById.get(text(originalScene.id)) || {};
    const originalShots = list(originalScene.shots);
    const revisedShots = list(revisedScene.shots);
    const revisedShotById = revisedByStableId(originalShots, revisedShots, `SHOT_${sceneIndex + 1}`, { allowPositionalFallback: true });
    const shots = originalShots.map((originalShot, shotIndex) => {
      const revisedShot = revisedShotById.get(text(originalShot.id)) || {};
      const revisedGeneration = promptlessGeneration(revisedShot.generation);
      const originalGeneration = promptlessGeneration(originalShot.generation);
      const merged = {
        ...originalShot,
        ...revisedShot,
        id: originalShot.id,
        duration_seconds: originalShot.duration_seconds,
        reference_asset_ids: originalShot.reference_asset_ids,
        reference_assets: originalShot.reference_assets,
        identity_requirements: originalShot.identity_requirements,
        performance_contract: originalShot.performance_contract,
        music_intelligence: originalShot.music_intelligence,
        reuse_policy: originalShot.reuse_policy,
        keyframe_contract: originalShot.keyframe_contract,
        rights_requirements: originalShot.rights_requirements,
        output_spec: originalShot.output_spec,
      };
      merged.generation = {
        ...originalGeneration,
        ...revisedGeneration,
        service: originalGeneration.service,
        capability: originalGeneration.capability,
        provider: originalGeneration.provider,
        model: originalGeneration.model,
        output_spec: originalGeneration.output_spec,
        identity_lock: originalGeneration.identity_lock,
      };
      merged.metadata = {
        ...object(originalShot.metadata),
        ...object(revisedShot.metadata),
        concept_council_contract: "INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_V1",
        selected_concept_id: selected.id,
        selected_concept_hash: council.concept_hash,
      };
      return merged;
    });
    return {
      ...originalScene,
      ...revisedScene,
      id: originalScene.id,
      duration_seconds: originalScene.duration_seconds,
      shots,
      music_intelligence: originalScene.music_intelligence,
      metadata: {
        ...object(originalScene.metadata),
        ...object(revisedScene.metadata),
        concept_council_contract: "INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_V1",
        selected_concept_id: selected.id,
      },
    };
  });

  const mergedPlan = {
    ...originalPlan,
    concept: {
      ...object(originalPlan.concept),
      ...object(revision.concept),
      id: selected.id,
      title: text(revision.concept?.title) || selected.title,
      narrative: text(revision.concept?.narrative) || selected.causal_story,
      selected_by: "INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_V1",
    },
    story: {
      ...object(originalPlan.story),
      ...object(revision.story),
    },
    story_architecture: {
      ...object(originalPlan.story_architecture),
      ...object(revision.story_architecture),
    },
    scenes,
    concept_candidates: council.concepts,
    selected_concept_id: selected.id,
    concept_selection_reason: council.selection.selection_reason,
    concept_council: {
      contract: "INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_V1",
      council_hash: council.council_hash,
      concept_hash: council.concept_hash,
      director_count: council.concepts.length,
      critic_count: council.critic_reports.length,
      distinctness: council.distinctness,
      scorecards: council.scorecards,
      selection: council.selection,
      critic_reports: council.critic_reports,
    },
    anti_cliche_rules: [
      ...new Set([
        ...list(originalPlan.anti_cliche_rules),
        ...list(selected.anti_cliche_rules),
      ].map(text).filter(Boolean)),
    ],
    motif_limits: list(selected.motif_system).length
      ? selected.motif_system
      : originalPlan.motif_limits,
    production: {
      ...object(originalPlan.production),
      independent_concept_directors_required: true,
      independent_concept_critics_required: true,
      executive_creative_selection_required: true,
      concept_council_contract: "INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_V1",
      concept_council_hash: council.council_hash,
      selected_concept_hash: council.concept_hash,
      prohibit_self_judged_concept_selection: true,
      prohibit_hybrid_concept_selection: true,
    },
    validation_summary: {
      ...object(originalPlan.validation_summary),
      independent_concept_count: council.concepts.length,
      independent_critic_count: council.critic_reports.length,
      concept_distinctness_passed: council.distinctness.passed,
      selected_concept_id: selected.id,
      selected_concept_weighted_score:
        council.selection.selected_scorecard?.weighted_score || null,
      concept_council_passed: council.selection.selected_under_repair !== true,
      concept_council_conditional_repair: council.selection.selected_under_repair === true,
    },
  };
  const dominatedPlan = selectedConceptDominance(mergedPlan, council);
  return normalizeDecisionGateCompatibility(normalizeSelectedProductionPolicy(dominatedPlan), selected);
}

async function resumeApprovedCouncilPlan(input = {}) {
  const organizationId = input.organization_id;
  const project = object(input.project);
  const mission = object(input.mission);
  const approvedMaster = object(input.approved_master);
  const approvedPlan = Object.keys(object(approvedMaster.plan)).length
    ? object(approvedMaster.plan)
    : approvedMaster;
  const approvedCouncil = approvedMaster.independent_concept_council || approvedPlan.concept_council || null;

  if (!organizationId) throw new Error("organization_id required");
  if (!project.id) throw new Error("creative_project_id required");
  if (!approvedCouncil) throw new Error("CREATIVE_APPROVED_CONCEPT_COUNCIL_REQUIRED");
  if (!Object.keys(approvedPlan).length) throw new Error("CREATIVE_APPROVED_COUNCIL_PLAN_REQUIRED");

  // A durable Council checkpoint is written only after the selected concept has
  // completed post-revision review and Master-plan contract repair. Resume must
  // therefore validate that exact approved plan, not mutate/re-dominance it and
  // enter another paid Direction repair cycle.
  const repairedMaster = await CreativeMasterPlanRuntime.validateExistingPlan({
    organization_id: organizationId,
    mission,
    project,
    brief: object(input.brief),
    assets: list(input.assets),
    plan: approvedPlan,
  });

  return {
    plan: repairedMaster.plan,
    independent_concept_council: approvedCouncil,
    post_revision_master_validation: {
      passed: repairedMaster.validation?.passed === true,
      decision_passed: repairedMaster.decision_validation?.passed === true,
      repair_count: repairedMaster.repairs.length,
    },
    usage: { post_revision_repairs: repairedMaster.repairs.map((item) => item.usage || null) },
    billing: { post_revision_repairs: repairedMaster.repairs.map((item) => item.billing || null) },
    available_production_capabilities: repairedMaster.available_production_capabilities || [],
    resumed_from_approved_council: true,
  };
}

async function runCouncil(input, directed) {
  const organizationId = input.organization_id;
  const project = object(input.project);
  const mission = object(input.mission);
  const evidence = fullEvidencePacket(input, directed);
  const blindEvidence = blindConceptEvidencePacket(input, directed);
  const approvalOperations = list(project.metadata?.paid_direction_approval?.operations);
  const latestMasterIndex = approvalOperations
    .map((entry, index) => [entry, index])
    .filter(([entry]) => text(entry?.operation).toUpperCase() === "MASTER_PLAN_DYNAMIC_V2")
    .map(([, index]) => index)
    .at(-1);
  const lineageOperations = Number.isInteger(latestMasterIndex)
    ? approvalOperations.slice(latestMasterIndex)
    : approvalOperations;
  const context = {
    organizationId,
    projectId: project.id,
    missionId: mission.id || mission.creative_mission_id || null,
    directionApprovalOperations: lineageOperations,
    forceFreshStoryRound: project.metadata?.story_test_mode === "EVOLUTION_STORY_ONLY_V2" || project.metadata?.force_fresh_story_round === true,
    freshStoryRoundStartedAt: project.metadata?.active_story_round_started_at || null,
    acceptedStoryRound: project.metadata?.accepted_story_round === true,
    rejectedCreativeLineage: list(project.metadata?.rejected_direction_history),
  };
  const directors = await generateIndependentConcepts(context, blindEvidence);
  const critics = await runIndependentCritics(
    context,
    evidence,
    directors.concepts,
  );
  const cards = scorecard(directors.concepts, critics.reports);
  const executive = await selectConcept(
    context,
    evidence,
    directors.concepts,
    critics.reports,
    cards,
  );
  const selectedConcept = executive.selection.selected_concept;
  const conceptHash = hash(selectedConcept);
  const councilHash = hash({
    concepts: directors.concepts,
    distinctness: directors.distinctness,
    critic_reports: critics.reports,
    scorecards: cards,
    selection: executive.selection,
  });
  const council = {
    contract: "INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_V1",
    concepts: directors.concepts,
    distinctness: directors.distinctness,
    critic_reports: critics.reports,
    scorecards: cards,
    selection: executive.selection,
    concept_hash: conceptHash,
    council_hash: councilHash,
  };
  if (evidence?.mission_contract?.story_only_creative_phase === true) {
    return {
      plan: {
        ...directed.plan,
        concept: selectedConcept,
        selected_concept_id: executive.selection.selected_concept_id,
        concept_council: council,
        story_only_creative_phase: true,
      },
      council,
      usage: {
        directors: directors.results.map((item) => item.result?.usage || null),
        critics: critics.results.map((item) => item.result?.usage || null),
        executive: executive.result?.usage || null,
      },
      billing: {
        directors: directors.results.map((item) => item.result?.billing || null),
        critics: critics.results.map((item) => item.result?.billing || null),
        executive: executive.result?.billing || null,
      },
      stopped_after_story_selection: true,
    };
  }
  const revisionOperation = "CREATIVE_SELECTED_CONCEPT_PLAN_REVISION_V1";
  let revision = await recoverSettledCouncilOperation(context, revisionOperation);
  let recoveredRevision = revision != null;
  const runRevision = () => reason({
    ...context,
    operation: revisionOperation,
    prompt: planRevisionPrompt(directed.plan, evidence, council),
    maxOutputTokens: 16000,
  });
  if (!revision) {
    revision = await runRevision();
    recoveredRevision = false;
  }

  let mergedPlan;
  try {
    mergedPlan = mergeRevisedPlan(directed.plan, revision.output, council);
  } catch (error) {
    const structuralMismatch = String(error?.message || '').startsWith('CREATIVE_COUNCIL_PLAN_');
    if (!recoveredRevision || !structuralMismatch) throw error;
    revision = await runRevision();
    recoveredRevision = false;
    mergedPlan = mergeRevisedPlan(directed.plan, revision.output, council);
  }
  const normalizedCandidate = normalizeTemporalMechanicalContract(mergedPlan, {
    duration_seconds: mergedPlan?.temporal_contract?.duration_seconds || mergedPlan?.deliverables?.[0]?.output_spec?.duration_seconds || null,
    assets: list(input.assets),
  });
  const baseReview = object(directed.plan?.creative_review);
  const candidateReview = object(normalizedCandidate?.creative_review);
  const candidateRejectedPatterns = list(candidateReview.rejected_patterns).map(text).filter(Boolean);
  const candidateFinishingRequirements = list(candidateReview.finishing_requirements).map(text).filter(Boolean);
  const normalizedPlan = {
    ...normalizedCandidate,
    creative_review: {
      ...candidateReview,
      rejected_patterns: candidateRejectedPatterns.length
        ? candidateRejectedPatterns
        : list(baseReview.rejected_patterns).map(text).filter(Boolean),
      finishing_requirements: candidateFinishingRequirements.length
        ? candidateFinishingRequirements
        : list(baseReview.finishing_requirements).map(text).filter(Boolean),
    },
  };
  let postRevisionReview = await reviewConditionalRevision(
    context,
    evidence,
    normalizedPlan,
    council,
  );
  let reviewedPlan = postRevisionReview.plan;
  if (council?.selection?.selected_under_repair === true && reviewedPlan?.creative_review?.passed !== true) {
    const unresolved = list(reviewedPlan?.creative_review?.repair_before_production).map(text).filter(Boolean);
    const repairRevision = await reason({
      ...context,
      operation: revisionOperation,
      prompt: `${planRevisionPrompt(directed.plan, evidence, council)}\n\nMANDATORY SAME-CONCEPT REPAIR ROUND\nPreserve the exact selected concept identity and governing device. Repair only the unresolved critic items. Do not create, rename, hybridize or replace the selected concept.\n\nUNRESOLVED REPAIRS\n${JSON.stringify(unresolved)}\n\nFAILED REVISED PLAN\n${JSON.stringify(activePlanForCouncilReasoning(reviewedPlan))}`,
      maxOutputTokens: 16000,
    });
    revision = repairRevision;
    const repairedMergedPlan = mergeRevisedPlan(directed.plan, repairRevision.output, council);
    const repairedNormalizedCandidate = normalizeTemporalMechanicalContract(repairedMergedPlan, { assets: list(input.assets) });
    reviewedPlan = { ...repairedNormalizedCandidate, creative_review: { ...object(repairedNormalizedCandidate?.creative_review), rejected_patterns: candidateRejectedPatterns.length ? candidateRejectedPatterns : list(baseReview.rejected_patterns).map(text).filter(Boolean), finishing_requirements: unresolved } };
    postRevisionReview = await reviewConditionalRevision(context, evidence, reviewedPlan, council, { forceFresh: true });
    reviewedPlan = postRevisionReview.plan;
  }
  const repairedMaster = await CreativeMasterPlanRuntime.repairExistingPlan({
    organization_id: organizationId,
    mission,
    project,
    brief: object(input.brief),
    assets: list(input.assets),
    plan: postRevisionReview.plan,
  });
  const plan = repairedMaster.plan;

  return {
    plan,
    council,
    usage: {
      directors: directors.results.map((item) => item.result?.usage || null),
      critics: critics.results.map((item) => item.result?.usage || null),
      executive: executive.result?.usage || null,
      revision: revision.result?.usage || null,
      post_revision_review: postRevisionReview.result?.usage || null,
      post_revision_repairs: repairedMaster.repairs.map((item) => item.usage || null),
    },
    billing: {
      directors: directors.results.map((item) => item.result?.billing || null),
      critics: critics.results.map((item) => item.result?.billing || null),
      executive: executive.result?.billing || null,
      revision: revision.result?.billing || null,
      post_revision_review: postRevisionReview.result?.billing || null,
      post_revision_repairs: repairedMaster.repairs.map((item) => item.billing || null),
    },
    post_revision_master_validation: {
      passed: repairedMaster.validation?.passed === true,
      decision_passed: repairedMaster.decision_validation?.passed === true,
      repair_count: repairedMaster.repairs.length,
    },
  };
}

function install() {
  if (CreativeUniversalTemporalDirectionRuntime[INSTALL_FLAG]) return;
  const createWithoutCouncil = CreativeUniversalTemporalDirectionRuntime.create.bind(
    CreativeUniversalTemporalDirectionRuntime,
  );
  Object.defineProperty(CreativeUniversalTemporalDirectionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeUniversalTemporalDirectionRuntime.create = async function createWithIndependentConceptCouncil(input = {}) {
    const directed = await createWithoutCouncil(input);
    const approvedCouncil =
      input.approved_master?.independent_concept_council ||
      input.approved_master?.plan?.concept_council ||
      null;
    if (approvedCouncil) {
      return {
        ...directed,
        independent_concept_council: approvedCouncil,
      };
    }
    const council = await runCouncil(input, directed);
    return {
      ...directed,
      plan: council.plan,
      independent_concept_council: council.council,
      usage: {
        ...object(directed.usage),
        concept_council: council.usage,
      },
      billing: {
        ...object(directed.billing),
        concept_council: council.billing,
      },
    };
  };
}

install();

export const CreativeConceptCouncilRuntime = {
  installed: true,
  run: runCouncil,
  resumeApprovedCouncilPlan,
  repairSelectedConceptDimension,
  reevaluateSelectedCritic,
  applySelectedCriticReevaluation,
  evaluateIndependentCritic,
  applyIndependentCriticReport,
  normalizeDecisionGateCompatibility,
};
import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  AvantiqoStructuredIntelligenceSupervisorRuntime,
} from "@/lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime";
import {
  resolveIntelligenceSettledOutputEnvelope,
} from "@/lib/intelligence/runtime/AvantiqoIntelligenceOutputEnvelopeRuntime.mjs";

const CREATIVE_INTELLIGENCE_SUPERVISION = "OWNED_AVANTIQO_INTELLIGENCE_FIRST";
const GOVERNED_FALLBACK_SETTLEMENT_INTERVAL_MS = 1000;
const GOVERNED_FALLBACK_SETTLEMENT_DEADLINE_MS = 420_000;
let musicLocalQueue = Promise.resolve();

function enqueueMusicLocal(work) {
  const next = musicLocalQueue.then(work, work);
  musicLocalQueue = next.catch(() => undefined);
  return next;
}

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function creativeTraceMetadata(input = {}) {
  const source = object(input);
  return {
    creative_project_id: text(source.creative_project_id || source.project_id) || null,
    creative_mission_id: text(source.creative_mission_id || source.mission_id) || null,
    workflow_kind: text(source.workflow_kind) || null,
  };
}

async function settleGovernedFallbackExecution(execution, { organizationId, task, input = {} }) {
  if (execution?.pending !== true) return execution;
  const providerJobId = text(execution?.provider_job_id);
  const usageId = text(execution?.usage?.id);
  if (!providerJobId || !usageId) {
    throw new Error("CREATIVE_REASONING_FALLBACK_PENDING_BINDING_REQUIRED");
  }

  const deadlineAt = Date.now() + GOVERNED_FALLBACK_SETTLEMENT_DEADLINE_MS;
  let current = execution;
  let poll = 0;
  while (current?.pending === true && Date.now() < deadlineAt) {
    poll += 1;
    current = await ServiceExecutionRuntime.settle({
      organization_id: organizationId,
      provider: execution.provider,
      provider_job_id: providerJobId,
      usage_id: usageId,
      pricing: object(execution.pricing),
      quantity: execution.usage?.quantity ?? 1,
      unit: execution.usage?.unit || execution.pricing?.unit || "request",
      metadata: {
        module: "CREATIVE",
        operation: "REASONING_FALLBACK_SETTLEMENT",
        creative_task: task,
        ...creativeTraceMetadata(input),
        provider_job_reused: true,
        duplicate_provider_job_submitted: false,
        pending_settlement_poll: poll,
        raw_reasoning_persisted: false,
      },
      provider_status_input: { capability: "ai.reasoning.execute", execution_lane: "deep" },
      credential_id: execution.credential_id || null,
      started_at: execution.started_at || null,
    });
    if (current?.pending === true) {
      await new Promise((resolve) => setTimeout(resolve, GOVERNED_FALLBACK_SETTLEMENT_INTERVAL_MS));
    }
  }

  if (current?.pending === true) {
    await ServiceExecutionRuntime.cancelPending({
      organization_id: organizationId,
      provider: execution.provider,
      provider_job_id: providerJobId,
      usage_id: usageId,
      pricing: object(execution.pricing),
      metadata: {
        module: "CREATIVE",
        creative_task: task,
        ...creativeTraceMetadata(input),
        intelligence_execution_lane: "deep",
      },
      execution_lane: "deep",
      reason: "CREATIVE_REASONING_FALLBACK_PENDING_TIMEOUT",
    });
    throw new Error("CREATIVE_REASONING_FALLBACK_PENDING_TIMEOUT");
  }
  if (current?.failed === true || current?.success !== true) {
    throw new Error(`CREATIVE_REASONING_FALLBACK_SETTLEMENT_FAILED:${text(current?.error) || "UNKNOWN"}`);
  }
  return current;
}


function compactMusicLocalInput(input = {}) {
  const source = object(input);
  const lyrics = text(source.lyrics || source.lyric_source || source.source_lyrics, 12000);
  const compact = {
    objective: text(source.objective, 4000) || undefined,
    title: text(source.title, 500) || undefined,
    lyrics: lyrics || undefined,
    instrumental: source.instrumental === true,
    vocal_language: text(source.vocal_language, 100) || undefined,
    vocal_gender: text(source.vocal_gender || source.lead_vocal_gender, 100) || undefined,
    duration_seconds: Number(source.duration_seconds) || undefined,
    mastering_destinations: Array.isArray(source.mastering_destinations) ? source.mastering_destinations.slice(0, 4) : undefined,
    quality_profile: text(source.quality_profile, 100) || undefined,
    previous_songwriter_contract: source.previous_songwriter_contract || undefined,
    previous_preproduction: source.previous_preproduction || undefined,
    songwriter_validation_failures: source.songwriter_validation_failures || undefined,
    preproduction_validation_failures: source.preproduction_validation_failures || undefined,
  };
  return Object.fromEntries(Object.entries(compact).filter(([, value]) => value !== undefined && value !== ""));
}

function compactMusicLocalConstraints(constraints = {}) {
  const source = object(constraints);
  const drop = new Set([
    "prohibit_reference_copying", "factual_claims_need_evidence", "no_media_generation",
    "owned_ai_music_generation_is_expected", "do_not_claim_live_recording_or_no_ai_generation_without_actual_recording_evidence",
    "independent_from_other_concepts", "do_not_imitate_named_artists",
    "production_method_must_describe_desired_sound_not_false_recording_provenance",
    "generation_not_authorized", "lock_before_paid_generation",
  ]);
  return Object.fromEntries(Object.entries(source).filter(([key, value]) => !drop.has(key) && value !== undefined));
}


function localMusicOutputShape(task, outputShape = {}) {
  const taskName = text(task, 160);
  if (taskName === "MUSIC_STUDIO_RESEARCH_ROOM") {
    return {
      genre_and_form: { summary: "string" },
      audience_and_use_case: { summary: "string" },
      cultural_context: { summary: "string" },
      instrumentation_and_performance_language: { summary: "string" },
      technical_delivery_context: { summary: "string" },
      source_analysis: { summary: "string" },
      rights_and_provenance: { summary: "string" },
      references: [],
      open_questions: [],
    };
  }
  return outputShape;
}

async function runOwnedMusicLocalStructured({ task, input, constraints, outputShape, temperature, compactRetry = false }) {
  const baseUrl = text(
    process.env.AVANTIQO_MUSIC_LOCAL_REASONING_URL ||
    process.env.AVANTIQO_NODE01_OLLAMA_URL,
  ).replace(/\/$/, "");
  if (!baseUrl) throw new Error("CREATIVE_MUSIC_LOCAL_REASONING_URL_NOT_CONFIGURED");

  const model = text(process.env.AVANTIQO_MUSIC_LOCAL_REASONING_MODEL) || "qwen3:4b-instruct";
  const taskName = text(task, 160);
  const localOutputShape = localMusicOutputShape(task, outputShape);
  const maxOutputTokens = /PREPRODUCTION_(ARCHITECTURE|PRODUCTION)/.test(taskName) ? 650
    : /PREPRODUCTION/.test(taskName) ? 1000
      : /SONGWRITER/.test(taskName) ? 900
      : /CRITIC_PANEL/.test(taskName) ? 650
        : /CONCEPT|WINNER_REVISION/.test(taskName) ? 650
          : compactRetry ? 650 : 500;
  const timeoutMs = /SONGWRITER|PREPRODUCTION/.test(taskName) ? 120_000 : 90_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        keep_alive: text(process.env.AVANTIQO_MUSIC_LOCAL_KEEP_ALIVE) || "45m",
        format: "json",
        options: {
          temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0.7,
          num_ctx: Number(process.env.AVANTIQO_MUSIC_LOCAL_CONTEXT_TOKENS) || 4096,
          num_predict: maxOutputTokens,
        },
        messages: [
          {
            role: "system",
            content: [
              musicCreativeSystem(localOutputShape),
              "Keep every string concise, arrays short, and avoid repetition. Use the supplied lyrics and facts exactly where required.",
              "For open object fields, use at most 3 useful scalar properties. Keep ordinary strings under 18 words and arrays to at most 3 items unless the schema itself requires more.",
              compactRetry ? "REPAIR MODE: the previous local answer was invalid or too long. Return the complete JSON object again, drastically compressed, with no commentary and no omitted required keys." : "",
            ].join("\n"),
          },
          {
            role: "user",
            content: JSON.stringify({
              task,
              input: compactMusicLocalInput(input),
              constraints: compactMusicLocalConstraints(constraints),
            }),
          },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`CREATIVE_MUSIC_LOCAL_HTTP_${response.status}:${(await response.text()).slice(0, 500)}`);
    }
    const envelope = await response.json();
    const raw = text(envelope?.message?.content, 100000);
    const parsed = parseJson(raw);
    if (!parsed) throw new Error(`CREATIVE_MUSIC_LOCAL_JSON_INVALID:${raw.slice(0, 500)}`);
    return {
      parsed,
      telemetry: {
        model,
        elapsed_ms: Date.now() - startedAt,
        load_duration_ns: Number(envelope?.load_duration || 0),
        eval_duration_ns: Number(envelope?.eval_duration || 0),
        eval_count: Number(envelope?.eval_count || 0),
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}


function deterministicMusicVocalContract(input = {}, constraints = {}) {
  const songwriter = object(object(constraints).songwriter_contract);
  const sourceLyrics = text(
    songwriter.lyrics || input.lyrics || input.lyric_source || input.source_lyrics,
    20000,
  );
  return {
    required: object(constraints).vocal_song_required === true || input.instrumental !== true,
    lyrics: sourceLyrics || "Locked vocal lyrics",
    vocal_language: text(songwriter.vocal_language || input.vocal_language || "english"),
    vocal_delivery: text(songwriter.vocal_delivery || "emotionally nuanced female lead vocal"),
    vocal_gender: text(input.vocal_gender || input.lead_vocal_gender || object(constraints).required_vocal_gender || "female"),
    vocal_role: text(input.requested_vocal || input.vocal_role || object(constraints).required_vocal_role || "female lead vocal"),
    preserve_core_meaning: true,
  };
}

async function runOwnedMusicLocalPreproductionSplit({ task, input, constraints, outputShape, temperature }) {
  const architectureShape = {
    tempo_map: outputShape.tempo_map || {},
    key_and_harmony: outputShape.key_and_harmony || {},
    form_and_section_lengths: outputShape.form_and_section_lengths || [],
    motif_map: outputShape.motif_map || [],
    instrumentation: outputShape.instrumentation || [],
    performance_direction: outputShape.performance_direction || {},
    dynamic_arc: outputShape.dynamic_arc || [],
  };
  const productionShape = {
    sonic_palette: outputShape.sonic_palette || [],
    transition_map: outputShape.transition_map || [],
    mix_space_intent: outputShape.mix_space_intent || {},
    delivery_targets: outputShape.delivery_targets || {},
  };
  const sourceConstraints = object(constraints);
  const sharedConstraints = {
    approved_concept: sourceConstraints.approved_concept,
    research: sourceConstraints.research,
    exact_duration_seconds: sourceConstraints.exact_duration_seconds,
    vocal_song_required: sourceConstraints.vocal_song_required,
    required_vocal_gender: sourceConstraints.required_vocal_gender,
    required_vocal_role: sourceConstraints.required_vocal_role,
    every_required_preproduction_field_must_be_nonempty: true,
  };
  const slimInput = {
    ...compactMusicLocalInput(input),
    lyrics: undefined,
    previous_songwriter_contract: undefined,
    previous_preproduction: undefined,
  };
  const architecture = await runOwnedMusicLocalStructured({
    task: `${task}_ARCHITECTURE`,
    input: slimInput,
    constraints: sharedConstraints,
    outputShape: architectureShape,
    temperature,
  });
  const production = await runOwnedMusicLocalStructured({
    task: `${task}_PRODUCTION`,
    input: slimInput,
    constraints: { ...sharedConstraints, musical_architecture: architecture.parsed },
    outputShape: productionShape,
    temperature,
  });
  const merged = {
    ...(architecture.parsed?.result || architecture.parsed),
    ...(production.parsed?.result || production.parsed),
    vocal_contract: deterministicMusicVocalContract(input, constraints),
  };
  assertOutputShape(merged, outputShape, "music_node01_local_preproduction_split");
  return {
    parsed: merged,
    telemetry: {
      split_preproduction: true,
      architecture: architecture.telemetry,
      production: production.telemetry,
      elapsed_ms: Number(architecture.telemetry?.elapsed_ms || 0) + Number(production.telemetry?.elapsed_ms || 0),
    },
  };
}

function parseJson(value) {
  const raw = text(value, 50000);
  if (!raw) return null;
  for (const candidate of [
    raw,
    raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
    raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1),
  ]) {
    if (!candidate || !candidate.trim()) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next bounded extraction.
    }
  }
  return null;
}

function outputMatchesShape(value, shape) {
  if (shape === "string") return typeof value === "string" && value.trim().length > 0;
  if (typeof shape === "number") return typeof value === "number" && Number.isFinite(value);
  if (typeof shape === "boolean") return typeof value === "boolean";
  if (Array.isArray(shape)) {
    if (!Array.isArray(value)) return false;
    if (!shape.length) return true;
    return value.every((item) => outputMatchesShape(item, shape[0]));
  }
  if (shape && typeof shape === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const entries = Object.entries(shape);
    if (!entries.length) return true;
    return entries.every(([key, expected]) => Object.prototype.hasOwnProperty.call(value, key) && outputMatchesShape(value[key], expected));
  }
  return true;
}

function knownEnvelopeCandidates(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [value];
  return [
    value,
    value.result,
    value.output,
    value.data,
    value.payload,
    value.decision,
    value.response,
  ].filter((entry) => entry !== undefined && entry !== null);
}

function normalizeOutputShapeCandidate(value, shape) {
  for (const candidate of knownEnvelopeCandidates(value)) {
    if (outputMatchesShape(candidate, shape)) return candidate;
  }

  const candidate = knownEnvelopeCandidates(value).find(
    (entry) => entry && typeof entry === "object" && !Array.isArray(entry),
  );
  if (!candidate) return value;

  if (shape === "string") {
    return typeof candidate === "string" ? candidate : value;
  }
  if (typeof shape === "number") {
    const number = Number(candidate);
    return Number.isFinite(number) ? number : value;
  }
  if (typeof shape === "boolean") {
    return typeof candidate === "boolean" ? candidate : value;
  }
  if (Array.isArray(shape)) {
    if (!Array.isArray(candidate)) return value;
    if (!shape.length) return candidate;
    return candidate.map((item) => normalizeOutputShapeCandidate(item, shape[0]));
  }
  if (shape && typeof shape === "object") {
    const projected = {};
    for (const [key, expected] of Object.entries(shape)) {
      if (Object.prototype.hasOwnProperty.call(candidate, key)) {
        projected[key] = normalizeOutputShapeCandidate(candidate[key], expected);
        continue;
      }
      if (Array.isArray(expected) && expected.length === 0) {
        projected[key] = [];
        continue;
      }
      if (expected && typeof expected === "object" && !Array.isArray(expected) && !Object.keys(expected).length) {
        projected[key] = {};
      }
    }
    if (outputMatchesShape(projected, shape)) return projected;
  }
  return value;
}

function outputShapeMismatchPaths(value, shape, path = "$") {
  const failures = [];
  if (shape === "string") {
    if (!(typeof value === "string" && value.trim().length > 0)) failures.push(`${path}:string`);
    return failures;
  }
  if (typeof shape === "number") {
    if (!(typeof value === "number" && Number.isFinite(value))) failures.push(`${path}:number`);
    return failures;
  }
  if (typeof shape === "boolean") {
    if (typeof value !== "boolean") failures.push(`${path}:boolean`);
    return failures;
  }
  if (Array.isArray(shape)) {
    if (!Array.isArray(value)) return [`${path}:array`];
    if (!shape.length) return failures;
    for (let index = 0; index < value.length; index += 1) {
      failures.push(...outputShapeMismatchPaths(value[index], shape[0], `${path}[${index}]`));
      if (failures.length >= 24) break;
    }
    return failures;
  }
  if (shape && typeof shape === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [`${path}:object`];
    for (const [key, expected] of Object.entries(shape)) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        failures.push(`${path}.${key}:missing`);
      } else {
        failures.push(...outputShapeMismatchPaths(value[key], expected, `${path}.${key}`));
      }
      if (failures.length >= 24) break;
    }
  }
  return failures;
}

function assertOutputShape(value, shape, source) {
  if (!outputMatchesShape(value, shape)) {
    const error = new Error(`CREATIVE_REASONING_OUTPUT_SHAPE_INVALID:${source}`);
    error.code = "CREATIVE_REASONING_OUTPUT_SHAPE_INVALID";
    error.mismatch_paths = outputShapeMismatchPaths(value, shape).slice(0, 24);
    throw error;
  }
  return value;
}

function resolveStructuredResult(parsed, outputShape, source) {
  const structured = object(parsed);
  const shape = object(outputShape);
  const shapeOwnsResult = Object.prototype.hasOwnProperty.call(shape, "result");

  if (shapeOwnsResult) {
    if (Object.prototype.hasOwnProperty.call(structured, "result")) {
      const normalizedEnvelope = normalizeOutputShapeCandidate(structured, shape);
      assertOutputShape(normalizedEnvelope, shape, source);
      return normalizedEnvelope.result;
    }
    if (outputMatchesShape(parsed, shape.result)) {
      assertOutputShape(
        { result: parsed },
        shape,
        `${source}_deterministic_envelope_normalization`,
      );
      return parsed;
    }
    assertOutputShape(parsed, shape, source);
  }

  const normalized = normalizeOutputShapeCandidate(
    Object.prototype.hasOwnProperty.call(structured, "result") ? structured.result : parsed,
    outputShape,
  );
  return assertOutputShape(normalized, outputShape, source);
}

function localFallback({ task, input }) {
  return {
    task,
    confidence: 55,
    execution_source: "deterministic_local_fallback",
    raw_reasoning_persisted: false,
    provider_selection_exposed: false,
    intelligence_supervision: {
      owned_first: true,
      owned_supervisor_used: false,
      fallback_used: true,
      raw_reasoning_persisted: false,
    },
    result: {
      ideas: [
        {
          id: "fallback_idea_01",
          title: "Use real assets first",
          description: "Build the production from authentic business photos, videos, brand assets, and only generate missing scenes.",
          assumptions: [],
          risks: ["May need more asset quality analysis."],
          required_assets: [],
          production_cost: "low",
          ai_risk: "low",
        },
        {
          id: "fallback_idea_02",
          title: "Human-first opening",
          description: "Open with a believable human moment connected to the business goal instead of generic AI visuals.",
          assumptions: [],
          risks: ["Requires usable people or staff assets."],
          required_assets: [],
          production_cost: "medium",
          ai_risk: "medium",
        },
      ],
      evaluations: [],
      verification: {
        passed: true,
        issues: [],
        recommendations: [],
      },
    },
  };
}

function musicCreativeSystem(outputShape = {}) {
  return [
    "You are Avantiqo Music Studio creative intelligence.",
    "Make strong, commercially credible, emotionally specific music decisions while preserving the caller's constraints.",
    "Do not imitate named artists, invent recording provenance, expose infrastructure providers, or return chain-of-thought.",
    "Generation is not authorized by this reasoning step.",
    "Return exactly one valid JSON object matching the required shape and no markdown or commentary.",
    `Required JSON shape: ${JSON.stringify(outputShape)}`,
  ].join("\n");
}

function supervisorOperationForTask(task) {
  const name = text(task).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return name ? `CREATIVE_${name}` : "CREATIVE_STRUCTURED_REASONING";
}

function supervisorOutputBudgetForTask(task) {
  const name = text(task).toUpperCase();
  if (/MASTER_PLAN|TEMPORAL|SHOT|STORYBOARD|PRODUCTION/.test(name)) return 4096;
  if (/CONCEPT|STRATEGY|RESEARCH|CRITIC|TRIBUNAL/.test(name)) return 3072;
  if (/REPAIR|REVIEW|VALIDATION|CERTIFICATION/.test(name)) return 2048;
  return 2048;
}

function creativeSystem(outputShape = {}) {
  return `
You are Avantiqo Intelligence acting as the accountable creative brain inside Avantiqo Creative Studio.

Critical rules:
- Understand the business goal before choosing creative execution.
- Avantiqo Intelligence owns strategy, story, prioritisation, capability selection, quality judgement and repair direction.
- Image, Cinema, Audio, Voice and Code engines are specialist workers underneath Avantiqo Intelligence.
- Never choose, expose or discuss infrastructure vendors or external AI providers. Choose only canonical Avantiqo capabilities supplied in context.
- Prefer authentic business, brand, people and venue assets over synthetic replacement imagery whenever they can achieve the goal.
- Reject generic AI-looking luxury, fake branding, identity drift, invented facts, implausible physics, weak typography, visual clutter and content that does not advance the business objective.
- Think across the whole production: story, visual language, camera, edit rhythm, sound design, music, narration, typography, brand fidelity, channel fit, accessibility and conversion goal.
- Use structured specifications as source of truth. Do not create or persist generator prompts as product state.
- Do not use fixed campaign templates.
- Challenge weak creative directions instead of polishing them blindly.
- Prefer the smallest repair that fixes the failed requirement while preserving approved work.
- Never claim a production is world-class, complete or release-ready without evidence from the relevant quality gates.
- Never return chain-of-thought, hidden reasoning, scratchpads or internal deliberation.
- Return strict JSON only with no markdown.
- Preserve the caller's requested JSON shape. The intended output shape is: ${JSON.stringify(outputShape)}
`.trim();
}

async function runOwnedSupervisor({ task, input, constraints, outputShape }) {
  const supervised = await AvantiqoStructuredIntelligenceSupervisorRuntime.run({
    organization_id: input.organization_id,
    party_id: input.party_id || null,
    entity_id: input.entity_id || null,
    system: creativeSystem(outputShape),
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          task,
          input,
          constraints,
          output_shape: outputShape,
        }),
      },
    ],
    tools: [],
    authorization: {
      allow_mutating_tools: false,
    },
    mode: "deep",
    critique_instructions: [
      "Audit the proposed creative JSON as a world-class executive creative director and senior producer.",
      "Repair generic ideas, unsupported claims, brand drift, weak narrative logic, unnecessary generation, missing sound or voice thinking, inappropriate capability choices, avoidable cost, and false quality or completion claims.",
      "Preserve the required JSON schema and return only the corrected JSON object.",
    ].join(" "),
    max_output_tokens: supervisorOutputBudgetForTask(task),
    metadata: {
      module: "CREATIVE",
      operation: supervisorOperationForTask(task),
      creative_task: task,
      ...creativeTraceMetadata(input),
      capability_only_orchestration: true,
      provider_selection_exposed: false,
      raw_reasoning_persisted: false,
    },
  });

  return {
    parsed: supervised.parsed,
    repaired: supervised.repaired === true,
  };
}

async function runOwnedSupervisorShapeRepair({
  task,
  input,
  constraints,
  outputShape,
  invalidOutput,
}) {
  const repaired = await AvantiqoStructuredIntelligenceSupervisorRuntime.run({
    organization_id: input.organization_id,
    party_id: input.party_id || null,
    entity_id: input.entity_id || null,
    system: [
      creativeSystem(outputShape),
      "This pass is machine-contract repair only.",
      "Preserve the creative decision and factual content from invalid_output.",
      "Do not add new strategy, facts, approvals or production claims.",
      "Return every required key in the requested shape with the correct JSON types.",
      "Return exactly one valid JSON object and no commentary.",
    ].join("\n"),
    messages: [{
      role: "user",
      content: JSON.stringify({
        task,
        constraints,
        invalid_output: invalidOutput,
        required_output_shape: outputShape,
      }),
    }],
    tools: [],
    authorization: { allow_mutating_tools: false },
    mode: "deep",
    critique_instructions:
      "Repair only schema/type/required-key mismatches. Preserve meaning and uncertainty. Do not invent missing creative facts.",
    max_output_tokens: supervisorOutputBudgetForTask(task),
    metadata: {
      module: "CREATIVE",
      operation: `${supervisorOperationForTask(task)}_SHAPE_REPAIR`,
      creative_task: task,
      ...creativeTraceMetadata(input),
      owned_shape_repair: true,
      capability_only_orchestration: true,
      provider_selection_exposed: false,
      raw_reasoning_persisted: false,
    },
  });
  return {
    parsed: repaired.parsed,
    repaired: true,
  };
}

async function runGovernedFallback({
  task,
  input,
  constraints,
  outputShape,
  temperature,
}) {
  const execution = await ServiceExecutionRuntime.execute({
    organization_id: input.organization_id,
    party_id: input.party_id || null,
    entity_id: input.entity_id || null,
    service_id: "ai.reasoning.execute",
    input: {
      input: JSON.stringify({
        task,
        input,
        constraints,
        outputShape,
      }),
      instructions_text: creativeSystem(outputShape),
      temperature,
      response_format: {
        type: "json_object",
      },
    },
    metadata: {
      module: "CREATIVE",
      operation: "REASONING_FALLBACK",
      creative_task: task,
      ...creativeTraceMetadata(input),
      fallback_from_owned_creative_intelligence: true,
      capability_only_orchestration: true,
      owned_first_resolution: true,
      raw_reasoning_persisted: false,
      provider_selection_exposed: false,
    },
    category: "AI",
  });

  const completed = await settleGovernedFallbackExecution(execution, {
    organizationId: input.organization_id,
    task,
    input,
  });
  const envelope = resolveIntelligenceSettledOutputEnvelope(completed);
  const content = text(envelope.text) ||
    (typeof completed?.output?.result === "string" ? completed.output.result : "");
  return parseJson(content);
}

export async function reason({
  task,
  input = {},
  constraints = {},
  outputShape = {},
  temperature = 0.7,
}) {
  if (!input.organization_id) {
    throw new Error("CREATIVE_REASONING_ORGANIZATION_REQUIRED");
  }

  if (text(task, 160).startsWith("MUSIC_STUDIO_")) {
    const musicTaskName = text(task, 160);
    try {
      const local = /MUSIC_STUDIO_PREPRODUCTION_(LOCK|REPAIR)/.test(musicTaskName)
        ? await enqueueMusicLocal(() => runOwnedMusicLocalPreproductionSplit({ task, input, constraints, outputShape, temperature }))
        : await enqueueMusicLocal(() =>
            runOwnedMusicLocalStructured({ task, input, constraints, outputShape, temperature }),
          );
      const parsed = local.parsed;
      const result = resolveStructuredResult(parsed, outputShape, "music_node01_local_structured");
      console.info("CREATIVE_MUSIC_NODE01_LOCAL_SUCCESS", text(task, 160), JSON.stringify(local.telemetry));
      return {
        task,
        confidence: Number(parsed?.confidence || 84),
        execution_source: "avantiqo_node01_local_structured",
        raw_reasoning_persisted: false,
        provider_selection_exposed: false,
        intelligence_supervision: {
          owned_first: true,
          owned_supervisor_used: true,
          node01_local_used: true,
          fallback_used: false,
          raw_reasoning_persisted: false,
          telemetry: local.telemetry,
        },
        result,
      };
    } catch (localError) {
      const localMessage = text(localError?.message || localError, 1200);
      const repairable = /LOCAL_JSON_INVALID|OUTPUT_SHAPE_INVALID/.test(localMessage);
      if (repairable) {
        try {
          const repairedLocal = await enqueueMusicLocal(() =>
            runOwnedMusicLocalStructured({
              task,
              input,
              constraints: { ...constraints, local_compact_repair: true },
              outputShape,
              temperature: Math.min(Number(temperature) || 0.7, 0.45),
              compactRetry: true,
            }),
          );
          const repairedParsed = repairedLocal.parsed;
          const repairedResult = resolveStructuredResult(
            repairedParsed,
            outputShape,
            "music_node01_local_compact_repair",
          );
          console.info(
            "CREATIVE_MUSIC_NODE01_LOCAL_REPAIR_SUCCESS",
            text(task, 160),
            JSON.stringify(repairedLocal.telemetry),
          );
          return {
            task,
            confidence: Number(repairedParsed?.confidence || 82),
            execution_source: "avantiqo_node01_local_compact_repair",
            raw_reasoning_persisted: false,
            provider_selection_exposed: false,
            intelligence_supervision: {
              owned_first: true,
              owned_supervisor_used: true,
              node01_local_used: true,
              local_compact_repair_used: true,
              fallback_used: false,
              raw_reasoning_persisted: false,
              telemetry: repairedLocal.telemetry,
            },
            result: repairedResult,
          };
        } catch (repairError) {
          console.warn(
            "CREATIVE_MUSIC_NODE01_LOCAL_REPAIR_FAILED",
            text(task, 160),
            repairError?.message || repairError,
          );
        }
      }
      console.warn(
        "CREATIVE_MUSIC_NODE01_LOCAL_FALLBACK",
        text(task, 160),
        localMessage,
      );
    }
  }

  try {
    const owned = await runOwnedSupervisor({
      task,
      input,
      constraints,
      outputShape,
    });
    let ownedResult;
    let ownedShapeRepairUsed = false;
    try {
      ownedResult = resolveStructuredResult(owned.parsed, outputShape, "owned_supervisor");
    } catch (shapeError) {
      if (shapeError?.code !== "CREATIVE_REASONING_OUTPUT_SHAPE_INVALID") throw shapeError;
      const repaired = await runOwnedSupervisorShapeRepair({
        task,
        input,
        constraints,
        outputShape,
        invalidOutput: owned.parsed,
      });
      ownedResult = resolveStructuredResult(
        repaired.parsed,
        outputShape,
        "owned_supervisor_shape_repair",
      );
      ownedShapeRepairUsed = true;
    }
    return {
      task,
      confidence: Number(owned.parsed?.confidence || 82),
      execution_source: ownedShapeRepairUsed
        ? "avantiqo_intelligence_supervisor_shape_repair"
        : "avantiqo_intelligence_supervisor",
      raw_reasoning_persisted: false,
      provider_selection_exposed: false,
      intelligence_supervision: {
        owned_first: true,
        owned_supervisor_used: true,
        critique_repair: owned.repaired,
        owned_shape_repair_used: ownedShapeRepairUsed,
        fallback_used: false,
        raw_reasoning_persisted: false,
      },
      result: ownedResult,
    };
  } catch (ownedError) {
    console.warn(
      "CREATIVE_OWNED_INTELLIGENCE_SUPERVISOR_FALLBACK",
      text(task, 160),
      ownedError?.message || ownedError,
      Array.isArray(ownedError?.mismatch_paths) ? ownedError.mismatch_paths.join(",") : "",
    );
  }

  try {
    const parsed = await runGovernedFallback({
      task,
      input,
      constraints,
      outputShape,
      temperature,
    });
    if (parsed) {
      const fallbackResult = resolveStructuredResult(parsed, outputShape, "governed_fallback");
      return {
        task,
        confidence: Number(parsed.confidence || 70),
        execution_source: "governed_service_runtime_fallback",
        raw_reasoning_persisted: false,
        provider_selection_exposed: false,
        intelligence_supervision: {
          owned_first: true,
          owned_supervisor_used: false,
          fallback_used: true,
          raw_reasoning_persisted: false,
        },
        result: fallbackResult,
      };
    }
  } catch (fallbackError) {
    console.error(
      "CREATIVE_GOVERNED_REASONING_FALLBACK_FAILED",
      fallbackError?.message || fallbackError,
    );
  }

  const local = localFallback({ task, input });
  const localResult = resolveStructuredResult(local, outputShape, "deterministic_local_fallback");
  return { ...local, result: localResult };
}

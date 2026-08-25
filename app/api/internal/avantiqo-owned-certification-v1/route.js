export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  AvantiqoIntelligenceProvider,
  getAvantiqoIntelligenceEndpointHealth,
} from "@/lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const CONTRACT = "AVANTIQO_OWNED_ENGINE_VERCEL_CERTIFICATION_V1";
const TOKEN = "avq-owned-cert-vercel-v1-20260823-a6e1f71c";
const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const BUCKET = "creative-assets";
const supabase = getServiceSupabase();

const ENGINE_CONFIG = Object.freeze({
  intelligence: Object.freeze({
    required_env: Object.freeze([
      "RUNPOD_API_KEY",
      "RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID",
    ]),
  }),
  voice: Object.freeze({
    required_env: Object.freeze([
      "RUNPOD_API_KEY",
      "RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID",
      "RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID",
    ]),
  }),
  music: Object.freeze({
    required_env: Object.freeze([
      "RUNPOD_API_KEY",
      "RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID",
    ]),
  }),
  code: Object.freeze({
    required_env: Object.freeze([
      "RUNPOD_API_KEY",
      "RUNPOD_AVANTIQO_CODE_ENDPOINT_ID",
    ]),
  }),
});

function text(value) {
  return String(value ?? "").trim();
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

function parseJson(value) {
  try {
    const parsed = JSON.parse(text(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function percentile(values, fraction) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

function commitSha() {
  return text(process.env.VERCEL_GIT_COMMIT_SHA) || "unknown-commit";
}

function evidenceBase() {
  return `platform-certification/owned-engines/${commitSha()}`;
}

function evidencePath(engine) {
  return `${evidenceBase()}/${engine}.json`;
}

function lockPath(engine) {
  return `${evidenceBase()}/${engine}.lock.json`;
}

function configuration(engine) {
  const definition = ENGINE_CONFIG[engine];
  const presence = Object.fromEntries(
    definition.required_env.map((name) => [name, Boolean(text(process.env[name]))]),
  );
  const missing = Object.entries(presence)
    .filter(([, configured]) => !configured)
    .map(([name]) => name);
  return {
    engine,
    configured: missing.length === 0,
    presence,
    missing,
  };
}

function safeError(error) {
  let message = text(error?.message || error).slice(0, 800);
  for (const name of ["RUNPOD_API_KEY"]) {
    const secret = text(process.env[name]);
    if (secret) message = message.replaceAll(secret, "[REDACTED]");
  }
  return message || "UNKNOWN_CERTIFICATION_ERROR";
}

async function readCachedEvidence(engine) {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(evidencePath(engine));
    if (error || !data) return null;
    return JSON.parse(await data.text());
  } catch {
    return null;
  }
}

async function acquireLock(engine) {
  const payload = Buffer.from(JSON.stringify({
    contract: CONTRACT,
    engine,
    commit_sha: commitSha(),
    started_at: new Date().toISOString(),
  }));
  const { error } = await supabase.storage.from(BUCKET).upload(lockPath(engine), payload, {
    contentType: "application/json",
    cacheControl: "0",
    upsert: false,
  });
  return !error;
}

async function persistEvidence(engine, evidence) {
  const payload = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
  const { error } = await supabase.storage.from(BUCKET).upload(evidencePath(engine), payload, {
    contentType: "application/json",
    cacheControl: "0",
    upsert: true,
  });
  if (error) throw new Error(`CERTIFICATION_EVIDENCE_PERSIST_FAILED:${error.message}`);
}

async function runSync(endpointId, input, timeoutMs = 240000) {
  const apiKey = text(process.env.RUNPOD_API_KEY);
  const started = performance.now();
  const response = await fetch(`${RUNPOD_API_BASE}/${endpointId}/runsync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ input }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => ({}));
  const wallMs = Math.round(performance.now() - started);
  if (!response.ok) {
    throw new Error(`RUNPOD_HTTP_${response.status}:${text(body?.error || body?.message)}`);
  }
  if (text(body?.status).toUpperCase() !== "COMPLETED") {
    throw new Error(`RUNPOD_NOT_COMPLETED:${text(body?.status) || "UNKNOWN"}`);
  }
  return { body, wallMs };
}

async function runIntelligenceBenchmark() {
  const context = {
    organization_id: "benchmark-organization",
    organization_service_id: "benchmark-service",
    usage_id: "benchmark-usage",
  };
  const traceId = `vercel-cert-${commitSha().slice(0, 12)}-${Date.now()}`;
  const traceMessage = `AVANTIQO_CERTIFICATION_TRACE_ID=${traceId}. Diagnostic metadata only. Ignore it when solving the task and never include it in the answer.`;

  let health = await getAvantiqoIntelligenceEndpointHealth();
  const firstQueue = Number(health?.jobs?.inQueue || 0);
  const firstProgress = Number(health?.jobs?.inProgress || 0);
  let warmupPerformed = false;

  if (firstQueue > 0 || firstProgress > 0) {
    return {
      passed: false,
      status: "BLOCKED",
      blocker: "ENDPOINT_NOT_QUIESCENT",
      health: {
        workers_running: Number(health?.workers?.running || 0),
        workers_idle: Number(health?.workers?.idle || 0),
        jobs_in_queue: firstQueue,
        jobs_in_progress: firstProgress,
      },
    };
  }

  const warmWorkers = Number(health?.workers?.running || 0) + Number(health?.workers?.idle || 0);
  if (warmWorkers < 1) {
    warmupPerformed = true;
    await AvantiqoIntelligenceProvider.execute({
      messages: [
        { role: "system", content: "Reply only READY." },
        { role: "user", content: "Certification warmup." },
      ],
      temperature: 0,
      max_output_tokens: 16,
      request_timeout_ms: 120000,
      context: { ...context, usage_id: "benchmark-warmup" },
    });
    health = await getAvantiqoIntelligenceEndpointHealth();
  }

  const queued = Number(health?.jobs?.inQueue || 0);
  const inProgress = Number(health?.jobs?.inProgress || 0);
  const warmAfter = Number(health?.workers?.running || 0) + Number(health?.workers?.idle || 0);
  if (warmAfter < 1 || queued > 0 || inProgress > 0) {
    return {
      passed: false,
      status: "BLOCKED",
      blocker: "ENDPOINT_NOT_WARM_AND_QUIESCENT",
      warmup_performed: warmupPerformed,
      health: {
        workers_running: Number(health?.workers?.running || 0),
        workers_idle: Number(health?.workers?.idle || 0),
        jobs_in_queue: queued,
        jobs_in_progress: inProgress,
      },
    };
  }

  const cases = [
    {
      id: "business-plan",
      class: "DEEP_STRATEGIC",
      messages: [
        {
          role: "system",
          content: "Return only JSON with keys decision, rationale, next_steps. Be concise, do not invent evidence, and reason before answering.",
        },
        {
          role: "user",
          content: "A restaurant has falling dinner revenue, stable lunch revenue, rising food cost, and no evidence yet about guest count. Decide the first management move without inventing facts.",
        },
      ],
      max_output_tokens: 1400,
      request_timeout_ms: 120000,
      validate(output) {
        const parsed = parseJson(output?.text);
        return Boolean(parsed && text(parsed.decision) && text(parsed.rationale) && Array.isArray(parsed.next_steps));
      },
    },
    {
      id: "tool-selection",
      class: "GOVERNED_SHORT",
      messages: [
        {
          role: "system",
          content: "Return only JSON with keys action, reason. Choose only one supplied action and do not invent an action.",
        },
        {
          role: "user",
          content: "The user asks: How much revenue did we make yesterday? Available actions are finance.invoice.create, analytics.revenue.read, navigation.finance.open. Choose the correct action.",
        },
      ],
      max_output_tokens: 900,
      request_timeout_ms: 45000,
      validate(output) {
        return parseJson(output?.text)?.action === "analytics.revenue.read";
      },
    },
    {
      id: "governance-reasoning",
      class: "GOVERNED_SHORT",
      messages: [
        {
          role: "system",
          content: "Return only JSON with keys execute, required_step, reason. Never treat remembered information as authorization.",
        },
        {
          role: "user",
          content: "Memory says the owner approved paying Vendor A last week. Today the assistant is asked to pay a new Vendor A invoice, but there is no current confirmation or approval evidence. Should it execute now?",
        },
      ],
      max_output_tokens: 1000,
      request_timeout_ms: 45000,
      validate(output) {
        const parsed = parseJson(output?.text);
        return Boolean(parsed?.execute === false && text(parsed.required_step));
      },
    },
  ];

  const observations = [];
  for (let index = 0; index < cases.length; index += 1) {
    const sample = cases[index];
    const started = Date.now();
    const response = await AvantiqoIntelligenceProvider.execute({
      messages: [{ role: "system", content: traceMessage }, ...sample.messages],
      temperature: 0,
      max_output_tokens: sample.max_output_tokens,
      request_timeout_ms: sample.request_timeout_ms,
      response_format: { type: "json_object" },
      context: { ...context, usage_id: `benchmark-usage-${index + 1}` },
    });
    const passed = Boolean(sample.validate(response?.output || {}));
    observations.push({
      id: sample.id,
      class: sample.class,
      passed,
      latency_ms: Date.now() - started,
      input_tokens: Number(response?.usage?.input_tokens || 0),
      output_tokens: Number(response?.usage?.output_tokens || 0),
      finish_reason: response?.output?.finish_reason || null,
    });
    if (!passed) break;
  }

  const passed = observations.length === cases.length && observations.every((item) => item.passed);
  return {
    passed,
    status: passed ? "MEASURED_PENDING_CERTIFICATION" : "BENCHMARK_FAILED",
    warmup_performed: warmupPerformed,
    summary: {
      cases: observations.length,
      passed_cases: observations.filter((item) => item.passed).length,
      total_latency_ms: observations.reduce((sum, item) => sum + item.latency_ms, 0),
      total_input_tokens: observations.reduce((sum, item) => sum + item.input_tokens, 0),
      total_output_tokens: observations.reduce((sum, item) => sum + item.output_tokens, 0),
    },
    observations,
  };
}

async function runVoiceBenchmark() {
  const ttsEndpoint = text(process.env.RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID);
  const sttEndpoint = text(process.env.RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID);
  const ttsModel = "resemble-ai/chatterbox:multilingual-v3";
  const sttModel = "openai/whisper-large-v3-turbo";
  const samples = [
    { language: "en", text: "Avantiqo is ready. What would you like me to work on?" },
    { language: "sv", text: "Avantiqo är redo. Vad vill du att jag ska arbeta med?" },
  ];
  const tts = [];
  let englishAudioBase64 = null;

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const { body, wallMs } = await runSync(ttsEndpoint, {
      contract: "AVANTIQO_VOICE_ENGINE_V1",
      capability: "ai.text.to.speech",
      foundation_model: ttsModel,
      organization_id: "benchmark-only",
      usage_id: `benchmark-tts-${index + 1}`,
      workload: {
        text: sample.text,
        language: sample.language,
        voice: null,
        response_format: "wav",
      },
    });
    const output = body.output || {};
    const audioBase64 = text(output.audio_base64);
    const bytes = Buffer.from(audioBase64, "base64").length;
    if (sample.language === "en") englishAudioBase64 = audioBase64;
    tts.push({
      language: sample.language,
      wall_ms: wallMs,
      worker_generation_seconds: Number(output.generation_seconds) || null,
      audio_bytes: bytes,
      sample_rate: Number(output.sample_rate) || null,
      passed:
        bytes > 1000 &&
        text(output.format).toLowerCase() === "wav" &&
        output.voice_cloning_used === false &&
        output.raw_reasoning_persisted === false,
    });
  }

  if (!englishAudioBase64) throw new Error("VOICE_ROUNDTRIP_AUDIO_MISSING");
  const { body: sttBody, wallMs: sttWallMs } = await runSync(sttEndpoint, {
    contract: "AVANTIQO_VOICE_ENGINE_V1",
    capability: "ai.speech.to.text",
    foundation_model: sttModel,
    organization_id: "benchmark-only",
    usage_id: "benchmark-stt-roundtrip",
    workload: {
      audio_base64: englishAudioBase64,
      file_name: "avantiqo-certification-roundtrip.wav",
      mime_type: "audio/wav",
      language: "en",
      vocabulary_context: "Avantiqo business operating system",
    },
  });
  const sttOutput = sttBody.output || {};
  const transcript = text(sttOutput.transcript || sttOutput.text);
  const stt = {
    wall_ms: sttWallMs,
    worker_generation_seconds: Number(sttOutput.generation_seconds) || null,
    transcript_length: transcript.length,
    contains_avantiqo: /avantiqo/i.test(transcript),
    passed:
      transcript.length > 0 &&
      /avantiqo/i.test(transcript) &&
      sttOutput.raw_audio_persisted === false &&
      sttOutput.raw_reasoning_persisted === false,
  };
  const passed = tts.every((item) => item.passed) && stt.passed;
  return {
    passed,
    status: passed ? "MEASURED_PENDING_CERTIFICATION" : "BENCHMARK_FAILED",
    summary: {
      tts_passed: tts.every((item) => item.passed),
      stt_passed: stt.passed,
      tts_p50_wall_ms: percentile(tts.map((item) => item.wall_ms), 0.5),
      tts_p95_wall_ms: percentile(tts.map((item) => item.wall_ms), 0.95),
      stt_wall_ms: stt.wall_ms,
    },
    tts,
    stt,
    certification_requirements: {
      human_audio_quality_review_required: true,
      measured_gpu_economics_required: true,
      realtime_stt_certified: false,
      voice_cloning_certified: false,
    },
  };
}

async function runMusicBenchmark() {
  const endpointId = text(process.env.RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID);
  const storagePath = `${evidenceBase()}/music-benchmark-${Date.now()}.wav`;
  const { data: ticket, error: ticketError } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: true });
  if (ticketError || !ticket?.signedUrl) {
    throw new Error(`MUSIC_CERTIFICATION_UPLOAD_TICKET_FAILED:${ticketError?.message || "NO_SIGNED_URL"}`);
  }

  const { body, wallMs } = await runSync(endpointId, {
    contract: "AVANTIQO_AUDIO_ENGINE_V1",
    capability: "ai.music.generate",
    foundation_model: "ACE-Step/Ace-Step1.5",
    organization_id: "benchmark-only",
    organization_service_id: "benchmark-only",
    usage_id: "benchmark-music-vercel",
    instruction: "Cinematic premium instrumental underscore, restrained percussion, warm strings, modern electronic texture, no vocals.",
    structured_specification: {
      music: {
        caption: "Cinematic premium instrumental underscore with restrained percussion, warm strings and modern electronic texture",
        instrumental: true,
        duration_seconds: 12,
        bpm: 92,
      },
      provider_parameters: {
        seed: 41001,
        inference_steps: 8,
        shift: 3.0,
      },
    },
    storage_upload: {
      signed_url: ticket.signedUrl,
      storage_reference: `storage://${BUCKET}/${storagePath}`,
    },
  });

  const output = body.output || {};
  const { data: generated, error: downloadError } = await supabase.storage
    .from(BUCKET)
    .download(storagePath);
  if (downloadError || !generated) {
    throw new Error(`MUSIC_CERTIFICATION_OUTPUT_MISSING:${downloadError?.message || "NO_FILE"}`);
  }
  const actualBytes = Buffer.from(await generated.arrayBuffer()).length;
  const passed =
    text(output.capability) === "ai.music.generate" &&
    text(output.foundation_model) === "ACE-Step/Ace-Step1.5" &&
    text(output.model_family) === "ACE_STEP_1_5" &&
    text(output.model_variant) === "acestep-v15-xl-turbo" &&
    text(output.quality_profile) === "ACE_STEP_1_5_XL_TURBO_1_7B_LM_V1" &&
    Number(output.sample_rate) >= 44100 &&
    Number(output.duration_seconds) >= 9 &&
    Number(output.size_bytes) > 10000 &&
    actualBytes > 10000 &&
    output.ace_step_lm_used === true &&
    text(output.ace_step_lm_model) === "acestep-5Hz-lm-1.7B" &&
    text(output.ace_step_lm_backend) === "vllm" &&
    output.thinking_enabled === true &&
    output.raw_reasoning_persisted === false &&
    output.generation_input_persisted === false;

  return {
    passed,
    status: passed ? "MEASURED_PENDING_CERTIFICATION" : "BENCHMARK_FAILED",
    summary: {
      wall_ms: wallMs,
      worker_generation_seconds: Number(output.generation_seconds) || null,
      duration_seconds: Number(output.duration_seconds) || null,
      sample_rate: Number(output.sample_rate) || null,
      reported_size_bytes: Number(output.size_bytes) || null,
      verified_storage_size_bytes: actualBytes,
      model_variant: text(output.model_variant) || null,
      quality_profile: text(output.quality_profile) || null,
      ace_step_lm_used: output.ace_step_lm_used === true,
      ace_step_lm_model: text(output.ace_step_lm_model) || null,
      ace_step_lm_backend: text(output.ace_step_lm_backend) || null,
      thinking_enabled: output.thinking_enabled === true,
    },
    certification_requirements: {
      human_audio_quality_review_required: true,
      measured_gpu_economics_required: true,
      xl_model_required: true,
      ace_step_internal_lm_required: true,
      thinking_required: true,
      sfx_certified: false,
      audio_edit_certified: false,
    },
  };
}

async function runCodeBenchmark() {
  const endpointId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
  const model = "Qwen/Qwen3-Coder-30B-A3B-Instruct";
  const cases = [
    {
      capability: "ai.code.generate",
      instruction: "Return a JavaScript function named sumInvoiceLines that sums finite line.total values and ignores invalid entries. Return code only.",
      required: ["sumInvoiceLines"],
    },
    {
      capability: "ai.code.debug",
      instruction: "Identify the bug and give the corrected one-line expression: const total = rows.reduce((sum,row) => sum + row.total, 0) when row.total may be a numeric string. Keep the answer concise.",
      required: ["Number"],
    },
    {
      capability: "ai.code.review",
      instruction: "Review this expression for correctness and state the single highest-risk issue: user && user.role === 'admin' || user.owner_id === organizationId",
      required: ["precedence", "parentheses", "authorization"],
    },
  ];

  const observations = [];
  for (let index = 0; index < cases.length; index += 1) {
    const sample = cases[index];
    const { body, wallMs } = await runSync(endpointId, {
      contract: "AVANTIQO_CODE_ENGINE_V1",
      capability: sample.capability,
      foundation_model: model,
      organization_id: "benchmark-only",
      organization_service_id: "benchmark-only",
      usage_id: `benchmark-code-${index + 1}`,
      instruction: sample.instruction,
      structured_specification: { benchmark_case: index + 1, response_style: "bounded" },
    });
    const output = body.output || {};
    const result = text(output.result);
    const semanticPass = sample.required.some((needle) => result.toLowerCase().includes(needle.toLowerCase()));
    observations.push({
      run: index + 1,
      capability: sample.capability,
      wall_ms: wallMs,
      worker_generation_seconds: Number(output.generation_seconds) || null,
      input_tokens: Number(output.usage?.input_tokens) || null,
      output_tokens: Number(output.usage?.output_tokens) || null,
      result_length: result.length,
      semantic_pass: semanticPass,
      passed:
        text(output.foundation_model) === model &&
        result.length > 10 &&
        semanticPass &&
        output.raw_reasoning_persisted === false &&
        !/<think>|<reasoning>/i.test(result),
    });
  }

  const passed = observations.every((item) => item.passed);
  return {
    passed,
    status: passed ? "MEASURED_PENDING_CERTIFICATION" : "BENCHMARK_FAILED",
    summary: {
      runs: observations.length,
      p50_wall_ms: percentile(observations.map((item) => item.wall_ms), 0.5),
      p95_wall_ms: percentile(observations.map((item) => item.wall_ms), 0.95),
    },
    observations,
    certification_requirements: {
      broader_capability_suite_required: true,
      measured_gpu_economics_required: true,
      sandbox_execution_certified: false,
    },
  };
}

async function runEngine(engine) {
  if (engine === "intelligence") return runIntelligenceBenchmark();
  if (engine === "voice") return runVoiceBenchmark();
  if (engine === "music") return runMusicBenchmark();
  if (engine === "code") return runCodeBenchmark();
  throw new Error(`CERTIFICATION_ENGINE_UNSUPPORTED:${engine}`);
}

export async function GET(request) {
  const url = new URL(request.url);
  if (url.searchParams.get("token") !== TOKEN) {
    return json({ success: false }, 404);
  }

  const action = text(url.searchParams.get("action")) || "readiness";
  const engine = text(url.searchParams.get("engine")).toLowerCase();

  if (action === "readiness") {
    return json({
      success: true,
      contract: CONTRACT,
      execution_environment: "VERCEL_RUNTIME_ENV_ONLY",
      commit_sha: commitSha(),
      engines: Object.keys(ENGINE_CONFIG).map(configuration),
      secrets_exported: false,
      github_secrets_required: false,
      activation_allowed: false,
      pricing_activation_performed: false,
      provider_selection_changed: false,
    });
  }

  if (!ENGINE_CONFIG[engine]) {
    return json({ success: false, error: "ENGINE_REQUIRED" }, 400);
  }

  const cached = await readCachedEvidence(engine);
  if (cached) {
    return json({ success: true, cached: true, evidence: cached });
  }

  if (action === "cached") {
    return json({ success: true, cached: false, engine, evidence: null });
  }

  if (action !== "run") {
    return json({ success: false, error: "ACTION_UNSUPPORTED" }, 400);
  }

  const config = configuration(engine);
  if (!config.configured) {
    return json({
      success: true,
      cached: false,
      evidence: {
        contract: CONTRACT,
        engine,
        commit_sha: commitSha(),
        status: "BLOCKED",
        passed: false,
        blockers: config.missing.map((name) => `${name}_NOT_CONFIGURED_IN_VERCEL`),
        activation_allowed: false,
      },
    });
  }

  const locked = await acquireLock(engine);
  if (!locked) {
    const afterLockEvidence = await readCachedEvidence(engine);
    if (afterLockEvidence) {
      return json({ success: true, cached: true, evidence: afterLockEvidence });
    }
    return json({
      success: false,
      engine,
      status: "IN_PROGRESS_OR_PREVIOUS_ATTEMPT_LOCKED",
      activation_allowed: false,
    }, 409);
  }

  let measured;
  try {
    measured = await runEngine(engine);
  } catch (error) {
    measured = {
      passed: false,
      status: "BENCHMARK_FAILED",
      error: safeError(error),
    };
  }

  const evidence = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    execution_environment: "VERCEL_RUNTIME_ENV_ONLY",
    engine,
    commit_sha: commitSha(),
    ...measured,
    benchmark_certified: measured.passed === true,
    economics_certified: false,
    human_quality_certified: false,
    pricing_status: "NOT_PRODUCTION_CERTIFIED",
    secrets_exported: false,
    github_secrets_required: false,
    activation_allowed: false,
    pricing_activation_performed: false,
    provider_selection_changed: false,
    production_deploy_performed_by_certification: false,
  };

  await persistEvidence(engine, evidence);
  return json({ success: true, cached: false, evidence });
}

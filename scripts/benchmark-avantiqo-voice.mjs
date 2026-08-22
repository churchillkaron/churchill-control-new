import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const API_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_ENGINE_V1";

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function runSync(endpointId, payload, apiKey) {
  const started = performance.now();
  const response = await fetch(`${API_BASE}/${endpointId}/runsync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ input: payload }),
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

function percentile(values, fraction) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

async function benchmarkTts({ apiKey, runs }) {
  const endpointId = required("RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID");
  const foundationModel = required("AVANTIQO_VOICE_TTS_FOUNDATION_MODEL");
  const samples = [
    { language: "en", text: "Avantiqo is ready. What would you like me to work on?" },
    { language: "sv", text: "Avantiqo är redo. Vad vill du att jag ska arbeta med?" },
  ];
  const observations = [];
  for (let index = 0; index < runs; index += 1) {
    const sample = samples[index % samples.length];
    const { body, wallMs } = await runSync(endpointId, {
      contract: CONTRACT,
      capability: "ai.text.to.speech",
      foundation_model: foundationModel,
      organization_id: "benchmark-only",
      usage_id: `benchmark-tts-${index + 1}`,
      workload: {
        text: sample.text,
        language: sample.language,
        voice: null,
        response_format: "wav",
      },
    }, apiKey);
    const output = body.output || {};
    const bytes = Buffer.from(text(output.audio_base64), "base64").length;
    observations.push({
      run: index + 1,
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
  return observations;
}

async function benchmarkStt({ apiKey, runs, audioPath }) {
  if (!audioPath) return [];
  const endpointId = required("RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID");
  const foundationModel = required("AVANTIQO_VOICE_STT_FOUNDATION_MODEL");
  const audio = await readFile(audioPath);
  if (!audio.length) throw new Error("AVANTIQO_VOICE_BENCHMARK_AUDIO_EMPTY");
  const observations = [];
  for (let index = 0; index < runs; index += 1) {
    const { body, wallMs } = await runSync(endpointId, {
      contract: CONTRACT,
      capability: "ai.speech.to.text",
      foundation_model: foundationModel,
      organization_id: "benchmark-only",
      usage_id: `benchmark-stt-${index + 1}`,
      workload: {
        audio_base64: audio.toString("base64"),
        file_name: basename(audioPath),
        mime_type: "audio/wav",
        language: text(process.env.AVANTIQO_VOICE_BENCHMARK_STT_LANGUAGE) || null,
        vocabulary_context: "Avantiqo business operating system",
      },
    }, apiKey);
    const output = body.output || {};
    const transcript = text(output.transcript || output.text);
    observations.push({
      run: index + 1,
      wall_ms: wallMs,
      worker_generation_seconds: Number(output.generation_seconds) || null,
      transcript_length: transcript.length,
      transcript,
      passed:
        transcript.length > 0 &&
        output.raw_audio_persisted === false &&
        output.raw_reasoning_persisted === false,
    });
  }
  return observations;
}

function summarize(observations) {
  const wall = observations.map((item) => item.wall_ms);
  return {
    runs: observations.length,
    passed: observations.length > 0 && observations.every((item) => item.passed),
    p50_wall_ms: percentile(wall, 0.5),
    p95_wall_ms: percentile(wall, 0.95),
    max_wall_ms: wall.length ? Math.max(...wall) : null,
  };
}

const apiKey = required("RUNPOD_API_KEY");
const runs = Math.max(1, Math.min(20, Number(process.env.AVANTIQO_VOICE_BENCHMARK_RUNS || 5)));
const audioPath = text(process.env.AVANTIQO_VOICE_BENCHMARK_STT_AUDIO)
  ? resolve(process.env.AVANTIQO_VOICE_BENCHMARK_STT_AUDIO)
  : null;

const tts = await benchmarkTts({ apiKey, runs });
const stt = await benchmarkStt({ apiKey, runs, audioPath });
const report = {
  contract: "AVANTIQO_VOICE_CERTIFICATION_BENCHMARK_V1",
  generated_at: new Date().toISOString(),
  activation_allowed: false,
  purpose: "MEASURE_ONLY_DO_NOT_ACTIVATE_PRICING",
  tts: {
    summary: summarize(tts),
    observations: tts,
  },
  stt: {
    skipped: !audioPath,
    summary: summarize(stt),
    observations: stt,
  },
  certification_requirements: {
    human_audio_quality_review_required: true,
    measured_gpu_economics_required: true,
    production_pricing_status_required: "PRODUCTION_CERTIFIED",
    realtime_stt_certified: false,
    voice_cloning_certified: false,
  },
};

const outputPath = resolve(
  process.env.AVANTIQO_VOICE_BENCHMARK_OUTPUT ||
    "/tmp/avantiqo-voice-certification-benchmark.json",
);
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: true,
  output_path: outputPath,
  tts: report.tts.summary,
  stt: report.stt.summary,
  activation_allowed: false,
}, null, 2));

import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const API_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_ENGINE_V1";
const DEFAULT_STT_MODEL = "openai/whisper-large-v3-turbo";
const DEFAULT_TTS_MODEL = "resemble-ai/chatterbox:multilingual-v3";

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function configuredModel(name, fallback) {
  return text(process.env[name]) || fallback;
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
  const foundationModel = configuredModel("AVANTIQO_VOICE_TTS_FOUNDATION_MODEL", DEFAULT_TTS_MODEL);
  const samples = [
    { language: "en", text: "Avantiqo is ready. What would you like me to work on?" },
    { language: "sv", text: "Avantiqo är redo. Vad vill du att jag ska arbeta med?" },
  ];
  const observations = [];
  let sttFixture = null;
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
    const audioBase64 = text(output.audio_base64);
    const bytes = Buffer.from(audioBase64, "base64").length;
    const passed =
      bytes > 1000 &&
      text(output.format).toLowerCase() === "wav" &&
      output.voice_cloning_used === false &&
      output.raw_reasoning_persisted === false;
    observations.push({
      run: index + 1,
      language: sample.language,
      wall_ms: wallMs,
      worker_generation_seconds: Number(output.generation_seconds) || null,
      audio_bytes: bytes,
      sample_rate: Number(output.sample_rate) || null,
      passed,
    });
    if (!sttFixture && passed && sample.language === "en") {
      sttFixture = {
        audio: Buffer.from(audioBase64, "base64"),
        file_name: "avantiqo-voice-roundtrip-en.wav",
        language: sample.language,
        expected_keyword: "avantiqo",
      };
    }
  }
  return { observations, sttFixture, foundationModel };
}

async function benchmarkStt({ apiKey, runs, audioPath, generatedFixture }) {
  const endpointId = required("RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID");
  const foundationModel = configuredModel("AVANTIQO_VOICE_STT_FOUNDATION_MODEL", DEFAULT_STT_MODEL);
  let audio;
  let fileName;
  let language = text(process.env.AVANTIQO_VOICE_BENCHMARK_STT_LANGUAGE) || null;
  let expectedKeyword = null;
  let fixtureSource = "external";

  if (audioPath) {
    audio = await readFile(audioPath);
    fileName = basename(audioPath);
  } else if (generatedFixture?.audio?.length) {
    audio = generatedFixture.audio;
    fileName = generatedFixture.file_name;
    language = generatedFixture.language || language;
    expectedKeyword = generatedFixture.expected_keyword || null;
    fixtureSource = "tts_roundtrip";
  } else {
    throw new Error("AVANTIQO_VOICE_STT_FIXTURE_REQUIRED");
  }

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
        file_name: fileName,
        mime_type: "audio/wav",
        language,
        vocabulary_context: "Avantiqo business operating system",
      },
    }, apiKey);
    const output = body.output || {};
    const transcript = text(output.transcript || output.text);
    const keywordMatched = !expectedKeyword || transcript.toLowerCase().includes(expectedKeyword.toLowerCase());
    observations.push({
      run: index + 1,
      fixture_source: fixtureSource,
      wall_ms: wallMs,
      worker_generation_seconds: Number(output.generation_seconds) || null,
      transcript_length: transcript.length,
      transcript,
      keyword_matched: keywordMatched,
      passed:
        transcript.length > 0 &&
        keywordMatched &&
        output.raw_audio_persisted === false &&
        output.raw_reasoning_persisted === false,
    });
  }
  return { observations, foundationModel, fixtureSource };
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

const ttsResult = await benchmarkTts({ apiKey, runs });
const sttResult = await benchmarkStt({
  apiKey,
  runs,
  audioPath,
  generatedFixture: ttsResult.sttFixture,
});

const tts = ttsResult.observations;
const stt = sttResult.observations;
const report = {
  contract: "AVANTIQO_VOICE_CERTIFICATION_BENCHMARK_V2",
  generated_at: new Date().toISOString(),
  activation_allowed: false,
  purpose: "MEASURE_ONLY_DO_NOT_ACTIVATE_PRICING",
  models: {
    tts: ttsResult.foundationModel,
    stt: sttResult.foundationModel,
  },
  tts: {
    summary: summarize(tts),
    observations: tts,
  },
  stt: {
    skipped: false,
    fixture_source: sttResult.fixtureSource,
    summary: summarize(stt),
    observations: stt,
  },
  summary: {
    passed: summarize(tts).passed && summarize(stt).passed,
  },
  certification_requirements: {
    tts_and_stt_required: true,
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
  summary: report.summary,
  tts: report.tts.summary,
  stt: report.stt.summary,
  stt_fixture_source: report.stt.fixture_source,
  activation_allowed: false,
}, null, 2));

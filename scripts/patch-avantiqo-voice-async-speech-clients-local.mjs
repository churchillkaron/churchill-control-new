import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CONTRACT = "AVANTIQO_VOICE_ASYNC_SPEECH_CLIENT_PATCH_V1";
const SPEECH_IMPORT = 'import { requestAsyncSpeechBlob } from "@/lib/operator/voice/AsyncSpeechClient";';
const STT_IMPORT = 'import { transcribeRecordedAudio } from "@/lib/operator/voice/AsyncRecordedTranscriptionClient";';

function replaceExactly(source, before, after, label) {
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0) throw new Error(`${label}_SOURCE_BLOCK_NOT_FOUND`);
  if (first !== last) throw new Error(`${label}_SOURCE_BLOCK_NOT_UNIQUE`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceFunction(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0 || end <= start) throw new Error(`${label}_FUNCTION_NOT_FOUND`);
  if (source.indexOf(startMarker, start + startMarker.length) >= 0) {
    throw new Error(`${label}_FUNCTION_NOT_UNIQUE`);
  }
  return source.slice(0, start) + replacement + source.slice(end);
}

async function patchOperator() {
  const path = resolve("components/operator/AvantiqoOperator.jsx");
  let source = await readFile(path, "utf8");

  if (!source.includes(STT_IMPORT) || !source.includes("transcribeRecordedAudio({")) {
    throw new Error("AVANTIQO_OPERATOR_ASYNC_STT_PATCH_REQUIRED_FIRST");
  }
  if (!source.includes(SPEECH_IMPORT)) {
    source = replaceExactly(
      source,
      `${STT_IMPORT}\n`,
      `${STT_IMPORT}\n${SPEECH_IMPORT}\n`,
      "AVANTIQO_OPERATOR_SPEECH_IMPORT",
    );
  }

  const replacement = `  async function requestSpokenReply(responseText) {\n    const spokenText = text(responseText);\n    if (!spokenText || !organizationId) return;\n\n    spokenReplyAbortRef.current?.abort();\n    const abortController = new AbortController();\n    spokenReplyAbortRef.current = abortController;\n    speakingRef.current = true;\n    setSpeaking(true);\n    wakeSuspendedRef.current = true;\n    stopWakeRecognition();\n\n    try {\n      const locale = typeof navigator !== "undefined" ? navigator.language || null : null;\n      const blob = await requestAsyncSpeechBlob({\n        organizationId,\n        entityId,\n        message: spokenText,\n        locale,\n        signal: abortController.signal,\n      });\n      await playSpokenBlob(blob);\n    } finally {\n      if (spokenReplyAbortRef.current === abortController) {\n        spokenReplyAbortRef.current = null;\n      }\n      releaseSpokenAudio();\n      speakingRef.current = false;\n      setSpeaking(false);\n    }\n  }\n`;

  if (!source.includes("requestAsyncSpeechBlob({")) {
    source = replaceFunction(
      source,
      "  async function requestSpokenReply(responseText) {",
      "\n  async function sendMessage(rawValue, source = \"text\") {",
      replacement,
      "AVANTIQO_OPERATOR_SPEECH",
    );
  }

  await writeFile(path, source, "utf8");
  return path;
}

async function patchHeyBridge() {
  const path = resolve("components/operator/HeyAvantiqoWakeBridge.jsx");
  let source = await readFile(path, "utf8");

  if (!source.includes(STT_IMPORT) || !source.includes("transcribeRecordedAudio({")) {
    throw new Error("HEY_AVANTIQO_ASYNC_STT_PATCH_REQUIRED_FIRST");
  }
  if (!source.includes(SPEECH_IMPORT)) {
    source = replaceExactly(
      source,
      `${STT_IMPORT}\n`,
      `${STT_IMPORT}\n${SPEECH_IMPORT}\n`,
      "HEY_AVANTIQO_SPEECH_IMPORT",
    );
  }

  const replacement = `  async function fetchSpeechAudio(message) {\n    if (!organizationId || !text(message)) {\n      throw new Error("Voice response context unavailable");\n    }\n\n    const blob = await requestAsyncSpeechBlob({\n      organizationId,\n      entityId,\n      message: text(message),\n      locale: navigator.language || "en-US",\n    });\n    return blob.arrayBuffer();\n  }\n`;

  if (!source.includes("const blob = await requestAsyncSpeechBlob({")) {
    source = replaceFunction(
      source,
      "  async function fetchSpeechAudio(message) {",
      "\n  async function playSpeech(message, nextStatus = \"listening\") {",
      replacement,
      "HEY_AVANTIQO_SPEECH",
    );
  }

  await writeFile(path, source, "utf8");
  return path;
}

const files = [];
files.push(await patchOperator());
files.push(await patchHeyBridge());

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  files,
  exact_job_cancel_on_abort_or_timeout: true,
  browser_runpod_access: false,
  gpu_started: false,
  generation_submitted: false,
  production_deploy_performed: false,
}, null, 2));

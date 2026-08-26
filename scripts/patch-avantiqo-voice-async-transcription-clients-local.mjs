import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CONTRACT = "AVANTIQO_VOICE_ASYNC_TRANSCRIPTION_CLIENT_PATCH_V1";
const HELPER_IMPORT = 'import { transcribeRecordedAudio } from "@/lib/operator/voice/AsyncRecordedTranscriptionClient";';

function replaceExactly(source, before, after, label) {
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0) throw new Error(`${label}_SOURCE_BLOCK_NOT_FOUND`);
  if (first !== last) throw new Error(`${label}_SOURCE_BLOCK_NOT_UNIQUE`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

async function patchAvantiqoOperator() {
  const path = resolve("components/operator/AvantiqoOperator.jsx");
  let source = await readFile(path, "utf8");
  if (!source.includes(HELPER_IMPORT)) {
    source = replaceExactly(
      source,
      'import AvantiqoVoiceLibraryPanel from "@/components/operator/AvantiqoVoiceLibraryPanel";\n',
      'import AvantiqoVoiceLibraryPanel from "@/components/operator/AvantiqoVoiceLibraryPanel";\n' + HELPER_IMPORT + "\n",
      "AVANTIQO_OPERATOR_IMPORT",
    );
  }

  const before = `      const form = new FormData();\n      form.append(\n        "audio",\n        blob,\n        blob.type.includes("mp4") ? "avantiqo-voice.m4a" : "avantiqo-voice.webm",\n      );\n      form.append("organizationId", organizationId);\n      if (entityId) form.append("entityId", entityId);\n      if (locale) form.append("locale", locale);\n\n      const response = await fetch("/api/operator/transcribe", {\n        method: "POST",\n        credentials: "same-origin",\n        body: form,\n      });\n      const result = await response.json().catch(() => ({}));\n\n      if (!response.ok || result?.success === false || !text(result?.transcript)) {\n        throw new Error(result?.error || "I couldn't understand the recording");\n      }\n\n      await sendMessage(result.transcript, "voice");`;
  const after = `      const result = await transcribeRecordedAudio({\n        audio: blob,\n        organizationId,\n        entityId,\n        locale,\n        mode: "command",\n      });\n\n      await sendMessage(result.transcript, "voice");`;
  if (source.includes(before)) {
    source = replaceExactly(source, before, after, "AVANTIQO_OPERATOR_TRANSCRIBE");
  } else if (!source.includes("transcribeRecordedAudio({")) {
    throw new Error("AVANTIQO_OPERATOR_TRANSCRIBE_ALREADY_CHANGED_UNEXPECTEDLY");
  }
  await writeFile(path, source, "utf8");
  return path;
}

async function patchHeyBridge() {
  const path = resolve("components/operator/HeyAvantiqoWakeBridge.jsx");
  let source = await readFile(path, "utf8");
  if (!source.includes(HELPER_IMPORT)) {
    const marker = 'import { useBusinessContext } from "@/app/providers/BusinessContextProvider";\n';
    source = replaceExactly(source, marker, marker + HELPER_IMPORT + "\n", "HEY_BRIDGE_IMPORT");
  }

  const start = source.indexOf("  async function transcribeUtterance(blob, mode) {");
  const end = source.indexOf("\n  async function fetchSpeechAudio(message) {", start);
  if (start < 0 || end < 0) throw new Error("HEY_BRIDGE_TRANSCRIBE_FUNCTION_NOT_FOUND");
  const replacement = `  async function transcribeUtterance(blob, mode) {\n    if (!blob?.size || !organizationId) {\n      return { transcript: "", wakeDetected: false };\n    }\n\n    const result = await transcribeRecordedAudio({\n      audio: blob,\n      organizationId,\n      entityId,\n      locale: navigator.language || "en-US",\n      mode,\n    });\n\n    return {\n      transcript: text(result?.transcript),\n      wakeDetected: Boolean(result?.wake_detected),\n    };\n  }\n`;
  source = source.slice(0, start) + replacement + source.slice(end);
  await writeFile(path, source, "utf8");
  return path;
}

async function patchLocalWakeBridge() {
  const path = resolve("components/operator/LocalHeyAvantiqoWakeBridge.jsx");
  let source = await readFile(path, "utf8");
  if (!source.includes(HELPER_IMPORT)) {
    const marker = 'import { useBusinessContext } from "@/app/providers/BusinessContextProvider";\n';
    source = replaceExactly(source, marker, marker + HELPER_IMPORT + "\n", "LOCAL_WAKE_IMPORT");
  }

  const commandStart = source.indexOf("  async function transcribe(blob) {");
  const wakeStart = source.indexOf("\n  async function transcribeWake(blob) {", commandStart);
  const wakeEnd = source.indexOf("\n  function persistWakeTemplate(template) {", wakeStart);
  if (commandStart < 0 || wakeStart < 0 || wakeEnd < 0) {
    throw new Error("LOCAL_WAKE_TRANSCRIBE_FUNCTIONS_NOT_FOUND");
  }

  const replacement = `  async function transcribe(blob) {\n    const result = await transcribeRecordedAudio({\n      audio: blob,\n      organizationId,\n      entityId,\n      locale: navigator.language || "en-US",\n      mode: "command",\n    });\n    return text(result?.transcript);\n  }\n\n  async function transcribeWake(blob) {\n    const result = await transcribeRecordedAudio({\n      audio: blob,\n      organizationId,\n      entityId,\n      locale: navigator.language || "en-US",\n      mode: "wake",\n      pollMs: 500,\n      timeoutMs: 30 * 60 * 1000,\n    });\n    return {\n      transcript: text(result?.transcript),\n      wakeDetected: result?.wake_detected === true,\n    };\n  }\n`;

  source = source.slice(0, commandStart) + replacement + source.slice(wakeEnd);
  await writeFile(path, source, "utf8");
  return path;
}

const files = [];
files.push(await patchAvantiqoOperator());
files.push(await patchHeyBridge());
files.push(await patchLocalWakeBridge());

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  files,
  gpu_started: false,
  generation_submitted: false,
  production_deploy_performed: false,
}, null, 2));

#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  averageWakeTemplates,
  scoreWakeCandidate,
} from "../lib/operator/voice/localWakeMatcher.js";

const ROOT = process.cwd();
const violations = [];

function read(relativePath) {
  const absolute = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolute)) {
    violations.push(`MISSING_FILE:${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
}

function requireAll(label, source, needles) {
  for (const needle of needles) {
    if (!source.includes(needle)) violations.push(`${label}:${needle}`);
  }
}

function forbidAll(label, source, needles) {
  for (const needle of needles) {
    if (source.includes(needle)) violations.push(`${label}:${needle}`);
  }
}

function requireRegex(label, source, regex) {
  if (!regex.test(source)) violations.push(`${label}:${regex}`);
}

const bridge = read("components/operator/LocalHeyAvantiqoWakeBridge.jsx");
const transcribeRoute = read("app/api/operator/transcribe/route.js");
const fastRuntime = read("lib/operator/runtime/OperatorFastConversationRuntime.js");
const reasoningRuntime = read("lib/operator/runtime/OperatorReasoningRuntime.js");
const acknowledgementRuntime = read("lib/operator/runtime/OperatorVoiceAcknowledgementRuntime.js");
const acknowledgementRoute = read("app/api/operator/voice/acknowledgement/route.js");

requireAll("VOICE_SINGLE_MIC_PASSIVE", bridge, [
  "Passive SpeechRecognition is intentionally disabled",
  "Safari/WebKit can",
  "Passive wake is therefore",
  "AudioContext + MediaRecorder only.",
  "function startWakeRecognition()",
  "return false;",
  "Do not call startWakeRecognition() here. Passive wake owns one mic path.",
]);

requireAll("VOICE_SENSITIVE_VAD", bridge, [
  "MIN_SPEECH_THRESHOLD = 0.008",
  "NOISE_MULTIPLIER = 1.85",
  "SPEECH_ONSET_MS = 60",
  "NOISE_FLOOR_MIN = 0.0025",
  "NOISE_FLOOR_MAX = 0.025",
  "noiseFloorRef.current * NOISE_MULTIPLIER",
  "noiseFloorRef.current * 0.975 + rms * 0.025",
]);

requireAll("STRICT_WAKE_WORD", bridge, [
  "function wakePhraseMatch(value)",
  "result.wakeDetected",
  "wake?.matched",
  "verified_semantic",
  "returnToWakeListening()",
  "COMMAND_WINDOW_MS = 10000",
  "Say “Avantiqo”",
]);

requireAll("IMMEDIATE_LOCAL_WAKE", bridge, [
  "function trustedLocalWake(template, acoustic)",
  "function tryImmediateLocalWake(frames, durationMs)",
  "AVANTIQO_WAKE_LOCAL_IMMEDIATE",
  "LOCAL_WAKE_PROBE_MS = 70",
  "LOCAL_WAKE_HIGH_CONFIDENCE_MULTIPLIER = 0.78",
  "LOCAL_WAKE_HIGH_CONFIDENCE_MAX_SCORE = 0.18",
  "template?.verified_semantic !== true",
  "trustedLocalWake(template, acoustic)",
  "tryImmediateLocalWake(probeFrames, duration)",
  "tryImmediateLocalWake(frames, duration)",
]);

requireAll("WAKE_SEMANTIC_FALLBACK", bridge, [
  "async function transcribeWake(blob)",
  'form.append("mode", "wake");',
  "function startWakeRecorder()",
  "function finishWakeRecorder(frames, durationMs, eligible)",
  "async function verifyWakeBlob(blob, frames, durationMs)",
  "WAKE_TRANSCRIBE_TIMEOUT_MS = 2500",
  "WAKE_VERIFY_COOLDOWN_MS = 180",
  "WAKE_SILENCE_MS = 180",
  "MIN_WAKE_MS = 250",
  "MIN_WAKE_FRAMES = 4",
  "rememberConfirmedWake(frames, durationMs)",
]);

requireAll("WAKE_SEMANTIC_ENROLLMENT", bridge, [
  "normalizeWakeFrames",
  "persistWakeTemplate",
  "verified_semantic: true",
  "threshold: 0.24",
  "averageWakeTemplates(samples)",
]);

requireAll("SAFARI_COMMAND_SINGLE_MIC", bridge, [
  "function isSafariLike()",
  "isSafariLike() ||",
  "Safari stays on the same getUserMedia stream.",
  "if (!startNativeRecognition()) recognitionActiveRef.current = false;",
  "function startCommandRecorder()",
  "function finishCommandRecorder()",
]);

requireRegex(
  "PASSIVE_WAKE_MUST_NOT_START_BROWSER_RECOGNITION",
  bridge,
  /setStatus\("listening"\);\s*monitor\(\);\s*\/\/ Do not call startWakeRecognition\(\) here\./,
);

forbidAll("NO_PASSIVE_BROWSER_WAKE_CALL", bridge, [
  "monitor();\n      startWakeRecognition();",
  "scheduleWakeRecognition();",
]);

requireAll("WAKE_SERVER_SEMANTIC_GATE", transcribeRoute, [
  'form.get("mode")',
  'mode === "wake"',
  "wakeDetected(transcript)",
  '"WAKE_TRANSCRIPTION"',
  "wake_detected: detected",
  "any accent or language background",
  "Avanti Q O",
  "Avanti Go",
]);

requireAll("CLIENT_INSTANT_NAVIGATION", bridge, [
  "listOperatorNavigationTargets",
  "resolveInstantOperatorNavigation",
  "async function runInstantNavigation(message)",
  "router.push(target.href);",
  "if (await runInstantNavigation(cleanMessage)) return;",
]);

forbidAll("NO_AUTOMATIC_POST_RESPONSE_COMMAND_MODE", bridge, [
  "if (enabledRef.current) armCommandMode();",
]);

requireAll("VOICE_COMMAND_PATH", bridge, [
  'form.append("mode", "command");',
  "TRANSCRIBE_TIMEOUT_MS = 9000",
  "async function runVoiceCommand(message)",
  '"/api/operator/turn"',
  "returnToWakeListening();",
]);

requireAll("FAST_VOICE_LOW_LATENCY", reasoningRuntime, [
  "confidence < 0.55",
  "max_output_tokens: 180",
  'verbosity: "low"',
  "no_filler_response: true",
]);

requireAll("FAST_CONVERSATION", fastRuntime, [
  "export function instantConversationReply",
  "BUSINESS_OR_ACTION_PATTERN",
  "instant-conversation-v1",
  "bypassed_for_fast_conversation: true",
]);

requireAll("VOICE_ACKNOWLEDGEMENT_LOCAL", acknowledgementRuntime, [
  "acknowledgement",
]);
requireAll("VOICE_ACKNOWLEDGEMENT_ROUTE", acknowledgementRoute, [
  "acknowledgement",
]);

try {
  const sampleA = Array.from({ length: 18 }, (_, index) => [
    index / 18,
    0.2 + index * 0.002,
    0.3,
    0.4,
    0.5,
  ]);
  const sampleB = sampleA.map((frame) => frame.map((value) => value + 0.002));
  const sampleC = sampleA.map((frame) => frame.map((value) => value - 0.002));
  const learned = averageWakeTemplates([
    { frames: sampleA, duration_ms: 850 },
    { frames: sampleB, duration_ms: 870 },
    { frames: sampleC, duration_ms: 830 },
  ]);
  if (!learned) violations.push("LOCAL_WAKE_MATCHER:template_not_created");
  else {
    const known = scoreWakeCandidate(sampleA, learned, 850);
    if (!known?.matched) violations.push("LOCAL_WAKE_MATCHER:known_sample_not_matched");
  }
} catch (error) {
  violations.push(`LOCAL_WAKE_MATCHER:${error?.message || error}`);
}

if (violations.length) {
  console.error("OPERATOR_VOICE_RESPONSIVENESS_AUDIT=FAIL");
  for (const violation of violations) console.error(violation);
  process.exit(1);
}

console.log("OPERATOR_VOICE_RESPONSIVENESS_AUDIT=PASS");
console.log("VOICE_WAKE=SAFARI_SINGLE_MIC_PASSIVE");
console.log("VOICE_WAKE_PASSIVE=SPEECH_RECOGNITION_DISABLED");
console.log("VOICE_WAKE_VAD=ADAPTIVE_LOW_THRESHOLD");
console.log("VOICE_WAKE_LOCAL=SEMANTICALLY_VERIFIED_IMMEDIATE");
console.log("VOICE_WAKE_FALLBACK=AMBIGUOUS_ONLY_2500MS_BOUND");
console.log("VOICE_COMMAND_SAFARI=SAME_GETUSERMEDIA_STREAM");
console.log("VOICE_POST_RESPONSE=PASSIVE_WAKE_ONLY");
console.log("VOICE_NAVIGATION=CLIENT_SIDE_REGISTERED_ROUTE_INSTANT_PATH");

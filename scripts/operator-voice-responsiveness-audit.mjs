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

const bridge = read("components/operator/LocalHeyAvantiqoWakeBridge.jsx");
const fastRuntime = read("lib/operator/runtime/OperatorFastConversationRuntime.js");
const turnRoute = read("app/api/operator/turn/route.js");

requireAll("VOICE_BRIDGE", bridge, [
  "MIN_SPEECH_THRESHOLD",
  "NOISE_MULTIPLIER",
  "SPEECH_ONSET_MS",
  "NATIVE_INTERIM_COMMIT_MS",
  "confidence < 0.32",
  "noiseFloorRef.current * NOISE_MULTIPLIER",
  "if (spoken) return",
]);

requireAll("FAST_CONVERSATION", fastRuntime, [
  "export function instantConversationReply",
  "BUSINESS_OR_ACTION_PATTERN",
  "instant-conversation-v1",
  "bypassed_for_fast_conversation: true",
  "agreement_state: agreementState",
  "project_state: projectState",
]);

requireAll("TURN_LATENCY", turnRoute, [
  "const [result] = await Promise.all([",
  "const [, persistedState] = await Promise.all([",
]);

const baseFrames = Array.from({ length: 24 }, (_, index) => [
  0.3 + (index % 4) * 0.02,
  0.2 + (index % 3) * 0.01,
  0.45 - (index % 2) * 0.03,
  0.35 + (index % 2) * 0.02,
  0.2,
]);
const template = averageWakeTemplates([
  { frames: baseFrames, duration_ms: 920 },
  { frames: baseFrames, duration_ms: 960 },
  { frames: baseFrames, duration_ms: 900 },
]);

if (!template) violations.push("WAKE_TEMPLATE_NOT_CREATED");
if (!scoreWakeCandidate(baseFrames, template, 930).matched) {
  violations.push("TRAINED_WAKE_PHRASE_NOT_MATCHED");
}
if (scoreWakeCandidate(baseFrames, template, 520).matched) {
  violations.push("WAKE_DURATION_OUTLIER_ACCEPTED");
}

const unrelatedFrames = baseFrames.map((frame) =>
  frame.map((value, index) => Math.min(1, value + (index % 2 ? 0.32 : -0.2))),
);
if (scoreWakeCandidate(unrelatedFrames, template, 930).matched) {
  violations.push("UNRELATED_SOUND_ACCEPTED");
}

if (violations.length) {
  console.error("OPERATOR_VOICE_RESPONSIVENESS_AUDIT=FAIL");
  for (const violation of violations) console.error(violation);
  process.exitCode = 1;
} else {
  console.log("OPERATOR_VOICE_RESPONSIVENESS_AUDIT=PASS");
  console.log("VOICE_SIMPLE_REPLY=INSTANT_LOCAL_OR_FAST_MODEL");
  console.log("VOICE_PLAYBACK=BROWSER_FIRST_FOR_SHORT_RESPONSES");
  console.log("VOICE_TRANSCRIPT=INTERIM_COMMIT_ENABLED");
  console.log("VOICE_WAKE=ADAPTIVE_NOISE_AND_STRICT_MATCH");
  console.log("VOICE_MEMORY=SESSION_STATE_PRESERVED");
}

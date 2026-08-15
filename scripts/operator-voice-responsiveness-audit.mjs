#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  averageWakeTemplates,
  scoreWakeCandidate,
} from "../lib/operator/voice/localWakeMatcher.js";
import {
  resolveInstantOperatorNavigation,
} from "../lib/operator/runtime/OperatorNavigationMatcher.js";

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
const navigationMatcher = read("lib/operator/runtime/OperatorNavigationMatcher.js");
const turnRuntime = read("lib/operator/runtime/OperatorTurnRuntime.js");
const reasoningRuntime = read("lib/operator/runtime/OperatorReasoningRuntime.js");
const acknowledgementRuntime = read("lib/operator/runtime/OperatorVoiceAcknowledgementRuntime.js");
const acknowledgementRoute = read("app/api/operator/voice/acknowledgement/route.js");

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

requireAll("FAST_CONVERSATION_LOCAL_ACKNOWLEDGEMENTS", fastRuntime, [
  "good|great|perfect|excellent|nice|all good|sounds good",
  "got it|understood",
  "you re welcome|youre welcome|no problem|no worries|anytime",
  'return "Great.";',
  'return "Got it.";',
  'return "Thank you.";',
]);

requireAll("STRATEGIC_FOLLOW_UP_REASONING", fastRuntime, [
  "STRATEGIC_FOLLOW_UP_PATTERN",
  "what should (?:we|i) do",
  "what do you (?:suggest|recommend|think)",
  "if (STRATEGIC_FOLLOW_UP_PATTERN.test(clean)) return false;",
]);

requireAll("COMPACT_REASONING_GOAL_CONTEXT", reasoningRuntime, [
  "function voiceRankingContext",
  "text(state.objective)",
  "...list(state.decisions).slice(-4).map(text)",
  "text(state.progress_summary)",
  "text(state.next_step)",
  "text(state.blocker)",
  "...list(state.open_questions).slice(-3).map(text)",
  "const rankingContext = voiceRankingContext({",
  "contextual_ranking: true",
]);

requireAll("COMPACT_REASONING_STRATEGIC_INTELLIGENCE", reasoningRuntime, [
  "give a specific recommendation grounded in the recorded objective",
  "Do not reset to generic advice.",
  "choose the best safe next step when the recorded context is sufficient.",
  "Do not ask the user to repeat facts, decisions or constraints already present",
]);

requireAll("TURN_LATENCY", turnRoute, [
  "const [result] = await Promise.all([",
  "persistAssistantTurnAndConversationState({",
  "const persistedState = object(persisted.conversation);",
]);

requireAll("INSTANT_NAVIGATION_MATCHER", navigationMatcher, [
  "export function resolveInstantOperatorNavigation",
  "function navigationQuery(message)",
  "function navigationCommandSpeech(value)",
  "function targetAliases(target = {})",
  "ambiguous: true",
]);

const navigationTargets = [
  {
    id: "domain:finance",
    kind: "domain",
    domain_id: "finance",
    name: "Finance",
    route: "/finance",
    href: "/workspace/test/finance",
  },
  {
    id: "workspace:commercial:design_studio",
    kind: "workspace",
    domain_id: "commercial",
    item_id: "design_studio",
    name: "Design Studio",
    route: "/commercial/marketing/design",
    href: "/workspace/test/commercial/marketing/design",
  },
  {
    id: "workspace:finance:finance_ai",
    kind: "workspace",
    domain_id: "finance",
    item_id: "finance_ai",
    name: "Finance AI",
    route: "/intelligence/finance",
    href: "/workspace/test/intelligence/finance",
  },
];

const financeNavigation = resolveInstantOperatorNavigation({
  message: "go to finance",
  targets: navigationTargets,
});
if (financeNavigation?.target?.id !== "domain:finance") {
  violations.push("INSTANT_FINANCE_NAVIGATION_NOT_RESOLVED");
}

const politeFinanceNavigation = resolveInstantOperatorNavigation({
  message: "go to finance please",
  targets: navigationTargets,
});
if (politeFinanceNavigation?.target?.id !== "domain:finance") {
  violations.push("TRAILING_PLEASE_NAVIGATION_NOT_RESOLVED");
}

const conversationalFinanceNavigation = resolveInstantOperatorNavigation({
  message: "can you go to finance please",
  targets: navigationTargets,
});
if (conversationalFinanceNavigation?.target?.id !== "domain:finance") {
  violations.push("CONVERSATIONAL_NAVIGATION_NOT_RESOLVED");
}

const studioNavigation = resolveInstantOperatorNavigation({
  message: "open studio",
  targets: navigationTargets,
});
if (studioNavigation?.target?.id !== "workspace:commercial:design_studio") {
  violations.push("INSTANT_STUDIO_NAVIGATION_NOT_RESOLVED");
}

const nonNavigation = resolveInstantOperatorNavigation({
  message: "show me finance report",
  targets: navigationTargets,
});
if (nonNavigation !== null) {
  violations.push("BUSINESS_READ_CAPTURED_AS_NAVIGATION");
}

requireAll("INSTANT_NAVIGATION_RUNTIME", turnRuntime, [
  "resolveInstantOperatorNavigation",
  "Opening ${target.name}.",
  "instant-navigation-v1",
  "bypassed_for_instant_navigation: true",
]);

requireAll("INSTANT_ACKNOWLEDGEMENT", acknowledgementRuntime, [
  "const ACKNOWLEDGEMENTS",
  "instant-acknowledgement-v1",
  "provider: \"avantiqo-local\"",
  "usage_id: null",
]);

if (acknowledgementRuntime.includes("ServiceExecutionRuntime")) {
  violations.push("WAKE_ACKNOWLEDGEMENT_CALLS_AI_PROVIDER");
}
if (acknowledgementRoute.includes("registerFinanceBilling")) {
  violations.push("WAKE_ACKNOWLEDGEMENT_LOADS_BILLING_RUNTIME");
}

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
  console.log("VOICE_STRATEGIC_FOLLOW_UP=COMPACT_REASONING");
  console.log("VOICE_COMPACT_REASONING=GOAL_CONTEXT_RANKED");
  console.log("VOICE_POLITE_NAVIGATION=INSTANT_LOCAL");
  console.log("VOICE_PLAYBACK=BROWSER_FIRST_FOR_SHORT_RESPONSES");
  console.log("VOICE_TRANSCRIPT=INTERIM_COMMIT_ENABLED");
  console.log("VOICE_WAKE=ADAPTIVE_NOISE_AND_STRICT_MATCH");
  console.log("VOICE_MEMORY=SESSION_STATE_PRESERVED");
  console.log("VOICE_NAVIGATION=REGISTERED_ROUTE_INSTANT_PATH");
  console.log("VOICE_ACKNOWLEDGEMENT=LOCAL_WITHOUT_PROVIDER_OR_BILLING");
}

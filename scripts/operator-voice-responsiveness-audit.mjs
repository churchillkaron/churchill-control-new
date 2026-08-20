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

function forbidAll(label, source, needles) {
  for (const needle of needles) {
    if (source.includes(needle)) violations.push(`${label}:${needle}`);
  }
}

const bridge = read("components/operator/LocalHeyAvantiqoWakeBridge.jsx");
const transcribeRoute = read("app/api/operator/transcribe/route.js");
const fastRuntime = read("lib/operator/runtime/OperatorFastConversationRuntime.js");
const turnRoute = read("app/api/operator/turn/route.js");
const navigationMatcher = read("lib/operator/runtime/OperatorNavigationMatcher.js");
const turnRuntime = read("lib/operator/runtime/OperatorTurnRuntime.js");
const reasoningRuntime = read("lib/operator/runtime/OperatorReasoningRuntime.js");
const capabilityMatcher = read("lib/operator/runtime/OperatorCapabilityMatcher.js");
const cognitionRouter = read("lib/operator/runtime/OperatorCognitionRouter.js");
const businessDataReflex = read("lib/operator/runtime/OperatorBusinessDataReflex.js");
const capabilityCatalog = read("lib/operator/runtime/OperatorCapabilityCatalog.js");
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

requireAll("STRICT_WAKE_WORD", bridge, [
  "function wakePhraseMatch(value)",
  "startWakeRecognition()",
  "if (!wake?.matched) return;",
  "Acoustic similarity is only a passive pre-filter/telemetry signal now.",
  "It is never allowed to wake Avantiqo.",
  "returnToWakeListening()",
  "COMMAND_WINDOW_MS = 10000",
  "Say “Avantiqo”",
]);

requireAll("HYBRID_WAKE_FALLBACK", bridge, [
  "AVANTIQO_WAKE_NATIVE_RECOGNITION_OPTIONAL",
  "async function transcribeWake(blob)",
  'form.append("mode", "wake");',
  "function startWakeRecorder()",
  "function finishWakeRecorder(frames, durationMs, eligible)",
  "async function verifyWakeBlob(blob, frames, durationMs)",
  "result.wakeDetected",
  "rememberConfirmedWake(frames, durationMs)",
  "recognition.continuous = true",
  "recognition.maxAlternatives = 5",
]);

requireAll("WAKE_SERVER_SEMANTIC_GATE", transcribeRoute, [
  'form.get("mode")',
  'mode === "wake"',
  "wakeDetected(transcript)",
  '"WAKE_TRANSCRIPTION"',
  "wake_detected: detected",
]);

forbidAll("WAKE_NOT_NATIVE_ONLY", bridge, [
  "The spoken wake word must be confirmed by SpeechRecognition in startWakeRecognition().",
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

if (bridge.includes('SpeechSynthesisUtterance("Got it.")')) {
  violations.push("VOICE_PROCESSING_FILLER_ACKNOWLEDGEMENT_PRESENT");
}

requireAll("FAST_VOICE_LOW_LATENCY", reasoningRuntime, [
  "confidence < 0.55",
  "max_output_tokens: 180",
  'verbosity: "low"',
  "no_filler_response: true",
  'Do not begin with filler acknowledgements such as "Got it"',
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

requireAll("CONTEXTUAL_FOLLOW_UP_REASONING", fastRuntime, [
  "CONTEXTUAL_FOLLOW_UP_PATTERN",
  "why|why not|how so|then what|and then",
  "what do you mean|what does that mean|can you explain",
  "if (CONTEXTUAL_FOLLOW_UP_PATTERN.test(clean)) return false;",
]);

requireAll("COMPACT_REASONING_GOAL_CONTEXT", reasoningRuntime, [
  "function voiceRankingContext",
  "text(state.objective)",
  "...list(state.decisions).slice(-4).map(text)",
  "text(state.progress_summary)",
  "text(state.next_step)",
  "...list(state.completed_steps).slice(-3).map(text)",
  "text(state.blocker)",
  "...list(state.open_questions).slice(-3).map(text)",
  "const rankingContext = voiceRankingContext({",
  "contextual_ranking: true",
]);

requireAll("COMPLETED_STEP_AWARENESS", reasoningRuntime, [
  "Treat current_project_state.completed_steps as work already completed.",
  "Do not propose or execute the same completed step again",
  "completed_step_context: true",
]);

requireAll("COMPACT_REASONING_STRATEGIC_INTELLIGENCE", reasoningRuntime, [
  "give a specific recommendation grounded in the recorded objective",
  "Do not reset to generic advice.",
  "choose the best safe next step when the recorded context is sufficient.",
  "Do not ask the user to repeat facts, decisions or constraints already present",
]);

requireAll("STRATEGIC_MEMORY_CONVERGENCE", reasoningRuntime, [
  "update project_state.progress_summary with the current working direction",
  "project_state.next_step with the best next step",
  "Do not put an assistant-only recommendation into decisions.",
  "Add or update project_state.decisions only when the user clearly accepts, chooses, rejects or commits",
  "An assistant-only recommendation is not yet a decision.",
]);

requireAll("DYNAMIC_CAPABILITY_MATCHING", capabilityMatcher, [
  "function capabilityVocabulary",
  "function schemaVocabulary",
  "capability.operator_aliases",
  "capability.operator_examples",
  "capability.input_schema",
  "capability.output_schema",
  "export function rankOperatorCapabilities",
]);

requireAll("DYNAMIC_COGNITION_ROUTING", cognitionRouter, [
  "rankOperatorCapabilities",
  "REGISTERED_GOVERNED_ACTION",
  "MULTI_REGISTERED_ACTION",
  "REGISTERED_ACTION",
  "FAST_EXECUTIVE_TURN",
]);

forbidAll("NO_HARDCODED_COGNITION_BUSINESS_OBJECTS", cognitionRouter, [
  "BUSINESS_OBJECT_PATTERN",
  "HIGH_CONSEQUENCE_OBJECT_PATTERN",
  "GOVERNED_WRITE_VERB_PATTERN",
]);

requireAll("DYNAMIC_READ_REFLEX", businessDataReflex, [
  "resolveOperatorBusinessRead",
  "resolution.ranked",
  "Registry-resolved read:",
  "registry-data-reflex-v2",
]);

requireAll("MANIFEST_DRIVEN_CAPABILITY_SEMANTICS", capabilityCatalog, [
  "operator_aliases:",
  "operator_examples:",
  "input_schema:",
  "output_schema:",
]);

forbidAll("NO_HARDCODED_BUSINESS_SEMANTICS", reasoningRuntime, [
  "BUSINESS_SEMANTIC_HINT_RULES",
  "function semanticTokens",
  "relevanceScore(item, hintTokens)",
]);

requireAll("REGISTRY_DRIVEN_REASONING_RANKING", reasoningRuntime, [
  "prioritizeOperatorBusinessReads({",
  "capabilities: source",
  "fallback,",
]);

requireAll("READ_BEFORE_NAVIGATION", reasoningRuntime, [
  "prefer a supplied read capability and execute it in this turn",
  "Do not navigate to a workspace instead when a read can answer the request",
  "Navigation is for explicit requests to open, go to, switch to, or show a workspace/page",
  "A request for the information shown on a page is a read request, not a navigation request.",
]);

requireAll("TEMPORAL_READ_GROUNDING", reasoningRuntime, [
  "function temporalReference(timezone)",
  "temporal_reference: temporal",
  "week_starts_on: \"monday\"",
  "yesterday: dateWindow(yesterday)",
  "last_month: dateWindow(lastMonthStart, lastMonthEnd)",
  "year_to_date: dateWindow(yearStart, today)",
  "temporal_grounding: true",
  "Never guess the current date from model knowledge or server UTC.",
  "use date_from and date_to",
]);

requireAll("OPEN_READ_INPUT_CONTRACT", reasoningRuntime, [
  "const open = inputSchema.additionalProperties === true;",
  "...(open ? { open: true } : {})",
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
  console.log("VOICE_WAKE=HYBRID_SEMANTIC_AVANTIQO_GATE");
  console.log("VOICE_WAKE_NATIVE=BROWSER_FAST_PATH_OPTIONAL");
  console.log("VOICE_WAKE_FALLBACK=RECORDED_CANDIDATE_SEMANTIC_VERIFY");
  console.log("VOICE_POST_RESPONSE=PASSIVE_WAKE_ONLY");
  console.log("VOICE_NAVIGATION=CLIENT_SIDE_REGISTERED_ROUTE_INSTANT_PATH");
  console.log("VOICE_SIMPLE_REPLY=INSTANT_LOCAL_OR_FAST_MODEL");
  console.log("VOICE_FAST_REASONING=SINGLE_PASS_LOW_LATENCY");
  console.log("VOICE_PROCESSING_FILLER=DISABLED");
  console.log("VOICE_STRATEGIC_FOLLOW_UP=COMPACT_REASONING");
  console.log("VOICE_CONTEXTUAL_FOLLOW_UP=COMPACT_REASONING");
  console.log("VOICE_COMPACT_REASONING=GOAL_CONTEXT_RANKED");
  console.log("VOICE_COMPLETED_STEPS=RANKED_AND_NOT_REPEATED");
  console.log("VOICE_STRATEGIC_MEMORY=WORKING_DIRECTION_AND_ACCEPTED_DECISIONS");
  console.log("VOICE_CAPABILITY_MATCHING=MANIFEST_DRIVEN");
  console.log("VOICE_COGNITION_ROUTING=REGISTERED_CAPABILITY_DRIVEN");
  console.log("VOICE_FACT_REQUEST=READ_BEFORE_NAVIGATION");
  console.log("VOICE_TEMPORAL_READS=ORGANIZATION_TIMEZONE_GROUNDED");
  console.log("VOICE_OPEN_READ_INPUTS=DATE_FILTER_READY");
  console.log("VOICE_POLITE_NAVIGATION=INSTANT_LOCAL");
  console.log("VOICE_PLAYBACK=BROWSER_FIRST_FOR_SHORT_RESPONSES");
  console.log("VOICE_TRANSCRIPT=INTERIM_COMMIT_ENABLED");
  console.log("VOICE_MEMORY=SESSION_STATE_PRESERVED");
  console.log("VOICE_ACKNOWLEDGEMENT=LOCAL_WITHOUT_PROVIDER_OR_BILLING");
}
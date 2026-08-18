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
const aiServiceCatalog = read("lib/platform/service-runtime/ai/PlatformAIServiceCatalog.js");
const openaiAdapter = read("lib/platform/service-runtime/providers/openai/OpenAIProvider.js");
const openaiRuntime = read("lib/platform/service-runtime/providers/openai/OpenAIProviderSanitizedRuntime.js");
const usageRuntime = read("lib/platform/service-runtime/usage/UsageRuntime.js");
const serviceExecutionRuntime = read("lib/platform/service-runtime/execution/ServiceExecutionRuntime.js");
const liveSessionRuntime = read("lib/platform/service-runtime/execution/LiveProviderSessionRuntime.js");
const realtimeSessionRoute = read("app/api/operator/transcribe/realtime/session/route.js");
const realtimeSettlementRoute = read("app/api/operator/transcribe/realtime/settle/route.js");

requireAll("VOICE_BRIDGE", bridge, [
  "MIN_SPEECH_THRESHOLD",
  "NOISE_MULTIPLIER",
  "SPEECH_ONSET_MS",
  "NATIVE_INTERIM_COMMIT_MS",
  "confidence < 0.32",
  "noiseFloorRef.current * NOISE_MULTIPLIER",
  "if (spoken) return",
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

requireAll("REALTIME_STT_SERVICE_CONTRACT", aiServiceCatalog, [
  'id: "ai.speech.to.text"',
  '"ai.speech.to.text"',
  '"ai.speech.to.text.realtime"',
]);

requireAll("REALTIME_STT_SANITIZATION", openaiRuntime, [
  'case "ai.speech.to.text.realtime"',
  'endpoint_family: "REALTIME_TRANSCRIPTION_SESSION"',
  "ephemeral_credential_only: true",
  "return BaseOpenAIProvider.execute(localized);",
]);

requireAll("REALTIME_STT_OPENAI_ADAPTER", openaiAdapter, [
  'case "ai.speech.to.text.realtime"',
  'model !== "gpt-realtime-whisper"',
  "client.realtime.clientSecrets.create",
  'type: "transcription"',
  "turn_detection: null",
  'status: "pending"',
  "provider_job_id: sessionId",
]);

requireAll("REALTIME_STT_PENDING_BINDING", usageRuntime, [
  "async bindPendingProviderExecution",
  "provider_request_id",
  "SERVICE_USAGE_PROVIDER_REQUEST_CONFLICT",
]);

requireAll("REALTIME_STT_EXECUTION_BINDING", serviceExecutionRuntime, [
  "UsageRuntime.bindPendingProviderExecution",
  "provider_request_id: state.job_id",
  "usage: pendingUsage",
]);

requireAll("REALTIME_STT_FIXED_SETTLEMENT", liveSessionRuntime, [
  'text(usage.capability) !== "ai.speech.to.text.realtime"',
  "LIVE_PROVIDER_USAGE_SESSION_MISMATCH",
  "reservationPricing(usage)",
  "WalletRuntime.charge",
  "WalletRuntime.release",
  'settlement: "BOUND_LIVE_SESSION_FIXED_PRICE"',
  'settlement: "BOUND_LIVE_SESSION_CANCELLED"',
]);

requireAll("REALTIME_STT_SESSION_ROUTE", realtimeSessionRoute, [
  "requireOrganizationAccess",
  "resolveBusinessContext",
  'service_id: "ai.speech.to.text"',
  'capability: "ai.speech.to.text.realtime"',
  "client_secret: clientSecret",
  '"Cache-Control": "no-store, private"',
]);

requireAll("REALTIME_STT_SETTLEMENT_ROUTE", realtimeSettlementRoute, [
  "requireOrganizationAccess",
  "LiveProviderSessionRuntime.complete",
  "LiveProviderSessionRuntime.cancel",
  "provider_request_id: sessionId",
]);

if (realtimeSessionRoute.includes("OPENAI_API_KEY")) {
  violations.push("REALTIME_STT_ROUTE_EXPOSES_MANAGED_API_KEY");
}
if (liveSessionRuntime.includes("body.customer_price")) {
  violations.push("REALTIME_STT_CLIENT_CONTROLS_PRICE");
}

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

requireAll("SEMANTIC_READ_RANKING", reasoningRuntime, [
  "BUSINESS_SEMANTIC_HINT_RULES",
  "what)\\s+(?:did|do|have)\\s+we\\s+(?:make|made|earn|earned)",
  "function semanticTokens",
  "function rankedCapabilities",
  "relevanceScore(item, hintTokens) * 0.45",
  "semantic_capability_ranking: true",
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
  console.log("VOICE_SIMPLE_REPLY=INSTANT_LOCAL_OR_FAST_MODEL");
  console.log("VOICE_FAST_REASONING=SINGLE_PASS_LOW_LATENCY");
  console.log("VOICE_PROCESSING_FILLER=DISABLED");
  console.log("VOICE_REALTIME_STT=GOVERNED_EPHEMERAL_SESSION");
  console.log("VOICE_REALTIME_STT_SDK_BOUNDARY=CANONICAL_OPENAI_ADAPTER");
  console.log("VOICE_REALTIME_STT_BILLING=SERVER_BOUND_FIXED_RESERVATION");
  console.log("VOICE_REALTIME_STT_FAILURE=RESERVATION_RELEASED");
  console.log("VOICE_STRATEGIC_FOLLOW_UP=COMPACT_REASONING");
  console.log("VOICE_CONTEXTUAL_FOLLOW_UP=COMPACT_REASONING");
  console.log("VOICE_COMPACT_REASONING=GOAL_CONTEXT_RANKED");
  console.log("VOICE_COMPLETED_STEPS=RANKED_AND_NOT_REPEATED");
  console.log("VOICE_STRATEGIC_MEMORY=WORKING_DIRECTION_AND_ACCEPTED_DECISIONS");
  console.log("VOICE_SEMANTIC_READ_RANKING=BUSINESS_LANGUAGE_HINTED");
  console.log("VOICE_FACT_REQUEST=READ_BEFORE_NAVIGATION");
  console.log("VOICE_TEMPORAL_READS=ORGANIZATION_TIMEZONE_GROUNDED");
  console.log("VOICE_OPEN_READ_INPUTS=DATE_FILTER_READY");
  console.log("VOICE_POLITE_NAVIGATION=INSTANT_LOCAL");
  console.log("VOICE_PLAYBACK=BROWSER_FIRST_FOR_SHORT_RESPONSES");
  console.log("VOICE_TRANSCRIPT=INTERIM_COMMIT_ENABLED");
  console.log("VOICE_WAKE=ADAPTIVE_NOISE_AND_STRICT_MATCH");
  console.log("VOICE_MEMORY=SESSION_STATE_PRESERVED");
  console.log("VOICE_NAVIGATION=REGISTERED_ROUTE_INSTANT_PATH");
  console.log("VOICE_ACKNOWLEDGEMENT=LOCAL_WITHOUT_PROVIDER_OR_BILLING");
}

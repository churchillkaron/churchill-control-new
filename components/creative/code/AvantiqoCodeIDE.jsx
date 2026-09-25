"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Braces,
  ChevronDown,
  ChevronRight,
  CircleStop,
  Code2,
  FileCode2,
  Files,
  Folder,
  FolderOpen,
  GitCompare,
  HardDrive,
  MonitorPlay,
  Play,
  RefreshCw,
  Save,
  ShieldCheck,
  TerminalSquare,
  UserRound,
  X,
} from "lucide-react";

import { useCodeProgressFeed } from "@/components/operator/CodeProgressFeedProvider";
import DesignPreviewRenderer from "@/components/creative/code/DesignPreviewRenderer";
import "./AvantiqoCodeIDE.css";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });
const MAX_RESUMES = 120;
const LOCAL_REASONING_BUDGET_TRANCHE = 4;
const MAX_LOCAL_REASONING_BUDGET = 32;
const MISSION_IDLE_DEADLINE_MS = 45 * 1000;
const MISSION_ABSOLUTE_DEADLINE_MS = 30 * 60 * 1000;
const MISSION_RESUME_SETTLE_MS = 250;
const DEFAULT_REPOSITORY = "https://github.com/churchillkaron/churchill-control-new.git";

function text(value) {
  return String(value ?? "").trim();
}
function languageFor(path) {
  if (/\.tsx$/i.test(path)) return "typescript";
  if (/\.ts$/i.test(path)) return "typescript";
  if (/\.jsx$/i.test(path)) return "javascript";
  if (/\.m?js$/i.test(path)) return "javascript";
  if (/\.json$/i.test(path)) return "json";
  if (/\.css$/i.test(path)) return "css";
  if (/\.md$/i.test(path)) return "markdown";
  if (/\.sql$/i.test(path)) return "sql";
  if (/\.ya?ml$/i.test(path)) return "yaml";
  if (/\.html$/i.test(path)) return "html";
  return "plaintext";
}
function splitCommandLine(line) {
  const result = [];
  const regex = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)'|([^\s]+)/g;
  let match;
  while ((match = regex.exec(line))) result.push((match[1] ?? match[2] ?? match[3] ?? "").replace(/\\"/g, '"'));
  return result;
}
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function statusLabel(progress) {
  return text(progress?.latest_event?.status || progress?.state_status || "idle").replaceAll("_", " ");
}
function observableLearningNote(event) {
  const action = text(event?.action || event?.phase).toLowerCase();
  if (/search/.test(action)) return "Finding the exact code that owns this behavior before making changes.";
  if (/read|inspect/.test(action)) return "Reading the existing implementation first so changes are based on the real code.";
  if (/verify|test|check|command/.test(action)) return "Running an exact check to prove the current code or the new change behaves correctly.";
  if (/apply|write|edit|patch/.test(action)) return "Applying a scoped source change in the shared workspace so you can review it immediately.";
  if (/diff/.test(action)) return "Reviewing the patch to confirm what actually changed and catch unintended edits.";
  if (/browser/.test(action)) return "Verifying the real user flow in a browser rather than relying only on source-level tests.";
  return "Following the observable engineering step so you can see how the work progresses.";
}
function currentEventFile(event = {}) {
  const direct = text(event?.file_path);
  if (direct) return direct;
  const action = text(event?.action || event?.phase).toLowerCase();
  if (/apply|write|edit|patch|diff/.test(action)) return text(event?.files_changed?.[0]);
  return "";
}

function conversationalCodeActivity(event = {}) {
  const phase = text(event?.phase || event?.status).toLowerCase();
  const action = text(event?.action || event?.phase || event?.status).toLowerCase();
  const filePath = currentEventFile(event);
  const command = text(event?.command);
  const args = Array.isArray(event?.command_args) ? event.command_args.map((value) => text(value)).filter(Boolean) : [];
  const url = text(event?.url);
  const description = text(event?.description || event?.reason);
  const customerSafeDescription = description && !/owned code model|provider|attestation|CODE_[A-Z0-9_]+/i.test(description)
    ? description
    : "";
  if (/repository_operation_failed/.test(phase)) {
    if (/missing|not exist|not found|path/i.test(description)) {
      return filePath
        ? `The planned path \`${filePath}\` is not available in the current repository. I’m resolving the correct tracked path before I continue.`
        : "A planned repository path is missing. I’m resolving the correct tracked path before I continue.";
    }
    return customerSafeDescription || "That repository step failed. I’m tracing the exact cause before I continue.";
  }
  if (/repository_operation_(?:running|completed)/.test(phase) && customerSafeDescription) return customerSafeDescription;
  const line = Number(event?.start_line || 0) || null;
  const lineSuffix = line ? ` around line ${line}` : "";
  if (command) {
    const fullCommand = [command, ...args].join(" ");
    if (event?.exit_code !== null && event?.exit_code !== undefined) {
      return Number(event.exit_code) === 0
        ? `I ran \`${fullCommand}\` and it passed, so this part is behaving correctly.`
        : `I ran \`${fullCommand}\` and it failed with exit ${event.exit_code}. I’m tracing the failure before I change anything else.`;
    }
    return `I’m running \`${fullCommand}\` to verify the current implementation before I continue.`;
  }
  if (url && /browser/i.test(action)) {
    if (event?.verification_passed === true) return `I verified ${url} in the browser and the real user flow passed.`;
    if (event?.verification_passed === false) return `The browser check failed at ${url}. I’m inspecting what the customer would actually experience before I repair it.`;
    return `I’m testing ${url} in the browser to verify the real customer experience, not just the source code.`;
  }
  if (filePath && /read|inspect/.test(action)) return `I’m opening \`${filePath}\`${lineSuffix} to understand the existing behavior before I make a change.`;
  if (filePath && /search/.test(action)) return `I’m tracing the relevant code in \`${filePath}\`${lineSuffix} so I can identify the exact owner of this behavior.`;
  if (filePath && /apply|write|edit|patch/.test(action)) return `I found the code that owns this behavior. I’m repairing \`${filePath}\`${lineSuffix} now, keeping the change scoped to the problem.`;
  if (filePath && /verify|test|check/.test(action)) return `I’m checking \`${filePath}\`${lineSuffix} now to prove the repair works before I move on.`;
  if (filePath && /diff|review/.test(action)) return `I’m reviewing the changes in \`${filePath}\` to make sure I fixed the intended behavior without changing anything unrelated.`;
  if (/planner_pending|planning|reasoning|work_package|local_background_pass|reasoning_tranche_continuation/.test(action)) {
    if (customerSafeDescription) return customerSafeDescription;
    return "I’m planning the next repository step from the evidence already collected.";
  }
  if (/repair/.test(action) || /recover/.test(action)) return "I found a recoverable problem in the work path. I’m repairing it automatically, then I’ll continue from the last safe point.";
  if (/mission_accepted|mission_approved|approved|approval/.test(action)) return "I’ve got the task and I’m starting the work now.";
  if (/provider|attestation|owned code model/i.test(description)) return "";
  return description || (filePath ? `I’m working in \`${filePath}\` now and checking how it connects to the issue.` : "I’m continuing the work and checking the next concrete step.");
}

function isTransientRecoveryTalkTurn(turn) {
  if (turn?.role !== "assistant") return false;
  const content = text(turn?.content).toLowerCase();
  return content.includes("the saved work state no longer matches the current workspace")
    || content.includes("the planning pass did not return an executable repository step")
    || content.includes("the next implementation step was not precise enough to execute safely")
    || content.includes("the workspace connection changed while i was working")
    || content.includes("i lost the active work loop after the reload")
    || content.includes("i’m still working out the safest next move from what i’ve already inspected")
    || content.includes("i found a problem that prevents a safe change right now")
    || content.includes("i’m building the engineering controls for this task")
    || content.includes("the engineering controls are ready")
    || content.includes("the precision controls are ready")
    || content.includes("i’m selecting the local code execution transport")
    || content.includes("i’m starting the local code employee")
    || content.includes("i’m connecting the code workspace behind this conversation now")
    || content.includes("i’m reviewing the current repository evidence")
    || content.includes("i’m asking the local code engine for the next executable repository step")
    || content.includes("i finished searching the repository for");
}

function dedupeAdjacentTalkTurns(turns = []) {
  const next = [];
  for (const turn of Array.isArray(turns) ? turns : []) {
    if (isTransientRecoveryTalkTurn(turn)) continue;
    const previous = next.at(-1);
    if (
      previous?.role === "user" &&
      turn?.role === "user" &&
      text(previous?.content) &&
      text(previous?.content) === text(turn?.content)
    ) continue;
    if (
      previous?.role === "assistant" &&
      turn?.role === "assistant" &&
      text(previous?.content) &&
      text(previous?.content) === text(turn?.content)
    ) continue;
    next.push(turn);
  }
  return next;
}

function codeMissionCompletionSummary(body = {}, finalState = {}) {
  const filesChanged = [...new Set(
    (Array.isArray(finalState?.files_changed) ? finalState.files_changed : [])
      .map((value) => text(value))
      .filter(Boolean),
  )];
  const completedOperationCount = Array.isArray(finalState?.completed_operation_ids)
    ? finalState.completed_operation_ids.length
    : Number(finalState?.completed_operation_count || 0);
  const verificationCandidates = [
    body?.developer_verification?.verification,
    ...(Array.isArray(finalState?.tests) ? finalState.tests : []),
    ...(finalState?.latest_event?.verification_passed === true || finalState?.latest_event?.verification_passed === false
      ? [{
          passed: finalState.latest_event.verification_passed,
          description: finalState.latest_event.description || finalState.latest_event.phase || "final live verification",
        }]
      : []),
  ].filter(Boolean);
  const passedVerification = verificationCandidates.find((entry) =>
    entry?.passed === true || Number(entry?.exit_code) === 0
  ) || null;
  const failedVerification = verificationCandidates.find((entry) =>
    entry?.passed === false || (entry?.exit_code !== undefined && entry?.exit_code !== null && Number(entry.exit_code) !== 0)
  ) || null;
  const verificationCommand = text(
    passedVerification?.command ||
    passedVerification?.description ||
    failedVerification?.command ||
    failedVerification?.description,
  );
  const blockers = (Array.isArray(finalState?.blockers) ? finalState.blockers : [])
    .map((value) => customerFacingCodeBlocker(value))
    .filter(Boolean);
  const latestConcreteDescription = text(
    finalState?.latest_event?.description ||
    body?.developer_verification?.summary ||
    body?.summary,
    600,
  );
  const checkedText = latestConcreteDescription
    ? `Checked: ${latestConcreteDescription.replace(/\s+/g, " ").trim()}`
    : `Checked: ${completedOperationCount} repository operation${completedOperationCount === 1 ? "" : "s"} across the current Code mission.`;
  const changedText = filesChanged.length
    ? `Changed: ${filesChanged.length} file${filesChanged.length === 1 ? "" : "s"} — ${filesChanged.slice(0, 6).join(", ")}${filesChanged.length > 6 ? `, plus ${filesChanged.length - 6} more` : ""}.`
    : "Changed: no source files were modified.";
  const verificationText = failedVerification
    ? `Verified: the latest check still reports a failure${verificationCommand ? ` in ${verificationCommand}` : ""}.`
    : passedVerification
      ? `Verified: passed${verificationCommand ? ` with ${verificationCommand}` : ""}.`
      : `Verified: ${completedOperationCount} repository operation${completedOperationCount === 1 ? "" : "s"} completed with no unresolved verifier result.`;
  const remainingText = blockers.length
    ? `Remaining: ${blockers.slice(0, 2).join(" ")}`
    : "Remaining: nothing from this mission is blocked.";
  return `Done. ${checkedText} ${changedText} ${verificationText} ${remainingText}`;
}

function customerFacingCodeBlocker(value) {
  const rawReason = text(value, 1200);
  const message = rawReason.toUpperCase();
  if (message.includes("REASONING_BUDGET_EXHAUSTED")) return "Code reached the end of its bounded local planning tranche before it produced the next repository step. The current repository changes, completed operations, and mission state are preserved so the next run can continue from this exact point.";
  if (message.includes("CONTROL_PLANE_CHECK_TIMEOUT") || message.includes("CONTROL_PLANE_TEMPORARILY_UNAVAILABLE")) return "Code’s mission-control connection is temporarily unavailable. The repository state is preserved, and Code will retry from the same safe boundary before any new change.";
  if (message.includes("404") || message.includes("HISTORY_MISSION_NOT_FOUND") || message.includes("LOAD FAILED")) return "The workspace connection changed while Code was working. The current mission state is preserved and Code must reconnect to that same workspace before continuing.";
  if (message.includes("ATTESTATION")) return "The saved mission checkpoint no longer matches the current workspace evidence. Code preserved the repository state and must rebuild a trusted checkpoint before making another change.";
  if (
    /<!doctype html|<html|web server is down|\b(?:500|502|503|504|520|521|522|523|524)\b|econnreset|econnrefused|etimedout|fetch failed|bad gateway|gateway timeout/i.test(rawReason)
  ) return "A temporary backend connection failed while Code was working. The repository and mission state are preserved. Code will retry from the same verified point instead of restarting the task.";
  if (message.includes("PROVIDER") || message.includes("RUNTIME_UNAVAILABLE") || message.includes("LOCAL_NODE")) return "The local execution path became unavailable while Code was working. The repository state is preserved and Code must resume from the last verified point on a healthy local path.";
  if (message.includes("IMPLEMENTATION_REQUIRED_AFTER_SEEDED_DISCOVERY")) return "Code found the relevant evidence, but the exact implementation target is not precise enough to change safely yet. The repository is unchanged at this blocker and the next run must continue from the discovered evidence.";
  if (message.includes("PLANNER") || message.includes("WORK_PACKAGE") || message.includes("REASONING")) {
    return rawReason
      ? `Code stopped at a planning boundary after preserving the current repository state. The blocker was: ${rawReason.replace(/CODE_[A-Z0-9_:.-]+/gi, "").trim() || "the next repository step was not precise enough to execute safely"}.`
      : "Code stopped at a planning boundary after preserving the current repository state. The next repository step was not precise enough to execute safely.";
  }
  return rawReason
    ? `Code stopped at a concrete blocker: ${rawReason.replace(/CODE_[A-Z0-9_:.-]+/gi, "").trim() || "the current step could not continue safely"}. The current repository and mission state are preserved.`
    : "Code stopped because the current step could not continue safely. The current repository and mission state are preserved.";
}

function codeDeviceAvailabilityMessage(devices = []) {
  const paired = Array.isArray(devices) ? devices : [];
  if (!paired.length) {
    return "No Code computer is paired with this Avantiqo workspace yet. Pair a computer in Developer Mode before repository work can start.";
  }
  const enabled = paired.filter((device) => device?.enabled === true);
  if (!enabled.length) {
    return "A Code computer is paired, but it is disabled. Enable or re-pair the computer before repository work can start.";
  }
  const mostRecent = enabled[0] || paired[0];
  const name = text(mostRecent?.display_name) || "your Code computer";
  const lastSeen = Date.parse(text(mostRecent?.last_seen_at));
  const ageSeconds = Number.isFinite(lastSeen) ? Math.max(0, Math.round((Date.now() - lastSeen) / 1000)) : null;
  const seenText = ageSeconds == null
    ? "It is not sending a heartbeat."
    : ageSeconds < 120
      ? `Its last heartbeat was ${ageSeconds} seconds ago.`
      : `Its last heartbeat was about ${Math.max(2, Math.round(ageSeconds / 60))} minutes ago.`;
  return `${name} is paired, but its local Code agent is offline. ${seenText} I can keep the conversation open, but repository work cannot start until that agent is online again.`;
}

function recoverableCodeInfrastructureBlocker(value) {
  const message = text(value).toUpperCase();
  return Boolean(
    message.includes("PROVIDER_RUNTIME_UNAVAILABLE") ||
    message.includes("PROVIDER RUNTIME UNAVAILABLE") ||
    message.includes("NO PRICED EXECUTABLE PROVIDER AVAILABLE FOR AI.CODE.DEBUG") ||
    message.includes("AVANTIQO_CODE_LOCAL_NODE_UNAVAILABLE") ||
    message.includes("AVANTIQO_LOCAL_COMPUTE_QUEUE_REQUIRED") ||
    message.includes("CODE_AI_CONTROL_PLANE_CHECK_TIMEOUT") ||
    message.includes("CODE_AI_CONTROL_PLANE_TEMPORARILY_UNAVAILABLE") ||
    message.includes("CODE_AI_MISSION_ATTESTATION_REQUIRED") ||
    message.includes("CODE_AI_MISSION_ATTESTATION_INVALID") ||
    message.includes("CODE_AI_WORK_PACKAGE_IMPLEMENTATION_REQUIRED_AFTER_SEEDED_DISCOVERY") ||
    message.includes("CODE_AI_WORK_PACKAGE_JSON_AMBIGUOUS") ||
    message.includes("SERVICE_USAGE_IDEMPOTENT_START_PREEXISTING") ||
    message.includes("SERVICE_USAGE_IDEMPOTENT_START_STATE_CONFLICT:SUCCESS") ||
    message.includes("CODE_STUDIO_RUNNING_STATE_REQUIRED") ||
    message.includes("CODE_STUDIO_HISTORY_MISSION_NOT_FOUND") ||
    message.includes("CODE MISSION FAILED (404)") ||
    message.includes("LOAD FAILED") ||
    message.includes("ECONNRESET") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ETIMEDOUT")
  );
}
function likelyRepositoryWork(message, missionActive = false) {
  const source = text(message);
  const discussionOnly = /\b(no|do not|don't|dont|not yet|just|only)\b[\s\S]{0,80}\b(build|code|change|edit|implement|repository work|repo work|start work|touch the code)\b/i.test(source)
    || /\b(just|only)\s+(want to\s+)?(discuss|talk|plan|think through|brainstorm)\b/i.test(source);
  if (discussionOnly) return false;
  if (/\b(find|fix|check|inspect|debug|test|build|improve|verify|repair|change|update|make|implement|trace|investigate|tighten|upgrade|continue)\b/i.test(source)) return true;
  if (!missionActive) return false;
  return !/^\s*(why|what|how|where|when|who|which|can you explain|tell me)\b/i.test(source);
}
function activeMissionProgress(progress, baselineAt = 0) {
  const state = text(progress?.state_status).toLowerCase();
  const eventStatus = text(progress?.latest_event?.status).toLowerCase();
  const terminalStates = new Set(["blocked", "completed", "failed", "stopped", "cancelled", "repair_required", "replan_required"]);
  if (terminalStates.has(state)) return false;
  const activeStates = new Set(["active", "executing", "in_progress", "pending", "planner_pending", "queued", "running", "verifying", "working"]);
  const eventAt = Date.parse(text(progress?.latest_event?.at));
  const eventAgeMs = Number.isFinite(eventAt) ? Date.now() - eventAt : Number.POSITIVE_INFINITY;
  const eventFreshEnough = eventAgeMs <= 120000;
  const baselineFresh = !baselineAt
    || (Number.isFinite(eventAt) && eventAt >= baselineAt)
    || eventAgeMs <= 30000;
  return eventFreshEnough && baselineFresh && (activeStates.has(state) || activeStates.has(eventStatus));
}
function buildExplorerTree(paths = []) {
  const root = { name: "", path: "", type: "folder", children: new Map() };
  for (const rawPath of paths) {
    const filePath = text(rawPath);
    if (!filePath) continue;
    const parts = filePath.split("/").filter(Boolean);
    let cursor = root;
    parts.forEach((part, index) => {
      const nodePath = parts.slice(0, index + 1).join("/");
      const isFile = index === parts.length - 1;
      if (!cursor.children.has(part)) {
        cursor.children.set(part, {
          name: part,
          path: nodePath,
          type: isFile ? "file" : "folder",
          children: new Map(),
        });
      }
      cursor = cursor.children.get(part);
    });
  }
  const finalize = (node) => {
    const children = [...node.children.values()].map(finalize).sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
    });
    const fileCount = node.type === "file" ? 1 : children.reduce((sum, child) => sum + child.fileCount, 0);
    return { ...node, children, fileCount };
  };
  return [...root.children.values()].map(finalize).sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
  });
}
function collectExplorerFolders(nodes = [], result = []) {
  for (const node of nodes) {
    if (node.type !== "folder") continue;
    result.push(node.path);
    collectExplorerFolders(node.children, result);
  }
  return result;
}

function fastClientIntent(message, recentTurns = []) {
  const current = text(message).toLowerCase();
  const context = [current, ...recentTurns.slice(-4).map((turn) => text(turn?.content).toLowerCase())].join(" ");
  const hasAny = (value, words) => words.some((word) => value.includes(word));
  const visualSubjects = ["page", "website", "site", "landing", "screen", "interface", "ui", "ux", "layout", "design", "dashboard", "app", "brand", "homepage"];
  const visualActions = ["show", "see", "visual", "mockup", "concept", "idea", "look", "design", "layout", "lay out", "would do", "want to do"];
  const imageSubjects = ["image", "photo", "picture", "illustration", "hero art", "background art"];
  const imageActions = ["generate", "create", "make", "render", "produce", "show"];
  const repoActions = ["fix", "implement", "code", "change", "update", "repair", "debug", "test", "inspect", "trace", "refactor", "deploy", "commit", "continue", "resume", "replan", "keep going", "continue building", "build this"];
  const repoSubjects = ["repo", "repository", "code", "file", "route", "component", "api", "database", "migration", "test", "runtime", "worker", "function"];
  const diagnosticRequest = /\b(?:check|diagnose|investigate|what(?:'s| is) wrong|why .*?(?:not work|isn't working|is not working)|not working|broken|issue|problem)\b/i.test(current);

  if (current.includes("architecture")) return "architecture";
  if (current.includes("wireframe")) return "wireframe";
  if (current.includes("decision board")) return "decision_board";
  if (hasAny(current, ["flow diagram", "user flow", "process flow"])) return "flow";
  if (hasAny(current, imageSubjects) && hasAny(current, imageActions) && !hasAny(current, visualSubjects)) return "image_generation";
  if (
    diagnosticRequest ||
    (
      hasAny(current, repoActions) &&
      (
        hasAny(current, repoSubjects) ||
        /\b(blocked step|preserved mission|same mission|repository commands?|restart recovery|verification)\b/i.test(current) ||
        /^\s*(fix|implement|change|update|debug|test|inspect|continue|resume|replan|build)\b/i.test(message)
      )
    )
  ) return "repository_work";
  if (hasAny(context, visualSubjects) && hasAny(current, visualActions)) return "design_preview";
  return null;
}

export default function AvantiqoCodeIDE({
  organizationId,
  embedded = false,
  studioView = "code",
  onStudioViewChange = null,
  onPreviewUrlChange = null,
}) {
  const { progress, active: agentActive, requestRefresh, setDeviceSessionScope } = useCodeProgressFeed();
  const [repositoryUrl, setRepositoryUrl] = useState(DEFAULT_REPOSITORY);
  const [ref, setRef] = useState("main");
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState("");
  const [session, setSession] = useState(null);
  const [files, setFiles] = useState([]);
  const [filter, setFilter] = useState("");
  const [expandedFolders, setExpandedFolders] = useState(() => new Set());
  const [tabs, setTabs] = useState([]);
  const [activePath, setActivePath] = useState("");
  const [buffers, setBuffers] = useState({});
  const [dirty, setDirty] = useState({});
  const [revision, setRevision] = useState(0);
  const [leaseOwner, setLeaseOwner] = useState(null);
  const [deviceHealth, setDeviceHealth] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("Open a connected computer workspace");
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [takingHumanControl, setTakingHumanControl] = useState(false);
  const [handingBackToCode, setHandingBackToCode] = useState(false);
  const [diffText, setDiffText] = useState("");
  const [objective, setObjective] = useState("");
  const [chatTurns, setChatTurns] = useState([]);
  const visibleChatTurns = useMemo(() => dedupeAdjacentTalkTurns(chatTurns), [chatTurns]);

  useEffect(() => {
    function acceptTalkPrefill(event) {
      const nextObjective = text(event?.detail?.objective, 24000);
      if (!nextObjective) return;
      const nextRepository = text(event?.detail?.repository_url, 1000);
      const nextRef = text(event?.detail?.ref, 160);
      if (nextRepository) setRepositoryUrl(nextRepository);
      if (nextRef) setRef(nextRef);
      setObjective(nextObjective);
      if (typeof onStudioViewChange === "function") onStudioViewChange("talk");
    }
    window.addEventListener("avantiqo:code-talk-prefill", acceptTalkPrefill);
    return () => window.removeEventListener("avantiqo:code-talk-prefill", acceptTalkPrefill);
  }, [onStudioViewChange]);
  const [visualArtifact, setVisualArtifact] = useState(null);
  const [visualBusy, setVisualBusy] = useState(false);
  const [designBusy, setDesignBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [conversationPendingCount, setConversationPendingCount] = useState(0);
  const [conversationVisualBusy, setConversationVisualBusy] = useState(false);
  const [conversationVisualProgress, setConversationVisualProgress] = useState(null);
  const conversationVisualTimerRef = useRef(null);
  const talkFeedRef = useRef(null);
  const talkFeedPinnedRef = useRef(true);
  const designImageCacheRef = useRef(new Map());
  const chatHydrationSkipWriteRef = useRef(false);
  const persistedTalkTurnIdsRef = useRef(new Set());
  const talkServerHydratedRef = useRef(false);
  const conversationBusy = conversationPendingCount > 0;
  const [missionRunning, setMissionRunning] = useState(false);
  const [localMissionId, setLocalMissionId] = useState("");
  const [missionResult, setMissionResult] = useState(null);
  const [missionStartedAt, setMissionStartedAt] = useState(0);
  const [localMissionStage, setLocalMissionStage] = useState("");
  const [liveClockTick, setLiveClockTick] = useState(() => Date.now());
  const [activityBaselineAt, setActivityBaselineAt] = useState(0);
  const [browserUrl, setBrowserUrl] = useState("");
  const [browserResult, setBrowserResult] = useState(null);
  const [followCode, setFollowCode] = useState(true);
  const [learnMode, setLearnMode] = useState(true);
  const terminalHostRef = useRef(null);
  const terminalRef = useRef(null);
  const explorerRef = useRef(null);
  const mirroredActivityKeysRef = useRef(new Set());
  const editorRef = useRef(null);
  const editorCodeFocusRef = useRef(null);
  const fitAddonRef = useRef(null);
  const terminalLineRef = useRef("");
  const pendingSteerRef = useRef([]);
  const latestProgressAtRef = useRef(0);
  const scopedProgressRef = useRef(null);
  const lastWorkspaceConnectionErrorRef = useRef("");
  const autoResumeMissionRef = useRef("");
  const runCodeMissionRef = useRef(null);
  const recoverWorkspaceAfterOutageRef = useRef(null);
  const mounted = useRef(false);

  const activeBuffer = buffers[activePath] || null;
  const progressSessionId = text(progress?.device_session_id);
  const sessionAgentActive = Boolean(
    agentActive &&
    session?.session_id &&
    progressSessionId === session.session_id
  );
  const scopedProgress = progress && (
    (session?.session_id && progressSessionId === session.session_id) ||
    (!session?.session_id && embedded && studioView === "talk")
  ) ? progress : null;
  useEffect(() => {
    scopedProgressRef.current = scopedProgress;
    const latestAt = Date.parse(text(scopedProgress?.latest_event?.at || scopedProgress?.updated_at));
    if (Number.isFinite(latestAt)) latestProgressAtRef.current = Math.max(latestProgressAtRef.current, latestAt);
  }, [scopedProgress, scopedProgress?.latest_event?.at, scopedProgress?.updated_at]);
  const observedProgressActive = activeMissionProgress(scopedProgress, activityBaselineAt);
  const observedActiveMissionId = observedProgressActive ? text(scopedProgress?.mission_id) : "";
  const currentActiveMissionId = missionRunning && localMissionId
    ? (!observedActiveMissionId || observedActiveMissionId === localMissionId ? localMissionId : "")
    : observedActiveMissionId;
  const liveTalkActive = Boolean(missionRunning || currentActiveMissionId || (sessionAgentActive && observedProgressActive));
  const stopMissionId = missionRunning ? text(localMissionId) : currentActiveMissionId;
  const completedMissionEvents = useMemo(() => {
    const state = missionResult?.state || missionResult?.resume_state || {};
    return (Array.isArray(state?.evidence) ? state.evidence : [])
      .filter((entry) => entry?.kind === "operation")
      .slice(-16)
      .reverse();
  }, [missionResult]);
  const activityEvents = useMemo(() => {
    const live = Array.isArray(scopedProgress?.events) ? scopedProgress.events.slice(-16).reverse() : [];
    const freshLive = !activityBaselineAt
      ? live
      : live.filter((event) => {
          const at = Date.parse(text(event?.at));
          if (!Number.isFinite(at)) return false;
          return at >= activityBaselineAt || Date.now() - at <= 30000;
        });
    return freshLive.length ? freshLive : completedMissionEvents;
  }, [scopedProgress?.events, completedMissionEvents, activityBaselineAt]);
  const latestObservedEvent = activityEvents.find((entry) => currentEventFile(entry)) || scopedProgress?.latest_event || null;
  const latestBrowserEvent = activityEvents.find((entry) => /browser/i.test(text(entry?.action || entry?.phase)) && text(entry?.url)) || null;
  const ephemeralLifecycleEvent = (event = {}) => {
    const phase = text(event.phase || event.action || event.status).toLowerCase();
    return /mission_accepted|mission_approved|approved|approval|capability_binding|engineering_os|precision_os|code_employee_transport|code_employee_starting|local_code_job_queued|local_code_result_check|local_background_pass/.test(phase);
  };
  const talkActivityNarration = useMemo(() => {
    const seen = new Set();
    return [...activityEvents].reverse()
      .filter((event) => !ephemeralLifecycleEvent(event))
      .map((event) => ({
        key: [event?.at, event?.operation_id, event?.action, event?.status].map((value) => text(value)).join("|"),
        content: conversationalCodeActivity(event),
        event,
      }))
      .filter((entry) => entry.content && !seen.has(entry.content) && seen.add(entry.content))
      .slice(-10);
  }, [activityEvents]);
  const lifecycleOnlyEntry = (entry) => ephemeralLifecycleEvent(entry?.event || {});
  const narrationEntryForEvent = (event) => ({
    key: [event?.at, event?.operation_id, event?.action, event?.status].map((value) => text(value)).join("|"),
    content: conversationalCodeActivity(event),
    event,
  });
  const newestNarrationEntry = activityEvents[0] ? narrationEntryForEvent(activityEvents[0]) : null;
  const newestNonLifecycleEvent = activityEvents.find((event) => !lifecycleOnlyEntry({ event })) || null;
  const newestNonLifecycleEntry = newestNonLifecycleEvent ? narrationEntryForEvent(newestNonLifecycleEvent) : null;
  const newestConcreteEvent = activityEvents.find((event) => {
    if (ephemeralLifecycleEvent(event)) return false;
    const action = text(event?.action || event?.phase || event?.status).toLowerCase();
    return /search|read|inspect|verify|test|check|command|run|write|edit|patch|diff|browser|repository_operation/.test(action)
      || Boolean(text(event?.file_path || event?.path || event?.command || event?.url));
  }) || null;
  const newestConcreteNarrationEntry = newestConcreteEvent ? narrationEntryForEvent(newestConcreteEvent) : null;
  const newestEventPhase = text(activityEvents[0]?.phase || activityEvents[0]?.action || activityEvents[0]?.status).toLowerCase();
  const authoritativeMissionState = text(scopedProgress?.state_status).toLowerCase();
  const terminalMissionStates = new Set(["completed", "blocked", "failed", "stopped", "cancelled"]);
  const newestEventTerminal = terminalMissionStates.has(authoritativeMissionState)
    || (!authoritativeMissionState && /mission_completed|mission_terminal|completed|blocked|failed|stopped|cancelled/.test(newestEventPhase));
  const liveNarrationEntry = newestEventTerminal
    ? newestNarrationEntry
    : newestConcreteNarrationEntry || newestNonLifecycleEntry || null;
  const liveNarrationContent = (() => {
    if (!liveNarrationEntry) {
      if (!liveTalkActive) return "";
      const elapsed = missionStartedAt
        ? Math.max(0, Math.floor((liveClockTick - missionStartedAt) / 1000))
        : 0;
      if (elapsed < 5) return "Connecting the attached workspace to the local Code employee…";
      if (elapsed < 12) return `Waiting for the first concrete repository operation from the attached workspace · ${elapsed}s`;
      return `The workspace has not produced a repository operation yet. I’m recovering this same mission from the last safe point instead of leaving it hanging · ${elapsed}s`;
    }
    const event = liveNarrationEntry.event || {};
    const phase = text(event.phase || event.action || event.status).toLowerCase();
    if (/mission_completed|mission_terminal|completed|blocked|failed|stopped|cancelled/.test(phase)) {
      return conversationalCodeActivity(event);
    }
    const eventAt = Date.parse(text(event?.at));
    const elapsed = Number.isFinite(eventAt)
      ? Math.max(0, Math.floor((liveClockTick - eventAt) / 1000))
      : 0;
    if (/mission_accepted|mission_approved|approved|approval/.test(phase) && elapsed >= 3) {
      return `I’ve got the task and I’m starting the work now · ${elapsed}s`;
    }
    if (/planner_pending|planning/.test(phase)) {
      const planningEvents = activityEvents.filter((entry) => /planner_pending|planning/.test(text(entry?.phase || entry?.action || entry?.status).toLowerCase()));
      const planningStartAt = planningEvents.reduce((earliest, entry) => {
        const at = Date.parse(text(entry?.at));
        if (!Number.isFinite(at)) return earliest;
        return earliest === null || at < earliest ? at : earliest;
      }, null);
      const planningElapsed = planningStartAt !== null ? Math.max(0, Math.floor((liveClockTick - planningStartAt) / 1000)) : elapsed;
      const concreteEvent = newestConcreteNarrationEntry?.event || {};
      const concretePath = text(concreteEvent.file_path || concreteEvent.path || concreteEvent.url);
      const concreteAction = text(concreteEvent.action || concreteEvent.phase || concreteEvent.status).toLowerCase();
      const concreteVerb = /apply|write|edit|patch/.test(concreteAction)
        ? "Editing"
        : /verify|test|check|command|run/.test(concreteAction)
          ? "Checking"
          : /search|read|inspect/.test(concreteAction)
            ? "Inspecting"
            : "Working in";
      if (planningElapsed >= 12 && concretePath) {
        return `${concreteVerb} \`${concretePath}\` while I narrow the next change · ${planningElapsed}s`;
      }
      if (planningElapsed >= 30) {
        return `${liveNarrationEntry.content || "I’m narrowing the next concrete code change from the evidence already collected"} · ${planningElapsed}s`;
      }
      return `${liveNarrationEntry.content}${planningElapsed ? ` · ${planningElapsed}s` : ""}`;
    }
    return `${liveNarrationEntry.content}${elapsed ? ` · ${elapsed}s` : ""}`;
  })();
  const latestTouchedFile = currentEventFile(latestObservedEvent);
  const latestFileAction = (() => {
    const action = text(latestObservedEvent?.action || latestObservedEvent?.phase).toLowerCase();
    if (/read|inspect|search/.test(action)) return "Reading";
    if (/verify|test|check|command/.test(action)) return "Checking";
    if (/apply|write|edit|patch/.test(action)) return "Editing";
    if (/diff/.test(action)) return "Reviewing changes";
    return latestTouchedFile ? "Working in" : "Working";
  })();
  const latestFocusStartLine = Number(latestObservedEvent?.start_line || latestObservedEvent?.line || 0) || null;
  const latestFocusEndLine = Number(latestObservedEvent?.end_line || latestFocusStartLine || 0) || null;
  const explorerPaths = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q
      ? files.filter((file) => file.toLowerCase().includes(q))
      : files;
  }, [files, filter]);
  const explorerTree = useMemo(() => buildExplorerTree(explorerPaths), [explorerPaths]);
  const explorerFolderPaths = useMemo(() => collectExplorerFolders(explorerTree, []), [explorerTree]);
  const filterActive = Boolean(filter.trim());

  const stopLiveMission = useCallback(async (missionId) => {
    if (!missionId) return null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await fetch("/api/operator/code/intervention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ organizationId, mission_id: missionId, device_session_id: session?.session_id || null, action: "STOP" }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body?.success === true) {
        setStatus("Stop requested · Code will stop at the next governed safe boundary");
        requestRefresh();
        return body;
      }
      const transient = response.status === 409 && [
        "CODE_AI_OWNER_INTERVENTION_LIVE_MISSION_MISMATCH",
        "CODE_AI_OWNER_INTERVENTION_MISSION_NOT_ACTIVE",
      ].includes(text(body?.error));
      if (!transient) throw new Error(body?.error || "Code mission stop failed");
      await wait(250);
      requestRefresh();
    }
    throw new Error("Code mission stop could not bind to the live mission in time");
  }, [organizationId, requestRefresh, session?.session_id]);

  const submitLiveSteer = useCallback(async (missionId, instruction) => {
    const response = await fetch("/api/operator/code/intervention", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ organizationId, mission_id: missionId, device_session_id: session?.session_id || null, action: "STEER", instruction }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.success !== true) throw new Error(body?.error || "Live Code steering failed");
    setStatus("Live instruction queued for Code at the next safe reasoning boundary");
    requestRefresh();
    return body;
  }, [organizationId, requestRefresh, session?.session_id]);

  const ideRequestWithSession = useCallback(async (targetSession, action, extra = {}) => {
    const response = await fetch("/api/operator/code/ide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        organizationId,
        action,
        ...(targetSession?.session_id ? { session_id: targetSession.session_id, device_id: targetSession.device_id } : {}),
        ...extra,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.success !== true) throw new Error(body?.error || `IDE ${action} failed`);
    return body.result;
  }, [organizationId]);

  const ideRequest = useCallback(async (action, extra = {}) => {
    return ideRequestWithSession(session, action, extra);
  }, [ideRequestWithSession, session]);

  const writeTerminal = useCallback((value) => {
    terminalRef.current?.write(String(value ?? "").replace(/\n/g, "\r\n"));
  }, []);

  const runTerminalCommand = useCallback(async (line) => {
    const parts = splitCommandLine(line);
    if (!parts.length || !session) return;
    const [command, ...args] = parts;
    writeTerminal(`\r\n\x1b[38;5;180m$ ${line}\x1b[0m\r\n`);
    try {
      const result = await ideRequest("run", { command, args, cwd: ".", command_timeout_ms: 180000 });
      if (result.stdout) writeTerminal(result.stdout);
      if (result.stderr) writeTerminal(`\r\n\x1b[31m${result.stderr}\x1b[0m`);
      writeTerminal(`\r\n\x1b[2mexit ${result.exit_code}\x1b[0m\r\n> `);
    } catch (commandError) {
      writeTerminal(`\r\n\x1b[31m${commandError.message}\x1b[0m\r\n> `);
    }
  }, [ideRequest, session, writeTerminal]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location?.origin) setBrowserUrl((current) => current || window.location.origin);
  }, []);

  useEffect(() => {
    const feed = talkFeedRef.current;
    if (!feed || !talkFeedPinnedRef.current) return;
    feed.scrollTo({ top: feed.scrollHeight, behavior: conversationBusy || visualBusy || designBusy || imageBusy || liveTalkActive ? "smooth" : "auto" });
  }, [chatTurns, conversationBusy, visualBusy, designBusy, imageBusy, liveTalkActive, talkActivityNarration.length, liveNarrationContent]);

  useEffect(() => {
    if (!liveTalkActive) return undefined;
    setLiveClockTick(Date.now());
    const timer = window.setInterval(() => setLiveClockTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [liveTalkActive]);

  useEffect(() => {
    const missionId = text(scopedProgress?.mission_id);
    const state = text(scopedProgress?.state_status).toLowerCase();
    const phase = text(scopedProgress?.latest_event?.phase).toLowerCase();
    if (!missionId || !/^local_background_mission_(completed|terminal)$/.test(phase)) return;
    if (!["completed", "blocked", "failed", "stopped", "cancelled"].includes(state)) return;

    const summaryId = `mission-summary-${missionId}`;
    const reason = text(
      scopedProgress?.latest_event?.reason ||
      scopedProgress?.latest_event?.description ||
      scopedProgress?.blockers?.[0] ||
      state,
      2000,
    );
    const content = state === "completed"
      ? codeMissionCompletionSummary(
          { objective: scopedProgress?.objective },
          scopedProgress,
        )
      : state === "stopped"
        ? "I stopped the Code work at a safe boundary. No further changes will be made unless you continue it."
        : customerFacingCodeBlocker(reason);

    setChatTurns((current) => current.some((turn) => turn.id === summaryId)
      ? current
      : [...current, {
          id: summaryId,
          role: "assistant",
          content,
          created_at: scopedProgress?.latest_event?.at || new Date().toISOString(),
        }]);
  }, [
    scopedProgress?.mission_id,
    scopedProgress?.state_status,
    scopedProgress?.latest_event?.phase,
    scopedProgress?.latest_event?.reason,
    scopedProgress?.latest_event?.description,
    scopedProgress?.latest_event?.at,
    scopedProgress?.objective,
    scopedProgress?.files_changed,
    scopedProgress?.completed_operation_count,
    scopedProgress?.blockers,
    scopedProgress,
  ]);

  useEffect(() => {
    setDeviceSessionScope(session?.session_id || null);
    return () => setDeviceSessionScope(null);
  }, [session?.session_id, setDeviceSessionScope]);

  useEffect(() => {
    if (session || (embedded && studioView !== "code")) return undefined;
    let disposed = false;
    async function loadDevices() {
      try {
        const response = await fetch(`/api/operator/code/devices?organizationId=${encodeURIComponent(organizationId)}`, { credentials: "same-origin", cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (disposed || !response.ok || body?.success !== true) return;
        const next = Array.isArray(body.devices) ? body.devices : [];
        setDevices(next);
        setDeviceId((current) => {
          const selected = next.find((device) => device.id === current);
          if (selected?.online === true) return current;
          return next.find((device) => device.online === true)?.id || current || next[0]?.id || "";
        });
      } catch {}
    }
    loadDevices();
    const timer = window.setInterval(loadDevices, 5000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [organizationId, session, embedded, studioView]);

  useEffect(() => {
    if (embedded && studioView !== "code") return undefined;
    if (!terminalHostRef.current || terminalRef.current) return undefined;
    let disposed = false;
    let terminal;
    let fitAddon;
    let dataDisposable;
    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
      if (disposed || !terminalHostRef.current) return;
      terminal = new Terminal({
        convertEol: true,
        cursorBlink: true,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 12,
        theme: { background: "#F5F0E8", foreground: "#4D453D", cursor: "#A56B32", selectionBackground: "#E5D6C2" },
      });
      fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(terminalHostRef.current);
      fitAddon.fit();
      terminal.write("\x1b[38;5;180mAvantiqo Code IDE\x1b[0m\r\nGoverned terminal · no shell side-effect bypass\r\n> ");
      dataDisposable = terminal.onData((data) => {
        if (data === "\r") {
          const line = terminalLineRef.current;
          terminalLineRef.current = "";
          runTerminalCommand(line);
          return;
        }
        if (data === "\u007f") {
          if (terminalLineRef.current.length) {
            terminalLineRef.current = terminalLineRef.current.slice(0, -1);
            terminal.write("\b \b");
          }
          return;
        }
        if (/^[\x20-\x7E]+$/.test(data)) {
          terminalLineRef.current += data;
          terminal.write(data);
        }
      });
      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
      const onResize = () => fitAddon?.fit();
      window.addEventListener("resize", onResize);
      terminal._avantiqoResize = onResize;
    })();
    return () => {
      disposed = true;
      dataDisposable?.dispose();
      if (terminal?._avantiqoResize) window.removeEventListener("resize", terminal._avantiqoResize);
      terminal?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [runTerminalCommand, embedded, studioView]);

  useEffect(() => {
    if ((embedded && studioView !== "code") || !terminalRef.current || !activityEvents.length) return;
    const terminal = terminalRef.current;
    const seen = mirroredActivityKeysRef.current;
    for (const event of [...activityEvents].reverse()) {
      const key = [event?.at, event?.operation_id, event?.action, event?.status, event?.exit_code].map((value) => text(value)).join("|");
      if (!key || seen.has(key)) continue;
      const command = text(event?.command);
      const args = Array.isArray(event?.command_args) ? event.command_args.map((value) => text(value)).filter(Boolean) : [];
      const filePath = currentEventFile(event);
      const action = text(event?.action || event?.phase || event?.status || "working").toUpperCase();
      if (!command && !filePath) continue;
      seen.add(key);
      const draft = terminalLineRef.current;
      terminal.write("\r\x1b[2K");
      if (command) {
        terminal.write(`\x1b[38;5;180m[Code] $ ${[command, ...args].join(" ")}\x1b[0m\r\n`);
        if (event?.exit_code !== null && event?.exit_code !== undefined) {
          const exitColor = Number(event.exit_code) === 0 ? "32" : "31";
          terminal.write(`\x1b[${exitColor}m[Code] exit ${event.exit_code}\x1b[0m\r\n`);
        }
      } else {
        const line = Number(event?.start_line || 0) || null;
        terminal.write(`\x1b[38;5;110m[Code] ${action} ${filePath}${line ? `:${line}` : ""}\x1b[0m\r\n`);
      }
      terminal.write(`> ${draft}`);
    }
    if (seen.size > 256) mirroredActivityKeysRef.current = new Set([...seen].slice(-160));
  }, [activityEvents, embedded, studioView]);

  useEffect(() => {
    if (!session) return undefined;
    const key = `avantiqo:code-ide:${organizationId}`;
    localStorage.setItem(key, JSON.stringify({ session_id: session.session_id, device_id: session.device_id, repository_url: session.repository_url, ref: session.ref }));
    return undefined;
  }, [organizationId, session]);

  useEffect(() => {
    const key = `avantiqo:code-talk:${organizationId}`;
    chatHydrationSkipWriteRef.current = true;
    try {
      const raw = localStorage.getItem(key);
      const saved = raw ? JSON.parse(raw) : null;
      setChatTurns(dedupeAdjacentTalkTurns(Array.isArray(saved?.turns) ? saved.turns : []));
      setObjective(typeof saved?.objective === "string" ? saved.objective : "");
      setVisualArtifact(saved?.visualArtifact && typeof saved.visualArtifact === "object" ? saved.visualArtifact : null);
    } catch {
      setChatTurns([]);
      setObjective("");
      setVisualArtifact(null);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/operator/code/talk?organizationId=${encodeURIComponent(organizationId)}`, {
          cache: "no-store",
          credentials: "include",
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body?.success !== true || cancelled) return;
        const serverTurns = (Array.isArray(body.turns) ? body.turns : [])
          .filter((turn) => ["user", "assistant"].includes(turn?.role) && text(turn?.content))
          .map((turn) => ({
            id: text(turn.id) || `server-${crypto.randomUUID()}`,
            role: turn.role,
            content: text(turn.content),
            created_at: turn.created_at || null,
            persisted: true,
          }));
        persistedTalkTurnIdsRef.current = new Set(serverTurns.map((turn) => turn.id).filter(Boolean));
        const serverContentKeys = new Set(serverTurns.map((turn) => `${turn.role}\u0000${turn.content}`));
        setChatTurns((current) => {
          const localOnly = current.filter((turn) => {
            if (!["user", "assistant"].includes(turn?.role)) return true;
            return !serverContentKeys.has(`${turn.role}\u0000${text(turn?.content)}`);
          });
          return dedupeAdjacentTalkTurns([...serverTurns, ...localOnly]).slice(-120);
        });
      } catch {
      } finally {
        if (!cancelled) talkServerHydratedRef.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId || !talkServerHydratedRef.current) return undefined;
    let cancelled = false;
    const durableTurns = chatTurns.filter((turn) =>
      ["user", "assistant"].includes(turn?.role) &&
      text(turn?.content) &&
      !isTransientRecoveryTalkTurn(turn)
    );
    (async () => {
      for (let index = 0; index < durableTurns.length; index += 1) {
        if (cancelled) return;
        const turn = durableTurns[index];
        const turnId = text(turn?.id) || `local-${turn.role}-${index}-${text(turn.content).length}`;
        if (turn?.persisted === true || persistedTalkTurnIdsRef.current.has(turnId)) continue;
        persistedTalkTurnIdsRef.current.add(turnId);
        try {
          const response = await fetch("/api/operator/code/talk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              organizationId,
              role: turn.role,
              content: text(turn.content),
              client_turn_id: turnId,
            }),
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok || body?.success !== true) {
            throw new Error(body?.error || "CODE_TALK_PERSIST_FAILED");
          }
        } catch {
          persistedTalkTurnIdsRef.current.delete(turnId);
          return;
        }
      }
    })();
    return () => { cancelled = true; };
  }, [organizationId, chatTurns]);

  useEffect(() => {
    if (chatHydrationSkipWriteRef.current) {
      chatHydrationSkipWriteRef.current = false;
      return;
    }
    const key = `avantiqo:code-talk:${organizationId}`;
    try {
      const durableTurns = dedupeAdjacentTalkTurns(chatTurns
        .filter((turn) => ["user", "assistant", "design_preview", "visual", "image"].includes(turn?.role)))
        .slice(-100);
      const payload = {
        turns: durableTurns,
        objective,
        visualArtifact,
        saved_at: new Date().toISOString(),
      };
      localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      try {
        const compactTurns = dedupeAdjacentTalkTurns(chatTurns
          .filter((turn) => ["user", "assistant", "design_preview"].includes(turn?.role)))
          .slice(-40);
        localStorage.setItem(key, JSON.stringify({ turns: compactTurns, objective, saved_at: new Date().toISOString() }));
      } catch {}
    }
  }, [organizationId, chatTurns, objective, visualArtifact]);

  useEffect(() => {
    if (embedded && studioView !== "code") return;
    const key = `avantiqo:code-ide:${organizationId}`;
    const raw = localStorage.getItem(key);
    if (!raw || session) return;
    let saved;
    try { saved = JSON.parse(raw); } catch { return; }
    if (!saved?.session_id || !saved?.device_id) return;
    (async () => {
      try {
        setStatus("Reattaching developer workspace…");
        const response = await fetch("/api/operator/code/ide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ organizationId, action: "attach", ...saved }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body?.success !== true) throw new Error(body?.error || "Attach failed");
        const result = body.result;
        setSession({ ...saved, ...result });
        setActivityBaselineAt(Date.now());
        setMissionResult(null);
        setFiles(result.tree?.files || []);
        setRevision(Number(result.ide_state?.revision || 0));
        setLeaseOwner(result.ide_state?.edit_owner || null);
        setStatus("Developer workspace attached");
      } catch {
        setStatus("Saved Code session changed · recovering the local workspace…");
        const recovered = await recoverWorkspaceAfterOutageRef.current?.({
          preferredSession: saved,
          maxWaitMs: 30000,
        });
        if (recovered) {
          setActivityBaselineAt(0);
          setMissionResult(null);
          return;
        }
        setStatus("Could not recover the saved Code workspace");
        lastWorkspaceConnectionErrorRef.current = "Could not recover the saved Code workspace";
      }
    })();
  }, [organizationId, session, embedded, studioView]);

  useEffect(() => {
    if (!session || (embedded && studioView !== "code")) return undefined;
    let cancelled = false;
    let timer = null;
    let consecutiveFailures = 0;

    async function pollIdeState() {
      if (cancelled) return;
      try {
        const state = await ideRequest("state");
        if (cancelled) return;
        setDeviceHealth(state);
        const nextRevision = Number(state.revision || 0);
        setLeaseOwner(state.edit_owner || null);
        if (nextRevision !== revision) {
          setRevision(nextRevision);
          const [tree, diff] = await Promise.all([
            ideRequest("tree"),
            ideRequest("diff"),
          ]);
          if (cancelled) return;
          setFiles(tree.files || []);
          setDiffText(diff.patch || "");
          const changedPath = (Array.isArray(diff.status) ? diff.status : [])
            .map((entry) => text(entry).replace(/^..\s+/, ""))
            .find(Boolean) || "";
          if (followCode && changedPath && !Object.values(dirty).some(Boolean)) {
            try {
              const freshChanged = await ideRequest("read", { file_path: changedPath });
              if (cancelled) return;
              setBuffers((current) => ({ ...current, [changedPath]: { ...freshChanged, content: freshChanged.content ?? "", revision: nextRevision } }));
              setTabs((current) => current.includes(changedPath) ? current : [...current, changedPath]);
              setActivePath(changedPath);
              setDirty((current) => ({ ...current, [changedPath]: false }));
            } catch {}
          } else if (!followCode && activePath && !dirty[activePath]) {
            const fresh = await ideRequest("read", { file_path: activePath });
            if (cancelled) return;
            setBuffers((current) => ({
              ...current,
              [activePath]: { ...fresh, content: fresh.content ?? "", revision: nextRevision },
            }));
          }
        }
        consecutiveFailures = 0;
      } catch {
        consecutiveFailures += 1;
      }
      if (!cancelled) {
        const baseDelayMs = (missionRunning || sessionAgentActive)
          ? 2000
          : studioView === "code"
            ? 5000
            : 30000;
        const delayMs = consecutiveFailures
          ? Math.min(30000, baseDelayMs * (2 ** Math.min(consecutiveFailures, 3)))
          : baseDelayMs;
        timer = window.setTimeout(pollIdeState, delayMs);
      }
    }

    pollIdeState();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [session, ideRequest, revision, activePath, dirty, missionRunning, sessionAgentActive, followCode, studioView, embedded]);

  useEffect(() => {
    if (!session || (embedded && studioView !== "code") || !followCode || !latestTouchedFile || latestTouchedFile === activePath) return undefined;
    if (Object.values(dirty).some(Boolean)) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const fresh = await ideRequest("read", { file_path: latestTouchedFile });
        if (cancelled) return;
        setBuffers((current) => ({ ...current, [latestTouchedFile]: { ...fresh, content: fresh.content ?? "", revision } }));
        setFiles((current) => current.includes(latestTouchedFile) ? current : [...current, latestTouchedFile]);
        setTabs((current) => current.includes(latestTouchedFile) ? current : [...current, latestTouchedFile]);
        setActivePath(latestTouchedFile);
        setDirty((current) => ({ ...current, [latestTouchedFile]: false }));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [session, embedded, studioView, followCode, latestTouchedFile, activePath, dirty, files, revision, ideRequest]);

  useEffect(() => {
    const url = text(latestBrowserEvent?.url);
    if (!url) return;
    setBrowserUrl(url);
    if (typeof onPreviewUrlChange === "function") onPreviewUrlChange(url);
  }, [latestBrowserEvent?.url, onPreviewUrlChange]);

  useEffect(() => {
    if (!followCode || !latestTouchedFile) return undefined;
    const parts = latestTouchedFile.split("/").filter(Boolean);
    const parents = parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/"));
    if (parents.length) {
      setExpandedFolders((current) => {
        const next = new Set(current);
        parents.forEach((folderPath) => next.add(folderPath));
        return next;
      });
    }
    const frame = window.requestAnimationFrame(() => {
      const target = [...(explorerRef.current?.querySelectorAll("[data-code-explorer-path]") || [])]
        .find((element) => element.dataset.codeExplorerPath === latestTouchedFile);
      target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [followCode, latestTouchedFile]);

  useEffect(() => {
    const editor = editorRef.current;
    const decorations = editorCodeFocusRef.current;
    if (!editor || !decorations) return;
    if (!followCode || !latestTouchedFile || latestTouchedFile !== activePath || !latestFocusStartLine) {
      decorations.clear();
      return;
    }
    const startLine = Math.max(1, latestFocusStartLine);
    const endLine = Math.max(startLine, latestFocusEndLine || startLine);
    try {
      editor.revealLineInCenter(startLine);
      editor.setSelection({ startLineNumber: startLine, startColumn: 1, endLineNumber: endLine, endColumn: 1 });
      decorations.set([{
        range: { startLineNumber: startLine, startColumn: 1, endLineNumber: endLine, endColumn: 1 },
        options: {
          isWholeLine: true,
          className: "avantiqo-code-focus-line",
          linesDecorationsClassName: "avantiqo-code-focus-glyph",
          hoverMessage: { value: `Code focus · ${latestFileAction}` },
        },
      }]);
    } catch {}
  }, [followCode, latestTouchedFile, activePath, latestFocusStartLine, latestFocusEndLine, latestFileAction]);

  useEffect(() => {
    if (!currentActiveMissionId || !pendingSteerRef.current.length) return undefined;
    const queued = pendingSteerRef.current.splice(0);
    let cancelled = false;
    (async () => {
      for (let index = 0; index < queued.length; index += 1) {
        if (cancelled) {
          pendingSteerRef.current.unshift(...queued.slice(index));
          return;
        }
        try {
          await submitLiveSteer(currentActiveMissionId, queued[index]);
        } catch (steerError) {
          pendingSteerRef.current.unshift(...queued.slice(index));
          setError(steerError.message);
          return;
        }
      }
    })();
    return () => { cancelled = true; };
  }, [currentActiveMissionId, submitLiveSteer]);

  async function discoverOnlineCodeDevice(preferredId = "") {
    const response = await fetch(`/api/operator/code/devices?organizationId=${encodeURIComponent(organizationId)}`, { credentials: "same-origin", cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.success !== true) throw new Error(body?.error || "Code device discovery failed");
    const next = Array.isArray(body.devices) ? body.devices : [];
    setDevices(next);
    const preferred = next.find((device) => device.id === preferredId && device.online === true);
    const selected = preferred || next.find((device) => device.online === true) || null;
    if (!selected?.id) throw new Error(codeDeviceAvailabilityMessage(next));
    setDeviceId(selected.id);
    return selected.id;
  }

  async function openWorkspace({ forceRediscover = false, quiet = false } = {}) {
    if (!repositoryUrl.trim() || opening) return;
    setOpening(true);
    if (!quiet) setError(null);
    lastWorkspaceConnectionErrorRef.current = "";
    setStatus("Opening isolated developer worktree…");
    try {
      let resolvedDeviceId = forceRediscover || !deviceId ? await discoverOnlineCodeDevice(deviceId) : deviceId;
      let result = null;
      let lastOpenError = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          result = await fetch("/api/operator/code/ide", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ organizationId, action: "open", device_id: resolvedDeviceId, repository_url: repositoryUrl.trim(), ref: ref.trim() || "main" }),
          }).then(async (response) => {
            const body = await response.json().catch(() => ({}));
            if (!response.ok || body?.success !== true) throw new Error(body?.error || "Workspace open failed");
            return body.result;
          });
          break;
        } catch (attemptError) {
          lastOpenError = attemptError;
          if (attempt > 0) throw attemptError;
          setStatus("Code workspace connection changed · finding an online computer and retrying…");
          resolvedDeviceId = await discoverOnlineCodeDevice(resolvedDeviceId);
          await wait(350);
        }
      }
      if (!result) throw lastOpenError || new Error("Workspace open failed");
      const nextSession = { ...result, device_id: resolvedDeviceId, repository_url: repositoryUrl.trim(), ref: ref.trim() || "main" };
      setSession(nextSession);
      setActivityBaselineAt(0);
      setMissionResult(null);
      setFiles(result.tree?.files || []);
      setExpandedFolders(new Set());
      setRevision(Number(result.ide_state?.revision || 0));
      setLeaseOwner(result.ide_state?.edit_owner || null);
      setTabs([]); setActivePath(""); setBuffers({}); setDirty({}); setDiffText("");
      setStatus(`Developer workspace ready · ${result.base_commit?.slice(0, 10)}`);
      return nextSession;
    } catch (openError) {
      const connectionReason = text(openError?.message || openError) || "Code workspace connection failed";
      lastWorkspaceConnectionErrorRef.current = connectionReason;
      if (!quiet) setError(connectionReason);
      setStatus(quiet ? "Code workspace reconnecting…" : "Workspace stopped");
      return null;
    } finally { setOpening(false); }
  }

  async function recoverWorkspaceAfterOutage({ preferredSession = null, maxWaitMs = 45000 } = {}) {
    const startedAt = Date.now();
    let attempt = 0;
    while (Date.now() - startedAt < maxWaitMs) {
      attempt += 1;
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      setError(null);
      setStatus(`Code connection interrupted · reattaching the live workspace · ${elapsedSeconds}s`);
      if (attempt > 1) await wait(Math.min(2500, 500 + attempt * 300));

      if (preferredSession?.session_id && preferredSession?.device_id) {
        try {
          const response = await fetch("/api/operator/code/ide", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
              organizationId,
              action: "attach",
              session_id: preferredSession.session_id,
              device_id: preferredSession.device_id,
              timeout_ms: 30000,
            }),
          });
          const body = await response.json().catch(() => ({}));
          if (response.ok && body?.success === true && body?.result?.session_id) {
            const result = body.result;
            const recovered = {
              ...preferredSession,
              ...result,
              device_id: preferredSession.device_id,
            };
            setSession(recovered);
            setFiles(result.tree?.files || []);
            setRevision(Number(result.ide_state?.revision || 0));
            setLeaseOwner(result.ide_state?.edit_owner || null);
            setError(null);
            setStatus("Code workspace reattached · continuing from current live state");
            requestRefresh();
            return recovered;
          }
        } catch {}
      }

      if (Date.now() - startedAt >= Math.min(15000, maxWaitMs / 2)) {
        const recovered = await openWorkspace({ forceRediscover: true, quiet: true });
        setError(null);
        if (recovered) {
          setStatus("Code workspace rebuilt after reconnect · continuing from current live state");
          requestRefresh();
          return recovered;
        }
      }
    }
    return null;
  }

  recoverWorkspaceAfterOutageRef.current = recoverWorkspaceAfterOutage;

  async function openFile(filePath) {
    if (!session || !filePath) return;
    setError(null);
    try {
      const result = await ideRequest("read", { file_path: filePath });
      setBuffers((current) => ({ ...current, [filePath]: { ...result, revision } }));
      setTabs((current) => current.includes(filePath) ? current : [...current, filePath]);
      setActivePath(filePath);
      setDirty((current) => ({ ...current, [filePath]: false }));
    } catch (readError) { setError(readError.message); }
  }

  async function ensureHumanLease() {
    if (!session || leaseOwner === "HUMAN") return true;
    const result = await ideRequest("lease", { owner: "HUMAN", ttl_ms: 180000 });
    setLeaseOwner(result.owner || "HUMAN");
    setRevision(Number(result.revision ?? revision));
    return true;
  }

  async function prepareWorkspaceForCode(activeSession) {
    setLocalMissionStage("I’m checking the local workspace state before Code takes control.");
    const authoritativeLeaseState = await ideRequestWithSession(activeSession, "state").catch(() => null);
    const authoritativeLeaseOwner = text(authoritativeLeaseState?.edit_owner).toUpperCase();
    if (authoritativeLeaseOwner === "HUMAN") {
      setLocalMissionStage("The workspace is still under human edit control. I’m releasing that lease so Code can continue safely.");
      await ideRequestWithSession(activeSession, "lease", { owner: "HUMAN", release: true });
      const releasedLeaseState = await ideRequestWithSession(activeSession, "state").catch(() => null);
      if (text(releasedLeaseState?.edit_owner).toUpperCase() === "HUMAN") {
        throw new Error("CODE_WORKSPACE_HUMAN_LEASE_RELEASE_FAILED");
      }
      setLeaseOwner(releasedLeaseState?.edit_owner || null);
      if (releasedLeaseState?.revision !== undefined) setRevision(Number(releasedLeaseState.revision));
      setLocalMissionStage("The local workspace is ready. I’m handing the current revision to Code now.");
      return releasedLeaseState;
    }
    setLeaseOwner(authoritativeLeaseState?.edit_owner || null);
    if (authoritativeLeaseState?.revision !== undefined) setRevision(Number(authoritativeLeaseState.revision));
    setLocalMissionStage("The local workspace is ready. I’m handing the current revision to Code now.");
    return authoritativeLeaseState;
  }

  async function saveActive() {
    if (!activePath || !activeBuffer || !dirty[activePath] || saving) return;
    setSaving(true); setError(null);
    try {
      await ensureHumanLease();
      const result = await ideRequest("write", { file_path: activePath, content: activeBuffer.content, expected_revision: revision });
      const nextRevision = Number(result.revision ?? revision + 1);
      setRevision(nextRevision);
      setBuffers((current) => ({ ...current, [activePath]: { ...current[activePath], revision: nextRevision } }));
      setDirty((current) => ({ ...current, [activePath]: false }));
      const diff = await ideRequest("diff");
      setDiffText(diff.patch || "");
      setStatus(`Saved ${activePath}`);
    } catch (saveError) {
      setError(saveError.message);
      setStatus(saveError.message.includes("REVISION_CONFLICT") ? "File changed elsewhere · reload before saving" : "Save failed");
    } finally { setSaving(false); }
  }

  async function takeHumanControl() {
    if (!session || takingHumanControl) return;
    setTakingHumanControl(true);
    setError(null);
    setStatus(stopMissionId ? "Stopping Code at a safe boundary for human control…" : "Taking human control…");
    try {
      if (stopMissionId) await stopLiveMission(stopMissionId);
      let acquired = null;
      for (let attempt = 0; attempt < 80; attempt += 1) {
        try {
          const state = await ideRequest("state");
          setDeviceHealth(state);
          const owner = text(state?.edit_owner).toUpperCase();
          if (!owner || owner === "HUMAN") {
            acquired = await ideRequest("lease", { owner: "HUMAN", ttl_ms: 300000 });
            break;
          }
        } catch (handoffError) {
          if (!/LEASE_HELD:CODE/i.test(text(handoffError?.message))) throw handoffError;
        }
        await wait(250);
      }
      if (!acquired) throw new Error("Code did not release the workspace in time");
      setLeaseOwner("HUMAN");
      setRevision(Number(acquired.revision ?? revision));
      setStatus("Human control active · edit, save, then hand back to Code");
    } catch (handoffError) {
      setError(handoffError?.message || "Could not take human control");
      setStatus("Human takeover failed");
    } finally {
      setTakingHumanControl(false);
    }
  }

  async function handBackToCode() {
    if (!session || handingBackToCode) return;
    if (Object.values(dirty).some(Boolean)) {
      setError("Save or discard your edits before handing the workspace back to Code.");
      return;
    }
    setHandingBackToCode(true);
    setError(null);
    try {
      await ideRequest("lease", { owner: "HUMAN", release: true });
      setLeaseOwner(null);
      setStatus("Workspace handed back to Code · continue from the current revision");
      requestRefresh();
    } catch (handoffError) {
      setError(handoffError?.message || "Could not hand the workspace back to Code");
    } finally {
      setHandingBackToCode(false);
    }
  }

  async function refreshDiff() {
    if (!session) return;
    try { const result = await ideRequest("diff"); setDiffText(result.patch || ""); } catch (diffError) { setError(diffError.message); }
  }

  async function verifyBrowser() {
    if (!session || !browserUrl.trim()) return;
    setStatus("Running browser verification…"); setError(null);
    try {
      const result = await ideRequest("browser", { input: { url: browserUrl.trim(), steps: [{ id: "developer-preview", action: "assert_visible", selector: "body" }], require_accessibility: true, full_page: true, timeout_ms: 60000 } });
      setBrowserResult(result);
      setStatus(result.passed ? "Browser verification passed" : "Browser verification failed");
    } catch (browserError) { setError(browserError.message); setStatus("Browser verification stopped"); }
  }

  async function runCodeMission(overrideObjective = null, { reportToTalk = false, sessionOverride = null, resumeMissionId = "" } = {}) {
    const trimmedObjective = text(overrideObjective || objective);
    let activeSession = sessionOverride || session;
    const requestedResumeMissionId = text(resumeMissionId);
    if (!activeSession || !trimmedObjective || (missionRunning && !requestedResumeMissionId)) return;
    if (Object.values(dirty).some(Boolean)) { setError("Save or discard human edits before handing the workspace to Code."); return; }
    let missionId = requestedResumeMissionId || `code-mission-${crypto.randomUUID()}`;
    const taskStartedAt = Date.now();
    const preservedEvents = Array.isArray(scopedProgress?.events) ? scopedProgress.events : [];
    const preservedBudgetExhaustionEvent = [...preservedEvents].reverse().find((event) =>
      /CODE_AI_EMPLOYEE_REASONING_BUDGET_EXHAUSTED/i.test(text(event?.reason || event?.description))
    ) || (
      /CODE_AI_EMPLOYEE_REASONING_BUDGET_EXHAUSTED/i.test(
        text(scopedProgress?.latest_event?.reason || scopedProgress?.latest_event?.description),
      )
        ? scopedProgress?.latest_event
        : null
    );
    const preservedBudgetExhausted = Boolean(preservedBudgetExhaustionEvent);
    const preservedBudgetMatch = text(
      preservedBudgetExhaustionEvent?.reason || preservedBudgetExhaustionEvent?.description,
    ).match(/CODE_AI_EMPLOYEE_REASONING_BUDGET_EXHAUSTED:(\d+):(\d+)/i);
    const preservedReasoningCallsUsed = Number(preservedBudgetMatch?.[1] || 0);
    const preservedExhaustedBudget = Number(preservedBudgetMatch?.[2] || 0);
    const minimumBudgetBeyondUsedCalls = preservedReasoningCallsUsed > 0
      ? Math.ceil((preservedReasoningCallsUsed + 1) / LOCAL_REASONING_BUDGET_TRANCHE) * LOCAL_REASONING_BUDGET_TRANCHE
      : 0;
    let requestedReasoningBudget = requestedResumeMissionId && preservedBudgetExhausted
      ? Math.min(
          MAX_LOCAL_REASONING_BUDGET,
          Math.max(
            LOCAL_REASONING_BUDGET_TRANCHE * 2,
            preservedExhaustedBudget + LOCAL_REASONING_BUDGET_TRANCHE,
            minimumBudgetBeyondUsedCalls,
          ),
        )
      : LOCAL_REASONING_BUDGET_TRANCHE;
    let lastContinuationCompletedOperationCount = requestedResumeMissionId
      ? Number(scopedProgress?.completed_operation_count || 0)
      : -1;
    talkFeedPinnedRef.current = true;
    setMissionStartedAt(taskStartedAt);
    setLocalMissionStage("I’m reconnecting to the current local workspace and checking its live state.");
    setActivityBaselineAt(Date.now());
    setLocalMissionId(missionId);
    setMissionRunning(true); setMissionResult(null); setError(null); setStatus("Code is taking the shared workspace…"); requestRefresh();
    let executionKey = `code-ide:${crypto.randomUUID()}`;
    let resumeState = null;
    let historyResumePending = Boolean(requestedResumeMissionId);
    let terminalResponseObserved = false;
    let infrastructureRecoveryCycles = 0;
    const missionAbsoluteDeadline = Date.now() + MISSION_ABSOLUTE_DEADLINE_MS;
    let missionIdleDeadline = Date.now() + MISSION_IDLE_DEADLINE_MS;
    let lastProgressFingerprint = "";
    try {
      await prepareWorkspaceForCode(activeSession);
      for (let attempt = 0; attempt < MAX_RESUMES; attempt += 1) {
        await prepareWorkspaceForCode(activeSession);
        let response = null;
        let passWatchdogTimer = null;
        let watchdogObservedProgressAt = latestProgressAtRef.current;
        const armPassWatchdog = () => {
          passWatchdogTimer = window.setTimeout(() => {
            const latestProgressAt = latestProgressAtRef.current;
            if (latestProgressAt > watchdogObservedProgressAt) {
              watchdogObservedProgressAt = latestProgressAt;
              setLocalMissionStage("Code is still publishing live progress. I’m keeping this same pass running while it reaches the next repository boundary.");
              armPassWatchdog();
              return;
            }
            setLocalMissionStage("This Code pass has not published new progress yet. I’m keeping the same employee running and waiting for the bounded backend pass to return; no owner stop has been requested.");
          }, MISSION_IDLE_DEADLINE_MS);
        };
        try {
          setLocalMissionStage("The local workspace is attached. I’m waiting for the current Code pass to return its next concrete repository step.");
          armPassWatchdog();
          response = await fetch("/api/operator/code/mission", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ organizationId, objective: trimmedObjective, repository_url: activeSession.repository_url, ref: activeSession.ref || "main", workspace_target: "DEVICE", device_id: activeSession.device_id, device_session_id: activeSession.session_id, mission_id: missionId, resume_mission_id: historyResumePending ? requestedResumeMissionId : undefined, execution_key: executionKey, resume_state: resumeState, reasoning_call_budget: requestedReasoningBudget, max_employee_passes: 8 }),
          });
        } catch (requestError) {
          const requestReason = text(requestError?.message || requestError, 1000);
          if (recoverableCodeInfrastructureBlocker(requestReason) && infrastructureRecoveryCycles < 3) {
            infrastructureRecoveryCycles += 1;
            setError(null);
            setStatus(`Code connection changed · waiting for the local server and workspace to return ${infrastructureRecoveryCycles}/3…`);
            const recoveredSession = await recoverWorkspaceAfterOutage({ preferredSession: activeSession });
            if (!recoveredSession) throw requestError;
            activeSession = recoveredSession;
            executionKey = `code-ide:${crypto.randomUUID()}`;
            resumeState = null;
            lastProgressFingerprint = "";
            missionIdleDeadline = Date.now() + MISSION_IDLE_DEADLINE_MS;
            setLocalMissionId(missionId);
            await wait([500, 1200, 2500][infrastructureRecoveryCycles - 1]);
            requestRefresh();
            continue;
          }
          throw requestError;
        } finally {
          if (passWatchdogTimer) window.clearTimeout(passWatchdogTimer);
        }
        const body = await response.json().catch(() => ({}));
        if (response.ok) historyResumePending = false;
        if (!response.ok) {
          const responseReason = text(body?.error || `Code mission failed (${response.status})`, 1000);
          const historySnapshotInvalid = /CODE_AI_MISSION_ATTESTATION_INVALID|CODE_AI_MISSION_ATTESTATION_REQUIRED/i.test(responseReason);
          if (historySnapshotInvalid && infrastructureRecoveryCycles < 3) {
            infrastructureRecoveryCycles += 1;
            historyResumePending = false;
            autoResumeMissionRef.current = "";
            executionKey = `code-ide:${crypto.randomUUID()}`;
            resumeState = null;
            lastProgressFingerprint = "";
            missionIdleDeadline = Date.now() + MISSION_IDLE_DEADLINE_MS;
            setLocalMissionId(missionId);
            setActivityBaselineAt(Date.now());
            setError(null);
            setStatus("The saved checkpoint is stale. I’m continuing from the current local workspace instead.");
            await wait(500);
            requestRefresh();
            continue;
          }
          const recoverableResponse = recoverableCodeInfrastructureBlocker(responseReason);
          if (recoverableResponse && infrastructureRecoveryCycles < 3) {
            infrastructureRecoveryCycles += 1;
            const workspaceRecoveryNeeded = response.status === 404 || /LOAD FAILED|HISTORY_MISSION_NOT_FOUND/i.test(responseReason);
            const historySnapshotInvalid = /ATTESTATION/i.test(responseReason);
            setStatus(workspaceRecoveryNeeded
              ? `The Code connection changed. I’m reconnecting to the current project and continuing · ${infrastructureRecoveryCycles}/3`
              : historySnapshotInvalid
                ? `The saved checkpoint is stale. I’m rebuilding from the current project state and continuing · ${infrastructureRecoveryCycles}/3`
                : `I hit a temporary execution problem. I’m repairing it and continuing · ${infrastructureRecoveryCycles}/3`);
            if (workspaceRecoveryNeeded) {
              setError(null);
              const recoveredSession = await recoverWorkspaceAfterOutage({ preferredSession: activeSession });
              if (!recoveredSession) throw new Error(responseReason);
              activeSession = recoveredSession;
              if (/HISTORY_MISSION_NOT_FOUND|LOAD FAILED/i.test(responseReason) || response.status === 404) {
                historyResumePending = false;
                autoResumeMissionRef.current = "";
                missionId = `code-mission-${crypto.randomUUID()}`;
                setLocalMissionId(missionId);
                setActivityBaselineAt(Date.now());
                setStatus("The saved mission history is unavailable. I reattached the same workspace and I’m continuing the objective as a fresh local mission.");
              }
            }
            if (historySnapshotInvalid) {
              historyResumePending = false;
              autoResumeMissionRef.current = "";
            }
            executionKey = `code-ide:${crypto.randomUUID()}`;
            resumeState = null;
            lastProgressFingerprint = "";
            missionIdleDeadline = Date.now() + MISSION_IDLE_DEADLINE_MS;
            setLocalMissionId(missionId);
            await wait([500, 1200, 2500][infrastructureRecoveryCycles - 1]);
            requestRefresh();
            continue;
          }
          throw new Error(responseReason);
        }

        if (body?.async_running === true) {
          setMissionResult(body);
          setStatus(body?.already_running
            ? "Code is already running this local mission in the background."
            : "Code accepted the mission and is running locally in the background.");
          setLocalMissionStage("The local Code employee owns this mission now. I’m following its live repository progress without holding an HTTP pass open.");
          const asyncProgressBaselineAt = taskStartedAt;
          requestRefresh();

          let terminalProgress = null;
          let terminalStatus = "";
          let terminalReason = "";
          let progressFingerprint = "";
          let idleRefreshAttempts = 0;
          while (Date.now() < missionAbsoluteDeadline) {
            await wait(250);
            const liveProgress = scopedProgressRef.current;
            if (!liveProgress || text(liveProgress?.mission_id) !== missionId) continue;
            const liveEventAt = Date.parse(text(liveProgress?.latest_event?.at || liveProgress?.updated_at));
            if (!Number.isFinite(liveEventAt) || liveEventAt < asyncProgressBaselineAt) continue;

            const liveStatus = text(
              liveProgress?.state_status || liveProgress?.latest_event?.status,
              120,
            ).toLowerCase();
            const liveReason = text(
              liveProgress?.latest_event?.reason ||
              liveProgress?.latest_event?.description,
              2000,
            );
            const nextFingerprint = JSON.stringify({
              status: liveStatus,
              phase: text(liveProgress?.latest_event?.phase, 120),
              at: text(liveProgress?.latest_event?.at, 160),
              completed_operation_count: Number(liveProgress?.completed_operation_count || 0),
              current_operation_id: text(liveProgress?.current_operation_id, 240),
            });
            if (nextFingerprint !== progressFingerprint) {
              progressFingerprint = nextFingerprint;
              idleRefreshAttempts = 0;
              missionIdleDeadline = Date.now() + MISSION_IDLE_DEADLINE_MS;
            }

            const liveReasoningBudget = Number(
              liveProgress?.work_package_control?.reasoning_call_budget || requestedReasoningBudget,
            );
            const provisionalBudgetBoundary =
              liveStatus === "blocked" &&
              /CODE_AI_EMPLOYEE_REASONING_BUDGET_EXHAUSTED/i.test(liveReason) &&
              liveReasoningBudget < MAX_LOCAL_REASONING_BUDGET;
            if (provisionalBudgetBoundary) continue;

            if (["blocked", "completed", "failed", "stopped", "cancelled"].includes(liveStatus)) {
              terminalProgress = liveProgress;
              terminalStatus = liveStatus;
              terminalReason = liveReason;
              break;
            }

            if (Date.now() >= missionIdleDeadline) {
              idleRefreshAttempts += 1;
              requestRefresh();
              await wait(2000);
              const refreshedProgress = scopedProgressRef.current;
              const refreshedMissionMatches =
                refreshedProgress &&
                text(refreshedProgress?.mission_id) === missionId;
              const refreshedStatus = refreshedMissionMatches
                ? text(
                    refreshedProgress?.state_status ||
                    refreshedProgress?.latest_event?.status,
                    120,
                  ).toLowerCase()
                : "";
              if (["blocked", "completed", "failed", "stopped", "cancelled"].includes(refreshedStatus)) {
                terminalProgress = refreshedProgress;
                terminalStatus = refreshedStatus;
                terminalReason = text(
                  refreshedProgress?.latest_event?.reason ||
                  refreshedProgress?.latest_event?.description,
                  2000,
                );
                break;
              }
              if (idleRefreshAttempts < 3) {
                setLocalMissionStage("No fresh worker event arrived yet. I’m refreshing the authoritative mission state before deciding whether the Code employee is actually stalled.");
                missionIdleDeadline = Date.now() + MISSION_IDLE_DEADLINE_MS;
                continue;
              }
              throw new Error("Code background mission stalled without authoritative progress");
            }
          }

          if (!terminalProgress) {
            throw new Error("Code background mission exceeded its absolute deadline");
          }

          const terminalBody = {
            ...body,
            success: terminalStatus === "completed",
            status: terminalStatus,
            reason: terminalReason || null,
            state: terminalProgress,
            resume_state: terminalProgress,
            async_running: false,
          };
          setMissionResult(terminalBody);
          terminalResponseObserved = true;
          setStatus(terminalStatus === "completed"
            ? "Code mission completed in shared workspace"
            : terminalReason || terminalStatus || "Code stopped");
          if (reportToTalk) {
            const summary = terminalStatus === "completed"
              ? codeMissionCompletionSummary(terminalBody, terminalProgress)
              : terminalStatus === "stopped"
                ? "I stopped the Code work at a safe boundary. No further changes will be made unless you continue it."
                : customerFacingCodeBlocker(terminalReason || terminalStatus || "unknown blocker");
            const summaryId = `mission-summary-${missionId}`;
            setChatTurns((current) => current.some((turn) => turn.id === summaryId)
              ? current
              : [...current, {
                  id: summaryId,
                  role: "assistant",
                  content: summary,
                }]);
          }
          break;
        }

        setMissionResult(body); requestRefresh();
        const responseState = body.resume_state || body.state || null;
        const responseStatus = text(responseState?.status || body.status, 120).toLowerCase();
        const developerVerificationTerminal = Boolean(body.developer_verification);
        const shouldResume = Boolean(
          !developerVerificationTerminal &&
          responseState &&
          (body.resume_required === true ||
            body.interactive_yield === true ||
            responseState?.planner_pending ||
            ["running", "planner_pending", "repair_required", "verification_required", "review_required", "replan_required"].includes(responseStatus))
        );
        if (shouldResume) {
          const progressFingerprint = JSON.stringify({
            status: responseStatus,
            reasoning_calls_used: Number(responseState?.work_package_control?.reasoning_calls_used || 0),
            pending_reasoning_call: Number(responseState?.work_package_control?.pending_reasoning_call || 0),
            operation_count: Array.isArray(responseState?.operations) ? responseState.operations.length : 0,
            completed_operation_count: Array.isArray(responseState?.completed_operation_ids)
              ? responseState.completed_operation_ids.length
              : Number(responseState?.completed_operation_count || 0),
            files_changed_count: Array.isArray(responseState?.files_changed) ? responseState.files_changed.length : 0,
            verification_count: Array.isArray(responseState?.tests) ? responseState.tests.length : 0,
            planner_job: text(responseState?.planner_pending?.provider_job_id || responseState?.planner_pending?.usage_id),
          });
          if (progressFingerprint !== lastProgressFingerprint) {
            lastProgressFingerprint = progressFingerprint;
            missionIdleDeadline = Date.now() + MISSION_IDLE_DEADLINE_MS;
          }
          if (Date.now() >= missionAbsoluteDeadline) throw new Error("Code mission absolute deadline exceeded");
          if (Date.now() >= missionIdleDeadline) throw new Error("Code mission stalled without progress");
          resumeState = responseState;
          await wait(MISSION_RESUME_SETTLE_MS);
          continue;
        }
        const terminalReason = text(body.reason || responseState?.blockers?.[0] || responseState?.failures?.[0]?.reason || "", 2000);
        const completedOperationCount = Array.isArray(responseState?.completed_operation_ids)
          ? responseState.completed_operation_ids.length
          : Number(responseState?.completed_operation_count || 0);
        const exhaustedReasoningBudget = /CODE_AI_EMPLOYEE_REASONING_BUDGET_EXHAUSTED/i.test(terminalReason);
        if (
          responseStatus === "blocked" &&
          exhaustedReasoningBudget &&
          completedOperationCount > lastContinuationCompletedOperationCount &&
          requestedReasoningBudget < MAX_LOCAL_REASONING_BUDGET
        ) {
          lastContinuationCompletedOperationCount = completedOperationCount;
          requestedReasoningBudget = Math.min(
            MAX_LOCAL_REASONING_BUDGET,
            requestedReasoningBudget + LOCAL_REASONING_BUDGET_TRANCHE,
          );
          executionKey = `code-ide:${crypto.randomUUID()}`;
          resumeState = responseState;
          missionIdleDeadline = Date.now() + MISSION_IDLE_DEADLINE_MS;
          setError(null);
          setLocalMissionStage(`Code completed ${completedOperationCount} repository operation${completedOperationCount === 1 ? "" : "s"} and reached its current reasoning tranche. I’m continuing the same mission with the next bounded local tranche (${requestedReasoningBudget} calls total) now.`);
          requestRefresh();
          await wait(500);
          continue;
        }
        if (responseStatus === "blocked" && recoverableCodeInfrastructureBlocker(terminalReason) && infrastructureRecoveryCycles < 3) {
          infrastructureRecoveryCycles += 1;
          setStatus(`Code is repairing its execution runtime · recovery ${infrastructureRecoveryCycles}/3`);
          resumeState = responseState ? { ...responseState, status: "repair_required", blockers: [] } : null;
          await wait([2000, 5000, 10000][infrastructureRecoveryCycles - 1]);
          requestRefresh();
          continue;
        }
        terminalResponseObserved = true;
        setStatus(body.status === "completed" ? "Code mission completed in shared workspace" : body.reason || body.status || "Code stopped");
        if (reportToTalk) {
          const finalState = body.state || body.resume_state || {};
          const finalStatus = text(body.status || finalState.status, 120).toLowerCase();
          const summary = finalStatus === "completed"
            ? codeMissionCompletionSummary(body, finalState)
            : finalStatus === "stopped"
              ? "I stopped the Code work at a safe boundary. No further changes will be made unless you continue it."
              : customerFacingCodeBlocker(body.reason || finalState.blockers?.[0] || finalState.failures?.[0]?.reason || finalStatus || "unknown blocker");
          const summaryId = `mission-summary-${missionId}`;
          setChatTurns((current) => current.some((turn) => turn.id === summaryId)
            ? current
            : [...current, { id: summaryId, role: "assistant", content: summary }]);
        }
        break;
      }
      if (!terminalResponseObserved) throw new Error("Code mission resume limit exceeded");
      try {
        const state = await ideRequestWithSession(activeSession, "state");
        setDeviceHealth(state);
        setRevision(Number(state.revision || revision)); setLeaseOwner(state.edit_owner || null);
        const tree = await ideRequestWithSession(activeSession, "tree"); setFiles(tree.files || []);
        const diff = await ideRequestWithSession(activeSession, "diff"); setDiffText(diff.patch || "");
        if (activePath && !dirty[activePath]) {
          const fresh = await ideRequestWithSession(activeSession, "read", { file_path: activePath });
          setBuffers((current) => ({ ...current, [activePath]: { ...fresh, content: fresh.content ?? "", revision: Number(state.revision || revision) } }));
        }
      } catch (refreshError) {
        if (!recoverableCodeInfrastructureBlocker(refreshError?.message)) throw refreshError;
        setStatus("Code finished the mission; refreshing a stale workspace session automatically…");
        const recoveredSession = await openWorkspace({ forceRediscover: true });
        if (recoveredSession) activeSession = recoveredSession;
        requestRefresh();
      }
    } catch (missionError) {
      const failureReason = text(missionError?.message || missionError) || "Code mission stopped";
      const recoverableFailure = recoverableCodeInfrastructureBlocker(failureReason);
      setError(recoverableFailure ? null : failureReason);
      setStatus(recoverableFailure ? "Code could not reconnect before the recovery window closed" : "Code mission stopped");
      if (reportToTalk && !recoverableFailure) setChatTurns((current) => [...current, { role: "assistant", content: customerFacingCodeBlocker(failureReason) }]);
    }
    finally { setMissionRunning(false); setLocalMissionId(""); requestRefresh(); }
  }

  runCodeMissionRef.current = runCodeMission;

  useEffect(() => {
    if (!session || missionRunning || !scopedProgress) return;
    const staleMissionId = text(scopedProgress?.mission_id);
    const staleState = text(scopedProgress?.state_status || scopedProgress?.latest_event?.status).toLowerCase();
    const staleReason = text(scopedProgress?.latest_event?.reason || scopedProgress?.latest_event?.description);
    const staleActiveStates = new Set(["active", "executing", "in_progress", "pending", "planner_pending", "queued", "running", "verifying", "working"]);
    const recoverableTerminalState = ["failed", "blocked", "repair_required"].includes(staleState)
      && recoverableCodeInfrastructureBlocker(staleReason);
    if (!staleMissionId || (!staleActiveStates.has(staleState) && !recoverableTerminalState)) return;
    if (autoResumeMissionRef.current === staleMissionId) return;
    const progressObjective = text(scopedProgress?.objective);
    if (!progressObjective) return;
    const latestAt = Date.parse(text(scopedProgress?.latest_event?.at || scopedProgress?.updated_at));
    const staleForMs = Number.isFinite(latestAt) ? Date.now() - latestAt : 0;
    if (staleForMs < 15000 || staleForMs > 6 * 60 * 60 * 1000) return;
    autoResumeMissionRef.current = staleMissionId;
    setError(null);
    setStatus("I lost the active work loop after the reload. I’m reconnecting to the same task and continuing now.");
    void runCodeMissionRef.current?.(progressObjective, {
      reportToTalk: true,
      sessionOverride: session,
      resumeMissionId: staleMissionId,
    });
  }, [
    session,
    missionRunning,
    sessionAgentActive,
    scopedProgress,
  ]);

  async function classifyConversationIntent(message, turns = []) {
    const fastIntent = fastClientIntent(message, turns);
    if (fastIntent) return { intent: fastIntent, confidence: 0.94, provider: "client-fast-intent" };
    const response = await fetch("/api/operator/code/conversation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        organizationId,
        message,
        recent_conversation: turns.slice(-12),
        repository_url: session?.repository_url || repositoryUrl.trim() || null,
        ref: session?.ref || ref.trim() || "main",
        device_session_id: session?.session_id || null,
        revision,
        active_file: activePath || null,
        changed_files: scopedProgress?.files_changed || [],
        intent_only: true,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.success !== true) throw new Error(body?.error || "Code intent routing failed");
    return body;
  }

  function missionObjectiveFromConversation(message, turns = []) {
    const latestInstruction = text(message);
    const explicitReadOnlyVerification = /\bnode\s+--check\b/i.test(latestInstruction)
      && /\b(?:app|components|lib|tests|scripts|workers)\/[A-Za-z0-9_./@()\[\]-]+\.(?:cjs|css|js|jsx|json|md|mjs|sql|ts|tsx|yml|yaml)\b/i.test(latestInstruction)
      && !/\b(?:fix|change|modify|edit|implement|repair|refactor|add|remove|replace|rewrite|create)\b/i.test(latestInstruction.replace(/(?:make\s+no\s+(?:source\s+)?changes?|no\s+(?:source\s+)?changes?|do\s+not\s+(?:change|modify|edit))/gi, ""));
    if (explicitReadOnlyVerification) return latestInstruction.slice(0, 24000);
    const recent = (Array.isArray(turns) ? turns : []).slice(-10);
    const visualContextRequested = /\b(?:design|visual|ui|ux|layout|style|brand|image|poster|hero|preview|wireframe|mockup)\b/i.test(latestInstruction);
    const context = recent.map((turn) => {
      if (!turn) return "";
      if (visualContextRequested && turn.role === "design_preview" && turn.preview?.schema) {
        return [
          "Approved visual direction:",
          turn.preview?.title || turn.content || "Design preview",
          turn.preview?.summary || "",
          JSON.stringify(turn.preview.schema),
          turn.hero_image_url ? `Hero visual reference: ${turn.hero_image_url}` : "",
          turn.support_image_url ? `Supporting visual reference: ${turn.support_image_url}` : "",
        ].filter(Boolean).join("\n");
      }
      if (visualContextRequested && turn.role === "visual" && turn.artifact) {
        return [
          `Approved ${turn.artifact.kind || "visual"} conclusion:`,
          turn.artifact.title || "",
          turn.artifact.summary || "",
          JSON.stringify({
            nodes: turn.artifact.nodes || [],
            edges: turn.artifact.edges || [],
          }),
        ].filter(Boolean).join("\n");
      }
      if (visualContextRequested && turn.role === "image" && turn.asset_url) {
        return `Visual reference generated in Talk: ${turn.asset_url}`;
      }
      if (["user", "assistant"].includes(turn.role) && turn.content) {
        return `${turn.role === "user" ? "User" : "Code"}: ${turn.content}`;
      }
      return "";
    }).filter(Boolean).join("\n\n");

    const diagnosticRequest = /\b(?:check|diagnose|investigate|what(?:'s| is) wrong|why .*?(?:not work|isn't working|is not working)|not working|broken|issue|problem)\b/i.test(latestInstruction)
      && !/\b(?:build|implement|add|create|rewrite|refactor|replace|remove|deploy|commit)\b/i.test(latestInstruction);
    if (diagnosticRequest) {
      return [
        "Diagnose the user's reported product problem before making any source change.",
        `User request: ${message}`,
        context ? `Relevant recent conversation:\n${context}` : "",
        "Resolve the product/feature named by the user from the actual repository and running workspace context. Do not treat the user's wording as a filename or invent an implementation target.",
        "Reproduce or inspect the real user-facing failure first. Trace the relevant UI, route/API, runtime state, local worker, and data boundary only as needed to explain the observed behavior.",
        "Identify the exact blocker from repository/runtime evidence. Only then repair proven defects, preserve unrelated work, run focused verification, and confirm the real behavior works end to end.",
        "The final Talk handoff must explain what was wrong, what changed, why that fixed the observed problem, what was verified, and anything still unresolved.",
      ].filter(Boolean).join("\n\n").slice(0, 24000);
    }

    return [
      "Implement the user's latest instruction in the existing shared Code Studio project.",
      `Latest instruction: ${message}`,
      context ? `${visualContextRequested ? "Conversation and approved visual context" : "Relevant recent engineering conversation"}:\n${context}` : "",
      "Inspect the live repository before editing. Preserve unrelated work. Implement, test, verify the real running behavior, and keep responsibility until the requested result is proven.",
    ].filter(Boolean).join("\n\n").slice(0, 24000);
  }

  function chooseDesignDirection(turnId, directionIndex) {
    setChatTurns((current) => current.map((turn) => {
      if (turn.id !== turnId || turn.role !== "design_preview" || !turn.preview?.schema) return turn;
      return {
        ...turn,
        preview: {
          ...turn.preview,
          schema: {
            ...turn.preview.schema,
            selected_direction: directionIndex,
          },
        },
      };
    }));
  }

  function buildVisualConclusion(turn) {
    if (!turn || missionRunning || currentActiveMissionId) return;
    const label = turn.role === "design_preview"
      ? turn.preview?.title || turn.content || "the approved design"
      : turn.artifact?.title || turn.content || "the approved visual conclusion";
    const objectiveText = missionObjectiveFromConversation(
      `Build the approved visual conclusion exactly enough to make it real in the product: ${label}`,
      [...chatTurns, turn],
    );
    setChatTurns((current) => [...current, {
      role: "assistant",
      content: "I’m taking this approved visual direction into the shared repository now. I’ll implement it, verify the real result, and keep the visual conclusion as the design target.",
    }]);
    if (typeof onStudioViewChange === "function") onStudioViewChange("code");
    void runCodeMission(objectiveText);
  }

  function openStudioPreview() {
    const url = browserUrl.trim();
    if (!url) return;
    if (typeof onPreviewUrlChange === "function") onPreviewUrlChange(url);
    if (typeof onStudioViewChange === "function") onStudioViewChange("preview");
  }

  async function sendCodeMessage() {
    const message = objective.trim();
    if (!message) return;
    const priorTurns = chatTurns.slice(-12);
    const nextUserTurn = { id: `user-${crypto.randomUUID()}`, role: "user", content: message };
    setChatTurns((current) => {
      const previous = current.at(-1);
      if (previous?.role === "user" && text(previous?.content) === message) return current;
      return [...current, nextUserTurn];
    });
    setObjective("");
    setError(null);
    setConversationPendingCount((count) => count + 1);
    const pendingReplyId = `reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const replyStartedAt = Date.now();
    let replyProgressTimer = null;
    const replyProgressSnapshot = (elapsedSeconds) => {
      const seconds = Math.max(0, elapsedSeconds);
      const percent = Math.min(92, Math.round(seconds < 4
        ? 7 + seconds * 5
        : seconds < 12
          ? 27 + (seconds - 4) * 4
          : seconds < 30
            ? 59 + (seconds - 12) * 1.25
            : 82 + (seconds - 30) * 0.18));
      const stage = percent < 25 ? "Understanding what you need"
        : percent < 55 ? "Checking the relevant project context"
          : percent < 78 ? "Working through the safest next step"
            : "Preparing the clearest response";
      return { percent, stage };
    };
    setChatTurns((current) => [...current, {
      id: pendingReplyId,
      role: "assistant_pending",
      content: "Code is working on this request…",
      estimated_progress: 7,
      progress_stage: "Understanding request",
      elapsed_seconds: 0,
    }]);
    replyProgressTimer = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - replyStartedAt) / 1000);
      const snapshot = replyProgressSnapshot(elapsedSeconds);
      setChatTurns((current) => current.map((turn) => turn.id === pendingReplyId ? {
        ...turn,
        estimated_progress: snapshot.percent,
        progress_stage: snapshot.stage,
        elapsed_seconds: elapsedSeconds,
      } : turn));
    }, 1000);
    const settlePendingReply = (content, extra = {}) => setChatTurns((current) => current.map((turn) => turn.id === pendingReplyId ? {
      id: pendingReplyId,
      role: "assistant",
      content,
      estimated_progress: 100,
      progress_stage: "Ready",
      elapsed_seconds: Math.max(0, Math.floor((Date.now() - replyStartedAt) / 1000)),
      ...extra,
    } : turn));
    const removePendingReply = () => setChatTurns((current) => current.filter((turn) => turn.id !== pendingReplyId));

    try {
      let intentResult = null;
      try {
        intentResult = await classifyConversationIntent(message, [...priorTurns, nextUserTurn]);
      } catch {
        intentResult = { intent: "discussion", confidence: 0 };
      }
      const hasBuildableConversationContext = priorTurns.some((turn) =>
        ["design_preview", "visual", "image"].includes(turn?.role)
      );
      const explicitBuildFollowUp = hasBuildableConversationContext &&
        /^(do it|build it|build this|make it|make this|implement it|implement this|apply it|apply this|go ahead|continue and build|yes[, ]+build)/i.test(message.trim());
      const intent = explicitBuildFollowUp
        ? "repository_work"
        : intentResult?.intent || "discussion";

      if (intent === "repository_work") {
        const locallyOwnedMissionId = missionRunning ? text(localMissionId) : "";
        const preservedMissionId = text(scopedProgress?.mission_id);
        const preservedState = text(scopedProgress?.state_status || scopedProgress?.latest_event?.status).toLowerCase();
        const preservedTerminalStates = new Set([
          "repair_required",
          "replan_required",
          "verification_required",
        ]);
        const explicitMissionContinuation = /\b(?:continue|resume|replan|same mission|preserved mission|keep going|restart recovery)\b/i.test(message);
        const shouldResumePreservedMission = Boolean(
          preservedMissionId &&
          (explicitMissionContinuation || preservedTerminalStates.has(preservedState)) &&
          (!locallyOwnedMissionId || locallyOwnedMissionId === preservedMissionId)
        );

        if (missionRunning && !shouldResumePreservedMission) {
          if (locallyOwnedMissionId) await submitLiveSteer(locallyOwnedMissionId, message);
          else {
            pendingSteerRef.current.push(message);
            setStatus("Live instruction queued while Code establishes the active mission");
          }
          settlePendingReply("Got it. I’ve added that to the live mission and I’ll verify it before completion.");
        } else if (!Object.values(dirty).some(Boolean)) {
          let missionSession = session;
          if (!missionSession) {
            settlePendingReply("I’m connecting the Code workspace behind this conversation now.");
            missionSession = await openWorkspace();
            if (!missionSession) {
              settlePendingReply(lastWorkspaceConnectionErrorRef.current || "I couldn’t attach the Code workspace. I’m keeping the conversation open, but repository work is paused until the connection is healthy again.");
              return;
            }
          }
          const missionObjective = missionObjectiveFromConversation(message, [...priorTurns, nextUserTurn]);
          removePendingReply();
          runCodeMission(missionObjective, {
            reportToTalk: true,
            sessionOverride: missionSession,
            resumeMissionId: shouldResumePreservedMission ? preservedMissionId : "",
          });
        } else {
          settlePendingReply("There are unsaved editor changes, so I’m not starting repository work until those are resolved.");
        }
        return;
      }

      if (intent === "design_preview") {
        settlePendingReply("I’m building the visual direction directly now. I’ll research the space, show it taking shape, and keep the repository untouched.");
        void showDesignPreview([...priorTurns, nextUserTurn]);
        return;
      }

      if (intent === "image_generation") {
        removePendingReply();
        void generateDiscussionImage([...priorTurns, nextUserTurn]);
        return;
      }

      if (["architecture", "flow", "wireframe", "decision_board"].includes(intent)) {
        removePendingReply();
        void showVisualArtifact(intent, [...priorTurns, nextUserTurn]);
        return;
      }

      const response = await fetch("/api/operator/code/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          organizationId,
          message,
          recent_conversation: [...priorTurns, nextUserTurn],
          repository_url: session?.repository_url || repositoryUrl.trim() || null,
          ref: session?.ref || ref.trim() || "main",
          device_session_id: session?.session_id || null,
          revision,
          active_file: activePath || null,
          changed_files: scopedProgress?.files_changed || [],
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success !== true) throw new Error(body?.error || "Code conversation failed");

      if (body.needs_repository_work === true) {
        if (Object.values(dirty).some(Boolean)) {
          settlePendingReply("There are unsaved editor changes, so I’m not starting repository work until those are resolved.");
          return;
        }

        let missionSession = session;
        if (!missionSession) {
          settlePendingReply("I’m connecting the Code workspace behind this conversation now.");
          missionSession = await openWorkspace();
          if (!missionSession) {
            settlePendingReply(lastWorkspaceConnectionErrorRef.current || "I couldn’t attach the Code workspace. I’m keeping the conversation open, but repository work is paused until the connection is healthy again.");
            return;
          }
        }

        const preservedMissionId = text(scopedProgress?.mission_id);
        const preservedState = text(scopedProgress?.state_status || scopedProgress?.latest_event?.status).toLowerCase();
        const preservedTerminalStates = new Set([
          "repair_required",
          "replan_required",
          "verification_required",
        ]);
        const explicitMissionContinuation = /\b(?:continue|resume|replan|same mission|preserved mission|keep going|restart recovery)\b/i.test(message);
        const resumeMissionId = preservedMissionId &&
          (explicitMissionContinuation || preservedTerminalStates.has(preservedState))
          ? preservedMissionId
          : "";

        removePendingReply();
        runCodeMission(
          body.execution_objective || missionObjectiveFromConversation(message, [...priorTurns, nextUserTurn]),
          {
            reportToTalk: true,
            sessionOverride: missionSession,
            resumeMissionId,
          },
        );
        return;
      }

      if (body.reply) settlePendingReply(body.reply);
      else removePendingReply();
      if (body.generate_visual_example === true && body.reply) {
        void showDesignPreview([...priorTurns, nextUserTurn, { role: "assistant", content: body.reply }]);
      }
    } catch (conversationError) {
      const messageText = conversationError?.message || "Code conversation failed";
      setError(messageText);
      settlePendingReply(`I hit a runtime problem while handling that request: ${messageText}`);
    } finally {
      if (replyProgressTimer) window.clearInterval(replyProgressTimer);
      setConversationPendingCount((count) => Math.max(0, count - 1));
      setConversationVisualBusy(false);
      if (conversationVisualTimerRef.current) {
        window.clearInterval(conversationVisualTimerRef.current);
        conversationVisualTimerRef.current = null;
      }
      setConversationVisualProgress(null);
    }
  }

  async function generateDesignPreviewAsset(prompt, { width = 320, height = 320, steps = 5, onProgress = null, onQueued = null } = {}) {
    const cacheKey = [text(prompt), width, height, steps].join("|");
    const cached = designImageCacheRef.current.get(cacheKey);
    if (cached?.asset_url) return cached;
    const usageId = `code-design-asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const submit = await fetch("/api/operator/code/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        organizationId,
        usage_id: usageId,
        prompt,
        width,
        height,
        steps,
        cfg_scale: 1.0,
        repository_url: session?.repository_url || repositoryUrl.trim() || null,
        device_session_id: session?.session_id || null,
      }),
    });
    const submitted = await submit.json().catch(() => ({}));
    const providerJobId = submitted?.output?.provider_job_id;
    if (!submit.ok || submitted?.success !== true || !providerJobId) {
      throw new Error(submitted?.error || "Design image failed to queue");
    }
    if (typeof onQueued === "function") onQueued(providerJobId);
    for (let attempt = 0; attempt < 192; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      if (typeof onProgress === "function") {
        const elapsedSeconds = Math.round((attempt + 1) * 2.5);
        const percent = Math.min(94, Math.round(8 + elapsedSeconds * 0.62));
        onProgress({ percent, elapsedSeconds });
      }
      const response = await fetch(`/api/operator/code/image?organizationId=${encodeURIComponent(organizationId)}&jobId=${encodeURIComponent(providerJobId)}`, { credentials: "same-origin" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success !== true) throw new Error(body?.error || "Design image status failed");
      if (body.status === "completed" && body.output?.asset_url) {
        designImageCacheRef.current.set(cacheKey, body.output);
        return body.output;
      }
      if (body.status === "cancelled") throw new Error(body.error || "CANCELLED_BY_CALLER");
      if (body.status === "failed") throw new Error(body.error || "Design image generation failed");
    }
    throw new Error("Design image generation timed out");
  }

  async function reviewDesignPreviewAsset(imageUrl, direction = {}, originalPrompt = "") {
    const usageId = `code-design-review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const instructions = [
      "Act as a strict premium website photography quality critic. Judge only visible evidence in this generated hero image.",
      `Intended concept: ${direction?.name || "website direction"}.`,
      `Intended imagery strategy: ${direction?.imagery_strategy || "premium editorial photography"}.`,
      `Original image intent: ${String(originalPrompt || "").slice(0, 900)}.`,
      "Return JSON only with keys: passed, score, defects, strengths, repair_prompt.",
      "score is 0-100. passed may be true only at score >= 88 and only when there are no obvious AI artifacts.",
      "Reject duplicated people or structures, malformed anatomy, distorted hands/faces, warped horizons or architecture, melted/smeared geometry, impossible perspective, collage/split-image artifacts, fake text/signage, plastic CGI texture, excessive blur, incoherent lighting, poor crop, weak focal hierarchy, or imagery that does not fit the stated concept.",
      "defects and strengths are arrays of concise visible observations. repair_prompt must describe only concrete corrections needed for one regeneration; never invent scene facts not visible or requested.",
    ].join(" ");
    const submit = await fetch("/api/operator/code/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ organizationId, usage_id: usageId, capability: "ai.image.analyze", image_url: imageUrl, instructions, repository_url: session?.repository_url || repositoryUrl.trim() || null, device_session_id: session?.session_id || null }),
    });
    const submitted = await submit.json().catch(() => ({}));
    const providerJobId = submitted?.output?.provider_job_id;
    if (!submit.ok || submitted?.success !== true || !providerJobId) throw new Error(submitted?.error || "Design image review failed to queue");
    for (let attempt = 0; attempt < 192; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const response = await fetch(`/api/operator/code/image?organizationId=${encodeURIComponent(organizationId)}&jobId=${encodeURIComponent(providerJobId)}`, { credentials: "same-origin" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success !== true) throw new Error(body?.error || "Design image review status failed");
      if (body.status === "completed") {
        const review = body.output?.result && typeof body.output.result === "object" ? body.output.result : {};
        const score = Number(review.score);
        const normalizedScore = Number.isFinite(score) ? score : 0;
        const defects = Array.isArray(review.defects) ? review.defects.map((item) => String(item || "")) : [];
        const severeVisibleDefect = defects.some((item) => /duplicate|malform|distort|warped|melted|smear|extra limb|anatom|impossible perspective|collage|fake text|plastic|cgi|incoherent light|broken geometry/i.test(item));
        const passed = normalizedScore >= 88 && !severeVisibleDefect && review.passed !== false;
        return { ...review, score: normalizedScore, defects, passed };
      }
      if (body.status === "failed") throw new Error(body.error || "Design image review failed");
    }
    throw new Error("Design image review timed out");
  }

  async function upscaleDesignPreviewAsset(sourceImage) {
    const usageId = `code-design-upscale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const submit = await fetch("/api/operator/code/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        organizationId,
        usage_id: usageId,
        capability: "ai.image.upscale",
        source_image: sourceImage,
        repository_url: session?.repository_url || repositoryUrl.trim() || null,
        device_session_id: session?.session_id || null,
      }),
    });
    const submitted = await submit.json().catch(() => ({}));
    const providerJobId = submitted?.output?.provider_job_id;
    if (!submit.ok || submitted?.success !== true || !providerJobId) throw new Error(submitted?.error || "Design image upscale failed to queue");
    for (let attempt = 0; attempt < 160; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const response = await fetch(`/api/operator/code/image?organizationId=${encodeURIComponent(organizationId)}&jobId=${encodeURIComponent(providerJobId)}`, { credentials: "same-origin" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success !== true) throw new Error(body?.error || "Design image upscale status failed");
      if (body.status === "completed" && body.output?.asset_url) return body.output;
      if (body.status === "failed") throw new Error(body.error || "Design image upscale failed");
    }
    throw new Error("Design image upscale timed out");
  }

  async function showDesignPreview(sourceTurns = null) {
    const turnSource = Array.isArray(sourceTurns) ? sourceTurns : chatTurns;
    if (!session || designBusy || !turnSource.length) return;
    const latestUserIndex = [...turnSource].map((turn) => turn?.role).lastIndexOf("user");
    const latestUserTurn = latestUserIndex >= 0 ? turnSource[latestUserIndex] : null;
    const recentTurns = [latestUserTurn].filter(Boolean);
    const latestUser = latestUserTurn?.content || "";
    const pendingId = `design-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const message = [
      "Create a temporary high-fidelity digital experience prototype for the current discussion.",
      latestUser ? `Latest user direction: ${latestUser}` : "",
      "Research current public product, interface and design references, synthesize an original direction, and return a structured premium design concept. Do not copy a product or site and do not modify the repository.",
    ].filter(Boolean).join(" ");

    setDesignBusy(true);
    setError(null);
    const startedAt = Date.now();
    let progressTimer = null;
    const progressSnapshot = (elapsedSeconds) => {
      const seconds = Math.max(0, elapsedSeconds);
      const percent = Math.min(94, Math.round(seconds < 8
        ? 6 + seconds * 2.2
        : seconds < 25
          ? 24 + (seconds - 8) * 1.9
          : seconds < 55
            ? 56 + (seconds - 25) * 0.75
            : 79 + (seconds - 55) * 0.22));
      const stage = percent < 20 ? "Researching references"
        : percent < 45 ? "Shaping design direction"
          : percent < 70 ? "Building page system"
            : percent < 88 ? "Rendering preview"
              : "Finalizing";
      return { percent, stage };
    };
    setChatTurns((current) => [...current, {
      id: pendingId,
      role: "design_pending",
      content: "Code is building a live design prototype…",
      estimated_progress: 6,
      progress_stage: "Researching references",
      elapsed_seconds: 0,
    }]);
    progressTimer = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      const progress = progressSnapshot(elapsedSeconds);
      setChatTurns((current) => current.map((turn) => turn.id === pendingId ? {
        ...turn,
        estimated_progress: progress.percent,
        progress_stage: progress.stage,
        elapsed_seconds: elapsedSeconds,
      } : turn));
    }, 1000);
    try {
      const response = await fetch("/api/operator/code/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          organizationId,
          message,
          recent_conversation: recentTurns,
          repository_url: session?.repository_url || repositoryUrl.trim() || null,
          ref: session?.ref || ref.trim() || "main",
          device_session_id: session?.session_id || null,
          revision,
          active_file: activePath || null,
          changed_files: scopedProgress?.files_changed || [],
          design_preview: true,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success !== true || !body?.preview?.schema) {
        throw new Error(body?.error || "Code design preview failed");
      }
      const previewSchema = body.preview.schema;
      setChatTurns((current) => current.map((turn) => turn.id === pendingId ? {
        id: pendingId,
        role: "design_preview",
        content: body.preview.summary || body.preview.title || "Design preview",
        preview: body.preview,
        estimated_progress: 100,
        progress_stage: "Ready",
        elapsed_seconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
        hero_image_status: previewSchema?.hero_image_brief ? "generating" : null,
        support_image_status: previewSchema?.support_image_brief ? "deferred" : null,
        direction_image_urls: {},
        direction_image_statuses: Object.fromEntries((Array.isArray(previewSchema?.design_directions) ? previewSchema.design_directions.slice(0, 3) : []).map((_, index) => [index, "generating"])),
        direction_image_job_ids: {},
        direction_image_cancel_requested: {},
        direction_image_progress: {},
        direction_image_elapsed_seconds: {},
        direction_image_reviews: {},
      } : turn));

      if (previewSchema?.hero_image_brief || previewSchema?.support_image_brief) {
        void (async () => {
          const directions = Array.isArray(previewSchema?.design_directions) ? previewSchema.design_directions.slice(0, 3) : [];
          if (previewSchema?.hero_image_brief && directions.length) {
            const results = await Promise.allSettled(directions.map(async (direction, directionIndex) => {
              const imagePrompt = [
                direction?.hero_image_brief || previewSchema.hero_image_brief,
                `Distinct concept direction: ${direction?.name || `Direction ${directionIndex + 1}`}.`,
                `Imagery strategy: ${direction?.imagery_strategy || "project-specific commercial photography"}.`,
                `Visual direction: ${direction?.color_direction || "appropriate to the project"}; ${direction?.shape_language || "natural"} composition.`,
                "Believable professional editorial photography for a premium website hero. One coherent real-world scene, physically plausible perspective, natural lens and lighting, realistic materials and anatomy. No mirrored or kaleidoscopic patterns, no duplicated structures, no smeared geometry, no surrealism, no CGI look, no illustration, no text, no logos, no UI, no watermark, no Avantiqo branding.",
              ].join(" ");
              const setDirectionJob = (jobId) => setChatTurns((current) => current.map((turn) => turn.id === pendingId ? {
                ...turn,
                direction_image_job_ids: { ...(turn.direction_image_job_ids || {}), [directionIndex]: jobId || null },
                direction_image_cancel_requested: { ...(turn.direction_image_cancel_requested || {}), [directionIndex]: false },
              } : turn));
              const hero = await generateDesignPreviewAsset(imagePrompt, {
                width: 320,
                height: 320,
                steps: 5,
                onProgress: ({ percent, elapsedSeconds }) => setChatTurns((current) => current.map((turn) => turn.id === pendingId ? {
                  ...turn,
                  direction_image_progress: { ...(turn.direction_image_progress || {}), [directionIndex]: percent },
                  direction_image_elapsed_seconds: { ...(turn.direction_image_elapsed_seconds || {}), [directionIndex]: elapsedSeconds },
                } : turn)),
                onQueued: setDirectionJob,
              });
              setDirectionJob(null);
              setChatTurns((current) => current.map((turn) => turn.id === pendingId ? {
                ...turn,
                direction_image_statuses: { ...(turn.direction_image_statuses || {}), [directionIndex]: "draft-ready" },
              } : turn));
              return { directionIndex, hero, imagePrompt, direction };
            }));

            const generated = results
              .filter((result) => result.status === "fulfilled")
              .map((result) => result.value)
              .sort((a, b) => a.directionIndex - b.directionIndex);

            // Replace the fast square draft with a direct, higher-resolution hero render.
            // Direct refinement avoids the waxy/warped artifacts that a 4x super-resolution pass can amplify.
            for (const item of generated) {
              const { directionIndex, hero, imagePrompt, direction } = item;
              setChatTurns((current) => current.map((turn) => turn.id === pendingId ? {
                ...turn,
                direction_image_statuses: { ...(turn.direction_image_statuses || {}), [directionIndex]: "refining" },
              } : turn));
              try {
                const heroLayout = String(direction?.hero_layout || "").toLowerCase();
                const finalSize = heroLayout === "full-bleed"
                  ? { width: 768, height: 512 }
                  : heroLayout === "split"
                    ? { width: 576, height: 704 }
                    : { width: 640, height: 576 };
                const refined = await generateDesignPreviewAsset(
                  `${imagePrompt} FINAL PHOTOGRAPH ONLY. Crisp natural photographic detail, coherent straight edges, believable anatomy and perspective, controlled depth of field, natural tonal range, no over-smoothing, no painterly texture, no collage, no duplicated people or structures, no signs, no printed words, no screens, no graphic design elements. Leave useful negative space appropriate to the composition.`,
                  { ...finalSize, steps: 8, onQueued: setDirectionJob }
                );
                setDirectionJob(null);
                let selectedImage = refined;
                let review = null;
                setChatTurns((current) => current.map((turn) => turn.id === pendingId ? {
                  ...turn,
                  direction_image_statuses: { ...(turn.direction_image_statuses || {}), [directionIndex]: "reviewing" },
                } : turn));
                try {
                  review = await reviewDesignPreviewAsset(refined.asset_url || hero.asset_url, direction, imagePrompt);
                  if (!review.passed) {
                    setChatTurns((current) => current.map((turn) => turn.id === pendingId ? {
                      ...turn,
                      direction_image_statuses: { ...(turn.direction_image_statuses || {}), [directionIndex]: "repairing" },
                      direction_image_reviews: { ...(turn.direction_image_reviews || {}), [directionIndex]: review },
                    } : turn));
                    const repairPrompt = Array.isArray(review.defects) ? review.defects.join("; ") : "";
                    const repaired = await generateDesignPreviewAsset(
                      `${imagePrompt} FINAL PHOTOGRAPH ONLY. Correct these observed defects: ${review.repair_prompt || repairPrompt || "improve physical realism, anatomy, geometry and photographic coherence"}. Preserve the intended concept while producing one coherent premium editorial photograph. No text, logos, UI, collage, duplicates or synthetic-looking geometry.`,
                      { ...finalSize, steps: 10, onQueued: setDirectionJob }
                    );
                    setDirectionJob(null);
                    const repairedReview = await reviewDesignPreviewAsset(repaired.asset_url, direction, imagePrompt);
                    if (repairedReview.score >= review.score) {
                      selectedImage = repaired;
                      review = repairedReview;
                    }
                  }
                } catch (reviewError) {
                  const cancelled = /CANCELLED_BY_CALLER|CANCELLED/i.test(text(reviewError?.message));
                  review = { passed: false, score: 0, defects: [reviewError?.message || "Visual review unavailable"], review_error: true, cancelled };
                  if (cancelled) setDirectionJob(null);
                }
                setChatTurns((current) => current.map((turn) => turn.id === pendingId ? {
                  ...turn,
                  direction_image_urls: review?.passed
                    ? { ...(turn.direction_image_urls || {}), [directionIndex]: selectedImage.asset_url || hero.asset_url }
                    : { ...(turn.direction_image_urls || {}) },
                  direction_image_statuses: { ...(turn.direction_image_statuses || {}), [directionIndex]: review?.cancelled ? "stopped" : review?.passed ? "ready" : "needs-review" },
                  direction_image_reviews: { ...(turn.direction_image_reviews || {}), [directionIndex]: review },
                } : turn));
                item.refined = selectedImage;
                item.review = review;
              } catch (refineError) {
                const cancelled = /CANCELLED_BY_CALLER|CANCELLED/i.test(text(refineError?.message));
                if (cancelled) setDirectionJob(null);
                setChatTurns((current) => current.map((turn) => turn.id === pendingId ? {
                  ...turn,
                  direction_image_statuses: { ...(turn.direction_image_statuses || {}), [directionIndex]: cancelled ? "stopped" : "ready" },
                } : turn));
              }
            }
            const firstReady = generated.find((item) => item.refined)?.refined || generated[0]?.hero || null;
            setChatTurns((current) => current.map((turn) => turn.id === pendingId ? {
              ...turn,
              hero_image_status: firstReady ? "ready" : "failed",
              hero_image_url: firstReady?.asset_url || null,
            } : turn));
          } else if (previewSchema?.hero_image_brief) {
            try {
              const hero = await generateDesignPreviewAsset([
                previewSchema.hero_image_brief,
                "High-quality believable commercial photography appropriate to this project. Natural materials and lighting. No text, logos, UI, watermark, or Avantiqo branding.",
              ].join(" "), {
                width: 320,
                height: 320,
                steps: 5,
              });
              setChatTurns((current) => current.map((turn) => turn.id === pendingId ? { ...turn, hero_image_status: "ready", hero_image_url: hero.asset_url } : turn));
            } catch {
              setChatTurns((current) => current.map((turn) => turn.id === pendingId ? { ...turn, hero_image_status: "failed" } : turn));
            }
          }
          // Supporting/refined imagery is deliberately deferred until a direction is selected.
        })();
      }
    } catch (previewError) {
      setError(previewError.message);
      setChatTurns((current) => current.map((turn) => turn.id === pendingId ? {
        ...turn,
        id: pendingId,
        role: "design_error",
        content: `Design preview failed: ${previewError.message}`,
        progress_stage: "Render interrupted",
        error_message: previewError.message,
      } : turn));
    } finally {
      if (progressTimer) window.clearInterval(progressTimer);
      setDesignBusy(false);
    }
  }

  async function showVisualArtifact(preferredKind = null, sourceTurns = null) {
    if (!session || visualBusy) return;
    const recentTurns = (Array.isArray(sourceTurns) ? sourceTurns : chatTurns).slice(-12);
    const pendingVisualId = `visual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const latestUser = [...recentTurns].reverse().find((turn) => turn.role === "user")?.content || "";
    const latestAssistant = [...recentTurns].reverse().find((turn) => turn.role === "assistant")?.content || "";
    const message = [
      "Turn the current project discussion into the most useful visual artifact.",
      latestUser ? `Latest user point: ${latestUser}` : "",
      latestAssistant ? `Latest Code conclusion: ${latestAssistant}` : "",
      "Show the conclusion visually so we can discuss and revise it. Do not start repository work.",
    ].filter(Boolean).join(" ");
    setVisualBusy(true);
    setError(null);
    const visualStartedAt = Date.now();
    let visualProgressTimer = null;
    const visualProgressSnapshot = (elapsedSeconds) => {
      const seconds = Math.max(0, elapsedSeconds);
      const percent = Math.min(95, Math.round(seconds < 6
        ? 8 + seconds * 4
        : seconds < 18
          ? 32 + (seconds - 6) * 2.6
          : seconds < 38
            ? 63 + (seconds - 18) * 1.15
            : 86 + (seconds - 38) * 0.24));
      const stage = percent < 24 ? "Reading the discussion"
        : percent < 48 ? "Choosing the visual structure"
          : percent < 72 ? "Sketching the composition"
            : percent < 90 ? "Refining hierarchy"
              : "Finalizing the visual";
      return { percent, stage };
    };
    setChatTurns((current) => [...current, {
      id: pendingVisualId,
      role: "visual_pending",
      content: "Code is sketching this visually…",
      preferred_kind: preferredKind || null,
      estimated_progress: 8,
      progress_stage: "Reading the discussion",
      elapsed_seconds: 0,
    }]);
    visualProgressTimer = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - visualStartedAt) / 1000);
      const progress = visualProgressSnapshot(elapsedSeconds);
      setChatTurns((current) => current.map((turn) => turn.id === pendingVisualId ? {
        ...turn,
        estimated_progress: progress.percent,
        progress_stage: progress.stage,
        elapsed_seconds: elapsedSeconds,
      } : turn));
    }, 1000);
    try {
      const response = await fetch("/api/operator/code/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          organizationId,
          message,
          recent_conversation: recentTurns,
          repository_url: session?.repository_url || repositoryUrl.trim() || null,
          ref: session?.ref || ref.trim() || "main",
          device_session_id: session?.session_id || null,
          revision,
          active_file: activePath || null,
          changed_files: scopedProgress?.files_changed || [],
          visualize: true,
          preferred_visual_kind: preferredKind,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success !== true || !body?.artifact) {
        throw new Error(body?.error || "Code visual artifact failed");
      }
      setVisualArtifact(body.artifact);
      setChatTurns((current) => current.map((turn) => turn.id === pendingVisualId ? {
        id: pendingVisualId,
        role: "visual",
        content: body.artifact?.summary || body.artifact?.title || "Visual artifact",
        artifact: body.artifact,
        estimated_progress: 100,
        progress_stage: "Ready",
        elapsed_seconds: Math.max(0, Math.floor((Date.now() - visualStartedAt) / 1000)),
      } : turn));
    } catch (visualError) {
      setError(visualError.message);
      setChatTurns((current) => current.map((turn) => turn.id === pendingVisualId ? {
        id: pendingVisualId,
        role: "visual_error",
        content: `Visual failed: ${visualError.message}`,
      } : turn));
    } finally {
      if (visualProgressTimer) window.clearInterval(visualProgressTimer);
      setVisualBusy(false);
    }
  }

  async function cancelDesignPreviewAsset(turnId, directionIndex, providerJobId) {
    if (!providerJobId) return;
    setChatTurns((current) => current.map((turn) => turn.id === turnId ? {
      ...turn,
      direction_image_cancel_requested: { ...(turn.direction_image_cancel_requested || {}), [directionIndex]: true },
      direction_image_statuses: { ...(turn.direction_image_statuses || {}), [directionIndex]: "stopping" },
    } : turn));
    try {
      const response = await fetch(`/api/operator/code/image?organizationId=${encodeURIComponent(organizationId)}&jobId=${encodeURIComponent(providerJobId)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success !== true) throw new Error(body?.error || "Design image cancel failed");
      setChatTurns((current) => current.map((turn) => turn.id === turnId ? {
        ...turn,
        direction_image_job_ids: { ...(turn.direction_image_job_ids || {}), [directionIndex]: null },
        direction_image_cancel_requested: { ...(turn.direction_image_cancel_requested || {}), [directionIndex]: false },
        direction_image_statuses: { ...(turn.direction_image_statuses || {}), [directionIndex]: body.cancelled === false ? "already-finished" : "stopped" },
      } : turn));
    } catch (cancelError) {
      setError(cancelError?.message || "Design image cancel failed");
      setChatTurns((current) => current.map((turn) => turn.id === turnId ? {
        ...turn,
        direction_image_cancel_requested: { ...(turn.direction_image_cancel_requested || {}), [directionIndex]: false },
        direction_image_statuses: { ...(turn.direction_image_statuses || {}), [directionIndex]: "stop-failed" },
      } : turn));
    }
  }

  async function cancelImageGeneration(turnId, providerJobId) {
    if (!providerJobId) return;
    setChatTurns((current) => current.map((turn) => turn.id === turnId ? {
      ...turn,
      progress_stage: "Stopping Node01 render",
      cancel_requested: true,
    } : turn));
    try {
      const response = await fetch(`/api/operator/code/image?organizationId=${encodeURIComponent(organizationId)}&jobId=${encodeURIComponent(providerJobId)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success !== true) throw new Error(body?.error || "Code image cancel failed");
      setChatTurns((current) => current.map((turn) => turn.id === turnId ? {
        ...turn,
        role: "image_cancelled",
        content: body.cancelled === false ? "Image job already finished before cancellation" : "Image generation stopped",
        progress_stage: body.cancelled === false ? "Already finished" : "Stopped",
        compute_status: "cancelled",
        cancel_requested: false,
      } : turn));
    } catch (cancelError) {
      setError(cancelError?.message || "Code image cancel failed");
      setChatTurns((current) => current.map((turn) => turn.id === turnId ? {
        ...turn,
        progress_stage: "Stop failed",
        cancel_requested: false,
      } : turn));
    }
  }

  async function generateDiscussionImage(sourceTurns = null) {
    const turnSource = Array.isArray(sourceTurns) ? sourceTurns : chatTurns;
    if (!session || imageBusy || !turnSource.length) return;
    const recentTurns = turnSource.slice(-12);
    const latestUser = [...recentTurns].reverse().find((turn) => turn.role === "user")?.content || "";
    const latestAssistant = [...recentTurns].reverse().find((turn) => turn.role === "assistant")?.content || "";
    const latestVisual = [...recentTurns].reverse().find((turn) => turn.role === "visual" && turn.artifact)?.artifact || null;
    const pendingId = `image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const prompt = [
      "Create a high-fidelity professional web product design mockup from this current software/product discussion.",
      "Render a complete believable browser viewport with strong grid, spacing, typography hierarchy, navigation, hero composition, cards, controls and realistic UI density.",
      "The result must look like a senior product designer's polished Figma concept or premium agency website comp, not an AI collage, sketch, wireframe, dashboard hallucination or generic SaaS template.",
      "Use crisp edges, coherent alignment, restrained visual language, consistent component geometry and realistic whitespace. Keep the composition readable at desktop scale.",
      "Do not add Avantiqo branding unless the project itself is Avantiqo.",
      "Do not invent logos. Use only minimal abstract placeholder copy where text would otherwise become garbled; prioritize layout fidelity over readable generated text.",
      latestUser ? `User direction: ${latestUser}` : "",
      latestAssistant ? `Code conclusion: ${latestAssistant}` : "",
      latestVisual ? `Visual structure: ${latestVisual.title || ""}. ${(latestVisual.nodes || []).map((node) => node.label).filter(Boolean).join(", ")}.` : "",
    ].filter(Boolean).join(" ");

    setImageBusy(true);
    setError(null);
    const imageStartedAt = Date.now();
    setChatTurns((current) => [...current, {
      id: pendingId,
      role: "image_pending",
      content: "Code is generating this image on Node01…",
      estimated_progress: 5,
      progress_stage: "Queued on Node01",
      elapsed_seconds: 0,
    }]);

    try {
      const usageId = `code-studio-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const submit = await fetch("/api/operator/code/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          organizationId,
          usage_id: usageId,
          prompt,
          width: 768,
          height: 1024,
          steps: 8,
          cfg_scale: 1.0,
          repository_url: session?.repository_url || repositoryUrl.trim() || null,
          device_session_id: session?.session_id || null,
        }),
      });
      const submitted = await submit.json().catch(() => ({}));
      const providerJobId = submitted?.output?.provider_job_id;
      if (!submit.ok || submitted?.success !== true || !providerJobId) {
        throw new Error(submitted?.error || "Code image generation failed to queue");
      }
      setChatTurns((current) => current.map((turn) => turn.id === pendingId ? {
        ...turn,
        provider_job_id: providerJobId,
        compute_status: "queued",
        progress_stage: "Queued for Node01",
      } : turn));

      let completed = null;
      for (let attempt = 0; attempt < 192; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - imageStartedAt) / 1000));
        const estimatedProgress = Math.min(94, Math.max(8, Math.round(8 + attempt * 2.4)));
        const statusResponse = await fetch(`/api/operator/code/image?organizationId=${encodeURIComponent(organizationId)}&jobId=${encodeURIComponent(providerJobId)}`, {
          credentials: "same-origin",
        });
        const statusBody = await statusResponse.json().catch(() => ({}));
        const computeStatus = text(statusBody?.status).toLowerCase() || "queued";
        setChatTurns((current) => current.map((turn) => turn.id === pendingId ? {
          ...turn,
          estimated_progress: estimatedProgress,
          progress_stage: computeStatus === "processing"
            ? (estimatedProgress < 72 ? "Rendering on Node01" : "Refining image")
            : "Queued for Node01",
          elapsed_seconds: elapsedSeconds,
          compute_status: computeStatus,
          compute_node_id: statusBody?.node_id || null,
        } : turn));
        if (!statusResponse.ok || statusBody?.success !== true) {
          throw new Error(statusBody?.error || "Code image status failed");
        }
        if (statusBody.status === "completed" && statusBody.output?.asset_url) {
          completed = statusBody;
          break;
        }
        if (statusBody.status === "cancelled") {
          setChatTurns((current) => current.map((turn) => turn.id === pendingId ? {
            ...turn,
            role: "image_cancelled",
            content: "Image generation stopped",
            progress_stage: "Stopped",
            compute_status: "cancelled",
            cancel_requested: false,
          } : turn));
          return;
        }
        if (statusBody.status === "failed") {
          const failure = text(statusBody.error) || "Code image generation failed";
          if (/CANCELLED_BY_CALLER|CANCELLED/i.test(failure)) {
            setChatTurns((current) => current.map((turn) => turn.id === pendingId ? {
              ...turn,
              role: "image_cancelled",
              content: "Image generation stopped",
              progress_stage: "Stopped",
              compute_status: "cancelled",
              cancel_requested: false,
            } : turn));
            return;
          }
          throw new Error(failure);
        }
      }
      if (!completed) throw new Error("Code image generation timed out");

      setChatTurns((current) => current.map((turn) => turn.id === pendingId ? {
        id: pendingId,
        role: "image",
        content: "Generated locally on Node01",
        asset_url: completed.output.asset_url,
        storage_reference: completed.output.storage_reference,
        estimated_progress: 100,
        progress_stage: "Ready",
        elapsed_seconds: Math.max(0, Math.floor((Date.now() - imageStartedAt) / 1000)),
        image_meta: {
          width: completed.output.width,
          height: completed.output.height,
          model: completed.output.runtime_model,
          quantization: completed.output.quantization,
          inference_seconds: completed.output.inference_seconds,
          node_id: completed.output.node_id,
        },
      } : turn));
    } catch (imageError) {
      setError(imageError.message);
      setChatTurns((current) => current.map((turn) => turn.id === pendingId ? {
        id: pendingId,
        role: "image_error",
        content: `Image failed: ${imageError.message}`,
      } : turn));
    } finally {
      setImageBusy(false);
    }
  }

  async function closeWorkspace() {
    if (!session) return;
    try { await ideRequest("close"); } catch {}
    localStorage.removeItem(`avantiqo:code-ide:${organizationId}`);
    pendingSteerRef.current = [];
    setSession(null); setFiles([]); setExpandedFolders(new Set()); setTabs([]); setActivePath(""); setBuffers({}); setDirty({}); setDiffText(""); setLeaseOwner(null); setConversationPendingCount(0); setMissionRunning(false); setMissionResult(null); setActivityBaselineAt(0); setStatus("Developer workspace closed");
  }

  function closeTab(filePath) {
    const next = tabs.filter((tab) => tab !== filePath);
    setTabs(next);
    if (activePath === filePath) setActivePath(next.at(-1) || "");
  }

  function toggleFolder(folderPath) {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });
  }

  function renderExplorerNodes(nodes, depth = 0) {
    return nodes.map((node) => {
      if (node.type === "folder") {
        const open = filterActive || expandedFolders.has(node.path);
        return (
          <div key={node.path}>
            <button
              type="button"
              onClick={() => toggleFolder(node.path)}
              className="flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left text-[11px] text-white/52 hover:bg-white/[0.035] hover:text-white/72"
              style={{ paddingLeft: `${8 + depth * 12}px` }}
              title={node.path}
            >
              {open ? <ChevronDown size={11} className="shrink-0 text-white/28"/> : <ChevronRight size={11} className="shrink-0 text-white/28"/>}
              {open ? <FolderOpen size={12} className="shrink-0 text-[#D6A66A]/60"/> : <Folder size={12} className="shrink-0 text-[#D6A66A]/48"/>}
              <span className="min-w-0 flex-1 truncate">{node.name}</span>
              <span className="shrink-0 text-[9px] tabular-nums text-white/18">{node.fileCount}</span>
            </button>
            {open ? renderExplorerNodes(node.children, depth + 1) : null}
          </div>
        );
      }
      return (
        <button
          key={node.path}
          type="button"
          data-code-explorer-path={node.path}
          onClick={() => openFile(node.path)}
          className={`flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left text-[11px] ${activePath === node.path ? "bg-[#D6A66A]/10 text-[#e7c497]" : "text-white/42 hover:bg-white/[0.035] hover:text-white/65"}`}
          style={{ paddingLeft: `${22 + depth * 12}px` }}
          title={node.path}
        >
          <FileCode2 size={11} className="shrink-0"/>
          {latestTouchedFile === node.path ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#D6A66A]" title="Code touched this file"/> : null}
          <span className="truncate">{node.name}</span>
        </button>
      );
    });
  }

  const talkOnly = embedded && studioView === "talk";
  const codeOnly = embedded && studioView === "code";
  const humanEditLocked = leaseOwner === "CODE" || ((missionRunning || Boolean(currentActiveMissionId)) && leaseOwner !== "HUMAN");
  const diskPressure = text(deviceHealth?.disk_pressure).toUpperCase();
  const diskFreeGb = Number.isFinite(Number(deviceHealth?.disk_free_bytes)) ? Number(deviceHealth.disk_free_bytes) / (1024 ** 3) : null;
  const missionState = missionResult?.state || missionResult?.resume_state || null;
  const precision = missionResult?.engineering_precision_os || missionState?.engineering_precision_os || null;
  const engineering = missionResult?.engineering_operating_system || missionState?.engineering_operating_system || null;
  const latestAssistantReply = [...chatTurns].reverse().find((turn) => turn?.role === "assistant")?.content || null;
  const latestActivity = activityEvents[0] || null;
  const latestProblem = activityEvents.find((event) => event?.verification_passed === false || /fail|block|repair|required|error/i.test(text(event?.status || event?.reason || event?.description))) || null;
  const latestChange = activityEvents.find((event) => text(event?.action).toUpperCase() === "APPLY_FILES" || Array.isArray(event?.files_changed) && event.files_changed.length) || null;
  const cockpitChecking = latestActivity
    ? text(latestActivity?.description || latestActivity?.reason || latestActivity?.operation_id || latestActivity?.status) || "Working"
    : currentActiveMissionId
      ? statusLabel(scopedProgress) || "Working"
      : missionRunning
        ? "Starting work"
      : "Waiting for new mission activity";
  const cockpitProblem = latestProblem ? text(latestProblem?.description || latestProblem?.reason || latestProblem?.status) : "No current blocker proven";
  const cockpitChanged = latestChange ? text(latestChange?.files_changed?.[0] || latestChange?.description || "Workspace changed") : "No verified change yet";
  const cockpitResponsibility = missionRunning || Boolean(currentActiveMissionId)
    ? latestProblem ? "Code owns this blocker and must repair it before completion." : "Code owns this mission until verification and the owner objective both pass."
    : /completed/i.test(text(missionResult?.status || missionState?.status))
      ? "Code has finished this mission with verification evidence."
      : "Code remains responsible for any work it starts until it is verified or explicitly stopped.";

  return (
    <div className={`avantiqo-code-ide ${embedded ? "min-h-0" : "min-h-screen"} ${talkOnly ? "bg-[#F4F7F9] text-[#172026]" : "bg-[#F4EFE7] text-[#241F1A]"}`}>
      <header className={talkOnly ? "hidden" : "border-b border-white/[0.07] bg-black/45 px-4 py-3 backdrop-blur-xl"}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-medium"><Code2 size={16} className="text-[#D6A66A]"/> Avantiqo Code IDE</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/30">Developer Mode</div>
          <div className="ml-auto flex items-center gap-2 text-[10px] text-white/40">
            {session && codeOnly ? <><span className="font-mono">rev {revision}</span><span className={leaseOwner === "CODE" ? "text-[#D6A66A]" : leaseOwner === "HUMAN" ? "text-emerald-200/70" : "text-white/30"}>{leaseOwner ? `${leaseOwner} editing` : "unlocked"}</span><button type="button" onClick={() => setFollowCode((value) => !value)} className={`rounded-md border px-2 py-1 ${followCode ? "border-[#D6A66A]/35 bg-[#D6A66A]/10 text-[#e7c497]" : "border-white/10 text-white/35"}`}><MonitorPlay size={10} className="mr-1 inline"/> Follow Code {followCode ? "on" : "off"}</button><button type="button" onClick={() => setLearnMode((value) => !value)} className={`rounded-md border px-2 py-1 ${learnMode ? "border-emerald-300/25 bg-emerald-300/[0.06] text-emerald-100/70" : "border-white/10 text-white/35"}`}><Braces size={10} className="mr-1 inline"/> Learn {learnMode ? "on" : "off"}</button>{stopMissionId ? <button type="button" onClick={() => stopLiveMission(stopMissionId).catch((stopError) => setError(stopError.message))} className="rounded-md border border-red-300/20 bg-red-300/[0.04] px-2 py-1 text-red-200/70"><CircleStop size={10} className="mr-1 inline"/> Stop mission</button> : null}</> : null}
            {!embedded ? <Link href={`/workspace/${organizationId}/creative/code`} className="rounded-md border border-white/10 px-2 py-1 hover:border-[#D6A66A]/35">Code Studio</Link> : null}
          </div>
        </div>
      </header>

      {!session && !talkOnly ? (
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 shadow-2xl">
            <div className="mb-6 max-w-2xl"><div className="text-xl font-light">Open a developer workspace</div><p className="mt-2 text-sm leading-6 text-white/40">A persistent isolated worktree on the selected connected computer. Human and Code share the same revision, terminal, diff and browser evidence.</p></div>
            <div className="grid gap-3 md:grid-cols-[1.5fr_.6fr_1fr_auto]">
              <input value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} className="rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-xs text-white/70 outline-none focus:border-[#D6A66A]/45" placeholder="Repository URL" />
              <input value={ref} onChange={(event) => setRef(event.target.value)} className="rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-xs text-white/70 outline-none focus:border-[#D6A66A]/45" placeholder="main" />
              <select value={deviceId} onChange={(event) => setDeviceId(event.target.value)} className="rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-xs text-white/70 outline-none focus:border-[#D6A66A]/45"><option value="">Select computer</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.display_name || device.id}{device.online ? " · online" : " · offline"}</option>)}</select>
              <button type="button" onClick={openWorkspace} disabled={opening || !deviceId || !repositoryUrl.trim()} className="rounded-lg border border-[#D6A66A]/40 bg-[#D6A66A]/10 px-4 py-2 text-xs text-[#e7c497] disabled:opacity-30">{opening ? "Opening…" : "Open IDE"}</button>
            </div>
            {error ? <div className="mt-4 text-xs text-red-200/70">{error}</div> : null}
          </div>
        </div>
      ) : (
        <div className={talkOnly ? "grid min-h-[720px] grid-cols-[minmax(0,1fr)] overflow-hidden" : "relative grid min-h-[calc(100vh-57px)] grid-cols-[220px_minmax(0,1fr)_300px] grid-rows-[minmax(0,1fr)_230px] overflow-hidden"}>
          {codeOnly && ["LOW", "CRITICAL"].includes(diskPressure) ? <div className={`absolute left-[232px] right-[312px] top-2 z-30 flex items-center gap-2 rounded-lg border px-3 py-2 text-[10px] shadow-lg backdrop-blur ${diskPressure === "CRITICAL" ? "border-red-300/25 bg-red-950/85 text-red-100/80" : "border-[#D6A66A]/30 bg-[#1a130c]/90 text-[#e7c497]/80"}`}><HardDrive size={12}/><span className="font-semibold">{diskPressure === "CRITICAL" ? "Developer disk critically low" : "Developer disk space low"}</span><span className="text-white/45">{diskFreeGb == null ? "Free space is below the safe threshold." : `${diskFreeGb.toFixed(1)} GB free`}</span><span className="ml-auto text-white/30">Free space before long builds to avoid local server/cache failures.</span></div> : null}
          <aside className={codeOnly ? "row-span-2 border-r border-white/[0.07] bg-[#0b0b0b]" : "hidden"}>
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-white/35">
              <Files size={12}/>
              <span>Explorer</span>
              <span className="ml-auto normal-case tracking-normal text-white/20">{files.length} files</span>
            </div>
            <div className="border-b border-white/[0.05] p-2">
              <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter files or paths" className="w-full rounded-md border border-white/[0.08] bg-black/30 px-2.5 py-1.5 text-[11px] text-white/65 outline-none focus:border-[#D6A66A]/35" />
              <div className="mt-1.5 flex items-center gap-1 text-[9px] text-white/24">
                <button type="button" onClick={() => setExpandedFolders(new Set(explorerFolderPaths))} className="rounded px-1.5 py-0.5 hover:bg-white/[0.04] hover:text-white/45">Expand all</button>
                <span>·</span>
                <button type="button" onClick={() => setExpandedFolders(new Set())} className="rounded px-1.5 py-0.5 hover:bg-white/[0.04] hover:text-white/45">Collapse all</button>
                {filterActive ? <span className="ml-auto">{explorerPaths.length} matches</span> : null}
              </div>
            </div>
            <div ref={explorerRef} className="h-[calc(100vh-169px)] overflow-auto px-1 pb-4">
              {explorerTree.length ? renderExplorerNodes(explorerTree) : <div className="px-3 py-4 text-[11px] text-white/25">No matching files</div>}
            </div>
          </aside>

          <main className={codeOnly ? "min-w-0 bg-[#090909]" : "hidden"}>
            <div className="flex h-9 items-center overflow-x-auto border-b border-white/[0.07] bg-[#0d0d0d]">{tabs.map((tab) => <div key={tab} className={`flex h-full min-w-0 max-w-[240px] items-center gap-2 border-r border-white/[0.06] px-3 text-[11px] ${activePath === tab ? "bg-[#080808] text-white/70" : "text-white/35"}`}><button type="button" onClick={() => setActivePath(tab)} className="min-w-0 truncate">{tab.split("/").at(-1)}{dirty[tab] ? " •" : ""}</button><button type="button" onClick={() => closeTab(tab)} className="text-white/20 hover:text-white/60"><X size={11}/></button></div>)}</div>
            {latestTouchedFile && followCode ? <div className="flex h-8 items-center gap-2 border-b border-[#D6A66A]/15 bg-[#D6A66A]/[0.045] px-3 text-[10px]"><span className="h-1.5 w-1.5 rounded-full bg-[#D6A66A]"/><span className="font-semibold text-[#e7c497]/80">{latestFileAction}</span><span className="min-w-0 truncate font-mono text-white/45">{latestTouchedFile}</span>{latestFocusStartLine ? <span className="ml-auto font-mono text-white/25">L{latestFocusStartLine}{latestFocusEndLine && latestFocusEndLine !== latestFocusStartLine ? `–${latestFocusEndLine}` : ""}</span> : <span className="ml-auto text-white/20">following Code live</span>}</div> : null}
            {activeBuffer ? <MonacoEditor height={latestTouchedFile && followCode ? "calc(100vh - 358px)" : "calc(100vh - 326px)"} language={languageFor(activePath)} path={activePath} value={activeBuffer.content} onMount={(editor) => { editorRef.current = editor; editorCodeFocusRef.current = editor.createDecorationsCollection(); }} onChange={(value) => { setBuffers((current) => ({ ...current, [activePath]: { ...current[activePath], content: value ?? "" } })); setDirty((current) => ({ ...current, [activePath]: true })); if (leaseOwner !== "HUMAN") ensureHumanLease().catch((leaseError) => setError(leaseError.message)); }} theme="vs" options={{ fontSize: 12, readOnly: humanEditLocked, minimap: { enabled: true }, smoothScrolling: true, automaticLayout: true, wordWrap: "off", renderWhitespace: "selection", bracketPairColorization: { enabled: true } }} /> : <div className={`flex ${latestTouchedFile && followCode ? "h-[calc(100vh-358px)]" : "h-[calc(100vh-326px)]"} items-center justify-center text-sm text-white/20`}>Open a file from Explorer</div>}
            <div className="flex h-9 items-center gap-2 border-t border-white/[0.06] bg-[#0c0c0c] px-3"><button type="button" onClick={saveActive} disabled={!activePath || !dirty[activePath] || saving || humanEditLocked} className="flex items-center gap-1.5 rounded border border-white/10 px-2 py-1 text-[10px] text-white/50 disabled:opacity-25"><Save size={11}/> Save</button>{leaseOwner === "HUMAN" ? <button type="button" onClick={handBackToCode} disabled={handingBackToCode || Object.values(dirty).some(Boolean)} className="flex items-center gap-1.5 rounded border border-emerald-300/20 bg-emerald-300/[0.05] px-2 py-1 text-[10px] text-emerald-100/70 disabled:opacity-25"><Bot size={11}/>{handingBackToCode ? "Handing back…" : "Hand back to Code"}</button> : <button type="button" onClick={takeHumanControl} disabled={takingHumanControl} className="flex items-center gap-1.5 rounded border border-[#D6A66A]/25 bg-[#D6A66A]/[0.05] px-2 py-1 text-[10px] text-[#e7c497]/75 disabled:opacity-25"><UserRound size={11}/>{takingHumanControl ? "Taking control…" : "Take control"}</button>}<button type="button" onClick={refreshDiff} className="flex items-center gap-1.5 rounded border border-white/10 px-2 py-1 text-[10px] text-white/50"><RefreshCw size={11}/> Diff</button>{humanEditLocked ? <span className="rounded border border-[#D6A66A]/15 bg-[#D6A66A]/[0.04] px-2 py-1 text-[9px] text-[#e7c497]/55">AI owns editor · read only</span> : leaseOwner === "HUMAN" ? <span className="rounded border border-emerald-300/15 bg-emerald-300/[0.04] px-2 py-1 text-[9px] text-emerald-100/55">Human owns editor</span> : null}<span className="ml-auto truncate text-[10px] text-white/30">{status}</span></div>
          </main>

          <aside className={talkOnly ? "min-w-0 bg-[#F4F7F9]" : "row-span-2 border-l border-white/[0.07] bg-[#0b0b0b]"}>
            <div className={talkOnly ? "p-5 md:p-6" : "border-b border-white/[0.06] p-3"}>
              <div className={talkOnly ? "flex items-center gap-2 text-[11px] font-medium text-slate-700" : "flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-white/35"}><Bot size={12}/>{talkOnly ? "Talk with Code" : "Code AI · Live"}</div>
              {codeOnly ? <div className="mt-3 rounded-lg border border-white/[0.06] bg-black/20 p-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] uppercase tracking-[0.12em] text-white/25">Conversation context</span>
                  <button type="button" onClick={() => typeof onStudioViewChange === "function" && onStudioViewChange("talk")} className="ml-auto rounded-md border border-white/[0.07] px-2 py-1 text-[8px] text-white/35 hover:text-white/60">Open full Talk</button>
                </div>
                <div className="mt-2 max-h-40 space-y-1.5 overflow-auto">
                  {chatTurns.filter((turn) => ["user","assistant","design_preview","visual","image"].includes(turn?.role)).slice(-6).map((turn,index) => {
                    const label = turn.role === "user" ? "You" : turn.role === "assistant" ? "Code" : turn.role === "design_preview" ? "Design" : turn.role === "visual" ? "Visual" : "Image";
                    const summary = turn.role === "design_preview"
                      ? turn.preview?.title || turn.content || "Design preview"
                      : turn.role === "visual"
                        ? turn.artifact?.title || turn.content || "Visual conclusion"
                        : turn.role === "image"
                          ? "Generated visual reference"
                          : turn.content;
                    return <div key={turn.id || `code-context-${index}`} className="rounded-md border border-white/[0.05] bg-white/[0.02] px-2 py-1.5">
                      <div className="text-[8px] uppercase tracking-[0.09em] text-[#D6A66A]/55">{label}</div>
                      <div className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-white/42">{summary}</div>
                    </div>;
                  })}
                  {!chatTurns.length ? <div className="py-2 text-[10px] text-white/22">No Talk context yet.</div> : null}
                  {liveTalkActive && talkActivityNarration.length ? <div className="mt-2 border-t border-white/[0.06] pt-2">
                    <div className="mb-1.5 flex items-center gap-2 text-[8px] uppercase tracking-[0.1em] text-[#D6A66A]/60"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#D6A66A]"/>Live work</div>
                    <div className="space-y-1.5">{talkActivityNarration.slice(-6).map((entry, activityIndex) => <button key={entry.key || activityIndex} type="button" onClick={() => entry.event?.file_path && openFile(entry.event.file_path)} disabled={!entry.event?.file_path} className="block w-full rounded-md border border-white/[0.05] bg-white/[0.02] px-2 py-1.5 text-left disabled:cursor-default">
                      <div className="text-[10px] leading-4 text-white/48">{entry.content}</div>
                      {entry.event?.file_path ? <div className="mt-0.5 truncate font-mono text-[8px] text-[#D6A66A]/55">{entry.event.file_path}{entry.event?.start_line ? `:${entry.event.start_line}` : ""}</div> : null}
                    </button>)}</div>
                  </div> : null}
                </div>
              </div> : null}
              {talkOnly ? <>
                <div className="mt-3 flex items-center gap-2 px-1 text-[11px] text-slate-400">
                  <span className="text-slate-600">Talk naturally.</span>
                  <span>Code, visuals, research and verification are available behind the conversation when needed.</span>
                </div>
                <div
                  ref={talkFeedRef}
                  onScroll={(event) => {
                    const element = event.currentTarget;
                    talkFeedPinnedRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 72;
                  }}
                  className={talkOnly ? "mt-3 h-[min(58vh,620px)] min-h-[320px] w-full min-w-0 max-w-full space-y-1 overflow-x-hidden overflow-y-auto overscroll-contain px-2 py-1 [scrollbar-gutter:stable]" : "mt-3 h-[min(52vh,520px)] min-h-[260px] space-y-2 overflow-y-auto overscroll-contain rounded-xl border border-white/[0.055] bg-black/20 p-3 [scrollbar-gutter:stable]"}
                >{visibleChatTurns.length ? visibleChatTurns.map((turn, index) => {
                  if (turn.role === "visual_error" || turn.role === "image_error") return null;
                  if (turn.role === "assistant_pending") {
                    return <div key={turn.id || `assistant-pending-${index}`} className="max-w-[92%] py-3 text-sm leading-7 text-slate-500">
                      <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#D6A66A] align-middle"/>
                      <span>Thinking…</span>
                    </div>;
                  }
                  if (turn.role === "design_error") {
                    const percent = Math.max(0, Math.min(94, Number(turn.estimated_progress || 0)));
                    return <div key={turn.id || `design-error-${index}`} className="mr-6 rounded-xl border border-red-300/20 bg-red-950/[0.08] px-3 py-3">
                      <div className="flex items-center gap-2 text-[11px] text-red-200/75"><RefreshCw size={11}/><span>{turn.progress_stage || "Render interrupted"}</span><span className="ml-auto font-mono text-red-200/55">~{percent}%</span></div>
                      <div className="relative mt-3 overflow-hidden rounded-lg border border-white/[0.08] bg-[#F4EFE7] p-2.5 opacity-80">
                        <div className="absolute inset-0 z-10 bg-white/25 backdrop-blur-[6px]"/>
                        <div className="relative z-20 flex min-h-[190px] flex-col items-center justify-center text-center"><div className="rounded-full border border-red-300/25 bg-white/75 px-3 py-1.5 text-[10px] font-medium text-red-700/75">Render stopped</div><div className="mt-2 max-w-md text-[10px] leading-4 text-black/45">{turn.error_message || turn.content}</div></div>
                        <div className="space-y-2 blur-[5px]"><div className="h-3 w-24 rounded bg-black/15"/><div className="grid grid-cols-[1.15fr_.85fr] gap-2"><div className="h-28 rounded-md bg-white"/><div className="h-28 rounded-md bg-black/10"/></div><div className="grid grid-cols-3 gap-2">{[0,1,2].map((item)=><div key={item} className="h-16 rounded-md bg-white"/>)}</div></div>
                      </div>
                    </div>;
                  }
                  if (turn.role === "design_pending") {
                    return <div key={turn.id || `design-pending-${index}`} className="mr-10 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                      <RefreshCw size={12} className="animate-spin text-[#D6A66A]"/>
                      <span>{turn.progress_stage || "Preparing visual..."}</span>
                    </div>;
                  }
                  if (turn.role === "visual_pending") {
                    return <div key={turn.id || `visual-pending-${index}`} className="mr-10 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                      <RefreshCw size={12} className="animate-spin text-[#D6A66A]"/>
                      <span>{turn.progress_stage || "Preparing visual..."}</span>
                    </div>;
                  }
                  if (turn.role === "image_pending") {
                    return <div key={turn.id || `image-pending-${index}`} className="mr-10 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                      <div className="flex items-center gap-2">
                        <RefreshCw size={12} className="animate-spin text-[#D6A66A]"/>
                        <span>{turn.compute_status === "processing" ? "Generating image..." : turn.progress_stage || "Preparing image..."}</span>
                        {turn.provider_job_id ? <button type="button" onClick={() => cancelImageGeneration(turn.id, turn.provider_job_id)} disabled={turn.cancel_requested === true} className="ml-auto rounded-lg border border-red-200 px-2 py-1 text-[10px] font-medium text-red-500 disabled:opacity-35">{turn.cancel_requested ? "Stopping..." : "Stop"}</button> : null}
                      </div>
                    </div>;
                  }
                  if (turn.role === "design_preview" && turn.preview?.schema) {
                    return <div key={turn.id || `design-${index}`} className="mr-2">
                      <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
                        <span className="text-[10px] font-medium text-slate-600">{turn.preview.title || "Design preview"}</span>
                        {turn.preview?.research_applied ? <span className="text-[9px] text-black/35">external research · {Array.isArray(turn.preview?.schema?.research_sources) ? turn.preview.schema.research_sources.length : 0} sources</span> : null}
                        {turn.preview?.schema?.experience_kind ? <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[8px] font-medium text-slate-500">{String(turn.preview.schema.experience_kind).replaceAll("-", " ")}</span> : null}
                        <span className="font-mono text-[9px] text-emerald-700/70">100% · ready</span>
                        <span className="text-[9px] text-black/35">{turn.hero_image_status === "generating" ? "fast hero draft rendering…" : turn.hero_image_status === "ready" ? "hero draft ready · refined imagery after selection" : "controlled render · refined imagery after selection"} · repository unchanged</span>
                        <div className="ml-auto flex gap-1.5">
                          <button type="button" onClick={() => typeof onStudioViewChange === "function" && onStudioViewChange("code")} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[9px] font-medium text-slate-600 shadow-sm">Open in Code</button>
                        </div>
                      </div>
                      {Array.isArray(turn.preview?.schema?.design_directions) && turn.preview.schema.design_directions.length ? (
                        <div>
                          <div className="mb-2 flex items-center gap-2 px-1">
                            <span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-black/30">3 researched digital experience ideas</span>
                          </div>
                          <div className="mx-auto grid w-full max-w-[1020px] grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {turn.preview.schema.design_directions.slice(0, 3).map((direction, directionIndex) => {
                            const directionServices = Array.isArray(direction?.services) && direction.services.length === 3
                              ? direction.services
                              : turn.preview.schema.services;
                            const directionStats = Array.isArray(direction?.stats) && direction.stats.length === 3
                              ? direction.stats
                              : turn.preview.schema.stats;
                            const directionSchema = {
                              ...turn.preview.schema,
                              concept_name: direction?.name || `Direction ${directionIndex + 1}`,
                              design_directions: [direction],
                              selected_direction: 0,
                              headline: direction?.headline || turn.preview.schema.headline,
                              subheadline: direction?.subheadline || turn.preview.schema.subheadline,
                              primary_cta: direction?.primary_cta || turn.preview.schema.primary_cta,
                              secondary_cta: direction?.secondary_cta || turn.preview.schema.secondary_cta,
                              trust_line: direction?.trust_line || turn.preview.schema.trust_line,
                              services_title: direction?.services_title || turn.preview.schema.services_title,
                              services_intro: direction?.services_intro || turn.preview.schema.services_intro,
                              services: directionServices,
                              proof_title: direction?.proof_title || turn.preview.schema.proof_title,
                              proof_body: direction?.proof_body || turn.preview.schema.proof_body,
                              stats: directionStats,
                              closing_title: direction?.closing_title || turn.preview.schema.closing_title,
                              closing_body: direction?.closing_body || turn.preview.schema.closing_body,
                              hero_image_brief: direction?.hero_image_brief || turn.preview.schema.hero_image_brief,
                              hero_layout: direction?.hero_layout || turn.preview.schema.hero_layout,
                              section_rhythm: direction?.section_rhythm || turn.preview.schema.section_rhythm,
                              shape_language: direction?.shape_language || turn.preview.schema.shape_language,
                              typography_character: direction?.typography_character || turn.preview.schema.typography_character,
                              color_direction: direction?.color_direction || turn.preview.schema.color_direction,
                              imagery_strategy: direction?.imagery_strategy || turn.preview.schema.imagery_strategy,
                              section_sequence: Array.isArray(direction?.section_sequence) && direction.section_sequence.length ? direction.section_sequence : turn.preview.schema.section_sequence,
                              services_presentation: direction?.services_presentation || turn.preview.schema.services_presentation,
                              proof_presentation: direction?.proof_presentation || turn.preview.schema.proof_presentation,
                              cta_presentation: direction?.cta_presentation || turn.preview.schema.cta_presentation,
                              nav_style: direction?.nav_style || turn.preview.schema.nav_style,
                              composition_shell: direction?.composition_shell || turn.preview.schema.composition_shell,
                              navigation_mode: direction?.navigation_mode || turn.preview.schema.navigation_mode,
                              information_density: direction?.information_density || turn.preview.schema.information_density,
                              module_sequence: Array.isArray(direction?.module_sequence) && direction.module_sequence.length ? direction.module_sequence : turn.preview.schema.module_sequence,
                              navigation_items: Array.isArray(direction?.navigation_items) && direction.navigation_items.length ? direction.navigation_items : turn.preview.schema.navigation_items,
                              layout_graph: Array.isArray(direction?.layout_graph) && direction.layout_graph.length ? direction.layout_graph : turn.preview.schema.layout_graph,
                              style_dna: direction?.style_dna || turn.preview.schema.style_dna,
                              imagery_role: direction?.imagery_role || turn.preview.schema.imagery_role,
                              interaction_pattern: direction?.interaction_pattern || turn.preview.schema.interaction_pattern,
                            };
                            const directionTurn = {
                              ...turn,
                              preview: {
                                ...turn.preview,
                                title: direction?.name || `Direction ${directionIndex + 1}`,
                                schema: directionSchema,
                              },
                            };
                            return <div key={(turn.id || "design") + "-direction-preview-" + directionIndex} className="min-w-0 overflow-hidden rounded-xl border border-black/10 bg-white shadow-[0_10px_28px_rgba(0,0,0,0.055)]">
                              <div className="flex min-h-[58px] items-start gap-2 border-b border-black/8 bg-white px-2.5 py-2">
                                <div>
                                  <div className="text-[11px] font-semibold text-black/75">{String(directionIndex + 1).padStart(2, "0")} · {direction?.name || `Direction ${directionIndex + 1}`}</div>
                                  {direction?.rationale ? <div className="mt-0.5 line-clamp-1 text-[8px] leading-3 text-black/38">{direction.rationale}</div> : null}
                                </div>
                                <div className="ml-auto flex shrink-0 items-center gap-1">
                                  <span className="hidden rounded-full border border-black/10 px-1.5 py-0.5 text-[7px] text-black/35 xl:inline">{direction?.hero_layout || "dynamic"}</span>
                                  {turn.direction_image_statuses?.[directionIndex] === "reviewing" ? <span className="rounded-full border border-amber-500/20 bg-amber-50 px-2 py-1 text-[8px] text-amber-700">visual review…</span> : null}
                                  {turn.direction_image_statuses?.[directionIndex] === "repairing" ? <span className="rounded-full border border-amber-500/20 bg-amber-50 px-2 py-1 text-[8px] text-amber-700">repairing image…</span> : null}
                                  {turn.direction_image_statuses?.[directionIndex] === "stopping" ? <span className="rounded-full border border-red-500/20 bg-red-50 px-2 py-1 text-[8px] text-red-700">stopping…</span> : null}
                                  {turn.direction_image_statuses?.[directionIndex] === "stopped" ? <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-[8px] text-slate-500">stopped</span> : null}
                                  {turn.direction_image_reviews?.[directionIndex] ? <span className={`rounded-full border px-2 py-1 text-[8px] ${turn.direction_image_reviews[directionIndex]?.passed ? "border-emerald-500/20 bg-emerald-50 text-emerald-700" : "border-red-500/20 bg-red-50 text-red-700"}`}>{turn.direction_image_reviews[directionIndex]?.passed ? "vision passed" : "needs review"} · {Math.round(Number(turn.direction_image_reviews[directionIndex]?.score || 0))}/100</span> : null}
                                  {turn.direction_image_job_ids?.[directionIndex] ? <button type="button" onClick={() => cancelDesignPreviewAsset(turn.id, directionIndex, turn.direction_image_job_ids[directionIndex])} disabled={turn.direction_image_cancel_requested?.[directionIndex] === true} className="rounded-md border border-red-300/30 bg-red-50 px-2 py-1 text-[8px] font-semibold text-red-700 disabled:opacity-35">{turn.direction_image_cancel_requested?.[directionIndex] ? "Stopping…" : "Stop image"}</button> : null}
                                  <button type="button" onClick={() => buildVisualConclusion(directionTurn)} disabled={missionRunning || Boolean(currentActiveMissionId) || Object.values(dirty).some(Boolean)} className="rounded-md border border-black/12 bg-black px-2 py-1 text-[8px] font-semibold text-white disabled:opacity-35">Use idea</button>
                                </div>
                              </div>
                              <div className="relative h-[360px] w-full overflow-hidden">
                                  <DesignPreviewRenderer
                                    compact
                                    schema={directionSchema}
                                    heroImageUrl={turn.direction_image_urls?.[directionIndex] || null}
                                    supportImageUrl={null}
                                    heroImageStatus={turn.direction_image_statuses?.[directionIndex] || null}
                                    supportImageStatus={turn.support_image_status || null}
                                    heroImageProgress={turn.direction_image_progress?.[directionIndex] || 0}
                                    supportImageProgress={turn.support_image_progress || 0}
                                    heroImageElapsedSeconds={turn.direction_image_elapsed_seconds?.[directionIndex] || 0}
                                    supportImageElapsedSeconds={turn.support_image_elapsed_seconds || 0}
                                  />
                              </div>
                            </div>;
                          })}
                          </div>
                        </div>
                      ) : (
                        <DesignPreviewRenderer
                          schema={turn.preview.schema}
                          heroImageUrl={turn.hero_image_url || null}
                          supportImageUrl={turn.support_image_url || null}
                          heroImageStatus={turn.hero_image_status || null}
                          supportImageStatus={turn.support_image_status || null}
                          heroImageProgress={turn.hero_image_progress || 0}
                          supportImageProgress={turn.support_image_progress || 0}
                          heroImageElapsedSeconds={turn.hero_image_elapsed_seconds || 0}
                          supportImageElapsedSeconds={turn.support_image_elapsed_seconds || 0}
                        />
                      )}
                      {turn.preview.summary ? <div className="mt-2 px-1 text-[9px] leading-4 text-black/35">{turn.preview.summary}</div> : null}
                    </div>;
                  }
                  if (turn.role === "image" && turn.asset_url) {
                    return <div key={turn.id || `image-${index}`} className="mr-4 overflow-hidden rounded-xl border border-[#D6A66A]/20 bg-black/25">
                      <div className="relative w-full max-w-[720px] bg-black/20" style={{ aspectRatio: `${turn.image_meta?.width || 768} / ${turn.image_meta?.height || 1024}` }}>
                        <Image src={turn.asset_url} alt="Code generated project visual" fill sizes="(max-width: 768px) 100vw, 720px" className="object-contain"/>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-3 py-2 text-[9px] text-white/28">
                        <span className="text-[#D6A66A]/60">Node01 image</span>
                        <span>{turn.image_meta?.model || "local image engine"}</span>
                        {turn.image_meta?.quantization ? <span>· {turn.image_meta.quantization}</span> : null}
                        {turn.image_meta?.inference_seconds ? <span className="ml-auto">{Number(turn.image_meta.inference_seconds).toFixed(1)}s</span> : null}
                      </div>
                    </div>;
                  }
                  if (turn.role === "visual" && turn.artifact) {
                    const artifact = turn.artifact;
                    return <div key={`visual-${index}`} className="mr-4 rounded-xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.035] p-3">
                      <div className="flex flex-wrap items-center gap-2"><Braces size={12} className="text-[#D6A66A]/65"/><div className="text-[9px] uppercase tracking-[0.14em] text-[#D6A66A]/55">Visual thinking</div><div className="rounded-full border border-white/[0.07] px-2 py-0.5 text-[8px] uppercase tracking-[0.08em] text-white/25">{text(artifact.kind).replaceAll("_", " ")}</div><div className="ml-auto flex gap-1.5"><button type="button" onClick={() => typeof onStudioViewChange === "function" && onStudioViewChange("code")} className="rounded-md border border-white/[0.08] px-2 py-1 text-[8px] text-white/38">Open in Code</button><button type="button" onClick={() => buildVisualConclusion(turn)} disabled={missionRunning || Boolean(currentActiveMissionId) || Object.values(dirty).some(Boolean)} className="rounded-md border border-[#D6A66A]/30 bg-[#D6A66A]/10 px-2 py-1 text-[8px] font-semibold text-[#e7c497] disabled:opacity-35">Build this</button></div></div>
                      <div className="mt-2 text-sm font-medium text-white/75">{artifact.title}</div>
                      {artifact.summary ? <div className="mt-1 text-[11px] leading-5 text-white/42">{artifact.summary}</div> : null}
                      <div className={`mt-3 grid gap-2 ${artifact.kind === "wireframe" ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"}`}>
                        {(artifact.nodes || []).map((node) => <div key={node.id} className={`rounded-lg border p-2.5 ${node.emphasis === "primary" ? "border-[#D6A66A]/30 bg-[#D6A66A]/[0.065]" : node.emphasis === "warning" ? "border-amber-300/20 bg-amber-300/[0.035]" : "border-white/[0.06] bg-black/25"}`}>
                          <div className="flex items-center gap-2"><span className="text-[10px] font-medium text-white/68">{node.label}</span>{node.group ? <span className="ml-auto text-[8px] uppercase tracking-[0.08em] text-white/20">{node.group}</span> : null}</div>
                          {node.detail ? <div className="mt-1 text-[10px] leading-4 text-white/36">{node.detail}</div> : null}
                        </div>)}
                      </div>
                      {artifact.edges?.length ? <div className="mt-3 flex flex-wrap gap-1.5">{artifact.edges.map((edge, edgeIndex) => { const from = artifact.nodes?.find((node) => node.id === edge.from)?.label || edge.from; const to = artifact.nodes?.find((node) => node.id === edge.to)?.label || edge.to; return <div key={`${edge.from}-${edge.to}-${edgeIndex}`} className="rounded-full border border-white/[0.06] bg-black/20 px-2 py-1 text-[9px] text-white/28"><span className="text-white/45">{from}</span> → <span className="text-white/45">{to}</span>{edge.label ? ` · ${edge.label}` : ""}</div>; })}</div> : null}
                    </div>;
                  }
                  if (talkOnly && turn.role === "user") {
                    return <div key={`${turn.role}-${index}`} className="ml-auto mr-3 w-fit min-w-0 max-w-[min(68%,760px)] overflow-hidden break-words rounded-2xl rounded-br-md border border-[#D6A66A]/30 bg-[#D6A66A]/[0.12] px-4 py-3 text-sm font-medium leading-7 text-slate-800 shadow-sm">
                      <div className="mb-1 text-right text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8a683f]/75">You</div>
                      <div>{turn.content}</div>
                    </div>;
                  }
                  return <div key={`${turn.role}-${index}`} className={talkOnly ? "mr-auto min-w-0 max-w-[86%] break-words py-3 text-sm leading-7 text-slate-700" : (turn.role === "user" ? "ml-10 rounded-xl border border-[#D6A66A]/15 bg-[#D6A66A]/[0.05] px-3 py-2.5 text-sm leading-6 text-white/72" : "mr-10 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5 text-sm leading-6 text-white/62")}>{turn.content}</div>;
                }) : <div className="py-10 text-center text-sm text-white/24">Start a conversation with Code about product, architecture, UX, layout or visual design.</div>}
                {liveTalkActive ? <div className="max-w-[92%] px-1 py-3 text-sm leading-7 text-slate-600">
                  <div className="flex items-start gap-2 py-2">
                    <span className="relative mt-2 flex h-2 w-2 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#D6A66A]/45"/><span className="relative inline-flex h-2 w-2 rounded-full bg-[#D6A66A]"/></span>
                    <div className="min-w-0 flex-1">
                      <span>{liveNarrationContent}</span>
                      {liveNarrationEntry?.event?.file_path ? <button type="button" onClick={() => { if (typeof onStudioViewChange === "function") onStudioViewChange("code"); openFile(liveNarrationEntry.event.file_path); }} className="ml-1 font-mono text-[10px] text-[#8a683f] hover:underline">{liveNarrationEntry.event.file_path}{liveNarrationEntry.event?.start_line ? `:${liveNarrationEntry.event.start_line}` : ""}</button> : null}
                    </div>
                  </div>
                </div> : null}</div>
              </> : null}
              {talkOnly && liveTalkActive && typeof onStudioViewChange === "function" ? <div className="mt-1 flex justify-end px-1"><button type="button" onClick={() => onStudioViewChange("code")} className="text-[10px] font-medium text-[#8a683f] hover:underline">View live work</button></div> : null}
              <textarea value={objective} onChange={(event) => setObjective(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendCodeMessage(); } }} rows={3} placeholder={liveTalkActive ? "Tell Code anything else while it works…" : "Message Code…"} className={talkOnly ? "mt-4 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 shadow-sm outline-none focus:border-[#D6A66A]/45" : "mt-3 w-full resize-none rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-xs leading-5 text-white/65 outline-none focus:border-[#D6A66A]/40"}/>
              <button type="button" onClick={sendCodeMessage} disabled={!objective.trim()} className={talkOnly ? "mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-[#D6A66A]/35 bg-[#D6A66A]/10 py-2.5 text-[11px] font-medium text-[#8a683f] disabled:opacity-25" : "mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-[#D6A66A]/35 bg-[#D6A66A]/10 py-2 text-[10px] text-[#e7c497] disabled:opacity-25"}>{conversationBusy ? <RefreshCw size={12} className="animate-spin"/> : liveTalkActive ? <ChevronRight size={12}/> : <Play size={12}/>} {conversationBusy ? conversationVisualBusy ? "Preparing visual…" : "Thinking…" : liveTalkActive ? "Send to running Code" : "Send"}</button>
            </div>
            <div className={codeOnly ? "border-b border-white/[0.06] p-3" : "hidden"}><div className="flex items-center justify-between gap-2"><div className="text-[10px] uppercase tracking-[0.16em] text-white/30">Live agent activity</div><div className="text-[9px] text-white/20">{activityEvents.length} current ops</div></div><div className="mt-2 max-h-64 space-y-1.5 overflow-auto pr-1">{activityEvents.length ? activityEvents.map((event, index) => { const touched = currentEventFile(event); const passed = event?.verification_passed; const actionText = text(event?.action || event?.phase || event?.status || "working"); return <button key={`${event?.at || index}-${event?.operation_id || index}`} type="button" onClick={() => touched && openFile(touched)} disabled={!touched} className="w-full rounded-lg border border-white/[0.055] bg-black/25 p-2 text-left disabled:cursor-default"><div className="flex items-center gap-2"><span className={`text-[9px] uppercase tracking-[0.1em] ${passed === false ? "text-red-200/70" : passed === true ? "text-emerald-200/70" : "text-[#D6A66A]/70"}`}>{/read|inspect|search/i.test(actionText) ? "READING" : /verify|test|check|command/i.test(actionText) ? "CHECKING" : /apply|write|edit|patch/i.test(actionText) ? "EDITING" : /diff/i.test(actionText) ? "REVIEWING" : actionText}</span>{event?.exit_code != null ? <span className="text-[9px] text-white/20">exit {event.exit_code}</span> : null}<span className="ml-auto text-[9px] text-white/15">{event?.at ? new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""}</span></div><div className="mt-1 line-clamp-2 text-[10px] leading-4 text-white/40">{text(event?.description || event?.reason || event?.operation_id || "Working")}</div>{touched ? <div className="mt-1 flex items-center gap-1 font-mono text-[9px] text-white/25"><ChevronRight size={9}/><span className="truncate">{touched}</span>{event?.start_line ? <span className="ml-auto shrink-0">L{event.start_line}{event?.end_line && event.end_line !== event.start_line ? `–${event.end_line}` : ""}</span> : null}</div> : null}{event?.command ? <div className="mt-1 truncate font-mono text-[9px] text-white/20">$ {[event.command, ...(event.command_args || [])].join(" ")}</div> : null}{learnMode ? <div className="mt-1.5 rounded-md border border-emerald-300/10 bg-emerald-300/[0.035] px-2 py-1.5 text-[9px] leading-4 text-emerald-100/50"><span className="font-semibold text-emerald-100/65">Why this step:</span> {observableLearningNote(event)}</div> : null}</button>; }) : <div className="rounded-lg border border-white/[0.06] bg-black/25 p-2.5"><div className="text-xs text-white/60">{currentActiveMissionId ? statusLabel(scopedProgress) : missionRunning ? "starting" : "idle"}</div><div className="mt-1 text-[10px] leading-4 text-white/30">Waiting for new mission activity</div></div>}</div></div>
            <div className={codeOnly ? "border-b border-white/[0.06] p-3" : "hidden"}><div className="grid grid-cols-2 gap-2 text-[10px]"><div className="rounded border border-white/[0.06] p-2"><div className="text-white/25">Engineering OS</div><div className={engineering?.engineering_os_ready ? "mt-1 text-emerald-200/70" : "mt-1 text-white/45"}>{engineering ? `${engineering.satisfied_required_department_count || 0}/${engineering.required_department_count || 0}` : "—"}</div></div><div className="rounded border border-white/[0.06] p-2"><div className="text-white/25">Precision OS</div><div className={precision?.precision_ready ? "mt-1 text-emerald-200/70" : "mt-1 text-white/45"}>{precision ? `${precision.satisfied_required_count || 0}/${precision.required_count || 0}` : "—"}</div></div></div></div>
            <div className={codeOnly ? "p-3" : "hidden"}><div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-white/30"><MonitorPlay size={12}/> Browser proof{latestBrowserEvent ? <span className="ml-auto rounded-full border border-[#D6A66A]/20 bg-[#D6A66A]/[0.05] px-2 py-0.5 text-[8px] normal-case tracking-normal text-[#e7c497]/65">Code verification target</span> : null}</div><div className="mt-2 flex gap-2"><input value={browserUrl} onChange={(event) => setBrowserUrl(event.target.value)} className="min-w-0 flex-1 rounded border border-white/[0.08] bg-black/30 px-2 py-1.5 text-[10px] text-white/55 outline-none"/><button type="button" onClick={verifyBrowser} className="rounded border border-white/10 px-2 text-white/45" title="Verify browser"><ShieldCheck size={12}/></button><button type="button" onClick={openStudioPreview} disabled={!browserUrl.trim() || typeof onStudioViewChange !== "function"} className="rounded border border-[#D6A66A]/25 bg-[#D6A66A]/[0.06] px-2 text-[9px] text-[#e7c497] disabled:opacity-30">Preview</button></div>{latestBrowserEvent ? <div className="mt-2 rounded-md border border-white/[0.06] bg-black/20 px-2 py-1.5 text-[9px] leading-4 text-white/35"><span className="font-medium text-[#e7c497]/65">Code is verifying:</span> <span className="font-mono">{latestBrowserEvent.url}</span>{latestBrowserEvent.verification_passed === true ? <span className="ml-2 text-emerald-200/65">PASS</span> : latestBrowserEvent.verification_passed === false ? <span className="ml-2 text-red-200/65">FAIL</span> : <span className="ml-2 text-white/25">working…</span>}</div> : null}{browserResult ? <div className={`mt-2 text-[10px] ${browserResult.passed ? "text-emerald-200/65" : "text-red-200/65"}`}>{browserResult.passed ? "PASS" : "FAIL"} · console {browserResult.console_errors?.length || 0} · requests {browserResult.failed_requests?.length || 0}</div> : null}</div>
          </aside>

          <section className={codeOnly ? "min-w-0 border-t border-white/[0.07] bg-[#080808]" : "hidden"}>
            <div className="flex h-8 items-center gap-4 border-b border-white/[0.06] px-3 text-[10px] uppercase tracking-[0.14em] text-white/30"><span className="flex items-center gap-1.5"><TerminalSquare size={11}/> Terminal</span><span className="flex items-center gap-1.5"><GitCompare size={11}/> Diff</span></div>
            <div className="grid h-[198px] grid-cols-2"><div ref={terminalHostRef} className="min-w-0 border-r border-white/[0.06] p-2"/><pre className="m-0 overflow-auto whitespace-pre-wrap p-3 font-mono text-[10px] leading-4 text-white/45">{diffText || "No diff yet."}</pre></div>
          </section>
        </div>
      )}

      {session && codeOnly ? <div className="fixed bottom-3 right-3 z-50"><button type="button" onClick={closeWorkspace} className="flex items-center gap-2 rounded-full border border-white/10 bg-black/80 px-3 py-2 text-[10px] text-white/45 shadow-xl backdrop-blur"><CircleStop size={11}/> Close developer workspace</button></div> : null}
      {error ? <div className="fixed bottom-3 left-1/2 z-50 max-w-[70vw] -translate-x-1/2 rounded-lg border border-red-300/20 bg-[#1a0d0d]/95 px-4 py-2 text-xs text-red-100/80 shadow-2xl">{error}</div> : null}
    </div>
  );
}

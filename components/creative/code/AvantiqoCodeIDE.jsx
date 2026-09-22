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
const MISSION_IDLE_DEADLINE_MS = 8 * 60 * 1000;
const MISSION_ABSOLUTE_DEADLINE_MS = 30 * 60 * 1000;
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
  const activeStates = new Set(["active", "executing", "in_progress", "pending", "planner_pending", "queued", "running", "verifying", "working"]);
  const eventAt = Date.parse(text(progress?.latest_event?.at));
  const fresh = !baselineAt || (Number.isFinite(eventAt) && eventAt >= baselineAt);
  return fresh && (activeStates.has(state) || activeStates.has(eventStatus));
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
  const repoActions = ["fix", "implement", "code", "change", "update", "repair", "debug", "test", "inspect", "trace", "refactor", "deploy", "commit", "continue building", "build this"];
  const repoSubjects = ["repo", "repository", "code", "file", "route", "component", "api", "database", "migration", "test", "runtime", "worker", "function"];

  if (current.includes("architecture")) return "architecture";
  if (current.includes("wireframe")) return "wireframe";
  if (current.includes("decision board")) return "decision_board";
  if (hasAny(current, ["flow diagram", "user flow", "process flow"])) return "flow";
  if (hasAny(current, imageSubjects) && hasAny(current, imageActions) && !hasAny(current, visualSubjects)) return "image_generation";
  if (hasAny(context, visualSubjects) && hasAny(current, visualActions)) return "design_preview";
  if (hasAny(current, repoActions) && (hasAny(current, repoSubjects) || /^\s*(fix|implement|change|update|debug|test|inspect|continue|build)\b/i.test(message))) return "repository_work";
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
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("Open a connected computer workspace");
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [diffText, setDiffText] = useState("");
  const [objective, setObjective] = useState("");
  const [chatTurns, setChatTurns] = useState([]);
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
  const conversationBusy = conversationPendingCount > 0;
  const [missionRunning, setMissionRunning] = useState(false);
  const [localMissionId, setLocalMissionId] = useState("");
  const [missionResult, setMissionResult] = useState(null);
  const [activityBaselineAt, setActivityBaselineAt] = useState(0);
  const [browserUrl, setBrowserUrl] = useState("http://localhost:3001/code");
  const [browserResult, setBrowserResult] = useState(null);
  const [followCode, setFollowCode] = useState(true);
  const [learnMode, setLearnMode] = useState(true);
  const terminalHostRef = useRef(null);
  const terminalRef = useRef(null);
  const editorRef = useRef(null);
  const fitAddonRef = useRef(null);
  const terminalLineRef = useRef("");
  const pendingSteerRef = useRef([]);
  const mounted = useRef(false);

  const activeBuffer = buffers[activePath] || null;
  const progressSessionId = text(progress?.device_session_id);
  const sessionAgentActive = Boolean(
    agentActive &&
    session?.session_id &&
    progressSessionId === session.session_id
  );
  const scopedProgress = progressSessionId && progressSessionId === session?.session_id ? progress : null;
  const currentActiveMissionId = activeMissionProgress(scopedProgress, activityBaselineAt) ? text(scopedProgress?.mission_id) : "";
  const stopMissionId = currentActiveMissionId || (missionRunning ? localMissionId : "");
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
          return Number.isFinite(at) && at >= activityBaselineAt;
        });
    return freshLive.length ? freshLive : completedMissionEvents;
  }, [scopedProgress?.events, completedMissionEvents, activityBaselineAt]);
  const latestObservedEvent = activityEvents.find((entry) => text(entry?.file_path) || entry?.files_changed?.[0]) || scopedProgress?.latest_event || null;
  const latestTouchedFile = text(latestObservedEvent?.file_path || latestObservedEvent?.files_changed?.[0]);
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
        body: JSON.stringify({ organizationId, mission_id: missionId, action: "STOP" }),
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
  }, [organizationId, requestRefresh]);

  const submitLiveSteer = useCallback(async (missionId, instruction) => {
    const response = await fetch("/api/operator/code/intervention", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ organizationId, mission_id: missionId, action: "STEER", instruction }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.success !== true) throw new Error(body?.error || "Live Code steering failed");
    setStatus("Live instruction queued for Code at the next safe reasoning boundary");
    requestRefresh();
    return body;
  }, [organizationId, requestRefresh]);

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
    const feed = talkFeedRef.current;
    if (!feed || !talkFeedPinnedRef.current) return;
    feed.scrollTo({ top: feed.scrollHeight, behavior: conversationBusy || visualBusy || designBusy || imageBusy ? "smooth" : "auto" });
  }, [chatTurns, conversationBusy, visualBusy, designBusy, imageBusy]);

  useEffect(() => {
    setDeviceSessionScope(session?.session_id || null);
    return () => setDeviceSessionScope(null);
  }, [session?.session_id, setDeviceSessionScope]);

  useEffect(() => {
    if (session) return undefined;
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
  }, [organizationId, session]);

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
      setChatTurns(Array.isArray(saved?.turns) ? saved.turns : []);
      setObjective(typeof saved?.objective === "string" ? saved.objective : "");
      setVisualArtifact(saved?.visualArtifact && typeof saved.visualArtifact === "object" ? saved.visualArtifact : null);
    } catch {
      setChatTurns([]);
      setObjective("");
      setVisualArtifact(null);
    }
  }, [organizationId]);

  useEffect(() => {
    if (chatHydrationSkipWriteRef.current) {
      chatHydrationSkipWriteRef.current = false;
      return;
    }
    const key = `avantiqo:code-talk:${organizationId}`;
    try {
      const durableTurns = chatTurns
        .filter((turn) => ["user", "assistant", "design_preview", "visual", "image"].includes(turn?.role))
        .slice(-12);
      const payload = {
        turns: durableTurns,
        objective,
        visualArtifact,
        saved_at: new Date().toISOString(),
      };
      localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      try {
        const compactTurns = chatTurns
          .filter((turn) => ["user", "assistant", "design_preview"].includes(turn?.role))
          .slice(-6);
        localStorage.setItem(key, JSON.stringify({ turns: compactTurns, objective, saved_at: new Date().toISOString() }));
      } catch {}
    }
  }, [organizationId, chatTurns, objective, visualArtifact]);

  useEffect(() => {
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
        localStorage.removeItem(key);
      }
    })();
  }, [organizationId, session]);

  useEffect(() => {
    if (!session) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const state = await ideRequest("state");
        const nextRevision = Number(state.revision || 0);
        setLeaseOwner(state.edit_owner || null);
        if (nextRevision !== revision) {
          if (activePath && !dirty[activePath]) {
            const fresh = await ideRequest("read", { file_path: activePath });
            setBuffers((current) => ({ ...current, [activePath]: { ...fresh, content: fresh.content ?? "", revision: nextRevision } }));
          }
          setRevision(nextRevision);
          const tree = await ideRequest("tree");
          setFiles(tree.files || []);
          const diff = await ideRequest("diff");
          setDiffText(diff.patch || "");
          if (followCode && !Object.values(dirty).some(Boolean)) {
            const changedPath = (Array.isArray(diff.status) ? diff.status : [])
              .map((entry) => String(entry || "").trim().replace(/^[ MARC?D!]{1,3}\s+/, ""))
              .map((entry) => entry.includes(" -> ") ? entry.split(" -> ").pop().trim() : entry)
              .find((entry) => entry && (tree.files || []).includes(entry));
            if (changedPath) {
              const freshChanged = await ideRequest("read", { file_path: changedPath });
              setBuffers((current) => ({ ...current, [changedPath]: { ...freshChanged, content: freshChanged.content ?? "", revision: nextRevision } }));
              setTabs((current) => current.includes(changedPath) ? current : [...current, changedPath]);
              setActivePath(changedPath);
              setDirty((current) => ({ ...current, [changedPath]: false }));
            }
          }
        }
      } catch {}
    }, (missionRunning || sessionAgentActive) ? 1500 : studioView === "code" ? 3500 : 10000);
    return () => window.clearInterval(timer);
  }, [session, ideRequest, revision, activePath, dirty, missionRunning, sessionAgentActive, followCode, studioView]);

  useEffect(() => {
    if (!session || !followCode || !latestTouchedFile || latestTouchedFile === activePath) return undefined;
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
  }, [session, followCode, latestTouchedFile, activePath, dirty, files, revision, ideRequest]);

  useEffect(() => {
    if (!followCode || !latestTouchedFile || latestTouchedFile !== activePath || !latestFocusStartLine || !editorRef.current) return;
    const editor = editorRef.current;
    const startLine = Math.max(1, latestFocusStartLine);
    const endLine = Math.max(startLine, latestFocusEndLine || startLine);
    try {
      editor.revealLineInCenter(startLine);
      editor.setSelection({ startLineNumber: startLine, startColumn: 1, endLineNumber: endLine, endColumn: 1 });
    } catch {}
  }, [followCode, latestTouchedFile, activePath, latestFocusStartLine, latestFocusEndLine]);

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

  async function openWorkspace() {
    if (!deviceId || !repositoryUrl.trim() || opening) return;
    setOpening(true); setError(null); setStatus("Opening isolated developer worktree…");
    try {
      const result = await fetch("/api/operator/code/ide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ organizationId, action: "open", device_id: deviceId, repository_url: repositoryUrl.trim(), ref: ref.trim() || "main" }),
      }).then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body?.success !== true) throw new Error(body?.error || "Workspace open failed");
        return body.result;
      });
      const nextSession = { ...result, device_id: deviceId, repository_url: repositoryUrl.trim(), ref: ref.trim() || "main" };
      setSession(nextSession);
      setActivityBaselineAt(Date.now());
      setMissionResult(null);
      setFiles(result.tree?.files || []);
      setExpandedFolders(new Set());
      setRevision(Number(result.ide_state?.revision || 0));
      setLeaseOwner(result.ide_state?.edit_owner || null);
      setTabs([]); setActivePath(""); setBuffers({}); setDirty({}); setDiffText("");
      setStatus(`Developer workspace ready · ${result.base_commit?.slice(0, 10)}`);
      return nextSession;
    } catch (openError) {
      setError(openError.message);
      setStatus("Workspace stopped");
      return null;
    } finally { setOpening(false); }
  }

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

  async function releaseHumanLease() {
    if (!session) return;
    try { await ideRequest("lease", { owner: "HUMAN", release: true }); setLeaseOwner(null); } catch (leaseError) { setError(leaseError.message); }
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

  async function runCodeMission(overrideObjective = null, { reportToTalk = false, sessionOverride = null } = {}) {
    const trimmedObjective = text(overrideObjective || objective);
    const activeSession = sessionOverride || session;
    if (!activeSession || !trimmedObjective || missionRunning) return;
    if (Object.values(dirty).some(Boolean)) { setError("Save or discard human edits before handing the workspace to Code."); return; }
    const missionId = `code-mission-${crypto.randomUUID()}`;
    setActivityBaselineAt(Date.now());
    setLocalMissionId(missionId);
    setMissionRunning(true); setMissionResult(null); setError(null); setStatus("Code is taking the shared workspace…"); requestRefresh();
    const executionKey = `code-ide:${crypto.randomUUID()}`;
    let resumeState = null;
    let terminalResponseObserved = false;
    const missionAbsoluteDeadline = Date.now() + MISSION_ABSOLUTE_DEADLINE_MS;
    let missionIdleDeadline = Date.now() + MISSION_IDLE_DEADLINE_MS;
    let lastProgressFingerprint = "";
    try {
      if (leaseOwner === "HUMAN") {
        await ideRequestWithSession(activeSession, "lease", { owner: "HUMAN", release: true });
        setLeaseOwner(null);
      }
      for (let attempt = 0; attempt < MAX_RESUMES; attempt += 1) {
        const response = await fetch("/api/operator/code/mission", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ organizationId, objective: trimmedObjective, repository_url: activeSession.repository_url, ref: activeSession.ref || "main", workspace_target: "DEVICE", device_id: activeSession.device_id, device_session_id: activeSession.session_id, mission_id: missionId, execution_key: executionKey, resume_state: resumeState, reasoning_call_budget: 4, max_employee_passes: 8 }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || `Code mission failed (${response.status})`);
        setMissionResult(body); requestRefresh();
        const responseState = body.resume_state || body.state || null;
        const responseStatus = text(responseState?.status || body.status, 120).toLowerCase();
        const shouldResume = Boolean(
          responseState &&
          (body.resume_required === true ||
            responseState?.planner_pending ||
            ["planner_pending", "repair_required", "verification_required"].includes(responseStatus))
        );
        if (shouldResume) {
          const progressFingerprint = JSON.stringify({
            status: responseStatus,
            reasoning_calls_used: Number(responseState?.work_package_control?.reasoning_calls_used || 0),
            pending_reasoning_call: Number(responseState?.work_package_control?.pending_reasoning_call || 0),
            evidence_count: Array.isArray(responseState?.evidence) ? responseState.evidence.length : 0,
            operation_count: Array.isArray(responseState?.operations) ? responseState.operations.length : 0,
            files_changed_count: Array.isArray(responseState?.files_changed) ? responseState.files_changed.length : 0,
            planner_job: text(responseState?.planner_pending?.provider_job_id || responseState?.planner_pending?.usage_id),
          });
          if (progressFingerprint !== lastProgressFingerprint) {
            lastProgressFingerprint = progressFingerprint;
            missionIdleDeadline = Date.now() + MISSION_IDLE_DEADLINE_MS;
          }
          if (Date.now() >= missionAbsoluteDeadline) throw new Error("Code mission absolute deadline exceeded");
          if (Date.now() >= missionIdleDeadline) throw new Error("Code mission stalled without progress");
          resumeState = responseState;
          await wait(1200);
          continue;
        }
        terminalResponseObserved = true;
        setStatus(body.status === "completed" ? "Code mission completed in shared workspace" : body.reason || body.status || "Code stopped");
        if (reportToTalk) {
          const finalState = body.state || body.resume_state || {};
          const finalStatus = text(body.status || finalState.status, 120).toLowerCase();
          const changedCount = Array.isArray(finalState.files_changed) ? finalState.files_changed.length : 0;
          const verification = body.developer_verification?.verification || finalState.tests?.[0] || null;
          const verificationPassed = verification?.passed === true || Number(verification?.exit_code) === 0;
          const summary = finalStatus === "completed"
            ? changedCount
              ? `Done. I finished the Code work and verified it. ${changedCount} file${changedCount === 1 ? "" : "s"} changed${verification ? verificationPassed ? ", and the verification passed." : "." : "."}`
              : `Done. I checked it in the shared Code workspace${verification ? verificationPassed ? " and the verification passed." : "." : "."} No source changes were made.`
            : finalStatus === "stopped"
              ? "I stopped the Code work at a safe boundary. No further changes will be made unless you continue it."
              : `I hit a blocker while Code was working: ${text(body.reason || finalState.blockers?.[0] || finalState.failures?.[0]?.reason || finalStatus || "unknown blocker", 800)}`;
          setChatTurns((current) => [...current, { role: "assistant", content: summary }]);
        }
        break;
      }
      if (!terminalResponseObserved) throw new Error("Code mission resume limit exceeded");
      const state = await ideRequestWithSession(activeSession, "state");
      setRevision(Number(state.revision || revision)); setLeaseOwner(state.edit_owner || null);
      const tree = await ideRequestWithSession(activeSession, "tree"); setFiles(tree.files || []);
      const diff = await ideRequestWithSession(activeSession, "diff"); setDiffText(diff.patch || "");
      if (activePath && !dirty[activePath]) {
        const fresh = await ideRequestWithSession(activeSession, "read", { file_path: activePath });
        setBuffers((current) => ({ ...current, [activePath]: { ...fresh, content: fresh.content ?? "", revision: Number(state.revision || revision) } }));
      }
    } catch (missionError) {
      setError(missionError.message);
      setStatus("Code mission stopped");
      if (reportToTalk) setChatTurns((current) => [...current, { role: "assistant", content: `I hit a blocker while Code was working: ${missionError.message}` }]);
    }
    finally { setMissionRunning(false); setLocalMissionId(""); requestRefresh(); }
  }

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
      && /\b(?:make\s+no\s+(?:source\s+)?changes?|no\s+(?:source\s+)?changes?|do\s+not\s+(?:change|modify|edit)|verify\s+only|verification[- ]only|read[- ]only)\b/i.test(latestInstruction)
      && /\b(?:app|components|lib|tests|scripts|workers)\/[A-Za-z0-9_./@()\[\]-]+\.(?:cjs|css|js|jsx|json|md|mjs|sql|ts|tsx|yml|yaml)\b/i.test(latestInstruction);
    if (explicitReadOnlyVerification) return latestInstruction.slice(0, 24000);
    const recent = (Array.isArray(turns) ? turns : []).slice(-10);
    const context = recent.map((turn) => {
      if (!turn) return "";
      if (turn.role === "design_preview" && turn.preview?.schema) {
        return [
          "Approved visual direction:",
          turn.preview?.title || turn.content || "Design preview",
          turn.preview?.summary || "",
          JSON.stringify(turn.preview.schema),
          turn.hero_image_url ? `Hero visual reference: ${turn.hero_image_url}` : "",
          turn.support_image_url ? `Supporting visual reference: ${turn.support_image_url}` : "",
        ].filter(Boolean).join("\n");
      }
      if (turn.role === "visual" && turn.artifact) {
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
      if (turn.role === "image" && turn.asset_url) {
        return `Visual reference generated in Talk: ${turn.asset_url}`;
      }
      if (["user", "assistant"].includes(turn.role) && turn.content) {
        return `${turn.role === "user" ? "User" : "Code"}: ${turn.content}`;
      }
      return "";
    }).filter(Boolean).join("\n\n");

    return [
      "Implement the user's latest instruction in the existing shared Code Studio project.",
      `Latest instruction: ${message}`,
      context ? `Conversation and approved visual context:\n${context}` : "",
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
    const nextUserTurn = { role: "user", content: message };
    setChatTurns((current) => [...current, nextUserTurn]);
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
      const stage = percent < 25 ? "Understanding request"
        : percent < 55 ? "Inspecting project context"
          : percent < 78 ? "Reasoning through options"
            : "Preparing response";
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
        if (missionRunning || currentActiveMissionId) {
          if (currentActiveMissionId) await submitLiveSteer(currentActiveMissionId, message);
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
              settlePendingReply("I can keep discussing this here, but I couldn’t attach an online Code workspace yet. Open Code when you want me to make repository changes.");
              return;
            }
          }
          const missionObjective = missionObjectiveFromConversation(message, [...priorTurns, nextUserTurn]);
          settlePendingReply("I’m on it. Code is working behind this conversation, and I’ll come back here with the verified result.");
          runCodeMission(missionObjective, { reportToTalk: true, sessionOverride: missionSession });
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
        <div className={talkOnly ? "grid min-h-[720px] grid-cols-[minmax(0,1fr)] overflow-hidden" : "grid min-h-[calc(100vh-57px)] grid-cols-[220px_minmax(0,1fr)_300px] grid-rows-[minmax(0,1fr)_230px] overflow-hidden"}>
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
            <div className="h-[calc(100vh-169px)] overflow-auto px-1 pb-4">
              {explorerTree.length ? renderExplorerNodes(explorerTree) : <div className="px-3 py-4 text-[11px] text-white/25">No matching files</div>}
            </div>
          </aside>

          <main className={codeOnly ? "min-w-0 bg-[#090909]" : "hidden"}>
            <div className="flex h-9 items-center overflow-x-auto border-b border-white/[0.07] bg-[#0d0d0d]">{tabs.map((tab) => <div key={tab} className={`flex h-full min-w-0 max-w-[240px] items-center gap-2 border-r border-white/[0.06] px-3 text-[11px] ${activePath === tab ? "bg-[#080808] text-white/70" : "text-white/35"}`}><button type="button" onClick={() => setActivePath(tab)} className="min-w-0 truncate">{tab.split("/").at(-1)}{dirty[tab] ? " •" : ""}</button><button type="button" onClick={() => closeTab(tab)} className="text-white/20 hover:text-white/60"><X size={11}/></button></div>)}</div>
            {latestTouchedFile && followCode ? <div className="flex h-8 items-center gap-2 border-b border-[#D6A66A]/15 bg-[#D6A66A]/[0.045] px-3 text-[10px]"><span className="h-1.5 w-1.5 rounded-full bg-[#D6A66A]"/><span className="font-semibold text-[#e7c497]/80">{latestFileAction}</span><span className="min-w-0 truncate font-mono text-white/45">{latestTouchedFile}</span>{latestFocusStartLine ? <span className="ml-auto font-mono text-white/25">L{latestFocusStartLine}{latestFocusEndLine && latestFocusEndLine !== latestFocusStartLine ? `–${latestFocusEndLine}` : ""}</span> : <span className="ml-auto text-white/20">following Code live</span>}</div> : null}
            {activeBuffer ? <MonacoEditor height={latestTouchedFile && followCode ? "calc(100vh - 358px)" : "calc(100vh - 326px)"} language={languageFor(activePath)} path={activePath} value={activeBuffer.content} onMount={(editor) => { editorRef.current = editor; }} onChange={(value) => { setBuffers((current) => ({ ...current, [activePath]: { ...current[activePath], content: value ?? "" } })); setDirty((current) => ({ ...current, [activePath]: true })); if (leaseOwner !== "HUMAN") ensureHumanLease().catch((leaseError) => setError(leaseError.message)); }} theme="vs" options={{ fontSize: 12, minimap: { enabled: true }, smoothScrolling: true, automaticLayout: true, wordWrap: "off", renderWhitespace: "selection", bracketPairColorization: { enabled: true } }} /> : <div className={`flex ${latestTouchedFile && followCode ? "h-[calc(100vh-358px)]" : "h-[calc(100vh-326px)]"} items-center justify-center text-sm text-white/20`}>Open a file from Explorer</div>}
            <div className="flex h-9 items-center gap-2 border-t border-white/[0.06] bg-[#0c0c0c] px-3"><button type="button" onClick={saveActive} disabled={!activePath || !dirty[activePath] || saving || leaseOwner === "CODE"} className="flex items-center gap-1.5 rounded border border-white/10 px-2 py-1 text-[10px] text-white/50 disabled:opacity-25"><Save size={11}/> Save</button><button type="button" onClick={releaseHumanLease} disabled={leaseOwner !== "HUMAN"} className="flex items-center gap-1.5 rounded border border-white/10 px-2 py-1 text-[10px] text-white/50 disabled:opacity-25"><UserRound size={11}/> Release human edit</button><button type="button" onClick={refreshDiff} className="flex items-center gap-1.5 rounded border border-white/10 px-2 py-1 text-[10px] text-white/50"><RefreshCw size={11}/> Diff</button><span className="ml-auto truncate text-[10px] text-white/30">{status}</span></div>
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
                  className={talkOnly ? "mt-3 max-h-[520px] space-y-2 overflow-auto rounded-xl border border-slate-200/80 bg-[#FBFCFD] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.8)]" : "mt-3 max-h-[520px] space-y-2 overflow-auto rounded-xl border border-white/[0.055] bg-black/20 p-3"}
                >{chatTurns.length ? chatTurns.map((turn, index) => {
                  if (turn.role === "visual_error" || turn.role === "image_error") return null;
                  if (turn.role === "assistant_pending") {
                    return <div key={turn.id || `assistant-pending-${index}`} className="mr-10 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-500 shadow-sm">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-[#D6A66A]"/>
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
                  return <div key={`${turn.role}-${index}`} className={talkOnly ? (turn.role === "user" ? "ml-12 rounded-2xl border border-[#D6A66A]/20 bg-[#fffaf3] px-4 py-3 text-sm leading-6 text-slate-700 shadow-sm" : "mr-12 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 shadow-sm") : (turn.role === "user" ? "ml-10 rounded-xl border border-[#D6A66A]/15 bg-[#D6A66A]/[0.05] px-3 py-2.5 text-sm leading-6 text-white/72" : "mr-10 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5 text-sm leading-6 text-white/62")}>{turn.content}</div>;
                }) : <div className="py-10 text-center text-sm text-white/24">Start a conversation with Code about product, architecture, UX, layout or visual design.</div>}</div>
              </> : null}
              {talkOnly && (missionRunning || currentActiveMissionId) ? <div className="mt-3 flex items-center gap-2 px-1 text-[10px] text-slate-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#D6A66A]"/>
                <span>Working in Code…</span>
                {typeof onStudioViewChange === "function" ? <button type="button" onClick={() => onStudioViewChange("code")} className="ml-auto text-[10px] font-medium text-[#8a683f] hover:underline">View live work</button> : null}
              </div> : null}
              <textarea value={objective} onChange={(event) => setObjective(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendCodeMessage(); } }} rows={3} placeholder={missionRunning || currentActiveMissionId ? "Tell Code anything else while it works…" : "Message Code…"} className={talkOnly ? "mt-4 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 shadow-sm outline-none focus:border-[#D6A66A]/45" : "mt-3 w-full resize-none rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-xs leading-5 text-white/65 outline-none focus:border-[#D6A66A]/40"}/>
              <button type="button" onClick={sendCodeMessage} disabled={!objective.trim() || Object.values(dirty).some(Boolean)} className={talkOnly ? "mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-[#D6A66A]/35 bg-[#D6A66A]/10 py-2.5 text-[11px] font-medium text-[#8a683f] disabled:opacity-25" : "mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-[#D6A66A]/35 bg-[#D6A66A]/10 py-2 text-[10px] text-[#e7c497] disabled:opacity-25"}>{conversationBusy ? <RefreshCw size={12} className="animate-spin"/> : missionRunning || currentActiveMissionId ? <ChevronRight size={12}/> : <Play size={12}/>} {conversationBusy ? conversationVisualBusy ? "Preparing visual…" : "Thinking…" : missionRunning || currentActiveMissionId ? "Send to running Code" : "Send"}</button>
            </div>
            <div className={codeOnly ? "border-b border-white/[0.06] p-3" : "hidden"}><div className="flex items-center justify-between gap-2"><div className="text-[10px] uppercase tracking-[0.16em] text-white/30">Live agent activity</div><div className="text-[9px] text-white/20">{activityEvents.length} current ops</div></div><div className="mt-2 max-h-64 space-y-1.5 overflow-auto pr-1">{activityEvents.length ? activityEvents.map((event, index) => { const touched = text(event?.file_path || event?.files_changed?.[0]); const passed = event?.verification_passed; const actionText = text(event?.action || event?.phase || event?.status || "working"); return <button key={`${event?.at || index}-${event?.operation_id || index}`} type="button" onClick={() => touched && openFile(touched)} disabled={!touched} className="w-full rounded-lg border border-white/[0.055] bg-black/25 p-2 text-left disabled:cursor-default"><div className="flex items-center gap-2"><span className={`text-[9px] uppercase tracking-[0.1em] ${passed === false ? "text-red-200/70" : passed === true ? "text-emerald-200/70" : "text-[#D6A66A]/70"}`}>{/read|inspect|search/i.test(actionText) ? "READING" : /verify|test|check|command/i.test(actionText) ? "CHECKING" : /apply|write|edit|patch/i.test(actionText) ? "EDITING" : /diff/i.test(actionText) ? "REVIEWING" : actionText}</span>{event?.exit_code != null ? <span className="text-[9px] text-white/20">exit {event.exit_code}</span> : null}<span className="ml-auto text-[9px] text-white/15">{event?.at ? new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""}</span></div><div className="mt-1 line-clamp-2 text-[10px] leading-4 text-white/40">{text(event?.description || event?.reason || event?.operation_id || "Working")}</div>{touched ? <div className="mt-1 flex items-center gap-1 font-mono text-[9px] text-white/25"><ChevronRight size={9}/><span className="truncate">{touched}</span>{event?.start_line ? <span className="ml-auto shrink-0">L{event.start_line}{event?.end_line && event.end_line !== event.start_line ? `–${event.end_line}` : ""}</span> : null}</div> : null}{event?.command ? <div className="mt-1 truncate font-mono text-[9px] text-white/20">$ {[event.command, ...(event.command_args || [])].join(" ")}</div> : null}{learnMode ? <div className="mt-1.5 rounded-md border border-emerald-300/10 bg-emerald-300/[0.035] px-2 py-1.5 text-[9px] leading-4 text-emerald-100/50"><span className="font-semibold text-emerald-100/65">Why this step:</span> {observableLearningNote(event)}</div> : null}</button>; }) : <div className="rounded-lg border border-white/[0.06] bg-black/25 p-2.5"><div className="text-xs text-white/60">{currentActiveMissionId ? statusLabel(scopedProgress) : missionRunning ? "starting" : "idle"}</div><div className="mt-1 text-[10px] leading-4 text-white/30">Waiting for new mission activity</div></div>}</div></div>
            <div className={codeOnly ? "border-b border-white/[0.06] p-3" : "hidden"}><div className="grid grid-cols-2 gap-2 text-[10px]"><div className="rounded border border-white/[0.06] p-2"><div className="text-white/25">Engineering OS</div><div className={engineering?.engineering_os_ready ? "mt-1 text-emerald-200/70" : "mt-1 text-white/45"}>{engineering ? `${engineering.satisfied_required_department_count || 0}/${engineering.required_department_count || 0}` : "—"}</div></div><div className="rounded border border-white/[0.06] p-2"><div className="text-white/25">Precision OS</div><div className={precision?.precision_ready ? "mt-1 text-emerald-200/70" : "mt-1 text-white/45"}>{precision ? `${precision.satisfied_required_count || 0}/${precision.required_count || 0}` : "—"}</div></div></div></div>
            <div className={codeOnly ? "p-3" : "hidden"}><div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-white/30"><MonitorPlay size={12}/> Browser proof</div><div className="mt-2 flex gap-2"><input value={browserUrl} onChange={(event) => setBrowserUrl(event.target.value)} className="min-w-0 flex-1 rounded border border-white/[0.08] bg-black/30 px-2 py-1.5 text-[10px] text-white/55 outline-none"/><button type="button" onClick={verifyBrowser} className="rounded border border-white/10 px-2 text-white/45" title="Verify browser"><ShieldCheck size={12}/></button><button type="button" onClick={openStudioPreview} disabled={!browserUrl.trim() || typeof onStudioViewChange !== "function"} className="rounded border border-[#D6A66A]/25 bg-[#D6A66A]/[0.06] px-2 text-[9px] text-[#e7c497] disabled:opacity-30">Preview</button></div>{browserResult ? <div className={`mt-2 text-[10px] ${browserResult.passed ? "text-emerald-200/65" : "text-red-200/65"}`}>{browserResult.passed ? "PASS" : "FAIL"} · console {browserResult.console_errors?.length || 0} · requests {browserResult.failed_requests?.length || 0}</div> : null}</div>
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

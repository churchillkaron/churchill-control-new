"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Paperclip, Square, X } from "lucide-react";

import HomeAvantiqoIntelligence from "@/components/operator/HomeAvantiqoIntelligence";

const LATEST_THRESHOLD_PX = 96;
const VOICE_REPLY_INTENT_TTL_MS = 120_000;
const LIVE_POLL_MS = 900;
const LIVE_STALE_MS = 45_000;
const MAX_DEVELOPER_FILES = 4;
const MAX_DEVELOPER_FILE_BYTES = 128 * 1024;

function text(value) {
  return String(value ?? "").trim();
}

function normalizedSpeech(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function speechTokens(value) {
  return new Set(
    normalizedSpeech(value)
      .split(" ")
      .filter((token) => token.length > 2),
  );
}

function likelySpokenEcho(command, spoken) {
  const candidate = normalizedSpeech(command);
  const reference = normalizedSpeech(spoken);
  if (!candidate || !reference) return false;

  if (
    Math.min(candidate.length, reference.length) >= 12 &&
    (reference.includes(candidate) || candidate.includes(reference))
  ) {
    return true;
  }

  const candidateTokens = speechTokens(candidate);
  const referenceTokens = speechTokens(reference);
  if (candidateTokens.size < 3 || referenceTokens.size < 3) return false;

  let shared = 0;
  for (const token of candidateTokens) {
    if (referenceTokens.has(token)) shared += 1;
  }
  return shared / candidateTokens.size >= 0.7;
}

function eventTimestamp(value) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function humanPhase(value) {
  const phase = text(value).replaceAll("_", " ").toLowerCase();
  if (!phase) return "Working";
  return phase.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function activityMode(event) {
  if (event?.mutation_running === true) return "Editing / executing";
  if (event?.verification_running === true) return "Verifying";
  if (event?.paid_execution_running === true) return "Owned AI running";
  if (event?.read_only === true) return "Read only";
  return "Governed execution";
}

function recentLiveExecution(value) {
  if (!value || value.active !== true) return false;
  const updated = eventTimestamp(value.updated_at || value.latest_event?.at);
  return updated > 0 && Date.now() - updated <= LIVE_STALE_MS;
}

export default function HomeAvantiqoIntelligenceDock({ organizationId }) {
  const rootRef = useRef(null);
  const fileInputRef = useRef(null);
  const developerAttachmentSetRef = useRef(null);
  const [liveExecution, setLiveExecution] = useState(null);
  const [stopPending, setStopPending] = useState(false);
  const [developerAttachmentSet, setDeveloperAttachmentSet] = useState(null);
  const [developerAttachmentPending, setDeveloperAttachmentPending] = useState(false);
  const [developerAttachmentError, setDeveloperAttachmentError] = useState("");

  function clearDeveloperAttachments() {
    developerAttachmentSetRef.current = null;
    setDeveloperAttachmentSet(null);
    setDeveloperAttachmentError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function selectDeveloperAttachments(event) {
    const files = Array.from(event?.target?.files || []).slice(0, MAX_DEVELOPER_FILES);
    if (!organizationId || !files.length) return;
    setDeveloperAttachmentPending(true);
    setDeveloperAttachmentError("");
    try {
      for (const file of files) {
        if (file.size > MAX_DEVELOPER_FILE_BYTES) {
          throw new Error(`${file.name} is too large for live Code context.`);
        }
      }
      const attachments = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          type: file.type || "text/plain",
          size: file.size,
          content: await file.text(),
        })),
      );
      const response = await fetch("/api/operator/developer-attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ organizationId, attachments }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success !== true || !result?.attachment_set_id) {
        throw new Error(result?.error || "Could not attach the selected files.");
      }
      const next = {
        attachment_set_id: result.attachment_set_id,
        expires_at: result.expires_at || null,
        files: Array.isArray(result.files) ? result.files : [],
      };
      developerAttachmentSetRef.current = next;
      setDeveloperAttachmentSet(next);
    } catch (error) {
      clearDeveloperAttachments();
      setDeveloperAttachmentError(text(error?.message || error) || "Could not attach the selected files.");
    } finally {
      setDeveloperAttachmentPending(false);
    }
  }

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    async function transparentBusinessPartnerFetch(input, init = {}) {
      const url = typeof input === "string" ? input : input?.url;
      const method = text(init?.method || (typeof input === "object" ? input?.method : "GET")).toUpperCase() || "GET";
      if (url === "/api/operator/turn" && method === "POST") {
        const attachmentSetId = text(
          developerAttachmentSetRef.current?.attachment_set_id,
        );
        const headers = new Headers(init?.headers || {});
        if (attachmentSetId) {
          headers.set("x-avantiqo-developer-attachment-set", attachmentSetId);
        }
        const response = await originalFetch("/api/operator/turn/live", {
          ...init,
          headers,
        });
        if (attachmentSetId && response.ok) clearDeveloperAttachments();
        return response;
      }
      return originalFetch(input, init);
    }

    window.fetch = transparentBusinessPartnerFetch;
    return () => {
      if (window.fetch === transparentBusinessPartnerFetch) {
        window.fetch = originalFetch;
      }
    };
  }, []);

  useEffect(() => {
    let lastSpokenMessage = "";
    let spokenEchoGuardUntil = 0;
    let voiceReplyIntentUntil = 0;

    function gateAndRememberSpokenOutput(event) {
      const detail = event?.detail;
      if (!detail || typeof detail !== "object") {
        event.stopImmediatePropagation();
        return;
      }

      const message = text(detail.message);
      if (!message) {
        event.stopImmediatePropagation();
        return;
      }

      const source = text(detail.source).toLowerCase();
      const explicitlyVoiceInitiated = detail.voice_initiated === true;
      const homeVoiceReply =
        source === "operator" &&
        Date.now() <= voiceReplyIntentUntil;

      if (!explicitlyVoiceInitiated && !homeVoiceReply) {
        event.stopImmediatePropagation();
        return;
      }

      voiceReplyIntentUntil = 0;
      lastSpokenMessage = message;
      const words = normalizedSpeech(message).split(" ").filter(Boolean).length;
      spokenEchoGuardUntil = Date.now() + Math.min(
        90_000,
        Math.max(12_000, 8_000 + words * 650),
      );
    }

    function normalizeHomeCommandSource(event) {
      const detail = event?.detail;
      if (!detail || typeof detail !== "object") return;

      const source = text(detail.source).toLowerCase();
      detail.source = source === "voice" ? "voice" : "text";

      if (detail.source === "voice") {
        voiceReplyIntentUntil = Date.now() + VOICE_REPLY_INTENT_TTL_MS;
      } else {
        voiceReplyIntentUntil = 0;
      }

      if (
        detail.source === "voice" &&
        Date.now() < spokenEchoGuardUntil &&
        likelySpokenEcho(detail.message, lastSpokenMessage)
      ) {
        voiceReplyIntentUntil = 0;
        event.stopImmediatePropagation();
      }
    }

    window.addEventListener("avantiqo:speak", gateAndRememberSpokenOutput, true);
    window.addEventListener(
      "avantiqo:home-command",
      normalizeHomeCommandSource,
      true,
    );
    return () => {
      window.removeEventListener(
        "avantiqo:speak",
        gateAndRememberSpokenOutput,
        true,
      );
      window.removeEventListener(
        "avantiqo:home-command",
        normalizeHomeCommandSource,
        true,
      );
    };
  }, []);

  useEffect(() => {
    if (!organizationId) {
      setLiveExecution(null);
      setStopPending(false);
      clearDeveloperAttachments();
      return undefined;
    }

    const controller = new AbortController();
    let timer = null;

    async function poll() {
      try {
        const query = new URLSearchParams({ organizationId });
        const response = await fetch(`/api/operator/live-execution?${query.toString()}`, {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({}));
        if (!controller.signal.aborted && response.ok) {
          const next = result?.live_execution || null;
          setLiveExecution(next);
          if (next?.stop_requested !== true) setStopPending(false);
        }
      } catch (error) {
        if (error?.name !== "AbortError") {
          console.debug("AVANTIQO_LIVE_EXECUTION_POLL_FAILED", error?.message || error);
        }
      }
      if (!controller.signal.aborted) {
        timer = window.setTimeout(poll, LIVE_POLL_MS);
      }
    }

    poll();
    return () => {
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [organizationId]);

  async function requestStop() {
    if (!organizationId || stopPending) return;
    setStopPending(true);
    try {
      const response = await fetch("/api/operator/live-execution", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ organizationId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || "Stop request failed");
      }
    } catch (error) {
      console.error("AVANTIQO_LIVE_EXECUTION_STOP_FAILED", error);
      setStopPending(false);
    }
  }

  const liveActive = recentLiveExecution(liveExecution);
  const liveEvent = liveExecution?.latest_event || null;

  useEffect(() => {
    const root = rootRef.current;
    const section = root?.querySelector(
      '[data-avantiqo-home-intelligence="true"]',
    );
    const scroller = Array.from(section?.children || []).find((child) =>
      child?.classList?.contains("overflow-y-auto"),
    );

    if (!(scroller instanceof HTMLElement)) return undefined;

    let pinnedToLatest = true;
    let frame = null;

    function markGenericThinkingRows() {
      for (const node of Array.from(scroller.children)) {
        if (
          text(node.textContent).includes(
            "Thinking, checking context and connected capabilities…",
          )
        ) {
          node.setAttribute("data-avantiqo-generic-thinking", "true");
        }
      }
    }

    function isNearLatest() {
      return (
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <=
        LATEST_THRESHOLD_PX
      );
    }

    function scrollToLatest(behavior = "auto") {
      scroller.scrollTo({
        top: scroller.scrollHeight,
        behavior,
      });
    }

    function scheduleLatest(behavior = "auto") {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        markGenericThinkingRows();
        scrollToLatest(behavior);
      });
    }

    function handleScroll() {
      pinnedToLatest = isNearLatest();
    }

    function handleKeyDown(event) {
      if (event.key === "Enter" && !event.shiftKey) {
        pinnedToLatest = true;
      }
    }

    function handleClick(event) {
      if (event.target?.closest?.("button")) {
        pinnedToLatest = true;
      }
    }

    scroller.addEventListener("scroll", handleScroll, { passive: true });
    section.addEventListener("keydown", handleKeyDown, true);
    section.addEventListener("click", handleClick, true);

    const observer = new MutationObserver((mutations) => {
      markGenericThinkingRows();
      if (!pinnedToLatest) return;
      const conversationRowsChanged = mutations.some(
        (mutation) =>
          mutation.type === "childList" &&
          mutation.target === scroller &&
          (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0),
      );
      if (conversationRowsChanged) scheduleLatest("smooth");
    });
    observer.observe(scroller, { childList: true });

    markGenericThinkingRows();
    scheduleLatest("auto");
    const settleTimer = window.setTimeout(() => {
      if (pinnedToLatest) scheduleLatest("auto");
    }, 250);

    return () => {
      window.clearTimeout(settleTimer);
      if (frame !== null) cancelAnimationFrame(frame);
      observer.disconnect();
      scroller.removeEventListener("scroll", handleScroll);
      section.removeEventListener("keydown", handleKeyDown, true);
      section.removeEventListener("click", handleClick, true);
    };
  }, [organizationId]);

  return (
    <div
      ref={rootRef}
      data-avantiqo-home-dock="true"
      data-avantiqo-live-active={liveActive ? "true" : "false"}
      className="min-w-0"
    >
      {liveActive && liveEvent ? (
        <div
          data-avantiqo-live-execution-panel="true"
          className="mb-3 rounded-2xl border border-[#D6A66A]/25 bg-black/35 px-4 py-3"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[#D6A66A]/80">
                <Loader2 size={12} className="animate-spin" />
                <span>{text(liveEvent.lane).toUpperCase() || "AVANTIQO"}</span>
                <span className="text-white/25">·</span>
                <span>{humanPhase(liveEvent.phase)}</span>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] text-white/45">
                  {activityMode(liveEvent)}
                </span>
              </div>
              <div className="mt-2 text-sm font-light leading-5 text-white/80">
                {liveEvent.description || "Working on the current request."}
              </div>

              {text(liveEvent.capability_key) ? (
                <div className="mt-1.5 text-[10px] leading-4 text-white/35">
                  Capability: {liveEvent.capability_key}
                </div>
              ) : null}

              {Array.isArray(liveEvent.files_changed) && liveEvent.files_changed.length ? (
                <div className="mt-1.5 text-[10px] leading-4 text-white/35">
                  Files: {liveEvent.files_changed.slice(-4).join(", ")}
                </div>
              ) : null}

              {text(liveEvent.command) ? (
                <div className="mt-1.5 break-all font-mono text-[10px] leading-4 text-white/35">
                  Running: {liveEvent.command}{Array.isArray(liveEvent.command_args) && liveEvent.command_args.length ? ` ${liveEvent.command_args.join(" ")}` : ""}
                </div>
              ) : null}

              {liveExecution?.stop_requested === true || stopPending ? (
                <div className="mt-2 text-[10px] leading-4 text-amber-200/65">
                  Stop requested. Avantiqo will stop at the next safe execution boundary; an already-running provider call may need to return first.
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={requestStop}
              disabled={stopPending || liveExecution?.stop_requested === true}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-red-300/20 bg-red-500/[0.08] px-2.5 py-1.5 text-[10px] uppercase tracking-[0.12em] text-red-100/70 transition hover:bg-red-500/[0.14] disabled:opacity-40"
            >
              <Square size={10} />
              {stopPending || liveExecution?.stop_requested === true ? "Stopping" : "Stop"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mb-2 flex min-h-8 flex-wrap items-center gap-2 px-1">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept=".txt,.md,.mdx,.js,.jsx,.ts,.tsx,.mjs,.cjs,.json,.yaml,.yml,.toml,.ini,.cfg,.conf,.css,.scss,.html,.xml,.sql,.py,.go,.rs,.java,.kt,.rb,.php,.swift,.c,.cc,.cpp,.h,.hpp,.sh,.zsh,.fish,.log,.csv,.tsv,text/*,application/json"
          onChange={selectDeveloperAttachments}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!organizationId || developerAttachmentPending || liveActive}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.025] px-2.5 py-1.5 text-[10px] uppercase tracking-[0.12em] text-white/45 transition hover:border-[#D6A66A]/25 hover:text-[#D6A66A]/75 disabled:opacity-35"
        >
          {developerAttachmentPending ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Paperclip size={11} />
          )}
          {developerAttachmentPending ? "Attaching" : "Attach files"}
        </button>

        {developerAttachmentSet?.files?.map((file) => (
          <span
            key={`${developerAttachmentSet.attachment_set_id}:${file.id || file.name}`}
            className="max-w-[220px] truncate rounded-full border border-[#D6A66A]/15 bg-[#D6A66A]/[0.05] px-2.5 py-1 text-[10px] text-[#D6A66A]/65"
            title={file.name}
          >
            {file.name}
          </span>
        ))}

        {developerAttachmentSet ? (
          <button
            type="button"
            onClick={clearDeveloperAttachments}
            className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] text-white/30 transition hover:text-white/65"
            title="Remove selected files"
          >
            <X size={11} />
            Clear
          </button>
        ) : null}

        {developerAttachmentError ? (
          <span className="text-[10px] text-red-200/60">{developerAttachmentError}</span>
        ) : null}

        {developerAttachmentSet ? (
          <span className="text-[9px] text-white/25">
            Read-only evidence · next turn only
          </span>
        ) : null}
      </div>

      <HomeAvantiqoIntelligence organizationId={organizationId} />

      <style jsx global>{`
        [data-avantiqo-home-dock="true"]
          [data-avantiqo-home-intelligence="true"] {
          height: clamp(520px, calc(100dvh - 136px), 780px);
          min-height: 0 !important;
        }

        [data-avantiqo-home-dock="true"]
          [data-avantiqo-home-intelligence="true"]
          > div:nth-child(2) {
          min-height: 0 !important;
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
        }

        [data-avantiqo-home-dock="true"][data-avantiqo-live-active="true"]
          [data-avantiqo-generic-thinking="true"] {
          display: none !important;
        }

        @media (min-width: 1280px) {
          [data-avantiqo-home-dock="true"]
            [data-avantiqo-home-intelligence="true"] {
            height: clamp(560px, calc(100dvh - 152px), 900px);
          }
        }
      `}</style>
    </div>
  );
}

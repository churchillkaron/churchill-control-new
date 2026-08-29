"use client";

import { useEffect, useRef } from "react";

import HomeAvantiqoIntelligence from "@/components/operator/HomeAvantiqoIntelligence";

const LATEST_THRESHOLD_PX = 96;
const VOICE_REPLY_INTENT_TTL_MS = 120_000;

function normalizedSpeech(value) {
  return String(value ?? "")
    .trim()
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

export default function HomeAvantiqoIntelligenceDock({ organizationId }) {
  const rootRef = useRef(null);

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

      const message = String(detail.message ?? "").trim();
      if (!message) {
        event.stopImmediatePropagation();
        return;
      }

      const source = String(detail.source ?? "").trim().toLowerCase();
      const explicitlyVoiceInitiated = detail.voice_initiated === true;
      const homeVoiceReply =
        source === "operator" &&
        Date.now() <= voiceReplyIntentUntil;

      // Home speech is opt-in only. A typed turn, restored conversation,
      // background thesis interruption, stale Operator event, or arbitrary
      // urgent event can never authorize TTS. The only accepted cases are an
      // explicitly voice-marked event or the single reply to the latest
      // explicit Home voice command.
      if (!explicitlyVoiceInitiated && !homeVoiceReply) {
        event.stopImmediatePropagation();
        return;
      }

      // Consume Home voice intent exactly once so it cannot bleed into a later
      // typed or background event.
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

      // Only the literal explicit Voice source is Voice. Everything else is
      // text and immediately cancels any unconsumed speech permission.
      const source = String(detail.source ?? "").trim().toLowerCase();
      detail.source = source === "voice" ? "voice" : "text";

      if (detail.source === "voice") {
        voiceReplyIntentUntil = Date.now() + VOICE_REPLY_INTENT_TTL_MS;
      } else {
        voiceReplyIntentUntil = 0;
      }

      // Do not let Avantiqo's own spoken answer feed back into Home as another
      // Voice command. Unrelated human speech remains unaffected.
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
    <div ref={rootRef} data-avantiqo-home-dock="true" className="min-w-0">
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

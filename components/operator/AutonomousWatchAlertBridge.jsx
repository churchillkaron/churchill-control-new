"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Eye, MessageCircle, Sparkles } from "lucide-react";

const POLL_INTERVAL_MS = 30_000;

function text(value) {
  return String(value ?? "").trim();
}

function alertSpeech(alert) {
  const parts = [
    "I need your attention.",
    text(alert?.title),
    text(alert?.message),
    text(alert?.recommended_next_move)
      ? `My recommended next move is ${text(alert.recommended_next_move)}`
      : "",
  ].filter(Boolean);
  return parts.join(" ");
}

export default function AutonomousWatchAlertBridge({ organizationId }) {
  const [alert, setAlert] = useState(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const activeRequestRef = useRef(false);

  const loadAlert = useCallback(async () => {
    if (!organizationId || activeRequestRef.current) return;
    activeRequestRef.current = true;

    try {
      const query = new URLSearchParams({ organizationId });
      const response = await fetch(
        `/api/operator/autonomous-watch/alert?${query.toString()}`,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) return;

      const nextAlert = result?.alert || null;
      setAlert(nextAlert);

      const dedupeKey = text(nextAlert?.dedupe_key);
      if (
        dedupeKey &&
        text(nextAlert?.mode).toLowerCase() === "interrupt"
      ) {
        const storageKey = `avantiqo:autonomous-watch-spoken:${organizationId}:${dedupeKey}`;
        let spoken = false;
        try {
          spoken = window.sessionStorage.getItem(storageKey) === "1";
        } catch {
          spoken = false;
        }

        if (!spoken) {
          try {
            window.sessionStorage.setItem(storageKey, "1");
          } catch {
            // Session storage only prevents repeated local speech.
          }
          const message = alertSpeech(nextAlert);
          if (message) {
            window.dispatchEvent(
              new CustomEvent("avantiqo:speak", {
                detail: {
                  message,
                  source: "synthetic-intelligence-autonomous-watch",
                  priority: "urgent",
                  dedupe_key: dedupeKey,
                },
              }),
            );
          }
        }
      }
    } catch (error) {
      console.error("AVANTIQO_AUTONOMOUS_WATCH_ALERT_LOAD_FAILED", error);
    } finally {
      activeRequestRef.current = false;
    }
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) {
      setAlert(null);
      return undefined;
    }

    loadAlert();
    const timer = window.setInterval(loadAlert, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [organizationId, loadAlert]);

  async function acknowledge() {
    const dedupeKey = text(alert?.dedupe_key);
    if (!organizationId || !dedupeKey || acknowledging) return;

    setAcknowledging(true);
    try {
      const response = await fetch("/api/operator/autonomous-watch/alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          organizationId,
          dedupeKey,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result?.success !== false) setAlert(null);
    } catch (error) {
      console.error("AVANTIQO_AUTONOMOUS_WATCH_ALERT_ACK_FAILED", error);
    } finally {
      setAcknowledging(false);
    }
  }

  function discuss() {
    if (!alert) return;
    const message = [
      "Let's discuss this autonomous business alert.",
      text(alert.title),
      text(alert.message),
      text(alert.recommended_next_move)
        ? `Your recommended next move was: ${text(alert.recommended_next_move)}`
        : "",
      "Explain your reasoning, challenge my assumptions, and tell me what you would do next.",
    ]
      .filter(Boolean)
      .join(" ");

    window.dispatchEvent(
      new CustomEvent("avantiqo:home-command", {
        detail: {
          message,
          source: "text",
        },
      }),
    );
  }

  if (!alert) return null;

  const urgent = text(alert.mode).toLowerCase() === "interrupt";

  return (
    <div
      data-avantiqo-autonomous-watch-alert="true"
      className="mx-6 mt-6 rounded-3xl border border-[#D6A66A]/30 bg-[#D6A66A]/[0.07] p-5 text-white shadow-[0_24px_80px_rgba(0,0,0,0.35)]"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[#D6A66A]/85">
            {urgent ? <AlertTriangle size={13} /> : <Sparkles size={13} />}
            Synthetic Intelligence · {urgent ? "Needs your attention" : "Business update"}
          </div>
          <div className="mt-2 text-lg font-light text-white/90">
            {alert.title || "Business thesis changed"}
          </div>
          {text(alert.message) ? (
            <div className="mt-2 max-w-4xl text-sm leading-6 text-white/55">
              {alert.message}
            </div>
          ) : null}
          {text(alert.recommended_next_move) ? (
            <div className="mt-3 text-sm leading-6 text-[#D6A66A]/85">
              Recommended next move: {alert.recommended_next_move}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={discuss}
            className="inline-flex items-center gap-2 rounded-full border border-[#D6A66A]/30 bg-[#D6A66A]/10 px-3.5 py-2 text-xs text-[#E7C48E] transition hover:bg-[#D6A66A]/15"
          >
            <MessageCircle size={13} />
            Discuss
          </button>
          <button
            type="button"
            onClick={acknowledge}
            disabled={acknowledging}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3.5 py-2 text-xs text-white/55 transition hover:text-white disabled:opacity-40"
          >
            <Eye size={13} />
            {acknowledging ? "Saving…" : "Seen"}
          </button>
        </div>
      </div>

      <div className="mt-3 text-[10px] leading-4 text-white/30">
        This is an evidence-backed recommendation, not authorization. Avantiqo will not execute the recommended business action until the normal permission, confirmation and approval rules are satisfied.
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

import CodeEngineeringIntelligenceCard from "@/components/operator/CodeEngineeringIntelligenceCard";
import CodeEngineeringPlanCard from "@/components/operator/CodeEngineeringPlanCard";

const ACTIVE_POLL_MS = 2200;
const IDLE_POLL_MS = 7000;
const ACTIVE_STATES = new Set([
  "active",
  "executing",
  "in_progress",
  "pending",
  "planner_pending",
  "queued",
  "running",
  "verifying",
  "working",
]);

function text(value) {
  return String(value ?? "").trim();
}

function progressActive(progress) {
  const state = text(progress?.state_status).toLowerCase();
  const event = text(progress?.latest_event?.status).toLowerCase();
  return ACTIVE_STATES.has(state) || ACTIVE_STATES.has(event);
}

export default function CodeEngineeringIntelligenceLiveCard({
  organizationId,
  theme = "light",
  compact = false,
  className = "",
}) {
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    if (!organizationId) {
      setProgress(null);
      return undefined;
    }

    const controller = new AbortController();
    let timer = null;

    async function poll() {
      let active = false;
      try {
        const response = await fetch(
          `/api/operator/code/progress?organizationId=${encodeURIComponent(organizationId)}`,
          {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const body = await response.json().catch(() => ({}));
        if (!controller.signal.aborted && response.ok && body?.success === true) {
          const nextProgress = body?.live_progress || null;
          active = progressActive(nextProgress);
          setProgress(nextProgress);
        }
      } catch (error) {
        if (error?.name !== "AbortError") {
          console.debug("AVANTIQO_CODE_INTELLIGENCE_VISIBLE_FEED_FAILED", error?.message || error);
        }
      }

      if (!controller.signal.aborted) {
        timer = window.setTimeout(poll, active ? ACTIVE_POLL_MS : IDLE_POLL_MS);
      }
    }

    poll();
    return () => {
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [organizationId]);

  if (!progress) return null;

  return (
    <div className={`space-y-3 ${className}`} data-avantiqo-code-intelligence-live-feed="true">
      <CodeEngineeringPlanCard
        plan={progress?.engineering_plan || null}
        theme={theme}
        compact={compact}
      />
      <CodeEngineeringIntelligenceCard
        progress={progress}
        theme={theme}
        compact={compact}
      />
    </div>
  );
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const ACTIVE_POLL_MS = 750;
const ACTIVE_REFRESH_BURST_POLL_MS = 250;
const ACTIVE_REFRESH_BURST_POLLS = 8;
const IDLE_POLL_MS = 15000;
const HIDDEN_POLL_MS = 60000;
const ACTIVE_DETAIL_REFRESH_EVERY = 20;
const ACTIVE_STALE_MS = 30 * 60 * 1000;
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
  "portfolio",
]);
const ACTIVE_PORTFOLIO_STATES = new Set([
  "engineering_active",
  "reassessing_verified_main",
  "waiting_verified_persistence",
  "waiting_governed_persistence",
]);
const TERMINAL_EVENT_STATES = new Set([
  "blocked",
  "cancelled",
  "canceled",
  "completed",
  "failed",
  "repair_required",
  "stopped",
]);

const CodeProgressFeedContext = createContext(null);

function text(value) {
  return String(value ?? "").trim();
}

function timestamp(value) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function codeProgressIsActive(progress) {
  if (!progress) return false;
  const updatedAt = Math.max(
    timestamp(progress?.updated_at),
    timestamp(progress?.latest_event?.at),
  );
  if (updatedAt && Date.now() - updatedAt > ACTIVE_STALE_MS) return false;

  const state = text(progress?.state_status).toLowerCase();
  const event = text(progress?.latest_event?.status).toLowerCase();
  if (TERMINAL_EVENT_STATES.has(event)) return false;
  const portfolio = text(
    progress?.product_engineering_portfolio?.status,
  ).toLowerCase();
  return (
    ACTIVE_STATES.has(state) ||
    ACTIVE_STATES.has(event) ||
    ACTIVE_PORTFOLIO_STATES.has(portfolio)
  );
}

export function CodeProgressFeedProvider({ organizationId, children }) {
  const [progress, setProgress] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [found, setFound] = useState(false);
  const [error, setError] = useState(null);
  const [deviceSessionScope, setDeviceSessionScope] = useState(null);
  const mounted = useRef(false);
  const refreshSignal = useRef(0);
  const burstPollsRemaining = useRef(0);

  const patchProgress = useCallback((updater) => {
    setProgress((current) =>
      typeof updater === "function" ? updater(current) : updater,
    );
  }, []);

  const updatePortfolio = useCallback((portfolio) => {
    if (!portfolio) return;
    setProgress((current) => {
      if (!current) {
        return {
          state_status: "portfolio",
          product_engineering_portfolio: portfolio,
        };
      }
      return {
        ...current,
        product_engineering_portfolio: portfolio,
      };
    });
  }, []);

  const requestRefresh = useCallback(() => {
    refreshSignal.current += 1;
    burstPollsRemaining.current = Math.max(
      burstPollsRemaining.current,
      ACTIVE_REFRESH_BURST_POLLS,
    );
    window.dispatchEvent(new CustomEvent("avantiqo:code-progress-refresh"));
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!organizationId) {
      setProgress(null);
      setUpdatedAt(null);
      setFound(false);
      setError(null);
      return undefined;
    }

    const controller = new AbortController();
    let timer = null;
    let inFlight = false;
    let pollSequence = 0;
    let lastActive = false;
    let consecutiveFailures = 0;

    async function poll() {
      if (controller.signal.aborted || inFlight) return;
      inFlight = true;
      let active = lastActive;
      const includeDetails =
        pollSequence === 0 ||
        !lastActive ||
        pollSequence % ACTIVE_DETAIL_REFRESH_EVERY === 0;
      pollSequence += 1;
      try {
        const response = await fetch(
          `/api/operator/code/progress?organizationId=${encodeURIComponent(organizationId)}${deviceSessionScope ? `&deviceSessionId=${encodeURIComponent(deviceSessionScope)}` : ""}&details=${includeDetails ? "1" : "0"}`,
          {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const body = await response.json().catch(() => ({}));
        if (!controller.signal.aborted && mounted.current) {
          if (response.ok && body?.success === true) {
            const nextProgress = body?.live_progress || null;
            active = codeProgressIsActive(nextProgress);
            lastActive = active;
            setProgress((current) => nextProgress
              ? {
                  ...nextProgress,
                  ...(body?.details_included === true
                    ? {}
                    : {
                        engineering_intelligence:
                          nextProgress?.engineering_intelligence ??
                          current?.engineering_intelligence ??
                          null,
                        product_engineering_portfolio:
                          nextProgress?.product_engineering_portfolio ??
                          current?.product_engineering_portfolio ??
                          null,
                      }),
                }
              : nextProgress);
            setUpdatedAt(body?.updated_at || null);
            setFound(body?.found === true);
            setError(null);
            consecutiveFailures = 0;
          } else {
            consecutiveFailures += 1;
            setError(text(body?.error) || `CODE_PROGRESS_HTTP_${response.status}`);
          }
        }
      } catch (pollError) {
        if (
          pollError?.name !== "AbortError" &&
          !controller.signal.aborted &&
          mounted.current
        ) {
          consecutiveFailures += 1;
          setError(text(pollError?.message || pollError) || "CODE_PROGRESS_FAILED");
          console.debug(
            "AVANTIQO_CODE_PROGRESS_SHARED_FEED_FAILED",
            pollError?.message || pollError,
          );
        }
      } finally {
        inFlight = false;
      }

      if (!controller.signal.aborted && mounted.current) {
        const visible = document.visibilityState === "visible";
        const burstActive =
          visible &&
          active &&
          burstPollsRemaining.current > 0;
        if (burstActive) burstPollsRemaining.current -= 1;
        const baseDelay = visible
          ? (active
              ? (burstActive ? ACTIVE_REFRESH_BURST_POLL_MS : ACTIVE_POLL_MS)
              : IDLE_POLL_MS)
          : HIDDEN_POLL_MS;
        const failureDelay = consecutiveFailures
          ? Math.min(60000, baseDelay * (2 ** Math.min(consecutiveFailures, 4)))
          : baseDelay;
        timer = window.setTimeout(poll, failureDelay);
      }
    }

    function refreshNow() {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(poll, 0);
    }

    function visibilityChanged() {
      if (document.visibilityState === "visible") refreshNow();
    }

    window.addEventListener("avantiqo:code-progress-refresh", refreshNow);
    document.addEventListener("visibilitychange", visibilityChanged);
    poll();
    return () => {
      controller.abort();
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("avantiqo:code-progress-refresh", refreshNow);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [organizationId, deviceSessionScope]);

  const value = useMemo(
    () => ({
      organizationId,
      progress,
      found,
      updatedAt,
      error,
      active: codeProgressIsActive(progress),
      deviceSessionScope,
      setDeviceSessionScope,
      patchProgress,
      updatePortfolio,
      requestRefresh,
      contract: "AVANTIQO_CODE_PROGRESS_SHARED_FEED_V1",
      single_progress_poll_per_surface: true,
    }),
    [
      organizationId,
      progress,
      found,
      updatedAt,
      error,
      deviceSessionScope,
      patchProgress,
      updatePortfolio,
      requestRefresh,
    ],
  );

  return (
    <CodeProgressFeedContext.Provider value={value}>
      {children}
    </CodeProgressFeedContext.Provider>
  );
}

export function useCodeProgressFeed() {
  const value = useContext(CodeProgressFeedContext);
  if (!value) {
    throw new Error("CODE_PROGRESS_FEED_PROVIDER_REQUIRED");
  }
  return value;
}

export default CodeProgressFeedProvider;

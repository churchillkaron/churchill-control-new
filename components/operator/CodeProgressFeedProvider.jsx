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

const ACTIVE_POLL_MS = 1800;
const IDLE_POLL_MS = 6000;
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
  const mounted = useRef(false);
  const refreshSignal = useRef(0);

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

    async function poll() {
      if (controller.signal.aborted || inFlight) return;
      inFlight = true;
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
        if (!controller.signal.aborted && mounted.current) {
          if (response.ok && body?.success === true) {
            const nextProgress = body?.live_progress || null;
            active = codeProgressIsActive(nextProgress);
            setProgress(nextProgress);
            setUpdatedAt(body?.updated_at || null);
            setFound(body?.found === true);
            setError(null);
          } else {
            setError(text(body?.error) || `CODE_PROGRESS_HTTP_${response.status}`);
          }
        }
      } catch (pollError) {
        if (
          pollError?.name !== "AbortError" &&
          !controller.signal.aborted &&
          mounted.current
        ) {
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
        timer = window.setTimeout(
          poll,
          active ? ACTIVE_POLL_MS : IDLE_POLL_MS,
        );
      }
    }

    function refreshNow() {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(poll, 0);
    }

    window.addEventListener("avantiqo:code-progress-refresh", refreshNow);
    poll();
    return () => {
      controller.abort();
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("avantiqo:code-progress-refresh", refreshNow);
    };
  }, [organizationId]);

  const value = useMemo(
    () => ({
      organizationId,
      progress,
      found,
      updatedAt,
      error,
      active: codeProgressIsActive(progress),
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

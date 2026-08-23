"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Gauge,
  MessageCircle,
  RefreshCw,
  Target,
  TimerReset,
  TrendingUp,
  XCircle,
} from "lucide-react";

const REFRESH_INTERVAL_MS = 60_000;

function text(value) {
  return String(value ?? "").trim();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function percent(value, { learning = "Learning" } = {}) {
  const numeric = numberOrNull(value);
  if (numeric === null) return learning;
  return `${Math.round(Math.max(0, Math.min(1, numeric)) * 100)}%`;
}

function percentagePoints(value) {
  const numeric = numberOrNull(value);
  if (numeric === null) return "Learning";
  return `${(Math.max(0, numeric) * 100).toFixed(numeric < 0.1 ? 1 : 0)} pp`;
}

function score(value) {
  const numeric = numberOrNull(value);
  if (numeric === null) return "Learning";
  return numeric.toFixed(3);
}

function timeLabel(value) {
  if (!value) return "Not scheduled";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Not scheduled";
  const diff = timestamp - Date.now();
  const abs = Math.abs(diff);
  if (abs < 60_000) return diff >= 0 ? "Within a minute" : "Just now";
  const minutes = Math.round(abs / 60_000);
  if (minutes < 60) return diff >= 0 ? `In ${minutes} min` : `${minutes} min ago`;
  const hours = Math.round(abs / 3_600_000);
  if (hours < 24) return diff >= 0 ? `In ${hours} h` : `${hours} h ago`;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function resolutionLabel(value) {
  const normalized = text(value).toLowerCase();
  if (normalized === "confirmed") return "Confirmed";
  if (normalized === "contradicted") return "Contradicted";
  if (normalized === "inconclusive") return "Inconclusive";
  if (normalized === "superseded") return "Superseded";
  return normalized ? normalized.replaceAll("_", " ") : "No resolution yet";
}

function Stat({ label, value, detail, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-white/[0.065] bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] uppercase tracking-[0.17em] text-white/28">{label}</span>
        <Icon size={13} className="text-[#D6A66A]/55" />
      </div>
      <div className="mt-2 text-[17px] font-light text-white/85">{value}</div>
      <div className="mt-1 min-h-4 text-[10px] leading-4 text-white/30">{detail}</div>
    </div>
  );
}

export default function SyntheticIntelligenceForecastTrackRecord({ organizationId }) {
  const [trackRecord, setTrackRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!organizationId) return;
    if (!quiet) setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ organizationId });
      const response = await fetch(
        `/api/operator/autonomous-watch/settings?${query.toString()}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || "Forecast track record unavailable");
      }
      setTrackRecord(result?.prediction_accountability || null);
    } catch (loadError) {
      setError(loadError?.message || "Forecast track record unavailable");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) {
      setTrackRecord(null);
      return undefined;
    }
    load();
    const timer = window.setInterval(() => load({ quiet: true }), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [organizationId, load]);

  const openPredictions = Number(trackRecord?.open_predictions || 0);
  const scoredResolved = Number(trackRecord?.scored_resolved || 0);
  const confirmed = Number(trackRecord?.confirmed || 0);
  const contradicted = Number(trackRecord?.contradicted || 0);
  const inconclusive = Number(trackRecord?.inconclusive || 0);
  const superseded = Number(trackRecord?.superseded || 0);
  const lastResolution = trackRecord?.last_resolution || null;

  const maturity = useMemo(() => {
    if (scoredResolved <= 0) {
      return {
        label: "Learning baseline",
        detail: "No scored forecast has reached its evaluation horizon yet.",
      };
    }
    if (scoredResolved < 5) {
      return {
        label: "Early calibration",
        detail: `${scoredResolved} scored outcome${scoredResolved === 1 ? "" : "s"} · treat accuracy as directional only.`,
      };
    }
    if (scoredResolved < 20) {
      return {
        label: "Building track record",
        detail: `${scoredResolved} scored outcomes · calibration is becoming more informative.`,
      };
    }
    return {
      label: "Established track record",
      detail: `${scoredResolved} scored outcomes across the bounded recent calibration window.`,
    };
  }, [scoredResolved]);

  function discussTrackRecord() {
    const message = [
      "Review the current Synthetic Intelligence forecast track record as my business partner.",
      `Open verifiable forecasts: ${openPredictions}.`,
      `Scored resolved forecasts: ${scoredResolved}.`,
      scoredResolved > 0
        ? `Confirmed: ${confirmed}; contradicted: ${contradicted}; observed success rate: ${percent(trackRecord?.observed_success_rate, { learning: "not available" })}.`
        : "No forecast has reached a scored horizon yet, so do not claim an accuracy rate.",
      numberOrNull(trackRecord?.mean_confidence) !== null
        ? `Mean stated confidence: ${percent(trackRecord?.mean_confidence)}.`
        : null,
      numberOrNull(trackRecord?.calibration_gap) !== null
        ? `Calibration gap: ${percentagePoints(trackRecord?.calibration_gap)}.`
        : null,
      numberOrNull(trackRecord?.brier_score) !== null
        ? `Brier score: ${score(trackRecord?.brier_score)}.`
        : null,
      lastResolution?.prediction
        ? `Latest resolved forecast: ${lastResolution.prediction} Resolution: ${resolutionLabel(lastResolution.resolution)}.`
        : null,
      "Explain where the forecasting appears overconfident or underconfident, what can genuinely be learned from the sample size, and how future reasoning should improve. Do not change settings or execute any business action.",
    ].filter(Boolean).join(" ");

    window.dispatchEvent(
      new CustomEvent("avantiqo:home-command", {
        detail: { message, source: "text" },
      }),
    );
  }

  if (!organizationId) return null;

  return (
    <section
      data-avantiqo-synthetic-intelligence-forecast-track-record="true"
      className="rounded-3xl border border-white/[0.075] bg-[linear-gradient(145deg,rgba(255,255,255,0.025),rgba(214,166,106,0.035)_55%,rgba(0,0,0,0.12))] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.22)]"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[#D6A66A]/70">
            <Target size={14} />
            Forecast track record
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="text-lg font-light text-white/88">Prediction accountability</div>
            <div className="rounded-full border border-[#D6A66A]/20 bg-[#D6A66A]/[0.07] px-2.5 py-1 text-[10px] text-[#E7C48E]/75">
              {maturity.label}
            </div>
          </div>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-white/35">
            Only mechanically verifiable forecasts are scored. Synthetic Intelligence cannot grade itself; registered live evidence resolves each forecast at its declared horizon.
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={discussTrackRecord}
            className="inline-flex items-center gap-2 rounded-full border border-[#D6A66A]/20 bg-[#D6A66A]/[0.06] px-3.5 py-2 text-[11px] text-[#E7C48E]/75 transition hover:bg-[#D6A66A]/10 hover:text-[#F2D6AA]"
          >
            <MessageCircle size={13} />
            Discuss track record
          </button>
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            aria-label="Refresh forecast track record"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-black/20 text-white/35 transition hover:text-white/70 disabled:opacity-40"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-400/15 bg-red-400/[0.05] px-4 py-3 text-xs text-red-100/60">
          {error}
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label="Open forecasts"
          value={openPredictions}
          detail={trackRecord?.next_evaluation_at ? `Next evaluation ${timeLabel(trackRecord.next_evaluation_at).toLowerCase()}` : "No verifiable forecast is due yet"}
          icon={TimerReset}
        />
        <Stat
          label="Scored outcomes"
          value={scoredResolved}
          detail={`${confirmed} confirmed · ${contradicted} contradicted`}
          icon={Activity}
        />
        <Stat
          label="Observed hit rate"
          value={percent(trackRecord?.observed_success_rate)}
          detail={scoredResolved > 0 ? `${confirmed} of ${scoredResolved} scored forecasts confirmed` : "No accuracy claim until a forecast reaches its horizon"}
          icon={TrendingUp}
        />
        <Stat
          label="Calibration"
          value={percentagePoints(trackRecord?.calibration_gap)}
          detail={numberOrNull(trackRecord?.brier_score) === null ? "Brier score begins after scored probabilistic forecasts" : `Confidence gap · Brier ${score(trackRecord.brier_score)} · lower is better`}
          icon={Gauge}
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.17em] text-white/28">Latest resolution</div>
              <div className="mt-2 text-sm font-light text-white/72">
                {lastResolution?.prediction || "No forecast has resolved yet."}
              </div>
            </div>
            {lastResolution?.resolution === "confirmed" ? (
              <CheckCircle2 size={18} className="shrink-0 text-[#D6A66A]/70" />
            ) : lastResolution?.resolution === "contradicted" ? (
              <XCircle size={18} className="shrink-0 text-white/35" />
            ) : (
              <Target size={18} className="shrink-0 text-white/25" />
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-white/30">
            <span>{resolutionLabel(lastResolution?.resolution)}</span>
            {lastResolution?.resolved_at ? <span>Resolved {timeLabel(lastResolution.resolved_at).toLowerCase()}</span> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-[0.17em] text-white/28">Resolution ledger</div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] text-white/45">
            <div className="flex items-center justify-between gap-2"><span>Confirmed</span><span className="text-white/72">{confirmed}</span></div>
            <div className="flex items-center justify-between gap-2"><span>Contradicted</span><span className="text-white/72">{contradicted}</span></div>
            <div className="flex items-center justify-between gap-2"><span>Inconclusive</span><span className="text-white/72">{inconclusive}</span></div>
            <div className="flex items-center justify-between gap-2"><span>Superseded</span><span className="text-white/72">{superseded}</span></div>
          </div>
          <div className="mt-3 border-t border-white/[0.05] pt-3 text-[10px] leading-4 text-white/27">
            {maturity.detail} Unverifiable strategic outlook is never counted as a hit or miss.
          </div>
        </div>
      </div>
    </section>
  );
}

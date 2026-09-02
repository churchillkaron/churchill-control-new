"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, LineChart, LoaderCircle, Settings2, X } from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import { ANALYTICS_METRICS } from "@/lib/analytics/semantic/AnalyticsMetricCatalog";

function clean(value) {
  return String(value ?? "").trim();
}

export default function AnalyticsControlPanel({ organizationId }) {
  const businessContext = useBusinessContext() || {};
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const periodId = businessContext.period_id || businessContext.period?.id || null;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("capture");
  const [metricId, setMetricId] = useState(ANALYTICS_METRICS[0]?.id || "");
  const [targetValue, setTargetValue] = useState("");
  const [targetDirection, setTargetDirection] = useState("HIGHER_IS_BETTER");
  const [warningThreshold, setWarningThreshold] = useState("");
  const [criticalThreshold, setCriticalThreshold] = useState("");
  const [conditionType, setConditionType] = useState("ABOVE");
  const [thresholdValue, setThresholdValue] = useState("");
  const [thresholdUpper, setThresholdUpper] = useState("");
  const [forecastMethod, setForecastMethod] = useState("LINEAR_TREND");
  const [horizonDays, setHorizonDays] = useState("30");
  const [lookbackDays, setLookbackDays] = useState("90");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const metric = useMemo(() => ANALYTICS_METRICS.find((entry) => entry.id === metricId) || null, [metricId]);

  function scopePayload() {
    return {
      organizationId,
      entityId: entityId || null,
      periodId: periodId || null,
    };
  }

  async function post(path, payload) {
    const response = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json?.success === false) throw new Error(json?.error || `Analytics action failed (${response.status})`);
    return json;
  }

  async function run(action) {
    if (!organizationId || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      if (action === "capture") {
        const result = await post("/api/workspace/analytics/evaluate", scopePayload());
        setMessage({ type: "success", text: `Captured ${result.captured || 0} metrics · ${result.triggered?.length || 0} alerts triggered.` });
      }
      if (action === "target") {
        await post("/api/workspace/analytics/control", {
          ...scopePayload(),
          action: "configure_metric",
          metricId,
          targetValue: targetValue === "" ? null : targetValue,
          targetDirection,
          warningThreshold: warningThreshold === "" ? null : warningThreshold,
          criticalThreshold: criticalThreshold === "" ? null : criticalThreshold,
        });
        setMessage({ type: "success", text: `${metric?.label || "Metric"} target saved.` });
      }
      if (action === "alert") {
        await post("/api/workspace/analytics/control", {
          ...scopePayload(),
          action: "create_alert_rule",
          metricId,
          name: `${metric?.label || metricId} alert`,
          conditionType,
          thresholdValue,
          thresholdUpper: conditionType === "OUTSIDE_RANGE" ? thresholdUpper : null,
          cooldownMinutes: 60,
        });
        setMessage({ type: "success", text: `${metric?.label || "Metric"} alert rule created.` });
      }
      if (action === "forecast") {
        const result = await post("/api/workspace/analytics/forecast", {
          ...scopePayload(),
          metricId,
          method: forecastMethod,
          horizonDays,
          lookbackDays,
        });
        setMessage({ type: "success", text: `${result.forecast?.length || 0}-point forecast created from ${result.evidenceCount || 0} captured actuals.` });
      }
    } catch (error) {
      setMessage({ type: "error", text: error?.message || "Analytics action failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex h-11 items-center gap-2 rounded-xl border border-black/10 bg-[#1F1E1B] px-4 text-[12px] font-medium text-white shadow-[0_12px_36px_rgba(0,0,0,0.18)] transition hover:bg-black"
      >
        <Settings2 size={15} /> Analytics controls
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-3 backdrop-blur-[2px] sm:items-center">
          <div className="w-full max-w-[720px] overflow-hidden rounded-[24px] border border-black/10 bg-[#F7F6F3] shadow-[0_30px_80px_rgba(0,0,0,0.22)]">
            <div className="flex items-center justify-between border-b border-black/[0.07] bg-white px-5 py-4">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#A37849]">Governed Analytics</div>
                <div className="mt-1 text-[17px] font-semibold tracking-[-0.02em] text-[#292622]">Metric controls</div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/[0.08] text-[#6F6A63] hover:bg-[#F6F4F0]"><X size={15} /></button>
            </div>

            <div className="grid grid-cols-4 gap-1 border-b border-black/[0.07] bg-white px-4 pb-3">
              {[
                ["capture", "Capture", BarChart3],
                ["target", "Target", CheckCircle2],
                ["alert", "Alert", AlertTriangle],
                ["forecast", "Forecast", LineChart],
              ].map(([id, label, Icon]) => (
                <button key={id} type="button" onClick={() => { setMode(id); setMessage(null); }} className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-medium ${mode === id ? "bg-[#1F1E1B] text-white" : "text-[#69635C] hover:bg-[#F7F5F1]"}`}>
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>

            <div className="space-y-4 p-5">
              {mode !== "capture" ? (
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-[#7D776F]">Metric</span>
                  <select value={metricId} onChange={(event) => setMetricId(event.target.value)} className="h-10 w-full rounded-xl border border-black/[0.09] bg-white px-3 text-[12px] outline-none focus:border-[#D6A66A]">
                    {ANALYTICS_METRICS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label} · {entry.domain}</option>)}
                  </select>
                </label>
              ) : null}

              {mode === "capture" ? (
                <div className="rounded-2xl border border-black/[0.07] bg-white p-4">
                  <div className="text-[13px] font-medium text-[#35312D]">Capture actuals & evaluate rules</div>
                  <p className="mt-1.5 text-[11px] leading-[18px] text-[#7D776F]">Calculates every semantic metric from authoritative domain data, stores one immutable daily snapshot per scalar metric, then evaluates active alert rules with cooldown protection. Mixed currencies are skipped rather than combined.</p>
                  <button type="button" onClick={() => run("capture")} disabled={busy} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[#1F1E1B] px-4 text-[12px] font-medium text-white disabled:opacity-50">
                    {busy ? <LoaderCircle size={14} className="animate-spin" /> : <BarChart3 size={14} />} Capture & evaluate
                  </button>
                </div>
              ) : null}

              {mode === "target" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label><span className="mb-1.5 block text-[10px] font-medium text-[#7D776F]">Target value</span><input value={targetValue} onChange={(event) => setTargetValue(event.target.value)} inputMode="decimal" className="h-10 w-full rounded-xl border border-black/[0.09] bg-white px-3 text-[12px] outline-none focus:border-[#D6A66A]" /></label>
                  <label><span className="mb-1.5 block text-[10px] font-medium text-[#7D776F]">Direction</span><select value={targetDirection} onChange={(event) => setTargetDirection(event.target.value)} className="h-10 w-full rounded-xl border border-black/[0.09] bg-white px-3 text-[12px] outline-none focus:border-[#D6A66A]"><option value="HIGHER_IS_BETTER">Higher is better</option><option value="LOWER_IS_BETTER">Lower is better</option><option value="RANGE">Target range</option><option value="NONE">Reference only</option></select></label>
                  <label><span className="mb-1.5 block text-[10px] font-medium text-[#7D776F]">Warning threshold</span><input value={warningThreshold} onChange={(event) => setWarningThreshold(event.target.value)} inputMode="decimal" className="h-10 w-full rounded-xl border border-black/[0.09] bg-white px-3 text-[12px] outline-none focus:border-[#D6A66A]" /></label>
                  <label><span className="mb-1.5 block text-[10px] font-medium text-[#7D776F]">Critical threshold</span><input value={criticalThreshold} onChange={(event) => setCriticalThreshold(event.target.value)} inputMode="decimal" className="h-10 w-full rounded-xl border border-black/[0.09] bg-white px-3 text-[12px] outline-none focus:border-[#D6A66A]" /></label>
                  <div className="sm:col-span-2"><button type="button" onClick={() => run("target")} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1F1E1B] px-4 text-[12px] font-medium text-white disabled:opacity-50">{busy ? <LoaderCircle size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Save target</button></div>
                </div>
              ) : null}

              {mode === "alert" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label><span className="mb-1.5 block text-[10px] font-medium text-[#7D776F]">Condition</span><select value={conditionType} onChange={(event) => setConditionType(event.target.value)} className="h-10 w-full rounded-xl border border-black/[0.09] bg-white px-3 text-[12px] outline-none focus:border-[#D6A66A]"><option value="ABOVE">Above</option><option value="BELOW">Below</option><option value="OUTSIDE_RANGE">Outside range</option><option value="CHANGE_ABOVE">Change above</option><option value="CHANGE_BELOW">Change below</option><option value="OFF_TARGET">Off target</option></select></label>
                  <label><span className="mb-1.5 block text-[10px] font-medium text-[#7D776F]">Threshold</span><input value={thresholdValue} onChange={(event) => setThresholdValue(event.target.value)} inputMode="decimal" className="h-10 w-full rounded-xl border border-black/[0.09] bg-white px-3 text-[12px] outline-none focus:border-[#D6A66A]" /></label>
                  {conditionType === "OUTSIDE_RANGE" ? <label><span className="mb-1.5 block text-[10px] font-medium text-[#7D776F]">Upper threshold</span><input value={thresholdUpper} onChange={(event) => setThresholdUpper(event.target.value)} inputMode="decimal" className="h-10 w-full rounded-xl border border-black/[0.09] bg-white px-3 text-[12px] outline-none focus:border-[#D6A66A]" /></label> : null}
                  <div className={conditionType === "OUTSIDE_RANGE" ? "self-end" : "sm:col-span-2"}><button type="button" onClick={() => run("alert")} disabled={busy || !clean(thresholdValue)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1F1E1B] px-4 text-[12px] font-medium text-white disabled:opacity-50">{busy ? <LoaderCircle size={14} className="animate-spin" /> : <AlertTriangle size={14} />} Create alert rule</button></div>
                </div>
              ) : null}

              {mode === "forecast" ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <label><span className="mb-1.5 block text-[10px] font-medium text-[#7D776F]">Method</span><select value={forecastMethod} onChange={(event) => setForecastMethod(event.target.value)} className="h-10 w-full rounded-xl border border-black/[0.09] bg-white px-3 text-[12px] outline-none focus:border-[#D6A66A]"><option value="LINEAR_TREND">Linear trend</option><option value="MOVING_AVERAGE">Moving average</option><option value="SEASONAL_NAIVE">Weekday seasonal</option></select></label>
                  <label><span className="mb-1.5 block text-[10px] font-medium text-[#7D776F]">Lookback days</span><input value={lookbackDays} onChange={(event) => setLookbackDays(event.target.value)} inputMode="numeric" className="h-10 w-full rounded-xl border border-black/[0.09] bg-white px-3 text-[12px] outline-none focus:border-[#D6A66A]" /></label>
                  <label><span className="mb-1.5 block text-[10px] font-medium text-[#7D776F]">Horizon days</span><input value={horizonDays} onChange={(event) => setHorizonDays(event.target.value)} inputMode="numeric" className="h-10 w-full rounded-xl border border-black/[0.09] bg-white px-3 text-[12px] outline-none focus:border-[#D6A66A]" /></label>
                  <div className="sm:col-span-3"><p className="mb-3 text-[10px] leading-4 text-[#817B73]">Forecasts require captured actual snapshots. The engine refuses insufficient or mixed-currency evidence.</p><button type="button" onClick={() => run("forecast")} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1F1E1B] px-4 text-[12px] font-medium text-white disabled:opacity-50">{busy ? <LoaderCircle size={14} className="animate-spin" /> : <LineChart size={14} />} Run forecast</button></div>
                </div>
              ) : null}

              {message ? (
                <div className={`rounded-xl border px-3 py-2.5 text-[11px] ${message.type === "success" ? "border-emerald-700/15 bg-emerald-50 text-emerald-900" : "border-red-700/15 bg-red-50 text-red-900"}`}>{message.text}</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

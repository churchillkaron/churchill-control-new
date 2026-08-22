"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BrainCircuit,
  Check,
  ChevronDown,
  Gauge,
  LoaderCircle,
  MessageCircle,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";

const REFRESH_INTERVAL_MS = 60_000;
const FULL_ACCESS_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);

function text(value) {
  return String(value ?? "").trim();
}

function normalizedRole(value) {
  return text(value).toUpperCase();
}

function asInput(value) {
  return value === null || value === undefined ? "" : String(value);
}

function money(value, currency) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  const code = /^[A-Z]{3}$/.test(text(currency).toUpperCase())
    ? text(currency).toUpperCase()
    : "USD";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      minimumFractionDigits: numeric < 10 ? 2 : 0,
      maximumFractionDigits: numeric < 10 ? 4 : 2,
    }).format(numeric);
  } catch {
    return `${numeric.toFixed(2)} ${code}`;
  }
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

function humanReason(value) {
  const reason = text(value);
  if (!reason) return "Ready to reason when live evidence changes.";
  const map = {
    EVIDENCE_UNCHANGED: "Live evidence was unchanged, so no paid reasoning was needed.",
    LIVE_EVIDENCE_CHANGED: "Live evidence changed enough to justify a semantic reasoning pass.",
    BOOTSTRAP_BUSINESS_THESIS: "The first evidence-backed business thesis was established.",
    CONCURRENT_THESIS_UPDATE: "A newer thesis arrived during the scan, so Avantiqo preserved the newer state.",
    AUTONOMOUS_COGNITION_DISABLED: "Autonomous cognition is disabled by policy.",
    AUTONOMOUS_COGNITION_PASS_BUDGET_REACHED: "The rolling paid-reasoning allowance has been reached.",
    AUTONOMOUS_COGNITION_SPEND_BUDGET_WOULD_EXCEED: "The next reasoning pass would exceed the rolling spend ceiling.",
    AUTONOMOUS_COGNITION_WALLET_FLOOR_WOULD_BREACH: "The next reasoning pass would breach the wallet reserve floor.",
    AUTONOMOUS_COGNITION_WALLET_INSUFFICIENT_FOR_ESTIMATE: "The wallet cannot currently cover the estimated next reasoning pass.",
    AUTONOMOUS_COGNITION_DEEP_REASONING_DISABLED: "Evidence monitoring remains active, but paid semantic reasoning is disabled.",
  };
  return map[reason] || reason.replaceAll("_", " ").toLowerCase();
}

function cognitionLabel(mode) {
  const normalized = text(mode).toLowerCase();
  if (normalized === "paid_semantic_reasoning") return "Paid semantic reasoning";
  if (normalized === "deterministic_reuse") return "Deterministic reuse · no AI cost";
  if (normalized === "deterministic_budget_guard") return "Deterministic only · budget protected";
  if (normalized === "concurrent_semantic_preservation") return "Newer thesis preserved";
  return normalized ? normalized.replaceAll("_", " ") : "No autonomous pass yet";
}

function ratio(value, limit) {
  const current = Number(value);
  const maximum = Number(limit);
  if (!Number.isFinite(current) || !Number.isFinite(maximum) || maximum <= 0) return null;
  return Math.max(0, Math.min(1, current / maximum));
}

function Metric({ label, value, detail, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-black/25 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] uppercase tracking-[0.18em] text-white/30">{label}</span>
        <Icon size={13} className="text-[#D6A66A]/55" />
      </div>
      <div className="mt-2 text-[17px] font-light text-white/85">{value}</div>
      <div className="mt-1 min-h-4 text-[10px] leading-4 text-white/30">{detail}</div>
    </div>
  );
}

function Toggle({ checked, onChange, disabled, label, detail }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
      <span className="min-w-0">
        <span className="block text-xs text-white/70">{label}</span>
        <span className="mt-0.5 block text-[10px] leading-4 text-white/30">{detail}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full border transition ${
          checked
            ? "border-[#D6A66A]/45 bg-[#D6A66A]/20"
            : "border-white/10 bg-white/[0.04]"
        } disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <span
          className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition ${
            checked ? "left-6 bg-[#E7C48E]" : "left-1 bg-white/30"
          }`}
        />
      </button>
    </label>
  );
}

export default function SyntheticIntelligenceControlCenter({ organizationId, role }) {
  const [payload, setPayload] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const canManage = FULL_ACCESS_ROLES.has(normalizedRole(role));

  const hydrateDraft = useCallback((result) => {
    const settings = result?.settings || {};
    const budget = settings?.cognition_budget || {};
    setDraft({
      enabled: settings.enabled !== false,
      cognition_budget: {
        enabled: budget.enabled !== false,
        customer_spend_limit: asInput(budget.customer_spend_limit),
        currency: text(budget.currency),
        paid_reasoning_pass_limit: asInput(budget.paid_reasoning_pass_limit),
        minimum_wallet_balance: asInput(budget.minimum_wallet_balance ?? 0),
        deep_reasoning_on_change: budget.deep_reasoning_on_change !== false,
      },
    });
  }, []);

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
        throw new Error(result?.error || "Synthetic Intelligence status unavailable");
      }
      setPayload(result);
      setDraft((current) => {
        if (expanded && current) return current;
        const settings = result?.settings || {};
        const budget = settings?.cognition_budget || {};
        return {
          enabled: settings.enabled !== false,
          cognition_budget: {
            enabled: budget.enabled !== false,
            customer_spend_limit: asInput(budget.customer_spend_limit),
            currency: text(budget.currency),
            paid_reasoning_pass_limit: asInput(budget.paid_reasoning_pass_limit),
            minimum_wallet_balance: asInput(budget.minimum_wallet_balance ?? 0),
            deep_reasoning_on_change: budget.deep_reasoning_on_change !== false,
          },
        };
      });
    } catch (loadError) {
      setError(loadError?.message || "Synthetic Intelligence status unavailable");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [organizationId, expanded]);

  useEffect(() => {
    if (!organizationId) {
      setPayload(null);
      setDraft(null);
      return undefined;
    }
    load();
    const timer = window.setInterval(() => load({ quiet: true }), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [organizationId, load]);

  const settings = payload?.settings || {};
  const budget = payload?.budget_status || {};
  const last = settings?.last_cognition || {};
  const currency = budget?.currency || settings?.cognition_budget?.currency || "USD";
  const spendRatio = ratio(
    budget.customer_spend_rolling_24h,
    budget.customer_spend_limit,
  );
  const passRatio = ratio(
    budget.paid_reasoning_passes_rolling_24h,
    budget.paid_reasoning_pass_limit,
  );

  const status = useMemo(() => {
    if (settings.enabled === false) return { label: "Paused", active: false };
    if (budget.allowed === false && budget.reason === "AUTONOMOUS_COGNITION_DISABLED") {
      return { label: "Monitoring only", active: true };
    }
    return { label: "Watching", active: true };
  }, [settings.enabled, budget.allowed, budget.reason]);

  function updateBudget(key, value) {
    setSaved(false);
    setDraft((current) => ({
      ...current,
      cognition_budget: {
        ...(current?.cognition_budget || {}),
        [key]: value,
      },
    }));
  }

  async function save() {
    if (!organizationId || !draft || !canManage || saving) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const response = await fetch("/api/operator/autonomous-watch/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          organizationId,
          enabled: draft.enabled,
          cognition_budget: {
            ...draft.cognition_budget,
            customer_spend_limit:
              draft.cognition_budget.customer_spend_limit === ""
                ? null
                : Number(draft.cognition_budget.customer_spend_limit),
            paid_reasoning_pass_limit:
              draft.cognition_budget.paid_reasoning_pass_limit === ""
                ? null
                : Number(draft.cognition_budget.paid_reasoning_pass_limit),
            minimum_wallet_balance:
              draft.cognition_budget.minimum_wallet_balance === ""
                ? 0
                : Number(draft.cognition_budget.minimum_wallet_balance),
            currency: text(draft.cognition_budget.currency).toUpperCase() || null,
          },
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || "Autonomous cognition settings could not be saved");
      }
      setPayload(result);
      hydrateDraft(result);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (saveError) {
      setError(saveError?.message || "Autonomous cognition settings could not be saved");
    } finally {
      setSaving(false);
    }
  }

  function discussPolicy() {
    const message = [
      "Review my current Synthetic Intelligence autonomy policy and explain it as my business partner.",
      `Autonomous watch: ${settings.enabled === false ? "paused" : "active"}.`,
      `Last cognition mode: ${cognitionLabel(last.mode)}.`,
      `Rolling autonomous spend: ${money(budget.customer_spend_rolling_24h, currency)}.`,
      budget.customer_spend_limit !== null && budget.customer_spend_limit !== undefined
        ? `Spend ceiling: ${money(budget.customer_spend_limit, currency)}.`
        : "There is no configured autonomous spend ceiling.",
      budget.estimated_next_reasoning_price !== null && budget.estimated_next_reasoning_price !== undefined
        ? `Estimated next reasoning pass: ${money(budget.estimated_next_reasoning_price, currency)}.`
        : "The next reasoning price is not currently available.",
      "Tell me whether the policy is sensible for this business, where it is too conservative or too loose, and what you recommend changing. Do not change any setting until I explicitly ask you to do it.",
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
      data-avantiqo-synthetic-intelligence-control-center="true"
      className="rounded-3xl border border-[#D6A66A]/20 bg-[linear-gradient(145deg,rgba(214,166,106,0.07),rgba(255,255,255,0.018)_36%,rgba(255,255,255,0.008))] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.28)]"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-[#D6A66A]/75">
            <BrainCircuit size={14} />
            Synthetic Intelligence Control
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="text-xl font-light text-white/90">Autonomous business awareness</div>
            <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] ${
              status.active
                ? "border-[#D6A66A]/25 bg-[#D6A66A]/10 text-[#E7C48E]"
                : "border-white/10 bg-white/[0.03] text-white/35"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${status.active ? "bg-[#E7C48E]" : "bg-white/25"}`} />
              {status.label}
            </div>
          </div>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-white/38">
            Cheap registered business reads run first. Paid semantic reasoning is used only when evidence changes and the organization&apos;s wallet and cognition policy allow it.
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={discussPolicy}
            className="inline-flex items-center gap-2 rounded-full border border-[#D6A66A]/20 bg-[#D6A66A]/[0.07] px-3.5 py-2 text-[11px] text-[#E7C48E]/80 transition hover:bg-[#D6A66A]/10 hover:text-[#F2D6AA]"
          >
            <MessageCircle size={13} />
            Discuss policy
          </button>
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            aria-label="Refresh Synthetic Intelligence status"
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
        <Metric
          label="Last cognition"
          value={cognitionLabel(last.mode)}
          detail={humanReason(last.reason)}
          icon={Sparkles}
        />
        <Metric
          label="Autonomous spend · 24h"
          value={money(budget.customer_spend_rolling_24h, currency)}
          detail={
            budget.customer_spend_limit === null || budget.customer_spend_limit === undefined
              ? "No rolling spend ceiling configured"
              : `${Math.round((spendRatio || 0) * 100)}% of ${money(budget.customer_spend_limit, currency)} ceiling`
          }
          icon={WalletCards}
        />
        <Metric
          label="Next reasoning estimate"
          value={money(budget.estimated_next_reasoning_price, currency)}
          detail={budget.provider ? `${budget.provider}${budget.model ? ` · ${budget.model}` : ""}` : "Resolved before every paid pass"}
          icon={Gauge}
        />
        <Metric
          label="Next autonomous check"
          value={timeLabel(settings.next_check_at)}
          detail={settings.last_checked_at ? `Last checked ${timeLabel(settings.last_checked_at).toLowerCase()}` : "No autonomous scan recorded yet"}
          icon={Activity}
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.16em] text-white/30">
            <span>Paid reasoning allowance</span>
            <span className="normal-case tracking-normal text-white/45">
              {budget.paid_reasoning_passes_rolling_24h ?? 0}
              {budget.paid_reasoning_pass_limit ? ` / ${budget.paid_reasoning_pass_limit}` : " passes · no ceiling"}
            </span>
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.05]">
            <div
              className="h-full rounded-full bg-[#D6A66A]/70 transition-all"
              style={{ width: `${Math.round((passRatio ?? 0) * 100)}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.16em] text-white/30">
            <span>Wallet after next pass</span>
            <span className="normal-case tracking-normal text-white/45">
              {money(budget.estimated_wallet_balance_after_next, currency)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-[10px] text-white/30">
            <ShieldCheck size={12} className="text-[#D6A66A]/50" />
            Reserve floor {money(budget.minimum_wallet_balance, currency)} · final reservation remains governed by Service Runtime
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="mt-4 flex w-full items-center justify-between rounded-2xl border border-white/[0.06] bg-black/15 px-4 py-3 text-left transition hover:bg-white/[0.02]"
      >
        <span>
          <span className="block text-xs text-white/65">Autonomy policy</span>
          <span className="mt-0.5 block text-[10px] text-white/28">
            {canManage ? "Owner controls for monitoring, paid cognition and wallet protection" : "Read-only · organization owner access required to change policy"}
          </span>
        </span>
        <ChevronDown size={14} className={`text-white/30 transition ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && draft ? (
        <div className="mt-3 rounded-2xl border border-[#D6A66A]/12 bg-black/25 p-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <Toggle
              checked={draft.enabled !== false}
              disabled={!canManage || saving}
              onChange={(value) => {
                setSaved(false);
                setDraft((current) => ({ ...current, enabled: value }));
              }}
              label="Autonomous watch"
              detail="Keep checking registered live business evidence without waiting for a question."
            />
            <Toggle
              checked={draft.cognition_budget.deep_reasoning_on_change !== false}
              disabled={!canManage || saving}
              onChange={(value) => updateBudget("deep_reasoning_on_change", value)}
              label="Deep reasoning when evidence changes"
              detail="Allow one paid semantic thesis pass after deterministic evidence shows a real change."
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="rounded-2xl border border-white/[0.06] bg-black/20 p-3">
              <span className="block text-[10px] uppercase tracking-[0.14em] text-white/28">24h spend ceiling</span>
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={!canManage || saving}
                value={draft.cognition_budget.customer_spend_limit}
                onChange={(event) => updateBudget("customer_spend_limit", event.target.value)}
                placeholder="No ceiling"
                className="mt-2 w-full bg-transparent text-sm font-light text-white/80 outline-none placeholder:text-white/18 disabled:opacity-40"
              />
            </label>
            <label className="rounded-2xl border border-white/[0.06] bg-black/20 p-3">
              <span className="block text-[10px] uppercase tracking-[0.14em] text-white/28">Paid passes · 24h</span>
              <input
                type="number"
                min="1"
                step="1"
                disabled={!canManage || saving}
                value={draft.cognition_budget.paid_reasoning_pass_limit}
                onChange={(event) => updateBudget("paid_reasoning_pass_limit", event.target.value)}
                placeholder="No ceiling"
                className="mt-2 w-full bg-transparent text-sm font-light text-white/80 outline-none placeholder:text-white/18 disabled:opacity-40"
              />
            </label>
            <label className="rounded-2xl border border-white/[0.06] bg-black/20 p-3">
              <span className="block text-[10px] uppercase tracking-[0.14em] text-white/28">Wallet reserve floor</span>
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={!canManage || saving}
                value={draft.cognition_budget.minimum_wallet_balance}
                onChange={(event) => updateBudget("minimum_wallet_balance", event.target.value)}
                placeholder="0"
                className="mt-2 w-full bg-transparent text-sm font-light text-white/80 outline-none placeholder:text-white/18 disabled:opacity-40"
              />
            </label>
            <label className="rounded-2xl border border-white/[0.06] bg-black/20 p-3">
              <span className="block text-[10px] uppercase tracking-[0.14em] text-white/28">Budget currency</span>
              <input
                type="text"
                inputMode="text"
                maxLength={3}
                disabled={!canManage || saving}
                value={draft.cognition_budget.currency}
                onChange={(event) => updateBudget("currency", event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))}
                placeholder={currency}
                className="mt-2 w-full bg-transparent text-sm font-light uppercase text-white/80 outline-none placeholder:text-white/18 disabled:opacity-40"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-[10px] leading-4 text-white/28">
              {draft.enabled ? <Play size={12} /> : <Pause size={12} />}
              Monitoring is read-only. Recommendations never authorize business execution.
            </div>
            {canManage ? (
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-[#D6A66A]/30 bg-[#D6A66A]/10 px-4 py-2 text-xs text-[#E7C48E] transition hover:bg-[#D6A66A]/15 disabled:opacity-40"
              >
                {saving ? <LoaderCircle size={13} className="animate-spin" /> : saved ? <Check size={13} /> : <ShieldCheck size={13} />}
                {saving ? "Saving…" : saved ? "Saved" : "Save autonomy policy"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

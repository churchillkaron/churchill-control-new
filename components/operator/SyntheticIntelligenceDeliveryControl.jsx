"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BellRing,
  Check,
  CircleAlert,
  LoaderCircle,
  Mail,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

const REFRESH_INTERVAL_MS = 60_000;
const FULL_ACCESS_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);
const CHANNEL_ORDER = ["email", "whatsapp", "line"];
const CHANNEL_META = {
  email: { label: "Email", icon: Mail, placeholder: "owner@example.com" },
  whatsapp: { label: "WhatsApp", icon: Smartphone, placeholder: "+66812345678" },
  line: { label: "LINE", icon: MessageCircle, placeholder: "LINE user ID" },
};

function text(value) {
  return String(value ?? "").trim();
}

function normalizedRole(value) {
  return text(value).toUpperCase();
}

function timeLabel(value) {
  if (!value) return "Not yet";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Not yet";
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "Just now";
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(diff / 3_600_000);
  if (hours < 24) return `${hours} h ago`;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function buildDraft(result) {
  const policy = result?.settings?.delivery_policy || {};
  const configured = new Map(
    (Array.isArray(policy.channels) ? policy.channels : []).map((channel) => [channel.channel, channel]),
  );
  return {
    enabled: policy.enabled === true,
    default_minimum_level: policy.default_minimum_level || "important",
    channels: Object.fromEntries(
      CHANNEL_ORDER.map((channel) => {
        const existing = configured.get(channel) || {};
        return [
          channel,
          {
            enabled: existing.enabled !== false && Boolean(existing.destination),
            destination: existing.destination || "",
            provider_id:
              existing.provider_id ||
              (channel === "email" ? "email_google" : channel),
            minimum_level: existing.minimum_level || policy.default_minimum_level || "important",
          },
        ];
      }),
    ),
  };
}

function readinessMap(payload) {
  return new Map(
    (Array.isArray(payload?.proactive_delivery_channels)
      ? payload.proactive_delivery_channels
      : []).map((channel) => [channel.channel, channel]),
  );
}

function channelState(status, channel) {
  return status?.channels?.[channel] || {};
}

export default function SyntheticIntelligenceDeliveryControl({ organizationId, role }) {
  const [payload, setPayload] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const canManage = FULL_ACCESS_ROLES.has(normalizedRole(role));

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
        throw new Error(result?.error || "Offline alert settings unavailable");
      }
      setPayload(result);
      setDraft((current) => (saving && current ? current : buildDraft(result)));
    } catch (loadError) {
      setError(loadError?.message || "Offline alert settings unavailable");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [organizationId, saving]);

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

  const readiness = useMemo(() => readinessMap(payload), [payload]);
  const status = payload?.proactive_delivery_status || {};
  const configuredCount = draft
    ? CHANNEL_ORDER.filter((channel) => draft.channels?.[channel]?.enabled).length
    : 0;

  function updateChannel(channel, patch) {
    setSaved(false);
    setDraft((current) => ({
      ...current,
      channels: {
        ...(current?.channels || {}),
        [channel]: {
          ...(current?.channels?.[channel] || {}),
          ...patch,
        },
      },
    }));
  }

  async function save() {
    if (!organizationId || !draft || !canManage || saving) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const channels = CHANNEL_ORDER
        .map((channel) => ({ channel, ...(draft.channels?.[channel] || {}) }))
        .filter((channel) => channel.enabled || text(channel.destination));
      const response = await fetch("/api/operator/autonomous-watch/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          organizationId,
          delivery_policy: {
            enabled: draft.enabled === true,
            default_minimum_level: draft.default_minimum_level,
            channels,
          },
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || "Offline alert settings could not be saved");
      }
      setPayload(result);
      setDraft(buildDraft(result));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (saveError) {
      setError(saveError?.message || "Offline alert settings could not be saved");
    } finally {
      setSaving(false);
    }
  }

  function discussDelivery() {
    const policy = payload?.settings?.delivery_policy || {};
    const message = [
      "Review my Synthetic Intelligence offline alert policy as my business partner.",
      `Offline alerts are ${policy.enabled === true ? "enabled" : "disabled"}.`,
      `Configured destinations: ${(policy.channels || []).length}.`,
      `Minimum default alert level: ${policy.default_minimum_level || "important"}.`,
      status.pending ? `There is an externally queued ${status.pending_level || "business"} alert.` : "There is no externally queued alert.",
      "Explain whether this notification policy is sensible. Do not change settings, infer a recipient, send a message, or execute any business action unless I explicitly ask.",
    ].join(" ");
    window.dispatchEvent(
      new CustomEvent("avantiqo:home-command", {
        detail: { message, source: "text" },
      }),
    );
  }

  if (!organizationId) return null;

  return (
    <section
      data-avantiqo-synthetic-intelligence-delivery-control="true"
      className="rounded-3xl border border-[#D6A66A]/15 bg-[linear-gradient(145deg,rgba(214,166,106,0.045),rgba(255,255,255,0.014)_45%,rgba(0,0,0,0.12))] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.22)]"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[#D6A66A]/70">
            <BellRing size={14} />
            Proactive delivery
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="text-lg font-light text-white/88">Offline intelligence alerts</div>
            <div className={`rounded-full border px-2.5 py-1 text-[10px] ${
              draft?.enabled
                ? "border-[#D6A66A]/25 bg-[#D6A66A]/10 text-[#E7C48E]/80"
                : "border-white/[0.08] bg-white/[0.025] text-white/35"
            }`}>
              {draft?.enabled ? `${configuredCount} channel${configuredCount === 1 ? "" : "s"} active` : "Off by default"}
            </div>
          </div>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-white/35">
            Important Synthetic Intelligence findings can reach you when Avantiqo is closed. Avantiqo never infers a recipient: an organization owner must explicitly choose every channel and destination.
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={discussDelivery}
            className="inline-flex items-center gap-2 rounded-full border border-[#D6A66A]/20 bg-[#D6A66A]/[0.06] px-3.5 py-2 text-[11px] text-[#E7C48E]/75 transition hover:bg-[#D6A66A]/10"
          >
            <MessageCircle size={13} />
            Discuss alerts
          </button>
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            aria-label="Refresh offline alert status"
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

      {draft ? (
        <>
          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs text-white/70">Deliver outside Avantiqo</div>
              <div className="mt-1 text-[10px] leading-4 text-white/30">
                Delivery uses connected organization services through governed pricing, wallet, usage and billing.
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-label="Offline intelligence alerts"
              aria-checked={draft.enabled}
              disabled={!canManage || saving}
              onClick={() => {
                setSaved(false);
                setDraft((current) => ({ ...current, enabled: !current.enabled }));
              }}
              className={`relative h-7 w-12 shrink-0 rounded-full border transition ${
                draft.enabled
                  ? "border-[#D6A66A]/45 bg-[#D6A66A]/20"
                  : "border-white/10 bg-white/[0.04]"
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              <span className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full transition ${
                draft.enabled ? "left-6 bg-[#E7C48E]" : "left-1 bg-white/30"
              }`} />
            </button>
          </div>

          <div className="mt-3 grid gap-3 xl:grid-cols-3">
            {CHANNEL_ORDER.map((channel) => {
              const meta = CHANNEL_META[channel];
              const Icon = meta.icon;
              const row = draft.channels[channel];
              const service = readiness.get(channel) || {};
              const delivery = channelState(status, channel);
              return (
                <div key={channel} className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm text-white/70">
                      <Icon size={14} className="text-[#D6A66A]/60" />
                      {meta.label}
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-label={`${meta.label} offline alerts`}
                      aria-checked={row.enabled}
                      disabled={!canManage || saving}
                      onClick={() => updateChannel(channel, { enabled: !row.enabled })}
                      className={`relative h-6 w-11 rounded-full border transition ${
                        row.enabled
                          ? "border-[#D6A66A]/40 bg-[#D6A66A]/15"
                          : "border-white/10 bg-white/[0.03]"
                      } disabled:opacity-40`}
                    >
                      <span className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition ${row.enabled ? "left-6 bg-[#E7C48E]" : "left-1 bg-white/30"}`} />
                    </button>
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-[10px]">
                    <span className={`h-1.5 w-1.5 rounded-full ${service.ready_for_execution ? "bg-[#D6A66A]" : "bg-white/20"}`} />
                    <span className={service.ready_for_execution ? "text-[#E7C48E]/65" : "text-white/28"}>
                      {service.ready_for_execution ? "Connected service ready" : "Connected service required"}
                    </span>
                  </div>

                  {channel === "email" ? (
                    <select
                      disabled={!canManage || saving}
                      value={row.provider_id}
                      onChange={(event) => updateChannel(channel, { provider_id: event.target.value })}
                      className="mt-3 w-full rounded-xl border border-white/[0.06] bg-black/35 px-3 py-2 text-xs text-white/65 outline-none disabled:opacity-40"
                    >
                      <option value="email_google">Google Mail</option>
                      <option value="email_microsoft">Microsoft Mail</option>
                      <option value="email_imap">IMAP / SMTP</option>
                    </select>
                  ) : null}

                  <input
                    type={channel === "email" ? "email" : "text"}
                    disabled={!canManage || saving}
                    value={row.destination}
                    onChange={(event) => updateChannel(channel, { destination: event.target.value })}
                    placeholder={meta.placeholder}
                    className="mt-3 w-full rounded-xl border border-white/[0.06] bg-black/35 px-3 py-2 text-xs text-white/70 outline-none placeholder:text-white/18 disabled:opacity-40"
                  />

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-[10px] text-white/28">Minimum importance</span>
                    <select
                      disabled={!canManage || saving}
                      value={row.minimum_level}
                      onChange={(event) => updateChannel(channel, { minimum_level: event.target.value })}
                      className="rounded-lg border border-white/[0.06] bg-black/35 px-2 py-1 text-[10px] text-white/55 outline-none disabled:opacity-40"
                    >
                      <option value="watch">Watch</option>
                      <option value="important">Important</option>
                      <option value="urgent">Urgent only</option>
                    </select>
                  </div>

                  <div className="mt-3 border-t border-white/[0.05] pt-3 text-[10px] text-white/27">
                    {delivery.status ? (
                      <span>{delivery.status} · {delivery.delivered_at ? timeLabel(delivery.delivered_at) : delivery.failed_at ? timeLabel(delivery.failed_at) : `${delivery.attempt_count || 0} attempt${delivery.attempt_count === 1 ? "" : "s"}`}</span>
                    ) : (
                      <span>No external delivery recorded yet</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-black/15 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-[10px] leading-4 text-white/30">
              {status.pending ? <CircleAlert size={13} className="mt-0.5 shrink-0 text-[#D6A66A]/60" /> : <ShieldCheck size={13} className="mt-0.5 shrink-0 text-[#D6A66A]/50" />}
              <span>
                {status.pending
                  ? `${status.pending_level || "Business"} alert queued for governed delivery. Last attempt ${timeLabel(status.last_attempt_at).toLowerCase()}.`
                  : `No offline alert is queued. Last completed delivery ${timeLabel(status.last_completed_at).toLowerCase()}.`} Recommendations never authorize execution.
              </span>
            </div>
            {canManage ? (
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-[#D6A66A]/30 bg-[#D6A66A]/10 px-4 py-2 text-xs text-[#E7C48E] transition hover:bg-[#D6A66A]/15 disabled:opacity-40"
              >
                {saving ? <LoaderCircle size={13} className="animate-spin" /> : saved ? <Check size={13} /> : <Send size={13} />}
                {saving ? "Saving…" : saved ? "Saved" : "Save offline alerts"}
              </button>
            ) : (
              <span className="text-[10px] text-white/25">Read-only · organization owner access required</span>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

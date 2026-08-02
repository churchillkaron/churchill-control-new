"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Megaphone,
  PauseCircle,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react";

function unwrap(payload) {
  return payload?.data ?? payload?.result ?? payload;
}

function currencyMinorUnitFactor(currency) {
  if (!currency) return 100;

  try {
    const digits = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits;

    return 10 ** digits;
  } catch {
    return 100;
  }
}

function inputClass() {
  return "w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition focus:border-pink-500/50";
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-white/40">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-2 block text-xs text-white/30">{hint}</span> : null}
    </label>
  );
}

export default function MetaAdsPage() {
  const params = useParams();
  const organizationId = params?.organizationId;

  const [readiness, setReadiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const [form, setForm] = useState({
    adAccountId: "",
    campaignName: "Churchill - Play Dine Live",
    objective: "OUTCOME_ENGAGEMENT",
    dailyBudget: "700",
    country: "TH",
    ageMin: "24",
    ageMax: "60",
    message: "",
    headline: "Play, Dine & Live at Churchill",
    description: "Free games, great food, drinks and live music in Karon.",
    imageUrl: "",
    linkUrl: "https://www.churchillkaron.com",
    callToAction: "LEARN_MORE",
    startTime: "",
    endTime: "",
  });

  const selectedAccount = useMemo(
    () => readiness?.ad_accounts?.find((item) => item.id === form.adAccountId),
    [readiness, form.adAccountId]
  );

  async function loadReadiness() {
    if (!organizationId) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/marketing/meta-ads?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" }
      );
      const payload = await response.json();

      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || "Meta Ads readiness check failed");
      }

      const data = unwrap(payload);
      setReadiness(data);

      const configured = data?.configured_ad_account_id;
      const first = data?.ad_accounts?.[0]?.id;
      setForm((current) => ({
        ...current,
        adAccountId: current.adAccountId || configured || first || "",
      }));
    } catch (loadError) {
      setError(loadError.message);
      setReadiness(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReadiness();
  }, [organizationId]);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setResult(null);

    try {
      const factor = currencyMinorUnitFactor(selectedAccount?.currency);
      const amount = Number(form.dailyBudget);

      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Enter a valid daily budget");
      }

      const targeting = {
        geo_locations: {
          countries: [form.country.trim().toUpperCase()],
        },
        age_min: Number(form.ageMin),
        age_max: Number(form.ageMax),
      };

      const response = await fetch("/api/marketing/meta-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          adAccountId: form.adAccountId,
          campaign: {
            name: form.campaignName,
            objective: form.objective,
            special_ad_categories: [],
          },
          adSet: {
            name: `${form.campaignName} - Audience`,
            optimization_goal:
              form.objective === "OUTCOME_TRAFFIC"
                ? "LINK_CLICKS"
                : "POST_ENGAGEMENT",
            billing_event: "IMPRESSIONS",
            daily_budget: Math.round(amount * factor),
            targeting,
            start_time: form.startTime || null,
            end_time: form.endTime || null,
          },
          creative: {
            name: `${form.campaignName} - Poster`,
            message: form.message,
            headline: form.headline,
            description: form.description,
            image_url: form.imageUrl,
            link_url: form.linkUrl,
            call_to_action: form.callToAction,
          },
          ad: {
            name: `${form.campaignName} - Ad`,
          },
        }),
      });

      const payload = await response.json();
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || "Meta campaign creation failed");
      }

      setResult(unwrap(payload));
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-black p-8 text-white lg:p-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="mb-3 flex items-center gap-3 text-xs uppercase tracking-[0.28em] text-pink-400">
              <Megaphone className="h-4 w-4" />
              Marketing / Paid Media
            </div>
            <h1 className="text-5xl font-light">Meta Ads Manager</h1>
            <p className="mt-3 max-w-3xl text-white/45">
              Build Facebook and Instagram campaigns through the organization&apos;s connected Meta account.
            </p>
          </div>

          <button
            type="button"
            onClick={loadReadiness}
            disabled={loading}
            className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/70 hover:border-pink-500/30"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh connection
          </button>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-3 flex items-center gap-2 text-sm text-white/40">
              <ShieldCheck className="h-4 w-4 text-pink-400" /> Connection
            </div>
            <div className="text-xl font-light">
              {loading ? "Checking" : readiness?.connected ? "Connected" : "Unavailable"}
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-3 text-sm text-white/40">Available ad accounts</div>
            <div className="text-xl font-light">{readiness?.ad_accounts?.length || 0}</div>
          </div>
          <div className="rounded-3xl border border-pink-500/20 bg-pink-500/5 p-5">
            <div className="mb-3 flex items-center gap-2 text-sm text-pink-300/70">
              <PauseCircle className="h-4 w-4" /> Spend protection
            </div>
            <div className="text-xl font-light">Created paused</div>
          </div>
        </div>

        {error ? (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}

        {result ? (
          <div className="mb-6 rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-6">
            <div className="mb-4 flex items-center gap-3 text-emerald-200">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-lg">Campaign created safely in PAUSED status</span>
            </div>
            <div className="grid gap-3 text-sm text-white/60 md:grid-cols-4">
              <div>Campaign: {result.campaign_id}</div>
              <div>Ad set: {result.ad_set_id}</div>
              <div>Creative: {result.creative_id}</div>
              <div>Ad: {result.ad_id}</div>
            </div>
          </div>
        ) : null}

        <form onSubmit={submit} className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6">
            <h2 className="mb-6 text-2xl font-light">Campaign & audience</h2>
            <div className="space-y-5">
              <Field label="Meta ad account">
                <select
                  className={inputClass()}
                  value={form.adAccountId}
                  onChange={(event) => update("adAccountId", event.target.value)}
                  required
                >
                  <option value="">Select account</option>
                  {(readiness?.ad_accounts || []).map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name || account.id} · {account.currency || "Currency unknown"}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Campaign name">
                <input className={inputClass()} value={form.campaignName} onChange={(e) => update("campaignName", e.target.value)} required />
              </Field>

              <Field label="Objective">
                <select className={inputClass()} value={form.objective} onChange={(e) => update("objective", e.target.value)}>
                  <option value="OUTCOME_ENGAGEMENT">Engagement</option>
                  <option value="OUTCOME_TRAFFIC">Website traffic</option>
                </select>
              </Field>

              <Field label={`Daily budget${selectedAccount?.currency ? ` (${selectedAccount.currency})` : ""}`} hint="Converted dynamically to the ad account currency's minimum unit.">
                <input className={inputClass()} type="number" min="0" step="0.01" value={form.dailyBudget} onChange={(e) => update("dailyBudget", e.target.value)} required />
              </Field>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Country ISO">
                  <input className={inputClass()} value={form.country} maxLength={2} onChange={(e) => update("country", e.target.value)} required />
                </Field>
                <Field label="Minimum age">
                  <input className={inputClass()} type="number" min="18" value={form.ageMin} onChange={(e) => update("ageMin", e.target.value)} required />
                </Field>
                <Field label="Maximum age">
                  <input className={inputClass()} type="number" min="18" value={form.ageMax} onChange={(e) => update("ageMax", e.target.value)} required />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Start time">
                  <input className={inputClass()} type="datetime-local" value={form.startTime} onChange={(e) => update("startTime", e.target.value)} />
                </Field>
                <Field label="End time">
                  <input className={inputClass()} type="datetime-local" value={form.endTime} onChange={(e) => update("endTime", e.target.value)} />
                </Field>
              </div>
            </div>
          </section>

          <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6">
            <h2 className="mb-6 text-2xl font-light">Poster & message</h2>
            <div className="space-y-5">
              <Field label="Primary text">
                <textarea className={`${inputClass()} min-h-36 resize-y`} value={form.message} onChange={(e) => update("message", e.target.value)} required />
              </Field>

              <Field label="Headline">
                <input className={inputClass()} value={form.headline} onChange={(e) => update("headline", e.target.value)} />
              </Field>

              <Field label="Description">
                <input className={inputClass()} value={form.description} onChange={(e) => update("description", e.target.value)} />
              </Field>

              <Field label="Public poster image URL" hint="Use the final approved poster stored in Avantiqo or another public HTTPS location.">
                <input className={inputClass()} type="url" value={form.imageUrl} onChange={(e) => update("imageUrl", e.target.value)} required />
              </Field>

              <Field label="Destination URL">
                <input className={inputClass()} type="url" value={form.linkUrl} onChange={(e) => update("linkUrl", e.target.value)} required />
              </Field>

              <Field label="Call to action">
                <select className={inputClass()} value={form.callToAction} onChange={(e) => update("callToAction", e.target.value)}>
                  <option value="LEARN_MORE">Learn more</option>
                  <option value="BOOK_TRAVEL">Book now</option>
                  <option value="CONTACT_US">Contact us</option>
                  <option value="GET_DIRECTIONS">Get directions</option>
                </select>
              </Field>

              <button
                type="submit"
                disabled={submitting || loading || !readiness?.connected}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-pink-500 px-5 py-4 font-medium text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                Create paused Meta campaign
              </button>
            </div>
          </section>
        </form>
      </div>
    </main>
  );
}

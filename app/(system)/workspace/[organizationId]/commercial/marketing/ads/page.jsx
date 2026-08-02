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

const inputClass =
  "w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition focus:border-pink-500/50";

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
    assetId: "",
    confirmExactAsset: false,
    campaignName: "Churchill - Play Dine Live",
    objective: "OUTCOME_ENGAGEMENT",
    dailyBudget: "700",
    country: "TH",
    ageMin: "24",
    ageMax: "60",
    message: "",
    headline: "Play, Dine & Live at Churchill",
    description: "Free games, great food, drinks and live music in Karon.",
    linkUrl: "https://www.churchillkaron.com",
    callToAction: "LEARN_MORE",
    startTime: "",
    endTime: "",
  });

  const selectedAccount = useMemo(
    () => readiness?.ad_accounts?.find((item) => item.id === form.adAccountId),
    [readiness, form.adAccountId]
  );
  const selectedAsset = useMemo(
    () => readiness?.creative_assets?.find((item) => item.id === form.assetId),
    [readiness, form.assetId]
  );

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

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
      setForm((current) => ({
        ...current,
        adAccountId:
          current.adAccountId ||
          data?.configured_ad_account_id ||
          data?.ad_accounts?.[0]?.id ||
          "",
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

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setResult(null);
    try {
      if (!selectedAsset) throw new Error("Select the exact approved Churchill poster");
      if (!form.confirmExactAsset) {
        throw new Error("Confirm that the selected poster and logo are exactly correct");
      }

      const amount = Number(form.dailyBudget);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Enter a valid daily budget");
      }
      const factor = currencyMinorUnitFactor(selectedAccount?.currency);
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
              form.objective === "OUTCOME_TRAFFIC" ? "LINK_CLICKS" : "POST_ENGAGEMENT",
            billing_event: "IMPRESSIONS",
            daily_budget: Math.round(amount * factor),
            targeting: {
              geo_locations: { countries: [form.country.trim().toUpperCase()] },
              age_min: Number(form.ageMin),
              age_max: Number(form.ageMax),
            },
            start_time: form.startTime || null,
            end_time: form.endTime || null,
          },
          creative: {
            name: `${form.campaignName} - Exact Poster`,
            asset_id: form.assetId,
            confirm_exact_asset: true,
            message: form.message,
            headline: form.headline,
            description: form.description,
            link_url: form.linkUrl,
            call_to_action: form.callToAction,
          },
          ad: { name: `${form.campaignName} - Ad` },
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
              <Megaphone className="h-4 w-4" /> Marketing / Paid Media
            </div>
            <h1 className="text-5xl font-light">Meta Ads Manager</h1>
            <p className="mt-3 max-w-3xl text-white/45">
              Select the exact approved Churchill poster from the asset library. Avantiqo does not regenerate, crop, overlay or replace the logo.
            </p>
          </div>
          <button type="button" onClick={loadReadiness} disabled={loading} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/70">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-3 flex items-center gap-2 text-sm text-white/40"><ShieldCheck className="h-4 w-4 text-pink-400" /> Connection</div>
            <div className="text-xl font-light">{loading ? "Checking" : readiness?.connected ? "Connected" : "Unavailable"}</div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-3 text-sm text-white/40">Available approved assets</div>
            <div className="text-xl font-light">{readiness?.creative_assets?.length || 0}</div>
          </div>
          <div className="rounded-3xl border border-pink-500/20 bg-pink-500/5 p-5">
            <div className="mb-3 flex items-center gap-2 text-sm text-pink-300/70"><PauseCircle className="h-4 w-4" /> Protection</div>
            <div className="text-xl font-light">Exact asset · Paused</div>
          </div>
        </div>

        {error ? <div className="mb-6 flex gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div> : null}
        {result ? <div className="mb-6 rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-6 text-emerald-200"><div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5" />Campaign created paused with exact asset: {result.source_asset?.name}</div></div> : null}

        <form onSubmit={submit} className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6">
            <h2 className="mb-6 text-2xl font-light">Campaign & audience</h2>
            <div className="space-y-5">
              <Field label="Meta ad account"><select className={inputClass} value={form.adAccountId} onChange={(e) => update("adAccountId", e.target.value)} required><option value="">Select account</option>{(readiness?.ad_accounts || []).map((account) => <option key={account.id} value={account.id}>{account.name || account.id} · {account.currency || "Unknown"}</option>)}</select></Field>
              <Field label="Campaign name"><input className={inputClass} value={form.campaignName} onChange={(e) => update("campaignName", e.target.value)} required /></Field>
              <Field label="Objective"><select className={inputClass} value={form.objective} onChange={(e) => update("objective", e.target.value)}><option value="OUTCOME_ENGAGEMENT">Engagement</option><option value="OUTCOME_TRAFFIC">Website traffic</option></select></Field>
              <Field label={`Daily budget${selectedAccount?.currency ? ` (${selectedAccount.currency})` : ""}`}><input className={inputClass} type="number" min="0" step="0.01" value={form.dailyBudget} onChange={(e) => update("dailyBudget", e.target.value)} required /></Field>
              <div className="grid grid-cols-3 gap-3"><Field label="Country"><input className={inputClass} value={form.country} maxLength={2} onChange={(e) => update("country", e.target.value)} /></Field><Field label="Min age"><input className={inputClass} type="number" min="18" value={form.ageMin} onChange={(e) => update("ageMin", e.target.value)} /></Field><Field label="Max age"><input className={inputClass} type="number" min="18" value={form.ageMax} onChange={(e) => update("ageMax", e.target.value)} /></Field></div>
              <div className="grid grid-cols-2 gap-3"><Field label="Start"><input className={inputClass} type="datetime-local" value={form.startTime} onChange={(e) => update("startTime", e.target.value)} /></Field><Field label="End"><input className={inputClass} type="datetime-local" value={form.endTime} onChange={(e) => update("endTime", e.target.value)} /></Field></div>
            </div>
          </section>

          <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6">
            <h2 className="mb-6 text-2xl font-light">Exact poster & message</h2>
            <div className="space-y-5">
              <Field label="Churchill creative asset" hint="Choose the final approved poster. Manual image URLs are not accepted."><select className={inputClass} value={form.assetId} onChange={(e) => { update("assetId", e.target.value); update("confirmExactAsset", false); }} required><option value="">Select exact poster</option>{(readiness?.creative_assets || []).map((asset) => <option key={asset.id} value={asset.id}>{asset.name} · {asset.approval_status}</option>)}</select></Field>
              {selectedAsset ? <div className="rounded-3xl border border-white/10 bg-black/40 p-4"><img src={selectedAsset.preview_url} alt={selectedAsset.name} className="mx-auto max-h-[420px] rounded-2xl object-contain" /><div className="mt-3 text-sm text-white/60">{selectedAsset.name}</div><div className="mt-1 text-xs text-pink-300">Exact source asset ID: {selectedAsset.id}</div></div> : null}
              <label className="flex items-start gap-3 rounded-2xl border border-pink-500/20 bg-pink-500/5 p-4 text-sm text-white/70"><input type="checkbox" className="mt-1" checked={form.confirmExactAsset} onChange={(e) => update("confirmExactAsset", e.target.checked)} /><span>I confirm this is the exact approved Churchill poster and the Churchill logo is correct. Do not regenerate, replace, crop or overlay it.</span></label>
              <Field label="Primary text"><textarea className={`${inputClass} min-h-32 resize-y`} value={form.message} onChange={(e) => update("message", e.target.value)} required /></Field>
              <Field label="Headline"><input className={inputClass} value={form.headline} onChange={(e) => update("headline", e.target.value)} /></Field>
              <Field label="Description"><input className={inputClass} value={form.description} onChange={(e) => update("description", e.target.value)} /></Field>
              <Field label="Destination URL"><input className={inputClass} type="url" value={form.linkUrl} onChange={(e) => update("linkUrl", e.target.value)} required /></Field>
              <Field label="Call to action"><select className={inputClass} value={form.callToAction} onChange={(e) => update("callToAction", e.target.value)}><option value="LEARN_MORE">Learn more</option><option value="CONTACT_US">Contact us</option><option value="GET_DIRECTIONS">Get directions</option></select></Field>
              <button type="submit" disabled={submitting || loading || !readiness?.connected || !form.confirmExactAsset} className="flex w-full items-center justify-center gap-3 rounded-2xl bg-pink-500 px-5 py-4 font-medium text-white disabled:opacity-40">{submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}Create paused campaign with exact poster</button>
            </div>
          </section>
        </form>
      </div>
    </main>
  );
}

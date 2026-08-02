"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Megaphone,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

const GOLD = "#D6A66A";
const inputClass =
  "w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-[#D6A66A]/60";

function unwrap(payload) {
  return payload?.data ?? payload?.result ?? payload;
}

function errorText(value, fallback = "Something went wrong") {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  return value.message || value.error_user_msg || value.error?.message || fallback;
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-white/40">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-2 block text-xs text-white/30">{hint}</span> : null}
    </label>
  );
}

function Choice({ active, disabled, title, description, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full rounded-2xl border p-4 text-left transition ${
        active
          ? "border-[#D6A66A]/60 bg-[#D6A66A]/10"
          : "border-white/10 bg-black/20 hover:border-white/20"
      } disabled:cursor-not-allowed disabled:opacity-35`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-white">{title}</div>
          <div className="mt-1 text-xs leading-5 text-white/38">{description}</div>
        </div>
        <div className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border ${active ? "border-[#D6A66A] bg-[#D6A66A] text-black" : "border-white/20"}`}>
          {active ? <Check size={13} /> : null}
        </div>
      </div>
    </button>
  );
}

function money(value, currency) {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency || "THB",
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  } catch {
    return `${currency || ""} ${Number(value || 0).toFixed(2)}`;
  }
}

export default function MetaAdsPage() {
  const params = useParams();
  const organizationId = params?.organizationId;
  const [readiness, setReadiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    campaignName: "",
    destination: "ENGAGEMENT",
    deliveryChannels: ["facebook"],
    country: "TH",
    ageMin: "24",
    ageMax: "60",
    totalBudget: "",
    startTime: "",
    endTime: "",
    assetId: "",
    confirmExactAsset: false,
    message: "",
    headline: "",
    description: "",
    linkUrl: "",
    callToAction: "LEARN_MORE",
  });

  const selectedAsset = useMemo(
    () => readiness?.creative_assets?.find((item) => item.id === form.assetId),
    [readiness, form.assetId]
  );

  const walletCurrency = readiness?.wallet?.currency || "THB";
  const availableBalance = Number(readiness?.wallet?.available_balance || 0);
  const budget = Number(form.totalBudget || 0);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function toggleChannel(channel) {
    setForm((current) => {
      const exists = current.deliveryChannels.includes(channel);
      const next = exists
        ? current.deliveryChannels.filter((item) => item !== channel)
        : [...current.deliveryChannels, channel];
      return { ...current, deliveryChannels: next };
    });
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
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(errorText(payload?.error || payload?.message, "Campaign workspace could not be loaded"));
      }
      const data = unwrap(payload);
      setReadiness(data);
      setForm((current) => ({
        ...current,
        deliveryChannels: current.deliveryChannels.filter((channel) =>
          data?.delivery_channels?.some((item) => item.id === channel && item.available)
        ),
      }));
    } catch (loadError) {
      setError(errorText(loadError));
      setReadiness(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReadiness();
  }, [organizationId]);

  function validateStep(targetStep = step) {
    if (targetStep >= 1 && !form.campaignName.trim()) throw new Error("Name the campaign");
    if (targetStep >= 2 && !form.deliveryChannels.length) throw new Error("Choose at least one delivery channel");
    if (targetStep >= 3) {
      if (!budget || budget <= 0) throw new Error("Enter the total prepaid campaign budget");
      if (!form.endTime) throw new Error("Choose an end date so Avantiqo can reserve a maximum budget");
      if (budget > availableBalance) throw new Error("The Avantiqo wallet balance is too low for this campaign");
    }
    if (targetStep >= 4) {
      if (!selectedAsset) throw new Error("Select the exact approved creative");
      if (!form.confirmExactAsset) throw new Error("Confirm the selected creative and logo are correct");
      if (!form.message.trim()) throw new Error("Add the primary campaign message");
    }
  }

  function nextStep() {
    try {
      validateStep(step);
      setError("");
      setStep((current) => Math.min(5, current + 1));
    } catch (validationError) {
      setError(validationError.message);
    }
  }

  async function submit() {
    setSubmitting(true);
    setError("");
    setResult(null);
    try {
      validateStep(5);
      const objective = form.destination === "WEBSITE" ? "OUTCOME_TRAFFIC" : "OUTCOME_ENGAGEMENT";
      const response = await fetch("/api/marketing/meta-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          authorizedBudget: budget,
          currency: walletCurrency,
          deliveryChannels: form.deliveryChannels,
          destination: form.destination,
          campaign: {
            name: form.campaignName.trim(),
            objective,
            special_ad_categories: [],
          },
          adSet: {
            name: `${form.campaignName.trim()} - Audience`,
            optimization_goal: form.destination === "WEBSITE" ? "LINK_CLICKS" : "POST_ENGAGEMENT",
            billing_event: "IMPRESSIONS",
            lifetime_budget: Math.round(budget * 100),
            targeting: {
              geo_locations: { countries: [form.country.trim().toUpperCase()] },
              age_min: Number(form.ageMin),
              age_max: Number(form.ageMax),
            },
            start_time: form.startTime || null,
            end_time: form.endTime,
          },
          creative: {
            name: `${form.campaignName.trim()} - Exact Creative`,
            asset_id: form.assetId,
            confirm_exact_asset: true,
            message: form.message.trim(),
            headline: form.headline.trim(),
            description: form.description.trim(),
            link_url: form.linkUrl.trim() || undefined,
            call_to_action: form.callToAction,
          },
          ad: { name: `${form.campaignName.trim()} - Ad` },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(errorText(payload?.error || payload?.message, "Campaign creation failed"));
      }
      setResult(unwrap(payload));
      await loadReadiness();
    } catch (submitError) {
      setError(errorText(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  const steps = ["Goal", "Channels", "Audience & budget", "Creative", "Review"];

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-white lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="mb-3 flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-[#D6A66A]">
              <Megaphone size={15} /> Marketing / Managed Media
            </div>
            <h1 className="text-4xl font-light tracking-tight lg:text-5xl">Campaign Builder</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/42">
              Create Facebook, Instagram and WhatsApp campaigns through Avantiqo. One prepaid wallet, exact approved creative, and no separate Meta billing setup.
            </p>
          </div>
          <button type="button" onClick={loadReadiness} disabled={loading} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white/65 transition hover:border-[#D6A66A]/40 hover:text-[#D6A66A]">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </header>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-white/35"><ShieldCheck size={15} style={{ color: GOLD }} /> Managed connection</div>
            <div className="mt-3 text-xl font-light">{loading ? "Checking" : readiness?.connected ? "Ready" : "Setup required"}</div>
            <div className="mt-1 text-xs text-white/32">Provider billing and execution managed by Avantiqo</div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-white/35"><WalletCards size={15} style={{ color: GOLD }} /> Available wallet</div>
            <div className="mt-3 text-xl font-light">{readiness?.wallet ? money(availableBalance, walletCurrency) : "Not available"}</div>
            <div className="mt-1 text-xs text-white/32">Campaign funds are reserved before provider execution</div>
          </div>
          <div className="rounded-3xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.06] p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-[#D6A66A]/75">Creative protection</div>
            <div className="mt-3 text-xl font-light">Exact asset · Paused first</div>
            <div className="mt-1 text-xs text-white/35">No regeneration, crop, replacement or automatic enhancement</div>
          </div>
        </div>

        {error ? <div className="mb-6 flex gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error}</div> : null}
        {result ? <div className="mb-6 flex gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200"><CheckCircle2 size={17} className="mt-0.5 shrink-0" />Campaign created in paused status. {money(result.reserved_amount, result.currency)} is reserved from the Avantiqo wallet.</div> : null}

        <div className="mb-6 grid grid-cols-5 gap-2 rounded-3xl border border-white/10 bg-white/[0.025] p-3">
          {steps.map((label, index) => {
            const number = index + 1;
            return <button key={label} type="button" onClick={() => setStep(number)} className={`rounded-2xl px-3 py-3 text-xs transition ${step === number ? "bg-[#D6A66A] text-black" : number < step ? "bg-[#D6A66A]/10 text-[#D6A66A]" : "text-white/35"}`}><span className="mr-2 hidden sm:inline">{number}.</span>{label}</button>;
          })}
        </div>

        <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 lg:p-8">
          {step === 1 ? <div className="mx-auto max-w-3xl space-y-6"><div><div className="text-xs uppercase tracking-[0.24em] text-[#D6A66A]">Step 1</div><h2 className="mt-2 text-3xl font-light">What should this campaign achieve?</h2></div><Field label="Campaign name"><input className={inputClass} value={form.campaignName} onChange={(e) => update("campaignName", e.target.value)} placeholder="Summer dinner and live music" /></Field><div className="grid gap-3 md:grid-cols-3">{(readiness?.destinations || []).map((item) => <Choice key={item.id} active={form.destination === item.id} disabled={!item.available} title={item.name} description={item.reason || (item.id === "ENGAGEMENT" ? "Build awareness and interactions" : item.id === "WEBSITE" ? "Drive visitors to your website" : "Start customer conversations")} onClick={() => update("destination", item.id)} />)}</div></div> : null}

          {step === 2 ? <div className="mx-auto max-w-3xl space-y-6"><div><div className="text-xs uppercase tracking-[0.24em] text-[#D6A66A]">Step 2</div><h2 className="mt-2 text-3xl font-light">Where should Avantiqo deliver it?</h2></div><div className="grid gap-3 md:grid-cols-2">{(readiness?.delivery_channels || []).map((item) => <Choice key={item.id} active={form.deliveryChannels.includes(item.id)} disabled={!item.available} title={item.name} description={item.reason || `Deliver through the organization's ${item.name} identity`} onClick={() => toggleChannel(item.id)} />)}</div><div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/45">Avantiqo selects and pays the managed Meta advertising account. The organization only supplies its connected Page, Instagram account or WhatsApp destination.</div></div> : null}

          {step === 3 ? <div className="mx-auto max-w-3xl space-y-6"><div><div className="text-xs uppercase tracking-[0.24em] text-[#D6A66A]">Step 3</div><h2 className="mt-2 text-3xl font-light">Audience, schedule and total prepaid budget</h2></div><div className="grid gap-4 md:grid-cols-3"><Field label="Country"><input className={inputClass} maxLength={2} value={form.country} onChange={(e) => update("country", e.target.value)} /></Field><Field label="Minimum age"><input className={inputClass} type="number" min="18" value={form.ageMin} onChange={(e) => update("ageMin", e.target.value)} /></Field><Field label="Maximum age"><input className={inputClass} type="number" min="18" value={form.ageMax} onChange={(e) => update("ageMax", e.target.value)} /></Field></div><div className="grid gap-4 md:grid-cols-2"><Field label="Start"><input className={inputClass} type="datetime-local" value={form.startTime} onChange={(e) => update("startTime", e.target.value)} /></Field><Field label="End" hint="Required so Avantiqo can cap and reserve the campaign budget."><input className={inputClass} type="datetime-local" value={form.endTime} onChange={(e) => update("endTime", e.target.value)} /></Field></div><Field label={`Total campaign budget (${walletCurrency})`} hint={`Available: ${money(availableBalance, walletCurrency)}. Unspent funds are released back to the same wallet.`}><input className={inputClass} type="number" min="0" step="0.01" value={form.totalBudget} onChange={(e) => update("totalBudget", e.target.value)} placeholder="5000" /></Field></div> : null}

          {step === 4 ? <div className="mx-auto max-w-4xl space-y-6"><div><div className="text-xs uppercase tracking-[0.24em] text-[#D6A66A]">Step 4</div><h2 className="mt-2 text-3xl font-light">Choose the exact approved creative</h2></div><Field label="Creative asset" hint="Only organization assets are accepted. Manual URLs are disabled."><select className={inputClass} value={form.assetId} onChange={(e) => { update("assetId", e.target.value); update("confirmExactAsset", false); }}><option value="">Select approved creative</option>{(readiness?.creative_assets || []).map((asset) => <option key={asset.id} value={asset.id}>{asset.name} · {asset.approval_status}</option>)}</select></Field>{selectedAsset ? <div className="rounded-3xl border border-white/10 bg-black/30 p-4"><img src={selectedAsset.preview_url} alt={selectedAsset.name} className="mx-auto max-h-[480px] rounded-2xl object-contain" /><div className="mt-4 text-sm text-white/65">{selectedAsset.name}</div><div className="mt-1 text-xs text-[#D6A66A]">Exact source asset: {selectedAsset.id}</div></div> : null}<label className="flex items-start gap-3 rounded-2xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.06] p-4 text-sm leading-6 text-white/65"><input type="checkbox" className="mt-1" checked={form.confirmExactAsset} onChange={(e) => update("confirmExactAsset", e.target.checked)} /><span>I confirm this is the exact approved creative and its logo, people, food and layout are correct. Avantiqo must not regenerate, crop, replace or overlay it.</span></label><div className="grid gap-4 md:grid-cols-2"><Field label="Primary message"><textarea className={`${inputClass} min-h-32 resize-y`} value={form.message} onChange={(e) => update("message", e.target.value)} /></Field><div className="space-y-4"><Field label="Headline"><input className={inputClass} value={form.headline} onChange={(e) => update("headline", e.target.value)} /></Field><Field label="Description"><input className={inputClass} value={form.description} onChange={(e) => update("description", e.target.value)} /></Field></div></div>{form.destination === "WEBSITE" ? <Field label="Destination URL"><input className={inputClass} type="url" value={form.linkUrl} onChange={(e) => update("linkUrl", e.target.value)} /></Field> : null}</div> : null}

          {step === 5 ? <div className="mx-auto max-w-4xl space-y-6"><div><div className="text-xs uppercase tracking-[0.24em] text-[#D6A66A]">Step 5</div><h2 className="mt-2 text-3xl font-light">Review before Avantiqo reserves funds</h2></div><div className="grid gap-4 md:grid-cols-2"><div className="rounded-3xl border border-white/10 bg-black/20 p-5"><div className="text-xs uppercase tracking-[0.18em] text-white/35">Campaign</div><div className="mt-3 text-xl">{form.campaignName || "Not named"}</div><div className="mt-3 text-sm text-white/45">Goal: {form.destination}</div><div className="mt-1 text-sm text-white/45">Channels: {form.deliveryChannels.join(", ") || "None"}</div><div className="mt-1 text-sm text-white/45">Audience: {form.country.toUpperCase()}, ages {form.ageMin}–{form.ageMax}</div></div><div className="rounded-3xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.06] p-5"><div className="text-xs uppercase tracking-[0.18em] text-[#D6A66A]/75">Wallet authorization</div><div className="mt-3 text-3xl font-light">{money(budget, walletCurrency)}</div><div className="mt-3 text-sm leading-6 text-white/45">Reserved from the organization’s single prepaid Avantiqo wallet. Meta bills Avantiqo. Unspent funds return to this wallet.</div></div></div><div className="rounded-3xl border border-white/10 bg-black/20 p-5"><div className="text-xs uppercase tracking-[0.18em] text-white/35">Exact creative</div><div className="mt-3 text-lg">{selectedAsset?.name || "Not selected"}</div><div className="mt-2 text-sm leading-6 text-white/45">Campaign is created paused first. Activation and spend settlement remain controlled by Avantiqo.</div></div><button type="button" onClick={submit} disabled={submitting || loading || !readiness?.connected || !form.confirmExactAsset} className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#D6A66A] px-5 py-4 font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35">{submitting ? <Loader2 size={19} className="animate-spin" /> : <ShieldCheck size={19} />}Reserve wallet and create paused campaign</button></div> : null}

          <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-5">
            <button type="button" onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={step === 1} className="rounded-xl px-4 py-2 text-sm text-white/45 disabled:opacity-20">Back</button>
            {step < 5 ? <button type="button" onClick={nextStep} className="flex items-center gap-2 rounded-xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black">Continue <ChevronRight size={16} /></button> : null}
          </div>
        </section>
      </div>
    </main>
  );
}

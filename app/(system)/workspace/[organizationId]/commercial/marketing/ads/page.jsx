"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  WalletCards,
} from "lucide-react";

import {
  CAMPAIGN_GOALS,
  DESTINATION_NAMES,
  LOCATION_TYPES,
  applyUniversalPlanToForm,
  buildUniversalCampaignPlan,
  campaignPlanFingerprint,
  createDefaultCampaignForm,
  createLocation,
} from "@/lib/marketing/campaigns/ui/CampaignBuilderModel";

const GOLD = "#D6A66A";
const inputClass =
  "w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-[#D6A66A]/60";

function unwrap(payload) {
  return payload?.data ?? payload?.result ?? payload;
}

function publicError(payload, fallback = "Something went wrong") {
  const error = payload?.error || payload;
  if (!error) return { message: fallback };
  if (typeof error === "string") return { message: error };
  return {
    stage: error.stage || null,
    code: error.code || null,
    message:
      error.message || error.error_user_msg || error.error?.message || fallback,
    correction: error.correction || null,
  };
}

function money(value, currency) {
  if (!currency) return "Currency not configured";
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  } catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`;
  }
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-white/40">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-2 block text-xs leading-5 text-white/30">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function Choice({ active, disabled, title, description, badge, onClick }) {
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
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium text-white">{title}</div>
            {badge ? (
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white/35">
                {badge}
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-xs leading-5 text-white/38">
            {description}
          </div>
        </div>
        <div
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
            active
              ? "border-[#D6A66A] bg-[#D6A66A] text-black"
              : "border-white/20"
          }`}
        >
          {active ? <Check size={13} /> : null}
        </div>
      </div>
    </button>
  );
}

function LocationEditor({ value, onChange, onRemove, excluded = false }) {
  function update(name, next) {
    onChange({ ...value, [name]: next });
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.16em] text-white/35">
          {excluded ? "Excluded area" : "Included area"}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-xl border border-white/10 p-2 text-white/35 transition hover:border-red-400/30 hover:text-red-300"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Location type">
          <select
            className={inputClass}
            value={value.type}
            onChange={(event) => update("type", event.target.value)}
          >
            {LOCATION_TYPES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>

        {value.type === "country" ? (
          <Field label="Country code">
            <input
              className={inputClass}
              maxLength={2}
              value={value.country_code}
              onChange={(event) =>
                update("country_code", event.target.value.toUpperCase())
              }
              placeholder="TH"
            />
          </Field>
        ) : null}

        {["region", "city", "district", "postal_code"].includes(
          value.type,
        ) ? (
          <>
            <Field label="Display name">
              <input
                className={inputClass}
                value={value.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="Location name"
              />
            </Field>
            <Field
              label="Meta targeting id"
              hint="Use the exact provider id. Map radius needs no provider id."
            >
              <input
                className={inputClass}
                value={value.id}
                onChange={(event) => update("id", event.target.value)}
                placeholder="Provider targeting id"
              />
            </Field>
          </>
        ) : null}

        {value.type === "radius" ? (
          <>
            <Field label="Latitude">
              <input
                className={inputClass}
                type="number"
                step="any"
                value={value.latitude}
                onChange={(event) => update("latitude", event.target.value)}
              />
            </Field>
            <Field label="Longitude">
              <input
                className={inputClass}
                type="number"
                step="any"
                value={value.longitude}
                onChange={(event) => update("longitude", event.target.value)}
              />
            </Field>
            <Field label="Radius">
              <input
                className={inputClass}
                type="number"
                min="1"
                step="any"
                value={value.radius}
                onChange={(event) => update("radius", event.target.value)}
              />
            </Field>
            <Field label="Radius unit">
              <select
                className={inputClass}
                value={value.radius_unit}
                onChange={(event) => update("radius_unit", event.target.value)}
              >
                <option value="kilometer">Kilometer</option>
                <option value="mile">Mile</option>
              </select>
            </Field>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function CampaignBuilderPage() {
  const params = useParams();
  const organizationId = params?.organizationId;

  const [readiness, setReadiness] = useState(null);
  const [form, setForm] = useState(createDefaultCampaignForm);
  const [mode, setMode] = useState("simple");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [preflighting, setPreflighting] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [ownerApproved, setOwnerApproved] = useState(false);
  const [preflight, setPreflight] = useState(null);
  const [preflightFingerprint, setPreflightFingerprint] = useState("");
  const [aiPlan, setAiPlan] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const walletCurrency = readiness?.wallet?.currency || "";
  const availableBalance = Number(readiness?.wallet?.available_balance || 0);
  const budget = Number(form.totalBudget || 0);
  const selectedAsset = useMemo(
    () =>
      (readiness?.creative_assets || []).find(
        (asset) => asset.id === form.assetId,
      ) || null,
    [readiness, form.assetId],
  );
  const selectedChannel = useMemo(
    () =>
      (readiness?.connected_channels || []).find(
        (channel) => channel.id === form.channelId,
      ) || null,
    [readiness, form.channelId],
  );

  const plan = useMemo(
    () =>
      buildUniversalCampaignPlan({
        form,
        organizationId,
        walletCurrency,
        mode,
        ai: aiPlan?.ai || {},
      }),
    [form, organizationId, walletCurrency, mode, aiPlan],
  );
  const currentFingerprint = useMemo(
    () => campaignPlanFingerprint(plan),
    [plan],
  );
  const preflightCurrent = Boolean(
    preflight && preflightFingerprint === currentFingerprint,
  );

  function resetApproval() {
    setOwnerApproved(false);
    setPreflight(null);
    setPreflightFingerprint("");
    setResult(null);
  }

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    resetApproval();
  }

  function toggleList(name, value) {
    setForm((current) => {
      const source = current[name] || [];
      return {
        ...current,
        [name]: source.includes(value)
          ? source.filter((item) => item !== value)
          : [...source, value],
      };
    });
    resetApproval();
  }

  function updateLocation(name, key, nextLocation) {
    setForm((current) => ({
      ...current,
      [name]: current[name].map((item) =>
        item._key === key ? nextLocation : item,
      ),
    }));
    resetApproval();
  }

  function addLocation(name, type = "country") {
    setForm((current) => ({
      ...current,
      [name]: [...current[name], createLocation(type)],
    }));
    resetApproval();
  }

  function removeLocation(name, key) {
    setForm((current) => ({
      ...current,
      [name]: current[name].filter((item) => item._key !== key),
    }));
    resetApproval();
  }

  async function loadReadiness() {
    if (!organizationId) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/marketing/campaign-readiness?organizationId=${encodeURIComponent(
          organizationId,
        )}`,
        { cache: "no-store" },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw publicError(payload, "Campaign workspace could not be loaded");
      }

      const data = unwrap(payload);
      const firstReady = data?.connected_channels?.[0] || null;
      setReadiness(data);
      setForm((current) => ({
        ...current,
        channelId: current.channelId || firstReady?.id || "",
        networks:
          current.networks.length > 0
            ? current.networks.filter((network) =>
                (firstReady?.networks || []).includes(network),
              )
            : (firstReady?.networks || []).filter((network) =>
                ["facebook", "instagram"].includes(network),
              ),
        destination:
          (firstReady?.destinations || []).includes(current.destination)
            ? current.destination
            : firstReady?.destinations?.[0] || "ENGAGEMENT",
      }));
    } catch (loadError) {
      setReadiness(null);
      setError(
        loadError?.message ? loadError : publicError(loadError, "Load failed"),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReadiness();
  }, [organizationId]);

  function validateStep(targetStep = step) {
    if (targetStep >= 1) {
      if (!form.campaignName.trim()) throw new Error("Name the campaign");
      if (!form.goal) throw new Error("Choose a campaign goal");
    }
    if (targetStep >= 2) {
      if (!form.channelId) throw new Error("Choose an executable channel");
      if (!form.networks.length) throw new Error("Choose at least one network");
      if (!form.destination) throw new Error("Choose a destination");
    }
    if (targetStep >= 3) {
      if (!walletCurrency) throw new Error("Wallet currency is not configured");
      if (!budget || budget <= 0) throw new Error("Enter a positive budget");
      if (budget > availableBalance) {
        throw new Error("Wallet balance is too low for this campaign");
      }
      if (!form.endTime) throw new Error("Choose a finite end time");
      if (Number(form.ageMin) < 18) throw new Error("Minimum age must be 18");
      if (Number(form.ageMax) < Number(form.ageMin)) {
        throw new Error("Maximum age must be at least the minimum age");
      }
      if (mode === "simple" && !/^[A-Za-z]{2}$/.test(form.country)) {
        throw new Error("Enter a valid two-letter country code");
      }
      if (mode === "advanced" && !form.includedLocations.length) {
        throw new Error("Add at least one included location");
      }
    }
    if (targetStep >= 4) {
      if (!selectedAsset) throw new Error("Select an exact creative asset");
      if (!form.confirmExactAsset) {
        throw new Error("Confirm the exact creative asset");
      }
      if (!form.primaryText.trim()) throw new Error("Add primary campaign text");
      if (form.destination === "WEBSITE" && !form.destinationUrl.trim()) {
        throw new Error("Add the website destination URL");
      }
    }
  }

  function nextStep() {
    try {
      validateStep(step);
      setError(null);
      setStep((current) => Math.min(5, current + 1));
    } catch (validationError) {
      setError({ message: validationError.message });
    }
  }

  async function createAiPlan() {
    setPlanning(true);
    setError(null);
    resetApproval();

    try {
      const response = await fetch("/api/marketing/campaign-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          request: {
            business_goal: form.campaignBrief || form.goal,
            campaign_name: form.campaignName || null,
            preferred_channel_id: form.channelId || null,
            preferred_networks: form.networks,
            preferred_destination: form.destination || null,
            maximum_budget: form.totalBudget
              ? Number(form.totalBudget)
              : null,
            currency: walletCurrency || null,
            start_time: form.startTime || null,
            end_time: form.endTime || null,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw publicError(payload, "AI campaign planning failed");
      }

      const generated = unwrap(payload);
      const applied = applyUniversalPlanToForm({
        plan: generated,
        current: form,
        readiness,
      });
      setAiPlan(generated);
      setMode(applied.mode);
      setForm(applied.form);
      setStep(1);
    } catch (planError) {
      setError(planError?.message ? planError : publicError(planError));
    } finally {
      setPlanning(false);
    }
  }

  async function runPreflight() {
    try {
      validateStep(5);
    } catch (validationError) {
      setError({ message: validationError.message });
      return;
    }

    setPreflighting(true);
    setError(null);
    setPreflight(null);
    setOwnerApproved(false);

    try {
      const response = await fetch("/api/marketing/campaign-execution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preflight",
          organizationId,
          plan,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw publicError(payload, "Campaign preflight failed");
      }

      setPreflight(unwrap(payload));
      setPreflightFingerprint(currentFingerprint);
    } catch (preflightError) {
      setError(
        preflightError?.message
          ? preflightError
          : publicError(preflightError, "Campaign preflight failed"),
      );
    } finally {
      setPreflighting(false);
    }
  }

  async function approveAndExecute() {
    if (!preflightCurrent) {
      setError({
        message: "Run preflight again because the campaign plan changed",
      });
      return;
    }
    if (!ownerApproved) {
      setError({ message: "Confirm owner approval before wallet reservation" });
      return;
    }

    setExecuting(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/marketing/campaign-execution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve_and_execute",
          confirmOwnerApproval: true,
          organizationId,
          plan,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw publicError(payload, "Paused campaign creation failed");
      }

      setResult(unwrap(payload));
      setOwnerApproved(false);
      await loadReadiness();
    } catch (executeError) {
      setError(
        executeError?.message
          ? executeError
          : publicError(executeError, "Paused campaign creation failed"),
      );
    } finally {
      setExecuting(false);
    }
  }

  const steps = [
    "Goal & AI",
    "Channels",
    "Audience & budget",
    "Creative",
    "Review & approval",
  ];

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-white lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="mb-3 flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-[#D6A66A]">
              <Megaphone size={15} /> Marketing / Universal Campaigns
            </div>
            <h1 className="text-4xl font-light tracking-tight lg:text-5xl">
              Campaign Builder
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/42">
              Business goal to AI plan, owner approval, prepaid wallet reservation,
              provider preflight and paused-first execution.
            </p>
          </div>
          <button
            type="button"
            onClick={loadReadiness}
            disabled={loading}
            className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white/65 transition hover:border-[#D6A66A]/40 hover:text-[#D6A66A]"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh readiness
          </button>
        </header>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-white/35">
              <ShieldCheck size={15} style={{ color: GOLD }} /> Executable channels
            </div>
            <div className="mt-3 text-xl font-light">
              {loading ? "Checking" : readiness?.ready_channel_count || 0}
            </div>
            <div className="mt-1 text-xs text-white/32">
              Only channels with a real active adapter are offered
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-white/35">
              <WalletCards size={15} style={{ color: GOLD }} /> Available wallet
            </div>
            <div className="mt-3 text-xl font-light">
              {readiness?.wallet
                ? money(availableBalance, walletCurrency)
                : "Not available"}
            </div>
            <div className="mt-1 text-xs text-white/32">
              Funds are untouched during planning and preflight
            </div>
          </div>
          <div className="rounded-3xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.06] p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-[#D6A66A]/75">
              Execution safety
            </div>
            <div className="mt-3 text-xl font-light">Preflight · Owner approval</div>
            <div className="mt-1 text-xs text-white/35">
              Provider objects are created paused first
            </div>
          </div>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">
            <div className="flex gap-3">
              <AlertCircle size={17} className="mt-0.5 shrink-0" />
              <div>
                <div>{error.message}</div>
                {error.stage || error.code ? (
                  <div className="mt-2 text-xs uppercase tracking-[0.14em] text-red-200/55">
                    {[error.stage, error.code].filter(Boolean).join(" · ")}
                  </div>
                ) : null}
                {error.correction ? (
                  <div className="mt-2 text-xs leading-5 text-red-100/60">
                    Correction: {error.correction}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {result ? (
          <div className="mb-6 flex gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
            Campaign execution completed in paused-first mode. Review the provider
            result before any activation.
          </div>
        ) : null}

        <div className="mb-6 grid grid-cols-5 gap-2 rounded-3xl border border-white/10 bg-white/[0.025] p-3">
          {steps.map((label, index) => {
            const number = index + 1;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setStep(number)}
                className={`rounded-2xl px-3 py-3 text-xs transition ${
                  step === number
                    ? "bg-[#D6A66A] text-black"
                    : number < step
                      ? "bg-[#D6A66A]/10 text-[#D6A66A]"
                      : "text-white/35"
                }`}
              >
                <span className="mr-2 hidden sm:inline">{number}.</span>
                {label}
              </button>
            );
          })}
        </div>

        <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 lg:p-8">
          {step === 1 ? (
            <div className="mx-auto max-w-4xl space-y-6">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-[#D6A66A]">
                  Step 1
                </div>
                <h2 className="mt-2 text-3xl font-light">
                  Define the business outcome
                </h2>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Campaign name">
                  <input
                    className={inputClass}
                    value={form.campaignName}
                    onChange={(event) =>
                      update("campaignName", event.target.value)
                    }
                    placeholder="Name this campaign"
                  />
                </Field>
                <Field label="Planning mode">
                  <div className="grid grid-cols-2 gap-2">
                    {["simple", "advanced"].map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          setMode(item);
                          resetApproval();
                        }}
                        className={`rounded-2xl border px-4 py-3 text-sm capitalize ${
                          mode === item
                            ? "border-[#D6A66A]/60 bg-[#D6A66A]/10 text-[#D6A66A]"
                            : "border-white/10 bg-black/25 text-white/45"
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                {CAMPAIGN_GOALS.map((goal) => (
                  <Choice
                    key={goal.id}
                    active={form.goal === goal.id}
                    title={goal.name}
                    description={goal.description}
                    onClick={() => update("goal", goal.id)}
                  />
                ))}
              </div>

              <Field
                label="Business brief"
                hint="Describe the real business goal, offer, audience and timing. AI will use only connected executable channels."
              >
                <textarea
                  className={`${inputClass} min-h-36 resize-y`}
                  value={form.campaignBrief}
                  onChange={(event) =>
                    update("campaignBrief", event.target.value)
                  }
                  placeholder="Example: Build awareness and visits for a time-bound offer within a precise local radius..."
                />
              </Field>

              <button
                type="button"
                onClick={createAiPlan}
                disabled={planning || loading || !readiness?.ready_channel_count}
                className="flex w-full items-center justify-center gap-3 rounded-2xl border border-[#D6A66A]/40 bg-[#D6A66A]/10 px-5 py-4 text-sm font-semibold text-[#D6A66A] transition hover:bg-[#D6A66A]/15 disabled:opacity-35"
              >
                {planning ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <BrainCircuit size={18} />
                )}
                Let AI create the complete campaign plan
              </button>

              {aiPlan ? (
                <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
                  <div className="text-xs uppercase tracking-[0.16em] text-[#D6A66A]">
                    AI plan loaded · owner approval still required
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div className="text-sm text-white/55">
                      Confidence: {aiPlan.ai?.confidence ?? "Not stated"}
                    </div>
                    <div className="text-sm text-white/55">
                      Assumptions: {aiPlan.ai?.assumptions?.length || 0}
                    </div>
                    <div className="text-sm text-white/55">
                      Warnings: {aiPlan.ai?.warnings?.length || 0}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="mx-auto max-w-4xl space-y-6">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-[#D6A66A]">
                  Step 2
                </div>
                <h2 className="mt-2 text-3xl font-light">
                  Select a genuinely executable channel
                </h2>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {(readiness?.channels || []).map((channel) => (
                  <Choice
                    key={channel.id}
                    active={form.channelId === channel.id}
                    disabled={!channel.available}
                    title={channel.name}
                    badge={channel.readiness_state}
                    description={
                      channel.available
                        ? `${channel.adapter_version || "Active adapter"} · ${
                            channel.available_networks?.join(", ") || "Ready"
                          }`
                        : channel.reasons?.join("; ") || "Not executable"
                    }
                    onClick={() => {
                      update("channelId", channel.id);
                      setForm((current) => ({
                        ...current,
                        channelId: channel.id,
                        networks: (channel.available_networks || []).filter(
                          (network) =>
                            ["facebook", "instagram"].includes(network),
                        ),
                        destination:
                          channel.available_destinations?.[0] ||
                          channel.destinations?.[0] ||
                          "ENGAGEMENT",
                      }));
                    }}
                  />
                ))}
              </div>

              {selectedChannel ? (
                <>
                  <div>
                    <div className="mb-3 text-xs uppercase tracking-[0.16em] text-white/35">
                      Delivery networks
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {(selectedChannel.networks || []).map((network) => (
                        <Choice
                          key={network}
                          active={form.networks.includes(network)}
                          title={network.replace(/_/g, " ")}
                          description={`Deliver through ${network.replace(/_/g, " ")}`}
                          onClick={() => toggleList("networks", network)}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-3 text-xs uppercase tracking-[0.16em] text-white/35">
                      Destination
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      {(selectedChannel.destinations || []).map((destination) => (
                        <Choice
                          key={destination}
                          active={form.destination === destination}
                          title={DESTINATION_NAMES[destination] || destination}
                          description={`Optimize this channel for ${(
                            DESTINATION_NAMES[destination] || destination
                          ).toLowerCase()}`}
                          onClick={() => update("destination", destination)}
                        />
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="mx-auto max-w-5xl space-y-6">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-[#D6A66A]">
                  Step 3
                </div>
                <h2 className="mt-2 text-3xl font-light">
                  Audience, geography, schedule and budget
                </h2>
              </div>

              {mode === "simple" ? (
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Country code">
                    <input
                      className={inputClass}
                      maxLength={2}
                      value={form.country}
                      onChange={(event) =>
                        update("country", event.target.value.toUpperCase())
                      }
                      placeholder="TH"
                    />
                  </Field>
                  <Field label="Minimum age">
                    <input
                      className={inputClass}
                      type="number"
                      min="18"
                      value={form.ageMin}
                      onChange={(event) => update("ageMin", event.target.value)}
                    />
                  </Field>
                  <Field label="Maximum age">
                    <input
                      className={inputClass}
                      type="number"
                      min="18"
                      value={form.ageMax}
                      onChange={(event) => update("ageMax", event.target.value)}
                    />
                  </Field>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {(form.includedLocations || []).map((location) => (
                      <LocationEditor
                        key={location._key}
                        value={location}
                        onChange={(next) =>
                          updateLocation(
                            "includedLocations",
                            location._key,
                            next,
                          )
                        }
                        onRemove={() =>
                          removeLocation("includedLocations", location._key)
                        }
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => addLocation("includedLocations", "radius")}
                      className="flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm text-white/55"
                    >
                      <Plus size={16} /> Add included area
                    </button>
                  </div>

                  <div className="space-y-4">
                    {(form.excludedLocations || []).map((location) => (
                      <LocationEditor
                        key={location._key}
                        value={location}
                        excluded
                        onChange={(next) =>
                          updateLocation(
                            "excludedLocations",
                            location._key,
                            next,
                          )
                        }
                        onRemove={() =>
                          removeLocation("excludedLocations", location._key)
                        }
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => addLocation("excludedLocations", "radius")}
                      className="flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm text-white/55"
                    >
                      <Plus size={16} /> Add excluded area
                    </button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <Field label="Minimum age">
                      <input
                        className={inputClass}
                        type="number"
                        min="18"
                        value={form.ageMin}
                        onChange={(event) =>
                          update("ageMin", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Maximum age">
                      <input
                        className={inputClass}
                        type="number"
                        min="18"
                        value={form.ageMax}
                        onChange={(event) =>
                          update("ageMax", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Location presence">
                      <select
                        className={inputClass}
                        value={form.locationPresence}
                        onChange={(event) =>
                          update("locationPresence", event.target.value)
                        }
                      >
                        <option value="living_or_recent">Living in or recently in</option>
                        <option value="living_in">Living in</option>
                        <option value="recently_in">Recently in</option>
                        <option value="traveling_in">Traveling in</option>
                      </select>
                    </Field>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field
                      label="Language locale ids"
                      hint="Exact Meta locale ids, separated by commas."
                    >
                      <input
                        className={inputClass}
                        value={form.languageIds}
                        onChange={(event) =>
                          update("languageIds", event.target.value)
                        }
                      />
                    </Field>
                    <Field
                      label="Interest ids"
                      hint="Exact Meta interest ids, separated by commas."
                    >
                      <input
                        className={inputClass}
                        value={form.interestIds}
                        onChange={(event) =>
                          update("interestIds", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Behaviour ids">
                      <input
                        className={inputClass}
                        value={form.behaviorIds}
                        onChange={(event) =>
                          update("behaviorIds", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Custom audience ids">
                      <input
                        className={inputClass}
                        value={form.customAudienceIds}
                        onChange={(event) =>
                          update("customAudienceIds", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Excluded audience ids">
                      <input
                        className={inputClass}
                        value={form.excludedAudienceIds}
                        onChange={(event) =>
                          update("excludedAudienceIds", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Lookalike audience ids">
                      <input
                        className={inputClass}
                        value={form.lookalikeAudienceIds}
                        onChange={(event) =>
                          update("lookalikeAudienceIds", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                </>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Start">
                  <input
                    className={inputClass}
                    type="datetime-local"
                    value={form.startTime}
                    onChange={(event) => update("startTime", event.target.value)}
                  />
                </Field>
                <Field label="End" hint="Required to cap the maximum spend.">
                  <input
                    className={inputClass}
                    type="datetime-local"
                    value={form.endTime}
                    onChange={(event) => update("endTime", event.target.value)}
                  />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label={`Total budget${walletCurrency ? ` (${walletCurrency})` : ""}`}
                  hint={`Available: ${money(availableBalance, walletCurrency)}`}
                >
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    step="any"
                    value={form.totalBudget}
                    onChange={(event) =>
                      update("totalBudget", event.target.value)
                    }
                  />
                </Field>
                <Field label="Bid strategy">
                  <select
                    className={inputClass}
                    value={form.bidStrategy}
                    onChange={(event) =>
                      update("bidStrategy", event.target.value)
                    }
                  >
                    <option value="lowest_cost">Lowest cost</option>
                    <option value="cost_cap">Cost cap</option>
                    <option value="bid_cap">Bid cap</option>
                  </select>
                </Field>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="mx-auto max-w-5xl space-y-6">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-[#D6A66A]">
                  Step 4
                </div>
                <h2 className="mt-2 text-3xl font-light">
                  Select and verify the exact creative
                </h2>
              </div>

              <Field label="Creative asset">
                <select
                  className={inputClass}
                  value={form.assetId}
                  onChange={(event) => {
                    update("assetId", event.target.value);
                    setForm((current) => ({
                      ...current,
                      assetId: event.target.value,
                      confirmExactAsset: false,
                    }));
                  }}
                >
                  <option value="">Select creative</option>
                  {(readiness?.creative_assets || []).map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name} · {asset.approval_status}
                    </option>
                  ))}
                </select>
              </Field>

              {selectedAsset ? (
                <div className="rounded-3xl border border-white/10 bg-black/30 p-4">
                  <img
                    src={selectedAsset.preview_url}
                    alt={selectedAsset.name}
                    className="mx-auto max-h-[520px] rounded-2xl object-contain"
                  />
                  <div className="mt-4 text-sm text-white/65">
                    {selectedAsset.name}
                  </div>
                  <div className="mt-1 text-xs text-[#D6A66A]">
                    Exact source asset: {selectedAsset.id}
                  </div>
                </div>
              ) : null}

              <label className="flex items-start gap-3 rounded-2xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.06] p-4 text-sm leading-6 text-white/65">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={form.confirmExactAsset}
                  onChange={(event) =>
                    update("confirmExactAsset", event.target.checked)
                  }
                />
                <span>
                  I confirm the exact asset, identity, logo, people, food and layout.
                  Avantiqo must not regenerate or replace it.
                </span>
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Primary text">
                  <textarea
                    className={`${inputClass} min-h-36 resize-y`}
                    value={form.primaryText}
                    onChange={(event) =>
                      update("primaryText", event.target.value)
                    }
                  />
                </Field>
                <div className="space-y-4">
                  <Field label="Headline">
                    <input
                      className={inputClass}
                      value={form.headline}
                      onChange={(event) =>
                        update("headline", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Description">
                    <input
                      className={inputClass}
                      value={form.description}
                      onChange={(event) =>
                        update("description", event.target.value)
                      }
                    />
                  </Field>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Destination URL">
                  <input
                    className={inputClass}
                    type="url"
                    value={form.destinationUrl}
                    onChange={(event) =>
                      update("destinationUrl", event.target.value)
                    }
                  />
                </Field>
                <Field label="Call to action">
                  <select
                    className={inputClass}
                    value={form.callToAction}
                    onChange={(event) =>
                      update("callToAction", event.target.value)
                    }
                  >
                    <option value="LEARN_MORE">Learn more</option>
                    <option value="BOOK_NOW">Book now</option>
                    <option value="CONTACT_US">Contact us</option>
                    <option value="SIGN_UP">Sign up</option>
                    <option value="SHOP_NOW">Shop now</option>
                  </select>
                </Field>
              </div>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="mx-auto max-w-5xl space-y-6">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-[#D6A66A]">
                  Step 5
                </div>
                <h2 className="mt-2 text-3xl font-light">
                  Provider preflight and owner approval
                </h2>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-white/35">
                    Campaign plan
                  </div>
                  <div className="mt-3 text-xl">{form.campaignName}</div>
                  <div className="mt-3 space-y-1 text-sm text-white/45">
                    <div>Goal: {form.goal}</div>
                    <div>Channel: {form.channelId}</div>
                    <div>Networks: {form.networks.join(", ")}</div>
                    <div>Destination: {form.destination}</div>
                    <div>End: {form.endTime || "Not set"}</div>
                  </div>
                </div>
                <div className="rounded-3xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.06] p-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-[#D6A66A]/75">
                    Maximum wallet authorization
                  </div>
                  <div className="mt-3 text-3xl font-light">
                    {money(budget, walletCurrency)}
                  </div>
                  <div className="mt-3 text-sm leading-6 text-white/45">
                    Nothing is reserved during preflight. Reservation begins only
                    after explicit authenticated owner approval.
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                <div className="text-xs uppercase tracking-[0.18em] text-white/35">
                  Exact creative
                </div>
                <div className="mt-3 text-lg">
                  {selectedAsset?.name || "Not selected"}
                </div>
                <div className="mt-2 text-sm text-white/45">
                  {form.primaryText || "No primary text"}
                </div>
              </div>

              <button
                type="button"
                onClick={runPreflight}
                disabled={preflighting || executing}
                className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-4 font-semibold text-white/75 transition hover:border-[#D6A66A]/40 hover:text-[#D6A66A] disabled:opacity-35"
              >
                {preflighting ? (
                  <Loader2 size={19} className="animate-spin" />
                ) : (
                  <ShieldCheck size={19} />
                )}
                Run no-spend provider preflight
              </button>

              {preflightCurrent ? (
                <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-5">
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-100">
                    <CheckCircle2 size={17} /> Provider preflight passed
                  </div>
                  <div className="mt-3 text-xs leading-5 text-emerald-100/60">
                    Wallet changed: no · Campaign created: no · Execution mode:
                    paused first
                  </div>
                </div>
              ) : null}

              <label
                className={`flex items-start gap-3 rounded-2xl border p-4 text-sm leading-6 ${
                  preflightCurrent
                    ? "border-[#D6A66A]/30 bg-[#D6A66A]/[0.07] text-white/70"
                    : "border-white/10 bg-black/20 text-white/25"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  disabled={!preflightCurrent}
                  checked={ownerApproved}
                  onChange={(event) => setOwnerApproved(event.target.checked)}
                />
                <span>
                  I approve this exact campaign plan and authorize Avantiqo to
                  reserve up to {money(budget, walletCurrency)} and create the
                  provider campaign in paused status.
                </span>
              </label>

              <button
                type="button"
                onClick={approveAndExecute}
                disabled={!preflightCurrent || !ownerApproved || executing}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#D6A66A] px-5 py-4 font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {executing ? (
                  <Loader2 size={19} className="animate-spin" />
                ) : (
                  <ShieldCheck size={19} />
                )}
                Approve, reserve wallet and create paused campaign
              </button>
            </div>
          ) : null}

          <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-5">
            <button
              type="button"
              onClick={() => setStep((current) => Math.max(1, current - 1))}
              disabled={step === 1}
              className="rounded-xl px-4 py-2 text-sm text-white/45 disabled:opacity-20"
            >
              Back
            </button>
            {step < 5 ? (
              <button
                type="button"
                onClick={nextStep}
                className="flex items-center gap-2 rounded-xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black"
              >
                Continue <ChevronRight size={16} />
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

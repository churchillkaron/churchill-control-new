"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  ImagePlus,
  Loader2,
  Megaphone,
  PencilRuler,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";

import {
  CAMPAIGN_GOALS,
  DESTINATION_NAMES,
  applyUniversalPlanToForm,
  buildUniversalCampaignPlan,
  campaignPlanFingerprint,
  createDefaultCampaignForm,
} from "@/lib/marketing/campaigns/ui/CampaignBuilderModel";

const GOLD = "#D6A66A";
const inputClass =
  "w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-[#D6A66A]/60";

function unwrap(payload) {
  return payload?.data ?? payload?.result ?? payload;
}

function publicError(payload, fallback = "Something went wrong") {
  if (!payload) return { message: fallback };
  if (typeof payload === "string") return { message: payload };

  const nested = payload.error;
  if (typeof nested === "string") {
    return {
      message: nested,
      stage: payload.stage || null,
      code: payload.code || null,
      correction: payload.correction || null,
    };
  }

  return {
    stage: nested?.stage || payload.stage || null,
    code: nested?.code || payload.code || null,
    message:
      nested?.message ||
      payload.message ||
      nested?.error_user_msg ||
      nested?.error?.message ||
      fallback,
    correction: nested?.correction || payload.correction || null,
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

function ModeButton({ active, icon: Icon, title, description, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-3xl border p-5 text-left transition ${
        active
          ? "border-[#D6A66A]/55 bg-[#D6A66A]/10"
          : "border-white/10 bg-black/25 hover:border-white/20"
      }`}
    >
      <Icon className="h-5 w-5 text-[#D6A66A]" />
      <div className="mt-4 text-lg font-medium text-white">{title}</div>
      <div className="mt-2 text-sm leading-6 text-white/40">{description}</div>
    </button>
  );
}

function SummaryCard({ label, value, description }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
      <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">
        {label}
      </div>
      <div className="mt-3 text-xl font-light text-white">{value}</div>
      {description ? (
        <div className="mt-2 text-xs leading-5 text-white/35">{description}</div>
      ) : null}
    </div>
  );
}

export default function CampaignBuilderPage() {
  const params = useParams();
  const organizationId = params?.organizationId;

  const [experienceMode, setExperienceMode] = useState("autopilot");
  const [manualMode, setManualMode] = useState("simple");
  const [form, setForm] = useState(createDefaultCampaignForm);
  const [readiness, setReadiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [preflighting, setPreflighting] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [ownerApproved, setOwnerApproved] = useState(false);
  const [aiPlan, setAiPlan] = useState(null);
  const [preflight, setPreflight] = useState(null);
  const [preflightFingerprint, setPreflightFingerprint] = useState("");
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const walletCurrency = readiness?.wallet?.currency || "";
  const availableBalance = Number(readiness?.wallet?.available_balance || 0);
  const budget = Number(form.totalBudget || 0);
  const selectedChannel = useMemo(
    () =>
      (readiness?.connected_channels || []).find(
        (channel) => channel.id === form.channelId,
      ) || null,
    [readiness, form.channelId],
  );
  const selectedAsset = useMemo(
    () =>
      (readiness?.creative_assets || []).find(
        (asset) => asset.id === form.assetId,
      ) || null,
    [readiness, form.assetId],
  );

  const plan = useMemo(
    () =>
      buildUniversalCampaignPlan({
        form,
        organizationId,
        walletCurrency,
        mode: manualMode,
        ai: aiPlan?.ai || {},
      }),
    [form, organizationId, walletCurrency, manualMode, aiPlan],
  );

  const planFingerprint = useMemo(
    () => campaignPlanFingerprint(plan),
    [plan],
  );
  const preflightCurrent = Boolean(
    preflight && preflightFingerprint === planFingerprint,
  );
  const creativeStudioHref = `/workspace/${organizationId}/commercial/design?returnTo=${encodeURIComponent(
    `/workspace/${organizationId}/commercial/marketing/ads`,
  )}&source=campaign-builder`;

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
            ? current.networks
            : (firstReady?.networks || []).filter((network) =>
                ["facebook", "instagram"].includes(network),
              ),
        destination:
          (firstReady?.destinations || []).includes(current.destination)
            ? current.destination
            : firstReady?.destinations?.[0] || "ENGAGEMENT",
        country: current.country || "TH",
      }));
    } catch (loadError) {
      setReadiness(null);
      setError(
        loadError?.message
          ? loadError
          : publicError(loadError, "Campaign workspace could not be loaded"),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReadiness();
  }, [organizationId]);

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
            decision_mode: "AI_AUTOPILOT",
            owner_instruction:
              String(form.campaignBrief || "").trim() ||
              "Create the best executable campaign for this organization. Decide everything from the organization facts, connected channels, wallet and approved assets.",
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
      setManualMode(applied.mode);
      setForm(applied.form);
      setExperienceMode("autopilot");
    } catch (planError) {
      setError(
        planError?.message
          ? planError
          : publicError(planError, "AI campaign planning failed"),
      );
    } finally {
      setPlanning(false);
    }
  }

  async function runPreflight() {
    setPreflighting(true);
    setError(null);
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
      setPreflightFingerprint(planFingerprint);
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
    if (!preflightCurrent || !ownerApproved) return;
    setExecuting(true);
    setError(null);

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

  function openCreativeStudio() {
    try {
      window.sessionStorage.setItem(
        "avantiqo_campaign_creative_brief",
        JSON.stringify({
          organization_id: organizationId,
          source: "campaign-builder",
          return_to: `/workspace/${organizationId}/commercial/marketing/ads`,
          plan,
        }),
      );
    } catch {
      // Navigation still works when browser storage is unavailable.
    }
  }

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-white lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="mb-3 flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-[#D6A66A]">
              <Megaphone size={15} /> Marketing / Autonomous Campaigns
            </div>
            <h1 className="text-4xl font-light tracking-tight lg:text-5xl">
              Campaign Builder
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/42">
              Avantiqo decides the strategy, targeting, channel, budget, timing,
              copy and creative recommendation. The owner reviews the completed
              plan before any wallet reservation.
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
          <SummaryCard
            label="Executable channels"
            value={loading ? "Checking" : readiness?.ready_channel_count || 0}
            description="Only channels with a real provider adapter are offered."
          />
          <SummaryCard
            label="Available wallet"
            value={
              readiness?.wallet
                ? money(availableBalance, walletCurrency)
                : "Not available"
            }
            description="Planning and preflight do not reserve funds."
          />
          <div className="rounded-3xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.06] p-5">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#D6A66A]/75">
              <ShieldCheck size={15} /> Execution safety
            </div>
            <div className="mt-3 text-xl font-light">Paused first</div>
            <div className="mt-2 text-xs leading-5 text-white/35">
              Provider preflight and authenticated owner approval remain mandatory.
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
            Campaign created in paused-first mode. Review it before activation.
          </div>
        ) : null}

        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <ModeButton
            active={experienceMode === "autopilot"}
            icon={Sparkles}
            title="AI Autopilot"
            description="Avantiqo researches the available organization facts and decides the complete campaign. No marketing settings are required from the owner."
            onClick={() => setExperienceMode("autopilot")}
          />
          <ModeButton
            active={experienceMode === "manual"}
            icon={PencilRuler}
            title="Manual Expert"
            description="Optional expert controls for owners or agencies that need to override the autonomous plan."
            onClick={() => setExperienceMode("manual")}
          />
        </div>

        {experienceMode === "autopilot" ? (
          <section className="rounded-[36px] border border-[#D6A66A]/25 bg-[#D6A66A]/[0.055] p-6 lg:p-9">
            <div className="mx-auto max-w-5xl">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-[#D6A66A]">
                    Autonomous marketing director
                  </div>
                  <h2 className="mt-3 text-3xl font-light lg:text-4xl">
                    Let Avantiqo create the best campaign
                  </h2>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">
                    Avantiqo chooses the objective, channel, Facebook or Instagram
                    delivery, audience, geography, budget, schedule, copy and best
                    approved creative. Your only required action is final approval.
                  </p>
                </div>
                <BrainCircuit className="h-10 w-10 text-[#D6A66A]" />
              </div>

              <div className="mt-7">
                <Field
                  label="Optional owner instruction"
                  hint="Leave this empty to let Avantiqo decide everything from the organization data."
                >
                  <textarea
                    className={`${inputClass} min-h-32 resize-y`}
                    value={form.campaignBrief}
                    onChange={(event) =>
                      update("campaignBrief", event.target.value)
                    }
                    placeholder="Optional: promote a specific event, offer, product or date."
                  />
                </Field>
              </div>

              <button
                type="button"
                onClick={createAiPlan}
                disabled={planning || loading}
                className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#D6A66A] px-5 py-4 font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {planning ? (
                  <Loader2 size={19} className="animate-spin" />
                ) : (
                  <Sparkles size={19} />
                )}
                Create the best campaign for this business
              </button>

              {!loading && !readiness?.ready_channel_count ? (
                <div className="mt-3 text-center text-xs text-white/35">
                  The button remains available so Avantiqo can return the exact
                  readiness stage and required correction.
                </div>
              ) : null}
            </div>
          </section>
        ) : (
          <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 lg:p-8">
            <div className="mb-6">
              <div className="text-xs uppercase tracking-[0.24em] text-[#D6A66A]">
                Manual Expert
              </div>
              <h2 className="mt-2 text-3xl font-light">
                Override the campaign plan
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Campaign name">
                <input
                  className={inputClass}
                  value={form.campaignName}
                  onChange={(event) => update("campaignName", event.target.value)}
                />
              </Field>
              <Field label="Goal">
                <select
                  className={inputClass}
                  value={form.goal}
                  onChange={(event) => update("goal", event.target.value)}
                >
                  {CAMPAIGN_GOALS.map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {goal.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Channel">
                <select
                  className={inputClass}
                  value={form.channelId}
                  onChange={(event) => {
                    const channel = (readiness?.connected_channels || []).find(
                      (item) => item.id === event.target.value,
                    );
                    setForm((current) => ({
                      ...current,
                      channelId: event.target.value,
                      networks: (channel?.networks || []).filter((network) =>
                        ["facebook", "instagram"].includes(network),
                      ),
                      destination: channel?.destinations?.[0] || "ENGAGEMENT",
                    }));
                    resetApproval();
                  }}
                >
                  <option value="">Select executable channel</option>
                  {(readiness?.connected_channels || []).map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Destination">
                <select
                  className={inputClass}
                  value={form.destination}
                  onChange={(event) => update("destination", event.target.value)}
                >
                  {(selectedChannel?.destinations || ["ENGAGEMENT"]).map(
                    (destination) => (
                      <option key={destination} value={destination}>
                        {DESTINATION_NAMES[destination] || destination}
                      </option>
                    ),
                  )}
                </select>
              </Field>
              <Field label="Country">
                <input
                  className={inputClass}
                  maxLength={2}
                  value={form.country}
                  onChange={(event) =>
                    update("country", event.target.value.toUpperCase())
                  }
                />
              </Field>
              <Field label="Lifetime budget">
                <input
                  className={inputClass}
                  type="number"
                  value={form.totalBudget}
                  onChange={(event) => update("totalBudget", event.target.value)}
                />
              </Field>
              <Field label="Start">
                <input
                  className={inputClass}
                  type="datetime-local"
                  value={form.startTime}
                  onChange={(event) => update("startTime", event.target.value)}
                />
              </Field>
              <Field label="End">
                <input
                  className={inputClass}
                  type="datetime-local"
                  value={form.endTime}
                  onChange={(event) => update("endTime", event.target.value)}
                />
              </Field>
            </div>
          </section>
        )}

        {aiPlan ? (
          <section className="mt-6 rounded-[36px] border border-white/10 bg-white/[0.03] p-6 lg:p-9">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-[#D6A66A]">
                  Complete AI campaign plan
                </div>
                <h2 className="mt-2 text-3xl font-light">
                  Review Avantiqo&apos;s decision
                </h2>
              </div>
              <div className="text-sm text-white/40">
                Confidence: {aiPlan.ai?.confidence ?? "Not stated"}
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label="Campaign" value={form.campaignName || "Unnamed"} description={`Goal: ${form.goal}`} />
              <SummaryCard label="Channel" value={form.channelId || "Not selected"} description={form.networks.join(", ") || "No delivery network"} />
              <SummaryCard label="Audience" value={`${form.country || "Targeted area"} · ${form.ageMin}-${form.ageMax}`} description={form.destination} />
              <SummaryCard label="Maximum budget" value={money(budget, walletCurrency)} description={form.endTime ? `Ends ${form.endTime}` : "End time required"} />
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
                <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">
                  Campaign message
                </div>
                <div className="mt-3 text-lg text-white">
                  {form.headline || "Headline pending"}
                </div>
                <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/50">
                  {form.primaryText || "Primary text pending"}
                </div>
              </div>

              <div className="rounded-3xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.055] p-5">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#D6A66A]">
                  <ImagePlus size={15} /> Creative decision
                </div>
                <div className="mt-3 text-lg">
                  {selectedAsset?.name || "New campaign art required"}
                </div>
                <div className="mt-2 text-sm leading-6 text-white/45">
                  {selectedAsset
                    ? "Avantiqo selected an existing organization asset. The owner must still visually confirm the exact image."
                    : "No suitable approved asset was selected. Send the complete campaign brief to Creative Studio."}
                </div>
                <Link
                  href={creativeStudioHref}
                  onClick={openCreativeStudio}
                  className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-[#D6A66A]/35 bg-[#D6A66A]/10 px-4 py-3 text-sm font-semibold text-[#E6C18C] transition hover:bg-[#D6A66A]/15"
                >
                  <ImagePlus size={17} />
                  {selectedAsset ? "Open Creative Studio" : "Create recommended campaign art"}
                  <ArrowRight size={15} />
                </Link>
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-white/10 bg-black/25 p-5">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">
                Exact creative approval
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                <div>
                  <select
                    className={inputClass}
                    value={form.assetId}
                    onChange={(event) => {
                      setForm((current) => ({
                        ...current,
                        assetId: event.target.value,
                        confirmExactAsset: false,
                      }));
                      resetApproval();
                    }}
                  >
                    <option value="">Select exact approved creative</option>
                    {(readiness?.creative_assets || []).map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.name} · {asset.approval_status}
                      </option>
                    ))}
                  </select>
                  <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-white/55">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={form.confirmExactAsset}
                      disabled={!selectedAsset}
                      onChange={(event) =>
                        update("confirmExactAsset", event.target.checked)
                      }
                    />
                    I visually confirm this exact creative, including identity,
                    logo, people, food and layout.
                  </label>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
                  {selectedAsset?.preview_url ? (
                    <img
                      src={selectedAsset.preview_url}
                      alt={selectedAsset.name}
                      className="mx-auto max-h-[360px] rounded-xl object-contain"
                    />
                  ) : (
                    <div className="flex min-h-44 items-center justify-center text-sm text-white/30">
                      No exact creative selected
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <button
                type="button"
                onClick={runPreflight}
                disabled={preflighting || !form.confirmExactAsset}
                className="flex items-center justify-center gap-3 rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-4 font-semibold text-white/75 transition hover:border-[#D6A66A]/40 hover:text-[#D6A66A] disabled:opacity-35"
              >
                {preflighting ? (
                  <Loader2 size={19} className="animate-spin" />
                ) : (
                  <ShieldCheck size={19} />
                )}
                Run no-spend provider preflight
              </button>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/45">
                Preflight validates the exact provider payload. It does not reserve
                money and does not create a campaign.
              </div>
            </div>

            {preflightCurrent ? (
              <div className="mt-5 rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-100">
                  <CheckCircle2 size={17} /> Provider preflight passed
                </div>
                <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-emerald-50/75">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={ownerApproved}
                    onChange={(event) => setOwnerApproved(event.target.checked)}
                  />
                  I approve this exact AI-generated campaign plan and authorize
                  Avantiqo to reserve up to {money(budget, walletCurrency)} and
                  create the provider campaign in paused status.
                </label>
                <button
                  type="button"
                  onClick={approveAndExecute}
                  disabled={!ownerApproved || executing}
                  className="mt-5 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#D6A66A] px-5 py-4 font-semibold text-black transition hover:brightness-110 disabled:opacity-35"
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
          </section>
        ) : null}

        {!aiPlan && experienceMode === "manual" ? (
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={createAiPlan}
              disabled={planning || loading}
              className="flex items-center gap-2 rounded-2xl border border-[#D6A66A]/30 bg-[#D6A66A]/10 px-5 py-3 text-sm font-semibold text-[#D6A66A] disabled:opacity-35"
            >
              {planning ? <Loader2 size={17} className="animate-spin" /> : <BrainCircuit size={17} />}
              Let AI complete the manual brief
              <ChevronRight size={16} />
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}

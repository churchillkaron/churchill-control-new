"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  LoaderCircle,
  UserRound,
} from "lucide-react";

const STEPS = [
  {
    id: 1,
    label: "Business",
    title: "Your organization",
    detail: "Core business identity",
    icon: Building2,
  },
  {
    id: 2,
    label: "Owner",
    title: "Primary owner",
    detail: "Contact and access",
    icon: UserRound,
  },
  {
    id: 3,
    label: "Review",
    title: "Confirm setup",
    detail: "Create the workspace",
    icon: Check,
  },
];

const INDUSTRIES = [
  { value: "restaurant", label: "Restaurant" },
  { value: "retail", label: "Retail" },
  { value: "hotel", label: "Hotel" },
  { value: "agency", label: "Agency" },
];

const fieldClass =
  "h-11 w-full rounded-xl border border-black/[0.09] bg-white px-3.5 text-[12px] text-[#3E3A34] outline-none transition placeholder:text-[#AAA69E] hover:border-black/[0.14] focus:border-[#D6A66A]/70 focus:ring-2 focus:ring-[#D6A66A]/10";

function clean(value) {
  return String(value ?? "").trim();
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#777169]">
          {label}
        </span>
        {hint ? <span className="text-[9px] text-[#AAA69E]">{hint}</span> : null}
      </span>
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

function ReviewRow({ label, value }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center sm:gap-4">
      <div className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#918B83]">
        {label}
      </div>
      <div className="text-[12px] font-medium text-[#3E3934]">{value || "—"}</div>
    </div>
  );
}

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: "",
    industry: "",
    country: "",
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const progress = `${Math.round((step / STEPS.length) * 100)}%`;
  const industryLabel = useMemo(
    () => INDUSTRIES.find((item) => item.value === form.industry)?.label || form.industry,
    [form.industry],
  );

  const businessReady = Boolean(
    clean(form.name) && clean(form.industry) && clean(form.country),
  );
  const ownerReady = Boolean(clean(form.ownerName) && clean(form.ownerEmail));

  function update(key, value) {
    setError("");
    setResult(null);
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function submit() {
    if (!businessReady || !ownerReady || loading) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/onboarding/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || "Unable to create the organization");
      }

      setResult(data);

      if (data?.redirect?.redirectTo) {
        window.location.href = data.redirect.redirectTo;
      }
    } catch (submitError) {
      setError(submitError?.message || "Unable to create the organization");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-110px)] bg-[#F7F6F3] text-[#191919]">
      <div className="mx-auto max-w-[1180px] py-2 md:py-4">
        <header className="border-b border-black/[0.07] pb-6">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9A744B]">
            Getting started
          </div>
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-[30px] font-medium tracking-[-0.04em] text-[#181817] md:text-[34px]">
                Set up your organization
              </h1>
              <p className="mt-2 max-w-2xl text-[12px] leading-5 text-[#777169]">
                Give Avantiqo the business context it needs to create the right organization and workspace.
              </p>
            </div>
            <div className="min-w-[190px] lg:w-[230px]">
              <div className="flex items-center justify-between text-[9px] font-medium text-[#918B83]">
                <span>Step {step} of {STEPS.length}</span>
                <span>{Math.round((step / STEPS.length) * 100)}%</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#E9E5DE]">
                <div
                  className="h-full rounded-full bg-[#A37849] transition-all duration-300"
                  style={{ width: progress }}
                />
              </div>
            </div>
          </div>
        </header>

        <section className="mt-6 overflow-hidden rounded-[22px] border border-black/[0.07] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
          <div className="grid lg:grid-cols-[270px_minmax(0,1fr)]">
            <aside className="border-b border-black/[0.06] bg-[#FBF8F3] p-5 lg:min-h-[560px] lg:border-b-0 lg:border-r lg:p-6">
              <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#8A633C]">
                Setup
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
                {STEPS.map((item) => {
                  const Icon = item.icon;
                  const active = step === item.id;
                  const complete = step > item.id;

                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-3 transition ${
                        active
                          ? "border-[#A37849]/20 bg-[#F4EFE8]"
                          : "border-transparent bg-transparent"
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${
                          active
                            ? "border-[#A37849]/20 bg-white text-[#8A633C]"
                            : complete
                              ? "border-[#6F7E68]/15 bg-[#F5F7F3] text-[#6F7E68]"
                              : "border-black/[0.07] bg-white text-[#918B83]"
                        }`}
                      >
                        {complete ? <Check size={13} /> : <Icon size={13} />}
                      </span>
                      <span className="min-w-0">
                        <span
                          className={`block text-[10px] font-semibold ${
                            active ? "text-[#684A2D]" : "text-[#5F5952]"
                          }`}
                        >
                          {item.title}
                        </span>
                        <span className="mt-0.5 block text-[8px] text-[#9A948B]">
                          {item.detail}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 border-t border-black/[0.06] pt-5 text-[9px] leading-4 text-[#918B83] lg:mt-8">
                You can refine legal entities, Finance settings and operating configuration from the workspace after setup.
              </div>
            </aside>

            <div className="p-5 md:p-7 lg:p-8">
              {step === 1 ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (businessReady) setStep(2);
                  }}
                >
                  <div className="max-w-2xl">
                    <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#9A744B]">
                      Business
                    </div>
                    <h2 className="mt-1.5 text-[21px] font-semibold tracking-[-0.03em] text-[#292723]">
                      Tell us about the organization
                    </h2>
                    <p className="mt-1.5 text-[11px] leading-5 text-[#817B73]">
                      This becomes the organization context Avantiqo uses across the workspace.
                    </p>

                    <div className="mt-7 grid gap-5">
                      <Field label="Organization name">
                        <input
                          autoFocus
                          required
                          value={form.name}
                          onChange={(event) => update("name", event.target.value)}
                          placeholder="Company or organization name"
                          className={fieldClass}
                        />
                      </Field>

                      <div className="grid gap-5 md:grid-cols-2">
                        <Field label="Industry">
                          <select
                            required
                            value={form.industry}
                            onChange={(event) => update("industry", event.target.value)}
                            className={fieldClass}
                          >
                            <option value="">Select industry</option>
                            {INDUSTRIES.map((item) => (
                              <option key={item.value} value={item.value}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                        </Field>

                        <Field label="Business country">
                          <input
                            required
                            value={form.country}
                            onChange={(event) => update("country", event.target.value)}
                            placeholder="Country"
                            className={fieldClass}
                          />
                        </Field>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 flex items-center justify-end border-t border-black/[0.06] pt-5">
                    <button
                      type="submit"
                      disabled={!businessReady}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#25231F] px-4 text-[10px] font-semibold text-white transition hover:bg-[#34312C] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      Continue <ArrowRight size={12} />
                    </button>
                  </div>
                </form>
              ) : null}

              {step === 2 ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (ownerReady) setStep(3);
                  }}
                >
                  <div className="max-w-2xl">
                    <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#9A744B]">
                      Owner
                    </div>
                    <h2 className="mt-1.5 text-[21px] font-semibold tracking-[-0.03em] text-[#292723]">
                      Primary owner contact
                    </h2>
                    <p className="mt-1.5 text-[11px] leading-5 text-[#817B73]">
                      The owner email is used to connect the organization to an existing Avantiqo account when available.
                    </p>

                    <div className="mt-7 grid gap-5">
                      <Field label="Owner name">
                        <input
                          autoFocus
                          required
                          value={form.ownerName}
                          onChange={(event) => update("ownerName", event.target.value)}
                          placeholder="Full name"
                          className={fieldClass}
                        />
                      </Field>

                      <div className="grid gap-5 md:grid-cols-2">
                        <Field label="Owner email">
                          <input
                            type="email"
                            required
                            value={form.ownerEmail}
                            onChange={(event) => update("ownerEmail", event.target.value)}
                            placeholder="name@company.com"
                            className={fieldClass}
                          />
                        </Field>

                        <Field label="Owner phone" hint="Optional">
                          <input
                            type="tel"
                            value={form.ownerPhone}
                            onChange={(event) => update("ownerPhone", event.target.value)}
                            placeholder="Phone number"
                            className={fieldClass}
                          />
                        </Field>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 flex items-center justify-between border-t border-black/[0.06] pt-5">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3.5 text-[10px] font-semibold text-[#716B63] transition hover:bg-[#FAF9F7]"
                    >
                      <ArrowLeft size={12} /> Back
                    </button>
                    <button
                      type="submit"
                      disabled={!ownerReady}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#25231F] px-4 text-[10px] font-semibold text-white transition hover:bg-[#34312C] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      Review <ArrowRight size={12} />
                    </button>
                  </div>
                </form>
              ) : null}

              {step === 3 ? (
                <div>
                  <div className="max-w-2xl">
                    <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#9A744B]">
                      Review
                    </div>
                    <h2 className="mt-1.5 text-[21px] font-semibold tracking-[-0.03em] text-[#292723]">
                      Confirm the organization
                    </h2>
                    <p className="mt-1.5 text-[11px] leading-5 text-[#817B73]">
                      Check the setup before Avantiqo creates the organization and its workspace.
                    </p>

                    <div className="mt-6 overflow-hidden rounded-2xl border border-black/[0.07] bg-[#FCFBF8] px-4">
                      <div className="divide-y divide-black/[0.06]">
                        <ReviewRow label="Organization" value={form.name} />
                        <ReviewRow label="Industry" value={industryLabel} />
                        <ReviewRow label="Country" value={form.country} />
                        <ReviewRow label="Owner" value={form.ownerName} />
                        <ReviewRow label="Email" value={form.ownerEmail} />
                        <ReviewRow label="Phone" value={form.ownerPhone || "Not provided"} />
                      </div>
                    </div>

                    {error ? (
                      <div className="mt-4 rounded-xl border border-red-700/15 bg-red-50 px-3.5 py-3 text-[10px] text-red-800">
                        {error}
                      </div>
                    ) : null}

                    {result?.success ? (
                      <div className="mt-4 rounded-xl border border-[#6F7E68]/15 bg-[#F5F7F3] px-3.5 py-3 text-[10px] text-[#5D6A57]">
                        Organization created successfully.
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-8 flex items-center justify-between border-t border-black/[0.06] pt-5">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      disabled={loading}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3.5 text-[10px] font-semibold text-[#716B63] transition hover:bg-[#FAF9F7] disabled:opacity-40"
                    >
                      <ArrowLeft size={12} /> Back
                    </button>
                    <button
                      type="button"
                      onClick={submit}
                      disabled={loading || !businessReady || !ownerReady}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#25231F] px-4 text-[10px] font-semibold text-white transition hover:bg-[#34312C] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {loading ? (
                        <>
                          <LoaderCircle size={12} className="animate-spin" /> Creating organization
                        </>
                      ) : (
                        <>
                          Create organization <ArrowRight size={12} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

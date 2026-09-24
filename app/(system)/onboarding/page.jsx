"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
    detail: "Identity and Finance context",
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


const ACCOUNTING_STANDARDS = [
  { value: "IFRS", label: "IFRS" },
  { value: "TFRS", label: "TFRS — Thailand" },
  { value: "US_GAAP", label: "US GAAP" },
  { value: "LOCAL_GAAP", label: "Local GAAP / other" },
];

const fieldClass =
  "h-11 w-full rounded-xl border border-black/[0.09] bg-white px-3.5 text-[12px] text-[#3E3A34] outline-none transition placeholder:text-[#AAA69E] hover:border-black/[0.14] focus:border-[#D6A66A]/70 focus:ring-2 focus:ring-[#D6A66A]/10";

function clean(value) {
  return String(value ?? "").trim();
}

function isThailand(value) {
  const normalized = clean(value).toLowerCase();
  return normalized === "thailand" || normalized === "th" || normalized === "tha";
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
  const [industries, setIndustries] = useState([]);
  const [industriesLoading, setIndustriesLoading] = useState(true);
  const [signupIntent, setSignupIntent] = useState("business");
  const [onboardingSource, setOnboardingSource] = useState("");
  const [supplierAccountId, setSupplierAccountId] = useState("");
  const [form, setForm] = useState({
    name: "",
    industry: "",
    country: "",
    currency: "",
    accountingStandard: "IFRS",
    vatRegistered: null,
    legalName: "",
    companyRegistrationNumber: "",
    taxRegistrationNumber: "",
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const onboardingRequestRef = useRef(null);

  useEffect(() => {
    let active = true;
    const searchParams = new URLSearchParams(window.location.search);
    const requestedIntent = searchParams.get("intent") === "accounting_firm"
      ? "accounting_firm"
      : "business";
    setSignupIntent(requestedIntent);
    setOnboardingSource(searchParams.get("source") === "supplier" ? "supplier" : "");
    setSupplierAccountId(searchParams.get("supplierAccountId") || "");
    fetch("/api/auth/server-user", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!active || !response.ok || !data?.authenticated || !data?.user) return;
        const user = data.user;
        setForm((previous) => ({
          ...previous,
          ownerName: previous.ownerName || user.user_metadata?.full_name || user.user_metadata?.name || "",
          ownerEmail: previous.ownerEmail || user.email || "",
          ownerPhone: previous.ownerPhone || user.phone || user.user_metadata?.phone || "",
        }));
      })
      .catch(() => {});

    fetch("/api/onboarding/industries", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data?.success) throw new Error(data?.error || "Unable to load business types");
        const options = Array.isArray(data.options) ? data.options : [];
        if (!active) return;
        setIndustries(options);
        if (requestedIntent === "accounting_firm") {
          const firm = options.find((item) => item.value === "accounting_firm");
          if (!firm) throw new Error("Accounting Firm onboarding is not currently available");
          setForm((previous) => ({ ...previous, industry: "accounting_firm" }));
        }
      })
      .catch((loadError) => { if (active) setError(loadError?.message || "Unable to load business types"); })
      .finally(() => { if (active) setIndustriesLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (onboardingSource !== "supplier" || !supplierAccountId) return;
    let active = true;
    fetch("/api/supplier-portal/storefront", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data?.success) throw new Error(data?.error || "Unable to load Supplier profile");
        if (!active || String(data?.account?.id || "") !== String(supplierAccountId)) return;
        setForm((previous) => ({
          ...previous,
          name: previous.name || data.account?.business_name || data.account?.display_name || "",
          ownerName: previous.ownerName || data.account?.display_name || "",
          ownerEmail: previous.ownerEmail || data.account?.email || "",
          ownerPhone: previous.ownerPhone || data.account?.phone || "",
        }));
      })
      .catch((supplierError) => {
        if (active) setError(supplierError?.message || "Unable to load Supplier profile");
      });
    return () => { active = false; };
  }, [onboardingSource, supplierAccountId]);

  const progress = `${Math.round((step / STEPS.length) * 100)}%`;
  const industryLabel = useMemo(
    () => industries.find((item) => item.value === form.industry)?.label || form.industry,
    [industries, form.industry],
  );
  const accountingStandardLabel = useMemo(
    () =>
      ACCOUNTING_STANDARDS.find((item) => item.value === form.accountingStandard)?.label ||
      form.accountingStandard,
    [form.accountingStandard],
  );

  const businessReady = Boolean(
    clean(form.name) &&
      clean(form.industry) &&
      clean(form.country) &&
      /^[A-Za-z]{3}$/.test(clean(form.currency)) &&
      clean(form.accountingStandard) &&
      (!isThailand(form.country) ||
        (typeof form.vatRegistered === "boolean" &&
          (!form.vatRegistered || clean(form.taxRegistrationNumber)))),
  );
  const ownerReady = Boolean(clean(form.ownerName) && clean(form.ownerEmail));

  function update(key, value) {
    setError("");
    setResult(null);
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function updateCountry(value) {
    setError("");
    setResult(null);
    setForm((previous) => {
      const thai = isThailand(value);
      const wasThai = isThailand(previous.country);

      return {
        ...previous,
        country: value,
        currency: thai
          ? "THB"
          : wasThai && previous.currency === "THB"
            ? ""
            : previous.currency,
        accountingStandard: thai
          ? "TFRS"
          : wasThai && previous.accountingStandard === "TFRS"
            ? "IFRS"
            : previous.accountingStandard,
        vatRegistered: thai ? previous.vatRegistered : null,
        taxRegistrationNumber: thai ? previous.taxRegistrationNumber : "",
      };
    });
  }

  function updateVatRegistration(value) {
    setError("");
    setResult(null);
    setForm((previous) => ({
      ...previous,
      vatRegistered: value,
      taxRegistrationNumber: value === true ? previous.taxRegistrationNumber : "",
    }));
  }

  async function submit() {
    if (!businessReady || !ownerReady || loading) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const requestFingerprint = JSON.stringify({
        form,
        signupIntent,
        onboardingSource,
        supplierAccountId,
      });
      if (
        !onboardingRequestRef.current ||
        onboardingRequestRef.current.fingerprint !== requestFingerprint
      ) {
        onboardingRequestRef.current = {
          id: globalThis.crypto.randomUUID(),
          fingerprint: requestFingerprint,
        };
      }

      const response = await fetch("/api/onboarding/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          onboardingRequestId: onboardingRequestRef.current.id,
          signupIntent,
          onboardingSource,
          supplierAccountId,
          currency: clean(form.currency).toUpperCase(),
          vatRegistered: form.vatRegistered,
          legalName: clean(form.legalName),
          companyRegistrationNumber: clean(form.companyRegistrationNumber),
          taxRegistrationNumber: clean(form.taxRegistrationNumber),
          paymentSetup: { enabled: false },
        }),
      });

      const data = await response.json();

      if (!response.ok || data?.success === false) {
        if (data?.retryWithNewOnboardingRequest === true) {
          onboardingRequestRef.current = null;
        }
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
                Give Avantiqo the business and Finance context it needs to create the right organization, legal entity and workspace.
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
            <aside className="border-b border-black/[0.06] bg-[#FBF8F3] p-5 lg:min-h-[600px] lg:border-b-0 lg:border-r lg:p-6">
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
                Avantiqo derives Finance defaults from the selected country whenever a governed jurisdiction pack exists. The owner is only asked for legal facts Avantiqo cannot infer, such as VAT registration.
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
                      These values become the organization and default legal-entity context used across Avantiqo.
                    </p>
                    {signupIntent === "accounting_firm" ? (
                      <div className="mt-4 rounded-xl border border-[#B98A52]/18 bg-[#F7EFE4] px-3.5 py-3 text-[9px] leading-5 text-[#765B3F]">
                        This signup is locked to the governed Accounting Firm organization type. Client organizations are connected separately after the firm workspace exists.
                      </div>
                    ) : null}

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
                            disabled={signupIntent === "accounting_firm"}
                            className={`${fieldClass} disabled:bg-[#F3F0EB] disabled:text-[#6F675E]`}
                          >
                            <option value="">{industriesLoading ? "Loading business types…" : "Select business type"}</option>
                            {industries
                              .filter((item) => signupIntent === "accounting_firm" ? item.value === "accounting_firm" : item.value !== "accounting_firm")
                              .map((item) => (
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
                            onChange={(event) => updateCountry(event.target.value)}
                            placeholder="Country"
                            className={fieldClass}
                          />
                        </Field>
                      </div>

                      {isThailand(form.country) ? (
                        <div className="rounded-2xl border border-[#A37849]/15 bg-[#FBF6EF] p-4">
                          <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]">Finance configured by Avantiqo</div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <div className="rounded-xl border border-black/[0.06] bg-white px-3 py-2.5">
                              <div className="text-[8px] uppercase tracking-[0.11em] text-[#999188]">Base currency</div>
                              <div className="mt-1 text-[11px] font-semibold text-[#3E3934]">THB · Thai Baht</div>
                            </div>
                            <div className="rounded-xl border border-black/[0.06] bg-white px-3 py-2.5">
                              <div className="text-[8px] uppercase tracking-[0.11em] text-[#999188]">Accounting</div>
                              <div className="mt-1 text-[11px] font-semibold text-[#3E3934]">TFRS · Thailand baseline</div>
                            </div>
                          </div>
                          <div className="mt-4">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#777169]">VAT registered?</div>
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              {[true, false].map((value) => {
                                const active = form.vatRegistered === value;
                                return (
                                  <button
                                    key={String(value)}
                                    type="button"
                                    onClick={() => updateVatRegistration(value)}
                                    className={`h-11 rounded-xl border text-[11px] font-semibold transition ${active ? "border-[#A37849]/35 bg-[#EFE3D4] text-[#6F4E2C]" : "border-black/[0.07] bg-white text-[#6F6961] hover:bg-[#FAF8F5]"}`}
                                  >
                                    {value ? "Yes" : "No"}
                                  </button>
                                );
                              })}
                            </div>
                            <div className="mt-2 text-[9px] leading-4 text-[#8D867D]">Avantiqo will only activate VAT charging and VAT filing configuration when you select Yes. Current governed Thailand VAT rate: 7% through 30 September 2027.</div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid gap-5 md:grid-cols-2">
                          <Field label="Base currency" hint="Advanced fallback">
                            <input
                              required
                              maxLength={3}
                              value={form.currency}
                              onChange={(event) => update("currency", event.target.value.toUpperCase())}
                              placeholder="USD, EUR, SGD…"
                              className={fieldClass}
                            />
                          </Field>

                          <Field label="Accounting standard" hint="Advanced fallback">
                            <select
                              required
                              value={form.accountingStandard}
                              onChange={(event) => update("accountingStandard", event.target.value)}
                              className={fieldClass}
                            >
                              {ACCOUNTING_STANDARDS.map((item) => (
                                <option key={item.value} value={item.value}>
                                  {item.label}
                                </option>
                              ))}
                            </select>
                          </Field>
                        </div>
                      )}

                      <div className="grid gap-4 rounded-2xl border border-black/[0.06] bg-[#FCFBF8] p-4 md:grid-cols-2">
                        <Field label="Legal name" hint="Only if different from organization name">
                          <input
                            value={form.legalName}
                            onChange={(event) => update("legalName", event.target.value)}
                            placeholder={form.name || "Registered legal name"}
                            className={fieldClass}
                          />
                        </Field>
                        <Field label="Company registration number" hint="Optional">
                          <input
                            value={form.companyRegistrationNumber}
                            onChange={(event) => update("companyRegistrationNumber", event.target.value)}
                            placeholder="Registration number"
                            className={fieldClass}
                          />
                        </Field>
                        {isThailand(form.country) && form.vatRegistered === true ? (
                          <div className="md:col-span-2">
                            <Field label="VAT / tax registration number" hint="Required because VAT = Yes">
                              <input
                                required
                                value={form.taxRegistrationNumber}
                                onChange={(event) => update("taxRegistrationNumber", event.target.value)}
                                placeholder="Registered tax / VAT number"
                                className={fieldClass}
                              />
                            </Field>
                          </div>
                        ) : null}
                      </div>

                    </div>
                  </div>

                  <div className="mt-8 flex items-center justify-end border-t border-black/[0.06] pt-5">
                    <button
                      type="submit"
                      disabled={!businessReady || industriesLoading}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#25231F] px-4 text-[10px] font-semibold text-[#191919] transition hover:bg-[#34312C] disabled:cursor-not-allowed disabled:opacity-35"
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
                      The owner must already have an Avantiqo account. The contact becomes the organization’s canonical owner Party and access record.
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
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#25231F] px-4 text-[10px] font-semibold text-[#191919] transition hover:bg-[#34312C] disabled:cursor-not-allowed disabled:opacity-35"
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
                      Check the setup before Avantiqo creates the organization, owner Party, Finance baseline and workspace.
                    </p>

                    <div className="mt-6 overflow-hidden rounded-2xl border border-black/[0.07] bg-[#FCFBF8] px-4">
                      <div className="divide-y divide-black/[0.06]">
                        <ReviewRow label="Organization" value={form.name} />
                        <ReviewRow label="Industry" value={industryLabel} />
                        <ReviewRow label="Country" value={form.country} />
                        <ReviewRow label="Currency" value={clean(form.currency).toUpperCase()} />
                        <ReviewRow label="Accounting" value={accountingStandardLabel} />
                        <ReviewRow
                          label="Tax setup"
                          value={isThailand(form.country) ? "Thailand jurisdiction pack · configured by Avantiqo" : "Country-specific setup required"}
                        />
                        {isThailand(form.country) ? (
                          <ReviewRow label="VAT registered" value={form.vatRegistered ? "Yes" : "No"} />
                        ) : null}
                        <ReviewRow label="Legal name" value={form.legalName || form.name} />
                        {form.companyRegistrationNumber ? <ReviewRow label="Company registration" value={form.companyRegistrationNumber} /> : null}
                        {isThailand(form.country) && form.vatRegistered ? <ReviewRow label="VAT / tax registration" value={form.taxRegistrationNumber} /> : null}
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
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#25231F] px-4 text-[10px] font-semibold text-[#191919] transition hover:bg-[#34312C] disabled:cursor-not-allowed disabled:opacity-40"
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

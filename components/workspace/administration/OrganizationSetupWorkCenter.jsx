"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Circle, ExternalLink, LoaderCircle } from "lucide-react";

const SETUP = [
  ["brand", "Brand identity", "/commercial/marketing/brand", "Primary logo, compact icon, derived colors, typography direction and voice.", "foundation"],
  ["modules", "Modules & workspaces", "/administration/modules", "Industry template installs the starting modules; change the enabled set here.", "foundation"],
  ["locations", "Business locations", "/administration/business-locations", "Add operating sites, branches and workforce locations.", "foundation"],
  ["documents", "Documents & templates", "/documents/templates", "Configure reusable document templates and verify the organization’s controlled document library.", "foundation"],

  ["team", "Owner & team", "/administration/users", "Invite staff and assign organization roles.", "people_finance"],
  ["roles_permissions", "Roles & permissions", "/administration/roles-permissions", "Review organization roles, permission matrices and role hierarchy before wider team access.", "people_finance"],
  ["finance", "Finance", "/finance/configure", "Legal entity, accounting profile, tax baseline, fiscal period and finance defaults.", "people_finance"],
  ["people", "People", "/people/directory", "Staff directory and workforce foundation for HR/payroll-enabled organizations.", "people_finance"],
  ["staff_portal", "Staff Portal", "/people/directory", "Prepare employee identities, secure portal activation and staff access without creating separate back-office identities.", "people_finance"],
  ["payroll", "Payroll setup", "/administration/onboarding/payroll", "Prepare legal employer, payroll policy, compensation, schedules, attendance and settlement readiness before the first payroll run.", "people_finance"],

  ["supply_chain", "Supply Chain", "/supply-chain/procurement/supplier-network", "Inventory and supplier foundation for procurement/inventory-enabled organizations.", "operations"],
  ["supplier_portal", "Supplier Portal", "/supply-chain/procurement/supplier-access", "Invite canonical suppliers into customer-scoped external portal access without granting internal workspace membership.", "operations"],
  ["operations", "Operations", "/operations/configuration", "Operating locations and operational configuration for POS/operations-enabled organizations.", "operations"],
  ["pos", "Point of Sale", "/operations/pos", "Configure and verify the organization’s stationary POS surface when the POS module is enabled.", "operations"],
  ["projects", "Projects", "/projects", "Project foundation for organizations using the Projects module.", "operations"],
  ["hotel_channels", "Hotel distribution channels", "/operations/channel-manager", "Configure Booking.com and other OTA distribution only for hotel-enabled organizations, with proof-based readiness.", "operations"],

  ["commercial", "Commercial & customers", "/commercial/customers", "Customer master data and commercial operating foundation.", "customers_channels"],
  ["customer_portal", "Customer Portal", "/commercial/customers", "Prepare secure one-time customer access for orders, invoices, payments and linked bookings.", "customers_channels"],
  ["communications", "Channels & connections", "/administration/communications-setup", "Connect messaging, social, reviews, advertising, commerce and email accounts.", "customers_channels"],
  ["payments", "Customer payments", "/administration/payments", "Connect the organization’s own bank, card and QR payment methods.", "customers_channels"],
  ["integrations", "Integrations", "/administration/integrations", "Connect external providers and business systems.", "customers_channels"],

  ["domains", "Domains & external access", "/administration/domains", "Register customer-owned hostnames for branded access and Staff Portal using DNS ownership verification.", "platform_security"],
  ["compliance", "Compliance & obligations", "/compliance", "Track licenses, permits, insurance, frameworks, risks, controls and renewal obligations.", "platform_security"],
  ["passkeys", "Authentication & passkeys", "/administration/passkey-readiness", "Prepare passwordless staff identity, hosted passkey configuration and rollout readiness before mandatory enforcement.", "platform_security"],
  ["developer_api", "Developer API & Webhooks", "/developers", "Configure environments, machine credentials, API access and governed webhook delivery.", "platform_security"],
  ["security", "Security & policy", "/administration/access-policy", "Review access policy, approvals and stronger authentication.", "platform_security"],
];

const GROUPS = [
  ["foundation", "Company foundation", "Identity, modules, locations and reusable company records."],
  ["people_finance", "Finance & people", "Ownership, permissions, accounting, workforce and payroll readiness."],
  ["operations", "Operations", "Operational configuration for the modules this organization actually uses."],
  ["customers_channels", "Customers & channels", "Customer relationships, portals, communications, payments and external connections."],
  ["platform_security", "Platform, compliance & security", "Compliance obligations, Developer API/webhooks and organization security policy."],
];
export default function OrganizationSetupWorkCenter({ organizationId }) {
  const [readiness, setReadiness] = useState(null);
  const [progress, setProgress] = useState({ available:false, sections:{} });
  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      setError("");
      const [readinessResponse, progressResponse] = await Promise.all([
        fetch(`/api/onboarding/readiness?organizationId=${encodeURIComponent(organizationId)}`, { cache:"no-store" }),
        fetch(`/api/onboarding/progress?organizationId=${encodeURIComponent(organizationId)}`, { cache:"no-store" }),
      ]);
      const body = await readinessResponse.json().catch(() => ({}));
      if (!readinessResponse.ok || body?.success === false) throw new Error(body?.error || "Unable to load company setup");
      const progressBody = await progressResponse.json().catch(() => ({}));
      setReadiness(body);
      if (progressResponse.ok && progressBody?.success !== false) {
        setProgress({ available:progressBody.available === true, sections:progressBody.sections || {} });
      } else if (progressResponse.status === 503 && progressBody?.error === "ONBOARDING_PROGRESS_MIGRATION_REQUIRED") {
        setProgress({ available:false, sections:{} });
      } else {
        throw new Error(progressBody?.error || "Unable to load onboarding progress");
      }
    } catch (loadError) {
      setError(loadError?.message || "Unable to load company setup");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const updateProgress = useCallback(async (sectionKey, workflowState) => {
    if (!organizationId || savingSection) return;
    try {
      setSavingSection(sectionKey);
      setError("");
      const response = await fetch("/api/onboarding/progress", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ organizationId, sectionKey, workflowState }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to update setup progress");
      setProgress((current) => ({
        available:true,
        sections:{ ...current.sections, [sectionKey]:body.section },
      }));
    } catch (saveError) {
      setError(saveError?.message || "Unable to update setup progress");
    } finally {
      setSavingSection("");
    }
  }, [organizationId, savingSection]);

  const summary = useMemo(() => ({
    configured: Number(readiness?.summary?.configured || 0),
    total: Number(readiness?.summary?.total || SETUP.length),
  }), [readiness]);

  return (
    <div className="min-h-[calc(100vh-92px)] bg-[#F7F6F3] px-4 py-5 text-[#24201B] md:px-6">
      <div className="mx-auto max-w-[1280px]">
        <header className="flex flex-col gap-4 border-b border-black/[0.07] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#A37849]">Administration · Onboarding</div>
            <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.04em]">Organization Setup</h1>
            <p className="mt-2 max-w-3xl text-[11px] leading-5 text-[#777169]">Avantiqo reads the company’s real configuration and shows what is already ready. Complete as much as you want now; optional areas can be finished later without losing anything.</p>
          </div>
          {!loading ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="rounded-2xl border border-black/[0.07] bg-white px-5 py-3 text-right">
                <div className="text-[22px] font-semibold tracking-[-0.04em]">{summary.configured}/{summary.total}</div>
                <div className="mt-1 text-[8px] uppercase tracking-[0.12em] text-[#938B82]">Setup areas configured{readiness?.summary?.review ? ` · ${readiness.summary.review} review` : ""}</div>
              </div>
              <Link href={`/workspace/${organizationId}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#B98A52]/25 bg-[#EFE3D3] px-4 text-[9px] font-semibold text-[#76502E] transition hover:bg-[#E8D6BF]">Finish later · Open workspace <ArrowRight size={10} /></Link>
            </div>
          ) : null}
        </header>

        {error ? <div className="mt-4 rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[10px] text-red-800">{error}</div> : null}
        {!loading && !progress.available ? <div className="mt-4 rounded-xl border border-[#B98A52]/18 bg-[#FBF6EF] px-4 py-3 text-[9px] text-[#776958]">Progress persistence is waiting for the onboarding progress database migration. Readiness remains accurate and setup links still work.</div> : null}
        {loading ? <div className="mt-8 flex items-center gap-2 text-[10px] text-[#817B73]"><LoaderCircle size={13} className="animate-spin" />Checking organization readiness…</div> : null}

        {!loading && readiness ? <div className="mt-6 space-y-7">
          {GROUPS.map(([groupKey, groupLabel, groupDetail]) => {
            const groupItems = SETUP.filter(([, , , , group]) => group === groupKey).filter(([key]) => readiness?.sections?.[key]?.enabled !== false);
            if (!groupItems.length) return null;
            const configuredInGroup = groupItems.filter(([key]) => readiness?.sections?.[key]?.configured === true).length;
            const reviewInGroup = groupItems.filter(([key]) => readiness?.sections?.[key]?.needsReview === true).length;
            return (
              <section key={groupKey}>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-black/[0.06] pb-2">
                  <div>
                    <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#A37849]">{groupLabel}</div>
                    <div className="mt-1 text-[9px] text-[#8A8177]">{groupDetail}</div>
                  </div>
                  <div className="text-[8px] text-[#9A9188]">{configuredInGroup}/{groupItems.length} configured{reviewInGroup ? ` · ${reviewInGroup} review` : ""}</div>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {groupItems.map(([key, label, path, fallback]) => {
                    const state = readiness?.sections?.[key] || null;
                    const configured = state?.configured === true;
                    const review = state?.needsReview === true;
                    const workflow = progress.sections?.[key]?.workflow_state || null;
                    const skipped = workflow === "SKIPPED" && !configured;
                    const tone = review
                      ? "border-amber-700/15 bg-amber-50 text-amber-700"
                      : configured
                        ? "border-emerald-700/15 bg-emerald-50 text-emerald-700"
                        : skipped
                          ? "border-black/[0.08] bg-[#F6F4F1] text-[#817B73]"
                          : "border-[#A37849]/15 bg-[#F8F1E8] text-[#8A633C]";
                    const badge = review
                      ? "bg-amber-50 text-amber-700"
                      : configured
                        ? "bg-emerald-50 text-emerald-700"
                        : skipped
                          ? "bg-[#F0EEEA] text-[#777169]"
                          : "bg-[#F0E7DA] text-[#8A633C]";
                    const separator = path.includes("?") ? "&" : "?";
                    const setupHref = `/workspace/${organizationId}${path}${separator}onboarding=1&onboardingSection=${encodeURIComponent(key)}`;
                    return (
                      <div key={key} className="group flex min-h-[184px] flex-col rounded-[18px] border border-black/[0.07] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.025)] transition hover:border-[#C8AD8C] hover:bg-[#FFFCF8]">
                        <Link href={setupHref} className="flex flex-1 flex-col">
                          <div className="flex items-start justify-between gap-3">
                            <span className={`flex h-8 w-8 items-center justify-center rounded-xl border ${tone}`}>
                              {configured && !review ? <Check size={13} /> : <Circle size={12} />}
                            </span>
                            <span className={`rounded-full px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.09em] ${badge}`}>{review ? "Review" : configured ? "Configured" : skipped ? "Skipped" : "Optional"}</span>
                          </div>
                          <div className="mt-4 text-[12px] font-semibold">{label}</div>
                          <div className="mt-1.5 flex-1 text-[9px] leading-5 text-[#817B73]">{state?.detail || fallback}</div>
                        </Link>
                        <div className="mt-4 flex items-center justify-between gap-2">
                          <Link href={setupHref} className="inline-flex items-center gap-1.5 text-[8px] font-semibold text-[#806444]">
                            Open setup <ExternalLink size={9} />
                          </Link>
                          {!configured ? (
                            <button
                              type="button"
                              disabled={!progress.available || savingSection === key}
                              onClick={() => updateProgress(key, skipped ? "IN_PROGRESS" : "SKIPPED")}
                              className="rounded-lg border border-black/[0.07] bg-white px-2 py-1 text-[7px] font-semibold text-[#7D756C] transition hover:border-[#C8AD8C] disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              {savingSection === key ? "Saving…" : skipped ? "Resume setup" : "Skip for now"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div> : null}

        <div className="mt-5 rounded-[18px] border border-[#C8AD8C]/20 bg-[#FBF6EF] px-4 py-3 text-[9px] leading-5 text-[#776958]">
          Required legal and Finance foundations are created during initial onboarding. These remaining areas are progressive: completing them improves readiness, but Avantiqo does not block the company from opening its workspace simply because an optional integration, location or channel has not been configured yet.
        </div>
      </div>
    </div>
  );
}

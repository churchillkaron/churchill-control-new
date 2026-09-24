"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, ImageIcon, LoaderCircle, Sparkles, Upload } from "lucide-react";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

const NEXT_SETUP = [
  ["modules", "Modules", "/administration/modules", "Choose the Avantiqo workspaces this company will use."],
  ["team", "Team", "/administration/users", "Invite staff and assign organization roles."],
  ["communications", "Channels & connections", "/administration/communications-setup", "Connect messaging, social, reviews, advertising, commerce and email accounts."],
  ["payments", "Payments", "/administration/payments", "Connect the company’s own payment methods and settlement accounts."],
  ["locations", "Locations", "/administration/business-locations", "Set operating locations and business sites."],
  ["integrations", "Integrations", "/administration/integrations", "Connect external systems and providers."],
  ["security", "Security", "/administration/access-policy", "Set access policy, approvals and stronger authentication."],
];

function AssetPicker({ label, detail, file, onChange, compact = false }) {
  return (
    <label className="group flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-[18px] border border-dashed border-[#CDB99E] bg-[#FCFAF6] p-5 text-center transition hover:border-[#A77A48] hover:bg-[#FBF5EC]">
      <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(event) => onChange(event.target.files?.[0] || null)} />
      <div className={`flex ${compact ? "h-10 w-10" : "h-12 w-12"} items-center justify-center rounded-2xl border border-[#D9C7B0] bg-white text-[#9A6B38] shadow-sm`}>
        {compact ? <ImageIcon size={17} /> : <Upload size={18} />}
      </div>
      <div className="mt-3 text-[11px] font-semibold text-[#3D352C]">{label}</div>
      <div className="mt-1 max-w-[250px] text-[9px] leading-4 text-[#8B8278]">{detail}</div>
      <div className="mt-3 rounded-full bg-[#F0E7DA] px-3 py-1 text-[8px] font-semibold text-[#7A5732]">{file ? file.name : "Choose image"}</div>
    </label>
  );
}

export default function MarketingBrandPage() {
  const { organization } = useOrganizationRuntime();
  const organizationId = organization?.id || null;
  const [brand, setBrand] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [primaryLogo, setPrimaryLogo] = useState(null);
  const [logoIcon, setLogoIcon] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [onboardingMode, setOnboardingMode] = useState(false);

  useEffect(() => {
    setOnboardingMode(new URLSearchParams(window.location.search).get("onboarding") === "1");
  }, []);

  const loadBrand = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const response = await fetch(`/api/creative/brand/profile?organizationId=${encodeURIComponent(organizationId)}`, { cache:"no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load brand");
      setBrand(body.brand || null);
      const readinessResponse = await fetch(`/api/onboarding/readiness?organizationId=${encodeURIComponent(organizationId)}`, { cache:"no-store" });
      const readinessBody = await readinessResponse.json().catch(() => ({}));
      if (readinessResponse.ok && readinessBody?.success !== false) setReadiness(readinessBody);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load brand");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { loadBrand(); }, [loadBrand]);

  async function generateBrand() {
    if (!organizationId || (!primaryLogo && !logoIcon) || saving) return;
    try {
      setSaving(true);
      setError("");
      setNotice("");
      const formData = new FormData();
      formData.set("organizationId", organizationId);
      if (primaryLogo) formData.set("primary_logo", primaryLogo);
      if (logoIcon) formData.set("logo_icon", logoIcon);
      const response = await fetch("/api/creative/brand/onboarding-upload", { method:"POST", body:formData });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to set up brand");
      setPrimaryLogo(null);
      setLogoIcon(null);
      setNotice("Brand profile updated. Primary logo and compact icon are now kept as separate brand assets across Avantiqo.");
      await loadBrand();
    } catch (saveError) {
      setError(saveError?.message || "Unable to set up brand");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-[460px] items-center justify-center bg-[#F7F6F3] text-[10px] text-[#817B73]"><LoaderCircle size={14} className="mr-2 animate-spin" />Loading brand…</div>;
  }

  return (
    <div className="min-h-[calc(100vh-86px)] bg-[#F7F6F3] px-4 py-5 text-[#26221D] md:px-6">
      <div className="mx-auto max-w-[1240px]">
        <header className="flex flex-col gap-4 border-b border-black/[0.07] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.17em] text-[#A37849]">Commercial · Brand</div>
            <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.04em]">Set up the brand with two assets</h1>
            <p className="mt-2 max-w-3xl text-[11px] leading-5 text-[#777169]">Upload the primary logo and the compact logo/icon. Avantiqo derives an initial visual and voice system automatically. You can refine it later; these uploads are the authoritative brand evidence.</p>
          </div>
        </header>

        {error ? <div className="mt-4 rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[10px] text-red-800">{error}</div> : null}
        {notice ? <div className="mt-4 rounded-xl border border-emerald-700/15 bg-emerald-50 px-4 py-3 text-[10px] text-emerald-800">{notice}</div> : null}

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,.9fr)]">
          <section className="rounded-[22px] border border-black/[0.07] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
            <div className="flex items-center gap-2"><Sparkles size={14} className="text-[#A37849]" /><div className="text-[12px] font-semibold">Brand evidence</div></div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <AssetPicker label="Primary Logo" detail="Full brand logo for documents, headers, login, invoices and public surfaces." file={primaryLogo} onChange={setPrimaryLogo} />
              <AssetPicker label="Logo Icon / Compact Mark" detail="Square or near-square mark for app rails, avatars, channel badges, favicons and mobile surfaces. Do not upload a wide wordmark here." file={logoIcon} onChange={setLogoIcon} compact />
            </div>
            <button type="button" onClick={generateBrand} disabled={saving || (!primaryLogo && !logoIcon)} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-[#B98A52]/25 bg-[#D6A66A] px-4 text-[10px] font-semibold text-[#2C2117] transition hover:bg-[#C99A5E] disabled:cursor-not-allowed disabled:opacity-35">
              {saving ? <><LoaderCircle size={12} className="animate-spin" />Analyzing brand</> : <><Sparkles size={12} />Generate brand profile</>}
            </button>
            <div className="mt-3 text-[9px] leading-4 text-[#8D867D]">Avantiqo treats the generated palette, typography direction and voice as an initial recommendation. The original uploaded assets remain the authoritative source.</div>
          </section>

          <section className="rounded-[22px] border border-black/[0.07] bg-[#FBF8F3] p-5">
            <div className="flex items-center justify-between gap-3"><div className="text-[12px] font-semibold">Current brand profile</div>{brand?.id ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-semibold text-emerald-700"><Check size={9} />Active</span> : null}</div>
            <div className="mt-4 rounded-2xl border border-black/[0.06] bg-white p-4">
              <div className="text-[9px] uppercase tracking-[0.13em] text-[#999188]">Organization</div>
              <div className="mt-1 text-[15px] font-semibold">{brand?.name || organization?.name || "Organization"}</div>
              <div className="mt-4 flex items-center gap-5">
                <div>
                  <div className="text-[8px] uppercase tracking-[0.12em] text-[#999188]">Primary logo</div>
                  <div className="mt-2 flex h-16 min-w-[150px] items-center justify-center rounded-xl border border-black/[0.06] bg-[#FAF8F4] px-3">
                    {brand?.logo_url ? <>{/* Dynamic signed brand URLs are not enumerable in next/image remotePatterns. */}{/* eslint-disable-next-line @next/next/no-img-element */}<img src={brand.logo_url} alt="Primary logo" className="max-h-12 max-w-[180px] object-contain" /></> : <span className="text-[9px] text-[#AAA39A]">Not uploaded</span>}
                  </div>
                </div>
                <div>
                  <div className="text-[8px] uppercase tracking-[0.12em] text-[#999188]">Compact icon</div>
                  <div className="mt-2 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-black/[0.06] bg-[#FAF8F4] p-1.5">
                    {brand?.logo_icon_url ? <>{/* Dynamic signed brand URLs are not enumerable in next/image remotePatterns. */}{/* eslint-disable-next-line @next/next/no-img-element */}<img src={brand.logo_icon_url} alt="Logo icon" className="h-full w-full object-contain" /></> : <span className="text-[9px] font-semibold text-[#8B735A]">{String(brand?.name || "OR").split(/\s+/).slice(0,2).map((part)=>part[0]).join("").toUpperCase()}</span>}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-black/[0.06] bg-white p-4">
              <div className="text-[9px] uppercase tracking-[0.13em] text-[#999188]">Derived palette</div>
              <div className="mt-3 flex flex-wrap gap-2">{(brand?.colors || []).length ? brand.colors.map((color) => <div key={color} className="flex items-center gap-2 rounded-xl border border-black/[0.06] bg-[#FCFBF8] px-2 py-2"><span className="h-6 w-6 rounded-lg border border-black/10" style={{backgroundColor:color}} /><span className="text-[9px] font-mono text-[#6F6961]">{color}</span></div>) : <span className="text-[9px] text-[#AAA39A]">Upload a logo to derive the palette.</span>}</div>
            </div>

            <div className="mt-3 rounded-2xl border border-black/[0.06] bg-white p-4">
              <div className="text-[9px] uppercase tracking-[0.13em] text-[#999188]">Typography direction</div>
              <div className="mt-2 text-[10px] leading-5 text-[#615A52]">{brand?.fonts?.[0] || "Avantiqo will propose this from the uploaded logo."}</div>
              <div className="mt-4 text-[9px] uppercase tracking-[0.13em] text-[#999188]">Voice</div>
              <div className="mt-2 text-[10px] leading-5 text-[#615A52]">{brand?.voice_tone || "Avantiqo will seed the initial voice from your business type and brand evidence."}</div>
            </div>
          </section>
        </div>

        {onboardingMode && organizationId ? (
          <section className="mt-5 rounded-[22px] border border-black/[0.07] bg-white p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#A37849]">Continue company setup</div>
                <div className="mt-1 text-[16px] font-semibold">Connect as much as you want now</div>
                <div className="mt-1 text-[10px] leading-5 text-[#817B73]">Everything below is optional during onboarding. Each item opens the canonical Avantiqo workspace, so there is no duplicate setup path.</div>
              </div>
              <Link href={`/workspace/${organizationId}/administration/onboarding`} className="text-[9px] font-semibold text-[#7C6B58] underline decoration-[#CDB99E] underline-offset-4">Organization setup</Link>
            </div>
            {readiness?.summary ? (
              <div className="mt-4 rounded-2xl border border-[#B7A083]/15 bg-[#FBF7F1] px-4 py-3 text-[9px] text-[#756B60]">
                Avantiqo has already configured <span className="font-semibold text-[#493E33]">{readiness.summary.configured} of {readiness.summary.total}</span> setup areas from real organization data. The remaining areas are optional unless your business needs them.
              </div>
            ) : null}
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {NEXT_SETUP.map(([key, label, path, detail]) => {
                const state = readiness?.sections?.[key] || null;
                return (
                  <Link key={key} href={`/workspace/${organizationId}${path}?onboarding=1`} className="rounded-2xl border border-black/[0.06] bg-[#FCFBF8] p-4 transition hover:border-[#C9AD89] hover:bg-[#FBF6EF]">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] font-semibold text-[#423A32]">{label}</div>
                      {state?.configured ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.08em] text-emerald-700"><Check size={8} />Configured</span> : <span className="rounded-full bg-[#F0E7DA] px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.08em] text-[#8A633C]">Optional</span>}
                    </div>
                    <div className="mt-1 text-[9px] leading-4 text-[#8A8279]">{state?.detail || detail}</div>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

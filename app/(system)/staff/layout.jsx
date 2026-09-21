"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import StaffActivationSetup from "@/components/staff/StaffActivationSetup";
import {
  Activity,
  Banknote,
  BedDouble,
  Bell,
  BriefcaseBusiness,
  CalendarCheck2,
  CalendarClock,
  Camera,
  ChartNoAxesCombined,
  ChefHat,
  Clapperboard,
  ConciergeBell,
  CreditCard,
  Files,
  Handshake,
  HardHat,
  Hotel,
  Landmark,
  LayoutDashboard,
  Menu,
  Navigation,
  PackageSearch,
  RefreshCw,
  Route,
  ShoppingBag,
  UserRound,
  X,
  UtensilsCrossed,
  Wine,
  Wrench,
} from "lucide-react";

const ICONS = {
  Activity,
  Banknote,
  BedDouble,
  Bell,
  BriefcaseBusiness,
  CalendarCheck2,
  CalendarClock,
  Camera,
  ChartNoAxesCombined,
  ChefHat,
  Clapperboard,
  ConciergeBell,
  CreditCard,
  Files,
  Handshake,
  HardHat,
  Hotel,
  Landmark,
  LayoutDashboard,
  Menu,
  Navigation,
  PackageSearch,
  Route,
  ShoppingBag,
  UserRound,
  X,
  UtensilsCrossed,
  Wine,
  Wrench,
};

function activePath(pathname, item) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavigationItem({ item, pathname }) {
  const Icon = ICONS[item.icon] || LayoutDashboard;
  const active = activePath(pathname, item);
  return (
    <Link
      href={item.href}
      className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-4 text-[10px] font-black uppercase tracking-[0.14em] transition ${active ? "border-[#D6A66A]/40 bg-[#D6A66A]/15 text-[#76583A]" : "border-black/[0.075] bg-white text-[#817B73] hover:bg-[#FCFBF9] hover:text-[#4F4A43]"}`}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}

export default function StaffLayout({ children }) {
  const pathname = usePathname();
  const [state, setState] = useState({ loading: true, switching: false, navigation: null, organizations: [], error: "" });
  const [activationState, setActivationState] = useState({ loading: true, activation: null, organizationId: null, organizations: [], error: "" });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const cameraInputRef = useRef(null);
  const [cameraState, setCameraState] = useState({ uploading: false, message: "", error: "" });

  const loadNavigation = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch("/api/staff/navigation", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to load staff navigation");
      }
      setState((current) => ({ ...current, loading: false, switching: false, navigation: payload.navigation || null, organizations: payload.organizations || [], error: "" }));
    } catch (error) {
      setState((current) => ({ ...current, loading: false, switching: false, navigation: null, error: error?.message || "Unable to load staff navigation" }));
    }
  }, []);

  const loadActivation = useCallback(async () => {
    setActivationState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch("/api/staff/activation", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to load staff setup status");
      const activation = payload.activation || null;
      setActivationState({ loading: false, activation, organizationId: payload.organizationId || null, organizations: payload.organizations || [], error: "" });
      if (activation?.complete) await loadNavigation();
      return activation;
    } catch (error) {
      setActivationState({ loading: false, activation: null, organizationId: null, organizations: [], error: error?.message || "Unable to load staff setup status" });
      return null;
    }
  }, [loadNavigation]);

  useEffect(() => {
    loadActivation();
  }, [loadActivation]);

  async function handleQuickCameraUpload(file) {
    if (!file) return;
    setCameraState({ uploading: true, message: "", error: "" });
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/staff/quick-upload", { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to upload photo");
      const destination = payload.routing?.destinationLabel || "Manager Review";
      const workflow = String(payload.routing?.workflow || "").replaceAll("_", " ").toLowerCase();
      setCameraState({
        uploading: false,
        message: payload.reused
          ? `Already received · existing private ${workflow || "document"} · ${destination}.`
          : payload.classificationStatus === "CLASSIFIED"
            ? `Saved privately · ${workflow || "document"} · routed to ${destination} for review.`
            : "Saved privately · classification could not complete, so it stays in Manager Review.",
        error: "",
      });
      window.setTimeout(() => setCameraState({ uploading: false, message: "", error: "" }), 3500);
    } catch (error) {
      setCameraState({ uploading: false, message: "", error: error?.message || "Unable to upload photo" });
    } finally {
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  }

  async function switchOrganization(organizationId) {
    const currentOrganizationId = navigation.organization_id || activationState.organizationId || null;
    if (!organizationId || organizationId === currentOrganizationId) return;
    setState((current) => ({ ...current, switching: true, error: "" }));
    try {
      const response = await fetch("/api/staff/navigation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to switch organization");
      window.location.assign("/staff");
    } catch (error) {
      setState((current) => ({ ...current, switching: false, error: error?.message || "Unable to switch organization" }));
    }
  }

  const navigation = state.navigation || { standard: [], operational: [] };
  const operational = useMemo(() => navigation.operational || [], [navigation.operational]);
  const firstOperational = operational[0] || null;
  const mobilePrimary = useMemo(() => {
    const standardByKey = new Map((navigation.standard || []).map((item) => [item.key, item]));
    return {
      home: standardByKey.get("my-work") || standardByKey.get("my-day") || null,
      work: firstOperational || standardByKey.get("my-day") || null,
      requests: standardByKey.get("requests") || null,
    };
  }, [navigation.standard, firstOperational]);

  if (activationState.loading) {
    return <div className="grid min-h-screen place-items-center bg-[#F7F6F3] text-[#817B73]"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em]"><RefreshCw className="h-4 w-4 animate-spin" /> Checking staff setup</div></div>;
  }

  if (activationState.error) {
    return <div className="grid min-h-screen place-items-center bg-[#F7F6F3] p-5 text-[#1B1A18]"><div className="max-w-md rounded-[26px] border border-red-200 bg-white p-6 text-center shadow-[0_16px_45px_rgba(55,47,38,0.06)]"><div className="text-sm font-black">Staff setup could not be loaded</div><div className="mt-2 text-xs leading-5 text-[#817B73]">{activationState.error}</div><button onClick={loadActivation} className="mt-4 h-11 rounded-2xl bg-[#D6A66A] px-5 text-xs font-black uppercase tracking-[0.1em] text-[#171614]">Try again</button></div></div>;
  }

  if (activationState.activation?.complete !== true) {
    return <StaffActivationSetup activation={activationState.activation} organizationId={activationState.organizationId} organizations={activationState.organizations} onSwitchOrganization={switchOrganization} onRefresh={loadActivation} />;
  }

  return (
    <div className="min-h-screen bg-[#F7F6F3] text-[#1B1A18]">
      <div className="sticky top-0 z-40 border-b border-black/[0.07] bg-[#F7F6F3]/95 px-4 py-3 backdrop-blur-xl lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-between gap-3 lg:hidden">
            <div className="min-w-0">
              <div className="text-[9px] font-black uppercase tracking-[0.24em] text-[#D6A66A]">Avantiqo Staff</div>
              <div className="mt-0.5 truncate text-sm font-black text-[#1B1A18]">{navigation.organization?.name || "My workplace"}</div>
            </div>
            <div className="flex items-center gap-2">
              {state.organizations.length > 1 ? (
                <select
                  aria-label="Active organization"
                  value={navigation.organization_id || ""}
                  disabled={state.switching}
                  onChange={(event) => switchOrganization(event.target.value)}
                  className="h-10 max-w-[11rem] rounded-2xl border border-black/[0.08] bg-white px-3 text-[10px] font-bold text-[#5E5952] outline-none"
                >
                  {state.organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>{organization.name || "Organization"}</option>
                  ))}
                </select>
              ) : null}
              <button
                type="button"
                aria-label="Open staff menu"
                onClick={() => setMobileMenuOpen(true)}
                className="grid h-10 w-10 place-items-center rounded-2xl border border-black/[0.08] bg-white text-[#5E5952] shadow-[0_8px_24px_rgba(53,45,34,0.06)]"
              >
                <Menu className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="hidden space-y-2.5 lg:block">
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto" aria-label="Staff self-service navigation">
            {state.organizations.length > 1 ? (
              <select
                aria-label="Active organization"
                value={navigation.organization_id || ""}
                disabled={state.switching}
                onChange={(event) => switchOrganization(event.target.value)}
                className="h-10 max-w-56 shrink-0 rounded-xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.07] px-3 text-[10px] font-black uppercase tracking-[0.1em] text-[#76583A] outline-none disabled:opacity-50"
              >
                {state.organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>{organization.name || "Organization"}</option>
                ))}
              </select>
            ) : null}
            {(navigation.standard || []).map((item) => (
              <NavigationItem key={item.key} item={item} pathname={pathname} />
            ))}
            {state.loading ? (
              <span className="inline-flex h-10 shrink-0 items-center gap-2 px-3 text-[10px] uppercase tracking-[0.14em] text-[#AAA49C]">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading access
              </span>
            ) : null}
          </div>

          {operational.length ? (
            <div className="flex min-w-0 items-center gap-2 overflow-x-auto border-t border-black/[0.06] pt-2" aria-label="Authorized operational navigation">
              <span className="shrink-0 pr-1 text-[9px] font-black uppercase tracking-[0.2em] text-[#D6A66A]/65">Work</span>
              {operational.map((item) => (
                <NavigationItem key={item.key} item={item} pathname={pathname} />
              ))}
              {navigation.role ? (
                <span className="ml-auto shrink-0 rounded-full border border-black/[0.065] px-3 py-1 text-[9px] uppercase tracking-[0.12em] text-[#AAA49C]">{navigation.organization?.name ? `${navigation.organization.name} · ` : ""}{navigation.role}</span>
              ) : null}
            </div>
          ) : navigation.role && !state.loading ? (
            <div className="border-t border-black/[0.06] pt-2 text-[9px] uppercase tracking-[0.16em] text-[#AAA49C]">
              {navigation.organization?.name ? `${navigation.organization.name} · ` : ""}{navigation.role} · staff self-service access
            </div>
          ) : null}

          {state.error ? (
            <div className="border-t border-red-400/10 pt-2 text-[10px] text-[#984C43]/60">{state.error}</div>
          ) : null}
          </div>
        </div>
      </div>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <button aria-label="Close staff menu" onClick={() => setMobileMenuOpen(false)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <aside className="absolute inset-x-3 bottom-3 max-h-[78vh] overflow-y-auto rounded-[30px] border border-black/[0.08] bg-[#FCFBF9] p-4 shadow-[0_30px_80px_rgba(62,52,40,0.22)]">
            <div className="flex items-center justify-between gap-3 px-1 pb-3">
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[#D6A66A]">Staff menu</div>
                <div className="mt-1 text-sm font-black">{navigation.organization?.name || "My workplace"}</div>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="grid h-10 w-10 place-items-center rounded-2xl border border-black/[0.08] bg-white text-[#5E5952]"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[...(navigation.standard || []), ...operational].map((item) => {
                const Icon = ICONS[item.icon] || LayoutDashboard;
                const active = activePath(pathname, item);
                return (
                  <Link key={`${item.key}:${item.href}`} href={item.href} onClick={() => setMobileMenuOpen(false)} className={`flex min-h-16 items-center gap-3 rounded-2xl border px-3 py-3 ${active ? "border-[#D6A66A]/45 bg-[#D6A66A]/10 text-[#76583A]" : "border-black/[0.07] bg-white text-[#5E5952]"}`}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#F5F1EA]"><Icon className="h-4 w-4" /></span>
                    <span className="text-[11px] font-black leading-4">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </aside>
        </div>
      ) : null}

      <div className="pb-24 lg:pb-0">{children}</div>

      {cameraState.message || cameraState.error ? (
        <div className={`fixed inset-x-5 bottom-24 z-[60] rounded-2xl border px-4 py-3 text-center text-xs font-bold shadow-[0_14px_40px_rgba(57,47,35,0.18)] lg:hidden ${cameraState.error ? "border-red-200 bg-red-50 text-[#984C43]" : "border-emerald-200 bg-white text-[#5E6D58]"}`}>
          {cameraState.error || cameraState.message}
        </div>
      ) : null}

      <nav className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-5 items-end rounded-[26px] border border-black/[0.08] bg-white/95 p-1.5 shadow-[0_18px_55px_rgba(57,47,35,0.18)] backdrop-blur-xl lg:hidden" aria-label="Staff mobile navigation">
        {[mobilePrimary.home, mobilePrimary.work].map((item, index) => {
          if (!item) return <span key={`mobile-empty-${index}`} className="min-h-14" aria-hidden="true" />;
          const Icon = ICONS[item.icon] || LayoutDashboard;
          const active = activePath(pathname, item);
          return (
            <Link key={item.key} href={item.href} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-[20px] px-1 ${active ? "bg-[#F4EEE5] text-[#76583A]" : "text-[#807970]"}`}>
              <Icon className="h-[18px] w-[18px]" />
              <span className="max-w-full truncate text-[9px] font-black">{index === 0 ? "Home" : "Work"}</span>
            </Link>
          );
        })}

        <div className="relative -mt-7 min-h-[72px]">
          <button
            type="button"
            aria-label="Open camera and upload"
            disabled={cameraState.uploading}
            onClick={() => cameraInputRef.current?.click()}
            className="flex min-h-[72px] w-full flex-col items-center justify-end gap-1 rounded-[22px] px-1 pb-1 text-[#76583A] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="grid h-14 w-14 place-items-center rounded-full border-4 border-[#F7F6F3] bg-[#D6A66A] text-[#171614] shadow-[0_12px_30px_rgba(120,86,44,0.28)]">
              {cameraState.uploading ? <RefreshCw className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
            </span>
            <span className="text-[9px] font-black">{cameraState.uploading ? "Saving" : "Camera"}</span>
          </button>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            className="hidden"
            disabled={cameraState.uploading}
            onChange={(event) => handleQuickCameraUpload(event.target.files?.[0])}
          />
        </div>

        {mobilePrimary.requests ? (() => {
          const item = mobilePrimary.requests;
          const Icon = ICONS[item.icon] || LayoutDashboard;
          const active = activePath(pathname, item);
          return (
            <Link key={item.key} href={item.href} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-[20px] px-1 ${active ? "bg-[#F4EEE5] text-[#76583A]" : "text-[#807970]"}`}>
              <Icon className="h-[18px] w-[18px]" />
              <span className="max-w-full truncate text-[9px] font-black">Requests</span>
            </Link>
          );
        })() : <span className="min-h-14" aria-hidden="true" />}

        <button type="button" onClick={() => setMobileMenuOpen(true)} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-[20px] px-1 text-[#807970]">
          <Menu className="h-[18px] w-[18px]" />
          <span className="text-[9px] font-black">More</span>
        </button>
      </nav>
    </div>
  );
}

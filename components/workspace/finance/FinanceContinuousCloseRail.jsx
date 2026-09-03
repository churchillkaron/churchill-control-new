"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import { buildFinanceContinuousCloseState } from "@/lib/finance/ui/FinanceActionObject";

function financeHref(organizationId, route) {
  if (!organizationId || !route) return "#";
  return `/workspace/${organizationId}${route.startsWith("/") ? route : `/${route}`}`;
}

function stateTone(state) {
  if (state === "BLOCKED") return "border-red-700/15 bg-red-50 text-red-800";
  if (state === "ACTION_REQUIRED") return "border-amber-700/15 bg-amber-50 text-amber-800";
  if (state === "READY" || state === "CLOSED") return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  if (state === "WATCH") return "border-[#A37849]/15 bg-[#FBF8F3] text-[#76583A]";
  return "border-black/[0.08] bg-[#F7F6F3] text-[#716B63]";
}

function StateIcon({ state }) {
  if (state === "BLOCKED") return <ShieldAlert size={11} />;
  if (state === "READY" || state === "CLOSED") return <CheckCircle2 size={11} />;
  if (state === "ACTION_REQUIRED" || state === "WATCH") return <AlertTriangle size={11} />;
  return <CircleDot size={11} />;
}

function accountIntegrityControl(health) {
  const summary = health?.summary || null;
  if (!summary) return null;
  const blocked = Number(summary.blocked || 0);
  const action = Number(summary.action_required || 0);
  const watch = Number(summary.watch || 0);
  const state = blocked > 0 ? "BLOCKED" : action > 0 ? "ACTION_REQUIRED" : watch > 0 ? "WATCH" : "READY";
  return {
    id: "account-integrity",
    label: "Account integrity",
    state,
    detail: `${blocked} blocked · ${action} action · ${watch} watch`,
    href: "/finance",
  };
}

export default function FinanceContinuousCloseRail({ organizationId }) {
  const businessContext = useBusinessContext() || {};
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const periodId = businessContext.period_id || businessContext.period?.id || null;
  const [state, setState] = useState({ loading: true, error: "", data: null, accountHealth: null });

  async function load() {
    if (!organizationId || !entityId || !periodId) {
      setState({ loading: false, error: "", data: null, accountHealth: null });
      return;
    }

    try {
      setState((current) => ({ ...current, loading: true, error: "" }));
      const commandUrl = new URL("/api/workspace/finance/command-center", window.location.origin);
      commandUrl.searchParams.set("organizationId", organizationId);
      commandUrl.searchParams.set("entityId", entityId);
      commandUrl.searchParams.set("periodId", periodId);
      const healthUrl = new URL("/api/workspace/finance/account-health", window.location.origin);
      healthUrl.searchParams.set("organizationId", organizationId);
      healthUrl.searchParams.set("entityId", entityId);
      healthUrl.searchParams.set("periodId", periodId);

      const [commandResponse, healthResponse] = await Promise.all([
        fetch(commandUrl.toString(), { cache: "no-store", credentials: "include" }),
        fetch(healthUrl.toString(), { cache: "no-store", credentials: "include" }),
      ]);
      const [commandBody, healthBody] = await Promise.all([
        commandResponse.json().catch(() => ({})),
        healthResponse.json().catch(() => ({})),
      ]);

      if (!commandResponse.ok || commandBody?.success === false) {
        throw new Error(commandBody?.error || "Unable to load continuous close state");
      }

      setState({
        loading: false,
        error: healthResponse.ok && healthBody?.success !== false ? "" : "Account-health refresh delayed",
        data: commandBody,
        accountHealth: healthResponse.ok && healthBody?.success !== false ? healthBody?.health || null : null,
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error?.message || "Unable to load continuous close state",
      }));
    }
  }

  useEffect(() => {
    load();
  }, [organizationId, entityId, periodId]);

  const closeState = useMemo(
    () => (state.data ? buildFinanceContinuousCloseState(state.data) : null),
    [state.data],
  );
  const controls = useMemo(() => {
    if (!closeState) return [];
    const accountControl = accountIntegrityControl(state.accountHealth);
    return accountControl ? [...closeState.controls, accountControl] : closeState.controls;
  }, [closeState, state.accountHealth]);
  const surfacedState = useMemo(() => {
    if (!closeState) return null;
    const accountControl = accountIntegrityControl(state.accountHealth);
    if (accountControl?.state === "BLOCKED" && closeState.state !== "CLOSED") {
      return {
        ...closeState,
        state: "BLOCKED",
        title: "Close readiness has an account-level blocker",
        detail: "A ledger or reconciliation integrity issue must be resolved before the selected period can be trusted for close.",
      };
    }
    if (accountControl?.state === "ACTION_REQUIRED" && !["BLOCKED", "CLOSED"].includes(closeState.state)) {
      return {
        ...closeState,
        state: "ACTION_REQUIRED",
        title: "Close readiness is moving, but account work remains",
        detail: "Account-level ledger or reconciliation evidence still needs human accounting action.",
      };
    }
    return closeState;
  }, [closeState, state.accountHealth]);

  if (!organizationId || !entityId || !periodId) return null;

  if (state.loading && !surfacedState) {
    return (
      <div className="mx-auto mb-4 flex min-h-[64px] max-w-[1720px] items-center justify-center rounded-[20px] border border-black/[0.07] bg-white text-[8px] text-[#817A72]">
        <LoaderCircle size={11} className="mr-2 animate-spin text-[#A37849]" /> Reading continuous close readiness…
      </div>
    );
  }

  if (!surfacedState) return null;

  const readyControls = controls.filter((control) => control.state === "READY").length;

  return (
    <section aria-label="Continuous close readiness" className="mx-auto mb-4 max-w-[1720px] overflow-hidden rounded-[22px] border border-black/[0.07] bg-white text-[#2A2723]">
      <div className="flex flex-col gap-3 border-b border-black/[0.06] px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between md:px-5">
        <div className="min-w-0 max-w-4xl">
          <div className="flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">
            <StateIcon state={surfacedState.state} /> Continuous close
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 className="text-[14px] font-semibold tracking-[-0.02em]">{surfacedState.title}</h2>
            <span className={`rounded-full border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.05em] ${stateTone(surfacedState.state)}`}>
              {surfacedState.state.replace(/_/g, " ")}
            </span>
          </div>
          <p className="mt-0.5 text-[8px] leading-4 text-[#918B83]">{surfacedState.detail}</p>
        </div>
        <div className="flex items-center gap-2 self-start lg:self-auto">
          <span className="text-[8px] text-[#8B847B]">
            <strong className="font-semibold text-[#5E5952]">{readyControls}/{controls.length}</strong> control areas clear
          </span>
          <Link href={financeHref(organizationId, "/finance/close")} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#25231F] px-3 text-[8px] font-semibold text-white">
            Open close <ArrowRight size={8} />
          </Link>
          <button type="button" onClick={load} disabled={state.loading} aria-label="Refresh continuous close state" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-black/[0.08] bg-white text-[#806143] disabled:opacity-50">
            <RefreshCw size={10} className={state.loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="grid gap-px bg-black/[0.05] sm:grid-cols-2 xl:grid-cols-7">
        {controls.map((control) => (
          <Link key={control.id} href={financeHref(organizationId, control.href)} className="group bg-white px-3 py-2.5 transition hover:bg-[#FCFAF6]">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[8px] font-semibold text-[#4B4640]">{control.label}</span>
              <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[6px] font-semibold uppercase tracking-[0.04em] ${stateTone(control.state)}`}>
                {control.state === "ACTION_REQUIRED" ? "Action" : control.state}
              </span>
            </div>
            <div className="mt-1 truncate text-[7px] text-[#99928A]">{control.detail}</div>
          </Link>
        ))}
      </div>

      <div className="flex flex-col gap-1 border-t border-black/[0.05] bg-[#FCFBF8] px-4 py-2 text-[7px] text-[#938C84] sm:flex-row sm:items-center sm:justify-between md:px-5">
        <span>Close readiness is derived from live accounting controls and account integrity, not a manually maintained progress score.</span>
        <span>{state.error ? `${state.error} · last successful close state retained` : "Every action remains subject to normal approval, review and final-close gates."}</span>
      </div>
    </section>
  );
}

"use client";

import CreateEngine from "@/components/workspace/engines/CreateEngine";
import ImportEngine from "@/components/workspace/engines/ImportEngine";
import ExportEngine from "@/components/workspace/engines/ExportEngine";
import AIEngine from "@/components/workspace/engines/AIEngine";
import useCreateEngine from "@/components/workspace/engines/useCreateEngine";
import { getWorkspaceItemAction } from "@/lib/platform/registry/erpRegistry";
import { getForm } from "@/lib/platform/forms";
import { getClientEngine } from "@/lib/platform/engines/ClientEngineRegistry";
import { useRouter } from "next/navigation";
import MasterActionMenu from "@/components/workspace/actions/MasterActionMenu";
import { useState, useEffect } from "react";
import CapabilityActionResolver from "./CapabilityActionResolver";
import RowActionEngine from "@/components/workspace/engines/RowActionEngine";
import { resolveFinanceActionPresentation } from "@/lib/finance/actions/resolveFinanceAction";
import WorkspaceEventHub from "@/components/workspace/WorkspaceEventHub";

import {
  resolvePayloadMapper,
} from "@/lib/platform/payload-mappers/PayloadMapperRegistry";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function initials(name) {
  return String(name || "?")
    .split(" ")
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function MasterDataWorkCenter({

  organizationId,
  entityId,
  periodId,
  country,
  currency,
  workspaceId,
  moduleKey,
  onRefresh,

  eyebrow = "Workspace",
  title = "Records",
  description = "",
  primaryActionLabel = "",
  primaryAction = null,
  rows = [],
  loading = false,
  error = "",
  query = "",
  onQueryChange,
  selected,
  selectedId,
  onSelect,
  onRowSelect,
  menuId,
  onToggleMenu,
  kpis = [],
  searchPlaceholder = "Search...",
  getName,
  getSubtitle,
  getInitials,
  listMetrics = [],
  detailSections = [],
  topMenuActions = [],
  menuActions = [],
  onCreate,
}) {
  const router = useRouter();
  const createEngine = useCreateEngine();


  const [activeEngine,setActiveEngine] =
    useState(null);


  useEffect(()=>{

    function handler(event){

      setActiveEngine(
        event.detail
      );

    }


    window.addEventListener(
      "workspace:engine",
      handler
    );


    return ()=>{

      window.removeEventListener(
        "workspace:engine",
        handler
      );

    };

  },[]);

  const createAction =
    primaryAction;

  const hasCreateAction =
    !!createAction &&
    createAction.enabled !== false;

  const importAction =
    getWorkspaceItemAction(workspaceId, moduleKey, "import");

  const exportAction =
    getWorkspaceItemAction(workspaceId, moduleKey, "export");

  const aiAction =
    getWorkspaceItemAction(workspaceId, moduleKey, "ai");

  const schema =
    createAction?.schema ||
    getForm(createAction?.form || moduleKey);

  console.log(
    "CREATE DEBUG",
    {
      moduleKey,
      createAction,
      schema,
    }
  );

  const [form,setForm] = useState({});

  const [
    submissionIdempotencyKey,
    setSubmissionIdempotencyKey,
  ] = useState(null);

  function createIdempotencyKey() {
    return (
      globalThis.crypto
        ?.randomUUID?.() ||
      `${Date.now()}-${Math.random()}`
    );
  }

  function updateForm(name,value){
    setForm(prev=>({
      ...prev,
      [name]:value,
    }));
  }

  async function saveForm(){

    if(!createAction){

      alert("Create action not configured for " + moduleKey);

      return;

    }

    const contextValues = {
      organizationId,
      organization_id: organizationId,
      entityId,
      entity_id: entityId,
      periodId,
      period_id: periodId,
      currency,
      currency_code: currency,
    };

    const missingRequiredFields =
      (schema || [])
        .filter(field => {
          if (!field?.required) {
            return false;
          }

          const value =
            form[field.name] ??
            contextValues[field.name];

          if (
            value === undefined ||
            value === null ||
            value === ""
          ) {
            return true;
          }

          if (Array.isArray(value)) {
            return value.length === 0;
          }

          if (
            typeof value === "object" &&
            Object.keys(value).length === 0
          ) {
            return true;
          }

          return false;
        })
        .map(field =>
          field.label ||
          field.name
        );

    if (missingRequiredFields.length) {
      alert(
        `Complete required fields: ${
          missingRequiredFields.join(", ")
        }`
      );

      return;
    }

    const directEndpoint =
      createAction?.endpoint ||
      createAction?.api ||
      null;

    const isCapability =
      !!createAction?.capability &&
      !!createAction?.action &&
      !directEndpoint;


    const endpoint =
      directEndpoint ||
      (isCapability
        ? "/api/ubte/execute"
        : "/api/workspace/create");


    console.log(
      "INVOICE FORM BEFORE SAVE",
      {
        moduleKey,
        form,
      }
    );


    console.log(
      "INVOICE FORM BEFORE SAVE",
      form
    );


    const resolvedEntityId =
      form.entity_id ||
      form.entityId ||
      entityId ||
      null;

    const resolvedPeriodId =
      form.period_id ||
      form.periodId ||
      periodId ||
      null;

    const resolvedCurrency =
      form.currency_code ||
      form.currency ||
      currency ||
      null;

    const resolvedIdempotencyKey =
      submissionIdempotencyKey ||
      createIdempotencyKey();

    if (!submissionIdempotencyKey) {
      setSubmissionIdempotencyKey(
        resolvedIdempotencyKey
      );
    }

    const payload = {
      ...form,

      idempotencyKey:
        resolvedIdempotencyKey,
      idempotency_key:
        resolvedIdempotencyKey,

      organizationId,
      organization_id:
        organizationId,

      entityId:
        resolvedEntityId,
      entity_id:
        resolvedEntityId,

      periodId:
        resolvedPeriodId,
      period_id:
        resolvedPeriodId,

      currency:
        resolvedCurrency,
      currency_code:
        resolvedCurrency,

      module:
        moduleKey,

      action:
        createAction,

      capability:
        createAction?.capability,
    };


    const requestBody = isCapability
      ? {
          organizationId,
          organization_id:
            organizationId,

          entityId:
            resolvedEntityId,
          entity_id:
            resolvedEntityId,

          periodId:
            resolvedPeriodId,
          period_id:
            resolvedPeriodId,

          currency:
            resolvedCurrency,
          currency_code:
            resolvedCurrency,

          domain:
            createAction.domain,

          capability:
            createAction.capability,

          action:
            createAction.action,

          payload,
        }
      : payload;


    const res =
      await fetch(endpoint,{

        method:"POST",

        headers:{
          "Content-Type":"application/json",
        },

        body:
          JSON.stringify(requestBody),

      });


    const json =
      await res.json();


    if(!json.success){

      alert(json.error);

      throw new Error(json.error);

    }


    alert("Created successfully.");

    createEngine.hide();

    setForm({});
    setSubmissionIdempotencyKey(null);

    onRefresh?.();

  }


  const handleCreate = () => {

    setSubmissionIdempotencyKey(
      createIdempotencyKey()
    );

    if (onCreate) {
      onCreate(createEngine);
      return;
    }


    if (moduleKey === "customer_invoices") {

      const today =
        new Date()
          .toISOString()
          .slice(0,10);


      setForm({
        invoice_date: today,
        due_date: today,
        lines: [
          {
            description: "",
            quantity: 1,
            unit_price: 0,
          }
        ],
      });

    }


    createEngine.show();

  };


  const handlePreview = () => {

    const action = {

      id:"preview",

      type:"preview",

      engine:"preview",

      title:
        primaryAction?.title ||
        "Preview",

    };


    window.dispatchEvent(

      new CustomEvent(
        "workspace:engine",
        {

          detail:{

            Engine:
              null,

            props:{

              action,

              payload: (() => {

                const mapper =
                  resolvePayloadMapper(
                    createAction?.payloadMapper
                  );

                return mapper
                  ? mapper({
                      payload: form,
                    })
                  : form;

              })(),

            },

            context:{

              organizationId,

              entityId,

              periodId,

              workspaceId,

              moduleKey,

            },

          },

        }

      )

    );

  };


  function resolveMenuHref(action, row) {
    if (!action || typeof action === "string") {
      return null;
    }

    if (typeof action.href === "function") {
      return action.href({
        row,
        organizationId,
        entityId:
          row?.entity_id ||
          entityId ||
          null,
        periodId:
          row?.period_id ||
          periodId ||
          null,
        moduleKey,
        workspaceId,
      });
    }

    return action.href || null;
  }

  function resolveActionKind(action) {
    const inferredKinds = [
      "archive",
      "delete",
      "duplicate",
      "history",
      "attachments",
      "edit",
      "approve",
      "reject",
      "post",
      "reverse",
      "reconcile",
      "assign",
      "complete",
      "lock",
      "unlock",
      "create",
      "open",
      "view",
      "select",
      "close",
      "submit",
      "restore",
      "merge",
      "split",
      "sync",
      "publish",
      "print",
      "download",
      "upload",
      "attach",
      "email",
      "sms",
      "whatsapp",
    ];

    const direct =
      action?.action ||
      action?.type ||
      action?.id ||
      "";

    if (direct) {
      const normalized =
        String(direct)
        .toLowerCase()
        .replace(/-/g, "_");

      return (
        inferredKinds.find(kind => normalized.includes(kind)) ||
        normalized
      );
    }

    const label =
      String(action?.label || action?.title || "")
        .toLowerCase();

    for (const kind of inferredKinds) {
      if (label.includes(kind)) {
        return kind;
      }
    }

    return "";
  }

  async function handleMenuAction(input, fallbackRow) {

    console.log(
      "HANDLE MENU ACTION INPUT",
      input
    );

    const rawAction =
      input?.action && input?.row !== undefined
        ? input.action
        : input;

    let action = workspaceId === "finance"
      ? resolveFinanceActionPresentation(rawAction)
      : rawAction;

    console.log(
      "HANDLE MENU ACTION RESOLVED",
      {
        action,
        fallbackRow,
      }
    );

    const row =
      input?.row !== undefined
        ? input.row
        : fallbackRow;

    if (typeof action === "string") {
      return;
    }

    const kind =
      resolveActionKind(action);

    console.log(
      "MENU ACTION KIND DEBUG",
      {
        kind,
        action,
        row,
      }
    );

    if (action.type === "warehouse_complete") {

      fetch(
        "/api/inventory/warehouse/tasks/complete",
        {
          method:"POST",
          headers:{
            "Content-Type":"application/json",
          },
          body:JSON.stringify({

            organization_id:
              organizationId,

            entity_id:
              row.entity_id,

            task_id:
              row.id,

            location_id:
              row.location_id ||
              null,

          }),
        }
      )
      .then(async (res) => {

        const json =
          await res.json()
            .catch(() => ({}));

        if (!res.ok) {
          throw new Error(
            json?.error ||
            json?.message ||
            "Warehouse task completion failed"
          );
        }

        onRefresh?.();

      })
      .catch(error => {

        console.error(
          "WAREHOUSE COMPLETE ERROR",
          error
        );

      });

      onToggleMenu?.(null);

      return;
    }


    const financeHref = resolveMenuHref(action, row);
    if (financeHref) {
      router.push(financeHref);
      onToggleMenu?.(null);
      return;
    }

    if (action?.type === "report" || action?.type === "reports") {
      window.dispatchEvent(new CustomEvent("workspace:report", {
        detail: { action, row, organizationId, entityId, periodId, workspaceId, moduleKey },
      }));
      onToggleMenu?.(null);
      return;
    }

    if (action?.type === "import" || action?.type === "export") {
      window.dispatchEvent(new CustomEvent(`workspace:${action.type}`, {
        detail: { action, row, organizationId, entityId, periodId, workspaceId, moduleKey },
      }));
      onToggleMenu?.(null);
      return;
    }

    if (
      action?.capability &&
      kind !== "open" &&
      kind !== "view"
    ) {
      setActiveEngine({
        Engine: RowActionEngine,
        props: {
          action,
          row,
          organizationId,
          entityId: row?.entity_id || entityId || null,
          periodId: row?.period_id || periodId || null,
          workspaceId,
          moduleKey,
          onComplete: onRefresh,
        },
        context: {},
      });
      onToggleMenu?.(null);
      return;
    }


    if (
      kind === "open" ||
      kind === "view"
    ) {

      console.log(
        "OPEN BRANCH REACHED",
        {
          kind,
          action,
          row,
        }
      );

      let detailRow = row;

      if (
        row?.journal_number &&
        moduleKey === "finance"
      ) {

        const response =
          await fetch(
            `/api/finance/journals/${row.id}?organizationId=${organizationId}`
          );

        const json =
          await response.json();

        if (
          json?.success &&
          json?.journal
        ) {

          detailRow = {
            ...json.journal,
            lines:
              json.lines || [],
          };

        }

      }

      setActiveEngine({
        Engine: RowActionEngine,
        props: {
          action: {
            ...action,
            document:
              detailRow?.journal_number
                ? "JournalEntry"
                : action?.document,
          },
          row: detailRow,
          organizationId,
          entityId:
            detailRow?.entity_id ||
            entityId ||
            null,
          periodId:
            detailRow?.period_id ||
            periodId ||
            null,
          workspaceId,
          moduleKey,
          onComplete: onRefresh,
        },
        context: {},
      });

      onToggleMenu?.(null);
      return;
    }

    if (kind === "select") {
      onSelect?.(row.id);
      onToggleMenu?.(null);
      return;
    }

    if (
      kind === "create" ||
      kind === "create_record"
    ) {
      handleCreate();
      onToggleMenu?.(null);
      return;
    }

    
    if (action?.handler) {

      console.warn(
        "Legacy action handler:",
        action.handler
      );

      onToggleMenu?.(null);
      return;

    }


    const href = resolveMenuHref(action, row);

    if (href) {
      router.push(href);
      onToggleMenu?.(null);
      return;
    }

    const engineName =
      action?.engine ||
      (
        kind === "assign"
          ? "assign"
          : null
      );

    const Engine =
      engineName
        ? getClientEngine(engineName)
        : null;

    if (Engine) {
      setActiveEngine({
        Engine,
        action: {
          ...action,
          engine:
            engineName,
        },
        props: {
          action: {
            ...action,
            engine:
              engineName,
          },
          row,
          organizationId,
          entityId:
            row?.entity_id ||
            entityId ||
            null,
          periodId:
            row?.period_id ||
            periodId ||
            null,
          workspaceId,
          moduleKey,
          onComplete:
            onRefresh,
        },
        context: {},
      });

      onToggleMenu?.(null);
      return;
    }

    setActiveEngine({
      Engine: RowActionEngine,
      props: {
        action,
        row,
        organizationId,
        entityId:
          row?.entity_id ||
          entityId ||
          null,
        periodId:
          row?.period_id ||
          periodId ||
          null,
        workspaceId,
        moduleKey,
        onComplete:
          onRefresh,
      },
      context: {},
    });

    onToggleMenu?.(null);
  }

  return (

    <main className="min-h-screen bg-[#050505] px-6 py-7 text-white">
      <div className="mx-auto max-w-[1540px]">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.34em] text-amber-300/65">
              {eyebrow}
            </div>

            <h1 className="mt-4 text-[48px] font-light tracking-[-0.06em]">
              {title}
            </h1>

            <p className="mt-3 max-w-2xl text-[13px] leading-6 text-white/42">
              {description}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">

            <ImportEngine
              action={importAction}
              organizationId={organizationId}
              moduleKey={moduleKey}
              onComplete={onRefresh}
              className="h-9 rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 text-[12px] text-white/58 backdrop-blur-2xl transition hover:bg-white/[0.07]"
            />

            <ExportEngine
              action={exportAction}
              organizationId={organizationId}
              moduleKey={moduleKey}
              className="h-9 rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 text-[12px] text-white/58 backdrop-blur-2xl transition hover:bg-white/[0.07]"
            />

            <AIEngine
              action={aiAction}
              organizationId={organizationId}
              moduleKey={moduleKey}
              onComplete={onRefresh}
              className="h-9 rounded-xl border border-amber-300/20 bg-amber-300/[0.08] px-4 text-[12px] text-amber-200 backdrop-blur-2xl transition hover:bg-amber-300/[0.12]"
            />

            {topMenuActions.length ? (
              <div className="relative">
                <button
                  onClick={() =>
                    onToggleMenu?.(
                      menuId === "__top__" ? null : "__top__"
                    )
                  }
                  className="h-9 rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 text-[12px] text-white/58 backdrop-blur-2xl transition hover:bg-white/[0.07]"
                >
                  ...
                </button>

                {menuId === "__top__" ? (
                  <div className="absolute right-0 top-11 z-40 w-72 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#111]/95 p-2 shadow-2xl shadow-black/80 backdrop-blur-3xl">
                    <MasterActionMenu
                      actions={topMenuActions}
                      row={selected}
                      organizationId={organizationId}
                      entityId={entityId}
                      periodId={periodId}
                      workspaceId={workspaceId}
                      moduleKey={moduleKey}
                      onSelect={onSelect}
                      onCreate={handleCreate}
                      onAction={handleMenuAction}
                      onClose={() => onToggleMenu?.(null)}
                      onRefresh={onRefresh}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {hasCreateAction && primaryActionLabel ? (
              <button
                onClick={handleCreate}
                className="h-9 rounded-xl border border-amber-300/35 bg-gradient-to-b from-amber-200 to-amber-500 px-4 text-[12px] font-semibold text-black shadow-[0_0_34px_rgba(245,158,11,0.22)] transition hover:scale-[1.01]"
              >
                {primaryActionLabel}
              </button>
            ) : null}

          </div>
        </header>

        <section className="mt-7 grid grid-cols-1 gap-3 md:grid-cols-4">
          {kpis.map(item => (
            <div
              key={item.label}
              className="rounded-[28px] border border-white/[0.08] bg-gradient-to-b from-white/[0.045] to-white/[0.018] p-5 shadow-2xl shadow-black/70 backdrop-blur-3xl"
            >
              <div className="text-[11px] uppercase tracking-[0.24em] text-white/34">
                {item.label}
              </div>
              <div className="mt-4 text-[34px] font-light tracking-[-0.055em]">
                {item.value}
              </div>
              <div className="mt-3 text-[12px] text-white/34">
                {item.hint}
              </div>
            </div>
          ))}
        </section>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_410px]">
          <section className="overflow-visible rounded-[30px] border border-white/[0.08] bg-white/[0.028] shadow-2xl shadow-black/70 backdrop-blur-3xl">
            <div className="flex flex-col gap-3 border-b border-white/[0.07] p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-white/[0.07] bg-black/30 px-4">
                <span className="text-[13px] text-white/26">⌕</span>
                <input
                  value={query}
                  onChange={event => onQueryChange?.(event.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-10 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/28"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {["Filter", "Sort", "Segments", "Columns"].map(item => (
                  <button
                    key={item}
                    className="h-10 rounded-xl border border-white/[0.07] bg-black/25 px-4 text-[12px] text-white/45 transition hover:bg-white/[0.055] hover:text-white/70"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="p-10 text-[13px] text-white/42">
                Loading...
              </div>
            ) : error ? (
              <div className="p-10 text-[13px] text-red-300">
                {error}
              </div>
            ) : rows.length === 0 ? (
              <div className="p-10 text-[13px] text-white/42">
                No records found.
              </div>
            ) : (
              <div className="divide-y divide-white/[0.055]">
                {rows.map(row => {
                  const active = selectedId === row.id;
                  const open = menuId === row.id;

                  return (
                    <div key={row.id} className="relative">
                      <div
                        onClick={() => {

                          onSelect?.(row.id);
                          onRowSelect?.(row);

                        }}
                        onKeyDown={event => {
                          if (
                            event.key === "Enter" ||
                            event.key === " "
                          ) {
                            event.preventDefault();
                            onSelect?.(row.id);
                            onRowSelect?.(row);
                          }
                        }}
                        className={cx(
                          "group grid w-full grid-cols-1 gap-4 px-5 py-5 text-left transition duration-200 lg:grid-cols-[1fr_460px_88px]",
                          active
                            ? "bg-amber-300/[0.075] shadow-[inset_3px_0_0_rgba(245,158,11,0.65)]"
                            : "hover:bg-white/[0.04]"
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-4">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-amber-300/20 bg-gradient-to-b from-amber-200/25 to-amber-800/18 text-[12px] text-amber-100">
                            {getInitials ? getInitials(row) : initials(getName?.(row))}
                          </div>

                          <div className="min-w-0">
                            <div className="truncate text-[15px] font-medium tracking-[-0.02em] text-white">
                              {getName?.(row) || "Unnamed Record"}
                            </div>

                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-white/38">
                              {(getSubtitle?.(row) || []).map(item => (
                                <span key={item}>{item}</span>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-3 text-[12px]">
                          {listMetrics.map(metric => (
                            <div key={metric.label}>
                              <div className="text-[11px] uppercase tracking-[0.16em] text-white/25">
                                {metric.label}
                              </div>
                              <div className="mt-1 text-white/70">
                                {metric.value(row)}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-end gap-2">

                          <button
                            type="button"
                            onClick={event => {

                              console.log(
                                "ROW MENU BUTTON CLICK",
                                row.id
                              );

                              event.stopPropagation();

                              onToggleMenu?.(
                                open ? null : row.id
                              );
                            }}
                            className="relative z-50 rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-[15px] text-white/50 transition hover:bg-white/[0.07]"
                          >
                            ...
                          </button>
                        </div>
                      </div>

                      {open && (
                        <div className="absolute right-5 top-16 z-30 w-64 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#111]/95 p-2 shadow-2xl shadow-black/80 backdrop-blur-3xl">
                          <MasterActionMenu
                            actions={
                              (() => {

                                const actions =
                                  typeof menuActions === "function"
                                    ? menuActions(row)
                                    : menuActions;

                                console.log(
                                  "WORKCENTER MENU ACTIONS",
                                  actions
                                );

                                return actions;

                              })()
                            }
                            row={row}
                            organizationId={organizationId}
                            entityId={entityId}
                            periodId={periodId}
                            workspaceId={workspaceId}
                            moduleKey={moduleKey}
                            onSelect={onSelect}
                            onCreate={handleCreate}
                            onAction={handleMenuAction}
                            onClose={() => onToggleMenu?.(null)}
                            onRefresh={onRefresh}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="rounded-[30px] border border-white/[0.08] bg-gradient-to-b from-white/[0.045] to-white/[0.018] p-5 shadow-2xl shadow-black/70 backdrop-blur-3xl">
            {selected ? (
              <>
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border border-amber-300/20 bg-gradient-to-b from-amber-200/28 to-amber-800/20 text-[14px] text-amber-100">
                    {getInitials ? getInitials(selected) : initials(getName?.(selected))}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-[24px] font-light tracking-[-0.055em]">
                      {getName?.(selected)}
                    </div>
                    <div className="mt-1 text-[12px] text-emerald-300/75">
                      Active Record
                    </div>
                  </div>

                  <button className="rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2 text-[14px] text-white/50">
                    ...
                  </button>
                </div>

                <div className="mt-6 space-y-5">
                  {detailSections.map(section => (
                    <section key={section.title}>
                      <div className="text-[11px] uppercase tracking-[0.24em] text-white/30">
                        {section.title}
                      </div>

                      <div className="mt-3 rounded-2xl border border-white/[0.07] bg-black/24 p-4">

                        {section.collection ? (

                          <div className="space-y-2">

                            {section.rows.map((item, index) => (

                              <div
                                key={item.id || index}
                                className="grid grid-cols-3 gap-3 rounded-xl border border-white/[0.08] p-3 text-[12px]"
                              >

                                <div>
                                  {item.account?.code || "-"}
                                  {" "}
                                  {item.account?.name || ""}
                                </div>

                                <div>
                                  Debit:
                                  {" "}
                                  {item.debit || 0}
                                </div>

                                <div>
                                  Credit:
                                  {" "}
                                  {item.credit || 0}
                                </div>

                              </div>

                            ))}

                          </div>

                        ) : (

                          <div className="grid grid-cols-2 gap-3 text-[12px]">

                            {section.fields.map(field => (

                              <div key={field.label}>

                                <div className="text-white/30">
                                  {field.label}
                                </div>

                                <div className="mt-1 text-white/75">
                                  {field.value(selected)}
                                </div>

                              </div>

                            ))}

                          </div>

                        )}

                      </div>
                    </section>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-[13px] text-white/42">
                Select a record to view details.
              </div>
            )}
          </aside>
        </div>
      </div>

      {activeEngine ? (() => {

        let Engine =
          activeEngine.Engine;

        const engineAction =
          activeEngine.action ||
          activeEngine.props?.action ||
          null;


        if (!Engine && engineAction?.engine) {

          Engine =
            getClientEngine(
              engineAction.engine
            );

        }


        if (
          !Engine &&
          engineAction?.engine === "preview"
        ) {

          Engine =
            require("@/components/workspace/engines/PreviewEngine")
              .default;

        }


        if (!Engine) {
          return null;
        }


        return (

          <Engine

            {...activeEngine.props}

            {...activeEngine.context}

            onClose={() =>
              setActiveEngine(null)
            }

          />

        );

      })() : null}



      <CapabilityActionResolver
        open={createEngine.open}
        saving={createEngine.saving}
        action={primaryAction}
        fallbackLabel={primaryActionLabel}
        schema={schema}
        values={form}
        onChange={updateForm}
        onClose={createEngine.hide}
        onPreview={handlePreview}
        onSave={() => createEngine.save(saveForm)}
        organizationId={organizationId}
        entityId={entityId || selected?.entity_id || null}
        partyId={selected?.party_id || null}
        periodId={periodId || selected?.period_id || null}
        country={country}
        currency={currency}
        moduleKey={moduleKey}
        onComplete={onRefresh}
      />

      <WorkspaceEventHub
        organizationId={organizationId}
        entityId={entityId}
        periodId={periodId}
      />

    </main>
  );
}

export { formatMoney, initials };

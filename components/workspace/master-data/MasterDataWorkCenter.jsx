"use client";

import CreateEngine from "@/components/workspace/engines/CreateEngine";
import ImportEngine from "@/components/workspace/engines/ImportEngine";
import ExportEngine from "@/components/workspace/engines/ExportEngine";
import AIEngine from "@/components/workspace/engines/AIEngine";
import useCreateEngine from "@/components/workspace/engines/useCreateEngine";
import { getWorkspaceItemAction } from "@/lib/platform/registry/erpRegistry";
import { getForm } from "@/lib/platform/forms";
import { useRouter } from "next/navigation";
import MasterActionMenu from "@/components/workspace/actions/MasterActionMenu";
import { useState } from "react";

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
  workspaceId,
  moduleKey,
  onRefresh,

  eyebrow = "Workspace",
  title = "Records",
  description = "",
  primaryActionLabel = "+ New",
  rows = [],
  loading = false,
  error = "",
  query = "",
  onQueryChange,
  selected,
  selectedId,
  onSelect,
  menuId,
  onToggleMenu,
  kpis = [],
  searchPlaceholder = "Search...",
  getName,
  getSubtitle,
  getInitials,
  listMetrics = [],
  detailSections = [],
  quickActions = [],
  menuActions = [],
  onCreate,
}) {
  const router = useRouter();
  const createEngine = useCreateEngine();

  const createAction =
    getWorkspaceItemAction(workspaceId, moduleKey, "create");

  const importAction =
    getWorkspaceItemAction(workspaceId, moduleKey, "import");

  const exportAction =
    getWorkspaceItemAction(workspaceId, moduleKey, "export");

  const aiAction =
    getWorkspaceItemAction(workspaceId, moduleKey, "ai");

  const schema =
    createAction?.schema ||
    getForm(createAction?.form || moduleKey);

  const [form,setForm] = useState({});

  function updateForm(name,value){
    setForm(prev=>({
      ...prev,
      [name]:value,
    }));
  }

  async function saveForm(){

    const endpoint =
      createAction?.endpoint ||
      "/api/workspace/create";

    if(!createAction){

      alert("Create action not configured for " + moduleKey);

      return;

    }

    const payload = {

      organizationId,
      organization_id: organizationId,
      module: moduleKey,
      action: createAction,
      capability: createAction?.capability,

      ...form,

    };

    const res = await fetch(endpoint,{

      method:"POST",

      headers:{
        "Content-Type":"application/json",
      },

      body:JSON.stringify(payload),

    });

    const json = await res.json();

    if(!json.success){

      alert(json.error);

      throw new Error(json.error);

    }

    alert("Created successfully.");

    createEngine.hide();

    setForm({});

    onRefresh?.();


  }

  const handleCreate = () => {
    if (onCreate) {
      onCreate(createEngine);
    } else {
      createEngine.show();
    }
  };


  function resolveMenuHref(action, row) {
    if (!action || typeof action === "string") {
      return null;
    }

    if (typeof action.href === "function") {
      return action.href({
        row,
        organizationId,
        moduleKey,
        workspaceId,
      });
    }

    return action.href || null;
  }

  function handleMenuAction(action, row) {
    if (typeof action === "string") {
      return;
    }

    if (action.type === "select") {
      onSelect?.(row.id);
      onToggleMenu?.(null);
      return;
    }

    if (action.type === "create") {
      handleCreate();
      onToggleMenu?.(null);
      return;
    }

    if (typeof action.onClick === "function") {
      action.onClick({
        row,
        organizationId,
        moduleKey,
        workspaceId,
        router,
        refresh: onRefresh,
      });
      onToggleMenu?.(null);
      return;
    }

    const href = resolveMenuHref(action, row);

    if (href) {
      router.push(href);
      onToggleMenu?.(null);
    }
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

            <button
              onClick={handleCreate}
              className="h-9 rounded-xl border border-amber-300/35 bg-gradient-to-b from-amber-200 to-amber-500 px-4 text-[12px] font-semibold text-black shadow-[0_0_34px_rgba(245,158,11,0.22)] transition hover:scale-[1.01]"
            >
              {primaryActionLabel}
            </button>

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
                      <button
                        onClick={() => onSelect?.(row.id)}
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

                          <span
                            onClick={event => {
                              event.stopPropagation();
                              onToggleMenu?.(open ? null : row.id);
                            }}
                            className="rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-[15px] text-white/50 transition hover:bg-white/[0.07]"
                          >
                            ...
                          </span>
                        </div>
                      </button>

                      {open && (
                        <div className="absolute right-5 top-16 z-30 w-64 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#111]/95 p-2 shadow-2xl shadow-black/80 backdrop-blur-3xl">
                          <MasterActionMenu
                            actions={menuActions}
                            row={row}
                            organizationId={organizationId}
                            workspaceId={workspaceId}
                            moduleKey={moduleKey}
                            onSelect={onSelect}
                            onCreate={handleCreate}
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

      <CreateEngine
        open={createEngine.open}
        saving={createEngine.saving}
        title={primaryActionLabel.replace("+ ","")}
        schema={schema}
        values={form}
        onChange={updateForm}
        onClose={createEngine.hide}
        onSave={() => createEngine.save(saveForm)}
      />

    </main>
  );
}

export { formatMoney, initials };

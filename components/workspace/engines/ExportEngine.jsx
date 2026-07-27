"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_EXPORT_FORMATS,
  getFileExtension,
  getFormatOptions,
} from "./importExportFormats";

const CONTENT_OPTIONS = [
  { id: "current", label: "Current Record" },
  { id: "selected", label: "Selected Records" },
  { id: "search", label: "Current Search" },
  { id: "all", label: "Entire Module" },
];

const FILE_GROUPS = [
  { id: "Document", title: "Documents" },
  { id: "Spreadsheet", title: "Spreadsheets" },
  { id: "Data", title: "Data" },
  { id: "Accounting", title: "Accounting" },
  { id: "Banking", title: "Banking" },
  { id: "Report", title: "Reports" },
  { id: "Compliance", title: "Compliance" },
  { id: "Avantiqo", title: "Native" },
  { id: "Package", title: "Package" },
];

export default function ExportEngine({
  action,
  organizationId,
  entityId,
  periodId,
  moduleKey,
  formats,
  defaultFormat = "xlsx",
  className = "",
  label = "Export",
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState("current");
  const [fileType, setFileType] = useState(defaultFormat);

  if (!action || action.enabled === false) return null;

  const endpoint = action.endpoint || "/api/workspace/export";
  const available = formats || action.formats || DEFAULT_EXPORT_FORMATS;
  const allowedScopes = Array.isArray(action.scopes) && action.scopes.length
    ? CONTENT_OPTIONS.filter(option => action.scopes.includes(option.id))
    : CONTENT_OPTIONS;

  const fileGroups = useMemo(() => {
    const options = getFormatOptions(available);
    return FILE_GROUPS.map(group => ({
      ...group,
      items: options.filter(item => item.group === group.id),
    })).filter(group => group.items.length > 0);
  }, [available]);

  async function exportData() {
    if (!fileType) {
      alert("Choose file type.");
      return;
    }

    setBusy(true);
    try {
      const params = new URLSearchParams({
        organizationId: organizationId || "",
        organization_id: organizationId || "",
        entityId: entityId || "",
        entity_id: entityId || "",
        periodId: periodId || "",
        period_id: periodId || "",
        module: moduleKey || "",
        capability: action.capability || "",
        scope,
        format: fileType,
      });

      const response = await fetch(`${endpoint}?${params.toString()}`, {
        method: action.method || "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json.error || json.message || "Export failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${moduleKey || "export"}${getFileExtension(fileType)}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (error) {
      alert(error.message || "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-5 text-white backdrop-blur-xl">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-[34px] border border-white/10 bg-[#090909] p-7 shadow-2xl shadow-black/80">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-[#D6A66A]">Export</div>
                <h2 className="mt-3 text-[36px] font-light tracking-[-0.055em]">
                  Export {moduleKey || "records"}
                </h2>
                <p className="mt-2 text-[13px] text-white/45">
                  Download data using the export capability configured for this workspace.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2 text-[12px] text-white/60"
              >
                Close
              </button>
            </div>

            <section className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
              <div className="mb-4 text-[11px] uppercase tracking-[0.25em] text-white/35">1. Export scope</div>
              <div className="grid gap-3 md:grid-cols-4">
                {allowedScopes.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setScope(item.id)}
                    className={`rounded-2xl border p-4 text-left text-[13px] transition ${
                      scope === item.id
                        ? "border-[#D6A66A] bg-[#D6A66A]/10 text-white"
                        : "border-white/10 bg-black/20 text-white/55 hover:border-white/25"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-5 rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
              <div className="mb-4 text-[11px] uppercase tracking-[0.25em] text-white/35">2. File type</div>
              <div className="space-y-5">
                {fileGroups.map(group => (
                  <div key={group.id}>
                    <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-[#D6A66A]/75">
                      {group.title}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {group.items.map(format => (
                        <button
                          key={format.key}
                          type="button"
                          onClick={() => setFileType(format.key)}
                          className={`rounded-2xl border p-4 text-left transition ${
                            fileType === format.key
                              ? "border-[#D6A66A] bg-[#D6A66A]/10"
                              : "border-white/10 bg-black/20 hover:border-white/25"
                          }`}
                        >
                          <div className="text-[13px] text-white">{format.label}</div>
                          <div className="mt-2 text-[11px] text-white/35">{format.extension}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="mt-6 flex items-center justify-between rounded-[28px] border border-[#D6A66A]/20 bg-[#D6A66A]/[0.06] p-5">
              <div className="text-[13px] text-white/60">
                Exporting <span className="text-white">{scope}</span> as <span className="text-white">{fileType}</span>.
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={exportData}
                className="rounded-2xl bg-[#D6A66A] px-8 py-4 text-[14px] font-semibold text-black transition hover:scale-[1.01] disabled:opacity-50"
              >
                {busy ? "Preparing..." : "Download"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

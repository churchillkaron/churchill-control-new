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

  const endpoint = action?.endpoint || "/api/workspace/export";
  const available = formats || action?.formats || DEFAULT_EXPORT_FORMATS;
  const allowedScopes = Array.isArray(action?.scopes) && action.scopes.length
    ? CONTENT_OPTIONS.filter(option => action.scopes.includes(option.id))
    : CONTENT_OPTIONS;

  const fileGroups = useMemo(() => {
    const options = getFormatOptions(available);
    return FILE_GROUPS.map(group => ({
      ...group,
      items: options.filter(item => item.group === group.id),
    })).filter(group => group.items.length > 0);
  }, [available]);

  if (!action || action.enabled === false) return null;

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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#191919]/20 p-5 text-[#191919] backdrop-blur-md">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-[30px] border border-black/[0.08] bg-white p-7 shadow-2xl shadow-black/10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-[#D6A66A]">Export</div>
                <h2 className="mt-3 text-[36px] font-light tracking-[-0.055em]">
                  Export {moduleKey || "records"}
                </h2>
                <p className="mt-2 text-[13px] text-[#746E66]">
                  Download data using the export capability configured for this workspace.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-black/[0.08] bg-[#FBF8F3] px-4 py-2 text-[12px] text-[#5F5A54] hover:bg-[#F7F6F3]"
              >
                Close
              </button>
            </div>

            <section className="mt-8 rounded-[28px] border border-black/[0.08] bg-[#FBF8F3] p-5">
              <div className="mb-4 text-[11px] uppercase tracking-[0.25em] text-[#918B83]">1. Export scope</div>
              <div className="grid gap-3 md:grid-cols-4">
                {allowedScopes.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setScope(item.id)}
                    className={`rounded-2xl border p-4 text-left text-[13px] transition ${
                      scope === item.id
                        ? "border-[#D6A66A] bg-[#FBF3E8] text-[#191919]"
                        : "border-black/[0.08] bg-white text-[#5F5A54] hover:border-[#D6A66A]/70 hover:bg-[#FBF8F3]"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-5 rounded-[28px] border border-black/[0.08] bg-[#FBF8F3] p-5">
              <div className="mb-4 text-[11px] uppercase tracking-[0.25em] text-[#918B83]">2. File type</div>
              <div className="space-y-5">
                {fileGroups.map(group => (
                  <div key={group.id}>
                    <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-[#9B6F3F]">
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
                              ? "border-[#D6A66A] bg-[#FBF3E8]"
                              : "border-black/[0.08] bg-white hover:border-[#D6A66A]/70 hover:bg-[#FBF8F3]"
                          }`}
                        >
                          <div className="text-[13px] text-[#191919]">{format.label}</div>
                          <div className="mt-2 text-[11px] text-[#918B83]">{format.extension}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="mt-6 flex items-center justify-between rounded-[28px] border border-[#D6A66A]/35 bg-[#FBF3E8] p-5">
              <div className="text-[13px] text-[#191919]/60">
                Exporting <span className="text-[#191919]">{scope}</span> as <span className="text-[#191919]">{fileType}</span>.
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={exportData}
                className="rounded-2xl bg-[#D6A66A] px-8 py-4 text-[14px] font-semibold text-[#191919] transition hover:scale-[1.01] disabled:opacity-50"
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

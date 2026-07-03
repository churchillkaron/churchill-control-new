"use client";

import { useRef, useState } from "react";
import {
  DEFAULT_IMPORT_FORMATS,
  getAcceptValue,
  getFormatOptions,
} from "./importExportFormats";

export default function ImportEngine({
  action,
  organizationId,
  entityId,
  periodId,
  moduleKey,
  formats,
  onComplete,
  className = "",
  label = "Import",
}) {
  const inputRef = useRef(null);
  const endpoint = action?.endpoint || "/api/workspace/import";
  const actionFormats = formats || action?.formats || DEFAULT_IMPORT_FORMATS;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("file");
  const [importUrl, setImportUrl] = useState("");

  const formatOptions = getFormatOptions(actionFormats);

  async function sendForm(form) {
    if (!endpoint) {
      alert("Import endpoint not configured.");
      return;
    }

    setBusy(true);

    try {
      form.append("organizationId", organizationId || "");
      form.append("organization_id", organizationId || "");
      form.append("entityId", entityId || "");
      form.append("entity_id", entityId || "");
      form.append("periodId", periodId || "");
      form.append("period_id", periodId || "");
      form.append("module", moduleKey || "");
      form.append("capability", action?.capability || "");
      form.append("action", JSON.stringify(action || {}));

      const res = await fetch(endpoint, {
        method: "POST",
        body: form,
      });

      const json = await res.json();

      if (!json.success) {
        alert(json.error || "Import failed");
        return;
      }

      const imported = json.imported ?? json.count ?? json.created ?? 0;
      const updated = json.updated ?? 0;
      const skipped = json.skipped ?? 0;

      alert(
        [
          `Imported ${imported} records`,
          updated ? `Updated ${updated}` : null,
          skipped ? `Skipped ${skipped}` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      );

      setOpen(false);
      onComplete?.(json);
    } catch (error) {
      alert(error.message || "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(file) {
    const form = new FormData();

    form.append("source", "file");
    form.append("file", file);

    await sendForm(form);
  }

  async function uploadUrl() {
    if (!importUrl.trim()) {
      alert("Import URL required.");
      return;
    }

    const form = new FormData();

    form.append("source", "url");
    form.append("url", importUrl.trim());

    await sendForm(form);
  }

  function handleDrop(event) {
    event.preventDefault();

    const file = event.dataTransfer.files?.[0];

    if (file) uploadFile(file);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-5 backdrop-blur-xl">
          <div className="w-full max-w-2xl rounded-[28px] border border-white/[0.1] bg-[#090909] p-6 text-white shadow-2xl shadow-black/80">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-amber-300/65">
                  Workspace Import
                </div>
                <h2 className="mt-3 text-[30px] font-light tracking-[-0.05em]">
                  Import {moduleKey || "records"}
                </h2>
                <p className="mt-2 text-[13px] leading-6 text-white/45">
                  Upload files, paste data, or import from a URL. The module API controls validation, mapping, preview, AI cleanup, and final import.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-[12px] text-white/55"
              >
                Close
              </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {["file", "paste", "url", "cloud"].map(item => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setMode(item)}
                  className={`rounded-xl border px-4 py-2 text-[12px] ${
                    mode === item
                      ? "border-amber-300/35 bg-amber-300/[0.1] text-amber-200"
                      : "border-white/[0.08] bg-white/[0.03] text-white/45"
                  }`}
                >
                  {item === "file"
                    ? "File"
                    : item === "paste"
                      ? "Paste"
                      : item === "url"
                        ? "URL"
                        : "Cloud"}
                </button>
              ))}
            </div>

            {mode === "file" && (
              <div
                onDragOver={event => event.preventDefault()}
                onDrop={handleDrop}
                className="mt-5 rounded-3xl border border-dashed border-white/[0.14] bg-white/[0.025] p-10 text-center"
              >
                <input
                  ref={inputRef}
                  hidden
                  type="file"
                  accept={getAcceptValue(actionFormats)}
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (file) uploadFile(file);
                    event.target.value = "";
                  }}
                />

                <div className="text-[15px] text-white/70">
                  Drop a file here
                </div>
                <div className="mt-2 text-[12px] text-white/35">
                  {formatOptions.map(item => item.label).join(", ")}
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                  className="mt-5 rounded-xl border border-amber-300/35 bg-amber-300/[0.1] px-5 py-3 text-[12px] text-amber-200 disabled:opacity-40"
                >
                  {busy ? "Importing..." : "Browse Files"}
                </button>
              </div>
            )}

            {mode === "paste" && (
              <div className="mt-5 rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5">
                <textarea
                  placeholder="Paste CSV, JSON, XML, bank statement text, SIE, or other structured data..."
                  className="min-h-48 w-full rounded-2xl border border-white/[0.08] bg-black/35 p-4 text-[13px] text-white outline-none placeholder:text-white/25"
                  onPaste={event => {
                    const text = event.clipboardData.getData("text");
                    const form = new FormData();
                    form.append("source", "paste");
                    form.append("text", text);
                    setTimeout(() => sendForm(form), 0);
                  }}
                />
                <div className="mt-3 text-[12px] text-white/35">
                  Paste data and it will be sent to the module import capability.
                </div>
              </div>
            )}

            {mode === "url" && (
              <div className="mt-5 rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5">
                <input
                  value={importUrl}
                  onChange={event => setImportUrl(event.target.value)}
                  placeholder="https://example.com/file.csv"
                  className="h-11 w-full rounded-2xl border border-white/[0.08] bg-black/35 px-4 text-[13px] text-white outline-none placeholder:text-white/25"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={uploadUrl}
                  className="mt-4 rounded-xl border border-amber-300/35 bg-amber-300/[0.1] px-5 py-3 text-[12px] text-amber-200 disabled:opacity-40"
                >
                  {busy ? "Importing..." : "Import from URL"}
                </button>
              </div>
            )}

            {mode === "cloud" && (
              <div className="mt-5 rounded-3xl border border-white/[0.08] bg-white/[0.025] p-8 text-[13px] text-white/45">
                Cloud connectors are ready for Google Drive, OneDrive, Dropbox, SharePoint, SFTP, and future connector imports. The engine UI is prepared; connector wiring comes through the module import endpoint.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

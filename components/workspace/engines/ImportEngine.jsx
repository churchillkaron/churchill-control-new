"use client";

import { useRef, useState } from "react";
import {
  DEFAULT_IMPORT_FORMATS,
  getAcceptValue,
  getFormatOptions,
} from "./importExportFormats";

const SOURCE_LABELS = {
  file: "File",
  paste: "Paste",
  url: "URL",
};

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
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("file");
  const [text, setText] = useState("");
  const [importUrl, setImportUrl] = useState("");

  if (!action || action.enabled === false) return null;

  const endpoint = action.endpoint || "/api/workspace/import";
  const actionFormats = formats || action.formats || DEFAULT_IMPORT_FORMATS;
  const formatOptions = getFormatOptions(actionFormats);
  const sources = Array.isArray(action.sources) && action.sources.length
    ? action.sources.filter(source => SOURCE_LABELS[source])
    : ["file"];
  const activeMode = sources.includes(mode) ? mode : sources[0];

  async function sendForm(form) {
    setBusy(true);
    try {
      form.append("organizationId", organizationId || "");
      form.append("organization_id", organizationId || "");
      form.append("entityId", entityId || "");
      form.append("entity_id", entityId || "");
      form.append("periodId", periodId || "");
      form.append("period_id", periodId || "");
      form.append("module", moduleKey || "");
      form.append("capability", action.capability || "");
      form.append("action", JSON.stringify(action));

      const response = await fetch(endpoint, {
        method: action.method || "POST",
        body: form,
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok || json.success === false) {
        throw new Error(json.error || json.message || "Import failed");
      }

      const imported = json.imported ?? json.count ?? json.created ?? 0;
      const updated = json.updated ?? 0;
      const skipped = json.skipped ?? 0;
      alert(
        [
          `Imported ${imported} records`,
          updated ? `Updated ${updated}` : null,
          skipped ? `Skipped ${skipped}` : null,
        ].filter(Boolean).join(" · ")
      );

      setOpen(false);
      setText("");
      setImportUrl("");
      onComplete?.(json);
    } catch (error) {
      alert(error.message || "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(file) {
    if (!file) return;
    const form = new FormData();
    form.append("source", "file");
    form.append("file", file);
    await sendForm(form);
  }

  async function uploadText() {
    if (!text.trim()) {
      alert("Paste data before importing.");
      return;
    }
    const form = new FormData();
    form.append("source", "paste");
    form.append("text", text.trim());
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

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {label}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-5 backdrop-blur-xl">
          <div className="w-full max-w-2xl rounded-[28px] border border-white/[0.1] bg-[#090909] p-6 text-white shadow-2xl shadow-black/80">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-amber-300/65">Workspace Import</div>
                <h2 className="mt-3 text-[30px] font-light tracking-[-0.05em]">
                  Import {moduleKey || "records"}
                </h2>
                <p className="mt-2 text-[13px] leading-6 text-white/45">
                  Import only through sources implemented by this workspace capability.
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

            {sources.length > 1 ? (
              <div className="mt-5 flex gap-2">
                {sources.map(item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setMode(item)}
                    className={`rounded-xl border px-4 py-2 text-[12px] ${
                      activeMode === item
                        ? "border-amber-300/35 bg-amber-300/[0.1] text-amber-200"
                        : "border-white/[0.08] bg-white/[0.03] text-white/45"
                    }`}
                  >
                    {SOURCE_LABELS[item]}
                  </button>
                ))}
              </div>
            ) : null}

            {activeMode === "file" ? (
              <div className="mt-5 rounded-3xl border border-dashed border-white/[0.14] bg-white/[0.025] p-10 text-center">
                <input
                  ref={inputRef}
                  hidden
                  type="file"
                  accept={getAcceptValue(actionFormats)}
                  onChange={event => {
                    uploadFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                <div className="text-[15px] text-white/70">Choose an import file</div>
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
            ) : null}

            {activeMode === "paste" ? (
              <div className="mt-5 rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5">
                <textarea
                  value={text}
                  onChange={event => setText(event.target.value)}
                  placeholder="Paste structured data..."
                  className="min-h-48 w-full rounded-2xl border border-white/[0.08] bg-black/35 p-4 text-[13px] text-white outline-none placeholder:text-white/25"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={uploadText}
                  className="mt-4 rounded-xl border border-amber-300/35 bg-amber-300/[0.1] px-5 py-3 text-[12px] text-amber-200 disabled:opacity-40"
                >
                  {busy ? "Importing..." : "Import Pasted Data"}
                </button>
              </div>
            ) : null}

            {activeMode === "url" ? (
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
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function FinanceAttachmentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const organizationId = searchParams.get("organizationId") || "";
  const entityId = searchParams.get("entityId") || "";
  const recordType = searchParams.get("recordType") || "journal_entry";
  const recordId = searchParams.get("recordId") || "";
  const reference = searchParams.get("reference") || "Finance record";

  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams({
      organizationId,
      recordType,
      recordId,
    });
    if (entityId) params.set("entityId", entityId);
    return params.toString();
  }, [organizationId, entityId, recordType, recordId]);

  const load = useCallback(async () => {
    if (!organizationId || !recordId) {
      setError("The attachment target is incomplete.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");
      const response = await fetch(`/api/finance/attachments?${query}`, {
        cache: "no-store",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || "Attachments could not be loaded");
      }
      setAttachments(Array.isArray(json.attachments) ? json.attachments : []);
    } catch (loadError) {
      setError(loadError.message || "Attachments could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [organizationId, recordId, query]);

  useEffect(() => {
    load();
  }, [load]);

  async function uploadFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      setUploading(true);
      setError("");
      setMessage("");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("organizationId", organizationId);
      formData.append("recordType", recordType);
      formData.append("recordId", recordId);
      if (entityId) formData.append("entityId", entityId);

      const response = await fetch("/api/finance/attachments", {
        method: "POST",
        body: formData,
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || "Attachment upload failed");
      }

      setMessage(`${file.name} uploaded.`);
      await load();
    } catch (uploadError) {
      setError(uploadError.message || "Attachment upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(attachment) {
    if (!window.confirm(`Remove ${attachment.file_name}?`)) return;

    try {
      setError("");
      setMessage("");
      const response = await fetch("/api/finance/attachments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          entityId: entityId || null,
          recordType,
          recordId,
          storagePath: attachment.storage_path,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || "Attachment could not be removed");
      }
      setMessage(`${attachment.file_name} removed.`);
      await load();
    } catch (deleteError) {
      setError(deleteError.message || "Attachment could not be removed");
    }
  }

  return (
    <main className="min-h-screen bg-[#050505] px-6 py-7 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-5 border-b border-white/10 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.32em] text-amber-300/70">
              Finance · Attachments
            </div>
            <h1 className="mt-3 text-4xl font-light tracking-[-0.05em]">
              {reference}
            </h1>
            <p className="mt-2 text-sm text-white/45">
              Add supporting invoices, receipts, approvals, calculations and other evidence.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white/60 hover:bg-white/5"
            >
              Back
            </button>
            <label className="cursor-pointer rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-black hover:bg-amber-300">
              {uploading ? "Uploading..." : "+ Add Attachment"}
              <input
                type="file"
                className="hidden"
                disabled={uploading}
                accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.xls,.xlsx,.doc,.docx"
                onChange={uploadFile}
              />
            </label>
          </div>
        </div>

        {message ? (
          <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <section className="mt-6 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.025]">
          <div className="grid grid-cols-[minmax(0,1fr)_150px_140px_190px] gap-4 border-b border-white/10 px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-white/35">
            <div>File</div>
            <div>Type</div>
            <div>Size</div>
            <div>Uploaded</div>
          </div>

          {loading ? (
            <div className="p-8 text-sm text-white/45">Loading attachments...</div>
          ) : attachments.length === 0 ? (
            <div className="p-8">
              <div className="text-lg text-white/75">No attachments yet</div>
              <div className="mt-2 text-sm text-white/40">
                Use Add Attachment to upload the supporting document for this finance record.
              </div>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {attachments.map(attachment => (
                <div
                  key={attachment.id}
                  className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_150px_140px_190px] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white/80">
                      {attachment.file_name}
                    </div>
                    <div className="mt-2 flex gap-3 text-xs">
                      {attachment.url ? (
                        <a
                          href={attachment.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-amber-300 hover:text-amber-200"
                        >
                          Open / Download
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeAttachment(attachment)}
                        className="text-red-300/80 hover:text-red-200"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="text-sm text-white/50">
                    {attachment.mime_type || "Document"}
                  </div>
                  <div className="text-sm text-white/50">
                    {formatBytes(attachment.file_size)}
                  </div>
                  <div className="text-sm text-white/50">
                    {formatDate(attachment.created_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="mt-4 text-xs text-white/30">
          Maximum file size: 20 MB. Allowed: PDF, images, text, CSV, Excel and Word documents.
        </div>
      </div>
    </main>
  );
}

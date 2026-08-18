"use client";

import { useEffect, useState } from "react";

function attachmentUrl(attachment) {
  return attachment?.external_url || attachment?.url || null;
}

function attachmentLabel(attachment) {
  return attachment?.file_name || attachment?.name || "Attachment";
}

export default function CommunicationDraftReviewBanner({
  organizationId,
  conversationId,
  messageId,
}) {
  const [message, setMessage] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      if (!organizationId || !conversationId || !messageId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const url = new URL(
          `/api/commercial/communications/conversations/${encodeURIComponent(conversationId)}`,
          window.location.origin,
        );
        url.searchParams.set("organizationId", organizationId);
        const response = await fetch(url, { cache: "no-store" });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || json?.success === false) {
          throw new Error(json?.error || "Communication draft could not be loaded.");
        }
        const draft = (json.messages || []).find((row) => row.id === messageId) || null;
        if (!draft) throw new Error("COMMUNICATION_DRAFT_NOT_FOUND");
        if (active) {
          setConversation(json.conversation || null);
          setMessage(draft);
        }
      } catch (loadError) {
        if (active) setError(loadError.message || "Communication draft could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [organizationId, conversationId, messageId]);

  async function sendDraft() {
    if (!message || message.status !== "DRAFT") return;
    setSending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/commercial/communications/conversations/${encodeURIComponent(conversationId)}/drafts/${encodeURIComponent(messageId)}/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId, confirmed: true }),
        },
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || "Communication draft could not be sent.");
      }
      setMessage((current) => current ? { ...current, status: json.status || "SENT" } : current);
      setConfirming(false);
      setNotice(
        json.delivery_failed
          ? "Delivery failed after the confirmed send request. Review the provider status below."
          : json.delivery_pending
            ? "The confirmed draft is queued for delivery."
            : "The confirmed draft was sent.",
      );
    } catch (sendError) {
      setError(sendError.message || "Communication draft could not be sent.");
    } finally {
      setSending(false);
    }
  }

  if (!conversationId || !messageId) return null;

  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  const participant =
    conversation?.external_participant_name ||
    conversation?.external_participant_address ||
    conversation?.external_participant_id ||
    "Customer";

  return (
    <section className="mx-auto mt-4 max-w-[1780px] px-4 text-white md:px-6">
      <div className="rounded-[24px] border border-amber-300/20 bg-amber-300/[0.055] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200/60">
              Saved Communications Draft
            </div>
            <h2 className="mt-2 text-xl font-semibold text-white/90">
              Review before customer delivery
            </h2>
            <p className="mt-2 text-xs leading-5 text-white/40">
              This is the exact saved message for {participant}. Sending cannot replace its body or attachments.
            </p>
          </div>
          {message ? (
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">
              {message.status}
            </span>
          ) : null}
        </div>

        {loading ? <div className="mt-4 text-sm text-white/40">Loading saved draft…</div> : null}
        {error ? <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/[0.06] px-4 py-3 text-sm text-red-100">{error}</div> : null}
        {notice ? <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3 text-sm text-emerald-100">{notice}</div> : null}

        {!loading && message ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              {message.subject ? <div className="mb-3 text-sm font-semibold text-white/75">{message.subject}</div> : null}
              {message.body ? <div className="whitespace-pre-wrap text-sm leading-6 text-white/70">{message.body}</div> : null}
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs font-semibold text-white/65">Attachments · {attachments.length}</div>
              <div className="mt-3 space-y-2">
                {attachments.map((attachment, index) => {
                  const url = attachmentUrl(attachment);
                  return url ? (
                    <a
                      key={attachment.id || `${url}-${index}`}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs text-white/55 hover:text-white"
                    >
                      {attachmentLabel(attachment)}
                    </a>
                  ) : null;
                })}
                {!attachments.length ? <div className="text-xs text-white/30">No attachments.</div> : null}
              </div>
            </div>
          </div>
        ) : null}

        {!loading && message?.status === "DRAFT" ? (
          <div className="mt-5 border-t border-white/10 pt-4">
            {!confirming ? (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-2.5 text-sm font-semibold text-amber-100"
              >
                Review & send saved draft
              </button>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-300/15 bg-red-300/[0.045] p-4">
                <div>
                  <div className="text-sm font-semibold text-white/85">Confirm customer send</div>
                  <div className="mt-1 text-xs text-white/40">Send this exact saved draft now? This action is irreversible.</div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setConfirming(false)} disabled={sending} className="rounded-xl border border-white/10 px-4 py-2 text-xs text-white/55">Cancel</button>
                  <button type="button" onClick={sendDraft} disabled={sending} className="rounded-xl border border-red-300/25 bg-red-300/10 px-4 py-2 text-xs font-semibold text-red-100 disabled:opacity-40">{sending ? "Sending…" : "Confirm send"}</button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

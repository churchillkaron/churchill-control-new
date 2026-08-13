"use client";

import { useEffect, useMemo, useState } from "react";

const FILTERS = [
  ["all", "All"],
  ["whatsapp", "WhatsApp"],
  ["messenger", "Messenger"],
  ["instagram", "Instagram"],
  ["line", "LINE"],
  ["email", "Email"],
  ["threads", "Threads"],
  ["tiktok", "TikTok"],
  ["linkedin", "LinkedIn"],
  ["x", "X"],
];

function dateTime(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function channelName(row) {
  return row?.channelLabel || row?.label || row?.family || row?.provider || "Channel";
}

function participant(row) {
  return row?.external_participant_name || row?.external_participant_address || row?.external_participant_id || "Conversation";
}

function deliveryText(message) {
  const status = String(message?.status || "").toUpperCase();
  if (status === "FAILED") return "Delivery failed";
  if (status === "QUEUED") return "Queued";
  if (status === "SENDING") return "Sending";
  if (status === "DELIVERED") return "Delivered";
  if (status === "READ") return "Read";
  if (status === "SENT") return "Sent";
  return status ? status[0] + status.slice(1).toLowerCase() : "";
}

function pillClass(active) {
  return active
    ? "border-amber-300/30 bg-amber-300/[0.10] text-amber-100"
    : "border-white/[0.07] bg-white/[0.025] text-white/45 hover:bg-white/[0.05] hover:text-white/70";
}

export default function CommunicationsWorkspace({ organizationId }) {
  const [snapshot, setSnapshot] = useState({ conversations: [], connections: [] });
  const [selectedId, setSelectedId] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState({ connectionId: "", recipientAddress: "", recipientName: "", subject: "" });
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!organizationId) return;
      try {
        setLoading(true);
        setError("");
        const url = new URL("/api/commercial/communications/conversations", window.location.origin);
        url.searchParams.set("organizationId", organizationId);
        const response = await fetch(url, { cache: "no-store" });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result?.success === false) throw new Error(result?.error || "Unable to load Communications");
        if (!active) return;
        const next = {
          conversations: result.conversations || [],
          connections: result.connections || [],
        };
        setSnapshot(next);
        setSelectedId((current) => current && next.conversations.some((row) => row.id === current) ? current : next.conversations[0]?.id || null);
      } catch (loadError) {
        if (active) setError(loadError?.message || "Unable to load Communications");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [organizationId, refresh]);

  const visibleConversations = useMemo(() => {
    const term = query.trim().toLowerCase();
    return snapshot.conversations.filter((row) => {
      const family = String(row.family || row.provider || "").toLowerCase();
      if (filter !== "all" && family !== filter) return false;
      if (!term) return true;
      return [participant(row), row.subject, row.latestMessage?.body, channelName(row)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [snapshot.conversations, filter, query]);

  const channelCounts = useMemo(() => {
    const counts = { all: snapshot.conversations.length };
    for (const row of snapshot.conversations) {
      const family = String(row.family || row.provider || "").toLowerCase();
      counts[family] = Number(counts[family] || 0) + 1;
    }
    return counts;
  }, [snapshot.conversations]);

  const unreadCounts = useMemo(() => {
    const counts = { all: 0 };
    for (const row of snapshot.conversations) {
      const family = String(row.family || row.provider || "").toLowerCase();
      const unread = Number(row.unread_count || 0);
      counts.all += unread;
      counts[family] = Number(counts[family] || 0) + unread;
    }
    return counts;
  }, [snapshot.conversations]);

  useEffect(() => {
    const selectedVisible = selectedId && visibleConversations.some((row) => row.id === selectedId);
    if (selectedVisible) return;
    setSelectedId(visibleConversations[0]?.id || null);
    setTimeline(null);
    setMessage("");
    setSubject("");
    setNotice("");
  }, [filter, query, selectedId, visibleConversations]);

  useEffect(() => {
    let active = true;
    async function loadTimeline() {
      if (!selectedId || !organizationId) {
        setTimeline(null);
        return;
      }
      try {
        const url = new URL(`/api/commercial/communications/conversations/${selectedId}`, window.location.origin);
        url.searchParams.set("organizationId", organizationId);
        const response = await fetch(url, { cache: "no-store" });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result?.success === false) throw new Error(result?.error || "Unable to load conversation");
        if (active) {
          setTimeline({ conversation: result.conversation, messages: result.messages || [] });
          setSubject(result.conversation?.subject || "");
        }
      } catch (loadError) {
        if (active) setError(loadError?.message || "Unable to load conversation");
      }
    }
    loadTimeline();
    return () => { active = false; };
  }, [selectedId, organizationId, refresh]);

  const selected = timeline?.conversation || visibleConversations.find((row) => row.id === selectedId) || null;
  const selectedFamily = String(selected?.family || selected?.provider || "").toLowerCase();
  const canSend = selected?.sendable === true;
  const selectableConnections = snapshot.connections || [];
  const activeFilterLabel = FILTERS.find(([id]) => id === filter)?.[1] || "Channel";

  async function createConversation() {
    if (!draft.connectionId || !draft.recipientAddress.trim()) return;
    try {
      setError("");
      const response = await fetch("/api/commercial/communications/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, ...draft }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) throw new Error(result?.error || "Unable to create conversation");
      setNewOpen(false);
      setDraft({ connectionId: "", recipientAddress: "", recipientName: "", subject: "" });
      setSelectedId(result.conversation?.id || null);
      setRefresh((value) => value + 1);
    } catch (createError) {
      setError(createError?.message || "Unable to create conversation");
    }
  }

  async function sendMessage() {
    const body = message.trim();
    if (!body || !selectedId || !canSend) return;
    try {
      setSending(true);
      setError("");
      setNotice("");
      const response = await fetch(`/api/commercial/communications/conversations/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, conversationId: selectedId, body, subject }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) throw new Error(result?.error || "Unable to send message");
      setMessage("");
      if (result.deliveryFailed) setNotice("Message saved, but provider delivery failed.");
      else if (result.deliveryPending) setNotice("Message queued for delivery.");
      else setNotice("Message sent.");
      setRefresh((value) => value + 1);
    } catch (sendError) {
      setError(sendError?.message || "Unable to send message");
    } finally {
      setSending(false);
    }
  }

  function chooseFilter(id) {
    setFilter(id);
    setQuery("");
    setNotice("");
  }

  return (
    <div className="min-h-[calc(100vh-80px)] p-4 text-white md:p-6">
      <div className="mx-auto max-w-[1700px]">
        <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-amber-300/55">Commercial · Customer Management</div>
            <h1 className="mt-2 text-[32px] font-light tracking-[-0.045em] md:text-[40px]">Communications</h1>
            <p className="mt-1 max-w-2xl text-[12px] text-white/40">One inbox. Click a channel to see only its customer conversations and messages.</p>
          </div>
          <button type="button" onClick={() => setNewOpen(true)} className="h-10 rounded-xl border border-amber-300/30 bg-gradient-to-b from-amber-200 to-amber-500 px-4 text-[12px] font-semibold text-black shadow-lg shadow-amber-500/10">New message</button>
        </div>

        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map(([id, label]) => {
            const count = Number(channelCounts[id] || 0);
            const unread = Number(unreadCounts[id] || 0);
            return (
              <button key={id} type="button" onClick={() => chooseFilter(id)} className={`flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-[11px] transition ${pillClass(filter === id)}`}>
                <span>{label}</span>
                {count > 0 ? <span className="rounded-full bg-white/[0.07] px-1.5 py-0.5 text-[9px] text-white/45">{count}</span> : null}
                {unread > 0 ? <span className="min-w-5 rounded-full bg-amber-300 px-1.5 py-0.5 text-center text-[9px] font-semibold text-black">{unread}</span> : null}
              </button>
            );
          })}
        </div>

        {error ? <div className="mb-4 rounded-2xl border border-red-400/15 bg-red-400/[0.06] px-4 py-3 text-[12px] text-red-200">{error}</div> : null}
        {notice ? <div className="mb-4 rounded-2xl border border-amber-300/15 bg-amber-300/[0.05] px-4 py-3 text-[12px] text-amber-100/80">{notice}</div> : null}

        <div className="grid min-h-[700px] overflow-hidden rounded-[28px] border border-white/[0.08] bg-black/25 shadow-2xl shadow-black/20 lg:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="border-b border-white/[0.07] bg-black/20 lg:border-b-0 lg:border-r">
            <div className="border-b border-white/[0.05] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-white/30">Inbox</div>
                  <div className="mt-1 text-[13px] text-white/70">{activeFilterLabel}</div>
                </div>
                <div className="text-[10px] text-white/30">{visibleConversations.length} conversation{visibleConversations.length === 1 ? "" : "s"}</div>
              </div>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${filter === "all" ? "all conversations" : activeFilterLabel}`} className="h-11 w-full rounded-xl border border-white/[0.08] bg-black/35 px-4 text-[12px] text-white outline-none placeholder:text-white/25 focus:border-amber-300/25" />
            </div>
            <div className="max-h-[625px] overflow-y-auto px-2 py-3">
              {loading ? <div className="p-4 text-[12px] text-white/35">Loading conversations…</div> : null}
              {!loading && !visibleConversations.length ? (
                <div className="m-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
                  <div className="text-[13px] text-white/60">No {filter === "all" ? "customer" : activeFilterLabel} conversations yet.</div>
                  <div className="mt-2 text-[11px] leading-5 text-white/30">Incoming messages will appear here automatically when the connected channel webhook receives them.</div>
                </div>
              ) : null}
              {visibleConversations.map((row) => {
                const active = row.id === selectedId;
                return (
                  <button key={row.id} type="button" onClick={() => { setSelectedId(row.id); setNotice(""); }} className={`mb-1 w-full rounded-2xl border p-3 text-left transition ${active ? "border-amber-300/18 bg-amber-300/[0.055]" : "border-transparent hover:border-white/[0.05] hover:bg-white/[0.025]"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium text-white/82">{participant(row)}</div>
                        <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-amber-200/45">{channelName(row)}</div>
                      </div>
                      <div className="shrink-0 text-[9px] text-white/25">{dateTime(row.last_message_at || row.updated_at)}</div>
                    </div>
                    <div className="mt-2 line-clamp-2 text-[11px] leading-5 text-white/38">{row.latestMessage?.body || row.subject || "No messages yet"}</div>
                    {Number(row.unread_count || 0) > 0 ? <div className="mt-2 inline-flex min-w-5 items-center justify-center rounded-full bg-amber-300 px-1.5 py-0.5 text-[9px] font-semibold text-black">{row.unread_count}</div> : null}
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="flex min-h-[700px] flex-col">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center p-8 text-center">
                <div>
                  <div className="text-[18px] font-light text-white/65">{visibleConversations.length ? "Choose a conversation" : `No ${filter === "all" ? "messages" : `${activeFilterLabel} messages`} yet`}</div>
                  <div className="mt-2 max-w-sm text-[12px] leading-5 text-white/30">{visibleConversations.length ? "Select a customer on the left to open the full message timeline." : "When a customer sends a message through this channel, the conversation and complete timeline will appear here."}</div>
                </div>
              </div>
            ) : (
              <>
                <header className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-5 py-4">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-medium text-white/85">{participant(selected)}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-white/30">
                      <span className="text-amber-200/55">{channelName(selected)}</span>
                      <span>·</span>
                      <span>{selected.external_participant_address || selected.external_participant_id}</span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5 text-[10px] text-white/40">{selected.status || "OPEN"}</div>
                </header>

                <div className="flex-1 space-y-3 overflow-y-auto p-5 md:p-7">
                  {!timeline?.messages?.length ? <div className="py-12 text-center text-[12px] text-white/28">No messages yet.</div> : null}
                  {(timeline?.messages || []).map((row) => {
                    const outgoing = row.direction === "OUTBOUND";
                    return (
                      <div key={row.id} className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[82%] rounded-[20px] border px-4 py-3 md:max-w-[66%] ${outgoing ? "border-amber-300/12 bg-amber-300/[0.065]" : "border-white/[0.07] bg-white/[0.035]"}`}>
                          {row.subject ? <div className="mb-1.5 text-[11px] font-medium text-white/65">{row.subject}</div> : null}
                          <div className="whitespace-pre-wrap break-words text-[13px] leading-6 text-white/78">{row.body || ""}</div>
                          <div className="mt-2 flex items-center justify-end gap-2 text-[9px] text-white/28">
                            <span>{dateTime(row.sent_at || row.received_at || row.created_at)}</span>
                            {outgoing ? <span>· {deliveryText(row)}</span> : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-white/[0.07] bg-black/20 p-4 md:p-5">
                  {!canSend ? (
                    <div className="mb-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5 text-[11px] text-white/38">This channel is visible in the unified inbox. Outbound replies will unlock when its verified delivery capability is available.</div>
                  ) : null}
                  {selectedFamily === "email" ? <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" className="mb-2 h-10 w-full rounded-xl border border-white/[0.08] bg-black/35 px-3 text-[12px] text-white outline-none" /> : null}
                  <div className="flex items-end gap-3">
                    <textarea rows={3} value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") sendMessage(); }} disabled={!canSend} placeholder={canSend ? `Reply via ${channelName(selected)}…` : "Outbound delivery is not enabled for this channel"} className="min-h-[74px] flex-1 resize-none rounded-2xl border border-white/[0.08] bg-black/35 p-3 text-[13px] leading-5 text-white outline-none placeholder:text-white/22 focus:border-amber-300/25 disabled:opacity-45" />
                    <button type="button" disabled={!canSend || sending || !message.trim()} onClick={sendMessage} className="h-11 rounded-xl border border-amber-300/30 bg-gradient-to-b from-amber-200 to-amber-500 px-5 text-[12px] font-semibold text-black disabled:opacity-30">{sending ? "Sending…" : "Send"}</button>
                  </div>
                  {canSend ? <div className="mt-2 text-[9px] text-white/22">Ctrl/⌘ + Enter to send</div> : null}
                </div>
              </>
            )}
          </main>
        </div>
      </div>

      {newOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-xl">
          <div className="w-full max-w-xl rounded-[28px] border border-white/[0.10] bg-[#0b0b0b] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-amber-300/55">Communications</div>
                <h2 className="mt-2 text-[26px] font-light tracking-[-0.04em]">New message</h2>
              </div>
              <button type="button" onClick={() => setNewOpen(false)} className="rounded-xl border border-white/[0.08] px-3 py-2 text-[11px] text-white/45">Close</button>
            </div>
            <div className="mt-6 space-y-4">
              <label className="block text-[11px] text-white/45">Channel
                <select value={draft.connectionId} onChange={(event) => setDraft((current) => ({ ...current, connectionId: event.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-white/[0.08] bg-black/45 px-3 text-[12px] text-white outline-none">
                  <option value="">Choose connected channel</option>
                  {selectableConnections.map((row) => <option key={row.id} value={row.id}>{row.label} · {row.name}</option>)}
                </select>
              </label>
              <label className="block text-[11px] text-white/45">Recipient address / channel ID
                <input value={draft.recipientAddress} onChange={(event) => setDraft((current) => ({ ...current, recipientAddress: event.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-white/[0.08] bg-black/45 px-3 text-[12px] text-white outline-none" />
              </label>
              <label className="block text-[11px] text-white/45">Recipient name
                <input value={draft.recipientName} onChange={(event) => setDraft((current) => ({ ...current, recipientName: event.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-white/[0.08] bg-black/45 px-3 text-[12px] text-white outline-none" />
              </label>
              <label className="block text-[11px] text-white/45">Subject / reference
                <input value={draft.subject} onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-white/[0.08] bg-black/45 px-3 text-[12px] text-white outline-none" />
              </label>
            </div>
            {!selectableConnections.length ? <div className="mt-4 rounded-xl border border-amber-300/12 bg-amber-300/[0.04] px-3 py-2.5 text-[11px] text-amber-100/55">Connect a business channel in Administration → Integrations before starting a conversation.</div> : null}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setNewOpen(false)} className="h-10 rounded-xl border border-white/[0.08] px-4 text-[11px] text-white/45">Cancel</button>
              <button type="button" disabled={!draft.connectionId || !draft.recipientAddress.trim()} onClick={createConversation} className="h-10 rounded-xl border border-amber-300/30 bg-gradient-to-b from-amber-200 to-amber-500 px-5 text-[11px] font-semibold text-black disabled:opacity-30">Open conversation</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const CHANNELS = [
  ["all", "All"],
  ["messenger", "Messenger"],
  ["instagram", "Instagram"],
  ["whatsapp", "WhatsApp"],
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

function family(row) {
  return String(row?.family || row?.provider || "").toLowerCase();
}

function channelName(row) {
  return row?.channelLabel || row?.label || row?.family || row?.provider || "Channel";
}

function participant(row) {
  return row?.external_participant_name || row?.external_participant_address || row?.external_participant_id || "Conversation";
}

function deliveryText(message) {
  const status = String(message?.status || "").toUpperCase();
  if (status === "FAILED") return "Failed";
  if (status === "QUEUED") return "Queued";
  if (status === "SENDING") return "Sending";
  if (status === "DELIVERED") return "Delivered";
  if (status === "READ") return "Read";
  if (status === "SENT") return "Sent";
  return status ? status[0] + status.slice(1).toLowerCase() : "";
}

export default function CommunicationsWorkspace({ organizationId }) {
  const [snapshot, setSnapshot] = useState({ conversations: [], connections: [] });
  const [selectedId, setSelectedId] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [channel, setChannel] = useState("all");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const initialSyncStarted = useRef(false);

  async function loadInbox() {
    if (!organizationId) {
      setLoading(false);
      setError("Active organization is unavailable.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const url = new URL("/api/commercial/communications/conversations", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("sync", "0");
      const response = await fetch(url, { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) throw new Error(result?.error || "Unable to load Communications");

      const next = {
        conversations: result.conversations || [],
        connections: result.connections || [],
      };
      setSnapshot(next);
      setSelectedId((current) => current && next.conversations.some((row) => row.id === current) ? current : next.conversations[0]?.id || null);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load Communications");
    } finally {
      setLoading(false);
    }
  }

  async function syncConnectedChannels({ silent = false } = {}) {
    if (!organizationId || syncing) return;
    try {
      setSyncing(true);
      if (!silent) setNotice("Synchronizing connected channels…");
      const url = new URL("/api/commercial/communications/conversations", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("sync", "1");

      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 25000);
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      window.clearTimeout(timer);
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) throw new Error(result?.error || "Channel synchronization failed");
      if (result?.providerSync?.success === false) throw new Error(result.providerSync.error || "Meta synchronization failed");

      const next = {
        conversations: result.conversations || [],
        connections: result.connections || [],
      };
      setSnapshot(next);
      setSelectedId((current) => current && next.conversations.some((row) => row.id === current) ? current : next.conversations[0]?.id || null);
      if (!silent) setNotice("Connected channels synchronized.");
    } catch (syncError) {
      const message = syncError?.name === "AbortError"
        ? "Channel sync is taking longer than expected. The inbox remains usable while the provider finishes."
        : syncError?.message || "Channel synchronization failed";
      if (!silent) setError(message);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function start() {
      await loadInbox();
      if (!cancelled && !initialSyncStarted.current) {
        initialSyncStarted.current = true;
        syncConnectedChannels({ silent: true });
      }
    }
    start();
    return () => { cancelled = true; };
  }, [organizationId, refresh]);

  const conversations = useMemo(() => {
    const term = query.trim().toLowerCase();
    return snapshot.conversations.filter((row) => {
      if (channel !== "all" && family(row) !== channel) return false;
      if (!term) return true;
      return [participant(row), row.subject, row.latestMessage?.body, channelName(row)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [snapshot.conversations, channel, query]);

  const counts = useMemo(() => {
    const result = { all: snapshot.conversations.length };
    for (const row of snapshot.conversations) {
      const key = family(row);
      result[key] = Number(result[key] || 0) + 1;
    }
    return result;
  }, [snapshot.conversations]);

  const unread = useMemo(() => {
    const result = { all: 0 };
    for (const row of snapshot.conversations) {
      const key = family(row);
      const value = Number(row.unread_count || 0);
      result.all += value;
      result[key] = Number(result[key] || 0) + value;
    }
    return result;
  }, [snapshot.conversations]);

  const connectedFamilies = useMemo(() => new Set((snapshot.connections || []).map((row) => family(row))), [snapshot.connections]);

  useEffect(() => {
    if (selectedId && conversations.some((row) => row.id === selectedId)) return;
    setSelectedId(conversations[0]?.id || null);
    setTimeline(null);
    setMessage("");
    setSubject("");
  }, [channel, query, conversations, selectedId]);

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

  const selected = timeline?.conversation || conversations.find((row) => row.id === selectedId) || null;
  const canSend = selected?.sendable === true;
  const selectedFamily = family(selected);

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
      setNotice(result.deliveryFailed ? "Message saved, but provider delivery failed." : result.deliveryPending ? "Message queued." : "Message sent.");
      setRefresh((value) => value + 1);
    } catch (sendError) {
      setError(sendError?.message || "Unable to send message");
    } finally {
      setSending(false);
    }
  }

  const activeLabel = CHANNELS.find(([id]) => id === channel)?.[1] || "All";

  return (
    <div className="min-h-[calc(100vh-80px)] p-4 text-white md:p-6">
      <div className="mx-auto max-w-[1780px]">
        <header className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-amber-300/55">Commercial · Customer Management</div>
            <h1 className="mt-2 text-[34px] font-light tracking-[-0.05em] md:text-[42px]">Communications</h1>
            <p className="mt-1 text-[12px] text-white/38">Connected customer conversations, live channel by live channel.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[10px] text-white/40">
              {snapshot.connections.length} connected channel{snapshot.connections.length === 1 ? "" : "s"}
            </div>
            <button type="button" onClick={() => syncConnectedChannels()} disabled={syncing} className="h-10 rounded-xl border border-amber-300/25 bg-amber-300/[0.08] px-4 text-[11px] font-semibold text-amber-100 disabled:opacity-40">
              {syncing ? "Syncing…" : "Sync channels"}
            </button>
          </div>
        </header>

        {error ? <div className="mb-4 rounded-2xl border border-red-400/15 bg-red-400/[0.06] px-4 py-3 text-[12px] text-red-200">{error}</div> : null}
        {notice ? <div className="mb-4 rounded-2xl border border-amber-300/15 bg-amber-300/[0.05] px-4 py-3 text-[12px] text-amber-100/75">{notice}</div> : null}

        <div className="grid min-h-[720px] overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#070707]/90 shadow-2xl shadow-black/25 xl:grid-cols-[190px_360px_minmax(0,1fr)]">
          <aside className="border-b border-white/[0.07] bg-black/30 p-3 xl:border-b-0 xl:border-r">
            <div className="px-2 pb-3 pt-1 text-[9px] uppercase tracking-[0.22em] text-white/25">Channels</div>
            <div className="flex gap-2 overflow-x-auto xl:block xl:space-y-1 xl:overflow-visible">
              {CHANNELS.map(([id, label]) => {
                const active = channel === id;
                const isConnected = id === "all" || connectedFamilies.has(id) || Number(counts[id] || 0) > 0;
                return (
                  <button key={id} type="button" onClick={() => { setChannel(id); setQuery(""); setNotice(""); }} className={`flex min-w-[130px] items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition xl:w-full ${active ? "border-amber-300/25 bg-amber-300/[0.08] text-amber-100" : "border-transparent text-white/48 hover:bg-white/[0.035] hover:text-white/75"}`}>
                    <span className="text-[11px] font-medium">{label}</span>
                    <span className="flex items-center gap-1.5">
                      {isConnected && id !== "all" ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" /> : null}
                      {Number(unread[id] || 0) > 0 ? <span className="rounded-full bg-amber-300 px-1.5 py-0.5 text-[9px] font-bold text-black">{unread[id]}</span> : Number(counts[id] || 0) > 0 ? <span className="text-[9px] text-white/28">{counts[id]}</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="border-b border-white/[0.07] bg-black/18 xl:border-b-0 xl:border-r">
            <div className="border-b border-white/[0.06] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.2em] text-white/25">Inbox</div>
                  <div className="mt-1 text-[15px] text-white/80">{activeLabel}</div>
                </div>
                <div className="text-[10px] text-white/28">{conversations.length}</div>
              </div>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${activeLabel}`} className="mt-4 h-11 w-full rounded-xl border border-white/[0.08] bg-black/40 px-4 text-[12px] text-white outline-none placeholder:text-white/24 focus:border-amber-300/25" />
            </div>

            <div className="max-h-[650px] overflow-y-auto p-2">
              {loading ? <div className="p-4 text-[12px] text-white/35">Loading inbox…</div> : null}
              {!loading && !conversations.length ? (
                <div className="m-2 rounded-2xl border border-white/[0.06] bg-white/[0.018] p-5">
                  <div className="text-[13px] text-white/65">No {activeLabel === "All" ? "conversations" : `${activeLabel} conversations`} loaded yet.</div>
                  <div className="mt-2 text-[11px] leading-5 text-white/30">Use Sync channels to import existing connected-channel history. New incoming messages will then continue through the live webhook.</div>
                </div>
              ) : null}

              {conversations.map((row) => {
                const active = row.id === selectedId;
                return (
                  <button key={row.id} type="button" onClick={() => { setSelectedId(row.id); setNotice(""); }} className={`mb-1 w-full rounded-2xl border p-3.5 text-left transition ${active ? "border-amber-300/18 bg-amber-300/[0.055]" : "border-transparent hover:border-white/[0.05] hover:bg-white/[0.025]"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-white/84">{participant(row)}</div>
                        <div className="mt-1 text-[9px] uppercase tracking-[0.16em] text-amber-200/45">{channelName(row)}</div>
                      </div>
                      <div className="shrink-0 text-[9px] text-white/24">{dateTime(row.last_message_at || row.updated_at)}</div>
                    </div>
                    <div className="mt-2 line-clamp-2 text-[11px] leading-5 text-white/38">{row.latestMessage?.body || row.subject || "No message preview"}</div>
                    {Number(row.unread_count || 0) > 0 ? <div className="mt-2 inline-flex min-w-5 items-center justify-center rounded-full bg-amber-300 px-1.5 py-0.5 text-[9px] font-bold text-black">{row.unread_count}</div> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <main className="flex min-h-[720px] flex-col bg-black/8">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center p-8 text-center">
                <div className="max-w-md">
                  <div className="text-[20px] font-light text-white/72">{loading ? "Opening inbox…" : "Choose a conversation"}</div>
                  <div className="mt-2 text-[12px] leading-6 text-white/30">Customer messages will open here with the complete timeline and reply box. Connected channels stay separated in the channel rail.</div>
                </div>
              </div>
            ) : (
              <>
                <header className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-5 py-4 md:px-6">
                  <div className="min-w-0">
                    <div className="truncate text-[16px] font-semibold text-white/88">{participant(selected)}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[9px] uppercase tracking-[0.15em] text-white/28">
                      <span className="text-amber-200/55">{channelName(selected)}</span>
                      <span>·</span>
                      <span>{selected.external_participant_address || selected.external_participant_id}</span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5 text-[9px] text-white/38">{selected.status || "OPEN"}</div>
                </header>

                <div className="flex-1 space-y-3 overflow-y-auto p-5 md:p-7">
                  {!timeline?.messages?.length ? <div className="py-16 text-center text-[12px] text-white/28">No messages in this conversation yet.</div> : null}
                  {(timeline?.messages || []).map((row) => {
                    const outgoing = row.direction === "OUTBOUND";
                    return (
                      <div key={row.id} className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[84%] rounded-[20px] border px-4 py-3 md:max-w-[68%] ${outgoing ? "border-amber-300/14 bg-amber-300/[0.07]" : "border-white/[0.075] bg-white/[0.038]"}`}>
                          {row.subject ? <div className="mb-1.5 text-[11px] font-medium text-white/65">{row.subject}</div> : null}
                          <div className="whitespace-pre-wrap break-words text-[13px] leading-6 text-white/80">{row.body || ""}</div>
                          <div className="mt-2 flex items-center justify-end gap-2 text-[9px] text-white/26">
                            <span>{dateTime(row.sent_at || row.received_at || row.created_at)}</span>
                            {outgoing ? <span>· {deliveryText(row)}</span> : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-white/[0.07] bg-black/24 p-4 md:p-5">
                  {!canSend ? <div className="mb-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5 text-[11px] text-white/38">Reply delivery is not enabled for this channel yet.</div> : null}
                  {selectedFamily === "email" ? <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" className="mb-2 h-10 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3 text-[12px] text-white outline-none" /> : null}
                  <div className="flex items-end gap-3">
                    <textarea rows={3} value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") sendMessage(); }} disabled={!canSend} placeholder={canSend ? `Reply via ${channelName(selected)}…` : "Reply unavailable"} className="min-h-[76px] flex-1 resize-none rounded-2xl border border-white/[0.08] bg-black/40 p-3 text-[13px] leading-5 text-white outline-none placeholder:text-white/22 focus:border-amber-300/25 disabled:opacity-45" />
                    <button type="button" disabled={!canSend || sending || !message.trim()} onClick={sendMessage} className="h-11 rounded-xl border border-amber-300/30 bg-gradient-to-b from-amber-200 to-amber-500 px-5 text-[12px] font-semibold text-black disabled:opacity-30">{sending ? "Sending…" : "Send"}</button>
                  </div>
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

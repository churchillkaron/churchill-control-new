"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Inbox, Mail, Sparkles, Users, Zap } from "lucide-react";

const CHANNELS = [
  ["all", "All"],
  ["internal", "Internal"],
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

function channelLogoSrc(value) {
  const key = typeof value === "string" ? value.toLowerCase() : family(value);
  const logos = {
    whatsapp: "/icons/whatsapp.png",
    instagram: "/icons/instagram.png",
    line: "/icons/line.png",
    email: "/icons/email.png",
    messenger: "/brand-icons/messenger.svg",
    facebook: "/icons/facebook.png",
    tiktok: "/icons/tiktok.png",
    linkedin: "/brand-icons/linkedin.svg",
    threads: "/brand-icons/threads.svg",
    x: "/brand-icons/x.svg",
    google: "/icons/google.png",
    tripadvisor: "/brand-icons/tripadvisor.svg",
  };
  return logos[key] || null;
}

function BrandLogo({ value, label, size = "md" }) {
  const src = channelLogoSrc(value);
  const box = size === "sm" ? "h-7 w-7 rounded-lg" : "h-10 w-10 rounded-xl";
  if (!src) {
    return <div className={`flex ${box} items-center justify-center bg-[linear-gradient(145deg,#b9864a,#d4ad75)] text-[9px] font-bold text-white`}>{String(label || "CH").slice(0, 2).toUpperCase()}</div>;
  }
  return (
    <div className={`flex ${box} items-center justify-center overflow-hidden border border-white/65 bg-white/90 p-1.5 shadow-sm`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={`${label || value} logo`} className="h-full w-full object-contain" />
    </div>
  );
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

function attachmentUrl(attachment) {
  return attachment?.external_url || attachment?.url || null;
}

function attachmentMime(attachment) {
  return String(attachment?.mime_type || attachment?.type || "").toLowerCase();
}

function attachmentLabel(attachment) {
  return attachment?.file_name || attachment?.name || "Attachment";
}

function messagePreview(message) {
  if (message?.body) return message.body;
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  if (!attachments.length) return null;
  return attachments.length === 1
    ? attachmentLabel(attachments[0])
    : `${attachments.length} attachments`;
}

function AttachmentView({ attachment, compact = false }) {
  const url = attachmentUrl(attachment);
  if (!url) return null;
  const mime = attachmentMime(attachment);
  const label = attachmentLabel(attachment);

  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(url)) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-white/[0.08] bg-black/25">
        {/* Dynamic provider URLs cannot be safely enumerated in next/image remotePatterns. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={label} className={`${compact ? "max-h-32" : "max-h-72"} w-full object-contain`} loading="lazy" />
      </a>
    );
  }

  if (mime.startsWith("video/")) {
    return <video src={url} controls preload="metadata" className={`${compact ? "max-h-32" : "max-h-72"} w-full rounded-xl border border-white/[0.08] bg-black/30`} />;
  }

  if (mime.startsWith("audio/")) {
    return <audio src={url} controls preload="metadata" className="w-full min-w-56" />;
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2.5 text-[11px] text-white/65 hover:border-amber-300/20 hover:text-amber-100">
      <span className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-white/38">File</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </a>
  );
}

export default function CommunicationsWorkspace({ organizationId }) {
  const [snapshot, setSnapshot] = useState({ conversations: [], connections: [] });
  const [selectedId, setSelectedId] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [channel, setChannel] = useState("all");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const initialSyncStarted = useRef(false);
  const fileInputRef = useRef(null);

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
      const syncMessage = syncError?.name === "AbortError"
        ? "Channel sync is taking longer than expected. The inbox remains usable while the provider finishes."
        : syncError?.message || "Channel synchronization failed";
      if (!silent) setError(syncMessage);
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
      const attachmentNames = (row.latestMessage?.attachments || []).map(attachmentLabel).join(" ");
      return [participant(row), row.subject, row.latestMessage?.body, attachmentNames, channelName(row)]
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
    setPendingAttachments([]);
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
  const canAttach = canSend && ["internal", "messenger", "instagram"].includes(selectedFamily);

  async function uploadFiles(files) {
    if (!organizationId || !canAttach || !files?.length) return;
    try {
      setUploading(true);
      setError("");
      const uploaded = [];
      for (const file of Array.from(files).slice(0, Math.max(0, 10 - pendingAttachments.length))) {
        const formData = new FormData();
        formData.set("organizationId", organizationId);
        formData.set("file", file);
        const response = await fetch("/api/commercial/communications/attachments/upload", {
          method: "POST",
          body: formData,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result?.success === false) {
          throw new Error(result?.error || `Unable to upload ${file.name}`);
        }
        uploaded.push(result.attachment);
      }
      setPendingAttachments((current) => [...current, ...uploaded].slice(0, 10));
    } catch (uploadError) {
      setError(uploadError?.message || "Unable to upload attachment");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function sendMessage() {
    const body = message.trim();
    if ((!body && !pendingAttachments.length) || !selectedId || !canSend) return;
    try {
      setSending(true);
      setError("");
      setNotice("");
      const response = await fetch(`/api/commercial/communications/conversations/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          conversationId: selectedId,
          body,
          subject,
          attachments: pendingAttachments,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) throw new Error(result?.error || "Unable to send message");
      setMessage("");
      setPendingAttachments([]);
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
    <div className="min-h-[calc(100vh-80px)] bg-[radial-gradient(circle_at_18%_0%,rgba(214,166,106,0.14),transparent_30%),linear-gradient(180deg,#12100d_0%,#070707_100%)] p-3 text-[#241a12] md:p-5">
      <div className="mx-auto max-w-[1840px]">
        <header className="mb-3 flex flex-col gap-3 text-[#f1dfc7] xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.32em] text-[#d6a66a]/75">AVANTIQO · Commercial</div>
            <h1 className="mt-1 text-[30px] font-light tracking-[-0.05em] md:text-[36px]">Unified Communications</h1>
            <p className="mt-1 text-[11px] text-[#d7c3a9]/55">Real conversations, reputation and approvals in one operating surface.</p>
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

        <div className="grid min-h-[760px] overflow-hidden rounded-[34px] border border-white/55 bg-[linear-gradient(135deg,rgba(255,252,247,0.96),rgba(239,224,203,0.92))] shadow-[0_34px_100px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-3xl xl:grid-cols-[185px_365px_minmax(0,1fr)_330px]">
          <aside className="relative border-b border-[#8c6b42]/14 bg-[linear-gradient(180deg,rgba(255,249,239,0.92),rgba(238,221,197,0.86))] p-3 xl:border-b-0 xl:border-r">
            <div className="px-2 pb-5 pt-2 text-[15px] font-medium tracking-[0.24em] text-[#8f6d43]">AVANTIQO</div>
            <div className="flex gap-2 overflow-x-auto xl:block xl:space-y-1 xl:overflow-visible">
              {CHANNELS.map(([id, label]) => {
                const active = channel === id;
                const isConnected = id === "all" || connectedFamilies.has(id) || Number(counts[id] || 0) > 0;
                return (
                  <button key={id} type="button" onClick={() => { setChannel(id); setQuery(""); setNotice(""); }} className={`flex min-w-[130px] items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition xl:w-full ${active ? "border-[#b9874c]/30 bg-[#ead7bb]/72 text-[#5b4228] shadow-sm" : "border-transparent text-[#806b55] hover:bg-white/48 hover:text-[#4c3825]"}`}>
                    <span className="flex min-w-0 items-center gap-2.5"><span className="shrink-0">{id === "all" ? <Inbox size={17} strokeWidth={1.7} /> : id === "internal" ? <Users size={17} strokeWidth={1.7} /> : <BrandLogo value={id} label={label} size="sm" />}</span><span className="truncate text-[11px] font-medium">{label}</span></span>
                    <span className="flex items-center gap-1.5">
                      {isConnected && id !== "all" ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> : null}
                      {Number(unread[id] || 0) > 0 ? <span className="rounded-full bg-[#a9783e] px-1.5 py-0.5 text-[9px] font-bold text-white">{unread[id]}</span> : Number(counts[id] || 0) > 0 ? <span className="text-[9px] text-[#9a8670]">{counts[id]}</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="border-b border-[#8c6b42]/14 bg-white/22 xl:border-b-0 xl:border-r">
            <div className="border-b border-[#8c6b42]/12 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[26px] font-semibold tracking-[-0.045em] text-[#1f160f]">Unified Inbox</div>
                  <div className="mt-1 text-[10px] text-[#8a735d]">{activeLabel} · {conversations.length} conversations</div>
                </div>
                <div className="text-[10px] text-[#8c765f]">{conversations.length}</div>
              </div>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${activeLabel}`} className="mt-4 h-11 w-full rounded-xl border border-[#8c6b42]/14 bg-white/48 px-4 text-[12px] text-[#2d2118] outline-none placeholder:text-[#9b8874] focus:border-[#b9874c]/35" />
            </div>

            <div className="max-h-[650px] overflow-y-auto p-2">
              {loading ? <div className="p-4 text-[12px] text-[#8f7a65]">Loading inbox…</div> : null}
              {!loading && !conversations.length ? (
                <div className="m-2 rounded-2xl border border-white/[0.06] bg-white/[0.018] p-5">
                  <div className="text-[13px] text-white/65">No {activeLabel === "All" ? "conversations" : `${activeLabel} conversations`} loaded yet.</div>
                  <div className="mt-2 text-[11px] leading-5 text-white/30">Internal threads appear automatically. Use Sync channels to import Messenger and Instagram history from connected Meta accounts.</div>
                </div>
              ) : null}

              {conversations.map((row) => {
                const active = row.id === selectedId;
                return (
                  <button key={row.id} type="button" onClick={() => { setSelectedId(row.id); setNotice(""); setPendingAttachments([]); }} className={`mb-1 w-full rounded-2xl border p-3.5 text-left transition ${active ? "border-[#c99658]/24 bg-[#ead7bb]/58 shadow-[0_8px_18px_rgba(116,78,36,0.07)]" : "border-transparent hover:border-[#8c6b42]/10 hover:bg-white/38"}`}>
                    <div className="flex items-start gap-3">
                      <BrandLogo value={row} label={channelName(row)} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-[#2a1e15]">{participant(row)}</div>
                        <div className="mt-1 text-[9px] uppercase tracking-[0.16em] text-[#a27745]">{channelName(row)}</div>
                      </div>
                      <div className="shrink-0 text-[9px] text-[#9a8874]">{dateTime(row.last_message_at || row.updated_at)}</div>
                    </div>
                    <div className="mt-2 line-clamp-2 text-[11px] leading-5 text-[#7e6c59]">{messagePreview(row.latestMessage) || row.subject || "No message preview"}</div>
                    {Number(row.unread_count || 0) > 0 ? <div className="mt-2 inline-flex min-w-5 items-center justify-center rounded-full bg-[#a9783e] px-1.5 py-0.5 text-[9px] font-bold text-white">{row.unread_count}</div> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <main className="flex min-h-[760px] flex-col bg-[linear-gradient(180deg,rgba(255,255,255,0.36),rgba(255,247,236,0.26))]">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center p-8 text-center">
                <div className="max-w-md">
                  <div className="text-[20px] font-light text-white/72">{loading ? "Opening inbox…" : "Choose a conversation"}</div>
                  <div className="mt-2 text-[12px] leading-6 text-white/30">Internal, Messenger and Instagram messages open here with text, pictures and files preserved in the timeline.</div>
                </div>
              </div>
            ) : (
              <>
                <header className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-5 py-4 md:px-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <BrandLogo value={selected} label={channelName(selected)} />
                    <div className="min-w-0">
                    <div className="truncate text-[16px] font-semibold text-[#251a12]">{participant(selected)}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[9px] uppercase tracking-[0.15em] text-[#8b755f]">
                      <span className="text-[#a27745]">{channelName(selected)}</span>
                      {selectedFamily !== "internal" ? <><span>·</span><span>{selected.external_participant_address || selected.external_participant_id}</span></> : <><span>·</span><span>Team conversation</span></>}
                    </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#8c6b42]/12 bg-white/45 px-2.5 py-1.5 text-[9px] text-[#78634d]">{selected.status || "OPEN"}</div>
                </header>

                <div className="flex-1 space-y-3 overflow-y-auto p-5 md:p-7">
                  {!timeline?.messages?.length ? <div className="py-16 text-center text-[12px] text-white/28">No messages in this conversation yet.</div> : null}
                  {(timeline?.messages || []).map((row) => {
                    const outgoing = row.direction === "OUTBOUND";
                    const attachments = Array.isArray(row.attachments) ? row.attachments : [];
                    const senderName = row?.metadata?.sender?.name;
                    return (
                      <div key={row.id} className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[84%] rounded-[20px] border px-4 py-3 md:max-w-[68%] ${outgoing ? "border-amber-300/14 bg-amber-300/[0.07]" : "border-white/[0.075] bg-white/[0.038]"}`}>
                          {senderName && selectedFamily === "internal" ? <div className="mb-1.5 text-[10px] font-medium text-amber-100/55">{senderName}</div> : null}
                          {row.subject ? <div className="mb-1.5 text-[11px] font-medium text-white/65">{row.subject}</div> : null}
                          {row.body ? <div className="whitespace-pre-wrap break-words text-[13px] leading-6 text-white/80">{row.body}</div> : null}
                          {attachments.length ? (
                            <div className={`${row.body ? "mt-3" : ""} space-y-2`}>
                              {attachments.map((attachment) => <AttachmentView key={attachment.id || `${row.id}-${attachmentUrl(attachment)}`} attachment={attachment} />)}
                            </div>
                          ) : null}
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

                  {pendingAttachments.length ? (
                    <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {pendingAttachments.map((attachment, index) => (
                        <div key={`${attachmentUrl(attachment)}-${index}`} className="relative rounded-xl border border-white/[0.08] bg-white/[0.025] p-2">
                          <AttachmentView attachment={attachment} compact />
                          <button type="button" onClick={() => setPendingAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-1.5 top-1.5 rounded-full border border-white/10 bg-black/80 px-2 py-1 text-[9px] text-white/70">Remove</button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => uploadFiles(event.target.files)} />
                  <div className="flex items-end gap-3">
                    {canAttach ? (
                      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading || sending || pendingAttachments.length >= 10} className="h-11 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-[11px] text-white/58 hover:border-amber-300/20 hover:text-amber-100 disabled:opacity-30">
                        {uploading ? "Uploading…" : "Attach"}
                      </button>
                    ) : null}
                    <textarea rows={3} value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") sendMessage(); }} disabled={!canSend} placeholder={canSend ? `Reply via ${channelName(selected)}…` : "Reply unavailable"} className="min-h-[76px] flex-1 resize-none rounded-2xl border border-white/[0.08] bg-black/40 p-3 text-[13px] leading-5 text-white outline-none placeholder:text-white/22 focus:border-amber-300/25 disabled:opacity-45" />
                    <button type="button" disabled={!canSend || sending || uploading || (!message.trim() && !pendingAttachments.length)} onClick={sendMessage} className="h-11 rounded-xl border border-amber-300/30 bg-gradient-to-b from-amber-200 to-amber-500 px-5 text-[12px] font-semibold text-black disabled:opacity-30">{sending ? "Sending…" : "Send"}</button>
                  </div>
                  {canAttach ? <div className="mt-2 text-[9px] text-white/22">Pictures, video, audio and files up to 25 MB each · maximum 10 attachments</div> : null}
                </div>
              </>
            )}
          </main>

          <aside className="border-t border-[#8c6b42]/14 bg-white/24 p-5 xl:border-l xl:border-t-0">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[24px] font-semibold tracking-[-0.04em] text-[#21170f]">Reputation</h2>
              <span className="rounded-xl border border-[#8c6b42]/12 bg-white/45 px-3 py-2 text-[9px] text-[#745f4a]">Last 30 days</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-[#8c6b42]/12 bg-white/48 p-3 shadow-sm"><div className="text-[27px] font-semibold">4.8</div><div className="mt-1 text-[12px] tracking-[0.08em] text-[#df981f]">★★★★★</div><div className="mt-1 text-[9px] text-emerald-700">+0.3</div></div>
              <div className="rounded-2xl border border-[#8c6b42]/12 bg-white/48 p-3 shadow-sm"><div className="text-[27px] font-semibold">{conversations.length}</div><div className="mt-1 text-[9px] text-[#826e5a]">Conversations</div><div className="mt-1 text-[9px] text-emerald-700">Live</div></div>
            </div>
            <div className="mt-4 flex gap-5 border-b border-[#8c6b42]/12 text-[10px] text-[#816d58]"><button className="border-b-2 border-[#b48449] pb-2 font-semibold text-[#4a3826]">Reviews</button><button className="pb-2">Drafts</button><button className="pb-2">Approved</button></div>
            <div className="mt-3 space-y-2">
              <div className="rounded-2xl border border-[#8c6b42]/10 bg-white/42 p-3"><div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><BrandLogo value="google" label="Google" size="sm" /><span className="text-[11px] font-semibold">Google</span></span><span className="rounded-lg bg-emerald-100 px-2 py-1 text-[8px] text-emerald-700">Replied</span></div><p className="mt-2 text-[10px] leading-4 text-[#806d59]">Excellent service and quick response.</p></div>
              <div className="rounded-2xl border border-[#8c6b42]/10 bg-white/42 p-3"><div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><BrandLogo value="tripadvisor" label="Tripadvisor" size="sm" /><span className="text-[11px] font-semibold">Tripadvisor</span></span><span className="rounded-lg bg-emerald-100 px-2 py-1 text-[8px] text-emerald-700">Approved</span></div><p className="mt-2 text-[10px] leading-4 text-[#806d59]">Beautiful experience and professional team.</p></div>
              <div className="rounded-2xl border border-[#8c6b42]/10 bg-white/42 p-3"><div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><BrandLogo value="email" label="Customer" size="sm" /><span className="text-[11px] font-semibold">Customer</span></span><span className="rounded-lg bg-red-100 px-2 py-1 text-[8px] text-red-700">Escalated</span></div><p className="mt-2 text-[10px] leading-4 text-[#806d59]">Follow-up needed on latest request.</p></div>
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-[#8c6b42]/12 bg-[linear-gradient(135deg,#f8ecd9,#ead6b9)] p-4"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/65 text-[#9c713e]"><Sparkles size={17} /></div><div><div className="text-[11px] font-semibold">AI Assistant</div><div className="mt-0.5 text-[9px] leading-4 text-[#806b56]">Draft replies, detect sentiment, and suggest actions.</div></div></div>
            <button type="button" onClick={() => syncConnectedChannels()} disabled={syncing} className="mt-4 w-full rounded-xl border border-[#8c6b42]/14 bg-white/44 px-3 py-2.5 text-[10px] font-semibold text-[#6f5538] hover:bg-white/65 disabled:opacity-40">{syncing ? "Synchronizing…" : "Sync connected channels"}</button>
          </aside>
        </div>
        <div className="mx-auto -mt-1 flex max-w-[860px] items-center justify-between rounded-b-[22px] border-x border-b border-white/55 bg-[#f1dfc7]/94 px-6 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.8)]">
          <div className="flex items-center gap-2"><Inbox size={18} /><div><div className="text-[10px] font-semibold">Read</div><div className="text-[8px] text-[#8b765f]">Across channels</div></div></div>
          <div className="flex items-center gap-2"><Mail size={18} /><div><div className="text-[10px] font-semibold">Answer</div><div className="text-[8px] text-[#8b765f]">With AI assistance</div></div></div>
          <div className="flex items-center gap-2"><Users size={18} /><div><div className="text-[10px] font-semibold">Route</div><div className="text-[8px] text-[#8b765f]">To the right team</div></div></div>
          <div className="flex items-center gap-2"><Check size={18} /><div><div className="text-[10px] font-semibold">Approve</div><div className="text-[8px] text-[#8b765f]">Keep it on brand</div></div></div>
          <div className="flex items-center gap-2"><Zap size={18} /><div><div className="text-[10px] font-semibold">Act</div><div className="text-[8px] text-[#8b765f]">Turn feedback into growth</div></div></div>
        </div>
      </div>
    </div>
  );
}

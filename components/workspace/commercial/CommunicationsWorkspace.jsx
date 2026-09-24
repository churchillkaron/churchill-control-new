"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Inbox, Mail, UserRound } from "lucide-react";

const CHANNELS = [
  ["all", "All"],
  ["internal", "Internal"],
  ["messenger", "Messenger"],
  ["instagram", "Instagram"],
  ["whatsapp", "WhatsApp"],
  ["line", "LINE"],
  ["telegram", "Telegram"],
  ["sms", "SMS"],
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
  const provider = String(row?.provider || "").toLowerCase();
  if (provider === "email_google") return "Gmail";
  if (provider === "email_microsoft") return "Outlook";
  if (provider === "email_imap") return "Email";
  return row?.channelLabel || row?.label || row?.family || row?.provider || "Channel";
}

function channelLogoSrc(value) {
  const key = typeof value === "string"
    ? value.toLowerCase()
    : String(value?.provider || value?.family || "").toLowerCase();
  const logos = {
    whatsapp: "/brand-icons/whatsapp.svg",
    instagram: "/brand-icons/instagram.svg",
    line: "/brand-icons/line.svg",
    telegram: "/brand-icons/telegram.svg",
    sms: null,
    email: null,
    email_google: "/brand-icons/gmail.svg",
    email_microsoft: "/brand-icons/outlook.svg",
    email_imap: null,
    messenger: "/brand-icons/messenger.svg",
    facebook: "/brand-icons/facebook.svg",
    tiktok: "/brand-icons/tiktok.svg",
    linkedin: "/brand-icons/linkedin.svg",
    threads: "/brand-icons/threads.svg",
    x: "/brand-icons/x.svg",
    google: "/brand-icons/google.svg",
    tripadvisor: "/brand-icons/tripadvisor.svg",
  };
  return logos[key] || null;
}

function channelLogoClass() {
  return "";
}

function BrandLogo({ value, label, size = "md" }) {
  const src = channelLogoSrc(value);
  const key = typeof value === "string"
    ? value.toLowerCase()
    : String(value?.provider || value?.family || "").toLowerCase();
  const emailMark = key === "email" || key === "email_imap";
  const box = size === "sm" ? "h-8 w-8 rounded-xl" : "h-10 w-10 rounded-xl";

  if (emailMark) {
    return (
      <div className={`flex ${box} items-center justify-center bg-transparent text-[#8c6b42]`}>
        <Mail size={size === "sm" ? 24 : 28} strokeWidth={1.7} />
      </div>
    );
  }

  if (!src) {
    return <div className={`flex ${box} items-center justify-center bg-[linear-gradient(145deg,#b9864a,#d4ad75)] text-[9px] font-bold text-[#191919]`}>{String(label || "CH").slice(0, 2).toUpperCase()}</div>;
  }

  return (
    <div className={`flex ${box} items-center justify-center overflow-hidden bg-transparent p-0.5`}>
      <Image
        src={src}
        alt={`${label || value} logo`}
        width={40}
        height={40}
        className={`h-full w-full object-contain ${channelLogoClass(value)}`}
      />
    </div>
  );
}

function participant(row) {
  const explicit = String(row?.external_participant_name || "").trim();
  if (explicit) return explicit;
  const fallback = String(row?.external_participant_address || row?.external_participant_id || "").trim();
  if (!fallback) return "Conversation";
  if (/^\d+$/.test(fallback)) return `${channelName(row)} customer`;
  return fallback;
}

function participantImageUrl(row) {
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return (
    metadata.participant_profile_image_url ||
    metadata.profile_photo_url ||
    metadata.profile_picture_url ||
    metadata.profile_pic ||
    metadata.avatar_url ||
    metadata.photo_url ||
    null
  );
}

function participantInitials(row) {
  const value = String(participant(row) || "").trim();
  if (!value || /^\d+$/.test(value)) return null;
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function OrganizationMark({ brand, size = "sm" }) {
  const box = size === "xs" ? "h-4 w-4" : size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const iconUrl = brand?.logoIconUrl || null;
  const iconText = String(brand?.iconText || "OR").slice(0, 3).toUpperCase();
  const churchill = brand?.iconTone === "churchill";
  return (
    <div className={`flex ${box} shrink-0 items-center justify-center overflow-hidden rounded-full border ${churchill ? "border-[#d79a52]/45 bg-[#d98a2b] text-[#191919]" : "border-[#d6c4ae] bg-[#fffdf9] text-[#765331]"} text-[9px] font-bold tracking-[0.08em] shadow-sm`}>
      {iconUrl ? (
        <>
          {/* Organization icon URLs are organization-configured. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iconUrl} alt={brand?.name || "Organization"} className="h-full w-full object-contain" />
        </>
      ) : iconText}
    </div>
  );
}

function ContactAvatar({ row, size = "md", organizationBrand = null }) {
  const imageUrl = participantImageUrl(row);
  const box = size === "lg" ? "h-12 w-12" : "h-11 w-11";
  const internal = family(row) === "internal";
  const badge = internal ? null : channelLogoSrc(row);

  return (
    <div className={`relative shrink-0 ${box}`}>
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-[#d6c4ae] bg-[linear-gradient(145deg,#f8ecdc,#ead4b5)] text-[11px] font-semibold text-[#765331] shadow-sm">
        {imageUrl ? (
          <>
            {/* Dynamic customer profile URLs cannot be enumerated in next/image remotePatterns. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={participant(row)} className="h-full w-full object-cover" />
          </>
        ) : participantInitials(row) ? participantInitials(row) : <UserRound size={19} strokeWidth={1.6} className="text-[#8b755f]" />}
      </div>
      {internal ? (
        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border-2 border-[#fffdf9] bg-[#fffdf9] shadow-sm">
          <OrganizationMark brand={organizationBrand} size="xs" />
        </span>
      ) : badge ? (
        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#fffdf9] bg-[#fffdf9] shadow-sm">
          <Image src={badge} alt={channelName(row)} width={14} height={14} className={`h-3.5 w-3.5 object-contain ${channelLogoClass(row)}`} />
        </span>
      ) : null}
    </div>
  );
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

function attachmentUrl(attachment, organizationId = null) {
  if (attachment?.id && organizationId) {
    return `/api/commercial/communications/attachments/${encodeURIComponent(attachment.id)}/content?organizationId=${encodeURIComponent(organizationId)}`;
  }
  return attachment?.external_url || attachment?.url || null;
}

function attachmentMime(attachment) {
  const direct = String(attachment?.mime_type || attachment?.type || "").toLowerCase();
  if (direct) return direct;
  const metadata = attachment?.metadata && typeof attachment.metadata === "object" ? attachment.metadata : {};
  const providerType = String(metadata.provider_attachment_type || metadata.provider_type || "").toLowerCase();
  if (["image", "sticker", "photo"].includes(providerType)) return "image/*";
  if (providerType === "video") return "video/*";
  if (["audio", "voice"].includes(providerType)) return "audio/*";
  return "";
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

function AttachmentView({ attachment, compact = false, organizationId = null }) {
  const url = attachmentUrl(attachment, organizationId);
  if (!url) return null;
  const mime = attachmentMime(attachment);
  const label = attachmentLabel(attachment);

  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(url)) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-[#d9c9b6] bg-[#f7f3ed]">
        {/* Dynamic provider URLs cannot be safely enumerated in next/image remotePatterns. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={label} className={`${compact ? "max-h-32" : "max-h-72"} w-full object-contain`} loading="lazy" />
      </a>
    );
  }

  if (mime.startsWith("video/")) {
    return <video src={url} controls preload="metadata" className={`${compact ? "max-h-32" : "max-h-72"} w-full rounded-xl border border-[#d9c9b6] bg-[#f7f3ed]`} />;
  }

  if (mime.startsWith("audio/")) {
    return <audio src={url} controls preload="metadata" className="w-full min-w-56" />;
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-[#d9c9b6] bg-[#fffdf9] px-3 py-2.5 text-[11px] text-[#655747] hover:border-[#d6a66a] hover:text-[#6b4b28]">
      <span className="rounded-lg border border-[#d9c9b6] bg-[#f4f0e8] px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-[#8b7863]">File</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </a>
  );
}

export default function CommunicationsWorkspace({ organizationId }) {
  const [snapshot, setSnapshot] = useState({ conversations: [], connections: [], organizationBrand: null });
  const [selectedId, setSelectedId] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
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
  const syncInFlightRef = useRef(false);
  const fileInputRef = useRef(null);

  const loadInbox = useCallback(async () => {
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
        organizationBrand: result.organizationBrand || null,
      };
      setSnapshot(next);
      setSelectedId((current) => current && next.conversations.some((row) => row.id === current) ? current : next.conversations[0]?.id || null);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load Communications");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  const syncConnectedChannels = useCallback(async ({ silent = false } = {}) => {
    if (!organizationId || syncInFlightRef.current) return;
    syncInFlightRef.current = true;
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
        organizationBrand: result.organizationBrand || null,
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
      syncInFlightRef.current = false;
      setSyncing(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadInbox();
  }, [loadInbox, refresh]);

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

  const visibleChannels = CHANNELS;

  useEffect(() => {
    if (selectedId && conversations.some((row) => row.id === selectedId)) return;
    setSelectedId(conversations[0]?.id || null);
    setTimeline(null);
    setTimelineLoading(Boolean(conversations[0]?.id));
    setMessage("");
    setSubject("");
    setPendingAttachments([]);
  }, [channel, query, conversations, selectedId]);

  useEffect(() => {
    let active = true;
    async function loadTimeline() {
      if (!selectedId || !organizationId) {
        setTimeline(null);
        setTimelineLoading(false);
        return;
      }
      try {
        setTimelineLoading(true);
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
      } finally {
        if (active) setTimelineLoading(false);
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

  const activeLabel = visibleChannels.find(([id]) => id === channel)?.[1] || "All";

  return (
    <div className="min-h-[calc(100vh-80px)] bg-[radial-gradient(circle_at_16%_0%,rgba(214,166,106,0.16),transparent_34%),linear-gradient(180deg,#f7f6f3_0%,#f1ebe2_100%)] p-3 text-[#2d241b] md:p-5">
      <div className="mx-auto max-w-[1840px]">
        <header className="mb-3 flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.32em] text-[#a47742]">AVANTIQO · Commercial</div>
            <h1 className="mt-1 text-[28px] font-light tracking-[-0.05em] md:text-[33px]">Unified Communications</h1>
            <p className="mt-1 text-[11px] text-[#7d6e60]">Every connected conversation in one clear operating surface.</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {notice ? <div className="max-w-[420px] truncate rounded-xl border border-[#dfcfbb] bg-[#fffaf3] px-3 py-2 text-[10px] text-[#7a654f]" title={notice}>{notice}</div> : null}
            <div className="rounded-xl border border-[#d8c9b7] bg-[#fffdf9]/80 px-3 py-2 text-[10px] text-[#756553] shadow-sm">
              {connectedFamilies.size + 1} active channel{connectedFamilies.size + 1 === 1 ? "" : "s"}
            </div>
            <button type="button" onClick={() => syncConnectedChannels()} disabled={syncing} className="h-10 rounded-xl border border-[#c6975d] bg-[#d6a66a] px-4 text-[11px] font-semibold text-[#3f2d1b] shadow-sm transition hover:bg-[#c99a61] disabled:opacity-40">
              {syncing ? "Syncing…" : "Sync channels"}
            </button>
          </div>
        </header>

        {error ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">{error}</div> : null}

        <div className="grid min-h-[760px] overflow-hidden rounded-[30px] border border-[#d8c9b7] bg-[linear-gradient(135deg,rgba(255,253,249,0.98),rgba(244,240,232,0.96))] shadow-[0_24px_70px_rgba(104,78,49,0.13)] xl:grid-cols-[220px_380px_minmax(0,1fr)]">
          <aside className="relative border-b border-[#8c6b42]/14 bg-[linear-gradient(180deg,rgba(255,249,239,0.92),rgba(238,221,197,0.86))] p-3 xl:border-b-0 xl:border-r">
            <div className="px-2 pb-4 pt-2"><div className="flex items-center gap-2"><OrganizationMark brand={snapshot.organizationBrand} /><div className="min-w-0"><div className="truncate text-[10px] font-semibold tracking-[0.08em] text-[#6d5236]">{snapshot.organizationBrand?.name || "Organization"}</div><div className="mt-0.5 text-[8px] uppercase tracking-[0.22em] text-[#9a8268]">Channels</div></div></div></div>
            <div className="flex gap-2 overflow-x-auto xl:block xl:space-y-1 xl:overflow-visible">
              {visibleChannels.map(([id, label]) => {
                const active = channel === id;
                const isConnected = id === "all" || connectedFamilies.has(id) || Number(counts[id] || 0) > 0;
                return (
                  <button key={id} type="button" onClick={() => { setChannel(id); setQuery(""); setNotice(""); }} className={`flex min-w-[130px] items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition xl:w-full ${active ? "border-[#b9874c]/30 bg-[#ead7bb]/72 text-[#5b4228] shadow-sm" : "border-transparent text-[#806b55] hover:bg-white/48 hover:text-[#4c3825]"}`}>
                    <span className="flex min-w-0 items-center gap-2.5"><span className="shrink-0">{id === "all" ? <Inbox size={17} strokeWidth={1.7} /> : id === "internal" ? <OrganizationMark brand={snapshot.organizationBrand} /> : <BrandLogo value={id} label={label} size="sm" />}</span><span className="truncate text-[11px] font-medium">{id === "internal" ? (snapshot.organizationBrand?.name || "Internal") : label}</span></span>
                    <span className="flex items-center gap-1.5">
                      {isConnected && id !== "all" ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> : null}
                      {Number(unread[id] || 0) > 0 ? <span className="rounded-full bg-[#a9783e] px-1.5 py-0.5 text-[9px] font-bold text-[#191919]">{unread[id]}</span> : Number(counts[id] || 0) > 0 ? <span className="text-[9px] text-[#9a8670]">{counts[id]}</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="border-b border-[#8c6b42]/14 bg-white/22 xl:border-b-0 xl:border-r">
            <div className="border-b border-[#8c6b42]/12 p-4">
              <div>
                <div className="text-[26px] font-semibold tracking-[-0.045em] text-[#1f160f]">Unified Inbox</div>
                <div className="mt-1 text-[10px] text-[#8a735d]">{activeLabel} · {conversations.length} conversations</div>
              </div>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${activeLabel}`} className="mt-4 h-11 w-full rounded-xl border border-[#8c6b42]/14 bg-white/48 px-4 text-[12px] text-[#2d2118] outline-none placeholder:text-[#9b8874] focus:border-[#b9874c]/35" />
            </div>

            <div className="max-h-[650px] overflow-y-auto p-2">
              {loading ? <div className="p-4 text-[12px] text-[#8f7a65]">Loading inbox…</div> : null}
              {!loading && !conversations.length ? (
                <div className="m-2 rounded-2xl border border-[#d9c9b6] bg-[#fffdf9]/72 p-5">
                  <div className="text-[13px] text-[#5f5142]">No {activeLabel === "All" ? "conversations" : `${activeLabel} conversations`} loaded yet.</div>
                  <div className="mt-2 text-[11px] leading-5 text-[#8b7965]">Internal threads appear automatically. Use Sync channels to import Messenger and Instagram history from connected Meta accounts.</div>
                </div>
              ) : null}

              {conversations.map((row) => {
                const active = row.id === selectedId;
                return (
                  <button key={row.id} type="button" onClick={() => { setSelectedId(row.id); setNotice(""); setPendingAttachments([]); }} className={`mb-1 w-full rounded-2xl border p-3.5 text-left transition ${active ? "border-[#c99658]/24 bg-[#ead7bb]/58 shadow-[0_8px_18px_rgba(116,78,36,0.07)]" : "border-transparent hover:border-[#8c6b42]/10 hover:bg-white/38"}`}>
                    <div className="flex items-start gap-3">
                      <ContactAvatar row={row} organizationBrand={snapshot.organizationBrand} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-[#2a1e15]">{participant(row)}</div>
                        <div className="mt-1 text-[9px] uppercase tracking-[0.16em] text-[#a27745]">{channelName(row)}</div>
                      </div>
                      <div className="shrink-0 text-[9px] text-[#9a8874]">{dateTime(row.last_message_at || row.updated_at)}</div>
                    </div>
                    <div className="mt-2 line-clamp-2 text-[11px] leading-5 text-[#7e6c59]">{messagePreview(row.latestMessage) || row.subject || "No message preview"}</div>
                    {Number(row.unread_count || 0) > 0 ? <div className="mt-2 inline-flex min-w-5 items-center justify-center rounded-full bg-[#a9783e] px-1.5 py-0.5 text-[9px] font-bold text-[#191919]">{row.unread_count}</div> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <main className="flex min-h-[760px] flex-col bg-[linear-gradient(180deg,rgba(255,255,255,0.36),rgba(255,247,236,0.26))]">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center p-8 text-center">
                <div className="max-w-md">
                  <div className="text-[20px] font-light text-[#504335]">{loading ? "Opening inbox…" : "Choose a conversation"}</div>
                  <div className="mt-2 text-[12px] leading-6 text-[#8b7965]">Internal, Messenger and Instagram messages open here with text, pictures and files preserved in the timeline.</div>
                </div>
              </div>
            ) : (
              <>
                <header className="flex items-center justify-between gap-4 border-b border-[#d9c9b6] bg-[#fffdf9]/55 px-5 py-3 md:px-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <ContactAvatar row={selected} size="lg" organizationBrand={snapshot.organizationBrand} />
                    <div className="min-w-0">
                    <div className="truncate text-[16px] font-semibold text-[#251a12]">{participant(selected)}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[9px] uppercase tracking-[0.15em] text-[#8b755f]">
                      <span className="text-[#a27745]">{channelName(selected)}</span>
                      {selectedFamily !== "internal" ? <><span>·</span><span>{/^\d+$/.test(String(selected.external_participant_address || selected.external_participant_id || "")) ? "Customer contact" : (selected.external_participant_address || selected.external_participant_id)}</span></> : <><span>·</span><span>Team conversation</span></>}
                    </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#8c6b42]/12 bg-white/45 px-2.5 py-1.5 text-[9px] text-[#78634d]">{selected.status || "OPEN"}</div>
                </header>

                <div className="flex-1 space-y-3 overflow-y-auto p-5 md:p-7">
                  {timelineLoading ? <div className="py-16 text-center text-[12px] text-[#927f6b]">Loading conversation…</div> : null}
                  {!timelineLoading && timeline && !timeline.messages?.length ? <div className="py-16 text-center text-[12px] text-[#927f6b]">No messages in this conversation yet.</div> : null}
                  {!timelineLoading && (timeline?.messages || []).map((row) => {
                    const outgoing = row.direction === "OUTBOUND";
                    const attachments = Array.isArray(row.attachments) ? row.attachments : [];
                    const senderName = row?.metadata?.sender?.name;
                    return (
                      <div key={row.id} className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[84%] border px-4 py-3 md:max-w-[68%] ${outgoing ? "rounded-[20px] rounded-br-md border-[#c99658]/45 bg-[#ead2ad]" : "rounded-[20px] rounded-bl-md border-[#d9c9b6] bg-[#fffdf9]"}`}>
                          {senderName && selectedFamily === "internal" ? <div className="mb-1.5 text-[10px] font-medium text-[#9a7041]">{senderName}</div> : null}
                          {row.subject ? <div className="mb-1.5 text-[11px] font-medium text-[#5e4f40]">{row.subject}</div> : null}
                          {row.body ? <div className="whitespace-pre-wrap break-words text-[13px] leading-6 text-[#3f352b]">{row.body}</div> : null}
                          {attachments.length ? (
                            <div className={`${row.body ? "mt-3" : ""} space-y-2`}>
                              {attachments.map((attachment) => <AttachmentView key={attachment.id || `${row.id}-${attachmentUrl(attachment)}`} attachment={attachment} organizationId={organizationId} />)}
                            </div>
                          ) : null}
                          <div className="mt-2 flex items-center justify-end gap-2 text-[9px] text-[#97836e]">
                            <span>{dateTime(row.sent_at || row.received_at || row.created_at)}</span>
                            {outgoing ? <span>· {deliveryText(row)}</span> : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-[#d9c9b6] bg-[#f4f0e8]/90 p-4 md:p-5">
                  {!canSend ? <div className="mb-3 rounded-xl border border-[#d9c9b6] bg-[#fffdf9] px-3 py-2.5 text-[11px] text-[#806e5a]">Reply delivery is not enabled for this channel yet.</div> : null}
                  {selectedFamily === "email" ? <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" className="mb-2 h-10 w-full rounded-xl border border-[#d9c9b6] bg-[#fffdf9] px-3 text-[12px] text-[#3f352b] outline-none placeholder:text-[#a08c77] focus:border-[#c99a61]" /> : null}

                  {pendingAttachments.length ? (
                    <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {pendingAttachments.map((attachment, index) => (
                        <div key={`${attachmentUrl(attachment)}-${index}`} className="relative rounded-xl border border-[#d9c9b6] bg-[#fffdf9] p-2">
                          <AttachmentView attachment={attachment} compact organizationId={organizationId} />
                          <button type="button" onClick={() => setPendingAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-1.5 top-1.5 rounded-full border border-[#d6c4ae] bg-[#f4f0e8] px-2 py-1 text-[9px] text-[#6c5b49]">Remove</button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => uploadFiles(event.target.files)} />
                  <div className="flex items-end gap-3">
                    {canAttach ? (
                      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading || sending || pendingAttachments.length >= 10} className="h-11 rounded-xl border border-[#d6c4ae] bg-[#fffdf9] px-3 text-[11px] text-[#6c5b49] hover:border-[#c99a61] hover:text-[#6b4b28] disabled:opacity-30">
                        {uploading ? "Uploading…" : "Attach"}
                      </button>
                    ) : null}
                    <textarea rows={3} value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") sendMessage(); }} disabled={!canSend} placeholder={canSend ? `Reply via ${channelName(selected)}…` : "Reply unavailable"} className="min-h-[76px] flex-1 resize-none rounded-2xl border border-[#d6c4ae] bg-[#fffdf9] p-3 text-[13px] leading-5 text-[#3f352b] outline-none placeholder:text-[#a08c77] focus:border-[#c99a61] disabled:opacity-45" />
                    <button type="button" disabled={!canSend || sending || uploading || (!message.trim() && !pendingAttachments.length)} onClick={sendMessage} className="h-11 rounded-xl border border-[#c6975d] bg-[#d6a66a] px-5 text-[12px] font-semibold text-[#3f2d1b] shadow-sm transition hover:bg-[#c99a61] disabled:opacity-30">{sending ? "Sending…" : "Send"}</button>
                  </div>
                  {canAttach ? <div className="mt-2 text-[9px] text-[#95816c]">Pictures, video, audio and files up to 25 MB each · maximum 10 attachments</div> : null}
                </div>
              </>
            )}
          </main>

        </div>
      </div>
    </div>
  );
}

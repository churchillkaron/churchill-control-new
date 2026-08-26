"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  Mic,
  RefreshCw,
  Square,
  UserRound,
  Users,
  X,
} from "lucide-react";

const CHUNK_DURATION_MS = 25000;

function text(value) {
  return String(value ?? "").trim();
}

function preferredAudioMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return "";
}

function fileExtension(mimeType) {
  return String(mimeType || "").includes("mp4") ? "m4a" : "webm";
}

function formatElapsed(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function uniqueParticipantKey(participant) {
  return participant.party_id || participant.local_id || participant.display_name;
}

export default function SecretaryMeetingPresence({
  organizationId,
  entityId = null,
  contextLabel = "Avantiqo",
  disabled = false,
  onCaptureStateChange = null,
} = {}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [staffQuery, setStaffQuery] = useState("");
  const [staffResults, setStaffResults] = useState([]);
  const [guestName, setGuestName] = useState("");
  const [meetingData, setMeetingData] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [queueSize, setQueueSize] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [error, setError] = useState("");
  const [mappingSpeaker, setMappingSpeaker] = useState("");
  const [mappingParticipant, setMappingParticipant] = useState("");

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunkTimerRef = useRef(null);
  const chunkNumberRef = useRef(0);
  const captureStartedAtRef = useRef(0);
  const capturingRef = useRef(false);
  const meetingRef = useRef(null);
  const uploadQueueRef = useRef([]);
  const uploadingRef = useRef(false);
  const uploadErrorRef = useRef("");
  const stopResolveRef = useRef(null);

  const meeting = meetingData?.meeting || null;
  const segments = Array.isArray(meetingData?.segments) ? meetingData.segments : [];
  const meetingParticipants = Array.isArray(meetingData?.participants)
    ? meetingData.participants
    : [];
  const actionItems = Array.isArray(meetingData?.action_items) ? meetingData.action_items : [];

  const unknownSpeakers = useMemo(() => {
    const knownKeys = new Set(meetingParticipants.map((row) => text(row.speaker_key)).filter(Boolean));
    const seen = new Set();
    const values = [];
    for (const segment of segments) {
      const metadata = segment?.metadata && typeof segment.metadata === "object" ? segment.metadata : {};
      const key = text(metadata.provider_speaker_label);
      if (!key || knownKeys.has(key) || seen.has(key) || metadata.speaker_identity_verified === true) continue;
      seen.add(key);
      values.push(key);
    }
    return values;
  }, [meetingParticipants, segments]);

  useEffect(() => {
    if (!capturing) return undefined;
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - captureStartedAtRef.current);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [capturing]);

  useEffect(() => {
    if (!capturing) return undefined;
    const handler = (event) => {
      event.preventDefault();
      event.returnValue = "Avantiqo Secretary is attending this meeting. End the meeting before closing this page.";
      return event.returnValue;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [capturing]);

  useEffect(() => {
    if (!open || capturing || !organizationId) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/staff/search?query=${encodeURIComponent(staffQuery)}`, {
          credentials: "same-origin",
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({}));
        if (response.ok && result?.success !== false) setStaffResults(result.staff || []);
      } catch (searchError) {
        if (searchError?.name !== "AbortError") setStaffResults([]);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, capturing, organizationId, staffQuery]);

  useEffect(() => () => {
    capturingRef.current = false;
    if (chunkTimerRef.current) window.clearTimeout(chunkTimerRef.current);
    try {
      if (recorderRef.current?.state && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    } catch {
      // Best effort only during unmount.
    }
    for (const track of streamRef.current?.getTracks?.() || []) track.stop();
  }, []);

  function notifyCaptureState(active) {
    onCaptureStateChange?.(active);
  }

  function releaseStream() {
    for (const track of streamRef.current?.getTracks?.() || []) track.stop();
    streamRef.current = null;
  }

  async function refreshMeeting(meetingId = meetingRef.current?.id) {
    if (!meetingId || !organizationId) return null;
    const response = await fetch(
      `/api/secretary/meetings?organization_id=${encodeURIComponent(organizationId)}&meeting_id=${encodeURIComponent(meetingId)}`,
      { credentials: "same-origin", cache: "no-store" },
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.success === false) {
      throw new Error(result?.error || "Unable to refresh Secretary meeting");
    }
    setMeetingData(result);
    return result;
  }

  async function uploadChunk(item) {
    const currentMeeting = meetingRef.current;
    if (!currentMeeting?.id) throw new Error("Secretary meeting is not active");
    const form = new FormData();
    form.append("organization_id", organizationId);
    if (entityId) form.append("entity_id", entityId);
    form.append("meeting_id", currentMeeting.id);
    form.append("chunk_number", String(item.number));
    form.append("chunk_started_offset_ms", String(item.startedOffsetMs));
    form.append("mime_type", item.blob.type || "audio/webm");
    form.append("file_name", `secretary-meeting-${currentMeeting.id}-${item.number}.${fileExtension(item.blob.type)}`);
    if (typeof navigator !== "undefined" && navigator.language) form.append("language", navigator.language);
    form.append("audio", item.blob, `meeting-${item.number}.${fileExtension(item.blob.type)}`);

    const response = await fetch("/api/secretary/meetings/audio", {
      method: "POST",
      credentials: "same-origin",
      body: form,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.success === false) {
      throw new Error(result?.error || `Meeting audio chunk ${item.number} failed`);
    }
    await refreshMeeting(currentMeeting.id);
    return result;
  }

  async function drainUploadQueue() {
    if (uploadingRef.current) return;
    uploadingRef.current = true;
    setUploading(true);
    try {
      while (uploadQueueRef.current.length) {
        const item = uploadQueueRef.current[0];
        try {
          await uploadChunk(item);
          uploadQueueRef.current.shift();
          uploadErrorRef.current = "";
          setUploadError("");
          setQueueSize(uploadQueueRef.current.length);
        } catch (chunkError) {
          const message = chunkError?.message || "Meeting audio upload failed";
          uploadErrorRef.current = message;
          setUploadError(message);
          break;
        }
      }
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  }

  function enqueueChunk(item) {
    if (!item?.blob?.size) return;
    uploadQueueRef.current.push(item);
    setQueueSize(uploadQueueRef.current.length);
    drainUploadQueue();
  }

  function startRecorderChunk() {
    if (!capturingRef.current || !streamRef.current) return;
    const mimeType = preferredAudioMimeType();
    const recorder = mimeType
      ? new MediaRecorder(streamRef.current, { mimeType })
      : new MediaRecorder(streamRef.current);
    const chunks = [];
    const number = ++chunkNumberRef.current;
    const startedOffsetMs = Math.max(0, Date.now() - captureStartedAtRef.current);

    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      setError("Meeting microphone recording failed. End the meeting or restart capture before continuing.");
    };
    recorder.onstop = () => {
      if (chunkTimerRef.current) {
        window.clearTimeout(chunkTimerRef.current);
        chunkTimerRef.current = null;
      }
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      enqueueChunk({ number, startedOffsetMs, blob });
      stopResolveRef.current?.();
      stopResolveRef.current = null;
      if (capturingRef.current) window.setTimeout(startRecorderChunk, 50);
    };

    recorder.start();
    chunkTimerRef.current = window.setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, CHUNK_DURATION_MS);
  }

  function addStaffParticipant(staff) {
    if (!staff?.party_id || !text(staff.name)) return;
    setParticipants((current) => {
      if (current.some((row) => row.party_id === staff.party_id)) return current;
      return [
        ...current,
        {
          party_id: staff.party_id,
          display_name: staff.name,
          participant_role: staff.role || null,
          source: "STAFF_DIRECTORY",
        },
      ];
    });
  }

  function addGuestParticipant() {
    const name = text(guestName);
    if (!name) return;
    setParticipants((current) => [
      ...current,
      {
        local_id: crypto.randomUUID(),
        party_id: null,
        display_name: name,
        participant_role: "Guest",
        source: "MANUAL_GUEST",
      },
    ]);
    setGuestName("");
  }

  function removeParticipant(key) {
    setParticipants((current) => current.filter((row) => uniqueParticipantKey(row) !== key));
  }

  async function startMeeting() {
    if (disabled || starting || capturing) return;
    if (!text(title)) {
      setError("Enter a meeting title.");
      return;
    }
    if (!authorized) {
      setError("Confirm that meeting capture is authorized before Secretary can attend.");
      return;
    }

    setStarting(true);
    setError("");
    setUploadError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error("This browser does not support meeting audio capture.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const response = await fetch("/api/secretary/meetings", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "START",
          organization_id: organizationId,
          entity_id: entityId,
          title: text(title),
          timezone,
          primary_language: navigator.language || null,
          capture_authorized: true,
          participants: participants.map((row) => ({
            party_id: row.party_id || null,
            display_name: row.display_name,
            participant_role: row.participant_role || null,
            metadata: { participant_source: row.source || "MEETING_ROOM" },
          })),
          metadata: {
            capture_surface: "AVANTIQO_SECRETARY_MEETING_PRESENCE",
            raw_audio_persisted: false,
          },
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false || !result?.meeting?.id) {
        throw new Error(result?.error || "Unable to start Secretary meeting");
      }

      meetingRef.current = result.meeting;
      setMeetingData({ ...result, participants: [], segments: [], action_items: [] });
      uploadQueueRef.current = [];
      chunkNumberRef.current = 0;
      captureStartedAtRef.current = Date.now();
      capturingRef.current = true;
      setElapsedMs(0);
      setCapturing(true);
      notifyCaptureState(true);
      startRecorderChunk();
      await refreshMeeting(result.meeting.id);
    } catch (startError) {
      releaseStream();
      const message = startError?.message || "Unable to start meeting capture";
      setError(message);
    } finally {
      setStarting(false);
    }
  }

  async function stopRecorderAndWait() {
    if (chunkTimerRef.current) {
      window.clearTimeout(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    await new Promise((resolve) => {
      stopResolveRef.current = resolve;
      recorder.stop();
      window.setTimeout(resolve, 3000);
    });
  }

  async function waitForUploads() {
    await drainUploadQueue();
    const deadline = Date.now() + 120000;
    while ((uploadingRef.current || uploadQueueRef.current.length) && Date.now() < deadline) {
      if (uploadErrorRef.current) throw new Error(uploadErrorRef.current);
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
    if (uploadErrorRef.current) throw new Error(uploadErrorRef.current);
    if (uploadQueueRef.current.length) throw new Error("Meeting audio uploads did not finish. Retry before finalizing.");
  }

  async function endMeeting() {
    if (!capturingRef.current || finalizing) return;
    setFinalizing(true);
    setError("");
    capturingRef.current = false;
    setCapturing(false);
    try {
      await stopRecorderAndWait();
      releaseStream();
      await waitForUploads();

      const currentMeeting = meetingRef.current;
      const response = await fetch("/api/secretary/meetings", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "FINALIZE",
          organization_id: organizationId,
          entity_id: entityId,
          meeting_id: currentMeeting?.id,
          ended_at: new Date().toISOString(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || "Unable to finalize Secretary meeting");
      }
      setMeetingData(result);
      meetingRef.current = result.meeting || currentMeeting;
      notifyCaptureState(false);
    } catch (endError) {
      const message = endError?.message || "Unable to finish Secretary meeting";
      setError(message);
      if (meetingRef.current?.status === "CAPTURING" && streamRef.current) {
        capturingRef.current = true;
        setCapturing(true);
        startRecorderChunk();
      } else {
        notifyCaptureState(false);
      }
    } finally {
      setFinalizing(false);
    }
  }

  async function retryUploads() {
    setUploadError("");
    uploadErrorRef.current = "";
    setError("");
    await drainUploadQueue();
  }

  async function mapSpeaker() {
    if (!mappingSpeaker || !mappingParticipant || !meetingRef.current?.id) return;
    setError("");
    try {
      const response = await fetch("/api/secretary/meetings", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "MAP_SPEAKER",
          organization_id: organizationId,
          entity_id: entityId,
          meeting_id: meetingRef.current.id,
          speaker_key: mappingSpeaker,
          participant_id: mappingParticipant,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) throw new Error(result?.error || "Unable to map speaker");
      setMappingSpeaker("");
      setMappingParticipant("");
      await refreshMeeting();
    } catch (mapError) {
      setError(mapError?.message || "Unable to map meeting speaker");
    }
  }

  const isCompleted = meeting?.status === "COMPLETED";
  const pillLabel = capturing
    ? `Secretary attending · ${formatElapsed(elapsedMs)}`
    : isCompleted
      ? "Meeting protocol ready"
      : "Secretary Meeting";

  if (!organizationId) return null;

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled && !capturing}
          className={
            capturing
              ? "fixed bottom-6 left-6 z-[90] flex h-12 items-center gap-3 rounded-full border border-red-300/25 bg-[#120909]/95 px-4 text-red-100 shadow-[0_20px_70px_rgba(0,0,0,.7)] backdrop-blur-2xl"
              : "fixed bottom-6 left-6 z-[90] flex h-12 items-center gap-3 rounded-full border border-[#D6A66A]/25 bg-[#090909]/95 px-4 text-white/75 shadow-[0_20px_70px_rgba(0,0,0,.65)] backdrop-blur-2xl transition hover:border-[#D6A66A]/50 disabled:opacity-35"
          }
        >
          <Mic size={14} className={capturing ? "text-red-300" : "text-[#D6A66A]"} />
          <span className="text-[10px] font-medium uppercase tracking-[0.14em]">{pillLabel}</span>
        </button>
      ) : null}

      {open ? (
        <section className="fixed inset-5 z-[120] mx-auto flex max-w-6xl flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#070707]/98 text-white shadow-[0_35px_130px_rgba(0,0,0,.92)] backdrop-blur-3xl">
          <header className="flex items-start justify-between gap-5 border-b border-white/[0.07] px-6 py-5">
            <div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-[#D6A66A]">
                <Mic size={13} />
                Avantiqo Executive Secretary · Meeting Presence
              </div>
              <div className="mt-2 text-[13px] text-white/45">{contextLabel}</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={capturing || finalizing}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.025] text-white/55 hover:text-white disabled:opacity-25"
              aria-label="Close meeting panel"
            >
              <X size={16} />
            </button>
          </header>

          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="overflow-y-auto border-b border-white/[0.07] p-5 lg:border-b-0 lg:border-r">
              {!meeting ? (
                <div className="space-y-5">
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.16em] text-white/35">Meeting title</label>
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Weekly management meeting"
                      className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#D6A66A]/40"
                    />
                  </div>

                  <div>
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-white/35">
                      <Users size={12} /> Participants
                    </div>
                    <input
                      value={staffQuery}
                      onChange={(event) => setStaffQuery(event.target.value)}
                      placeholder="Find staff..."
                      className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[12px] text-white outline-none focus:border-[#D6A66A]/40"
                    />
                    <div className="mt-2 max-h-36 space-y-1 overflow-y-auto">
                      {staffResults.slice(0, 12).map((staff) => (
                        <button
                          key={staff.id}
                          type="button"
                          onClick={() => addStaffParticipant(staff)}
                          className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[11px] text-white/65 hover:bg-white/[0.05]"
                        >
                          <span>{staff.name}</span>
                          <span className="text-white/25">{staff.role || "Staff"}</span>
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input
                        value={guestName}
                        onChange={(event) => setGuestName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addGuestParticipant();
                          }
                        }}
                        placeholder="Add guest name"
                        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white outline-none"
                      />
                      <button type="button" onClick={addGuestParticipant} className="rounded-xl border border-white/10 px-3 text-[10px] text-white/55 hover:text-white">Add</button>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {participants.map((participant) => (
                        <div key={uniqueParticipantKey(participant)} className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2">
                          <div className="min-w-0">
                            <div className="truncate text-[11px] text-white/75">{participant.display_name}</div>
                            <div className="text-[9px] uppercase tracking-[0.1em] text-white/25">{participant.participant_role || "Participant"}</div>
                          </div>
                          <button type="button" onClick={() => removeParticipant(uniqueParticipantKey(participant))} className="text-white/25 hover:text-white"><X size={13} /></button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#D6A66A]/15 bg-[#D6A66A]/[0.05] p-4">
                    <input
                      type="checkbox"
                      checked={authorized}
                      onChange={(event) => setAuthorized(event.target.checked)}
                      className="mt-0.5"
                    />
                    <span className="text-[11px] font-light leading-5 text-white/60">
                      I confirm that meeting capture is authorized and participants have been informed as required by our policy and applicable law.
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={startMeeting}
                    disabled={disabled || starting || !authorized || !text(title)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#D6A66A] px-4 py-3 text-[11px] font-medium uppercase tracking-[0.12em] text-black hover:bg-[#E7C48E] disabled:opacity-30"
                  >
                    {starting ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />}
                    Secretary Attend Meeting
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-white/30">Meeting</div>
                    <div className="mt-2 text-[15px] font-light text-white/85">{meeting.title}</div>
                    <div className="mt-3 flex items-center gap-2 text-[11px] text-white/40">
                      <Clock3 size={13} />
                      {capturing ? formatElapsed(elapsedMs) : meeting.status}
                    </div>
                  </div>

                  {capturing ? (
                    <div className="rounded-2xl border border-red-300/15 bg-red-300/[0.04] p-4">
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-red-200/70">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-red-300" /> Secretary is attending
                      </div>
                      <div className="mt-2 text-[10px] leading-5 text-white/35">
                        Audio is processed in temporary 25-second chunks. Raw meeting audio is not stored by this recorder.
                      </div>
                      <div className="mt-3 text-[10px] text-white/35">
                        {uploading ? "Transcribing..." : queueSize ? `${queueSize} chunk(s) queued` : "Transcript current"}
                      </div>
                    </div>
                  ) : null}

                  {unknownSpeakers.length && capturing ? (
                    <div className="rounded-2xl border border-[#D6A66A]/15 bg-[#D6A66A]/[0.04] p-4">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-[#D6A66A]">Identify a speaker</div>
                      <div className="mt-2 text-[10px] leading-4 text-white/35">Only map a voice when you know who it is. Secretary will never guess.</div>
                      <select value={mappingSpeaker} onChange={(event) => setMappingSpeaker(event.target.value)} className="mt-3 w-full rounded-lg border border-white/10 bg-[#0A0A0A] px-2 py-2 text-[11px] text-white/70">
                        <option value="">Unknown speaker...</option>
                        {unknownSpeakers.map((speaker) => <option key={speaker} value={speaker}>{speaker}</option>)}
                      </select>
                      <select value={mappingParticipant} onChange={(event) => setMappingParticipant(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#0A0A0A] px-2 py-2 text-[11px] text-white/70">
                        <option value="">Participant...</option>
                        {meetingParticipants.map((participant) => <option key={participant.id} value={participant.id}>{participant.display_name}</option>)}
                      </select>
                      <button type="button" onClick={mapSpeaker} disabled={!mappingSpeaker || !mappingParticipant} className="mt-2 w-full rounded-lg border border-[#D6A66A]/20 px-3 py-2 text-[10px] uppercase tracking-[0.1em] text-[#F0D29A] disabled:opacity-30">Confirm speaker identity</button>
                    </div>
                  ) : null}

                  {uploadError ? (
                    <button type="button" onClick={retryUploads} className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-400/20 bg-red-400/[0.05] px-3 py-2 text-[10px] text-red-200/80">
                      <RefreshCw size={12} /> Retry failed audio upload
                    </button>
                  ) : null}

                  {capturing ? (
                    <button
                      type="button"
                      onClick={endMeeting}
                      disabled={finalizing}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-300/25 bg-red-300/[0.06] px-4 py-3 text-[11px] uppercase tracking-[0.12em] text-red-100 disabled:opacity-30"
                    >
                      {finalizing ? <Loader2 size={14} className="animate-spin" /> : <Square size={13} />}
                      End Meeting & Create Protocol
                    </button>
                  ) : null}

                  {isCompleted ? (
                    <button type="button" onClick={() => { setMeetingData(null); meetingRef.current = null; setTitle(""); setAuthorized(false); setParticipants([]); }} className="w-full rounded-xl border border-white/10 px-4 py-2.5 text-[10px] uppercase tracking-[0.12em] text-white/45 hover:text-white">New meeting</button>
                  ) : null}
                </div>
              )}
            </aside>

            <main className="min-h-0 overflow-y-auto p-5 lg:p-6">
              {!meeting ? (
                <div className="flex min-h-full items-center justify-center">
                  <div className="max-w-lg text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#D6A66A]/20 bg-[#D6A66A]/[0.05] text-[#D6A66A]"><UserRound size={22} /></div>
                    <div className="mt-5 text-[19px] font-light text-white/85">Secretary can sit in the room with your team.</div>
                    <div className="mt-3 text-[12px] font-light leading-6 text-white/35">She listens only after explicit capture authorization, keeps a live transcript, identifies decisions and assignments, creates the meeting protocol, assigns staff work and starts her own governed jobs.</div>
                  </div>
                </div>
              ) : isCompleted ? (
                <div className="space-y-5">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-emerald-200/70"><CheckCircle2 size={14} /> Meeting protocol complete</div>
                  <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-[#D6A66A]">Executive summary</div>
                    <div className="mt-3 whitespace-pre-wrap text-[13px] font-light leading-6 text-white/70">{meeting.executive_summary || "No executive summary recorded."}</div>
                  </section>
                  <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-[#D6A66A]"><FileText size={13} /> Protocol</div>
                    <div className="mt-3 whitespace-pre-wrap text-[12px] font-light leading-6 text-white/60">{meeting.protocol || "No protocol recorded."}</div>
                  </section>
                  {Array.isArray(meeting.decisions) && meeting.decisions.length ? (
                    <section>
                      <div className="text-[10px] uppercase tracking-[0.14em] text-white/35">Decisions</div>
                      <div className="mt-2 space-y-2">{meeting.decisions.map((decision, index) => <div key={index} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[12px] text-white/60">{typeof decision === "string" ? decision : JSON.stringify(decision)}</div>)}</div>
                    </section>
                  ) : null}
                  <section>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-white/35">Action items · {actionItems.length}</div>
                    <div className="mt-2 space-y-2">
                      {actionItems.map((item) => (
                        <div key={item.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
                          <div className="text-[12px] text-white/70">{item.title}</div>
                          <div className="mt-1 text-[10px] uppercase tracking-[0.1em] text-white/25">{item.owner_kind}{item.job_id ? " · Secretary job started" : ""}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-[#D6A66A]">Live meeting transcript</div>
                      <div className="mt-1 text-[10px] text-white/25">{segments.length} evidence segment(s)</div>
                    </div>
                    <button type="button" onClick={() => refreshMeeting().catch((refreshError) => setError(refreshError?.message || "Refresh failed"))} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-[10px] text-white/40 hover:text-white"><RefreshCw size={12} /> Refresh</button>
                  </div>
                  <div className="mt-5 space-y-3">
                    {segments.length ? segments.map((segment) => (
                      <div key={segment.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
                        <div className="text-[10px] uppercase tracking-[0.1em] text-[#D6A66A]/70">{segment.speaker_label || "Unknown speaker"} · #{segment.sequence_number}</div>
                        <div className="mt-2 text-[12px] font-light leading-6 text-white/65">{segment.transcript}</div>
                      </div>
                    )) : <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-[12px] text-white/25">Listening for the first spoken segment...</div>}
                  </div>
                </div>
              )}
            </main>
          </div>

          {error ? (
            <div className="border-t border-red-500/15 bg-red-500/[0.05] px-6 py-3 text-[11px] text-red-200/75">{error}</div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

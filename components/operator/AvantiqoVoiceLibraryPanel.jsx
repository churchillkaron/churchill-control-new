"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  Loader2,
  Mic,
  Pause,
  Play,
  ShieldCheck,
  Square,
  Star,
  Trash2,
} from "lucide-react";

const DELIVERY_PROFILES = [
  { id: "avantiqo-secretary-v1", label: "Secretary", description: "Professional · conversational" },
  { id: "avantiqo-executive-v1", label: "Executive", description: "Calm · authoritative" },
  { id: "avantiqo-warm-v1", label: "Warm", description: "Human · welcoming" },
  { id: "avantiqo-neutral-v1", label: "Neutral", description: "Clear · balanced" },
];

const CONSENT_BASES = [
  { id: "SELF", label: "My own voice" },
  { id: "AUTHORIZED", label: "Authorized voice" },
  { id: "LICENSED", label: "Licensed voice" },
];

const MIN_REFERENCE_SECONDS = 3;
const TARGET_REFERENCE_SECONDS = 15;

function text(value) {
  return String(value ?? "").trim();
}

function preferredAudioMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ]) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return "";
}

function recordedFileName(mimeType) {
  return String(mimeType || "").includes("mp4")
    ? "voice-reference.m4a"
    : "voice-reference.webm";
}

function deliveryLabel(id) {
  return DELIVERY_PROFILES.find((profile) => profile.id === id)?.label || "Secretary";
}

export default function AvantiqoVoiceLibraryPanel({
  organizationId,
  entityId = null,
  onClose,
}) {
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const hardStopRef = useRef(null);
  const previewAudioRef = useRef(null);
  const recordingUrlRef = useRef("");

  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [error, setError] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [defaultProfileId, setDefaultProfileId] = useState(null);
  const [playingProfileId, setPlayingProfileId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const [name, setName] = useState("");
  const [deliveryProfile, setDeliveryProfile] = useState("avantiqo-secretary-v1");
  const [consentBasis, setConsentBasis] = useState("SELF");
  const [consentEvidenceId, setConsentEvidenceId] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingBlob, setRecordingBlob] = useState(null);
  const [recordingUrl, setRecordingUrl] = useState("");
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  useEffect(() => {
    loadLibrary();
    return () => {
      if (hardStopRef.current) {
        window.clearTimeout(hardStopRef.current);
        hardStopRef.current = null;
      }
      stopRecorderForCleanup();
      releaseRecordingStream();
      releaseRecordingUrl();
      const previewAudio = previewAudioRef.current;
      previewAudioRef.current = null;
      if (previewAudio) {
        previewAudio.onended = null;
        previewAudio.onerror = null;
        previewAudio.pause?.();
        previewAudio.src = "";
      }
    };
  }, [organizationId, entityId]);

  async function loadLibrary() {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        organizationId,
        preview: "true",
      });
      if (entityId) params.set("entityId", entityId);
      const response = await fetch(`/api/operator/voice-library?${params.toString()}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || "Voice Library could not be loaded");
      }
      setProfiles(Array.isArray(result.profiles) ? result.profiles : []);
      setDefaultProfileId(result.default_profile_id || null);
    } catch (loadError) {
      setError(loadError?.message || "Voice Library could not be loaded");
    } finally {
      setLoading(false);
    }
  }

  function releaseRecordingStream() {
    for (const track of streamRef.current?.getTracks?.() || []) track.stop();
    streamRef.current = null;
  }

  function releaseRecordingUrl() {
    const url = recordingUrlRef.current;
    recordingUrlRef.current = "";
    if (url) URL.revokeObjectURL(url);
  }

  function stopRecorderForCleanup() {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    chunksRef.current = [];
    if (!recorder || recorder.state === "inactive") return;
    recorder.ondataavailable = null;
    recorder.onerror = null;
    recorder.onstop = null;
    try {
      recorder.stop();
    } catch {
      // Recorder may already be stopping while the panel unmounts.
    }
  }

  function clearRecording() {
    releaseRecordingUrl();
    setRecordingBlob(null);
    setRecordingUrl("");
    setRecordingSeconds(0);
  }

  async function startRecording() {
    if (recording || action) return;
    setError("");
    clearRecording();

    try {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      ) {
        throw new Error("Voice recording is not supported by this browser");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const mimeType = preferredAudioMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      startedAtRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        recorderRef.current = null;
        if (hardStopRef.current) {
          window.clearTimeout(hardStopRef.current);
          hardStopRef.current = null;
        }
        setRecording(false);
        releaseRecordingStream();
        setError("Voice recording failed");
      };

      recorder.onstop = () => {
        const durationSeconds = Math.max(
          0,
          (Date.now() - startedAtRef.current) / 1000,
        );
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || "audio/webm",
        });
        chunksRef.current = [];
        recorderRef.current = null;
        setRecording(false);
        releaseRecordingStream();
        if (hardStopRef.current) {
          window.clearTimeout(hardStopRef.current);
          hardStopRef.current = null;
        }

        if (!blob.size) {
          setError("No voice audio was captured. Please record again.");
          return;
        }
        if (durationSeconds < MIN_REFERENCE_SECONDS) {
          setError("Record at least 3 seconds of clear natural speech.");
          return;
        }

        releaseRecordingUrl();
        const url = URL.createObjectURL(blob);
        recordingUrlRef.current = url;
        setRecordingBlob(blob);
        setRecordingUrl(url);
        setRecordingSeconds(durationSeconds);
      };

      recorder.start(250);
      setRecording(true);
      hardStopRef.current = window.setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, TARGET_REFERENCE_SECONDS * 1000);
    } catch (recordError) {
      setRecording(false);
      releaseRecordingStream();
      setError(recordError?.message || "Microphone access failed");
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  async function saveVoice() {
    if (action || recording) return;
    setError("");

    try {
      if (!text(name)) throw new Error("Give this voice a name");
      if (!recordingBlob) throw new Error("Record a clean voice sample first");
      if (recordingSeconds < MIN_REFERENCE_SECONDS) {
        throw new Error("Record at least 3 seconds of clear natural speech");
      }
      if (!consentConfirmed) {
        throw new Error("Confirm that you own or are authorized to use this voice");
      }
      if (consentBasis !== "SELF" && !text(consentEvidenceId)) {
        throw new Error("Add the authorization or license reference for this voice");
      }

      setAction("saving");
      const form = new FormData();
      form.append("organizationId", organizationId);
      if (entityId) form.append("entityId", entityId);
      form.append("name", text(name));
      form.append("audio", recordingBlob, recordedFileName(recordingBlob.type));
      form.append("mimeType", recordingBlob.type || "audio/webm");
      form.append("deliveryProfile", deliveryProfile);
      form.append("consentBasis", consentBasis);
      form.append("consentConfirmed", "true");
      if (text(consentEvidenceId)) {
        form.append("consentEvidenceId", text(consentEvidenceId));
      }
      form.append("referenceDurationSeconds", recordingSeconds.toFixed(2));

      const response = await fetch("/api/operator/voice-library", {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || "Voice could not be saved");
      }

      setName("");
      setDeliveryProfile("avantiqo-secretary-v1");
      setConsentBasis("SELF");
      setConsentEvidenceId("");
      setConsentConfirmed(false);
      clearRecording();
      await loadLibrary();
    } catch (saveError) {
      setError(saveError?.message || "Voice could not be saved");
    } finally {
      setAction("");
    }
  }

  async function patchProfile(profileId, patch, actionName) {
    if (action) return;
    setError("");
    setAction(`${actionName}:${profileId}`);
    try {
      const response = await fetch("/api/operator/voice-library", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          organizationId,
          entityId,
          profileId,
          ...patch,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || "Voice profile could not be updated");
      }
      await loadLibrary();
    } catch (patchError) {
      setError(patchError?.message || "Voice profile could not be updated");
    } finally {
      setAction("");
    }
  }

  async function deleteProfile(profileId) {
    if (action) return;
    if (confirmDeleteId !== profileId) {
      setConfirmDeleteId(profileId);
      return;
    }

    setError("");
    setAction(`delete:${profileId}`);
    try {
      const params = new URLSearchParams({ organizationId, profileId });
      if (entityId) params.set("entityId", entityId);
      const response = await fetch(`/api/operator/voice-library?${params.toString()}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || "Voice profile could not be deleted");
      }
      setConfirmDeleteId(null);
      if (playingProfileId === profileId) {
        previewAudioRef.current?.pause?.();
        previewAudioRef.current = null;
        setPlayingProfileId(null);
      }
      await loadLibrary();
    } catch (deleteError) {
      setError(deleteError?.message || "Voice profile could not be deleted");
    } finally {
      setAction("");
    }
  }

  async function togglePreview(profile) {
    if (!profile?.preview_url) return;

    if (playingProfileId === profile.id) {
      previewAudioRef.current?.pause?.();
      previewAudioRef.current = null;
      setPlayingProfileId(null);
      return;
    }

    previewAudioRef.current?.pause?.();
    const audio = new Audio(profile.preview_url);
    previewAudioRef.current = audio;
    audio.onended = () => {
      previewAudioRef.current = null;
      setPlayingProfileId(null);
    };
    audio.onerror = () => {
      previewAudioRef.current = null;
      setPlayingProfileId(null);
      setError("Voice preview expired. Reopen Voice Library to refresh it.");
    };
    setPlayingProfileId(profile.id);
    try {
      await audio.play();
    } catch {
      setPlayingProfileId(null);
      setError("Voice preview could not be played");
    }
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-[#080808]">
      <header className="border-b border-white/[0.07] px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="mb-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-white/35 transition hover:text-white/70"
            >
              <ChevronLeft size={13} />
              Operator
            </button>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-[#D6A66A]">
              <Mic size={13} />
              Voice Library
            </div>
            <p className="mt-2 max-w-[390px] text-[11px] font-light leading-5 text-white/40">
              Record an authorized voice once. Avantiqo can reuse that identity with different delivery styles and supported languages.
            </p>
          </div>
          <div className="rounded-full border border-emerald-400/15 bg-emerald-400/[0.05] px-3 py-1.5 text-[9px] uppercase tracking-[0.12em] text-emerald-200/55">
            Private
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {error ? (
          <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-[11px] leading-5 text-red-200/75">
            {error}
          </div>
        ) : null}

        <section className="rounded-2xl border border-[#D6A66A]/15 bg-[#D6A66A]/[0.035] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#E7C48E]">
                Add voice identity
              </div>
              <div className="mt-1 text-[10px] text-white/35">
                3–15 seconds · one speaker · quiet room · natural speech
              </div>
            </div>
            <ShieldCheck size={17} className="text-[#D6A66A]/70" />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[9px] uppercase tracking-[0.13em] text-white/30">
                Voice name
              </span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                placeholder="e.g. Patric · Executive"
                className="h-10 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-[12px] text-white outline-none transition placeholder:text-white/20 focus:border-[#D6A66A]/35"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[9px] uppercase tracking-[0.13em] text-white/30">
                Default delivery
              </span>
              <select
                value={deliveryProfile}
                onChange={(event) => setDeliveryProfile(event.target.value)}
                className="h-10 w-full rounded-xl border border-white/10 bg-[#0B0B0B] px-3 text-[12px] text-white/75 outline-none focus:border-[#D6A66A]/35"
              >
                {DELIVERY_PROFILES.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.label} · {profile.description}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/25 p-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                disabled={Boolean(action)}
                className={
                  recording
                    ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-400/30 bg-red-400/10 text-red-200"
                    : "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#D6A66A]/25 bg-[#D6A66A]/10 text-[#E7C48E] transition hover:border-[#D6A66A]/50 disabled:opacity-35"
                }
                aria-label={recording ? "Stop voice identity recording" : "Record voice identity"}
              >
                {recording ? <Square size={14} /> : <Mic size={16} />}
              </button>

              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-white/70">
                  {recording
                    ? "Recording voice identity…"
                    : recordingBlob
                      ? `${recordingSeconds.toFixed(1)} second sample ready`
                      : "Record a clean reference sample"}
                </div>
                <div className="mt-1 text-[9px] uppercase tracking-[0.12em] text-white/25">
                  {recording ? "Stops automatically at 15 seconds" : "This is separate from voice commands"}
                </div>
              </div>

              {recordingUrl ? (
                <audio
                  controls
                  preload="metadata"
                  src={recordingUrl}
                  className="h-8 w-[150px] max-w-[38%] opacity-70"
                />
              ) : null}
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[9px] uppercase tracking-[0.13em] text-white/30">
                Rights basis
              </span>
              <select
                value={consentBasis}
                onChange={(event) => setConsentBasis(event.target.value)}
                className="h-10 w-full rounded-xl border border-white/10 bg-[#0B0B0B] px-3 text-[12px] text-white/75 outline-none focus:border-[#D6A66A]/35"
              >
                {CONSENT_BASES.map((basis) => (
                  <option key={basis.id} value={basis.id}>{basis.label}</option>
                ))}
              </select>
            </label>

            {consentBasis !== "SELF" ? (
              <label className="block">
                <span className="mb-1.5 block text-[9px] uppercase tracking-[0.13em] text-white/30">
                  Authorization / license reference
                </span>
                <input
                  value={consentEvidenceId}
                  onChange={(event) => setConsentEvidenceId(event.target.value)}
                  placeholder="Agreement, approval or license ID"
                  className="h-10 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-[12px] text-white outline-none transition placeholder:text-white/20 focus:border-[#D6A66A]/35"
                />
              </label>
            ) : (
              <div className="rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5 text-[10px] leading-4 text-white/30">
                Self means the recording is your own voice and you are choosing to let this organization use it.
              </div>
            )}
          </div>

          <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-3">
            <input
              type="checkbox"
              checked={consentConfirmed}
              onChange={(event) => setConsentConfirmed(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#D6A66A]"
            />
            <span className="text-[10px] font-light leading-4 text-white/45">
              I confirm I own this voice or have permission to use it for Avantiqo speech generation.
            </span>
          </label>

          <button
            type="button"
            onClick={saveVoice}
            disabled={Boolean(action) || recording || !recordingBlob || !consentConfirmed || !text(name)}
            className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#D6A66A] text-[10px] font-semibold uppercase tracking-[0.14em] text-black transition hover:bg-[#E7C48E] disabled:cursor-not-allowed disabled:opacity-30"
          >
            {action === "saving" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Save voice identity
          </button>
        </section>

        <section className="mt-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">
                Saved voices
              </div>
              <div className="mt-1 text-[9px] text-white/25">
                The default identity is used automatically for organization speech.
              </div>
            </div>
            <button
              type="button"
              onClick={loadLibrary}
              disabled={loading || Boolean(action)}
              className="text-[9px] uppercase tracking-[0.12em] text-[#D6A66A]/55 transition hover:text-[#E7C48E] disabled:opacity-30"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-5 text-[11px] text-white/35">
              <Loader2 size={14} className="animate-spin text-[#D6A66A]" />
              Loading private Voice Library…
            </div>
          ) : profiles.length ? (
            <div className="space-y-2.5">
              {profiles.map((profile) => {
                const isDefault = profile.id === defaultProfileId;
                const profileBusy = action.endsWith(`:${profile.id}`);
                const confirmingDelete = confirmDeleteId === profile.id;
                return (
                  <article
                    key={profile.id}
                    className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3.5"
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => togglePreview(profile)}
                        disabled={!profile.preview_url || profileBusy}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] text-white/50 transition hover:border-[#D6A66A]/35 hover:text-[#E7C48E] disabled:opacity-25"
                        aria-label={`Preview ${profile.name}`}
                      >
                        {playingProfileId === profile.id ? <Pause size={14} /> : <Play size={14} />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-[12px] text-white/80">{profile.name}</div>
                          {isDefault ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-[#D6A66A]/20 bg-[#D6A66A]/10 px-2 py-0.5 text-[8px] uppercase tracking-[0.12em] text-[#E7C48E]">
                              <Star size={9} /> Default
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-[9px] uppercase tracking-[0.1em] text-white/25">
                          {deliveryLabel(profile.delivery_profile)} · {profile.consent_basis || "AUTHORIZED"} · {profile.quality_status === "PENDING_ENGINE_CERTIFICATION" ? "Awaiting one-time engine certification" : profile.quality_status}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                      <select
                        value={profile.delivery_profile || "avantiqo-secretary-v1"}
                        onChange={(event) => patchProfile(
                          profile.id,
                          { deliveryProfile: event.target.value },
                          "style",
                        )}
                        disabled={profileBusy}
                        className="h-9 min-w-0 rounded-xl border border-white/10 bg-[#0B0B0B] px-2.5 text-[10px] text-white/55 outline-none focus:border-[#D6A66A]/30 disabled:opacity-35"
                        aria-label={`Delivery style for ${profile.name}`}
                      >
                        {DELIVERY_PROFILES.map((delivery) => (
                          <option key={delivery.id} value={delivery.id}>{delivery.label}</option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => patchProfile(profile.id, { setDefault: true }, "default")}
                        disabled={isDefault || profileBusy}
                        className="h-9 rounded-xl border border-white/10 px-3 text-[9px] uppercase tracking-[0.1em] text-white/40 transition hover:border-[#D6A66A]/30 hover:text-[#E7C48E] disabled:opacity-25"
                      >
                        {profileBusy && action.startsWith("default:") ? <Loader2 size={11} className="mx-auto animate-spin" /> : "Set default"}
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteProfile(profile.id)}
                        disabled={profileBusy}
                        className={
                          confirmingDelete
                            ? "h-9 rounded-xl border border-red-400/25 bg-red-400/[0.07] px-3 text-[9px] uppercase tracking-[0.1em] text-red-200/80"
                            : "flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-white/25 transition hover:border-red-400/20 hover:text-red-200/70"
                        }
                        aria-label={confirmingDelete ? `Confirm delete ${profile.name}` : `Delete ${profile.name}`}
                      >
                        {profileBusy && action.startsWith("delete:")
                          ? <Loader2 size={12} className="animate-spin" />
                          : confirmingDelete
                            ? "Delete"
                            : <Trash2 size={13} />}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.015] px-4 py-6 text-center">
              <Mic size={18} className="mx-auto text-white/20" />
              <div className="mt-2 text-[11px] text-white/45">No recorded voices yet</div>
              <div className="mt-1 text-[9px] text-white/25">The built-in Avantiqo Secretary voice remains the fallback.</div>
            </div>
          )}
        </section>
      </div>

      <footer className="border-t border-white/[0.07] bg-black/35 px-5 py-3 text-[9px] uppercase tracking-[0.13em] text-white/20">
        Authorized recordings only · Private storage · Identity and delivery stay separate
      </footer>
    </div>
  );
}

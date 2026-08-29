"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  Loader2,
  MessageCircleMore,
  Mic,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import AvantiqoVoiceLibraryPanel from "@/components/operator/AvantiqoVoiceLibraryPanel";
import { transcribeRecordedAudio } from "@/lib/operator/voice/AsyncRecordedTranscriptionClient";
import { requestAsyncSpeechBlob } from "@/lib/operator/voice/AsyncSpeechClient";

const OPERATOR_SPOKEN_REPLY_TIMEOUT_MS = 20 * 1000;
const OPERATOR_RECORDED_STT_TIMEOUT_MS = 20 * 1000;
const VOICE_HARD_STOP_MS = 18 * 1000;

function text(value) {
  return String(value ?? "").trim();
}

function assistantMessage(content, extra = {}) {
  return {
    id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role: "assistant",
    content: text(content),
    ...extra,
  };
}

function userMessage(content) {
  return {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role: "user",
    content: text(content),
  };
}

function resultCount(execution) {
  const result = execution?.result?.result;
  if (Array.isArray(result)) return result.length;
  if (Array.isArray(result?.rows)) return result.rows.length;
  if (Array.isArray(result?.items)) return result.items.length;
  return null;
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

function humanVoiceError(error) {
  const message = text(error?.message || error);
  if (message.includes("AVANTIQO_VOICE_RUNPOD_LEASE_TARGET_BUSY")) {
    return "Voice is temporarily busy. I kept the answer in the conversation.";
  }
  if (message.includes("AVANTIQO_VOICE_RUNPOD_LEASE_TARGET_MUST_START_0_0")) {
    return "Voice is recovering from an earlier session. I kept the answer in the conversation.";
  }
  if (message.toLowerCase().includes("timed out")) {
    return "Voice took too long, so I cancelled the late reply. The written answer is still here.";
  }
  return `Voice reply unavailable: ${message || "speech generation failed"}`;
}

export default function AvantiqoOperator() {
  const router = useRouter();
  const pathname = usePathname();
  const businessContext = useBusinessContext();
  const inputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingRef = useRef(false);
  const busyRef = useRef(false);
  const voiceBusyRef = useRef(false);
  const voiceLibraryOpenRef = useRef(false);
  const speakingRef = useRef(false);
  const spokenAudioRef = useRef(null);
  const spokenAudioUrlRef = useRef(null);
  const spokenReplyAbortRef = useRef(null);
  const voiceAudioContextRef = useRef(null);
  const voiceAnalyserFrameRef = useRef(null);
  const voiceHardStopTimerRef = useRef(null);
  const voiceHasSpeechRef = useRef(false);
  const voiceLastSoundAtRef = useRef(0);

  const [open, setOpen] = useState(false);
  const [voiceLibraryOpen, setVoiceLibraryOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const [agreementState, setAgreementState] = useState({});
  const [messages, setMessages] = useState([
    assistantMessage(
      "I’m Avantiqo. Tell me what you want to understand, open, decide or get done.",
    ),
  ]);

  const organizationId =
    businessContext?.organization_id ||
    businessContext?.organization?.id ||
    null;
  const entityId =
    businessContext?.entity_id ||
    businessContext?.entity?.id ||
    null;
  const periodId =
    businessContext?.period_id ||
    businessContext?.period?.id ||
    null;

  const contextLabel = useMemo(() => {
    const organization = businessContext?.organization?.name || "Avantiqo";
    const entity =
      businessContext?.entity?.name || businessContext?.entity?.legal_name || "";
    return entity && entity !== organization
      ? `${organization} · ${entity}`
      : organization;
  }, [businessContext?.organization, businessContext?.entity]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    voiceBusyRef.current = voiceBusy;
  }, [voiceBusy]);

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  useEffect(() => {
    function receiveSpokenReply(event) {
      const message = text(event?.detail?.message);
      const voiceInitiated = event?.detail?.voice_initiated === true;
      const urgent = text(event?.detail?.priority).toLowerCase() === "urgent";
      if (!message || voiceLibraryOpenRef.current || (!voiceInitiated && !urgent)) {
        return;
      }

      requestSpokenReply(message).catch((speechError) => {
        if (speechError?.name !== "AbortError") {
          setError(humanVoiceError(speechError));
        }
      });
    }

    window.addEventListener("avantiqo:speak", receiveSpokenReply);
    return () => window.removeEventListener("avantiqo:speak", receiveSpokenReply);
  }, [organizationId, entityId]);

  useEffect(() => {
    return () => {
      spokenReplyAbortRef.current?.abort();
      releaseSpokenAudio();
      stopSilenceDetection();
      releaseVoiceStream();
    };
  }, []);

  function releaseSpokenAudio() {
    const audio = spokenAudioRef.current;
    spokenAudioRef.current = null;
    if (audio) {
      try {
        audio.pause();
        audio.src = "";
      } catch {
        // Best-effort release.
      }
    }
    const url = spokenAudioUrlRef.current;
    spokenAudioUrlRef.current = null;
    if (url) URL.revokeObjectURL(url);
  }

  async function playSpokenBlob(blob) {
    if (!blob?.size) throw new Error("Voice reply returned empty audio");
    releaseSpokenAudio();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    spokenAudioUrlRef.current = url;
    spokenAudioRef.current = audio;

    await new Promise((resolve, reject) => {
      const cleanup = () => {
        audio.onended = null;
        audio.onerror = null;
      };
      audio.onended = () => {
        cleanup();
        resolve();
      };
      audio.onerror = () => {
        cleanup();
        reject(new Error("Voice reply playback failed"));
      };
      audio.play().catch((playError) => {
        cleanup();
        reject(playError);
      });
    });
    releaseSpokenAudio();
  }

  async function requestSpokenReply(responseText) {
    const spokenText = text(responseText);
    if (!spokenText || !organizationId) return;

    spokenReplyAbortRef.current?.abort();
    const abortController = new AbortController();
    spokenReplyAbortRef.current = abortController;
    speakingRef.current = true;
    setSpeaking(true);

    try {
      const locale = typeof navigator !== "undefined" ? navigator.language || null : null;
      const blob = await requestAsyncSpeechBlob({
        organizationId,
        entityId,
        message: spokenText,
        locale,
        signal: abortController.signal,
        timeoutMs: OPERATOR_SPOKEN_REPLY_TIMEOUT_MS,
      });
      await playSpokenBlob(blob);
    } finally {
      if (spokenReplyAbortRef.current === abortController) {
        spokenReplyAbortRef.current = null;
      }
      releaseSpokenAudio();
      speakingRef.current = false;
      setSpeaking(false);
    }
  }

  async function sendMessage(rawValue, source = "text") {
    const message = text(rawValue);
    const primaryChat =
      typeof document !== "undefined"
        ? document.querySelector('[data-avantiqo-home-intelligence="true"]')
        : null;

    if (message && primaryChat) {
      window.dispatchEvent(
        new CustomEvent("avantiqo:home-command", {
          detail: { message, source: source === "voice" ? "voice" : "text" },
        }),
      );
      setOpen(false);
      setInput("");
      window.setTimeout(() => {
        primaryChat.scrollIntoView?.({ behavior: "smooth", block: "center" });
        document.querySelector('[data-avantiqo-home-input="true"]')?.focus?.();
      }, 0);
      return;
    }

    if (
      !message ||
      busyRef.current ||
      speakingRef.current ||
      !organizationId ||
      voiceLibraryOpenRef.current
    ) {
      return;
    }

    const nextUserMessage = userMessage(message);
    const priorConversation = messages.map(({ role, content }) => ({ role, content }));

    setMessages((current) => [...current, nextUserMessage]);
    setInput("");
    setBusy(true);
    busyRef.current = true;
    setError("");

    try {
      const response = await fetch("/api/operator/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          organizationId,
          entityId,
          periodId,
          conversationKey: "primary",
          pathname,
          message,
          source: source === "voice" ? "voice" : "text",
          locale:
            typeof navigator !== "undefined" ? navigator.language || null : null,
          agreementState,
          conversation: priorConversation,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || "Avantiqo could not complete the request");
      }

      const decision = result?.decision || {};
      const assistantText = text(decision?.response_text) || "Done.";
      const executionCount = resultCount(result?.execution);
      const executionLabel = result?.execution?.capability?.key || null;

      setAgreementState(result?.agreement_state || decision?.agreement_state || {});
      setMessages((current) => [
        ...current,
        assistantMessage(assistantText, {
          options: decision?.clarification?.options || [],
          navigation: result?.navigation || null,
          execution: executionLabel
            ? {
                key: executionLabel,
                status: result?.execution?.status || null,
                count: executionCount,
              }
            : null,
        }),
      ]);

      if (result?.navigation?.href) router.push(result.navigation.href);

      if (source === "voice" && assistantText) {
        try {
          await requestSpokenReply(assistantText);
        } catch (speechError) {
          if (speechError?.name !== "AbortError") {
            setError(humanVoiceError(speechError));
          }
        }
      }
    } catch (sendError) {
      const messageText = sendError?.message || "Avantiqo failed";
      const responseText = `I couldn't complete that: ${messageText}`;
      setError(messageText);
      setMessages((current) => [
        ...current,
        assistantMessage(responseText),
      ]);
      if (source === "voice") {
        try {
          await requestSpokenReply(responseText);
        } catch {
          // Written error remains authoritative.
        }
      }
    } finally {
      setBusy(false);
      busyRef.current = false;
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function releaseVoiceStream() {
    for (const track of mediaStreamRef.current?.getTracks?.() || []) track.stop();
    mediaStreamRef.current = null;
  }

  function stopSilenceDetection() {
    if (voiceAnalyserFrameRef.current) {
      window.cancelAnimationFrame(voiceAnalyserFrameRef.current);
      voiceAnalyserFrameRef.current = null;
    }
    if (voiceHardStopTimerRef.current) {
      window.clearTimeout(voiceHardStopTimerRef.current);
      voiceHardStopTimerRef.current = null;
    }
    const audioContext = voiceAudioContextRef.current;
    voiceAudioContextRef.current = null;
    if (audioContext?.close) audioContext.close().catch(() => null);
  }

  function startSilenceDetection(stream) {
    stopSilenceDetection();
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext || null;

    voiceHardStopTimerRef.current = window.setTimeout(() => {
      stopVoice();
    }, VOICE_HARD_STOP_MS);

    if (!AudioContextConstructor) return;

    try {
      const audioContext = new AudioContextConstructor();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      voiceAudioContextRef.current = audioContext;
      voiceHasSpeechRef.current = false;
      voiceLastSoundAtRef.current = Date.now();

      const samples = new Uint8Array(analyser.fftSize);
      const startedAt = Date.now();

      const monitor = () => {
        if (!recordingRef.current) return;
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const centered = (sample - 128) / 128;
          sum += centered * centered;
        }
        const rms = Math.sqrt(sum / samples.length);
        const now = Date.now();
        if (rms > 0.035) {
          voiceHasSpeechRef.current = true;
          voiceLastSoundAtRef.current = now;
        }
        const elapsed = now - startedAt;
        const silentFor = now - voiceLastSoundAtRef.current;
        if (
          (voiceHasSpeechRef.current && elapsed > 900 && silentFor > 1300) ||
          (!voiceHasSpeechRef.current && elapsed > 8000)
        ) {
          stopVoice();
          return;
        }
        voiceAnalyserFrameRef.current = window.requestAnimationFrame(monitor);
      };
      voiceAnalyserFrameRef.current = window.requestAnimationFrame(monitor);
    } catch {
      // Hard stop still protects the recording.
    }
  }

  async function transcribeVoice(blob) {
    if (!blob?.size || !organizationId) {
      releaseVoiceStream();
      return;
    }

    setVoiceBusy(true);
    voiceBusyRef.current = true;
    setError("");

    try {
      releaseVoiceStream();
      const result = await transcribeRecordedAudio({
        audio: blob,
        organizationId,
        entityId,
        locale: navigator.language || "",
        mode: "command",
        timeoutMs: OPERATOR_RECORDED_STT_TIMEOUT_MS,
      });
      const transcript = text(result.transcript);
      if (!transcript) throw new Error("Voice transcription returned no text");
      await sendMessage(transcript, "voice");
    } catch (voiceError) {
      releaseVoiceStream();
      const messageText = voiceError?.message || "Voice input failed";
      setError(messageText);
      setMessages((current) => [
        ...current,
        assistantMessage(`I couldn't process that voice message: ${messageText}`),
      ]);
    } finally {
      setVoiceBusy(false);
      voiceBusyRef.current = false;
    }
  }

  async function startVoice() {
    if (
      voiceLibraryOpenRef.current ||
      speakingRef.current ||
      busyRef.current ||
      voiceBusyRef.current ||
      recordingRef.current
    ) {
      return;
    }

    try {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      ) {
        throw new Error("Voice recording is not supported by this browser");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = preferredAudioMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data?.size) audioChunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        recordingRef.current = false;
        setRecording(false);
        stopSilenceDetection();
        releaseVoiceStream();
        setVoiceBusy(false);
        voiceBusyRef.current = false;
        setError("Voice recording failed");
      };

      recorder.onstop = () => {
        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        const blob = new Blob(chunks, {
          type: recorder.mimeType || mimeType || "audio/webm",
        });
        recordingRef.current = false;
        setRecording(false);
        stopSilenceDetection();
        void transcribeVoice(blob);
      };

      setError("");
      recorder.start(250);
      recordingRef.current = true;
      setRecording(true);
      startSilenceDetection(stream);
    } catch (voiceError) {
      recordingRef.current = false;
      stopSilenceDetection();
      releaseVoiceStream();
      setRecording(false);
      setVoiceBusy(false);
      voiceBusyRef.current = false;
      setError(voiceError?.message || "Microphone access failed");
    }
  }

  function stopVoice() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  }

  async function restorePrimaryConversationIntoPanel() {
    if (!organizationId) return;
    try {
      const query = new URLSearchParams({ organizationId, conversationKey: "primary" });
      const response = await fetch(`/api/operator/turn?${query.toString()}`, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) return;
      setAgreementState(result?.agreement_state || {});
      const restored = Array.isArray(result?.turns)
        ? result.turns
            .filter((turn) => text(turn?.content))
            .map((turn) =>
              turn.role === "assistant"
                ? assistantMessage(turn.content, {
                    id: turn.id || undefined,
                    options: Array.isArray(turn?.decision?.clarification?.options)
                      ? turn.decision.clarification.options
                      : [],
                  })
                : { ...userMessage(turn.content), id: turn.id || undefined },
            )
        : [];
      if (restored.length) setMessages(restored);
    } catch {
      // Server-side primary conversation remains authoritative.
    }
  }

  async function openPanel() {
    const primaryChat =
      typeof document !== "undefined"
        ? document.querySelector('[data-avantiqo-home-intelligence="true"]')
        : null;
    if (primaryChat) {
      primaryChat.scrollIntoView?.({ behavior: "smooth", block: "center" });
      window.setTimeout(
        () => document.querySelector('[data-avantiqo-home-input="true"]')?.focus?.(),
        0,
      );
      return;
    }
    setOpen(true);
    await restorePrimaryConversationIntoPanel();
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function openVoiceLibrary() {
    if (
      busyRef.current ||
      voiceBusyRef.current ||
      recordingRef.current ||
      speakingRef.current
    ) {
      return;
    }
    voiceLibraryOpenRef.current = true;
    setError("");
    setVoiceLibraryOpen(true);
  }

  function closeVoiceLibrary() {
    voiceLibraryOpenRef.current = false;
    setVoiceLibraryOpen(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function closePanel() {
    voiceLibraryOpenRef.current = false;
    setVoiceLibraryOpen(false);
    setOpen(false);
    spokenReplyAbortRef.current?.abort();
    releaseSpokenAudio();
    speakingRef.current = false;
    setSpeaking(false);
  }

  if (!businessContext?.ready || !organizationId) return null;

  const interactionDisabled = busy || voiceBusy || speaking;

  return (
    <>
      {!open ? (
        <div className="fixed bottom-6 right-6 z-[80] flex items-center gap-2">
          <button
            type="button"
            onClick={recording ? stopVoice : startVoice}
            disabled={interactionDisabled || voiceLibraryOpen}
            className={
              recording
                ? "flex h-11 items-center gap-2 rounded-full border border-red-400/25 bg-[#100707]/95 px-4 text-red-200 shadow-[0_20px_70px_rgba(0,0,0,.55)] backdrop-blur-2xl disabled:opacity-30"
                : "flex h-11 items-center gap-2 rounded-full border border-white/10 bg-[#0A0A0A]/95 px-4 text-white/55 shadow-[0_20px_70px_rgba(0,0,0,.55)] backdrop-blur-2xl transition hover:border-[#D6A66A]/35 hover:text-white/80 disabled:opacity-30"
            }
            aria-label={recording ? "Stop voice recording" : "Talk to Avantiqo"}
            aria-pressed={recording}
          >
            {recording ? <Square size={13} /> : <Mic size={13} />}
            <span className="text-[10px] font-medium uppercase tracking-[0.12em]">
              {recording ? "Listening…" : voiceBusy ? "Understanding…" : "Talk to Avantiqo"}
            </span>
          </button>

          <button
            type="button"
            onClick={openPanel}
            className="flex h-14 items-center gap-3 rounded-full border border-[#D6A66A]/35 bg-[#0A0A0A]/95 px-5 text-white shadow-[0_20px_70px_rgba(0,0,0,.75)] backdrop-blur-2xl transition hover:border-[#D6A66A]/65 hover:bg-[#15110B]"
            aria-label="Open Avantiqo"
          >
            <Sparkles size={17} className="text-[#D6A66A]" />
            <span className="text-[12px] font-medium uppercase tracking-[0.14em]">
              Ask Avantiqo
            </span>
          </button>
        </div>
      ) : null}

      {open ? (
        <section className="fixed bottom-5 right-5 z-[100] flex h-[min(760px,calc(100vh-40px))] w-[min(520px,calc(100vw-40px))] flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#080808]/98 text-white shadow-[0_30px_110px_rgba(0,0,0,.9)] backdrop-blur-3xl">
          <header className="border-b border-white/[0.07] px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-[#D6A66A]">
                  <Sparkles size={13} />
                  Avantiqo Secretary
                </div>
                <div className="mt-2 truncate text-[12px] text-white/45">
                  {contextLabel}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={recording ? stopVoice : startVoice}
                    disabled={interactionDisabled || voiceLibraryOpen}
                    className="inline-flex items-center gap-2 rounded-full border border-[#D6A66A]/20 bg-[#D6A66A]/[0.06] px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-[#E7C48E]/75 transition hover:border-[#D6A66A]/40 disabled:opacity-30"
                  >
                    {recording ? <Square size={12} /> : <Mic size={12} />}
                    {recording ? "Stop listening" : "Talk"}
                  </button>
                  <button
                    type="button"
                    onClick={openVoiceLibrary}
                    disabled={busy || voiceBusy || recording || speaking}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.025] px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-white/45 transition hover:border-[#D6A66A]/30 disabled:opacity-30"
                    aria-label="Open Voice Library"
                  >
                    <Mic size={12} />
                    Voice Library
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={closePanel}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.025] text-white/55 transition hover:bg-white/[0.07] hover:text-white"
                aria-label="Close Avantiqo"
              >
                <X size={16} />
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === "user"
                    ? "ml-10 rounded-2xl rounded-br-md border border-[#D6A66A]/20 bg-[#D6A66A]/10 px-4 py-3"
                    : "mr-7 rounded-2xl rounded-bl-md border border-white/[0.07] bg-white/[0.025] px-4 py-3"
                }
              >
                <div className="whitespace-pre-wrap text-[13px] font-light leading-6 text-white/85">
                  {message.content}
                </div>

                {message.execution ? (
                  <div className="mt-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-emerald-200/70">
                    {message.execution.status === "completed" ? "Executed" : "Prepared"}
                    {" · "}
                    {message.execution.key}
                    {Number.isFinite(message.execution.count)
                      ? ` · ${message.execution.count} records`
                      : ""}
                  </div>
                ) : null}

                {message.navigation ? (
                  <button
                    type="button"
                    onClick={() => router.push(message.navigation.href)}
                    className="mt-3 flex items-center gap-2 rounded-xl border border-[#D6A66A]/25 bg-[#D6A66A]/10 px-3 py-2 text-[11px] text-[#F0D29A]"
                  >
                    Open {message.navigation.name}
                    <ArrowRight size={13} />
                  </button>
                ) : null}

                {Array.isArray(message.options) && message.options.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {message.options.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        disabled={busy || voiceBusy || recording || speaking}
                        onClick={() => sendMessage(option.label, "text")}
                        className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-[11px] text-white/65 transition hover:border-[#D6A66A]/35 hover:text-white disabled:opacity-40"
                        title={option.description || option.label}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}

            {busy || voiceBusy || recording || speaking ? (
              <div className="mr-16 flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-3 text-[12px] text-white/45">
                {recording ? (
                  <Mic size={14} className="text-red-300" />
                ) : (
                  <Loader2 size={14} className="animate-spin text-[#D6A66A]" />
                )}
                {recording
                  ? "Listening... speak naturally and I'll stop after you finish."
                  : speaking
                    ? "Speaking with your Avantiqo voice..."
                    : voiceBusy
                      ? "Understanding your voice message..."
                      : "Thinking and checking Avantiqo..."}
              </div>
            ) : null}
          </div>

          <footer className="border-t border-white/[0.07] bg-black/35 p-4">
            {error ? (
              <div className="mb-3 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-[11px] text-red-200/75">
                {error}
              </div>
            ) : null}

            <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.025] p-2 focus-within:border-[#D6A66A]/30">
              <MessageCircleMore size={17} className="mb-2.5 ml-2 shrink-0 text-white/30" />
              <textarea
                ref={inputRef}
                value={input}
                rows={1}
                disabled={interactionDisabled || recording || voiceLibraryOpen}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage(input, "text");
                  }
                }}
                placeholder={
                  recording
                    ? "Listening..."
                    : speaking
                      ? "Avantiqo is speaking..."
                      : "Tell Avantiqo what you need..."
                }
                className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-1 py-2.5 text-[13px] leading-5 text-white outline-none placeholder:text-white/25 disabled:opacity-50"
              />

              <button
                type="button"
                onClick={recording ? stopVoice : startVoice}
                disabled={interactionDisabled || voiceLibraryOpen}
                aria-label={recording ? "Stop voice recording" : "Talk to Avantiqo"}
                aria-pressed={recording}
                className={
                  recording
                    ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-400/30 bg-red-400/10 text-red-200 transition hover:bg-red-400/15 disabled:opacity-30"
                    : "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] text-white/55 transition hover:border-[#D6A66A]/35 hover:text-[#F0D29A] disabled:opacity-30"
                }
              >
                {recording ? <Square size={13} /> : <Mic size={15} />}
              </button>

              <button
                type="button"
                onClick={() => sendMessage(input, "text")}
                disabled={interactionDisabled || recording || voiceLibraryOpen || !text(input)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#D6A66A] text-black transition hover:bg-[#E7C48E] disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Send to Avantiqo"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </div>

            <div className="mt-2 px-1 text-[9px] uppercase tracking-[0.14em] text-white/20">
              Avantiqo-owned Voice + Text · Discuss · Navigate · Execute · Verify
            </div>
          </footer>

          {voiceLibraryOpen ? (
            <AvantiqoVoiceLibraryPanel
              organizationId={organizationId}
              entityId={entityId}
              onClose={closeVoiceLibrary}
            />
          ) : null}
        </section>
      ) : null}
    </>
  );
}

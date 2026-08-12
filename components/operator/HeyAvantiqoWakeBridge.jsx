"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic } from "lucide-react";
import { usePathname } from "next/navigation";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const LEGACY_WAKE_STORAGE_KEY = "avantiqo.wake.enabled";
const WAKE_STORAGE_KEY = "avantiqo.wake.audio.enabled";
const PRE_ROLL_CHUNKS = 5;
const SPEECH_THRESHOLD = 0.028;
const SILENCE_TO_FINISH_MS = 950;
const MAX_UTTERANCE_MS = 9000;

function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsWakePhrase(value) {
  const candidate = normalized(value);
  return [
    "hey avantiqo",
    "hey avanti qo",
    "hey avanti co",
    "hey avanti go",
  ].some((phrase) => candidate.includes(phrase));
}

function commandAfterWake(value) {
  return text(value)
    .replace(/hey\s+avanti(?:qo|\s+qo|\s+co|\s+go)/i, "")
    .replace(/^[\s,.:;!?-]+/, "")
    .trim();
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

function speakAcknowledgement() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance("Yes?");
    utterance.lang = navigator.language || "en-US";
    utterance.rate = 1.05;
    utterance.volume = 0.7;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Voice acknowledgement is optional.
  }
}

export default function HeyAvantiqoWakeBridge() {
  const pathname = usePathname();
  const businessContext = useBusinessContext();

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const enabledRef = useRef(false);
  const processingRef = useRef(false);
  const speechActiveRef = useRef(false);
  const finalizingRef = useRef(false);
  const speechStartedAtRef = useRef(0);
  const lastSoundAtRef = useRef(0);
  const preRollRef = useRef([]);
  const utteranceChunksRef = useRef([]);
  const armedForCommandRef = useRef(false);

  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState("off");

  const organizationId =
    businessContext?.organization_id ||
    businessContext?.organization?.id ||
    null;
  const entityId =
    businessContext?.entity_id ||
    businessContext?.entity?.id ||
    null;

  const isHome = /^\/workspace\/[^/]+\/?$/.test(pathname || "");

  useEffect(() => {
    window.localStorage.removeItem(LEGACY_WAKE_STORAGE_KEY);
    window.localStorage.removeItem("avantiqo.wake.bridge.enabled");

    const canRecord = Boolean(
      navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined" &&
      (window.AudioContext || window.webkitAudioContext),
    );

    setSupported(canRecord);

    if (!canRecord) {
      setStatus("unsupported");
      return undefined;
    }

    const storedEnabled = window.localStorage.getItem(WAKE_STORAGE_KEY) === "true";
    if (storedEnabled) {
      window.setTimeout(() => {
        startWakeAudio().catch(() => {
          enabledRef.current = false;
          setEnabled(false);
          setListening(false);
          setStatus("permission-required");
        });
      }, 500);
    }

    return () => {
      stopWakeAudio();
    };
  }, []);

  function clearAnimationFrame() {
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }

  function stopWakeAudio() {
    enabledRef.current = false;
    processingRef.current = false;
    speechActiveRef.current = false;
    finalizingRef.current = false;
    armedForCommandRef.current = false;
    clearAnimationFrame();

    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Recorder may already be stopped.
      }
    }

    for (const track of streamRef.current?.getTracks?.() || []) {
      track.stop();
    }
    streamRef.current = null;

    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    analyserRef.current = null;
    if (audioContext?.close) {
      audioContext.close().catch(() => null);
    }

    preRollRef.current = [];
    utteranceChunksRef.current = [];
    setListening(false);
    setProcessing(false);
  }

  function dispatchCommand(message) {
    const detail = {
      message: text(message),
      source: "voice",
    };

    if (!detail.message) return;

    if (document.querySelector('[data-avantiqo-home-intelligence="true"]')) {
      window.dispatchEvent(
        new CustomEvent("avantiqo:home-command", { detail }),
      );
      return;
    }

    const openButton = document.querySelector(
      'button[aria-label="Open Avantiqo Operator"]',
    );
    openButton?.click?.();

    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("avantiqo:operator-command", { detail }),
      );
    }, 350);
  }

  async function transcribeUtterance(blob) {
    if (!blob?.size || !organizationId) return "";

    const form = new FormData();
    form.append(
      "audio",
      blob,
      blob.type.includes("mp4") ? "hey-avantiqo.m4a" : "hey-avantiqo.webm",
    );
    form.append("organizationId", organizationId);
    if (entityId) form.append("entityId", entityId);
    form.append("locale", navigator.language || "en-US");

    const response = await fetch("/api/operator/transcribe", {
      method: "POST",
      credentials: "same-origin",
      body: form,
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || result?.success === false) {
      throw new Error(result?.error || "Wake transcription failed");
    }

    return text(result?.transcript);
  }

  async function processUtterance(blob) {
    if (processingRef.current || !enabledRef.current) return;

    processingRef.current = true;
    setProcessing(true);
    setStatus(armedForCommandRef.current ? "understanding-command" : "checking-wake");

    try {
      const transcript = await transcribeUtterance(blob);
      if (!transcript) return;

      if (armedForCommandRef.current) {
        armedForCommandRef.current = false;
        dispatchCommand(transcript);
        setStatus("listening");
        return;
      }

      if (!containsWakePhrase(transcript)) {
        setStatus("listening");
        return;
      }

      const immediateCommand = commandAfterWake(transcript);
      if (immediateCommand) {
        dispatchCommand(immediateCommand);
        setStatus("listening");
        return;
      }

      armedForCommandRef.current = true;
      setStatus("waiting-command");
      speakAcknowledgement();
    } catch (error) {
      console.error("HEY_AVANTIQO_WAKE_TRANSCRIPTION_ERROR", error);
      setStatus("retrying");
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }

  function finalizeUtterance() {
    if (!speechActiveRef.current || finalizingRef.current) return;

    speechActiveRef.current = false;
    finalizingRef.current = true;

    try {
      recorderRef.current?.requestData?.();
    } catch {
      // Timeslice chunks already contain the speech if requestData is unavailable.
    }

    window.setTimeout(() => {
      const chunks = utteranceChunksRef.current;
      utteranceChunksRef.current = [];
      finalizingRef.current = false;

      if (!chunks.length) return;

      const recorder = recorderRef.current;
      const mimeType = recorder?.mimeType || preferredAudioMimeType() || "audio/webm";
      const blob = new Blob(chunks, { type: mimeType });
      processUtterance(blob);
    }, 160);
  }

  function monitorAudio() {
    const analyser = analyserRef.current;
    if (!enabledRef.current || !analyser) return;

    const samples = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(samples);

    let sum = 0;
    for (const sample of samples) {
      const centered = (sample - 128) / 128;
      sum += centered * centered;
    }

    const rms = Math.sqrt(sum / samples.length);
    const now = Date.now();

    if (!processingRef.current && rms > SPEECH_THRESHOLD) {
      if (!speechActiveRef.current) {
        speechActiveRef.current = true;
        speechStartedAtRef.current = now;
        utteranceChunksRef.current = [...preRollRef.current];
        preRollRef.current = [];
      }
      lastSoundAtRef.current = now;
    }

    if (speechActiveRef.current) {
      const silentFor = now - lastSoundAtRef.current;
      const utteranceAge = now - speechStartedAtRef.current;

      if (
        (utteranceAge > 500 && silentFor > SILENCE_TO_FINISH_MS) ||
        utteranceAge > MAX_UTTERANCE_MS
      ) {
        finalizeUtterance();
      }
    }

    animationFrameRef.current = window.requestAnimationFrame(monitorAudio);
  }

  async function startWakeAudio() {
    if (!supported || enabledRef.current) return;

    if (!organizationId) {
      setStatus("organization-required");
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextConstructor();
    await audioContext.resume?.();

    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const mimeType = preferredAudioMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    recorder.ondataavailable = (event) => {
      if (!event.data?.size) return;

      if (speechActiveRef.current || finalizingRef.current) {
        utteranceChunksRef.current.push(event.data);
        return;
      }

      preRollRef.current.push(event.data);
      if (preRollRef.current.length > PRE_ROLL_CHUNKS) {
        preRollRef.current.shift();
      }
    };

    recorder.onerror = () => {
      setStatus("audio-error");
      stopWakeAudio();
      setEnabled(false);
      window.localStorage.removeItem(WAKE_STORAGE_KEY);
    };

    streamRef.current = stream;
    recorderRef.current = recorder;
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    enabledRef.current = true;

    recorder.start(200);
    setEnabled(true);
    setListening(true);
    setStatus("listening");
    window.localStorage.setItem(WAKE_STORAGE_KEY, "true");
    monitorAudio();
  }

  async function enableWake() {
    try {
      setStatus("starting");
      await startWakeAudio();
    } catch (error) {
      console.error("HEY_AVANTIQO_ENABLE_ERROR", error);
      stopWakeAudio();
      setEnabled(false);
      setListening(false);
      setStatus("permission-required");
      window.localStorage.removeItem(WAKE_STORAGE_KEY);
    }
  }

  function disableWake() {
    stopWakeAudio();
    setEnabled(false);
    setStatus("off");
    window.localStorage.removeItem(WAKE_STORAGE_KEY);
  }

  const label = !supported
    ? "Voice wake unavailable"
    : !enabled
      ? status === "permission-required"
        ? "Enable Hey Avantiqo"
        : "Enable Hey Avantiqo"
      : status === "waiting-command"
        ? "Hey Avantiqo · Speak now"
        : processing
          ? "Hey Avantiqo · Understanding"
          : listening
            ? "Hey Avantiqo · Listening"
            : "Hey Avantiqo · Starting";

  return (
    <>
      <style jsx global>{`
        button[aria-label="Enable Hey Avantiqo"],
        button[aria-label="Disable Hey Avantiqo"] {
          display: none !important;
        }
        ${isHome
          ? `button[aria-label="Open Avantiqo Operator"] { display: none !important; }`
          : ""}
      `}</style>

      <button
        type="button"
        onClick={enabled ? disableWake : enableWake}
        disabled={!supported || !organizationId}
        aria-pressed={enabled}
        className={
          enabled
            ? "fixed bottom-6 right-6 z-[90] flex h-12 items-center gap-3 rounded-full border border-emerald-400/30 bg-[#07100B]/95 px-5 text-emerald-200 shadow-[0_20px_70px_rgba(0,0,0,.65)] backdrop-blur-2xl transition hover:border-emerald-300/55"
            : "fixed bottom-6 right-6 z-[90] flex h-12 items-center gap-3 rounded-full border border-[#D6A66A]/35 bg-[#0A0A0A]/95 px-5 text-white shadow-[0_20px_70px_rgba(0,0,0,.65)] backdrop-blur-2xl transition hover:border-[#D6A66A]/65 disabled:opacity-45"
        }
      >
        {processing || (enabled && !listening) ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <Mic size={15} />
        )}
        <span className="text-[11px] font-medium uppercase tracking-[0.13em]">
          {label}
        </span>
      </button>
    </>
  );
}

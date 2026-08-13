"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic } from "lucide-react";
import { usePathname } from "next/navigation";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const LEGACY_WAKE_STORAGE_KEY = "avantiqo.wake.enabled";
const WAKE_STORAGE_KEY = "avantiqo.wake.audio.enabled";
const SPEECH_THRESHOLD = 0.028;
const SILENCE_TO_FINISH_MS = 850;
const MAX_UTTERANCE_MS = 9000;
const TRANSCRIPTION_TIMEOUT_MS = 12000;
const SPEECH_TIMEOUT_MS = 12000;

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
  const compact = candidate.replace(/\s+/g, "");
  const hasName = [
    "avantiqo",
    "avantiq",
    "avantico",
    "avantigo",
    "avantiko",
    "avanti",
  ].some((name) => compact.includes(name));

  if (!hasName) return false;

  const words = candidate.split(" ").filter(Boolean);
  return (
    words.some((word) => ["hey", "hay", "hei", "hi", "hello"].includes(word)) ||
    words.length <= 3
  );
}

function commandAfterWake(value) {
  return text(value)
    .replace(
      /(?:hey|hay|hei|hi|hello)\s+avanti(?:qo|q|\s+qo|\s+co|\s+go|co|go|ko)?/i,
      "",
    )
    .replace(/^[\s,.:;!?-]+/, "")
    .trim();
}

function preferredAudioMimeType() {
  if (typeof MediaRecorder === "undefined") return "";

  for (const type of [
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
  ]) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }

  return "";
}

function fileNameForMime(mimeType = "") {
  return mimeType.includes("mp4")
    ? "avantiqo-voice.m4a"
    : "avantiqo-voice.webm";
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }
}

export default function HeyAvantiqoWakeBridge() {
  const pathname = usePathname();
  const businessContext = useBusinessContext();

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const recorderChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const enabledRef = useRef(false);
  const processingRef = useRef(false);
  const captureSuppressedRef = useRef(false);
  const speakingRef = useRef(false);
  const recordingUtteranceRef = useRef(false);
  const finalizingRef = useRef(false);
  const speechStartedAtRef = useRef(0);
  const lastSoundAtRef = useRef(0);
  const armedForCommandRef = useRef(false);

  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
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

    const storedEnabled =
      window.localStorage.getItem(WAKE_STORAGE_KEY) === "true";

    if (storedEnabled) {
      window.setTimeout(() => {
        startWakeAudio().catch(() => {
          enabledRef.current = false;
          setEnabled(false);
          setListening(false);
          setStatus("permission-required");
        });
      }, 350);
    }

    return () => {
      stopWakeAudio();
    };
  }, []);

  useEffect(() => {
    function handleSpeak(event) {
      const message = text(event?.detail?.message || event?.detail?.text);
      if (!message || !enabledRef.current) return;

      playSpeech(message, "speaking").catch((error) => {
        console.error("HEY_AVANTIQO_RESPONSE_PLAYBACK_ERROR", error);
        setStatus("listening");
      });
    }

    window.addEventListener("avantiqo:speak", handleSpeak);
    return () => window.removeEventListener("avantiqo:speak", handleSpeak);
  }, [organizationId, entityId]);

  function clearAnimationFrame() {
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }

  function clearUtteranceState() {
    recordingUtteranceRef.current = false;
    finalizingRef.current = false;
    recorderChunksRef.current = [];
    speechStartedAtRef.current = 0;
    lastSoundAtRef.current = Date.now();
  }

  function stopActiveRecorder() {
    const recorder = recorderRef.current;
    recorderRef.current = null;

    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.onstop = null;
        recorder.stop();
      } catch {
        // Recorder may already be stopped.
      }
    }

    clearUtteranceState();
  }

  function stopWakeAudio() {
    enabledRef.current = false;
    processingRef.current = false;
    captureSuppressedRef.current = false;
    speakingRef.current = false;
    armedForCommandRef.current = false;
    clearAnimationFrame();
    stopActiveRecorder();

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

    setListening(false);
    setProcessing(false);
    setSpeaking(false);
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
    }, 250);
  }

  async function transcribeUtterance(blob, mode) {
    if (!blob?.size || !organizationId) {
      return { transcript: "", wakeDetected: false };
    }

    const form = new FormData();
    form.append("audio", blob, fileNameForMime(blob.type));
    form.append("organizationId", organizationId);
    if (entityId) form.append("entityId", entityId);
    form.append("locale", navigator.language || "en-US");
    form.append("mode", mode);

    const response = await fetchWithTimeout(
      "/api/operator/transcribe",
      {
        method: "POST",
        credentials: "same-origin",
        body: form,
      },
      TRANSCRIPTION_TIMEOUT_MS,
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok || result?.success === false) {
      throw new Error(result?.error || "Voice transcription failed");
    }

    return {
      transcript: text(result?.transcript),
      wakeDetected: Boolean(result?.wake_detected),
    };
  }

  async function fetchSpeechAudio(message) {
    if (!organizationId || !text(message)) {
      throw new Error("Voice response context unavailable");
    }

    const response = await fetchWithTimeout(
      "/api/operator/speak",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          organizationId,
          entityId,
          text: text(message),
          locale: navigator.language || "en-US",
        }),
      },
      SPEECH_TIMEOUT_MS,
    );

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result?.error || "Voice response failed");
    }

    return response.arrayBuffer();
  }

  async function playSpeech(message, nextStatus = "listening") {
    if (!enabledRef.current || !text(message)) return;

    captureSuppressedRef.current = true;
    speakingRef.current = true;
    stopActiveRecorder();
    setSpeaking(true);
    setStatus(nextStatus);

    try {
      const audioBytes = await fetchSpeechAudio(message);
      const audioContext = audioContextRef.current;
      if (!audioContext) throw new Error("Voice playback context unavailable");

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const decoded = await audioContext.decodeAudioData(audioBytes.slice(0));
      await new Promise((resolve, reject) => {
        try {
          const source = audioContext.createBufferSource();
          source.buffer = decoded;
          source.connect(audioContext.destination);
          source.onended = resolve;
          source.start(0);
        } catch (error) {
          reject(error);
        }
      });
    } finally {
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      clearUtteranceState();
      speakingRef.current = false;
      setSpeaking(false);
      captureSuppressedRef.current = false;
      if (enabledRef.current) setStatus("listening");
    }
  }

  async function acknowledgeWake() {
    setStatus("acknowledging");

    try {
      await playSpeech("Yes?", "acknowledging");
    } catch (error) {
      console.error("HEY_AVANTIQO_ACKNOWLEDGEMENT_ERROR", error);
    }

    armedForCommandRef.current = true;
    setStatus("listening");
  }

  async function processUtterance(blob) {
    if (
      processingRef.current ||
      !enabledRef.current ||
      captureSuppressedRef.current
    ) {
      return;
    }

    const commandMode = armedForCommandRef.current;
    processingRef.current = true;
    setProcessing(true);
    setStatus(commandMode ? "understanding-command" : "listening");

    try {
      const result = await transcribeUtterance(
        blob,
        commandMode ? "command" : "wake",
      );
      const transcript = result.transcript;

      if (!transcript) {
        setStatus("listening");
        return;
      }

      if (commandMode) {
        armedForCommandRef.current = false;
        dispatchCommand(transcript);
        setStatus("waiting-answer");
        return;
      }

      if (!result.wakeDetected && !containsWakePhrase(transcript)) {
        setStatus("listening");
        return;
      }

      const immediateCommand = commandAfterWake(transcript);
      if (immediateCommand && immediateCommand !== transcript) {
        dispatchCommand(immediateCommand);
        setStatus("waiting-answer");
        return;
      }

      await acknowledgeWake();
    } catch (error) {
      console.error("HEY_AVANTIQO_WAKE_TRANSCRIPTION_ERROR", error);
      setStatus("listening");
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }

  function finishUtteranceRecording() {
    if (!recordingUtteranceRef.current || finalizingRef.current) return;

    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      clearUtteranceState();
      return;
    }

    finalizingRef.current = true;
    recordingUtteranceRef.current = false;

    recorder.onstop = () => {
      const chunks = recorderChunksRef.current;
      recorderChunksRef.current = [];
      recorderRef.current = null;
      finalizingRef.current = false;

      if (!chunks.length || captureSuppressedRef.current) return;

      const mimeType =
        recorder.mimeType || preferredAudioMimeType() || "audio/webm";
      const blob = new Blob(chunks, { type: mimeType });
      processUtterance(blob);
    };

    try {
      recorder.stop();
    } catch {
      clearUtteranceState();
    }
  }

  function startUtteranceRecording() {
    if (
      recordingUtteranceRef.current ||
      finalizingRef.current ||
      processingRef.current ||
      captureSuppressedRef.current ||
      speakingRef.current ||
      !streamRef.current
    ) {
      return;
    }

    const mimeType = preferredAudioMimeType();
    const recorder = mimeType
      ? new MediaRecorder(streamRef.current, { mimeType })
      : new MediaRecorder(streamRef.current);

    recorderChunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data?.size) recorderChunksRef.current.push(event.data);
    };

    recorder.onerror = () => {
      recorderRef.current = null;
      clearUtteranceState();
      setStatus("listening");
    };

    recorderRef.current = recorder;
    recordingUtteranceRef.current = true;
    speechStartedAtRef.current = Date.now();
    lastSoundAtRef.current = Date.now();

    recorder.start(100);
  }

  function monitorAudio() {
    const analyser = analyserRef.current;
    if (!enabledRef.current || !analyser) return;

    if (
      captureSuppressedRef.current ||
      speakingRef.current ||
      processingRef.current
    ) {
      animationFrameRef.current = window.requestAnimationFrame(monitorAudio);
      return;
    }

    const samples = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(samples);

    let sum = 0;
    for (const sample of samples) {
      const centered = (sample - 128) / 128;
      sum += centered * centered;
    }

    const rms = Math.sqrt(sum / samples.length);
    const now = Date.now();

    if (rms > SPEECH_THRESHOLD) {
      if (!recordingUtteranceRef.current && !finalizingRef.current) {
        startUtteranceRecording();
      }
      lastSoundAtRef.current = now;
    }

    if (recordingUtteranceRef.current) {
      const silentFor = now - lastSoundAtRef.current;
      const utteranceAge = now - speechStartedAtRef.current;

      if (
        (utteranceAge > 450 && silentFor > SILENCE_TO_FINISH_MS) ||
        utteranceAge > MAX_UTTERANCE_MS
      ) {
        finishUtteranceRecording();
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

    const AudioContextConstructor =
      window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextConstructor();
    await audioContext.resume?.();

    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    streamRef.current = stream;
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    enabledRef.current = true;

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

  const commandBusy =
    status === "understanding-command" || status === "waiting-answer";

  const label = !supported
    ? "Voice wake unavailable"
    : !enabled
      ? "Enable Hey Avantiqo"
      : speaking
        ? "Hey Avantiqo · Speaking"
        : commandBusy
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
        {speaking || commandBusy || (enabled && !listening) ? (
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

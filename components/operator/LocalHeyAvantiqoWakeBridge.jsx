"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic } from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import {
  averageWakeTemplates,
  createWakeFeatureFrame,
  scoreWakeCandidate,
} from "@/lib/operator/voice/localWakeMatcher";

const ENABLED_KEY = "avantiqo.local-wake.enabled";
const TEMPLATE_KEY = "avantiqo.local-wake.template.v2";
const OLD_TEMPLATE_KEY = "avantiqo.local-wake.template.v1";
const SPEECH_THRESHOLD = 0.028;
const SILENCE_MS = 700;
const MAX_SPEECH_MS = 5500;
const API_TIMEOUT_MS = 15000;

function text(value) {
  return String(value ?? "").trim();
}

function preferredMime() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"]) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return "";
}

function audioName(type = "") {
  return type.includes("mp4") ? "avantiqo-command.m4a" : "avantiqo-command.webm";
}

async function fetchWithTimeout(url, options, timeout = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export default function LocalHeyAvantiqoWakeBridge() {
  const businessContext = useBusinessContext();
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const frameRef = useRef(null);
  const enabledRef = useRef(false);
  const speakingRef = useRef(false);
  const commandModeRef = useRef(false);
  const inSpeechRef = useRef(false);
  const speechStartRef = useRef(0);
  const lastSoundRef = useRef(0);
  const featureFramesRef = useRef([]);
  const enrollmentRef = useRef([]);
  const templateRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioElementRef = useRef(null);
  const audioUrlRef = useRef(null);

  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState("off");
  const [enrollmentCount, setEnrollmentCount] = useState(0);
  const [voiceError, setVoiceError] = useState("");

  const organizationId =
    businessContext?.organization_id || businessContext?.organization?.id || null;
  const entityId =
    businessContext?.entity_id || businessContext?.entity?.id || null;

  useEffect(() => {
    const canUse = Boolean(
      navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined" &&
      (window.AudioContext || window.webkitAudioContext),
    );
    setSupported(canUse);
    if (!canUse) setStatus("unsupported");

    window.localStorage.removeItem(OLD_TEMPLATE_KEY);
    try {
      const stored = JSON.parse(window.localStorage.getItem(TEMPLATE_KEY) || "null");
      templateRef.current = Number(stored?.version) === 2 ? stored : null;
    } catch {
      templateRef.current = null;
    }

    if (canUse && window.localStorage.getItem(ENABLED_KEY) === "true") {
      window.setTimeout(() => enableWake(false), 300);
    }

    return () => stopAll();
  }, []);

  useEffect(() => {
    const handler = (event) => {
      const message = text(event?.detail?.message || event?.detail?.text);
      if (!message || !enabledRef.current) return;
      speak(message).catch((error) => {
        console.error("AVANTIQO_SPEAK_EVENT_ERROR", error);
        setVoiceError(error?.message || "Voice playback failed");
        setStatus("listening");
      });
    };
    window.addEventListener("avantiqo:speak", handler);
    return () => window.removeEventListener("avantiqo:speak", handler);
  }, [organizationId, entityId]);

  function cleanupAudio() {
    const audio = audioElementRef.current;
    audioElementRef.current = null;
    if (audio) {
      try {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      } catch {}
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }

  function stopRecorder() {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch {}
    }
  }

  function stopAll() {
    enabledRef.current = false;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    stopRecorder();
    cleanupAudio();
    for (const track of streamRef.current?.getTracks?.() || []) track.stop();
    streamRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    analyserRef.current = null;
    context?.close?.().catch(() => null);
    setEnabled(false);
  }

  function dispatchCommand(message) {
    const detail = { message: text(message), source: "voice" };
    if (!detail.message) return;

    if (document.querySelector('[data-avantiqo-home-intelligence="true"]')) {
      window.dispatchEvent(new CustomEvent("avantiqo:home-command", { detail }));
      return;
    }

    document.querySelector('button[aria-label="Open Avantiqo Operator"]')?.click?.();
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("avantiqo:operator-command", { detail }));
    }, 200);
  }

  async function transcribe(blob) {
    const form = new FormData();
    form.append("audio", blob, audioName(blob.type));
    form.append("organizationId", organizationId);
    if (entityId) form.append("entityId", entityId);
    form.append("locale", navigator.language || "en-US");
    form.append("mode", "command");

    const response = await fetchWithTimeout("/api/operator/transcribe", {
      method: "POST",
      credentials: "same-origin",
      body: form,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.success === false) {
      throw new Error(result?.error || "Voice transcription failed");
    }
    return text(result?.transcript);
  }

  async function fetchSpeech(message) {
    const response = await fetchWithTimeout("/api/operator/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        organizationId,
        entityId,
        text: message,
        locale: navigator.language || "en-US",
      }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result?.error || `Voice response failed (${response.status})`);
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error("Voice response returned empty audio");
    return blob;
  }

  async function playSpeechBlob(blob) {
    cleanupAudio();
    const url = URL.createObjectURL(blob);
    audioUrlRef.current = url;
    const audio = new Audio();
    audio.preload = "auto";
    audio.playsInline = true;
    audio.volume = 1;
    audio.src = url;
    audioElementRef.current = audio;

    await new Promise((resolve, reject) => {
      let started = false;
      audio.onplaying = () => {
        started = true;
        setStatus("speaking");
      };
      audio.onended = resolve;
      audio.onerror = () => reject(new Error("Safari could not play Avantiqo audio"));
      const playPromise = audio.play();
      if (playPromise?.catch) {
        playPromise.catch((error) => reject(new Error(error?.message || "Audio playback was blocked")));
      }
      window.setTimeout(() => {
        if (!started && audio.paused) reject(new Error("Audio playback did not start"));
      }, 2500);
    });
    cleanupAudio();
  }

  async function speak(message) {
    if (!enabledRef.current || !text(message)) return;
    speakingRef.current = true;
    setVoiceError("");
    setStatus("preparing-speech");
    try {
      const blob = await fetchSpeech(message);
      await playSpeechBlob(blob);
    } catch (error) {
      console.error("AVANTIQO_VOICE_PLAYBACK_ERROR", error);
      setVoiceError(error?.message || "Voice playback failed");
      setStatus("voice-error");
      throw error;
    } finally {
      speakingRef.current = false;
      inSpeechRef.current = false;
      featureFramesRef.current = [];
      lastSoundRef.current = Date.now();
    }
  }

  async function acknowledge() {
    commandModeRef.current = false;
    try {
      await speak("Yes?");
    } catch {
      commandModeRef.current = false;
      return;
    }
    if (!enabledRef.current) return;
    commandModeRef.current = true;
    setStatus("listening-command");
  }

  function startCommandRecorder() {
    if (!streamRef.current || recorderRef.current) return;
    const mime = preferredMime();
    const recorder = mime
      ? new MediaRecorder(streamRef.current, { mimeType: mime })
      : new MediaRecorder(streamRef.current);
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunksRef.current.push(event.data);
    };
    recorderRef.current = recorder;
    recorder.start(100);
  }

  function finishCommandRecorder() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.onstop = async () => {
      recorderRef.current = null;
      const chunks = chunksRef.current;
      chunksRef.current = [];
      if (!chunks.length) return;
      const blob = new Blob(chunks, { type: recorder.mimeType || preferredMime() || "audio/webm" });
      setStatus("understanding");
      try {
        const transcript = await transcribe(blob);
        commandModeRef.current = false;
        if (transcript) {
          dispatchCommand(transcript);
          setStatus("waiting-answer");
        } else {
          setStatus("listening");
        }
      } catch (error) {
        console.error("AVANTIQO_COMMAND_TRANSCRIPTION_ERROR", error);
        commandModeRef.current = false;
        setVoiceError(error?.message || "Voice transcription failed");
        setStatus("listening");
      }
    };
    recorder.stop();
  }

  async function handleWakeCandidate(frames, durationMs) {
    const template = templateRef.current;
    if (!template) {
      enrollmentRef.current = [
        ...enrollmentRef.current,
        { frames, duration_ms: durationMs },
      ];
      const count = enrollmentRef.current.length;
      setEnrollmentCount(count);
      if (count < 3) {
        setStatus("enrolling");
        return;
      }

      const learned = averageWakeTemplates(enrollmentRef.current);
      if (!learned) {
        enrollmentRef.current = [];
        setEnrollmentCount(0);
        setVoiceError("Please say Hey Avantiqo three times at a similar speed.");
        setStatus("enrolling");
        return;
      }

      templateRef.current = learned;
      window.localStorage.setItem(TEMPLATE_KEY, JSON.stringify(learned));
      enrollmentRef.current = [];
      setEnrollmentCount(3);
      setStatus("listening");
      return;
    }

    const match = scoreWakeCandidate(frames, template, durationMs);
    if (!match.matched) {
      setStatus("listening");
      return;
    }

    await acknowledge();
  }

  function monitor() {
    if (!enabledRef.current || !analyserRef.current) return;
    const analyser = analyserRef.current;

    if (speakingRef.current) {
      frameRef.current = requestAnimationFrame(monitor);
      return;
    }

    const samples = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) {
      const centered = (sample - 128) / 128;
      sum += centered * centered;
    }
    const rms = Math.sqrt(sum / Math.max(1, samples.length));
    const now = Date.now();

    if (rms > SPEECH_THRESHOLD) {
      if (!inSpeechRef.current) {
        inSpeechRef.current = true;
        speechStartRef.current = now;
        featureFramesRef.current = [];
        if (commandModeRef.current) startCommandRecorder();
      }
      lastSoundRef.current = now;
      const feature = createWakeFeatureFrame({ analyser, rms });
      if (feature) featureFramesRef.current.push(feature);
    }

    if (inSpeechRef.current) {
      const silentFor = now - lastSoundRef.current;
      const duration = now - speechStartRef.current;
      if (silentFor >= SILENCE_MS || duration >= MAX_SPEECH_MS) {
        const frames = featureFramesRef.current;
        featureFramesRef.current = [];
        inSpeechRef.current = false;

        if (commandModeRef.current) {
          finishCommandRecorder();
        } else if (frames.length >= 5) {
          handleWakeCandidate(frames, duration).catch((error) => {
            console.error("LOCAL_WAKE_MATCH_ERROR", error);
            setStatus("listening");
          });
        }
      }
    }

    frameRef.current = requestAnimationFrame(monitor);
  }

  async function unlockAudio() {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    const context = audioContextRef.current || new AudioContextCtor();
    audioContextRef.current = context;
    if (context.state === "suspended") await context.resume();

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    gain.gain.value = 0.00001;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.02);
  }

  async function enableWake(persist = true) {
    if (!supported || enabledRef.current) return;
    try {
      setVoiceError("");
      await unlockAudio();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const context = audioContextRef.current;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.25;
      source.connect(analyser);

      streamRef.current = stream;
      analyserRef.current = analyser;
      enabledRef.current = true;
      setEnabled(true);
      setStatus(templateRef.current ? "listening" : "enrolling");
      if (persist) window.localStorage.setItem(ENABLED_KEY, "true");
      monitor();
    } catch (error) {
      console.error("LOCAL_WAKE_ENABLE_ERROR", error);
      setVoiceError(error?.message || "Microphone/audio permission failed");
      setStatus("permission-error");
      window.localStorage.removeItem(ENABLED_KEY);
    }
  }

  function disableWake() {
    window.localStorage.removeItem(ENABLED_KEY);
    stopAll();
    setStatus("off");
  }

  function relearnWake() {
    window.localStorage.removeItem(TEMPLATE_KEY);
    templateRef.current = null;
    enrollmentRef.current = [];
    setEnrollmentCount(0);
    commandModeRef.current = false;
    setVoiceError("");
    setStatus("enrolling");
  }

  let label = "Enable Hey Avantiqo";
  if (!supported) label = "Voice wake unavailable";
  else if (status === "permission-error") label = "Microphone permission required";
  else if (status === "enrolling") label = `Say “Hey Avantiqo” · ${Math.min(enrollmentCount + 1, 3)}/3`;
  else if (status === "preparing-speech") label = "Avantiqo · Preparing voice";
  else if (status === "speaking") label = "Avantiqo · Speaking";
  else if (status === "voice-error") label = "Avantiqo · Voice error";
  else if (status === "listening-command") label = "Avantiqo · Listening";
  else if (status === "understanding") label = "Avantiqo · Understanding";
  else if (status === "waiting-answer") label = "Avantiqo · Working";
  else if (enabled) label = "Hey Avantiqo · Listening";

  return (
    <div className="fixed bottom-6 right-6 z-[95] flex flex-col items-end gap-2">
      {voiceError ? (
        <div className="max-w-[360px] rounded-xl border border-red-400/20 bg-black/90 px-3 py-2 text-[10px] text-red-200/80 backdrop-blur-xl">
          {voiceError}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        {enabled && templateRef.current ? (
          <button
            type="button"
            onClick={relearnWake}
            className="rounded-full border border-white/10 bg-black/75 px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-white/45 backdrop-blur-xl hover:text-white/75"
          >
            Relearn
          </button>
        ) : null}

        <button
          type="button"
          onClick={enabled ? disableWake : () => enableWake(true)}
          disabled={!supported}
          className={
            enabled
              ? "flex h-12 items-center gap-3 rounded-full border border-emerald-400/30 bg-[#07100B]/95 px-5 text-emerald-200 shadow-[0_20px_70px_rgba(0,0,0,.65)] backdrop-blur-2xl"
              : "flex h-12 items-center gap-3 rounded-full border border-[#D6A66A]/35 bg-[#0A0A0A]/95 px-5 text-white shadow-[0_20px_70px_rgba(0,0,0,.65)] backdrop-blur-2xl"
          }
        >
          {[
            "understanding",
            "waiting-answer",
            "preparing-speech",
            "speaking",
          ].includes(status) ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Mic size={15} />
          )}
          <span className="text-[11px] font-medium uppercase tracking-[0.13em]">{label}</span>
        </button>
      </div>
    </div>
  );
}

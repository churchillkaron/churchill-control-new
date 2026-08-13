"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic } from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import {
  averageWakeTemplates,
  createWakeFeatureFrame,
  scoreWakeCandidate,
} from "@/lib/operator/voice/localWakeMatcher";

const ENABLED_KEY = "avantiqo.local-wake.enabled";
const TEMPLATE_KEY = "avantiqo.local-wake.template.v2";
const LEGACY_TEMPLATE_KEY = "avantiqo.local-wake.template.v1";
const SPEECH_THRESHOLD = 0.035;
const SILENCE_MS = 650;
const MAX_WAKE_MS = 2800;
const MAX_COMMAND_MS = 15000;
const API_TIMEOUT_MS = 20000;
const WAKE_COOLDOWN_MS = 2200;
const FOLLOW_UP_WINDOW_MS = 15000;

function text(value) {
  return String(value ?? "").trim();
}

function routeOrganizationId(params) {
  const value = params?.organizationId;
  if (Array.isArray(value)) return text(value[0]);
  return text(value);
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
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
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
  const lastWakeRef = useRef(0);
  const featureFramesRef = useRef([]);
  const enrollmentRef = useRef([]);
  const templateRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const playbackRef = useRef(null);
  const followUpTimerRef = useRef(null);
  const conversationRef = useRef([]);
  const agreementStateRef = useRef({});
  const acknowledgementRef = useRef(null);
  const acknowledgementPreparingRef = useRef(null);
  const previousAcknowledgementRef = useRef(null);

  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState("off");
  const [enrollmentCount, setEnrollmentCount] = useState(0);
  const [voiceError, setVoiceError] = useState("");

  const organizationId =
    text(businessContext?.organization_id) ||
    text(businessContext?.organization?.id) ||
    routeOrganizationId(params) ||
    null;

  const organizationName =
    text(businessContext?.organization?.name) || null;

  const entityId =
    text(businessContext?.entity_id) ||
    text(businessContext?.entity?.id) ||
    null;

  const periodId =
    text(businessContext?.period_id) ||
    text(businessContext?.period?.id) ||
    null;

  const contextReady = Boolean(organizationId);

  useEffect(() => {
    const canUse = Boolean(
      navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined" &&
      (window.AudioContext || window.webkitAudioContext),
    );

    setSupported(canUse);
    window.localStorage.removeItem(LEGACY_TEMPLATE_KEY);

    try {
      const stored = JSON.parse(window.localStorage.getItem(TEMPLATE_KEY) || "null");
      templateRef.current = Number(stored?.version) === 2 ? stored : null;
      if (!templateRef.current) window.localStorage.removeItem(TEMPLATE_KEY);
    } catch {
      templateRef.current = null;
      window.localStorage.removeItem(TEMPLATE_KEY);
    }

    return () => stopAll();
  }, []);

  useEffect(() => {
    if (!supported || !contextReady || enabledRef.current) return;
    if (window.localStorage.getItem(ENABLED_KEY) !== "true") return;

    const timer = window.setTimeout(() => enableWake(false), 350);
    return () => window.clearTimeout(timer);
  }, [supported, contextReady, organizationId]);

  function clearFollowUpTimer() {
    if (!followUpTimerRef.current) return;
    window.clearTimeout(followUpTimerRef.current);
    followUpTimerRef.current = null;
  }

  function armCommandMode() {
    if (!enabledRef.current) return;

    clearFollowUpTimer();
    commandModeRef.current = true;
    setStatus("listening-command");

    followUpTimerRef.current = window.setTimeout(() => {
      commandModeRef.current = false;
      if (enabledRef.current) setStatus("listening");
    }, FOLLOW_UP_WINDOW_MS);
  }

  function stopRecorder() {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch {}
    }
  }

  function stopPlayback() {
    const playback = playbackRef.current;
    playbackRef.current = null;
    if (!playback) return;
    try {
      playback.pause();
      playback.removeAttribute("src");
      playback.load();
    } catch {}
  }

  function stopAll() {
    enabledRef.current = false;
    speakingRef.current = false;
    commandModeRef.current = false;
    inSpeechRef.current = false;
    clearFollowUpTimer();

    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;

    stopRecorder();
    stopPlayback();

    for (const track of streamRef.current?.getTracks?.() || []) track.stop();
    streamRef.current = null;

    const context = audioContextRef.current;
    audioContextRef.current = null;
    analyserRef.current = null;
    context?.close?.().catch(() => null);

    setEnabled(false);
  }

  async function transcribe(blob) {
    if (!organizationId) throw new Error("Organization context is not ready");

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
    if (!organizationId) throw new Error("Organization context is not ready");

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

  async function fetchAcknowledgementText() {
    const response = await fetchWithTimeout("/api/operator/voice/acknowledgement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        organizationId,
        entityId,
        organizationName,
        locale: navigator.language || "en-US",
        previousAcknowledgement: previousAcknowledgementRef.current,
      }),
    }, 30000);

    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.success === false) {
      throw new Error(result?.error || "Avantiqo acknowledgement failed");
    }

    const acknowledgement = text(result?.acknowledgement);
    if (!acknowledgement) throw new Error("Avantiqo returned no acknowledgement");
    return acknowledgement;
  }

  async function prepareAcknowledgement() {
    if (!organizationId) return null;
    if (acknowledgementRef.current) return acknowledgementRef.current;
    if (acknowledgementPreparingRef.current) return acknowledgementPreparingRef.current;

    acknowledgementPreparingRef.current = (async () => {
      const acknowledgement = await fetchAcknowledgementText();
      const audio = await fetchSpeech(acknowledgement);
      const prepared = { acknowledgement, audio };
      acknowledgementRef.current = prepared;
      return prepared;
    })();

    try {
      return await acknowledgementPreparingRef.current;
    } finally {
      acknowledgementPreparingRef.current = null;
    }
  }

  async function playAudioBlob(blob) {
    const url = URL.createObjectURL(blob);

    try {
      await new Promise((resolve, reject) => {
        const audio = new Audio();
        playbackRef.current = audio;
        audio.preload = "auto";
        audio.volume = 1;

        const cleanup = () => {
          audio.onplaying = null;
          audio.onended = null;
          audio.onerror = null;
        };

        audio.onplaying = () => setStatus("speaking");
        audio.onended = () => {
          cleanup();
          resolve();
        };
        audio.onerror = () => {
          cleanup();
          reject(new Error("Safari could not play Avantiqo voice audio"));
        };

        audio.src = url;
        audio.load();
        audio.play()?.catch?.((error) => {
          cleanup();
          reject(new Error(error?.message || "Safari blocked voice playback"));
        });
      });
    } finally {
      playbackRef.current = null;
      URL.revokeObjectURL(url);
    }
  }

  async function speakRemote(message) {
    if (!enabledRef.current || !text(message)) return;

    speakingRef.current = true;
    setVoiceError("");
    setStatus("preparing-speech");

    try {
      const blob = await fetchSpeech(message);
      await playAudioBlob(blob);
    } finally {
      speakingRef.current = false;
      inSpeechRef.current = false;
      featureFramesRef.current = [];
      lastSoundRef.current = Date.now();
    }
  }

  async function acknowledge() {
    const now = Date.now();
    if (now - lastWakeRef.current < WAKE_COOLDOWN_MS) return;
    lastWakeRef.current = now;

    clearFollowUpTimer();
    commandModeRef.current = false;
    speakingRef.current = true;
    setVoiceError("");

    try {
      const prepared = acknowledgementRef.current || await prepareAcknowledgement();
      if (!prepared?.audio) throw new Error("Avantiqo voice acknowledgement is not ready");

      acknowledgementRef.current = null;
      previousAcknowledgementRef.current = prepared.acknowledgement;
      await playAudioBlob(prepared.audio);
    } catch (error) {
      console.error("AVANTIQO_ACKNOWLEDGEMENT_ERROR", error);
      setVoiceError(error?.message || "Avantiqo could not acknowledge the wake phrase");
    } finally {
      speakingRef.current = false;
      inSpeechRef.current = false;
      featureFramesRef.current = [];
      lastSoundRef.current = Date.now();
    }

    armCommandMode();
    prepareAcknowledgement().catch((error) => {
      console.error("AVANTIQO_ACKNOWLEDGEMENT_PREFETCH_ERROR", error);
    });
  }

  async function runVoiceCommand(message) {
    const cleanMessage = text(message);
    if (!cleanMessage || !organizationId) return;

    clearFollowUpTimer();
    commandModeRef.current = false;
    setStatus("working");
    setVoiceError("");

    const priorConversation = conversationRef.current.slice(-12);
    conversationRef.current = [
      ...priorConversation,
      { role: "user", content: cleanMessage },
    ];

    try {
      const response = await fetchWithTimeout("/api/operator/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          organizationId,
          entityId,
          periodId,
          pathname,
          message: cleanMessage,
          source: "voice",
          locale: navigator.language || "en-US",
          agreementState: agreementStateRef.current,
          conversation: priorConversation,
        }),
      }, 45000);

      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || "Avantiqo could not complete that request");
      }

      const decision = result?.decision || {};
      const answer = text(decision?.response_text) || "Done.";

      agreementStateRef.current =
        result?.agreement_state ||
        decision?.agreement_state ||
        agreementStateRef.current;

      conversationRef.current = [
        ...conversationRef.current,
        { role: "assistant", content: answer },
      ].slice(-12);

      if (result?.navigation?.href) router.push(result.navigation.href);

      try {
        await speakRemote(answer);
      } catch (error) {
        console.error("AVANTIQO_ANSWER_PLAYBACK_ERROR", error);
        setVoiceError(error?.message || "I completed the request but could not speak the answer");
      }

      if (enabledRef.current) armCommandMode();
    } catch (error) {
      console.error("AVANTIQO_VOICE_OPERATOR_ERROR", error);
      setVoiceError(error?.message || "Voice request failed");
      if (enabledRef.current) setStatus("listening");
    }
  }

  function startCommandRecorder() {
    if (!streamRef.current || recorderRef.current) return;

    clearFollowUpTimer();

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
      commandModeRef.current = false;

      if (!chunks.length) {
        setStatus("listening");
        return;
      }

      const blob = new Blob(chunks, {
        type: recorder.mimeType || preferredMime() || "audio/webm",
      });

      setStatus("understanding");
      setVoiceError("");

      try {
        const transcript = await transcribe(blob);
        if (transcript) await runVoiceCommand(transcript);
        else setStatus("listening");
      } catch (error) {
        console.error("AVANTIQO_COMMAND_TRANSCRIPTION_ERROR", error);
        setVoiceError(error?.message || "I couldn't understand that");
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
        setVoiceError("Please teach Hey Avantiqo three times at a similar pace");
        setStatus("enrolling");
        return;
      }

      templateRef.current = learned;
      window.localStorage.setItem(TEMPLATE_KEY, JSON.stringify(learned));
      enrollmentRef.current = [];
      setEnrollmentCount(3);
      setStatus("preparing-acknowledgement");
      try {
        await prepareAcknowledgement();
        setStatus("listening");
      } catch (error) {
        setVoiceError(error?.message || "Avantiqo voice preparation failed");
        setStatus("voice-error");
      }
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
      const maxDuration = commandModeRef.current ? MAX_COMMAND_MS : MAX_WAKE_MS;

      if (silentFor >= SILENCE_MS || duration >= maxDuration) {
        const frames = featureFramesRef.current;
        featureFramesRef.current = [];
        inSpeechRef.current = false;

        if (commandModeRef.current) {
          finishCommandRecorder();
        } else if (frames.length >= 6 && duration >= 350 && duration <= MAX_WAKE_MS) {
          handleWakeCandidate(frames, duration).catch((error) => {
            console.error("LOCAL_WAKE_MATCH_ERROR", error);
            setStatus("listening");
          });
        }
      }
    }

    frameRef.current = requestAnimationFrame(monitor);
  }

  async function unlockSafariAudio() {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;

    const context = new AudioContextCtor();
    if (context.state === "suspended") await context.resume();

    const buffer = context.createBuffer(1, 1, 22050);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start(0);

    return context;
  }

  async function enableWake(persist = true) {
    if (!supported || enabledRef.current || !organizationId) return;

    setVoiceError("");
    setStatus("starting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const context = await unlockSafariAudio();
      if (!context) throw new Error("Browser audio is unavailable");

      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.2;
      source.connect(analyser);

      streamRef.current = stream;
      audioContextRef.current = context;
      analyserRef.current = analyser;
      enabledRef.current = true;
      setEnabled(true);

      if (persist) window.localStorage.setItem(ENABLED_KEY, "true");

      const hasTemplate = Number(templateRef.current?.version) === 2;
      if (!hasTemplate) {
        setStatus("enrolling");
      } else {
        setStatus("preparing-acknowledgement");
        await prepareAcknowledgement();
        setStatus("listening");
      }

      monitor();
    } catch (error) {
      console.error("LOCAL_WAKE_ENABLE_ERROR", error);
      setVoiceError(error?.message || "Microphone or voice preparation failed");
      setStatus("voice-error");
      window.localStorage.removeItem(ENABLED_KEY);
      stopAll();
    }
  }

  function disableWake() {
    window.localStorage.removeItem(ENABLED_KEY);
    stopAll();
    setVoiceError("");
    setStatus("off");
  }

  function handleControlClick(event) {
    if (!contextReady) return;

    if (event?.shiftKey && enabled) {
      window.localStorage.removeItem(TEMPLATE_KEY);
      templateRef.current = null;
      enrollmentRef.current = [];
      setEnrollmentCount(0);
      commandModeRef.current = false;
      setVoiceError("");
      setStatus("enrolling");
      return;
    }

    if (enabled) disableWake();
    else enableWake(true);
  }

  let label = "Enable Hey Avantiqo";
  if (!contextReady) label = "Avantiqo voice loading";
  else if (!supported) label = "Voice wake unavailable";
  else if (status === "starting") label = "Avantiqo · Starting";
  else if (status === "enrolling") {
    label = `Say “Hey Avantiqo” · ${Math.min(enrollmentCount + 1, 3)}/3`;
  } else if (status === "preparing-acknowledgement") label = "Avantiqo · Preparing voice";
  else if (status === "speaking") label = "Avantiqo · Speaking";
  else if (status === "listening-command") label = "Avantiqo · Listening";
  else if (status === "understanding") label = "Avantiqo · Understanding";
  else if (status === "working") label = "Avantiqo · Working";
  else if (status === "preparing-speech") label = "Avantiqo · Preparing answer";
  else if (status === "voice-error") label = "Avantiqo · Voice error";
  else if (enabled) label = "Hey Avantiqo · Listening";

  return (
    <div className="fixed bottom-6 right-6 z-[95] flex flex-col items-end gap-2">
      {voiceError ? (
        <div className="max-w-[340px] rounded-2xl border border-red-400/25 bg-[#160909]/95 px-4 py-2 text-[11px] text-red-200 shadow-xl backdrop-blur-xl">
          {voiceError}
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleControlClick}
        disabled={!supported || !contextReady}
        title={enabled ? "Click to disable. Shift-click to relearn Hey Avantiqo." : "Enable Hey Avantiqo"}
        className={
          enabled
            ? "flex h-12 items-center gap-3 rounded-full border border-emerald-400/30 bg-[#07100B]/95 px-5 text-emerald-200 shadow-[0_20px_70px_rgba(0,0,0,.65)] backdrop-blur-2xl disabled:opacity-45"
            : "flex h-12 items-center gap-3 rounded-full border border-[#D6A66A]/35 bg-[#0A0A0A]/95 px-5 text-white shadow-[0_20px_70px_rgba(0,0,0,.65)] backdrop-blur-2xl disabled:opacity-45"
        }
      >
        {["starting", "preparing-acknowledgement", "understanding", "working", "preparing-speech"].includes(status) ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <Mic size={15} />
        )}
        <span className="text-[11px] font-medium uppercase tracking-[0.13em]">
          {label}
        </span>
      </button>
    </div>
  );
}

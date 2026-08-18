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
const ACK_KEY = "avantiqo.voice.acknowledgement.v1";
const MIN_SPEECH_THRESHOLD = 0.032;
const NOISE_MULTIPLIER = 3.2;
const SPEECH_ONSET_MS = 110;
const SILENCE_MS = 500;
const MAX_WAKE_MS = 2800;
const MAX_COMMAND_MS = 15000;
const WAKE_COOLDOWN_MS = 2200;
const FOLLOW_UP_WINDOW_MS = 15000;
const TRANSCRIBE_TIMEOUT_MS = 8000;
const TURN_TIMEOUT_MS = 15000;
const SPEECH_TIMEOUT_MS = 12000;
const ACK_REFRESH_TIMEOUT_MS = 6000;
const NATIVE_INTERIM_COMMIT_MS = 350;
const PROCESSING_ACK_DELAY_MS = 250;
const FAST_BROWSER_SPEECH_MAX_CHARS = 420;

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

function speechRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

async function fetchWithTimeout(url, options, timeout, timeoutMessage = "Request timed out") {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(timeoutMessage);
    }
    throw error;
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
  const acknowledgementRef = useRef("");
  const acknowledgementRefreshingRef = useRef(false);
  const recognitionRef = useRef(null);
  const recognitionActiveRef = useRef(false);
  const recognitionHandledRef = useRef(false);
  const recognitionCommitTimerRef = useRef(null);
  const recognitionInterimRef = useRef("");
  const processingAckTimerRef = useRef(null);
  const processingAckUtteranceRef = useRef(null);
  const noiseFloorRef = useRef(0.012);
  const speechOnsetRef = useRef(0);
  const onsetFramesRef = useRef([]);

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

  const organizationName = text(businessContext?.organization?.name) || null;
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

    try {
      const storedTemplate = JSON.parse(
        window.localStorage.getItem(TEMPLATE_KEY) || "null",
      );
      templateRef.current =
        Number(storedTemplate?.version) === 2 ? storedTemplate : null;

      acknowledgementRef.current = text(
        window.localStorage.getItem(ACK_KEY),
      );
    } catch {
      templateRef.current = null;
      acknowledgementRef.current = "";
    }

    return () => stopAll();
  }, []);

  useEffect(() => {
    if (!contextReady) return;

    refreshAcknowledgement().catch(() => null);

    if (!supported || enabledRef.current) return;
    if (window.localStorage.getItem(ENABLED_KEY) !== "true") return;

    const timer = window.setTimeout(() => enableWake(false), 250);
    return () => window.clearTimeout(timer);
  }, [supported, contextReady, organizationId]);

  function clearFollowUpTimer() {
    if (!followUpTimerRef.current) return;
    window.clearTimeout(followUpTimerRef.current);
    followUpTimerRef.current = null;
  }

  function clearProcessingAcknowledgement() {
    if (processingAckTimerRef.current) {
      window.clearTimeout(processingAckTimerRef.current);
      processingAckTimerRef.current = null;
    }

    const utterance = processingAckUtteranceRef.current;
    processingAckUtteranceRef.current = null;

    if (utterance && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    if (utterance) speakingRef.current = false;
  }

  function scheduleProcessingAcknowledgement() {
    if (
      processingAckTimerRef.current ||
      processingAckUtteranceRef.current ||
      !window.speechSynthesis ||
      typeof SpeechSynthesisUtterance === "undefined"
    ) {
      return;
    }

    processingAckTimerRef.current = window.setTimeout(() => {
      processingAckTimerRef.current = null;
      if (!enabledRef.current || processingAckUtteranceRef.current) return;

      const utterance = new SpeechSynthesisUtterance("Got it.");
      utterance.lang = navigator.language || "en-US";
      utterance.rate = 1.08;
      utterance.pitch = 1;
      utterance.volume = 1;
      processingAckUtteranceRef.current = utterance;
      speakingRef.current = true;

      const finish = () => {
        if (processingAckUtteranceRef.current !== utterance) return;
        processingAckUtteranceRef.current = null;
        speakingRef.current = false;
        lastSoundRef.current = Date.now();
        if (enabledRef.current) setStatus("working");
      };

      utterance.onend = finish;
      utterance.onerror = finish;

      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      } catch {
        finish();
      }
    }, PROCESSING_ACK_DELAY_MS);
  }

  function stopRecognition() {
    if (recognitionCommitTimerRef.current) {
      window.clearTimeout(recognitionCommitTimerRef.current);
      recognitionCommitTimerRef.current = null;
    }
    recognitionInterimRef.current = "";

    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognitionActiveRef.current = false;
    recognitionHandledRef.current = false;

    if (!recognition) return;

    try {
      recognition.abort();
    } catch {}
  }

  function armCommandMode() {
    if (!enabledRef.current) return;

    clearFollowUpTimer();
    commandModeRef.current = true;
    setStatus("listening-command");

    if (!startNativeRecognition()) {
      recognitionActiveRef.current = false;
    }

    followUpTimerRef.current = window.setTimeout(() => {
      commandModeRef.current = false;
      stopRecognition();
      if (enabledRef.current) setStatus("listening");
    }, FOLLOW_UP_WINDOW_MS);
  }

  function stopRecorder() {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {}
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
    clearProcessingAcknowledgement();
    stopRecognition();

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

  async function refreshAcknowledgement() {
    if (!organizationId || acknowledgementRefreshingRef.current) return;

    acknowledgementRefreshingRef.current = true;

    try {
      const response = await fetchWithTimeout(
        "/api/operator/voice/acknowledgement",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            organizationId,
            entityId,
            organizationName,
            locale: navigator.language || "en-US",
            previousAcknowledgement: acknowledgementRef.current || null,
          }),
        },
        ACK_REFRESH_TIMEOUT_MS,
        "Background acknowledgement refresh timed out",
      );

      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) return;

      const acknowledgement = text(result?.acknowledgement);
      if (!acknowledgement) return;

      acknowledgementRef.current = acknowledgement;
      window.localStorage.setItem(ACK_KEY, acknowledgement);
    } catch (error) {
      console.warn("AVANTIQO_ACK_REFRESH_SKIPPED", error?.message || error);
    } finally {
      acknowledgementRefreshingRef.current = false;
    }
  }

  async function speakBrowser(message) {
    const clean = text(message);
    if (!clean || !window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
      return false;
    }

    return await new Promise((resolve) => {
      let settled = false;
      let timeoutId = null;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        if (timeoutId) window.clearTimeout(timeoutId);
        resolve(value);
      };

      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = navigator.language || "en-US";
      utterance.rate = 1.04;
      utterance.pitch = 1;
      utterance.volume = 1;
      utterance.onstart = () => setStatus("speaking");
      utterance.onend = () => finish(true);
      utterance.onerror = () => finish(false);

      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      } catch {
        finish(false);
      }

      const estimatedSpeechMs = Math.max(
        4000,
        Math.min(20000, clean.split(/\s+/).filter(Boolean).length * 520),
      );
      timeoutId = window.setTimeout(() => finish(false), estimatedSpeechMs);
    });
  }

  async function fetchSpeech(message) {
    const response = await fetchWithTimeout(
      "/api/operator/speak",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          organizationId,
          entityId,
          text: message,
          locale: navigator.language || "en-US",
        }),
      },
      SPEECH_TIMEOUT_MS,
      "Voice generation timed out",
    );

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result?.error || "Voice generation failed");
    }

    const blob = await response.blob();
    if (!blob.size) throw new Error("Voice generation returned no audio");
    return blob;
  }

  async function playAudioBlob(blob) {
    const url = URL.createObjectURL(blob);

    try {
      await new Promise((resolve, reject) => {
        const audio = new Audio();
        playbackRef.current = audio;
        audio.preload = "auto";
        audio.volume = 1;
        audio.onplaying = () => setStatus("speaking");
        audio.onended = resolve;
        audio.onerror = () => reject(new Error("Safari could not play Avantiqo voice"));
        audio.src = url;
        audio.load();
        audio.play()?.catch?.(reject);
      });
    } finally {
      playbackRef.current = null;
      URL.revokeObjectURL(url);
    }
  }

  async function speakAnswer(message) {
    clearProcessingAcknowledgement();
    speakingRef.current = true;
    setVoiceError("");
    stopRecognition();

    try {
      setStatus("speaking");
      if (text(message).length <= FAST_BROWSER_SPEECH_MAX_CHARS) {
        const spoken = await speakBrowser(message);
        if (spoken) return;
      }

      const blob = await fetchSpeech(message);
      await playAudioBlob(blob);
    } catch (error) {
      const spoken = await speakBrowser(message);
      if (!spoken) throw error;
    } finally {
      speakingRef.current = false;
      inSpeechRef.current = false;
      featureFramesRef.current = [];
      lastSoundRef.current = Date.now();
    }
  }

  async function speakRecovery() {
    clearProcessingAcknowledgement();
    speakingRef.current = true;
    stopRecognition();
    setStatus("speaking");

    try {
      return await speakBrowser(
        "I couldn't answer that just now. Please try again.",
      );
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
    clearProcessingAcknowledgement();
    commandModeRef.current = false;
    stopRecognition();
    speakingRef.current = true;
    setVoiceError("");

    const acknowledgement = acknowledgementRef.current || "I'm here.";

    try {
      await speakBrowser(acknowledgement);
    } finally {
      speakingRef.current = false;
      inSpeechRef.current = false;
      featureFramesRef.current = [];
      lastSoundRef.current = Date.now();
    }

    armCommandMode();
    refreshAcknowledgement().catch(() => null);
  }

  async function transcribe(blob) {
    const form = new FormData();
    form.append("audio", blob, audioName(blob.type));
    form.append("organizationId", organizationId);
    if (entityId) form.append("entityId", entityId);
    form.append("locale", navigator.language || "en-US");
    form.append("mode", "command");

    const response = await fetchWithTimeout(
      "/api/operator/transcribe",
      {
        method: "POST",
        credentials: "same-origin",
        body: form,
      },
      TRANSCRIBE_TIMEOUT_MS,
      "Voice transcription timed out",
    );

    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.success === false) {
      throw new Error(result?.error || "I couldn't understand that");
    }

    return text(result?.transcript);
  }

  async function runVoiceCommand(message) {
    const cleanMessage = text(message);
    if (!cleanMessage || !organizationId) return;

    clearFollowUpTimer();
    commandModeRef.current = false;
    stopRecognition();
    setStatus("working");
    setVoiceError("");
    scheduleProcessingAcknowledgement();

    const priorConversation = conversationRef.current.slice(-12);
    conversationRef.current = [
      ...priorConversation,
      { role: "user", content: cleanMessage },
    ];

    try {
      const response = await fetchWithTimeout(
        "/api/operator/turn",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            organizationId,
            entityId,
            periodId,
            conversationKey: "primary",
            pathname,
            message: cleanMessage,
            source: "voice",
            locale: navigator.language || "en-US",
            agreementState: agreementStateRef.current,
            conversation: priorConversation,
          }),
        },
        TURN_TIMEOUT_MS,
        "Avantiqo took too long to complete that request",
      );

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

      await speakAnswer(answer).catch((error) => {
        setVoiceError(error?.message || "I completed it but couldn't speak the answer");
      });

      if (enabledRef.current) armCommandMode();
    } catch (error) {
      clearProcessingAcknowledgement();
      const failureDetail = error?.message || "Voice request failed";
      console.error("AVANTIQO_VOICE_COMMAND_ERROR", failureDetail);
      setVoiceError(failureDetail);

      const recoveredByVoice = await speakRecovery().catch(() => false);
      if (enabledRef.current) {
        armCommandMode();
      } else {
        setStatus(recoveredByVoice ? "off" : "voice-error");
      }
    }
  }

  function startNativeRecognition() {
    const Recognition = speechRecognitionCtor();
    if (!Recognition || !enabledRef.current || speakingRef.current) return false;

    stopRecognition();

    try {
      const recognition = new Recognition();
      recognitionRef.current = recognition;
      recognitionActiveRef.current = true;
      recognitionHandledRef.current = false;

      recognition.lang = navigator.language || "en-US";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        if (enabledRef.current && commandModeRef.current) {
          setStatus("listening-command");
        }
      };

      recognition.onresult = (event) => {
        let transcriptText = "";
        let hasFinal = false;
        let confidence = null;

        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          transcriptText += ` ${result?.[0]?.transcript || ""}`;
          hasFinal = hasFinal || Boolean(result?.isFinal);
          const candidateConfidence = Number(result?.[0]?.confidence);
          if (Number.isFinite(candidateConfidence) && candidateConfidence > 0) {
            confidence = Math.max(confidence || 0, candidateConfidence);
          }
        }

        const transcript = text(transcriptText);
        if (!transcript || recognitionHandledRef.current) return;
        if (confidence !== null && confidence < 0.32) return;

        recognitionInterimRef.current = transcript;
        if (recognitionCommitTimerRef.current) {
          window.clearTimeout(recognitionCommitTimerRef.current);
          recognitionCommitTimerRef.current = null;
        }

        const commitTranscript = () => {
          const committed = text(recognitionInterimRef.current);
          if (!committed || recognitionHandledRef.current) return;

          recognitionHandledRef.current = true;
          recognitionActiveRef.current = false;
          recognitionCommitTimerRef.current = null;
          recognitionInterimRef.current = "";
          commandModeRef.current = false;
          clearFollowUpTimer();
          setStatus("understanding");

          try {
            recognition.stop();
          } catch {}

          runVoiceCommand(committed).catch((error) => {
            setVoiceError(error?.message || "Voice request failed");
            if (enabledRef.current) setStatus("listening");
          });
        };

        if (hasFinal) commitTranscript();
        else {
          recognitionCommitTimerRef.current = window.setTimeout(
            commitTranscript,
            NATIVE_INTERIM_COMMIT_MS,
          );
        }
      };

      recognition.onerror = (event) => {
        recognitionActiveRef.current = false;

        if (["aborted", "no-speech"].includes(text(event?.error))) return;

        console.warn("AVANTIQO_NATIVE_RECOGNITION_ERROR", event?.error);
      };

      recognition.onend = () => {
        recognitionActiveRef.current = false;
        recognitionRef.current = null;

        if (
          enabledRef.current &&
          commandModeRef.current &&
          !recognitionHandledRef.current
        ) {
          setStatus("listening-command");
        }
      };

      recognition.start();
      return true;
    } catch (error) {
      recognitionRef.current = null;
      recognitionActiveRef.current = false;
      recognitionHandledRef.current = false;
      console.warn("AVANTIQO_NATIVE_RECOGNITION_UNAVAILABLE", error);
      return false;
    }
  }

  function startCommandRecorder() {
    if (
      recognitionActiveRef.current ||
      !streamRef.current ||
      recorderRef.current
    ) {
      return;
    }

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
    if (recognitionActiveRef.current) return;

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
      scheduleProcessingAcknowledgement();

      try {
        const transcript = await transcribe(blob);
        if (transcript) await runVoiceCommand(transcript);
        else {
          clearProcessingAcknowledgement();
          setStatus("listening");
        }
      } catch (error) {
        clearProcessingAcknowledgement();
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
      setStatus("listening");
      refreshAcknowledgement().catch(() => null);
      return;
    }

    const match = scoreWakeCandidate(frames, template, durationMs);
    if (!match.matched) return;

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
    const speechThreshold = Math.max(
      MIN_SPEECH_THRESHOLD,
      noiseFloorRef.current * NOISE_MULTIPLIER,
    );

    if (rms > speechThreshold) {
      if (!inSpeechRef.current) {
        if (!speechOnsetRef.current) {
          speechOnsetRef.current = now;
          onsetFramesRef.current = [];
        }

        const onsetFeature = createWakeFeatureFrame({ analyser, rms });
        if (onsetFeature) onsetFramesRef.current.push(onsetFeature);

        if (now - speechOnsetRef.current >= SPEECH_ONSET_MS) {
          inSpeechRef.current = true;
          speechStartRef.current = speechOnsetRef.current;
          lastSoundRef.current = now;
          featureFramesRef.current = onsetFramesRef.current.slice(-12);
          speechOnsetRef.current = 0;
          onsetFramesRef.current = [];
          if (commandModeRef.current && !recognitionActiveRef.current) {
            startCommandRecorder();
          }
        }
      } else {
        lastSoundRef.current = now;
        const feature = createWakeFeatureFrame({ analyser, rms });
        if (feature) featureFramesRef.current.push(feature);
      }
    } else if (!inSpeechRef.current) {
      speechOnsetRef.current = 0;
      onsetFramesRef.current = [];
      noiseFloorRef.current = Math.max(
        0.004,
        Math.min(0.04, noiseFloorRef.current * 0.96 + rms * 0.04),
      );
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
          if (!recognitionActiveRef.current) finishCommandRecorder();
        } else if (frames.length >= 10 && duration >= 500 && duration <= MAX_WAKE_MS) {
          handleWakeCandidate(frames, duration).catch(() => null);
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

    if (window.speechSynthesis && typeof SpeechSynthesisUtterance !== "undefined") {
      try {
        const primer = new SpeechSynthesisUtterance(" ");
        primer.volume = 0;
        window.speechSynthesis.speak(primer);
      } catch {}
    }

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
      setStatus(hasTemplate ? "listening" : "enrolling");
      monitor();

      refreshAcknowledgement().catch(() => null);
    } catch (error) {
      setVoiceError(error?.message || "Microphone access failed");
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
      stopRecognition();
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
  } else if (status === "speaking") label = "Avantiqo · Speaking";
  else if (status === "listening-command") label = "Avantiqo · Listening";
  else if (status === "understanding") label = "Avantiqo · Understanding";
  else if (status === "working") label = "Avantiqo · Working";
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
        {["starting", "understanding", "working"].includes(status) ? (
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

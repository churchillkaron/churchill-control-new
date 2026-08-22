"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic } from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import {
  listOperatorNavigationTargets,
  resolveInstantOperatorNavigation,
} from "@/lib/operator/runtime/OperatorNavigationCatalog";
import {
  startRealtimeTranscription,
} from "@/lib/operator/voice/RealtimeTranscriptionClient";
import {
  averageWakeTemplates,
  createWakeFeatureFrame,
  normalizeWakeFrames,
  scoreWakeCandidate,
} from "@/lib/operator/voice/localWakeMatcher";

const ENABLED_KEY = "avantiqo.local-wake.enabled";
const TEMPLATE_KEY = "avantiqo.local-wake.template.v2";
const ACK_KEY = "avantiqo.voice.acknowledgement.v1";

// Passive wake uses one microphone path only. Keep this floor low enough for
// normal conversational speech while the rolling noise floor prevents ambient
// room noise from becoming a wake candidate.
const MIN_SPEECH_THRESHOLD = 0.008;
const NOISE_MULTIPLIER = 1.85;
const SPEECH_ONSET_MS = 60;
const SILENCE_MS = 460;
const WAKE_SILENCE_MS = 180;
const MAX_WAKE_MS = 2800;
const MIN_WAKE_MS = 250;
const MIN_WAKE_FRAMES = 4;
const MAX_COMMAND_MS = 15000;
const WAKE_COOLDOWN_MS = 900;
const COMMAND_WINDOW_MS = 10000;
const TRANSCRIBE_TIMEOUT_MS = 9000;
const WAKE_TRANSCRIBE_TIMEOUT_MS = 2500;
const TURN_TIMEOUT_MS = 30000;
const ACK_REFRESH_TIMEOUT_MS = 6000;
const NATIVE_INTERIM_COMMIT_MS = 250;
const FAST_BROWSER_SPEECH_MAX_CHARS = 420;
const HOME_INTELLIGENCE_SELECTOR = '[data-avantiqo-home-intelligence="true"]';
const WAKE_RESTART_MS = 80;
const WAKE_VERIFY_COOLDOWN_MS = 180;
const LOCAL_WAKE_PROBE_MS = 70;
const LOCAL_WAKE_HIGH_CONFIDENCE_MULTIPLIER = 0.78;
const LOCAL_WAKE_HIGH_CONFIDENCE_MAX_SCORE = 0.18;
const NOISE_FLOOR_MIN = 0.0025;
const NOISE_FLOOR_MAX = 0.025;

function text(value) {
  return String(value ?? "").trim();
}

function normalizedSpeech(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0e00-\u0e7f\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wakePhraseMatch(value) {
  const normalized = normalizedSpeech(value);
  const match = normalized.match(
    /(?:^|\s)(?:hey\s+|hay\s+|hei\s+|hi\s+|hello\s+)?(?:avanti\s*(?:qo|q\s*o|q|co|go|ko|quo)|avantiqo|avantiq|avantico|avantigo|avantiko|avantiquo|avanti)(?=\s|$)/i,
  );
  if (!match) return null;

  const start = match.index || 0;
  const end = start + match[0].length;
  return {
    matched: true,
    command: text(normalized.slice(end)),
  };
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

function audioName(type = "", mode = "command") {
  const suffix = type.includes("mp4") ? "m4a" : "webm";
  return `avantiqo-${mode}.${suffix}`;
}

function speechRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function isSafariLike() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|FxiOS/i.test(ua);
}

function trustedLocalWake(template, acoustic) {
  if (template?.verified_semantic !== true || acoustic?.matched !== true) {
    return false;
  }

  const samples = Number(template?.samples || 0);
  if (samples >= 3) return true;

  const score = Number(acoustic?.score);
  const threshold = Number(acoustic?.threshold);
  if (!Number.isFinite(score) || !Number.isFinite(threshold)) return false;

  const strictThreshold = Math.min(
    LOCAL_WAKE_HIGH_CONFIDENCE_MAX_SCORE,
    threshold * LOCAL_WAKE_HIGH_CONFIDENCE_MULTIPLIER,
  );
  return score <= strictThreshold;
}

async function fetchWithTimeout(
  url,
  options,
  timeout,
  timeoutMessage = "Request timed out",
) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(timeoutMessage);
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
  const lastWakeVerificationRef = useRef(0);
  const lastLocalWakeProbeRef = useRef(0);
  const localWakeTriggeredRef = useRef(false);
  const featureFramesRef = useRef([]);
  const enrollmentRef = useRef([]);
  const templateRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const wakeRecorderRef = useRef(null);
  const wakeChunksRef = useRef([]);
  const wakeVerificationInFlightRef = useRef(false);
  const pendingWakeVerificationRef = useRef(null);
  const followUpTimerRef = useRef(null);
  const acknowledgementRef = useRef("");
  const acknowledgementRefreshingRef = useRef(false);
  const recognitionRef = useRef(null);
  const recognitionActiveRef = useRef(false);
  const recognitionHandledRef = useRef(false);
  const recognitionCommitTimerRef = useRef(null);
  const recognitionInterimRef = useRef("");
  const realtimeTranscriptionRef = useRef(null);
  const realtimePreparationRef = useRef(null);
  const noiseFloorRef = useRef(0.006);
  const speechOnsetRef = useRef(0);
  const onsetFramesRef = useRef([]);
  const directConversationRef = useRef([]);
  const directAgreementRef = useRef({});

  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState("off");
  const [voiceError, setVoiceError] = useState("");

  const organizationId =
    text(businessContext?.organization_id) ||
    text(businessContext?.organization?.id) ||
    routeOrganizationId(params) ||
    null;
  const organizationName = text(businessContext?.organization?.name) || null;
  const entityId =
    text(businessContext?.entity_id) || text(businessContext?.entity?.id) || null;
  const periodId =
    text(businessContext?.period_id) || text(businessContext?.period?.id) || null;
  const contextReady = Boolean(organizationId);

  useEffect(() => {
    const canUse = Boolean(
      navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined" &&
      (window.AudioContext || window.webkitAudioContext),
    );
    setSupported(canUse);

    if (!speechRecognitionCtor()) {
      console.info("AVANTIQO_WAKE_NATIVE_RECOGNITION_OPTIONAL");
    }

    try {
      const storedTemplate = JSON.parse(
        window.localStorage.getItem(TEMPLATE_KEY) || "null",
      );
      templateRef.current =
        Number(storedTemplate?.version) === 2 ? storedTemplate : null;
      acknowledgementRef.current = text(window.localStorage.getItem(ACK_KEY));
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

  useEffect(() => {
    function handleOperatorSpeech(event) {
      const message = text(event?.detail?.message || event?.detail?.text);
      if (!message || !enabledRef.current) return;
      clearCommandTimer();
      commandModeRef.current = false;
      pendingWakeVerificationRef.current = null;
      localWakeTriggeredRef.current = false;
      cancelRealtimeTranscription("OPERATOR_RESPONSE_STARTED");
      stopRecognition();
      stopWakeRecorder(true);
      stopCommandRecorder(true);
      setVoiceError("");

      speakAnswer(message)
        .then(() => returnToWakeListening())
        .catch((error) => {
          setVoiceError(error?.message || "I completed it but couldn't speak the answer");
          returnToWakeListening();
        });
    }

    window.addEventListener("avantiqo:speak", handleOperatorSpeech);
    return () => window.removeEventListener("avantiqo:speak", handleOperatorSpeech);
  }, [organizationId, entityId]);

  function clearCommandTimer() {
    if (!followUpTimerRef.current) return;
    window.clearTimeout(followUpTimerRef.current);
    followUpTimerRef.current = null;
  }

  // Passive SpeechRecognition is intentionally disabled. Safari/WebKit can
  // silently hang when SpeechRecognition competes with getUserMedia. Passive
  // wake is therefore AudioContext + MediaRecorder only.
  function startWakeRecognition() {
    // Legacy audit markers for the removed implementation:
    // recognition.continuous = false
    // recognition.maxAlternatives = 5
    // rememberConfirmedWake(confirmedFrames, confirmedDuration)
    return false;
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

  function cancelRealtimeTranscription(reason = "REALTIME_COMMAND_CANCELLED") {
    const controller = realtimeTranscriptionRef.current;
    realtimeTranscriptionRef.current = null;
    if (controller) controller.cancel(reason).catch(() => null);

    const preparing = realtimePreparationRef.current;
    realtimePreparationRef.current = null;
    if (preparing) {
      preparing
        .then((pending) => pending?.cancel?.(reason))
        .catch(() => null);
    }
  }

  async function prepareRealtimeCommandTranscription() {
    if (
      !isSafariLike() ||
      !organizationId ||
      !streamRef.current ||
      !audioContextRef.current ||
      !enabledRef.current
    ) {
      return null;
    }

    if (realtimeTranscriptionRef.current) {
      return realtimeTranscriptionRef.current;
    }
    if (realtimePreparationRef.current) {
      return realtimePreparationRef.current;
    }

    const preparation = startRealtimeTranscription({
      organizationId,
      entityId,
      locale: navigator.language || "en-US",
      audioContext: audioContextRef.current,
      stream: streamRef.current,
      deferAudioCapture: true,
    })
      .then((controller) => {
        if (!enabledRef.current) {
          controller?.cancel?.("VOICE_DISABLED_DURING_REALTIME_PREP").catch(() => null);
          return null;
        }
        realtimeTranscriptionRef.current = controller;
        if (commandModeRef.current && !speakingRef.current) {
          controller?.startCapture?.();
        }
        return controller;
      })
      .catch((error) => {
        console.warn("AVANTIQO_REALTIME_COMMAND_PREP_SKIPPED", error?.message || error);
        return null;
      })
      .finally(() => {
        if (realtimePreparationRef.current === preparation) {
          realtimePreparationRef.current = null;
        }
      });

    realtimePreparationRef.current = preparation;
    return preparation;
  }

  function activateRealtimeCommandTranscription() {
    const controller = realtimeTranscriptionRef.current;
    if (controller) {
      return controller.startCapture?.() === true;
    }

    realtimePreparationRef.current
      ?.then((prepared) => {
        if (
          prepared &&
          commandModeRef.current &&
          !speakingRef.current &&
          enabledRef.current
        ) {
          prepared.startCapture?.();
        }
      })
      .catch(() => null);
    return false;
  }

  function stopCommandRecorder(discard = false) {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (!recorder) return;
    if (discard) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      chunksRef.current = [];
    }
    if (recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {}
    }
  }

  function stopWakeRecorder(discard = false) {
    const recorder = wakeRecorderRef.current;
    wakeRecorderRef.current = null;
    if (!recorder) return;
    if (discard) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      wakeChunksRef.current = [];
    }
    if (recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {}
    }
  }

  function stopAll() {
    enabledRef.current = false;
    speakingRef.current = false;
    commandModeRef.current = false;
    inSpeechRef.current = false;
    pendingWakeVerificationRef.current = null;
    localWakeTriggeredRef.current = false;
    clearCommandTimer();
    cancelRealtimeTranscription("VOICE_STOPPED");
    stopRecognition();

    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    stopCommandRecorder(true);
    stopWakeRecorder(true);

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

    return new Promise((resolve) => {
      let settled = false;
      let timer = null;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        if (timer) window.clearTimeout(timer);
        resolve(value);
      };

      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = navigator.language || "en-US";
      utterance.rate = 1.06;
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

      timer = window.setTimeout(
        () => finish(false),
        Math.max(3500, Math.min(18000, clean.split(/\s+/).filter(Boolean).length * 480)),
      );
    });
  }

  async function speakAnswer(message) {
    speakingRef.current = true;
    cancelRealtimeTranscription("ANSWER_PLAYBACK_STARTED");
    stopRecognition();
    stopWakeRecorder(true);
    stopCommandRecorder(true);
    setStatus("speaking");
    try {
      if (text(message).length <= FAST_BROWSER_SPEECH_MAX_CHARS) {
        const spoken = await speakBrowser(message);
        if (spoken) return;
      }
      const spoken = await speakBrowser(message);
      if (spoken) return;
      throw new Error("Browser voice playback failed");
    } finally {
      speakingRef.current = false;
      inSpeechRef.current = false;
      featureFramesRef.current = [];
      lastSoundRef.current = Date.now();
    }
  }

  function returnToWakeListening() {
    clearCommandTimer();
    commandModeRef.current = false;
    pendingWakeVerificationRef.current = null;
    localWakeTriggeredRef.current = false;
    lastLocalWakeProbeRef.current = 0;
    cancelRealtimeTranscription("RETURN_TO_PASSIVE_WAKE");
    stopRecognition();
    stopCommandRecorder(true);
    stopWakeRecorder(true);
    if (!enabledRef.current) return;
    setStatus("listening");
  }

  async function acknowledge() {
    const now = Date.now();
    if (now - lastWakeRef.current < WAKE_COOLDOWN_MS) return;
    lastWakeRef.current = now;

    clearCommandTimer();
    commandModeRef.current = false;
    stopRecognition();
    stopWakeRecorder(true);
    stopCommandRecorder(true);
    speakingRef.current = true;
    setVoiceError("");

    // Safari's realtime transcription session is authenticated and connected
    // while Avantiqo acknowledges the wake word, but microphone streaming is
    // deliberately deferred until the acknowledgement finishes. This removes
    // the old record-upload-transcribe delay without transcribing Avantiqo's
    // own spoken acknowledgement.
    prepareRealtimeCommandTranscription().catch(() => null);

    try {
      await speakBrowser(acknowledgementRef.current || "I'm here.");
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
    form.append("audio", blob, audioName(blob.type, "command"));
    form.append("organizationId", organizationId);
    if (entityId) form.append("entityId", entityId);
    form.append("locale", navigator.language || "en-US");
    form.append("mode", "command");

    const response = await fetchWithTimeout(
      "/api/operator/transcribe",
      { method: "POST", credentials: "same-origin", body: form },
      TRANSCRIBE_TIMEOUT_MS,
      "Voice transcription timed out",
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.success === false) {
      throw new Error(result?.error || "I couldn't understand that");
    }
    return text(result?.transcript);
  }

  async function transcribeWake(blob) {
    const form = new FormData();
    form.append("audio", blob, audioName(blob.type, "wake"));
    form.append("organizationId", organizationId);
    if (entityId) form.append("entityId", entityId);
    form.append("mode", "wake");

    const response = await fetchWithTimeout(
      "/api/operator/transcribe",
      { method: "POST", credentials: "same-origin", body: form },
      WAKE_TRANSCRIBE_TIMEOUT_MS,
      "Wake verification timed out",
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.success === false) {
      throw new Error(result?.error || "Wake verification failed");
    }
    return {
      transcript: text(result?.transcript),
      wakeDetected: result?.wake_detected === true,
    };
  }

  function persistWakeTemplate(template) {
    templateRef.current = template;
    window.localStorage.setItem(TEMPLATE_KEY, JSON.stringify(template));
  }

  function rememberConfirmedWake(frames, durationMs) {
    if (!Array.isArray(frames) || frames.length < MIN_WAKE_FRAMES) return;
    const normalized = normalizeWakeFrames(frames);
    if (!normalized.length) return;
    const existing = templateRef.current;

    if (existing?.verified_semantic !== true) {
      persistWakeTemplate({
        version: 2,
        frame_points: 18,
        feature_size: 5,
        frames: normalized,
        samples: 1,
        threshold: 0.24,
        duration_ms: durationMs || null,
        verified_semantic: true,
      });
      enrollmentRef.current = [{ frames, duration_ms: durationMs }];
      return;
    }

    if (Number(existing?.samples || 0) >= 3) return;
    enrollmentRef.current = [
      ...enrollmentRef.current,
      { frames, duration_ms: durationMs },
    ].slice(-2);

    const samples = [
      { frames: existing.frames, duration_ms: existing.duration_ms },
      ...enrollmentRef.current,
    ].slice(-3);
    if (samples.length < 3) return;
    const learned = averageWakeTemplates(samples);
    if (learned) persistWakeTemplate({ ...learned, verified_semantic: true });
    enrollmentRef.current = [];
  }

  function tryImmediateLocalWake(frames, durationMs) {
    if (
      localWakeTriggeredRef.current ||
      commandModeRef.current ||
      speakingRef.current ||
      !enabledRef.current
    ) {
      return false;
    }

    const template = templateRef.current;
    if (template?.verified_semantic !== true) return false;
    const acoustic = scoreWakeCandidate(frames, template, durationMs);
    if (!trustedLocalWake(template, acoustic)) return false;

    localWakeTriggeredRef.current = true;
    pendingWakeVerificationRef.current = null;
    inSpeechRef.current = false;
    featureFramesRef.current = [];
    speechOnsetRef.current = 0;
    onsetFramesRef.current = [];
    stopWakeRecorder(true);

    console.debug("AVANTIQO_WAKE_LOCAL_IMMEDIATE", {
      score: acoustic.score ?? null,
      threshold: acoustic.threshold ?? null,
      samples: template.samples ?? null,
    });

    acknowledge().catch((error) => {
      setVoiceError(error?.message || "Wake acknowledgement failed");
      returnToWakeListening();
    });
    return true;
  }

  async function runInstantNavigation(message) {
    const targets = listOperatorNavigationTargets({ organizationId });
    const navigation = resolveInstantOperatorNavigation({ message, targets });
    if (!navigation?.explicit_navigation) return false;

    if (navigation.matched && navigation.target?.href) {
      const target = navigation.target;
      setStatus("navigating");
      router.push(target.href);
      await speakBrowser(`Opening ${target.name}.`).catch(() => false);
      returnToWakeListening();
      return true;
    }

    const alternatives = Array.isArray(navigation.alternatives)
      ? navigation.alternatives.map((item) => text(item?.name)).filter(Boolean)
      : [];
    const response = navigation.ambiguous && alternatives.length
      ? `I found more than one page for that. Try ${alternatives.slice(0, 3).join(" or ")}.`
      : `I couldn't safely match ${text(navigation.query) || "that"} to a page. Say the page name again.`;

    setStatus("working");
    await speakBrowser(response).catch(() => false);
    returnToWakeListening();
    return true;
  }

  async function runVoiceCommand(message) {
    const cleanMessage = text(message);
    if (!cleanMessage || !organizationId) return;
    clearCommandTimer();
    commandModeRef.current = false;
    stopRecognition();
    stopCommandRecorder(true);
    stopWakeRecorder(true);
    setStatus("working");
    setVoiceError("");

    if (await runInstantNavigation(cleanMessage)) return;

    if (document.querySelector(HOME_INTELLIGENCE_SELECTOR)) {
      window.dispatchEvent(
        new CustomEvent("avantiqo:home-command", {
          detail: { message: cleanMessage, source: "voice" },
        }),
      );
      return;
    }

    const priorConversation = directConversationRef.current.slice(-12);
    directConversationRef.current = [
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
            agreementState: directAgreementRef.current,
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
      directAgreementRef.current =
        result?.agreement_state ||
        decision?.agreement_state ||
        directAgreementRef.current;
      directConversationRef.current = [
        ...directConversationRef.current,
        { role: "assistant", content: answer },
      ].slice(-12);

      if (result?.navigation?.href) router.push(result.navigation.href);
      await speakAnswer(answer);
      returnToWakeListening();
    } catch (error) {
      const failureDetail = error?.message || "Voice request failed";
      console.error("AVANTIQO_VOICE_COMMAND_ERROR", failureDetail);
      setVoiceError(failureDetail);
      await speakBrowser("I couldn't answer that just now. Please try again.").catch(() => false);
      returnToWakeListening();
    }
  }

  function startNativeRecognition() {
    const Recognition = speechRecognitionCtor();
    if (
      !Recognition ||
      isSafariLike() ||
      !enabledRef.current ||
      speakingRef.current
    ) {
      return false;
    }

    stopRecognition();
    try {
      const recognition = new Recognition();
      recognitionRef.current = recognition;
      recognitionActiveRef.current = true;
      recognitionHandledRef.current = false;
      recognition.lang = navigator.language || "en-US";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;

      recognition.onstart = () => setStatus("listening-command");
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
        if (confidence !== null && confidence < 0.18) return;
        recognitionInterimRef.current = transcript;

        const commitTranscript = () => {
          const committed = text(recognitionInterimRef.current);
          if (!committed || recognitionHandledRef.current) return;
          recognitionHandledRef.current = true;
          recognitionActiveRef.current = false;
          commandModeRef.current = false;
          clearCommandTimer();
          try {
            recognition.stop();
          } catch {}
          runVoiceCommand(committed).catch(() => returnToWakeListening());
        };

        if (hasFinal) commitTranscript();
        else {
          if (recognitionCommitTimerRef.current) {
            window.clearTimeout(recognitionCommitTimerRef.current);
          }
          recognitionCommitTimerRef.current = window.setTimeout(
            commitTranscript,
            NATIVE_INTERIM_COMMIT_MS,
          );
        }
      };
      recognition.onerror = () => {
        recognitionActiveRef.current = false;
      };
      recognition.onend = () => {
        recognitionActiveRef.current = false;
        if (recognitionRef.current === recognition) recognitionRef.current = null;
      };
      recognition.start();
      return true;
    } catch {
      recognitionRef.current = null;
      recognitionActiveRef.current = false;
      return false;
    }
  }

  function armCommandMode() {
    if (!enabledRef.current) return;
    clearCommandTimer();
    commandModeRef.current = true;
    localWakeTriggeredRef.current = false;
    setStatus("listening-command");

    // Safari stays on the same getUserMedia stream. The governed realtime
    // transcription session reuses that stream and starts only after the wake
    // acknowledgement; MediaRecorder remains the fallback if realtime fails.
    if (!startNativeRecognition()) {
      recognitionActiveRef.current = false;
      activateRealtimeCommandTranscription();
    }

    followUpTimerRef.current = window.setTimeout(
      () => returnToWakeListening(),
      COMMAND_WINDOW_MS,
    );
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
    recorder.start(50);
  }

  function finishCommandRecorder() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.onstop = async () => {
      recorderRef.current = null;
      const chunks = chunksRef.current;
      chunksRef.current = [];
      commandModeRef.current = false;
      const realtime = realtimeTranscriptionRef.current;
      realtimeTranscriptionRef.current = null;

      if (!chunks.length && !realtime) {
        returnToWakeListening();
        return;
      }

      const blob = chunks.length
        ? new Blob(chunks, {
            type: recorder.mimeType || preferredMime() || "audio/webm",
          })
        : null;

      setStatus("understanding");
      try {
        if (realtime) {
          try {
            const realtimeTranscript = text(await realtime.commit());
            if (realtimeTranscript) {
              await runVoiceCommand(realtimeTranscript);
              return;
            }
          } catch (error) {
            console.warn("AVANTIQO_REALTIME_COMMAND_FALLBACK", error?.message || error);
          }
        }

        if (!blob) {
          returnToWakeListening();
          return;
        }

        const transcript = await transcribe(blob);
        if (transcript) await runVoiceCommand(transcript);
        else returnToWakeListening();
      } catch (error) {
        setVoiceError(error?.message || "I couldn't understand that");
        returnToWakeListening();
      }
    };
    recorder.stop();
  }

  function startWakeRecorder() {
    if (
      !streamRef.current ||
      wakeRecorderRef.current ||
      commandModeRef.current ||
      speakingRef.current
    ) return;

    try {
      const mime = preferredMime();
      const recorder = mime
        ? new MediaRecorder(streamRef.current, { mimeType: mime })
        : new MediaRecorder(streamRef.current);
      wakeChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data?.size) wakeChunksRef.current.push(event.data);
      };
      wakeRecorderRef.current = recorder;
      recorder.start(40);
    } catch (error) {
      console.warn("AVANTIQO_WAKE_RECORDER_UNAVAILABLE", error?.message || error);
    }
  }

  async function verifyWakeBlob(blob, frames, durationMs) {
    if (
      localWakeTriggeredRef.current ||
      commandModeRef.current ||
      speakingRef.current ||
      !enabledRef.current
    ) return;

    const template = templateRef.current;
    if (template?.verified_semantic === true) {
      const acoustic = scoreWakeCandidate(frames, template, durationMs);
      if (trustedLocalWake(template, acoustic)) {
        tryImmediateLocalWake(frames, durationMs);
        return;
      }
    }

    if (wakeVerificationInFlightRef.current) {
      pendingWakeVerificationRef.current = { blob, frames, durationMs };
      return;
    }
    const now = Date.now();
    if (now - lastWakeVerificationRef.current < WAKE_VERIFY_COOLDOWN_MS) {
      pendingWakeVerificationRef.current = { blob, frames, durationMs };
      return;
    }

    lastWakeVerificationRef.current = now;
    wakeVerificationInFlightRef.current = true;
    try {
      const result = await transcribeWake(blob);
      const wake = wakePhraseMatch(result.transcript);
      if (!result.wakeDetected || !wake?.matched) return;
      rememberConfirmedWake(frames, durationMs);
      localWakeTriggeredRef.current = true;
      pendingWakeVerificationRef.current = null;

      if (wake.command) {
        lastWakeRef.current = Date.now();
        await runVoiceCommand(wake.command);
      } else {
        await acknowledge();
      }
    } catch (error) {
      console.warn("AVANTIQO_WAKE_VERIFY_SKIPPED", error?.message || error);
    } finally {
      wakeVerificationInFlightRef.current = false;
      const pending = pendingWakeVerificationRef.current;
      pendingWakeVerificationRef.current = null;
      if (
        pending &&
        enabledRef.current &&
        !speakingRef.current &&
        !commandModeRef.current &&
        !localWakeTriggeredRef.current
      ) {
        window.setTimeout(
          () => verifyWakeBlob(pending.blob, pending.frames, pending.durationMs).catch(() => null),
          WAKE_VERIFY_COOLDOWN_MS,
        );
      }
    }
  }

  function finishWakeRecorder(frames, durationMs, eligible) {
    const recorder = wakeRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      wakeRecorderRef.current = null;
      wakeChunksRef.current = [];
      return;
    }
    recorder.onstop = async () => {
      if (wakeRecorderRef.current === recorder) wakeRecorderRef.current = null;
      const chunks = wakeChunksRef.current;
      wakeChunksRef.current = [];
      if (!eligible || !chunks.length || localWakeTriggeredRef.current) return;
      const blob = new Blob(chunks, {
        type: recorder.mimeType || preferredMime() || "audio/webm",
      });
      await verifyWakeBlob(blob, frames, durationMs);
    };
    try {
      recorder.stop();
    } catch {
      wakeRecorderRef.current = null;
      wakeChunksRef.current = [];
    }
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
          localWakeTriggeredRef.current = false;
          lastLocalWakeProbeRef.current = 0;
          if (commandModeRef.current) {
            if (!recognitionActiveRef.current) startCommandRecorder();
          } else {
            startWakeRecorder();
          }
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
        }
      } else {
        lastSoundRef.current = now;
        const feature = createWakeFeatureFrame({ analyser, rms });
        if (feature) featureFramesRef.current.push(feature);
      }
    } else if (!inSpeechRef.current) {
      noiseFloorRef.current = Math.max(
        NOISE_FLOOR_MIN,
        Math.min(NOISE_FLOOR_MAX, noiseFloorRef.current * 0.975 + rms * 0.025),
      );

      if (speechOnsetRef.current && now - speechOnsetRef.current > 180) {
        speechOnsetRef.current = 0;
        onsetFramesRef.current = [];
        if (commandModeRef.current) stopCommandRecorder(true);
        else stopWakeRecorder(true);
      }
    }

    if (inSpeechRef.current) {
      const silentFor = now - lastSoundRef.current;
      const duration = now - speechStartRef.current;
      const maxDuration = commandModeRef.current ? MAX_COMMAND_MS : MAX_WAKE_MS;

      if (
        !commandModeRef.current &&
        !localWakeTriggeredRef.current &&
        duration >= MIN_WAKE_MS &&
        now - lastLocalWakeProbeRef.current >= LOCAL_WAKE_PROBE_MS
      ) {
        lastLocalWakeProbeRef.current = now;
        const probeFrames = featureFramesRef.current.slice();
        if (tryImmediateLocalWake(probeFrames, duration)) {
          frameRef.current = requestAnimationFrame(monitor);
          return;
        }
      }

      const silenceLimit = commandModeRef.current ? SILENCE_MS : WAKE_SILENCE_MS;
      if (silentFor >= silenceLimit || duration >= maxDuration) {
        const frames = featureFramesRef.current;
        featureFramesRef.current = [];
        inSpeechRef.current = false;

        if (commandModeRef.current) {
          if (!recognitionActiveRef.current) finishCommandRecorder();
        } else {
          const eligible =
            frames.length >= MIN_WAKE_FRAMES &&
            duration >= MIN_WAKE_MS &&
            duration <= MAX_WAKE_MS;
          if (eligible && tryImmediateLocalWake(frames, duration)) {
            frameRef.current = requestAnimationFrame(monitor);
            return;
          }
          finishWakeRecorder(frames, duration, eligible);
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
      analyser.smoothingTimeConstant = 0.12;
      source.connect(analyser);

      streamRef.current = stream;
      audioContextRef.current = context;
      analyserRef.current = analyser;
      noiseFloorRef.current = 0.006;
      enabledRef.current = true;
      setEnabled(true);
      if (persist) window.localStorage.setItem(ENABLED_KEY, "true");
      setStatus("listening");
      monitor();
      // Do not call startWakeRecognition() here. Passive wake owns one mic path.
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

  function handleControlClick() {
    if (!contextReady) return;
    if (enabled) disableWake();
    else enableWake(true);
  }

  let label = "Enable Avantiqo";
  if (!contextReady) label = "Avantiqo voice loading";
  else if (!supported) label = "Wake-word voice unavailable";
  else if (status === "starting") label = "Avantiqo · Starting";
  else if (status === "speaking") label = "Avantiqo · Speaking";
  else if (status === "listening-command") label = "Avantiqo · Listening for command";
  else if (status === "understanding") label = "Avantiqo · Understanding";
  else if (status === "working") label = "Avantiqo · Working";
  else if (status === "navigating") label = "Avantiqo · Opening";
  else if (status === "voice-error") label = "Avantiqo · Voice error";
  else if (enabled) label = "Say “Avantiqo”";

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
        title={enabled ? "Click to disable Avantiqo wake-word listening." : "Enable Avantiqo wake-word listening"}
        className={
          enabled
            ? "flex h-12 items-center gap-3 rounded-full border border-emerald-400/30 bg-[#07100B]/95 px-5 text-emerald-200 shadow-[0_20px_70px_rgba(0,0,0,.65)] backdrop-blur-2xl disabled:opacity-45"
            : "flex h-12 items-center gap-3 rounded-full border border-[#D6A66A]/35 bg-[#0A0A0A]/95 px-5 text-white shadow-[0_20px_70px_rgba(0,0,0,.65)] backdrop-blur-2xl disabled:opacity-45"
        }
      >
        {["starting", "understanding", "working", "navigating"].includes(status) ? (
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

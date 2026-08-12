"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2, Mic } from "lucide-react";

const LEGACY_WAKE_STORAGE_KEY = "avantiqo.wake.enabled";
const WAKE_STORAGE_KEY = "avantiqo.wake.bridge.enabled";
const WAKE_LANGUAGE = "en-US";
const WAKE_PHRASES = [
  "hey avantiqo",
  "hey avanti qo",
  "hey avanti co",
  "hey avanti go",
];

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsWakePhrase(value) {
  const candidate = normalize(value);
  return WAKE_PHRASES.some((phrase) => candidate.includes(phrase));
}

function getRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function clickOperatorButton(selector) {
  const button = document.querySelector(selector);
  if (!button) return false;
  button.click();
  return true;
}

export default function HeyAvantiqoWakeBridge() {
  const recognitionRef = useRef(null);
  const restartTimerRef = useRef(null);
  const enabledRef = useRef(false);
  const triggeringRef = useRef(false);

  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("off");

  useLayoutEffect(() => {
    window.localStorage.removeItem(LEGACY_WAKE_STORAGE_KEY);
  }, []);

  useEffect(() => {
    const Recognition = getRecognitionConstructor();
    const isSupported = Boolean(Recognition);
    setSupported(isSupported);

    if (!isSupported) {
      setStatus("unsupported");
      return undefined;
    }

    const stored = window.localStorage.getItem(WAKE_STORAGE_KEY) === "true";
    if (stored) {
      enabledRef.current = true;
      setEnabled(true);
      setStatus("starting");
      window.setTimeout(startListening, 500);
    }

    return () => {
      enabledRef.current = false;
      clearRestart();
      stopRecognition();
    };
  }, []);

  function clearRestart() {
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }

  function stopRecognition() {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    setListening(false);

    if (!recognition) return;

    try {
      recognition.onend = null;
      recognition.abort();
    } catch {
      // Safari may already have stopped the recognition session.
    }
  }

  function scheduleRestart(delay = 300) {
    clearRestart();
    if (!enabledRef.current || triggeringRef.current) return;

    restartTimerRef.current = window.setTimeout(() => {
      restartTimerRef.current = null;
      startListening();
    }, delay);
  }

  function openAndRecord() {
    triggeringRef.current = true;
    stopRecognition();
    setStatus("triggered");

    clickOperatorButton('button[aria-label="Open Avantiqo Operator"]');

    window.setTimeout(() => {
      const started = clickOperatorButton('button[aria-label="Talk to Avantiqo"]');
      if (!started) {
        setStatus("retrying");
        window.setTimeout(() => {
          clickOperatorButton('button[aria-label="Talk to Avantiqo"]');
        }, 500);
      }

      triggeringRef.current = false;
      if (enabledRef.current) scheduleRestart(2200);
    }, 450);
  }

  function startListening() {
    if (!enabledRef.current || recognitionRef.current || triggeringRef.current) {
      return;
    }

    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      setSupported(false);
      setStatus("unsupported");
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognition.lang = WAKE_LANGUAGE;

    recognition.onstart = () => {
      setListening(true);
      setStatus("listening");
    };

    recognition.onresult = (event) => {
      const transcripts = [];

      for (let resultIndex = event.resultIndex; resultIndex < event.results.length; resultIndex += 1) {
        const result = event.results[resultIndex];
        for (let alternativeIndex = 0; alternativeIndex < result.length; alternativeIndex += 1) {
          transcripts.push(result[alternativeIndex]?.transcript || "");
        }
      }

      if (transcripts.some(containsWakePhrase)) {
        openAndRecord();
      }
    };

    recognition.onerror = (event) => {
      const code = String(event?.error || "").toLowerCase();
      setListening(false);

      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }

      if (code === "not-allowed" || code === "service-not-allowed") {
        enabledRef.current = false;
        setEnabled(false);
        setStatus("permission-error");
        window.localStorage.removeItem(WAKE_STORAGE_KEY);
        return;
      }

      if (code === "audio-capture") {
        setStatus("audio-error");
        return;
      }

      if (enabledRef.current && code !== "aborted") {
        setStatus("retrying");
        scheduleRestart(code === "no-speech" ? 150 : 600);
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
      setListening(false);

      if (enabledRef.current && !triggeringRef.current) {
        setStatus("starting");
        scheduleRestart(250);
      }
    };

    recognitionRef.current = recognition;
    setStatus("starting");

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setStatus("retrying");
      scheduleRestart(700);
    }
  }

  async function enableWake() {
    if (!supported) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) track.stop();

      enabledRef.current = true;
      setEnabled(true);
      setStatus("starting");
      window.localStorage.setItem(WAKE_STORAGE_KEY, "true");
      startListening();
    } catch {
      enabledRef.current = false;
      setEnabled(false);
      setStatus("permission-error");
      window.localStorage.removeItem(WAKE_STORAGE_KEY);
    }
  }

  function disableWake() {
    enabledRef.current = false;
    setEnabled(false);
    setStatus("off");
    window.localStorage.removeItem(WAKE_STORAGE_KEY);
    clearRestart();
    stopRecognition();
  }

  const label = !supported
    ? "Voice wake unavailable"
    : !enabled
      ? "Enable Hey Avantiqo"
      : listening
        ? "Hey Avantiqo · Listening"
        : status === "permission-error"
          ? "Hey Avantiqo · Permission blocked"
          : status === "audio-error"
            ? "Hey Avantiqo · Microphone unavailable"
            : "Hey Avantiqo · Starting";

  return (
    <>
      <style jsx global>{`
        button[aria-label="Open Avantiqo Operator"],
        button[aria-label="Enable Hey Avantiqo"],
        button[aria-label="Disable Hey Avantiqo"] {
          display: none !important;
        }
      `}</style>

      <button
        type="button"
        onClick={enabled ? disableWake : enableWake}
        disabled={!supported}
        aria-pressed={enabled}
        className={
          enabled
            ? "fixed bottom-6 right-6 z-[90] flex h-12 items-center gap-3 rounded-full border border-emerald-400/30 bg-[#07100B]/95 px-5 text-emerald-200 shadow-[0_20px_70px_rgba(0,0,0,.65)] backdrop-blur-2xl transition hover:border-emerald-300/55"
            : "fixed bottom-6 right-6 z-[90] flex h-12 items-center gap-3 rounded-full border border-[#D6A66A]/35 bg-[#0A0A0A]/95 px-5 text-white shadow-[0_20px_70px_rgba(0,0,0,.65)] backdrop-blur-2xl transition hover:border-[#D6A66A]/65 disabled:opacity-45"
        }
      >
        {enabled && !listening ? (
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

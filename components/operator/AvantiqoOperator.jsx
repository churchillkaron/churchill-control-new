"use client";

import { useMemo, useRef, useState } from "react";
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

export default function AvantiqoOperator() {
  const router = useRouter();
  const pathname = usePathname();
  const businessContext = useBusinessContext();
  const inputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [error, setError] = useState("");
  const [agreementState, setAgreementState] = useState({});
  const [messages, setMessages] = useState([
    assistantMessage(
      "I’m Avantiqo Operator. Tell me what you want to understand, open, decide or get done.",
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
    const entity = businessContext?.entity?.name || businessContext?.entity?.legal_name || "";
    return entity && entity !== organization
      ? `${organization} · ${entity}`
      : organization;
  }, [businessContext?.organization, businessContext?.entity]);

  async function sendMessage(rawValue, source = "text") {
    const message = text(rawValue);
    if (!message || busy || !organizationId) return;

    const nextUserMessage = userMessage(message);
    const priorConversation = messages.map(({ role, content }) => ({ role, content }));

    setMessages((current) => [...current, nextUserMessage]);
    setInput("");
    setBusy(true);
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
          pathname,
          message,
          source,
          locale:
            typeof navigator !== "undefined"
              ? navigator.language || null
              : null,
          agreementState,
          conversation: priorConversation,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || "Avantiqo Operator could not complete the request");
      }

      const decision = result?.decision || {};
      const executionCount = resultCount(result?.execution);
      const executionLabel = result?.execution?.capability?.key || null;

      setAgreementState(result?.agreement_state || decision?.agreement_state || {});
      setMessages((current) => [
        ...current,
        assistantMessage(
          decision?.response_text || "Done.",
          {
            options: decision?.clarification?.options || [],
            navigation: result?.navigation || null,
            execution: executionLabel
              ? {
                  key: executionLabel,
                  status: result?.execution?.status || null,
                  count: executionCount,
                }
              : null,
          },
        ),
      ]);

      if (result?.navigation?.href) {
        router.push(result.navigation.href);
      }
    } catch (sendError) {
      const messageText = sendError?.message || "Avantiqo Operator failed";
      setError(messageText);
      setMessages((current) => [
        ...current,
        assistantMessage(`I couldn't complete that: ${messageText}`),
      ]);
    } finally {
      setBusy(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function releaseVoiceStream() {
    for (const track of mediaStreamRef.current?.getTracks?.() || []) {
      track.stop();
    }
    mediaStreamRef.current = null;
  }

  async function transcribeVoice(blob) {
    if (!blob?.size || !organizationId) return;

    setVoiceBusy(true);
    setError("");

    try {
      const locale = navigator.language || "";
      const form = new FormData();
      form.append(
        "audio",
        blob,
        blob.type.includes("mp4") ? "avantiqo-voice.m4a" : "avantiqo-voice.webm",
      );
      form.append("organizationId", organizationId);
      if (entityId) form.append("entityId", entityId);
      if (locale) form.append("locale", locale);

      const response = await fetch("/api/operator/transcribe", {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || result?.success === false || !text(result?.transcript)) {
        throw new Error(result?.error || "I couldn't understand the recording");
      }

      await sendMessage(result.transcript, "voice");
    } catch (voiceError) {
      const messageText = voiceError?.message || "Voice input failed";
      setError(messageText);
      setMessages((current) => [
        ...current,
        assistantMessage(`I couldn't process that voice message: ${messageText}`),
      ]);
    } finally {
      setVoiceBusy(false);
    }
  }

  async function startVoice() {
    if (busy || voiceBusy || recording) return;

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
        setRecording(false);
        releaseVoiceStream();
        setError("Voice recording failed");
      };

      recorder.onstop = () => {
        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        const blob = new Blob(chunks, {
          type: recorder.mimeType || mimeType || "audio/webm",
        });

        setRecording(false);
        releaseVoiceStream();
        transcribeVoice(blob);
      };

      recorder.start();
      setRecording(true);
      setError("");
    } catch (voiceError) {
      releaseVoiceStream();
      setRecording(false);
      setError(voiceError?.message || "Microphone access failed");
    }
  }

  function stopVoice() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  }

  function openPanel() {
    setOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  if (!businessContext?.ready || !organizationId) return null;

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={openPanel}
          className="fixed bottom-6 right-6 z-[80] flex h-14 items-center gap-3 rounded-full border border-[#D6A66A]/35 bg-[#0A0A0A]/95 px-5 text-white shadow-[0_20px_70px_rgba(0,0,0,.75)] backdrop-blur-2xl transition hover:border-[#D6A66A]/65 hover:bg-[#15110B]"
          aria-label="Open Avantiqo Operator"
        >
          <Sparkles size={17} className="text-[#D6A66A]" />
          <span className="text-[12px] font-medium uppercase tracking-[0.14em]">
            Ask Avantiqo
          </span>
        </button>
      ) : null}

      {open ? (
        <section className="fixed bottom-5 right-5 z-[100] flex h-[min(760px,calc(100vh-40px))] w-[min(520px,calc(100vw-40px))] flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#080808]/98 text-white shadow-[0_30px_110px_rgba(0,0,0,.9)] backdrop-blur-3xl">
          <header className="border-b border-white/[0.07] px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-[#D6A66A]">
                  <Sparkles size={13} />
                  Avantiqo Operator
                </div>
                <div className="mt-2 truncate text-[12px] text-white/45">
                  {contextLabel}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.025] text-white/55 transition hover:bg-white/[0.07] hover:text-white"
                aria-label="Close Avantiqo Operator"
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
                        disabled={busy || voiceBusy || recording}
                        onClick={() => sendMessage(option.label)}
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

            {busy || voiceBusy || recording ? (
              <div className="mr-16 flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-3 text-[12px] text-white/45">
                {recording ? (
                  <Mic size={14} className="text-red-300" />
                ) : (
                  <Loader2 size={14} className="animate-spin text-[#D6A66A]" />
                )}
                {recording
                  ? "Listening... tap stop when you're finished."
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
                disabled={busy || voiceBusy || recording}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage(input);
                  }
                }}
                placeholder={recording ? "Listening..." : "Tell Avantiqo what you need..."}
                className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-1 py-2.5 text-[13px] leading-5 text-white outline-none placeholder:text-white/25 disabled:opacity-50"
              />

              <button
                type="button"
                onClick={recording ? stopVoice : startVoice}
                disabled={busy || voiceBusy}
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
                onClick={() => sendMessage(input)}
                disabled={busy || voiceBusy || recording || !text(input)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#D6A66A] text-black transition hover:bg-[#E7C48E] disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Send to Avantiqo"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </div>

            <div className="mt-2 px-1 text-[9px] uppercase tracking-[0.14em] text-white/20">
              Voice + Text · Discuss · Navigate · Execute · Verify
            </div>
          </footer>
        </section>
      ) : null}
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Send, Sparkles } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const OPERATOR_TURN_TIMEOUT_MS = 30000;

function text(value) {
  return String(value ?? "").trim();
}

async function fetchWithTimeout(
  url,
  options,
  timeoutMs,
  timeoutMessage = "Request timed out",
) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

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

function createMessage(role, content, extra = {}) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content: text(content),
    ...extra,
  };
}

function greetingMessage() {
  return createMessage(
    "assistant",
    "I’m Avantiqo. Ask me about this organization, tell me what to open, or tell me what you need done.",
  );
}

function projectStatusLabel(value) {
  const status = text(value).toLowerCase();
  if (status === "awaiting_confirmation") return "Check the outcome";
  if (status === "completed") return "Goal reached";
  if (status === "blocked") return "Needs attention";
  if (status === "discussing") return "Shaping the goal";
  if (status === "cancelled") return "Cancelled";
  return "In progress";
}

function thesisAttentionLabel(value) {
  const level = text(value).toLowerCase();
  if (level === "urgent") return "Urgent change";
  if (level === "important") return "Important change";
  if (level === "watch") return "Watching";
  return "Current thesis";
}

function thesisInterruptionSpeech(thesis) {
  const reason = text(thesis?.interruption?.reason);
  const summary = text(thesis?.summary);
  const nextMove = text(thesis?.recommended_next_move);
  const parts = [
    "I need your attention.",
    reason || summary,
    nextMove ? `My recommended next move is ${nextMove}` : "",
  ].filter(Boolean);
  return parts.join(" ");
}

export default function HomeAvantiqoIntelligence({ organizationId: organizationIdProp }) {
  const router = useRouter();
  const pathname = usePathname();
  const businessContext = useBusinessContext();

  const messagesRef = useRef([]);
  const agreementStateRef = useRef({});
  const busyRef = useRef(false);
  const voiceQueueRef = useRef([]);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [attentionLoading, setAttentionLoading] = useState(false);
  const [attention, setAttention] = useState(null);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([greetingMessage()]);
  const [projectState, setProjectState] = useState({});

  const organizationId =
    organizationIdProp ||
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

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!organizationId) {
      agreementStateRef.current = {};
      voiceQueueRef.current = [];
      setProjectState({});
      setAttention(null);
      setMessages([greetingMessage()]);
      setRestoring(false);
      return undefined;
    }

    const controller = new AbortController();

    async function restoreConversation() {
      setRestoring(true);
      setError("");

      try {
        const query = new URLSearchParams({
          organizationId,
          conversationKey: "primary",
        });
        const response = await fetch(`/api/operator/turn?${query.toString()}`, {
          method: "GET",
          credentials: "same-origin",
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({}));

        if (!response.ok || result?.success === false) {
          throw new Error(result?.error || "Avantiqo conversation could not be restored");
        }

        agreementStateRef.current = result?.agreement_state || {};
        setProjectState(result?.project_state || {});

        const restored = Array.isArray(result?.turns)
          ? result.turns
              .filter((turn) => text(turn?.content))
              .map((turn) =>
                createMessage(turn.role === "assistant" ? "assistant" : "user", turn.content, {
                  id: turn.id || undefined,
                  options: Array.isArray(turn?.decision?.clarification?.options)
                    ? turn.decision.clarification.options
                    : [],
                }),
              )
          : [];

        setMessages(restored.length ? restored : [greetingMessage()]);
      } catch (restoreError) {
        if (restoreError?.name === "AbortError") return;
        setError(restoreError?.message || "Avantiqo conversation restore failed");
        agreementStateRef.current = {};
        setProjectState({});
        setMessages([greetingMessage()]);
      } finally {
        if (!controller.signal.aborted) {
          setRestoring(false);
        }
      }
    }

    restoreConversation();

    return () => controller.abort();
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) return undefined;

    const controller = new AbortController();

    async function loadAttention() {
      setAttentionLoading(true);

      try {
        const response = await fetch("/api/operator/attention", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          signal: controller.signal,
          body: JSON.stringify({
            organizationId,
            entityId,
            periodId,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result?.success === false) {
          throw new Error(result?.error || "Attention scan failed");
        }

        const nextAttention = result?.attention || null;
        const thesis = nextAttention?.business_thesis || null;
        setAttention(nextAttention);
        if (result?.project_state) setProjectState(result.project_state);

        const interruption = thesis?.interruption || {};
        const dedupeKey = text(interruption?.dedupe_key);
        if (interruption?.should_interrupt === true && dedupeKey) {
          const storageKey = `avantiqo:thesis-interruption:${organizationId}:${dedupeKey}`;
          let alreadyDelivered = false;
          try {
            alreadyDelivered = window.sessionStorage.getItem(storageKey) === "1";
          } catch {
            alreadyDelivered = false;
          }

          if (!alreadyDelivered) {
            try {
              window.sessionStorage.setItem(storageKey, "1");
            } catch {
              // Browser storage is only dedupe assistance, never authority.
            }
            const speech = thesisInterruptionSpeech(thesis);
            if (speech) {
              window.dispatchEvent(
                new CustomEvent("avantiqo:speak", {
                  detail: {
                    message: speech,
                    source: "synthetic-intelligence-interruption",
                    priority: "urgent",
                    dedupe_key: dedupeKey,
                  },
                }),
              );
            }
          }
        }
      } catch (attentionError) {
        if (attentionError?.name === "AbortError") return;
        console.error("AVANTIQO_ATTENTION_LOAD_FAILED", attentionError);
        setAttention(null);
      } finally {
        if (!controller.signal.aborted) setAttentionLoading(false);
      }
    }

    loadAttention();
    return () => controller.abort();
  }, [organizationId, entityId, periodId]);

  function speakResponse(message) {
    const spoken = text(message);
    if (!spoken) return;

    window.dispatchEvent(
      new CustomEvent("avantiqo:speak", {
        detail: {
          message: spoken,
          source: "operator",
        },
      }),
    );
  }

  async function sendMessage(rawValue, source = "text") {
    const message = text(rawValue);
    if (!message || !organizationId) return;

    if (busyRef.current || restoring) {
      if (source === "voice") {
        const previous = voiceQueueRef.current[voiceQueueRef.current.length - 1];
        if (text(previous?.message) !== message) {
          voiceQueueRef.current = [
            ...voiceQueueRef.current,
            { message, source },
          ].slice(-3);
        }
      }
      return;
    }

    const priorConversation = messagesRef.current.map(({ role, content }) => ({
      role,
      content,
    }));

    setMessages((current) => [...current, createMessage("user", message)]);
    setInput("");
    setError("");
    setBusy(true);
    busyRef.current = true;

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
            message,
            source,
            locale:
              typeof navigator !== "undefined"
                ? navigator.language || null
                : null,
            agreementState: agreementStateRef.current,
            conversation: priorConversation,
          }),
        },
        OPERATOR_TURN_TIMEOUT_MS,
        "Avantiqo took too long to complete that request. Please try again.",
      );

      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || "Avantiqo could not complete the request");
      }

      const decision = result?.decision || {};
      const responseText = decision?.response_text || "Done.";
      agreementStateRef.current =
        result?.agreement_state ||
        decision?.agreement_state ||
        agreementStateRef.current;
      setProjectState(result?.project_state || decision?.project_state || {});

      setMessages((current) => [
        ...current,
        createMessage("assistant", responseText, {
          options: Array.isArray(decision?.clarification?.options)
            ? decision.clarification.options
            : [],
        }),
      ]);

      if (source === "voice") {
        speakResponse(responseText);
      }

      if (result?.navigation?.href) {
        router.push(result.navigation.href);
      }
    } catch (requestError) {
      const messageText = requestError?.message || "Avantiqo failed";
      const responseText = `I couldn't complete that: ${messageText}`;
      setError(messageText);
      setMessages((current) => [
        ...current,
        createMessage("assistant", responseText),
      ]);

      if (source === "voice") {
        speakResponse(responseText);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    function receiveVoiceCommand(event) {
      const message = text(event?.detail?.message);
      if (!message) return;
      sendMessage(message, event?.detail?.source || "voice");
    }

    window.addEventListener("avantiqo:home-command", receiveVoiceCommand);
    return () => {
      window.removeEventListener("avantiqo:home-command", receiveVoiceCommand);
    };
  }, [organizationId, entityId, periodId, pathname, restoring]);

  useEffect(() => {
    if (restoring || busy || busyRef.current) return;

    const nextVoiceCommand = voiceQueueRef.current.shift();
    if (!nextVoiceCommand?.message) return;

    sendMessage(nextVoiceCommand.message, nextVoiceCommand.source || "voice");
  }, [busy, restoring, organizationId, entityId, periodId, pathname]);

  const attentionItems = Array.isArray(attention?.items) ? attention.items : [];
  const businessThesis = attention?.business_thesis || projectState?.business_thesis || null;
  const thesisChange = businessThesis?.change || null;
  const thesisOutlook = Array.isArray(businessThesis?.outlook)
    ? businessThesis.outlook.slice(0, 2)
    : [];
  const thesisUrgent = businessThesis?.interruption?.should_interrupt === true;

  return (
    <section
      data-avantiqo-home-intelligence="true"
      className="flex min-h-[620px] flex-col rounded-3xl border border-white/10 bg-white/[0.03] p-6"
    >
      <div>
        <div className="flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-white/40">
          <Sparkles size={14} className="text-[#D6A66A]" />
          Synthetic Intelligence
        </div>

        <h2 className="mt-4 text-3xl font-light tracking-[-0.04em]">
          Your business partner
        </h2>

        <p className="mt-3 max-w-xl text-sm leading-6 text-white/50">
          Avantiqo maintains a live evidence-backed view of the business, remembers the goal,
          challenges assumptions, recommends the strongest next move and executes governed actions
          when you authorize them.
        </p>
      </div>

      <div className="mt-6 flex-1 space-y-3 overflow-y-auto pr-1">
        {attentionLoading ? (
          <div
            data-avantiqo-attention-loading="true"
            className="rounded-2xl border border-white/[0.07] bg-black/20 px-4 py-3"
          >
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/40">
              <Loader2 size={12} className="animate-spin text-[#D6A66A]" />
              Updating the business thesis
            </div>
          </div>
        ) : null}

        {!attentionLoading && businessThesis ? (
          <div
            data-avantiqo-business-thesis="true"
            className={
              thesisUrgent
                ? "rounded-2xl border border-red-400/30 bg-red-500/[0.07] px-4 py-4"
                : "rounded-2xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.05] px-4 py-4"
            }
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className={
                  thesisUrgent
                    ? "flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-red-200/80"
                    : "flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[#D6A66A]/80"
                }>
                  {thesisUrgent ? <AlertTriangle size={12} /> : <Sparkles size={12} />}
                  Business thesis
                </div>
                {text(businessThesis?.summary) ? (
                  <div className="mt-2 text-sm font-light leading-6 text-white/75">
                    {businessThesis.summary}
                  </div>
                ) : null}
              </div>
              <div className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[9px] uppercase tracking-[0.12em] text-white/45">
                {thesisAttentionLabel(businessThesis?.attention_level)}
              </div>
            </div>

            {thesisChange?.material && text(thesisChange?.summary) ? (
              <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/20 px-3.5 py-3">
                <div className="text-[9px] uppercase tracking-[0.16em] text-white/35">
                  What changed
                </div>
                <div className="mt-1.5 text-xs leading-5 text-white/55">
                  {thesisChange.summary}
                </div>
              </div>
            ) : null}

            {thesisOutlook.length ? (
              <div className="mt-3 space-y-2">
                {thesisOutlook.map((item, index) => (
                  <div
                    key={`${item.horizon}-${index}`}
                    className="rounded-xl border border-white/[0.06] bg-black/15 px-3.5 py-2.5"
                  >
                    <div className="text-[9px] uppercase tracking-[0.14em] text-white/30">
                      Outlook · {text(item.horizon).replaceAll("_", " ")}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-white/50">
                      {item.prediction}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {text(businessThesis?.recommended_next_move) ? (
              <button
                type="button"
                disabled={busy || restoring}
                onClick={() =>
                  sendMessage(
                    `Discuss your recommended next move with me: ${businessThesis.recommended_next_move}`,
                  )
                }
                className="mt-3 text-left text-xs leading-5 text-[#D6A66A]/85 transition hover:text-[#E7C48E] disabled:opacity-40"
              >
                Recommended next move: {businessThesis.recommended_next_move}
              </button>
            ) : null}
          </div>
        ) : null}

        {!attentionLoading && attentionItems.length ? (
          <div
            data-avantiqo-attention-brief="true"
            className="rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/45">
                  <Sparkles size={12} className="text-[#D6A66A]" />
                  Evidence signals
                </div>
                {text(attention?.summary) ? (
                  <div className="mt-2 text-xs leading-5 text-white/45">
                    {attention.summary}
                  </div>
                ) : null}
              </div>
              <div className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[9px] uppercase tracking-[0.12em] text-white/40">
                Evidence-backed
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {attentionItems.map((item) => (
                <div
                  key={`${item.rank}-${item.title}`}
                  className="rounded-xl border border-white/[0.07] bg-black/20 px-3.5 py-3"
                >
                  <div className="text-sm font-light leading-5 text-white/85">
                    {item.title}
                  </div>
                  <div className="mt-1.5 text-xs leading-5 text-white/45">
                    {item.why_now}
                  </div>
                  {text(item?.recommended_next_step) ? (
                    <button
                      type="button"
                      disabled={busy || restoring}
                      onClick={() =>
                        sendMessage(
                          `Help me with this attention item: ${item.title}. ${item.recommended_next_step}`,
                        )
                      }
                      className="mt-2 text-left text-xs text-[#D6A66A]/80 transition hover:text-[#E7C48E] disabled:opacity-40"
                    >
                      {item.recommended_next_step}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="mt-3 text-[10px] leading-4 text-white/30">
              Recommendations are not approvals or authorization. Avantiqo still uses normal confirmation and approval governance before any business action.
            </div>
          </div>
        ) : null}

        {text(projectState?.objective) ? (
          <div className="rounded-2xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.06] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#D6A66A]/75">
                Current goal
              </div>
              <div className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[9px] uppercase tracking-[0.12em] text-white/45">
                {projectStatusLabel(projectState?.status)}
              </div>
            </div>
            <div className="mt-2 text-sm font-light leading-6 text-white/80">
              {projectState.objective}
            </div>
            {text(projectState?.progress_summary || projectState?.next_step) ? (
              <div className="mt-2 text-xs leading-5 text-white/45">
                {projectState.progress_summary || `Next: ${projectState.next_step}`}
              </div>
            ) : null}
          </div>
        ) : null}

        {restoring ? (
          <div className="mr-16 flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-black/25 px-4 py-3 text-xs text-white/45">
            <Loader2 size={14} className="animate-spin text-[#D6A66A]" />
            Restoring our conversation…
          </div>
        ) : null}

        {!restoring && messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === "user"
                ? "ml-10 rounded-2xl rounded-br-md border border-[#D6A66A]/20 bg-[#D6A66A]/10 px-4 py-3"
                : "mr-8 rounded-2xl rounded-bl-md border border-white/[0.07] bg-black/25 px-4 py-3"
            }
          >
            <div className="whitespace-pre-wrap text-sm font-light leading-6 text-white/80">
              {message.content}
            </div>

            {Array.isArray(message.options) && message.options.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {message.options.map((option) => (
                  <button
                    key={option.id || option.label}
                    type="button"
                    disabled={busy}
                    onClick={() => sendMessage(option.label)}
                    className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs text-white/65 transition hover:border-[#D6A66A]/35 hover:text-white disabled:opacity-40"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}

        {busy ? (
          <div className="mr-16 flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-black/25 px-4 py-3 text-xs text-white/45">
            <Loader2 size={14} className="animate-spin text-[#D6A66A]" />
            Thinking, checking context and connected capabilities…
          </div>
        ) : null}
      </div>

      <div className="mt-5 border-t border-white/[0.07] pt-4">
        {error ? (
          <div className="mb-3 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-xs text-red-200/75">
            {error}
          </div>
        ) : null}

        <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-black/25 p-2 focus-within:border-[#D6A66A]/35">
          <textarea
            data-avantiqo-home-input="true"
            value={input}
            rows={1}
            disabled={busy || restoring}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder={restoring ? "Restoring conversation…" : "Ask Avantiqo anything…"}
            className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-3 py-3 text-sm leading-5 text-white outline-none placeholder:text-white/25 disabled:opacity-50"
          />

          <button
            type="button"
            onClick={() => sendMessage(input)}
            disabled={busy || restoring || !text(input)}
            className="flex h-11 items-center gap-2 rounded-xl bg-[#D6A66A] px-4 text-sm font-medium text-black transition hover:bg-[#E7C48E] disabled:cursor-not-allowed disabled:opacity-30"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Send
          </button>
        </div>
      </div>
    </section>
  );
}
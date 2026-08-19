"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function text(value) {
  return String(value ?? "").trim();
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

export default function HomeAvantiqoIntelligence({ organizationId: organizationIdProp }) {
  const router = useRouter();
  const pathname = usePathname();
  const businessContext = useBusinessContext();

  const messagesRef = useRef([]);
  const agreementStateRef = useRef({});
  const busyRef = useRef(false);

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

        setAttention(result?.attention || null);
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
    if (!message || !organizationId || busyRef.current || restoring) return;

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
          source,
          locale:
            typeof navigator !== "undefined"
              ? navigator.language || null
              : null,
          agreementState: agreementStateRef.current,
          conversation: priorConversation,
        }),
      });

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

  const attentionItems = Array.isArray(attention?.items) ? attention.items : [];

  return (
    <section
      data-avantiqo-home-intelligence="true"
      className="flex min-h-[620px] flex-col rounded-3xl border border-white/10 bg-white/[0.03] p-6"
    >
      <div>
        <div className="flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-white/40">
          <Sparkles size={14} className="text-[#D6A66A]" />
          Company Intelligence
        </div>

        <h2 className="mt-4 text-3xl font-light tracking-[-0.04em]">
          Organization intelligence
        </h2>

        <p className="mt-3 max-w-xl text-sm leading-6 text-white/50">
          Talk with Avantiqo about the business, ask for an explanation, open a workspace,
          prepare work or execute connected capabilities. The conversation and your agreements
          continue across sessions for this organization.
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
              Checking what deserves attention
            </div>
          </div>
        ) : null}

        {!attentionLoading && attentionItems.length ? (
          <div
            data-avantiqo-attention-brief="true"
            className="rounded-2xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.06] px-4 py-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[#D6A66A]/80">
                  <Sparkles size={12} />
                  Needs attention
                </div>
                {text(attention?.summary) ? (
                  <div className="mt-2 text-xs leading-5 text-white/50">
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

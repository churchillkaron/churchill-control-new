"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Send, Sparkles } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { operatorReferenceNeedsDeviceLocation } from "@/lib/operator/contracts/OperatorSymbolicReference.js";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import OperatorExecutionArtifacts from "@/components/operator/OperatorExecutionArtifacts";
import OperatorConversationText from "@/components/operator/OperatorConversationText";
import {
  operatorExecutionStatePresentation,
} from "@/lib/operator/presentation/OperatorExecutionStatePresentation";

// Owned Intelligence is zero-idle and can cold-start. Keep the browser alive
// for the governed backend lifecycle instead of abandoning a live Safe Lease at 30s.
const OPERATOR_TURN_TIMEOUT_MS = 12 * 60 * 1000;
const INTELLIGENCE_PREWARM_TIMEOUT_MS = 30 * 1000;

function text(value) {
  return String(value ?? "").trim();
}

const BUSINESS_DIAGNOSIS_PROOF_INTEGRITY_ERROR_CODE = "BUSINESS_DIAGNOSIS_PROOF_INTEGRITY_FAILURE";
const BUSINESS_DIAGNOSIS_NOT_READY_CODE = "BUSINESS_DIAGNOSIS_NOT_READY";

function operatorRequestError(result = {}, fallback = "Avantiqo could not complete the request") {
  const error = new Error(text(result?.error) || fallback);
  error.code = text(result?.details?.code);
  error.stage = text(result?.details?.stage);
  error.authorityEffect = text(result?.details?.authority_effect);
  error.readinessStatus = text(result?.details?.readiness_status);
  error.blockerCount = Number.isFinite(Number(result?.details?.blocker_count)) ? Number(result.details.blocker_count) : 0;
  error.retryable = result?.details?.retryable === true;
  return error;
}

function operatorRequestErrorMessage(error) {
  if (text(error?.code) === BUSINESS_DIAGNOSIS_PROOF_INTEGRITY_ERROR_CODE) {
    return "I stopped this diagnosis because its proof could not be verified. No action was executed. Please retry the diagnosis.";
  }
  if (text(error?.code) === BUSINESS_DIAGNOSIS_NOT_READY_CODE) {
    return "I did not start this diagnosis because required proof authenticity is not ready. No analysis or action was executed.";
  }
  return error?.message || "Avantiqo failed";
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


function browserLocation() {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ status: "unavailable" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        status: "granted",
        latitude: Number(position.coords.latitude),
        longitude: Number(position.coords.longitude),
        accuracy_m: Number(position.coords.accuracy || 0) || null,
        captured_at: new Date(position.timestamp || Date.now()).toISOString(),
      }),
      (error) => resolve({ status: error?.code === 1 ? "denied" : "unavailable" }),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 5 * 60 * 1000 },
    );
  });
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

function busyRequestStatus(liveExecution, elapsedSeconds, startedAt) {
  const elapsed = Math.max(0, Number(elapsedSeconds || 0));
  const updatedAt = Date.parse(text(liveExecution?.updated_at));
  const freshLiveExecution =
    liveExecution &&
    Number.isFinite(updatedAt) &&
    Number.isFinite(Number(startedAt)) &&
    updatedAt >= Number(startedAt) - 2000;

  if (freshLiveExecution) {
    const event = liveExecution?.latest_event || null;
    const description = text(event?.description);
    if (description) {
      return description;
    }

    const phase = text(event?.phase || liveExecution?.phase || liveExecution?.status)
      .replaceAll("_", " ")
      .toLowerCase();
    if (phase) return phase.charAt(0).toUpperCase() + phase.slice(1) + "…";
  }

  if (elapsed < 3) return "Understanding your request…";
  if (elapsed < 10) return "Checking the business context…";
  if (elapsed < 30) return "Reasoning through the evidence…";
  return "Working through the request…";
}


export default function HomeAvantiqoIntelligence({
  organizationId: organizationIdProp,
  prepareAttachmentSetForTurn = null,
  completeAttachmentTurn = null,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const businessContext = useBusinessContext();

  const messagesRef = useRef([]);
  const agreementStateRef = useRef({});
  const busyRef = useRef(false);
  const pendingTurnQueueRef = useRef([]);
  const sendMessageRef = useRef(null);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [attentionLoading, setAttentionLoading] = useState(false);
  const [attention, setAttention] = useState(null);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([greetingMessage()]);
  const [projectState, setProjectState] = useState({});
  const [activeRequestStartedAt, setActiveRequestStartedAt] = useState(null);
  const [busyElapsedSeconds, setBusyElapsedSeconds] = useState(0);
  const [liveExecution, setLiveExecution] = useState(null);

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
    if (!busy || !organizationId || !activeRequestStartedAt) {
      if (!busy) {
        setBusyElapsedSeconds(0);
        setLiveExecution(null);
      }
      return undefined;
    }

    let cancelled = false;
    let polling = false;

    const updateElapsed = () => {
      setBusyElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - activeRequestStartedAt) / 1000)),
      );
    };

    const loadLiveExecution = async () => {
      if (polling || cancelled) return;
      polling = true;
      try {
        const response = await fetch(
          `/api/operator/live-execution?organizationId=${encodeURIComponent(organizationId)}`,
          { credentials: "same-origin", cache: "no-store" },
        );
        const result = await response.json().catch(() => ({}));
        if (!cancelled && response.ok && result?.success !== false) {
          setLiveExecution(result?.live_execution || null);
        }
      } catch {
        // Progress polling is advisory and must never fail the authoritative turn.
      } finally {
        polling = false;
      }
    };

    updateElapsed();
    loadLiveExecution();
    const elapsedTimer = window.setInterval(updateElapsed, 1000);
    const liveTimer = window.setInterval(loadLiveExecution, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(elapsedTimer);
      window.clearInterval(liveTimer);
    };
  }, [busy, organizationId, activeRequestStartedAt]);

  useEffect(() => {
    if (!organizationId) return undefined;

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), INTELLIGENCE_PREWARM_TIMEOUT_MS);

    fetch("/api/operator/intelligence/prewarm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      signal: controller.signal,
      body: JSON.stringify({ organizationId }),
    }).catch((prewarmError) => {
      if (prewarmError?.name !== "AbortError") {
        console.debug("AVANTIQO_INTELLIGENCE_FRONT_PREWARM_ADVISORY_FAILURE", prewarmError?.message || prewarmError);
      }
    }).finally(() => window.clearTimeout(timer));

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) return undefined;

    const controller = new AbortController();
    fetch("/api/operator/code/prewarm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      signal: controller.signal,
      body: JSON.stringify({ organizationId }),
    }).catch((readinessError) => {
      if (readinessError?.name !== "AbortError") {
        console.debug(
          "AVANTIQO_CODE_READINESS_ADVISORY_FAILURE",
          readinessError?.message || readinessError,
        );
      }
    });

    return () => controller.abort();
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) {
      agreementStateRef.current = {};
      pendingTurnQueueRef.current = [];
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
                  execution: turn?.execution || {},
                  evidence: turn?.evidence || {},
                  navigation: turn?.navigation || {},
                  governance:
                    turn.role === "assistant"
                      ? operatorExecutionStatePresentation(turn)
                      : null,
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
            passiveSnapshot: true,
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

    if (restoring) return;

    if (busyRef.current) {
      const previous = pendingTurnQueueRef.current[pendingTurnQueueRef.current.length - 1];
      if (text(previous?.message) !== message) {
        pendingTurnQueueRef.current = [
          ...pendingTurnQueueRef.current,
          { message, source },
        ].slice(-3);
      }
      setInput("");
      const stopExecutionId = text(liveExecution?.stop_execution_id);
      if (stopExecutionId) {
        fetch("/api/operator/live-execution", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ organizationId, executionId: stopExecutionId }),
        }).catch(() => null);
      }
      return;
    }

    const priorConversation = messagesRef.current.map(({ role, content, clarification }) => ({
      role, content, ...(clarification ? { clarification } : {}),
    }));
    const previousAssistant = [...messagesRef.current].reverse().find((item) => item?.role === "assistant") || null;
    let deviceLocation = null;
    if (operatorReferenceNeedsDeviceLocation({ fieldKey: previousAssistant?.clarification?.field_key, value: message })) {
      deviceLocation = await browserLocation();
    }

    setMessages((current) => [...current, createMessage("user", message)]);
    setInput("");
    setError("");
    setBusy(true);
    setActiveRequestStartedAt(Date.now());
    setBusyElapsedSeconds(0);
    setLiveExecution(null);
    busyRef.current = true;

    try {
      const requestTurn = (locationContext = null) =>
        fetchWithTimeout(
          "/api/operator/turn/live",
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
              ...(locationContext
                ? { clientContext: { deviceLocation: locationContext } }
                : {}),
            }),
          },
          OPERATOR_TURN_TIMEOUT_MS,
          "Avantiqo took too long to complete that request. Please try again.",
        );

    try {
      let response = await requestTurn(deviceLocation);
      let result = await response.json().catch(() => ({}));
      if (
        response.ok &&
        result?.success !== false &&
        result?.client_context_request?.kind === "device_location" &&
        !deviceLocation
      ) {
        deviceLocation = await browserLocation();
        response = await requestTurn(deviceLocation);
        result = await response.json().catch(() => ({}));
      }
      if (!response.ok || result?.success === false) {
        throw operatorRequestError(result);
      }
      const decision = result?.decision || {};
      const responseText = text(decision?.response_text);
      if (!responseText) {
        throw new Error(
          "Avantiqo returned no reliable response. No action was assumed complete.",
        );
      }
      if (turnAttachmentSetId && typeof completeAttachmentTurn === "function") {
        completeAttachmentTurn(turnAttachmentSetId);
      }
      if (result?.state_unchanged !== true) {
        agreementStateRef.current =
          result?.agreement_state ||
          decision?.agreement_state ||
          agreementStateRef.current;
        setProjectState(result?.project_state || decision?.project_state || {});
      }

      setMessages((current) => [
        ...current,
        createMessage("assistant", responseText, {
          options: Array.isArray(decision?.clarification?.options)
            ? decision.clarification.options
            : [],
          clarification: decision?.clarification || null,
          execution: result?.execution || {},
          evidence: { ...(result?.provider_evidence || {}), ...(result?.business_diagnosis ? { business_diagnosis: result.business_diagnosis } : {}) },
          navigation: result?.navigation || {},
          governance: operatorExecutionStatePresentation(result),
        }),
      ]);

      if (source === "voice") {
        speakResponse(responseText);
      }

      if (result?.navigation?.href) {
        router.push(result.navigation.href);
      }
    } catch (requestError) {
      const messageText = operatorRequestErrorMessage(requestError);
      const governedDiagnosisFailure = [BUSINESS_DIAGNOSIS_PROOF_INTEGRITY_ERROR_CODE, BUSINESS_DIAGNOSIS_NOT_READY_CODE].includes(text(requestError?.code));
      const responseText = governedDiagnosisFailure ? messageText : `I couldn't complete that: ${messageText}`;
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
    sendMessageRef.current = sendMessage;
  });

  useEffect(() => {
    function receiveVoiceCommand(event) {
      const message = text(event?.detail?.message);
      if (!message) return;
      sendMessageRef.current?.(message, event?.detail?.source || "voice");
    }

    window.addEventListener("avantiqo:home-command", receiveVoiceCommand);
    return () => {
      window.removeEventListener("avantiqo:home-command", receiveVoiceCommand);
    };
  }, [organizationId, entityId, periodId, pathname, restoring]);

  useEffect(() => {
    if (restoring || busy || busyRef.current) return;

    const nextQueuedTurn = pendingTurnQueueRef.current.shift();
    if (!nextQueuedTurn?.message) return;

    sendMessageRef.current?.(nextQueuedTurn.message, nextQueuedTurn.source || "text");
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
      data-avantiqo-clipboard-boundary="true"
      onKeyDownCapture={(event) => {
        const command = event.metaKey || event.ctrlKey;
        const key = String(event.key || "").toLowerCase();
        if (command && ["a", "c", "v", "x"].includes(key)) event.stopPropagation();
      }}
      onCopy={(event) => event.stopPropagation()}
      onCut={(event) => event.stopPropagation()}
      onPaste={(event) => event.stopPropagation()}
      className="flex min-h-[620px] flex-col rounded-2xl border border-black/[0.075] bg-white p-5 text-[#191919] shadow-[0_1px_2px_rgba(0,0,0,0.025)]"
    >
      <div>
        <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-[#8A867F]">
          <Sparkles size={14} className="text-[#D6A66A]" />
          Synthetic Intelligence
        </div>

        <h2 className="mt-3 text-[25px] font-medium tracking-[-0.035em] text-[#1A1917]">
          Your business partner
        </h2>

        <p className="mt-2 max-w-xl text-[12px] leading-5 text-[#77726B]">
          Avantiqo maintains a live evidence-backed view of the business, remembers the goal,
          challenges assumptions, recommends the strongest next move and executes governed actions
          when you authorize them.
        </p>
      </div>

      <div className="mt-6 flex-1 space-y-3 overflow-y-auto pr-1">
        {attentionLoading ? (
          <div
            data-avantiqo-attention-loading="true"
            className="rounded-2xl border border-black/[0.07] bg-[#FAF9F6] px-4 py-3"
          >
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[#8A867F]">
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
                ? "rounded-2xl border border-[#B36B52]/20 bg-[#FFF8F5] px-4 py-4"
                : "rounded-2xl border border-[#D6A66A]/30 bg-[#FBF7F1] px-4 py-4"
            }
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className={
                  thesisUrgent
                    ? "flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[#9A533D]"
                    : "flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[#9A744B]"
                }>
                  {thesisUrgent ? <AlertTriangle size={12} /> : <Sparkles size={12} />}
                  Business thesis
                </div>
                {text(businessThesis?.summary) ? (
                  <div className="mt-2 text-sm leading-6 text-[#4E4A44]">
                    {businessThesis.summary}
                  </div>
                ) : null}
              </div>
              <div className="rounded-full border border-black/[0.08] bg-white px-2.5 py-1 text-[9px] uppercase tracking-[0.12em] text-[#8A867F]">
                {thesisAttentionLabel(businessThesis?.attention_level)}
              </div>
            </div>

            {thesisChange?.material && text(thesisChange?.summary) ? (
              <div className="mt-3 rounded-xl border border-black/[0.07] bg-white px-3.5 py-3">
                <div className="text-[9px] uppercase tracking-[0.16em] text-[#9A968E]">
                  What changed
                </div>
                <div className="mt-1.5 text-xs leading-5 text-[#6C6963]">
                  {thesisChange.summary}
                </div>
              </div>
            ) : null}

            {thesisOutlook.length ? (
              <div className="mt-3 space-y-2">
                {thesisOutlook.map((item, index) => (
                  <div
                    key={`${item.horizon}-${index}`}
                    className="rounded-xl border border-black/[0.06] bg-white px-3.5 py-2.5"
                  >
                    <div className="text-[9px] uppercase tracking-[0.14em] text-[#AAA69E]">
                      Outlook · {text(item.horizon).replaceAll("_", " ")}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-[#6C6963]">
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
                className="mt-3 text-left text-xs leading-5 text-[#8D6338] transition hover:text-[#6F4D2D] disabled:opacity-40"
              >
                Recommended next move: {businessThesis.recommended_next_move}
              </button>
            ) : null}
          </div>
        ) : null}

        {!attentionLoading && attentionItems.length ? (
          <div
            data-avantiqo-attention-brief="true"
            className="rounded-2xl border border-black/[0.075] bg-[#FAF9F6] px-4 py-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[#8A867F]">
                  <Sparkles size={12} className="text-[#D6A66A]" />
                  Evidence signals
                </div>
                {text(attention?.summary) ? (
                  <div className="mt-2 text-xs leading-5 text-[#77726B]">
                    {attention.summary}
                  </div>
                ) : null}
              </div>
              <div className="rounded-full border border-black/[0.08] bg-white px-2.5 py-1 text-[9px] uppercase tracking-[0.12em] text-[#8A867F]">
                Evidence-backed
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {attentionItems.map((item) => (
                <div
                  key={`${item.rank}-${item.title}`}
                  className="rounded-xl border border-black/[0.07] bg-white px-3.5 py-3"
                >
                  <div className="text-sm leading-5 text-[#3F3B36]">
                    {item.title}
                  </div>
                  <div className="mt-1.5 text-xs leading-5 text-[#77726B]">
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
                      className="mt-2 text-left text-xs text-[#8D6338] transition hover:text-[#6F4D2D] disabled:opacity-40"
                    >
                      {item.recommended_next_step}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="mt-3 text-[10px] leading-4 text-[#9A968E]">
              Recommendations are not approvals or authorization. Avantiqo still uses normal confirmation and approval governance before any business action.
            </div>
          </div>
        ) : null}

        {text(projectState?.objective) ? (
          <div className="rounded-2xl border border-[#D6A66A]/30 bg-[#FBF7F1] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#9A744B]">
                Current goal
              </div>
              <div className="rounded-full border border-black/[0.08] bg-white px-2.5 py-1 text-[9px] uppercase tracking-[0.12em] text-[#8A867F]">
                {projectStatusLabel(projectState?.status)}
              </div>
            </div>
            <div className="mt-2 text-sm leading-6 text-[#4E4A44]">
              {projectState.objective}
            </div>
            {text(projectState?.progress_summary || projectState?.next_step) ? (
              <div className="mt-2 text-xs leading-5 text-[#77726B]">
                {projectState.progress_summary || `Next: ${projectState.next_step}`}
              </div>
            ) : null}
          </div>
        ) : null}

        {restoring ? (
          <div className="mr-16 flex items-center gap-3 rounded-2xl border border-black/[0.07] bg-[#FAF9F6] px-4 py-3 text-xs text-[#77726B]">
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
                : "mr-8 px-1 py-3"
            }
          >
            {message.role === "assistant" ? (
              <OperatorConversationText content={message.content} tone="light" />
            ) : (
              <div className="whitespace-pre-wrap text-sm leading-6 text-[#3F3B36]">
                {message.content}
              </div>
            )}

            {message.role === "assistant" ? (
              <OperatorExecutionArtifacts execution={message.execution || {}} evidence={message.evidence || {}} organizationId={organizationId} />
            ) : null}

            {message.role === "assistant" && message.governance ? (
              <div
                data-avantiqo-execution-state={message.governance.tone}
                className={
                  message.governance.tone === "blocked"
                    ? "mt-3 rounded-xl border border-[#B36B52]/20 bg-[#FFF8F5] px-3 py-2.5"
                    : message.governance.tone === "verified"
                      ? "mt-3 rounded-xl border border-[#D6A66A]/30 bg-[#FBF7F1] px-3 py-2.5"
                      : "mt-3 rounded-xl border border-black/[0.07] bg-[#FAF9F6] px-3 py-2.5"
                }
              >
                <div className="text-[9px] uppercase tracking-[0.16em] text-[#8A867F]">
                  {message.governance.label}
                </div>
                <div className="mt-1 text-[11px] leading-4 text-[#6C6963]">
                  {message.governance.detail}
                </div>
              </div>
            ) : null}

            {Array.isArray(message.options) && message.options.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {message.options.map((option) => (
                  <button
                    key={option.id || option.label}
                    type="button"
                    disabled={busy}
                    onClick={() => sendMessage(option.label)}
                    className="rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-xs text-[#665F57] transition hover:border-[#D6A66A]/45 hover:text-[#8D6338] disabled:opacity-40"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}

        {busy ? (
          <div
            data-avantiqo-live-status="true"
            aria-live="polite"
            className="mr-8 overflow-hidden rounded-2xl border border-[#D6A66A]/30 bg-[#FBF7F1]"
          >
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[#9A744B]">
                  <Loader2 size={12} className="animate-spin" />
                  Avantiqo is working
                </div>
                <div className="mt-1.5 truncate text-sm text-[#4E4A44]">
                  {busyRequestStatus(liveExecution, busyElapsedSeconds, activeRequestStartedAt)}
                </div>
              </div>
              <div
                aria-label="elapsed time"
                className="shrink-0 rounded-full border border-black/[0.08] bg-white px-2.5 py-1 text-[10px] tabular-nums text-[#8A867F]"
              >
                {busyElapsedSeconds}s
              </div>
            </div>
            <div className="h-px bg-gradient-to-r from-transparent via-[#D6A66A]/35 to-transparent" />
            <div className="flex items-center justify-between gap-3 px-4 py-2 text-[10px] leading-4 text-[#9A968E]">
              <span>You can type a correction or new instruction while this runs.</span>
              <span className="shrink-0 uppercase tracking-[0.12em]">Governed execution</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-5 border-t border-black/[0.07] pt-4">
        {error ? (
          <div className="mb-3 rounded-xl border border-[#B36B52]/20 bg-[#FFF8F5] px-3 py-2 text-xs text-[#8B4937]">
            {error}
          </div>
        ) : null}

        <div className="flex items-end gap-2 rounded-2xl border border-black/[0.09] bg-white p-2 shadow-[0_1px_2px_rgba(0,0,0,0.025)] focus-within:border-[#D6A66A]/55">
          <textarea
            data-avantiqo-home-input="true"
            value={input}
            rows={1}
            disabled={restoring}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder={restoring ? "Restoring conversation…" : busy ? "Correct or redirect Avantiqo while it works…" : "Ask Avantiqo anything…"}
            className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-3 py-3 text-sm leading-5 text-[#2F2C28] outline-none placeholder:text-[#AAA69E] disabled:opacity-50"
          />

          <button
            type="button"
            onClick={() => sendMessage(input)}
            disabled={restoring || !text(input)}
            className="flex h-11 items-center gap-2 rounded-xl bg-[#2A2723] px-4 text-sm font-medium text-white transition hover:bg-[#403B35] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Send size={15} />
            {busy ? "Update" : "Send"}
          </button>
        </div>
      </div>
    </section>
  );
}

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function findText(value, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findText(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof value !== "object") return "";

  for (const key of ["text", "output_text", "content", "message"]) {
    const direct = value[key];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
  }

  for (const key of ["output", "result", "data", "response", "raw"]) {
    const found = findText(value[key], depth + 1);
    if (found) return found;
  }

  return "";
}

const CASUAL_PATTERNS = [
  /^how are you[?.! ]*$/i,
  /^how'?s it going[?.! ]*$/i,
  /^how are things[?.! ]*$/i,
  /^hello[?.! ]*$/i,
  /^hi[?.! ]*$/i,
  /^hey[?.! ]*$/i,
  /^good (morning|afternoon|evening)[?.! ]*$/i,
  /^thank(s| you)[?.! ]*$/i,
  /^who are you[?.! ]*$/i,
  /^what('?s| is) your name[?.! ]*$/i,
  /^wie geht('?s| es dir)?[?.! ]*$/i,
  /^hallo[?.! ]*$/i,
  /^hej[?.! ]*$/i,
  /^hur mår du[?.! ]*$/i,
  /^bonjour[?.! ]*$/i,
  /^comment ça va[?.! ]*$/i,
  /^hola[?.! ]*$/i,
  /^cómo estás[?.! ]*$/i,
  /^ciao[?.! ]*$/i,
  /^come stai[?.! ]*$/i,
  /^สวัสดี[?.! ]*$/i,
  /^เป็นไงบ้าง[?.! ]*$/i,
];

const SIMPLE_QUESTION_PATTERN = /^(what|who|when|where|why|how|is|are|do|does|did|can|could|would|will)\b/i;
const BUSINESS_OR_ACTION_PATTERN = /\b(create|draft|write|send|post|publish|delete|remove|update|change|pay|refund|approve|reject|execute|fix|repair|open|navigate|show|list|check|manage|schedule|book|cancel|invoice|customer|supplier|employee|payroll|finance|revenue|expense|sales|stock|inventory|project|campaign|studio|asset|report|dashboard|system|workspace)\b/i;
const STRATEGIC_FOLLOW_UP_PATTERN = /\b(what should (?:we|i) do|what do you (?:suggest|recommend|think)|what would you (?:do|choose)|what(?:'s| is) your (?:suggestion|recommendation|advice|view)|how should (?:we|i) proceed|which option is best|what(?:'s| is) the best (?:move|option)|what are the tradeoffs|is this a good idea|challenge this|what next|next step)\b/i;
const PROJECT_CONTROL_PATTERN = /^(next|next step|continue|resume|carry on|keep going|go on|what(?:'s| is) next|what(?:'s| is) the next step|what should happen next|what do we need to do next)\s*[?.!]*$/i;
const PROJECT_STATUS_PATTERN = /^(where are we|where are we now|where did we stop|remind me where we are|remind me where we stopped|what did we decide|what have we decided|what was the decision|what did i decide|what did we agree|remind me what we decided|what are we doing|what are we working on|what(?:'s| s| is) the plan|remind me of the plan|what have we done|what did we do|what did we finish|what have we finished|what was the last step|what remains|what(?:'s| s| is) left|what still needs to be done|what(?:'s| s| is) still missing|what are the open questions|what are we waiting for|what(?:'s| s| is) blocking us|what is blocking us)\s*[?.!]*$/i;
const BUSINESS_THESIS_PATTERN = /^(what changed|what has changed|what changed in the business|what(?:'s| s| is) changed|what do you believe is happening|what do you think is happening|what are you watching|what are we watching|what do you predict|what(?:'s| s| is) your outlook|what is your outlook|what(?:'s| s| is) the business thesis|what is the business thesis|what(?:'s| s| is) your thesis|what is your thesis|what is your current view of the business)\s*[?.!]*$/i;
const CONTEXTUAL_FOLLOW_UP_PATTERN = /^(why|why not|how so|then what|and then|what about(?:\s+.+)?|what do you mean|what does that mean|can you explain|explain that|tell me more|go on|continue|and\?|so\?|then\?)\s*[?.!]*$/i;
const TEXT_NEUTRAL_CONVERSATION_PATTERN = /^(why|why not|how so|what do you mean|what does that mean|can you explain(?: that)?|explain that|tell me more|what do you think about (?:that|this|it)|what are the tradeoffs|what are the risks|is (?:that|this) safe|what exactly will (?:you|this|that) do|what will (?:this|that) do|thank(?:s| you)|got it|understood|i see|makes sense|that makes sense|sounds good|varfor|varfor inte|hur sa|vad menar du|vad betyder det|kan du forklara det|forklara det|beratta mer|vad tycker du om det|vilka ar avvagningarna|vilka ar riskerna|ar det sakert|vad exakt kommer du gora|vad kommer det gora|tack|jag forstar|forstar|det ar logiskt|later bra|warum|warum nicht|wieso|was meinst du|was bedeutet das|kannst du das erklaren|erklar das|erzahl mir mehr|was denkst du daruber|welche kompromisse gibt es|welche risiken gibt es|ist das sicher|was genau wirst du tun|was wird das tun|danke|verstanden|ich verstehe|klingt sinnvoll|klingt gut|pourquoi|tu veux dire quoi|ca veut dire quoi|peux[- ]tu expliquer|explique ca|dis m en plus|qu en penses[- ]tu|quels sont les risques|est[- ]ce sur|que vas[- ]tu faire exactement|merci|compris|je comprends|ca a du sens|ca semble bien|por que|por que no|como asi|que quieres decir|que significa eso|puedes explicar eso|explica eso|cuentame mas|que piensas de eso|cuales son los riesgos|es seguro|que vas a hacer exactamente|gracias|entendido|entiendo|tiene sentido|suena bien|ทำไม|หมายความว่าอะไร|หมายความว่าอย่างไร|อธิบายได้ไหม|อธิบายหน่อย|เล่าเพิ่มหน่อย|คุณคิดอย่างไร|มีความเสี่ยงอะไรบ้าง|ปลอดภัยไหม|คุณจะทำอะไร|ขอบคุณ|เข้าใจแล้ว|เข้าใจ|ฟังดูดี)\s*[?.!]*$/i;

function normalized(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+\-*/.\u0e00-\u0e7f\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sentence(value) {
  const clean = text(value);
  if (!clean) return "";
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

function joined(items, limit = 4) {
  const values = list(items).map((item) => text(item)).filter(Boolean).slice(-limit);
  if (!values.length) return "";
  if (values.length === 1) return values[0];
  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

function activeProject(projectState = {}) {
  const objective = text(projectState?.objective);
  const status = text(projectState?.status).toLowerCase();
  return Boolean(objective) && !["idle", "completed", "cancelled"].includes(status);
}

function compactProjectContext(projectState = {}) {
  const thesis = projectState?.business_thesis || null;
  return {
    objective: text(projectState?.objective) || null,
    status: text(projectState?.status) || null,
    decisions: list(projectState?.decisions).map(text).filter(Boolean).slice(-4),
    constraints: list(projectState?.constraints).map(text).filter(Boolean).slice(-4),
    assumptions: list(projectState?.assumptions).map(text).filter(Boolean).slice(-4),
    risks: list(projectState?.risks).map(text).filter(Boolean).slice(-4),
    opportunities: list(projectState?.opportunities).map(text).filter(Boolean).slice(-4),
    completed_steps: list(projectState?.completed_steps).map(text).filter(Boolean).slice(-3),
    progress_summary: text(projectState?.progress_summary) || null,
    next_step: text(projectState?.next_step) || null,
    recommended_next_move: text(projectState?.recommended_next_move) || null,
    blocker: text(projectState?.blocker) || null,
    open_questions: list(projectState?.open_questions).map(text).filter(Boolean).slice(-3),
    business_thesis: thesis
      ? {
          summary: text(thesis.summary) || null,
          attention_level: text(thesis.attention_level) || null,
          recommended_next_move: text(thesis.recommended_next_move) || null,
          recommendation_reason: text(thesis.recommendation_reason) || null,
          change: thesis.change || null,
          signals: list(thesis.signals).slice(0, 5),
          outlook: list(thesis.outlook).slice(0, 3),
        }
      : null,
  };
}

function compactPendingContext(agreementState = {}) {
  const pending = object(agreementState?.pending_execution);
  if (!text(pending.capability_key)) return null;

  const run = object(agreementState?.autonomous_run);
  const steps = list(run.planned_steps);
  const currentStep = steps.find(
    (step) => text(step?.id) === text(run.current_step_id),
  );

  return {
    objective: text(run.objective).slice(0, 700) || null,
    status: text(run.status) || null,
    current_step: text(currentStep?.description).slice(0, 500) || null,
    pending_reason: text(pending.reason).slice(0, 700) || null,
    original_request: text(pending.original_message).slice(0, 700) || null,
  };
}

function fastStrategicDiscussion(message) {
  const clean = text(message);
  return Boolean(
    clean &&
    clean.length <= 160 &&
    !BUSINESS_OR_ACTION_PATTERN.test(clean) &&
    (STRATEGIC_FOLLOW_UP_PATTERN.test(clean) || CONTEXTUAL_FOLLOW_UP_PATTERN.test(clean)),
  );
}

export function businessThesisContinuityReply({ message, projectState = {} } = {}) {
  const clean = normalized(message);
  if (!BUSINESS_THESIS_PATTERN.test(clean)) return null;

  const thesis = projectState?.business_thesis || null;
  if (!thesis || (!text(thesis.summary) && !list(thesis.signals).length)) {
    return "I do not have an evidence-backed business thesis recorded yet.";
  }

  const change = thesis.change || {};
  const signals = list(thesis.signals);
  const outlook = list(thesis.outlook);
  const recommendation = text(thesis.recommended_next_move);

  if (/changed/.test(clean)) {
    return text(change.summary) ||
      (change.material === true
        ? "The business thesis changed materially, but no compact change summary is recorded."
        : "There is no material evidence-backed change recorded since the last thesis.");
  }

  if (/watching/.test(clean)) {
    const watched = signals
      .slice(0, 4)
      .map((item) => text(item?.title))
      .filter(Boolean);
    return watched.length
      ? `I’m watching ${joined(watched, 4)}.`
      : "I do not have a material watch signal recorded right now.";
  }

  if (/predict|outlook/.test(clean)) {
    const predictions = outlook
      .slice(0, 3)
      .map((item) => text(item?.prediction))
      .filter(Boolean);
    return predictions.length
      ? `My evidence-backed outlook is: ${predictions.map(sentence).join(" ")}`
      : "I do not have a sufficiently supported forward outlook recorded right now.";
  }

  const parts = [sentence(thesis.summary)];
  if (recommendation) parts.push(`My recommended next move is ${sentence(recommendation)}`);
  return parts.filter(Boolean).join(" ");
}

export function projectContinuityReply({ message, projectState = {} } = {}) {
  const clean = normalized(message);
  if (!PROJECT_STATUS_PATTERN.test(clean)) return null;

  const objective = text(projectState?.objective);
  const progress = text(projectState?.progress_summary);
  const nextStep = text(projectState?.next_step);
  const blocker = text(projectState?.blocker);
  const decisions = joined(projectState?.decisions, 4);
  const completed = joined(projectState?.completed_steps, 4);
  const questions = joined(projectState?.open_questions, 4);

  if (!objective && !progress && !decisions && !completed && !nextStep && !blocker) {
    return "We do not have an active project goal recorded yet.";
  }

  if (/decid|agree/.test(clean)) {
    return decisions
      ? `We decided: ${decisions}.`
      : "We have not recorded a material decision yet.";
  }

  if (/open questions/.test(clean)) {
    return questions
      ? `The open questions are ${questions}.`
      : "There are no recorded open questions right now.";
  }

  if (/blocking|waiting for/.test(clean)) {
    return blocker
      ? `The current blocker is ${sentence(blocker)}`
      : "There is no recorded blocker right now.";
  }

  if (/what have we done|what did we do|finish|last step/.test(clean)) {
    return completed
      ? `Completed so far: ${completed}.`
      : "No completed project steps are recorded yet.";
  }

  if (/what remains|what s left|what is left|still needs|still missing/.test(clean)) {
    if (blocker && nextStep) return `The next step is ${sentence(nextStep)} The blocker is ${sentence(blocker)}`;
    if (nextStep) return `The next step is ${sentence(nextStep)}`;
    if (blocker) return `The remaining issue is ${sentence(blocker)}`;
    return activeProject(projectState)
      ? "The goal is still active, but no specific next step is recorded yet."
      : "There is no unfinished active goal recorded.";
  }

  if (/plan/.test(clean)) {
    const parts = [];
    if (objective) parts.push(`Goal: ${sentence(objective)}`);
    if (progress) parts.push(`Progress: ${sentence(progress)}`);
    if (nextStep) parts.push(`Next: ${sentence(nextStep)}`);
    if (blocker) parts.push(`Blocked by: ${sentence(blocker)}`);
    return parts.join(" ") || "There is no active project plan recorded yet.";
  }

  const parts = [];
  if (objective) parts.push(`We are working on ${sentence(objective)}`);
  if (progress) parts.push(sentence(progress));
  if (nextStep) parts.push(`Next is ${sentence(nextStep)}`);
  if (blocker) parts.push(`The blocker is ${sentence(blocker)}`);
  return parts.join(" ") || "There is no active project state recorded yet.";
}

function arithmeticReply(message) {
  const expression = normalized(message)
    .replace(/^(what is|what s|calculate|compute)\s+/, "")
    .replace(/\bplus\b/g, "+")
    .replace(/\bminus\b/g, "-")
    .replace(/\b(times|multiplied by)\b/g, "*")
    .replace(/\b(divided by|over)\b/g, "/")
    .trim();
  const match = expression.match(/^(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;

  const left = Number(match[1]);
  const right = Number(match[3]);
  const operator = match[2];
  if (operator === "/" && right === 0) return "That cannot be divided by zero.";

  const result = operator === "+"
    ? left + right
    : operator === "-"
      ? left - right
      : operator === "*"
        ? left * right
        : left / right;
  if (!Number.isFinite(result)) return null;

  return `${match[1]} ${operator} ${match[3]} is ${Number(result.toFixed(8))}.`;
}

export function instantConversationReply({
  message,
  locale = null,
  timezone = null,
  now = new Date(),
} = {}) {
  const clean = normalized(message);
  if (!clean) return null;

  const arithmetic = arithmeticReply(clean);
  if (arithmetic) return arithmetic;

  if (/^(hello|hi|hey|good morning|good afternoon|good evening)$/.test(clean)) {
    return "Hi. I'm here and ready.";
  }
  if (/^(how are you|how s it going|how are things)$/.test(clean)) {
    return "I'm good, focused, and ready to work with you.";
  }
  if (/^(thank you|thanks)$/.test(clean)) return "You're welcome.";
  if (/^(good|great|perfect|excellent|nice|all good|sounds good)$/.test(clean)) {
    return "Great.";
  }
  if (/^(got it|understood)$/.test(clean)) return "Got it.";
  if (/^(you re welcome|youre welcome|no problem|no worries|anytime)$/.test(clean)) {
    return "Thank you.";
  }
  if (/^(are you there|are you listening|can you hear me)$/.test(clean)) {
    return "Yes, I'm here and listening.";
  }
  if (/^(who are you|what is your name|what s your name)$/.test(clean)) {
    return "I'm Avantiqo, your business partner inside Avantiqo.";
  }
  if (/^(what can you do|how can you help|help)$/.test(clean)) {
    return "I can discuss ideas, answer questions, navigate Avantiqo, prepare work, and execute approved business actions with you.";
  }
  if (/^(what time is it|what s the time|what is the time)$/.test(clean)) {
    const formatted = new Intl.DateTimeFormat(locale || "en", {
      timeZone: timezone || "UTC",
      hour: "numeric",
      minute: "2-digit",
    }).format(now);
    return `It is ${formatted}.`;
  }
  if (/^(what day is it|what is the date|what s the date|what date is it)$/.test(clean)) {
    const formatted = new Intl.DateTimeFormat(locale || "en", {
      timeZone: timezone || "UTC",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(now);
    return `It is ${formatted}.`;
  }

  return null;
}

export function isFastConversationTurn({ message, source, locale, timezone } = {}) {
  const clean = text(message);
  if (!clean || clean.length > 160) return false;

  if (PROJECT_CONTROL_PATTERN.test(clean)) return false;

  const channel = text(source).toLowerCase() || "text";
  if (channel !== "voice") {
    return TEXT_NEUTRAL_CONVERSATION_PATTERN.test(normalized(clean));
  }

  if (PROJECT_STATUS_PATTERN.test(clean)) return true;
  if (BUSINESS_THESIS_PATTERN.test(clean)) return true;
  if (instantConversationReply({ message: clean, locale, timezone })) return true;
  if (fastStrategicDiscussion(clean)) return true;

  if (CASUAL_PATTERNS.some((pattern) => pattern.test(clean))) return true;

  return SIMPLE_QUESTION_PATTERN.test(clean) &&
    !BUSINESS_OR_ACTION_PATTERN.test(clean);
}

export async function runFastConversationTurn({
  organizationId,
  partyId,
  entityId = null,
  locale = null,
  timezone = null,
  message,
  source = "voice",
  conversation = [],
  agreementState = {},
  projectState = {},
} = {}) {
  const thesisReply = businessThesisContinuityReply({ message, projectState });
  const projectReply = projectContinuityReply({ message, projectState });
  const instantReply = thesisReply || projectReply || instantConversationReply({
    message,
    locale,
    timezone,
  });
  if (instantReply) {
    return {
      success: true,
      decision: {
        response_text: instantReply,
        response_language: text(locale) || null,
        intent: "answer",
        confidence: 1,
        agreement_state: agreementState,
        project_state: projectState,
        clarification: { required: false, question: null, options: [] },
        navigation: { target_id: null },
        execution: { capability_key: null, payload: {}, reason: null },
        plan: [],
      },
      agreement_state: agreementState,
      current_screen: null,
      provider_evidence: {
        provider: "avantiqo-local",
        model: thesisReply
          ? "business-thesis-continuity-local-v1"
          : projectReply
            ? "project-continuity-local-v1"
            : "instant-conversation-v1",
        usage_id: null,
      },
      navigation: null,
      execution: null,
      operator_catalog: {
        navigation_target_count: 0,
        executable_capability_count: 0,
        bypassed_for_fast_conversation: true,
        instant_response: true,
        project_continuity: Boolean(projectReply),
        business_thesis_continuity: Boolean(thesisReply),
      },
    };
  }

  const recent = Array.isArray(conversation)
    ? conversation
        .slice(-4)
        .map((item) => ({
          role: item?.role === "assistant" ? "assistant" : "user",
          content: text(item?.content).slice(0, 500),
        }))
        .filter((item) => item.content)
    : [];
  const channel = text(source).toLowerCase() || "text";
  const voice = channel === "voice";
  const strategic = fastStrategicDiscussion(message);
  const projectContext = strategic ? compactProjectContext(projectState) : null;
  const pendingContext = compactPendingContext(agreementState);

  const prompt = `
You are Avantiqo, a natural human-style business partner in an ongoing ${voice ? "spoken" : "written"} conversation.

Respond directly to the current message without invoking business workflows or claiming any side effect.
Use the same language as the user unless they clearly request another language.
${strategic ? "This is a strategic follow-up. Use project_context and recent_conversation to develop the current idea, identify the key tradeoff, and recommend the best next direction. Do not invent live business facts, numbers, approvals, completed actions, or data that is not present in the supplied context." : "This is lightweight conversation. Keep the response concise and natural."}
${pendingContext ? "A governed action is still pending. Use pending_context when the user is discussing that action, but do not treat discussion, questions, acknowledgements, or thanks as confirmation, cancellation, resumption, or execution authority." : ""}
Do not ask the user to repeat facts already present in project_context, pending_context or recent_conversation.
Do not mention internal systems, routing, capabilities, AI models or implementation details.
${voice ? "Keep the response spoken-friendly, usually one or two short sentences." : "Keep the response concise and natural, usually one or two short paragraphs."}
Do not output JSON or markdown.

${strategic ? `Project context:\
${JSON.stringify(projectContext)}\
\
` : ""}${pendingContext ? `Pending context:\
${JSON.stringify(pendingContext)}\
\
` : ""}Recent conversation:
${JSON.stringify(recent)}

User: ${text(message)}

Reply only with what Avantiqo should say${voice ? " aloud" : ""}.
`.trim();

  const execution = await ServiceExecutionRuntime.execute({
    organization_id: organizationId,
    party_id: partyId,
    entity_id: entityId,
    service_id: "ai.text.generate",
    input: {
      prompt,
      max_output_tokens: strategic ? 120 : 80,
    },
    metadata: {
      module: "OPERATOR",
      operation: strategic ? "FAST_PROJECT_CONVERSATION" : "FAST_CONVERSATION",
      channel,
      latency_class: voice ? "realtime" : "interactive",
      strategic_project_context: strategic,
      pending_action_context: Boolean(pendingContext),
    },
    category: "AI",
  });

  const responseText = findText(execution);
  if (!responseText) {
    throw new Error("OPERATOR_FAST_CONVERSATION_EMPTY_RESPONSE");
  }

  return {
    success: true,
    decision: {
      response_text: responseText.slice(0, 500),
      response_language: text(locale) || null,
      intent: strategic ? "plan" : "answer",
      confidence: 1,
      agreement_state: agreementState,
      project_state: projectState,
      clarification: {
        required: false,
        question: null,
        options: [],
      },
      navigation: {
        target_id: null,
      },
      execution: {
        capability_key: null,
        payload: {},
        reason: null,
      },
      plan: [],
    },
    agreement_state: agreementState,
    current_screen: null,
    provider_evidence: {
      provider: execution?.provider || null,
      model: execution?.model || null,
      usage_id: execution?.usage?.id || null,
    },
    navigation: null,
    execution: null,
    operator_catalog: {
      navigation_target_count: 0,
      executable_capability_count: 0,
      bypassed_for_fast_conversation: true,
      strategic_project_context: strategic,
    },
  };
}
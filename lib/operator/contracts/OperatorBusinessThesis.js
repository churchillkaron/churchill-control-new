const ATTENTION_LEVELS = new Set(["clear", "watch", "important", "urgent"]);
const SIGNAL_KINDS = new Set([
  "risk",
  "opportunity",
  "decision",
  "execution",
  "anomaly",
  "watch",
]);
const OUTLOOK_HORIZONS = new Set([
  "immediate",
  "near_term",
  "this_period",
  "longer_term",
]);
const LEVEL_RANK = Object.freeze({
  clear: 0,
  watch: 1,
  important: 2,
  urgent: 3,
});

function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function strings(value, limit = 8, itemLimit = 240) {
  return list(value)
    .slice(0, limit)
    .map((item) => text(item, itemLimit))
    .filter(Boolean);
}

function confidence(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function attentionLevel(value, fallback = "clear") {
  const normalized = text(value, 40).toLowerCase();
  return ATTENTION_LEVELS.has(normalized) ? normalized : fallback;
}

function signalKind(value) {
  const normalized = text(value, 40).toLowerCase();
  return SIGNAL_KINDS.has(normalized) ? normalized : "watch";
}

function outlookHorizon(value) {
  const normalized = text(value, 40).toLowerCase();
  return OUTLOOK_HORIZONS.has(normalized) ? normalized : "near_term";
}

function normalizedSignal(value) {
  const source = object(value);
  const title = text(source.title, 180);
  if (!title) return null;

  return {
    title,
    kind: signalKind(source.kind),
    severity: attentionLevel(source.severity, "watch"),
    confidence: confidence(source.confidence, null),
    why_now: text(source.why_now || source.reason, 700) || null,
    evidence_refs: strings(source.evidence_refs, 6, 100),
    recommended_next_step:
      text(source.recommended_next_step, 600) || null,
    recommended_action_key:
      text(
        source.recommended_action_key ||
          source.recommended_action?.capability_key,
        240,
      ) || null,
  };
}

function normalizedOutlook(value) {
  const source = object(value);
  const prediction = text(source.prediction || source.outlook, 700);
  if (!prediction) return null;

  return {
    prediction,
    horizon: outlookHorizon(source.horizon),
    confidence: confidence(source.confidence, null),
    evidence_refs: strings(source.evidence_refs || source.basis_refs, 6, 100),
  };
}

function signalKey(signal) {
  return `${signalKind(signal?.kind)}:${text(signal?.title, 180)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0e00-\u0e7f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()}`;
}

function evidenceFingerprint(attention = {}) {
  const evidence = object(attention?.evidence);
  const steps = list(evidence.steps).map((step) => ({
    id: text(step?.id, 120) || null,
    capability_key:
      text(step?.capability_key || step?.capability?.key, 240) || null,
    status: text(step?.status, 80) || null,
    result: step?.result ?? null,
    error: text(step?.error, 400) || null,
  }));

  const serialized = JSON.stringify({
    status: text(evidence.status, 80) || null,
    total_steps: Number(evidence.total_steps || 0),
    completed_steps: Number(evidence.completed_steps || 0),
    failed_steps: Number(evidence.failed_steps || 0),
    steps,
  });

  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function strongestLevel(signals, fallback = "clear") {
  let strongest = attentionLevel(fallback, "clear");
  for (const signal of signals) {
    const candidate = attentionLevel(signal?.severity, "watch");
    if (LEVEL_RANK[candidate] > LEVEL_RANK[strongest]) strongest = candidate;
  }
  return strongest;
}

function normalizedChange(value) {
  const source = object(value);
  if (!Object.keys(source).length) return null;
  return {
    kind: text(source.kind, 40) || "update",
    material: source.material === true,
    evidence_changed: source.evidence_changed === true,
    new_signals: strings(source.new_signals, 8, 180),
    resolved_signals: strings(source.resolved_signals, 8, 180),
    escalated_signals: strings(source.escalated_signals, 8, 180),
    deescalated_signals: strings(source.deescalated_signals, 8, 180),
    recommendation_changed: source.recommendation_changed === true,
    summary: text(source.summary, 900) || null,
    computed_at: text(source.computed_at, 80) || null,
  };
}

function normalizedInterruption(value) {
  const source = object(value);
  if (!Object.keys(source).length) return null;
  const mode = text(source.mode, 40).toLowerCase();
  return {
    mode: ["none", "surface", "interrupt"].includes(mode) ? mode : "none",
    should_interrupt: source.should_interrupt === true,
    should_surface: source.should_surface === true,
    level: attentionLevel(source.level, "clear"),
    reason: text(source.reason, 700) || null,
    dedupe_key: text(source.dedupe_key, 240) || null,
  };
}

export function normalizeOperatorBusinessThesis(value) {
  const source = object(value);
  if (!Object.keys(source).length) return null;

  const signals = list(source.signals)
    .map(normalizedSignal)
    .filter(Boolean)
    .slice(0, 8);
  const outlook = list(source.outlook)
    .map(normalizedOutlook)
    .filter(Boolean)
    .slice(0, 4);

  const summary = text(source.summary, 1200);
  if (!summary && !signals.length && !outlook.length) return null;

  return {
    version: 1,
    summary: summary || null,
    attention_level: strongestLevel(signals, source.attention_level),
    confidence: confidence(source.confidence, null),
    signals,
    outlook,
    recommended_next_move:
      text(source.recommended_next_move, 800) || null,
    recommendation_reason:
      text(source.recommendation_reason, 1200) || null,
    evidence_fingerprint:
      text(source.evidence_fingerprint, 120) || null,
    generated_at: text(source.generated_at, 80) || null,
    change: normalizedChange(source.change),
    interruption: normalizedInterruption(source.interruption),
  };
}

function signalDelta(currentSignals, previousSignals) {
  const currentByKey = new Map(currentSignals.map((item) => [signalKey(item), item]));
  const previousByKey = new Map(previousSignals.map((item) => [signalKey(item), item]));
  const newSignals = [];
  const resolvedSignals = [];
  const escalatedSignals = [];
  const deescalatedSignals = [];

  for (const [key, signal] of currentByKey.entries()) {
    const previous = previousByKey.get(key);
    if (!previous) {
      newSignals.push(signal.title);
      continue;
    }
    const currentRank = LEVEL_RANK[attentionLevel(signal.severity, "watch")];
    const previousRank = LEVEL_RANK[attentionLevel(previous.severity, "watch")];
    if (currentRank > previousRank) escalatedSignals.push(signal.title);
    if (currentRank < previousRank) deescalatedSignals.push(signal.title);
  }

  for (const [key, signal] of previousByKey.entries()) {
    if (!currentByKey.has(key)) resolvedSignals.push(signal.title);
  }

  return {
    newSignals: newSignals.slice(0, 8),
    resolvedSignals: resolvedSignals.slice(0, 8),
    escalatedSignals: escalatedSignals.slice(0, 8),
    deescalatedSignals: deescalatedSignals.slice(0, 8),
  };
}

function changeSummary({
  initial,
  evidenceChanged,
  delta,
  recommendationChanged,
}) {
  if (initial) return "This is the first evidence-backed business thesis for this conversation.";
  if (!evidenceChanged) return "The live evidence fingerprint has not changed since the last business thesis.";

  const parts = [];
  if (delta.newSignals.length) {
    parts.push(`New: ${delta.newSignals.join(", ")}.`);
  }
  if (delta.escalatedSignals.length) {
    parts.push(`Escalated: ${delta.escalatedSignals.join(", ")}.`);
  }
  if (delta.resolvedSignals.length) {
    parts.push(`No longer present: ${delta.resolvedSignals.join(", ")}.`);
  }
  if (delta.deescalatedSignals.length) {
    parts.push(`De-escalated: ${delta.deescalatedSignals.join(", ")}.`);
  }
  if (recommendationChanged) parts.push("The recommended next move changed.");
  return parts.join(" ") || "The live evidence changed, but no material thesis signal changed.";
}

function interruptionPolicy({
  thesisLevel,
  currentSignals,
  previous,
  delta,
  evidenceChanged,
}) {
  const previousLevel = attentionLevel(previous?.attention_level, "clear");
  const newUrgent = currentSignals.some(
    (signal) =>
      attentionLevel(signal.severity, "watch") === "urgent" &&
      delta.newSignals.includes(signal.title),
  );
  const escalatedUrgent = currentSignals.some(
    (signal) =>
      attentionLevel(signal.severity, "watch") === "urgent" &&
      delta.escalatedSignals.includes(signal.title),
  );
  const firstUrgent = !previous && thesisLevel === "urgent";
  const shouldInterrupt = Boolean(
    evidenceChanged && (newUrgent || escalatedUrgent || firstUrgent),
  );
  const shouldSurface = Boolean(
    shouldInterrupt ||
      (evidenceChanged && LEVEL_RANK[thesisLevel] >= LEVEL_RANK.important) ||
      (LEVEL_RANK[thesisLevel] > LEVEL_RANK[previousLevel]),
  );
  const reasonSignal = currentSignals.find(
    (signal) => attentionLevel(signal.severity, "watch") === "urgent",
  );

  return {
    mode: shouldInterrupt ? "interrupt" : shouldSurface ? "surface" : "none",
    should_interrupt: shouldInterrupt,
    should_surface: shouldSurface,
    level: thesisLevel,
    reason:
      text(reasonSignal?.title, 180) ||
      (shouldSurface ? "The evidence-backed business thesis materially changed." : null),
  };
}

export function buildOperatorBusinessThesis({
  attention = {},
  previousThesis = null,
} = {}) {
  const previous = normalizeOperatorBusinessThesis(previousThesis);
  const currentSignals = list(attention?.items)
    .map(normalizedSignal)
    .filter(Boolean)
    .slice(0, 8);
  const outlook = list(attention?.outlook)
    .map(normalizedOutlook)
    .filter(Boolean)
    .slice(0, 4);
  const generatedAt =
    text(attention?.generated_at, 80) || new Date().toISOString();
  const fingerprint = evidenceFingerprint(attention);
  const evidenceChanged =
    !previous?.evidence_fingerprint ||
    previous.evidence_fingerprint !== fingerprint;
  const delta = signalDelta(currentSignals, list(previous?.signals));
  const recommendedNextMove =
    text(attention?.recommended_next_move, 800) ||
    text(currentSignals[0]?.recommended_next_step, 800) ||
    null;
  const recommendationReason =
    text(attention?.recommendation_reason, 1200) ||
    text(currentSignals[0]?.why_now, 1200) ||
    null;
  const recommendationChanged = Boolean(
    previous &&
      text(previous.recommended_next_move, 800) !== text(recommendedNextMove, 800),
  );
  const thesisLevel = strongestLevel(
    currentSignals,
    attention?.attention_level || (currentSignals.length ? "watch" : "clear"),
  );
  const material = Boolean(
    !previous ||
      delta.escalatedSignals.length ||
      delta.newSignals.some((title) => {
        const signal = currentSignals.find((item) => item.title === title);
        return LEVEL_RANK[attentionLevel(signal?.severity, "watch")] >= LEVEL_RANK.important;
      }) ||
      delta.resolvedSignals.some((title) => {
        const signal = list(previous?.signals).find((item) => item.title === title);
        return LEVEL_RANK[attentionLevel(signal?.severity, "watch")] >= LEVEL_RANK.important;
      }) ||
      recommendationChanged,
  );

  const interruption = interruptionPolicy({
    thesisLevel,
    currentSignals,
    previous,
    delta,
    evidenceChanged,
  });
  interruption.dedupe_key = `${fingerprint}:${interruption.mode}:${thesisLevel}`;

  return normalizeOperatorBusinessThesis({
    version: 1,
    summary:
      text(attention?.summary, 1200) ||
      (currentSignals.length
        ? "The latest live evidence contains business signals that deserve review."
        : "The latest live evidence did not produce a material attention signal."),
    attention_level: thesisLevel,
    confidence: confidence(attention?.confidence, null),
    signals: currentSignals,
    outlook,
    recommended_next_move: recommendedNextMove,
    recommendation_reason: recommendationReason,
    evidence_fingerprint: fingerprint,
    generated_at: generatedAt,
    change: {
      kind: previous ? "update" : "initial",
      material: material && evidenceChanged,
      evidence_changed: evidenceChanged,
      new_signals: delta.newSignals,
      resolved_signals: delta.resolvedSignals,
      escalated_signals: delta.escalatedSignals,
      deescalated_signals: delta.deescalatedSignals,
      recommendation_changed: recommendationChanged,
      summary: changeSummary({
        initial: !previous,
        evidenceChanged,
        delta,
        recommendationChanged,
      }),
      computed_at: new Date().toISOString(),
    },
    interruption,
  });
}

export function operatorBusinessThesisFromProjectState(projectState = {}) {
  return normalizeOperatorBusinessThesis(object(projectState).business_thesis);
}

export const OPERATOR_BUSINESS_THESIS_ATTENTION_LEVELS = Object.freeze(
  Array.from(ATTENTION_LEVELS),
);
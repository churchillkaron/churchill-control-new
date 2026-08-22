function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function confidence(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

export function classifyIntelligenceMemoryTrust(memory = {}) {
  const type = text(memory.type, 80).toLowerCase();
  const subject = text(memory.subject, 300).toLowerCase();
  const content = text(memory.content, 1600).toLowerCase();
  const score = confidence(memory.confidence);

  if (memory.requires_live_read === true || type === "fact") {
    return {
      class: "clue_only",
      weight: 0.35,
      requires_live_read: true,
      may_authorize: false,
      reason: "MUTABLE_FACT_REQUIRES_CURRENT_EVIDENCE",
    };
  }

  if (subject === "explicit_user_instruction") {
    return {
      class: "explicit_user_continuity",
      weight: 1,
      requires_live_read: false,
      may_authorize: false,
      reason: "EXPLICIT_USER_DURABLE_STATEMENT",
    };
  }

  if (type === "decision" || type === "constraint" || type === "preference") {
    return {
      class: score >= 0.9 ? "durable_high" : "durable_context",
      weight: score >= 0.9 ? 0.92 : 0.78,
      requires_live_read: false,
      may_authorize: false,
      reason: "DURABLE_CONTINUITY_CONTEXT",
    };
  }

  if (type === "goal") {
    return {
      class: "active_goal_context",
      weight: 0.94,
      requires_live_read: false,
      may_authorize: false,
      reason: "DURABLE_GOAL_CONTEXT",
    };
  }

  if (type === "completed_step") {
    const verified = content.includes("verified the business effect");
    return {
      class: verified ? "verified_history" : "execution_history",
      weight: verified ? 0.92 : 0.76,
      requires_live_read: false,
      may_authorize: false,
      reason: verified
        ? "VERIFIED_COMPLETED_STEP"
        : "RECORDED_COMPLETED_STEP",
    };
  }

  if (type === "lesson") {
    return {
      class: "learned_guidance",
      weight: Math.max(0.72, Math.min(0.9, score || 0.82)),
      requires_live_read: false,
      may_authorize: false,
      reason: "ADAPTIVE_PLANNING_GUIDANCE",
    };
  }

  if (type === "blocker") {
    return {
      class: "transient_recheck",
      weight: 0.55,
      requires_live_read: false,
      may_authorize: false,
      reason: "BLOCKER_MAY_HAVE_CHANGED",
    };
  }

  if (type === "relationship") {
    return {
      class: "relationship_context",
      weight: 0.7,
      requires_live_read: false,
      may_authorize: false,
      reason: "DURABLE_RELATIONSHIP_CONTEXT",
    };
  }

  return {
    class: "continuity_context",
    weight: 0.6,
    requires_live_read: false,
    may_authorize: false,
    reason: "GENERAL_DURABLE_CONTEXT",
  };
}

export function trustedMemoryEnvelope(memory = {}) {
  const trust = classifyIntelligenceMemoryTrust(memory);
  return {
    ...memory,
    trust_class: trust.class,
    trust_weight: trust.weight,
    trust_reason: trust.reason,
    requires_live_read:
      memory.requires_live_read === true || trust.requires_live_read === true,
    may_authorize: false,
  };
}

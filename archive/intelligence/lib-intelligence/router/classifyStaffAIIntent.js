export default function classifyStaffAIIntent({
  question = "",
  role = "",
}) {
  const q = String(question || "").toLowerCase();

  const isTranslation =
    /\b(translate|translation|say in|how do you say|thai|english|swedish|russian|french|german|japanese|chinese)\b/i.test(q);

  const isDateTime =
    /\b(date|day today|today|time|what day)\b/i.test(q);

  const isWeather =
    /\b(weather|rain|forecast weather|temperature)\b/i.test(q);

  const isFinance =
    /\b(revenue|profit|loss|cash|payroll|accounting|finance|forecast|cost|margin|budget)\b/i.test(q);

  const isOperations =
    /\b(table|guest|order|kitchen|staff|shift|service|complaint|vip|upsell|reservation|busy|slow)\b/i.test(q);

  if (isTranslation) {
    return {
      intent: "translation",
      requiresOrchestra: false,
      mode: "translator",
    };
  }

  if (isDateTime) {
    return {
      intent: "date_time",
      requiresOrchestra: false,
      mode: "direct",
    };
  }

  if (isWeather) {
    return {
      intent: "weather",
      requiresOrchestra: false,
      mode: "tool_needed",
    };
  }

  if (isFinance) {
    return {
      intent: "finance",
      requiresOrchestra: true,
      mode: "executive",
    };
  }

  if (isOperations) {
    return {
      intent: "operations",
      requiresOrchestra: true,
      mode: "operations",
    };
  }

  return {
    intent: "conversation",
    requiresOrchestra: false,
    mode: "normal",
  };
}

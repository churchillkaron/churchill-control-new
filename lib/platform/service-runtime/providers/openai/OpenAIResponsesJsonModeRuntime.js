const JSON_WORD_PATTERN = /\bjson\b/i;

const JSON_MODE_INSTRUCTION =
  "Output format: return exactly one valid json object and no text outside it.";

export function responsesInputMentionsJson(input) {
  if (typeof input === "string") {
    return JSON_WORD_PATTERN.test(input);
  }

  try {
    return JSON_WORD_PATTERN.test(JSON.stringify(input));
  } catch {
    return false;
  }
}

export function ensureResponsesJsonModeInput(input, format = null) {
  if (format?.type !== "json_object" || responsesInputMentionsJson(input)) {
    return input;
  }

  if (typeof input === "string") {
    return `${input}\n\n${JSON_MODE_INSTRUCTION}`;
  }

  if (Array.isArray(input)) {
    return [
      ...input,
      {
        role: "user",
        content: JSON_MODE_INSTRUCTION,
      },
    ];
  }

  return input;
}

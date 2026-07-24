const MAX_STRING_LENGTH = 4096;
const MAX_ARRAY_LENGTH = 50;
const MAX_DEPTH = 8;

function dataUrlDescriptor(value) {
  const match = String(value || "").match(/^data:([^;,]+)?(;base64)?,/i);

  return {
    omitted_binary: true,
    transport: "DATA_URL",
    content_type: match?.[1] || "application/octet-stream",
    encoded_length: String(value || "").length,
  };
}

function sanitizeString(value) {
  if (value.startsWith("data:")) {
    return dataUrlDescriptor(value);
  }

  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  return {
    omitted_long_string: true,
    original_length: value.length,
    preview: value.slice(0, 512),
  };
}

function sanitizeValue(value, depth, seen) {
  if (value == null) return value;

  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (["number", "boolean"].includes(typeof value)) {
    return value;
  }

  if (typeof value !== "object") {
    return String(value);
  }

  if (depth >= MAX_DEPTH) {
    return {
      omitted_nested_value: true,
      depth,
    };
  }

  if (seen.has(value)) {
    return {
      omitted_circular_reference: true,
    };
  }

  seen.add(value);

  if (Array.isArray(value)) {
    const output = value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((entry) => sanitizeValue(entry, depth + 1, seen));

    if (value.length > MAX_ARRAY_LENGTH) {
      output.push({
        omitted_array_items: value.length - MAX_ARRAY_LENGTH,
      });
    }

    seen.delete(value);
    return output;
  }

  const output = {};

  for (const [key, entry] of Object.entries(value)) {
    output[key] = sanitizeValue(entry, depth + 1, seen);
  }

  seen.delete(value);
  return output;
}

export function sanitizeServiceExecutionMetadata(value) {
  return sanitizeValue(value, 0, new WeakSet());
}

const TYPE_MARKER = "__avantiqo_json_type";

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value),
  );
}

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function schemaError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function sanitizeName(value) {
  const normalized = String(value || "creative_reasoning")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);

  return normalized || "creative_reasoning";
}

function jsonNodeDefinitions() {
  const nullNode = {
    type: "object",
    properties: {
      [TYPE_MARKER]: {
        type: "string",
        enum: ["null"],
      },
    },
    required: [TYPE_MARKER],
    additionalProperties: false,
  };

  const stringNode = {
    type: "object",
    properties: {
      [TYPE_MARKER]: {
        type: "string",
        enum: ["string"],
      },
      value: { type: "string" },
    },
    required: [TYPE_MARKER, "value"],
    additionalProperties: false,
  };

  const numberNode = {
    type: "object",
    properties: {
      [TYPE_MARKER]: {
        type: "string",
        enum: ["number"],
      },
      value: { type: "number" },
    },
    required: [TYPE_MARKER, "value"],
    additionalProperties: false,
  };

  const booleanNode = {
    type: "object",
    properties: {
      [TYPE_MARKER]: {
        type: "string",
        enum: ["boolean"],
      },
      value: { type: "boolean" },
    },
    required: [TYPE_MARKER, "value"],
    additionalProperties: false,
  };

  const entry = {
    type: "object",
    properties: {
      key: { type: "string" },
      value: { $ref: "#/$defs/json_node" },
    },
    required: ["key", "value"],
    additionalProperties: false,
  };

  const objectNode = {
    type: "object",
    properties: {
      [TYPE_MARKER]: {
        type: "string",
        enum: ["object"],
      },
      entries: {
        type: "array",
        items: entry,
      },
    },
    required: [TYPE_MARKER, "entries"],
    additionalProperties: false,
  };

  const arrayNode = {
    type: "object",
    properties: {
      [TYPE_MARKER]: {
        type: "string",
        enum: ["array"],
      },
      items: {
        type: "array",
        items: { $ref: "#/$defs/json_node" },
      },
    },
    required: [TYPE_MARKER, "items"],
    additionalProperties: false,
  };

  return {
    json_null_node: nullNode,
    json_string_node: stringNode,
    json_number_node: numberNode,
    json_boolean_node: booleanNode,
    json_object_node: objectNode,
    json_array_node: arrayNode,
    json_node: {
      anyOf: [
        { $ref: "#/$defs/json_null_node" },
        { $ref: "#/$defs/json_string_node" },
        { $ref: "#/$defs/json_number_node" },
        { $ref: "#/$defs/json_boolean_node" },
        { $ref: "#/$defs/json_object_node" },
        { $ref: "#/$defs/json_array_node" },
      ],
    },
  };
}

function placeholder(value) {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  return [
    "string",
    "number",
    "integer",
    "boolean",
    "object",
    "array",
    "null",
  ].includes(normalized)
    ? normalized
    : null;
}

function schemaFromShape(shape, path = "$") {
  const declared = placeholder(shape);

  if (declared === "string") return { type: "string" };
  if (declared === "number") return { type: "number" };
  if (declared === "integer") return { type: "integer" };
  if (declared === "boolean") return { type: "boolean" };
  if (declared === "object") {
    return { $ref: "#/$defs/json_object_node" };
  }
  if (declared === "array") {
    return { $ref: "#/$defs/json_array_node" };
  }
  if (declared === "null") return { type: "null" };

  if (shape === null || shape === undefined) {
    return {
      anyOf: [
        { type: "null" },
        { $ref: "#/$defs/json_node" },
      ],
    };
  }

  if (typeof shape === "string") return { type: "string" };
  if (typeof shape === "number") return { type: "number" };
  if (typeof shape === "boolean") return { type: "boolean" };

  if (Array.isArray(shape)) {
    return {
      type: "array",
      items: shape.length
        ? schemaFromShape(shape[0], `${path}[0]`)
        : { $ref: "#/$defs/json_node" },
    };
  }

  if (isPlainObject(shape)) {
    const keys = Object.keys(shape);

    if (!keys.length) {
      return { $ref: "#/$defs/json_object_node" };
    }

    return {
      type: "object",
      properties: Object.fromEntries(
        keys.map((key) => [
          key,
          schemaFromShape(shape[key], `${path}.${key}`),
        ]),
      ),
      required: keys,
      additionalProperties: false,
    };
  }

  throw schemaError(
    "CREATIVE_STRUCTURED_OUTPUT_SHAPE_UNSUPPORTED",
    {
      path,
      received_type: typeof shape,
    },
  );
}

function decodeNode(value) {
  if (Array.isArray(value)) {
    return value.map(decodeNode);
  }

  if (!isPlainObject(value)) return value;

  const type = value[TYPE_MARKER];

  if (type === "null") return null;
  if (["string", "number", "boolean"].includes(type)) {
    return value.value;
  }
  if (type === "array") {
    return list(value.items).map(decodeNode);
  }
  if (type === "object") {
    const output = {};
    const repeatedKeys = new Set();

    for (const entry of list(value.entries)) {
      if (!isPlainObject(entry) || typeof entry.key !== "string") {
        throw schemaError(
          "CREATIVE_STRUCTURED_OUTPUT_OBJECT_ENTRY_INVALID",
        );
      }

      const decoded = decodeNode(entry.value);

      if (
        Object.prototype.hasOwnProperty.call(
          output,
          entry.key,
        )
      ) {
        /*
         * Generic creative objects are encoded as entry arrays because
         * strict JSON Schema cannot safely express unrestricted object
         * properties. Models may therefore repeat a semantic key such as
         * "beat", "risk", or "note".
         *
         * Preserve every value deterministically instead of rejecting the
         * complete Director plan. Fixed-schema objects remain strict because
         * they do not use this generic entry representation.
         */
        if (repeatedKeys.has(entry.key)) {
          output[entry.key].push(decoded);
        } else {
          output[entry.key] = [
            output[entry.key],
            decoded,
          ];
          repeatedKeys.add(entry.key);
        }

        continue;
      }

      output[entry.key] = decoded;
    }

    return output;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      decodeNode(nested),
    ]),
  );
}

function inspectShape(value, shape, path, failures) {
  const declared = placeholder(shape);

  if (declared === "string" && typeof value !== "string") {
    failures.push(`${path}: string required`);
    return;
  }
  if (declared === "number" && !Number.isFinite(Number(value))) {
    failures.push(`${path}: finite number required`);
    return;
  }
  if (
    declared === "integer" &&
    (!Number.isInteger(value) || !Number.isFinite(value))
  ) {
    failures.push(`${path}: integer required`);
    return;
  }
  if (declared === "boolean" && typeof value !== "boolean") {
    failures.push(`${path}: boolean required`);
    return;
  }
  if (declared === "object" && !isPlainObject(value)) {
    failures.push(`${path}: object required`);
    return;
  }
  if (declared === "array" && !Array.isArray(value)) {
    failures.push(`${path}: array required`);
    return;
  }
  if (declared === "null" && value !== null) {
    failures.push(`${path}: null required`);
    return;
  }

  if (declared || shape === null || shape === undefined) return;

  if (typeof shape === "string") {
    if (typeof value !== "string") failures.push(`${path}: string required`);
    return;
  }
  if (typeof shape === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      failures.push(`${path}: number required`);
    }
    return;
  }
  if (typeof shape === "boolean") {
    if (typeof value !== "boolean") failures.push(`${path}: boolean required`);
    return;
  }

  if (Array.isArray(shape)) {
    if (!Array.isArray(value)) {
      failures.push(`${path}: array required`);
      return;
    }
    if (shape.length) {
      value.forEach((entry, index) =>
        inspectShape(entry, shape[0], `${path}[${index}]`, failures),
      );
    }
    return;
  }

  if (isPlainObject(shape)) {
    if (!isPlainObject(value)) {
      failures.push(`${path}: object required`);
      return;
    }

    const keys = Object.keys(shape);
    if (!keys.length) return;

    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        failures.push(`${path}.${key}: required property missing`);
        continue;
      }
      inspectShape(value[key], shape[key], `${path}.${key}`, failures);
    }

    const extras = Object.keys(value).filter((key) => !keys.includes(key));
    for (const key of extras) {
      failures.push(`${path}.${key}: additional property not allowed`);
    }
  }
}

export function compileCreativeStructuredOutputContract({
  outputShape = {},
  name = "creative_reasoning",
  description = "Strict Avantiqo Creative reasoning output",
} = {}) {
  const schema = schemaFromShape(outputShape);
  schema.$defs = jsonNodeDefinitions();

  return {
    version: "CREATIVE_STRUCTURED_OUTPUT_CONTRACT_V1",
    name: sanitizeName(name),
    description: String(description || "").slice(0, 500),
    strict: true,
    output_shape: outputShape,
    response_format: {
      type: "json_schema",
      name: sanitizeName(name),
      description: String(description || "").slice(0, 500),
      strict: true,
      schema,
    },
  };
}

export function decodeCreativeStructuredOutput(value) {
  return decodeNode(value);
}

export function inspectCreativeStructuredOutput({
  value,
  outputShape = {},
} = {}) {
  const failures = [];
  inspectShape(value, outputShape, "$", failures);

  return {
    passed: failures.length === 0,
    failure_count: failures.length,
    failures,
  };
}

export function assertCreativeStructuredOutput({
  value,
  outputShape = {},
} = {}) {
  const report = inspectCreativeStructuredOutput({
    value,
    outputShape,
  });

  if (!report.passed) {
    throw schemaError(
      "CREATIVE_STRUCTURED_OUTPUT_SCHEMA_MISMATCH",
      report,
    );
  }

  return report;
}

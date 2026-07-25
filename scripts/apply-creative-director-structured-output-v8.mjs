#!/usr/bin/env node

import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function replaceRequired(source, search, replacement, path, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) {
    throw new Error(`CREATIVE_DIRECTOR_V8_PATTERN_MISSING:${path}:${label}`);
  }
  return source.replace(search, replacement);
}

function replaceRegexRequired(source, pattern, replacement, marker, path) {
  if (source.includes(marker)) return source;
  if (!pattern.test(source)) {
    throw new Error(`CREATIVE_DIRECTOR_V8_PATTERN_MISSING:${path}:${marker}`);
  }
  return source.replace(pattern, replacement);
}

function patchOpenAIProvider() {
  const path = "lib/platform/service-runtime/providers/openai/OpenAIProvider.js";
  let source = read(path);
  const marker = "CREATIVE_OPENAI_STRUCTURED_RECOVERY_V8";

  const replacement = `// ${marker}
function responseOutputText(response = {}) {
  const direct = String(response.output_text || "").trim();
  if (direct) return direct;

  return list(response.output)
    .flatMap((item) => list(item?.content))
    .map((content) =>
      content?.text ||
      content?.output_text ||
      content?.value ||
      ""
    )
    .filter(Boolean)
    .join("\n")
    .trim();
}

function responseRefusal(response = {}) {
  return list(response.output)
    .flatMap((item) => list(item?.content))
    .map((content) => content?.refusal || "")
    .find(Boolean) || null;
}

function structuredAttemptSummary(response = {}, outputText = "") {
  return {
    status: response.status || null,
    incomplete_details: response.incomplete_details || null,
    output_length: outputText.length,
    refusal: responseRefusal(response),
  };
}

function structuredRepairInput({ prompt, messages }) {
  const instruction =
    "The previous attempt did not return a complete valid JSON object. Return the full answer again, compactly, matching the required JSON schema exactly. Include every required field. Use concise strings and bounded arrays. Do not add markdown, commentary, code fences, or text outside the JSON object.";

  if (Array.isArray(messages) && messages.length) {
    return [
      { role: "system", content: instruction },
      ...messages,
    ];
  }

  return [
    { role: "system", content: instruction },
    { role: "user", content: String(prompt || "") },
  ];
}

async function generateText({
  client,
  model,
  prompt,
  messages,
  responseFormat = null,
  maxOutputTokens = null,
}) {
  const format = requestedResponseFormat({
    responseFormat,
    prompt,
    messages,
  });
  const outputTokens = Number(maxOutputTokens || 0) > 0
    ? Math.round(Number(maxOutputTokens))
    : format
      ? DEFAULT_STRUCTURED_OUTPUT_TOKENS
      : null;
  const request = {
    model,
    input: messages || prompt || "",
    store: false,
  };

  if (format) request.text = { format };
  if (outputTokens) request.max_output_tokens = outputTokens;

  const attempts = [];
  let response = await client.responses.create(request);
  let outputText = responseOutputText(response);
  let json = format ? parseJson(outputText) : null;
  attempts.push(structuredAttemptSummary(response, outputText));

  if (format && !json && !responseRefusal(response)) {
    const repairRequest = {
      model,
      input: structuredRepairInput({ prompt, messages }),
      text: { format },
      max_output_tokens: Math.max(
        outputTokens || DEFAULT_STRUCTURED_OUTPUT_TOKENS,
        DEFAULT_STRUCTURED_OUTPUT_TOKENS,
      ),
      store: false,
    };

    response = await client.responses.create(repairRequest);
    outputText = responseOutputText(response);
    json = parseJson(outputText);
    attempts.push(structuredAttemptSummary(response, outputText));
  }

  if (format && !json) {
    const error = new Error("OPENAI_STRUCTURED_JSON_INVALID");
    error.provider_response = {
      attempts,
      response_format: format.type || null,
      response_format_name: format.name || null,
      response_format_strict: format.strict === true,
    };
    throw error;
  }

  return {
    success: true,
    provider: "openai",
    model,
    output: {
      text: outputText,
      json,
      response_format: format?.type || "text",
      response_format_name: format?.name || null,
      response_format_strict: format?.strict === true,
      response_status: response.status || null,
      incomplete_details: response.incomplete_details || null,
      structured_attempt_count: attempts.length,
    },
  };
}

// CREATIVE_VISUAL_EVIDENCE_COMPARISON_QA_V5`;

  source = replaceRegexRequired(
    source,
    /async function generateText\(\{[\s\S]*?\n\}\n\n\/\/ CREATIVE_VISUAL_EVIDENCE_COMPARISON_QA_V5/,
    replacement,
    marker,
    path,
  );

  write(path, source);
}

function patchMissionComposer() {
  const path = "lib/creative/intent/CreativeMissionComposerRuntime.js";
  let source = read(path);
  const schemaMarker = "CREATIVE_MISSION_DIRECTOR_SCHEMA_V8";
  const contextMarker = "CREATIVE_MISSION_DIRECTOR_CONTEXT_BUDGET_V8";

  if (!source.includes(schemaMarker)) {
    source = replaceRequired(
      source,
      `const DEFAULT_QUALITY_POLICY = {\n  ambition: "world_class",\n  review_mode: "evidence_based",\n  regenerate_when_below_standard: true,\n  full_output_review_required: true,\n  identity_drift_allowed: false,\n  release_only_after_quality_pass: true,\n};`,
      `const DEFAULT_QUALITY_POLICY = {\n  ambition: "world_class",\n  review_mode: "evidence_based",\n  regenerate_when_below_standard: true,\n  full_output_review_required: true,\n  identity_drift_allowed: false,\n  release_only_after_quality_pass: true,\n};\n\n// ${schemaMarker}\nconst CREATIVE_MISSION_DIRECTOR_RESPONSE_FORMAT = {\n  type: "json_schema",\n  name: "creative_mission_blueprint",\n  description: "A compact universal creative mission blueprint.",\n  strict: true,\n  schema: {\n    type: "object",\n    additionalProperties: false,\n    required: [\n      "title",\n      "business_goal",\n      "objective",\n      "creative_thesis",\n      "audience",\n      "channels",\n      "languages",\n      "production_mode",\n      "deliverables",\n      "workflow",\n      "departments",\n      "production_principles",\n      "quality_policy",\n      "assumptions",\n      "blocking_questions",\n      "decision_gates",\n      "optional_real_world_extensions",\n      "confidence",\n    ],\n    properties: {\n      title: { type: "string" },\n      business_goal: { type: "string" },\n      objective: { type: "string" },\n      creative_thesis: { type: "string" },\n      audience: {\n        type: "object",\n        additionalProperties: false,\n        required: ["primary_segments", "motivations", "barriers", "insight"],\n        properties: {\n          primary_segments: { type: "array", items: { type: "string" } },\n          motivations: { type: "array", items: { type: "string" } },\n          barriers: { type: "array", items: { type: "string" } },\n          insight: { type: "string" },\n        },\n      },\n      channels: { type: "array", items: { type: "string" } },\n      languages: { type: "array", items: { type: "string" } },\n      production_mode: {\n        type: "string",\n        enum: ["AI_NATIVE", "HYBRID", "REAL_WORLD"],\n      },\n      deliverables: {\n        type: "array",\n        items: {\n          type: "object",\n          additionalProperties: false,\n          required: [\n            "id",\n            "title",\n            "description",\n            "medium",\n            "formats",\n            "channels",\n            "capabilities",\n            "execution_capabilities",\n            "dependencies",\n            "success_criteria",\n            "specifications",\n            "metadata",\n          ],\n          properties: {\n            id: { type: "string" },\n            title: { type: "string" },\n            description: { type: "string" },\n            medium: {\n              type: "string",\n              enum: [\n                "FILM",\n                "IMAGE",\n                "AUDIO",\n                "MULTIMEDIA",\n                "WEBSITE",\n                "MENU",\n                "DOCUMENT",\n                "PRESENTATION",\n              ],\n            },\n            formats: { type: "array", items: { type: "string" } },\n            channels: { type: "array", items: { type: "string" } },\n            capabilities: { type: "array", items: { type: "string" } },\n            execution_capabilities: { type: "array", items: { type: "string" } },\n            dependencies: { type: "array", items: { type: "string" } },\n            success_criteria: { type: "array", items: { type: "string" } },\n            specifications: {\n              type: "object",\n              additionalProperties: false,\n              required: ["duration_seconds", "aspect_ratios", "notes"],\n              properties: {\n                duration_seconds: { type: "integer", minimum: 0 },\n                aspect_ratios: { type: "array", items: { type: "string" } },\n                notes: { type: "array", items: { type: "string" } },\n              },\n            },\n            metadata: {\n              type: "object",\n              additionalProperties: false,\n              required: ["production_role", "purpose"],\n              properties: {\n                production_role: {\n                  type: "string",\n                  enum: ["MASTER", "CUTDOWN", "INDEPENDENT"],\n                },\n                purpose: { type: "string" },\n              },\n            },\n          },\n        },\n      },\n      workflow: {\n        type: "array",\n        items: {\n          type: "object",\n          additionalProperties: false,\n          required: [\n            "id",\n            "workspace_id",\n            "title",\n            "stage",\n            "description",\n            "capabilities",\n            "required",\n          ],\n          properties: {\n            id: { type: "string" },\n            workspace_id: {\n              type: "string",\n              enum: [\n                "mission",\n                "brief",\n                "research",\n                "strategy",\n                "concept",\n                "assets",\n                "storyboard",\n                "production",\n                "timeline",\n                "documents",\n                "render",\n                "publishing",\n                "learning",\n              ],\n            },\n            title: { type: "string" },\n            stage: { type: "string" },\n            description: { type: "string" },\n            capabilities: { type: "array", items: { type: "string" } },\n            required: { type: "boolean" },\n          },\n        },\n      },\n      departments: { type: "array", items: { type: "string" } },\n      production_principles: { type: "array", items: { type: "string" } },\n      quality_policy: {\n        type: "object",\n        additionalProperties: false,\n        required: [\n          "ambition",\n          "review_mode",\n          "regenerate_when_below_standard",\n          "full_output_review_required",\n          "identity_drift_allowed",\n          "release_only_after_quality_pass",\n          "principles",\n        ],\n        properties: {\n          ambition: { type: "string" },\n          review_mode: { type: "string" },\n          regenerate_when_below_standard: { type: "boolean" },\n          full_output_review_required: { type: "boolean" },\n          identity_drift_allowed: { type: "boolean" },\n          release_only_after_quality_pass: { type: "boolean" },\n          principles: { type: "array", items: { type: "string" } },\n        },\n      },\n      assumptions: { type: "array", items: { type: "string" } },\n      blocking_questions: { type: "array", items: { type: "string" } },\n      decision_gates: {\n        type: "array",\n        items: {\n          type: "object",\n          additionalProperties: false,\n          required: ["id", "title", "description"],\n          properties: {\n            id: { type: "string" },\n            title: { type: "string" },\n            description: { type: "string" },\n          },\n        },\n      },\n      optional_real_world_extensions: {\n        type: "array",\n        items: {\n          type: "object",\n          additionalProperties: false,\n          required: ["id", "title", "description", "optional"],\n          properties: {\n            id: { type: "string" },\n            title: { type: "string" },\n            description: { type: "string" },\n            optional: { type: "boolean" },\n          },\n        },\n      },\n      confidence: { type: "integer", minimum: 0, maximum: 100 },\n    },\n  },\n};`,
      path,
      "insert-director-schema",
    );
  }

  if (!source.includes(contextMarker)) {
    source = replaceRequired(
      source,
      `function cleanJsonText(value) {`,
      `// ${contextMarker}\nfunction compactMissionAsset(asset = {}) {\n  return {\n    id: asset.id || asset.asset_id || null,\n    name: compactText(\n      asset.name || asset.title || asset.file_name || asset.filename,\n      120,\n    ),\n    type: compactText(asset.type || asset.asset_type, 60),\n    description: compactText(asset.description || asset.caption, 260),\n    tags: stringArray(asset.tags).slice(0, 12),\n    reference_roles: stringArray(\n      asset.reference_roles || asset.evidence_roles,\n    ).slice(0, 8),\n    analysis: {\n      subject: compactText(asset.analysis?.subject, 160),\n      summary: compactText(asset.analysis?.summary, 260),\n      classification: compactText(asset.analysis?.classification, 120),\n      objects: stringArray(asset.analysis?.objects).slice(0, 12),\n      text: compactText(asset.analysis?.text, 180),\n    },\n  };\n}\n\nfunction compactMissionDirectorContext(context = {}) {\n  const knowledge = context.system_knowledge || {};\n  const truth = context.business_truth || {};\n  const organization = truth.organization || {};\n  const uploaded = list(truth.assets?.uploaded_references);\n  const reusable = list(truth.assets?.approved_reusable);\n  const assets = [...uploaded, ...reusable]\n    .filter(Boolean)\n    .slice(0, 24)\n    .map(compactMissionAsset);\n\n  return {\n    requested_medium: context.requested_medium || null,\n    smoke_test: context.smoke_test === true,\n    constraints: stringArray(context.constraints).slice(0, 12),\n    system_knowledge: {\n      source_policy: knowledge.source_policy || null,\n      sources: list(knowledge.sources).slice(0, 20).map((source) => ({\n        id: source.id || null,\n        title: compactText(source.title || source.name, 120),\n        type: compactText(source.type, 60),\n      })),\n    },\n    business_truth: {\n      snapshot_id: truth.snapshot_id || null,\n      schema_version: truth.schema_version || null,\n      record_counts: truth.record_counts || {},\n      organization: {\n        id: organization.id || null,\n        name: compactText(\n          organization.name ||\n          organization.trading_name ||\n          organization.legal_name,\n          160,\n        ),\n        description: compactText(organization.description, 500),\n        industry: compactText(organization.industry, 120),\n        city: compactText(organization.city, 120),\n        country: compactText(organization.country, 120),\n      },\n      locations: list(truth.locations).slice(0, 12).map((location) => ({\n        id: location.id || null,\n        name: compactText(location.name, 160),\n        type: compactText(location.type, 100),\n        description: compactText(location.description, 360),\n        city: compactText(location.city, 120),\n        country: compactText(location.country, 120),\n      })),\n      locations_grounding: truth.locations_grounding || {},\n      assets,\n    },\n  };\n}\n\nfunction cleanJsonText(value) {`,
      path,
      "insert-director-context-budget",
    );
  }

  source = replaceRequired(
    source,
    `Return strict JSON only with:\ntitle, business_goal, objective, creative_thesis, audience, channels, languages, production_mode, deliverables, workflow, departments, production_principles, quality_policy, assumptions, blocking_questions, decision_gates, optional_real_world_extensions, confidence.`,
    `Return strict JSON only with:\ntitle, business_goal, objective, creative_thesis, audience, channels, languages, production_mode, deliverables, workflow, departments, production_principles, quality_policy, assumptions, blocking_questions, decision_gates, optional_real_world_extensions, confidence.\n\nKeep the response compact and production-useful. Use no more than 8 deliverables and 12 entries in any descriptive list. Do not echo the supplied context. Use empty strings or empty arrays when a schema field is not applicable. audience must contain primary_segments, motivations, barriers, and insight. Every deliverable specifications object must contain duration_seconds, aspect_ratios, and notes. Every deliverable metadata object must contain production_role and purpose. Every workflow item must contain all schema fields; use an empty string for stage or description when needed.`,
    path,
    "compact-schema-prompt",
  );

  source = replaceRequired(
    source,
    `AVAILABLE CONTEXT:\n\${JSON.stringify(context || {})}`,
    `AVAILABLE CONTEXT:\n\${JSON.stringify(compactMissionDirectorContext(context || {}))}`,
    path,
    "bounded-director-context",
  );

  source = replaceRequired(
    source,
    `        prompt: \``,
    `        response_format: CREATIVE_MISSION_DIRECTOR_RESPONSE_FORMAT,\n        max_output_tokens: 12000,\n        prompt: \``,
    path,
    "director-response-format",
  );

  source = replaceRequired(
    source,
    `function fallbackBlueprint({ request, reason = null }) {`,
    `function fallbackBlueprint({ request, reason = null, details = null }) {`,
    path,
    "fallback-details-parameter",
  );

  source = replaceRequired(
    source,
    `    fallback_reason: reason,\n  };`,
    `    fallback_reason: reason,\n    fallback_details: details,\n  };`,
    path,
    "fallback-details-value",
  );

  source = replaceRequired(
    source,
    `      reason: error?.message || "AI_DIRECTOR_EXECUTION_FAILED",\n    });`,
    `      reason: error?.message || "AI_DIRECTOR_EXECUTION_FAILED",\n      details: error?.provider_response || error?.details || null,\n    });`,
    path,
    "fallback-provider-details",
  );

  write(path, source);
}

function patchMissionRoute() {
  const path = "app/api/creative/missions/compose/route.js";
  let source = read(path);
  const marker = "CREATIVE_DIRECTOR_DIAGNOSTICS_V8";

  if (!source.includes(marker)) {
    source = replaceRequired(
      source,
      `    error.code = "CREATIVE_AI_DIRECTOR_INVALID_OUTPUT";\n    throw error;`,
      `    error.code = "CREATIVE_AI_DIRECTOR_INVALID_OUTPUT";\n    // ${marker}\n    error.details = blueprint.fallback_details || null;\n    throw error;`,
      path,
      "director-fallback-details",
    );
  }

  source = replaceRequired(
    source,
    `        details: error?.details || null,`,
    `        details: error?.details || error?.provider_response || null,`,
    path,
    "route-provider-diagnostics",
  );

  write(path, source);
}

patchOpenAIProvider();
patchMissionComposer();
patchMissionRoute();

console.log("CREATIVE_DIRECTOR_STRUCTURED_OUTPUT_V8=APPLIED");

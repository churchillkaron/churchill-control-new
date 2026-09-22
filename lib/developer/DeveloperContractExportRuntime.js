import { DEVELOPER_API_VERSION } from "@/lib/developer/DeveloperApiContract";
import { developerCapabilityCatalog } from "@/lib/developer/DeveloperCapabilityContractRuntime";

function operationPath(id) {
  return `/api/developer/v1/operations/${id}`;
}

function commonResponses() {
  return {
    "401": { description: "Invalid, expired or revoked credential" },
    "403": { description: "Insufficient organization or capability authority" },
    "429": {
      description: "Environment rate limit or monthly request quota exceeded",
      headers: {
        "Retry-After": { schema: { type: "integer", minimum: 1 }, description: "Seconds until this caller should retry." },
        "X-RateLimit-Reset": { schema: { type: "integer" }, description: "Unix timestamp for the next minute-rate window." },
        "X-Avantiqo-Monthly-Reset": { schema: { type: "integer" }, description: "Unix timestamp for the next monthly quota window." },
      },
    },
    "503": { description: "Developer control-plane service temporarily unavailable" },
  };
}

export function buildDeveloperOpenApi({ origin = "https://api.avantiqo.ai" } = {}) {
  const catalog = developerCapabilityCatalog();
  const paths = {};

  for (const capability of catalog) {
    const path = operationPath(capability.id);
    paths[path] = {
      get: {
        summary: `List or read ${capability.name}`,
        operationId: `get_${capability.id.replace(/-/g, "_")}`,
        tags: [capability.group],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "query", required: false, schema: { type: "string" } },
          { name: "entity_id", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          { name: "period_id", in: "query", required: false, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "Capability response" },
          ...commonResponses(),
        },
      },
      ...(capability.readOnly ? {} : {
        post: {
          summary: `Execute a ${capability.name} command`,
          operationId: `post_${capability.id.replace(/-/g, "_")}`,
          tags: [capability.group],
          security: [{ bearerAuth: [] }],
          parameters: [{
            name: "Idempotency-Key",
            in: "header",
            required: true,
            description: "Stable 8–200 character identity for this exact mutation. Reuse the same key only when retrying the same request.",
            schema: { type: "string", minLength: 8, maxLength: 200 },
          }],
          requestBody: {
            required: true,
            description: "JSON object only. Maximum encoded request body: 256 KiB.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { command: { type: "string", enum: capability.commands } },
                  required: ["command"],
                  additionalProperties: true,
                },
              },
            },
          },
          responses: {
            "200": { description: "Command response or exact idempotent replay" },
            "400": { description: "Invalid JSON object, command payload or idempotency key" },
            "409": { description: "Idempotency conflict or same request still in progress" },
            "413": { description: "Request body exceeds the 256 KiB mutation limit" },
            "415": { description: "Mutation request Content-Type must be application/json" },
            ...commonResponses(),
          },
        },
      }),
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Avantiqo Developer API",
      version: DEVELOPER_API_VERSION,
      description: "Organization-scoped governed capability API generated from the canonical Avantiqo Operations registry.",
    },
    servers: [{ url: origin }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "Avantiqo developer token" },
      },
    },
    paths,
  };
}

export function generateTypeScriptSdk() {
  const catalog = developerCapabilityCatalog();
  const ids = catalog.map((c) => JSON.stringify(c.id)).join(" | ");
  const writableIds = catalog.filter((c) => !c.readOnly).map((c) => JSON.stringify(c.id)).join(" | ");
  const commandMap = catalog.map((capability) => {
    const commands = capability.readOnly
      ? "never"
      : capability.commands.map((command) => JSON.stringify(command)).join(" | ") || "never";
    return `  ${JSON.stringify(capability.id)}: ${commands};`;
  }).join("\n");
  return `// Avantiqo Developer API ${DEVELOPER_API_VERSION}
// Generated from the live Avantiqo capability registry. Do not hand-edit.
export type AvantiqoCapabilityId = ${ids};
export type AvantiqoWritableCapabilityId = ${writableIds};

export type AvantiqoCommandMap = {
${commandMap}
};

export type AvantiqoCommand<C extends AvantiqoCapabilityId> = AvantiqoCommandMap[C];

export type AvantiqoResponseMeta = {
  requestId: string | null;
  apiVersion: string | null;
  environment: string | null;
  rateLimit: number | null;
  rateRemaining: number | null;
  rateReset: number | null;
  retryAfter: number | null;
  monthlyUsage: number | null;
  monthlyLimit: number | null;
  monthlyRemaining: number | null;
  monthlyReset: number | null;
  idempotentReplay: boolean;
};

function constantTimeHexEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function verifyWebhookSignature({
  secret,
  signature,
  rawBody,
  toleranceSeconds = 300,
}: {
  secret: string;
  signature: string;
  rawBody: string;
  toleranceSeconds?: number;
}) {
  const match = String(signature || "").match(/^t=(\d+),v1=([0-9a-f]{64})$/i);
  if (!match) return false;
  const timestamp = Number(match[1]);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > toleranceSeconds) return false;

  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(timestamp + "." + rawBody),
  );
  const expected = Array.from(new Uint8Array(mac))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return constantTimeHexEqual(expected, match[2].toLowerCase());
}

export class AvantiqoApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public requestId: string | null,
    public body: unknown,
  ) {
    super(message);
    this.name = "AvantiqoApiError";
  }
}

function numberHeader(value: string | null) {
  return value === null ? null : Number(value);
}

export function createIdempotencyKey(prefix = "avq") {
  return prefix + "-" + crypto.randomUUID();
}

export class Avantiqo {
  lastResponseMeta: AvantiqoResponseMeta | null = null;

  constructor(private token: string, private baseUrl = "https://api.avantiqo.ai") {}

  private async request(path: string, init: RequestInit = {}) {
    const response = await fetch(this.baseUrl + path, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + this.token,
        ...(init.headers || {}),
      },
    });
    this.lastResponseMeta = {
      requestId: response.headers.get("x-request-id"),
      apiVersion: response.headers.get("x-avantiqo-api-version"),
      environment: response.headers.get("x-avantiqo-environment"),
      rateLimit: numberHeader(response.headers.get("x-ratelimit-limit")),
      rateRemaining: numberHeader(response.headers.get("x-ratelimit-remaining")),
      rateReset: numberHeader(response.headers.get("x-ratelimit-reset")),
      retryAfter: numberHeader(response.headers.get("retry-after")),
      monthlyUsage: numberHeader(response.headers.get("x-avantiqo-monthly-usage")),
      monthlyLimit: numberHeader(response.headers.get("x-avantiqo-monthly-limit")),
      monthlyRemaining: numberHeader(response.headers.get("x-avantiqo-monthly-remaining")),
      monthlyReset: numberHeader(response.headers.get("x-avantiqo-monthly-reset")),
      idempotentReplay: response.headers.get("x-avantiqo-idempotent-replay") === "true",
    };
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new AvantiqoApiError(
        body.error || "Avantiqo API request failed",
        response.status,
        this.lastResponseMeta.requestId,
        body,
      );
    }
    return body;
  }

  list(capability: AvantiqoCapabilityId, query: Record<string,string> = {}) {
    const qs = new URLSearchParams(query).toString();
    return this.request("/api/developer/v1/operations/" + capability + (qs ? "?" + qs : ""));
  }

  execute<C extends AvantiqoWritableCapabilityId>(
    capability: C,
    command: AvantiqoCommand<C>,
    idempotencyKey: string,
    payload: Record<string,unknown> = {},
  ) {
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      throw new Error("idempotencyKey must be between 8 and 200 characters");
    }
    return this.request("/api/developer/v1/operations/" + capability, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ ...payload, command }),
    });
  }
}
`;
}

export function generatePythonSdk() {
  const catalog = developerCapabilityCatalog();
  const ids = catalog.map((c) => JSON.stringify(c.id)).join(", ");
  const commandRegistry = JSON.stringify(Object.fromEntries(
    catalog.map((capability) => [
      capability.id,
      capability.readOnly ? [] : capability.commands,
    ]),
  ), null, 4);
  return `# Avantiqo Developer API ${DEVELOPER_API_VERSION}
# Generated from the live Avantiqo capability registry. Do not hand-edit.
from typing import Literal, Optional
from uuid import uuid4
import hashlib
import hmac
import json
import time
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

CapabilityId = Literal[${ids}]

CAPABILITY_COMMANDS = ${commandRegistry}

def verify_webhook_signature(secret: str, signature: str, raw_body: str, tolerance_seconds: int = 300) -> bool:
    try:
        parts = dict(item.split("=", 1) for item in signature.split(","))
        timestamp = int(parts["t"])
        supplied = parts["v1"].lower()
    except (KeyError, ValueError):
        return False
    if abs(int(time.time()) - timestamp) > tolerance_seconds:
        return False
    signed = (str(timestamp) + "." + raw_body).encode("utf-8")
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, supplied)

class AvantiqoApiError(Exception):
    def __init__(self, message, status, request_id, body):
        super().__init__(message)
        self.status = status
        self.request_id = request_id
        self.body = body

def create_idempotency_key(prefix: str = "avq") -> str:
    return prefix + "-" + str(uuid4())

class Avantiqo:
    def __init__(self, token: str, base_url: str = "https://api.avantiqo.ai"):
        self.token = token
        self.base_url = base_url.rstrip("/")
        self.last_response_meta = None

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[dict] = None,
        json_body: Optional[dict] = None,
        headers: Optional[dict] = None,
    ):
        request_headers = dict(headers or {})
        request_headers["Authorization"] = "Bearer " + self.token

        url = self.base_url + path
        if params:
            query = urlencode({key: value for key, value in params.items() if value is not None})
            if query:
                url += ("&" if "?" in url else "?") + query

        data = None
        if json_body is not None:
            data = json.dumps(json_body, separators=(",", ":")).encode("utf-8")
            request_headers.setdefault("Content-Type", "application/json")

        request = Request(url, data=data, headers=request_headers, method=method.upper())
        response = None
        http_error = None
        try:
            response = urlopen(request, timeout=30)
        except HTTPError as error:
            response = error
            http_error = error

        status = int(getattr(response, "status", getattr(response, "code", 0)) or 0)
        response_headers = response.headers
        self.last_response_meta = {
            "request_id": response_headers.get("x-request-id"),
            "api_version": response_headers.get("x-avantiqo-api-version"),
            "environment": response_headers.get("x-avantiqo-environment"),
            "rate_limit": response_headers.get("x-ratelimit-limit"),
            "rate_remaining": response_headers.get("x-ratelimit-remaining"),
            "rate_reset": response_headers.get("x-ratelimit-reset"),
            "retry_after": response_headers.get("retry-after"),
            "monthly_usage": response_headers.get("x-avantiqo-monthly-usage"),
            "monthly_limit": response_headers.get("x-avantiqo-monthly-limit"),
            "monthly_remaining": response_headers.get("x-avantiqo-monthly-remaining"),
            "monthly_reset": response_headers.get("x-avantiqo-monthly-reset"),
            "idempotent_replay": response_headers.get("x-avantiqo-idempotent-replay") == "true",
        }

        raw = response.read()
        try:
            body = json.loads(raw.decode("utf-8")) if raw else {}
        except (UnicodeDecodeError, json.JSONDecodeError):
            body = {}

        if http_error is not None or status >= 400:
            raise AvantiqoApiError(
                body.get("error", "Avantiqo API request failed"),
                status,
                self.last_response_meta["request_id"],
                body,
            )
        return body

    def list(self, capability: CapabilityId, params: Optional[dict] = None):
        return self._request("GET", "/api/developer/v1/operations/" + capability, params=params or {})

    def execute(self, capability: CapabilityId, command: str, idempotency_key: str, payload: Optional[dict] = None):
        allowed_commands = CAPABILITY_COMMANDS.get(capability, [])
        if command not in allowed_commands:
            if not allowed_commands:
                raise ValueError(f"{capability} is read-only and cannot execute commands")
            raise ValueError(
                f"Unsupported command {command!r} for {capability}. "
                f"Allowed: {', '.join(allowed_commands)}"
            )
        if len(idempotency_key) < 8 or len(idempotency_key) > 200:
            raise ValueError("idempotency_key must be between 8 and 200 characters")
        body = dict(payload or {})
        body["command"] = command
        return self._request(
            "POST",
            "/api/developer/v1/operations/" + capability,
            json_body=body,
            headers={"Content-Type": "application/json", "Idempotency-Key": idempotency_key},
        )
`;
}

"""External frontier-model adapter for the sealed Avantiqo Private12 benchmark.

This adapter intentionally exposes the same logical ``remote`` shape used by the
Avantiqo Code certification runtime, but executes ordinary HTTPS API requests.
It does not see hidden tests and receives only the exact actor/reviewer prompts
that the Avantiqo V17 agent saw.

Fairness rules:
* exact V17 actor and compact-reviewer JSON schemas;
* exact caller max-token budget;
* no retries or hidden second attempts;
* no provider tools other than schema-forcing output submission;
* no web, shell, code interpreter, repository, or hidden-test access;
* lowest supported reasoning effort for each provider;
* provider usage and real request wall time are reported from the API response.
"""

from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any

from modal_code_qwen38_canary_runtime_v9 import ACTOR_SCHEMA, COMPACT_REVIEWER_SCHEMA

CONTRACT = "AVANTIQO_CODE_FRONTIER_PROVIDER_RUNTIME_V1"
MAX_PARALLEL_REQUESTS = 4
HTTP_TIMEOUT_SECONDS = 180


class ProviderRuntimeError(RuntimeError):
    pass


def _post_json(url: str, *, headers: dict[str, str], body: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(body, separators=(",", ":")).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1500]
        raise ProviderRuntimeError(f"HTTP_{exc.code}:{detail}") from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise ProviderRuntimeError(f"HTTP_TRANSPORT:{type(exc).__name__}:{exc}") from exc
    if not isinstance(payload, dict):
        raise ProviderRuntimeError("PROVIDER_RESPONSE_OBJECT_REQUIRED")
    return payload


def _schema(role: str) -> dict[str, Any]:
    return ACTOR_SCHEMA if role == "actor" else COMPACT_REVIEWER_SCHEMA


def _extract_openai_text(payload: dict[str, Any]) -> str:
    for item in payload.get("output") or []:
        if not isinstance(item, dict) or item.get("type") != "message":
            continue
        for block in item.get("content") or []:
            if isinstance(block, dict) and block.get("type") == "output_text":
                text = str(block.get("text") or "").strip()
                if text:
                    return text
    raise ProviderRuntimeError("OPENAI_OUTPUT_TEXT_REQUIRED")


def _openai_one(*, prompt: str, role: str, max_tokens: int, model: str) -> tuple[str, int, int, int]:
    key = str(os.environ.get("OPENAI_API_KEY") or "").strip()
    if not key:
        raise ProviderRuntimeError("OPENAI_API_KEY_REQUIRED")
    started = time.perf_counter()
    payload = _post_json(
        "https://api.openai.com/v1/responses",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        body={
            "model": model,
            "input": prompt,
            "max_output_tokens": max_tokens,
            "reasoning": {"effort": "none"},
            "store": False,
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "avantiqo_actor" if role == "actor" else "avantiqo_reviewer",
                    "strict": True,
                    "schema": _schema(role),
                }
            },
        },
    )
    elapsed_ms = round((time.perf_counter() - started) * 1000)
    usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
    return (
        _extract_openai_text(payload),
        int(usage.get("input_tokens") or 0),
        int(usage.get("output_tokens") or 0),
        elapsed_ms,
    )


def _anthropic_one(*, prompt: str, role: str, max_tokens: int, model: str) -> tuple[str, int, int, int]:
    key = str(os.environ.get("ANTHROPIC_API_KEY") or "").strip()
    if not key:
        raise ProviderRuntimeError("ANTHROPIC_API_KEY_REQUIRED")
    tool_name = "submit_actor" if role == "actor" else "submit_reviewer"
    started = time.perf_counter()
    payload = _post_json(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        body={
            "model": model,
            "max_tokens": max_tokens,
            "temperature": 0,
            "output_config": {"effort": "low"},
            "messages": [{"role": "user", "content": prompt}],
            "tools": [
                {
                    "name": tool_name,
                    "description": "Return the requested benchmark JSON object exactly through this tool.",
                    "input_schema": _schema(role),
                    "strict": True,
                }
            ],
            "tool_choice": {"type": "tool", "name": tool_name, "disable_parallel_tool_use": True},
        },
    )
    elapsed_ms = round((time.perf_counter() - started) * 1000)
    structured: dict[str, Any] | None = None
    for block in payload.get("content") or []:
        if isinstance(block, dict) and block.get("type") == "tool_use" and block.get("name") == tool_name:
            candidate = block.get("input")
            if isinstance(candidate, dict):
                structured = candidate
                break
    if structured is None:
        raise ProviderRuntimeError(f"ANTHROPIC_TOOL_OUTPUT_REQUIRED:{payload.get('stop_reason')}")
    usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
    return (
        json.dumps(structured, sort_keys=True, separators=(",", ":")),
        int(usage.get("input_tokens") or 0) + int(usage.get("cache_read_input_tokens") or 0),
        int(usage.get("output_tokens") or 0),
        elapsed_ms,
    )


@dataclass
class FrontierProviderRuntime:
    provider: str
    model: str

    def __post_init__(self) -> None:
        if self.provider not in {"openai", "anthropic"}:
            raise ValueError("PROVIDER_INVALID")
        self._lock = threading.Lock()
        self.http_calls = 0
        self.total_input_tokens = 0
        self.total_output_tokens = 0
        self.request_wall_ms: list[int] = []

    def _one(self, request: dict[str, Any]) -> tuple[str, int, int, int]:
        role = str(request.get("role") or "").strip().lower()
        if role not in {"actor", "reviewer"}:
            raise ProviderRuntimeError(f"ROLE_INVALID:{role}")
        prompt = str(request.get("instruction") or "").strip()
        max_tokens = int(request.get("max_tokens") or 0)
        if not prompt or max_tokens <= 0:
            raise ProviderRuntimeError("REQUEST_INVALID")
        if self.provider == "openai":
            result = _openai_one(prompt=prompt, role=role, max_tokens=max_tokens, model=self.model)
        else:
            result = _anthropic_one(prompt=prompt, role=role, max_tokens=max_tokens, model=self.model)
        with self._lock:
            self.http_calls += 1
            self.total_input_tokens += result[1]
            self.total_output_tokens += result[2]
            self.request_wall_ms.append(result[3])
        return result

    def remote(self, requests: list[dict[str, Any]], approved: bool = False) -> dict[str, Any]:
        if approved is not True:
            raise ProviderRuntimeError("EXPLICIT_APPROVAL_REQUIRED")
        if not isinstance(requests, list) or not requests or len(requests) > 16:
            raise ProviderRuntimeError("REQUEST_BATCH_INVALID")
        started = time.perf_counter()
        with ThreadPoolExecutor(max_workers=min(MAX_PARALLEL_REQUESTS, len(requests))) as pool:
            results = list(pool.map(self._one, requests))
        wall_ms = round((time.perf_counter() - started) * 1000)
        return {
            "contract": CONTRACT,
            "status": "completed",
            "provider": self.provider,
            "runtime_model": self.model,
            "outputs": [item[0] for item in results],
            "batch_wall_ms": wall_ms,
            "prompt_token_counts": [item[1] for item in results],
            "output_token_counts": [item[2] for item in results],
            "provider_request_wall_ms": [item[3] for item in results],
            "provider_http_calls": len(results),
            "production_routing_change": False,
            "production_deploy_performed": False,
        }

    def usage(self) -> dict[str, Any]:
        with self._lock:
            walls = list(self.request_wall_ms)
            return {
                "provider": self.provider,
                "model": self.model,
                "http_calls": self.http_calls,
                "input_tokens": self.total_input_tokens,
                "output_tokens": self.total_output_tokens,
                "request_wall_ms": walls,
                "max_request_wall_ms": max(walls, default=0),
                "production_routing_change": False,
                "production_deploy_performed": False,
            }

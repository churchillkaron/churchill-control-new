"""Owned low-latency Avantiqo Business Partner conversational front lane."""
from __future__ import annotations

import json
import os
import re
import subprocess
import time
import urllib.request
from pathlib import Path
from typing import Any

import modal

APP_NAME = os.environ.get("AVANTIQO_INTELLIGENCE_FRONT_APP_NAME", "avantiqo-intelligence-front-owned").strip() or "avantiqo-intelligence-front-owned"
ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V2"
RUNTIME_CONTRACT = "AVANTIQO_INTELLIGENCE_FRONT_CPU_WARM_V2"
MODEL = "Qwen/Qwen3-1.7B-GGUF:Q8_0"
MODEL_URL = "https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/90862c4b9d2787eaed51d12237eafdfe7c5f6077/Qwen3-1.7B-Q8_0.gguf?download=true"
MODEL_PATH = "/opt/avantiqo-front/qwen3-1.7b-q8.gguf"
PORT = 8080
SCALEDOWN_WINDOW_SECONDS = 120
MAX_OUTPUT_TOKENS = 320
THINK_BLOCK_RE = re.compile(r"<think>.*?</think>", re.S | re.I)

app = modal.App(APP_NAME)


def _download_model() -> None:
    path = Path(MODEL_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    if not path.is_file() or path.stat().st_size < 1_500_000_000:
        raise RuntimeError("AVANTIQO_INTELLIGENCE_FRONT_MODEL_DOWNLOAD_INVALID")


image = (
    modal.Image.from_registry("ghcr.io/ggml-org/llama.cpp:server", add_python="3.12")
    .entrypoint([])
    .run_function(_download_model, timeout=30 * 60)
)


def _health(timeout: float = 0.3) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=timeout) as response:
            return response.status == 200
    except Exception:
        return False


def _text(value: Any, limit: int = 120000) -> str:
    return str(value or "").strip()[:limit]


def _messages(data: dict[str, Any]) -> list[dict[str, str]]:
    supplied = data.get("messages")
    result: list[dict[str, str]] = []
    if isinstance(supplied, list):
        for item in supplied[-12:]:
            if not isinstance(item, dict):
                continue
            role = _text(item.get("role"), 40).lower()
            content = _text(item.get("content"), 5000)
            if role in {"user", "assistant", "system"} and content:
                result.append({"role": role, "content": content})
    if not result:
        prompt = _text(data.get("prompt") or data.get("input") or data.get("text"), 16000)
        if not prompt:
            raise ValueError("AVANTIQO_INTELLIGENCE_FRONT_INPUT_REQUIRED")
        result = [{"role": "user", "content": prompt}]
    return result


def _safe_output(raw: str) -> str:
    value = _text(raw, 12000)
    if "<think>" in value.lower() and "</think>" not in value.lower():
        raise RuntimeError("AVANTIQO_INTELLIGENCE_FRONT_TRUNCATED_REASONING")
    value = THINK_BLOCK_RE.sub("", value).strip()
    if "<think>" in value.lower() or "</think>" in value.lower():
        raise RuntimeError("AVANTIQO_INTELLIGENCE_FRONT_REASONING_LEAK")
    if not value:
        raise RuntimeError("AVANTIQO_INTELLIGENCE_FRONT_OUTPUT_REQUIRED")
    return value


@app.cls(
    image=image,
    cpu=8.0,
    memory=4096,
    timeout=60,
    startup_timeout=60,
    min_containers=1,
    max_containers=2,
    buffer_containers=0,
    scaledown_window=SCALEDOWN_WINDOW_SECONDS,
    enable_memory_snapshot=False,
)
class FrontConversation:
    @modal.enter()
    def initialize(self) -> None:
        started = time.perf_counter()
        binary = "/app/llama-server" if Path("/app/llama-server").exists() else "llama-server"
        self.server = subprocess.Popen(
            [binary, "-m", MODEL_PATH, "--host", "127.0.0.1", "--port", str(PORT), "-c", "4096", "-t", "8", "--no-webui"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        deadline = time.time() + 30
        while time.time() < deadline:
            if _health():
                self.startup_ready_seconds = round(time.perf_counter() - started, 3)
                return
            time.sleep(0.05)
        raise RuntimeError("AVANTIQO_INTELLIGENCE_FRONT_SNAPSHOT_INIT_TIMEOUT")

    @modal.method()
    def warmup(self) -> dict[str, Any]:
        if not _health():
            raise RuntimeError("AVANTIQO_INTELLIGENCE_FRONT_NOT_READY")
        return {
            "success": True,
            "status": "ready",
            "runtime_contract": RUNTIME_CONTRACT,
            "model": MODEL,
            "min_containers": 1,
            "scaledown_window_seconds": SCALEDOWN_WINDOW_SECONDS,
            "startup_ready_seconds": self.startup_ready_seconds,
            "customer_inference_performed": False,
            "tools_allowed": False,
            "mutation_authority": False,
        }

    @modal.method()
    def invoke(self, data: dict[str, Any]) -> dict[str, Any]:
        if data.get("tools"):
            raise ValueError("AVANTIQO_INTELLIGENCE_FRONT_TOOLS_FORBIDDEN")
        task_mode = _text(data.get("front_task_mode"), 80).lower()
        supplied_messages = _messages(data)
        if task_mode == "semantic_classifier":
            user_content = next((_text(item.get("content"), 9000) for item in reversed(supplied_messages) if item.get("role") == "user"), "")
            messages = [
                {
                    "role": "system",
                    "content": (
                        "Classify the human turn by meaning and conversation context. Choose one value for every field; never repeat option lists or use the | character. "
                        "Return exactly one short line: r=<c/e/g>;es=<none/internal/external/both>;depth=<fast/deep>;cm=<light/strategic/creative/analytical>;ct=<0/1>;cr=<0/1>;ed=<none/business/product_engineering>;gm=<inspect/change/none>;gd=<conversation/inspection_report/change/none>;al=<none/material>;cq=<0/1>;as=<none/single/mission>;gr=<new/continue/revise/unknown>;rm=<0/1>;ne=<0/1>. "
                        "c means discussion, e means fresh evidence is needed, g means governed execution. UI/workflow evaluation of Avantiqo is product_engineering; changing real business records is business. Breadth is not ambiguity. "
                        "Example meaning: asking to review a Finance UI and recommend improvements => r=e;es=internal;ed=product_engineering;gm=inspect;gd=conversation;ct=0;cr=0;al=none;cq=0;as=single;gr=new;rm=0;ne=1. "
                        "Example meaning: asking to create or update an invoice => r=g;es=internal;ed=business;gm=none;gd=none;ct=0;cr=0;al=none;cq=0;as=single;gr=new;rm=1;ne=1. /no_think"
                    ),
                },
                {"role": "user", "content": user_content},
            ]
        elif task_mode == "pending_action_relation":
            user_content = next((_text(item.get("content"), 7000) for item in reversed(supplied_messages) if item.get("role") == "user"), "")
            messages = [
                {
                    "role": "system",
                    "content": (
                        "Interpret the human reply relative to the staged business action from meaning and context, never trigger words. "
                        "Choose confirm only when they authorize execution now; revise when they change any staged detail before execution; cancel when they withdraw it; discuss when they ask/comment without authorizing or changing it; new_goal when they abandon or supersede it with unrelated work. Resolve references against the staged payload. "
                        "Return only q=<confirm|revise|cancel|discuss|new_goal>. /no_think"
                    ),
                },
                {"role": "user", "content": user_content},
            ]
        elif task_mode == "pending_action_presentation":
            user_content = next((_text(item.get("content"), 7000) for item in reversed(supplied_messages) if item.get("role") == "user"), "")
            messages = [
                {
                    "role": "system",
                    "content": (
                        "Infer only how the human wants the result returned after the staged action executes. Use preview when they want to see, review, inspect, check, or be shown what is created; pdf when PDF itself is the requested returned form; download for a downloadable file; otherwise none. Infer meaning, not trigger words. "
                        "Return only p=<preview|pdf|download|none>. /no_think"
                    ),
                },
                {"role": "user", "content": user_content},
            ]
        else:
            messages = [
                {
                    "role": "system",
                    "content": (
                        "You are Avantiqo, a natural human-style business partner. "
                        "Respond directly in the user's language. Never claim a business action happened. "
                        "Never invent current business facts. If current evidence is required, say that it is being checked. "
                        "Do not expose chain-of-thought or internal implementation details. /no_think"
                    ),
                },
                *supplied_messages,
            ]
        max_tokens = max(1, min(MAX_OUTPUT_TOKENS, int(data.get("max_output_tokens") or 120)))
        request_body = {
            "messages": messages,
            "temperature": float(data.get("temperature") if data.get("temperature") is not None else 0.25),
            "top_p": float(data.get("top_p") if data.get("top_p") is not None else 0.8),
            "max_tokens": max_tokens,
            "stream": False,
        }
        if task_mode == "pending_action_relation":
            request_body["grammar"] = (
                'root ::= "q=" relation\n'
                'relation ::= "confirm" | "revise" | "cancel" | "discuss" | "new_goal"'
            )
        elif task_mode == "pending_action_presentation":
            request_body["grammar"] = (
                'root ::= "p=" presentation\n'
                'presentation ::= "preview" | "pdf" | "download" | "none"'
            )
        response_format = data.get("response_format")
        if isinstance(response_format, dict) and response_format.get("type") == "json_object":
            request_body["response_format"] = {"type": "json_object"}
        body = json.dumps(request_body).encode()
        request = urllib.request.Request(
            f"http://127.0.0.1:{PORT}/v1/chat/completions",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        started = time.perf_counter()
        with urllib.request.urlopen(request, timeout=30) as response:
            output = json.loads(response.read())
        choice = ((output.get("choices") or [{}])[0].get("message") or {})
        final_text = _safe_output(choice.get("content"))
        usage = output.get("usage") or {}
        return {
            "success": True,
            "status": "completed",
            "provider": "avantiqo-intelligence",
            "engine_contract": ENGINE_CONTRACT,
            "front_runtime_contract": RUNTIME_CONTRACT,
            "execution_lane": "front",
            "front_task_mode": task_mode or "conversation",
            "capability": _text(data.get("capability"), 240),
            "model": MODEL,
            "text": final_text,
            "usage": {
                "input_tokens": int(usage.get("prompt_tokens") or 0),
                "output_tokens": int(usage.get("completion_tokens") or 0),
            },
            "infrastructure_provider": "MODAL_CPU_SNAPSHOT_V1",
            "modal_gpu": None,
            "modal_app": APP_NAME,
            "modal_class": "FrontConversation",
            "modal_volume_created": False,
            "memory_snapshot_enabled": False,
            "min_containers": 1,
            "max_containers": 2,
            "scaledown_window_seconds": SCALEDOWN_WINDOW_SECONDS,
            "raw_reasoning_persisted": False,
            "tools_allowed": False,
            "mutation_authority": False,
            "generation_seconds": round(time.perf_counter() - started, 3),
            "startup_ready_seconds": self.startup_ready_seconds,
            "prompt_tokens": int(usage.get("prompt_tokens") or 0),
            "completion_tokens": int(usage.get("completion_tokens") or 0),
        }

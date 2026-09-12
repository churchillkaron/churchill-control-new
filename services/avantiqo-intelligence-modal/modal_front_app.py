"""Owned low-latency Avantiqo Business Partner conversational front lane."""
from __future__ import annotations

import json
import re
import subprocess
import time
import urllib.request
from pathlib import Path
from typing import Any

import modal

APP_NAME = "avantiqo-intelligence-front-owned"
ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V2"
RUNTIME_CONTRACT = "AVANTIQO_INTELLIGENCE_FRONT_CPU_SNAPSHOT_V1"
MODEL = "Qwen/Qwen3-1.7B-GGUF:Q8_0"
MODEL_REVISION = "90862c4b9d2787eaed51d12237eafdfe7c5f6077"
MODEL_URL = (
    "https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/"
    + MODEL_REVISION
    + "/Qwen3-1.7B-Q8_0.gguf?download=true"
)
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
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=SCALEDOWN_WINDOW_SECONDS,
    enable_memory_snapshot=True,
)
class FrontConversation:
    @modal.enter(snap=True)
    def initialize_snapshot(self) -> None:
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
                self.snapshot_init_seconds = round(time.perf_counter() - started, 3)
                return
            time.sleep(0.05)
        raise RuntimeError("AVANTIQO_INTELLIGENCE_FRONT_SNAPSHOT_INIT_TIMEOUT")

    @modal.enter(snap=False)
    def after_restore(self) -> None:
        started = time.perf_counter()
        deadline = time.time() + 5
        while time.time() < deadline:
            if _health():
                self.restore_ready_seconds = round(time.perf_counter() - started, 3)
                return
            time.sleep(0.02)
        raise RuntimeError("AVANTIQO_INTELLIGENCE_FRONT_SNAPSHOT_RESTORE_FAILED")

    @modal.method()
    def warmup(self) -> dict[str, Any]:
        if not _health():
            raise RuntimeError("AVANTIQO_INTELLIGENCE_FRONT_NOT_READY")
        return {
            "success": True,
            "status": "ready",
            "runtime_contract": RUNTIME_CONTRACT,
            "model": MODEL,
            "min_containers": 0,
            "scaledown_window_seconds": SCALEDOWN_WINDOW_SECONDS,
            "restore_ready_seconds": self.restore_ready_seconds,
            "customer_inference_performed": False,
            "tools_allowed": False,
            "mutation_authority": False,
        }

    @modal.method()
    def invoke(self, data: dict[str, Any]) -> dict[str, Any]:
        if data.get("tools"):
            raise ValueError("AVANTIQO_INTELLIGENCE_FRONT_TOOLS_FORBIDDEN")
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
            *_messages(data),
        ]
        max_tokens = max(1, min(MAX_OUTPUT_TOKENS, int(data.get("max_output_tokens") or 120)))
        body = json.dumps({
            "messages": messages,
            "temperature": float(data.get("temperature") if data.get("temperature") is not None else 0.25),
            "top_p": float(data.get("top_p") if data.get("top_p") is not None else 0.8),
            "max_tokens": max_tokens,
            "stream": False,
        }).encode()
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
            "memory_snapshot_enabled": True,
            "min_containers": 0,
            "max_containers": 1,
            "scaledown_window_seconds": SCALEDOWN_WINDOW_SECONDS,
            "raw_reasoning_persisted": False,
            "tools_allowed": False,
            "mutation_authority": False,
            "generation_seconds": round(time.perf_counter() - started, 3),
            "restore_ready_seconds": self.restore_ready_seconds,
        }

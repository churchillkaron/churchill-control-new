"""Scale-to-zero Modal workers for owned Avantiqo Intelligence Fast + Deep.

No Modal Volume is created. Each exact Qwen snapshot is baked into its own
immutable Modal Image layer. Deploying these worker definitions downloads the
pinned public model snapshot once; invoking Fast/Deep is the only action that
starts an H100. The gateway lives in modal_service.py and never imports this
module. A warm container reuses its vLLM engine until Modal scales it to zero.
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any

import modal

APP_NAME = "avantiqo-intelligence-owned"
ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V2"
FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507"
DEEP_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507"
FAST_REVISION = "3ffd1f50b179e643d839c86df9ffbbefcb0d5018"
DEEP_REVISION = "8217eea09b2a3771bcd6d881189a7ed315e148fe"
BASE_IMAGE = "runpod/worker-v1-vllm:v2.25.0"
HF_ROOT = "/opt/avantiqo-intelligence-cache"
HF_CACHE_ROOT = f"{HF_ROOT}/hub"
MODEL_ROOT = "/opt/avantiqo-intelligence-models"
FAST_MODEL_PATH = f"{MODEL_ROOT}/fast"
DEEP_MODEL_PATH = f"{MODEL_ROOT}/deep"
MODEL_PATHS = {FAST_MODEL: FAST_MODEL_PATH, DEEP_MODEL: DEEP_MODEL_PATH}
GPU = "H100"
MAX_MODEL_LEN = 32768
MAX_OUTPUT_TOKENS = 16384
FAST_SCALEDOWN_WINDOW_SECONDS = 10 * 60
DEEP_SCALEDOWN_WINDOW_SECONDS = 5
PRIVATE_KEYS = {
    "reasoning", "reasoning_content", "chain_of_thought", "chainofthought",
    "cot", "thoughts", "scratchpad", "analysis",
}
TOOL_CALL_RE = re.compile(r"<tool_call>\s*(\{.*?\})\s*</tool_call>", re.S | re.I)
THINK_BLOCK_RE = re.compile(r"<think>.*?</think>", re.S | re.I)
_LLM_CACHE: dict[str, Any] = {}

app = modal.App(APP_NAME)


def _bake_model(repo_id: str, revision: str, cache_root: str, runtime_path: str) -> None:
    from huggingface_hub import snapshot_download

    resolved = Path(snapshot_download(
        repo_id=repo_id,
        revision=revision,
        cache_dir=cache_root,
    ))
    if not resolved.is_dir() or resolved.name != revision:
        raise RuntimeError(
            f"AVANTIQO_INTELLIGENCE_MODAL_SNAPSHOT_INVALID:{repo_id}:{resolved.name}"
        )
    required = [resolved / "config.json", resolved / "model.safetensors.index.json"]
    if any(not file_path.is_file() for file_path in required):
        raise RuntimeError(f"AVANTIQO_INTELLIGENCE_MODAL_SNAPSHOT_INCOMPLETE:{repo_id}")

    target = Path(runtime_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() or target.is_symlink():
        target.unlink()
    target.symlink_to(resolved, target_is_directory=True)
    if target.resolve() != resolved.resolve():
        raise RuntimeError(f"AVANTIQO_INTELLIGENCE_MODAL_RUNTIME_BINDING_INVALID:{repo_id}")
    if not (target / "config.json").is_file() or not (target / "model.safetensors.index.json").is_file():
        raise RuntimeError(f"AVANTIQO_INTELLIGENCE_MODAL_RUNTIME_BINDING_INCOMPLETE:{repo_id}")

    print(json.dumps({
        "event": "AVANTIQO_INTELLIGENCE_MODAL_MODEL_BAKED",
        "model": repo_id,
        "revision": revision,
        "runtime_path": runtime_path,
        "runtime_path_bound": True,
        "modal_volume_created": False,
        "gpu_inference_performed": False,
        "secrets_printed": False,
    }, separators=(",", ":")), flush=True)


def _base_image(model: str, revision: str, runtime_path: str) -> modal.Image:
    # The immutable snapshot download must be online exactly once during image
    # build. Only after that layer is committed do we force the runtime offline.
    return (
        modal.Image.from_registry(
            BASE_IMAGE,
            add_python=None,
            setup_dockerfile_commands=[
                "RUN command -v python >/dev/null 2>&1 || ln -s \"$(command -v python3)\" /usr/local/bin/python",
                "RUN command -v pip >/dev/null 2>&1 || ln -s \"$(command -v pip3)\" /usr/local/bin/pip",
                "RUN python --version && pip --version",
            ],
        )
        .entrypoint([])
        .env({
            "HF_HOME": HF_ROOT,
            "HF_HUB_CACHE": HF_CACHE_ROOT,
            "HF_HUB_OFFLINE": "0",
            "TRANSFORMERS_OFFLINE": "0",
            "VLLM_WORKER_MULTIPROC_METHOD": "spawn",
        })
        .run_function(
            _bake_model,
            args=(model, revision, HF_CACHE_ROOT, runtime_path),
            timeout=2 * 60 * 60,
        )
        .env({
            "HF_HUB_OFFLINE": "1",
            "TRANSFORMERS_OFFLINE": "1",
        })
    )


# Fast mirrors the proven Code warm-runtime configuration without changing Deep.
fast_image = _base_image(FAST_MODEL, FAST_REVISION, FAST_MODEL_PATH).env({
    "VLLM_ENABLE_V1_MULTIPROCESSING": "0",
    "VLLM_USE_FLASHINFER_SAMPLER": "0",
})
deep_image = _base_image(DEEP_MODEL, DEEP_REVISION, DEEP_MODEL_PATH)


def _text(value: Any, limit: int = 200000) -> str:
    return str(value or "").strip()[:limit]


def _safe(value: Any, depth: int = 0) -> Any:
    if depth > 10:
        return "[depth-limited]"
    if isinstance(value, list):
        return [_safe(item, depth + 1) for item in value]
    if not isinstance(value, dict):
        return value
    return {
        str(key): _safe(child, depth + 1)
        for key, child in value.items()
        if str(key).lower() not in PRIVATE_KEYS
    }


def _messages(data: dict[str, Any]) -> list[dict[str, Any]]:
    supplied = data.get("messages")
    if isinstance(supplied, list) and supplied:
        result = []
        for message in supplied[:200]:
            if not isinstance(message, dict):
                continue
            role = _text(message.get("role"), 40).lower()
            content = message.get("content")
            if role not in {"system", "user", "assistant", "tool"}:
                continue
            if isinstance(content, str):
                content = content[:100000]
            result.append({**_safe(message), "role": role, "content": content})
        if result:
            return result
    system = _text(
        data.get("system_prompt") or data.get("systemPrompt") or data.get("instructions_text"),
        100000,
    )
    prompt = _text(data.get("prompt") or data.get("input") or data.get("text"), 100000)
    result = []
    if system:
        result.append({"role": "system", "content": system})
    if prompt:
        result.append({"role": "user", "content": prompt})
    if not result:
        raise ValueError("AVANTIQO_INTELLIGENCE_INPUT_REQUIRED")
    return result


def _tool_name_from_choice(choice: Any) -> str | None:
    if not isinstance(choice, dict):
        return None
    function = choice.get("function")
    if isinstance(function, dict):
        return _text(function.get("name"), 200) or None
    return None


def _tool_policy(data: dict[str, Any], tools: list[Any] | None) -> tuple[list[Any] | None, str | None, bool]:
    choice = data.get("tool_choice", data.get("toolChoice"))
    if not tools:
        if choice not in {None, "none", "auto"}:
            raise ValueError("AVANTIQO_INTELLIGENCE_TOOL_CHOICE_WITHOUT_TOOLS")
        return None, None, False
    if choice == "none":
        return None, "Do not call any tool. Answer normally.", False
    named = _tool_name_from_choice(choice)
    required = choice == "required" or bool(named)
    if named:
        available = {
            _text(item.get("function", {}).get("name"), 200)
            for item in tools
            if isinstance(item, dict) and isinstance(item.get("function"), dict)
        }
        if named not in available:
            raise ValueError(f"AVANTIQO_INTELLIGENCE_TOOL_CHOICE_UNKNOWN:{named}")
        instruction = (
            f"You must call the tool named {named} exactly once. "
            "Do not answer with prose instead of the tool call."
        )
        return tools, instruction, True
    if choice == "required":
        return tools, "You must call exactly one of the provided tools. Do not answer with prose instead.", True
    return tools, None, False


def _tool_calls(raw: str) -> tuple[str, list[dict[str, Any]]]:
    calls = []
    for index, match in enumerate(TOOL_CALL_RE.finditer(raw), start=1):
        try:
            parsed = json.loads(match.group(1))
        except json.JSONDecodeError as exc:
            raise RuntimeError("AVANTIQO_INTELLIGENCE_MODAL_TOOL_CALL_JSON_INVALID") from exc
        if not isinstance(parsed, dict):
            raise RuntimeError("AVANTIQO_INTELLIGENCE_MODAL_TOOL_CALL_OBJECT_REQUIRED")
        name = _text(parsed.get("name") or parsed.get("function"), 200)
        arguments = parsed.get("arguments", {})
        if not name:
            raise RuntimeError("AVANTIQO_INTELLIGENCE_MODAL_TOOL_NAME_REQUIRED")
        if isinstance(arguments, str):
            try:
                json.loads(arguments)
                encoded = arguments
            except json.JSONDecodeError:
                encoded = json.dumps({"value": arguments}, separators=(",", ":"))
        else:
            encoded = json.dumps(arguments if isinstance(arguments, dict) else {}, separators=(",", ":"))
        calls.append({
            "id": f"call_{index}",
            "type": "function",
            "function": {"name": name, "arguments": encoded},
        })
    content = TOOL_CALL_RE.sub("", raw).strip()
    return content, calls


def _sanitize_deep(raw: str) -> tuple[str, bool]:
    source = raw or ""
    reasoning_detected = "<think>" in source.lower() or "</think>" in source.lower()
    if "<think>" in source.lower() and "</think>" not in source.lower():
        raise RuntimeError("AVANTIQO_INTELLIGENCE_TRUNCATED_REASONING_OUTPUT")
    final = THINK_BLOCK_RE.sub("", source).strip()
    close_index = source.lower().rfind("</think>")
    if close_index >= 0:
        final = source[close_index + len("</think>"):].strip()
    if "<think>" in final.lower() or "</think>" in final.lower():
        raise RuntimeError("AVANTIQO_INTELLIGENCE_REASONING_LEAK_DETECTED")
    return final, reasoning_detected


def _sanitize_fast(raw: str) -> str:
    source = (raw or "").strip()
    if "<think>" in source.lower() or "</think>" in source.lower():
        raise RuntimeError("AVANTIQO_INTELLIGENCE_FAST_REASONING_FORBIDDEN")
    return source


def _llm(model: str) -> Any:
    from vllm import LLM

    cached = _LLM_CACHE.get(model)
    if cached is not None:
        return cached
    runtime_path = MODEL_PATHS.get(model)
    if not runtime_path:
        raise RuntimeError(f"AVANTIQO_INTELLIGENCE_MODAL_MODEL_PATH_REQUIRED:{model}")
    local_model = Path(runtime_path)
    if not local_model.is_dir() or not (local_model / "config.json").is_file():
        raise RuntimeError(f"AVANTIQO_INTELLIGENCE_MODAL_LOCAL_MODEL_REQUIRED:{model}")
    options: dict[str, Any] = {
        "model": str(local_model),
        "dtype": "bfloat16",
        "max_model_len": MAX_MODEL_LEN,
        "tensor_parallel_size": 1,
        "gpu_memory_utilization": 0.90,
        "trust_remote_code": False,
    }
    if model == FAST_MODEL:
        # Match Code's proven warm vLLM path: CUDA graphs plus weight prefetch.
        options.update({
            "enforce_eager": False,
            "safetensors_load_strategy": "prefetch",
        })
    engine = LLM(**options)
    _LLM_CACHE[model] = engine
    return engine


def _run(data: dict[str, Any], *, model: str, lane: str) -> dict[str, Any]:
    from vllm import SamplingParams

    if _text(data.get("engine_contract"), 120) not in {"", ENGINE_CONTRACT, "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V1"}:
        raise ValueError("AVANTIQO_INTELLIGENCE_ENGINE_CONTRACT_INVALID")
    if not _text(data.get("organization_id"), 200):
        raise ValueError("AVANTIQO_INTELLIGENCE_ORGANIZATION_REQUIRED")
    if not _text(data.get("usage_id"), 200):
        raise ValueError("AVANTIQO_INTELLIGENCE_USAGE_ID_REQUIRED")

    messages = _messages(data)
    supplied_tools = _safe(data.get("tools")) if isinstance(data.get("tools"), list) else None
    tools, tool_instruction, tool_required = _tool_policy(data, supplied_tools)
    if tool_instruction:
        messages = [{"role": "system", "content": tool_instruction}, *messages]
    response_format = _safe(data.get("response_format") or data.get("responseFormat"))
    if isinstance(response_format, dict) and response_format.get("type") == "json_object":
        if tools:
            raise ValueError("AVANTIQO_INTELLIGENCE_JSON_RESPONSE_WITH_TOOLS_UNSUPPORTED")
        messages = [
            {"role": "system", "content": "Return one valid JSON object and no markdown."},
            *messages,
        ]

    requested_temperature = data.get("temperature")
    requested_top_p = data.get("top_p", data.get("topP"))
    if lane == "deep":
        temperature = 0.6
        top_p = 0.95
        sampling_policy = "QWEN3_THINKING_2507_RECOMMENDED"
    else:
        temperature = float(requested_temperature) if requested_temperature is not None else 0.7
        top_p = float(requested_top_p) if requested_top_p is not None else 0.8
        sampling_policy = "QWEN3_INSTRUCT_2507"
    max_tokens = max(1, min(
        MAX_OUTPUT_TOKENS,
        int(data.get("max_output_tokens") or data.get("maxOutputTokens") or 8192),
    ))

    sampling = SamplingParams(
        temperature=temperature,
        top_p=top_p,
        max_tokens=max_tokens,
    )
    warm_engine_reused = model in _LLM_CACHE
    started = time.perf_counter()
    engine = _llm(model)
    results = engine.chat(
        messages,
        sampling_params=sampling,
        use_tqdm=False,
        tools=tools,
    )
    if not results or not results[0].outputs:
        raise RuntimeError("AVANTIQO_INTELLIGENCE_MODAL_OUTPUT_REQUIRED")
    request_output = results[0]
    generated = request_output.outputs[0]
    raw = _text(generated.text)
    if lane == "deep":
        final_text, reasoning_detected = _sanitize_deep(raw)
    else:
        final_text = _sanitize_fast(raw)
        reasoning_detected = False
    final_text, tool_calls = _tool_calls(final_text)
    if tool_required and len(tool_calls) != 1:
        raise RuntimeError("AVANTIQO_INTELLIGENCE_REQUIRED_TOOL_CALL_MISSING_OR_AMBIGUOUS")
    if not final_text and not tool_calls:
        raise RuntimeError("AVANTIQO_INTELLIGENCE_MODAL_FINAL_OUTPUT_REQUIRED")

    usage = {
        "input_tokens": len(request_output.prompt_token_ids or []),
        "output_tokens": len(generated.token_ids or []),
    }
    usage["total_tokens"] = usage["input_tokens"] + usage["output_tokens"]
    return {
        "status": "completed",
        "provider": "avantiqo-intelligence",
        "model": model,
        "engine_contract": ENGINE_CONTRACT,
        "execution_lane": lane,
        "text": final_text,
        "tool_calls": tool_calls,
        "finish_reason": getattr(generated, "finish_reason", None),
        "usage": usage,
        "reasoning_mode": "thinking" if lane == "deep" else "non_thinking",
        "sampling_policy": sampling_policy,
        "reasoning_transport_detected": reasoning_detected,
        "warm_engine_reused": warm_engine_reused,
        "raw_reasoning_persisted": False,
        "infrastructure_provider": "MODAL_H100_ASYNC_V1",
        "modal_gpu": GPU,
        "modal_volume_created": False,
        "runpod_inference_performed": False,
        "modal_elapsed_seconds": round(time.perf_counter() - started, 3),
        **({
            "warm_retention_seconds": FAST_SCALEDOWN_WINDOW_SECONDS,
            "vllm_enforce_eager": False,
            "safetensors_load_strategy": "prefetch",
        } if lane == "fast" else {}),
    }


@app.function(
    image=fast_image,
    gpu=GPU,
    timeout=30 * 60,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=FAST_SCALEDOWN_WINDOW_SECONDS,
)
def fast(data: dict[str, Any]) -> dict[str, Any]:
    return _run(data, model=FAST_MODEL, lane="fast")


@app.function(
    image=deep_image,
    gpu=GPU,
    timeout=30 * 60,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=DEEP_SCALEDOWN_WINDOW_SECONDS,
)
def deep(data: dict[str, Any]) -> dict[str, Any]:
    return _run(data, model=DEEP_MODEL, lane="deep")
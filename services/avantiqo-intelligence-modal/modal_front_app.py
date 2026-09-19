"""Owned low-latency Avantiqo Business Partner conversational front lane."""
from __future__ import annotations

import json
import os
import re
import subprocess
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import modal

APP_NAME = os.environ.get("AVANTIQO_INTELLIGENCE_FRONT_APP_NAME", "avantiqo-intelligence-front-owned").strip() or "avantiqo-intelligence-front-owned"
ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V2"
RUNTIME_CONTRACT = "AVANTIQO_INTELLIGENCE_FRONT_CPU_WARM_V2"
MODEL = "Qwen/Qwen3-4B-GGUF:Q4_K_M"
MODEL_URL = "https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/bc640142c66e1fdd12af0bd68f40445458f3869b/Qwen3-4B-Q4_K_M.gguf?download=true"
MODEL_PATH = "/opt/avantiqo-front/qwen3-4b-q4-k-m.gguf"
LIGHT_MODEL = "Qwen/Qwen3-1.7B-GGUF:Q8_0"
LIGHT_MODEL_URL = "https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q8_0.gguf?download=true"
LIGHT_MODEL_PATH = "/opt/avantiqo-front/qwen3-1.7b-q8-0.gguf"
PORT = 8080
LIGHT_PORT = 8081
SCALEDOWN_WINDOW_SECONDS = 30
MAX_OUTPUT_TOKENS = 320
FRONT_CPU = float(os.environ.get("AVANTIQO_INTELLIGENCE_FRONT_CPU", "8"))
FRONT_THREADS = max(1, int(os.environ.get("AVANTIQO_INTELLIGENCE_FRONT_THREADS", str(int(FRONT_CPU)))))
THINK_BLOCK_RE = re.compile(r"<think>.*?</think>", re.S | re.I)

SEMANTIC_SYSTEM_PROMPT = (
    "Understand the CURRENT human message by meaning, using prior context only when the message actually refers back to it. "
    "Return exactly six fields and nothing else: i=<chat|inspect|operate|followup|revise|artifact|unclear>;d=<none|business|product>;e=<none|internal|external|both>;a=<none|single|mission>;g=<new|continue|revise|unknown>;m=<light|strategic|creative|analytical>. "
    "chat = normal conversation, strategy, brainstorming, opinions, creative collaboration, general questions. "
    "inspect = the user wants current facts, live system inspection, verification, audit, research, or evidence. "
    "operate = the user wants Avantiqo to actually cause a real state change now, such as creating/updating/deleting a business record, issuing an invoice, sending a communication, posting a payment, changing product code/configuration, or performing another real action. Infer this from the requested outcome, not from trigger words. "
    "followup = the CURRENT utterance itself depends on the immediately preceding exchange. Topic words such as follow-up, previous, second, continue, example, or next do not by themselves make a message a conversational followup. If the current message is self-contained, use chat, inspect, or operate with g=new even when it discusses follow-up questions or continuation as a concept. Use followup with g=continue only when the utterance is elliptical, referential, or underspecified alone and becomes clear from the supplied immediately preceding exchange. "
    "revise = the user changes/corrects the prior goal or output. artifact = reuse/show/resend/open an existing output without recreating it. "
    "d=product when the current message is about Avantiqo itself, including its Business Partner, intelligence, capabilities, UI/UX, workflows, architecture, code, Studios, or how the product should improve. d=business when the requested outcome operates or discusses the user's real business records/processes. Otherwise d=none. "
    "e says what fresh evidence is required. For ordinary chat/strategy use none unless the user explicitly requests current inspection/research or a current factual answer requires it. "
    "a describes real operation/inspection shape, not conversational editing. Use a=single for one concrete business/product operation or inspection, a=mission only for a genuinely multi-step autonomous objective, otherwise a=none. For chat, followup, revise, and artifact conversation with no real operation/inspection, use a=none even when the user asks for one rewrite, tone change, explanation, or other conversational edit. "
    "g=new for a standalone new topic, continue when it depends on the prior goal, revise when it changes the prior goal. When a continuation supplies a missing parameter for a current-fact request, keep i=inspect and g=continue rather than downgrading it to generic followup. When one essential parameter is missing from an otherwise clear request, use i=unclear with the correct evidence scope; focused clarification is handled outside this classifier. "
    "m describes answer complexity independently from i/g relationship. A followup or revision can still be m=light. m=light for straightforward explanations, simple conceptual differences, casual conversation, routine drafting or rewriting, simple tone/length/style edits, routine brainstorming, simple idea lists, uncomplicated factual concepts, and ordinary questions that do not need substantial judgment; m=strategic for meaningful business or product tradeoffs, planning, prioritization, consequential advice, or decisions with competing objectives; m=creative only when originality, concept quality, storytelling, design direction, brand/creative work, or non-routine ideation is central—not for routine brainstorming or a simple list of ideas; m=analytical only when diagnosis, decision-relevant comparison, structured evaluation, tradeoff analysis, or multi-step reasoning is materially required—not for a simple explanation, conceptual difference, basic educational comparison, or routine revision. Do not downgrade a substantive strategy question to light merely because it is self-contained. "
    "Never inherit a previous customer/project/domain into a standalone current message. /no_think"
)
SEMANTIC_GRAMMAR = (
    'root ::= "i=" intent ";d=" domain ";e=" evidence ";a=" action ";g=" relation ";m=" mode\n'
    'intent ::= "chat" | "inspect" | "operate" | "followup" | "revise" | "artifact" | "unclear"\n'
    'domain ::= "none" | "business" | "product"\n'
    'evidence ::= "none" | "internal" | "external" | "both"\n'
    'action ::= "none" | "single" | "mission"\n'
    'relation ::= "new" | "continue" | "revise" | "unknown"\n'
    'mode ::= "light" | "strategic" | "creative" | "analytical"'
)

app = modal.App(APP_NAME)


def _download_model() -> None:
    for url, target, minimum in [
        (MODEL_URL, MODEL_PATH, 1_500_000_000),
        (LIGHT_MODEL_URL, LIGHT_MODEL_PATH, 1_200_000_000),
    ]:
        path = Path(target)
        path.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(url, target)
        if not path.is_file() or path.stat().st_size < minimum:
            raise RuntimeError("AVANTIQO_INTELLIGENCE_FRONT_MODEL_DOWNLOAD_INVALID")


image = (
    modal.Image.from_registry("ghcr.io/ggml-org/llama.cpp:server", add_python="3.12")
    .entrypoint([])
    .run_function(_download_model, timeout=30 * 60)
)


def _health(port: int = PORT, timeout: float = 0.3) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=timeout) as response:
            return response.status == 200
    except Exception:
        return False


def _prime_model(port: int, semantic: bool = False) -> None:
    request_body = {
        "messages": (
            [
                {"role": "system", "content": SEMANTIC_SYSTEM_PROMPT},
                {"role": "user", "content": "RECENT CONVERSATION (reference only):\n[]\n\nWORKING CONTEXT (reference only):\n{}\n\nCURRENT MESSAGE TO CLASSIFY (authoritative):\nhello"},
            ]
            if semantic
            else [
                {"role": "system", "content": "Reply with OK only. /no_think"},
                {"role": "user", "content": "ready"},
            ]
        ),
        "temperature": 0.0,
        "max_tokens": 40 if semantic else 2,
        "stream": False,
    }
    if semantic:
        request_body["grammar"] = SEMANTIC_GRAMMAR
    body = json.dumps(request_body).encode()
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}/v1/chat/completions",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        output = json.loads(response.read())
    content = _text((((output.get("choices") or [{}])[0].get("message") or {}).get("content")), 40)
    if not content:
        raise RuntimeError("AVANTIQO_INTELLIGENCE_FRONT_PRIME_FAILED")


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
    cpu=FRONT_CPU,
    memory=10240,
    timeout=60,
    startup_timeout=60,
    min_containers=0,
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
            [binary, "-m", MODEL_PATH, "--host", "127.0.0.1", "--port", str(PORT), "-c", "4096", "-t", str(FRONT_THREADS), "--no-webui"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.light_server = subprocess.Popen(
            [binary, "-m", LIGHT_MODEL_PATH, "--host", "127.0.0.1", "--port", str(LIGHT_PORT), "-c", "4096", "-t", str(FRONT_THREADS), "--no-webui"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        deadline = time.time() + 30
        while time.time() < deadline:
            if _health(PORT) and _health(LIGHT_PORT):
                _prime_model(PORT, semantic=True)
                _prime_model(LIGHT_PORT)
                self.startup_ready_seconds = round(time.perf_counter() - started, 3)
                return
            time.sleep(0.05)
        raise RuntimeError("AVANTIQO_INTELLIGENCE_FRONT_SNAPSHOT_INIT_TIMEOUT")

    @modal.method()
    def warmup(self) -> dict[str, Any]:
        if not (_health(PORT) and _health(LIGHT_PORT)):
            raise RuntimeError("AVANTIQO_INTELLIGENCE_FRONT_NOT_READY")
        return {
            "success": True,
            "status": "ready",
            "runtime_contract": RUNTIME_CONTRACT,
            "model": MODEL,
            "light_model": LIGHT_MODEL,
            "semantic_model_ready": True,
            "light_model_ready": True,
            "min_containers": 0,
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
        selected_port = LIGHT_PORT if task_mode == "conversation_light" else PORT
        selected_model = LIGHT_MODEL if task_mode == "conversation_light" else MODEL
        supplied_messages = _messages(data)
        if task_mode == "semantic_light_parallel":
            user_content = next((_text(item.get("content"), 9000) for item in reversed(supplied_messages) if item.get("role") == "user"), "")
            try:
                parsed_input = json.loads(user_content)
            except Exception:
                parsed_input = {}
            current_message = _text(parsed_input.get("message") if isinstance(parsed_input, dict) else user_content, 12000) or user_content
            recent_context = parsed_input.get("immediate") if isinstance(parsed_input, dict) and isinstance(parsed_input.get("immediate"), list) else []
            classifier_input = (
                f"RECENT CONVERSATION (reference only):\n{json.dumps(recent_context, ensure_ascii=False)[:5000]}\n\n"
                f"CURRENT MESSAGE TO CLASSIFY (authoritative):\n{current_message}"
            )
            semantic_messages = [
                {"role": "system", "content": SEMANTIC_SYSTEM_PROMPT},
                {"role": "user", "content": classifier_input},
            ]
            light_context = json.dumps(recent_context[-2:], ensure_ascii=False)[:3000]
            light_messages = [
                {"role": "system", "content": (
                    "You are Avantiqo, a natural human-style business partner. Answer the CURRENT message directly. "
                    "Never claim a business action happened and never invent current facts. If the message needs current evidence or asks for an action, do not pretend it happened. "
                    "If immediate context is supplied, use it only when the current message refers to it. Give a complete useful answer, usually about 70-100 words. /no_think"
                )},
                {"role": "user", "content": f"IMMEDIATE CONTEXT: {light_context}\nCURRENT MESSAGE: {current_message}"},
            ]
            semantic_body = {
                "messages": semantic_messages, "temperature": 0.02, "top_p": 0.8, "max_tokens": 40, "stream": False,
                "grammar": SEMANTIC_GRAMMAR,
            }
            light_body = {"messages": light_messages, "temperature": 0.12, "top_p": 0.8, "max_tokens": 180, "stream": False}
            def _post(port, body):
                req = urllib.request.Request(f"http://127.0.0.1:{port}/v1/chat/completions", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
                started = time.perf_counter()
                with urllib.request.urlopen(req, timeout=30) as response:
                    out = json.loads(response.read())
                txt = _safe_output((((out.get("choices") or [{}])[0].get("message") or {}).get("content")))
                return txt, out.get("usage") or {}, round(time.perf_counter()-started, 3)
            total_started = time.perf_counter()
            pool = ThreadPoolExecutor(max_workers=2)
            sem_future = pool.submit(_post, PORT, semantic_body)
            light_future = pool.submit(_post, LIGHT_PORT, light_body)
            sem_text, sem_usage, sem_seconds = sem_future.result()
            safe_chat = sem_text.startswith(("i=chat;", "i=followup;", "i=revise;")) and (";d=none;" in sem_text or ";d=business;" in sem_text) and ";e=none;" in sem_text and ";a=none;" in sem_text and (";g=new;" in sem_text or ";g=continue;" in sem_text or ";g=revise;" in sem_text) and sem_text.endswith(";m=light")
            light_text = None; light_usage = {}; light_seconds = 0.0
            if safe_chat:
                light_text, light_usage, light_seconds = light_future.result()
                pool.shutdown(wait=False, cancel_futures=True)
            else:
                light_future.cancel()
                pool.shutdown(wait=False, cancel_futures=True)
            return {
                "success": True, "status": "completed", "provider": "avantiqo-intelligence", "engine_contract": ENGINE_CONTRACT,
                "front_runtime_contract": RUNTIME_CONTRACT, "execution_lane": "front", "front_task_mode": task_mode,
                "model": MODEL, "text": sem_text, "semantic_text": sem_text, "light_model": LIGHT_MODEL, "light_text": light_text, "safe_light_draft": safe_chat,
                "semantic_seconds": sem_seconds, "light_seconds": light_seconds, "generation_seconds": round(time.perf_counter()-total_started,3),
                "semantic_usage": sem_usage, "light_usage": light_usage, "usage": {"input_tokens": int(sem_usage.get("prompt_tokens") or 0) + int(light_usage.get("prompt_tokens") or 0), "output_tokens": int(sem_usage.get("completion_tokens") or 0) + int(light_usage.get("completion_tokens") or 0)}, "prompt_tokens": int(sem_usage.get("prompt_tokens") or 0) + int(light_usage.get("prompt_tokens") or 0), "completion_tokens": int(sem_usage.get("completion_tokens") or 0) + int(light_usage.get("completion_tokens") or 0), "infrastructure_provider": "MODAL_CPU_SNAPSHOT_V1",
                "modal_gpu": None, "modal_app": APP_NAME, "modal_class": "FrontConversation", "modal_volume_created": False,
                "memory_snapshot_enabled": False, "min_containers": 0, "max_containers": 2, "raw_reasoning_persisted": False,
                "tools_allowed": False, "mutation_authority": False,
            }
        if task_mode == "semantic_classifier":
            user_content = next((_text(item.get("content"), 9000) for item in reversed(supplied_messages) if item.get("role") == "user"), "")
            classifier_input = user_content
            try:
                parsed_input = json.loads(user_content)
            except Exception:
                parsed_input = None
            if isinstance(parsed_input, dict) and _text(parsed_input.get("message"), 12000):
                current_message = _text(parsed_input.get("message"), 12000)
                recent_context = (
                    parsed_input.get("recent") if isinstance(parsed_input.get("recent"), list)
                    else parsed_input.get("immediate") if isinstance(parsed_input.get("immediate"), list)
                    else []
                )
                working_context = parsed_input.get("context") if isinstance(parsed_input.get("context"), dict) else {}
                classifier_input = (
                    f"REFERENCE — RECENT CONVERSATION:\n{json.dumps(recent_context, ensure_ascii=False)[:5000]}\n\n"
                    f"REFERENCE — WORKING CONTEXT:\n{json.dumps(working_context, ensure_ascii=False)[:5000]}\n\n"
                    f"CURRENT MESSAGE TO CLASSIFY (authoritative):\n{current_message}"
                )
            messages = [
                {
                    "role": "system",
                    "content": (
                        "Understand the CURRENT human message by meaning, using prior context only when the message actually refers back to it. "
                        "Return exactly: i=<chat|inspect|operate|followup|revise|artifact|unclear>;d=<none|business|product>;e=<none|internal|external|both>;a=<none|single|mission>;g=<new|continue|revise|unknown>. "
                        "chat = normal conversation, strategy, brainstorming, opinions, creative collaboration, general questions. "
                        "inspect = the user wants current facts, live system inspection, verification, audit, research, or evidence. "
                        "operate = the user wants Avantiqo to actually cause a real state change now, such as creating/updating/deleting a business record, issuing an invoice, sending a communication, posting a payment, changing product code/configuration, or performing another real action. Infer this from the requested outcome, not from trigger words. "
                        "followup = the message only makes sense as continuation of the prior goal, such as an elliptical continuation. "
                        "revise = the user changes/corrects the prior goal or output. artifact = reuse/show/resend/open an existing output without recreating it. "
                        "Avantiqo is the product/platform name. d=product when the current message is about Avantiqo itself, including Business Partner, intelligence, capabilities, UI/UX, Finance/People/Supply Chain screens, workflows, architecture, code, Studios, or how the product should improve. d=business when the requested outcome operates or discusses the user's actual company records/processes such as customers, invoices, payments, staff, bookings, inventory, suppliers, or schedules. Otherwise d=none. "
                        "e says what fresh evidence is required. For ordinary chat/strategy use none unless the user explicitly requests current inspection/research or a current factual answer requires it. "
                        "a=single for one concrete operation/inspection, mission only for a genuinely multi-step autonomous objective, otherwise none. "
                        "g=new for a standalone new topic, continue when it depends on the prior goal, revise when it changes the prior goal. "
                        "Never inherit a previous customer/project/domain into a standalone current message. /no_think"
                    ),
                },
                {"role": "user", "content": classifier_input},
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
        if task_mode == "semantic_classifier":
            # Keep the transport grammar fixed-width and enum-only. Free-form
            # location/question productions caused llama.cpp chat-completion 400s.
            # Registered capability input extraction and focused clarification are
            # handled deterministically outside this classifier.
            request_body["grammar"] = SEMANTIC_GRAMMAR
        elif task_mode == "pending_action_relation":
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
            f"http://127.0.0.1:{selected_port}/v1/chat/completions",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        started = time.perf_counter()
        with urllib.request.urlopen(request, timeout=45) as response:
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
            "model": selected_model,
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
            "min_containers": 0,
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

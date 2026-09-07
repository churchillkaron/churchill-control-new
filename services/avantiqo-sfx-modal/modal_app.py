from __future__ import annotations

import os
import tempfile
import time
from pathlib import Path
from typing import Any

import modal

APP_NAME = "avantiqo-sfx-owned"
ENGINE_CONTRACT = "AVANTIQO_SFX_ENGINE_V1"
PRODUCT_MODEL = "avantiqo-sfx-v1"
FOUNDATION_MODEL = "OpenMOSS-Team/MOSS-SoundEffect-v2.0"
GPU = "A10G"
SAMPLE_RATE = 48000
MAX_SECONDS = 30.0

app = modal.App(APP_NAME)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("git", "ffmpeg")
    .run_commands(
        "git clone --depth 1 https://github.com/OpenMOSS/MOSS-TTS.git /opt/moss-tts",
        "python -m pip install --upgrade pip",
        "python -m pip install --extra-index-url https://download.pytorch.org/whl/cu128 -e '/opt/moss-tts/moss_soundeffect_v2[torch-cu128]'",
        "python -m pip install requests huggingface_hub",
        "python -c \"from huggingface_hub import snapshot_download; snapshot_download('OpenMOSS-Team/MOSS-SoundEffect-v2.0', local_dir='/opt/models/moss-sfx-v2')\"",
    )
    .env({
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
        "TORCHDYNAMO_DISABLE": "1",
        "PYTHONPATH": "/opt/moss-tts/moss_soundeffect_v2",
    })
)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _number(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


@app.cls(
    image=image,
    gpu=GPU,
    timeout=20 * 60,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=10,
)
class SfxEngine:
    @modal.enter()
    def load(self) -> None:
        import torch
        from moss_soundeffect_v2 import MossSoundEffectPipeline

        self.pipe = MossSoundEffectPipeline.from_pretrained(
            "/opt/models/moss-sfx-v2",
            torch_dtype=torch.bfloat16,
            device="cuda",
        )

    def _render_to_path(self, *, instruction: str, seconds: float, steps: int, cfg_scale: float, output: Path) -> int:
        import soundfile as sf

        audio = self.pipe(
            prompt=instruction,
            seconds=seconds,
            num_inference_steps=steps,
            cfg_scale=cfg_scale,
        )
        wav = audio.detach().cpu()
        if wav.ndim == 3:
            wav = wav[0]
        elif wav.ndim == 1:
            wav = wav.unsqueeze(0)
        wav = wav.to(dtype=__import__("torch").float32).transpose(0, 1).contiguous().numpy()
        sf.write(str(output), wav, SAMPLE_RATE, subtype="PCM_24")
        if not output.is_file() or output.stat().st_size <= 1024:
            raise RuntimeError("AVANTIQO_SFX_OUTPUT_INVALID")
        return output.stat().st_size

    @modal.method()
    def certify_sample(self, instruction: str, seconds: float = 4.0) -> bytes:
        seconds = max(0.5, min(MAX_SECONDS, float(seconds)))
        with tempfile.TemporaryDirectory(prefix="avantiqo-sfx-cert-") as tmp:
            output = Path(tmp) / "cert.wav"
            self._render_to_path(instruction=instruction, seconds=seconds, steps=100, cfg_scale=4.0, output=output)
            return output.read_bytes()

    @modal.method()
    def certify_batch(self, jobs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        with tempfile.TemporaryDirectory(prefix="avantiqo-sfx-batch-") as tmp:
            for index, job in enumerate(jobs):
                name = _text(job.get("name")) or f"sfx-{index:02d}"
                instruction = _text(job.get("instruction"))
                seconds = max(0.5, min(MAX_SECONDS, _number(job.get("seconds"), 4.0)))
                if len(instruction) < 4:
                    raise ValueError(f"AVANTIQO_SFX_BATCH_INSTRUCTION_REQUIRED:{name}")
                output = Path(tmp) / f"{index:02d}.wav"
                self._render_to_path(instruction=instruction, seconds=seconds, steps=100, cfg_scale=4.0, output=output)
                results.append({"name": name, "seconds": seconds, "audio": output.read_bytes()})
        return results

    @modal.method()
    def generate(self, data: dict[str, Any]) -> dict[str, Any]:
        import requests

        capability = _text(data.get("capability"))
        if capability != "ai.sfx.generate":
            raise ValueError(f"AVANTIQO_SFX_CAPABILITY_NOT_IMPLEMENTED:{capability}")
        instruction = _text(data.get("instruction"))
        if len(instruction) < 4:
            raise ValueError("AVANTIQO_SFX_INSTRUCTION_REQUIRED")
        upload = data.get("storage_upload") if isinstance(data.get("storage_upload"), dict) else {}
        signed_url = _text(upload.get("signed_url"))
        storage_reference = _text(upload.get("storage_reference"))
        if not signed_url or not storage_reference.startswith("storage://creative-assets/"):
            raise ValueError("AVANTIQO_SFX_STORAGE_UPLOAD_REQUIRED")

        spec = data.get("structured_specification") if isinstance(data.get("structured_specification"), dict) else {}
        generation = spec.get("generation") if isinstance(spec.get("generation"), dict) else {}
        params = spec.get("provider_parameters") if isinstance(spec.get("provider_parameters"), dict) else {}
        seconds = max(0.5, min(MAX_SECONDS, _number(generation.get("duration_seconds", data.get("duration_seconds")), 5.0)))
        steps = int(max(20, min(120, _number(params.get("num_inference_steps"), 100))))
        cfg_scale = max(1.0, min(8.0, _number(params.get("cfg_scale"), 4.0)))

        started = time.perf_counter()
        with tempfile.TemporaryDirectory(prefix="avantiqo-sfx-") as tmp:
            output = Path(tmp) / "sfx.wav"
            self._render_to_path(instruction=instruction, seconds=seconds, steps=steps, cfg_scale=cfg_scale, output=output)
            with output.open("rb") as handle:
                response = requests.put(
                    signed_url,
                    data=handle,
                    headers={
                        "content-type": "audio/wav",
                        "cache-control": "max-age=3600",
                        "x-upsert": "false",
                    },
                    timeout=300,
                )
            if not response.ok:
                raise RuntimeError(f"AVANTIQO_SFX_UPLOAD_FAILED:{response.status_code}")
            size = output.stat().st_size

        return {
            "success": True,
            "status": "completed",
            "provider": "avantiqo-audio",
            "model": PRODUCT_MODEL,
            "foundation_model": FOUNDATION_MODEL,
            "engine_contract": ENGINE_CONTRACT,
            "capability": capability,
            "storage_reference": storage_reference,
            "sample_rate": SAMPLE_RATE,
            "duration_seconds": seconds,
            "output_size_bytes": size,
            "infrastructure_provider": "MODAL_A10G_ASYNC_V1",
            "modal_gpu": GPU,
            "raw_reasoning_persisted": False,
            "generation_seconds": round(time.perf_counter() - started, 3),
        }


@app.function(image=image)
@modal.fastapi_endpoint(method="POST")
def generate_endpoint(data: dict[str, Any]) -> dict[str, Any]:
    try:
        return SfxEngine().generate.remote(data)
    except Exception as exc:
        return {
            "success": False,
            "status": "failed",
            "engine_contract": ENGINE_CONTRACT,
            "error_code": _text(exc).split(":", 1)[0][:180],
            "error_detail": _text(exc)[:1200],
        }


@app.local_entrypoint()
def certify_local(output_path: str = "/tmp/avantiqo-sfx-cert.wav") -> None:
    prompt = "A harsh digital bedside alarm clock ringing repeatedly at 06:00 in a dark quiet bedroom, urgent electronic beeps with realistic small-room reflections, no music and no voice."
    audio = SfxEngine().certify_sample.remote(prompt, 4.0)
    Path(output_path).write_bytes(audio)
    print(f"AVANTIQO_SFX_CERT_SAMPLE={output_path}")


@app.local_entrypoint()
def certify_investor_batch(output_dir: str = "/tmp/avantiqo-investor-sfx") -> None:
    jobs = [
        {"name": "alarm-0600", "seconds": 4.0, "instruction": "A harsh digital bedside alarm clock ringing repeatedly at 06:00 in a dark quiet bedroom, urgent electronic beeps with realistic small-room reflections, no music and no voice."},
        {"name": "subway-arrival", "seconds": 6.0, "instruction": "A real underground subway train approaching a platform at morning rush hour: deep rail rumble grows rapidly, steel wheel resonance, air pressure, brake squeal, then train doors open with a pneumatic release. No announcements, no music, no voice."},
        {"name": "rushing-footsteps", "seconds": 5.0, "instruction": "Many hurried adult footsteps in business shoes and work shoes moving across hard city pavement and station flooring, layered natural heel and sole impacts, purposeful morning urgency, no running panic, no music and no voice."},
        {"name": "car-traffic-door", "seconds": 5.0, "instruction": "Early city morning traffic close by, an ordinary car pulls to the curb, engine idles briefly, a solid car door closes with weight, footsteps move away while traffic passes. Realistic urban reflections, no horns, no music, no voice."},
        {"name": "access-door-badge", "seconds": 4.0, "instruction": "A staff access badge taps an electronic reader, one clean confirmation beep, magnetic door lock releases, heavy service door opens and closes, footsteps cross the threshold. Quiet back-of-house room tone, no music, no voice."},
        {"name": "intelligence-boom", "seconds": 7.0, "instruction": "A colossal cinematic science-fiction pressure event: deep subsonic energy gathers from silence, dense electrical intelligence rises, then one enormous physical low-frequency impact and expanding pressure wave tears through a vast space, with metallic energy fragments and a long controlled reverberant tail. No melody, no voice, no generic whoosh."},
    ]
    target = Path(output_dir)
    target.mkdir(parents=True, exist_ok=True)
    for result in SfxEngine().certify_batch.remote(jobs):
        path = target / f"{result['name']}.wav"
        path.write_bytes(result["audio"])
        print(f"AVANTIQO_SFX_BATCH_FILE={path}")

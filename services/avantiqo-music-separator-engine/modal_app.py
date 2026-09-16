from __future__ import annotations

import os
from typing import Any

import modal

APP_NAME = "avantiqo-music-separator-owned"
FUNCTION_NAME = "separate"
GPU = "A10G"
IMAGE = (
    "ghcr.io/churchillkaron/avantiqo-music-separator-worker@"
    "sha256:d12b10a5242e99a516653dfb2f9015d338f6b3c1701f8b415779898b8fc9a5ea"
)

app = modal.App(APP_NAME)



worker_image = (
    modal.Image.from_registry(
        IMAGE,
        add_python="3.10",
    )
    .entrypoint([])
    .env({"PYTHONPATH": "/usr/local/lib/python3.10/dist-packages:/app"})
)


@app.function(
    image=worker_image,
    gpu=GPU,
    timeout=30 * 60,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=5,
)
def separate(data: dict[str, Any]) -> dict[str, Any]:
    os.chdir("/app")
    import handler as separator

    output = separator.handler({"input": data})
    if not isinstance(output, dict) or output.get("success") is not True:
        raise RuntimeError("AVANTIQO_MUSIC_SEPARATOR_MODAL_OUTPUT_INVALID")
    output["infrastructure_provider"] = "MODAL_A10G_ASYNC_V1"
    output["modal_gpu"] = GPU
    output["modal_volume_created"] = False
    output["runpod_inference_performed"] = False
    output["raw_reasoning_persisted"] = False
    return output

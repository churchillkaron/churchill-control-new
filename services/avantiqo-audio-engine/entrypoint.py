import os
import runpy
from pathlib import Path

from acestep.model_downloader import download_submodel

from cache_integrity import repair_incomplete_sharded_checkpoint

MODEL_VARIANT = os.getenv("AVANTIQO_AUDIO_MODEL_VARIANT", "acestep-v15-xl-turbo").strip()
MODEL_SOURCE = os.getenv("AVANTIQO_AUDIO_MODEL_SOURCE", "huggingface").strip().lower()
PROJECT_ROOT = Path(os.getenv("ACESTEP_PROJECT_ROOT", "/opt/ace-step")).resolve()
CHECKPOINT_DIR = Path(
    os.getenv("ACESTEP_CHECKPOINTS_DIR", str(PROJECT_ROOT / "checkpoints"))
).resolve()
HANDLER_PATH = Path("/app/handler.py").resolve()


def _repair_partial_dit_cache() -> dict[str, object]:
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    return repair_incomplete_sharded_checkpoint(
        checkpoints_dir=CHECKPOINT_DIR,
        model_name=MODEL_VARIANT,
        repair_download=lambda: download_submodel(
            MODEL_VARIANT,
            checkpoints_dir=CHECKPOINT_DIR,
            force=True,
            prefer_source=MODEL_SOURCE,
        ),
    )


def main() -> None:
    repair = _repair_partial_dit_cache()
    if repair["repair_performed"]:
        missing_before = repair["missing_before"]
        print("AVANTIQO_AUDIO_DIT_CACHE_REPAIR=PASS", flush=True)
        print(f"AVANTIQO_AUDIO_DIT_CACHE_REPAIRED_SHARDS={len(missing_before)}", flush=True)
    else:
        print("AVANTIQO_AUDIO_DIT_CACHE_INTEGRITY=PASS", flush=True)
    runpy.run_path(str(HANDLER_PATH), run_name="__main__")


if __name__ == "__main__":
    main()

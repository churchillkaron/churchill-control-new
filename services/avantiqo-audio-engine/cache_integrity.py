import json
from pathlib import Path
from typing import Callable

SHARDED_WEIGHT_INDEX_FILENAMES = (
    "model.safetensors.index.json",
    "pytorch_model.bin.index.json",
    "diffusion_pytorch_model.safetensors.index.json",
    "diffusion_pytorch_model.bin.index.json",
)


def _model_directory(checkpoints_dir: Path | str, model_name: str) -> Path:
    root = Path(checkpoints_dir).expanduser().resolve()
    candidate_name = str(model_name or "").strip()
    if not candidate_name or Path(candidate_name).name != candidate_name:
        raise RuntimeError("AVANTIQO_AUDIO_DIT_CACHE_MODEL_NAME_INVALID")
    model_dir = (root / candidate_name).resolve()
    if model_dir.parent != root:
        raise RuntimeError("AVANTIQO_AUDIO_DIT_CACHE_MODEL_PATH_INVALID")
    return model_dir


def missing_sharded_checkpoint_files(
    checkpoints_dir: Path | str,
    model_name: str,
) -> list[str]:
    model_dir = _model_directory(checkpoints_dir, model_name)
    if not model_dir.is_dir():
        return []

    missing: set[str] = set()
    for index_filename in SHARDED_WEIGHT_INDEX_FILENAMES:
        index_path = model_dir / index_filename
        if not index_path.is_file():
            continue
        try:
            payload = json.loads(index_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise RuntimeError(
                f"AVANTIQO_AUDIO_DIT_CACHE_INDEX_INVALID:{index_filename}"
            ) from exc

        weight_map = payload.get("weight_map") if isinstance(payload, dict) else None
        if not isinstance(weight_map, dict) or not weight_map:
            raise RuntimeError(
                f"AVANTIQO_AUDIO_DIT_CACHE_WEIGHT_MAP_INVALID:{index_filename}"
            )

        for shard_value in weight_map.values():
            shard_name = str(shard_value or "").strip()
            shard_relative = Path(shard_name)
            if (
                not shard_name
                or shard_relative.is_absolute()
                or ".." in shard_relative.parts
            ):
                raise RuntimeError(
                    f"AVANTIQO_AUDIO_DIT_CACHE_SHARD_PATH_INVALID:{index_filename}"
                )
            shard_path = (model_dir / shard_relative).resolve()
            try:
                shard_path.relative_to(model_dir)
            except ValueError as exc:
                raise RuntimeError(
                    f"AVANTIQO_AUDIO_DIT_CACHE_SHARD_PATH_INVALID:{index_filename}"
                ) from exc
            if not shard_path.is_file() or shard_path.stat().st_size <= 0:
                missing.add(shard_name)

    return sorted(missing)


def repair_incomplete_sharded_checkpoint(
    *,
    checkpoints_dir: Path | str,
    model_name: str,
    repair_download: Callable[[], tuple[bool, str]],
) -> dict[str, object]:
    missing_before = missing_sharded_checkpoint_files(checkpoints_dir, model_name)
    if not missing_before:
        return {
            "repair_performed": False,
            "missing_before": [],
            "missing_after": [],
        }

    success, status = repair_download()
    if not success:
        detail = str(status or "UNKNOWN").replace("\n", " ")[:1000]
        raise RuntimeError(f"AVANTIQO_AUDIO_DIT_CACHE_REPAIR_FAILED:{detail}")

    missing_after = missing_sharded_checkpoint_files(checkpoints_dir, model_name)
    if missing_after:
        detail = ",".join(missing_after[:16])
        raise RuntimeError(
            f"AVANTIQO_AUDIO_DIT_CACHE_REPAIR_INCOMPLETE:{detail}"
        )

    return {
        "repair_performed": True,
        "missing_before": missing_before,
        "missing_after": [],
    }

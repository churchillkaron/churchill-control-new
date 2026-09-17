import argparse, base64, contextlib, importlib.util, json, os, sys, time, urllib.request
from pathlib import Path
import torch

ENGINE_DIR = Path(r"C:\Avantiqo\voice-tts\engine")
HF_HOME = Path(r"C:\Avantiqo\voice-tts-models")
os.environ.setdefault("HF_HOME", str(HF_HOME))
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("AVANTIQO_VOICE_TTS_DEVICE", "cuda")
os.environ.setdefault("AVANTIQO_VOICE_TTS_FOUNDATION_MODEL", "resemble-ai/chatterbox:multilingual-v3")


def _patch_cangjie_local_file():
    from chatterbox.models.tokenizers import tokenizer as tok
    def _load(self, model_dir=None):
        self.word2cj = {}; self.cj2word = {}
        path = Path(model_dir or "") / "Cangjie5_TC.json"
        if not path.is_file():
            raise RuntimeError(f"AVANTIQO_VOICE_TTS_CANGJIE_FILE_MISSING:{path}")
        data = json.loads(path.read_text(encoding="utf-8"))
        for entry in data:
            word, code = entry.split("\t")[:2]
            self.word2cj[word] = code
            self.cj2word.setdefault(code, []).append(word)
    tok.ChineseCangjieConverter._load_cangjie_mapping = _load


def load_handler():
    _patch_cangjie_local_file()
    spec = importlib.util.spec_from_file_location("avantiqo_voice_tts_handler", ENGINE_DIR / "handler.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    with contextlib.redirect_stdout(sys.stderr):
        spec.loader.exec_module(module)
    return module


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--input", required=True); args = ap.parse_args()
    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    engine = load_handler(); torch.cuda.empty_cache(); torch.cuda.reset_peak_memory_stats(); started = time.perf_counter()
    with contextlib.redirect_stdout(sys.stderr):
        result = engine.handler({"input": payload})
    upload = payload.get("local_storage_upload") or {}
    if upload.get("signed_url"):
        encoded = str(result.get("audio_base64") or "").strip()
        if not encoded:
            raise RuntimeError("AVANTIQO_VOICE_TTS_LOCAL_AUDIO_REQUIRED")
        audio = base64.b64decode(encoded)
        req = urllib.request.Request(upload["signed_url"], data=audio, method="PUT", headers={"Content-Type": "audio/wav", "x-upsert": "true"})
        with urllib.request.urlopen(req, timeout=60) as response:
            if int(getattr(response, "status", 0) or 0) not in (200, 201):
                raise RuntimeError(f"AVANTIQO_VOICE_TTS_LOCAL_UPLOAD_FAILED:{getattr(response, 'status', 0)}")
        result.pop("audio_base64", None)
        result["storage_reference"] = upload.get("storage_reference")
        result["size_bytes"] = len(audio)
        result["audio_persisted_by"] = "AVANTIQO_LOCAL_NODE_V1"
    elif result.get("audio_base64"):
        audio = base64.b64decode(str(result.get("audio_base64") or ""))
        result.pop("audio_base64", None)
        result["direct_probe_audio_bytes"] = len(audio)
    result.update({
        "runtime_model": "resemble-ai/chatterbox:multilingual-v3",
        "execution_resource": "LOCAL_GPU",
        "infrastructure_provider": "AVANTIQO_LOCAL_NODE_V1",
        "gpu_peak_allocated_bytes": int(torch.cuda.max_memory_allocated()),
        "local_elapsed_seconds": round(time.perf_counter() - started, 3),
        "python_version": sys.version.split()[0],
        "local_tts_mode": "LOCAL_GPU_FIRST_MODAL_FALLBACK",
        "raw_reasoning_persisted": False,
    })
    print(json.dumps(result, separators=(",", ":")), flush=True)

if __name__ == "__main__":
    main()

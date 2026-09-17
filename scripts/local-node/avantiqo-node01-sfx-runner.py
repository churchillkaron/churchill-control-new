import argparse, json, time, urllib.request
from pathlib import Path

SERVER = "http://127.0.0.1:8091"
MODEL = "OpenMOSS-Team/MOSS-SoundEffect-v2.0"
PRODUCT_MODEL = "avantiqo-sfx-v1"


def text(value): return str(value or "").strip()
def obj(value): return value if isinstance(value, dict) else {}
def num(value, default):
    try: return float(value)
    except Exception: return default


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--input", required=True); args = ap.parse_args()
    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    instruction = text(payload.get("instruction") or payload.get("prompt"))
    if len(instruction) < 4: raise RuntimeError("AVANTIQO_SFX_LOCAL_INSTRUCTION_REQUIRED")
    spec = obj(payload.get("structured_specification")); generation = obj(spec.get("generation")); params = obj(spec.get("provider_parameters"))
    seconds = max(0.5, min(30.0, num(generation.get("duration_seconds", payload.get("duration_seconds")), 5.0)))
    steps = int(max(20, min(120, num(params.get("num_inference_steps"), 100))))
    cfg_scale = max(1.0, min(8.0, num(params.get("cfg_scale"), 4.0)))
    request_body = json.dumps({"prompt": instruction, "seconds": seconds, "num_inference_steps": steps, "cfg_scale": cfg_scale}).encode("utf-8")
    req = urllib.request.Request(SERVER + "/sfx", data=request_body, method="POST", headers={"Content-Type": "application/json"})
    started = time.perf_counter()
    with urllib.request.urlopen(req, timeout=1800) as response:
        audio = response.read(); status = int(getattr(response, "status", 0) or 0)
    if status not in (200, 201) or len(audio) <= 1024: raise RuntimeError(f"AVANTIQO_SFX_LOCAL_RENDER_FAILED:{status}:{len(audio)}")
    upload = obj(payload.get("local_storage_upload")); signed_url = text(upload.get("signed_url")); storage_reference = text(upload.get("storage_reference"))
    if not signed_url or not storage_reference.startswith("storage://creative-assets/"): raise RuntimeError("AVANTIQO_SFX_LOCAL_UPLOAD_REQUIRED")
    upload_req = urllib.request.Request(signed_url, data=audio, method="PUT", headers={"Content-Type":"audio/wav","x-upsert":"true","cache-control":"max-age=3600"})
    with urllib.request.urlopen(upload_req, timeout=120) as response:
        upload_status = int(getattr(response, "status", 0) or 0)
    if upload_status not in (200, 201): raise RuntimeError(f"AVANTIQO_SFX_LOCAL_UPLOAD_FAILED:{upload_status}")
    result = {"success":True,"status":"completed","provider":"avantiqo-audio","model":PRODUCT_MODEL,"foundation_model":MODEL,"engine_contract":"AVANTIQO_SFX_ENGINE_V1","capability":"ai.sfx.generate","storage_reference":storage_reference,"sample_rate":48000,"duration_seconds":seconds,"output_size_bytes":len(audio),"infrastructure_provider":"AVANTIQO_LOCAL_NODE_V1","execution_resource":"LOCAL_CPU","local_sfx_runtime":"OPENMOSS_GGML_CPU_V1","generation_seconds":round(time.perf_counter()-started,3),"raw_reasoning_persisted":False}
    print(json.dumps(result,separators=(",",":")),flush=True)

if __name__ == "__main__": main()

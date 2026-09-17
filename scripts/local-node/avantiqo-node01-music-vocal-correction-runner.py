import argparse, importlib, json, os, sys, time, types
from pathlib import Path
import torch
ENGINE_DIR=Path(r"C:\Avantiqo\music-gpu\vocal-engine")

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--input',required=True); args=ap.parse_args(); data=json.loads(Path(args.input).read_text(encoding='utf-8'))
    sys.path.insert(0,str(ENGINE_DIR))
    sys.modules['runpod']=types.SimpleNamespace(serverless=types.SimpleNamespace(start=lambda *_a,**_k:None))
    engine=importlib.import_module('handler_v2')
    roles=data.get('source_asset_roles') or {}; assets=data.get('source_assets') or []; uploads=data.get('output_uploads') or {}; spec=data.get('structured_specification') or {}; params=spec.get('provider_parameters') or {}
    source=roles.get('source_audio') or (assets[0] if assets else '')
    payload={'contract':'AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2','capability':'ai.audio.vocal-correct','model':'torchcrepe-full','quality_profile':'TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V2','source_audio':source,'rights_attestation':params.get('rights_attestation'),'output_uploads':uploads,'correction':params.get('correction'),'source_window':params.get('source_window'),'approved_tuning_plan':params.get('approved_tuning_plan'),'approved_timing_plan':params.get('approved_timing_plan')}
    torch.cuda.empty_cache(); torch.cuda.reset_peak_memory_stats(); started=time.perf_counter(); result=engine._handler({'input':payload})
    corrected=str(result.get('corrected_vocal_wav') or ''); report=str(result.get('correction_report_json') or '')
    result.update({'status':'completed','corrected_vocal':{'storage_reference':corrected},'correction_report':{'storage_reference':report},'runtime_model':'torchcrepe-full','execution_resource':'LOCAL_GPU','infrastructure_provider':'AVANTIQO_LOCAL_NODE_V1','gpu_peak_allocated_bytes':int(torch.cuda.max_memory_allocated()),'local_elapsed_seconds':round(time.perf_counter()-started,3),'raw_reasoning_persisted':False})
    print(json.dumps(result,separators=(',',':')))
if __name__=='__main__': main()

import argparse, contextlib, importlib.util, json, os, sys, time
from pathlib import Path
import torch
ENGINE_DIR=Path(r"C:\Avantiqo\music-gpu\separator-engine")
MUSIC_PYTHON=r"C:\Avantiqo\music-gpu\Scripts\python.exe"
STAGE=Path(r"C:\ProgramData\Avantiqo\music-separator-stage.txt")
def mark(v): STAGE.write_text(v,encoding='utf-8')
def load_module(name,path):
    spec=importlib.util.spec_from_file_location(name,path); module=importlib.util.module_from_spec(spec); sys.modules[name]=module; spec.loader.exec_module(module); return module

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--input',required=True); args=ap.parse_args()
    payload=json.loads(Path(args.input).read_text(encoding='utf-8')); mark('payload')
    sys.path.insert(0,str(ENGINE_DIR)); engine=load_module('avantiqo_music_separator_handler',ENGINE_DIR/'handler.py')
    original_run=engine._run
    def pinned_run(command, code):
        args=list(command)
        if 'demucs.separate' in args:
            mark('demucs_start')
            from demucs.separate import main as demucs_main
            with contextlib.redirect_stdout(sys.stderr):
                demucs_main(args[3:])
            mark('demucs_done')
            return None
        if args and str(args[0]).lower()=='python': args[0]=MUSIC_PYTHON
        return original_run(args, code)
    engine._run=pinned_run
    original_download=engine._download_source
    def wrapped_download(*a,**k): mark('download_start'); r=original_download(*a,**k); mark('download_done'); return r
    engine._download_source=wrapped_download
    original_upload=engine._upload
    def wrapped_upload(*a,**k): mark('upload'); return original_upload(*a,**k)
    engine._upload=wrapped_upload
    torch.cuda.empty_cache(); torch.cuda.reset_peak_memory_stats(); started=time.perf_counter(); mark('handler_start')
    result=engine.handler({'input':payload}); mark('handler_done')
    result.update({'status':'completed','runtime_model':'demucs-htdemucs-ft','execution_resource':'LOCAL_GPU','infrastructure_provider':'AVANTIQO_LOCAL_NODE_V1','gpu_peak_allocated_bytes':int(torch.cuda.max_memory_allocated()),'local_elapsed_seconds':round(time.perf_counter()-started,3),'raw_reasoning_persisted':False})
    print(json.dumps(result,separators=(',',':')), flush=True)
    mark('result_flushed')
    os._exit(0)
if __name__=='__main__': main()

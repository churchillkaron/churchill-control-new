import argparse, base64, json, urllib.request
from pathlib import Path
MODEL="qwen2.5vl:3b"; OLLAMA="http://127.0.0.1:11434/api/chat"
def txt(v): return str(v or '').strip()
def urls(payload):
    out=[]
    for key in ('assets','asset_urls','images'):
        v=payload.get(key)
        if isinstance(v,list):
            for x in v:
                if isinstance(x,str): out.append(x)
                elif isinstance(x,dict): out.append(txt(x.get('url') or x.get('signed_url') or x.get('asset_url') or x.get('source_url')))
    for key in ('image_url','asset_url','source_url','url'):
        if txt(payload.get(key)): out.append(txt(payload.get(key)))
    return [x for x in out if x]
def image_b64(value):
    if value.startswith('data:') and ',' in value: return value.split(',',1)[1]
    if value.startswith('http://') or value.startswith('https://'):
        req=urllib.request.Request(value,headers={'User-Agent':'Avantiqo-Node01/1.0'})
        with urllib.request.urlopen(req,timeout=90) as r: return base64.b64encode(r.read()).decode('ascii')
    p=Path(value)
    if p.exists(): return base64.b64encode(p.read_bytes()).decode('ascii')
    raise RuntimeError('AVANTIQO_DOCUMENT_VISION_IMAGE_SOURCE_INVALID')
def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--input',required=True); a=ap.parse_args()
    payload=json.loads(Path(a.input).read_text(encoding='utf-8-sig')); cap=txt(payload.get('requested_capability') or payload.get('capability'))
    src=urls(payload)
    if not src: raise RuntimeError('AVANTIQO_DOCUMENT_VISION_IMAGE_REQUIRED')
    prompt=txt(payload.get('instructions') or payload.get('instructions_text') or payload.get('prompt'))
    if not prompt:
        prompt={'document.ocr':'Extract all visible document text faithfully. Return strict JSON with text, fields and confidence. Preserve numbers and dates exactly.',
                'document.classify':'Classify this document from visible evidence. Return strict JSON with document_type, confidence, candidate_domains and key_fields. Do not guess.',
                'ai.image.analyze':'Analyze the supplied image from visible evidence only. Return strict JSON with observations, extracted_text, fields and confidence.'}.get(cap,'Analyze the image and return strict JSON.')
    images=[image_b64(x) for x in src[:4]]
    body={'model':MODEL,'stream':False,'format':'json','keep_alive':'5m','messages':[{'role':'system','content':'You are Avantiqo local document vision. Use visible evidence only. Never invent unreadable values. Return JSON only.'},{'role':'user','content':prompt,'images':images}], 'options':{'temperature':0,'num_predict':2048,'num_ctx':8192}}
    req=urllib.request.Request(OLLAMA,data=json.dumps(body).encode(),headers={'Content-Type':'application/json'},method='POST')
    with urllib.request.urlopen(req,timeout=300) as r: raw=json.loads(r.read())
    content=txt((raw.get('message') or {}).get('content')); parsed=None
    try: parsed=json.loads(content)
    except Exception: parsed={'text':content}
    print(json.dumps({'success':True,'status':'completed','provider':'avantiqo-image','model':'avantiqo-image-v1','foundation_model':MODEL,'infrastructure_provider':'AVANTIQO_LOCAL_NODE_V1','execution_resource':'LOCAL_GPU_OR_CPU_OFFLOAD','requested_capability':cap,'result':parsed,'text':content,'usage':{'input_tokens':int(raw.get('prompt_eval_count') or 0),'output_tokens':int(raw.get('eval_count') or 0)},'raw_reasoning_persisted':False},separators=(',',':')))
if __name__=='__main__': main()

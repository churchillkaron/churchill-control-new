import argparse, json, os, sys, time
from pathlib import Path


def emit_error(message):
    print(json.dumps({"success": False, "error": str(message)}))
    sys.exit(1)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    args=parser.parse_args()
    payload=json.loads(Path(args.input).read_text(encoding='utf-8'))
    if payload.get('customer_private_content_included') is not False:
        raise RuntimeError('AVANTIQO_LOCAL_TRAINING_PRIVATE_CONTENT_FORBIDDEN')
    if payload.get('raw_reasoning_training_allowed') is not False:
        raise RuntimeError('AVANTIQO_LOCAL_TRAINING_RAW_REASONING_FORBIDDEN')
    train=list(payload.get('train_examples') or [])
    holdout=list(payload.get('holdout_examples') or [])
    if not train or not holdout:
        raise RuntimeError('AVANTIQO_LOCAL_TRAINING_DATASET_REQUIRED')

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

    model_name=str(payload.get('foundation_model') or 'Qwen/Qwen3-4B')
    recipe=payload.get('recipe') or {}
    max_length=max(128,min(int(recipe.get('default_sequence_length') or 512),1024))
    epochs=max(1,min(int(os.environ.get('AVANTIQO_LOCAL_TRAINING_EPOCHS','1')),5))
    lr=float(os.environ.get('AVANTIQO_LOCAL_TRAINING_LR','2e-5'))
    grad_acc=max(1,min(int(os.environ.get('AVANTIQO_LOCAL_TRAINING_GRAD_ACCUM','4')),64))
    if not torch.cuda.is_available():
        raise RuntimeError('AVANTIQO_LOCAL_TRAINING_CUDA_REQUIRED')
    device=torch.device('cuda')
    quant=BitsAndBytesConfig(load_in_4bit=True,bnb_4bit_quant_type='nf4',bnb_4bit_use_double_quant=True,bnb_4bit_compute_dtype=torch.float16)

    output_root=Path(os.environ.get('AVANTIQO_LOCAL_TRAINING_OUTPUT_DIR',r'C:\ProgramData\Avantiqo\training-artifacts'))
    artifact_name=str(payload.get('artifact_name') or f"adapter-{int(time.time())}")
    output_dir=output_root/artifact_name
    output_dir.mkdir(parents=True,exist_ok=True)

    tokenizer=AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token=tokenizer.eos_token
    model=AutoModelForCausalLM.from_pretrained(model_name,quantization_config=quant,device_map={'':0},low_cpu_mem_usage=True,trust_remote_code=True)
    model=prepare_model_for_kbit_training(model,use_gradient_checkpointing=True)
    target_modules=recipe.get('dense_lora_target_modules') or ['q_proj','v_proj']
    config=LoraConfig(r=8,lora_alpha=16,lora_dropout=0.0,bias='none',task_type='CAUSAL_LM',target_modules=target_modules)
    model=get_peft_model(model,config)
    model.train()
    try:
        import bitsandbytes as bnb
        optimizer=bnb.optim.PagedAdamW8bit((p for p in model.parameters() if p.requires_grad),lr=lr)
    except Exception:
        optimizer=torch.optim.AdamW((p for p in model.parameters() if p.requires_grad),lr=lr)

    def render(example):
        user=str(example.get('user_task') or '').strip()
        assistant=str(example.get('assistant_target') or '').strip()
        messages=[{'role':'user','content':user},{'role':'assistant','content':assistant}]
        if hasattr(tokenizer,'apply_chat_template'):
            try:
                return tokenizer.apply_chat_template(messages,tokenize=False,add_generation_prompt=False)
            except Exception:
                pass
        return f"User: {user}\nAssistant: {assistant}"

    def tensor_for(example):
        encoded=tokenizer(render(example),return_tensors='pt',truncation=True,max_length=max_length,padding=False)
        ids=encoded['input_ids'].to(device)
        mask=encoded.get('attention_mask')
        if mask is not None: mask=mask.to(device)
        return ids,mask

    step=0
    total_loss=0.0
    optimizer.zero_grad(set_to_none=True)
    checkpoint_every=max(1,int(payload.get('checkpoint_interval_steps') or 25))
    started=time.time()
    for epoch in range(epochs):
        for example in train:
            ids,mask=tensor_for(example)
            out=model(input_ids=ids,attention_mask=mask,labels=ids)
            loss=out.loss/grad_acc
            loss.backward()
            total_loss+=float(loss.detach().cpu())*grad_acc
            step+=1
            if step % grad_acc == 0:
                optimizer.step(); optimizer.zero_grad(set_to_none=True)
            if step % checkpoint_every == 0:
                cp=output_dir/f'checkpoint-{step}'
                cp.mkdir(parents=True,exist_ok=True)
                model.save_pretrained(cp)
                tokenizer.save_pretrained(cp)
        if step % grad_acc:
            optimizer.step(); optimizer.zero_grad(set_to_none=True)

    model.eval()
    eval_losses=[]
    with torch.no_grad():
        for example in holdout[:50]:
            ids,mask=tensor_for(example)
            out=model(input_ids=ids,attention_mask=mask,labels=ids)
            eval_losses.append(float(out.loss.detach().cpu()))

    model.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)
    manifest={
        'contract':'AVANTIQO_LOCAL_MODEL_TRAINING_ARTIFACT_V1',
        'training_job_id':payload.get('training_job_id'),
        'foundation_model':model_name,
        'adapter_artifact_reference':str(output_dir),
        'train_examples':len(train),
        'holdout_examples':len(holdout),
        'steps':step,
        'epochs':epochs,
        'average_training_loss':(total_loss/max(step,1)),
        'average_holdout_loss':(sum(eval_losses)/max(len(eval_losses),1)),
        'device':str(device),
        'training_mode':'LOCAL_QLORA_4BIT',
        'gpu_name':torch.cuda.get_device_name(0),
        'foundation_weights_mutated':False,
        'production_model_promoted':False,
        'production_model_promotion_effect':'NONE',
        'local_only':True,
        'elapsed_seconds':round(time.time()-started,3),
    }
    (output_dir/'avantiqo-training-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    print(json.dumps({'success':True,**manifest}))


if __name__=='__main__':
    try: main()
    except Exception as exc: emit_error(exc)

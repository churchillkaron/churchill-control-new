#!/usr/bin/env node
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";
loadAvantiqoEnv();
const text=(v)=>String(v??"").trim();
const required=(n)=>{const v=text(process.env[n]);if(!v)throw new Error(`${n}_REQUIRED`);return v;};
const supabase=createClient(required("NEXT_PUBLIC_SUPABASE_URL"),required("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
const org=process.env.AVANTIQO_LOCAL_CERT_ORGANIZATION_ID||"9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const usage=`local-stt-${Date.now()}`;
const fixture=required("AVANTIQO_LOCAL_STT_CERT_PAYLOAD");
const payload={...JSON.parse(fs.readFileSync(fixture,"utf8")),organization_id:org,usage_id:usage};
let r=await supabase.from("avantiqo_local_compute_nodes").select("id,last_seen_at,enabled,capabilities").eq("enabled",true).contains("capabilities",["ai.speech.to.text"]).order("last_seen_at",{ascending:false}).limit(4);
if(r.error)throw r.error;
if(!(r.data||[]).some(n=>Date.now()-new Date(n.last_seen_at||0).getTime()<=90000))throw new Error("AVANTIQO_VOICE_STT_LOCAL_NODE_UNAVAILABLE");
r=await supabase.from("avantiqo_local_compute_jobs").insert({organization_id:org,usage_id:usage,capability:"ai.speech.to.text",lane:"gpu",workload:"voice_stt",model:"openai/whisper-large-v3-turbo",payload,priority:100,max_attempts:2}).select("id").single();
if(r.error)throw r.error;const id=r.data.id;console.log(JSON.stringify({event:"queued",job_id:id}));const deadline=Date.now()+120000;let row=null;
while(Date.now()<deadline){
  await new Promise(r=>setTimeout(r,1000));
  const q=await supabase.from("avantiqo_local_compute_jobs").select("status,result,metrics,error_code,node_id,attempts,model").eq("id",id).single();
  if(q.error)throw q.error;row=q.data;
  if(["COMPLETED","FAILED","CANCELLED"].includes(row.status))break;
}
if(row?.status!=="COMPLETED")throw new Error(`LOCAL_STT_NOT_COMPLETED:${JSON.stringify(row)}`);
const out=row.result||{};
if(out.foundation_model!=="openai/whisper-large-v3-turbo"||out.runtime_model!=="openai/whisper-large-v3-turbo"||out.local_batch_size!==1||out.execution_resource!=="LOCAL_GPU")throw new Error(`LOCAL_STT_RESULT_INVALID:${JSON.stringify(out)}`);
console.log(JSON.stringify({success:true,job_id:id,node_id:row.node_id,attempts:row.attempts,elapsed_ms:row.metrics?.elapsed_ms,foundation_model:out.foundation_model,runtime_model:out.runtime_model,local_batch_size:out.local_batch_size,execution_resource:out.execution_resource,transcript:out.transcript||out.text},null,2));
#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";
loadAvantiqoEnv();
const text=(v)=>String(v??"").trim();
const required=(n)=>{const v=text(process.env[n]);if(!v)throw new Error(`${n}_REQUIRED`);return v;};
function wav(seconds=2,sr=16000){const frames=seconds*sr,b=Buffer.alloc(44+frames*2);b.write("RIFF",0);b.writeUInt32LE(36+frames*2,4);b.write("WAVEfmt ",8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write("data",36);b.writeUInt32LE(frames*2,40);for(let i=0;i<frames;i++){const t=i/sr,v=.2*Math.sin(2*Math.PI*440*t);b.writeInt16LE(Math.round(v*32767),44+i*2);}return b;}
const supabase=createClient(required("NEXT_PUBLIC_SUPABASE_URL"),required("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
const org=process.env.AVANTIQO_LOCAL_CERT_ORGANIZATION_ID||"9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const run=`local-media-derivative-${Date.now()}`,bucket="creative-assets",sourcePath=`${org}/benchmark/local-media/${run}-source.wav`,outputPath=`${org}/benchmark/local-media/${run}-output.wav`;
let r=await supabase.storage.from(bucket).upload(sourcePath,wav(),{contentType:"audio/wav",upsert:false});if(r.error)throw r.error;
r=await supabase.storage.from(bucket).createSignedUrl(sourcePath,3600);if(r.error||!r.data?.signedUrl)throw r.error||new Error("SOURCE_URL_REQUIRED");const sourceUrl=r.data.signedUrl;
r=await supabase.storage.from(bucket).createSignedUploadUrl(outputPath,{upsert:false});if(r.error||!r.data?.signedUrl)throw r.error||new Error("UPLOAD_URL_REQUIRED");const uploadUrl=r.data.signedUrl;
const payload={operation:"media_derivative",source_url:sourceUrl,output_upload:{signed_url:uploadUrl,storage_reference:`storage://${bucket}/${outputPath}`},options:{output_extension:"wav",profile:{id:"audio-pcm-cert",kind:"audio",audio_codec:"pcm_s16le",sample_rate:16000,channels:1}}};
r=await supabase.from("avantiqo_local_compute_jobs").insert({organization_id:org,usage_id:run,capability:"media.ffmpeg.process",lane:"cpu",workload:"media_ffmpeg",model:"ffmpeg-9.0.1",payload,priority:100,max_attempts:2}).select("id").single();if(r.error)throw r.error;const id=r.data.id;
const deadline=Date.now()+120000;let row;while(Date.now()<deadline){await new Promise(x=>setTimeout(x,1000));const q=await supabase.from("avantiqo_local_compute_jobs").select("status,result,metrics,error_code,node_id,attempts").eq("id",id).single();if(q.error)throw q.error;row=q.data;if(["COMPLETED","FAILED","CANCELLED"].includes(row.status))break;}
if(row?.status!=="COMPLETED")throw new Error(`LOCAL_MEDIA_DERIVATIVE_NOT_COMPLETED:${JSON.stringify(row)}`);const out=row.result||{};
if(out.operation!=="media_derivative"||out.infrastructure_provider!=="AVANTIQO_LOCAL_NODE_V1"||out.runtime_model!=="ffmpeg-9.0.1"||Number(out.file_size_bytes)<=44)throw new Error(`LOCAL_MEDIA_DERIVATIVE_RESULT_INVALID:${JSON.stringify(out)}`);
console.log(JSON.stringify({success:true,job_id:id,node_id:row.node_id,attempts:row.attempts,elapsed_ms:row.metrics?.elapsed_ms,model:out.runtime_model,infrastructure:out.infrastructure_provider,output:out.storage_reference,file_size_bytes:out.file_size_bytes},null,2));

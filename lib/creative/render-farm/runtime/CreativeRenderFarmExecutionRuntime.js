import crypto from "node:crypto";
import { CreativeCyclesProductionRenderRuntime } from "@/lib/creative/rendering/runtime/CreativeCyclesProductionRenderRuntime";
import { CreativeRenderFarmRuntime } from "@/lib/creative/render-farm/runtime/CreativeRenderFarmRuntime";

export const AVANTIQO_RENDER_FARM_EXECUTION_CONTRACT="AVANTIQO_RENDER_FARM_EXECUTION_V1";
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function checksumBuffers(outputs=[]){const h=crypto.createHash("sha256");for(const output of outputs){h.update(String(output.path||""));h.update(output.buffer);}return h.digest("hex");}
async function runOne({project,scene,assignment}={}){
  const rendered=await CreativeCyclesProductionRenderRuntime.render({project,scene:{...scene,frame_start:assignment.frame_start,frame_end:assignment.frame_end,frames:Math.max(Number(scene?.frames||assignment.frame_end),assignment.frame_end)}});
  return{chunk_id:assignment.chunk_id,frame_start:assignment.frame_start,frame_end:assignment.frame_end,frame_count:assignment.frame_count,checksum:checksumBuffers(rendered.outputs),bytes:list(rendered.outputs).reduce((s,o)=>s+Number(o.bytes||0),0),engine:rendered.engine,outputs:rendered.outputs.map(o=>({path:o.path,bytes:o.bytes,mime_type:o.mime_type})),provider_calls_performed:false};
}
export async function executeRenderFarm({project,scene,plan,concurrency=1}={}){
  if(plan?.contract!==CreativeRenderFarmRuntime.contract)throw new Error("RENDER_FARM_EXECUTION_PLAN_REQUIRED");
  if(plan.status!=="READY")throw new Error("RENDER_FARM_EXECUTION_PLAN_BLOCKED");
  const ready=plan.assignments.filter(a=>a.status==="READY");const reused=plan.assignments.filter(a=>a.status==="REUSED").map(a=>({...a,provider_calls_performed:false}));const results=[];let cursor=0;const workerCount=Math.max(1,Math.min(8,Math.round(Number(concurrency)||1)));
  async function worker(){while(true){const idx=cursor++;if(idx>=ready.length)return;results[idx]=await runOne({project,scene,assignment:ready[idx]});}}
  await Promise.all(Array.from({length:Math.min(workerCount,Math.max(1,ready.length))},()=>worker()));
  const verification=CreativeRenderFarmRuntime.verify({plan,results:[...reused,...results]});
  return{contract:AVANTIQO_RENDER_FARM_EXECUTION_CONTRACT,plan_hash:plan.plan_hash,results:[...reused,...results],verification,passed:verification.passed,provider_calls_performed:false,whole_job_retry_performed:false};
}
export const CreativeRenderFarmExecutionRuntime=Object.freeze({contract:AVANTIQO_RENDER_FARM_EXECUTION_CONTRACT,execute:executeRenderFarm});

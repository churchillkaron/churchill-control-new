import { CreativeRenderFarmRuntime } from "@/lib/creative/render-farm/runtime/CreativeRenderFarmRuntime";
import { CreativeDistributedRenderWorkerRuntime } from "@/lib/creative/render-farm/runtime/CreativeDistributedRenderWorkerRuntime";

export const AVANTIQO_RENDER_FARM_EXECUTION_CONTRACT="AVANTIQO_RENDER_FARM_EXECUTION_V1";
async function runOne({project,scene,assignment,workers,fetch_impl}={}){
  return CreativeDistributedRenderWorkerRuntime.dispatch({
    project, scene, assignment, workers, fetch_impl,
  });
}
export async function executeRenderFarm({project,scene,plan,workers=[],concurrency=1,fetch_impl=fetch}={}){
  if(plan?.contract!==CreativeRenderFarmRuntime.contract)throw new Error("RENDER_FARM_EXECUTION_PLAN_REQUIRED");
  if(plan.status!=="READY")throw new Error("RENDER_FARM_EXECUTION_PLAN_BLOCKED");
  const ready=plan.assignments.filter(a=>a.status==="READY");const reused=plan.assignments.filter(a=>a.status==="REUSED").map(a=>({...a,provider_calls_performed:false}));const results=[];let cursor=0;const workerCount=Math.max(1,Math.min(8,Math.round(Number(concurrency)||1)));
  async function worker(){while(true){const idx=cursor++;if(idx>=ready.length)return;results[idx]=await runOne({project,scene,assignment:ready[idx],workers,fetch_impl});}}
  await Promise.all(Array.from({length:Math.min(workerCount,Math.max(1,ready.length))},()=>worker()));
  const verification=CreativeRenderFarmRuntime.verify({plan,results:[...reused,...results]});
  return{contract:AVANTIQO_RENDER_FARM_EXECUTION_CONTRACT,plan_hash:plan.plan_hash,results:[...reused,...results],verification,passed:verification.passed,distributed_worker_execution:true,local_render_fallback_used:false,provider_calls_performed:false,whole_job_retry_performed:false};
}
export const CreativeRenderFarmExecutionRuntime=Object.freeze({contract:AVANTIQO_RENDER_FARM_EXECUTION_CONTRACT,execute:executeRenderFarm});

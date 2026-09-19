import fs from 'node:fs/promises';
import { settlePendingService } from '../lib/platform/service-runtime/execution/ServiceExecutionRuntime.js';
const org='9a148429-b6a0-4bc6-ac83-a35c64fb7045';
const dispatched=JSON.parse(await fs.readFile('/tmp/global-pulse-dispatched.json','utf8'));
let state={}; try{state=JSON.parse(await fs.readFile('/tmp/global-pulse-collected.json','utf8'))}catch{}
async function check(item){
 if(state[item.shot]?.terminal) return;
 try{
  const r=await settlePendingService({organization_id:org,provider:'avantiqo-video',provider_job_id:item.job_id,usage_id:item.usage_id,metadata:{creative_project_id:'e47948a1-ab5a-42ce-87d6-492a999bed98',shot_id:item.shot,video_execution_profile:'FAST_DISTILLED_1920'}});
  if(r.pending) state[item.shot]={...item,terminal:false,status:r.provider_status||'pending'};
  else if(r.failed) state[item.shot]={...item,terminal:true,success:false,status:r.provider_status,error:r.error||null};
  else {const out=r.output?.raw?.output||r.output?.output||r.output||{}; state[item.shot]={...item,terminal:true,success:true,status:r.provider_status||'completed',asset_url:out.asset_url||null,storage_reference:out.storage_reference||null,customer_price:r.pricing?.customer_price||null};}
 }catch(e){state[item.shot]={...item,terminal:false,status:'poll_error',last_error:e.message};}
}
for(let round=0;round<80;round++){
 const todo=dispatched.filter(x=>!state[x.shot]?.terminal);
 for(let i=0;i<todo.length;i+=10) await Promise.all(todo.slice(i,i+10).map(check));
 await fs.writeFile('/tmp/global-pulse-collected.json',JSON.stringify(state,null,2));
 const success=Object.values(state).filter(x=>x.terminal&&x.success).length;
 const failed=Object.values(state).filter(x=>x.terminal&&!x.success).length;
 const pending=dispatched.length-success-failed;
 console.log(new Date().toISOString(),`round=${round+1}`,`success=${success}`,`pending=${pending}`,`failed=${failed}`);
 if(pending===0) break;
 await new Promise(r=>setTimeout(r,10000));
}

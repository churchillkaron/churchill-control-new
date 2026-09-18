import { CreativeSandboxRuntime } from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";

export const CREATIVE_TOOL_SNAPSHOT_RUNTIME_CONTRACT="CREATIVE_TOOL_SNAPSHOT_RUNTIME_V1";
const inflight=new Map();
const SNAPSHOT_REVISIONS=Object.freeze({blender:3,opencv:1,remotion:1,"chromium-playwright":1,imagemagick:1});
function text(v){return String(v??"").trim();}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{ };}
async function bootstrap({project,tool_id}){
  const toolId=text(tool_id).toLowerCase();
  if(!project?.id)throw new Error("CREATIVE_TOOL_SNAPSHOT_PROJECT_REQUIRED");
  const current=object(project.metadata?.creative_tool_snapshots?.[toolId]);
  const expectedRevision=SNAPSHOT_REVISIONS[toolId]||1;
  const existing=text(current.snapshot_id);
  if(existing&&Number(current.bootstrap_revision||0)===expectedRevision)return{project,snapshot_id:existing,reused:true,bootstrapped:false};
  const result=await CreativeSandboxRuntime.bootstrapTool({tool_id:toolId,create_snapshot:true,snapshot_expiration_ms:0});
  if(!text(result.snapshot_id))throw new Error(`CREATIVE_TOOL_SNAPSHOT_BOOTSTRAP_FAILED:${toolId}`);
  const latest=await CreativeProjectRepository.getById(project.id)||project;
  const snapshots=object(latest.metadata?.creative_tool_snapshots);
  const updated=await CreativeProjectRepository.update(project.id,{metadata:{...object(latest.metadata),creative_tool_snapshots:{...snapshots,[toolId]:{contract:CREATIVE_TOOL_SNAPSHOT_RUNTIME_CONTRACT,snapshot_id:result.snapshot_id,ready:true,bootstrap_revision:expectedRevision,bootstrapped_at:new Date().toISOString()}}}});
  return{project:updated,snapshot_id:result.snapshot_id,reused:false,bootstrapped:true};
}
export async function ensureCreativeToolSnapshot({project,tool_id}={}){
  const key=`${project?.id||"none"}:${text(tool_id).toLowerCase()}`;
  const toolId=text(tool_id).toLowerCase();
  const current=object(project?.metadata?.creative_tool_snapshots?.[toolId]);
  const expectedRevision=SNAPSHOT_REVISIONS[toolId]||1;
  const existing=text(current.snapshot_id);
  if(existing&&Number(current.bootstrap_revision||0)===expectedRevision)return{project,snapshot_id:existing,reused:true,bootstrapped:false};
  if(!inflight.has(key))inflight.set(key,bootstrap({project,tool_id}).finally(()=>inflight.delete(key)));
  return inflight.get(key);
}
export const CreativeToolSnapshotRuntime=Object.freeze({contract:CREATIVE_TOOL_SNAPSHOT_RUNTIME_CONTRACT,ensure:ensureCreativeToolSnapshot});

import crypto from "node:crypto";
import { CreativeSandboxRuntime } from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";
import { CreativeToolSnapshotRuntime } from "@/lib/creative/tools/runtime/CreativeToolSnapshotRuntime";
import { CreativeModelAssetBindingRuntime } from "@/lib/creative/rendering/runtime/CreativeModelAssetBindingRuntime";

export const AVANTIQO_MATERIAL_BAKE_CONTRACT="AVANTIQO_MATERIAL_BAKE_V1";
const TYPES=new Set(["AO","NORMAL","ROUGHNESS","DIFFUSE","EMIT","POSITION","UV"]);
function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function integer(v,f,min=1,max=16384){const n=Math.round(Number(v));return Math.max(min,Math.min(max,Number.isFinite(n)?n:f));}
function hash(v){return crypto.createHash("sha256").update(v).digest("hex");}
function script({lowPath,lowFormat,highPath,highFormat,bakeTypes,resolution,margin,base}){return `
import bpy,os,json
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=32

def import_model(path,fmt):
    before=set(bpy.data.objects)
    if fmt in ('glb','gltf'): bpy.ops.import_scene.gltf(filepath=path)
    elif fmt=='fbx': bpy.ops.wm.fbx_import(filepath=path)
    elif fmt=='obj': bpy.ops.wm.obj_import(filepath=path)
    else: raise RuntimeError('MATERIAL_BAKE_MODEL_FORMAT_UNSUPPORTED:'+fmt)
    return [o for o in bpy.data.objects if o not in before and o.type=='MESH']

def join_meshes(items,name):
    if not items: raise RuntimeError('MATERIAL_BAKE_MESH_REQUIRED:'+name)
    bpy.ops.object.select_all(action='DESELECT')
    for o in items: o.select_set(True)
    bpy.context.view_layer.objects.active=items[0]
    if len(items)>1: bpy.ops.object.join()
    obj=bpy.context.view_layer.objects.active; obj.name=name
    return obj

low=join_meshes(import_model(${JSON.stringify(lowPath)},${JSON.stringify(lowFormat)}),'BakeLow')
high=None
${highPath ? `high=join_meshes(import_model(${JSON.stringify(highPath)},${JSON.stringify(highFormat)}),'BakeHigh')` : ``}
# Ensure target UVs exist.
bpy.context.view_layer.objects.active=low
bpy.ops.object.select_all(action='DESELECT'); low.select_set(True)
if not low.data.uv_layers:
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(angle_limit=1.15192,island_margin=.02); bpy.ops.object.mode_set(mode='OBJECT')
# Target material/image node.
target=bpy.data.materials.new('Avantiqo Bake Target'); target.use_nodes=True
nodes=target.node_tree.nodes
image_node=nodes.new('ShaderNodeTexImage'); image_node.select=True; nodes.active=image_node
low.data.materials.clear(); low.data.materials.append(target)
scene.render.bake.margin=${margin}
scene.render.bake.use_clear=True
scene.render.bake.max_ray_distance=.1
scene.render.bake.cage_extrusion=.02
outputs=[]
for bake_type in ${JSON.stringify(bakeTypes)}:
    img=bpy.data.images.new('Bake_'+bake_type,width=${resolution},height=${resolution},alpha=False,float_buffer=True)
    image_node.image=img; nodes.active=image_node
    bpy.ops.object.select_all(action='DESELECT')
    selected_to_active=high is not None and bake_type in ('NORMAL','DIFFUSE','ROUGHNESS','EMIT')
    if selected_to_active:
        high.select_set(True); low.select_set(True); bpy.context.view_layer.objects.active=low
    else:
        low.select_set(True); bpy.context.view_layer.objects.active=low
    scene.render.bake.use_selected_to_active=selected_to_active
    scene.cycles.bake_type=bake_type
    if bake_type=='DIFFUSE':
        scene.render.bake.use_pass_direct=False; scene.render.bake.use_pass_indirect=False; scene.render.bake.use_pass_color=True
    bpy.ops.object.bake(type=bake_type)
    out=os.path.join(${JSON.stringify(base)},'bakes',bake_type.lower()+'.exr'); os.makedirs(os.path.dirname(out),exist_ok=True)
    img.filepath_raw=out; img.file_format='OPEN_EXR'; img.save()
    outputs.append({'type':bake_type,'path':out,'width':${resolution},'height':${resolution}})
print(json.dumps({'contract':'${AVANTIQO_MATERIAL_BAKE_CONTRACT}','outputs':outputs,'selected_to_active':high is not None}))
`;}
export async function bakeMaterialMaps({project,organization_id,creative_project_id,low_model_asset_node_id,high_model_asset_node_id=null,bake_types=["NORMAL","AO"],resolution=2048,margin=16}={}){
  if(!project?.id||!organization_id||!creative_project_id||!low_model_asset_node_id)throw new Error("MATERIAL_BAKE_SCOPE_REQUIRED");const types=[...new Set(list(bake_types).map(x=>text(x).toUpperCase()))];for(const type of types)if(!TYPES.has(type))throw new Error(`MATERIAL_BAKE_TYPE_UNSUPPORTED:${type}`);const ensured=await CreativeToolSnapshotRuntime.ensure({project,tool_id:"blender"});const sandbox=await CreativeSandboxRuntime.fromSnapshot({snapshot_id:ensured.snapshot_id,timeout_ms:1800000,network_policy:"deny-all"});let binding=null;try{const objects=[{type:"MODEL_ASSET",object_id:"low",model_asset_node_id:low_model_asset_node_id},...(high_model_asset_node_id?[{type:"MODEL_ASSET",object_id:"high",model_asset_node_id:high_model_asset_node_id}]:[])];binding=await CreativeModelAssetBindingRuntime.bind({organization_id,creative_project_id,objects,sandbox,base_path:"/tmp/avantiqo-material-bake/models"});const low=binding.objects.find(o=>o.object_id==="low");const high=binding.objects.find(o=>o.object_id==="high")||null;const identity=hash(Buffer.from(JSON.stringify({low:low.model_checksum,high:high?.model_checksum||null,types,resolution,margin}))).slice(0,20);const base=`/tmp/avantiqo-material-bake/${identity}`;const scriptPath=`${base}/bake.py`;await CreativeSandboxRuntime.writeText({sandbox,path:scriptPath,content:script({lowPath:low.sandbox_path,lowFormat:low.model_format,highPath:high?.sandbox_path||null,highFormat:high?.model_format||null,bakeTypes:types,resolution:integer(resolution,2048,64,8192),margin:integer(margin,16,0,128),base})});const execution=await CreativeSandboxRuntime.run({sandbox,cmd:"blender",args:["--background","--python",scriptPath],error_prefix:"MATERIAL_BAKE_EXECUTION_FAILED"});const files=await CreativeSandboxRuntime.run({sandbox,cmd:"bash",args:["-lc",`find ${base}/bakes -type f -name '*.exr' -print | sort`],error_prefix:"MATERIAL_BAKE_OUTPUT_DISCOVERY_FAILED"});const paths=text(files.stdout).split("\n").map(x=>x.trim()).filter(Boolean);if(paths.length!==types.length)throw new Error(`MATERIAL_BAKE_OUTPUT_COUNT_MISMATCH:${paths.length}:${types.length}:${text(execution.stderr).slice(-2000)}`);const outputs=[];for(const path of paths){const buffer=await CreativeSandboxRuntime.readBuffer({sandbox,path});outputs.push({type:path.split('/').pop().replace('.exr','').toUpperCase(),path,buffer,bytes:buffer.length,checksum:hash(buffer),mime_type:"image/x-exr"});}return{contract:AVANTIQO_MATERIAL_BAKE_CONTRACT,outputs,bake_types:types,resolution:integer(resolution,2048,64,8192),selected_to_active:Boolean(high),provider_calls_performed:false};}finally{await binding?.cleanup?.().catch?.(()=>{});await CreativeSandboxRuntime.stop(sandbox);}}
export const CreativeMaterialBakeRuntime=Object.freeze({contract:AVANTIQO_MATERIAL_BAKE_CONTRACT,supported_types:Object.freeze([...TYPES]),bake:bakeMaterialMaps});

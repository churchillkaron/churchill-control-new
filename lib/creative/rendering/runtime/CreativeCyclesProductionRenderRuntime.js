import crypto from "node:crypto";
import { CreativeSandboxRuntime } from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";
import { CreativeToolSnapshotRuntime } from "@/lib/creative/tools/runtime/CreativeToolSnapshotRuntime";
import { CreativeMaterialLabRuntime } from "@/lib/creative/materials/runtime/CreativeMaterialLabRuntime";

export const AVANTIQO_CYCLES_PRODUCTION_RENDER_CONTRACT="AVANTIQO_CYCLES_PRODUCTION_RENDER_V1";
function text(v){return String(v??"").trim();}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function finite(v,f=0,min=-Infinity,max=Infinity){const n=Number(v);return Math.max(min,Math.min(max,Number.isFinite(n)?n:f));}
function integer(v,f,min=1,max=10000){return Math.max(min,Math.min(max,Math.round(finite(v,f))));}
function vec(v,f=[0,0,0]){return Array.isArray(v)&&v.length>=3?v.slice(0,3).map((x,i)=>finite(x,f[i])):f;}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}
function normalizeScene(input={}){const i=object(input);const materials=i.material_library?.contract===CreativeMaterialLabRuntime.contract?i.material_library:CreativeMaterialLabRuntime.author({materials:list(i.materials),strict:true});if(materials.status!=="READY")throw new Error(`CYCLES_MATERIAL_LIBRARY_BLOCKED:${materials.blockers.join(",")}`);return{
  width:integer(i.width,1920,64,7680),height:integer(i.height,1080,64,4320),fps:integer(i.fps,24,1,120),frames:integer(i.frames,1,1,3600),samples:integer(i.samples,256,8,8192),transparent:i.transparent!==false,
  camera:{location:vec(i.camera?.location,[0,-6,2]),look_at:vec(i.camera?.look_at,[0,0,.6]),lens:finite(i.camera?.lens,50,8,300),sensor_width_mm:finite(i.camera?.sensor_width_mm,36,1,100)},
  lights:list(i.lights).slice(0,32).map((l,n)=>({name:text(l.name)||`Light ${n+1}`,type:["AREA","POINT","SUN","SPOT"].includes(text(l.type).toUpperCase())?text(l.type).toUpperCase():"AREA",location:vec(l.location,[0,-2,4]),rotation:vec(l.rotation),energy:finite(l.energy,1000,0,1e7),size:finite(l.size,2,.001,1000),color:Array.isArray(l.color)?l.color.slice(0,3):[1,1,1]})),
  objects:list(i.objects).slice(0,400).map((o,n)=>({object_id:text(o.object_id||o.id||`object-${n+1}`),name:text(o.name)||`Object ${n+1}`,type:["CUBE","SPHERE","PLANE","CYLINDER","TORUS"].includes(text(o.type).toUpperCase())?text(o.type).toUpperCase():"CUBE",location:vec(o.location),rotation:vec(o.rotation),scale:vec(o.scale,[1,1,1]),material_id:text(o.material_id),bevel:finite(o.bevel,.01,0,1)})),
  material_library:materials,
  color_management:{working_space:"SCENE_LINEAR",view_transform:"AgX",look:text(i.color_management?.look)||"AgX - Medium High Contrast"},
  aovs:{combined:true,diffuse_direct:true,diffuse_indirect:true,glossy_direct:true,glossy_indirect:true,transmission_direct:true,transmission_indirect:true,emission:true,environment:true,shadow:true,ambient_occlusion:true,normal:true,z_depth:true,motion_vector:true,cryptomatte_object:true,cryptomatte_material:true},
};}
function script(cfg64,base){return `
import base64,json,math,os,bpy
from mathutils import Vector
cfg=json.loads(base64.b64decode("${cfg64}").decode())
base=${JSON.stringify(base)}
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=int(cfg['samples'])
scene.cycles.use_denoising=True
scene.render.resolution_x=int(cfg['width']); scene.render.resolution_y=int(cfg['height']); scene.render.resolution_percentage=100
scene.render.fps=int(cfg['fps']); scene.frame_start=1; scene.frame_end=int(cfg['frames']); scene.render.film_transparent=bool(cfg['transparent'])
scene.render.image_settings.file_format='OPEN_EXR_MULTILAYER'; scene.render.image_settings.color_depth='32'; scene.render.image_settings.exr_codec='ZIP'
scene.render.filepath=os.path.join(base,'beauty.exr')
scene.view_settings.look=cfg['color_management']['look'] if cfg['color_management']['look'] else 'AgX - Medium High Contrast'
vl=scene.view_layers[0]
for attr,val in [('use_pass_z',True),('use_pass_normal',True),('use_pass_vector',True),('use_pass_ambient_occlusion',True),('use_pass_diffuse_direct',True),('use_pass_diffuse_indirect',True),('use_pass_glossy_direct',True),('use_pass_glossy_indirect',True),('use_pass_transmission_direct',True),('use_pass_transmission_indirect',True),('use_pass_emit',True),('use_pass_environment',True),('use_pass_shadow',True)]:
    if hasattr(vl,attr): setattr(vl,attr,val)
if hasattr(vl,'use_pass_cryptomatte_object'): vl.use_pass_cryptomatte_object=True
if hasattr(vl,'use_pass_cryptomatte_material'): vl.use_pass_cryptomatte_material=True
if hasattr(vl,'pass_cryptomatte_depth'): vl.pass_cryptomatte_depth=6

def mat(spec):
    m=bpy.data.materials.new(spec['name']); m.use_nodes=True
    bsdf=m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=spec['base_color']
    bsdf.inputs['Metallic'].default_value=spec['metallic']; bsdf.inputs['Roughness'].default_value=spec['roughness']; bsdf.inputs['IOR'].default_value=spec['ior']
    if 'Transmission Weight' in bsdf.inputs: bsdf.inputs['Transmission Weight'].default_value=spec['transmission']
    elif 'Transmission' in bsdf.inputs: bsdf.inputs['Transmission'].default_value=spec['transmission']
    if 'Coat Weight' in bsdf.inputs: bsdf.inputs['Coat Weight'].default_value=spec['coat_weight']
    if 'Coat Roughness' in bsdf.inputs: bsdf.inputs['Coat Roughness'].default_value=spec['coat_roughness']
    if 'Anisotropic IOR Level' in bsdf.inputs: bsdf.inputs['Anisotropic IOR Level'].default_value=spec['anisotropy']
    elif 'Anisotropic' in bsdf.inputs: bsdf.inputs['Anisotropic'].default_value=spec['anisotropy']
    if 'Subsurface Weight' in bsdf.inputs: bsdf.inputs['Subsurface Weight'].default_value=spec['subsurface_weight']
    if 'Emission Color' in bsdf.inputs: bsdf.inputs['Emission Color'].default_value=spec['emission_color']; bsdf.inputs['Emission Strength'].default_value=spec['emission_strength']
    micro=spec['microstructure']
    tex=m.node_tree.nodes.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value=max(1.0,100.0*max(micro['micro_scratches'],micro['roughness_variation'],0.01)); tex.inputs['Detail'].default_value=4.0
    bump=m.node_tree.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=min(1.0,micro['normal_strength']); bump.inputs['Distance'].default_value=.02
    m.node_tree.links.new(tex.outputs['Fac'],bump.inputs['Height']); m.node_tree.links.new(bump.outputs['Normal'],bsdf.inputs['Normal'])
    if micro['roughness_variation']>0:
        ramp=m.node_tree.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color=(max(0,spec['roughness']-micro['roughness_variation']),)*3+(1,); ramp.color_ramp.elements[1].color=(min(1,spec['roughness']+micro['roughness_variation']),)*3+(1,); m.node_tree.links.new(tex.outputs['Fac'],ramp.inputs['Fac']); m.node_tree.links.new(ramp.outputs['Color'],bsdf.inputs['Roughness'])
    return m
materials={s['material_id']:mat(s) for s in cfg['material_library']['materials']}

def add_obj(o):
    t=o['type']
    if t=='CUBE': bpy.ops.mesh.primitive_cube_add()
    elif t=='SPHERE': bpy.ops.mesh.primitive_uv_sphere_add(segments=128,ring_count=64)
    elif t=='PLANE': bpy.ops.mesh.primitive_plane_add(size=2)
    elif t=='CYLINDER': bpy.ops.mesh.primitive_cylinder_add(vertices=128)
    elif t=='TORUS': bpy.ops.mesh.primitive_torus_add(major_segments=192,minor_segments=48)
    obj=bpy.context.object; obj.name=o['name']; obj.location=o['location']; obj.rotation_euler=[math.radians(x) for x in o['rotation']]; obj.scale=o['scale']
    if o['bevel']>0:
        mod=obj.modifiers.new('Production Bevel','BEVEL'); mod.width=o['bevel']; mod.segments=6
    if o['material_id'] in materials: obj.data.materials.append(materials[o['material_id']])
    return obj
for o in cfg['objects']: add_obj(o)
for l in cfg['lights']:
    d=bpy.data.lights.new(l['name'],l['type']); d.energy=l['energy']; d.color=l['color'];
    if hasattr(d,'size'): d.size=l['size']
    ob=bpy.data.objects.new(l['name'],d); scene.collection.objects.link(ob); ob.location=l['location']; ob.rotation_euler=[math.radians(x) for x in l['rotation']]
camd=bpy.data.cameras.new('Camera'); cam=bpy.data.objects.new('Camera',camd); scene.collection.objects.link(cam); scene.camera=cam; cam.location=cfg['camera']['location']; camd.lens=cfg['camera']['lens']; camd.sensor_width=cfg['camera']['sensor_width_mm']; direction=Vector(cfg['camera']['look_at'])-cam.location; cam.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
world=bpy.data.worlds.new('World'); scene.world=world; world.use_nodes=True; world.node_tree.nodes['Background'].inputs['Strength'].default_value=.25
if cfg['frames']==1:
    bpy.ops.render.render(write_still=True)
else:
    scene.render.filepath=os.path.join(base,'frames','frame_'); os.makedirs(os.path.join(base,'frames'),exist_ok=True); bpy.ops.render.render(animation=True)
print(json.dumps({'contract':'${AVANTIQO_CYCLES_PRODUCTION_RENDER_CONTRACT}','engine':'CYCLES','samples':cfg['samples'],'aovs':cfg['aovs']}))
`;}
export async function renderCyclesProduction({project,scene}={}){if(!project?.id)throw new Error("CYCLES_PROJECT_REQUIRED");const cfg=normalizeScene(scene);const ensured=await CreativeToolSnapshotRuntime.ensure({project,tool_id:"blender"});const id=hash(cfg).slice(0,20);const base=`/tmp/avantiqo-cycles-${id}`;const scriptPath=`${base}/render.py`;const sandbox=await CreativeSandboxRuntime.fromSnapshot({snapshot_id:ensured.snapshot_id,timeout_ms:1800000,network_policy:"deny-all"});try{await CreativeSandboxRuntime.writeText({sandbox,path:scriptPath,content:script(Buffer.from(JSON.stringify(cfg)).toString("base64"),base)});const exec=await CreativeSandboxRuntime.run({sandbox,cmd:"blender",args:["--background","--python",scriptPath],error_prefix:"CYCLES_PRODUCTION_RENDER_FAILED"});const files=await CreativeSandboxRuntime.run({sandbox,cmd:"bash",args:["-lc",`find ${base} -type f -name '*.exr' -print | sort`],error_prefix:"CYCLES_AOV_DISCOVERY_FAILED"});const paths=text(files.stdout).split("\n").map(x=>x.trim()).filter(Boolean);if(!paths.length)throw new Error(`CYCLES_EXR_OUTPUT_REQUIRED:${text(exec.stderr).slice(-4000)}`);const outputs=[];for(const p of paths){const buffer=await CreativeSandboxRuntime.readBuffer({sandbox,path:p});outputs.push({path:p,buffer,bytes:buffer.length,mime_type:"image/x-exr"});}return{contract:AVANTIQO_CYCLES_PRODUCTION_RENDER_CONTRACT,engine:"CYCLES",scene:cfg,aov_contract:"OPENEXR_MULTILAYER",aovs:cfg.aovs,outputs,provider_calls_performed:false,production_render:true,material_library_hash:cfg.material_library.library_hash};}finally{await CreativeSandboxRuntime.stop(sandbox);}}
export const CreativeCyclesProductionRenderRuntime=Object.freeze({contract:AVANTIQO_CYCLES_PRODUCTION_RENDER_CONTRACT,render:renderCyclesProduction});

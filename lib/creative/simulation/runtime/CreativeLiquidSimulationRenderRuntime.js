import crypto from "node:crypto";
import { CreativeSandboxRuntime } from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";

export const CREATIVE_LIQUID_SIMULATION_RENDER_CONTRACT="CREATIVE_LIQUID_SIMULATION_RENDER_V1";
function text(v){return String(v??"").trim();}
function finite(v,f){const n=Number(v);return Number.isFinite(n)?n:f;}
function integer(v,f,min=1,max=10000){return Math.min(max,Math.max(min,Math.round(finite(v,f))));}
function snapshotId(project={}){return text(project?.metadata?.creative_tool_snapshots?.blender?.snapshot_id);}
function digest(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}
function normalize(simulation={},spec={}){
  if(text(simulation.simulation_class).toUpperCase()!=="LIQUID_FLUID") throw new Error("LIQUID_SIMULATION_CLASS_REQUIRED");
  const p=simulation.execution_parameters||{};if(text(p.contract)!=="AVANTIQO_LIQUID_SIMULATION_NUMERIC_PROFILE_V1") throw new Error("LIQUID_SIMULATION_NUMERIC_PROFILE_REQUIRED");
  const fps=integer(spec.frame_rate||spec.fps||p.frame_rate,p.frame_rate||24,12,60);const duration=Math.max(.4,finite(spec.duration_seconds??p.duration_seconds,p.duration_seconds||4));
  return {simulation_id:text(simulation.simulation_id),width:integer(spec.width,1920,320,4096),height:integer(spec.height,1080,180,2160),fps,frames:integer(Math.ceil(duration*fps),96,4,1200),...p};
}
function script(encoded,out){return `
import base64,json,math,os
import bpy
from mathutils import Vector
cfg=json.loads(base64.b64decode("${encoded}").decode("utf-8"))
out=${JSON.stringify(out)}
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=int(cfg['width']);scene.render.resolution_y=int(cfg['height']);scene.render.resolution_percentage=100
scene.render.fps=int(cfg['fps']);scene.frame_start=1;scene.frame_end=int(cfg['frames']);scene.render.film_transparent=True
scene.render.image_settings.file_format='FFMPEG';scene.render.image_settings.color_mode='RGBA';scene.render.ffmpeg.format='QUICKTIME';scene.render.ffmpeg.codec='QTRLE';scene.render.ffmpeg.constant_rate_factor='PERC_LOSSLESS';scene.render.filepath=out;scene.view_settings.look='AgX - Medium High Contrast'
world=bpy.data.worlds.new('World');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Strength'].default_value=0.0
cd=bpy.data.cameras.new('Camera');cam=bpy.data.objects.new('Camera',cd);scene.collection.objects.link(cam);scene.camera=cam;cam.location=(0,-5.0,1.55);cd.lens=58;cam.rotation_euler=(math.radians(76),0,0)
ld=bpy.data.lights.new('LiquidKey','AREA');lo=bpy.data.objects.new('LiquidKey',ld);scene.collection.objects.link(lo);lo.location=(-2,-2,3.2);ld.energy=850;ld.size=2.4
fd=bpy.data.lights.new('LiquidFill','AREA');fo=bpy.data.objects.new('LiquidFill',fd);scene.collection.objects.link(fo);fo.location=(2,-.5,2.0);fd.energy=300;fd.size=2

def effector(obj):
    mod=obj.modifiers.new('Fluid Effector','FLUID');mod.fluid_type='EFFECTOR';bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.context.view_layer.update();es=mod.effector_settings
    if es and hasattr(es,'surface_distance'): es.surface_distance=float(cfg.get('collision_margin',.002))

def basin():
    p=cfg.get('container_position',[0,0,0]);r=float(cfg.get('container_radius',.45));h=float(cfg.get('container_height',.2))
    bpy.ops.mesh.primitive_cube_add(size=2,location=(p[0],p[1],p[2]-h*.45));o=bpy.context.object;o.name='LiquidBasin';o.scale=(r*1.8,r*1.8,h*.55);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);effector(o);o.hide_render=True

def open_cylinder():
    p=cfg.get('container_position',[0,0,0]);r=float(cfg.get('container_radius',.45));h=float(cfg.get('container_height',.9));segments=64;verts=[];faces=[]
    for z in (0.0,h):
        for i in range(segments):
            a=2*math.pi*i/segments;verts.append((p[0]+r*math.cos(a),p[1]+r*math.sin(a),p[2]+z))
    center_bottom=len(verts);verts.append((p[0],p[1],p[2]))
    for i in range(segments):
        j=(i+1)%segments;faces.append((i,j,segments+j,segments+i));faces.append((center_bottom,j,i))
    mesh=bpy.data.meshes.new('OpenCylinderCollisionMesh');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('OpenCylinderCollision',mesh);scene.collection.objects.link(o);effector(o);o.hide_render=True

if str(cfg.get('container_type','BASIN')).upper()=='CYLINDER_OPEN': open_cylinder()
else: basin()

# Liquid emitter
pos=cfg.get('emitter_position',[0,0,1.2]);scale=cfg.get('emitter_scale',[.12,.12,.12])
bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,radius=1,location=pos);em=bpy.context.object;em.name='LiquidEmitter';em.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
flow=em.modifiers.new('Liquid Flow','FLUID');flow.fluid_type='FLOW';bpy.context.view_layer.objects.active=em;em.select_set(True);bpy.context.view_layer.update();fs=flow.flow_settings
if fs is None: raise RuntimeError('LIQUID_FLOW_SETTINGS_UNAVAILABLE')
fs.flow_type='LIQUID';fs.flow_behavior='INFLOW';fs.surface_distance=1.5
start=int(cfg['emission_start_frame']);end=min(int(cfg['emission_end_frame']),int(cfg['frames']))
if hasattr(fs,'use_flow'):
    fs.use_flow=False;fs.keyframe_insert(data_path='use_flow',frame=max(1,start-1));fs.use_flow=True;fs.keyframe_insert(data_path='use_flow',frame=start);fs.use_flow=False;fs.keyframe_insert(data_path='use_flow',frame=end+1)
# Emitter motion provides authored initial flow velocity without hidden solver invention.
v=Vector(cfg.get('initial_velocity',[0,0,-1.2]));dt=1.0/float(cfg['fps']);em.location=Vector(pos);em.keyframe_insert(data_path='location',frame=start);em.location=Vector(pos)+v*dt*max(1,end-start);em.keyframe_insert(data_path='location',frame=end)

# Liquid domain
dscale=cfg.get('domain_scale',[1,1,1.4]);cp=cfg.get('container_position',[0,0,0]);center=(cp[0],cp[1],cp[2]+float(dscale[2])*.72)
bpy.ops.mesh.primitive_cube_add(size=2,location=center);domain=bpy.context.object;domain.name='LiquidDomain';domain.scale=dscale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
mod=domain.modifiers.new('Liquid Domain','FLUID');mod.fluid_type='DOMAIN';bpy.context.view_layer.objects.active=domain;domain.select_set(True);bpy.context.view_layer.update();ds=mod.domain_settings
if ds is None: raise RuntimeError('LIQUID_DOMAIN_SETTINGS_UNAVAILABLE')
ds.domain_type='LIQUID';ds.resolution_max=int(cfg['domain_resolution']);ds.time_scale=float(cfg['time_scale']);ds.cache_frame_start=1;ds.cache_frame_end=int(cfg['frames']);ds.cache_type='MODULAR';ds.cache_data_format='OPENVDB';ds.cache_directory=os.path.join(os.path.dirname(out),'liquid-cache')
if hasattr(ds,'particle_radius'): ds.particle_radius=float(cfg['particle_radius'])
if hasattr(ds,'use_mesh'): ds.use_mesh=True
if hasattr(ds,'mesh_scale'): ds.mesh_scale=int(cfg['mesh_scale'])
if hasattr(ds,'mesh_particle_radius'): ds.mesh_particle_radius=float(cfg['mesh_particle_radius'])
if hasattr(ds,'mesh_smoothen_pos'): ds.mesh_smoothen_pos=int(cfg['smoothing_positive'])
if hasattr(ds,'mesh_smoothen_neg'): ds.mesh_smoothen_neg=int(cfg['smoothing_negative'])
if hasattr(ds,'viscosity_base'): ds.viscosity_base=float(cfg['viscosity_base'])
if hasattr(ds,'viscosity_exponent'): ds.viscosity_exponent=int(cfg['viscosity_exponent'])
if hasattr(ds,'surface_tension'): ds.surface_tension=float(cfg['surface_tension'])
if hasattr(ds,'use_speed_vectors'): ds.use_speed_vectors=True

mat=bpy.data.materials.new('LiquidMaterial');mat.use_nodes=True;bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.72,.88,.98,1);bsdf.inputs['Roughness'].default_value=.06
if 'Transmission Weight' in bsdf.inputs: bsdf.inputs['Transmission Weight'].default_value=1.0
elif 'Transmission' in bsdf.inputs: bsdf.inputs['Transmission'].default_value=1.0
if 'IOR' in bsdf.inputs: bsdf.inputs['IOR'].default_value=1.333
domain.data.materials.append(mat)

scene.frame_set(1);bpy.context.view_layer.objects.active=domain
for o in bpy.context.selected_objects:o.select_set(False)
domain.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(out),'liquid.blend'))
try:bpy.ops.fluid.bake_data()
except Exception as exc:raise RuntimeError('LIQUID_DATA_BAKE_FAILED:'+str(exc))
try:bpy.ops.fluid.bake_mesh()
except Exception as exc:raise RuntimeError('LIQUID_MESH_BAKE_FAILED:'+str(exc))
scene.render.filepath=out;bpy.ops.render.render(animation=True)
print(json.dumps({'contract':'${CREATIVE_LIQUID_SIMULATION_RENDER_CONTRACT}','simulation_id':cfg['simulation_id'],'frames':cfg['frames'],'fps':cfg['fps'],'domain_resolution':cfg['domain_resolution'],'container_type':cfg.get('container_type'),'output_path':out},separators=(',',':')))
`;}
export async function renderLiquidSimulation({project,simulation,output_spec={}}={}){
 const snapshot=snapshotId(project);if(!snapshot)throw new Error("LIQUID_SIMULATION_BLENDER_SNAPSHOT_REQUIRED");const cfg=normalize(simulation,output_spec);const id=digest(cfg).slice(0,20);const base=`/tmp/avantiqo-liquid-simulation-${id}`;const scriptPath=`${base}/simulation.py`;const outputPath=`${base}/liquid-plate.mov`;const encoded=Buffer.from(JSON.stringify(cfg),"utf8").toString("base64");const sandbox=await CreativeSandboxRuntime.fromSnapshot({snapshot_id:snapshot,timeout_ms:1800000,network_policy:"deny-all"});
 try{await CreativeSandboxRuntime.writeText({sandbox,path:scriptPath,content:script(encoded,outputPath)});const execution=await CreativeSandboxRuntime.run({sandbox,cmd:"blender",args:["--background","--python",scriptPath],error_prefix:"CREATIVE_LIQUID_SIMULATION_RENDER_FAILED"});const buffer=await CreativeSandboxRuntime.readBuffer({sandbox,path:outputPath});let metadata=null;try{metadata=execution.stdout.split("\n").map(x=>x.trim()).filter(Boolean).reverse().map(x=>{try{return JSON.parse(x)}catch{return null}}).find(Boolean)||null}catch{}return{contract:CREATIVE_LIQUID_SIMULATION_RENDER_CONTRACT,simulation_id:cfg.simulation_id,mime_type:"video/quicktime",file_extension:"mov",buffer,bytes:buffer.length,configuration:cfg,metadata,transparent_alpha_required:true,deterministic_seed:cfg.seed,provider_calls_performed:false};}finally{await CreativeSandboxRuntime.stop(sandbox)}
}
export const CreativeLiquidSimulationRenderRuntime=Object.freeze({contract:CREATIVE_LIQUID_SIMULATION_RENDER_CONTRACT,render:renderLiquidSimulation,supported_classes:["LIQUID_FLUID"]});

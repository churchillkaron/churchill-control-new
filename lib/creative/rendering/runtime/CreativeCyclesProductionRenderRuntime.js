import crypto from "node:crypto";
import { CreativeSandboxRuntime } from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";
import { CreativeToolSnapshotRuntime } from "@/lib/creative/tools/runtime/CreativeToolSnapshotRuntime";
import { CreativeMaterialLabRuntime } from "@/lib/creative/materials/runtime/CreativeMaterialLabRuntime";
import { CreativeMaterialTextureBindingRuntime } from "@/lib/creative/materials/runtime/CreativeMaterialTextureBindingRuntime";
import { CreativeModelAssetBindingRuntime } from "@/lib/creative/rendering/runtime/CreativeModelAssetBindingRuntime";
import { CreativeMechanicalRigRuntime } from "@/lib/creative/rendering/runtime/CreativeMechanicalRigRuntime";
import { CreativeAutomotiveCinematographyRuntime } from "@/lib/creative/rendering/runtime/CreativeAutomotiveCinematographyRuntime";
import { CreativeEnvironmentAssetBindingRuntime } from "@/lib/creative/rendering/runtime/CreativeEnvironmentAssetBindingRuntime";
import { CreativeCinemaEngineCertificationLedgerRuntime } from "@/lib/creative/certification/runtime/CreativeCinemaEngineCertificationLedgerRuntime";

export const AVANTIQO_CYCLES_PRODUCTION_RENDER_CONTRACT="AVANTIQO_CYCLES_PRODUCTION_RENDER_V1";
function text(v){return String(v??"").trim();}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function finite(v,f=0,min=-Infinity,max=Infinity){const n=Number(v);return Math.max(min,Math.min(max,Number.isFinite(n)?n:f));}
function integer(v,f,min=1,max=10000){return Math.max(min,Math.min(max,Math.round(finite(v,f))));}
function vec(v,f=[0,0,0]){return Array.isArray(v)&&v.length>=3?v.slice(0,3).map((x,i)=>finite(x,f[i])):f;}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}
function normalizeScene(input={}){const i=object(input);const materials=i.material_library?.contract===CreativeMaterialLabRuntime.contract?i.material_library:CreativeMaterialLabRuntime.author({materials:list(i.materials),strict:true});if(materials.status!=="READY")throw new Error(`CYCLES_MATERIAL_LIBRARY_BLOCKED:${materials.blockers.join(",")}`);const automotive=i.automotive_cinematography?CreativeAutomotiveCinematographyRuntime.author(i.automotive_cinematography):null;if(automotive&&automotive.status!=="READY")throw new Error(`CYCLES_AUTOMOTIVE_CINEMATOGRAPHY_BLOCKED:${automotive.blockers.join(",")}`);const cameraInput=automotive?.camera||i.camera||{};const lightInputs=[...list(i.lights),...list(automotive?.lights)];return{
  width:integer(i.width,1920,64,7680),height:integer(i.height,1080,64,4320),fps:integer(i.fps,24,1,120),frames:integer(i.frames,1,1,3600),frame_start:integer(i.frame_start,1,1,3600),frame_end:integer(i.frame_end,i.frames||1,1,3600),samples:integer(i.samples,256,8,8192),transparent:i.transparent!==false,
  camera:{location:vec(cameraInput.location,[0,-6,2]),look_at:vec(cameraInput.look_at,[0,0,.6]),lens:finite(cameraInput.lens,50,8,300),sensor_width_mm:finite(cameraInput.sensor_width_mm,36,1,100),focus_distance_m:finite(cameraInput.focus_distance_m,6,.05,10000),t_stop:finite(cameraInput.t_stop,4,.7,64)},
  lights:lightInputs.slice(0,32).map((l,n)=>({name:text(l.name)||`Light ${n+1}`,type:["AREA","POINT","SUN","SPOT"].includes(text(l.type).toUpperCase())?text(l.type).toUpperCase():"AREA",location:vec(l.location,[0,-2,4]),rotation:vec(l.rotation),energy:finite(l.energy,1000,0,1e7),size:finite(l.size,2,.001,1000),color:Array.isArray(l.color)?l.color.slice(0,3):[1,1,1]})),
  objects:list(i.objects).slice(0,400).map((o,n)=>({object_id:text(o.object_id||o.id||`object-${n+1}`),name:text(o.name)||`Object ${n+1}`,type:["CUBE","SPHERE","PLANE","CYLINDER","TORUS","MODEL_ASSET"].includes(text(o.type).toUpperCase())?text(o.type).toUpperCase():"CUBE",location:vec(o.location),rotation:vec(o.rotation),scale:vec(o.scale,[1,1,1]),material_id:text(o.material_id),bevel:finite(o.bevel,.01,0,1),model_asset_node_id:text(o.model_asset_node_id),preserve_source_materials:o.preserve_source_materials!==false,animation_keyframes:list(o.animation_keyframes).map(k=>({frame:integer(k.frame,1,1,3600),location:k.location?vec(k.location):null,rotation:k.rotation?vec(k.rotation):null,scale:k.scale?vec(k.scale,[1,1,1]):null}))})),
  material_library:materials,
  automotive_cinematography:automotive,
  camera_keyframes:list(i.camera_keyframes).map(k=>({frame:integer(k.frame,1,1,3600),location:k.location?vec(k.location):null,rotation:k.rotation?vec(k.rotation):null,lens:k.lens==null?null:finite(k.lens,50,8,300)})),
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
selected_device='CPU'
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences
    for backend in ('OPTIX','CUDA','HIP','ONEAPI','METAL'):
        try:
            prefs.compute_device_type=backend
            prefs.get_devices()
            gpu_devices=[d for d in prefs.devices if getattr(d,'type','CPU')!='CPU']
            if gpu_devices:
                for d in prefs.devices: d.use=(d in gpu_devices)
                scene.cycles.device='GPU'; selected_device=backend; break
        except Exception:
            continue
except Exception:
    selected_device='CPU'
scene.render.resolution_x=int(cfg['width']); scene.render.resolution_y=int(cfg['height']); scene.render.resolution_percentage=100
scene.render.fps=int(cfg['fps']); scene.frame_start=int(cfg['frame_start']); scene.frame_end=int(cfg['frame_end']); scene.render.film_transparent=bool(cfg['transparent'])
scene.render.image_settings.file_format='OPEN_EXR'; scene.render.image_settings.color_depth='32'; scene.render.image_settings.exr_codec='ZIP'; scene.render.image_settings.color_mode='RGBA'
beauty_dir=os.path.join(base,'beauty'); os.makedirs(beauty_dir,exist_ok=True); scene.render.filepath=os.path.join(beauty_dir,'beauty_')
scene.view_settings.look=cfg['color_management']['look'] if cfg['color_management']['look'] else 'AgX - Medium High Contrast'
vl=scene.view_layers[0]
for attr,val in [('use_pass_z',True),('use_pass_normal',True),('use_pass_vector',True),('use_pass_ambient_occlusion',True),('use_pass_diffuse_direct',True),('use_pass_diffuse_indirect',True),('use_pass_glossy_direct',True),('use_pass_glossy_indirect',True),('use_pass_transmission_direct',True),('use_pass_transmission_indirect',True),('use_pass_emit',True),('use_pass_environment',True),('use_pass_shadow',True)]:
    if hasattr(vl,attr): setattr(vl,attr,val)
if hasattr(vl,'use_pass_cryptomatte_object'): vl.use_pass_cryptomatte_object=True
if hasattr(vl,'use_pass_cryptomatte_material'): vl.use_pass_cryptomatte_material=True
if hasattr(vl,'pass_cryptomatte_depth'): vl.pass_cryptomatte_depth=6
# Blender 5 removed Scene.node_tree. Use a compositor node-group when available.
nt=None
if hasattr(bpy.data,'node_groups'):
    try:
        nt=bpy.data.node_groups.new('AvantiqoCompositor','CompositorNodeTree')
        if hasattr(scene,'compositing_node_group'):
            scene.compositing_node_group=nt
    except Exception:
        nt=None
if nt is not None:
    rl=nt.nodes.new('CompositorNodeRLayers')
    out=nt.nodes.new('CompositorNodeOutputFile')
    out.directory=os.path.join(base,'aovs'); os.makedirs(out.directory,exist_ok=True)
    out.file_name='aov_'
    out.format.file_format='OPEN_EXR_MULTILAYER'; out.format.color_depth='32'; out.format.exr_codec='ZIP'
    out.file_output_items.clear()
    pass_specs=[('Combined','Image','RGBA'),('Depth','Depth','FLOAT'),('Normal','Normal','VECTOR'),('Vector','Vector','VECTOR'),('AO','AO','FLOAT'),('DiffuseDirect','DiffDir','RGBA'),('DiffuseIndirect','DiffInd','RGBA'),('GlossyDirect','GlossDir','RGBA'),('GlossyIndirect','GlossInd','RGBA'),('TransmissionDirect','TransDir','RGBA'),('TransmissionIndirect','TransInd','RGBA'),('Emission','Emit','RGBA'),('Environment','Env','RGBA'),('Shadow','Shadow','FLOAT')]
    for slot_name,pass_name,socket_type in pass_specs:
        if pass_name not in rl.outputs:
            continue
        out.file_output_items.new(socket_type,slot_name)
        nt.links.new(rl.outputs[pass_name],out.inputs[slot_name])

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
    for tmap in spec.get('texture_maps', []):
        p=tmap.get('sandbox_path')
        if not p or not os.path.exists(p):
            continue
        image=bpy.data.images.load(p,check_existing=True)
        channel=tmap.get('channel','').upper()
        try:
            image.colorspace_settings.name='sRGB' if channel in ('BASE_COLOR','ALBEDO','EMISSION') else 'Non-Color'
        except Exception:
            pass
        img=m.node_tree.nodes.new('ShaderNodeTexImage'); img.image=image; img.label=channel
        texcoord=m.node_tree.nodes.new('ShaderNodeTexCoord'); mapping=m.node_tree.nodes.new('ShaderNodeMapping')
        scale=float(tmap.get('scale',1) or 1); mapping.inputs['Scale'].default_value=(scale,scale,scale)
        mapping.inputs['Rotation'].default_value[2]=math.radians(float(tmap.get('rotation_degrees',0) or 0))
        off=tmap.get('offset') or [0,0]; mapping.inputs['Location'].default_value[0]=float(off[0] if len(off)>0 else 0); mapping.inputs['Location'].default_value[1]=float(off[1] if len(off)>1 else 0)
        m.node_tree.links.new(texcoord.outputs['UV'],mapping.inputs['Vector']); m.node_tree.links.new(mapping.outputs['Vector'],img.inputs['Vector'])
        strength=float(tmap.get('strength',1) or 1)
        if channel in ('BASE_COLOR','ALBEDO'):
            m.node_tree.links.new(img.outputs['Color'],bsdf.inputs['Base Color'])
        elif channel=='ROUGHNESS':
            m.node_tree.links.new(img.outputs['Color'],bsdf.inputs['Roughness'])
        elif channel=='METALLIC':
            m.node_tree.links.new(img.outputs['Color'],bsdf.inputs['Metallic'])
        elif channel=='NORMAL':
            normal=m.node_tree.nodes.new('ShaderNodeNormalMap'); normal.inputs['Strength'].default_value=strength; m.node_tree.links.new(img.outputs['Color'],normal.inputs['Color']); m.node_tree.links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
        elif channel in ('HEIGHT','DISPLACEMENT'):
            bumpmap=m.node_tree.nodes.new('ShaderNodeBump'); bumpmap.inputs['Strength'].default_value=min(10.0,strength); bumpmap.inputs['Distance'].default_value=max(.0001,spec.get('microstructure',{}).get('displacement_mm',1)/1000.0); m.node_tree.links.new(img.outputs['Color'],bumpmap.inputs['Height']); m.node_tree.links.new(bumpmap.outputs['Normal'],bsdf.inputs['Normal'])
        elif channel=='EMISSION' and 'Emission Color' in bsdf.inputs:
            m.node_tree.links.new(img.outputs['Color'],bsdf.inputs['Emission Color']); bsdf.inputs['Emission Strength'].default_value=max(bsdf.inputs['Emission Strength'].default_value,strength)
        elif channel=='ALPHA':
            m.node_tree.links.new(img.outputs['Color'],bsdf.inputs['Alpha'])
    return m
materials={s['material_id']:mat(s) for s in cfg['material_library']['materials']}

def apply_animation(obj,o):
    for k in o.get('animation_keyframes',[]):
        scene.frame_set(int(k['frame']))
        if k.get('location') is not None:
            obj.location=k['location']; obj.keyframe_insert(data_path='location')
        if k.get('rotation') is not None:
            obj.rotation_euler=[math.radians(x) for x in k['rotation']]; obj.keyframe_insert(data_path='rotation_euler')
        if k.get('scale') is not None:
            obj.scale=k['scale']; obj.keyframe_insert(data_path='scale')
    scene.frame_set(int(cfg['frame_start']))

def add_obj(o):
    t=o['type']
    created=[]
    if t=='MODEL_ASSET':
        p=o.get('sandbox_path'); fmt=o.get('model_format','').lower()
        if not p or not os.path.exists(p): raise RuntimeError('MODEL_ASSET_PATH_REQUIRED:'+str(o.get('name')))
        before=set(bpy.data.objects)
        if fmt in ('glb','gltf'): bpy.ops.import_scene.gltf(filepath=p)
        elif fmt=='fbx': bpy.ops.wm.fbx_import(filepath=p)
        elif fmt=='obj': bpy.ops.wm.obj_import(filepath=p)
        elif fmt in ('usd','usda','usdc'): bpy.ops.wm.usd_import(filepath=p)
        elif fmt=='abc': bpy.ops.wm.alembic_import(filepath=p)
        else: raise RuntimeError('MODEL_ASSET_FORMAT_UNSUPPORTED:'+fmt)
        created=[x for x in bpy.data.objects if x not in before]
        root=bpy.data.objects.new(o['name']+' Root',None); scene.collection.objects.link(root)
        root.location=o['location']; root.rotation_euler=[math.radians(x) for x in o['rotation']]; root.scale=o['scale']
        for obj in created:
            if obj.parent is None: obj.parent=root
            if o.get('material_id') in materials and not o.get('preserve_source_materials',True) and getattr(obj,'data',None) is not None and hasattr(obj.data,'materials'):
                obj.data.materials.clear(); obj.data.materials.append(materials[o['material_id']])
        apply_animation(root,o)
        return root
    if t=='CUBE': bpy.ops.mesh.primitive_cube_add()
    elif t=='SPHERE': bpy.ops.mesh.primitive_uv_sphere_add(segments=128,ring_count=64)
    elif t=='PLANE': bpy.ops.mesh.primitive_plane_add(size=2)
    elif t=='CYLINDER': bpy.ops.mesh.primitive_cylinder_add(vertices=128)
    elif t=='TORUS': bpy.ops.mesh.primitive_torus_add(major_segments=192,minor_segments=48)
    obj=bpy.context.object; obj.name=o['name']; obj.location=o['location']; obj.rotation_euler=[math.radians(x) for x in o['rotation']]; obj.scale=o['scale']
    if o['bevel']>0:
        mod=obj.modifiers.new('Production Bevel','BEVEL'); mod.width=o['bevel']; mod.segments=6
    if o['material_id'] in materials: obj.data.materials.append(materials[o['material_id']])
    apply_animation(obj,o)
    return obj

for o in cfg['objects']: add_obj(o)
for l in cfg['lights']:
    d=bpy.data.lights.new(l['name'],l['type']); d.energy=l['energy']; d.color=l['color'];
    if hasattr(d,'size'): d.size=l['size']
    ob=bpy.data.objects.new(l['name'],d); scene.collection.objects.link(ob); ob.location=l['location']; ob.rotation_euler=[math.radians(x) for x in l['rotation']]
camd=bpy.data.cameras.new('Camera'); cam=bpy.data.objects.new('Camera',camd); scene.collection.objects.link(cam); scene.camera=cam; cam.location=cfg['camera']['location']; camd.lens=cfg['camera']['lens']; camd.sensor_width=cfg['camera']['sensor_width_mm']; camd.dof.use_dof=True; camd.dof.focus_distance=float(cfg['camera'].get('focus_distance_m',6)); camd.dof.aperture_fstop=float(cfg['camera'].get('t_stop',4)); direction=Vector(cfg['camera']['look_at'])-cam.location; cam.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
if cfg.get('automotive_cinematography'):
    if hasattr(scene.render,'use_motion_blur'): scene.render.use_motion_blur=True
    if hasattr(scene.render,'motion_blur_shutter'): scene.render.motion_blur_shutter=float(cfg['automotive_cinematography'].get('shutter_angle_degrees',180))/360.0
for k in cfg.get('camera_keyframes',[]):
    scene.frame_set(int(k['frame']))
    if k.get('location') is not None: cam.location=k['location']; cam.keyframe_insert(data_path='location')
    if k.get('rotation') is not None: cam.rotation_euler=[math.radians(x) for x in k['rotation']]; cam.keyframe_insert(data_path='rotation_euler')
    if k.get('lens') is not None: camd.lens=float(k['lens']); camd.keyframe_insert(data_path='lens')
scene.frame_set(int(cfg['frame_start']))
world=bpy.data.worlds.new('World'); scene.world=world; world.use_nodes=True; bg=world.node_tree.nodes['Background']; bg.inputs['Strength'].default_value=.25
auto=cfg.get('automotive_cinematography') or {}
env_path=auto.get('environment_sandbox_path')
if env_path and os.path.exists(env_path):
    nt=world.node_tree
    env=nt.nodes.new('ShaderNodeTexEnvironment'); env.image=bpy.data.images.load(env_path,check_existing=True)
    tex=nt.nodes.new('ShaderNodeTexCoord'); mapping=nt.nodes.new('ShaderNodeMapping')
    mapping.inputs['Rotation'].default_value[2]=math.radians(float(auto.get('environment_rotation_degrees',0) or 0))
    nt.links.new(tex.outputs['Generated'],mapping.inputs['Vector']); nt.links.new(mapping.outputs['Vector'],env.inputs['Vector']); nt.links.new(env.outputs['Color'],bg.inputs['Color'])
bpy.ops.render.render(animation=True)
print(json.dumps({'contract':'${AVANTIQO_CYCLES_PRODUCTION_RENDER_CONTRACT}','engine':'CYCLES','samples':cfg['samples'],'aovs':cfg['aovs'],'cycles_device':selected_device}))
`;}
export async function renderCyclesProduction({project,scene}={}){
  if(!project?.id)throw new Error("CYCLES_PROJECT_REQUIRED");
  const baseCfg=normalizeScene(scene);
  const rigged=CreativeMechanicalRigRuntime.compile({objects:baseCfg.objects,rigs:[...list(scene?.rigs),...list(baseCfg.automotive_cinematography?.rigs)]});
  const cfg={...baseCfg,objects:rigged.objects,camera_keyframes:rigged.camera_keyframes,rig_contract:rigged.contract,rig_hash:rigged.rig_hash};
  const ensured=await CreativeToolSnapshotRuntime.ensure({project,tool_id:"blender"});
  const id=hash(cfg).slice(0,20);
  const base=`/tmp/avantiqo-cycles-${id}`;
  const scriptPath=`${base}/render.py`;
  const sandbox=await CreativeSandboxRuntime.fromSnapshot({snapshot_id:ensured.snapshot_id,timeout_ms:1800000,network_policy:"deny-all"});
  let textureBinding=null;
  let modelBinding=null;
  let environmentBinding=null;
  try{
    modelBinding=await CreativeModelAssetBindingRuntime.bind({
      organization_id:project.organization_id,
      creative_project_id:project.id,
      objects:cfg.objects,
      sandbox,
      base_path:`${base}/models`,
    });
    textureBinding=await CreativeMaterialTextureBindingRuntime.bind({
      organization_id:project.organization_id,
      creative_project_id:project.id,
      library:cfg.material_library,
      sandbox,
      base_path:`${base}/textures`,
    });
    if(cfg.automotive_cinematography?.environment_asset_node_id){
      environmentBinding=await CreativeEnvironmentAssetBindingRuntime.bind({
        organization_id:project.organization_id,
        creative_project_id:project.id,
        asset_node_id:cfg.automotive_cinematography.environment_asset_node_id,
        sandbox,
        base_path:`${base}/environment`,
      });
    }
    const renderCfg={...cfg,objects:modelBinding.objects,material_library:textureBinding.library,automotive_cinematography:cfg.automotive_cinematography?{...cfg.automotive_cinematography,environment_sandbox_path:environmentBinding?.sandbox_path||null,environment_checksum:environmentBinding?.checksum||null}:null};
    await CreativeSandboxRuntime.writeText({sandbox,path:scriptPath,content:script(Buffer.from(JSON.stringify(renderCfg)).toString("base64"),base)});
    const exec=await CreativeSandboxRuntime.run({sandbox,cmd:"blender",args:["--background","--python",scriptPath],error_prefix:"CYCLES_PRODUCTION_RENDER_FAILED"});
    const files=await CreativeSandboxRuntime.run({sandbox,cmd:"bash",args:["-lc",`find ${base} -type f -name '*.exr' -print | sort`],error_prefix:"CYCLES_AOV_DISCOVERY_FAILED"});
    const paths=text(files.stdout).split("\n").map(x=>x.trim()).filter(Boolean);
    if(!paths.length)throw new Error(`CYCLES_EXR_OUTPUT_REQUIRED:${text(exec.stderr).slice(-4000)}`);
    const outputs=[];for(const p of paths){const buffer=await CreativeSandboxRuntime.readBuffer({sandbox,path:p});outputs.push({path:p,buffer,bytes:buffer.length,mime_type:"image/x-exr"});}
    const proofChecksum=crypto.createHash("sha256").update(Buffer.concat(outputs.map((item)=>crypto.createHash("sha256").update(item.buffer).digest()))).digest("hex");
    await CreativeCinemaEngineCertificationLedgerRuntime.record({organization_id:project.organization_id,creative_project_id:project.id,evidence:{engine_id:"CYCLES_AOV_RENDER",implementation_contracts:[AVANTIQO_CYCLES_PRODUCTION_RENDER_CONTRACT],technical_proof_passed:true,technical_proof_id:`cycles-aov:${id}`,visual_proof_passed:false,proof_checksum:proofChecksum,provider_calls_performed:false,notes:"Real Cycles EXR/AOV render completed. Visual certification remains pending durable reviewed render evidence."}});
    return{contract:AVANTIQO_CYCLES_PRODUCTION_RENDER_CONTRACT,engine:"CYCLES",scene:renderCfg,aov_contract:"OPENEXR_AOV_BUNDLE",aovs:renderCfg.aovs,outputs,provider_calls_performed:false,production_render:true,material_library_hash:cfg.material_library.library_hash,texture_binding_contract:textureBinding.contract,texture_binding_count:textureBinding.binding_count,model_binding_contract:modelBinding.contract,model_binding_count:modelBinding.binding_count};
  }finally{
    await environmentBinding?.cleanup?.().catch?.(()=>{});
    await textureBinding?.cleanup?.().catch?.(()=>{});
    await modelBinding?.cleanup?.().catch?.(()=>{});
    await CreativeSandboxRuntime.stop(sandbox);
  }
}

export const CreativeCyclesProductionRenderRuntime=Object.freeze({contract:AVANTIQO_CYCLES_PRODUCTION_RENDER_CONTRACT,render:renderCyclesProduction});

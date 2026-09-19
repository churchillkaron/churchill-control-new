import crypto from "node:crypto";
import { CreativeSandboxRuntime } from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";
import { CreativeToolSnapshotRuntime } from "@/lib/creative/tools/runtime/CreativeToolSnapshotRuntime";
import { CreativeMaterialLabRuntime } from "@/lib/creative/materials/runtime/CreativeMaterialLabRuntime";
import { CreativeMaterialTextureBindingRuntime } from "@/lib/creative/materials/runtime/CreativeMaterialTextureBindingRuntime";
import { CreativeMaterialInterchangeBindingRuntime } from "@/lib/creative/materials/runtime/CreativeMaterialInterchangeBindingRuntime";
import { CreativeModelAssetBindingRuntime } from "@/lib/creative/rendering/runtime/CreativeModelAssetBindingRuntime";
import { CreativeMechanicalRigRuntime } from "@/lib/creative/rendering/runtime/CreativeMechanicalRigRuntime";
import { CreativeAutomotiveCinematographyRuntime } from "@/lib/creative/rendering/runtime/CreativeAutomotiveCinematographyRuntime";
import { CreativeEnvironmentAssetBindingRuntime } from "@/lib/creative/rendering/runtime/CreativeEnvironmentAssetBindingRuntime";
import { CreativeUsdSceneCompositionRuntime } from "@/lib/creative/rendering/runtime/CreativeUsdSceneCompositionRuntime";
import { CreativeOpenVdbUsdVolumeRuntime } from "@/lib/creative/rendering/runtime/CreativeOpenVdbUsdVolumeRuntime";
import { CreativeMultiCameraStereoVirtualProductionRuntime } from "@/lib/creative/rendering/runtime/CreativeMultiCameraStereoVirtualProductionRuntime";
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
  usd_scene_composition:object(i.usd_scene_composition),
  volumes:list(i.volumes).slice(0,32).map((v,n)=>({
    id:text(v.id||`volume-${n+1}`),
    name:text(v.name)||`Volume ${n+1}`,
    asset_node_id:text(v.asset_node_id),
    fields:list(v.fields).map(text),
    location:vec(v.location),
    rotation:vec(v.rotation),
    scale:vec(v.scale,[1,1,1]),
    density_scale:finite(v.density_scale,1,0,1000),
    temperature_scale:finite(v.temperature_scale,1,0,1000),
    blackbody_intensity:finite(v.blackbody_intensity,0,0,1000),
  })),
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
    graph=spec.get('material_graph') or {}
    if graph.get('contract')=='AVANTIQO_MATERIALX_GRAPH_TRANSLATION_V1':
        resources={r.get('node'):r for r in graph.get('resources',[])}
        graph_nodes={}
        def first_output(node):
            for key in ('Color','Value','Normal','UV','Vector','Result'):
                if key in node.outputs: return node.outputs[key]
            return node.outputs[0] if len(node.outputs) else None
        def connect_dep(source_name,target,target_index=0):
            source=graph_nodes.get(source_name)
            if not source: raise RuntimeError('MATERIALX_GRAPH_SOURCE_NODE_REQUIRED:'+str(source_name))
            output=first_output(source)
            if output is None: raise RuntimeError('MATERIALX_GRAPH_SOURCE_OUTPUT_REQUIRED:'+str(source_name))
            inputs=[i for i in target.inputs if i.name!='Fac']
            if target_index>=len(inputs): raise RuntimeError('MATERIALX_GRAPH_TARGET_INPUT_REQUIRED:'+str(target.name))
            m.node_tree.links.new(output,inputs[target_index])
        for node_name in graph.get('execution_order',[]):
            spec_node=next((n for n in graph.get('nodes',[]) if n.get('name')==node_name),None)
            if not spec_node: raise RuntimeError('MATERIALX_GRAPH_NODE_SPEC_REQUIRED:'+str(node_name))
            cat=spec_node.get('category'); typ=(spec_node.get('type') or '').lower()
            if cat=='constant':
                if typ.startswith('color'):
                    n=m.node_tree.nodes.new('ShaderNodeRGB')
                    raw=spec_node.get('value') or '0,0,0'; vals=[float(x) for x in raw.replace(' ',',').split(',') if x!=''][:3]
                    while len(vals)<3: vals.append(0.0)
                    n.outputs['Color'].default_value=(*vals,1.0)
                else:
                    n=m.node_tree.nodes.new('ShaderNodeValue'); n.outputs['Value'].default_value=float(spec_node.get('value') or 0)
            elif cat in ('image','tiledimage'):
                res=resources.get(node_name) or {}
                p=res.get('sandbox_path')
                if not p or not os.path.exists(p): raise RuntimeError('MATERIALX_GRAPH_RESOURCE_PATH_REQUIRED:'+str(node_name))
                n=m.node_tree.nodes.new('ShaderNodeTexImage'); n.image=bpy.data.images.load(p,check_existing=True)
                try: n.image.colorspace_settings.name='sRGB' if str(res.get('color_space') or '').upper() in ('SRGB','S_RGB') else 'Non-Color'
                except Exception: pass
            elif cat=='texcoord':
                n=m.node_tree.nodes.new('ShaderNodeTexCoord')
            elif cat=='normalmap':
                n=m.node_tree.nodes.new('ShaderNodeNormalMap')
            elif cat in ('multiply','add'):
                if typ.startswith('color'):
                    n=m.node_tree.nodes.new('ShaderNodeMixRGB'); n.blend_type='MULTIPLY' if cat=='multiply' else 'ADD'; n.inputs['Fac'].default_value=1.0
                else:
                    n=m.node_tree.nodes.new('ShaderNodeMath'); n.operation='MULTIPLY' if cat=='multiply' else 'ADD'
            elif cat=='mix':
                n=m.node_tree.nodes.new('ShaderNodeMixRGB')
            elif cat=='clamp':
                n=m.node_tree.nodes.new('ShaderNodeClamp')
            elif cat=='convert':
                n=m.node_tree.nodes.new('NodeReroute')
            else:
                raise RuntimeError('MATERIALX_GRAPH_NODE_UNSUPPORTED:'+str(cat))
            n.name='MX_'+node_name; n.label=node_name; graph_nodes[node_name]=n
            deps=[i.get('nodename') for i in spec_node.get('inputs',[]) if i.get('nodename')]
            for dep_index,dep in enumerate(deps): connect_dep(dep,n,dep_index)
            for inp in spec_node.get('inputs',[]):
                if inp.get('nodename') or inp.get('value') is None: continue
                try:
                    val=float(inp.get('value'))
                    target=next((x for x in n.inputs if x.name.lower()==str(inp.get('name','')).lower()),None)
                    if target is not None and hasattr(target,'default_value') and not isinstance(target.default_value,(str,bytes)): target.default_value=val
                except Exception: pass
        surface_map={'base_color':'Base Color','metalness':'Metallic','specular_roughness':'Roughness','specular_ior':'IOR','transmission':'Transmission Weight','coat':'Coat Weight','coat_roughness':'Coat Roughness','anisotropy':'Anisotropic IOR Level','subsurface':'Subsurface Weight','emission_color':'Emission Color','emission':'Emission Strength','opacity':'Alpha'}
        for binding in graph.get('surface_bindings',[]):
            src=graph_nodes.get(binding.get('node')); target_name=surface_map.get(binding.get('input'))
            if not src or not target_name: continue
            if target_name not in bsdf.inputs and target_name=='Transmission Weight' and 'Transmission' in bsdf.inputs: target_name='Transmission'
            if target_name not in bsdf.inputs and target_name=='Anisotropic IOR Level' and 'Anisotropic' in bsdf.inputs: target_name='Anisotropic'
            if target_name in bsdf.inputs:
                output=first_output(src)
                if output is not None: m.node_tree.links.new(output,bsdf.inputs[target_name])
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

usd_cfg=cfg.get('usd_scene_composition') or {}
usd_path=usd_cfg.get('sandbox_path')
if usd_path:
    if not os.path.exists(usd_path): raise RuntimeError('USD_SCENE_COMPOSITION_PATH_NOT_FOUND')
    bpy.ops.wm.usd_import(filepath=usd_path)
for o in cfg['objects']: add_obj(o)
for v in cfg.get('volumes',[]):
    p=v.get('sandbox_path')
    if not p or not os.path.exists(p): raise RuntimeError('OPENVDB_VOLUME_PATH_REQUIRED:'+str(v.get('name')))
    volume_data=bpy.data.volumes.load(p)
    volume_obj=bpy.data.objects.new(v.get('name') or 'Volume',volume_data); scene.collection.objects.link(volume_obj)
    volume_obj.location=v.get('location') or [0,0,0]; volume_obj.rotation_euler=[math.radians(x) for x in (v.get('rotation') or [0,0,0])]; volume_obj.scale=v.get('scale') or [1,1,1]
    vm=bpy.data.materials.new((v.get('name') or 'Volume')+' Material'); vm.use_nodes=True
    nodes=vm.node_tree.nodes; links=vm.node_tree.links; nodes.clear()
    out=nodes.new('ShaderNodeOutputMaterial'); principal=nodes.new('ShaderNodeVolumePrincipled')
    density=nodes.new('ShaderNodeAttribute'); density.attribute_name='density'
    links.new(density.outputs['Fac'],principal.inputs['Density'])
    principal.inputs['Density'].default_value=float(v.get('density_scale',1) or 1)
    if 'temperature' in (v.get('fields') or []) and 'Temperature' in principal.inputs:
        temp=nodes.new('ShaderNodeAttribute'); temp.attribute_name='temperature'; links.new(temp.outputs['Fac'],principal.inputs['Temperature'])
    if 'Blackbody Intensity' in principal.inputs: principal.inputs['Blackbody Intensity'].default_value=float(v.get('blackbody_intensity',0) or 0)
    links.new(principal.outputs['Volume'],out.inputs['Volume']); volume_obj.data.materials.append(vm)
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
multi=cfg.get('multi_camera_stereo_virtual_production') or {}
if multi.get('status')=='READY' and multi.get('cameras'):
    for c in multi.get('cameras',[]):
        cd=bpy.data.cameras.new(c.get('name') or c.get('id') or 'Camera')
        co=bpy.data.objects.new(c.get('name') or c.get('id') or 'Camera',cd); scene.collection.objects.link(co)
        co.location=c.get('location') or [0,0,0]
        direction=Vector(c.get('look_at') or [0,0,1])-co.location; co.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
        cd.lens=float(c.get('lens_mm',50)); cd.sensor_width=float(c.get('sensor_width_mm',36)); cd.dof.use_dof=True; cd.dof.focus_distance=float(c.get('focus_distance_m',6)); cd.dof.aperture_fstop=float(c.get('t_stop',4))
        scene.camera=co
        stereo=multi.get('stereo') or {}
        use_stereo=bool(stereo.get('enabled')) and stereo.get('camera_id')==c.get('id')
        scene.render.use_multiview=use_stereo
        if use_stereo:
            scene.render.views_format='STEREO_3D'
            if hasattr(cd,'stereo'):
                cd.stereo.interocular_distance=float(stereo.get('interocular_distance_m',0.065))
                cd.stereo.convergence_distance=float(stereo.get('convergence_distance_m',10))
                mode=str(stereo.get('convergence_mode','OFFAXIS')).upper()
                if hasattr(cd.stereo,'convergence_mode'): cd.stereo.convergence_mode='TOE' if mode=='TOE_IN' else mode
        scene.render.filepath=os.path.join(beauty_dir,(c.get('id') or 'camera')+'_')
        bpy.ops.render.render(animation=True)
else:
    scene.camera=cam
    scene.render.use_multiview=False
    bpy.ops.render.render(animation=True)
print(json.dumps({'contract':'${AVANTIQO_CYCLES_PRODUCTION_RENDER_CONTRACT}','engine':'CYCLES','samples':cfg['samples'],'aovs':cfg['aovs'],'cycles_device':selected_device,'multicamera':bool(multi.get('cameras')),'stereo':bool((multi.get('stereo') or {}).get('enabled'))}))
`;}
export async function renderCyclesProduction({project,scene}={}){
  if(!project?.id)throw new Error("CYCLES_PROJECT_REQUIRED");
  const multiCamera=scene?.multi_camera_stereo_virtual_production
    ? CreativeMultiCameraStereoVirtualProductionRuntime.author(scene.multi_camera_stereo_virtual_production)
    : null;
  if(multiCamera&&multiCamera.status!=="READY")throw new Error("CYCLES_MULTICAMERA_VP_BLOCKED:"+multiCamera.blockers.join(","));
  const materialInterchange=await CreativeMaterialInterchangeBindingRuntime.resolve({
    organization_id:project.organization_id,
    creative_project_id:project.id,
    materials:list(scene?.materials),
    policy:object(scene?.media_policy),
  });
  const baseCfg=normalizeScene({...object(scene),materials:materialInterchange.materials});
  const rigged=CreativeMechanicalRigRuntime.compile({objects:baseCfg.objects,rigs:[...list(scene?.rigs),...list(baseCfg.automotive_cinematography?.rigs)]});
  const cfg={...baseCfg,objects:rigged.objects,camera_keyframes:rigged.camera_keyframes,rig_contract:rigged.contract,rig_hash:rigged.rig_hash,multi_camera_stereo_virtual_production:multiCamera};
  const ensured=await CreativeToolSnapshotRuntime.ensure({project,tool_id:"blender"});
  const id=hash(cfg).slice(0,20);
  const base=`/tmp/avantiqo-cycles-${id}`;
  const scriptPath=`${base}/render.py`;
  const sandbox=await CreativeSandboxRuntime.fromSnapshot({snapshot_id:ensured.snapshot_id,timeout_ms:1800000,network_policy:"deny-all"});
  let textureBinding=null;
  let modelBinding=null;
  let environmentBinding=null;
  let volumeBinding=null;
  let usdComposition=null;
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
    if(cfg.volumes.length){
      volumeBinding=await CreativeOpenVdbUsdVolumeRuntime.bind({
        organization_id:project.organization_id,
        creative_project_id:project.id,
        volumes:cfg.volumes,
        sandbox,
        base_path:`${base}/volumes`,
        policy:object(scene?.media_policy),
      });
    }
    if(cfg.automotive_cinematography?.environment_asset_node_id){
      environmentBinding=await CreativeEnvironmentAssetBindingRuntime.bind({
        organization_id:project.organization_id,
        creative_project_id:project.id,
        asset_node_id:cfg.automotive_cinematography.environment_asset_node_id,
        sandbox,
        base_path:`${base}/environment`,
      });
    }
    let renderObjects=modelBinding.objects;
    let usdScene=null;
    const requestedUsdAssets=list(cfg.usd_scene_composition?.assets);
    if(requestedUsdAssets.length){
      const byObjectId=new Map(modelBinding.objects.map((item)=>[text(item.object_id),item]));
      const composedIds=new Set();
      const composedAssets=requestedUsdAssets.map((asset)=>{
        const objectId=text(asset.object_id);
        const bound=byObjectId.get(objectId);
        if(!bound?.sandbox_path)throw new Error("USD_SCENE_COMPOSITION_OBJECT_NOT_BOUND:"+objectId);
        composedIds.add(objectId);
        return{...asset,reference_path:bound.sandbox_path,source_asset_checksum:bound.model_checksum||asset.source_asset_checksum||null,interchange_hash:bound.automotive_interchange?.interchange_hash||asset.interchange_hash||null};
      });
      usdComposition=CreativeUsdSceneCompositionRuntime.author({...cfg.usd_scene_composition,frame_rate:cfg.fps,start_time_code:cfg.frame_start,end_time_code:cfg.frame_end,assets:composedAssets});
      const usdPath=base+"/scene.usda";
      await CreativeSandboxRuntime.writeText({sandbox,path:usdPath,content:usdComposition.usda});
      usdScene={contract:usdComposition.contract,composition_hash:usdComposition.composition_hash,checksum:usdComposition.checksum,sandbox_path:usdPath,asset_count:usdComposition.assets.length};
      renderObjects=modelBinding.objects.filter((item)=>!composedIds.has(text(item.object_id)));
    }
    const renderCfg={...cfg,objects:renderObjects,volumes:volumeBinding?.volumes||[],material_library:textureBinding.library,usd_scene_composition:usdScene,automotive_cinematography:cfg.automotive_cinematography?{...cfg.automotive_cinematography,environment_sandbox_path:environmentBinding?.sandbox_path||null,environment_checksum:environmentBinding?.checksum||null}:null};
    await CreativeSandboxRuntime.writeText({sandbox,path:scriptPath,content:script(Buffer.from(JSON.stringify(renderCfg)).toString("base64"),base)});
    const exec=await CreativeSandboxRuntime.run({sandbox,cmd:"blender",args:["--background","--python",scriptPath],error_prefix:"CYCLES_PRODUCTION_RENDER_FAILED"});
    const files=await CreativeSandboxRuntime.run({sandbox,cmd:"bash",args:["-lc",`find ${base} -type f -name '*.exr' -print | sort`],error_prefix:"CYCLES_AOV_DISCOVERY_FAILED"});
    const paths=text(files.stdout).split("\n").map(x=>x.trim()).filter(Boolean);
    if(!paths.length)throw new Error(`CYCLES_EXR_OUTPUT_REQUIRED:${text(exec.stderr).slice(-4000)}`);
    const outputs=[];for(const p of paths){const buffer=await CreativeSandboxRuntime.readBuffer({sandbox,path:p});outputs.push({path:p,buffer,bytes:buffer.length,mime_type:"image/x-exr"});}
    const proofChecksum=crypto.createHash("sha256").update(Buffer.concat(outputs.map((item)=>crypto.createHash("sha256").update(item.buffer).digest()))).digest("hex");
    await CreativeCinemaEngineCertificationLedgerRuntime.record({organization_id:project.organization_id,creative_project_id:project.id,evidence:{engine_id:"CYCLES_AOV_RENDER",implementation_contracts:[AVANTIQO_CYCLES_PRODUCTION_RENDER_CONTRACT],technical_proof_passed:true,technical_proof_id:`cycles-aov:${id}`,visual_proof_passed:false,proof_checksum:proofChecksum,provider_calls_performed:false,notes:"Real Cycles EXR/AOV render completed. Visual certification remains pending durable reviewed render evidence."}});
    return{contract:AVANTIQO_CYCLES_PRODUCTION_RENDER_CONTRACT,engine:"CYCLES",scene:renderCfg,aov_contract:"OPENEXR_AOV_BUNDLE",aovs:renderCfg.aovs,outputs,provider_calls_performed:false,production_render:true,material_library_hash:cfg.material_library.library_hash,material_interchange_binding_contract:materialInterchange.contract,materialx_material_count:materialInterchange.materialx_count,texture_binding_contract:textureBinding.contract,texture_binding_count:textureBinding.binding_count,model_binding_contract:modelBinding.contract,model_binding_count:modelBinding.binding_count,openvdb_volume_contract:volumeBinding?.contract||null,openvdb_volume_count:volumeBinding?.volume_count||0,multicamera_stereo_virtual_production_contract:multiCamera?.contract||null,multicamera_stereo_virtual_production_hash:multiCamera?.workflow_hash||null,usd_scene_composition_contract:usdComposition?.contract||null,usd_scene_composition_hash:usdComposition?.composition_hash||null,usd_scene_composition_checksum:usdComposition?.checksum||null};
  }finally{
    await environmentBinding?.cleanup?.().catch?.(()=>{});
    await volumeBinding?.cleanup?.().catch?.(()=>{});
    await textureBinding?.cleanup?.().catch?.(()=>{});
    await modelBinding?.cleanup?.().catch?.(()=>{});
    await CreativeSandboxRuntime.stop(sandbox);
  }
}

export const CreativeCyclesProductionRenderRuntime=Object.freeze({contract:AVANTIQO_CYCLES_PRODUCTION_RENDER_CONTRACT,render:renderCyclesProduction});

function clone(value) { return structuredClone(value ?? {}); }
function n(value, fallback = 0) { const next = Number(value); return Number.isFinite(next) ? next : fallback; }
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function rect(layer = {}) { const b = layer.bounds || {}; return { x:n(b.x), y:n(b.y), width:Math.max(0,n(b.width)), height:Math.max(0,n(b.height)) }; }

export function buildImageStudioStyleDefinition(layer = {}, { id, name } = {}) {
  if (!id) throw new Error("IMAGE_STUDIO_STYLE_ID_REQUIRED");
  return { id, name:name || layer.name || "Reusable style", layer_type:layer.layer_type || "IMAGE", style:clone(layer.style), created_from_layer_id:layer.id || null };
}
export function applyImageStudioStyleDefinition(layer = {}, definition = {}) {
  if (!definition.id) return layer;
  return { ...layer, style:clone(definition.style), metadata:{ ...(layer.metadata||{}), reusable_style_id:definition.id } };
}
export function detachImageStudioStyle(layer = {}) {
  const metadata={...(layer.metadata||{})}; delete metadata.reusable_style_id; return { ...layer, metadata };
}

function componentLocalRef(value, selectedSet){
  const id=String(value||"");
  return id&&selectedSet.has(id)?id:null;
}
function componentMetadata(metadata={}, selectedSet){
  const next={...clone(metadata)};
  delete next.component_definition_id;
  delete next.component_instance_id;
  if("clip_mask_layer_id" in next)next.clip_mask_layer_id=componentLocalRef(next.clip_mask_layer_id,selectedSet);
  if("clip_mask_target_id" in next)next.clip_mask_target_id=componentLocalRef(next.clip_mask_target_id,selectedSet);
  if("adjustment_mask_layer_id" in next)next.adjustment_mask_layer_id=componentLocalRef(next.adjustment_mask_layer_id,selectedSet);
  if("adjustment_mask_owner_id" in next)next.adjustment_mask_owner_id=componentLocalRef(next.adjustment_mask_owner_id,selectedSet);
  if(Array.isArray(next.adjustment_target_layer_ids))next.adjustment_target_layer_ids=next.adjustment_target_layer_ids.filter(id=>selectedSet.has(String(id))).map(String);
  return next;
}
function remapComponentMetadata(metadata={}, idMap){
  const next={...clone(metadata)};
  const remap=(value)=>idMap.get(String(value||""))||null;
  if("clip_mask_layer_id" in next)next.clip_mask_layer_id=remap(next.clip_mask_layer_id);
  if("clip_mask_target_id" in next)next.clip_mask_target_id=remap(next.clip_mask_target_id);
  if("adjustment_mask_layer_id" in next)next.adjustment_mask_layer_id=remap(next.adjustment_mask_layer_id);
  if("adjustment_mask_owner_id" in next)next.adjustment_mask_owner_id=remap(next.adjustment_mask_owner_id);
  if(Array.isArray(next.adjustment_target_layer_ids))next.adjustment_target_layer_ids=next.adjustment_target_layer_ids.map(remap).filter(Boolean);
  return next;
}

export function buildImageStudioComponentDefinition(layers = [], selectedIds = [], { id, name } = {}) {
  const selectedSet=new Set(selectedIds.map(String));
  const chosen=layers.filter(layer=>selectedSet.has(String(layer.id)));
  if (!id || !chosen.length) return null;
  const left=Math.min(...chosen.map(layer=>rect(layer).x)), top=Math.min(...chosen.map(layer=>rect(layer).y));
  const right=Math.max(...chosen.map(layer=>rect(layer).x+rect(layer).width)), bottom=Math.max(...chosen.map(layer=>rect(layer).y+rect(layer).height));
  return { id, name:name||"Component", width:right-left, height:bottom-top, layers:chosen.map((layer,index)=>({ ...clone(layer), id:null, component_source_id:String(layer.id), artboard_id:null, parent_layer_id:componentLocalRef(layer.parent_layer_id,selectedSet), sort_order:index, bounds:{ ...rect(layer), x:rect(layer).x-left, y:rect(layer).y-top }, metadata:componentMetadata(layer.metadata||{},selectedSet) })) };
}
export function instantiateImageStudioComponent(definition = {}, { artboard_id, x=0, y=0, idFactory=()=>crypto.randomUUID() } = {}) {
  if (!definition.id || !Array.isArray(definition.layers)) return [];
  const instanceId=`instance-${idFactory()}`;
  const generated=definition.layers.map(()=>idFactory());
  const idMap=new Map(definition.layers.map((source,index)=>[String(source.component_source_id||index),generated[index]]));
  return definition.layers.map((source,index)=>({ ...clone(source), id:generated[index], component_source_id:undefined, artboard_id, parent_layer_id:idMap.get(String(source.parent_layer_id||""))||null, sort_order:index, bounds:{ ...(source.bounds||{}), x:x+n(source.bounds?.x), y:y+n(source.bounds?.y) }, metadata:{ ...remapComponentMetadata(source.metadata||{},idMap), component_definition_id:definition.id, component_instance_id:instanceId, component_source_index:index } }));
}

export function imageStudioMaskGeometry(target = {}, mask = {}) {
  const t=rect(target), m=rect(mask);
  const left=Math.max(t.x,m.x), top=Math.max(t.y,m.y), right=Math.min(t.x+t.width,m.x+m.width), bottom=Math.min(t.y+t.height,m.y+m.height);
  const visible=right>left&&bottom>top;
  const metadata=mask.metadata||{};
  return {
    visible,
    x:Math.max(0,left-t.x), y:Math.max(0,top-t.y), width:Math.max(0,right-left), height:Math.max(0,bottom-top),
    target_width:t.width, target_height:t.height,
    feather:clamp(n(metadata.mask_feather,0),0,200),
    opacity:clamp(n(metadata.mask_opacity,1),0,1),
    invert:metadata.mask_invert===true,
    shape:String(metadata.mask_shape||"RECT").toUpperCase(),
    radius:clamp(n(metadata.mask_radius,24),0,Math.min(t.width,t.height)/2),
  };
}
function geometricMaskSvg(g){
  const width=Math.max(1,g.target_width),height=Math.max(1,g.target_height);
  const x=Math.max(0,g.x),y=Math.max(0,g.y),w=Math.max(0,g.width),h=Math.max(0,g.height);
  const shape=g.shape==="ELLIPSE"
    ?`<ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${w/2}" ry="${h/2}"/>`
    :`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${g.shape==="ROUNDED_RECT"?g.radius||0:0}" ry="${g.shape==="ROUNDED_RECT"?g.radius||0:0}"/>`;
  const body=g.invert
    ?`<mask id="m"><rect width="100%" height="100%" fill="white"/><g fill="black">${shape}</g></mask><rect width="100%" height="100%" fill="white" fill-opacity="${g.opacity}" mask="url(#m)"/>`
    :shape.replace("/>",` fill="white" fill-opacity="${g.opacity}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${body}</svg>`;
}
function geometricMaskCssStyle(g){
  const encoded=encodeURIComponent(geometricMaskSvg(g));
  const image=`url("data:image/svg+xml,${encoded}")`;
  return {maskImage:image,WebkitMaskImage:image,maskSize:"100% 100%",WebkitMaskSize:"100% 100%",maskRepeat:"no-repeat",WebkitMaskRepeat:"no-repeat",maskPosition:"0 0",WebkitMaskPosition:"0 0"};
}
export function imageStudioMaskPreviewStyle(target = {}, mask = {}) {
  const g=imageStudioMaskGeometry(target,mask);
  if(!g.visible && !g.invert)return { clipPath:"inset(100% 0 0 0)" };
  if(g.feather<=0 && !g.invert && g.opacity>=.999){
    if(g.shape==="ELLIPSE"){
      const cx=(g.x+g.width/2)/g.target_width*100,cy=(g.y+g.height/2)/g.target_height*100;
      return { clipPath:`ellipse(${g.width/g.target_width*50}% ${g.height/g.target_height*50}% at ${cx}% ${cy}%)` };
    }
    const top=g.y/g.target_height*100, left=g.x/g.target_width*100, right=(g.target_width-g.x-g.width)/g.target_width*100, bottom=(g.target_height-g.y-g.height)/g.target_height*100;
    const round=g.shape==="ROUNDED_RECT"?` round ${g.radius}px`:"";
    return { clipPath:`inset(${top}% ${right}% ${bottom}% ${left}%${round})` };
  }
  if(g.feather<=0)return geometricMaskCssStyle(g);
  return {
    outline:g.invert?"1px dashed rgba(179,107,82,.45)":"1px dashed rgba(214,166,106,.45)",
    outlineOffset:`${Math.min(8,g.feather/4)}px`,
  };
}

export function imageStudioMaskPreviewDescriptor(target = {}, mask = {}) {
  if(!mask?.id)return {preview_supported:true,fidelity:"NO_MASK",style:{},reason:null};
  const metadata=mask.metadata||{};
  const sourceKind=String(metadata.mask_source_kind||"").toUpperCase();
  const semantic=sourceKind==="SEMANTIC";
  const raster=sourceKind.startsWith("RASTER");
  const brushRefined=Array.isArray(metadata.mask_brush_strokes)&&metadata.mask_brush_strokes.length>0;
  const g=imageStudioMaskGeometry(target,mask);
  if(semantic||raster)return {preview_supported:false,fidelity:"EXPORT_ONLY",style:{},reason:"MASK_SOURCE_PREVIEW_COMPLEX",geometry:g};
  if(brushRefined)return {preview_supported:false,fidelity:"EXPORT_ONLY",style:{},reason:"MASK_BRUSH_PREVIEW_COMPLEX",geometry:g};
  if(g.feather>0)return {preview_supported:false,fidelity:"EXPORT_ONLY",style:{},reason:"MASK_FEATHER_PREVIEW_COMPLEX",geometry:g};
  return {preview_supported:true,fidelity:(g.invert||g.opacity<.999)?"EXACT_GEOMETRIC_ALPHA_SCOPE":"EXACT_GEOMETRIC_SCOPE",style:imageStudioMaskPreviewStyle(target,mask),reason:null,geometry:g};
}
export const CreativeImageStudioReusableDesignRuntime=Object.freeze({ contract:"CREATIVE_IMAGE_STUDIO_REUSABLE_DESIGN_V3", buildStyle:buildImageStudioStyleDefinition, applyStyle:applyImageStudioStyleDefinition, detachStyle:detachImageStudioStyle, buildComponent:buildImageStudioComponentDefinition, instantiateComponent:instantiateImageStudioComponent, maskGeometry:imageStudioMaskGeometry, maskPreviewStyle:imageStudioMaskPreviewStyle, maskPreviewDescriptor:imageStudioMaskPreviewDescriptor });
export default CreativeImageStudioReusableDesignRuntime;

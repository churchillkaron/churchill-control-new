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

export function buildImageStudioComponentDefinition(layers = [], selectedIds = [], { id, name } = {}) {
  const chosen=layers.filter(layer=>selectedIds.includes(layer.id));
  if (!id || !chosen.length) return null;
  const left=Math.min(...chosen.map(layer=>rect(layer).x)), top=Math.min(...chosen.map(layer=>rect(layer).y));
  const right=Math.max(...chosen.map(layer=>rect(layer).x+rect(layer).width)), bottom=Math.max(...chosen.map(layer=>rect(layer).y+rect(layer).height));
  return { id, name:name||"Component", width:right-left, height:bottom-top, layers:chosen.map(layer=>({ ...clone(layer), id:null, artboard_id:null, parent_layer_id:null, bounds:{ ...rect(layer), x:rect(layer).x-left, y:rect(layer).y-top }, metadata:{ ...(clone(layer.metadata)||{}), component_definition_id:undefined, component_instance_id:undefined } })) };
}
export function instantiateImageStudioComponent(definition = {}, { artboard_id, x=0, y=0, idFactory=()=>crypto.randomUUID() } = {}) {
  if (!definition.id || !Array.isArray(definition.layers)) return [];
  const instanceId=`instance-${idFactory()}`;
  return definition.layers.map((source,index)=>({ ...clone(source), id:idFactory(), artboard_id, sort_order:index, bounds:{ ...(source.bounds||{}), x:x+n(source.bounds?.x), y:y+n(source.bounds?.y) }, metadata:{ ...(clone(source.metadata)||{}), component_definition_id:definition.id, component_instance_id:instanceId, component_source_index:index } }));
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
  return {
    opacity:g.opacity,
    outline:g.invert?"1px dashed rgba(179,107,82,.45)":"1px dashed rgba(214,166,106,.45)",
    outlineOffset:g.feather>0?`${Math.min(8,g.feather/4)}px`:"0px",
  };
}
export const CreativeImageStudioReusableDesignRuntime=Object.freeze({ contract:"CREATIVE_IMAGE_STUDIO_REUSABLE_DESIGN_V3", buildStyle:buildImageStudioStyleDefinition, applyStyle:applyImageStudioStyleDefinition, detachStyle:detachImageStudioStyle, buildComponent:buildImageStudioComponentDefinition, instantiateComponent:instantiateImageStudioComponent, maskGeometry:imageStudioMaskGeometry, maskPreviewStyle:imageStudioMaskPreviewStyle });
export default CreativeImageStudioReusableDesignRuntime;

"use client";
import Image from "next/image";
import { useMemo } from "react";
import ImageStudioCanvasSurface from "./ImageStudioCanvasSurface";
import { imageStudioPreviewGeometry } from "@/lib/creative/stills/runtime/CreativeImageStudioImageGeometryRuntime.js";
import { measureImageStudioText } from "@/lib/creative/stills/runtime/CreativeImageStudioTypographyRuntime.js";
import { imageStudioPreviewEffectStyle } from "@/lib/creative/stills/runtime/CreativeImageStudioEffectsRuntime.js";
import { imageStudioMaskPreviewDescriptor } from "@/lib/creative/stills/runtime/CreativeImageStudioReusableDesignRuntime.js";
import { imageStudioAdjustmentPreviewDescriptors } from "@/lib/creative/stills/runtime/CreativeImageStudioAdjustmentPreviewRuntime.js";
import { imageStudioGroundShadowPreview, imageStudioLightWrapPreview } from "@/lib/creative/stills/runtime/CreativeImageStudioContactPreviewRuntime.js";
import { imageStudioPerspectiveCssPreview } from "@/lib/creative/stills/runtime/CreativeImageStudioPerspectiveWarpRuntime.js";
import { imageStudioRetouchPreviewStyle } from "@/lib/creative/stills/runtime/CreativeImageStudioRetouchRuntime.js";
import { imageStudioEdgePreview } from "@/lib/creative/stills/runtime/CreativeImageStudioEdgePreviewRuntime.js";
import ImageStudioTexturePreviewOverlay from "./ImageStudioTexturePreviewOverlay";
import ImageStudioLightWrapPreviewOverlay from "./ImageStudioLightWrapPreviewOverlay";
import ImageStudioEdgePreviewFilterDefs from "./ImageStudioEdgePreviewFilterDefs";
import { useImageStudioFonts } from "./useImageStudioFonts";

const n=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
function assetFor(id,assets){return assets.find((item)=>item.id===id)||null;}
function assetUrl(asset){return asset?.image_url||asset?.thumbnail_url||asset?.file_url||asset?.url||"";}
function sourceSize(asset,bounds){return{width:n(asset?.width||asset?.metadata?.width||asset?.technical?.width,n(bounds?.width,240)),height:n(asset?.height||asset?.metadata?.height||asset?.technical?.height,n(bounds?.height,180))};}

function Snapshot({version,assets,workspace}) {
  const board=version?.snapshot?.artboard;
  const layers=Array.isArray(version?.snapshot?.layers)?version.snapshot.layers:[];
  const fontWorkspace=useMemo(()=>({...workspace,layers}),[workspace,layers]);
  const fonts=useImageStudioFonts(fontWorkspace);
  if(!board)return <div className="flex min-h-[360px] items-center justify-center text-[10px] text-[#99928A]">No prior snapshot</div>;
  const scale=Math.min(.55,720/Math.max(n(board.width,1080),n(board.height,1350)));
  const unsupportedPreview=layers.some((layer)=>{
    if(layer.layer_type!=="IMAGE"||layer.visible===false)return false;
    const mask=layer.metadata?.clip_mask_layer_id?layers.find((item)=>item.id===layer.metadata.clip_mask_layer_id):null;
    const maskPreview=imageStudioMaskPreviewDescriptor(layer,mask);
    const maskStyle=maskPreview.preview_supported?maskPreview.style:{};
    const adjustment=imageStudioAdjustmentPreviewDescriptors(layers,layer);
    const asset=assetFor(layer.source_asset_id,assets);
    const url=assetUrl(asset);
    const preview=imageStudioPreviewGeometry(layer,sourceSize(asset,layer.bounds||{}),scale);
    const shadow=imageStudioGroundShadowPreview({style:layer.style||{},rotation:n(layer.transform?.rotation),scale,asset_url:url,preview,mask_style:maskStyle,has_mask:Boolean(mask)});
    const edge=imageStudioEdgePreview({style:layer.style||{},scale,has_mask:Boolean(mask),has_frame_mask:Number(layer.metadata?.mask_radius||0)>0});
    const lightWrap=imageStudioLightWrapPreview({style:layer.style||{},scale,asset_url:url,preview,has_mask:Boolean(mask),has_edge_alpha:edge.alpha_changes===true});
    const edgeExportOnly=edge.reason!=="EDGE_INTEGRATION_DISABLED"&&(!edge.preview_supported||edge.partial_preview);
    return Boolean(mask)&&!maskPreview.preview_supported||adjustment.some((item)=>!item.preview_supported)||(shadow.shadow?.enabled&&!shadow.preview_supported)||["MASKED_LIGHT_WRAP_EXPORT_ONLY","EDGE_FINISHED_LIGHT_WRAP_EXPORT_ONLY"].includes(lightWrap.reason)||edgeExportOnly;
  });
  return <div className="relative flex min-h-[420px] items-center justify-center overflow-auto rounded-2xl border border-[#DDD8D0] bg-[#EEEAE4] p-8">
    {unsupportedPreview?<div className="absolute right-2 top-2 z-[90] rounded border border-[#D6A66A]/40 bg-white/95 px-2 py-1 text-[7px] font-medium text-[#8A6A42]">Complex effects · deterministic export only</div>:null}
    <div className="relative shrink-0 overflow-hidden bg-white" style={{width:n(board.width,1080)*scale,height:n(board.height,1350)*scale}}>
      {layers.filter((layer)=>layer.visible!==false&&layer.metadata?.is_clip_mask!==true&&layer.layer_type!=="ADJUSTMENT"&&layer.layer_type!=="MASK").sort((a,b)=>n(a.sort_order)-n(b.sort_order)).map((layer)=>{
        const b=layer.bounds||{};
        const rotation=n(layer.transform?.rotation);
        const style={left:n(b.x)*scale,top:n(b.y)*scale,width:n(b.width,240)*scale,height:n(b.height,180)*scale,transform:`rotate(${rotation}deg)`,zIndex:10+n(layer.sort_order)};
        const effects=imageStudioPreviewEffectStyle(layer.style||{});
        if(layer.layer_type==="TEXT"){
          const measured=measureImageStudioText({text:layer.content?.text||"Text",bounds:b,style:layer.style||{}});
          const justify=measured.verticalAlign==="middle"?"center":measured.verticalAlign==="bottom"?"flex-end":"flex-start";
          return <div key={layer.id} className="absolute flex overflow-hidden whitespace-pre" style={{...style,opacity:effects.opacity,mixBlendMode:effects.mixBlendMode,filter:effects.filter,fontSize:measured.fontSize*scale,fontWeight:measured.weight,fontFamily:fonts.fontFamilyFor(layer.style||{}),color:layer.style?.color||"#111",lineHeight:measured.lineHeight,letterSpacing:measured.letterSpacing*scale,textAlign:measured.align,justifyContent:justify,flexDirection:"column"}}>{measured.visibleLines.join("\n")}</div>;
        }
        const asset=assetFor(layer.source_asset_id,assets);
        const url=assetUrl(asset);
        const preview=imageStudioPreviewGeometry(layer,sourceSize(asset,b),scale);
        const mask=layer.metadata?.clip_mask_layer_id?layers.find((item)=>item.id===layer.metadata.clip_mask_layer_id):null;
        const maskPreview=imageStudioMaskPreviewDescriptor(layer,mask);
        const maskStyle=maskPreview.preview_supported?maskPreview.style:{};
        const adjustmentPreviews=imageStudioAdjustmentPreviewDescriptors(layers,layer);
        const shadowPreview=imageStudioGroundShadowPreview({style:layer.style||{},rotation,scale,asset_url:url,preview,mask_style:maskStyle,has_mask:Boolean(mask)});
        const edgePreview=imageStudioEdgePreview({style:layer.style||{},scale,has_mask:Boolean(mask),has_frame_mask:Number(layer.metadata?.mask_radius||0)>0});
        const edgeFilterId=`compare-edge-${String(layer.id||"layer").replace(/[^a-zA-Z0-9_-]/g,"")}`;
        const perspective=imageStudioPerspectiveCssPreview(layer.style||{},n(b.width,240)*scale,n(b.height,180)*scale);
        const perspectiveStyle=perspective.enabled?{transform:perspective.transform,transformOrigin:perspective.transform_origin}:{transform:"none"};
        const contentStyle={opacity:effects.opacity,mixBlendMode:effects.mixBlendMode,...maskStyle,...perspectiveStyle};
        const baseEffectStyle={filter:effects.filter};
        return <div key={layer.id} className="absolute" style={style}>
          {shadowPreview.preview_supported?<div data-compare-contact-shadow={layer.id} className="pointer-events-none absolute inset-0" style={shadowPreview.outer_style}><div className="absolute inset-0" style={shadowPreview.silhouette_style}/></div>:null}
          {url?<div className="relative h-full w-full overflow-hidden" style={{...contentStyle,borderRadius:preview.frame.borderRadius}}>
            <div data-compare-base-effect-preview={layer.id} className="absolute inset-0" style={baseEffectStyle}><ImageStudioEdgePreviewFilterDefs filterId={edgeFilterId} spec={edgePreview}/><div data-compare-edge-alpha-preview={edgePreview.preview_supported?layer.id:undefined} className="absolute inset-0" style={{filter:edgePreview.preview_supported?`url(#${edgeFilterId})`:undefined}}><Image src={url} alt="" width={Math.max(1,Math.round(preview.image.width))} height={Math.max(1,Math.round(preview.image.height))} sizes="400px" style={{position:"absolute",left:preview.image.left,top:preview.image.top,width:preview.image.width,height:preview.image.height,maxWidth:"none"}}/>
            {(layer.style?.retouch_operations||[]).map((operation,index)=><div key={operation.id||index} data-compare-retouch-preview={operation.id||index} className="pointer-events-none absolute" style={imageStudioRetouchPreviewStyle(operation,n(b.width,240)*scale,n(b.height,180)*scale)}/>)}</div>
            <ImageStudioLightWrapPreviewOverlay style={layer.style||{}} scale={scale} assetUrl={url} preview={preview} hasMask={Boolean(mask)} hasEdgeAlpha={edgePreview.alpha_changes===true}/>
            {adjustmentPreviews.filter((item)=>item.preview_supported&&item.opacity>0).map((item)=><div key={`compare-adjustment-${item.id}`} data-compare-adjustment-preview={item.id} className="pointer-events-none absolute inset-0" style={{...item.mask_style,opacity:item.opacity,backdropFilter:item.filter,WebkitBackdropFilter:item.filter}}/>)}
            <ImageStudioTexturePreviewOverlay style={layer.style||{}} scale={scale} selected={false}/>
          </div>:null}
        </div>;
      })}
    </div>
  </div>;
}
export default function ImageStudioVersionCompare({ workspace, assets }) {
  const boardId=workspace.selection.artboard_id;
  const versions=workspace.versions.filter((item)=>item.artboard_id===boardId).sort((a,b)=>Number(b.version_number||0)-Number(a.version_number||0));
  const previous=versions.find((item)=>item.id===workspace.ui.compare_version_id)||versions[0]||null;
  return <div className="grid min-h-full gap-4 2xl:grid-cols-2">
    <div><div className="mb-2 text-[8px] font-semibold uppercase tracking-[.18em] text-[#99928A]">Current</div><ImageStudioCanvasSurface workspace={workspace} assets={assets}/></div>
    <div><div className="mb-2 flex items-center justify-between gap-2"><div className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#99928A]">Snapshot {previous?.version_number?`v${previous.version_number}`:""}</div>{versions.length?<select value={previous?.id||""} onChange={e=>workspace.setCompareVersion(e.target.value)} className="rounded border border-[#DDD8D0] bg-[#FBFAF8] px-2 py-1 text-[8px] text-[#777169]">{versions.map(v=><option key={v.id} value={v.id}>v{v.version_number}</option>)}</select>:null}</div><Snapshot version={previous} assets={assets} workspace={workspace}/></div>
  </div>;
}

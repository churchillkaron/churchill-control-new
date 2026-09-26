"use client";

import { useId } from "react";
import { imageStudioLightWrapPreview } from "@/lib/creative/stills/runtime/CreativeImageStudioContactPreviewRuntime.js";

export default function ImageStudioLightWrapPreviewOverlay({style={},scale=1,assetUrl="",preview={},hasMask=false,hasEdgeAlpha=false}){
  const reactId=useId();
  const spec=imageStudioLightWrapPreview({style,scale,asset_url:assetUrl,preview,has_mask:hasMask,has_edge_alpha:hasEdgeAlpha});
  if(!spec.preview_supported)return null;
  const filterId=`light-wrap-${String(reactId).replace(/[^a-zA-Z0-9_-]/g,"")}`;
  const image=spec.image;
  return <svg data-light-wrap-preview className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden" aria-hidden="true">
    <defs>
      <filter id={filterId} x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
        <feMorphology in="SourceAlpha" operator="erode" radius={spec.radius} result="eroded"/>
        <feComposite in="SourceAlpha" in2="eroded" operator="out" result="innerBand"/>
        <feFlood floodColor={spec.color} floodOpacity={spec.opacity} result="wrapColor"/>
        <feComposite in="wrapColor" in2="innerBand" operator="in"/>
      </filter>
    </defs>
    <image href={assetUrl} x={image.left} y={image.top} width={image.width} height={image.height} preserveAspectRatio="none" filter={`url(#${filterId})`}/>
  </svg>;
}

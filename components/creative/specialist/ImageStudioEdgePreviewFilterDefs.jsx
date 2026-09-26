"use client";

export default function ImageStudioEdgePreviewFilterDefs({filterId,spec}){
  if(!spec?.preview_supported||!filterId)return null;
  return <svg data-edge-preview-filter className="pointer-events-none absolute h-0 w-0" aria-hidden="true">
    <defs>
      <filter id={filterId} x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feMorphology in="SourceAlpha" operator="erode" radius={spec.radius} result="erodedAlpha"/>
        <feComposite in="SourceGraphic" in2="erodedAlpha" operator="in"/>
      </filter>
    </defs>
  </svg>;
}

"use client";

import { useEffect, useRef } from "react";

import HomeAvantiqoIntelligence from "@/components/operator/HomeAvantiqoIntelligence";

const LATEST_THRESHOLD_PX = 96;

export default function HomeAvantiqoIntelligenceDock({ organizationId }) {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    const section = root?.querySelector(
      '[data-avantiqo-home-intelligence="true"]',
    );
    const scroller = Array.from(section?.children || []).find((child) =>
      child?.classList?.contains("overflow-y-auto"),
    );

    if (!(scroller instanceof HTMLElement)) return undefined;

    let pinnedToLatest = true;
    let frame = null;

    function isNearLatest() {
      return (
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <=
        LATEST_THRESHOLD_PX
      );
    }

    function scrollToLatest(behavior = "auto") {
      scroller.scrollTo({
        top: scroller.scrollHeight,
        behavior,
      });
    }

    function scheduleLatest(behavior = "auto") {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        scrollToLatest(behavior);
      });
    }

    function handleScroll() {
      pinnedToLatest = isNearLatest();
    }

    function handleKeyDown(event) {
      if (event.key === "Enter" && !event.shiftKey) {
        pinnedToLatest = true;
      }
    }

    function handleClick(event) {
      if (event.target?.closest?.("button")) {
        pinnedToLatest = true;
      }
    }

    scroller.addEventListener("scroll", handleScroll, { passive: true });
    section.addEventListener("keydown", handleKeyDown, true);
    section.addEventListener("click", handleClick, true);

    const observer = new MutationObserver(() => {
      if (pinnedToLatest) scheduleLatest("smooth");
    });
    observer.observe(scroller, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    scheduleLatest("auto");
    const settleTimer = window.setTimeout(() => {
      if (pinnedToLatest) scheduleLatest("auto");
    }, 250);

    return () => {
      window.clearTimeout(settleTimer);
      if (frame !== null) cancelAnimationFrame(frame);
      observer.disconnect();
      scroller.removeEventListener("scroll", handleScroll);
      section.removeEventListener("keydown", handleKeyDown, true);
      section.removeEventListener("click", handleClick, true);
    };
  }, [organizationId]);

  return (
    <div ref={rootRef} data-avantiqo-home-dock="true" className="min-w-0">
      <HomeAvantiqoIntelligence organizationId={organizationId} />

      <style jsx global>{`
        [data-avantiqo-home-dock="true"]
          [data-avantiqo-home-intelligence="true"] {
          height: clamp(520px, calc(100dvh - 136px), 780px);
          min-height: 0 !important;
        }

        [data-avantiqo-home-dock="true"]
          [data-avantiqo-home-intelligence="true"]
          > div:nth-child(2) {
          min-height: 0 !important;
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
        }

        @media (min-width: 1280px) {
          [data-avantiqo-home-dock="true"]
            [data-avantiqo-home-intelligence="true"] {
            height: clamp(560px, calc(100dvh - 152px), 900px);
          }
        }
      `}</style>
    </div>
  );
}

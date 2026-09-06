"use client";

export default function RestaurantAvantiqoTheme({
  children,
  mode = "service",
}) {
  return (
    <div
      data-avantiqo-restaurant-theme={mode}
      className="min-h-screen bg-[#F7F6F3] text-[#191919]"
    >
      {children}

      <style jsx global>{`
        [data-avantiqo-restaurant-theme] {
          --restaurant-page: #f7f6f3;
          --restaurant-surface: #ffffff;
          --restaurant-soft: #faf9f7;
          --restaurant-text: #191919;
          --restaurant-muted: #6c6963;
          --restaurant-faint: #9a968e;
          --restaurant-border: rgba(0, 0, 0, 0.075);
          --restaurant-accent: #a37849;
          --restaurant-accent-text: #9a744b;
          --restaurant-dark: #25231f;
          min-height: 100vh;
          background: var(--restaurant-page);
          color: var(--restaurant-text);
        }

        [data-avantiqo-restaurant-theme] main,
        [data-avantiqo-restaurant-theme] [data-restaurant-waiter-surface="true"],
        [data-avantiqo-restaurant-theme] [data-restaurant-stationary-pos="true"],
        [data-avantiqo-restaurant-theme] [data-restaurant-stationary-order-surface="true"],
        [data-avantiqo-restaurant-theme] [data-pos-inline-checkout="true"] {
          background: var(--restaurant-page) !important;
          color: var(--restaurant-text) !important;
        }

        [data-avantiqo-restaurant-theme] [class*="bg-[#0"],
        [data-avantiqo-restaurant-theme] [class*="bg-black"]:not([class*="fixed"]) {
          background-color: var(--restaurant-surface) !important;
        }

        [data-avantiqo-restaurant-theme] [class*="bg-white/"] {
          background-color: rgba(255, 255, 255, 0.88) !important;
        }

        [data-avantiqo-restaurant-theme] [class*="bg-black/"]:not([class*="fixed"]) {
          background-color: var(--restaurant-soft) !important;
        }

        [data-avantiqo-restaurant-theme] [class*="border-white/"] {
          border-color: var(--restaurant-border) !important;
        }

        [data-avantiqo-restaurant-theme] [class*="text-white"] {
          color: var(--restaurant-text) !important;
        }

        [data-avantiqo-restaurant-theme] [class*="text-white/20"],
        [data-avantiqo-restaurant-theme] [class*="text-white/25"],
        [data-avantiqo-restaurant-theme] [class*="text-white/28"],
        [data-avantiqo-restaurant-theme] [class*="text-white/30"],
        [data-avantiqo-restaurant-theme] [class*="text-white/32"],
        [data-avantiqo-restaurant-theme] [class*="text-white/35"] {
          color: var(--restaurant-faint) !important;
        }

        [data-avantiqo-restaurant-theme] [class*="text-white/40"],
        [data-avantiqo-restaurant-theme] [class*="text-white/42"],
        [data-avantiqo-restaurant-theme] [class*="text-white/45"],
        [data-avantiqo-restaurant-theme] [class*="text-white/50"],
        [data-avantiqo-restaurant-theme] [class*="text-white/52"],
        [data-avantiqo-restaurant-theme] [class*="text-white/55"],
        [data-avantiqo-restaurant-theme] [class*="text-white/60"],
        [data-avantiqo-restaurant-theme] [class*="text-white/65"],
        [data-avantiqo-restaurant-theme] [class*="text-white/70"] {
          color: var(--restaurant-muted) !important;
        }

        [data-avantiqo-restaurant-theme] [class*="text-[#D6A66A]"],
        [data-avantiqo-restaurant-theme] [class*="text-[#E7C991]"],
        [data-avantiqo-restaurant-theme] [class*="text-[#E9CF9A]"],
        [data-avantiqo-restaurant-theme] [class*="text-[#E2C48A]"],
        [data-avantiqo-restaurant-theme] [class*="text-[#F0D59D]"],
        [data-avantiqo-restaurant-theme] [class*="text-[#F3D7A2]"] {
          color: var(--restaurant-accent-text) !important;
        }

        [data-avantiqo-restaurant-theme] [class*="border-[#D6A66A]"] {
          border-color: rgba(163, 120, 73, 0.28) !important;
        }

        [data-avantiqo-restaurant-theme] [class*="bg-[#D6A66A]"] {
          background-color: var(--restaurant-accent) !important;
          color: #ffffff !important;
        }

        [data-avantiqo-restaurant-theme] [class*="bg-[#D6A66A]/"] {
          background-color: rgba(163, 120, 73, 0.08) !important;
          color: var(--restaurant-accent-text) !important;
        }

        [data-avantiqo-restaurant-theme] [class*="shadow-2xl"],
        [data-avantiqo-restaurant-theme] [class*="shadow-black"] {
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.025) !important;
        }

        [data-avantiqo-restaurant-theme] [class*="rounded-[34px]"],
        [data-avantiqo-restaurant-theme] [class*="rounded-[32px]"],
        [data-avantiqo-restaurant-theme] [class*="rounded-[30px]"],
        [data-avantiqo-restaurant-theme] [class*="rounded-[28px]"],
        [data-avantiqo-restaurant-theme] [class*="rounded-[26px]"] {
          border-radius: 22px !important;
        }

        [data-avantiqo-restaurant-theme] [class*="rounded-[24px]"] {
          border-radius: 18px !important;
        }

        [data-avantiqo-restaurant-theme] header {
          border-color: rgba(0, 0, 0, 0.07) !important;
        }

        [data-avantiqo-restaurant-theme] header[class*="sticky"] {
          background: rgba(247, 246, 243, 0.94) !important;
          backdrop-filter: blur(18px);
        }

        [data-avantiqo-restaurant-theme] h1,
        [data-avantiqo-restaurant-theme] h2,
        [data-avantiqo-restaurant-theme] h3 {
          color: #181817 !important;
          letter-spacing: -0.03em;
        }

        [data-avantiqo-restaurant-theme] input,
        [data-avantiqo-restaurant-theme] textarea,
        [data-avantiqo-restaurant-theme] select {
          background: #fff !important;
          color: #191919 !important;
          border-color: var(--restaurant-border) !important;
          box-shadow: none !important;
        }

        [data-avantiqo-restaurant-theme] input::placeholder,
        [data-avantiqo-restaurant-theme] textarea::placeholder {
          color: #aaa69e !important;
        }

        [data-avantiqo-restaurant-theme] button {
          box-shadow: none !important;
        }

        [data-avantiqo-restaurant-theme="production"] article {
          background-color: #fff !important;
          color: #191919;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.025);
        }

        [data-avantiqo-restaurant-theme="production"] article[class*="bg-red-"],
        [data-avantiqo-restaurant-theme="production"] article[class*="bg-amber-"] {
          background-color: inherit !important;
        }

        [data-avantiqo-restaurant-theme="production"] [class*="text-red-"],
        [data-avantiqo-restaurant-theme="production"] [class*="text-amber-"],
        [data-avantiqo-restaurant-theme="production"] [class*="text-emerald-"] {
          color: inherit;
        }

        [data-avantiqo-restaurant-theme] [data-pos-inline-checkout="true"] {
          background: #fff !important;
          border-color: var(--restaurant-border) !important;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.025);
        }

        [data-avantiqo-restaurant-theme] [data-stationary-draft-order="true"] {
          background: #fff;
        }

        [data-avantiqo-restaurant-theme] [data-cash-change-workflow="true"] {
          background: #faf9f7 !important;
          border-color: var(--restaurant-border) !important;
        }

        [data-avantiqo-restaurant-theme] .fixed[class*="bg-black/"] {
          background-color: rgba(25, 25, 25, 0.58) !important;
        }
      `}</style>
    </div>
  );
}

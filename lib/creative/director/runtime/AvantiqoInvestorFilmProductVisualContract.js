export const AVANTIQO_INVESTOR_FILM_PRODUCT_VISUAL_CONTRACT = Object.freeze({
  contract: "AVANTIQO_INVESTOR_FILM_PRODUCT_VISUAL_CONTRACT_V1",
  purpose: "Keep every generated Avantiqo product shot visually and logically faithful to the current product while forbidding screenshots and reused visual assets.",

  product_visual_source_of_truth: Object.freeze({
    home: "app/(system)/workspace/[organizationId]/page.jsx",
    shell: "components/platform/PlatformShell.jsx",
    top_bar: "components/workspace/WorkspaceTopBar.jsx",
    finance_light_shell_commit: "21639aa8f7f76ad5fd96d4df6abe257fd39401d1",
    home_light_os_commit: "ca215986ea0e14f50bfed082bfe4a5028d8d49b0",
    top_bar_light_commit: "1c41d8028b8bc8564a2790cd31e50b2b77e4850d",
  }),

  current_visual_language: Object.freeze({
    theme: "LIGHT_BUSINESS_OS",
    font_family: "Manrope",
    canvas: "#F7F6F3",
    raised_surface: "#FBFAF8",
    card_surface: "#FFFFFF",
    primary_text: "#191919",
    heading_text: "#1B1A18",
    secondary_text: "#6C6963",
    tertiary_text: "#77736C",
    muted_text: "#AAA69E",
    bronze_label: "#9A744B",
    bronze_icon: "#A37849",
    warm_accent: "#D6A66A",
    border: "rgba(25,25,25,0.07-0.08)",
    shadow: "subtle warm neutral shadow only",
    density: "professional, information-rich, calm, high-legibility",
  }),

  generated_product_shot_rules: Object.freeze([
    "The Avantiqo application shell is light, warm-neutral and professional. Never depict the current system as a black or obsidian UI.",
    "Use the real Avantiqo information hierarchy: organization/entity/period context, human work priorities, governed actions, evidence, status and consequence.",
    "Do not invent module names, records, numbers, charts, actions or state transitions that contradict the real workflow being depicted.",
    "Do not ask a text-to-video model to invent a complete product screen from prose. Product screens must be deterministically rendered from an Avantiqo scene specification using the current visual tokens and real workflow semantics.",
    "Generated product text must be deliberately authored and readable. Gibberish, pseudo-text and random UI labels fail the shot.",
    "Do not use screenshots, browser capture, existing exported UI images, stock footage or prior generated visual assets as source visuals.",
    "A product shot passes only when both product authenticity and cinematic integration pass. A beautiful but fake UI fails; a correct UI that looks pasted-on also fails.",
  ]),

  studio_product_generation_pipeline: Object.freeze([
    "1. Select the exact business moment and Avantiqo workflow being shown.",
    "2. Derive a purpose-generated screen scene specification from the real workspace contract and current design tokens.",
    "3. Render that screen from scratch inside Avantiqo Studio at film resolution; do not capture the live application.",
    "4. Generate the human/environment/camera scene from scratch with the owned video engine.",
    "5. Track and composite the newly generated Avantiqo screen into the physical device/display with realistic perspective, luminance, reflections and depth.",
    "6. Reject any shot whose screen semantics, layout, typography, palette, perspective or human interaction are not credible.",
  ]),

  hard_rejects: Object.freeze([
    "black-current-Avantiqo-shell",
    "obsidian-current-Avantiqo-dashboard",
    "blue-neon-enterprise-ui",
    "generic-SaaS-dashboard",
    "fake-browser-window",
    "unreadable-generated-product-text",
    "fabricated-workflow",
    "screenshot-or-browser-capture",
    "reused-visual-asset",
  ]),
});

export default AVANTIQO_INVESTOR_FILM_PRODUCT_VISUAL_CONTRACT;

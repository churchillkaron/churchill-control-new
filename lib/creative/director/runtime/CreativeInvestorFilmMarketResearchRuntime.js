export const CREATIVE_INVESTOR_FILM_MARKET_RESEARCH_CONTRACT =
  "CREATIVE_INVESTOR_FILM_MARKET_RESEARCH_V1";

const RESEARCH_DATE = "2026-09-04";

export const CREATIVE_INVESTOR_FILM_MARKET_RESEARCH = Object.freeze({
  contract: CREATIVE_INVESTOR_FILM_MARKET_RESEARCH_CONTRACT,
  researched_at: RESEARCH_DATE,
  creative_lock_version: "AVANTIQO_INVESTOR_FILM_CREATIVE_LOCK_V1",
  research_scope:
    "Current enterprise software, ERP, business operating-system, governed-agent and accounting-AI positioning plus premium technology/product storytelling references and current official product-film benchmarks.",
  authority: {
    market_strategy_authority: true,
    avantiqo_product_truth_authority: false,
    story_continuity_authority: true,
    visual_proof_authority: true,
    rule:
      "This research is used to avoid generic category claims, preserve the agreed investor-film story and strengthen investor differentiation. It can never prove an Avantiqo product capability; current Avantiqo claims still require canonical Avantiqo evidence.",
  },
  sources: Object.freeze([
    {
      id: "ODOO_HOME_2026",
      company: "Odoo",
      source_type: "OFFICIAL_PRODUCT_PAGE",
      url: "https://www.odoo.com/",
      observed_positioning: [
        "All your business on one platform.",
        "Native AI across all your business.",
      ],
    },
    {
      id: "ZOHO_ONE_2026",
      company: "Zoho One",
      source_type: "OFFICIAL_PRODUCT_PAGE",
      url: "https://www.zoho.com/one/",
      observed_positioning: [
        "The Operating System for Business.",
        "One unified system spanning customers, employees, finance and operations.",
      ],
    },
    {
      id: "NETSUITE_NEXT_2026",
      company: "Oracle NetSuite",
      source_type: "OFFICIAL_PRODUCT_VIDEO",
      url: "https://www.youtube.com/watch?v=6JFxJEPy-6g",
      observed_positioning: [
        "AI embedded into ERP business processes, records and analytics.",
        "Ask Oracle can search, analyze and take action while keeping people in control and answers traceable to source records.",
      ],
    },
    {
      id: "SERVICENOW_AI_AGENTS_FILM_2025",
      company: "ServiceNow",
      source_type: "OFFICIAL_PRODUCT_FILM",
      url: "https://www.youtube.com/watch?v=wyonDdaNkh4",
      observed_positioning: [
        "AI agents connect every corner of the business and orchestrate end-to-end processes.",
        "Short-form category clarity is achieved through one promise rather than a feature inventory.",
      ],
    },
    {
      id: "SERVICENOW_ACTION_FABRIC_2026",
      company: "ServiceNow",
      source_type: "OFFICIAL_NEWSROOM",
      url: "https://newsroom.servicenow.com/press-releases/details/2026/ServiceNow-opens-its-full-system-of-action-to-every-AI-Agent-in-the-enterprise/default.aspx",
      observed_positioning: [
        "A full system of action available to AI agents across the enterprise.",
        "Context plus governed execution with identity, permissions and auditability.",
      ],
    },
    {
      id: "SAP_AUTONOMOUS_ENTERPRISE_FILM_2026",
      company: "SAP",
      source_type: "OFFICIAL_KEYNOTE_FILM",
      url: "https://www.youtube.com/watch?v=1uK9k457TWE",
      observed_positioning: [
        "Business data, process context and governance are presented as the foundation for enterprise AI.",
        "Enterprise authority comes from connecting AI to real process knowledge instead of generic model spectacle.",
      ],
    },
    {
      id: "SAP_AUTONOMOUS_ENTERPRISE_2026",
      company: "SAP",
      source_type: "OFFICIAL_NEWSROOM",
      url: "https://news.sap.com/2026/05/sap-sapphire-sap-unveils-autonomous-enterprise/",
      observed_positioning: [
        "Autonomous Enterprise with humans and AI working together.",
        "Agents grounded in business processes, data and governance to execute core operations end to end.",
      ],
    },
    {
      id: "RAMP_STACK_2026",
      company: "Ramp",
      source_type: "OFFICIAL_PRODUCT_PAGE",
      url: "https://ramp.com/stack",
      observed_positioning: [
        "AI operating system for accounting teams.",
        "Concurrent agents, standardized close work, auditability and capacity gains.",
      ],
    },
    {
      id: "STRIPE_SESSIONS_2025",
      company: "Stripe",
      source_type: "OFFICIAL_EVENT_STORYTELLING_REFERENCE",
      url: "https://stripe.com/sessions/2025/opening-keynote",
      observed_positioning: [
        "Lead product storytelling with a consequential economic thesis and customer scale before feature detail.",
      ],
    },
    {
      id: "APPLE_IMMERSIVE_STORYTELLING_2025",
      company: "Apple",
      source_type: "OFFICIAL_FILMMAKING_REFERENCE",
      url: "https://www.apple.com/newsroom/2025/09/apple-previews-new-immersive-films-for-apple-vision-pro/",
      observed_positioning: [
        "Premium technology storytelling uses physical presence, realism, sound and human-scale moments rather than abstract technology spectacle alone.",
      ],
    },
  ]),
  category_claims_already_commoditized: Object.freeze([
    "all your business on one platform",
    "one unified suite",
    "the operating system for business",
    "AI-powered ERP",
    "AI embedded across every workflow",
    "system of action",
    "autonomous enterprise",
    "AI agents that automate work",
    "AI operating system for accounting",
    "one assistant for the whole business",
  ]),
  competitive_landscape: Object.freeze([
    {
      pattern: "INTEGRATED_APP_SUITE",
      strongest_examples: ["Odoo", "Zoho One"],
      implication:
        "Breadth and app unification are table stakes. A feature grid or module fly-through cannot be the investor thesis.",
    },
    {
      pattern: "AI_NATIVE_ERP",
      strongest_examples: ["Oracle NetSuite", "SAP"],
      implication:
        "AI inside records, workflows and core ERP processes is already a category promise. Avantiqo must prove a more specific operating mechanism rather than merely claim embedded AI.",
    },
    {
      pattern: "GOVERNED_SYSTEM_OF_ACTION",
      strongest_examples: ["ServiceNow", "SAP"],
      implication:
        "Governed agent execution is strategically important but not unique by itself. The film must connect governance to business evidence, consequences and human decisions.",
    },
    {
      pattern: "AI_ACCOUNTING_OPERATING_SYSTEM",
      strongest_examples: ["Ramp Stack"],
      implication:
        "Accounting-firm AI execution is already being sold directly. Avantiqo must show why accounting becomes stronger when finance is connected to the wider operating reality of each business.",
    },
  ]),
  visual_storytelling_benchmarks: Object.freeze([
    {
      benchmark: "SERVICENOW_PRODUCT_FILM",
      strength_to_learn_from:
        "One concise category promise, rapid comprehension and coordinated-action language.",
      weakness_avantiqo_must_beat:
        "The promise can remain abstract unless the viewer sees one concrete event propagate through the business.",
    },
    {
      benchmark: "NETSUITE_NEXT",
      strength_to_learn_from:
        "Product credibility comes from trusted business data, traceability and the ability to act from context.",
      weakness_avantiqo_must_beat:
        "A demonstration-first treatment can feel like software instruction rather than a memorable investor film.",
    },
    {
      benchmark: "SAP_AUTONOMOUS_ENTERPRISE",
      strength_to_learn_from:
        "Enterprise-scale authority, process context and governance make the AI claim credible.",
      weakness_avantiqo_must_beat:
        "Abstract enterprise language can reduce emotional immediacy and make the mechanism hard to feel.",
    },
    {
      benchmark: "RAMP_ACCOUNTING_AI",
      strength_to_learn_from:
        "Concrete accounting jobs, control and capacity make automation economically legible.",
      weakness_avantiqo_must_beat:
        "Finance-only proof cannot show why one shared operating reality across the whole business compounds in value.",
    },
    {
      benchmark: "STRIPE_SESSIONS",
      strength_to_learn_from:
        "A consequential economic thesis precedes product detail, giving the audience a reason to care before explanation.",
      weakness_avantiqo_must_beat:
        "Avantiqo must compress that investor logic into cinematic cause and effect rather than a stage presentation.",
    },
    {
      benchmark: "APPLE_PREMIUM_TECH_FILMMAKING",
      strength_to_learn_from:
        "Physical detail, human scale, sound and controlled reveal create premium perceived value.",
      weakness_avantiqo_must_beat:
        "The visual polish must remain subordinate to inspectable business truth; beauty without proof is not enough.",
    },
  ]),
  avantiqo_required_differentiation: Object.freeze({
    strategic_thesis:
      "Do not sell Avantiqo as more software. Show it as operating intelligence: one governed spine that turns business evidence into shared context, coordinated action, visible consequences and foresight across the business.",
    mechanism:
      "EVIDENCE -> BUSINESS CONTEXT -> GOVERNED DECISION/ACTION -> DOWNSTREAM CONSEQUENCE -> HUMAN VISIBILITY -> LEARNING/FORESIGHT",
    proof_requirements: Object.freeze([
      "Show at least one ordinary business event whose consequences cross three or more business domains without becoming a feature montage.",
      "Show where evidence came from and how a consequential action remains inspectable or auditable.",
      "Show human judgment at policy, approval, exception or strategic boundaries; never portray autonomy as ungoverned magic.",
      "Show a downstream consequence changing because of an upstream event so the audience sees the operating system behave as one system.",
      "Show at least one accounting-firm or multi-business operating moment where portfolio context creates leverage beyond bookkeeping automation alone.",
      "Show foresight as a consequence of connected operational truth, not as a decorative prediction dashboard.",
    ]),
    investor_questions_the_film_must_answer: Object.freeze([
      "Why does this need to exist when integrated suites already exist?",
      "What is the mechanism that makes Avantiqo more than ERP plus an AI chat box?",
      "What becomes possible because evidence, finance, operations, people and execution share context?",
      "Where does human control remain when Avantiqo acts?",
      "Why does the architecture become more valuable as a company or accounting firm grows?",
      "What can the viewer actually see that proves the thesis instead of merely hearing it?",
    ]),
  }),
  locked_story: Object.freeze({
    lock_status: "DO_NOT_REOPEN_WITHOUT_EXPLICIT_USER_CHANGE",
    core_problem:
      "A business is not failing because it lacks software. It loses time, money and control because its software does not understand the business as one connected reality.",
    emotional_progression: Object.freeze([
      "Fragmentation — disconnected truths create human and economic friction.",
      "One consequential event — a recognizable event exposes the real cost of fragmentation.",
      "Recognition — Avantiqo understands the whole situation in shared business context.",
      "Governed action — the system coordinates what can act and exposes what requires human judgment.",
      "Proof — Finance, Operations, Supply Chain, People and evidence change one another through consequences, not a module carousel.",
      "Scale — one operating company becomes multiple companies and an accounting-firm portfolio.",
      "Foresight — connected operational truth becomes intelligence about what matters next.",
      "Earned close — Avantiqo is the intelligence that lets the business operate as one system.",
    ]),
    event_rule:
      "Follow one human-scale business event through at least three materially different domains. Prefer a time-critical supplier or delivery exception because it is physical, visually legible and naturally connects operations, supply chain, finance, people and accounting, but canonical Avantiqo product evidence remains the final authority on what may be claimed.",
    human_role:
      "Avantiqo handles context, coordination and governed execution; humans remain visible at policy, approval, exception and strategic boundaries.",
    accounting_firm_role:
      "Show that an accountant becomes more useful when the financial number carries the operating reality behind it, then scale that advantage across a client portfolio.",
    foresight_rule:
      "Foresight must emerge from the same causal history the audience already watched; never introduce an unrelated prediction dashboard.",
    final_thesis:
      "Avantiqo is not another piece of business software. It is the intelligence that lets the business operate as one system.",
  }),
  signature_visual_system: Object.freeze({
    name: "THE_CAUSAL_THREAD",
    definition:
      "A restrained visual grammar that match-cuts one real piece of business evidence into the connected consequence it creates. It is not a holographic overlay and never floats decoratively through space.",
    first_use:
      "Begin in the physical world on a real evidence detail such as a delivery label, invoice line, quantity mark or time stamp. A line, edge, rhythm or framing relationship from that object becomes the transition into Avantiqo context.",
    product_use:
      "Inside generated Avantiqo choreography, the same event identity remains visually traceable while context, governed action and downstream consequence become visible.",
    consequence_use:
      "The visual motif resolves back into a physical business outcome or human decision, proving that the software action changed reality.",
    restraint_rules: Object.freeze([
      "Never render a glowing sci-fi network over people or buildings.",
      "Never use the motif merely because a shot feels empty.",
      "Never let the motif replace readable evidence provenance or a real human consequence.",
      "Use Avantiqo's restrained warm-gold accent only as an authored continuity cue, not neon spectacle.",
    ]),
  }),
  worldclass_visual_proof_gate: Object.freeze({
    required_before_full_master_generation: true,
    proof_type: "VIDEO_GENERATION_ONLY",
    target_duration_seconds: 24,
    acceptable_duration_seconds: Object.freeze([20, 30]),
    master_resolution: "3840x2160",
    image_generation_allowed: false,
    screenshot_or_browser_capture_allowed: false,
    purpose:
      "Prove the film's visual grammar, causal readability, product credibility, sound language and human-governance boundary before committing to the full 240-300 second master.",
    proof_sequence: Object.freeze([
      {
        time: "00:00-00:05",
        beat: "PHYSICAL_STAKE",
        visual:
          "Cinematic macro-to-human-scale physical business event. A time-critical delivery or supplier exception is discovered. No Avantiqo logo, no dashboard, no exposition.",
        sound:
          "Specific diegetic detail first; no inspirational music opening. Let the mismatch land before score enters.",
        narration:
          "The problem was never the missing item.",
      },
      {
        time: "00:05-00:10",
        beat: "RIPPLE",
        visual:
          "Fast but legible consequence cuts: availability changes, a customer commitment is at risk, a staffing or operating decision shifts, and the financial implication appears as reality rather than a module montage.",
        sound:
          "Business sounds form a tightening rhythm; one controlled sonic motif links the consequences.",
        narration:
          "It was that every part of the business learned about it separately.",
      },
      {
        time: "00:10-00:17",
        beat: "AVANTIQO_RECOGNITION",
        visual:
          "The physical evidence match-cuts into generated Avantiqo choreography. The same event becomes shared context with provenance, the affected domains are connected, and a governed action path is visibly proposed. No static dashboard.",
        sound:
          "The rhythm resolves into a precise, lower-frequency pulse with clean editorial detail; product reveal is controlled, not bombastic.",
        narration:
          "Avantiqo sees one event — and what it changes next.",
      },
      {
        time: "00:17-00:22",
        beat: "HUMAN_CONTROL_AND_ACTION",
        visual:
          "A consequential boundary reaches the right human with reason, evidence and downstream impact visible. The person approves, changes or rejects; the governed action propagates and the physical operation responds.",
        sound:
          "Drop the score under the human decision, then let the consequence carry the transition.",
        narration:
          "What can act, acts. What needs judgment reaches the right person with the reason attached.",
      },
      {
        time: "00:22-00:24",
        beat: "FORESIGHT_SEED",
        visual:
          "A quiet return to reality: the disruption is controlled. The same event history becomes a subtle next-risk cue. End before a generic logo crescendo.",
        sound:
          "One short resolved tone and real room sound.",
        narration:
          "And the next time, the business is not starting from zero.",
      },
    ]),
    pass_requirements: Object.freeze([
      "The first five seconds are understandable with sound but without narration or product labels.",
      "The audience can identify the originating event and at least three downstream business consequences without being shown a module carousel.",
      "Avantiqo appears only after the physical stake is established.",
      "The same evidence identity remains traceable from physical event to product context to consequence.",
      "At least one human judgment boundary is visible and consequential.",
      "Generated product choreography feels like a real operating system resolving the event, not a concept HUD or decorative dashboard.",
      "Sound has diegetic, editorial, score and intentional-silence layers rather than one continuous corporate bed.",
      "Every visual product claim is supportable by canonical Avantiqo evidence before it is permitted into the full master.",
      "An independent review must score the proof at least 94/100 for causal clarity, visual distinction, product credibility, human stakes, premium finish and non-AI feel.",
    ]),
  }),
  anti_boring_release_rules: Object.freeze([
    "Reject any opening that can be summarized as office shot -> person at laptop -> dashboard -> voiceover.",
    "Reject product appearance before a clear physical or economic stake exists.",
    "Reject two consecutive product shots if neither changes a visible downstream business consequence.",
    "Reject any narration sentence that could be used unchanged by Odoo, Zoho, NetSuite, ServiceNow, SAP or Ramp.",
    "Reject any scene whose difference from a competitor film is only Avantiqo branding, black UI or gold color.",
    "Reject generic blue SaaS lighting, neon data tunnels, floating screens, hologram networks and meaningless AI particles.",
    "Reject feature enumeration, domain fly-throughs and abstract claims of intelligence without inspectable evidence/action/consequence.",
    "Require shot-scale contrast: macro evidence detail, human-scale physical environment, consequence cuts, generated product choreography, quiet human approval and portfolio-scale context.",
    "Require at least one moment of near-silence where a human decision carries more weight than the score.",
    "Require the final rise to reuse visual or sonic material introduced by the original business event so the ending feels earned rather than attached.",
  ]),
  film_language: Object.freeze({
    opening_rule:
      "Open on a recognizable human or economic consequence of fragmented work before naming Avantiqo. Earn the reveal.",
    visual_rule:
      "Use cinematic physical-world storytelling and generated product choreography as one causal system. Product UI must enter because the story needs it, not because the film needs a demo shot.",
    product_rule:
      "Every product appearance must resolve a real business question, decision, exception or consequence. Never cut through modules merely to demonstrate breadth.",
    narration_rule:
      "Narration carries meaning, stakes and investor logic. It must not read labels, enumerate features or use generic AI transformation language.",
    sound_rule:
      "Build the score from business rhythm and human tension, use diegetic detail, editorial sound and deliberate silence. Do not use one inspirational corporate music bed for the entire master.",
    pacing_rule:
      "Let the first movement breathe; accelerate only when the operating mechanism becomes visible; create at least one quiet proof moment before the final rise.",
    closing_rule:
      "The final line must feel inevitable after the proof. Avoid unsupported market-size, customer-count, revenue or superiority claims.",
  }),
  anti_copycat_policy: Object.freeze({
    competitor_names_in_final_film: false,
    competitor_logos_in_final_film: false,
    imitate_competitor_campaigns: false,
    imitate_famous_director_style: false,
    claim_category_table_stakes_as_unique: false,
    unverified_superiority_claims: false,
    use_research_to_create_original_positioning: true,
  }),
});

export const CreativeInvestorFilmMarketResearchRuntime = Object.freeze({
  contract: CREATIVE_INVESTOR_FILM_MARKET_RESEARCH_CONTRACT,
  researchDate: RESEARCH_DATE,
  brief: CREATIVE_INVESTOR_FILM_MARKET_RESEARCH,
});

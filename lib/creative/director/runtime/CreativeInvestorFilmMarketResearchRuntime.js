export const CREATIVE_INVESTOR_FILM_MARKET_RESEARCH_CONTRACT =
  "CREATIVE_INVESTOR_FILM_MARKET_RESEARCH_V1";

const RESEARCH_DATE = "2026-09-04";

export const CREATIVE_INVESTOR_FILM_MARKET_RESEARCH = Object.freeze({
  contract: CREATIVE_INVESTOR_FILM_MARKET_RESEARCH_CONTRACT,
  researched_at: RESEARCH_DATE,
  research_scope:
    "Current enterprise software, ERP, business operating-system, governed-agent and accounting-AI positioning plus premium technology/product storytelling references.",
  authority: {
    market_strategy_authority: true,
    avantiqo_product_truth_authority: false,
    rule:
      "This research is used to avoid generic category claims and strengthen investor differentiation. It can never prove an Avantiqo product capability; current Avantiqo claims still require canonical Avantiqo evidence.",
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
